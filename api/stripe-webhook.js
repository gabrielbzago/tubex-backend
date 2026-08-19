import Stripe from "stripe";
import { buffer } from "micro";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: { bodyParser: false }
};

// ======================================================
// PLANOS — manter os Product IDs atuais do TubeX
// ======================================================
const PLAN_MAP = {
  "prod_SlRU1DGWgG5nzq": "start",
  "prod_SlRVtiheQa9IZG": "pro",
  "prod_SlRWvDMlS5e9dR": "expert"
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const GRACE_STATUSES = new Set(["past_due", "unpaid"]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(name) {
  const value = String(name || "").trim();
  return value || null;
}

function getPlanFromProduct(productId) {
  return productId ? PLAN_MAP[productId] || null : null;
}

function getProductFromSubscription(subscription) {
  const product = subscription?.items?.data?.[0]?.price?.product;
  return typeof product === "string" ? product : product?.id || null;
}

function getStatusRank(status) {
  if (status === "active") return 5;
  if (status === "trialing") return 4;
  if (status === "past_due") return 3;
  if (status === "unpaid") return 2;
  if (status === "incomplete") return 1;
  return 0;
}

function getSubscriptionTimestamp(sub) {
  return Math.max(
    Number(sub?.current_period_start || 0),
    Number(sub?.start_date || 0),
    Number(sub?.created || 0)
  );
}

function getSubscriptionStatusForUser(subscription) {
  if (!subscription) return "canceled";
  if (ACTIVE_STATUSES.has(subscription.status)) return "active";
  if (GRACE_STATUSES.has(subscription.status)) return subscription.status;
  return "canceled";
}

function getCustomerId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

async function getStripeCustomer(customerId) {
  if (!customerId) return null;
  return stripe.customers.retrieve(customerId);
}

async function getCustomerEmailAndName(customerId, fallbackEmail = null, fallbackName = null) {
  let customer = null;

  if (customerId) {
    try {
      customer = await getStripeCustomer(customerId);
    } catch (err) {
      if (err?.code !== "resource_missing") throw err;
    }
  }

  return {
    customer,
    email: normalizeEmail(customer?.email || fallbackEmail),
    name: normalizeName(customer?.name || fallbackName)
  };
}

// ======================================================
// ASSINATURAS DO CUSTOMER
// Regra central: o Supabase reflete a assinatura vigente
// mais relevante do Customer, nunca simplesmente o evento
// que acabou de chegar.
// ======================================================
async function listRelevantSubscriptions(customerId) {
  if (!customerId) return [];

  const all = [];
  let startingAfter = undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });

    all.push(...(page.data || []));

    if (!page.has_more || !page.data?.length) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return all;
}

function chooseCanonicalSubscription(subscriptions) {
  const usable = subscriptions
    .filter(Boolean)
    .filter(sub => {
      const productId = getProductFromSubscription(sub);
      return !!getPlanFromProduct(productId);
    });

  // 1) Ativa/trialing sempre vence cancelada/incompleta.
  const active = usable
    .filter(sub => ACTIVE_STATUSES.has(sub.status))
    .sort((a, b) => {
      const rank = getStatusRank(b.status) - getStatusRank(a.status);
      if (rank) return rank;
      return getSubscriptionTimestamp(b) - getSubscriptionTimestamp(a);
    });

  if (active.length) return active[0];

  // 2) Se não há ativa, preserva acesso em grace period.
  const grace = usable
    .filter(sub => GRACE_STATUSES.has(sub.status))
    .sort((a, b) => {
      const rank = getStatusRank(b.status) - getStatusRank(a.status);
      if (rank) return rank;
      return getSubscriptionTimestamp(b) - getSubscriptionTimestamp(a);
    });

  if (grace.length) return grace[0];

  // 3) Nenhuma assinatura vigente.
  return null;
}

// ======================================================
// LOCALIZAÇÃO DO USUÁRIO
// Customer ID é a identidade Stripe principal.
// Email é fallback para cadastros antigos.
// ======================================================
async function findUsersByCustomerId(customerId) {
  if (!customerId) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id,email,name,plan,status,stripe_customer_id,stripe_subscription_id,updated_at")
    .eq("stripe_customer_id", customerId)
    .limit(20);

  if (error) throw error;
  return data || [];
}

async function findUsersByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id,email,name,plan,status,stripe_customer_id,stripe_subscription_id,updated_at")
    .ilike("email", normalized)
    .limit(20);

  if (error) throw error;
  return data || [];
}

async function findCanonicalUser({ customerId, email }) {
  const byCustomer = await findUsersByCustomerId(customerId);

  if (byCustomer.length) {
    // Se houver duplicatas internas, prioriza a linha mais recentemente atualizada.
    return {
      user: [...byCustomer].sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      )[0],
      candidates: byCustomer,
      source: "customer_id"
    };
  }

  const byEmail = await findUsersByEmail(email);

  if (byEmail.length) {
    return {
      user: [...byEmail].sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      )[0],
      candidates: byEmail,
      source: "email"
    };
  }

  return { user: null, candidates: [], source: null };
}

// ======================================================
// UPSERT SEGURO
// Não sobrescreve uma assinatura nova por um evento velho.
// ======================================================
async function saveUserState({
  customerId,
  email,
  name,
  canonicalSubscription,
  forceFreeIfNone = true
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = normalizeName(name);

  if (!customerId && !normalizedEmail) {
    throw new Error("saveUserState: customer e email ausentes");
  }

  const found = await findCanonicalUser({
    customerId,
    email: normalizedEmail
  });

  const existingUser = found.user;
  const now = new Date().toISOString();

  let plan = "free";
  let status = "canceled";
  let subscriptionId = null;

  if (canonicalSubscription) {
    const productId = getProductFromSubscription(canonicalSubscription);
    const mappedPlan = getPlanFromProduct(productId);

    if (!mappedPlan) {
      throw new Error(`Produto Stripe não mapeado: ${productId || "ausente"}`);
    }

    plan = mappedPlan;
    status = getSubscriptionStatusForUser(canonicalSubscription);
    subscriptionId = canonicalSubscription.id;
  } else if (!forceFreeIfNone && existingUser) {
    plan = existingUser.plan || "free";
    status = existingUser.status || "active";
    subscriptionId = existingUser.stripe_subscription_id || null;
  }

  if (existingUser) {
    const updateData = {
      updated_at: now,
      plan,
      status,
      stripe_customer_id: customerId || existingUser.stripe_customer_id || null,
      stripe_subscription_id: subscriptionId
    };

    // Stripe é a fonte de verdade para email/nome quando disponíveis.
    if (normalizedEmail) {
      const emailOwner = (await findUsersByEmail(normalizedEmail))
        .find(row => row.id !== existingUser.id);

      if (!emailOwner) {
        updateData.email = normalizedEmail;
      } else {
        console.warn("⚠ Email já pertence a outro usuário; mantendo email do registro canônico.", {
          existingUserId: existingUser.id,
          conflictingUserId: emailOwner.id,
          email: normalizedEmail
        });
      }
    }

    if (normalizedName) updateData.name = normalizedName;

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", existingUser.id);

    if (error) throw error;

    console.log("✅ SUPABASE UPDATE", {
      userId: existingUser.id,
      email: updateData.email || existingUser.email,
      plan,
      status,
      subscriptionId,
      customerId
    });

    return existingUser.id;
  }

  const insertData = {
    email: normalizedEmail,
    name: normalizedName,
    plan,
    status,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId,
    created_at: now,
    updated_at: now
  };

  const { data, error } = await supabase
    .from("users")
    .insert(insertData)
    .select("id")
    .single();

  if (error) throw error;

  console.log("✅ SUPABASE INSERT", insertData);
  return data?.id || null;
}

// ======================================================
// RECONCILIAÇÃO CENTRAL
// É chamada por checkout, subscription events e invoices.
// Assim qualquer ordem de webhook converge para o mesmo estado.
// ======================================================
async function reconcileCustomer(customerId, fallbackEmail = null, fallbackName = null) {
  if (!customerId) {
    throw new Error("reconcileCustomer: customerId ausente");
  }

  const identity = await getCustomerEmailAndName(
    customerId,
    fallbackEmail,
    fallbackName
  );

  if (!identity.email) {
    throw new Error(`Customer ${customerId} sem email no Stripe`);
  }

  const subscriptions = await listRelevantSubscriptions(customerId);
  const canonical = chooseCanonicalSubscription(subscriptions);

  console.log("🧭 RECONCILE CUSTOMER", {
    customerId,
    email: identity.email,
    subscriptions: subscriptions.map(sub => ({
      id: sub.id,
      status: sub.status,
      product: getProductFromSubscription(sub),
      plan: getPlanFromProduct(getProductFromSubscription(sub)),
      created: sub.created,
      current_period_start: sub.current_period_start
    })),
    canonical: canonical
      ? {
          id: canonical.id,
          status: canonical.status,
          plan: getPlanFromProduct(getProductFromSubscription(canonical))
        }
      : null
  });

  await saveUserState({
    customerId,
    email: identity.email,
    name: identity.name,
    canonicalSubscription: canonical,
    forceFreeIfNone: true
  });

  return {
    customerId,
    email: identity.email,
    subscriptionId: canonical?.id || null,
    plan: canonical
      ? getPlanFromProduct(getProductFromSubscription(canonical))
      : "free",
    status: canonical
      ? getSubscriptionStatusForUser(canonical)
      : "canceled"
  };
}

// ======================================================
// CHECKOUT → descobre Customer e força reconciliação.
// Não confia somente no line_item para o estado final.
// ======================================================
async function handleCheckoutCompleted(session) {
  const customerId = getCustomerId(session.customer);

  if (!customerId) {
    throw new Error(`checkout.session.completed sem customer: ${session.id}`);
  }

  // O Customer no Stripe é a fonte de email/nome.
  const identity = await getCustomerEmailAndName(
    customerId,
    session.customer_details?.email || session.customer_email,
    session.customer_details?.name
  );

  if (!identity.email) {
    throw new Error(`Checkout ${session.id} sem email`);
  }

  // Para checkout de assinatura, a reconciliação do Customer decide
  // qual subscription é realmente a vigente.
  const result = await reconcileCustomer(
    customerId,
    identity.email,
    identity.name
  );

  console.log("🛒 CHECKOUT RECONCILIADO", {
    sessionId: session.id,
    ...result
  });
}

// ======================================================
// EVENTOS DE ASSINATURA
// Todos convergem para a mesma reconciliação.
// ======================================================
async function handleSubscriptionEvent(subscription) {
  const customerId = getCustomerId(subscription.customer);

  if (!customerId) {
    throw new Error(`Subscription ${subscription.id} sem customer`);
  }

  const result = await reconcileCustomer(customerId);
  console.log("🔄 SUBSCRIPTION RECONCILIADA", {
    eventSubscriptionId: subscription.id,
    ...result
  });
}

// ======================================================
// INVOICE
// invoice.paid / payment_failed NÃO decidem sozinhos o plano.
// A assinatura atual do Customer decide.
// ======================================================
async function handleInvoiceEvent(invoice) {
  const customerId = getCustomerId(invoice.customer);

  if (!customerId) {
    throw new Error(`Invoice ${invoice.id} sem customer`);
  }

  const result = await reconcileCustomer(customerId);
  console.log("💳 INVOICE RECONCILIADA", {
    invoiceId: invoice.id,
    ...result
  });
}

// ======================================================
// CUSTOMER UPDATED
// Mantém email/nome sincronizados mesmo sem checkout.
// ======================================================
async function handleCustomerUpdated(customer) {
  const customerId = getCustomerId(customer);

  if (!customerId) throw new Error("customer.updated sem id");

  const result = await reconcileCustomer(
    customerId,
    customer.email,
    customer.name
  );

  console.log("👤 CUSTOMER RECONCILIADO", result);
}

// ======================================================
// HANDLER
// ======================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      error: "Missing Stripe signature"
    });
  }

  let rawBody;

  try {
    rawBody = await buffer(req);
  } catch (err) {
    console.error("❌ Erro lendo webhook:", err);
    return res.status(400).json({
      success: false,
      error: "Invalid request body"
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook Stripe inválido:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("🔥 STRIPE EVENT", {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object);
        break;

      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.payment_succeeded":
        await handleInvoiceEvent(event.data.object);
        break;

      case "customer.updated":
        await handleCustomerUpdated(event.data.object);
        break;

      default:
        console.log("ℹ️ Evento recebido sem ação:", event.type);
    }

    return res.status(200).json({
      received: true,
      success: true,
      event_id: event.id,
      event_type: event.type
    });
  } catch (err) {
    console.error("💥 FALHA PROCESSANDO WEBHOOK", {
      eventId: event.id,
      eventType: event.type,
      message: err?.message,
      stack: err?.stack
    });

    // 500 é proposital: o Stripe poderá reenviar o evento.
    return res.status(500).json({
      received: false,
      success: false,
      error: "Webhook processing failed",
      event_id: event.id
    });
  }
}

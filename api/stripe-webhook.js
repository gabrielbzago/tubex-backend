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
// TUBEX — PLANOS REAIS POR PRICE ID
// O Price ID é a fonte de verdade para plano + ciclo.
// ======================================================
const PRICE_MAP = {
  "price_1U3L12AQLcT2SPxrktmUhqiM": {
    plan: "pro",
    billing_cycle: "monthly"
  },
  "price_1U3L4VAQLcT2SPxrDyxAAvPS": {
    plan: "pro",
    billing_cycle: "annual"
  },
  "price_1U3L5uAQLcT2SPxrA9nL5LUp": {
    plan: "expert",
    billing_cycle: "monthly"
  },
  "price_1U3LBJAQLcT2SPxrve5oa0XP": {
    plan: "expert",
    billing_cycle: "annual"
  }
};

// Product IDs antigos continuam reconhecidos como fallback,
// mas nunca têm prioridade sobre o Price ID.
const PRODUCT_MAP = {
  "prod_SlRU1DGWgG5nzq": "start",
  "prod_SlRVtiheQa9IZG": "pro",
  "prod_SlRWvDMlS5e9dR": "expert"
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const GRACE_STATUSES = new Set(["past_due", "unpaid"]);
const CRON_BATCH_SIZE = 1000;
const CRON_CONCURRENCY = 4;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(name) {
  const value = String(name || "").trim();
  return value || null;
}

function getCustomerId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

function getPriceIdFromSubscription(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || null;
}

function getProductFromSubscription(subscription) {
  const product = subscription?.items?.data?.[0]?.price?.product;
  return typeof product === "string" ? product : product?.id || null;
}

function getPriceConfig(subscription) {
  const priceId = getPriceIdFromSubscription(subscription);
  if (priceId && PRICE_MAP[priceId]) return PRICE_MAP[priceId];

  // Compatibilidade com assinaturas antigas ainda vinculadas por Product ID.
  const productId = getProductFromSubscription(subscription);
  const fallbackPlan = productId ? PRODUCT_MAP[productId] || null : null;
  if (!fallbackPlan) return null;

  const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  return {
    plan: fallbackPlan,
    billing_cycle: interval === "year" ? "annual" : "monthly"
  };
}

function getPlanFromSubscription(subscription) {
  return getPriceConfig(subscription)?.plan || null;
}

function getBillingCycleFromSubscription(subscription) {
  return getPriceConfig(subscription)?.billing_cycle || null;
}

function getStatusRank(status) {
  if (status === "active") return 6;
  if (status === "trialing") return 5;
  if (status === "past_due") return 4;
  if (status === "unpaid") return 3;
  if (status === "incomplete") return 2;
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

function subscriptionIsUsable(subscription) {
  return Boolean(subscription && getPriceConfig(subscription));
}

function compareSubscriptions(a, b) {
  const statusRank = getStatusRank(b.status) - getStatusRank(a.status);
  if (statusRank) return statusRank;

  const timestamp = getSubscriptionTimestamp(b) - getSubscriptionTimestamp(a);
  if (timestamp) return timestamp;

  return String(b.id || "").localeCompare(String(a.id || ""));
}

function chooseCanonicalSubscription(subscriptions) {
  const usable = (subscriptions || []).filter(subscriptionIsUsable);

  const active = usable
    .filter(sub => ACTIVE_STATUSES.has(sub.status))
    .sort(compareSubscriptions);

  if (active.length) return active[0];

  const grace = usable
    .filter(sub => GRACE_STATUSES.has(sub.status))
    .sort(compareSubscriptions);

  if (grace.length) return grace[0];

  return null;
}

async function getStripeCustomer(customerId) {
  if (!customerId) return null;
  return stripe.customers.retrieve(customerId);
}

async function getCustomerEmailAndName(
  customerId,
  fallbackEmail = null,
  fallbackName = null
) {
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
// ASSINATURAS DE UM CUSTOMER
// ======================================================
async function listRelevantSubscriptions(customerId) {
  if (!customerId) return [];

  const all = [];
  let startingAfter;

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

// ======================================================
// LOCALIZAÇÃO DO USUÁRIO
// REGRA: e-mail é a identidade TubeX.
// Customer ID é identificador de cobrança e pode mudar.
// ======================================================
async function findUsersByCustomerId(customerId) {
  if (!customerId) return [];

  const { data, error } = await supabase
    .from("users")
    .select(
      "id,email,name,plan,status,stripe_customer_id,stripe_subscription_id,updated_at"
    )
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
    .select(
      "id,email,name,plan,status,stripe_customer_id,stripe_subscription_id,updated_at"
    )
    .ilike("email", normalized)
    .limit(20);

  if (error) throw error;
  return data || [];
}

function chooseUser(candidates) {
  if (!candidates?.length) return null;

  // Se houver duplicatas internas, prefere registro ativo e mais recentemente atualizado.
  return [...candidates].sort((a, b) => {
    const activeA = a.status === "active" ? 1 : 0;
    const activeB = b.status === "active" ? 1 : 0;
    if (activeB !== activeA) return activeB - activeA;

    return (
      new Date(b.updated_at || 0).getTime() -
      new Date(a.updated_at || 0).getTime()
    );
  })[0];
}

async function findCanonicalUser({ customerId, email }) {
  const byCustomer = await findUsersByCustomerId(customerId);
  if (byCustomer.length) {
    return {
      user: chooseUser(byCustomer),
      candidates: byCustomer,
      source: "customer_id"
    };
  }

  const byEmail = await findUsersByEmail(email);
  if (byEmail.length) {
    return {
      user: chooseUser(byEmail),
      candidates: byEmail,
      source: "email"
    };
  }

  return { user: null, candidates: [], source: null };
}

// ======================================================
// SAVE
// Só grava campos já existentes no schema atual do arquivo.
// O ciclo e Price ID são usados na decisão, mas não exigem
// novas colunas no Supabase.
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
  let canonicalCustomerId = customerId || null;

  if (canonicalSubscription) {
    const config = getPriceConfig(canonicalSubscription);

    if (!config) {
      throw new Error(
        `Preço Stripe não mapeado: ${getPriceIdFromSubscription(canonicalSubscription) || "ausente"}`
      );
    }

    plan = config.plan;
    status = getSubscriptionStatusForUser(canonicalSubscription);
    subscriptionId = canonicalSubscription.id;
    canonicalCustomerId =
      getCustomerId(canonicalSubscription.customer) || customerId || null;
  } else if (!forceFreeIfNone && existingUser) {
    plan = existingUser.plan || "free";
    status = existingUser.status || "active";
    subscriptionId = existingUser.stripe_subscription_id || null;
    canonicalCustomerId =
      existingUser.stripe_customer_id || canonicalCustomerId;
  }

  if (existingUser) {
    const updateData = {
      updated_at: now,
      plan,
      status,
      stripe_customer_id:
        canonicalCustomerId || existingUser.stripe_customer_id || null,
      stripe_subscription_id: subscriptionId
    };

    if (normalizedEmail) {
      const emailOwners = await findUsersByEmail(normalizedEmail);
      const conflict = emailOwners.find(row => row.id !== existingUser.id);

      if (!conflict) {
        updateData.email = normalizedEmail;
      } else {
        console.warn("⚠ E-mail já pertence a outro usuário TubeX.", {
          existingUserId: existingUser.id,
          conflictingUserId: conflict.id,
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
      customerId: canonicalCustomerId
    });

    return existingUser.id;
  }

  const insertData = {
    email: normalizedEmail,
    name: normalizedName,
    plan,
    status,
    stripe_customer_id: canonicalCustomerId,
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
// RECONCILIAÇÃO DE UM CUSTOMER
//
// IMPORTANTE:
// Se o mesmo e-mail tiver mudado de Customer no Stripe,
// também consultamos o Customer atualmente salvo no Supabase.
// Isso impede que o cancelamento do Customer ANTIGO derrube
// o plano da NOVA assinatura.
// ======================================================
async function reconcileCustomer(
  customerId,
  fallbackEmail = null,
  fallbackName = null
) {
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

  const found = await findCanonicalUser({
    customerId,
    email: identity.email
  });

  const currentUser = found.user;

  const customerIds = new Set([customerId]);

  // Se o usuário já aponta para outro Customer, compare os dois.
  // Isso resolve exatamente o caso de recompra que criou novo Customer.
  if (
    currentUser?.stripe_customer_id &&
    currentUser.stripe_customer_id !== customerId
  ) {
    customerIds.add(currentUser.stripe_customer_id);
  }

  const subscriptionGroups = await Promise.all(
    [...customerIds].map(async id => ({
      customerId: id,
      subscriptions: await listRelevantSubscriptions(id)
    }))
  );

  const allSubscriptions = subscriptionGroups.flatMap(group =>
    group.subscriptions.map(subscription => ({
      subscription,
      sourceCustomerId: group.customerId
    }))
  );

  const canonicalEntry = [...allSubscriptions]
    .filter(({ subscription }) => subscriptionIsUsable(subscription))
    .sort((a, b) => compareSubscriptions(a.subscription, b.subscription))[0];

  const canonical = canonicalEntry?.subscription || null;
  const canonicalCustomerId =
    canonicalEntry?.sourceCustomerId || customerId;

  console.log("🧭 RECONCILE CUSTOMER", {
    eventCustomerId: customerId,
    currentUserCustomerId: currentUser?.stripe_customer_id || null,
    email: identity.email,
    subscriptions: allSubscriptions.map(
      ({ subscription, sourceCustomerId }) => ({
        id: subscription.id,
        sourceCustomerId,
        status: subscription.status,
        price: getPriceIdFromSubscription(subscription),
        plan: getPlanFromSubscription(subscription),
        billing_cycle: getBillingCycleFromSubscription(subscription),
        created: subscription.created,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end
      })
    ),
    canonical: canonical
      ? {
          id: canonical.id,
          customerId: canonicalCustomerId,
          status: canonical.status,
          plan: getPlanFromSubscription(canonical),
          billing_cycle: getBillingCycleFromSubscription(canonical),
          price: getPriceIdFromSubscription(canonical)
        }
      : null
  });

  await saveUserState({
    customerId: canonicalCustomerId,
    email: identity.email,
    name: identity.name,
    canonicalSubscription: canonical,
    forceFreeIfNone: true
  });

  return {
    customerId: canonicalCustomerId,
    email: identity.email,
    subscriptionId: canonical?.id || null,
    plan: canonical ? getPlanFromSubscription(canonical) : "free",
    billing_cycle: canonical
      ? getBillingCycleFromSubscription(canonical)
      : null,
    price_id: canonical ? getPriceIdFromSubscription(canonical) : null,
    status: canonical
      ? getSubscriptionStatusForUser(canonical)
      : "canceled"
  };
}

// ======================================================
// EVENTOS
// ======================================================
async function handleCheckoutCompleted(session) {
  const customerId = getCustomerId(session.customer);

  if (!customerId) {
    throw new Error(`checkout.session.completed sem customer: ${session.id}`);
  }

  const identity = await getCustomerEmailAndName(
    customerId,
    session.customer_details?.email || session.customer_email,
    session.customer_details?.name
  );

  if (!identity.email) {
    throw new Error(`Checkout ${session.id} sem email`);
  }

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
// CHECK DE SEGURANÇA A CADA 24 HORAS
//
// Vercel Cron chama GET diariamente.
// O check só processa registros com updated_at anterior a
// 24h, evitando consultar repetidamente clientes recém
// sincronizados por webhook.
//
// Configure CRON_SECRET na Vercel.
// ======================================================
function isCronAuthorized(req) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    console.warn("⚠ CRON_SECRET não configurado.");
    return false;
  }

  const auth = String(req.headers.authorization || "");
  if (auth === `Bearer ${configuredSecret}`) return true;

  const querySecret =
    typeof req.query?.secret === "string" ? req.query.secret : null;

  return querySecret === configuredSecret;
}

async function listUsersForHealthCheck() {
  const users = [];
  let from = 0;

  while (true) {
    const to = from + CRON_BATCH_SIZE - 1;

    const { data, error } = await supabase
      .from("users")
      .select("id,email,name,plan,status,stripe_customer_id,stripe_subscription_id,updated_at")
      .not("stripe_customer_id", "is", null)
      .range(from, to);

    if (error) throw error;

    users.push(...(data || []));

    if (!data || data.length < CRON_BATCH_SIZE) break;
    from += CRON_BATCH_SIZE;
  }

  return users;
}

async function runSubscriptionHealthCheck() {
  const startedAt = Date.now();
  const users = await listUsersForHealthCheck();

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const candidates = users.filter(user => {
    const updated = new Date(user.updated_at || 0).getTime();
    return !updated || updated <= cutoff;
  });

  let checked = 0;
  let changed = 0;
  let errors = 0;

  for (let i = 0; i < candidates.length; i += CRON_CONCURRENCY) {
    const batch = candidates.slice(i, i + CRON_CONCURRENCY);

    const results = await Promise.all(
      batch.map(async user => {
        try {
          const before = {
            plan: user.plan || "free",
            status: user.status || "canceled",
            subscriptionId: user.stripe_subscription_id || null,
            customerId: user.stripe_customer_id || null
          };

          const result = await reconcileCustomer(
            user.stripe_customer_id,
            user.email,
            user.name
          );

          checked += 1;

          const didChange =
            result.subscriptionId !== before.subscriptionId ||
            result.customerId !== before.customerId ||
            result.plan !== before.plan ||
            result.status !== before.status;

          if (didChange) changed += 1;

          return { ok: true, userId: user.id, result };
        } catch (err) {
          errors += 1;
          console.error("❌ HEALTH CHECK FALHOU", {
            userId: user.id,
            email: user.email,
            customerId: user.stripe_customer_id,
            message: err?.message
          });
          return { ok: false, userId: user.id };
        }
      })
    );

    // Evita variável não utilizada e mantém logs compactos.
    void results;
  }

  return {
    users_found: users.length,
    candidates_older_than_24h: candidates.length,
    checked,
    changed,
    errors,
    duration_ms: Date.now() - startedAt
  };
}

// ======================================================
// HANDLER
// POST = Stripe Webhook
// GET  = Vercel Cron de verificação 24h
// ======================================================
export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized cron request"
      });
    }

    try {
      const result = await runSubscriptionHealthCheck();

      console.log("🩺 SUBSCRIPTION HEALTH CHECK", result);

      return res.status(200).json({
        success: true,
        mode: "subscription_health_check",
        ...result
      });
    } catch (err) {
      console.error("💥 FALHA NO HEALTH CHECK", {
        message: err?.message,
        stack: err?.stack
      });

      return res.status(500).json({
        success: false,
        error: "Subscription health check failed"
      });
    }
  }

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

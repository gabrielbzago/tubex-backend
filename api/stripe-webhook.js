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

// Novos preços (Start, Pro/Expert R$29,90/R$49,90, Legend) entram pelas
// variáveis da Vercel STRIPE_PRICE_<PLANO>_<MONTHLY|ANNUAL> (aceita vários
// IDs separados por vírgula). Assim nenhum preço novo exige mudar código.
const ENV_PLANS = ["start", "pro", "expert", "legend"];
for (const plan of ENV_PLANS) {
  for (const [suffix, billing_cycle] of [["MONTHLY", "monthly"], ["ANNUAL", "annual"]]) {
    const raw = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${suffix}`] || "";
    for (const id of raw.split(",").map(v => v.trim()).filter(Boolean)) {
      PRICE_MAP[id] = { plan, billing_cycle };
    }
  }
}

// Mapeia os seis Payment Links STRIPE_LINK_* aos Price IDs reais.
// O webhook usa esse mapa para identificar plano e ciclo sem IDs hardcoded.
let paymentLinkPriceMapPromise = null;

function normalizePaymentLinkUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch (_) {
    return "";
  }
}

async function hydratePriceMapFromPaymentLinks() {
  if (paymentLinkPriceMapPromise) return paymentLinkPriceMapPromise;

  paymentLinkPriceMapPromise = (async () => {
    const configured = new Map();
    for (const plan of ["start", "pro", "expert"]) {
      for (const [suffix, billing_cycle] of [["MONTHLY", "monthly"], ["ANNUAL", "annual"]]) {
        const envName = `STRIPE_LINK_${plan.toUpperCase()}_${suffix}`;
        const envUrl = normalizePaymentLinkUrl(process.env[envName]);
        if (envUrl) configured.set(envUrl, { plan, billing_cycle, envName });
      }
    }
    if (!configured.size) return { links: 0, prices: 0 };

    let startingAfter;
    let matchedLinks = 0;
    let mappedPrices = 0;
    while (true) {
      const page = await stripe.paymentLinks.list({
        limit: 100, active: true,
        ...(startingAfter ? { starting_after: startingAfter } : {})
      });

      for (const paymentLink of page.data || []) {
        const config = configured.get(normalizePaymentLinkUrl(paymentLink.url));
        if (!config) continue;
        matchedLinks += 1;

        const lineItems = await stripe.paymentLinks.listLineItems(paymentLink.id, { limit: 100 });
        for (const item of lineItems.data || []) {
          const priceId = typeof item.price === "string" ? item.price : item.price?.id;
          if (!priceId) continue;
          PRICE_MAP[priceId] = { plan: config.plan, billing_cycle: config.billing_cycle };
          mappedPrices += 1;
        }
      }

      if (!page.has_more || !page.data?.length) break;
      startingAfter = page.data[page.data.length - 1].id;
    }

    console.log("[TubeX] Payment Links Stripe sincronizados", { matchedLinks, mappedPrices });
    return { links: matchedLinks, prices: mappedPrices };
  })().catch(err => {
    console.error("[TubeX] Falha ao mapear Payment Links:", err?.message);
    paymentLinkPriceMapPromise = null;
    return { links: 0, prices: 0, error: err?.message };
  });

  return paymentLinkPriceMapPromise;
}

// Última rede de segurança: valor do preço em BRL (centavos) quando o Price ID
// ainda não foi cadastrado na Vercel e o produto não tem metadata tubex_plan.
const AMOUNT_MAP = {
  1990: "start", 19900: "start",
  2990: "pro", 2999: "pro", 29900: "pro", 29990: "pro",
  4990: "expert", 4999: "expert", 49900: "expert", 49990: "expert",
  9990: "legend", 99900: "legend"
};
const KNOWN_PLANS = new Set(["start", "pro", "expert", "legend"]);

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

// Regra de segurança: nunca considerar "canceled" como plano pago.
// O acesso pago somente é mantido para active/trialing/past_due/unpaid. 
const PAID_PLANS = new Set(["pro", "expert", "start", "legend"]);

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
  const price = subscription?.items?.data?.[0]?.price || {};
  const product = typeof price.product === "object" ? price.product : null;
  const metaPlan = String(
    subscription?.metadata?.tubex_plan ||
    price?.metadata?.tubex_plan ||
    product?.metadata?.tubex_plan ||
    ""
  ).toLowerCase().trim();
  const metaCycle = String(
    subscription?.metadata?.tubex_billing_cycle ||
    price?.metadata?.tubex_billing_cycle ||
    product?.metadata?.tubex_billing_cycle ||
    ""
  ).toLowerCase().trim();
  const currency = String(price?.currency || "").toLowerCase();
  const amountPlan = currency === "brl" ? AMOUNT_MAP[Number(price?.unit_amount)] || null : null;
  const fallbackPlan =
    (KNOWN_PLANS.has(metaPlan) ? metaPlan : null) ||
    (productId ? PRODUCT_MAP[productId] || null : null) ||
    amountPlan;
  if (!fallbackPlan) return null;
  if (amountPlan && fallbackPlan === amountPlan && !metaPlan) {
    console.warn(`[TubeX] Preço ${priceId || "?"} reconhecido pelo valor (${price?.unit_amount}). Cadastre-o em STRIPE_PRICE_${amountPlan.toUpperCase()}_* ou configure metadata tubex_plan no Payment Link.`);
  }

  const interval = price?.recurring?.interval;
  const billing_cycle = ["annual", "anual", "year", "yearly"].includes(metaCycle)
    ? "annual"
    : (metaCycle === "monthly" || metaCycle === "mensal")
      ? "monthly"
      : interval === "year" ? "annual" : "monthly";
  return { plan: fallbackPlan, billing_cycle };
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
      "id,email,name,plan,status,subscription_status,stripe_customer_id,stripe_subscription_id,updated_at"
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
      "id,email,name,plan,status,subscription_status,stripe_customer_id,stripe_subscription_id,updated_at"
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

    // INVARIANTE: assinatura realmente cancelada nunca mantém plano pago.
    // O acesso pago só permanece enquanto a assinatura estiver active/trialing
    // (ou em grace period past_due/unpaid, conforme a política do produto).
    if (status === "canceled") {
      plan = "free";
      subscriptionId = canonicalSubscription.id;
    }
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
      subscription_status: plan,
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
      subscriptionStatus: plan,
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
    subscription_status: plan,
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

  const canonical = chooseCanonicalSubscription(
    allSubscriptions.map(({ subscription }) => subscription)
  );
  const canonicalEntry = canonical
    ? allSubscriptions.find(({ subscription }) => subscription.id === canonical.id)
    : null;
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
      .select("id,email,name,plan,status,subscription_status,stripe_customer_id,stripe_subscription_id,updated_at")
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
    const inconsistentCanceledPaid =
      String(user.status || "").toLowerCase() === "canceled" &&
      String(user.plan || "free").toLowerCase() !== "free";

    const paidWithoutSubscription =
      String(user.plan || "free").toLowerCase() !== "free" &&
      !user.stripe_subscription_id;

    const inconsistentSubscriptionTier =
      String(user.subscription_status || "free").toLowerCase() !==
      String(user.plan || "free").toLowerCase();

    return (
      !updated ||
      updated <= cutoff ||
      inconsistentCanceledPaid ||
      paidWithoutSubscription ||
      inconsistentSubscriptionTier
    );
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
            subscriptionStatus: user.subscription_status || "free",
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
            result.status !== before.status ||
            result.plan !== before.subscriptionStatus;

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
    // Vincula os seis STRIPE_LINK_* aos Price IDs antes de reconciliar assinaturas.
    await hydratePriceMapFromPaymentLinks();

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

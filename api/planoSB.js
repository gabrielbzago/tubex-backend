import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔥 SUPABASE
// ======================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ======================================================
// CHECKOUT — STRIPE PRICE IDs nas variáveis STRIPE_LINK_*
// Mantemos os nomes já cadastrados na Vercel para evitar recadastro.
// O valor de cada variável deve ser um Price ID (price_...), não uma URL.
// GET /api/checkout?plan=start&cycle=monthly
// ======================================================
const CHECKOUT_PLANS = new Set(["start", "pro", "expert"]);
const CHECKOUT_CYCLES = new Set(["monthly", "annual"]);
let stripeCheckoutClient = null;

function getStripeCheckoutClient(){
  if (stripeCheckoutClient) return stripeCheckoutClient;
  const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) return null;
  stripeCheckoutClient = new Stripe(secret);
  return stripeCheckoutClient;
}

function checkoutPriceId(plan, cycle){
  const key = `STRIPE_LINK_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  const value = String(process.env[key] || "").trim();
  return /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}

async function handleCheckout(req, res){
  const q = req.query || {};
  let plan = String(q.plan || q.checkout || "").toLowerCase().trim();
  if (plan === "starter" || plan === "basic") plan = "start";

  const rawCycle = String(q.cycle || "monthly").toLowerCase().trim();
  const cycleAliases = {
    monthly: "monthly", month: "monthly", mensal: "monthly",
    annual: "annual", anual: "annual", year: "annual", yearly: "annual"
  };
  const cycle = cycleAliases[rawCycle];

  // Diagnóstico seguro: informa se há Price IDs válidos, sem revelar valores.
  if (q.config) {
    const configured = {};
    for (const p of CHECKOUT_PLANS) {
      for (const c of CHECKOUT_CYCLES) {
        configured[`${p}_${c}`] = Boolean(checkoutPriceId(p, c));
      }
    }
    return res.status(200).json({
      success: true,
      configured,
      checkout_mode: "stripe_checkout_session",
      variable_values: "price_id"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  if (!CHECKOUT_PLANS.has(plan)) {
    return res.status(400).json({
      success: false, error: "invalid_plan", allowed_plans: [...CHECKOUT_PLANS]
    });
  }
  if (!cycle) {
    return res.status(400).json({
      success: false, error: "invalid_billing_cycle", allowed_cycles: [...CHECKOUT_CYCLES]
    });
  }

  const priceId = checkoutPriceId(plan, cycle);
  if (!priceId) {
    const env_key = `STRIPE_LINK_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
    console.error(`[TubeX Checkout] Price ID ausente ou inválido: ${env_key}`);
    return res.status(503).json({
      success: false,
      error: "checkout_price_not_configured",
      plan,
      cycle,
      missing_or_invalid_variable: env_key,
      expected_value: "price_..."
    });
  }

  const stripe = getStripeCheckoutClient();
  if (!stripe) {
    console.error("[TubeX Checkout] STRIPE_SECRET_KEY não configurada.");
    return res.status(503).json({
      success: false, error: "stripe_secret_not_configured"
    });
  }

  try {
    const email = String(q.email || q.prefilled_email || "").trim();
    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    const ref = String(q.ref || q.client_reference_id || "")
      .replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);

    const appUrl = String(
      process.env.TUBEX_APP_URL || process.env.APP_URL || "https://tubexai.com.br"
    ).trim().replace(/\/+$/, "");

    const metadata = {
      tubex_plan: plan,
      tubex_billing_cycle: cycle,
      tubex_source: "tubex_checkout"
    };
    if (ref) metadata.affiliate_ref = ref;

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata: { ...metadata } }
    };

    if (validEmail) sessionParams.customer_email = email;
    if (ref) sessionParams.client_reference_id = ref;

    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session?.url) throw new Error("Stripe não retornou a URL da Checkout Session.");

    res.statusCode = 303;
    res.setHeader("Location", session.url);
    return res.end();
  } catch (err) {
    console.error("[TubeX Checkout] Falha ao criar sessão:", err?.message || err);
    return res.status(502).json({
      success: false, error: "stripe_checkout_session_failed"
    });
  }
}
// Legend/Corporate (futuros): para versões da extensão que ainda não conhecem
// o nome, o plano efetivo é "expert" e o nome real vai em tier_name.
const EXPERT_EQUIVALENT_PLANS = new Set(["legend", "corporate"]);

// ======================================================
// 🚀 HANDLER
// ======================================================
export default async function handler(req, res){

  // ====================================================
  // 🌐 CORS
  // ====================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // ====================================================
  // 🔁 PRE-FLIGHT
  // ====================================================
  if(req.method === "OPTIONS"){
    return res.status(200).end();
  }

  // ====================================================
  // 🚫 METHOD
  // ====================================================
  if(req.method === "GET" && (req.query?.plan || req.query?.checkout || req.query?.config)){
    return handleCheckout(req, res);
  }

  if(req.method !== "POST"){

    return res.status(405).json({
      success:false,
      error:"method_not_allowed"
    });

  }

  try{

    // ==================================================
    // 🔐 API KEY
    // ==================================================
    const apiKey = req.headers["x-api-key"];

    if(
      !apiKey ||
      apiKey !== process.env.INTERNAL_API_KEY
    ){

      return res.status(403).json({
        success:false,
        error:"unauthorized"
      });

    }

    // ==================================================
    // 🧠 BODY SAFE
    // ==================================================
    let body;

    try{

      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

    }catch(e){

      return res.status(400).json({
        success:false,
        error:"invalid_json"
      });

    }

    // ==================================================
    // 📧 EMAIL
    // ==================================================
    let email = body?.email;

    if(!email){

      return res.status(200).json({
        success:false,
        error:"missing_email"
      });

    }

    email = String(email)
      .toLowerCase()
      .trim();

    // Cache curto por e-mail para reduzir leituras repetidas sem deixar
    // alterações de assinatura presas por muito tempo. Erros nunca são cacheados.
    global.tubexPlanLookupCache = global.tubexPlanLookupCache || new Map();
    const planCache = global.tubexPlanLookupCache;
    const cachedPlan = planCache.get(email);
    if (cachedPlan && cachedPlan.expiresAt > Date.now()) {
      return res.status(200).json(cachedPlan.payload);
    }
    if (cachedPlan) planCache.delete(email);

    const sendPlanResponse = payload => {
      if (payload && payload.success === true) {
        if (planCache.size >= 1000) {
          const oldestKey = planCache.keys().next().value;
          if (oldestKey) planCache.delete(oldestKey);
        }
        planCache.set(email, { payload, expiresAt: Date.now() + 30_000 });
      }
      return res.status(200).json(payload);
    };

    console.log(
      "📧 consultando plano:",
      email
    );

console.log(
  "🔥 ENV:",
  {
    hasUrl:
      !!process.env.SUPABASE_URL,

    hasKey:
      !!process.env.SUPABASE_SERVICE_ROLE_KEY,

    hasInternal:
      !!process.env.INTERNAL_API_KEY
  }
);

    // ==================================================
    // 🔥 SUPABASE QUERY
    // ==================================================
    const {
      data,
      error
    } = await supabase
      .from("users")
      .select(`
        email,
        plan,
        status,
        affiliate_code,
        stripe_customer_id
      `)
     .ilike("email", email)
.maybeSingle();

    // ==================================================
    // ⚠️ ERROR
    // ==================================================
    if(error){

      console.error(
        "💥 supabase error:",
        error
      );

      // Erro técnico: não sabemos o plano. success:false faz a extensão manter
      // o plano em cache em vez de rebaixar o assinante para FREE.
      return res.status(200).json({
        success:false,
        error:"plan_lookup_failed",
        fallback:true
      });

    }

   // ==================================================
// 🚫 USER NOT FOUND
// ==================================================
if(!data){

  // ==============================================
  // 📄 FALLBACK SHEETS
  // ==============================================
  try{

    const sheetRes = await fetch(

      process.env.SHEETS_URL +

      `?email=${encodeURIComponent(email)}`

    );

    const sheetData =
      await sheetRes.json();

    console.log(
      "📄 SHEETS FALLBACK:",
      sheetData
    );

    // ============================================
    // ✅ ACHOU NO SHEETS
    // ============================================
    if(
      sheetData &&
      sheetData.plano &&
      sheetData.plano !== "free"
    ){

      return sendPlanResponse({

        success:true,

        fallback:true,

        source:"sheets",

        email,

        plan: String(
          sheetData.plano
        )
        .toLowerCase()
        .trim(),

        status:"approved"

      });

    }

  }catch(err){

    console.warn(
      "⚠ fallback sheets error:",
      err
    );

  }

  // ==============================================
  // 🚫 FREE FINAL
  // ==============================================
  return sendPlanResponse({

    success:true,

    plan:"free",
    plano:"free",

    fallback:false

  });

}

    // ==================================================
    // 📦 DATA
    // ==================================================
    let plan = String(
      data.plan || "free"
    )
    .toLowerCase()
    .trim();

    if(plan === "basic" || plan === "starter"){
      plan = "start";
    }

    let tierName = plan;
    if(EXPERT_EQUIVALENT_PLANS.has(plan)){
      plan = "expert";
    }

    const status = String(
      data.status || "inactive"
    )
    .toLowerCase()
    .trim();

    // O plano owner é permanente e não depende do status de cobrança.
    if (plan === "owner") {
      return sendPlanResponse({
        success: true,
        fallback: false,
        email: data.email,
        plan: "owner",
        plano: "owner",
        status: "active",
        affiliate_code: data.affiliate_code || null,
        stripe_customer_id: data.stripe_customer_id || null
      });
    }

    // ==================================================
    // 🚫 INACTIVE
    // ==================================================
// trialing/past_due: assinatura ainda válida (teste ou Stripe tentando cobrar
// de novo). O webhook já trata esses status como período de carência.
if(
  !["active","approved","trialing","past_due"].includes(status)
){

  return sendPlanResponse({
    success:true,
    plan:"free",
    status,
    fallback:false
  });

}

    // ==================================================
    // ✅ SUCCESS
    // ==================================================
    return sendPlanResponse({

      success:true,

      fallback:false,

      email:data.email,

      plan,
      plano:plan,
      tier_name:tierName,

      status,

      affiliate_code:
        data.affiliate_code || null,

      stripe_customer_id:
        data.stripe_customer_id || null

    });

  }catch(e){

    console.error(
      "💥 erro geral plano:",
      e
    );

    // ================================================
    // 🔥 FAILSAFE
    // ================================================
    return res.status(200).json({
      success:false,
      error:"plan_lookup_failed",
      fallback:true
    });

  }

}

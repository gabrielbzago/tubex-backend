import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔥 SUPABASE
// ======================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ======================================================
// CHECKOUT — os seis Payment Links são controlados pela Vercel.
// GET /api/checkout?plan=start&cycle=monthly (rewrite -> /api/planoSB)
// Ausência de variável gera erro; nunca troca silenciosamente o ciclo.
// ======================================================
const CHECKOUT_PLANS = new Set(["start", "pro", "expert"]);
const CHECKOUT_CYCLES = new Set(["monthly", "annual"]);

function checkoutLink(plan, cycle){
  const key = `STRIPE_LINK_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  const link = String(process.env[key] || "").trim();
  if (!link) return null;
  try {
    const parsed = new URL(link);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function handleCheckout(req, res){
  const q = req.query || {};
  let plan = String(q.plan || q.checkout || "").toLowerCase().trim();
  if (plan === "starter" || plan === "basic") plan = "start";

  const rawCycle = String(q.cycle || "monthly").toLowerCase().trim();
  const cycleAliases = {
    monthly: "monthly", month: "monthly", mensal: "monthly",
    annual: "annual", anual: "annual", year: "annual", yearly: "annual"
  };
  const cycle = cycleAliases[rawCycle];

  // Diagnóstico seguro: informa apenas se cada variável está configurada.
  if (q.config) {
    const configured = {};
    for (const p of CHECKOUT_PLANS) {
      for (const c of CHECKOUT_CYCLES) {
        const key = `STRIPE_LINK_${p.toUpperCase()}_${c.toUpperCase()}`;
        configured[`${p}_${c}`] = Boolean(checkoutLink(p, c));
      }
    }
    return res.status(200).json({ success: true, configured });
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

  const target = checkoutLink(plan, cycle);
  if (!target) {
    const env_key = `STRIPE_LINK_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
    console.error(`[TubeX Checkout] Variável ausente ou inválida: ${env_key}`);
    return res.status(503).json({
      success: false, error: "checkout_not_configured", plan, cycle,
      missing_variable: env_key
    });
  }

  // Repassa e-mail e referência de afiliado ao Stripe Payment Link.
  try {
    const url = new URL(target);
    const email = String(q.email || q.prefilled_email || "").trim();
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      url.searchParams.set("prefilled_email", email);
    }
    const ref = String(q.ref || q.client_reference_id || "")
      .replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
    if (ref) url.searchParams.set("client_reference_id", ref);
    res.statusCode = 302;
    res.setHeader("Location", url.toString());
    return res.end();
  } catch (err) {
    console.error("[TubeX Checkout] URL inválida:", err?.message);
    return res.status(503).json({ success: false, error: "invalid_checkout_url" });
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

      return res.status(200).json({

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
  return res.status(200).json({

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
      return res.status(200).json({
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

  return res.status(200).json({
    success:true,
    plan:"free",
    status,
    fallback:false
  });

}

    // ==================================================
    // ✅ SUCCESS
    // ==================================================
    return res.status(200).json({

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

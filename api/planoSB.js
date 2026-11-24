import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔥 SUPABASE
// ======================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ======================================================
// 💳 CHECKOUT — links de pagamento vêm das variáveis da Vercel
// ------------------------------------------------------
// GET /api/checkout?plan=start&cycle=monthly  (rewrite para /api/planoSB)
// Extensão, site e dashboard apontam para cá; trocar um link no Stripe
// é só mudar a variável STRIPE_LINK_<PLANO>_<CICLO> na Vercel.
// Sem a variável, Pro e Expert caem nos links antigos (nada quebra);
// Start/Legend sem variável vão para a página de planos.
// ======================================================
const CHECKOUT_FALLBACK_LINKS = {
  pro_monthly: "https://buy.stripe.com/3cI7sK7058OtdzDaUegjC01",
  pro_annual: "https://buy.stripe.com/28E3cudote8NgLPd2mgjC03",
  expert_monthly: "https://buy.stripe.com/dRmaEW98dggV3Z3d2mgjC02",
  expert_annual: "https://buy.stripe.com/28E8wO3NTe8N67b2nIgjC04"
};
const CHECKOUT_PLANS = new Set(["start", "pro", "expert", "legend"]);
const PLANS_PAGE_URL = "https://tubexai.com.br/#planos";

function checkoutLink(plan, cycle){
  const envValue = process.env[`STRIPE_LINK_${plan.toUpperCase()}_${cycle.toUpperCase()}`];
  const link = String(envValue || "").trim();
  if (/^https:\/\//i.test(link)) return link;
  return CHECKOUT_FALLBACK_LINKS[`${plan}_${cycle}`] || null;
}

function handleCheckout(req, res){
  const q = req.query || {};
  let plan = String(q.plan || q.checkout || "").toLowerCase().trim();
  if (plan === "starter" || plan === "basic") plan = "start";
  const cycle = /^(annual|anual|year|yearly)$/i.test(String(q.cycle || "")) ? "annual" : "monthly";

  // ?config=1 → JSON com o que está configurado (sem expor nada sensível).
  if (q.config) {
    const out = {};
    for (const p of CHECKOUT_PLANS) for (const c of ["monthly", "annual"]) {
      out[`${p}_${c}`] = Boolean(String(process.env[`STRIPE_LINK_${p.toUpperCase()}_${c.toUpperCase()}`] || "").trim());
    }
    return res.status(200).json({ success: true, configured: out });
  }

  let target = CHECKOUT_PLANS.has(plan) ? checkoutLink(plan, cycle) : null;
  if (!target && CHECKOUT_PLANS.has(plan) && cycle === "annual") target = checkoutLink(plan, "monthly");
  if (!target) target = PLANS_PAGE_URL;

  // Repassa e-mail e código de afiliado para o Payment Link (Stripe aceita estes parâmetros).
  try {
    const url = new URL(target);
    if (url.hostname.endsWith("stripe.com")) {
      const email = String(q.email || q.prefilled_email || "").trim();
      if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) url.searchParams.set("prefilled_email", email);
      const ref = String(q.ref || q.client_reference_id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
      if (ref) url.searchParams.set("client_reference_id", ref);
    }
    target = url.toString();
  } catch (_) {}

  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 302;
  res.setHeader("Location", target);
  return res.end();
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

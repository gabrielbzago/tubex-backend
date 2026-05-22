import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔥 SUPABASE
// ======================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

      return res.status(200).json({
        success:true,
        plan:"free",
        fallback:true
      });

    }

    // ==================================================
    // 🚫 USER NOT FOUND
    // ==================================================
    if(!data){

      console.warn(
        "⚠ usuário não encontrado"
      );

      return res.status(200).json({
        success:true,
        plan:"free",
        fallback:false
      });

    }

    // ==================================================
    // 📦 DATA
    // ==================================================
    const plan = String(
      data.plan || "free"
    )
    .toLowerCase()
    .trim();

    const status = String(
      data.status || "inactive"
    )
    .toLowerCase()
    .trim();

    // ==================================================
    // 🚫 INACTIVE
    // ==================================================
if(
  status !== "active" &&
  status !== "approved"
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
      success:true,
      plan:"free",
      fallback:true
    });

  }

}

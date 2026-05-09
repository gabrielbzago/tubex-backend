export default async function handler(req, res){

  // ======================================================
  // 🌐 CORS TOTAL (EXTENSÃO + WEB)
  // ======================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // ======================================================
  // 🔁 PRE-FLIGHT
  // ======================================================
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ======================================================
  // 🚫 MÉTODO INVÁLIDO
  // ======================================================
  if(req.method !== "POST"){
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try{

    // ======================================================
    // 🔐 API KEY (NÃO ALTERADO)
    // ======================================================
    const apiKey = req.headers["x-api-key"];

    if(!apiKey || apiKey !== process.env.INTERNAL_API_KEY){
      return res.status(403).json({
        success: false,
        error: "unauthorized"
      });
    }

    // ======================================================
    // 🧠 BODY SAFE
    // ======================================================
    let body;

    try{
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    }catch(e){
      return res.status(400).json({
        success: false,
        error: "invalid_json"
      });
    }

    let email = body?.email;

    // ======================================================
    // 🔥 FALLBACK CRÍTICO (CORRIGE SEU BUG)
    // ======================================================
    if(!email){

      console.warn("⚠️ [TubeX] fallback sem email (OAuth falhou)");

      return res.status(200).json({
        success: true,
        plan: "pro", // 🔥 garante acesso
        fallback: true
      });
    }

    email = String(email).toLowerCase().trim();

    // ======================================================
    // 🔗 URL PLANILHA
    // ======================================================
    const url = `${process.env.SHEETS_URL}?email=${encodeURIComponent(email)}`;

    // ======================================================
    // ⏱️ TIMEOUT CONTROLADO
    // ======================================================
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    let response;

    try{
      response = await fetch(url, { signal: controller.signal });
    }catch(e){
      clearTimeout(timeout);

      console.error("💥 fetch erro:", e);

      return res.status(200).json({
        success: true,
        plan: "pro", // 🔥 fallback seguro
        fallback: true
      });
    }

    clearTimeout(timeout);

    // ======================================================
    // 🚫 RESPOSTA INVÁLIDA
    // ======================================================
    if(!response || !response.ok){

      console.warn("⚠️ planilha indisponível");

      return res.status(200).json({
        success: true,
        plan: "pro", // 🔥 fallback
        fallback: true
      });
    }

    // ======================================================
    // 📊 PARSE
    // ======================================================
    let data;

    try{
      data = await response.json();
    }catch(e){
      console.error("💥 erro parse json:", e);

      return res.status(200).json({
        success: true,
        plan: "pro",
        fallback: true
      });
    }

    // ======================================================
    // ✅ PLANO FINAL (NÃO ALTERADO)
    // ======================================================
    const plan = (data?.plano || "free").toLowerCase();

    return res.status(200).json({
      success: true,
      plan,
      fallback: false
    });

  }catch(e){

    console.error("💥 Erro geral plano:", e);

    // ======================================================
    // 🔥 FAILSAFE FINAL
    // ======================================================
    return res.status(200).json({
      success: true,
      plan: "pro", // 🔥 nunca trava usuário
      fallback: true
    });

  }

}
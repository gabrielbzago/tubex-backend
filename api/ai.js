export default async function handler(req, res) {

  // 🔐 CORS
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, authorization"
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 API KEY SAFE
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["X-API-KEY"] ||
    req.headers["authorization"]?.replace("Bearer ","");

if (apiKey !== process.env.API_KEY) {
  return res.status(403).json({
    success:false,
    error:"unauthorized",
    text:""
  });
}

  if (req.method !== "POST") {
    return res.status(405).json({
      success:false,
      error:"Método não permitido",
      text:""
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let prompt = body?.prompt;

    if (!prompt) {
      return res.status(400).json({
        success:false,
        error:"prompt obrigatório",
        text:""
      });
    }

    prompt = String(prompt).slice(0, 2000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          { role:"system", content:"Você é especialista em crescimento no YouTube e SEO." },
          { role:"user", content:prompt }
        ],
        temperature:0.4
      })
    });

    const raw = await response.text();

    let data;

    try{
      data = JSON.parse(raw);
    }catch{
      console.error("JSON inválido:", raw);
      return res.status(500).json({
        success:false,
        error:"invalid json",
        text:""
      });
    }

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({
        success:false,
        error:data?.error?.message || "Erro IA",
        text:""
      });
    }

    const text = String(data.choices?.[0]?.message?.content || "").trim();

    return res.status(200).json({
      success:true,
      text: text || "📊 Continue postando com consistência e melhore seus títulos para crescer mais rápido."
    });

  } catch (e) {

    console.error("AI backend error:", e);

    return res.status(500).json({
      success:false,
      error:"Erro interno",
      text:""
    });
  }
}
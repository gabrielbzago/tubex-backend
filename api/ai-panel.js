// ======================================================
// 🧠 TubeX Advanced AI (SAFE PRODUCTION)
// ======================================================

export default async function handler(req, res) {

  // ======================================================
  // 🌐 CORS CONTROLADO
  // ======================================================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try {

    // ======================================================
    // 📦 BODY SAFE
    // ======================================================
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});
    } catch {
      return res.status(400).json({
        success: false,
        error: "invalid_json"
      });
    }

    // ======================================================
    // 👤 USER VALIDATION
    // ======================================================
    const email = body?.email;

    if (!email || typeof email !== "string") {
      return res.status(401).json({
        success: false,
        error: "unauthorized"
      });
    }

    // ======================================================
    // 🔥 RATE LIMIT (CRÍTICO)
    // ======================================================
    global.__tubexRate = global.__tubexRate || {};
    const now = Date.now();

    if (!global.__tubexRate[email]) {
      global.__tubexRate[email] = [];
    }

    global.__tubexRate[email] =
      global.__tubexRate[email].filter(t => now - t < 60000);

    if (global.__tubexRate[email].length >= 6) {
      return res.status(429).json({
        success: false,
        error: "rate_limit"
      });
    }

    global.__tubexRate[email].push(now);

    // ======================================================
    // 🔒 OPENAI KEY
    // ======================================================
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "missing_openai_key"
      });
    }

    // ======================================================
    // 🧠 INPUT
    // ======================================================
    let tipo = String(body?.tipo || "").toLowerCase().trim();
    let prompt = String(body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "empty_prompt"
      });
    }

    // 🔥 CONTROLE DE CUSTO
    if (prompt.length > 400) {
      prompt = prompt.slice(0, 400);
    }

    // ======================================================
    // 🧠 PROMPT ENGINE
    // ======================================================
    let finalPrompt = "";

    switch (tipo) {

      case "titulo-impactante":
        finalPrompt = `
Crie 1 título extremamente chamativo (máx 70 caracteres).
"${prompt}"
`;
        break;

      case "titulo-seo":
        finalPrompt = `
Crie 1 título otimizado para SEO (máx 70 caracteres).
"${prompt}"
`;
        break;

      case "titulo-emocional":
        finalPrompt = `
Crie 1 título emocional e altamente clicável.
"${prompt}"
`;
        break;

      case "descricao":
        finalPrompt = `
Crie uma descrição otimizada para YouTube.
"${prompt}"
`;
        break;

      case "roteiro":
        finalPrompt = `
Crie um roteiro de YouTube com alta retenção.

Tema:
"${prompt}"

Use estrutura clara, fluida e profissional.
`;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: "invalid_tipo"
        });
    }

    // ======================================================
    // ⚡ CACHE (COM TTL)
    // ======================================================
    const cacheKey = tipo + "_" + prompt.slice(0,100);

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if (cache && (Date.now() - cache.time < 3600000)) {
      return res.status(200).json({
        success: true,
        text: cache.text,
        cached: true
      });
    }

    // ======================================================
    // ⏱ TIMEOUT
    // ======================================================
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // ======================================================
    // 🤖 OPENAI
    // ======================================================
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Especialista em YouTube." },
          { role: "user", content: finalPrompt }
        ],
        temperature: 0.7,
        max_tokens: tipo === "roteiro" ? 1000 : 400
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(await response.text());

      return res.status(500).json({
        success: false,
        error: "openai_error"
      });
    }

    const data = await response.json();

    let text = String(
      data?.choices?.[0]?.message?.content || ""
    ).trim();

    if (!text) {
      return res.status(500).json({
        success: false,
        error: "empty_ai_response"
      });
    }

    // ======================================================
    // 💾 CACHE SAVE
    // ======================================================
    global.__tubexCache[cacheKey] = {
      text,
      time: Date.now()
    };

    // ======================================================
    // ✅ RESPONSE
    // ======================================================
    return res.status(200).json({
      success: true,
      text
    });

  } catch (e) {

    console.error("💥 ERROR:", e);

    if (e.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "timeout"
      });
    }

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
// ======================================================
// 🧠 TubeX AI Titles/Description (SAFE VERSION)
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

  // ======================================================
  // 🚫 METHOD
  // ======================================================
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
    // 🔥 RATE LIMIT
    // ======================================================
    global.__tubexRate = global.__tubexRate || {};
    const now = Date.now();

    if (!global.__tubexRate[email]) {
      global.__tubexRate[email] = [];
    }

    global.__tubexRate[email] =
      global.__tubexRate[email].filter(t => now - t < 60000);

    if (global.__tubexRate[email].length >= 10) {
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
    let { tipo, prompt } = body;

    tipo = String(tipo || "").toLowerCase().trim();
    prompt = String(prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "empty_prompt"
      });
    }

    if (!tipo) {
      return res.status(400).json({
        success: false,
        error: "missing_tipo"
      });
    }

    // 🔥 LIMITA CUSTO
    if (prompt.length > 300) {
      prompt = prompt.slice(0, 300);
    }

    // ======================================================
    // 🧠 PROMPT ENGINE
    // ======================================================
    let finalPrompt = "";

    if (tipo === "titulo" || tipo === "tituloseo") {

      finalPrompt = `
Crie 4 títulos curtos e altamente clicáveis para YouTube.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    } else if (tipo === "descricao") {

finalPrompt = `

Você é um especialista em SEO para YouTube e Google.

Sua missão é criar uma descrição profissional capaz de aumentar as chances de ranqueamento e incentivar mais cliques e tempo de exibição.

Tema do vídeo:

"${prompt}"

REGRAS:

• Escreva entre 1800 e 2800 caracteres.

• Comece exatamente com o título do vídeo.

• Os primeiros 200 caracteres devem explicar claramente o assunto e despertar interesse.

• Utilize naturalmente a palavra-chave principal ao longo do texto.

• Inclua variações semânticas e palavras-chave relacionadas sem repetir excessivamente.

• Organize o conteúdo em parágrafos curtos e fáceis de ler.

• Explique o tema de forma clara, útil e aprofundada.

• Responda dúvidas comuns que o público teria ao pesquisar esse assunto.

• Destaque os principais benefícios que o espectador terá ao assistir ao vídeo.

• Escreva em linguagem natural, sem parecer texto gerado por IA.

• Nunca utilize keyword stuffing.

• Não invente informações que não estejam relacionadas ao tema.

• Finalize com um CTA curto incentivando inscrição, comentário e compartilhamento.

• Inclua no máximo 2 hashtags realmente relevantes.

Retorne apenas a descrição, sem títulos, explicações, markdown ou aspas.

`;

}

    } else {

      return res.status(400).json({
        success: false,
        error: "invalid_tipo"
      });

    }

    // ======================================================
    // ⚡ CACHE
    // ======================================================
    const cacheKey = `${tipo}_${prompt.slice(0,80)}`;

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if (cache && (Date.now() - cache.timestamp < 3600000)) {
      return res.status(200).json({
        success: true,
        text: cache.text
      });
    }

    // ======================================================
    // 🤖 OPENAI REQUEST
    // ======================================================
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Especialista em YouTube e SEO."
          },
          {
            role: "user",
            content: finalPrompt
          }
        ],
        temperature: 0.6,
        max_tokens: 500
      })
    });

    // ======================================================
    // ❌ OPENAI ERROR
    // ======================================================
    if (!response.ok) {

      const errorText = await response.text();

      console.error("💥 OPENAI ERROR:", errorText);

      return res.status(500).json({
        success: false,
        error: "openai_error"
      });
    }

    // ======================================================
    // 🔒 PARSE SAFE
    // ======================================================
    let data;

    try {
      data = await response.json();
    } catch {
      return res.status(500).json({
        success: false,
        error: "invalid_json_openai"
      });
    }

    // ======================================================
    // 🧠 EXTRAÇÃO
    // ======================================================
    let text = data?.choices?.[0]?.message?.content;

    if (Array.isArray(text)) {
      text = text.map(t => t?.text || "").join(" ");
    }

    text = String(text || "").trim();

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
      timestamp: Date.now()
    };

    // ======================================================
    // ✅ RESPONSE
    // ======================================================
    return res.status(200).json({
      success: true,
      text
    });

  } catch (e) {

    console.error("💥 INTERNAL ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });

  }
}
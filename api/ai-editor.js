export default async function handler(req, res) {

  // =====================================
  // 🌐 CORS
  // =====================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

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

    // =====================================
    // 📦 BODY SAFE PARSE
    // =====================================
    let body = {};

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});
    } catch (e) {
      console.warn("⚠ JSON inválido recebido");
      body = {};
    }

    // =====================================
    // 🔒 NORMALIZAÇÃO SEGURA
    // =====================================
    const tipo = String(body?.tipo || "")
      .toLowerCase()
      .trim();

    const prompt = String(body?.prompt || "")
      .trim();

    // =====================================
    // 🚫 VALIDAÇÃO
    // =====================================
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

    // =====================================
    // 🧠 PROMPT BUILDER
    // =====================================
    let finalPrompt = "";

    if (tipo === "titulo" || tipo === "tituloseo") {

      finalPrompt = `
Crie 4 títulos curtos, altamente clicáveis para YouTube.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    } else if (tipo === "descricao") {

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- palavras-chave naturais
- CTA leve
- até 2 hashtags

Base:
"${prompt}"
`;

    } else {

      return res.status(400).json({
        success: false,
        error: "invalid_tipo"
      });

    }

    // =====================================
    // 🤖 OPENAI REQUEST
    // =====================================
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
            content: "Você é especialista em YouTube e SEO."
          },
          {
            role: "user",
            content: finalPrompt
          }
        ],
        temperature: 0.6
      })
    });

    // =====================================
    // ❌ OPENAI ERROR
    // =====================================
    if (!response.ok) {
      const errorText = await response.text();

      console.error("💥 OPENAI ERROR:", errorText);

      return res.status(500).json({
        success: false,
        error: "openai_error",
        message: errorText
      });
    }

    // =====================================
    // 🔒 PARSE SEGURO
    // =====================================
    let data;

    try {
      data = await response.json();
    } catch (e) {
      console.error("💥 JSON PARSE ERROR:", e);

      return res.status(500).json({
        success: false,
        error: "invalid_json_openai"
      });
    }

    console.log("🧠 OPENAI RAW:", data);

    // =====================================
    // 🧠 EXTRAÇÃO SEGURA
    // =====================================
    let text = data?.choices?.[0]?.message?.content;

    if (Array.isArray(text)) {
      text = text.map(t => t?.text || "").join(" ");
    }

    text = String(text || "").trim();

    // =====================================
    // 🚫 RESPOSTA VAZIA
    // =====================================
    if (!text) {
      return res.status(500).json({
        success: false,
        error: "empty_ai_response"
      });
    }

    // =====================================
    // ✅ SUCCESS
    // =====================================
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
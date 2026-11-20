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
    const titleFocus = String(body?.titleFocus || body?.focus || "seo").trim().toLowerCase();
    const editorContextInput = body?.editorContext && typeof body.editorContext === "object" ? body.editorContext : {};
    const editorDescription = String(editorContextInput.description || "").slice(0, 1800);
    const editorTags = Array.isArray(editorContextInput.tags)
      ? [...new Set(editorContextInput.tags.map(tag => String(tag || "").trim()).filter(Boolean))].slice(0, 25)
      : [];

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
      const recommendationMode = ["recommendation","recomendation","recomendacao","recomendação","suggested","browse"].includes(titleFocus);
      finalPrompt = `
Você é estrategista editorial de YouTube. Gere quatro títulos realmente diferentes a partir do conteúdo informado, sem fazer simples trocas de sinônimos.

FOCO: ${recommendationMode
  ? "RECOMENDAÇÕES — Início e Vídeos sugeridos: clareza imediata, curiosidade específica e motivo legítimo para clicar. Não force palavras-chave no começo."
  : "SEO / PESQUISA — reconheça a intenção e a frase-chave principal, preserve-a naturalmente e deixe claro que resposta ou benefício o vídeo oferece."}

TÍTULO ORIGINAL:
${prompt}

DESCRIÇÃO ATUAL (contexto auxiliar; não copie frases genéricas):
${editorDescription || "Não fornecida."}

TAGS (pistas do assunto, não repetir como lista):
${editorTags.join(", ") || "Não fornecidas."}

Use descrição e tags apenas se forem consistentes com o título. Mantenha fatos e entidades recebidos; não invente resultados, promessas, acontecimentos ou experiência pessoal. Crie quatro ângulos específicos, naturais e distintos, no mesmo idioma do título, com no máximo 70 caracteres cada. Evite clickbait enganoso, frases vazias e aberturas repetidas.

Retorne somente os quatro títulos, um por linha, sem numeração, aspas, markdown ou explicação.
`;

    } else if (tipo === "descricao" || tipo === "descricao_editor") {

finalPrompt = `

Você é editor de conteúdo para YouTube. Escreva uma descrição curta, útil, natural e específica para este vídeo.

TÍTULO:
${prompt}

DESCRIÇÃO ATUAL (use somente fatos úteis; não copie trechos genéricos):
${editorDescription || "Não fornecida."}

TAGS (pistas secundárias):
${editorTags.join(", ") || "Não fornecidas."}

Escreva de 450 a 900 caracteres em 2 ou 3 parágrafos curtos, no idioma do título. Abra explicando claramente o assunto e a intenção atendida. Preserve apenas detalhes presentes no título ou na descrição atual; não invente cenas, resultados, pessoas, lugares ou conclusões. Integre naturalmente a frase-chave principal e no máximo duas variações pertinentes. Evite repetir o título, a mesma ideia, introduções vazias, listas artificiais, promessas exageradas e CTAs repetitivos. Termine com no máximo um convite curto, se couber, e use até duas hashtags específicas.

Retorne somente a descrição pronta para colar, sem rótulo, aspas ou explicação.

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
    const contextKey = JSON.stringify({ titleFocus, editorDescription, editorTags });
    const contextHash = contextKey.split("").reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261).toString(36);
    const cacheKey = `${tipo}_${prompt.slice(0,80)}_${contextHash}`;

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

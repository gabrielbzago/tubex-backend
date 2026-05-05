export default async function handler(req, res) {

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

  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized",
      text: ""
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      text: ""
    });
  }

  try {

    // =========================
    // 📦 BODY SAFE PARSE
    // =========================
    let body;
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch (err) {
      console.error("💥 JSON PARSE ERROR:", err);
      return res.status(400).json({
        success: false,
        error: "invalid_json",
        text: ""
      });
    }

    let prompt = body?.prompt;
    const context = body?.context || {};
    const tipo = body?.tipo || "";

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "prompt obrigatório",
        text: ""
      });
    }

    prompt = String(prompt).slice(0, 2000);

    // =========================
    // 🎥 VIDEOS SAFE
    // =========================
    const videos = Array.isArray(context.videos) ? context.videos : [];

    if (!videos.length) {
      console.warn("⚠️ sem vídeos → IA sem contexto");
    }

    const parsedVideos = videos.slice(0, 20).map(v => ({
      title: v?.title || v?.snippet?.title || "",
      views: Number(v?.views || v?.statistics?.viewCount || 0),
      likes: Number(v?.statistics?.likeCount || 0),
      comments: Number(v?.statistics?.commentCount || 0),
      publishedAt: v?.publishedAt || v?.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((acc, v) => acc + (v.views || 0), 0);

    const avgViews = parsedVideos.length
      ? Math.round(totalViews / parsedVideos.length)
      : 0;

    const sorted = [...parsedVideos].sort((a,b)=>(b.views||0) - (a.views||0));

    // 🔥 SAFE FALLBACK (evita undefined crash)
    const topVideo = sorted[0] || { title: "N/A", views: 0 };
    const worstVideo = sorted[sorted.length - 1] || { title: "N/A", views: 0 };

    // =========================
    // 📅 DATA SEGURA
    // =========================
    const nowTime = Date.now();

    const last7 = parsedVideos.filter(v => {
      const t = new Date(v.publishedAt).getTime();
      if (isNaN(t)) return false; // 🔥 evita NaN crash
      return (nowTime - t) <= (7 * 24 * 60 * 60 * 1000);
    });

    const uploads7 = last7.length;

    const videoSummary = parsedVideos.slice(0, 3).map(v => {
      return `- ${v.title} (${v.views} views)`;
    }).join("\n");

    // =========================================
    // 🧠 PROMPT (SEM ALTERAÇÃO)
    // =========================================
    let finalPrompt = "";

    if(tipo === "tituloSEO" || tipo === "tituloImpactante" || tipo === "tituloEmocional"){

      finalPrompt = `
Crie 4 títulos curtos, altamente clicáveis para YouTube.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    }

    else if(tipo === "descricao"){

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- palavras-chave naturais
- CTA leve

Base:
"${prompt}"
`;

    }

    else if(tipo === "ideas"){

      finalPrompt = `
Você é um especialista em crescimento no YouTube.

Baseado nos vídeos abaixo:

${videoSummary}

Crie 5 ideias de vídeos NOVOS para este canal.

Regras:
- Baseadas no estilo do canal
- Não repetir títulos existentes
- 1 linha por ideia
- Máx 12 palavras
- Foco em CTR e viralização
- Não explique

Responda apenas com as ideias.
`;

    }

    else if(tipo === "strategy"){

      finalPrompt = `
Você é um consultor especialista em crescimento no YouTube.

📊 DADOS REAIS:
- Média de views: ${avgViews}
- Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${topVideo.title} (${topVideo.views} views)

⚠️ Pior vídeo:
${worstVideo.title} (${worstVideo.views} views)

📺 Vídeos:
${videoSummary}

---

Gere uma estratégia PROFISSIONAL:

1. 📈 PADRÃO DO CANAL
2. ❌ ERRO CRÍTICO
3. 🚀 ESTRATÉGIA DE ESCALA
4. 🎯 3 TÍTULOS PRONTOS

⚠️ Proibido resposta genérica
⚠️ Baseado apenas nos dados
`;
    }

    if(!finalPrompt){

      finalPrompt = `
${prompt}

========================
📊 DADOS REAIS DO CANAL
========================

Média de views: ${avgViews}
Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${topVideo.title} (${topVideo.views} views)

⚠️ Pior vídeo:
${worstVideo.title} (${worstVideo.views} views)

📺 Amostra de vídeos:
${videoSummary}

========================
📌 INSTRUÇÕES
========================

Faça uma análise PROFUNDA e prática do canal.
`;

    }

    // ===============================
    // ⚡ CACHE (INALTERADO)
    // ===============================
    const stableKey = parsedVideos
      .slice(0,5)
      .map(v => (v.title || "").slice(0,30).toLowerCase().trim())
      .sort()
      .join("|");

    const cacheKey = `${tipo}_${prompt.slice(0,80)}_${stableKey}`;

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if(cache && (Date.now() - cache.timestamp < 1000 * 60 * 60 * 6)){
      console.log("⚡ usando cache IA");
      return res.status(200).json({
        success: true,
        text: cache.text
      });
    }

    let temp = 0.6;
    if (tipo === "ideas") temp = 0.8;
    if (tipo === "descricao") temp = 0.5;
    if (tipo === "strategy") temp = 0.7;

    // ===============================
    // 🤖 OPENAI SAFE
    // ===============================
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          { role:"system", content:"Você é especialista em YouTube e SEO." },
          { role:"user", content: finalPrompt }
        ],
        temperature: temp,
        max_tokens: 1200
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("💥 OPENAI ERROR:", errorText);

      return res.status(500).json({
        success:false,
        error:"openai_error",
        message:errorText
      });
    }

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({
        success:false,
        error:"empty_ai_response"
      });
    }

    global.__tubexCache[cacheKey] = {
      text,
      timestamp: Date.now()
    };

    return res.status(200).json({
      success:true,
      text
    });

  } catch (e) {

    console.error("💥 AI backend error FULL:", {
      message: e?.message,
      stack: e?.stack
    });

    return res.status(500).json({
      success:false,
      error:"Erro interno",
      text:""
    });
  }
}
// ======================================================
// 🧠 TubeX AI (SAFE PRODUCTION VERSION)
// ======================================================

export default async function handler(req, res) {

  // ======================================================
  // 🌐 CORS (controlado)
  // ======================================================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
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
    // 📦 BODY PARSE
    // ======================================================
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({
        success: false,
        error: "invalid_json"
      });
    }

    const email = body?.email;

    // ======================================================
    // 🔒 USER REQUIRED
    // ======================================================
    if (!email || typeof email !== "string") {
      return res.status(401).json({
        success: false,
        error: "unauthorized"
      });
    }

    // ======================================================
    // 🔥 RATE LIMIT (ANTI ABUSE)
    // ======================================================
    global.__tubexRate = global.__tubexRate || {};
    const now = Date.now();

    if (!global.__tubexRate[email]) {
      global.__tubexRate[email] = [];
    }

    global.__tubexRate[email] =
      global.__tubexRate[email].filter(t => now - t < 60000);

    if (global.__tubexRate[email].length >= 5) {
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
    let { prompt, context, tipo } = body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "invalid_prompt"
      });
    }

    prompt = prompt.slice(0, 500);

    const videos = Array.isArray(context?.videos) ? context.videos : [];

    const parsedVideos = videos.slice(0, 10).map(v => ({
      title: v.title || v.snippet?.title || "",
      views: Number(v.views || v.statistics?.viewCount || 0),
      publishedAt: v.publishedAt || v.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((a,v)=>a+v.views,0);
    const avgViews = parsedVideos.length ? Math.round(totalViews / parsedVideos.length) : 0;

    const sorted = [...parsedVideos].sort((a,b)=>b.views - a.views);
    const topVideo = sorted[0] || {};
    const worstVideo = sorted[sorted.length-1] || {};

    const nowTime = Date.now();
    const last7 = parsedVideos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (nowTime - t) <= 604800000;
    });

    const uploads7 = last7.length;

    const videoSummary = parsedVideos
      .slice(0,3)
      .map(v=>`- ${v.title} (${v.views} views)`)
      .join("\n");

    // ======================================================
    // 🧠 PROMPT ENGINE
    // ======================================================
    let finalPrompt = "";

    if (tipo === "tituloSEO" || tipo === "tituloImpactante" || tipo === "tituloEmocional") {

      finalPrompt = `
Crie 4 títulos curtos e altamente clicáveis.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    } else if (tipo === "descricao") {

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- SEO natural
- CTA leve

Base:
"${prompt}"
`;

    } else if (tipo === "ideas") {

      finalPrompt = `
Baseado nesses vídeos:

${videoSummary}

Crie 5 ideias novas.

Regras:
- não repetir
- máximo 12 palavras
- foco em viral
`;

    } else if (tipo === "strategy") {

      finalPrompt = `
Dados:
Média views: ${avgViews}
Uploads 7 dias: ${uploads7}

Top vídeo:
${topVideo.title} (${topVideo.views})

Pior vídeo:
${worstVideo.title} (${worstVideo.views})

Crie uma estratégia:
- o que funciona
- erro crítico
- plano de crescimento
- 3 títulos
`;

    } else {

      finalPrompt = `
${prompt}

Dados:
${videoSummary}

Analise o canal e sugira melhorias reais.
`;

    }

    // ======================================================
    // ⚡ CACHE
    // ======================================================
const stableKey = parsedVideos
  .slice(0,5)
  .map(v => (v.title || "").slice(0,30).toLowerCase().trim())
  .sort()
  .join("|");

const cacheKey = `${tipo}_${prompt.slice(0,80)}_${stableKey}`;

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if (cache && (Date.now() - cache.timestamp < 3600000)) {
      return res.status(200).json({
        success: true,
        text: cache.text
      });
    }

    // ======================================================
    // 🤖 OPENAI
    // ======================================================
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          { role:"system", content:"Especialista em YouTube growth." },
          { role:"user", content: finalPrompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {

      const err = await response.text();

      console.error("💥 OPENAI:", err);

      return res.status(500).json({
        success:false,
        error:"openai_error"
      });
    }

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({
        success:false,
        error:"empty_response"
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

  } catch (err) {

    console.error("💥 ERROR:", err);

    return res.status(500).json({
      success:false,
      error:"internal_error"
    });
  }
}
export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, authorization, x-client"
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔒 ORIGIN LOCK (não quebra extensão)
  if (
    !origin.includes("youtube.com") &&
    !origin.includes("chrome-extension")
  ) {
    return res.status(403).json({ success:false, error:"origin_blocked", text:"" });
  }

  // 🔒 CLIENT CHECK
  if (req.headers["x-client"] !== "tubex-extension-v1") {
    return res.status(403).json({ success:false, error:"invalid_client", text:"" });
  }

  // 🔒 API KEY
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ success:false, error:"unauthorized", text:"" });
  }

  // 🔥 RATE LIMIT (leve, não quebra UX)
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown";

  global.__rateLimit = global.__rateLimit || {};
  const now = Date.now();

  if (!global.__rateLimit[ip]) global.__rateLimit[ip] = [];

  global.__rateLimit[ip] =
    global.__rateLimit[ip].filter(t => now - t < 60000);

  if (global.__rateLimit[ip].length >= 15) {
    return res.status(429).json({ success:false, error:"rate_limit", text:"" });
  }

  global.__rateLimit[ip].push(now);

  if (req.method !== "POST") {
    return res.status(405).json({ success:false, error:"Método inválido", text:"" });
  }

  try {

    // =========================
    // BODY SAFE
    // =========================
    let body;
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({ success:false, error:"invalid_json", text:"" });
    }

    let { prompt, context, tipo } = body;

    if (!prompt) {
      return res.status(400).json({ success:false, error:"prompt obrigatório", text:"" });
    }

    prompt = String(prompt).slice(0, 2000);

    const videos = Array.isArray(context?.videos)
      ? context.videos.slice(0, 20)
      : [];

    const parsedVideos = videos.map(v => ({
      title: v?.title || v?.snippet?.title || "",
      views: Number(v?.views || v?.statistics?.viewCount || 0),
      likes: Number(v?.statistics?.likeCount || 0),
      comments: Number(v?.statistics?.commentCount || 0),
      publishedAt: v?.publishedAt || v?.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((a,v)=>a+v.views,0);
    const avgViews = parsedVideos.length ? Math.round(totalViews/parsedVideos.length) : 0;

    const sorted = [...parsedVideos].sort((a,b)=>b.views - a.views);

    const topVideo = sorted[0] || { title:"N/A", views:0 };
    const worstVideo = sorted[sorted.length-1] || { title:"N/A", views:0 };

    const nowTime = Date.now();
    const last7 = parsedVideos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      if (isNaN(t)) return false;
      return (nowTime - t) <= (7*24*60*60*1000);
    });

    const uploads7 = last7.length;

    const videoSummary = parsedVideos.slice(0,5).map(v =>
      `- ${v.title} (${v.views} views)`
    ).join("\n");

    // =========================
    // 🔥 PROMPTS ORIGINAIS (NÃO ALTERADO)
    // =========================
    let finalPrompt = "";

    if (tipo === "tituloSEO" || tipo === "tituloImpactante" || tipo === "tituloEmocional") {

      finalPrompt = `
Crie 4 títulos curtos e altamente clicáveis.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    }

    else if (tipo === "descricao") {

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- SEO natural
- CTA leve

Base:
"${prompt}"
`;

    }

    else if (tipo === "ideas") {

      finalPrompt = `
Baseado nesses vídeos:

${videoSummary}

Crie 5 ideias novas.

Regras:
- não repetir
- máximo 12 palavras
- foco em viral
`;

    }

    else if (tipo === "strategy") {

      finalPrompt = `
Você é um especialista em crescimento no YouTube.

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

Gere:

1. 📈 PADRÃO DO CANAL
2. ❌ ERRO CRÍTICO
3. 🚀 ESTRATÉGIA DE ESCALA
4. 🎯 3 TÍTULOS PRONTOS

⚠️ Baseado apenas nos dados
`;

    }

    if (!finalPrompt) {
      finalPrompt = prompt;
    }

    // =========================
    // CACHE (INALTERADO)
    // =========================
    const stableKey = parsedVideos
      .slice(0,5)
      .map(v => (v.title||"").slice(0,30).toLowerCase().trim())
      .sort()
      .join("|");

    const cacheKey = `${tipo}_${prompt.slice(0,80)}_${stableKey}`;

    global.__tubexCache = global.__tubexCache || {};
    const cache = global.__tubexCache[cacheKey];

    if (cache && Date.now() - cache.timestamp < 1000*60*60*6) {
      return res.status(200).json({ success:true, text:cache.text });
    }

    // =========================
    // OPENAI
    // =========================
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
        error:"openai_error",
        text:""
      });
    }

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({
        success:false,
        error:"empty_response",
        text:""
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

    console.error("💥 ERROR FULL:", err);

    return res.status(500).json({
      success:false,
      error:"internal_error",
      text:""
    });
  }
}
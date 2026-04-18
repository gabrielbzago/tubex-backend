export default async function handler(req, res) {

  // ===============================
  // 🔐 CORS + AUTH (mantido)
  // ===============================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, authorization"
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ success:false, error:"unauthorized", text:"" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success:false, error:"Método inválido", text:"" });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let prompt = String(body?.prompt || "").slice(0, 2000);
    const context = body?.context || {};
    const videos = Array.isArray(context.videos) ? context.videos : [];

    if (!prompt) {
      return res.status(400).json({ success:false, error:"prompt obrigatório", text:"" });
    }

    // ======================================================
    // 🧠 DETECÇÃO DE TIPO (CORE DO SISTEMA)
    // ======================================================
    const lower = prompt.toLowerCase();

    const isTitulo = /título|titulo/.test(lower);
    const isDescricao = /descrição|descricao/.test(lower);
    const isAnalise = /analise|análise|estratégia|strategy|diagnosis/.test(lower);

    // ======================================================
    // 📊 PROCESSAMENTO DE VÍDEOS (SÓ SE PRECISAR)
    // ======================================================
    let parsedVideos = [];
    let avgViews = 0;
    let uploads7 = 0;
    let topVideo = {};
    let worstVideo = {};
    let videoSummary = "";

    if (isAnalise && videos.length >= 3) {

      parsedVideos = videos.slice(0, 20).map(v => ({
        title: v.title || v.snippet?.title || "",
        views: Number(v.views || v.statistics?.viewCount || 0),
        publishedAt: v.publishedAt || v.snippet?.publishedAt || ""
      }));

      const totalViews = parsedVideos.reduce((a,v)=>a+v.views,0);
      avgViews = parsedVideos.length ? Math.round(totalViews / parsedVideos.length) : 0;

      const sorted = [...parsedVideos].sort((a,b)=>b.views-a.views);
      topVideo = sorted[0] || {};
      worstVideo = sorted[sorted.length - 1] || {};

      const now = Date.now();
      uploads7 = parsedVideos.filter(v=>{
        const t = new Date(v.publishedAt).getTime();
        return (now - t) <= 7*24*60*60*1000;
      }).length;

      videoSummary = parsedVideos.slice(0,10)
        .map(v=>`- ${v.title} (${v.views} views)`)
        .join("\n");
    }

    // ======================================================
    // 🎯 PROMPT FINAL (SEPARADO POR TIPO)
    // ======================================================
    let finalPrompt = prompt;

    // 🔥 TÍTULO
    if (isTitulo) {
      finalPrompt = `
Crie 4 títulos curtos, altamente clicáveis e com forte SEO para YouTube.
Máximo 70 caracteres.

Base:
"${prompt}"
`;
    }

    // 🔥 DESCRIÇÃO
    else if (isDescricao) {
      finalPrompt = `
Crie uma descrição otimizada para SEO no YouTube.

Inclua:
- introdução forte
- palavras-chave naturais
- CTA leve
- até 2 hashtags

Base:
"${prompt}"
`;
    }

    // 🔥 ANÁLISE (USA CONTEXTO)
    else if (isAnalise && parsedVideos.length >= 3) {

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

📺 Vídeos:
${videoSummary}

========================
📌 INSTRUÇÕES
========================

Faça uma análise estratégica completa do canal.

Inclua:
- O que está funcionando
- O que está travando
- Padrões de vídeos bons
- Oportunidades reais

Seja direto e prático.
`;
    }

    // ======================================================
    // ⚡ CACHE
    // ======================================================
    const cacheKey = prompt.toLowerCase();

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if (cache && Date.now() - cache.timestamp < 1000*60*30) {
      return res.status(200).json({ success:true, text:cache.text });
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
          { role:"system", content:"Você é especialista em YouTube e SEO." },
          { role:"user", content: finalPrompt }
        ],
        temperature:0.5
      })
    });

    const data = await response.json();

    const text = String(data.choices?.[0]?.message?.content || "").trim();

    global.__tubexCache[cacheKey] = {
      text,
      timestamp: Date.now()
    };

    return res.status(200).json({
      success:true,
      text: text || "⚠ Sem resposta."
    });

  } catch (e) {

    console.error("💥 AI backend error:", e);

    return res.status(500).json({
      success:false,
      error:"Erro interno",
      text:""
    });
  }
}
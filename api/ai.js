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

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

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

    const videos = Array.isArray(context.videos) ? context.videos : [];

    if (!videos || videos.length < 3) {
      console.warn("⚠️ sem vídeos → IA sem contexto");
    }

    const parsedVideos = videos.slice(0, 20).map(v => ({
      title: v.title || v.snippet?.title || "",
      views: Number(v.views || v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      publishedAt: v.publishedAt || v.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((acc, v) => acc + v.views, 0);
    const avgViews = parsedVideos.length
      ? Math.round(totalViews / parsedVideos.length)
      : 0;

    const sorted = [...parsedVideos].sort((a,b)=>b.views - a.views);

    const topVideo = sorted[0] || {};
    const worstVideo = sorted[sorted.length - 1] || {};

    const now = Date.now();
    const last7 = parsedVideos.filter(v => {
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7 * 24 * 60 * 60 * 1000);
    });

    const uploads7 = last7.length;

    const videoSummary = parsedVideos.slice(0, 10).map(v => {
      return `- ${v.title} (${v.views} views)`;
    }).join("\n");

    // =========================================
    // 🧠 PROMPT CONTROLADO (CORREÇÃO REAL)
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

    // 🔥 SE NÃO FOR TÍTULO/DESCRIÇÃO → USA INTELLIGENCE NORMAL
    if(!finalPrompt){

      finalPrompt = `
${prompt}

========================
📊 DADOS REAIS DO CANAL
========================

Média de views: ${avgViews}
Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${topVideo?.title || "N/A"} (${topVideo?.views || 0} views)

⚠️ Pior vídeo:
${worstVideo?.title || "N/A"} (${worstVideo?.views || 0} views)

📺 Amostra de vídeos:
${videoSummary}

========================
📌 INSTRUÇÕES
========================

Faça uma análise PROFUNDA e prática do canal.

Inclua:
- O que está funcionando
- O que está travando crescimento
- Padrões de vídeos que performam melhor
- Erros estratégicos
- Oportunidades reais de crescimento
- Sugestões acionáveis (não genéricas)

Seja direto, estratégico e profissional.
`;

    }

    // ===============================
    // ⚡ CACHE
    // ===============================
    const cacheKey = parsedVideos.length >= 3
      ? parsedVideos.slice(0,5).map(v => v.title).join("|")
      : (tipo + "_" + prompt);

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if(cache && (Date.now() - cache.timestamp < 1000 * 60 * 30)){
      console.log("⚡ usando cache IA");
      return res.status(200).json({
        success: true,
        text: cache.text
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          {
            role:"system",
            content:"Você é um especialista em crescimento no YouTube, focado em SEO, retenção e viralização."
          },
          {
            role:"user",
            content: finalPrompt
          }
        ],
        temperature: 0.5
      })
    });

    const data = await response.json();

    const text = String(data.choices?.[0]?.message?.content || "").trim();

    global.__tubexCache[cacheKey] = {
      text,
      timestamp: Date.now()
    };

    return res.status(200).json({
      success: true,
      text: text || "📊 Continue melhorando consistência e títulos."
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
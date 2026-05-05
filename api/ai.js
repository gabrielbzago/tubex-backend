// ======================================================
// 🧠 TubeX AI ENGINE (PRO LEVEL)
// ======================================================

export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success:false, error:"method_not_allowed" });
  }

  try {

    let body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const email = body?.email;

    if (!email) {
      return res.status(401).json({ success:false, error:"unauthorized" });
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

    if (global.__tubexRate[email].length >= 6) {
      return res.status(429).json({ success:false, error:"rate_limit" });
    }

    global.__tubexRate[email].push(now);

    // ======================================================
    // 🧠 INPUT
    // ======================================================
    let { prompt, context, tipo } = body;

    const videos = Array.isArray(context?.videos) ? context.videos : [];

    const parsedVideos = videos.slice(0, 15).map(v => ({
      title: v.title || v.snippet?.title || "",
      views: Number(v.views || v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      publishedAt: v.publishedAt || v.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((a,v)=>a+v.views,0);
    const avgViews = parsedVideos.length ? Math.round(totalViews / parsedVideos.length) : 0;

    const sorted = [...parsedVideos].sort((a,b)=>b.views - a.views);

    const top = sorted[0] || {};
    const worst = sorted[sorted.length-1] || {};

    const nowTime = Date.now();
    const last7 = parsedVideos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (nowTime - t) <= 604800000;
    });

    const uploads7 = last7.length;

    // ======================================================
    // 🔥 SCORE REAL (SEM IA)
    // ======================================================
    let score = 50;

    if (avgViews > 1000) score += 10;
    if (avgViews > 5000) score += 10;
    if (uploads7 >= 2) score += 10;
    if (uploads7 >= 4) score += 10;

    if (top.views > avgViews * 2) score += 10;

    if (uploads7 === 0) score -= 15;

    score = Math.max(0, Math.min(100, score));

    // ======================================================
    // 🔥 PADRÃO VIRAL
    // ======================================================
    const viralPattern = parsedVideos
      .filter(v => v.views > avgViews * 1.8)
      .map(v => v.title)
      .slice(0, 3);

    const videoSummary = parsedVideos
      .slice(0,5)
      .map(v=>`- ${v.title} (${v.views})`)
      .join("\n");

    // ======================================================
    // 🧠 PROMPT ENGINE
    // ======================================================
    let finalPrompt = "";

    if (tipo === "strategy") {

      finalPrompt = `
Você é um especialista em crescimento no YouTube.

📊 DADOS REAIS:
- Média de views: ${avgViews}
- Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${top.title} (${top.views})

⚠️ Pior vídeo:
${worst.title} (${worst.views})

📺 Vídeos:
${videoSummary}

🔥 PADRÃO VIRAL:
${viralPattern.join("\n") || "Nenhum padrão claro"}

---

Gere:

1. 📈 PADRÃO DO CANAL
2. ❌ ERRO CRÍTICO
3. 🚀 ESTRATÉGIA DE CRESCIMENTO
4. 🎯 3 TÍTULOS PRONTOS

⚠️ Seja direto e específico.
`;

    } else {

      finalPrompt = prompt;
    }

    // ======================================================
    // ⚡ CACHE INTELIGENTE
    // ======================================================
    const stableKey = parsedVideos
      .slice(0,5)
      .map(v => (v.title || "").slice(0,30))
      .sort()
      .join("|");

    const cacheKey = `${tipo}_${stableKey}`;

    global.__tubexCache = global.__tubexCache || {};

    const cache = global.__tubexCache[cacheKey];

    if (cache && (Date.now() - cache.timestamp < 1000 * 60 * 60)) {
      return res.status(200).json({
        success:true,
        text: cache.text,
        score,
        pattern: viralPattern
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
          { role:"system", content:"Especialista em crescimento YouTube." },
          { role:"user", content: finalPrompt }
        ],
        temperature: 0.7,
        max_tokens: 900
      })
    });

    if (!response.ok) {
      return res.status(500).json({ success:false, error:"openai_error" });
    }

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({ success:false, error:"empty_ai_response" });
    }

    global.__tubexCache[cacheKey] = {
      text,
      timestamp: Date.now()
    };

    return res.status(200).json({
      success:true,
      text,
      score,
      pattern: viralPattern
    });

  } catch (err) {

    console.error("💥 ERROR:", err);

    return res.status(500).json({
      success:false,
      error:"internal_error"
    });
  }
}
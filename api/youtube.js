export default async function handler(req, res) {

  // 🔥 CORS TOTAL (EXTENSÃO PRECISA DISSO)
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // 🔥 PRE-FLIGHT (OBRIGATÓRIO)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 API KEY
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized",
      items: []
    });
  }

  // 🔒 MÉTODO
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      items: []
    });
  }

  try {

    // 🔥 PARSE SEGURO
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword?.trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword obrigatório",
        items: []
      });
    }

    // 🔑 MULTI API KEY (FAILOVER)
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let items = [];

    for (const key of keys) {
      try {

        // =========================
        // 🔍 1. SEARCH
        // =========================
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&type=video&maxResults=12` +
          `&q=${encodeURIComponent(keyword)}&key=${key}`;

        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json();

        if (!searchRes.ok || !Array.isArray(searchJson.items)) {
          continue;
        }

        const ids = searchJson.items
          .map(v => v.id?.videoId)
          .filter(Boolean)
          .join(",");

        if (!ids) continue;

        // =========================
        // 📊 2. VIDEOS (STATS)
        // =========================
        const videosUrl =
          `https://www.googleapis.com/youtube/v3/videos` +
          `?part=snippet,statistics&id=${ids}&key=${key}`;

        const videosRes = await fetch(videosUrl);
        const videosJson = await videosRes.json();

        if (videosRes.ok && Array.isArray(videosJson.items)) {
          items = videosJson.items;
          break;
        }

      } catch (e) {
        console.warn("Erro com key, tentando próxima...");
      }
    }

    // ======================================================
    // 🔥 MÉTRICAS
    // ======================================================

    let volume = 50;
    let competition = 50;

    if (items.length > 0) {

      const totalViews = items.reduce((acc, v) => {
        return acc + Number(v?.statistics?.viewCount || 0);
      }, 0);

      volume = Math.min(100, items.length * 8);

      const avgViews = totalViews / items.length || 0;

      if (avgViews > 1000000) competition = 90;
      else if (avgViews > 300000) competition = 75;
      else if (avgViews > 100000) competition = 60;
      else competition = 40;
    }

    // ======================================================
    // ✅ RESPOSTA CORRETA PRO FRONT (CRÍTICO)
    // ======================================================

    return res.status(200).json({
      success: true,
      items,          // 🔥 AGORA CORRETO
      volume,
      competition
    });

  } catch (e) {

    console.error("Erro YouTube API:", e);

    return res.status(500).json({
      success: false,
      error: "erro interno",
      items: []
    });

  }
}
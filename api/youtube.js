export default async function handler(req, res) {

  // 🔥 CORS TOTAL (EXTENSÃO PRECISA DISSO)
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // 🔥 PRE-FLIGHT
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
    let usedKey = null;

    // ======================================================
    // 🔥 BUSCA COM PAGINAÇÃO REAL (ATÉ 150 VÍDEOS)
    // ======================================================
    for (const key of keys) {

      try {

        let allIds = [];
        let nextPageToken = "";
        let pageCount = 0;

        while (pageCount < 3) { // 🔥 3 páginas = até 150 vídeos

          const searchUrl =
            `https://www.googleapis.com/youtube/v3/search` +
            `?part=snippet&type=video&maxResults=50` +
            `&q=${encodeURIComponent(keyword)}` +
            `&pageToken=${nextPageToken}` +
            `&key=${key}`;

          const searchRes = await fetch(searchUrl);
          const searchJson = await searchRes.json();

          if (!searchRes.ok || !Array.isArray(searchJson.items)) {
            break;
          }

          const ids = searchJson.items
            .map(v => v.id?.videoId)
            .filter(Boolean);

          allIds.push(...ids);

          nextPageToken = searchJson.nextPageToken || "";
          pageCount++;

          if (!nextPageToken) break;
        }

        // 🔥 REMOVE DUPLICADOS
        const uniqueIds = [...new Set(allIds)];

        if (!uniqueIds.length) continue;

        // ======================================================
        // 📊 BUSCAR STATS EM BLOCOS
        // ======================================================
        let allVideos = [];

        for (let i = 0; i < uniqueIds.length; i += 50) {

          const chunk = uniqueIds.slice(i, i + 50).join(",");

          const videosUrl =
            `https://www.googleapis.com/youtube/v3/videos` +
            `?part=snippet,statistics&id=${chunk}&key=${key}`;

          const videosRes = await fetch(videosUrl);
          const videosJson = await videosRes.json();

          if (videosRes.ok && Array.isArray(videosJson.items)) {
            allVideos.push(...videosJson.items);
          }

        }

        // 🔥 FILTRO FINAL (ANTI BUG)
        items = allVideos.filter(v =>
          v &&
          v.snippet &&
          v.statistics &&
          v.snippet.publishedAt
        );

        usedKey = key;

        if (items.length > 0) break;

      } catch (e) {
        console.warn("Erro com key, tentando próxima...");
      }
    }

    // ======================================================
    // 🔥 FALLBACK SEGURO
    // ======================================================
    if (!items.length) {
      return res.status(200).json({
        success: true,
        items: [],
        volume: 0,
        competition: 0
      });
    }

    // ======================================================
    // 🔥 ORDENAÇÃO INTELIGENTE (IMPORTANTE PRA TREND)
    // ======================================================
    items.sort((a, b) =>
      Number(b.statistics.viewCount || 0) -
      Number(a.statistics.viewCount || 0)
    );

    // ======================================================
    // 🔥 MÉTRICAS MELHORADAS
    // ======================================================
    const totalViews = items.reduce((acc, v) => {
      return acc + Number(v?.statistics?.viewCount || 0);
    }, 0);

    const avgViews = totalViews / items.length || 0;

    // 🔥 VOLUME MAIS REALISTA
    const volume = Math.min(100, Math.round(Math.log10(totalViews + 1) * 15));

    // 🔥 CONCORRÊNCIA MAIS INTELIGENTE
    let competition = 40;

    if (avgViews > 1000000) competition = 90;
    else if (avgViews > 500000) competition = 80;
    else if (avgViews > 200000) competition = 70;
    else if (avgViews > 100000) competition = 60;
    else if (avgViews > 50000) competition = 50;

    // ======================================================
    // ✅ RESPOSTA FINAL (100% COMPATÍVEL)
    // ======================================================
    return res.status(200).json({
      success: true,
      items,
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
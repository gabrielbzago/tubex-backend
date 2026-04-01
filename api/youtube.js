export default async function handler(req, res) {

  // 🔥 CORS FORÇADO
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // 🔥 preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 API KEY
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized",
      data: { items: [] }
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      data: { items: [] }
    });
  }

  try {

    // 🔥 parse body seguro
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword?.trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword obrigatório",
        data: { items: [] }
      });
    }

    // 🔑 múltiplas API keys (failover)
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let data = null;

    for (const key of keys) {
      try {

        const url =
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(keyword)}&key=${key}`;

        const r = await fetch(url);
        const j = await r.json();

        if (r.ok && Array.isArray(j.items)) {
          data = j;
          break;
        }

      } catch (e) {
        console.warn("Erro com key, tentando próxima...");
      }
    }

    const items = data?.items || [];

    // ======================================================
    // 🔥 MÉTRICAS SIMULADAS (não quebra frontend)
    // ======================================================

    let volume = 50;
    let competition = 50;

    if (items.length > 0) {

      const totalViews = items.reduce((acc, v) => {
        return acc + Number(v?.statistics?.viewCount || 0);
      }, 0);

      // volume baseado em quantidade de resultados
      volume = Math.min(100, items.length * 8);

      // competição baseada em média de views
      const avgViews = totalViews / items.length || 0;

      if (avgViews > 1000000) competition = 90;
      else if (avgViews > 300000) competition = 75;
      else if (avgViews > 100000) competition = 60;
      else competition = 40;

    }

    // ======================================================
    // ✅ RESPOSTA PADRÃO COMPATÍVEL COM FRONT
    // ======================================================

    return res.status(200).json({
      success: true,
      data: {
        items,
        volume,
        competition
      }
    });

  } catch (e) {

    console.error("Erro YouTube API:", e);

    return res.status(500).json({
      success: false,
      error: "erro interno",
      data: { items: [] }
    });

  }
}
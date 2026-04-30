export default async function handler(req, res) {

  // =========================
  // 🔥 CORS (EXTENSÃO)
  // =========================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // =========================
  // 🔐 API KEY
  // =========================
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword?.trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword_required"
      });
    }

    // =========================
    // 🔑 API KEY YOUTUBE
    // =========================
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .filter(Boolean);

    const key = keys[Math.floor(Math.random() * keys.length)];

    // =========================
    // 🔎 SEARCH (50 vídeos)
    // =========================
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(keyword)}&key=${key}`
    );

    const searchJson = await searchRes.json();

    const ids = searchJson.items
      ?.map(v => v.id.videoId)
      .filter(Boolean) || [];

    if (!ids.length) {
      return res.status(200).json({
        success: true,
        totalViews: 0,
        totalVideos: 0,
        avgViews: 0,
        topTags: []
      });
    }

    // =========================
    // 📊 DETAILS
    // =========================
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`
    );

    const videosJson = await videosRes.json();

    const items = videosJson.items || [];

    // =========================
    // 📈 MÉTRICAS
    // =========================
    let totalViews = 0;
    let tagsMap = {};

    items.forEach(v => {

      const views = Number(v.statistics?.viewCount || 0);
      totalViews += views;

      const tags = v.snippet?.tags || [];

      tags.forEach(tag => {
        tagsMap[tag] = (tagsMap[tag] || 0) + 1;
      });

    });

    const totalVideos = items.length;
    const avgViews = totalVideos ? Math.round(totalViews / totalVideos) : 0;

    // =========================
    // 🏷 TOP TAGS
    // =========================
    const topTags = Object.entries(tagsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    // =========================
    // ✅ RESPOSTA FINAL
    // =========================
    return res.status(200).json({
      success: true,
      totalViews,
      totalVideos,
      avgViews,
      topTags,
      items // opcional (mantém compatível com seu sistema atual)
    });

  } catch (e) {

    console.error("💥 SUMMARY ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
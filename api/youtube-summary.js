export default async function handler(req, res) {

  // =========================
  // 🔥 CORS
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
    // 🔎 1. BUSCAR CANAL
    // =========================
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(keyword)}&key=${key}`
    );

    const searchJson = await searchRes.json();

    const channelId = searchJson.items?.[0]?.id?.channelId;

    if (!channelId) {
      return res.status(200).json({
        success: false,
        error: "channel_not_found"
      });
    }

    // =========================
    // 📊 2. DADOS DO CANAL (REAL)
    // =========================
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${key}`
    );

    const channelJson = await channelRes.json();

    const stats = channelJson.items?.[0]?.statistics;

    if (!stats) {
      return res.status(200).json({
        success: false,
        error: "no_channel_stats"
      });
    }

    // =========================
    // ✅ RESPOSTA FINAL (SÓ O QUE IMPORTA)
    // =========================
    return res.status(200).json({
      success: true,
      channelId,
      totalViews: Number(stats.viewCount || 0),
      totalVideos: Number(stats.videoCount || 0),
      subscribers: Number(stats.subscriberCount || 0)
    });

  } catch (e) {

    console.error("💥 SUMMARY ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
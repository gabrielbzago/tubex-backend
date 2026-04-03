export default async function handler(req, res) {

  // ===============================
  // 🔥 CORS
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ===============================
  // 🔐 API KEY
  // ===============================
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized",
      data: { channel: null, videos: [] }
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      data: { channel: null, videos: [] }
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const channelId = body?.channelId;

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: "channelId obrigatório",
        data: { channel: null, videos: [] }
      });
    }

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let channel = null;
    let videos = [];

    for (const key of keys) {
      try {

        // ===============================
        // 📺 CHANNEL
        // ===============================
        const chRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

        const chJson = await chRes.json();

        if (!chJson.items?.length) continue;

        channel = chJson.items[0];

        const uploads =
          channel.contentDetails?.relatedPlaylists?.uploads;

        // ===============================
        // 🎥 PEGAR MAIS VÍDEOS (ATÉ 50)
        // ===============================
        const vidsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
        );

        const vidsJson = await vidsRes.json();

        const ids = vidsJson.items
          .map(v => v.contentDetails?.videoId)
          .filter(Boolean)
          .join(",");

        if (!ids) continue;

        // ===============================
        // 📊 STATS
        // ===============================
        const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`
        );

        const statsJson = await statsRes.json();

        videos = statsJson.items.map(v => ({
          ...v,
          title: v.snippet.title,
          views: Number(v.statistics.viewCount || 0),
          publishedAt: v.snippet.publishedAt
        }));

        break;

      } catch (e) {
        continue;
      }
    }

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: "Canal não encontrado",
        data: { channel: null, videos: [] }
      });
    }

    // ===============================
    // 🧠 MÉTRICAS INTELIGENTES
    // ===============================

    const totalViews = videos.reduce((acc,v)=>acc+v.views,0);
    const avgViews = Math.round(totalViews / Math.max(1,videos.length));

    const now = Date.now();

    const last7 = videos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7*24*60*60*1000);
    });

    const views7 = last7.reduce((acc,v)=>acc+v.views,0);

    const uploads7 = last7.length;

    // ===============================
    // 🚀 RESPONSE FINAL (UPGRADE)
    // ===============================

    return res.status(200).json({
      success: true,
      data: {
        channel,
        videos,

        // 🔥 NOVO (NÃO QUEBRA NADA)
        metrics: {
          totalViews,
          avgViews,
          views7,
          uploads7
        }
      }
    });

  } catch (e) {

    return res.status(500).json({
      success: false,
      error: "erro interno",
      data: { channel: null, videos: [] }
    });

  }
}
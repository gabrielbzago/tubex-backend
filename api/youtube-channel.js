export default async function handler(req, res) {

  // ======================================================
  // 🔥 CORS
  // ======================================================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ======================================================
  // 🔐 API KEY
  // ======================================================
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(200).json({
      success: false,
      error: "unauthorized",
      items: [],
      data: { channel: null, videos: [] }
    });
  }

  if (req.method !== "POST") {
    return res.status(200).json({
      success: false,
      error: "invalid_method",
      items: [],
      data: { channel: null, videos: [] }
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const channelId = body?.channelId;
    const keyword = body?.keyword || "";

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let channel = null;
    let videos = [];

    // ======================================================
    // 🔥 FUNÇÃO UNIVERSAL DE FETCH
    // ======================================================
    const fetchVideosFromIds = async (ids, key) => {
      if (!ids) return [];

      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`
      );

      const statsJson = await statsRes.json();

      if (!statsRes.ok || !Array.isArray(statsJson.items)) return [];

      return statsJson.items.map(v => ({
        ...v,
        title: v.snippet?.title || "",
        views: Number(v.statistics?.viewCount || 0),
        publishedAt: v.snippet?.publishedAt || ""
      }));
    };

    // ======================================================
    // 🎯 PRIORIDADE 1: CHANNEL
    // ======================================================
    if (channelId) {

      for (const key of keys) {
        try {

          const chRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
          );

          const chJson = await chRes.json();

          if (!chJson.items?.length) continue;

          channel = chJson.items[0];

          const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
          if (!uploads) continue;

          const vidsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
          );

          const vidsJson = await vidsRes.json();

          const ids = (vidsJson.items || [])
            .map(v => v.contentDetails?.videoId)
            .filter(Boolean)
            .join(",");

          videos = await fetchVideosFromIds(ids, key);

          if (videos.length) break;

        } catch {}
      }
    }

    // ======================================================
    // 🔁 FALLBACK: KEYWORD (SE NÃO TEM VÍDEOS)
    // ======================================================
    if (videos.length < 3 && keyword) {

      console.warn("⚠️ fallback por keyword:", keyword);

      for (const key of keys) {
        try {

          const searchRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(keyword)}&key=${key}`
          );

          const searchJson = await searchRes.json();

          const ids = (searchJson.items || [])
            .map(v => v.id?.videoId)
            .filter(Boolean)
            .join(",");

          const fallbackVideos = await fetchVideosFromIds(ids, key);

          if (fallbackVideos.length) {
            videos = fallbackVideos;
            break;
          }

        } catch {}
      }
    }

    // ======================================================
    // 🧠 MÉTRICAS
    // ======================================================
    const totalViews = videos.reduce((acc,v)=>acc+v.views,0);
    const avgViews = Math.round(totalViews / Math.max(1,videos.length));

    const now = Date.now();

    const last7 = videos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7*24*60*60*1000);
    });

    const views7 = last7.reduce((acc,v)=>acc+v.views,0);
    const uploads7 = last7.length;

    // ======================================================
    // 🚀 RESPONSE FINAL (PADRÃO PERFEITO)
    // ======================================================
    return res.status(200).json({
      success: true,
      items: videos, // 🔥 SEMPRE PADRÃO
      data: {
        channel,
        videos,
        metrics: {
          totalViews,
          avgViews,
          views7,
          uploads7
        }
      }
    });

  } catch (e) {

    console.error("💥 BACKEND ERROR:", e);

    return res.status(200).json({
      success: false,
      error: "internal_error",
      items: [],
      data: { channel: null, videos: [] }
    });

  }
}
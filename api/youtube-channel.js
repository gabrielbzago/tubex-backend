export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success:false,
      error:"unauthorized",
      data:{ channel:null, videos:[] }
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success:false,
      error:"Método não permitido",
      data:{ channel:null, videos:[] }
    });
  }

  try {

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const channelId = body?.channelId?.trim();

    if (!channelId) {
      return res.status(400).json({
        success:false,
        error:"channelId obrigatório",
        data:{ channel:null, videos:[] }
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

        // 📺 CANAL
        const channelRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

        const channelJson = await channelRes.json();

        if (!channelRes.ok || !channelJson.items?.length) continue;

        channel = channelJson.items[0];

        const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsId) continue;

        // 🎥 PLAYLIST
        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=20&key=${key}`
        );

        const playlistJson = await playlistRes.json();

        const ids = (playlistJson.items || [])
          .map(v => v.contentDetails?.videoId)
          .filter(Boolean)
          .join(",");

        if (!ids) continue;

        // 📊 VIDEOS
        const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`
        );

        const statsJson = await statsRes.json();

        if (!statsRes.ok || !Array.isArray(statsJson.items)) continue;

        // 🔥 NORMALIZAÇÃO (CRÍTICO)
        videos = statsJson.items.map(v => ({
          id: v.id,
          title: v.snippet?.title || "",
          views: Number(v.statistics?.viewCount || 0),
          publishedAt: v.snippet?.publishedAt || ""
        }));

        break;

      } catch (e) {
        console.warn("Erro key:", e.message);
        continue;
      }
    }

    if (!channel) {
      return res.status(404).json({
        success:false,
        error:"Canal não encontrado",
        data:{ channel:null, videos:[] }
      });
    }

    return res.status(200).json({
      success:true,
      data:{
        channel,
        videos
      }
    });

  } catch (e) {

    console.error("Erro geral:", e);

    return res.status(500).json({
      success:false,
      error:"erro interno",
      data:{ channel:null, videos:[] }
    });

  }
}
export default async function handler(req, res) {

  // ===============================
  // 🔥 CORS TOTAL (ROBUSTO)
  // ===============================
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

  // ===============================
  // 🔐 API KEY
  // ===============================
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== process.env.API_KEY) {
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

    // ===============================
    // 🔥 PARSE BODY (SEGURO)
    // ===============================
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({
        success: false,
        error: "JSON inválido",
        data: { channel: null, videos: [] }
      });
    }

    const channelId = body?.channelId?.trim();

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: "channelId obrigatório",
        data: { channel: null, videos: [] }
      });
    }

    // ===============================
    // 🔑 MULTI API KEY (FAILOVER REAL)
    // ===============================
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    if (!keys.length) {
      return res.status(500).json({
        success: false,
        error: "YOUTUBE_API_KEY não configurada",
        data: { channel: null, videos: [] }
      });
    }

    let channel = null;
    let videos = [];

    // ===============================
    // 🔁 LOOP DE KEYS (CORRIGIDO)
    // ===============================
    for (const key of keys) {
      try {

        // ============================
        // 📺 1. CHANNEL
        // ============================
        const channelUrl =
          `https://www.googleapis.com/youtube/v3/channels` +
          `?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`;

        const channelRes = await fetch(channelUrl);
        const channelJson = await channelRes.json();

        if (!channelRes.ok || !channelJson.items?.length) {
          console.warn("Falha ao buscar canal com key");
          continue; // 🔥 IMPORTANTE (não break)
        }

        channel = channelJson.items[0];

        const uploadsPlaylistId =
          channel.contentDetails?.relatedPlaylists?.uploads;

        if (!uploadsPlaylistId) {
          console.warn("Canal sem playlist uploads");
          break;
        }

        // ============================
        // 🎥 2. PLAYLIST ITEMS
        // ============================
        const videosUrl =
          `https://www.googleapis.com/youtube/v3/playlistItems` +
          `?part=snippet,contentDetails` +
          `&playlistId=${uploadsPlaylistId}` +
          `&maxResults=20&key=${key}`;

        const videosRes = await fetch(videosUrl);
        const videosJson = await videosRes.json();

        if (!videosRes.ok || !Array.isArray(videosJson.items)) {
          console.warn("Erro playlistItems");
          continue;
        }

        const ids = videosJson.items
          .map(v => v.contentDetails?.videoId)
          .filter(Boolean)
          .join(",");

        if (!ids) {
          console.warn("Nenhum videoId encontrado");
          continue;
        }

        // ============================
        // 📊 3. VIDEOS STATS
        // ============================
        const statsUrl =
          `https://www.googleapis.com/youtube/v3/videos` +
          `?part=snippet,statistics&id=${ids}&key=${key}`;

        const statsRes = await fetch(statsUrl);
        const statsJson = await statsRes.json();

        if (statsRes.ok && Array.isArray(statsJson.items)) {
          videos = statsJson.items;
          break; // ✅ sucesso → sai do loop
        }

      } catch (e) {
        console.warn("Erro com key:", e.message);
        continue;
      }
    }

    // ===============================
    // 🚨 FALLBACK FINAL
    // ===============================
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: "Canal não encontrado",
        data: { channel: null, videos: [] }
      });
    }

    // ===============================
    // 🚀 RESPOSTA FINAL (PADRÃO FIXO)
    // ===============================
    return res.status(200).json({
      success: true,
      data: {
        channel,
        videos
      }
    });

  } catch (e) {

    console.error("Erro geral API:", e);

    return res.status(500).json({
      success: false,
      error: "erro interno",
      data: { channel: null, videos: [] }
    });

  }
}
export default async function handler(req, res) {

  // 🔥 CORS TOTAL
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
      items: []
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      items: []
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const channelId = body?.channelId?.trim();

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: "channelId obrigatório",
        items: []
      });
    }

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let items = [];

    for (const key of keys) {
      try {

        const url =
          `https://www.googleapis.com/youtube/v3/channels` +
          `?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`;

        const r = await fetch(url);
        const j = await r.json();

        if (r.ok && Array.isArray(j.items)) {
          items = j.items;
          break;
        }

      } catch (e) {
        console.warn("erro key, tentando próxima...");
      }
    }

    return res.status(200).json({
      success: true,
      items
    });

  } catch (e) {

    console.error("Erro channel API:", e);

    return res.status(500).json({
      success: false,
      error: "erro interno",
      items: []
    });

  }
}
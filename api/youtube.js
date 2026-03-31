export default async function handler(req, res) {

  // 🔥 CORS FORÇADO (funciona sempre)
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // 🔥 resposta imediata pro preflight
  if (req.method === "OPTIONS") {
    return res.status(200).json({});
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

    const { keyword } = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword obrigatório",
        items: []
      });
    }

    const keys = process.env.YOUTUBE_API_KEY
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let data = null;

    for (const key of keys) {
      try {
        const url =
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(keyword)}&key=${key}`;

        const r = await fetch(url);
        const j = await r.json();

        if (r.ok && Array.isArray(j.items)) {
          data = j;
          break;
        }

      } catch {}
    }

    return res.status(200).json({
      success: true,
      items: data?.items || []
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "erro interno",
      items: []
    });
  }
}
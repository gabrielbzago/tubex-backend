export default async function handler(req, res) {

  // 🔐 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 API KEY
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    // 🔥 BODY SAFE
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword;

    if (!keyword) {
      return res.status(400).json({ success: false });
    }

    // 🔥 CLUSTER DE KEYS (DO ENV)
    const keys = process.env.YT_API_KEYS.split(",");

    let data = null;
    let lastError = null;

    for (const key of keys) {

      try {

        const url =
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&maxResults=15&type=video&key=${key}`;

        const response = await fetch(url);

        const json = await response.json();

        if (json.items) {
          data = json;
          break;
        }

        lastError = json;

      } catch (err) {
        lastError = err;
      }

    }

    if (!data) {
      throw new Error("Todas as keys falharam");
    }

    return res.status(200).json({
      success: true,
      items: data.items || []
    });

  } catch (e) {

    console.error("YT backend error:", e);

    return res.status(500).json({
      success: false,
      items: []
    });

  }

}
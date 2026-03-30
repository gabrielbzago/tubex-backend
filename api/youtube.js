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

  if (apiKey !== process.env.API_KEY) {
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
      return res.status(400).json({
        success: false,
        error: "keyword obrigatório",
        items: []
      });
    }

    // 🔥 VALIDA ENV
    if (!process.env.YOUTUBE_API_KEY) {
      console.error("❌ YOUTUBE_API_KEY não definida");
      return res.status(500).json({
        success: false,
        error: "API key do YouTube não configurada",
        items: []
      });
    }

    // 🔥 CLUSTER DE KEYS (CORRETO)
    const keys = process.env.YOUTUBE_API_KEY
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let data = null;
    let lastError = null;

    // 🔁 LOOP NAS KEYS
    for (const key of keys) {
      try {

        console.log("🔑 TESTANDO KEY:", key);

        const url =
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&maxResults=15&type=video&key=${key}`;

        const response = await fetch(url);
        const json = await response.json();

        if (response.ok && json.items) {
          data = json;
          break;
        }

        // 🔴 LOG DETALHADO
        console.error("❌ KEY FALHOU:", key);
        console.error("STATUS:", response.status);
        console.error("ERRO:", json?.error?.message);

        lastError = json;

      } catch (err) {
        console.error("❌ ERRO NA KEY:", key, err);
        lastError = err;
      }
    }

    // 🚨 SE TODAS KEYS FALHAREM (AGORA CORRETO FORA DO LOOP)
    if (!data) {
      return res.status(200).json({
        success: false,
        error: lastError || "Todas as keys falharam",
        items: []
      });
    }

    // ✅ SUCESSO
    return res.status(200).json({
      success: true,
      items: data.items || [],
      pageInfo: data.pageInfo || {}
    });

  } catch (e) {

    console.error("YT backend error:", e);

    return res.status(500).json({
      success: false,
      error: "Erro interno no servidor",
      items: []
    });

  }

}
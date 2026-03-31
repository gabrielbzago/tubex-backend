export default async function handler(req, res) {

  // 🔐 CORS (CORRIGIDO PRA EXTENSÃO)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 API KEY
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== process.env.API_KEY) {
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

    // 🔥 BODY SAFE
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          success: false,
          error: "JSON inválido",
          items: []
        });
      }
    }

    const keyword = body?.keyword;

    if (!keyword || typeof keyword !== "string") {
      return res.status(400).json({
        success: false,
        error: "keyword obrigatório",
        items: []
      });
    }

    // 🔥 ENV CHECK
    if (!process.env.YOUTUBE_API_KEY) {
      console.error("❌ YOUTUBE_API_KEY não definida");
      return res.status(500).json({
        success: false,
        error: "API key do YouTube não configurada",
        items: []
      });
    }

    // 🔥 CLUSTER DE KEYS
    const keys = process.env.YOUTUBE_API_KEY
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Nenhuma API key válida",
        items: []
      });
    }

    let finalData = null;
    let lastError = null;

    // 🔁 LOOP NAS KEYS
    for (const key of keys) {
      try {

        const url =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(keyword)}&key=${key}`;

        const response = await fetch(url);
        const json = await response.json();

        if (response.ok && Array.isArray(json.items)) {
          finalData = json;
          break;
        }

        lastError = json;

      } catch (err) {
        lastError = err;
      }
    }

    // 🚨 TODAS FALHARAM
    if (!finalData) {
      return res.status(200).json({
        success: false,
        error: lastError?.error?.message || "Todas as keys falharam",
        items: []
      });
    }

    // ✅ SUCESSO GARANTIDO
    return res.status(200).json({
      success: true,
      items: finalData.items || [],
      pageInfo: finalData.pageInfo || { totalResults: 0 }
    });

  } catch (error) {

    console.error("🔥 ERRO GERAL:", error);

    return res.status(500).json({
      success: false,
      error: "Erro interno no servidor",
      items: []
    });
  }
}

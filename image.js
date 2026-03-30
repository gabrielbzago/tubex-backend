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

    let { prompt, quantidade } = body || {};

    if (!prompt) {
      return res.status(400).json({ success: false, error: "prompt obrigatório" });
    }

    // 🔒 limitar quantidade (segurança + custo)
    quantidade = Math.min(Math.max(parseInt(quantidade || 1), 1), 4);

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1536x1024",
        n: quantidade
      })
    });

    const data = await response.json();

    // 🚨 tratamento real de erro
    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({
        success: false,
        error: data?.error?.message || "Erro ao gerar imagem"
      });
    }

    return res.status(200).json({
      success: true,
      images: data.data || []
    });

  } catch (e) {

    console.error("Image API error:", e);

    return res.status(500).json({
      success: false,
      error: "Erro interno"
    });

  }
}
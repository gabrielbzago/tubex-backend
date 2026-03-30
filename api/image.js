export default async function handler(req, res) {

  // 🔐 BLOQUEIO API
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    const { prompt, quantidade } = req.body;

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

    return res.status(200).json({
      success: true,
      images: data.data || []
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
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

    let prompt = body?.prompt;

    if (!prompt) {
      return res.status(400).json({ success: false, error: "prompt obrigatório" });
    }

    // 🔒 limitar tamanho (proteção custo)
    prompt = String(prompt).slice(0, 2000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você é especialista em crescimento no YouTube e SEO." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4
      })
    });

    const data = await response.json();

    // 🚨 tratamento real de erro
    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({
        success: false,
        error: data?.error?.message || "Erro na IA"
      });
    }

    return res.status(200).json({
      success: true,
      text: data.choices?.[0]?.message?.content || ""
    });

  } catch (e) {

    console.error("AI backend error:", e);

    return res.status(500).json({
      success: false,
      error: "Erro interno"
    });

  }
}
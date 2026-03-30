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

    const { keyword } = req.body;

    const urlTemplate =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&maxResults=15&type=video&key=__KEY__`;

    const data = await fetchWithCluster(urlTemplate);

    return res.status(200).json({
      success: true,
      items: data.items || []
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
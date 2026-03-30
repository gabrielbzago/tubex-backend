let apiKeys = process.env.YOUTUBE_API_KEYS.split(",");

let currentIndex = 0;

function getNextKey() {
  const key = apiKeys[currentIndex];
  currentIndex = (currentIndex + 1) % apiKeys.length;
  return key;
}

async function fetchWithCluster(urlTemplate) {

  for (let i = 0; i < apiKeys.length; i++) {

    const apiKey = getNextKey();
    const url = urlTemplate.replace("__KEY__", apiKey);

    const res = await fetch(url);
    const data = await res.json();

    if (data?.error?.errors?.[0]?.reason === "quotaExceeded") {
      console.log("⚠️ quotaExceeded → tentando próxima key");
      continue;
    }

    return data;
  }

  throw new Error("Todas as keys falharam");
}

export default async function handler(req, res) {

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
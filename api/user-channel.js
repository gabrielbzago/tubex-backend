export default async function handler(req, res) {

  try {

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Token ausente" });
    }

    // 🔥 YOUTUBE API (CANAL DO USUÁRIO)
    const r = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await r.json();

    const channelId = data?.items?.[0]?.id;

    if (!channelId) {
      return res.status(404).json({ error: "Canal não encontrado" });
    }

    res.json({ success: true, channelId });

  } catch (e) {

    console.error("user-channel error:", e);

    res.status(500).json({ error: "Erro interno" });
  }
}
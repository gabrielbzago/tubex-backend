export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    const { email } = req.body;

    const url = `${process.env.SHEETS_URL}?email=${encodeURIComponent(email)}`;

    const response = await fetch(url);
    const data = await response.json();

    return res.status(200).json({
      success: true,
      plan: data.plano || "free"
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
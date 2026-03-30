export default async function handler(req, res){

  if(req.method !== "POST"){
    return res.status(405).json({ error: "Método não permitido" });
  }

  try{

    // 🔐 PROTEÇÃO
    const apiKey = req.headers["x-api-key"];

    if(apiKey !== process.env.INTERNAL_API_KEY){
      return res.status(403).json({ error: "unauthorized" });
    }

    let { email } = req.body;

    if(!email){
      return res.status(400).json({ plan: "free" });
    }

    // 🔧 NORMALIZA EMAIL
    email = email.toLowerCase().trim();

    const url = `${process.env.SHEETS_URL}?email=${encodeURIComponent(email)}`;

    // ⏱️ TIMEOUT PROTECTION
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if(!response.ok){
      throw new Error("Erro ao consultar planilha");
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      plan: data?.plano || "free"
    });

  }catch(e){

    console.error("Erro plano:", e);

    return res.status(500).json({
      success: false,
      plan: "free"
    });

  }

}
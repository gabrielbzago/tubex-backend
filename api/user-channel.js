export default async function handler(req, res){

  // ===============================
  // 🔥 CORS
  // ===============================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ===============================
  // 🔐 API KEY
  // ===============================
  const apiKey = req.headers["x-api-key"];

  if(apiKey !== process.env.INTERNAL_API_KEY){
    return res.status(403).json({
      success:false,
      error:"unauthorized",
      channelId:null
    });
  }

  if(req.method !== "POST"){
    return res.status(405).json({
      success:false,
      error:"Método não permitido",
      channelId:null
    });
  }

  try{

    // ===============================
    // 🔥 BODY SAFE
    // ===============================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let email = body?.email;

    if(!email){
      return res.status(400).json({
        success:false,
        error:"email obrigatório",
        channelId:null
      });
    }

    email = email.toLowerCase().trim();

    // ===============================
    // 🔥 BUSCAR NA PLANILHA
    // ===============================
    const url = `${process.env.SHEETS_URL}?email=${encodeURIComponent(email)}`;

    const response = await fetch(url);
    const data = await response.json();

    const channelId = data?.channelId;

    if(!channelId){
      return res.status(404).json({
        success:false,
        error:"Canal não encontrado",
        channelId:null
      });
    }

    return res.status(200).json({
      success:true,
      channelId
    });

  }catch(e){

    console.error("user-channel error:", e);

    return res.status(500).json({
      success:false,
      error:"Erro interno",
      channelId:null
    });

  }

}
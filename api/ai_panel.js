export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { tipo, prompt } = body;

    if (!prompt) {
      return res.status(400).json({ success:false });
    }

    let finalPrompt = "";

    const t = String(tipo || "").toLowerCase();

    // =========================
    // 🎯 TITULO IMPACTANTE
    // =========================
    if (t === "titulo-impactante") {

      finalPrompt = `
Crie 4 títulos EXTREMAMENTE chamativos para YouTube.
Foco em clique (CTR alto).

Base:
"${prompt}"
`;

    }

    // =========================
    // 🔍 TITULO SEO
    // =========================
    else if (t === "titulo-seo") {

      finalPrompt = `
Crie 4 títulos otimizados para SEO no YouTube.
Foco em palavras-chave e busca.

Base:
"${prompt}"
`;

    }

    // =========================
    // 😱 TITULO EMOCIONAL
    // =========================
    else if (t === "titulo-emocional") {

      finalPrompt = `
Crie 4 títulos emocionais e curiosos.
Use gatilhos mentais.

Base:
"${prompt}"
`;

    }

    // =========================
    // 📝 DESCRIÇÃO
    // =========================
    else if (t === "descricao") {

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

- SEO natural
- CTA leve
- retenção alta

Base:
"${prompt}"
`;

    }

    // =========================
    // 🎬 ROTEIRO
    // =========================
    else if (t === "roteiro") {

      finalPrompt = `
Crie um roteiro de vídeo para YouTube.

- abertura forte
- desenvolvimento
- CTA final

Base:
"${prompt}"
`;

    }

    else {
      return res.status(400).json({
        success:false,
        error:"tipo inválido"
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          { role:"system", content:"Você é especialista em YouTube e crescimento de canais." },
          { role:"user", content: finalPrompt }
        ],
        temperature:0.7
      })
    });

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content || "";

    return res.status(200).json({
      success:true,
      text
    });

  } catch (e) {

    return res.status(500).json({
      success:false
    });

  }
}
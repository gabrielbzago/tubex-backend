export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ success:false });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { tipo, prompt } = body;

    if (!prompt) {
      return res.status(400).json({
        success:false,
        error:"prompt obrigatório"
      });
    }

    let finalPrompt = "";

    // =========================
    // 🎯 TÍTULOS
    // =========================
    if (tipo === "tituloSEO") {

      finalPrompt = `
Crie 4 títulos curtos, altamente clicáveis para YouTube.
Máx 70 caracteres.

Base:
"${prompt}"
`;

    }

    // =========================
    // 📝 DESCRIÇÃO
    // =========================
    else if (tipo === "descricao") {

      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- palavras-chave naturais
- CTA leve
- até 2 hashtags

Base:
"${prompt}"
`;

    } else {

      return res.status(400).json({
        success:false,
        error:"tipo inválido"
      });

    }

    // =========================
    // 🤖 OPENAI
    // =========================
   const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model:"gpt-4o-mini",
    messages:[
      { role:"system", content:"Você é especialista em YouTube e SEO." },
      { role:"user", content: finalPrompt }
    ],
    temperature:0.6
  })
});

// 🚨 erro OpenAI
if (!response.ok) {
  const errorText = await response.text();
  console.error("💥 OPENAI ERROR:", errorText);

  return res.status(500).json({
    success:false,
    error:"openai_error",
    message:errorText
  });
}

// 🔒 parse seguro
let data;

try {
  data = await response.json();
} catch (e) {
  console.error("💥 JSON PARSE ERROR:", e);

  return res.status(500).json({
    success:false,
    error:"invalid_json_openai"
  });
}

console.log("🧠 OPENAI RAW:", data);

// 🧠 extração blindada
let text = data?.choices?.[0]?.message?.content;

if (Array.isArray(text)) {
  text = text.map(t => t?.text || "").join(" ");
}

text = String(text || "").trim();

// 🚫 resposta vazia
if (!text) {
  return res.status(500).json({
    success:false,
    error:"empty_ai_response"
  });
}

// ✅ sucesso
return res.status(200).json({
  success:true,
  text
});

  } catch (e) {

    console.error(e);

    return res.status(500).json({
      success:false,
      error:"erro interno"
    });

  }
}
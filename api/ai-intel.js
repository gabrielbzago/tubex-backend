import express from "express";
import cors from "cors";

const app = express();

// ======================================================
// ⚙️ CONFIG
// ======================================================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================================================
// 🧱 MIDDLEWARE
// ======================================================
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req,res,next)=>{
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// ======================================================
// 🔒 AUTH
// ======================================================
function auth(req,res,next){

  const key = req.headers["x-api-key"];

  if(!key || key !== API_KEY){
    return res.status(401).json({
      success:false,
      error:"unauthorized"
    });
  }

  next();
}

app.use("/api/ai", auth);

// ======================================================
// 🧠 CORE AI
// ======================================================
async function callAI(prompt){

  try{

    const res = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          {
            role:"system",
            content:"Especialista em crescimento no YouTube. Direto, prático e estratégico."
          },
          {
            role:"user",
            content: prompt
          }
        ],
        temperature:0.7
      })
    });

    if(!res.ok){
      const err = await res.text();
      console.error("🚨 OpenAI ERROR:", err);
      return null;
    }

    const data = await res.json();

    return data?.choices?.[0]?.message?.content || null;

  }catch(e){
    console.error("💥 AI FAIL:", e);
    return null;
  }
}

// ======================================================
// 🧰 HELPERS
// ======================================================
function getTitles(videos = []){

  return videos
    .slice(0, 15)
    .map(v => v?.snippet?.title || v?.title || "")
    .filter(Boolean)
    .join("\n");
}

function safeResponse(res, field, text){

  if(!text || text.length < 20){
    return res.json({
      success:false,
      error:"ai_empty"
    });
  }

  return res.json({
    success:true,
    [field]: text
  });
}

// ======================================================
// 🎯 STRATEGY
// ======================================================
app.post("/api/ai/strategy", async (req,res)=>{

  const { videos = [], stats = {} } = req.body;

  const prompt = `
Analise este canal:

Inscritos: ${stats.subscribers || 0}
Views: ${stats.views || 0}

Títulos:
${getTitles(videos)}

Responda:

### ✔ O que funciona
### ⚠ Problemas
### 🎯 Estratégia de crescimento
`;

  const text = await callAI(prompt);

  return safeResponse(res,"strategy",text);
});

// ======================================================
// 🧠 DIAGNOSIS
// ======================================================
app.post("/api/ai/diagnosis", async (req,res)=>{

  const { stats = {} } = req.body;

  const prompt = `
Diagnostique este canal:

Inscritos: ${stats.subscribers || 0}
Views: ${stats.views || 0}
Uploads: ${stats.uploads7 || 0}

Responda:

### ✔ Pontos fortes
### ⚠ Problemas
### 🎯 Ações práticas
`;

  const text = await callAI(prompt);

  return safeResponse(res,"diagnosis",text);
});

// ======================================================
// 💡 VIDEO IDEAS
// ======================================================
app.post("/api/ai/video-ideas", async (req,res)=>{

  const { videos = [] } = req.body;

  const prompt = `
Baseado nesses vídeos:

${getTitles(videos)}

Gere 5 ideias virais no mesmo estilo.
`;

  const text = await callAI(prompt);

  return safeResponse(res,"ideas",text);
});

// ======================================================
// 🚀 OPPORTUNITY
// ======================================================
app.post("/api/ai/opportunity", async (req,res)=>{

  const { videos = [] } = req.body;

  const prompt = `
Com base nesses vídeos:

${getTitles(videos)}

Sugira:

1 ideia com alto potencial viral + explicação.
`;

  const text = await callAI(prompt);

  return safeResponse(res,"opportunity",text);
});

// ======================================================
// 🔎 NICHE DETECTION
// ======================================================
app.post("/api/ai/niche", async (req,res)=>{

  const { videos = [] } = req.body;

  const prompt = `
Analise:

${getTitles(videos)}

Identifique:

✔ Nicho principal
✔ Subnicho
✔ Público
`;

  const text = await callAI(prompt);

  return safeResponse(res,"niche",text);
});

// ======================================================
// 🧠 AI COACH
// ======================================================
app.post("/api/ai/coach", async (req,res)=>{

  const { question = "" } = req.body;

  if(!question){
    return res.json({
      success:false,
      error:"empty_question"
    });
  }

  const prompt = `
Você é um coach de YouTube.

Pergunta:
${question}

Responda de forma prática.
`;

  const text = await callAI(prompt);

  return safeResponse(res,"answer",text);
});

// ======================================================
app.listen(PORT, ()=>{
  console.log(`🚀 AI SERVER RUNNING ON ${PORT}`);
});
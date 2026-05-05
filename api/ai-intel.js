// ======================================================
// 🚀 TubeX AI SERVER (SAFE PRODUCTION)
// ======================================================

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================================================
// 🌐 CORS CONTROLADO
// ======================================================
app.use(cors({
  origin: true,
  methods: ["POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

// ======================================================
// 🔥 RATE LIMIT GLOBAL
// ======================================================
global.__tubexRate = global.__tubexRate || {};

// ======================================================
// 🔒 MIDDLEWARE SEGURANÇA
// ======================================================
function secure(req, res, next){

  const email = req.body?.email;

  if (!email || typeof email !== "string") {
    return res.status(401).json({
      success:false,
      error:"unauthorized"
    });
  }

  const now = Date.now();

  if (!global.__tubexRate[email]) {
    global.__tubexRate[email] = [];
  }

  global.__tubexRate[email] =
    global.__tubexRate[email].filter(t => now - t < 60000);

  if (global.__tubexRate[email].length >= 10) {
    return res.status(429).json({
      success:false,
      error:"rate_limit"
    });
  }

  global.__tubexRate[email].push(now);

  next();
}

// ======================================================
// 🤖 IA CORE (SAFE)
// ======================================================
async function callAI(prompt){

  if (!OPENAI_KEY) return null;

  try{

    const res = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${OPENAI_KEY}`
      },
      body:JSON.stringify({
        model:"gpt-4o-mini",
        temperature:0.6,
        max_tokens:500,
        messages:[
          { role:"system", content:"Especialista em crescimento no YouTube." },
          { role:"user", content: prompt.slice(0,500) }
        ]
      })
    });

    if(!res.ok){
      console.error("💥 OPENAI FAIL:", await res.text());
      return null;
    }

    const data = await res.json();

    return data?.choices?.[0]?.message?.content?.trim() || null;

  }catch(e){
    console.error("AI ERROR", e);
    return null;
  }
}

// ======================================================
// 📊 ANALYTICS (SEM IA)
// ======================================================
function analyzeChannel(stats, videos){

  const subs = Number(stats.subscribers || 0);
  const avg = Number(stats.avg || 0);
  const uploads7 = Number(stats.uploads7 || 0);
  const views7 = Number(stats.views7 || 0);

  const consistency = Math.min(10, uploads7 * 2);
  const performance = subs > 0 ? Math.min(10, (avg / subs) * 10) : 0;
  const growth = subs > 0 ? (views7 / subs) : 0;
  const potential = Math.min(10, growth * 5);
  const positioning = avg > 0 ? 6 : 2;

  const score = Math.round(
    (consistency + performance + potential + positioning) * 2.5
  );

  return {
    score,
    consistency: Math.round(consistency),
    performance: Math.round(performance),
    potential: Math.round(potential),
    positioning: Math.round(positioning)
  };
}

// ======================================================
// 🧠 DIAGNOSIS
// ======================================================
app.post("/api/ai/diagnosis", secure, async (req,res)=>{

  try{

    const { stats={}, videos=[] } = req.body;

    if(videos.length < 3){
      return res.json({
        success:true,
        data:{ score:0, message:"Dados insuficientes" }
      });
    }

    const base = analyzeChannel(stats, videos);

    const titles = videos
      .slice(0,10)
      .map(v=>v?.title || "")
      .join("\n");

    const prompt = `
Score: ${base.score}
Consistência: ${base.consistency}
Performance: ${base.performance}

Títulos:
${titles}

Liste:
- 3 problemas
- 3 oportunidades
`;

    const ai = await callAI(prompt);

    return res.json({
      success:true,
      data:{
        ...base,
        insights: ai || "Sem insights"
      }
    });

  }catch(e){
    console.error(e);
    return res.json({ success:true, data:{ score:0 } });
  }
});

// ======================================================
// 💡 VIDEO IDEAS
// ======================================================
app.post("/api/ai/video-ideas", secure, async (req,res)=>{

  try{

    const { videos=[] } = req.body;

    if(videos.length < 3){
      return res.json({
        success:true,
        ideas:[
          "Como crescer no YouTube do zero",
          "Erros que matam seu canal",
          "Como viralizar vídeos pequenos"
        ]
      });
    }

    const top = videos
      .sort((a,b)=> (b.views||0)-(a.views||0))
      .slice(0,10);

    const titles = top.map(v=>v.title).join("\n");

    const prompt = `
Baseado nesses vídeos:

${titles}

Crie 5 títulos virais.
`;

    const text = await callAI(prompt);

    const ideas = text
      ?.split("\n")
      .map(i=>i.trim())
      .filter(i=>i.length>5)
      .slice(0,5);

    return res.json({
      success:true,
      ideas: ideas?.length ? ideas : top.map(v=>v.title)
    });

  }catch(e){
    return res.json({ success:true, ideas:["Erro"] });
  }
});

// ======================================================
// 🧠 NICHE (SEM IA)
// ======================================================
app.post("/api/ai/niche", secure, (req,res)=>{

  const { videos=[] } = req.body;

  if(videos.length < 3){
    return res.json({ success:true, niche:"Geral", confidence:0 });
  }

  const text = videos.map(v=>v.title).join(" ").toLowerCase();

  const map = {
    youtube:["youtube","canal"],
    games:["game","fps"],
    anime:["anime","naruto"],
    dinheiro:["dinheiro","renda"]
  };

  let best = "Geral";
  let score = 0;

  for(const k in map){
    let s = 0;
    map[k].forEach(w=>{
      if(text.includes(w)) s++;
    });
    if(s > score){
      score = s;
      best = k;
    }
  }

  return res.json({
    success:true,
    niche:best,
    confidence: Math.min(100, score*20)
  });
});

// ======================================================
app.listen(PORT, ()=>{
  console.log("🚀 TubeX SAFE SERVER RUNNING");
});
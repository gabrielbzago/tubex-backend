import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

app.use(cors({ origin: "*", methods: ["GET","POST"], allowedHeaders: ["Content-Type","x-api-key"] }));
app.use(express.json({ limit: "1mb" }));

// ======================================================
// 🔒 AUTH
// ======================================================
function auth(req,res,next){
  if(req.headers["x-api-key"] !== API_KEY){
    return res.status(401).json({ success:false });
  }
  next();
}

app.use("/api/ai", auth);

// ======================================================
// 🧠 IA CORE
// ======================================================
async function callAI(prompt){
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
        messages:[
          { role:"system", content:"Especialista em crescimento no YouTube, direto e estratégico." },
          { role:"user", content: prompt }
        ]
      })
    });

    if(!res.ok) return null;

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;

  }catch(e){
    console.error("AI FAIL", e);
    return null;
  }
}

// ======================================================
// 📊 ENGINE (SEM IA)
// ======================================================
function analyzeChannel(stats, videos){

  const subs = Number(stats.subscribers || 0);
  const avg = Number(stats.avg || 0);
  const uploads7 = Number(stats.uploads7 || 0);
  const views7 = Number(stats.views7 || 0);

  // consistência
  const consistency = Math.min(10, uploads7 * 2);

  // performance
  const performance = subs > 0 ? Math.min(10, (avg / subs) * 10) : 0;

  // crescimento
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
// 🧠 DIAGNOSIS (HYBRID)
// ======================================================
app.post("/api/ai/diagnosis", async (req,res)=>{

  try{

    const { stats={}, videos=[] } = req.body;

    if(videos.length < 3){
      return res.json({
        success:true,
        data:{
          score:0,
          message:"Dados insuficientes"
        }
      });
    }

    const base = analyzeChannel(stats, videos);

    // ======================================================
    // 🧠 IA COMPLEMENTAR
    // ======================================================
    const titles = videos
      .slice(0,10)
      .map(v=>v?.snippet?.title || v?.title || "")
      .join("\n");

    const prompt = `
Baseado nesses dados:

Score: ${base.score}
Consistência: ${base.consistency}
Performance: ${base.performance}

Títulos:
${titles}

Gere:

- 3 problemas principais
- 3 oportunidades

Resposta curta
`;

    const ai = await callAI(prompt);

    return res.json({
      success:true,
      data:{
        ...base,
        insights: ai || "Sem insights disponíveis"
      }
    });

  }catch(e){

    console.error(e);

    return res.json({
      success:true,
      data:{
        score:0,
        error:true
      }
    });
  }
});

// ======================================================
// 💡 VIDEO IDEAS (INTELIGENTE)
// ======================================================
app.post("/api/ai/video-ideas", async (req,res)=>{

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
Baseado nesses vídeos virais:

${titles}

Crie 5 títulos altamente clicáveis

Sem explicação
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

    return res.json({
      success:true,
      ideas:["Erro ao gerar ideias"]
    });
  }
});

// ======================================================
// 🧠 NICHE (SEM IA - RÁPIDO)
// ======================================================
app.post("/api/ai/niche", async (req,res)=>{

  const { videos=[] } = req.body;

  if(videos.length < 3){
    return res.json({
      success:true,
      niche:"Geral",
      confidence:0
    });
  }

  const text = videos.map(v=>v.title).join(" ").toLowerCase();

  const map = {
    youtube:["youtube","canal","views"],
    games:["game","minecraft","fps"],
    anime:["naruto","anime","episodio"],
    dinheiro:["dinheiro","renda","lucro"]
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
  console.log("🚀 ENTERPRISE AI RUNNING");
});
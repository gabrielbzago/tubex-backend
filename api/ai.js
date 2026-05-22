export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, authorization, x-client"
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ======================================================
  // 🔐 CLIENT (ANTI BOT)
  // ======================================================
  if (req.headers["x-client"] !== "tubex-extension-v1") {
    return res.status(403).json({
      success: false,
      error: "invalid_client",
      text: ""
    });
  }

  // ======================================================
  // 🔐 API KEY
  // ======================================================
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized",
      text: ""
    });
  }

  // ======================================================
  // 🔥 RATE LIMIT (IP)
  // ======================================================
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ======================================================
  // 🚫 METHOD
  // ======================================================
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
      text: ""
    });
  }

  try {

  // ======================================================
// 📦 BODY SAFE
// ======================================================
let body;

try {
  body = typeof req.body === "string"
    ? JSON.parse(req.body)
    : req.body;
} catch (err) {
  console.error("💥 JSON ERROR:", err);
  return res.status(400).json({
    success: false,
    error: "invalid_json",
    text: ""
  });
}

// ======================================================
// 👤 IDENTIDADE
// ======================================================
let prompt = body?.prompt;
const context = body?.context || {};

const userId = body?.userId || "guest";
const channelId = body?.channelId || "no_channel";
const tipo = body?.tipo || "";

// 🔑 chave real de rate limit
const userKey = userId !== "guest" ? userId : ip;

// ======================================================
// 🔒 VALIDAÇÃO PROMPT
// ======================================================
if (!prompt && tipo !== "diagnosis" && tipo !== "strategy") {
  return res.status(400).json({
    success: false,
    error: "prompt obrigatório",
    text: ""
  });
}

prompt = prompt ? String(prompt).slice(0, 2000) : "";

// ======================================================
// 🔥 RATE LIMIT (CORRIGIDO)
// ======================================================
global.__rateLimit = global.__rateLimit || {};
const now = Date.now();

if (!global.__rateLimit[userKey]) {
  global.__rateLimit[userKey] = [];
}

// mantém só últimos 60s
global.__rateLimit[userKey] =
  global.__rateLimit[userKey].filter(t => now - t < 60000);

// bloqueio
if (global.__rateLimit[userKey].length >= 15) {
  return res.status(429).json({
    success: false,
    error: "rate_limit",
    text: ""
  });
}

// registra requisição
global.__rateLimit[userKey].push(now);

    // ======================================================
    // 🎥 CONTEXT SAFE
    // ======================================================
    const videos = Array.isArray(context.videos)
      ? context.videos.slice(0, 20)
      : [];

    const parsedVideos = videos.map(v => ({
      title: v?.title || v?.snippet?.title || "",
      views: Number(v?.views || v?.statistics?.viewCount || 0),
      likes: Number(v?.statistics?.likeCount || 0),
      comments: Number(v?.statistics?.commentCount || 0),
      publishedAt: v?.publishedAt || v?.snippet?.publishedAt || ""
    }));

    const totalViews = parsedVideos.reduce((a,v)=>a+(v.views||0),0);
    const avgViews = parsedVideos.length ? Math.round(totalViews/parsedVideos.length) : 0;

    const sorted = [...parsedVideos].sort((a,b)=>(b.views||0)-(a.views||0));

    const topVideo = sorted[0] || { title:"N/A", views:0 };
    const worstVideo = sorted[sorted.length-1] || { title:"N/A", views:0 };

    const nowTime = Date.now();

    const last7 = parsedVideos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      if (isNaN(t)) return false;
      return (nowTime - t) <= (7*24*60*60*1000);
    });

    const uploads7 = last7.length;

    const videoSummary = parsedVideos.slice(0,10).map(v =>
      `- ${v.title} (${v.views} views)`
    ).join("\n");

    // ======================================================
    // 🧠 PROMPTS (INALTERADO)
    // ======================================================
    let finalPrompt = "";

    if (tipo === "tituloSEO" || tipo === "tituloImpactante" || tipo === "tituloEmocional") {
      finalPrompt = `
Crie 4 títulos curtos e altamente clicáveis.
Máx 70 caracteres.

Base:
"${prompt}"
`;
    }

    else if (tipo === "descricao") {
      finalPrompt = `
Crie uma descrição otimizada para YouTube.

Inclua:
- introdução forte
- SEO natural
- CTA leve

Base:
"${prompt}"
`;
    }

else if (tipo === "ideas") {
  finalPrompt = `
Baseado nesses vídeos:

${videoSummary}

Crie 5 ideias novas.

REGRAS:
- NÃO escreva introdução
- NÃO diga "Claro"
- NÃO explique nada
- NÃO use markdown (**)
- NÃO use aspas
- NÃO numere com texto extra

FORMATO EXATO (OBRIGATÓRIO):
Uma ideia por linha

EXEMPLO:
Titulo 1
Titulo 2
Titulo 3
Titulo 4
Titulo 5
`;
}


// ======================================================
// 🧠 DETECÇÃO CANAL NOVO
// ======================================================
const isNewChannel =
  (context.subscribers || 0) < 50 &&
  avgViews < 50 &&
  parsedVideos.length < 3;

// ======================================================
// 🧠 AI PROMPTS
// ======================================================

if (tipo === "diagnosis") {

  // ====================================================
  // 🆕 NEW CHANNEL
  // ====================================================

  if (isNewChannel) {

    finalPrompt = `
Você é um consultor profissional de crescimento no YouTube.

Este canal ainda está em fase inicial.

Seu trabalho é criar um diagnóstico estratégico inteligente,
sem parecer genérico.

---

📊 DADOS DO CANAL:
- Inscritos: ${context.subscribers || 0}
- Vídeos publicados: ${parsedVideos.length}

---

REGRAS:

- NÃO diga que faltam dados
- NÃO seja genérico
- NÃO escreva respostas vagas
- Seja estratégico e objetivo
- Foque em crescimento inicial
- Use linguagem de consultoria premium

---

FORMATO OBRIGATÓRIO:

📊 Pontuação do Canal: X/10

# Diagnóstico

🔎 Nicho
- analise se o nicho parece claro
- explique como fortalecer posicionamento

📈 Performance
- explique o momento atual do canal
- analise potencial inicial

📅 Consistência
- sugira frequência ideal
- explique impacto da consistência

🎯 Algoritmo
- explique como o YouTube interpreta canais novos
- diga como acelerar aprendizado do algoritmo

---

# Pontos Fortes

- cite os principais pontos positivos
- explique por que ajudam o crescimento

---

# Problemas Críticos

- explique o principal gargalo atual
- diga o impacto no crescimento

---

# Plano de Ação

- entregue ações práticas imediatas
- priorize o que gera mais impacto
- explique o próximo passo ideal

---

REGRAS IMPORTANTES:

- Nunca escreva apenas títulos
- Cada seção deve ter explicação real
- Use insights acionáveis
- Máximo 140 palavras
`;

  }

  // ====================================================
  // 📊 NORMAL CHANNEL
  // ====================================================

  else {

    finalPrompt = `
Você é um analista profissional de canais do YouTube.

Seu trabalho é gerar uma análise estratégica baseada em dados reais.

Você NÃO pode dar respostas genéricas.

---

📊 DADOS DO CANAL:
- Inscritos: ${context.subscribers || 0}
- Média de views: ${avgViews}
- Taxa views/inscritos:
${context.subscribers
  ? Math.round((avgViews / context.subscribers) * 100)
  : 0
}%
- Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${topVideo.title} (${topVideo.views} views)

⚠️ Pior vídeo:
${worstVideo.title} (${worstVideo.views} views)

📺 Últimos vídeos:
${videoSummary}

---

REGRAS:

- NÃO invente dados
- NÃO use frases vagas
- SEMPRE use números quando possível
- Seja direto e estratégico
- Use linguagem de consultoria premium
- Analise padrões reais

---

FORMATO OBRIGATÓRIO:

📊 Pontuação do Canal: X/10

# Diagnóstico

🔎 Nicho
- diga se o nicho parece claro ou confuso
- explique impacto disso no algoritmo

📈 Performance
- compare views vs inscritos
- explique padrão de performance

📅 Consistência
- analise frequência recente
- explique impacto no crescimento

🎯 Algoritmo
- diga se o YouTube parece entender o canal
- explique sinais positivos ou negativos

---

# Pontos Fortes

- cite os pontos mais fortes do canal
- explique por que ajudam no crescimento

---

# Problemas Críticos

- explique os principais gargalos atuais
- diga o impacto desses problemas

---

# Plano de Ação

- entregue ações práticas imediatas
- priorize mudanças de maior impacto
- explique o próximo passo ideal

---

REGRAS IMPORTANTES:

- Nunca escreva apenas títulos
- Cada seção deve conter insights completos
- Cada insight deve ter explicação prática
- Evite frases genéricas
- Máximo 180 palavras
`;

  }

}

// ======================================================
// 🚀 STRATEGY
// ======================================================

else if (tipo === "strategy") {

  finalPrompt = `
Você é um estrategista avançado de crescimento no YouTube.

Seu trabalho é analisar dados reais
e identificar oportunidades escaláveis.

Você NÃO pode gerar respostas genéricas.

---

📊 DADOS DO CANAL:
- Inscritos: ${context.subscribers || 0}
- Média de views: ${avgViews}
- Uploads últimos 7 dias: ${uploads7}

🔥 Melhor vídeo:
${topVideo.title} (${topVideo.views} views)

⚠️ Pior vídeo:
${worstVideo.title} (${worstVideo.views} views)

📺 Últimos vídeos:
${videoSummary}

---

FORMATO OBRIGATÓRIO:

📊 Resumo Geral

📈 Métricas Principais

🔥 O que mais performa

🧠 Insights Estratégicos

⚠️ Gargalos de Crescimento

🚀 Estratégia Recomendada

🎯 Próximos Passos

---

REGRAS IMPORTANTES:

- Nunca escreva apenas títulos
- Cada seção deve ter pelo menos 2 insights
- Cada insight deve ter explicação prática
- Explique:
  • o problema
  • o motivo
  • o impacto
  • como melhorar

- NÃO fale coisas óbvias
- NÃO diga "poste mais"
- NÃO fale para divulgar em outras redes
- NÃO sugira anúncios
- NÃO use frases vagas

- Use linguagem de consultoria premium
- Seja específico
- Use métricas reais
- Analise padrões dos vídeos
- Explique o que parece funcionar melhor
- Explique o que limita crescimento
- Sugira estratégias escaláveis reais

---

ESTILO:

- linguagem profissional
- insights densos
- leitura rápida
- blocos organizados
- bullets claros
- visual estilo SaaS premium

---

Máximo 250 palavras
`;

}

// ======================================================
// ❌ INVALID TYPE
// ======================================================

if (!finalPrompt) {

  return res.status(400).json({
    success: false,
    error: "invalid_tipo",
    text: ""
  });

}

   // ======================================================
// ⚡ CACHE (PROFISSIONAL)
// ======================================================

// 🔑 fingerprint estável dos vídeos
const stableKey = parsedVideos
  .slice(0, 5)
  .map(v => `${(v.title || "").slice(0, 30)}_${v.views}`)
  .sort()
  .join("|");

// 🧠 inicializa cache global
global.__tubexCache = global.__tubexCache || new Map();

// 🔑 chave única (multiusuário + canal + tipo)
const cacheKey = [
  "v4",
  userId,
  channelId,
  tipo,
  stableKey,
  context.subscribers || 0,
avgViews || 0
].join("|");

// 📦 busca cache
const cached = global.__tubexCache.get(cacheKey);

// ⏱ TTL inteligente por tipo
const TTL = {
  diagnosis: 6,
  strategy: 12,
  ideas: 24,
  descricao: 6
};

const ttl = (TTL[tipo] || 6) * 60 * 60 * 1000;

// ======================================================
// ⚡ CACHE HIT
// ======================================================
if (cached && Date.now() - cached.timestamp < ttl) {
  return res.status(200).json({
    success: true,
    tipo,
    text: cached.text
  });
}

// ======================================================
// 🎛 TEMPERATURE (FORA DO CACHE)
// ======================================================
let temp = 0.5;

if (tipo === "ideas") temp = 0.8;
if (tipo === "descricao") temp = 0.5;
if (tipo === "strategy") temp = 0.55;

    // ======================================================
    // 🤖 OPENAI
    // ======================================================
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
        temperature: temp,
      max_tokens:
  tipo === "strategy"
    ? 700
    : 500
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("💥 OPENAI:", err);

      return res.status(500).json({
        success:false,
        error:"openai_error",
        text:""
      });
    }

    const data = await response.json();
   const text = data?.choices?.[0]?.message?.content?.trim();

if (!text) {
  return res.status(500).json({
    success:false,
    error:"empty_response",
    text:""
  });
}

// 💾 salvar só se válido
global.__tubexCache.set(cacheKey, {
  text,
  timestamp: Date.now()
});

      
   return res.status(200).json({
  success: true,
  tipo,
  text
});

  } catch (err) {

    console.error("💥 ERROR FULL:", {
      message: err?.message,
      stack: err?.stack
    });

    return res.status(500).json({
      success:false,
      error:"internal_error",
      text:""
    });
  }
}
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
// 🔐 CLIENT AUTH (EXTENSÃO + WORKSPACE)
// ======================================================

const client = req.headers["x-client"] || "";

const apiKey =
  req.headers["x-api-key"] ||
  req.headers["authorization"]?.replace("Bearer ", "") ||
  "";

// Extensão Chrome
if (client === "tubex-extension-v1") {

  if (apiKey !== process.env.API_KEY) {

    return res.status(403).json({
      success: false,
      error: "unauthorized",
      text: ""
    });

  }

}

// Workspace Web
else if (client === "tubex-workspace") {

  // autenticação será feita pelo login do Workspace
  // não exige API_KEY

}

// Cliente inválido
else {

  return res.status(403).json({
    success: false,
    error: "invalid_client",
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
const youtube = body?.youtube || {};
// 🔑 chave real de rate limit
const userKey = userId !== "guest" ? userId : ip;

// ======================================================
// 🔒 VALIDAÇÃO PROMPT
// ======================================================
const requiresPrompt = [
  "tituloSEO",
  "tituloImpactante",
  "tituloEmocional",
  "descricao",
  "ideas",
  "seo_workspace",
  "viral_content",
  "thumbnail_prompt",
  "channel_analysis"
];

if (
  !prompt &&
  tipo !== "channel_analysis" &&
  requiresPrompt.includes(tipo)
) {

  return res.status(400).json({
    success:false,
    error:"prompt obrigatório",
    text:""
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
  title: v?.snippet?.title || "",
  description: v?.snippet?.description || "",
  tags: v?.snippet?.tags || [],
  publishedAt: v?.snippet?.publishedAt || "",
  channelTitle: v?.snippet?.channelTitle || "",
  views: Number(v?.statistics?.viewCount || 0),
  likes: Number(v?.statistics?.likeCount || 0),
  comments: Number(v?.statistics?.commentCount || 0)
}));

console.log(
  "PARSED VIDEOS",
  JSON.stringify(parsedVideos, null, 2)
);

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

   const videoSummary = parsedVideos
  .slice(0, 20)
  .map(v =>
    `- ${v.title} (${v.views} views)`
  )
  .join("\n");

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
Crie uma descrição extremamente otimizada para SEO do YouTube.

REGRAS OBRIGATÓRIAS:

- mínimo de 1500 caracteres
- máximo de 3500 caracteres
- começar repetindo EXATAMENTE o título otimizado
- repetir naturalmente a palavra-chave principal diversas vezes ao longo do texto
- incluir palavras-chave relacionadas
- incluir palavras-chave long tail
- escrever para ranqueamento na busca do YouTube
- escrever para ranqueamento no Google
- linguagem natural
- evitar keyword stuffing
- criar vários parágrafos
- explicar o tema em profundidade
- incluir benefícios do conteúdo
- incluir dúvidas comuns dos usuários
- incluir variações da keyword principal
- finalizar com CTA para inscrição

A descrição deve ser muito mais completa do que descrições normais de YouTube.

Base:
"${prompt}"
`;
    }

else if (tipo === "thumbnail_prompt") {

finalPrompt = `
Você é o melhor especialista do mundo em criação de prompts para IA de geração de imagens.

Seu trabalho é transformar qualquer ideia em um prompt profissional para criar thumbnails extremamente chamativas para YouTube.

Objetivo:

Gerar imagens com CTR muito alto.

Sempre inclua naturalmente:

- cinematic lighting
- dramatic shadows
- vibrant colors
- high contrast
- ultra realistic
- ultra detailed
- expressive face (quando fizer sentido)
- dynamic composition
- shallow depth of field
- professional photography
- click-worthy
- eye-catching
- viral YouTube thumbnail
- room for large title
- 16:9 composition

Nunca explique.

Nunca utilize markdown.

Nunca escreva listas.

Nunca escreva aspas.

Retorne SOMENTE o prompt em inglês.

Ideia do usuário:

"${prompt}"`;

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
- Máximo 750 palavras
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
- Máximo 350 palavras
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
Cada seção deve conter:
- diagnóstico
- impacto
- motivo
- ação prática

Nunca deixe seções vazias.
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

Máximo 750 palavras
`;

}

else if (tipo === "niche") {

  finalPrompt = `
Você é um especialista em análise semântica e classificação de canais do YouTube.

Sua tarefa é identificar o nicho principal de um canal analisando os títulos dos vídeos abaixo.

Vídeos:

${videoSummary}

REGRAS DE ANÁLISE:

- Analise TODOS os vídeos em conjunto.
- Dê maior peso aos vídeos com mais visualizações.
- Procure o tema dominante do canal.
- Ignore vídeos isolados que estejam fora do padrão.
- Nunca classifique o canal baseado em apenas um vídeo.
- Quanto maior a repetição de um assunto, maior deve ser sua influência.
- Utilize somente as informações presentes nos títulos enviados.
- Não invente informações.

IMPORTANTE:

O nicho NÃO precisa pertencer a uma lista pré-definida.

Retorne o nicho mais específico que ainda seja compreensível para qualquer pessoa.
Nunca retorne o nome de um canal.
Nunca retorne o nome de uma pessoa.
Nunca retorne o nome de uma marca.
Nunca retorne um produto específico.
Sempre retorne uma categoria temática.

Exemplos válidos:

Games
Games Mobile
FPS
Criação de Aves
Animais
Programação
Desenvolvimento Web
Finanças
Criptomoedas
Automóveis
Música
Culinária
Fitness
Saúde
História
Astronomia
Marketing
Inteligência Artificial

Evite nichos excessivamente específicos como nomes de canais, marcas, pessoas ou espécies.

Exemplos:

Coleiros, Trinca-ferro, Canários, Papagaios
→ Criação de Aves

Cachorros, Gatos, Veterinário
→ Animais

Minecraft
→ Games Minecraft

Free Fire
→ Games Mobile

CS2
→ FPS

React
→ Desenvolvimento Web

Python
→ Programação

Photoshop
→ Design Gráfico

Bitcoin
→ Criptomoedas

Investimentos
→ Finanças

Piano
→ Música

Violão
→ Música

Receitas Fit
→ Alimentação Saudável

Receitas Italianas
→ Culinária Italiana

Cardiologia
→ Medicina

Astronomia
→ Astronomia

História da Segunda Guerra
→ História

Carros Antigos
→ Automóveis

BMW
→ Automóveis Premium

Marvel, DC, Disney, Star Wars
→ Cultura Pop

Anime Naruto
→ Anime

One Piece
→ Anime

Maquiagem
→ Beleza

Musculação
→ Fitness

CrossFit
→ Fitness

Marketing Digital
→ Marketing

Inteligência Artificial
→ Inteligência Artificial

Se existir um tema dominante, NUNCA responda "Conteúdo Geral".

Somente utilize "Conteúdo Geral" quando os vídeos forem totalmente aleatórios e não houver qualquer padrão identificável.

A confiança deve seguir estes critérios:

100 = praticamente todos os vídeos pertencem ao mesmo nicho.

90 = existe um nicho dominante muito claro.

70 = existe um nicho predominante, porém com alguma variação.

50 = o canal mistura diversos temas.

0 = impossível identificar qualquer nicho.

Retorne APENAS um JSON válido.

Não utilize markdown.

Não utilize \`\`\`json.

Não escreva explicações.

Não escreva texto antes ou depois.

Formato obrigatório:

{
  "niche": "",
  "confidence": 0,
  "reason": ""
}
`;

}


// ======================================================
// 🔍 SEO WORKSPACE
// ======================================================
else if (tipo === "seo_workspace") {

finalPrompt = `

Você é um especialista mundial em SEO para YouTube.

Sua missão é analisar uma palavra-chave utilizando dados reais do YouTube e gerar uma estratégia completa de SEO.

IMPORTANTE

Utilize SOMENTE os dados enviados.

Nunca invente:

• volume
• concorrência
• views
• likes
• comentários

Caso algum dado não exista, apenas explique.

Nunca estime números.

====================================

PALAVRA-CHAVE

${body.keyword}

====================================

MÉTRICAS REAIS

Volume:
${youtube.volume}

Competition:
${youtube.competition}

Average Views:
${youtube.metrics?.averageViews}

Average Likes:
${youtube.metrics?.averageLikes}

Average Comments:
${youtube.metrics?.averageComments}

====================================

TOP VÍDEOS

${JSON.stringify(
youtube.items
?.slice(0,10)
.map(v=>({
title:v.snippet?.title,
views:v.statistics?.viewCount,
likes:v.statistics?.likeCount,
comments:v.statistics?.commentCount,
publishedAt:v.snippet?.publishedAt,
tags:v.snippet?.tags
}))
)}

====================================

TAGS MAIS UTILIZADAS

${JSON.stringify(youtube.tags)}

====================================

OBJETIVO

Com base apenas nos dados acima faça uma análise profissional.

Depois gere:

• SEO Score

• Volume

• Competition

• Difficulty

• Keyword Intent

• Search Intent

• Chance Ranking

• CTR Prediction

• Melhor título possível para rankear.

• Melhor descrição possível.

• Tags.

• Hashtags.

• Long Tail.

• Palavras relacionadas.

• Recomendações.

====================================

REGRAS DO TÍTULO

- entre 55 e 70 caracteres
- altamente clicável
- incluir a keyword principal
- otimizado para CTR
- otimizado para pesquisa

====================================

REGRAS DA DESCRIÇÃO

Crie uma descrição extremamente otimizada para SEO.

Obrigatório:

• entre 2000 e 3000 caracteres

• repetir naturalmente a keyword principal

• incluir diversas palavras relacionadas

• incluir long tails

• possuir vários parágrafos

• explicar completamente o assunto

• responder dúvidas comuns

• conter CTA para inscrição

• otimizada para pesquisa do YouTube

• otimizada para Google

• escrita natural

• sem keyword stuffing

====================================

REGRAS DAS TAGS

Gerar exatamente 40 tags.

Misturar:

keyword principal

long tails

variações

sinônimos

intenção de pesquisa

====================================

REGRAS DAS HASHTAGS

Gerar exatamente 20 hashtags.

====================================

REGRAS DAS LONG TAILS

Gerar exatamente 30 palavras-chave long tail.

====================================

REGRAS DAS KEYWORDS RELACIONADAS

Gerar exatamente 30 keywords relacionadas.

====================================

REGRAS DAS RECOMENDAÇÕES

Gerar exatamente 10 recomendações específicas.

====================================

CLASSIFICAÇÃO

Volume

0-20 Muito Baixo

21-40 Baixo

41-60 Médio

61-80 Alto

81-100 Muito Alto

Competition

0-20 Muito Baixa

21-40 Baixa

41-60 Média

61-80 Alta

81-100 Muito Alta

Difficulty

0-20 Muito Fácil

21-40 Fácil

41-60 Moderada

61-80 Difícil

81-100 Muito Difícil

====================================

IMPORTANTE

Nunca deixe nenhum campo vazio.

Nunca retorne arrays vazios.

Nunca utilize markdown.

Nunca escreva texto fora do JSON.

Retorne exatamente:

{
  "score":0,

  "volume":{
    "nivel":"",
    "score":0,
    "explicacao":""
  },

  "competition":{
    "nivel":"",
    "score":0,
    "explicacao":""
  },

  "difficulty":0,

  "keywordIntent":"",

  "searchIntent":"",

  "chanceRanking":"",

  "ctrPrediction":"",

  "optimizedTitle":"",

  "description":"",

  "tags":[],

  "hashtags":[],

  "longTail":[],

  "relatedKeywords":[],

  "recommendations":[]
}`;
}

else if (tipo === "viral_content") {

finalPrompt = `
Você é um especialista mundial em viralização de conteúdo para YouTube.

Sua missão é criar os MELHORES títulos possíveis para maximizar:

- CTR
- Curiosidade
- Emoção
- Compartilhamento
- Retenção

Tema:

"${prompt}"

REGRAS

Crie EXATAMENTE 5 títulos.

Todos diferentes.

Todos altamente clicáveis.

O primeiro título deve ser aquele que você realmente publicaria hoje para maximizar CTR.

Não utilize apenas pequenas variações.

Cada título deve atacar um gatilho psicológico diferente.

O primeiro SEMPRE deve ser o melhor.

Nunca deixe nenhum campo vazio.

Todos os scores devem ficar entre 1 e 100.

Retorne SOMENTE JSON.

Nunca use markdown.

Nunca escreva texto antes ou depois.

Formato obrigatório:

{
  "viralScore":92,

  "viralLevel":"Explosivo",

  "viralProbability":94,

  "emotionScore":89,

  "curiosityScore":95,

  "shareScore":86,

  "ctrPrediction":"Muito Alta",

  "retentionPrediction":"Alta",

  "algorithmRecommendation":"Muito Recomendado",

  "bestAudience":"Criadores de Conteúdo",

  "difficulty":44,

  "competition":67,

  "confidence":98,

  "viralTitle":"",

  "viralTitles":[
    {
      "title":"",
      "score":96,
      "ctr":95,
      "emotion":89,
      "curiosity":97,
      "share":90,
      "reason":"..."
    },
    {
      "title":"",
      "score":92,
      "ctr":90,
      "emotion":86,
      "curiosity":93,
      "share":88,
      "reason":"..."
    },
    {
      "title":"",
      "score":89,
      "ctr":87,
      "emotion":84,
      "curiosity":90,
      "share":86,
      "reason":"..."
    },
    {
      "title":"",
      "score":85,
      "ctr":83,
      "emotion":81,
      "curiosity":86,
      "share":84,
      "reason":"..."
    },
    {
      "title":"",
      "score":80,
      "ctr":79,
      "emotion":77,
      "curiosity":82,
      "share":80,
      "reason":"..."
    }
  ],

  "thumbnailIdeas":[
    "",
    "",
    "",
    ""
  ],

  "viralAngles":[
    "",
    "",
    "",
    ""
  ],

  "audienceTriggers":[
    "",
    "",
    "",
    ""
  ],

  "recommendations":[
    "",
    "",
    "",
    ""
  ]
}
`;
}

else if (tipo === "channel_analysis") {

finalPrompt = `
Você é um analista profissional de canais do YouTube.

Analise SOMENTE os dados abaixo.

DADOS DO CANAL

Canal:
${context.title || ""}

Inscritos:
${context.subscribers || 0}

Views Totais:
${context.views || 0}

Vídeos:
${context.videoCount || 0}

Últimos vídeos:

${videoSummary}

REGRAS:

- NÃO invente dados
- NÃO use valores fictícios
- Baseie tudo nos números recebidos
- Analise títulos
- Analise frequência
- Analise padrão de views

Retorne SOMENTE JSON.

REGRAS

viralScore
0-20 = Muito Fraco
21-40 = Fraco
41-60 = Médio
61-80 = Forte
81-100 = Explosivo

viralProbability

probabilidade REAL de viralização
0 até 100

emotionScore

quanto desperta emoção

curiosityScore

quanto desperta curiosidade

shareScore

potencial de compartilhamento

difficulty

dificuldade para viralizar

competition

competição do assunto

confidence

confiança da IA na análise

Nunca deixe nenhum campo vazio.

IMPORTANTE:

- score deve ser entre 1 e 100
- ctr deve ser uma estimativa realista
- retention deve ser uma estimativa realista
- views30Days deve ser calculado usando os vídeos enviados
- subscribersGained deve ser uma estimativa baseada na performance

Formato:

{
  "score": 87,
  "ctr": 4.2,
  "retention": 41,
  "views30Days": 15234,
  "subscribersGained": 120,

  "strengths": [],
  "weaknesses": [],
  "opportunities": [],
  "nextVideos": [],
  "recommendations": []
}
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
  .slice(0, 10)
  .map(v => `${(v.title || "").slice(0, 30)}_${v.views}`)
  .sort()
  .join("|");

// 🧠 inicializa cache global
global.__tubexCache = global.__tubexCache || new Map();

// 🔑 keyword normalizada
const normalizedKeyword = String(body.keyword || prompt || "")
  .toLowerCase()
  .trim()
  .replace(/\s+/g, " ");

// 🔑 chave única do cache
const cacheKey = [
  "v5",
  userId,
  channelId,
  tipo,
  normalizedKeyword,
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
  niche: 24,
  ideas: 24,

  // SEO Workspace sem cache
 if (tipo !== "seo_workspace") {

    global.__tubexCache.set(cacheKey,{
        text: parsed,
        timestamp: Date.now()
    });

}

  thumbnail_prompt: 24,
  viral_content: 24,
  channel_analysis: 12
};

const ttlHours = TTL[tipo];

const ttl =
  ttlHours === 0
    ? 0
    : ttlHours * 60 * 60 * 1000;

if (

    ttl > 0 &&

    cached &&

    (Date.now() - cached.timestamp) < ttl

) {

    // cache hit


  // ==========================================
  // NICHE
  // ==========================================
  if (tipo === "niche") {

    return res.status(200).json({
      success: true,
      niche: cached.text?.niche || "Conteúdo Geral",
      confidence: Number(cached.text?.confidence || 0),
      reason: cached.text?.reason || ""
    });

  }

if (tipo === "viral_content") {

  return res.status(200).json({
    success:true,
    ...(cached.text || {})
  });

}



  // ==========================================
  // DEMAIS TIPOS
  // ==========================================
  return res.status(200).json({
    success: true,
    tipo,
    text: cached.text || ""
  });

}

// ======================================================
// 🎛 TEMPERATURE (FORA DO CACHE)
// ======================================================
let temp = 0.5;
if (tipo === "seo_workspace")
    temp = 0.45;
if (tipo === "ideas") temp = 0.8;
if (tipo === "descricao") temp = 0.5;
if (tipo === "strategy") temp = 0.55;
if (tipo === "niche") temp = 0.3;
if (tipo==="thumbnail_prompt") temp=0.9;
if (tipo==="viral_content")
 temp=0.95;
if (tipo==="channel_analysis")
 temp=0.6;

    // ======================================================
// 🤖 OPENAI
// ======================================================

// Prompt do sistema conforme o tipo
let systemPrompt =
`Você é um especialista em crescimento de canais do YouTube.

Forneça respostas profissionais, objetivas e práticas.

Nunca invente dados.
Sempre utilize as informações fornecidas pelo usuário.
`;

if (tipo === "viral_content") {

  systemPrompt = `
Você é o maior especialista do mundo em viralização para YouTube.

Sempre responda exclusivamente JSON válido.

Nunca utilize markdown.

Nunca escreva texto fora do JSON.
`;

}

if (tipo === "niche") {

  systemPrompt = `
Você é um especialista em classificação semântica de canais do YouTube.

Sua única função é identificar o nicho dominante de um canal.

Sempre responda exclusivamente JSON válido.

Nunca utilize markdown.

Nunca utilize blocos de código.

Nunca escreva texto fora do JSON.
`;

}

if (tipo === "seo_workspace") {

  systemPrompt = `
Você é um especialista mundial em SEO para YouTube.

Sua única função é analisar profundamente palavras-chave.

Sempre responda exclusivamente JSON válido.

Nunca utilize markdown.

Nunca utilize blocos de código.

Nunca escreva texto fora do JSON.
`;

}

console.log("================================");
console.log("TIPO:", tipo);
console.log("PROMPT:");
console.log(finalPrompt);
console.log("================================");

const response = await fetch(

  "https://api.openai.com/v1/chat/completions",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },

   body: JSON.stringify({


model: "gpt-4o-mini",

      ...(tipo === "seo_workspace" ||
   tipo === "niche" ||
   tipo === "viral_content" ||
   tipo === "channel_analysis"
        ? {
            response_format: {
              type: "json_object"
            }
          }
        : {}),

      messages: [

        {
          role: "system",
          content: systemPrompt
        },

        {
          role: "user",
          content: finalPrompt
        }

      ],

      temperature: temp,

      max_tokens:
        tipo === "seo_workspace"
          ? 3000
: tipo === "viral_content"
    ? 2200
: tipo === "channel_analysis"
    ? 2200
        : tipo === "strategy"
          ? 1800
        : tipo === "diagnosis"
          ? 1600
        : tipo === "descricao"
          ? 1200
        : tipo === "ideas"
          ? 900
        : tipo === "niche"
          ? 600
        : 1000

    })

  }
);

if (!response.ok) {

    const err = await response.text();

    console.error("OPENAI STATUS:", response.status);

    console.error(err);

    return res.status(500).json({

        success:false,

        error:err,

        text:""

    });

}
    const data = await response.json();

console.log("================================");
console.log("OPENAI JSON COMPLETO");
console.dir(data,{depth:null});
console.log("================================");

   const text = data?.choices?.[0]?.message?.content?.trim();
if (tipo === "seo_workspace") {

  try {

    let clean = String(text).trim();

    clean = clean.replace(/^```json/i, "");
    clean = clean.replace(/^```/i, "");
    clean = clean.replace(/```$/i, "");
    clean = clean.replace(/\r/g, "").replace(/\t/g, "").trim();

    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
      clean = clean.slice(start, end + 1);
    }

    const parsed = JSON.parse(clean);

    global.__tubexCache.set(cacheKey, {
      text: parsed,
      timestamp: Date.now()
    });

    return res.status(200).json({
      success: true,
      ...parsed
    });

  } catch (err) {

    console.error("💥 SEO WORKSPACE JSON:", err);
    console.error(text);

    return res.status(500).json({
      success: false,
      error: "invalid_json"
    });

  }

}


if (tipo === "viral_content") {

  try {

    const parsed = JSON.parse(text);

    global.__tubexCache.set(cacheKey,{
      text: parsed,
      timestamp: Date.now()
    });

    return res.status(200).json({
      success:true,
      ...parsed
    });

  } catch(err){

    console.error(err);

    return res.status(500).json({
      success:false,
      error:"invalid_json"
    });

  }

}
console.log("================================");
console.log("🤖 OPENAI RESPONSE");
console.log(text);
console.log("================================");

if (!text) {
  return res.status(500).json({
    success:false,
    error:"empty_response",
    text:""
  });
}


if (tipo === "channel_analysis") {

  try {

    const parsed = JSON.parse(text);

    parsed.subscribers =
      Number(
        context.subscribers || 0
      );

    parsed.views30Days =
      Number(
        context.views30 || 0
      );

    global.__tubexCache.set(cacheKey,{
      text: parsed,
      timestamp: Date.now()
    });

    return res.status(200).json({
      success:true,
      ...parsed
    });

  } catch(err){
    console.error(err);

    return res.status(500).json({
      success:false,
      error:"invalid_json"
    });

  }

}


// ======================================================
// 🧠 NICHE JSON PARSER
// ======================================================

if (tipo === "niche") {

  try {

    let clean = String(text).trim();

// remove markdown
clean = clean.replace(/^```json/i, "");
clean = clean.replace(/^```/i, "");
clean = clean.replace(/```$/i, "");
clean = clean
  .replace(/\r/g, "")
  .replace(/\t/g, "")
  .trim();
// extrai apenas o JSON
const start = clean.indexOf("{");
const end = clean.lastIndexOf("}");

if (start !== -1 && end !== -1) {
    clean = clean.slice(start, end + 1);
}

console.log("🧹 JSON LIMPO:");
console.log(clean);

let parsed;

try {

    parsed = JSON.parse(clean);
if (
    typeof parsed.niche !== "string" ||
    !parsed.niche.trim()
) {
    throw new Error("Campo niche inválido");
}

parsed.confidence = Number(parsed.confidence || 0);

if (isNaN(parsed.confidence))
    parsed.confidence = 0;

parsed.confidence = Math.max(
    0,
    Math.min(100, parsed.confidence)
);

parsed.reason = String(parsed.reason || "");
parsed.niche = parsed.niche.trim();
parsed.reason = parsed.reason.trim();

}
catch(err){

    console.error("💥 JSON INVÁLIDO");
    console.error(clean);

    throw err;

}

    global.__tubexCache.set(
      cacheKey,
      {
        text: parsed,
        timestamp: Date.now()
      }
    );

return res.status(200).json({

    success:true,

    niche:
        parsed.niche,

    confidence:
        parsed.confidence,

    reason:
        parsed.reason

});

  } catch (e) {

    console.error(
      "💥 NICHE JSON:",
      e
    );

    return res.status(200).json({

      success: true,

      niche:
        "Conteúdo Geral",

      confidence: 0,

      reason:
        "Falha ao interpretar resposta"

    });

  }

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
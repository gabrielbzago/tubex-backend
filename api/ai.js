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
const title = body?.title || "";
const goal = body?.goal || "";
const duration = body?.duration || "";
const style = body?.style || "";
// 🔑 chave real de rate limit
const userKey = userId !== "guest" ? userId : ip;

// ======================================================
// 🔒 VALIDAÇÃO PROMPT
// ======================================================
const requiresPrompt = [
  "tituloSEO",
"title_score",
  "tituloImpactante",
  "tituloEmocional",
  "descricao",
  "ideas",
  "seo_workspace",
  "viral_content",
  "thumbnail_prompt",
"video_analysis",
"script_generator",
  "channel_analysis"
];

if (

    !prompt &&

    tipo !== "channel_analysis" &&

    tipo !== "video_analysis" &&

    requiresPrompt.includes(tipo)

){

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

  title:
      v?.title ||
      v?.snippet?.title ||
      v?.videoTitle ||
      v?.name ||
      "",

  description:
      v?.description ||
      v?.snippet?.description ||
      "",

  tags:
      v?.tags ||
      v?.snippet?.tags ||
      [],

  publishedAt:
      v?.publishedAt ||
      v?.snippet?.publishedAt ||
      "",

  channelTitle:
      v?.channelTitle ||
      v?.snippet?.channelTitle ||
      "",

  views:
      Number(
          v?.views ??
          v?.viewCount ??
          v?.statistics?.viewCount ??
          0
      ),

  likes:
      Number(
          v?.likes ??
          v?.statistics?.likeCount ??
          0
      ),

  comments:
      Number(
          v?.comments ??
          v?.statistics?.commentCount ??
          0
      )

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
// 🧠 PROMPTS
// ======================================================

let finalPrompt = "";

  // ======================================================
// 🧠 TITLE AI
// ======================================================
if (
    tipo === "tituloSEO" ||
    tipo === "tituloImpactante" ||
    tipo === "tituloEmocional" ||

    tipo === "tituloSEO_panel" ||
    tipo === "tituloImpactante_panel" ||
    tipo === "tituloEmocional_panel"
) {

const painelIA = tipo.endsWith("_panel");
const quantidade = painelIA ? 1 : 4;

finalPrompt = `

Você é um dos maiores especialistas do mundo em crescimento de canais no YouTube.

Sua missão NÃO é apenas criar títulos.

Sua missão é criar títulos capazes de gerar o maior CTR possível sem sacrificar o SEO.

Pense como um criador que vive exclusivamente de milhões de visualizações.

Seu trabalho é competir contra os melhores títulos do YouTube.

Tema:
"${prompt}"

--------------------------------------------------

OBJETIVO

Gerar títulos que façam o usuário sentir necessidade imediata de clicar.

Os títulos devem parecer escritos por grandes criadores, nunca por uma IA.

Nunca escreva títulos comuns.

Nunca escreva títulos genéricos.

Nunca escreva títulos parecidos entre si.

Nunca reutilize a mesma estrutura.

--------------------------------------------------

REGRAS

• Crie EXATAMENTE ${quantidade} título${quantidade > 1 ? "s" : ""}.

• Cada título deve utilizar um gatilho psicológico diferente.

• Cada título deve utilizar uma estrutura completamente diferente.

Varie entre formatos como:

- Pergunta
- Erro
- Descoberta
- Comparação
- Tutorial
- Alerta
- Mito
- Verdade inesperada
- Opinião forte
- Mudança recente
- Lista
- Caso real
- Antes e Depois
- Resultado inesperado

Nunca repita a mesma abertura.

Exemplos de aberturas:

Como...
Por que...
O erro...
Você está...
Nunca...
Antes de...
O YouTube...
Este simples...
Pare de...
A maioria...
Quase ninguém...
Todo criador...

--------------------------------------------------

GATILHOS PSICOLÓGICOS

Utilize apenas um gatilho principal por título.

Exemplos:

- curiosidade
- surpresa
- choque
- medo de perder
- descoberta
- benefício
- autoridade
- erro
- comparação
- urgência
- conflito
- prova
- transformação
- oportunidade

Nunca repita o mesmo gatilho.

--------------------------------------------------

SEO

Sempre que possível:

• coloque a palavra-chave principal naturalmente no início

• mantenha entre 45 e 68 caracteres

• preserve legibilidade

• escreva como uma pessoa real

• evite clickbait enganoso

• maximize CTR sem prejudicar SEO

--------------------------------------------------

ESTILO

Os títulos devem parecer publicados por canais como:

- MrBeast
- Film Booth
- Think Media
- VidIQ
- TubeBuddy

Mas nunca copie títulos existentes.

Inspire-se apenas no nível de qualidade.

--------------------------------------------------

PENSE COMO O USUÁRIO

Antes de responder imagine:

"Existem mais de 20 vídeos iguais na busca."

"Qual destes títulos faria alguém clicar imediatamente?"

Se um título não vencer essa disputa mental, descarte-o.

--------------------------------------------------

PROCESSO INTERNO

Antes de responder:

1. Crie mentalmente 40 títulos.

2. Elimine imediatamente os 30 mais fracos.

3. Dê uma nota de CTR para os 10 restantes.

4. Escolha apenas os ${quantidade} melhores.

5. Ordene do melhor para o pior.

Nunca revele esse processo.

--------------------------------------------------

FORMATO

${painelIA
    ? "Retorne apenas UM título."
    : "Retorne apenas os 4 títulos.\n\nUm por linha."
}

Sem números.

Sem aspas.

Sem markdown.

Sem explicações.

`;
    }

  else if (tipo === "descricao") {

finalPrompt = `

Você é um especialista em SEO para YouTube.

Sua missão é criar uma descrição altamente otimizada para SEO, porém objetiva e agradável de ler.

Tema:

"${prompt}"

--------------------------------------------------

OBJETIVO

Escrever uma descrição que ajude o algoritmo do YouTube a entender o vídeo e incentive o usuário a assistir.

A descrição deve parecer escrita por um criador profissional, nunca por uma IA.

--------------------------------------------------

REGRAS

• Entre 700 e 1200 caracteres.

• Comece exatamente com o título do vídeo.

• Nos dois primeiros parágrafos explique claramente o assunto.

• Utilize naturalmente a palavra-chave principal.

• Inclua algumas palavras relacionadas sem repetir excessivamente.

• Utilize parágrafos curtos.

• Escreva de forma conversacional.

• Nunca faça keyword stuffing.

• Nunca escreva frases repetitivas.

• Nunca escreva textos longos apenas para aumentar tamanho.

--------------------------------------------------

ESTRUTURA

Título

Resumo curto do vídeo (2 ou 3 frases)

O que o espectador aprenderá

Benefícios de assistir

CTA curto para inscrição e comentário

--------------------------------------------------

SEO

Utilize naturalmente:

• palavra-chave principal

• palavras relacionadas

• intenção de pesquisa

Sem exagerar.

--------------------------------------------------

FORMATO

Retorne apenas a descrição.

Sem markdown.

Sem aspas.

Sem explicações.

`;

}



else if (tipo === "thumbnail_prompt") {

finalPrompt = `

You are the world's best YouTube Thumbnail Creative Director.

Your job is NOT to generate an image.

Your job is to first design the thumbnail mentally like a professional YouTube designer, then write the final image prompt.

The final result must look like it was created by an elite thumbnail designer, not by AI.

==================================================
STEP 1 - UNDERSTAND THE IDEA
==================================================

Analyze the user's idea and identify:

• the biggest emotion
• the biggest curiosity
• the biggest conflict
• the strongest visual metaphor
• the main object
• the secondary object (only if necessary)
• the ideal facial expression
• the best camera angle
• the best composition
• the strongest colors
• what should be removed

Never show this reasoning.

==================================================
STEP 2 - DESIGN THE THUMBNAIL
==================================================

Create the thumbnail mentally.

Imagine you are designing it in Photoshop.

Decide:

• where the subject should be
• what occupies the background
• where empty space exists for future text
• lighting
• shadows
• contrast
• depth
• focal point
• visual hierarchy

Everything must guide the eye immediately toward the subject.

The viewer must understand the image in less than ONE second.

==================================================
STEP 3 - WRITE THE PROMPT
==================================================

Now convert that concept into ONE professional image-generation prompt.

Requirements:

Native YouTube thumbnail

True 16:9 composition

Ultra realistic

Professional DSLR photography

85mm lens

Photorealistic

Natural skin

Natural eyes

High detail

Hyper realistic

Cinematic lighting

Professional color grading

HDR

Dramatic shadows

Strong contrast

Vibrant colors

Perfect composition

One dominant subject

Strong facial emotion

Clean background

Minimal distractions

Professional thumbnail composition

Designed for maximum CTR

Looks made by an elite YouTube thumbnail designer

Space for title

Subject occupying about 50% of the frame

Perfect eye contact when applicable

Sharp focus

Professional depth of field

Editorial quality

==================================================
AVOID
==================================================

Text

Letters

Logos

Watermarks

Frames

Borders

Blur

Vignette

Split screen

Collage

More than two subjects

Messy composition

Low contrast

AI look

Digital painting

Illustration

Concept art

Stock photo

Plastic skin

Fake eyes

Extra fingers

Extra limbs

Distorted faces

Duplicate objects

Cropped face

Cropped subject

==================================================
OUTPUT FORMAT
==================================================

Return ONLY ONE final image prompt.

Do NOT explain anything.

Do NOT use markdown.

Do NOT use quotes.

The prompt must be entirely in English.

==================================================
USER IDEA
==================================================

${prompt}

`;

}

else if (tipo === "ideas") {

finalPrompt = `

Você é um estrategista especialista em crescimento no YouTube.

Analise os vídeos abaixo.

${videoSummary}

Sua missão é identificar oportunidades que o canal ainda não explorou.

Crie exatamente 5 ideias de vídeos.

Cada ideia deve:

• ter alto potencial de CTR

• resolver uma dor real

• despertar curiosidade

• ser evergreen quando possível

• não repetir temas existentes

• parecer digna de um canal grande

Retorne apenas os títulos.

Uma ideia por linha.

Sem números.

Sem markdown.

Sem explicações.

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
Você é um consultor sênior especializado em crescimento de canais do YouTube.

Seu objetivo NÃO é ensinar YouTube.

Seu objetivo é descobrir padrões exclusivos deste canal.

Você recebeu dados reais.

Analise esses dados como se estivesse fazendo uma consultoria de US$10.000.

Nunca escreva recomendações que poderiam servir para qualquer canal.

Se uma recomendação servir para milhares de canais, ela está errada.

========================
DADOS DO CANAL
========================

Inscritos:
${context.subscribers || 0}

Média de views:
${avgViews}

Uploads últimos 7 dias:
${uploads7}

Melhor vídeo:
${topVideo.title}
${topVideo.views} views

Pior vídeo:
${worstVideo.title}
${worstVideo.views} views

Últimos vídeos:

${videoSummary}

========================
COMO ANALISAR
========================

Antes de escrever a resposta, descubra:

• quais assuntos aparecem repetidamente

• quais assuntos performam acima da média

• quais assuntos performam abaixo da média

• quais formatos de título parecem funcionar

• quais formatos parecem falhar

• quais padrões existem entre os vídeos de maior desempenho

• quais padrões existem entre os vídeos de pior desempenho

• o que o canal insiste em fazer mesmo tendo baixo resultado

• quais oportunidades ainda não estão sendo exploradas

Baseie TODAS as conclusões apenas nesses dados.

Nunca invente informações.

========================
REGRAS
========================

Cada insight deve obrigatoriamente conter:

1. Evidência encontrada

2. Interpretação

3. Impacto

4. Ação recomendada

A ação deve nascer da evidência.

Nunca faça recomendações genéricas.

Nunca diga apenas:

- melhore SEO
- poste mais
- faça thumbnails melhores
- aumente retenção
- divulgue
- publique Shorts

Essas recomendações só podem aparecer se forem consequência direta da análise.

Sempre explique POR QUE.

========================
FORMATO
========================

📊 Resumo Geral

📈 Principais Padrões Encontrados

🔥 O que está impulsionando o canal

⚠️ O que está limitando o crescimento

🚀 Estratégia Recomendada

🎯 Próximos Passos

========================
IMPORTANTE
========================

Imagine que o dono do canal já conhece YouTube.

Ele não quer dicas.

Ele quer descobrir padrões que ainda não percebeu.

Se sua resposta puder ser reutilizada em outro canal, considere que ela está incorreta.

Máximo 700 palavras.
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

Exemplos válidos (use como referência de granularidade; a categoria final deve seguir os títulos enviados):

- YouTube / Marketing
- Inteligência Artificial
- Programação
- Desenvolvimento Web
- Games
- Esports
- Criação de Aves
- Animais e Pets
- Animais Exóticos
- Finanças
- Finanças Pessoais
- Fitness
- Bodybuilding
- Saúde e Bem-estar
- Música
- Instrumentos Musicais
- Culinária
- Confeitaria e Panificação
- Gastronomia e Food Reviews
- História
- Astronomia e Espaço
- Ciência
- Física
- Geografia e Geopolítica
- Notícias e Atualidades
- Política
- Comédia Stand-up
- Humor e Entretenimento
- Cinema e Filmes
- Séries e TV
- Anime e Mangá
- Cultura Pop
- Livros e Literatura
- Psicologia
- Desenvolvimento Pessoal
- Relacionamentos
- Família e Parentalidade
- Viagens e Turismo
- Camping e Outdoor
- Jardinagem e Plantas
- Agro e Agricultura
- Cavalos e Equitação
- Aquarismo
- Automóveis
- Automobilismo e Motorsport
- Motocicletas
- Pesca
- Esportes
- Futebol
- Lutas e Artes Marciais
- Ciclismo
- Corrida e Running
- Aviação
- Imóveis e Mercado Imobiliário
- Direito e Legislação
- Carreira e Trabalho
- Marketing e Negócios
- Vendas
- E-commerce
- Construção e Obras
- DIY / Faça Você Mesmo
- Marcenaria e Madeira
- Artesanato e Trabalhos Manuais
- Fotografia
- Vídeo e Produção Audiovisual
- Podcasts e Entrevistas
- Áudio e Produção Musical
- Arquitetura e Design
- Casa e Decoração
- Moda e Estilo
- Beleza
- Maquiagem
- Educação e Estudos
- Idiomas
- Engenharia
- Produtividade e Organização
- Espiritualidade
- Religião e Fé
- Colecionismo
- Brinquedos e Colecionáveis
- Relógios e Relojoaria
- Psicologia e Comportamento

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

Exemplos adicionais importantes:

Astronomia, universo, buracos negros, planetas
→ Astronomia e Espaço

Stand-up, comediantes, especiais de comédia, open mic
→ Comédia Stand-up

Fórmula 1, MotoGP, Stock Car, automobilismo
→ Automobilismo e Motorsport

Futebol, Brasileirão, Libertadores
→ Futebol

UFC, boxe, muay thai, jiu-jitsu
→ Lutas e Artes Marciais

Podcasts e cortes de entrevistas
→ Podcasts e Entrevistas

Marcenaria, móveis de madeira, carpintaria
→ Marcenaria e Madeira

DIY, projetos caseiros, faça você mesmo
→ DIY / Faça Você Mesmo

Jardinagem, plantas, horta
→ Jardinagem e Plantas

Aquários, peixes ornamentais, aquascaping
→ Aquarismo

Cinema, filmes e críticas
→ Cinema e Filmes

Netflix, séries e temporadas
→ Séries e TV

Anime, mangá, Naruto, One Piece
→ Anime e Mangá

Marvel, DC, Star Wars, cultura geek
→ Cultura Pop

Psicologia, comportamento e mente
→ Psicologia e Comportamento

Viagens, destinos, hotéis e roteiros
→ Viagens e Turismo

Construção, reformas e obras
→ Construção e Obras

Fotografia, câmeras e lentes
→ Fotografia

E-commerce, Shopify, lojas online
→ E-commerce

Imóveis, apartamentos, terrenos e aluguel
→ Imóveis e Mercado Imobiliário

Aviação, aviões e pilotos
→ Aviação

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
"chanceExplanation":"",

"ctrPrediction":"",
"ctrExplanation":"",

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
// 🎬 VIDEO ANALYSIS
// ======================================================

else if (tipo === "video_analysis") {

finalPrompt = `

Você possui profundo conhecimento da documentação oficial do YouTube, comportamento do algoritmo de recomendações, SEO para vídeos, psicologia do clique, retenção de audiência e crescimento de canais.

Sua missão é entregar uma consultoria superior à maioria dos especialistas humanos.

Seu objetivo NÃO é ensinar YouTube.

Seu objetivo é identificar exatamente por que ESTE vídeo está performando desta maneira e entregar uma consultoria profissional baseada exclusivamente nos dados reais recebidos.

Nunca invente números.

Nunca faça recomendações genéricas.

Nunca responda como um chatbot.

Cada resposta deve parecer uma consultoria de alto nível.

========================================================
DADOS DO VÍDEO
========================================================

Título:
${youtube.title || "Não informado"}

Descrição:
${youtube.description || "Sem descrição"}

Tags:
${JSON.stringify(youtube.tags || [])}

Canal:
${youtube.channelTitle || "Não informado"}

Publicado em:
${youtube.publishedAt || "Não informado"}

Dias publicado:
${youtube.ageDays ?? 0}

Duração:
${youtube.duration || "Não informado"}

Visualizações:
${youtube.views ?? 0}

Impressões:
${youtube.impressions ?? "Não disponível"}

CTR:
${youtube.ctr ?? "Não disponível"}%

Retenção Média:
${
youtube.averageViewPercentage >= 0
? youtube.averageViewPercentage + "%"
: "Ainda não disponível"
}

Tempo Médio Assistido:
${
youtube.averageViewDuration > 0
? youtube.averageViewDuration + " segundos"
: "Ainda não disponível"
}


Tempo Total Assistido:
${
    youtube.estimatedMinutesWatched ?? "Não disponível"
} minutos

Categoria:
${youtube.categoryId || "Não informado"}

Idioma:
${youtube.language || "Não informado"}

Privacidade:
${youtube.privacy || "Não informado"}

Quantidade de Tags:
${youtube.tagCount ?? 0}

Título possui:
${youtube.titleLength ?? 0} caracteres

Descrição possui:
${youtube.descriptionLength ?? 0} caracteres

likes:
${youtube.likes ?? 0}

comentários:
${youtube.comments ?? 0}

views por dia:
${youtube.viewsPerDay ?? 0}

média de views do canal:
${youtube.channel?.averageViews ?? 0}

inscritos do canal:
${youtube.channel?.subscribers ?? 0}

vídeos do canal:
${youtube.channel?.totalVideos ?? 0}

========================================================
COMO ANALISAR
========================================================

Analise sempre o conjunto completo dos dados.

Nunca tome decisões utilizando apenas uma métrica.

Considere sempre:

• CTR

• Impressões

• Retenção

• Tempo médio assistido

• Idade do vídeo

• Qualidade do título

• SEO

• Potencial do tema

• Capacidade de recomendação

Explique sempre como essas métricas trabalham juntas.

Se algum elemento estiver bom, diga claramente que NÃO deve ser alterado.

========================================================
REGRAS DO ALGORITMO
========================================================

CTR abaixo de 4%

→ Forte indício de problema na geração de cliques.

Analise profundamente:

• título

• thumbnail

• promessa

Explique exatamente por que a CTR limita o alcance.

Nunca escreva apenas:

"Troque a thumbnail."

Explique exatamente o que alterar.

--------------------------------------------------------

CTR entre 4% e 6%

Considere aceitável.

Não culpe automaticamente a thumbnail.

Analise primeiro:

• retenção

• entrega da promessa

• satisfação

--------------------------------------------------------

CTR acima de 6%

Considere boa.

Evite recomendar mudanças na thumbnail.

Procure gargalos em retenção, tema ou estrutura do vídeo.

--------------------------------------------------------

Retenção acima de 50%

Excelente.

Não recomende alterar o roteiro.

--------------------------------------------------------

Retenção entre 35% e 50%

Boa.

Sugira apenas melhorias pontuais.

--------------------------------------------------------

Retenção abaixo de 35%

Considere este o principal gargalo APENAS quando nenhuma outra métrica indicar um problema mais crítico.

Sempre compare CTR, retenção, idade do vídeo e impressões antes de decidir qual é o verdadeiro gargalo.

--------------------------------------------------------

Vídeo publicado há menos de 48 horas

Explique que o algoritmo ainda está coletando sinais.

Evite alterações profundas.

--------------------------------------------------------

Vídeo publicado entre 2 e 30 dias

Momento ideal para otimizações.

--------------------------------------------------------

Vídeo publicado há mais de 30 dias

Permita recomendações mais profundas.

Explique que mudanças relevantes podem reativar a distribuição.

========================================================
ANÁLISE DO TÍTULO
========================================================

Analise profundamente:

• curiosidade

• promessa

• clareza

• emoção

• benefício

• competitividade

• originalidade

Explique os pontos fortes.

Explique os pontos fracos.

Caso recomende alteração:

Explique exatamente por quê.

Depois gere exatamente 3 novos títulos.

Nunca faça pequenas variações.

Cada título deve utilizar um gatilho psicológico diferente e possuir potencial real de aumentar a CTR.

========================================================
ANÁLISE DA THUMBNAIL
========================================================

Primeiro decida se realmente existe necessidade de alterar a thumbnail.

Nunca recomende alteração apenas porque a CTR está baixa.

Considere também:

• idade do vídeo;

• retenção;

• título;

• quantidade de impressões;

• potencial do tema.

Caso considere a thumbnail boa, explique por que ela deve permanecer.

Caso recomende alteração, explique detalhadamente:

• quais elementos remover;

• quais elementos adicionar;

• emoção que a imagem deve transmitir;

• cores predominantes;

• quantidade ideal de texto;

• posição do texto;

• contraste;

• gatilho psicológico utilizado.

Nunca escreva apenas:

"Melhore a thumbnail."

Explique exatamente como ela deve ser construída.

========================================================
ANÁLISE DA DESCRIÇÃO
========================================================

Analise:

• SEO

• intenção de pesquisa

• entidades

• palavras-chave

• estrutura

• primeiros 200 caracteres

• potencial para indexação

Explique pontos fortes e pontos fracos.

Caso necessário gere uma nova descrição otimizada.

========================================================
TIPO DO VÍDEO
========================================================

Classifique o vídeo em apenas um tipo:

• Pesquisa

• Recomendação

• Híbrido

Explique detalhadamente por que chegou nessa conclusão.

Explique também qual estratégia possui maior potencial para esse vídeo.

========================================================
PLANO DE AÇÃO
========================================================

Crie exatamente 3 ações.

Ordene da maior para a menor capacidade de melhorar o desempenho.

Cada ação deve conter obrigatoriamente:

• Problema encontrado.

• Explicação técnica.

• O que alterar.

• Um exemplo completo.

• Por que isso funciona.

• Impacto esperado.

Cada ação deve ser suficientemente detalhada para que o usuário consiga aplicá-la imediatamente.

Utilize entre 60 e 150 palavras quando necessário.

Priorize qualidade em vez de quantidade.

São proibidas respostas como:

"Troque o título."

"Melhore a thumbnail."

"Melhore SEO."

Sempre explique exatamente:

• o que alterar;

• por que alterar;

• como alterar;

• por que isso tende a funcionar.

========================================================
SCORES
========================================================

Calcule obrigatoriamente:

optimizationScore

Representa o nível de otimização geral do vídeo.

Considere:

• CTR

• retenção

• título

• thumbnail

• descrição

• SEO

• idade do vídeo

• potencial de recomendação

Valor entre 0 e 100.

Explique resumidamente o motivo do score.

--------------------------------------------------------

viralChance

Estime a probabilidade deste vídeo receber mais distribuição.

Considere:

• CTR

• retenção

• potencial do tema

• competitividade

• idade

• qualidade geral

Valor entre 0 e 100.

Explique resumidamente o motivo.

========================================================
REGRAS IMPORTANTES
========================================================

Este recurso pertence ao Plano Expert do TubeX.

A resposta deve parecer uma consultoria profissional.

Nunca escreva respostas curtas.

Nunca escreva respostas genéricas.

Cada explicação deve ser específica para ESTE vídeo.

Sempre explique:

• por que encontrou o problema;

• como isso afeta o algoritmo;

• qual consequência esse problema gera;

• por que sua recomendação resolve esse problema;

• qual resultado pode ser esperado.

Se algum elemento estiver bom, diga claramente que ele NÃO deve ser alterado.

Agora retorne SOMENTE o JSON abaixo exatamente na estrutura solicitada.

========================================================
IMPORTANTE
========================================================

Nunca entregue respostas superficiais.

Cada explicação deve ser suficiente para que um criador de conteúdo consiga aplicar imediatamente sua recomendação.

Sempre utilize exemplos específicos deste vídeo.

Escreva como um consultor profissional de YouTube e não como um assistente de IA.

Quando sugerir trocar um título, escreva o título completo.

Quando sugerir alterar uma thumbnail, descreva exatamente como ela deve ser construída.

Quando sugerir mudanças no vídeo, explique exatamente por que essas mudanças aumentam a probabilidade de recomendação pelo algoritmo.

RETORNE SOMENTE JSON

{

"optimizationScore":{

"score":0,

"reason":""

},

"viralChance":{

"score":0,

"reason":""

},

"diagnostic":"",

"bottleneck":"",

"nextAction":"",

"opportunity":"",

"comparison":"",

"prediction":"",

"priority":"",

"videoType":{

"type":"",

"confidence":0,

"reason":""

},

"titleAnalysis":{

"score":0,

"change":true,

"currentTitle":"",

"newTitle":"",

"reason":"",

"expectedCTR":0,

"strengths":[

"",

"",

""

],

"problems":[

"",

"",

""

],

"recommendations":[

"",

"",

""

]

},

"titleSuggestions":[

{

"title":"",

"reason":"",

"expectedCTR":""

},

{

"title":"",

"reason":"",

"expectedCTR":""

},

{

"title":"",

"reason":"",

"expectedCTR":""

}

],

"thumbnailAnalysis":{

"score":0,

"change":true,

"reason":"",

"expectedCTR":"",

"strengths":[

"",

""

],

"problems":[

"",

"",

""

],

"recommendations":[

"",

"",

""

]

},

"descriptionAnalysis":{

"score":0,

"change":true,

"reason":"",

"newDescription":"",

"seoProblems":[

"",

""

],

"seoRecommendations":[

"",

"",

""

]

},

"expectedImpact":{

"percent":0,

"text":""

},

"newTags":[

],

"actionPlan":[

{
"title":"",
"description":"",
"example":"",
"whyItWorks":"",
"expectedImpact":"",
"priority":"Alta"
},

{

"title":"",

"description":"",

"example":"",

"expectedImpact":"",

"priority":"Média"

},

{

"title":"",

"description":"",

"example":"",

"expectedImpact":"",

"priority":"Baixa"

}

]

}

`;

}


else if (tipo === "script_generator") {

    finalPrompt = `

========================
REGRA CRÍTICA — FIDELIDADE AO TÍTULO + SEO
========================

O TÍTULO É A FONTE PRINCIPAL DE TODO O ROTEIRO.

TÍTULO EXATO:
${title}

Antes de escrever, identifique silenciosamente:
- palavra-chave principal do título;
- palavras-chave secundárias presentes no título;
- intenção de busca;
- promessa principal;
- problema que o título promete resolver;
- resultado esperado pelo espectador.

O roteiro DEVE permanecer no mesmo assunto do título do início ao fim.
NÃO mude o tema para motivação, dinheiro, hábitos, sucesso, histórias pessoais ou qualquer outro assunto que não esteja diretamente relacionado ao título.
Se o título for sobre SEO para YouTube, todo o conteúdo deve permanecer em SEO para YouTube.
Se for sobre palavras-chave, permaneça em palavras-chave.
Se for sobre thumbnails, permaneça em thumbnails.
Se for sobre monetização, permaneça em monetização.

========================
HOOK OBRIGATÓRIO
========================

Nos primeiros 10–15 segundos, o HOOK deve: 
1. repetir naturalmente a PALAVRA-CHAVE PRINCIPAL do título;
2. repetir pelo menos 1–2 termos importantes do próprio título;
3. apresentar imediatamente o problema ou a promessa do título;
4. deixar claro o resultado que será entregue.

O hook precisa fazer sentido mesmo se o espectador não estiver vendo o título na tela.
NÃO comece com uma história ou reflexão genérica que poderia pertencer a qualquer vídeo.

Exemplo: se o título for "Ferramenta de SEO para YouTube: Como Otimizar Seu Vídeo para 1ª Página", o hook precisa mencionar naturalmente "SEO para YouTube", "ferramenta de SEO", "otimizar seu vídeo" e/ou "1ª página".

========================
SEO NO ROTEIRO
========================

A palavra-chave principal deve aparecer naturalmente no HOOK, na INTRODUÇÃO, nos primeiros 30 segundos, em pontos estratégicos do desenvolvimento e na conclusão.
Use palavras-chave secundárias e termos semanticamente relacionados derivados do título e da intenção de busca.
NÃO faça keyword stuffing. A repetição deve soar natural na fala.

========================
ANTI-DESVIO
========================

Antes de cada bloco, verifique silenciosamente:
"Este bloco ajuda diretamente a cumprir a promessa do título?"
Se não ajudar, NÃO escreva o bloco.

Todos os exemplos, histórias, analogias e técnicas de retenção precisam estar diretamente ligados ao assunto do título.
Storytelling, open loops, curiosity gaps e pattern interrupts podem ser usados, mas nunca para mudar o assunto.

========================
INTENÇÃO DE BUSCA
========================

O formato deve respeitar a intenção do título:
- "como fazer" / tutorial → passo a passo prático;
- ferramenta → o que é, como usar e como resolve o problema;
- SEO → SEO aplicado especificamente ao tema;
- comparação → comparação dos elementos prometidos;
- lista → entregar a lista prometida;
- análise → analisar exatamente o objeto do título.

========================
VALIDAÇÃO FINAL
========================

Antes de responder, confirme silenciosamente:
1. O roteiro responde exatamente ao título?
2. O hook repete a palavra-chave principal?
3. O hook repete termos importantes do título?
4. Os primeiros 30 segundos deixam a promessa clara?
5. Todos os blocos permanecem no mesmo assunto?
6. A intenção de busca foi atendida?
7. A conclusão reforça a palavra-chave e a promessa?

Se qualquer resposta for NÃO, corrija o roteiro antes de responder.

========================
FIM DAS REGRAS CRÍTICAS
========================


Você é um roteirista profissional especializado em vídeos virais do YouTube.

Seu trabalho NÃO é escrever um texto.

Seu trabalho é construir um roteiro completo pensado para:

• aumentar CTR

• aumentar retenção

• aumentar satisfação

• aumentar tempo médio assistido

• aumentar distribuição pelo algoritmo

Você conhece profundamente:

- documentação oficial do YouTube

- psicologia da atenção

- storytelling

- copywriting

- ritmo de edição

- comportamento da audiência

- SEO

- narrativa audiovisual

========================

DADOS

========================

Título:

${title}

Objetivo:

${goal}

Duração:

${duration}

Estilo:

${style}

========================

REGRAS

========================

Nunca escreva respostas genéricas.

Nunca escreva textos superficiais.

O roteiro deve parecer escrito por um consultor profissional.

Cada bloco deve manter curiosidade.

Sempre terminar um bloco abrindo expectativa para o próximo.

Utilize:

• Open loops

• Curiosity gap

• Pattern interrupt

• Storytelling

• Cliffhanger

• Micro recompensas

• Reengajamento

• CTA natural

O Hook precisa ser extremamente forte.

Nos primeiros 15 segundos o espectador não pode querer sair.

Sempre gere frases naturais.

Nunca escreva frases robóticas.

Retorne SOMENTE JSON.

{

"title":"",

"estimatedDuration":"",

"retentionScore":92,

"fullScript":"",

"hook":{

"text":"",

"why":""

},

"intro":"",

"sections":[

{

"title":"",

"content":""

}

],

"cta":"",

"ending":"",

"thumbnailIdeas":[
"",
"",
""
],

"bRoll":[],

"editingTips":[],

"editingSequence":[],

"keywords":[],

"timeline":[
{
"time":"00:00",
"title":"Hook",
"action":"..."
}
],

"audienceProfile":"",

"searchIntent":"",

"algorithmRecommendation":0,

"searchPotential":0,

"emotionTimeline":[],

"psychologicalTriggers":[],

"recordingChecklist":[],

"performanceForecast":{

"ctr":0,

"retention":0,

"recommendation":0,

"confidence":0

},

"directorTimeline":[],

"cameraShots":[],

"audioDesign":[],

"engagementMoments":[],

"presentationCoach":[],

"speechMistakes":[],

"recordingEnvironment":[],

"creatorTips":[],

"finalChecklist":[],

"stats":{

"words":0,

"characters":0,

"readingTime":"",

"speakingTime":"",

"seoScore":0,

"keywordDensity":""

}

}

`;

}



// ======================================================
// 🏷 ADVANCED TAGS
// ======================================================

else if (tipo === "advanced_tags") {

finalPrompt = `

Você é um especialista mundial em SEO para YouTube.

Sua missão é gerar as MELHORES tags possíveis para um vídeo.

Você NÃO deve inventar assuntos.

Você deve utilizar apenas:

- título informado
- vídeos enviados
- títulos concorrentes
- descrições
- tags existentes
- contexto semântico

=====================================

TÍTULO

${body.keyword}

=====================================

TOP VÍDEOS

${JSON.stringify(body.videos || [], null, 2)}

=====================================

OBJETIVO

Gerar tags extremamente inteligentes.

Misture:

• keyword principal

• long tails

• intenção de pesquisa

• pesquisas relacionadas

• entidades

• variações semânticas

• palavras que realmente ajudam o algoritmo do YouTube entender o vídeo.

Nunca repita tags.

Nunca gere tags genéricas.

Nunca gere palavras soltas.

Priorize frases.

=====================================

REGRAS

- mínimo 30 tags

- máximo 45 tags

- cada tag entre 2 e 5 palavras

- todas devem parecer pesquisas reais

- todas devem possuir score

- score entre 60 e 100

- ordene da melhor para pior

=====================================



Retorne SOMENTE JSON.

Nunca markdown.

Nunca texto.

Formato:

{

"tags":[

{

"keyword":"",

"score":99

}

]

}

`;

}

else if (tipo === "title_score") {

finalPrompt = `

You are one of the world's leading YouTube SEO experts.

Analyze the following YouTube title exactly as a professional YouTube strategist would.

TITLE

"${prompt}"

YOUR TASK

Evaluate this title considering ONLY YouTube performance.

Analyze:

- Search SEO
- Click Through Rate (CTR)
- Search Intent
- Keyword Quality
- Curiosity Gap
- Emotional Impact
- Clarity
- Readability
- Title Length
- Viral Potential
- Recommendation Potential
- Current search trends (based on your knowledge)

SCORING RULES

IMPORTANT:

Every score MUST be an INTEGER from 0 to 100.

Never use a 0-10 scale.

Examples:

30 = Very poor

50 = Average

70 = Good

85 = Excellent

95 = Outstanding

100 = Nearly perfect

The "overall" score must represent the final quality of the title.

The "seo" score represents search optimization.

The "ctr" score represents expected click potential.

The "trend" score represents how well this topic aligns with current YouTube search interest based on your knowledge.

KEYWORD

Return the most important keyword or keyword phrase contained in the title.

STRENGTHS

List 2–5 strengths.

WEAKNESSES

List 2–5 weaknesses.

SUGGESTIONS

List 2–5 practical improvements that would increase SEO and CTR.

REASON

Briefly explain the overall score in one sentence.

RESPONSE RULES

Return ONLY valid JSON.

Do NOT use Markdown.

Do NOT wrap the JSON in code fences.

Do NOT write any explanation.

Return exactly this structure:

{
  "overall": 92,
  "seo": 95,
  "ctr": 91,
  "trend": 88,
  "keyword": "youtube seo",
  "strengths": [
    "..."
  ],
  "weaknesses": [
    "..."
  ],
  "suggestions": [
    "..."
  ],
  "reason": "..."
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

// fingerprint dos vídeos
const stableKey = parsedVideos
  .slice(0, 10)
  .map(v => `${(v.title || "").slice(0,30)}_${v.views}`)
  .sort()
  .join("|");

// inicializa cache
global.__tubexCache = global.__tubexCache || new Map();

// keyword normalizada
const normalizedKeyword = String(
  body.keyword || prompt || ""
)
  .toLowerCase()
  .trim()
  .replace(/\s+/g, " ");

// roteiro normalizado
const normalizedScript = [

    title,

    goal,

    duration,

    style

]
.join("|")
.toLowerCase()
.trim();


// chave única do cache

const videoCacheId =

    youtube.videoId ||

    youtube.id ||

    youtube.video ||

    "";

const cacheKey =

tipo === "video_analysis"

? [

    "video",

    youtube.videoId ||

    youtube.id,

    youtube.views,

    youtube.impressions,

    youtube.ctr,

    youtube.averageViewPercentage

].join("|")

: tipo === "script_generator"

? [

    "script",

    normalizedScript

].join("|")

: [

    (tipo === "niche" ? "niche_v8_taxonomy" : "v7"),

    userId,

    channelId,

    tipo,

    normalizedKeyword,

    stableKey,

    context.subscribers || 0,

    avgViews || 0

].join("|");

// procura cache
const cached = global.__tubexCache.get(cacheKey);

// TTL por tipo
const TTL = {
  diagnosis: 6,
  strategy: 12,
script_generator:12,
video_analysis:12,
  niche: 24,
  ideas: 24,

  // SEO Workspace NÃO USA CACHE
  seo_workspace: 0,

  thumbnail_prompt: 24,
  viral_content: 24,
  channel_analysis: 12
};

const ttlHours = TTL[tipo] ?? 6;

const ttl =
  ttlHours === 0
    ? 0
    : ttlHours * 60 * 60 * 1000;

// ======================================================
// CACHE HIT
// ======================================================

if (
  ttl > 0 &&
  cached &&
  (Date.now() - cached.timestamp) < ttl
) {

  if (tipo === "niche") {

    return res.status(200).json({
      success: true,
      niche: cached.text?.niche || "Conteúdo Geral",
      confidence: Number(cached.text?.confidence || 0),
      reason: cached.text?.reason || ""
    });

  }

if (tipo === "script_generator") {

    return res.status(200).json({

        success:true,

        ...(cached.text || {})

    });

}

  if (tipo === "viral_content") {

    return res.status(200).json({
      success: true,
      ...(cached.text || {})
    });

  }

 if (tipo === "channel_analysis") {

    return res.status(200).json({

        success:true,

        ...(cached.text || {})

    });

}

if (tipo === "video_analysis") {

    return res.status(200).json({

        success:true,

        ...(cached.text || {})

    });

}

return res.status(200).json({

    success:true,

    tipo,

    text:cached.text || ""

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
if (tipo==="video_analysis")
 temp=0.25;


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

if (tipo === "script_generator") {

systemPrompt = `
Você é um roteirista profissional especializado em vídeos do YouTube e SEO para YouTube.

Sempre responda exclusivamente JSON válido.

Nunca utilize markdown.

Nunca escreva texto fora do JSON.

O roteiro deve ser fiel ao título recebido. O assunto do título não pode ser substituído por outro assunto.

O hook deve repetir naturalmente a palavra-chave principal e termos importantes do título nos primeiros segundos.

Todo roteiro deve utilizar técnicas modernas de retenção, storytelling e SEO sem fugir do tema central.
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

if (tipo === "video_analysis") {

systemPrompt = `

Você é um especialista em crescimento no YouTube.

Sua função é analisar um vídeo específico.

Sempre responda exclusivamente JSON válido.

Nunca utilize markdown.

Nunca escreva texto fora do JSON.

`;

}




console.log("================================");
console.log("TIPO:", tipo);
console.log("PROMPT:");
console.log(finalPrompt);
console.log("================================");


// ==========================================
// MODEL
// ==========================================

const model =

    tipo === "video_analysis"
        ? "gpt-4.1"

    : tipo === "strategy"
        ? "gpt-4.1"

    : tipo === "diagnosis"
        ? "gpt-4.1"

    : tipo === "script_generator"
        ? "gpt-4.1"

	: tipo === "title_score"
	? "gpt-4o-mini"

    : tipo === "channel_analysis"
        ? "gpt-4.1-mini"

    : "gpt-4o-mini";

// ==========================================
// TEMPERATURE
// ==========================================

const temperature =

    tipo === "video_analysis"

        ? 0.4

    : tipo === "strategy"

        ? 0.4

: tipo === "title_score"
? 0.2

    : tipo === "diagnosis"

        ? 0.4

: tipo === "script_generator"

? 0.7

    : tipo === "channel_analysis"

        ? 0.4

    : temp;


// ==========================================
// MAX TOKENS
// ==========================================

const maxTokens =

    tipo === "video_analysis"

        ? 4200

    : tipo === "strategy"

        ? 3200

    : tipo === "diagnosis"

        ? 3000


: tipo === "title_score"
? 600

    : tipo === "channel_analysis"

        ? 3000

    : tipo === "seo_workspace"

        ? 3200

    : tipo === "viral_content"

        ? 2400

    : tipo === "descricao"

        ? 1500

    : tipo === "ideas"

        ? 1200
: tipo === "script_generator"

? 6000

    : tipo === "niche"

        ? 800

    : 1200;


// ==========================================
// JSON RESPONSE
// ==========================================

const useJson =

tipo === "seo_workspace" ||

tipo === "niche" ||

tipo === "viral_content" ||

tipo === "channel_analysis" ||

tipo === "script_generator" ||

tipo === "video_analysis" ||

tipo === "title_score";


// ==========================================
// OPENAI
// ==========================================

const response = await fetch(

    "https://api.openai.com/v1/chat/completions",

    {

        method: "POST",

        headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`

        },

        body: JSON.stringify({

            model,

            ...(useJson ? {

                response_format: {

                    type: "json_object"

                }

            } : {}),

            messages: [

                {

                    role: "system",

                    content: systemPrompt

                },

                {

                    role: "system",

                    content: `

Você é um consultor sênior especialista em crescimento de canais no YouTube.

Nunca responda superficialmente.

Sempre explique:

• por que encontrou o problema;

• como o algoritmo interpreta esse cenário;

• exatamente o que deve ser alterado;

• um exemplo prático;

• qual impacto pode ser esperado.

Sempre escreva como uma consultoria premium.

`

                },

                {

                    role: "user",

                    content: finalPrompt

                }

            ],

            temperature,

            max_tokens: maxTokens

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

console.log("================================");
console.log("OPENAI RESPONSE");
console.dir(data, { depth: null });
console.log("================================");

   const text = data?.choices?.[0]?.message?.content?.trim();


console.log("================================");
console.log("NICHE RAW");
console.log(text);
console.log("================================");


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

if (tipo !== "seo_workspace") {
  if (
      String(parsed.niche || "").trim().toLowerCase() === "conteúdo geral" &&
      Number(parsed.confidence || 0) <= 0
    ) {
      return res.status(200).json({
        success: false,
        error: "niche_generic_result",
        niche: "",
        confidence: 0,
        reason: "A IA não identificou um nicho com confiança suficiente"
      });
    }


  global.__tubexCache.set(cacheKey, {
    text: parsed,
    timestamp: Date.now()
  });
}

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

if (tipo === "video_analysis") {

    try {

        const parsed = JSON.parse(text);

        global.__tubexCache.set(cacheKey, {

            text: parsed,

            timestamp: Date.now()

        });

        return res.status(200).json({

            success: true,

            ...parsed

        });

    }

    catch(err){

        console.error(err);

        return res.status(500).json({

            success:false,

            error:"invalid_json"

        });

    }

}

if (tipo === "script_generator") {

    try {
console.log(text);
        const parsed = JSON.parse(text);

        global.__tubexCache.set(cacheKey,{
            text: parsed,
            timestamp: Date.now()
        });

        // ===========================================
        // monta o roteiro em texto
        // ===========================================

        let roteiro = "";

        if (parsed.hook) {

            roteiro += "🎣 HOOK\n\n";

            roteiro += typeof parsed.hook === "string"
                ? parsed.hook
                : (parsed.hook.text || "");

            roteiro += "\n\n";

        }

        if (parsed.why) {

            roteiro += "❓ POR QUE ASSISTIR\n\n";
            roteiro += parsed.why + "\n\n";

        }

        if (parsed.intro) {

            roteiro += "📖 INTRODUÇÃO\n\n";
            roteiro += parsed.intro + "\n\n";

        }

        if (Array.isArray(parsed.sections)) {

            parsed.sections.forEach((sec,i)=>{

                roteiro += `## BLOCO ${i+1}\n\n`;

                if(sec.title)
                    roteiro += sec.title + "\n\n";

                if(sec.content)
                    roteiro += sec.content + "\n\n";

            });

        }

        if(parsed.outro){

            roteiro += "🎬 FINAL\n\n";
            roteiro += parsed.outro;

        }

        return res.status(200).json({

            success:true,

            text:roteiro,

            data:parsed

        });

    }

    catch(err){

        console.error(err);

        return res.status(500).json({

            success:false,

            error:"invalid_json"

        });

    }

}

if (tipo === "advanced_tags") {

    try{

        const parsed = JSON.parse(text);

        global.__tubexCache.set(cacheKey,{
            text:parsed,
            timestamp:Date.now()
        });

        return res.status(200).json({

            success:true,

            tags:parsed.tags || []

        });

    }catch(err){

        console.error(err);

        return res.status(500).json({

            success:false,

            error:"invalid_json"

        });

    }

}



if (tipo === "title_score") {

    try{

        const parsed = JSON.parse(text);

        global.__tubexCache.set(cacheKey,{
            text:parsed,
            timestamp:Date.now()
        });

        return res.status(200).json({

            success:true,

            ...parsed

        });

    }catch(err){

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

    // Falha de parsing não é classificação.
    // O Intelligence recebe success:false e usa o fallback local.
    return res.status(200).json({
      success: false,
      error: "niche_parse_failed",
      niche: "",
      confidence: 0,
      reason: "Falha ao interpretar resposta da IA"
    });
  }

}

// 💾 salvar só se válido
if (tipo !== "seo_workspace") {
  global.__tubexCache.set(cacheKey, {
    text,
    timestamp: Date.now()
  });
}

      
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
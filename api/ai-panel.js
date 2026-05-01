export default async function handler(req, res) {

  // =====================================
  // 🌐 CORS
  // =====================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // =====================================
  // 🔒 CONFIG
  // =====================================
  const MAX_PROMPT_LENGTH = 2000;
  const TIMEOUT_MS = 10000;

  try {

    // =====================================
    // 📦 BODY SAFE PARSE
    // =====================================
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({
        success: false,
        error: "invalid_json"
      });
    }

    const tipo = String(body?.tipo || "").toLowerCase();
    const rawPrompt = String(body?.prompt || "").trim();

    if (!rawPrompt) {
      return res.status(400).json({
        success: false,
        error: "empty_prompt"
      });
    }

    // 🔒 proteção tamanho
    const prompt = rawPrompt.slice(0, MAX_PROMPT_LENGTH);

    // =====================================
    // 🧠 PROMPT BUILDER
    // =====================================
    let finalPrompt = "";

    switch (tipo) {

      case "titulo-impactante":
        finalPrompt = `
Crie UM único título EXTREMAMENTE chamativo para YouTube.

Regras:
- Apenas 1 título
- Máximo 70 caracteres
- Foco total em CTR alto
- Sem listas ou múltiplas opções

Base:
"${prompt}"

Retorne SOMENTE o título final.
`;
        break;

      case "titulo-seo":
        finalPrompt = `
Crie UM único título otimizado para SEO no YouTube.

Regras:
- Palavra-chave no início
- Máximo 70 caracteres
- Apenas 1 título

Base:
"${prompt}"

Retorne SOMENTE o título final.
`;
        break;

      case "titulo-emocional":
        finalPrompt = `
Crie UM único título emocional e altamente clicável.

Regras:
- Use curiosidade e gatilhos mentais
- Apenas 1 título

Base:
"${prompt}"

Retorne SOMENTE o título final.
`;
        break;

      case "descricao":
        finalPrompt = `
Crie uma descrição otimizada para YouTube.

- SEO natural
- CTA leve
- retenção alta

Base:
"${prompt}"
`;
        break;
case "roteiro":
  finalPrompt = `
Você é um roteirista profissional de YouTube especializado em vídeos virais, retenção e SEO.

Crie um roteiro completo com estrutura altamente envolvente e formatado para leitura clara na tela.

---

🎯 OBJETIVO:
Maximizar:
- Retenção (assistir até o final)
- CTR (clique)
- Engajamento (comentários, likes, inscrição)

---

📺 TEMA DO VÍDEO:
"${prompt}"

---

📌 REGRAS DE OURO:
- Linguagem natural (como um YouTuber experiente)
- Sem enrolação
- Sem frases genéricas
- Direto, envolvente e estratégico
- Nada de "olá pessoal"
- Evitar tom robótico

---

🧠 ESTRUTURA (NÃO EXPLICAR, APENAS EXECUTAR):

## 🚀 HOOK (ABERTURA IMPACTANTE)
- Frase extremamente forte ou curiosa
- Pode usar dor, polêmica ou promessa
- Criar necessidade imediata de continuar assistindo

## ⚡ INTRO RÁPIDA
- O que a pessoa vai aprender
- Por que isso importa
- Inserir palavra-chave principal naturalmente

## 📚 DESENVOLVIMENTO (BLOCOS CLAROS)
Dividir o conteúdo em partes com subtítulos naturais:

### 🔹 Bloco 1
Conteúdo direto + valor imediato  
+ micro gancho no final

### 🔹 Bloco 2
Aprofundamento  
+ quebra de padrão ou insight

### 🔹 Bloco 3
Parte mais importante ou revelação  
+ manter tensão narrativa

(Use quantos blocos forem necessários, mantendo fluidez)

## 💬 REENGAJAMENTO
- Inserir pergunta estratégica para comentários
- Deve parecer natural dentro do roteiro

## 🔥 CTA INTELIGENTE
- Incentivar like/inscrição de forma orgânica
- Integrado ao valor entregue (não forçado)

## 🎯 FINALIZAÇÃO FORTE
- Reforçar o valor principal
- Criar sensação de continuidade (próximo vídeo, próximo passo, etc)

---

📌 FORMATAÇÃO (OBRIGATÓRIA):
- Use Markdown
- Títulos com ## e ###
- Espaçamento entre blocos
- Texto limpo e escaneável
- Nada de bloco gigante de texto

---

⚠ IMPORTANTE:
- NÃO explique a estrutura
- NÃO fale "hook", "introdução", etc
- Apenas entregue o roteiro pronto e profissional
- Deve parecer um roteiro real pronto para gravação

---

Retorne apenas o roteiro final.
`;
break;
    
      default:
        return res.status(400).json({
          success: false,
          error: "invalid_tipo"
        });
    }

    // =====================================
    // ⏱ TIMEOUT CONTROLLER
    // =====================================
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    // =====================================
    // 🤖 OPENAI REQUEST
    // =====================================
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",

        messages: [
          {
            role: "system",
            content: `
Você é um especialista em crescimento no YouTube.

Regras obrigatórias:
- Gere apenas UMA resposta final
- Nunca gere listas ou múltiplas opções
- Nunca numere
- Resposta direta, limpa e pronta
            `.trim()
          },
          {
            role: "user",
            content: finalPrompt
          }
        ],

        temperature: 0.7,
        max_tokens: 300,
        top_p: 1,
        frequency_penalty: 0.3,
        presence_penalty: 0.2
      })
    });

    clearTimeout(timeout);

    // =====================================
    // ❌ OPENAI ERROR
    // =====================================
    if (!response.ok) {
      const err = await response.text();

      console.error("❌ OpenAI error:", err);

      return res.status(500).json({
        success: false,
        error: "openai_error"
      });
    }

    const data = await response.json();

    let text = String(
      data?.choices?.[0]?.message?.content || ""
    ).trim();

    // =====================================
    // 🧹 LIMPEZA DE RESPOSTA
    // =====================================
    text = text
      .split("\n")[0]
      .replace(/^[\d\.\-\)\s]+/, "")
      .trim();

    if (!text) {
      text = "⚠ Não foi possível gerar conteúdo no momento.";
    }

    // =====================================
    // ✅ RESPONSE FINAL
    // =====================================
    return res.status(200).json({
      success: true,
      text
    });

  } catch (e) {

    console.error("💥 INTERNAL ERROR:", e);

    if (e.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "timeout"
      });
    }

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
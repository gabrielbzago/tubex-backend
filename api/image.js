// ======================================================
// 🎨 TubeX — Image Generator (PRODUCTION LEVEL)
// ======================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {

    // ======================================================
    // 🔥 BODY SAFE
    // ======================================================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let { prompt, quantidade, n, plan } = body || {};

    quantidade = quantidade || n || 1;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "Prompt inválido"
      });
    }

    // ======================================================
    // 🔒 LIMITE POR PLANO
    // ======================================================
    let maxImages = 1;

    if (plan === "pro") maxImages = 2;
    if (plan === "expert" || plan === "owner") maxImages = 3;

    quantidade = Math.min(Math.max(parseInt(quantidade), 1), maxImages);

    // ======================================================
    // 🧠 PROMPT INTELIGENTE (SEM QUEBRAR INPUT DO USER)
    // ======================================================
    const enhancedPrompt = `
YouTube thumbnail, ultra high CTR, viral style.

USER IDEA:
${prompt}

REQUIREMENTS:
- Big bold readable text
- Strong contrast and vibrant colors
- Emotional facial expression if applicable
- Clear subject focus
- Clickbait YouTube style
- Cinematic lighting
- High detail, sharp, 4K
- Designed to maximize clicks
`;

    console.log("🎨 IMAGE REQUEST:", {
      prompt,
      quantidade,
      plan
    });

    // ======================================================
    // 🔁 RETRY AUTOMÁTICO
    // ======================================================
    let response;
    let data;

    for (let attempt = 0; attempt < 2; attempt++) {

      try {

        response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: enhancedPrompt,
            size: "1536x1024",
            n: quantidade
          })
        });

        // tenta parsear
        try {
          data = await response.json();
        } catch (e) {
          const text = await response.text();
          console.error("❌ resposta inválida:", text);
          throw new Error("invalid_json");
        }

        if (!response.ok) {
          console.error("❌ OpenAI error:", data);
          throw new Error(data?.error?.message || "Erro OpenAI");
        }

        break; // sucesso → sai do loop

      } catch (err) {

        console.warn(`⚠ tentativa ${attempt + 1} falhou`);

        if (attempt === 1) {
          throw err;
        }

        // pequeno delay antes de retry
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // ======================================================
    // ✅ VALIDAÇÃO FINAL
    // ======================================================
    if (!data?.data?.length) {
      return res.status(500).json({
        success: false,
        error: "Nenhuma imagem retornada"
      });
    }

    const images = data.data
      .filter(img => img?.b64_json && img.b64_json.length > 1000)
      .map(img => ({
        b64_json: img.b64_json
      }));

    if (!images.length) {
      return res.status(500).json({
        success: false,
        error: "Imagens inválidas"
      });
    }

    // ======================================================
    // 🚀 RESPONSE FINAL
    // ======================================================
    return res.status(200).json({
      success: true,
      images
    });

  } catch (err) {

    console.error("💥 IMAGE API ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Erro ao gerar thumbnail"
    });

  }
}
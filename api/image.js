// ======================================================
// 🎨 TubeX — Image Generator (ULTRA PRODUCTION)
// ======================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try {

    // ======================================================
    // 🔒 ENV VALIDATION
    // ======================================================
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY missing");

      return res.status(500).json({
        success: false,
        error: "missing_openai_key"
      });
    }

    // ======================================================
    // 📦 BODY SAFE
    // ======================================================
    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({
        success: false,
        error: "invalid_json_body"
      });
    }

    let { prompt, quantidade, n, plan } = body || {};

    quantidade = quantidade || n || 1;

    if (!prompt || typeof prompt !== "string" || prompt.length < 3) {
      return res.status(400).json({
        success: false,
        error: "invalid_prompt"
      });
    }

    // ======================================================
    // 🔒 PLAN LIMIT
    // ======================================================
    let maxImages = 1;

    if (plan === "pro") maxImages = 2;
    if (plan === "expert" || plan === "owner") maxImages = 3;

    quantidade = Math.min(Math.max(parseInt(quantidade) || 1, 1), maxImages);

    // ======================================================
    // 🧠 PROMPT ENGINE (ALTA CONVERSÃO)
    // ======================================================
    const enhancedPrompt = `
YouTube thumbnail, ultra high CTR, viral, clickbait style.

USER IDEA:
${prompt}

STYLE:
- Bold readable text
- High contrast colors
- Emotional impact
- Strong subject focus
- Bright lighting
- Dramatic composition
- 4K detail
- Designed to maximize CTR
`;

    console.log("🎨 REQUEST:", { quantidade, plan });

    // ======================================================
    // 🔁 CONFIG
    // ======================================================
    const MAX_RETRIES = 3;
    const BASE_TIMEOUT = 45000;

    let lastError = null;

    // ======================================================
    // 🔁 RETRY LOOP
    // ======================================================
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BASE_TIMEOUT);

      try {

        console.log(`🚀 attempt ${attempt}`);

        const response = await fetch(
          "https://api.openai.com/v1/images/generations",
          {
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
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeout);

        let data;

        try {
          data = await response.json();
        } catch {
          throw new Error("invalid_openai_json");
        }

        // ======================================================
        // ❌ HTTP ERROR
        // ======================================================
        if (!response.ok) {

          console.error("❌ OPENAI ERROR:", response.status, data);

          // 🔥 RATE LIMIT
          if (response.status === 429) {
            await delay(2000 * attempt);
            continue;
          }

          throw new Error(
            data?.error?.message || `openai_${response.status}`
          );
        }

        // ======================================================
        // 🔥 NORMALIZAÇÃO
        // ======================================================
        const rawImages = data?.data || data?.images || [];

        if (!rawImages.length) {
          throw new Error("empty_images");
        }

        const images = rawImages
          .map(img => {

            if (img?.b64_json && img.b64_json.length > 1000) {
              return `data:image/png;base64,${img.b64_json}`;
            }

            if (img?.url) {
              return img.url;
            }

            return null;
          })
          .filter(Boolean);

        if (!images.length) {
          throw new Error("invalid_images");
        }

        console.log("✅ SUCCESS:", images.length);

        return res.status(200).json({
          success: true,
          images
        });

      } catch (err) {

        clearTimeout(timeout);

        lastError = err;

        console.warn(`⚠️ attempt ${attempt} failed:`, err.message);

        // ⏳ timeout → retry
        if (err.name === "AbortError") {
          await delay(1500 * attempt);
          continue;
        }

        // 🔁 retry geral
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
      }
    }

    // ======================================================
    // 💥 FINAL FAIL
    // ======================================================
    console.error("💥 FINAL ERROR:", lastError);

    return res.status(500).json({
      success: false,
      error: lastError?.message || "generation_failed"
    });

  } catch (err) {

    console.error("💥 FATAL:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "internal_error"
    });
  }
}

// ======================================================
// ⏳ UTILS
// ======================================================
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}
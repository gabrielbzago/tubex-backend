// ======================================================
// 🎨 TubeX — Image Generator (PRODUCTION SCALE)
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
        error: "invalid_json"
      });
    }

    const { prompt, email, plan = "free", n } = body;

    // ======================================================
    // 🔒 VALIDAÇÃO
    // ======================================================
    if (!email) {
      return res.status(401).json({
        success: false,
        error: "unauthorized"
      });
    }

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({
        success: false,
        error: "invalid_prompt"
      });
    }

    // ======================================================
    // 🧠 NORMALIZA PROMPT (ANTI SPAM)
    // ======================================================
    const safePrompt = prompt
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 400);

    const cacheKey = safePrompt.toLowerCase();

    // ======================================================
    // ⚡ CACHE GLOBAL (ANTI CUSTO REAL)
    // ======================================================
    global.__tubexCache = global.__tubexCache || {};

    if (global.__tubexCache[cacheKey]) {
      console.log("⚡ CACHE HIT");
      return res.status(200).json({
        success: true,
        images: global.__tubexCache[cacheKey],
        cached: true
      });
    }

    // ======================================================
    // 🚫 DEDUPE (ANTI MULTI CLICK)
    // ======================================================
    global.__tubexPending = global.__tubexPending || {};

    if (global.__tubexPending[cacheKey]) {
      console.log("♻️ REQ DUPLICADA");
      return res.status(200).json({
        success: true,
        images: await global.__tubexPending[cacheKey]
      });
    }

    // ======================================================
    // 🎯 QUANTIDADE POR PLANO
    // ======================================================
    let quantidade = 1;

    if (plan === "pro") quantidade = 2;
    if (plan === "expert" || plan === "owner") quantidade = 3;

    if (n && n <= 4) quantidade = n; // override controlado

    // ======================================================
    // 🎯 PROMPT ENGINE (CTR REAL)
    // ======================================================
    const enhancedPrompt = `
Ultra high CTR YouTube thumbnail.

IDEA:
${safePrompt}

STYLE:
- BIG bold text (3 words max)
- expressive face
- strong emotion (shock, curiosity)
- high contrast colors
- cinematic lighting
- clean composition
- focus on clickbait effect

IMPORTANT:
No small text, no clutter, clear focal point.
`;

    // ======================================================
    // 🔁 EXECUÇÃO COM DEDUPE
    // ======================================================
    global.__tubexPending[cacheKey] = (async () => {

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
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {

        console.error("❌ OPENAI ERROR:", data);

        if (data?.error?.type === "insufficient_quota") {
          throw new Error("quota_exceeded");
        }

        throw new Error("generation_failed");
      }

      const images = (data.data || [])
        .map(img => img?.b64_json
          ? `data:image/png;base64,${img.b64_json}`
          : null
        )
        .filter(Boolean);

      if (!images.length) {
        throw new Error("no_images");
      }

      // 💾 CACHE
      global.__tubexCache[cacheKey] = images;

      return images;

    })();

    const images = await global.__tubexPending[cacheKey];

    delete global.__tubexPending[cacheKey];

    // ======================================================
    // ✅ RESPONSE
    // ======================================================
    return res.status(200).json({
      success: true,
      images
    });

  } catch (err) {

    console.error("💥 THUMB ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "internal_error"
    });
  }
}
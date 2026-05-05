// ======================================================
// 🎨 TubeX — Image Generator (SAFE LAUNCH VERSION)
// ======================================================

export default async function handler(req, res) {

  // ======================================================
  // 🚫 METHOD
  // ======================================================
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try {

    // ======================================================
    // 📦 BODY PARSE (SAFE)
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

    // ======================================================
    // 👤 USER VALIDATION (ANTI ABUSE)
    // ======================================================
    const email = body?.email;

    if (!email || typeof email !== "string") {
      return res.status(401).json({
        success: false,
        error: "unauthorized"
      });
    }

    // ======================================================
    // 🔥 RATE LIMIT (POR USUÁRIO)
    // ======================================================
    global.__tubexRate = global.__tubexRate || {};

    const now = Date.now();

    if (!global.__tubexRate[email]) {
      global.__tubexRate[email] = [];
    }

    // mantém só últimos 60s
    global.__tubexRate[email] =
      global.__tubexRate[email].filter(t => now - t < 60000);

    if (global.__tubexRate[email].length >= 5) {
      return res.status(429).json({
        success: false,
        error: "rate_limit"
      });
    }

    global.__tubexRate[email].push(now);

    // ======================================================
    // 🔒 OPENAI KEY
    // ======================================================
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "missing_openai_key"
      });
    }

    // ======================================================
    // 🧠 INPUT
    // ======================================================
    let { prompt } = body;

    if (!prompt || typeof prompt !== "string" || prompt.length < 3) {
      return res.status(400).json({
        success: false,
        error: "invalid_prompt"
      });
    }

    // 🔥 evita custo absurdo
    if (prompt.length > 500) {
      prompt = prompt.slice(0, 500);
    }

    // 🔥 trava custo (LANÇAMENTO)
    const quantidade = 1;

    // ======================================================
    // 🎯 PROMPT OTIMIZADO
    // ======================================================
    const enhancedPrompt = `
YouTube thumbnail, ultra high CTR, viral, clickbait style.

IDEA:
${prompt}

STYLE:
- Bold readable text
- High contrast
- Emotional impact
- Bright colors
- Cinematic lighting
- Designed for high CTR
`;

    console.log("🎨 REQUEST:", email, prompt.slice(0, 40));

    // ======================================================
    // 🔁 CONFIG
    // ======================================================
    const MAX_RETRIES = 3;
    const TIMEOUT = 45000;

    let lastError = null;

    // ======================================================
    // 🔁 RETRY LOOP
    // ======================================================
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      try {

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
              size: attempt === 1 ? "1536x1024" : "1024x1024",
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
          throw new Error("invalid_json");
        }

        // ======================================================
        // ❌ OPENAI ERROR
        // ======================================================
        if (!response.ok) {

          console.error("❌ OPENAI:", data);

          if (data?.error?.type === "insufficient_quota") {
            return res.status(402).json({
              success: false,
              error: "quota_exceeded"
            });
          }

          if (response.status === 429) {
            await delay(2000 * attempt);
            continue;
          }

          throw new Error(data?.error?.message || "openai_error");
        }

        // ======================================================
        // ✅ PROCESS IMAGES
        // ======================================================
        const raw = data?.data || [];

        if (!raw.length) throw new Error("no_images");

        const images = raw
          .map(img => img?.b64_json
            ? `data:image/png;base64,${img.b64_json}`
            : null
          )
          .filter(Boolean);

        if (!images.length) throw new Error("invalid_images");

        return res.status(200).json({
          success: true,
          images
        });

      } catch (err) {

        clearTimeout(timeout);
        lastError = err;

        if (err.name === "AbortError") {
          await delay(1500 * attempt);
          continue;
        }

        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
      }
    }

    // ======================================================
    // 💥 FAIL FINAL
    // ======================================================
    return res.status(500).json({
      success: false,
      error: lastError?.message || "generation_failed"
    });

  } catch (err) {

    console.error("💥 FATAL:", err);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}

// ======================================================
// ⏳ UTIL
// ======================================================
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}
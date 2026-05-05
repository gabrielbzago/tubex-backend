// ======================================================
// 🎨 TubeX — Image Generator ULTRA (OpenAI + Stability)
// ======================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
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
      return res.status(400).json({ success: false, error: "invalid_json" });
    }

    const { prompt, email, plan = "free", n } = body;

    if (!email) {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ success: false, error: "invalid_prompt" });
    }

    // ======================================================
    // 🧠 NORMALIZA
    // ======================================================
    const safePrompt = prompt.trim().replace(/\s+/g, " ").slice(0, 400);
    const key = safePrompt.toLowerCase();

    // ======================================================
    // ⚡ CACHE
    // ======================================================
    global.__tubexCache = global.__tubexCache || {};
    if (global.__tubexCache[key]) {
      console.log("⚡ CACHE HIT");
      return res.status(200).json({
        success: true,
        images: global.__tubexCache[key],
        cached: true
      });
    }

    // ======================================================
    // 🔁 DEDUPE
    // ======================================================
    global.__tubexPending = global.__tubexPending || {};
    if (global.__tubexPending[key]) {
      console.log("♻️ REQ DUPLICADA");
      const images = await global.__tubexPending[key];
      return res.status(200).json({ success: true, images });
    }

    // ======================================================
    // 🎯 QUANTIDADE
    // ======================================================
    let quantidade = 1;
    if (plan === "pro") quantidade = 2;
    if (plan === "expert" || plan === "owner") quantidade = 3;
    if (n && n <= 4) quantidade = n;

    // ======================================================
    // 🎯 PROMPT ENGINE
    // ======================================================
    const enhancedPrompt = `
Ultra high CTR YouTube thumbnail.

IDEA:
${safePrompt}

STYLE:
- BIG bold text (max 3 words)
- expressive face
- high emotion (shock, curiosity)
- strong contrast
- cinematic lighting
- clean composition

IMPORTANT:
No clutter, clear subject, clickbait style.
`;

    // ======================================================
    // 🔁 PIPELINE (OpenAI → Stability)
    // ======================================================
    global.__tubexPending[key] = (async () => {

      // ===============================
      // 🥇 OPENAI
      // ===============================
      try {

        console.log("🎨 OpenAI tentativa...");

        const r = await fetch("https://api.openai.com/v1/images/generations", {
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

        const data = await r.json();

        if (!r.ok) throw new Error(data?.error?.message || "openai_fail");

        const images = (data.data || [])
          .map(img => img?.b64_json
            ? `data:image/png;base64,${img.b64_json}`
            : null
          )
          .filter(Boolean);

        if (!images.length) throw new Error("openai_empty");

        console.log("✅ OpenAI OK");

        global.__tubexCache[key] = images;
        return images;

      } catch (e) {

        console.warn("⚠️ OpenAI falhou → fallback Stability", e.message);

      }

      // ===============================
      // 🥈 STABILITY
      // ===============================
      try {

        console.log("🎨 Stability tentativa...");

        const images = [];

        for (let i = 0; i < quantidade; i++) {

          const r = await fetch(
            "https://api.stability.ai/v2beta/stable-image/generate/core",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
                "Accept": "application/json"
              },
              body: JSON.stringify({
                prompt: enhancedPrompt,
                output_format: "png",
                aspect_ratio: "16:9"
              })
            }
          );

          const data = await r.json();

          if (!r.ok) throw new Error(data?.message || "stability_fail");

          if (data?.image) {
            images.push(`data:image/png;base64,${data.image}`);
          }
        }

        if (!images.length) throw new Error("stability_empty");

        console.log("✅ Stability OK");

        global.__tubexCache[key] = images;
        return images;

      } catch (e) {

        console.error("💥 Stability falhou:", e.message);
        throw new Error("all_engines_failed");
      }

    })();

    const images = await global.__tubexPending[key];
    delete global.__tubexPending[key];

    return res.status(200).json({
      success: true,
      images
    });

  } catch (err) {

    console.error("💥 FINAL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "internal_error"
    });
  }
}
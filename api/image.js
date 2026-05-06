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
    // 🎯 QUANTIDADE
    // ======================================================
  let quantidade = 1;

// só gera múltiplas se vier explícito do front
if (typeof n === "number" && n > 1 && n <= 3) {
  quantidade = n;
}
     

     // ======================================================
    // 🧠 NORMALIZA
    // ======================================================
    const safePrompt = prompt.trim().replace(/\s+/g, " ").slice(0, 400);

     // ======================================================
    // 🧠 Key
    // ======================================================
const key = safePrompt.toLowerCase() + "_" + quantidade + "_" + plan;

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
// 🔁 DEDUPE (CORRIGIDO)
// ======================================================
global.__tubexPending = global.__tubexPending || {};

if (global.__tubexPending[key]) {
  console.log("♻️ REQ DUPLICADA - aguardando");

  return res.status(202).json({
    success: false,
    error: "processing"
  });
}

    // ======================================================
    // 🎯 PROMPT ENGINE
    // ======================================================
const enhancedPrompt = `
YouTube thumbnail, high CTR, expressive face, bold text, cinematic lighting, clean composition.

IDEA:
${safePrompt}
`;

   // ======================================================
    // 🔁 PIPELINE (Stability → OpenAI)
    // ======================================================
    global.__tubexPending[key] = (async () => {


// ===============================
// 🥈 STABILITY (ECONÔMICO + SEM LOOP)
// ===============================
try {

  console.log("🎨 Stability tentativa...");

  const r = await fetch(
    "https://api.stability.ai/v2beta/stable-image/generate/core",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: enhancedPrompt,
        output_format: "png",
        aspect_ratio: "16:9",
        samples: quantidade // 🔥 1 request gera tudo
      })
    }
  );

  const data = await r.json();

  if (!r.ok) {
    console.error("❌ Stability erro:", data);
    throw new Error(data?.message || "stability_fail");
  }

  // ======================================================
  // 🔥 NORMALIZAÇÃO CORRETA
  // ======================================================
  const images = (data?.images || [])
    .map(img => `data:image/png;base64,${img}`)
    .filter(Boolean);

  if (!images.length) {
    console.warn("⚠️ Stability retornou vazio:", data);
    throw new Error("stability_empty");
  }

  console.log("✅ Stability OK:", images.length, "imagens");

  // ======================================================
  // ⚡ CACHE
  // ======================================================
  global.__tubexCache[key] = images;

  return images;

} catch (e) {
  console.warn("⚠️ Stability falhou → tentando OpenAI", e.message);
}
 

      // ===============================
      // 🥈 OPENAI (fallback premium)
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
            size: "1024x1024",
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
throw new Error("all_engines_failed");

      }

})(); // 🔥 FECHA O PIPELINE

    // ======================================================
    // 📤 RESPONSE FINAL (FORA DO PIPELINE)
    // ======================================================
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
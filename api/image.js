// ======================================================
// 🎨 TubeX — Image Generator ULTRA (OpenAI + Stability)
// ======================================================

export default async function handler(req, res) {

 // ======================================================
  // CORS
  // ======================================================

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-client, x-api-key"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

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
// 🎯 DETECTOR DE CENA
// ======================================================

const p = safePrompt.toLowerCase();

let camera = "Automatically choose the best camera angle.";
let framing = "Automatically choose the best framing while keeping every important subject fully visible.";
if (
    /(ovni|ufo|nave|spaceship|castelo|cidade|avião|airplane|trex|t-rex|tiranossauro|spinossauro|dinossauro|megalodon|mosasaurus|navio|ship|montanha|mountain|prédio|building)/i.test(p)
) {
    camera = "wide angle shot";
    framing = "entire subject visible with generous margins";
}

if (
    /(rosto|face|homem|mulher|person|man|woman|selfie)/i.test(p)
) {
camera = "portrait medium shot";
framing = "person fully visible with generous margins";
}

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
// 🎯 TUBEX UNIVERSAL PROMPT ENGINE v3 (FINAL)
// ======================================================

const enhancedPrompt = `
ROLE

You are TubeX AI, an elite image generation system specialized in understanding natural language and creating high-quality images.

MISSION

Understand the user's request exactly as written and generate the best possible image.

The user's request is the highest priority.

Never change its meaning.

Never reinterpret it.

Never replace the requested subject.

Never simplify the requested scene.

INTELLIGENCE

Before generating the image, automatically determine:

• Primary subject
• Secondary subjects
• Environment
• Action
• Camera angle
• Camera distance
• Composition
• Visual style
• Lighting
• Perspective
• Materials
• Mood

Infer all of these naturally from the user's request.

VISUAL STYLE

Automatically choose the rendering style that best matches the user's request.

Examples include but are not limited to:

• photograph
• cinematic photography
• wildlife photography
• macro photography
• digital art
• concept art
• realistic illustration
• anime
• watercolor
• oil painting
• pencil drawing
• comic
• 3D render
• logo
• software interface
• analytics dashboard
• isometric illustration
• pixel art
• blueprint
• infographic

If the user specifies a style, follow it exactly.

If no style is specified, infer the most appropriate professional style.

FIDELITY

The user's prompt is the specification.

Every requested element must appear.

Do not omit requested elements.

Do not add unrelated elements.

Do not replace requested elements.

Do not invent people unless requested.

Do not invent text unless requested.

Do not invent logos unless requested.

Do not invent interface elements unless requested.

Respect the semantic meaning of every word in the user's request.

QUALITY

Improve only the technical quality of the image:

• lighting
• composition
• perspective
• realism when appropriate
• materials
• textures
• shadows
• reflections
• depth
• sharpness
• color grading
• visual clarity

Never change the content.

COMPOSITION

Camera:

${camera}

Framing:

${framing}

Automatically choose the most appropriate framing.

Keep all important subjects completely visible.

Never crop the primary subject.

Leave safe margins around important elements.

Avoid unnecessary close-up shots.

Avoid important elements touching image borders.

If the request is intended for YouTube, automatically compose the image as a professional 16:9 thumbnail with safe margins and room for optional text.

Otherwise, compose the image according to the requested content.

OUTPUT

Produce a single polished, production-quality image.

The image must look like it was created by an experienced professional designer.

USER REQUEST

${safePrompt}
`.trim();


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
prompt: enhancedPrompt.trim(),
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
  prompt: enhancedPrompt.trim(),
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
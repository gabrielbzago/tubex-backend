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

let camera = "wide cinematic shot";
let framing = "subject occupies about 60% of the frame";

if (
    /(ovni|ufo|nave|spaceship|castelo|cidade|avião|airplane|trex|t-rex|tiranossauro|spinossauro|dinossauro|megalodon|mosasaurus|navio|ship|montanha|mountain|prédio|building)/i.test(p)
) {
    camera = "wide angle shot";
    framing = "entire subject visible with generous margins";
}

if (
    /(rosto|face|homem|mulher|person|man|woman|selfie)/i.test(p)
) {
    camera = "close-up portrait";
    framing = "face occupies about 70% of the frame";
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
// 🎯 PROMPT ENGINE
// ======================================================

const enhancedPrompt = `
You are a professional image generation engine specialized in YouTube thumbnails.

MISSION

Your ONLY mission is to render exactly what the user requests.

The user's request is absolute and must never be changed.

STRICT RULES

- Never invent people.
- Never invent faces.
- Never invent animals.
- Never invent objects.
- Never invent buildings.
- Never invent vehicles.
- Never invent text.
- Never invent titles.
- Never invent captions.
- Never invent logos.
- Never invent watermarks.
- Never invent icons.
- Never replace one object with another.
- Never change the scene.
- Never change the subject.
- Never add elements that were not requested.
- Never remove elements requested by the user.

If the prompt says UFO, generate a UFO.

If the prompt says dinosaur, generate a dinosaur.

If the prompt says desert, generate a desert.

If the prompt does not mention humans, generate ZERO humans.

If the prompt does not mention text, generate ZERO text.

IMAGE STYLE

Improve ONLY:

- lighting
- realism
- shadows
- textures
- composition
- color grading
- cinematic quality
- sharpness

WITHOUT changing the requested scene.

THUMBNAIL REQUIREMENTS

- 16:9 landscape
- professional YouTube thumbnail
- safe composition
- keep every important element visible
- no cropped subject
- no cropped face
- no cropped hands
- leave safe margins
- optimized for 1280x720

CAMERA

${camera}

FRAMING

${framing}

The camera must NEVER crop the main subject.

Every important object must be completely visible.

Keep at least 10% empty space around the main subject.

Use a wider camera if necessary to fit the entire scene.

Avoid close-up shots unless explicitly requested by the user.

The image must already look like a finished YouTube thumbnail.

OUTPUT

Generate ONLY the requested scene.

CAMERA DISTANCE

Prefer a wide shot instead of a close-up.

The entire scene must be visible.

The entire subject must be visible.

Nothing important may touch the image borders.

The image must look already cropped for YouTube.

Never zoom into the subject unless explicitly requested.

Always leave empty space around the main subject.

The generated image should require ZERO additional cropping.

SCENE DESCRIPTION

${safePrompt}

Render exactly this scene.

Do not reinterpret the request.

Do not change the requested subject.

Do not add extra elements.

Do not zoom into the subject.

Use the camera instructions above.

`;

// ======================================================
// 🎯 PROMPT OPTIMIZER
// ======================================================

const optimizedPrompt = `
CAMERA

${camera}

FRAMING

${framing}

COMPOSITION

Professional YouTube thumbnail.

16:9 landscape.

Entire main subject visible.

No cropped subject.

Leave safe margins.

Use a wider camera angle if necessary.

Avoid close-up unless requested.
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
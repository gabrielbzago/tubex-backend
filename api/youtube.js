export default async function handler(req, res) {

  // =========================
  // 🔥 CORS
  // =========================
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // =========================
  // 🔐 API KEY
  // =========================
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: "unauthorized"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword?.trim();
    const mode = body?.mode || "seo";
    const videoId = body?.videoId;

    if (!keyword && !videoId) {
      return res.status(400).json({
        success: false,
        error: "keyword_required"
      });
    }

    // =========================
    // 📦 CACHE SEO
    // =========================
    global.tubexSeoCache = global.tubexSeoCache || {};

    const cacheKey = keyword ? `seo_${keyword.toLowerCase()}` : null;

    if (cacheKey) {
      const cached = global.tubexSeoCache[cacheKey];

      if (cached && cached.expires > Date.now()) {
        console.log("⚡ CACHE HIT SEO:", keyword);
        return res.status(200).json(cached.data);
      }
    }

    // =========================
    // 🔑 API KEYS
    // =========================
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    let items = [];
    let success = false;
    let activeKey = null;

    // =========================
    // 🔁 MULTI KEY FETCH
    // =========================
    const shuffledKeys = [...keys]
  .sort(() => Math.random() - 0.5);

for (const key of shuffledKeys) { {

      try {

        let allIds = [];
        let nextPageToken = "";
        let pageCount = 0;

        let maxPages = 2;
        if (body?.plan === "free") maxPages = 1;
        if (body?.plan === "pro") maxPages = 3;

        while (pageCount < maxPages) {

          const searchUrl =
            `https://www.googleapis.com/youtube/v3/search` +
            `?part=snippet&type=video&order=relevance&maxResults=25` +
            `&q=${encodeURIComponent(keyword)}` +
            `&pageToken=${nextPageToken}` +
            `&key=${key}`;

          const searchRes = await fetch(searchUrl);

          if (searchRes.status === 403 || searchRes.status === 429) {
            throw new Error("quota_exceeded");
          }

          const searchJson = await searchRes.json();

          const ids = searchJson.items
            ?.map(v => v.id?.videoId)
            .filter(Boolean) || [];

          allIds.push(...ids);

          nextPageToken = searchJson.nextPageToken || "";
          pageCount++;

          if (!nextPageToken) break;
        }

        const uniqueIds = [...new Set(allIds)];

        for (let i = 0; i < uniqueIds.length; i += 50) {

          const chunk = uniqueIds.slice(i, i + 50).join(",");

          const videosUrl =
            `https://www.googleapis.com/youtube/v3/videos` +
            `?part=snippet,statistics&id=${chunk}&key=${key}`;

          const resVideos = await fetch(videosUrl);

          if (resVideos.status === 403 || resVideos.status === 429) {
            throw new Error("quota_exceeded");
          }

          const jsonVideos = await resVideos.json();

          if (Array.isArray(jsonVideos.items)) {

  // =====================================
  // 🧹 FILTRO REAL SERP
  // =====================================

  const filtered = jsonVideos.items.filter(v => {

    const title =
      String(
        v?.snippet?.title || ""
      ).toLowerCase();

    const views =
      Number(
        v?.statistics?.viewCount || 0
      );

    // remove shorts
    if(
      title.includes("#shorts")
    ){
      return false;
    }

    // remove vídeos mortos
    const published =
      new Date(
        v?.snippet?.publishedAt
      ).getTime();

    const ageDays =

      (
        Date.now() - published
      )

      / (1000 * 60 * 60 * 24);

    if(
      ageDays > 900
      &&
      views < 5000
    ){
      return false;
    }

    return true;

  });

  items.push(...filtered);

}
        }

        if (items.length) {
          success = true;
          activeKey = key;
          break;
        }

      } catch (e) {
        console.warn("🔁 tentando próxima key...");
        continue;
      }
    }

    // =========================
    // 🚫 FALHA TOTAL
    // =========================
    if (!success) {
      return res.status(200).json({
        success: true,
        items: [],
        volume: 0,
        competition: 0
      });
    }

    // =========================
    // 🎬 VIDEO MODE
    // =========================
    if (videoId) {

      const url =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet&id=${videoId}&key=${activeKey}`;

      const resYT = await fetch(url);
      const json = await resYT.json();

      return res.status(200).json({
        success: true,
        data: json.items?.[0] || { snippet: { tags: [] } }
      });
    }

    // =========================
    // 📊 SUMMARY MODE
    // =========================
    if (mode === "summary") {

      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(keyword)}&key=${activeKey}`
      );

      const searchJson = await searchRes.json();
      const channelId = searchJson.items?.[0]?.id?.channelId;

      if (!channelId) {
        return res.status(200).json({
          success: false,
          error: "channel_not_found"
        });
      }

      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${activeKey}`
      );

      const stats = (await channelRes.json())?.items?.[0]?.statistics;

      return res.status(200).json({
        success: true,
        channelId,
        totalViews: Number(stats?.viewCount || 0),
        totalVideos: Number(stats?.videoCount || 0),
        subscribers: Number(stats?.subscriberCount || 0)
      });
    }


    // =========================
// 🚀 REAL MARKET ENGINE
// =========================

items.sort((a,b)=>

  Number(
    b.statistics?.viewCount || 0
  )

  -

  Number(
    a.statistics?.viewCount || 0
  )

);

const stats = items.map(v => ({

  views:
    Number(v.statistics?.viewCount || 0),

  likes:
    Number(v.statistics?.likeCount || 0),

  comments:
    Number(v.statistics?.commentCount || 0),

  publishedAt:
    v.snippet?.publishedAt || ""

}))
.filter(v => v.views > 0);

const views =
  stats
    .map(v => v.views)
    .sort((a,b)=>b-a);

const top =
  views[0] || 1;

const top3avg =

  (
    (views[0] || 0)

    +

    (views[1] || 0)

    +

    (views[2] || 0)

  )

  / 3;

const median =
  views[
    Math.floor(
      views.length / 2
    )
  ] || 1;

const low =
  views[
    views.length - 1
  ] || 1;

const avgViews =

  views.reduce(
    (a,b)=>a+b,
    0
  )

  / Math.max(
    views.length,
    1
  );

// =========================
// 📈 VOLUME REAL
// =========================

const safeLog =
  n => Math.log10(n + 1);

let volume =

  (

    safeLog(top3avg) * 0.45

  )

  +

  (

    safeLog(median) * 0.35

  )

  +

  (

    safeLog(avgViews) * 0.20

  );

volume *= 10.2;

// =========================
// 🔥 TREND
// =========================

const now = Date.now();

const recentVideos =
  stats.filter(v => {

    const published =
      new Date(
        v.publishedAt
      ).getTime();

    return (
      now - published
    ) <= (
      45 * 24 * 60 * 60 * 1000
    );

  });

const recentRatio =
  recentVideos.length
  / Math.max(stats.length,1);

if(recentRatio > 0.5){

  volume += 8;

}else if(recentRatio > 0.3){

  volume += 4;

}

// =========================
// ⚔️ DOMINÂNCIA
// =========================

const dominance =
  top / median;

// =========================
// 🔥 DISTRIBUIÇÃO
// =========================

const spread =
  median / top;

// =========================
// 🔥 WEAK VIDEOS
// =========================

const weakVideos =
  views.filter(v =>

    v < 100000

  ).length;

// =========================
// 💥 ENGAJAMENTO
// =========================

let engagement = 0;

stats.forEach(v => {

  engagement +=

    (

      v.likes +

      (v.comments * 2)

    )

    / (v.views + 1);

});

engagement =
  engagement / stats.length;

// =========================
// 🧠 QUERY SIZE
// =========================

const queryTerms =
  keyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

// =========================
// 🧠 MARKET ACCESSIBILITY
// 100 = FÁCIL
// =========================

let competition = 58;

// =========================
// 🚫 DOMINÂNCIA
// =========================

if(dominance > 20){

  competition -= 28;

}else if(dominance > 12){

  competition -= 18;

}else if(dominance > 6){

  competition -= 10;

}else if(dominance > 3){

  competition -= 4;

}

// =========================
// 🚫 TOP MUITO FORTE
// =========================

if(top3avg > 10000000){

  competition -= 20;

}else if(top3avg > 3000000){

  competition -= 14;

}else if(top3avg > 1000000){

  competition -= 8;

}else if(top3avg > 300000){

  competition -= 3;

}

// =========================
// 🔥 DISTRIBUIÇÃO
// =========================

competition +=
  spread * 18;

// =========================
// 🔥 ENTRY ACCESS
// =========================

competition +=
  (low / top) * 30;

// =========================
// 🔥 VÍDEOS FRACOS
// =========================

if(weakVideos >= 5){

  competition += 12;

}else if(weakVideos >= 3){

  competition += 6;

}

// =========================
// 🚫 ENGAJAMENTO ALTO
// =========================

if(engagement > 0.15){

  competition -= 10;

}else if(engagement > 0.08){

  competition -= 5;

}

// =========================
// 🔥 LONG TAIL SUAVE
// =========================

if(queryTerms >= 6){

  competition += 5;

}else if(queryTerms >= 4){

  competition += 2;

}

// =========================
// 🚫 SATURAÇÃO
// =========================

if(avgViews > 1000000){

  competition -= 8;

}else if(avgViews > 300000){

  competition -= 4;

}

// =========================
// 🔒 CLAMP FINAL
// =========================

volume = Math.round(

  Math.max(
    5,
    Math.min(100, volume)
  )

);

competition = Math.round(

  Math.max(
    5,
    Math.min(100, competition)
  )

);

// =========================
// 🏷️ REAL TAG ENGINE
// =========================
// =========================
// 🧠 UNIVERSAL SEO ENGINE
// =========================

// mapa final
const tagMap = new Map();

// =====================================
// LIMPA TEXTO
// =====================================

function normalizeText(text = ""){

  return text

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^\w\s-]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}

// =====================================
// TOKENIZA
// =====================================

function tokenize(text = ""){

  return normalizeText(text)

    .split(" ")

    .filter(word =>

      word.length >= 3

    );

}

// =====================================
// EXTRAI TAGS DO TÍTULO
// =====================================

function extractTitleTags(title = ""){

  const words = tokenize(title);

  const tags = new Set();

  // =================================
  // PALAVRAS
  // =================================

  words.forEach(word => {

    tags.add(word);

  });

  // =================================
  // BIGRAMAS
  // =================================

  for(let i=0;i<words.length-1;i++){

    tags.add(

      words[i] +
      " " +
      words[i+1]

    );

  }

  // =================================
  // TRIGRAMAS
  // =================================

  for(let i=0;i<words.length-2;i++){

    tags.add(

      words[i] +
      " " +
      words[i+1] +
      " " +
      words[i+2]

    );

  }

  // =================================
  // FRASE COMPLETA
  // =================================

  if(words.length >= 4){

    tags.add(

      words.join(" ")

    );

  }

  return [...tags];

}

// =====================================
// TAGS DO TÍTULO
// =====================================

const titleTags =
  extractTitleTags(keyword);

// adiciona peso forte
titleTags.forEach(tag => {

  tagMap.set(

    tag,

    (tagMap.get(tag) || 0)

    + 20

  );

});

// =====================================
// API YOUTUBE COMPLEMENTAR
// =====================================

items

  .sort((a,b)=>

    Number(b.statistics?.viewCount || 0)

    -

    Number(a.statistics?.viewCount || 0)

  )

  .slice(0,20)

  .forEach(video => {

    const tags =
      video?.snippet?.tags || [];

    tags.forEach(tag => {

      const normalized =
        normalizeText(tag);

      // tamanho
      if(
        !normalized
        ||
        normalized.length < 3
        ||
        normalized.length > 80
      ){
        return;
      }

    
// =====================================
// RELEVÂNCIA FLEXÍVEL
// =====================================

const relevance =

  titleTags.some(titleTag => {

    const words =
      titleTag.split(" ");

    return words.some(word =>

  titleWordsSet.has(word)

);

  });

// =====================================
// TAG MAIS AMPLA
// =====================================

if(!relevance){

  tagMap.set(

    normalized,

    (tagMap.get(normalized) || 0)

    + 1

  );

  return;
}

// views
const videoViews =
  Number(
    video.statistics?.viewCount || 0
  );

      

      // peso
      const weight =

        Math.max(
          1,
          Math.log10(videoViews + 1)
        );

      tagMap.set(

        normalized,

        (tagMap.get(normalized) || 0)

        +

        weight

      );

    });

  });

// =====================================
// ORDENA
// =====================================

const rankedTags =

  [...tagMap.entries()]

    .sort((a,b)=>

      b[1] - a[1]

    )

    .slice(0,100)

    .map(([keyword,score]) => ({

      keyword,

      score: Math.min(

        99,

        Math.round(
          60 + (score * 2)
        )

      )

    }));


// =========================
// 📦 RESPONSE
// =========================

const responseData = {

  success: true,

  items,

  volume,

  competition,

  tags: rankedTags

};

// =========================
// 💾 CACHE SAVE
// =========================

if (cacheKey) {

  global.tubexSeoCache[cacheKey] = {

    data: responseData,

    expires:
      Date.now() +
      (15 * 60 * 1000)

  };

}

return res
  .status(200)
  .json(responseData);

  } catch (e) {

    console.error("💥 ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
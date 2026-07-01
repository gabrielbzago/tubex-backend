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
const accessToken =
    body?.accessToken || "";

    const keyword = body?.keyword?.trim();
    const mode = body?.mode || "seo";
    const videoId = body?.videoId;

    if (

    mode === "video_ai"

    &&

    !videoId

){

    return res.status(400).json({

        success:false,

        error:"videoId_required"

    });

}

if(

    mode !== "video_ai"

    &&

    !keyword

){

    return res.status(400).json({

        success:false,

        error:"keyword_required"

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
let activeKey = keys[0] || null;

    // =========================
    // 🔁 MULTI KEY FETCH
    // =========================
   const shuffledKeys = [...keys]
  .sort(() => Math.random() - 0.5);

for (const key of shuffledKeys) {

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

  const filtered = jsonVideos.items.filter(v => {

    const title =
      String(
        v?.snippet?.title || ""
      ).toLowerCase();

    // remove shorts
    if(title.includes("#shorts")){
      return false;
    }

    const videoViews =
      Number(
        v?.statistics?.viewCount || 0
      );

    const published =
      new Date(
        v?.snippet?.publishedAt
      ).getTime();

    const ageDays =

      (
        Date.now() - published
      )

      / (1000 * 60 * 60 * 24);

    // remove vídeo morto
    if(
      ageDays > 900
      &&
      videoViews < 5000
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
// 🎬 VIDEO DATA
// =========================

if (mode === "video_ai") {

  if (!videoId) {

    return res.status(400).json({
      success: false,
      error: "videoId_required"
    });

  }

console.log("================================");
console.log("VIDEO AI");
console.log("videoId:", videoId);
console.log("accessToken recebido:", !!accessToken);
console.log(
    accessToken
        ? accessToken.substring(0, 25) + "..."
        : "TOKEN NULO"
);
console.log("================================");

  // ======================================
  // VIDEO
  // ======================================

  const videoUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,statistics,contentDetails,status` +
    `&id=${videoId}` +
    `&key=${activeKey}`;

  const videoRes = await fetch(videoUrl);

  const videoJson = await videoRes.json();

  const video = videoJson.items?.[0];

  if (!video) {

    return res.status(404).json({
      success: false,
      error: "video_not_found"
    });

  }

  const snippet =
    video.snippet || {};

  const stats =
    video.statistics || {};

  const details =
    video.contentDetails || {};

  const status =
    video.status || {};

  const published =
    new Date(
      snippet.publishedAt
    ).getTime();

  const ageDays = Math.max(
    1,
    Math.round(
      (Date.now() - published) /
      86400000
    )
  );


// ======================================
// YOUTUBE ANALYTICS
// ======================================

let analytics = {

    ctr: null,

    impressions: null,

    averageViewDuration: null,

    averageViewPercentage: null,

    estimatedMinutesWatched: null,

    views: null

};

console.log("================================");
console.log("ACCESS TOKEN:", !!accessToken);
console.log(
    accessToken
        ? accessToken.substring(0,20) + "..."
        : "TOKEN NULO"
);
console.log("================================");

console.log("Entrou no bloco Analytics?", !!accessToken);

if (accessToken) {

    console.log(">>> CHAMANDO YOUTUBE ANALYTICS API");

    try {

        const startDate =
            snippet.publishedAt.slice(0, 10);

        const endDate =
            new Date()
                .toISOString()
                .slice(0, 10);

        const analyticsUrl =

            "https://youtubeanalytics.googleapis.com/v2/reports"

            +

            "?ids=channel==MINE"

            +

            `&startDate=${startDate}`

            +

            `&endDate=${endDate}`

            +

            "&dimensions=video"

            +

            `&filters=video==${video.id}`

            +

            "&metrics="

            +

            [

                "views",

                "estimatedMinutesWatched",

                "averageViewDuration",

                "averageViewPercentage",

                "impressions",

                "impressionClickThroughRate"

            ].join(",");

     const analyticsRes = await fetch(
    analyticsUrl,
    {
        headers:{
            Authorization:`Bearer ${accessToken}`
        }
    }
);

console.log("STATUS:", analyticsRes.status);
console.log("OK:", analyticsRes.ok);

console.log(
    "📡 Analytics Status:",
    analyticsRes.status
);

        const analyticsText =

            await analyticsRes.text();

        console.log(

            "📡 Analytics Body:",

            analyticsText

        );

        let analyticsJson = {};

        try {

            analyticsJson =

                JSON.parse(

                    analyticsText

                );

        }

        catch (e) {

            console.error(

                "Erro ao converter Analytics:",

                e

            );

            analyticsJson = {};

        }

        console.log(

            "📊 Analytics JSON:",

            analyticsJson

        );

      const row = analyticsJson?.rows?.[0];

if (!row) {

    console.log("================================");
    console.log("ANALYTICS COMPLETO");
    console.dir(analyticsJson, { depth: null });
    console.log("================================");

}

        if (row) {

            analytics = {

                views:

                    Number(row[0] ?? 0),

                estimatedMinutesWatched:

                    Number(row[1] ?? 0),

                averageViewDuration:

                    Number(row[2] ?? 0),

                averageViewPercentage:

                    Number(row[3] ?? 0),

                impressions:

                    Number(row[4] ?? 0),

                ctr:

                    Number(row[5] ?? 0)

            };

        }

        else {

            console.warn(

                "⚠ Nenhuma linha retornada pela Analytics API."

            );

        }

    }

    catch (e) {

        console.error(

            "Analytics API:",

            e

        );

    }

}

  // ======================================
  // CHANNEL
  // ======================================

  const channelUrl =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=snippet,statistics` +
    `&id=${snippet.channelId}` +
    `&key=${activeKey}`;

  const channelRes =
    await fetch(channelUrl);

  const channelJson =
    await channelRes.json();

  const channel =
    channelJson.items?.[0] || {};

  const channelSnippet =
    channel.snippet || {};

  const channelStats =
    channel.statistics || {};

  // ======================================
  // LAST VIDEOS
  // ======================================

  const latestSearchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&channelId=${snippet.channelId}` +
    `&order=date` +
    `&type=video` +
    `&maxResults=12` +
    `&key=${activeKey}`;

  const latestSearchRes =
    await fetch(latestSearchUrl);

  const latestSearchJson =
    await latestSearchRes.json();

  const latestIds =
    (latestSearchJson.items || [])
      .map(v => v.id?.videoId)
      .filter(Boolean);

  let latestVideos = [];

  if (latestIds.length) {

    const latestStatsUrl =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=snippet,statistics` +
      `&id=${latestIds.join(",")}` +
      `&key=${activeKey}`;

    const latestStatsRes =
      await fetch(latestStatsUrl);

    const latestStatsJson =
      await latestStatsRes.json();

    latestVideos =
      latestStatsJson.items || [];

  }

  // ======================================
  // CHANNEL AVERAGES
  // ======================================

  const averageViews =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.viewCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  const averageLikes =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.likeCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  const averageComments =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.commentCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  // ======================================
  // RESPONSE
  // ======================================

  return res.status(200).json({

    success: true,

    data: {

      // ======================================
      // VIDEO
      // ======================================

      id: video.id,

      title:
        snippet.title || "",

      titleLength:
        (snippet.title || "").length,

      description:
        snippet.description || "",

      descriptionLength:
        (snippet.description || "").length,

      hasDescription:
        (snippet.description || "").trim().length > 0,

      tags:
        snippet.tags || [],

      tagCount:
        snippet.tags?.length || 0,

      hasTags:
        (snippet.tags?.length || 0) > 0,

      categoryId:
        snippet.categoryId || "",

      language:
        snippet.defaultLanguage || "",

      channelId:
        snippet.channelId || "",

      channelTitle:
        snippet.channelTitle || "",

      publishedAt:
        snippet.publishedAt || "",

      publishedYear:
        new Date(
          snippet.publishedAt
        ).getFullYear(),

      thumbnail:

        snippet.thumbnails?.maxres?.url ||

        snippet.thumbnails?.standard?.url ||

        snippet.thumbnails?.high?.url ||

        snippet.thumbnails?.medium?.url ||

        "",

      hasThumbnail:
        !!snippet.thumbnails?.high,

      duration:
        details.duration || "",

      privacy:
        status.privacyStatus || "",

      licensed:
        status.license || "",

      embeddable:
        status.embeddable,

      madeForKids:
        status.madeForKids,

      views:

        Number(
          stats.viewCount || 0
        ),

      likes:

        Number(
          stats.likeCount || 0
        ),

      comments:

        Number(
          stats.commentCount || 0
        ),

      favorites:

        Number(
          stats.favoriteCount || 0
        ),

      ageDays,

      viewsPerDay:

        Math.round(

          Number(
            stats.viewCount || 0
          )

          /

          ageDays

        ),
ctr:

analytics.ctr,

impressions:

analytics.impressions,

averageViewDuration:

analytics.averageViewDuration,

averageViewPercentage:

analytics.averageViewPercentage,

estimatedMinutesWatched:

analytics.estimatedMinutesWatched,

      seo: {

        titleLength:
          (snippet.title || "").length,

        descriptionLength:
          (snippet.description || "").length,

        tagCount:
          snippet.tags?.length || 0,

        keywordDensity: null

      },

      // ======================================
      // CHANNEL
      // ======================================

      channel: {

        id:
          snippet.channelId,

        title:
          channelSnippet.title || "",

        description:
          channelSnippet.description || "",

        customUrl:
          channelSnippet.customUrl || "",

        country:
          channelSnippet.country || "",

        publishedAt:
          channelSnippet.publishedAt || "",

        subscribers:

          Number(
            channelStats.subscriberCount || 0
          ),

        totalViews:

          Number(
            channelStats.viewCount || 0
          ),

        totalVideos:

          Number(
            channelStats.videoCount || 0
          ),

        averageViews,

        averageLikes,

        averageComments

      },

      // ======================================
      // LAST VIDEOS
      // ======================================

      latestVideos:

        latestVideos.map(video=>({

          id:
            video.id,

          title:
            video.snippet?.title || "",

          views:

            Number(
              video.statistics?.viewCount || 0
            ),

          likes:

            Number(
              video.statistics?.likeCount || 0
            ),

          comments:

            Number(
              video.statistics?.commentCount || 0
            ),

          publishedAt:
            video.snippet?.publishedAt || ""

        })),

      // ======================================
      // PERFORMANCE
      // ======================================

      performance: {

        isAboveChannelAverage:

          Number(
            stats.viewCount || 0
          ) > averageViews,

        channelAverageViews:
          averageViews,

        differenceFromAverage:

          Number(
            stats.viewCount || 0
          ) - averageViews,

        percentageOfAverage:

          averageViews > 0

            ? Math.round(

                (
                  Number(
                    stats.viewCount || 0
                  )

                  /

                  averageViews

                ) * 100

              )

            : 0

      },

      // ======================================
      // FLAGS
      // ======================================

      flags: {

        hasDescription:

          (snippet.description || "")
          .trim()
          .length > 0,

        hasTags:

          (snippet.tags?.length || 0) > 0,

        hasThumbnail:

          !!snippet.thumbnails?.high,

        isPublic:

          status.privacyStatus === "public",

        isEmbeddable:

          !!status.embeddable,

        madeForKids:

          !!status.madeForKids

      },

      // ======================================
      // RAW
      // ======================================

      raw: {

        snippet,

        statistics: stats,

        contentDetails: details,

        status

      }

    }

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
    // 📈 MÉTRICAS SEO
    // =========================
    items.sort((a, b) =>
      Number(b.statistics.viewCount || 0) -
      Number(a.statistics.viewCount || 0)
    );

    const totalViews = items.reduce((acc, v) =>
      acc + Number(v.statistics?.viewCount || 0), 0
    );

    const avgViews =
  totalViews /
  Math.max(items.length, 1);

    const top = Number(items[0]?.statistics?.viewCount || 0);
const median =
  Number(
    items[Math.floor(items.length / 2)]?.statistics?.viewCount || 0
  );

    const volume = Math.min(100,
      Math.round(
        (Math.log10(top + 1) * 10) +
        (Math.log10(median + 1) * 5)
      )
    );

    const dominance = top / (median || 1);
    const competition = Math.min(100, Math.log10(dominance + 1) * 40);
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

  .slice(0,10)

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

      // relevância contextual
      const relevance =
        titleTags.some(titleTag =>

          normalized.includes(titleTag)

          ||

          titleTag.includes(normalized)

        );

      if(!relevance){
        return;
      }

      // views
      const views =
        Number(
          video.statistics?.viewCount || 0
        );

      // peso
      const weight =

        Math.max(
          1,
          Math.log10(views + 1)
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

    .slice(0,40)

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
// 📊 EXTRA METRICS
// =========================

const averageViews =
  Math.round(avgViews);

const averageLikes =
  Math.round(

    items.reduce(

      (acc,v)=>

        acc +

        Number(
          v.statistics?.likeCount || 0
        ),

      0

    )

    /

    Math.max(items.length,1)

  );

const averageComments =
  Math.round(

    items.reduce(

      (acc,v)=>

        acc +

        Number(
          v.statistics?.commentCount || 0
        ),

      0

    )

    /

    Math.max(items.length,1)

  );

const maxViews =
items.length
? Math.max(
    ...items.map(v =>
      Number(
        v.statistics?.viewCount || 0
      )
    )
  )
: 0;

const minViews =
items.length
? Math.min(
    ...items.map(v =>
      Number(
        v.statistics?.viewCount || 0
      )
    )
  )
: 0;
// =========================
// 📦 RESPONSE
// =========================

const responseData = {

  success: true,

  items,

  volume,

  competition,

  tags: rankedTags,

  metrics:{

    averageViews,

    averageLikes,

    averageComments,

    maxViews,

    minViews,

    medianViews: median

  }

};

// =========================
// 💾 CACHE SAVE
// =========================

if (cacheKey) {

  global.tubexSeoCache[cacheKey] = {

    data: responseData,

    expires:
      Date.now() +
      (5 * 60 * 1000)

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
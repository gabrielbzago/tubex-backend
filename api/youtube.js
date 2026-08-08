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

// NOVO
let totalResults = 0;

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

       let maxPages = 4;

if (body?.plan === "free")
    maxPages = 2;

if (body?.plan === "pro")
    maxPages = 6;

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
if (pageCount === 0) {

    totalResults = Number(
        searchJson.pageInfo?.totalResults || 0
    );

}
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
        ? accessToken.substring(0, 20) + "..."
        : "TOKEN NULO"
);
console.log("================================");

console.log("Entrou no bloco Analytics?", !!accessToken);

if (accessToken) {

    console.log(">>> CHAMANDO YOUTUBE ANALYTICS API");

    try {

        const startDate =
            snippet.publishedAt.slice(0, 10);

        const yesterday = new Date();

yesterday.setDate(
    yesterday.getDate() - 1
);

const endDate =
    yesterday
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

            "&metrics=" +

            [

                "views",

                "estimatedMinutesWatched",

                "averageViewDuration",

                "averageViewPercentage"

            ].join(",");

        let analyticsJson = {};

        let row = null;

        // ======================================
        // PRIMEIRA TENTATIVA
        // ======================================

        for (let attempt = 1; attempt <= 2; attempt++) {

            const analyticsRes = await fetch(

                analyticsUrl,

                {

                    headers: {

                        Authorization:

                            `Bearer ${accessToken}`

                    }

                }

            );

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

            try {

                analyticsJson =
                    JSON.parse(analyticsText);

            }

            catch (e) {

                analyticsJson = {};

            }

            console.log(
                "📊 Analytics JSON:",
                analyticsJson
            );

            row =
                analyticsJson?.rows?.[0];

            if (row) {

                break;

            }

            console.warn(

                `⚠ Analytics vazia. Tentativa ${attempt}/2`

            );

            if (attempt < 2) {

                await new Promise(

                    resolve =>

                        setTimeout(

                            resolve,

                            2500

                        )

                );

            }

        }

        // ======================================
        // SEM DADOS
        // ======================================

if (!row) {

    console.warn(
        "⚠ Analytics ainda não disponível para este vídeo."
    );

}
else {

    analytics = {

        videoId: row[0],

        views:
            Number(row[1] ?? 0),

        estimatedMinutesWatched:
            Number(row[2] ?? 0),

        averageViewDuration:
            Number(row[3] ?? 0),

        averageViewPercentage:
            Number(row[4] ?? -1),

        impressions: null,

        ctr: null

    };

    console.log(
        "✅ Analytics carregada:",
        analytics
    );

}

       }

    catch (e) {

        console.error(

            "❌ Analytics API:",

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
    analytics.ctr ?? 0,

impressions:
    analytics.impressions ?? 0,

averageViewDuration:

analytics.averageViewDuration,

averageViewPercentage:

Number(
    analytics.averageViewPercentage ?? -1
),

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


// =========================
// 📅 VÍDEOS DOS ÚLTIMOS 31 DIAS
// =========================

const recentItems = items.filter(video => {

    const published =
        new Date(video.snippet?.publishedAt).getTime();

    const ageDays =
        (Date.now() - published) / 86400000;

    return ageDays <= 31;

});

console.log("================================");
console.log("Vídeos encontrados:", items.length);
console.log("Vídeos últimos 31 dias:", recentItems.length);
console.log("================================");

// =========================
// 📊 ESTATÍSTICAS DA SERP
// =========================

const totalViews = items.reduce((acc, video) => {

    return acc +

        Number(
            video.statistics?.viewCount || 0
        );

}, 0);

const avgViews =

    totalViews /

    Math.max(
        items.length,
        1
    );

const top =

    Number(
        items[0]?.statistics?.viewCount || 0
    );

const median =

    Number(

        items[
            Math.floor(items.length / 2)
        ]?.statistics?.viewCount || 0

    );

// =========================
// 📅 IDADE MÉDIA DOS VÍDEOS
// =========================

const averageAgeDays = Math.round(

    items.reduce((acc, video) => {

        const published =
            new Date(
                video.snippet?.publishedAt
            ).getTime();

        const age =

            (Date.now() - published)

            /

            86400000;

        return acc + age;

    }, 0)

    /

    Math.max(items.length, 1)

);

// =========================
// 🚀 VIEWS POR DIA (31 DIAS)
// =========================

// Usa apenas vídeos recentes quando existirem.
// Caso não existam vídeos dos últimos 31 dias,
// utiliza toda a SERP como fallback.

const velocitySource =
    recentItems.length
        ? recentItems
        : items;

const viewsPerDayList = velocitySource.map(video => {

    const views =
        Number(video.statistics?.viewCount || 0);

    const published =
        new Date(
            video.snippet?.publishedAt
        ).getTime();

    const ageDays =
        Math.max(
            1,
            (Date.now() - published) / 86400000
        );

    return views / ageDays;

});

const averageViewsPerDay = Math.round(

    viewsPerDayList.reduce(
        (acc, value) => acc + value,
        0
    )

    /

    Math.max(
        viewsPerDayList.length,
        1
    )

);

const maxViewsPerDay = Math.round(

    Math.max(
        ...viewsPerDayList,
        0
    )

);

const serpPower = Math.min(

100,

Math.round(

Math.log10(

averageViewsPerDay *

Math.max(median,1)

+1

)*8

)

);


// =========================
// 📊 SCORE DE VIEWS/DIA
// =========================

const viewsPerDayScore = Math.min(

    100,

    Math.round(

        Math.log10(

            averageViewsPerDay + 1

        ) * 18

    )

);

// =========================
// 💪 VÍDEOS FORTES
// =========================

const strongVideos =
(recentItems.length ? recentItems : items)
.filter(video => {

    const views = Number(
        video.statistics?.viewCount || 0
    );

    const published = new Date(
        video.snippet?.publishedAt
    ).getTime();

    const ageDays = Math.max(
        1,
        (Date.now() - published) / 86400000
    );

    const viewsPerDay = views / ageDays;

    return (
        views >= median &&
        viewsPerDay >= averageViewsPerDay
    );

}).length;


let viralVideos=0;

velocitySource.forEach(video=>{

const views=
Number(video.statistics.viewCount||0);

const age=Math.max(

1,

(Date.now()-new Date(video.snippet.publishedAt))/86400000

);

const velocity=views/age;

if(velocity>=100000){

viralVideos++;

}

});

const viralScore=Math.round(

viralVideos/

Math.max(velocitySource.length,1)

*100

);

// =========================
// 💪 SCORE DE VÍDEOS FORTES
// =========================

const strongVideosScore = Math.min(

    100,

    Math.round(

        (

            strongVideos /

            Math.max(items.length, 1)

        ) * 100

    )

);

// =========================
// 📈 DESVIO PADRÃO DAS VIEWS
// =========================

const variance = items.reduce((acc, video) => {

    const views =
        Number(video.statistics?.viewCount || 0);

    return acc + Math.pow(
        views - avgViews,
        2
    );

}, 0) / Math.max(items.length, 1);

const standardDeviation =
    Math.sqrt(variance);

// =========================
// 📊 COEFICIENTE DE VARIAÇÃO
// =========================

const coefficientVariation =
    avgViews > 0
        ? standardDeviation / avgViews
        : 0;


// =========================
// 📊 CONSISTÊNCIA DA SERP
// =========================

const consistencyScore = Math.max(

    0,

    Math.min(

        100,

        Math.round(

            100 -

            (coefficientVariation * 35)

        )

    )

);


// =========================
// 📊 VIEW DISTRIBUTION SCORE
// =========================

// Soma total de views

const totalViewCount =
    items.reduce(

        (acc, video)=>

            acc +

            Number(
                video.statistics?.viewCount || 0
            ),

        0

    );

// Top 20% dos vídeos

const topVideos =

    items.slice(

        0,

        Math.max(
            1,
            Math.ceil(items.length * 0.20)
        )

    );

// Views concentradas no topo

const topViews =

    topVideos.reduce(

        (acc, video)=>

            acc +

            Number(
                video.statistics?.viewCount || 0
            ),

        0

    );

// Percentual concentrado

const topShare =

    totalViewCount > 0

        ? topViews / totalViewCount

        : 1;

// Score

const distributionScore = Math.round(

    Math.max(

        0,

        Math.min(

            100,

            100 -

            ((topShare - 0.20) * 125)

        )

    )

);


// =========================
// 🔍 KEYWORD SCORE
// =========================

const keywordWords =
    keyword
        .toLowerCase()
        .trim()
        .split(/\s+/);

const keywordWordCount =
    keywordWords.length;

let keywordScore = 50;

// Long Tail
if (keywordWordCount >= 4)
    keywordScore += 15;

// Muito específica
if (keywordWordCount >= 6)
    keywordScore += 10;

// Ano
if (/(2025|2026|2027)/.test(keyword))
    keywordScore += 10;

// Pergunta
if (/^(como|how|what|qual|porque|why)/i.test(keyword))
    keywordScore += 8;

// Muito curta costuma ser extremamente concorrida
if (keywordWordCount === 1)
    keywordScore -= 20;

if (keywordWordCount === 2)
    keywordScore -= 10;

keywordScore = Math.max(
    10,
    Math.min(
        100,
        keywordScore
    )
);


// =========================
// MARKET SIZE
// =========================

let marketDifficulty = 0;

if(keywordWordCount === 1){

    marketDifficulty = 100;

}

else if(keywordWordCount === 2){

    marketDifficulty = 85;

}

else if(keywordWordCount === 3){

    marketDifficulty = 65;

}

else if(keywordWordCount === 4){

    marketDifficulty = 45;

}

else if(keywordWordCount === 5){

    marketDifficulty = 30;

}

else{

    marketDifficulty = 15;

}


// =========================
// TOTAL RESULTS SCORE
// =========================

const totalResultsScore = Math.min(

    100,

    Math.round(

        Math.log10(totalResults + 1) * 12

    )

);


// =========================
// 🎯 RELEVANCE SCORE
// Quanto os títulos realmente respondem à busca
// =========================

const normalizedKeyword =
    keyword
        .toLowerCase()
        .trim();

let relevancePoints = 0;

items.forEach(video=>{

    const title =
        String(video.snippet?.title || "")
            .toLowerCase()
            .trim();

    if(title === normalizedKeyword){

        relevancePoints += 5;
        return;

    }

    if(title.startsWith(normalizedKeyword)){

        relevancePoints += 4;
        return;

    }

    if(title.includes(normalizedKeyword)){

        relevancePoints += 3;
        return;

    }

    const matchedWords =
        keywordWords.filter(word=>
            title.includes(word)
        ).length;

    relevancePoints +=
        (matchedWords / keywordWords.length) * 2;

});

const relevanceScore = Math.round(

    Math.min(

        100,

        (relevancePoints /

        (items.length * 5))

        *100

    )

);

// =========================
// 🚀 TUBEX VOLUME SCORE V3
// =========================

// Views do vídeo mais forte
const topScore = Math.min(
    100,
    Math.round(Math.log10(top + 1) * 14)
);

// Mediana da SERP
const medianScore = Math.min(
    100,
    Math.round(Math.log10(median + 1) * 14)
);

// Média de views por dia
const velocityScore = Math.min(
    100,
    Math.round(Math.log10(averageViewsPerDay + 1) * 18)
);

// Quantidade de vídeos fortes
const strengthScore = Math.round(

    (

        strongVideos /

        Math.max(
            (recentItems.length ? recentItems : items).length,
            1
        )

    ) * 100

);
// Long Tail
const longTailBonus = keywordScore;

// =========================
// 🔥 DEMAND SCORE
// Mede a força natural da palavra
// =========================

let demandScore = 0;

// Palavra curta costuma ter enorme procura
if(keywordWordCount === 1){

    demandScore += 45;

}

else if(keywordWordCount === 2){

    demandScore += 30;

}

else if(keywordWordCount === 3){

    demandScore += 18;

}

else if(keywordWordCount === 4){

    demandScore += 10;

}

else{

    demandScore += 5;

}

// Muitos vídeos realmente relevantes

demandScore += totalResultsScore * 0.20;

// Vídeos extremamente fortes

if(top > 10000000){

    demandScore += 20;

}

else if(top > 1000000){

    demandScore += 15;

}

else if(top > 100000){

    demandScore += 10;

}

// Mediana forte

if(median > 1000000){

    demandScore += 10;

}

else if(median > 100000){

    demandScore += 5;

}

// Limite

demandScore = Math.min(

    100,

    Math.round(demandScore)

);


const volume = Math.round(

      demandScore * 0.45

    + topScore * 0.15

    + medianScore * 0.15

    + velocityScore * 0.10

    + strengthScore * 0.05

    + relevanceScore * 0.10

);

const finalVolume = Math.max(

    5,

    Math.min(

        100,

        volume

    )

);



// =========================
// 🚀 TUBEX COMPETITION V4
// =========================

let exactMatches = 0;
let partialMatches = 0;
let recentVideos = 0;

// -------------------------
// Analisa todos os títulos
// -------------------------

items.forEach(video=>{

    const title =
        String(video.snippet?.title || "")
        .toLowerCase();

    const ageDays =
        (
            Date.now() -
            new Date(video.snippet.publishedAt).getTime()
        ) / 86400000;

    // LONG TAIL
    if(keywordWords.length >= 3){

        if(title.startsWith(normalizedKeyword)){

            exactMatches++;

        }
        else if(title.includes(normalizedKeyword)){

            exactMatches += 0.7;

        }

    }

    // SHORT TAIL
    else{

        const matched =
            keywordWords.filter(word=>
                title.includes(word)
            ).length;

        partialMatches +=
            matched / keywordWords.length;

    }

    // vídeo recente aumenta concorrência

  if (ageDays <= 90) {

    recentVideos++;

}

});


// -------------------------
// Percentual de títulos
// -------------------------

const titleCoverage =

    keywordWords.length >= 3

        ? exactMatches / items.length

        : partialMatches / items.length;


// -------------------------
// Facilidade natural
// 100 = muito fácil
// 0 = muito difícil
// -------------------------

let competitionMarketDifficulty = 100;

switch (keywordWords.length){

    case 1:
        competitionMarketDifficulty = 100;
        break;

    case 2:
        competitionMarketDifficulty = 90;
        break;

    case 3:
        competitionMarketDifficulty = 75;
        break;

    case 4:
        competitionMarketDifficulty = 55;
        break;

    case 5:
        competitionMarketDifficulty = 35;
        break;

    default:
        competitionMarketDifficulty = 20;
        break;

}

// -------------------------
// Vídeos recentes
// -------------------------

const freshnessDifficulty = Math.round(

    (recentVideos / Math.max(items.length, 1)) * 100

);

// -------------------------
// Cobertura dos títulos
// -------------------------

const coverageDifficulty = Math.round(

    titleCoverage * 100

);

// -------------------------
// Dominância de canais
// -------------------------

const channelCount = {};

items.forEach(video => {

    const id = video.snippet?.channelId;

    if(!id) return;

    channelCount[id] = (channelCount[id] || 0) + 1;

});

const biggestChannel = Math.max(

    ...Object.values(channelCount),

    0

);

const channelDominance = Math.round(

    (biggestChannel / Math.max(items.length,1)) * 100

);

let giantChannels = 0;

items.forEach(video=>{

const subs =
Number(video.channelSubscribers || 0);

if(subs>=1000000){

giantChannels++;

}

});

const giantChannelScore = Math.round(

(giantChannels/items.length)*100

);

const repeatedChannels=

Object.values(channelCount)

.filter(v=>v>=2)

.length;

const repetitionScore=Math.round(

repeatedChannels/

Math.max(Object.keys(channelCount).length,1)

*100

);

// =========================
// FRESHNESS SCORE
// =========================

const freshnessScore = Math.round(

    Math.max(

        0,

        100 - (averageAgeDays / 12)

    )

);

// =========================
// AUTHORITY SCORE
// =========================

const authorityScore = Math.round(

(

channelDominance +

competitionMarketDifficulty

)

/

2

);


// =========================
// STRENGTH SCORE
// =========================

const strengthScore = Math.round(

(

serpPower +

viewsPerDayScore +

distributionScore +

consistencyScore

)

/

4

);

// =========================
// SEO DIFFICULTY
// =========================

const seoDifficulty = Math.round(

(

coverageDifficulty +

relevanceScore +

totalResultsScore

)

/

3

);

// -------------------------
// Competição Final
// -------------------------
const competition = Math.round(

strengthScore * 0.35 +

authorityScore * 0.25 +

seoDifficulty * 0.20 +

freshnessScore * 0.10 +

competitionMarketDifficulty * 0.10

);

// Garante faixa válida

const finalCompetition = Math.max(

    5,

   Math.min(

100,

Math.round(

Math.pow(

competition / 100,

0.82

) * 100

)

)

);

// -------------------------
// Detalhes
// -------------------------

const competitionDetails = {

    marketDifficulty: competitionMarketDifficulty,

    coverageDifficulty,

    freshnessDifficulty,

    channelDominance,

    exactMatches,

    partialMatches,

    recentVideos

};

// =========================
// 🧠 UNIVERSAL SEO ENGINE
// =========================

// mapa final
const tagMap = new Map();



function hashString(str){

    let hash = 0;

    for(let i = 0; i < str.length; i++){

        hash =
            str.charCodeAt(i) +
            ((hash << 5) - hash);

    }

    return Math.abs(hash);

}

// ======================================
// GERA HISTÓRICO ESTIMADO (30 DIAS)
// ======================================

function generateEstimatedTrend(volume, competition){

    const seedBase =
        hashString(keyword);

    let seed = seedBase;

    const trend = [];

    // ======================================
    // MÉDIA DE PESQUISAS/DIA
    // ======================================

    const average = Math.round(

        400 +

        Math.pow(volume, 1.35) * 18

    );

    // ======================================
    // DIREÇÃO DA CURVA
    // ======================================

    let tendency = 1;

    // Concorrência BAIXA (ótima)
if(competition >= 70){

    tendency = 1.008;

}

// Concorrência MÉDIA
else if(competition >= 40){

    tendency = 1.000;

}

// Concorrência ALTA (difícil)
else{

    tendency = 0.994;

}


    // ======================================
    // VOLATILIDADE
    // ======================================

   const volatility =
    average * 0.030;

    // começa próximo da média

   let current =

    average *

    (0.90 + ((seed % 20) / 100));

    // ======================================
    // 30 DIAS
    // ======================================

    for(let i = 0; i < 30; i++){

        // random determinístico

        seed =
            (seed * 9301 + 49297) % 233280;

        const random =
            seed / 233280;

        // tendência

current *= tendency;

// perde força conforme sobe

current -=

    (current-average)

    *0.04;


        // pequenas oscilações

        current +=

            Math.round(

                (random - 0.5)

                * volatility

            );

        // limites

        current = Math.max(

            average * 0.60,

            current

        );

        current = Math.min(

            average * 1.60,

            current

        );

        trend.push({

            day: i + 1,

            value: Math.round(current)

        });

    }

    return trend;

}

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
// 🚀 TUBEX COMPETITION SCORE
// =========================

// Score da quantidade de vídeos analisados

const videoScore =

    Math.min(

        items.length / 50,

        1

    ) * 20;

// Score da média de views

const averageViewsScore =

    Math.min(

        Math.log10(averageViews + 1) / 8,

        1

    ) * 30;

// Score do maior vídeo

const maxViewsScore =

    Math.min(

        Math.log10(maxViews + 1) / 8,

        1

    ) * 20;

// Score da concorrência

const competitionBase =

    competition * 0.30;

// =========================
// IDADE DOS VÍDEOS
// =========================

const ageScore =

    Math.min(

        averageAgeDays / 365,

        5

    ) * 6;

// Resultado

const competitionScore =

    Math.round(

        videoScore +

averageViewsScore +

maxViewsScore +

competitionBase +

ageScore

    );
// =========================
// 📦 RESPONSE
// =========================

const trend = generateEstimatedTrend(
    finalVolume,
    competition
);
// =========================
// 📊 YOUTUBE METRICS
// =========================

const youtubeMetrics = {

    videoCount: items.length,

    averageViews,

keywordScore,
relevanceScore,
    averageAgeDays,

    averageViewsPerDay,
strongVideos,
distributionScore,
topShare,

    maxViewsPerDay,

    maxViews,

    minViews,

    medianViews: median

};

const responseData = {

    success: true,

    items,

    volume: finalVolume,

    competition: finalCompetition,
competitionDetails,
competitionScore,

    // Google Trends
    interest: 0,

youtubeMetrics,

    trend,

    tags: rankedTags,

  metrics: {

    averageViews,

    averageViewsPerDay,
distributionScore,

topShare,
    maxViewsPerDay,
strongVideos,
relevanceScore,
    averageLikes,
standardDeviation,

coefficientVariation,

consistencyScore,
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
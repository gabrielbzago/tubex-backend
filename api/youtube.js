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



async function fetchGoogleVerification(keyword) {
  if (!process.env.SERPAPI_API_KEY) {
    return {
      verified: false,
      appearing: null,
      error: "serpapi_not_configured",
      checkedAt: new Date().toISOString()
    };
  }

  const normalizeYoutubeUrl = value => String(value || "").toLowerCase().includes("youtube.com/") || String(value || "").toLowerCase().includes("youtu.be/");

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", keyword);
    url.searchParams.set("gl", "br");
    url.searchParams.set("hl", "pt-BR");
    url.searchParams.set("google_domain", "google.com.br");
    url.searchParams.set("num", "20");
    url.searchParams.set("no_cache", "false");
    url.searchParams.set("api_key", process.env.SERPAPI_API_KEY);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let payload;
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "TubeX/1.0" },
        signal: controller.signal
      });
      const text = await response.text();
      payload = JSON.parse(text);
      if (!response.ok) throw new Error(payload?.error || `SerpApi HTTP ${response.status}`);
    } finally {
      clearTimeout(timer);
    }

    let youtube = [];
    const organic = Array.isArray(payload?.organic_results) ? payload.organic_results : [];
    const videos = Array.isArray(payload?.video_results) ? payload.video_results : [];
    [...videos, ...organic].forEach((item, index) => {
      const link = item?.link || item?.url || item?.original_link || "";
      if (normalizeYoutubeUrl(link)) {
        youtube.push({
          position: Number(item?.position ?? item?.position_on_page ?? index + 1),
          title: String(item?.title || item?.name || "").trim(),
          url: String(link).trim()
        });
      }
    });

    const unique = [];
    const seen = new Set();
    for (const item of youtube) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    return {
      verified: true,
      appearing: unique.length > 0,
      source: "SerpApi / Google Search",
      provider: "SerpApi",
      checkedAt: new Date().toISOString(),
      resultCount: unique.length,
      youtubeResults: unique.length,
      position: unique[0]?.position ?? null,
      rank: unique[0]?.position ?? null,
      results: unique
    };
  } catch (error) {
    console.warn("[TubeX] Google verification failed:", error?.message || error);
    return {
      verified: false,
      appearing: null,
      error: "google_search_unavailable",
      message: String(error?.message || error || "Google Search indisponível").slice(0, 180),
      checkedAt: new Date().toISOString()
    };
  }
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
    global.tubexChannelCache = global.tubexChannelCache || {};

    const cacheKey = keyword ? `seo_v3_related_${keyword.toLowerCase()}` : null;

    if (cacheKey) {
      const cached = global.tubexSeoCache[cacheKey];

      if (cached && cached.expires > Date.now()) {
        console.log("⚡ CACHE HIT SEO:", keyword);
        return res.status(200).json(cached.data);
      }
    }

    // =========================
    // 🔑 SINGLE YOUTUBE API KEY
    // =========================
    // Production uses exactly one credential/project.
    // Any additional comma-separated values are intentionally ignored.
    const activeKey = String(process.env.YOUTUBE_API_KEY || "")
      .split(",")[0]
      .trim();

    let items = [];
    let success = false;
    let youtubeSearchSucceeded = false;
    let totalResults = 0;

    if (!activeKey) {
      return res.status(200).json({
        success: false,
        items: [],
        volume: 0,
        competition: null,
        error: "youtube_api_unavailable"
      });
    }

    // =========================
    // 🎯 OPTIMIZED SEARCH FETCH
    // =========================
    // Keep the same maximum result coverage while cutting search.list calls:
    // 25 x 6 pages = 150 results (600 quota units)
    // 50 x 3 pages = 150 results (300 quota units)
    // Free remains 50 results in a single call.
    let maxPages = 3;
    if (body?.plan === "free") maxPages = 1;

    try {
      let allIds = [];
      let nextPageToken = "";
      let pageCount = 0;

      while (pageCount < maxPages) {
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&type=video&order=relevance&maxResults=50` +
          `&q=${encodeURIComponent(keyword)}` +
          (nextPageToken ? `&pageToken=${nextPageToken}` : "") +
          `&key=${activeKey}`;

        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json().catch(() => ({}));

        const reason = searchJson?.error?.errors?.[0]?.reason || "";
        if (searchRes.status === 403 || searchRes.status === 429) {
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || searchRes.status === 429) {
            throw new Error("quota_exceeded");
          }
          throw new Error(searchJson?.error?.message || `youtube_search_http_${searchRes.status}`);
        }

        if (!searchRes.ok || searchJson?.error) {
          throw new Error(searchJson?.error?.message || `youtube_search_http_${searchRes.status}`);
        }

        youtubeSearchSucceeded = true;
        if (pageCount === 0) {
          totalResults = Number(searchJson.pageInfo?.totalResults || 0);
        }

        const ids = (searchJson.items || [])
          .map(v => v.id?.videoId)
          .filter(Boolean);

        allIds.push(...ids);
        nextPageToken = searchJson.nextPageToken || "";
        pageCount++;

        if (!nextPageToken) break;
      }

      const uniqueIds = [...new Set(allIds)];

      // videos.list is already inexpensive and supports up to 50 IDs/request.
      for (let i = 0; i < uniqueIds.length; i += 50) {
        const chunk = uniqueIds.slice(i, i + 50).join(",");
        if (!chunk) continue;

        const videosUrl =
          `https://www.googleapis.com/youtube/v3/videos` +
          `?part=snippet,statistics&id=${chunk}&key=${activeKey}`;

        const resVideos = await fetch(videosUrl);
        const jsonVideos = await resVideos.json().catch(() => ({}));

        const reason = jsonVideos?.error?.errors?.[0]?.reason || "";
        if (resVideos.status === 403 || resVideos.status === 429) {
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || resVideos.status === 429) {
            throw new Error("quota_exceeded");
          }
          throw new Error(jsonVideos?.error?.message || `youtube_videos_http_${resVideos.status}`);
        }

        if (!resVideos.ok || jsonVideos?.error) {
          throw new Error(jsonVideos?.error?.message || `youtube_videos_http_${resVideos.status}`);
        }

        if (Array.isArray(jsonVideos.items)) {
          const filtered = jsonVideos.items.filter(v => {
            const title = String(v?.snippet?.title || "").toLowerCase();
            if (title.includes("#shorts")) return false;

            const videoViews = Number(v?.statistics?.viewCount || 0);
            const published = new Date(v?.snippet?.publishedAt).getTime();
            const ageDays = (Date.now() - published) / (1000 * 60 * 60 * 24);

            if (ageDays > 900 && videoViews < 5000) return false;
            return true;
          });

          items.push(...filtered);
        }
      }

      success = true;

    } catch (e) {
      console.warn("[TubeX] YouTube search failed:", e?.message || e);
    }

    if (youtubeSearchSucceeded) success = true;

 // =========================
// 🚫 FALHA TOTAL DA API
// =========================
//
// IMPORTANTE:
// Isso NÃO significa "keyword sem volume".
// Significa que o YouTube API não respondeu
// corretamente após tentar as chaves disponíveis.
//

if (!success) {

    return res.status(200).json({

        success: false,

        items: [],

        volume: 0,

        competition: null,

        error: "youtube_api_unavailable"

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
  // CHANNEL + LAST VIDEOS
  // ======================================
  // Cache these channel-scoped calls independently from the keyword cache.
  // This prevents every new keyword from spending another search.list call
  // just to rebuild the same channel overview.
  const channelCacheKey = `channel_v2_${snippet.channelId}`;
  const cachedChannel = global.tubexChannelCache[channelCacheKey];

  let channel = cachedChannel?.expires > Date.now() ? cachedChannel.data.channel : null;
  let latestVideos = cachedChannel?.expires > Date.now() ? cachedChannel.data.latestVideos : null;

  if (!channel || !Array.isArray(latestVideos)) {
    const channelUrl =
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=snippet,statistics` +
      `&id=${snippet.channelId}` +
      `&key=${activeKey}`;

    const channelRes = await fetch(channelUrl);
    const channelJson = await channelRes.json().catch(() => ({}));
    if (!channelRes.ok) {
      throw new Error(channelJson?.error?.message || `youtube_channel_http_${channelRes.status}`);
    }

    channel = channelJson.items?.[0] || {};

    const latestSearchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${snippet.channelId}` +
      `&order=date` +
      `&type=video` +
      `&maxResults=12` +
      `&key=${activeKey}`;

    const latestSearchRes = await fetch(latestSearchUrl);
    const latestSearchJson = await latestSearchRes.json().catch(() => ({}));
    if (!latestSearchRes.ok) {
      throw new Error(latestSearchJson?.error?.message || `youtube_latest_search_http_${latestSearchRes.status}`);
    }

    const latestIds = (latestSearchJson.items || [])
      .map(v => v.id?.videoId)
      .filter(Boolean);

    latestVideos = [];

    if (latestIds.length) {
      const latestStatsUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet,statistics` +
        `&id=${latestIds.join(",")}` +
        `&key=${activeKey}`;

      const latestStatsRes = await fetch(latestStatsUrl);
      const latestStatsJson = await latestStatsRes.json().catch(() => ({}));
      if (!latestStatsRes.ok) {
        throw new Error(latestStatsJson?.error?.message || `youtube_latest_videos_http_${latestStatsRes.status}`);
      }

      latestVideos = latestStatsJson.items || [];
    }

    global.tubexChannelCache[channelCacheKey] = {
      data: { channel, latestVideos },
      expires: Date.now() + (15 * 60 * 1000)
    };
  }

  const channelSnippet = channel.snippet || {};
  const channelStats = channel.statistics || {};

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
// 🎯 MATCHES DE TÍTULO
// =========================
//
// Mede quanto a SERP realmente
// responde à keyword pesquisada.
//

let exactTitleMatches = 0;
let prefixTitleMatches = 0;
let phraseTitleMatches = 0;
let partialTitleMatches = 0;

items.forEach(video => {

    const title =
        String(video.snippet?.title || "")
            .toLowerCase()
            .trim();

    if (title === normalizedKeyword) {

        exactTitleMatches++;

    }
    else if (title.startsWith(normalizedKeyword)) {

        prefixTitleMatches++;

    }
    else if (title.includes(normalizedKeyword)) {

        phraseTitleMatches++;

    }
    else {

        const matchedWords =
            keywordWords.filter(word =>
                title.includes(word)
            ).length;

        if (
            matchedWords >=
            Math.ceil(keywordWords.length * 0.5)
        ) {

            partialTitleMatches++;

        }

    }

});

const titleDemandScore = Math.min(
    100,
    Math.round(

        (
            exactTitleMatches * 5 +

            prefixTitleMatches * 4 +

            phraseTitleMatches * 3 +

            partialTitleMatches * 1
        )

        /

        Math.max(items.length * 5, 1)

        * 100

    )
);

// =========================
// 🚀 TUBEX VOLUME SCORE V6
// =========================
//
// Volume = DEMANDA ESTIMADA
//
// Sinais:
//
// 1. Presença da keyword nos títulos
// 2. Mediana da SERP
// 3. Força do líder
// 4. Velocidade
// 5. Vídeos fortes
//
// IMPORTANTE:
// Tamanho da keyword NÃO é
// usado como proxy de volume.
//

// =========================
// 1. FORÇA DO VÍDEO LÍDER
// =========================

const topScore = Math.min(
    100,
    Math.round(
        Math.log10(top + 1) * 16
    )
);


// =========================
// 2. FORÇA DA MEDIANA
// =========================

const medianScore = Math.min(
    100,
    Math.round(
        Math.log10(median + 1) * 16
    )
);


// =========================
// 3. VELOCIDADE
// =========================

const velocityScore = Math.min(
    100,
    Math.round(
        Math.log10(
            averageViewsPerDay + 1
        ) * 20
    )
);


// =========================
// 4. VÍDEOS FORTES
// =========================

const strengthScore = Math.min(
    100,
    Math.round(
        (
            strongVideos /
            Math.max(items.length, 1)
        ) * 100
    )
);


// =========================
// 6. DEMANDA DA SERP
// =========================
//
// A mediana é mais importante
// que apenas o vídeo líder.
//
// Um único vídeo gigante
// não deve transformar uma
// keyword pequena em "Muito Alta".
//

const serpDemandScore = Math.round(

      medianScore * 0.40

    + topScore * 0.20

    + velocityScore * 0.20

    + strengthScore * 0.10

    + titleDemandScore * 0.10

);


// =========================
// 7. VOLUME FINAL
// =========================

const finalVolume = Math.max(
    0,
    Math.min(
        100,
        Math.round(
            serpDemandScore
        )
    )
);

// =========================
// 🚀 TUBEX COMPETITION V7
// =========================
//
// UMA ÚNICA ENGINE DE CONCORRÊNCIA.
//
// A pontuação oficial é finalCompetition.
// competitionScore será apenas um alias desse mesmo valor.
//
// Sinais:
// 1. Match exato
// 2. Match no início do título
// 3. Cobertura da keyword
// 4. Força da SERP
// 5. Freshness ponderado por idade
// 6. Dominância/repetição de canais
// 7. Distribuição/consistência como sinal secundário
// 8. Market difficulty como sinal pequeno
//
// A janela de 31 dias NÃO limita a SERP.
// Ela já é usada para velocidade/demanda.
// Para competição, toda a SERP permanece válida,
// com peso maior para vídeos recentes.

let exactMatches = 0;
let startsWithMatches = 0;
let containsMatches = 0;
let partialMatches = 0;

let freshnessTotal = 0;
let recentVideos = 0;

// -------------------------
// MATCH + FRESHNESS
// -------------------------

items.forEach(video => {

    const title = String(
        video.snippet?.title || ""
    )
        .toLowerCase()
        .trim();

    const publishedAt = new Date(
        video.snippet?.publishedAt
    ).getTime();

    const ageDays = Number.isFinite(publishedAt)
        ? Math.max(
            0,
            (Date.now() - publishedAt) / 86400000
        )
        : 9999;

    // -------------------------
    // MATCH DO TÍTULO
    // -------------------------

    if (title === normalizedKeyword) {

        exactMatches++;

    } else if (title.startsWith(normalizedKeyword)) {

        startsWithMatches++;

    } else if (title.includes(normalizedKeyword)) {

        containsMatches++;

    } else {

        const matchedWords = keywordWords.filter(word =>
            title.includes(word)
        ).length;

        partialMatches +=
            matchedWords /
            Math.max(keywordWords.length, 1);

    }

    // -------------------------
    // FRESHNESS PONDERADO
    // -------------------------
    //
    // Não exclui vídeos antigos.
    // Apenas reduz sua influência.
    //
    // 0-31   = 100
    // 32-90  = 80
    // 91-180 = 60
    // 181-365= 40
    // >365   = 20

    let freshnessWeight = 20;

    if (ageDays <= 31) {

        freshnessWeight = 100;
        recentVideos++;

    } else if (ageDays <= 90) {

        freshnessWeight = 80;

    } else if (ageDays <= 180) {

        freshnessWeight = 60;

    } else if (ageDays <= 365) {

        freshnessWeight = 40;

    }

    freshnessTotal += freshnessWeight;

});

const itemCount = Math.max(items.length, 1);

// -------------------------
// MATCH SCORE
// -------------------------
//
// Cada nível é separado para que:
// - match exato pese mais
// - prefixo pese menos
// - contains seja intermediário
// - parcial tenha peso pequeno
//
// Isso evita transformar "contém a palavra" em
// equivalente a "o título foi feito para aquela busca".

const exactMatchScore = Math.round(
    (exactMatches / itemCount) * 100
);

const prefixMatchScore = Math.round(
    (startsWithMatches / itemCount) * 100
);

const containsMatchScore = Math.round(
    (containsMatches / itemCount) * 100
);

const partialMatchScore = Math.round(
    Math.min(
        100,
        (partialMatches / itemCount) * 100
    )
);

// Cobertura final dos títulos.
// É um sinal importante, mas não domina a competição.

const coverageDifficulty = Math.round(

    exactMatchScore * 0.45 +

    prefixMatchScore * 0.30 +

    containsMatchScore * 0.15 +

    partialMatchScore * 0.10

);

// -------------------------
// FRESHNESS SCORE
// -------------------------

const freshnessDifficulty = Math.round(
    freshnessTotal / itemCount
);

// -------------------------
// DOMINÂNCIA DE CANAIS
// -------------------------
//
// Sem fazer novas chamadas à API, usamos a própria SERP.
// Um canal que ocupa vários resultados indica uma SERP
// mais concentrada e difícil.
//
// Não confundimos isso com autoridade de inscritos,
// porque subscriberCount não está disponível nos objetos
// de pesquisa atuais.

const channelCount = {};

items.forEach(video => {

    const channelId =
        video.snippet?.channelId;

    if (!channelId) return;

    channelCount[channelId] =
        (channelCount[channelId] || 0) + 1;

});

const channelValues =
    Object.values(channelCount);

const biggestChannel = Math.max(
    ...channelValues,
    0
);

const channelDominance = Math.round(

    (
        biggestChannel /
        itemCount
    ) * 100

);

const repeatedChannelVideos =
    channelValues.reduce(
        (total, count) =>
            total + Math.max(count - 1, 0),
        0
    );

const repetitionScore = Math.round(

    (
        repeatedChannelVideos /
        itemCount
    ) * 100

);

// -------------------------
// SERP STRENGTH
// -------------------------
//
// Usa exclusivamente os quatro sinais pedidos:
// - mediana
// - top
// - velocidade
// - vídeos fortes
//
// serpPower é a única variável de força da SERP.

const serpPower = Math.round(

    Math.min(
        100,

        (
            Math.min(
                100,
                Math.round(Math.log10(median + 1) * 14)
            ) * 0.35

            +

            Math.min(
                100,
                Math.round(Math.log10(top + 1) * 14)
            ) * 0.25

            +

            viewsPerDayScore * 0.25

            +

            strongVideosScore * 0.15
        )
    )

);

// -------------------------
// DISTRIBUIÇÃO / CONSISTÊNCIA
// -------------------------
//
// Sinal secundário.
// Não pode dominar a competição.

const serpStructureScore = Math.round(

    distributionScore * 0.50 +

    consistencyScore * 0.50

);

// -------------------------
// MARKET DIFFICULTY
// -------------------------
//
// O marketDifficulty já foi calculado acima.
// Ele é deliberadamente pequeno na fórmula final,
// pois tamanho da keyword sozinho não prova competição.

const marketDifficultyScore = Math.max(

    0,

    Math.min(
        100,
        Number(marketDifficulty) || 0
    )

);

// -------------------------
// 🎯 COMPETITION FINAL V7
// -------------------------
//
// PRIMEIRO calculamos a DIFICULDADE REAL da SERP.
//
// Quanto maior:
// - SERP mais forte
// - mais matches
// - mais vídeos recentes
// - mais domínio de canais
// - mais repetição
//
// = MAIS DIFÍCIL.
//
// Depois fazemos UMA ÚNICA INVERSÃO
// para transformar dificuldade em
// SCORE DE OPORTUNIDADE.
//
// Resultado oficial:
// 100 = baixa competição / ótima oportunidade
// 50  = competição média
// 0   = competição muito alta
//

const finalCompetitionDifficulty = Math.max(
    0,

    Math.min(
        100,

        Math.round(

            serpPower * 0.35 +

            coverageDifficulty * 0.25 +

            freshnessDifficulty * 0.15 +

            channelDominance * 0.10 +

            repetitionScore * 0.05 +

            serpStructureScore * 0.05 +

            marketDifficultyScore * 0.05

        )

    )

);


// -------------------------
// 🔄 INVERSÃO OFICIAL
// -------------------------
//
// Dificuldade alta
//      ↓
// oportunidade baixa
//
// Dificuldade baixa
//      ↓
// oportunidade alta
//
// Exemplo:
//
// dificuldade 90 → competição 10
// dificuldade 70 → competição 30
// dificuldade 50 → competição 50
// dificuldade 30 → competição 70
// dificuldade 10 → competição 90
//

const finalCompetition = Math.max(
    0,

    Math.min(
        100,

        100 - finalCompetitionDifficulty

    )

);


// -------------------------
// 🎯 ALIAS OFICIAL
// -------------------------
//
// Existe UMA única pontuação oficial.
//
// competition
// competitionScore
//
// apontam exatamente para
// finalCompetition.
//
// O frontend continuará recebendo
// o score de oportunidade.
//

const competition = finalCompetition;

const competitionScore = finalCompetition;


// -------------------------
// 📊 DETALHES DA COMPETIÇÃO
// -------------------------
//
// Mantemos os sinais individuais
// disponíveis para o frontend/debug.
//

const competitionDetails = {

    // SCORE OFICIAL
    finalCompetition,

    // DIFICULDADE BRUTA ANTES DA INVERSÃO
    competitionDifficulty:
        finalCompetitionDifficulty,

    // FORÇA DA SERP
    serpPower,

    // COBERTURA DOS TÍTULOS
    coverageDifficulty,

    // FRESHNESS
    freshnessDifficulty,

    // DOMINÂNCIA
    channelDominance,

    // REPETIÇÃO
    repetitionScore,

    // ESTRUTURA DA SERP
    serpStructureScore,

    // MERCADO
    marketDifficulty:
        marketDifficultyScore,

    // MATCHES
    exactMatches,

    startsWithMatches,

    containsMatches,

    partialMatches,

    // SCORES DE MATCH
    exactMatchScore,

    prefixMatchScore,

    containsMatchScore,

    partialMatchScore,

    // VÍDEOS RECENTES
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
// 🚀 COMPETITION SCORE
// =========================
//
// Não existe cálculo paralelo.
// competitionScore já foi definido como alias
// oficial de finalCompetition na Competition V7.

// =========================
// 🔎 RELATED KEYWORDS ENGINE
// =========================
// Gera oportunidades a partir dos próprios resultados reais da SERP.
// Não usa palavras inventadas por IA nem faz chamadas adicionais para
// cada sugestão (preserva a cota da YouTube Data API).
function buildRelatedKeywords(items, seedKeyword, limit=30){

    const videos = Array.isArray(items) ? items : [];
    const seed = String(seedKeyword || "").toLowerCase().trim();
    const seedTerms = seed.split(/\s+/).filter(w => w.length >= 2);
    const stop = new Set([
        "como","para","com","sem","mais","muito","melhor","melhores","youtube",
        "vídeo","video","canal","sobre","aqui","esse","esta","este","uma","um",
        "que","por","dos","das","nos","nas","de","do","da","e","em","no","na",
        "the","and","for","with","from","how","what","this","that","your","you",
        "los","las","con","una","del","por","para"
    ]);

    const candidates = new Map();

    const addCandidate = (raw, video, sourceWeight=1) => {
        let phrase = String(raw || "")
            .toLowerCase()
            .replace(/[#|,;:!?()[\]{}<>"'“”‘’]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if(!phrase || phrase.length < 3 || phrase.length > 70) return;
        if(phrase === seed) return;

        const words = phrase.split(/\s+/).filter(Boolean);
        if(words.length < 1 || words.length > 5) return;

        // Não aceitar termos isolados ou frases dominadas por stopwords.
        if(words.length === 1 && (stop.has(words[0]) || words[0].length < 4)) return;
        if(stop.has(words[0]) || stop.has(words[words.length-1])) return;
        const meaningfulWords = words.filter(w => !stop.has(w) && w.length >= 3);
        if(!meaningfulWords.length || meaningfulWords.length < Math.ceil(words.length/2)) return;

        const norm = phrase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const seedNorm = seed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const seedHits = seedTerms.filter(term => phrase.includes(term)).length;
        const directSeed = seedNorm && norm.includes(seedNorm);

        // Uma relacionada precisa ter relação semântica/textual com a busca.
        // Para buscas multi-termo, pelo menos um termo deve aparecer.
        // Para buscas de um termo, a associação vem da coocorrência na SERP.
        if(seedTerms.length > 1 && seedHits === 0) return;
        if(seedTerms.length === 1 && seed && !phrase.includes(seedTerms[0])){
            // Permite variações próximas somente quando o vídeo realmente
            // contém a palavra pesquisada no título ou nas tags.
            const title = String(video?.snippet?.title || "").toLowerCase();
            const tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];
            const hasSeedContext = title.includes(seedTerms[0]) || tags.some(t => String(t).toLowerCase().includes(seedTerms[0]));
            if(!hasSeedContext) return;
        }

        const key = phrase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const views = Number(video?.statistics?.viewCount || 0);
        const entry = candidates.get(key) || {
            keyword: phrase,
            videos: new Map(),
            sourceWeight: 0,
            tagHits: 0,
            titleHits: 0,
            seedHits: 0
        };

        const id = String(video?.id || video?.snippet?.title || Math.random());
        if(!entry.videos.has(id)) entry.videos.set(id, video);
        entry.sourceWeight += sourceWeight;
        if(seedHits > 0 || directSeed) entry.seedHits++;
        candidates.set(key, entry);
    };

    videos.forEach(video => {
        const title = String(video?.snippet?.title || "").trim();
        const tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];

        // Tags são a principal fonte de keywords porque são metadados reais
        // devolvidos pela API para os vídeos analisados.
        tags.forEach(tag => addCandidate(tag, video, 3));

        // Frases de 2–4 palavras do título capturam long-tails reais.
        const words = title
            .toLowerCase()
            .replace(/[#|,;:!?()[\]{}<>"'“”‘’]+/g, " ")
            .split(/\s+/)
            .filter(Boolean);

        for(let n=2; n<=4; n++){
            for(let i=0; i+n<=words.length; i++){
                const phrase = words.slice(i,i+n).join(" ");
                if(words.slice(i,i+n).some(w => stop.has(w)) && n < 3) continue;
                addCandidate(phrase, video, n===2 ? 1 : 1.5);
            }
        }
    });

    const rows = [];
    for(const entry of candidates.values()){
        const support = [...entry.videos.values()];
        if(support.length < 2 && videos.length >= 10) continue;

        const views = support.map(v => Number(v?.statistics?.viewCount || 0)).filter(Number.isFinite);
        if(!views.length) continue;

        const sortedViews = [...views].sort((a,b)=>a-b);
        const medianViews = sortedViews.length % 2
            ? sortedViews[(sortedViews.length-1)/2]
            : Math.round((sortedViews[sortedViews.length/2-1] + sortedViews[sortedViews.length/2]) / 2);
        const avgViews = Math.round(views.reduce((a,b)=>a+b,0) / views.length);

        const titleMatches = support.filter(v => String(v?.snippet?.title || "").toLowerCase().includes(entry.keyword.toLowerCase())).length;
        const supportRate = support.length / Math.max(videos.length,1);
        const titleRate = titleMatches / Math.max(support.length,1);
        const highViewRate = support.filter(v => Number(v?.statistics?.viewCount || 0) >= Math.max(10000, avgViews)).length / Math.max(support.length,1);

        // Quanto mais vídeos disputam a mesma frase no título, maior a
        // dificuldade. O resultado é convertido para "oportunidade":
        // 100 = pouca concorrência / excelente espaço para competir.
        const difficulty = Math.min(100, Math.round(
            supportRate * 55 +
            titleRate * 30 +
            highViewRate * 15
        ));
        const competition = Math.max(0, Math.min(100, 100 - difficulty));

        const maxAvg = Math.max(1, ...videos.map(v => Number(v?.statistics?.viewCount || 0)));
        const viewScore = Math.max(0, Math.min(100,
            Math.round((Math.log10(avgViews + 1) / Math.log10(maxAvg + 1)) * 100)
        ));

        const relevance = Math.max(0, Math.min(100, Math.round(
            (entry.seedHits / Math.max(support.length,1)) * 65 +
            Math.min(35, entry.sourceWeight)
        )));

        const opportunity = Math.max(0, Math.min(100, Math.round(
            viewScore * 0.45 +
            competition * 0.35 +
            relevance * 0.20
        )));

        rows.push({
            keyword: entry.keyword,
            avgViews,
            medianViews,
            videosAnalyzed: support.length,
            competition,
            opportunity,
            relevance,
            viewScore
        });
    }

    return rows
        .filter(x => x.keyword)
        .sort((a,b)=>b.opportunity-a.opportunity || b.avgViews-a.avgViews || b.competition-a.competition)
        .slice(0, Math.max(3, Math.min(30, Number(limit)||30)));
}

// =========================
// 📦 RESPONSE
// =========================

const trend = [];
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

const googleSearch = await fetchGoogleVerification(keyword);

const requestedRelatedLimit =
    String(body?.plan || "free").toLowerCase() === "free" ? 3 :
    String(body?.plan || "free").toLowerCase() === "pro" ? 10 :
    String(body?.plan || "free").toLowerCase() === "expert" || String(body?.plan || "free").toLowerCase() === "owner" ? 30 : 3;

const relatedKeywords = buildRelatedKeywords(items, keyword, requestedRelatedLimit);

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

    googleSearch,

    tags: rankedTags,
    relatedKeywords,

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
exactTitleMatches,
prefixTitleMatches,
phraseTitleMatches,
partialTitleMatches,
titleDemandScore,
topScore,
medianScore,
velocityScore,
strengthScore,
serpDemandScore,

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
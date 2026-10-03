export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, x-api-key, authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(200).json({ success:false, error:"unauthorized", items:[], data:{channel:null,videos:[]} });
  }

  if (req.method !== "POST") {
    return res.status(200).json({ success:false, error:"invalid_method", items:[], data:{channel:null,videos:[]} });
  }

  try {

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const channelId = body?.channelId;


  // =========================================================
  // 🔒 ISOLATED DASHBOARD METRIC — ENGAGED VIEWS
  // Normal /youtube-channel behavior remains untouched.
  // =========================================================
  if (body?.mode === "engaged_views") {
    const token = String(body?.accessToken || "").trim();
    const requestedDays = Number(body?.days);
    const days = [7, 28, 30].includes(requestedDays) ? requestedDays : 28;

    if (!token) {
      return res.status(200).json({
        success: false,
        error: "analytics_auth_required",
        engagedViews: null,
        days
      });
    }

    const dateAtStartOfDay = offsetDays => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - Number(offsetDays || 0));
      return d.toISOString().slice(0, 10);
    };

    const queryAnalytics = async (startDate, endDate, dimensions = "") => {
      const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
      url.searchParams.set("ids", "channel==MINE");
      url.searchParams.set("startDate", startDate);
      url.searchParams.set("endDate", endDate);
      url.searchParams.set("metrics", "views,engagedViews");
      if (dimensions) url.searchParams.set("dimensions", dimensions);
      if (dimensions === "day") url.searchParams.set("sort", "day");

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(
          payload?.error?.errors?.[0]?.reason ||
          payload?.error?.message ||
          `analytics_http_${response.status}`
        );
        error.status = response.status;
        throw error;
      }

      return payload;
    };

    const startDate = dateAtStartOfDay(days);
    const endDates = [dateAtStartOfDay(1), dateAtStartOfDay(2)];
    let lastError = null;

    for (const endDate of endDates) {
      try {
        const data = await queryAnalytics(startDate, endDate, "day");
        const headers = Array.isArray(data?.columnHeaders)
          ? data.columnHeaders.map(x => String(x?.name || ""))
          : [];
        const rows = Array.isArray(data?.rows) ? data.rows : [];

        if (rows.length) {
          const engagedIndex = headers.indexOf("engagedViews");
          const viewsIndex = headers.indexOf("views");

          return res.status(200).json({
            success: true,
            engagedViews: rows.reduce(
              (sum, row) => sum + Number(engagedIndex >= 0 ? row[engagedIndex] : 0),
              0
            ),
            views: rows.reduce(
              (sum, row) => sum + Number(viewsIndex >= 0 ? row[viewsIndex] : 0),
              0
            ),
            days,
            startDate,
            endDate,
            source: "youtube-analytics-api"
          });
        }

        const exact = await queryAnalytics(startDate, endDate);
        const exactHeaders = Array.isArray(exact?.columnHeaders)
          ? exact.columnHeaders.map(x => String(x?.name || ""))
          : [];
        const first = Array.isArray(exact?.rows) ? exact.rows[0] : null;

        if (first) {
          const engagedIndex = exactHeaders.indexOf("engagedViews");
          const viewsIndex = exactHeaders.indexOf("views");

          return res.status(200).json({
            success: true,
            engagedViews: Number(engagedIndex >= 0 ? first[engagedIndex] : 0),
            views: Number(viewsIndex >= 0 ? first[viewsIndex] : 0),
            days,
            startDate,
            endDate,
            source: "youtube-analytics-api"
          });
        }
      } catch (error) {
        lastError = error;
        if (error?.status === 401 || error?.status === 403) break;
      }
    }

    return res.status(200).json({
      success: false,
      error: lastError?.message || "engaged_views_unavailable",
      engagedViews: null,
      days
    });
  }

// =====================================
// 🔥 CACHE GLOBAL CHANNEL
// =====================================


    if (!channelId) {
      return res.status(200).json({ success:false, error:"channelId_required", items:[], data:{channel:null,videos:[]} });
    }

global.tubexChannelCache = global.tubexChannelCache || {};
global.tubexChannelInFlight = global.tubexChannelInFlight || {};

const CHANNEL_CACHE_TTL = 15 * 60 * 1000;
const CHANNEL_STALE_TTL = 6 * 60 * 60 * 1000;

const cacheKey = `channel_${channelId}`;

const cached = global.tubexChannelCache[cacheKey];

if(cached){
  if(cached.expires > Date.now()){
    console.log("⚡ CACHE HIT CHANNEL:", channelId);
    return res.status(200).json(cached.data);
  }
  console.log("♻️ STALE CHANNEL CACHE AVAILABLE:", channelId);
}

    // Production uses a single YouTube API key / Google Cloud project.
    const key = String(process.env.YOUTUBE_API_KEY || "").split(",")[0].trim();
    if (!key) throw new Error("youtube_api_key_missing");

    let channel = null;
    let videos = [];

    // ======================================================
    // 🔥 FETCH VIDEOS COM PROTEÇÃO REAL
    // ======================================================
    const fetchVideosFromIds = async (ids, key) => {

      if (!ids) return [];

      try{

        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`
        );

        if (!res.ok) {
          console.warn("⚠️ erro videos API:", res.status);
          if (res.status === 403 || res.status === 429) throw new Error("quota_exceeded");
          return [];
        }

        const json = await res.json();

        if (!Array.isArray(json.items)) return [];

        return json.items.map(v => ({
          ...v,
          title: v.snippet?.title || "",
          views: Number(v.statistics?.viewCount || 0),
          publishedAt: v.snippet?.publishedAt || ""
        }));

      }catch(e){
        console.warn("⚠️ erro fetch videos:", e?.message || e);

        if (
          e?.message === "quota_exceeded" ||
          e?.message === "daily_limit_exceeded"
        ) {
          throw e;
        }

        return [];
      }
    };

    // ======================================================
    // 🔹 SINGLE API KEY / SINGLE PROJECT
    // ======================================================
    const fetchChannelData = async () => {

      const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
      );

      const chJson =
        await chRes.json().catch(() => ({}));

      if (!chRes.ok) {

        if (
          chRes.status === 403 ||
          chRes.status === 429
        ) {
          throw new Error("quota_exceeded");
        }

        throw new Error(
          `channel_api_${chRes.status}`
        );

      }

      if (!chJson.items?.length) {
        throw new Error("channel_not_found");
      }

      const channelData =
        chJson.items[0];

      const uploads =
        channelData.contentDetails
          ?.relatedPlaylists
          ?.uploads;

      let videosData = [];

      if (uploads) {

        const vidsRes =
          await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
          );

        const vidsJson =
          await vidsRes.json().catch(() => ({}));

        if (!vidsRes.ok) {

          if (
            vidsRes.status === 403 ||
            vidsRes.status === 429
          ) {
            throw new Error("quota_exceeded");
          }

          throw new Error(
            `playlist_api_${vidsRes.status}`
          );

        }

        const idsArr =
          (vidsJson.items || [])
            .map(
              v => v.contentDetails?.videoId
            )
            .filter(Boolean);

        if (idsArr.length) {

          videosData =
            await fetchVideosFromIds(
              idsArr.join(","),
              key
            );

        }

      }

      return {
        channel: channelData,
        videos: videosData
      };

    };

    try {

          let channelResult;

          const existingInFlight =
            global.tubexChannelInFlight[
              cacheKey
            ];

          if (existingInFlight) {

            console.log(
              "⚡ CHANNEL IN-FLIGHT HIT:",
              channelId
            );

            channelResult =
              await existingInFlight;

          } else {

            const promise =
              fetchChannelData();

            global.tubexChannelInFlight[
              cacheKey
            ] = promise;

            try {

              channelResult =
                await promise;

            } finally {

              delete global.tubexChannelInFlight[
                cacheKey
              ];

            }

          }

          channel =
            channelResult.channel;

          videos =
            channelResult.videos;

    } catch (e) {

      console.warn(
        "⚠️ YouTube channel fetch failed:",
        e?.message || e
      );

      const stale =
        global.tubexChannelCache[cacheKey];

      if (
        stale?.data &&
        (
          stale.staleUntil > Date.now() ||
          stale.expires > Date.now()
        )
      ) {

        console.warn(
          "♻️ Serving stale channel cache after API failure:",
          channelId
        );

        return res
          .status(200)
          .json(stale.data);

      }

      throw e;

    }

    // ======================================================
    // ❌ SEM DADOS
    // ======================================================
if (!Array.isArray(videos) || videos.length === 0) {

  console.warn("⚠️ canal sem vídeos — retornando vazio controlado");

  const finalData = {
    success: true, // 🔥 MUITO IMPORTANTE
    items: [],
    data: {
      channel,
      videos: [],
     metrics: {
  totalViews: 0,
  avgViews: 0,
  views7: 0,
  uploads7: 0,

  subscribers:
    Number(
      channel?.statistics?.subscriberCount || 0
    ),

  totalVideos:
    Number(
      channel?.statistics?.videoCount || 0
    ),

  totalChannelViews:
    Number(
      channel?.statistics?.viewCount || 0
    ),

  views30:0,
  uploads30:0
}
    }
  };

  return res.status(200).json(finalData);
}


    // ======================================================
    // 🧠 MÉTRICAS
    // ======================================================
    const totalViews = videos.reduce((acc,v)=>acc+v.views,0);
    const avgViews = Math.round(totalViews / videos.length);

    const now = Date.now();

    const last7 = videos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7*24*60*60*1000);
    });

    const views7 = last7.reduce((acc,v)=>acc+v.views,0);
    const uploads7 = last7.length;

const subscribers =
Number(
  channel?.statistics?.subscriberCount || 0
);

const totalVideos =
Number(
  channel?.statistics?.videoCount || 0
);

const totalChannelViews =
Number(
  channel?.statistics?.viewCount || 0
);

const views30 = videos
.filter(v => {

  const days =
    (Date.now() -
    new Date(v.publishedAt).getTime())
    / 86400000;

  return days <= 30;

})
.reduce(
  (acc,v)=>acc+v.views,
  0
);

const uploads30 = videos
.filter(v => {

  const days =
    (Date.now() -
    new Date(v.publishedAt).getTime())
    / 86400000;

  return days <= 30;

})
.length;

const finalData = {
  success:true,
  items:videos,
  data:{
    channel,
    videos,
    metrics:{
      totalViews,
      avgViews,
      views7,
      uploads7,

      subscribers,
      totalVideos,
      totalChannelViews,

      views30,
      uploads30
    }
  }
};


// 💾 SALVA CACHE
global.tubexChannelCache[cacheKey] = {
  data: finalData,
  expires: Date.now() + CHANNEL_CACHE_TTL,
  staleUntil: Date.now() + CHANNEL_STALE_TTL

};

return res.status(200).json(finalData);

  } catch (e) {

    console.error("💥 BACKEND ERROR:", e);

    return res.status(200).json({
      success:false,
      error:"internal_error",
      items:[],
      data:{channel:null,videos:[]}
    });
  }
}
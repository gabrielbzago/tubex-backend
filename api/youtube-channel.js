// ======================================================
// 🚀 TubeX YouTube Channel API (PRODUCTION)
// ======================================================

const CACHE_TTL = 1000 * 60 * 5; // 5 min
const REQUEST_TIMEOUT = 8000;

// 🔒 CORS WHITELIST
const ALLOWED_ORIGINS = [
  "https://www.youtube.com",
  "https://studio.youtube.com"
];

// 🧠 CACHE GLOBAL (fallback serverless)
global.tubexCache = global.tubexCache || {};

function getCache(key) {
  const item = global.tubexCache[key];
  if (!item) return null;
  if (item.exp < Date.now()) {
    delete global.tubexCache[key];
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  global.tubexCache[key] = {
    data,
    exp: Date.now() + CACHE_TTL
  };
}

// ======================================================
// ⏱ FETCH COM TIMEOUT
// ======================================================
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ======================================================
// 🎥 FETCH VIDEOS
// ======================================================
async function fetchVideos(ids, key) {
  if (!ids.length) return [];

  try {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`
    );

    if (!res.ok) return [];

    const json = await res.json();

    return (json.items || []).map(v => ({
      title: v.snippet?.title || "",
      views: Number(v.statistics?.viewCount || 0),
      publishedAt: v.snippet?.publishedAt || ""
    }));

  } catch {
    return [];
  }
}

// ======================================================
// 🚀 HANDLER
// ======================================================
export default async function handler(req, res) {

  // ======================================================
  // 🔒 CORS
  // ======================================================
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ======================================================
  // 🔑 AUTH
  // ======================================================
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(200).json({ success: false, error: "unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(200).json({ success: false, error: "invalid_method" });
  }

  try {

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const channelId = body?.channelId;

    if (!channelId) {
      return res.status(200).json({ success: false, error: "missing_channelId" });
    }

    // ======================================================
    // ⚡ CACHE
    // ======================================================
    const cacheKey = `channel_${channelId}`;
    const cached = getCache(cacheKey);

    if (cached) {
      console.log("⚡ CACHE HIT");
      return res.status(200).json(cached);
    }

    // ======================================================
    // 🔑 MULTI KEY
    // ======================================================
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean)
      .sort(() => 0.5 - Math.random());

    let channel = null;
    let videos = [];

    // ======================================================
    // 🔁 LOOP KEYS
    // ======================================================
    for (const key of keys) {

      try {

        // 📊 CHANNEL
        const chRes = await fetchWithTimeout(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

        if (!chRes.ok) continue;

        const chJson = await chRes.json();
        if (!chJson.items?.length) continue;

        channel = chJson.items[0];

        const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) continue;

        // 📺 PLAYLIST
        const listRes = await fetchWithTimeout(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
        );

        if (!listRes.ok) continue;

        const listJson = await listRes.json();

        const ids = (listJson.items || [])
          .map(v => v.contentDetails?.videoId)
          .filter(Boolean);

        if (!ids.length) continue;

        const fetched = await fetchVideos(ids, key);

        if (fetched.length >= 3) {
          videos = fetched;
          break;
        }

      } catch (e) {
        console.warn("⚠️ key falhou");
      }
    }

    // ======================================================
    // ❌ FALLBACK (NUNCA QUEBRA FRONT)
    // ======================================================
    if (!channel) {
      return res.status(200).json({
        success: true,
        warning: "no_channel_data",
        data: {
          channel: null,
          videos: [],
          metrics: {
            subscribers: 0,
            totalViews: 0,
            avgViews: 0,
            views7: 0,
            uploads7: 0
          }
        }
      });
    }

    // ======================================================
    // 📊 MÉTRICAS REAIS
    // ======================================================
    const subscribers = Number(channel.statistics?.subscriberCount || 0);
    const totalViews = Number(channel.statistics?.viewCount || 0);

    const totalVideoViews = videos.reduce((a, v) => a + v.views, 0);
    const avgViews = videos.length ? Math.round(totalVideoViews / videos.length) : 0;

    const now = Date.now();

    const last7 = videos.filter(v => {
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7 * 24 * 60 * 60 * 1000);
    });

    const views7 = last7.reduce((a, v) => a + v.views, 0);
    const uploads7 = last7.length;

    // ======================================================
    // ✅ RESULT FINAL
    // ======================================================
    const result = {
      success: true,
      data: {
        channel,
        videos,
        metrics: {
          subscribers,
          totalViews,
          avgViews,
          views7,
          uploads7
        }
      }
    };

    // 💾 CACHE
    setCache(cacheKey, result);

    return res.status(200).json(result);

  } catch (e) {

    console.error("💥 BACKEND CRASH:", e);

    return res.status(200).json({
      success: true,
      warning: "internal_error",
      data: {
        channel: null,
        videos: [],
        metrics: {
          subscribers: 0,
          totalViews: 0,
          avgViews: 0,
          views7: 0,
          uploads7: 0
        }
      }
    });
  }
}
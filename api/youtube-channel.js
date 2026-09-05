import { getPublicChannel } from "./public-youtube.js";

export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, x-api-key, authorization");

console.log(
  "HEADER:",
  req.headers["x-api-key"]
);

console.log(
  "ENV:",
  process.env.API_KEY
);

  if (req.method === "OPTIONS") return res.status(200).end();

console.log(
  "HEADER KEY:",
  req.headers["x-api-key"]
);

console.log(
  "ENV KEY:",
  process.env.API_KEY
);

  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(200).json({ success:false, error:"unauthorized", items:[], data:{channel:null,videos:[]} });
  }

  if (req.method !== "POST") {
    return res.status(200).json({ success:false, error:"invalid_method", items:[], data:{channel:null,videos:[]} });
  }

  try {

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const channelId = body?.channelId;

// =====================================
// 🔥 CACHE GLOBAL CHANNEL
// =====================================


    if (!channelId) {
      return res.status(200).json({ success:false, error:"channelId_required", items:[], data:{channel:null,videos:[]} });
    }

global.tubexChannelCache = global.tubexChannelCache || {};

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
    // API key is optional: public channel data is attempted first.

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
        console.warn("⚠️ erro fetch videos:", e);
        return [];
      }
    };

    // ======================================================
    // 🌐 PUBLIC CHANNEL FIRST
    // ======================================================
    try {
      const pub = await getPublicChannel(channelId);
      if (pub?.channel) {
        channel = pub.channel;
        videos = pub.videos || [];
        console.log("[TubeX] Public channel hit:", channelId, videos.length);
      }
    } catch (e) {
      console.warn("[TubeX] Public channel unavailable:", e?.message || e);
    }

    // ======================================================
    // 🔑 LEGACY DATA API FALLBACK
    // ======================================================
    if (!channel && key) try {
      const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
      );
      const chJson = await chRes.json();
      if (!chRes.ok) {
        if (chRes.status === 403 || chRes.status === 429) throw new Error("quota_exceeded");
        throw new Error(`channel_api_${chRes.status}`);
      }
      if (!chJson.items?.length) throw new Error("channel_not_found");
      channel = chJson.items[0];
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) {
        videos = [];
      } else {
        const vidsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
        );
        const vidsJson = await vidsRes.json();
        if (!vidsRes.ok) {
          if (vidsRes.status === 403 || vidsRes.status === 429) throw new Error("quota_exceeded");
          throw new Error(`playlist_api_${vidsRes.status}`);
        }
        const idsArr = (vidsJson.items || []).map(v => v.contentDetails?.videoId).filter(Boolean);
        videos = idsArr.length ? await fetchVideosFromIds(idsArr.join(","), key) : [];
      }
    } catch (e) {
      console.warn("⚠️ YouTube channel fetch failed:", e?.message || e);
      const stale = global.tubexChannelCache[cacheKey];
      if (stale?.data) {
        console.warn("♻️ Serving stale channel cache after API failure:", channelId);
        return res.status(200).json(stale.data);
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
  expires: Date.now() + (15 * 60 * 1000), // fresh for 15 min
  staleUntil: Date.now() + (6 * 60 * 60 * 1000) // stale fallback

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
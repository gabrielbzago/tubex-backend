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
    return res.status(200).json({
      success:false,
      error:"unauthorized",
      channel:null,
      metrics:null,
      items:[],
      data:{channel:null,videos:[],metrics:null}
    });
  }

  if (req.method !== "POST") {
    return res.status(200).json({
      success:false,
      error:"invalid_method",
      channel:null,
      metrics:null,
      items:[],
      data:{channel:null,videos:[],metrics:null}
    });
  }

  try {

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    let channelId = String(
      body?.channelId ||
      body?.currentChannelId ||
      body?.youtubeChannelId ||
      ""
    ).trim();

    // Accept a channel URL as well as a raw channel ID.
    const channelUrl = String(
      body?.channelUrl ||
      body?.youtubeChannelUrl ||
      ""
    ).trim();

    const urlId = channelUrl.match(/(?:youtube\.com\/channel\/)(UC[a-zA-Z0-9_-]{10,})/i);
    if(!channelId && urlId?.[1]) channelId = urlId[1];

    // Accept @handle when the caller has not resolved the channel ID yet.
    const handle = String(
      body?.handle ||
      body?.youtubeHandle ||
      ""
    ).trim().replace(/^@/,"");

    // Resolve a handle with the same YouTube API key below.
    // The normal ID path remains the preferred/cheapest path.

// =====================================
// 🔥 CACHE GLOBAL CHANNEL
// =====================================


global.tubexChannelCache = global.tubexChannelCache || {};

const cacheKey = `channel_${channelId}`;

const cached = global.tubexChannelCache[cacheKey];

if(cached){
  if(cached.expires > Date.now()){
    console.log("⚡ CACHE HIT CHANNEL:", channelId);
    return res.status(200).json(cached.data);
  }
  delete global.tubexChannelCache[cacheKey];
}

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    if (!keys.length) {
      console.error("❌ YOUTUBE_API_KEY não configurada");
      return res.status(200).json({
        success:false,
        error:"youtube_api_key_missing",
        channel:null,
        metrics:null,
        items:[],
        data:{channel:null,videos:[],metrics:null}
      });
    }

    // Resolve @handle only when an ID was not supplied.
    if(!channelId && handle){
      for(const key of keys){
        try{
          const handleRes=await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`
          );
          if(handleRes.ok){
            const handleJson=await handleRes.json();
            const resolved=handleJson?.items?.[0]?.id;
            if(resolved){
              channelId=String(resolved).trim();
              break;
            }
          }
        }catch(e){
          console.warn("⚠️ erro ao resolver handle:",e);
        }
      }
    }

    if(!channelId){
      return res.status(200).json({
        success:false,
        error:"channelId_required",
        channel:null,
        metrics:null,
        items:[],
        data:{channel:null,videos:[],metrics:null}
      });
    }

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
    // 🔁 LOOP COM RETRY REAL + MULTI KEY
    // ======================================================
    const shuffledKeys = [...keys].sort(() => 0.5 - Math.random());

for (const key of shuffledKeys) {

      try {

        // 🔹 1. CHANNEL
        const chRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

if (chRes.status === 403 || chRes.status === 429) {
  console.warn("🚫 quota estourada");
  continue;
}

        const chJson = await chRes.json();

if (!chJson.items?.length) {
  console.warn("⚠️ canal não encontrado nessa key");
  continue;
}

channel = chJson.items[0] || null;

        if (!chJson.items?.length) continue;

        channel = chJson.items[0];

        const uploads = channel.contentDetails?.relatedPlaylists?.uploads;

        if (!uploads) continue;

        // 🔹 2. PLAYLIST
        const vidsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}`
        );

        if (!vidsRes.ok) {
          console.warn("⚠️ erro playlistItems:", vidsRes.status);
          continue;
        }

        const vidsJson = await vidsRes.json();

        const idsArr = (vidsJson.items || [])
          .map(v => v.contentDetails?.videoId)
          .filter(Boolean);

if (!idsArr.length){
  console.warn("⚠️ canal sem vídeos ainda");
  
  videos = []; // 🔥 força fluxo válido
  break;       // 🔥 sai do loop corretamente
}
        const ids = idsArr.join(",");

        const fetched = await fetchVideosFromIds(ids, key);

     if (!Array.isArray(fetched)) continue;

// 🔥 aceita QUALQUER quantidade de vídeos
if (fetched.length > 0) {
  videos = fetched;
  break;
}

// se veio vazio, tenta próxima key
continue;

      } catch (e) {
        console.warn("⚠️ erro geral key:", e);
      }
    }

    // ======================================================
    // ❌ SEM DADOS
    // ======================================================
if (!Array.isArray(videos) || videos.length === 0) {

  console.warn("⚠️ vídeos do canal indisponíveis; mantendo os metadados reais do canal");

  const subscribers = Number(channel?.statistics?.subscriberCount || 0);
  const totalVideos = Number(channel?.statistics?.videoCount || 0);
  const totalChannelViews = Number(channel?.statistics?.viewCount || 0);

  const metrics = {
    totalViews: 0,
    avgViews: 0,
    views7: 0,
    uploads7: 0,
    subscribers,
    totalVideos,
    totalChannelViews,
    views30: null,
    uploads30: 0,
    channelDataOnly: true
  };

  const finalData = {
    success: Boolean(channel),
    channelId,
    channel,
    metrics,
    items: [],
    data: {
      channelId,
      channel,
      videos: [],
      metrics
    }
  };

  // Cache even a metadata-only response, so a temporary playlist quota
  // failure does not cause repeated requests on every render.
  global.tubexChannelCache[cacheKey] = {
    data: finalData,
    expires: Date.now() + (2 * 60 * 1000)
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

const metrics = {
  totalViews,
  avgViews,
  views7,
  uploads7,
  subscribers,
  totalVideos,
  totalChannelViews,
  views30,
  uploads30
};

// Expose the same normalized contract at both the top level and
// inside `data`, so the extension UI can consume either shape.
const finalData = {
  success: true,
  channelId,
  channel,
  metrics,
  items: videos,
  data: {
    channelId,
    channel,
    videos,
    metrics
  }
};


// 💾 SALVA CACHE
global.tubexChannelCache[cacheKey] = {
  data: finalData,
  expires: Date.now() + (5 * 60 * 1000) // 5 min
};

return res.status(200).json(finalData);

  } catch (e) {

    console.error("💥 BACKEND ERROR:", e);

    return res.status(200).json({
      success:false,
      error:"internal_error",
      channel:null,
      metrics:null,
      items:[],
      data:{channel:null,videos:[],metrics:null}
    });
  }
}
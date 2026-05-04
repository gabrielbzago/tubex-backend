// ======================================================
// 🚀 TubeX YouTube Channel API (VIDIQ LEVEL PRODUCTION)
// ======================================================

const CACHE_TTL = 1000 * 60 * 5;
const REQUEST_TIMEOUT = 8000;

const ALLOWED_ORIGINS = [
  "https://www.youtube.com",
  "https://studio.youtube.com"
];

global.tubexCache = global.tubexCache || {};

function getCache(key){
  const item = global.tubexCache[key];
  if(!item) return null;
  if(item.exp < Date.now()){
    delete global.tubexCache[key];
    return null;
  }
  return item.data;
}

function setCache(key,data){
  global.tubexCache[key] = {
    data,
    exp: Date.now() + CACHE_TTL
  };
}

// ======================================================
// ⏱ FETCH COM TIMEOUT
// ======================================================
async function fetchWithTimeout(url){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), REQUEST_TIMEOUT);

  try{
    const res = await fetch(url,{ signal:controller.signal });
    clearTimeout(timeout);
    return res;
  }catch(e){
    clearTimeout(timeout);
    throw e;
  }
}

// ======================================================
// 🎥 FETCH VIDEOS (ROBUSTO)
// ======================================================
async function fetchVideos(ids,key){

  if(!ids.length) return [];

  try{

    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`
    );

    if(!res.ok) return [];

    const json = await res.json();

    return (json.items || []).map(v => ({
      id: v.id,
      title: v.snippet?.title || "",
      publishedAt: v.snippet?.publishedAt || "",
      thumbnail:
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.default?.url ||
        "",
      statistics: {
        viewCount: Number(v.statistics?.viewCount || 0),
        likeCount: Number(v.statistics?.likeCount || 0)
      },
      snippet: v.snippet || {}
    }));

  }catch(e){
    return [];
  }
}

// ======================================================
// 🚀 HANDLER
// ======================================================
export default async function handler(req,res){

  const origin = req.headers.origin;

  if(ALLOWED_ORIGINS.includes(origin)){
    res.setHeader("Access-Control-Allow-Origin",origin);
  }

  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, x-api-key");

  if(req.method === "OPTIONS") return res.status(200).end();

  if(req.headers["x-api-key"] !== process.env.API_KEY){
    return res.status(200).json({ success:false });
  }

  try{

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const channelId = body?.channelId;

    if(!channelId){
      return res.status(200).json({ success:false });
    }

    const cacheKey = `channel_${channelId}`;
    const cached = getCache(cacheKey);

    if(cached){
      console.log("⚡ CACHE HIT");
      return res.status(200).json(cached);
    }

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k=>k.trim())
      .filter(Boolean);

    let channel = null;
    let videos = [];

    // ======================================================
    // 🔁 LOOP KEYS (ANTI QUOTA FAIL)
    // ======================================================
    for(const key of keys){

      try{

        // 🔥 CHANNEL
        const chRes = await fetchWithTimeout(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

        if(!chRes.ok) continue;

        const chJson = await chRes.json();
        if(!chJson.items?.length) continue;

        channel = chJson.items[0];

        const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
        if(!uploads) break;

        // 🔥 PEGAR ATÉ 100 VIDEOS (2 páginas)
        let allIds = [];
        let nextPage = null;

        for(let i=0;i<2;i++){

          const listRes = await fetchWithTimeout(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&pageToken=${nextPage || ""}&key=${key}`
          );

          if(!listRes.ok) break;

          const listJson = await listRes.json();

          const ids = (listJson.items || [])
            .map(v => v.contentDetails?.videoId)
            .filter(Boolean);

          allIds.push(...ids);

          nextPage = listJson.nextPageToken;
          if(!nextPage) break;
        }

        videos = await fetchVideos(allIds.slice(0,50),key);

        break;

      }catch(e){
        console.warn("⚠️ key falhou");
      }
    }

    // ======================================================
    // 🚨 GARANTE NUNCA QUEBRA
    // ======================================================
    if(!channel){
      return res.status(200).json({
        success:true,
        channel:null,
        videos:[],
        metrics:{}
      });
    }

    // ======================================================
    // 📊 MÉTRICAS
    // ======================================================
    const subscribers = Number(channel.statistics?.subscriberCount || 0);
    const totalViews = Number(channel.statistics?.viewCount || 0);

    const avgViews = videos.length
      ? Math.round(videos.reduce((a,v)=>a+v.statistics.viewCount,0)/videos.length)
      : 0;

    const now = Date.now();

    const last7 = videos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7 * 86400000);
    });

    const views7 = last7.reduce((a,v)=>a+v.statistics.viewCount,0);

    const result = {
      success:true,
      channel,
      videos, // 🔥 DIRETO (SEM data.videos)
      metrics:{
        subscribers,
        totalViews,
        avgViews,
        views7,
        uploads7:last7.length
      }
    };

    setCache(cacheKey,result);

    return res.status(200).json(result);

  }catch(e){

    console.error("💥 BACKEND CRASH:",e);

    return res.status(200).json({
      success:true,
      channel:null,
      videos:[],
      metrics:{}
    });
  }
}
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
  delete global.tubexChannelCache[cacheKey];
}

    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

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
// 🔁 LOOP COM RETRY REAL + MULTI KEY (VIDIQ LEVEL)
// ======================================================
const shuffledKeys = [...keys].sort(() => 0.5 - Math.random());

for (const key of shuffledKeys) {

  try {

    // ======================================================
    // 🔹 1. CHANNEL
    // ======================================================
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
    );

    if (chRes.status === 403 || chRes.status === 429) {
      console.warn("🚫 quota estourada");
      continue;
    }

    if (!chRes.ok) continue;

    const chJson = await chRes.json();

    if (!chJson.items?.length) continue;

    channel = chJson.items[0];

    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) continue;

    // ======================================================
    // 🔹 2. PLAYLIST (PAGINAÇÃO REAL)
    // ======================================================
    let allIds = [];
    let nextPage = null;

    for (let i = 0; i < 3; i++) { // 🔥 até 150 vídeos

      const vidsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&pageToken=${nextPage || ""}&key=${key}`
      );

      if (!vidsRes.ok) {
        console.warn("⚠️ erro playlistItems:", vidsRes.status);
        break;
      }

      const vidsJson = await vidsRes.json();

      const idsArr = (vidsJson.items || [])
        .map(v => v.contentDetails?.videoId)
        .filter(Boolean);

      if (!idsArr.length) break;

      allIds.push(...idsArr);

      nextPage = vidsJson.nextPageToken;
      if (!nextPage) break;
    }

    if (!allIds.length) {
      console.warn("⚠️ nenhum ID encontrado");
      continue;
    }

    // ======================================================
    // 🔹 3. FETCH VIDEOS
    // ======================================================
const ids = allIds.slice(0, Math.min(allIds.length, 150)).join(",");

    const fetched = await fetchVideosFromIds(ids, key);

    if (!Array.isArray(fetched)) continue;

    // ======================================================
    // 🔥 LÓGICA VIDIQ (ACEITA PARCIAL E MELHORA)
    // ======================================================
    if (fetched.length > 0) {

      // guarda melhor resultado
      if (fetched.length > videos.length) {
        videos = fetched;
      }

      // se já temos dados bons → pode parar
     if (videos.length >= Math.min(allIds.length, 40)) {
  break;
}
    }
if(videos.length < 20){
  console.warn("⚠️ dados parciais, tentando próxima key...");
}
  } catch (e) {
    console.warn("⚠️ erro geral key:", e);
    continue;
  }
}


    // ======================================================
    // ❌ SEM DADOS
    // ======================================================

if (!Array.isArray(videos)) {
  videos = [];
}

if(videos.length === 0){
  console.warn("⚠️ nenhum vídeo encontrado, retornando vazio");
}


    // ======================================================
    // 🧠 MÉTRICAS
    // ======================================================
    const totalViews = videos.reduce((acc,v)=>acc+v.views,0);
const avgViews = videos.length
  ? Math.round(totalViews / videos.length)
  : 0;

    const now = Date.now();

    const last7 = videos.filter(v=>{
      const t = new Date(v.publishedAt).getTime();
      return (now - t) <= (7*24*60*60*1000);
    });

    const views7 = last7.reduce((acc,v)=>acc+v.views,0);
    const uploads7 = last7.length;

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
      uploads7
    }
  }
};

// 💾 SALVA CACHE
global.tubexChannelCache[cacheKey] = {
  data: finalData,
  expires: Date.now() + (5 * 60 * 1000)
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
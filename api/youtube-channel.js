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

    if (!channelId) {
      return res.status(200).json({ success:false, error:"channelId_required", items:[], data:{channel:null,videos:[]} });
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
    // 🔁 LOOP COM RETRY REAL + MULTI KEY
    // ======================================================
    for (const key of keys) {

      try {

        // 🔹 1. CHANNEL
        const chRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`
        );

        if (!chRes.ok) continue;

        const chJson = await chRes.json();

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

        if (!idsArr.length) continue;

        const ids = idsArr.join(",");

        const fetched = await fetchVideosFromIds(ids, key);

        if (!Array.isArray(fetched) || fetched.length < 3) continue;

        videos = fetched;
        break;

      } catch (e) {
        console.warn("⚠️ erro geral key:", e);
      }
    }

    // ======================================================
    // ❌ SEM DADOS
    // ======================================================
    if (!Array.isArray(videos) || videos.length < 3) {
      return res.status(200).json({
        success:false,
        error:"no_channel_videos",
        items:[],
        data:{channel,videos:[]}
      });
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

    return res.status(200).json({
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
    });

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
import { createClient } from "@supabase/supabase-js";

let supabaseClient = null;

function getSupabase() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !serviceKey) {
    throw new Error("supabase_environment_missing");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return supabaseClient;
}

export function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, offsetDays) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dailyDeltaRows(rows, days) {
  const byDate = new Map(
    (Array.isArray(rows) ? rows : []).map(row => [
      String(row.snapshot_date),
      {
        date: String(row.snapshot_date),
        totalViews: Number(row.total_views || 0),
        subscribers: Number(row.subscriber_count || 0),
        videoCount: Number(row.video_count || 0)
      }
    ])
  );

  const today = saoPauloDate();
  const startDate = shiftDate(today, -(days - 1));
  const previousDate = shiftDate(startDate, -1);
  const result = [];

  for (let i = 0; i < days; i++) {
    const date = shiftDate(startDate, i);
    const current = byDate.get(date);
    if (!current) continue;

    const previous = byDate.get(shiftDate(date, -1));
    const consecutive = Boolean(previous);
    const delta = consecutive
      ? Math.max(0, current.totalViews - previous.totalViews)
      : null;

    result.push({
      date,
      views: delta,
      totalViews: current.totalViews,
      subscribers: current.subscribers,
      videoCount: current.videoCount,
      complete: consecutive,
      source: "public_channel_counter_delta"
    });
  }

  return result;
}

export async function recordChannelSnapshot({
  channelId,
  title = "",
  customUrl = "",
  thumbnailUrl = "",
  totalViews,
  subscribers = 0,
  videoCount = 0
}) {
  const id = String(channelId || "").trim();
  const views = Number(totalViews);

  if (!/^UC[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error("invalid_channel_id");
  }
  if (!Number.isFinite(views) || views < 0) {
    throw new Error("invalid_total_views");
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const snapshotDate = saoPauloDate();

  const tracked = await supabase
    .from("tubex_tracked_channels")
    .upsert({
      channel_id: id,
      channel_title: String(title || "").slice(0, 200),
      custom_url: String(customUrl || "").slice(0, 200),
      thumbnail_url: String(thumbnailUrl || "").slice(0, 1000),
      last_seen_at: now,
      last_snapshot_at: now
    }, { onConflict: "channel_id" });

  if (tracked.error) throw tracked.error;

  const snapshot = await supabase
    .from("tubex_channel_view_snapshots")
    .upsert({
      channel_id: id,
      snapshot_date: snapshotDate,
      total_views: Math.floor(views),
      subscriber_count: Math.max(0, Math.floor(Number(subscribers) || 0)),
      video_count: Math.max(0, Math.floor(Number(videoCount) || 0)),
      captured_at: now
    }, { onConflict: "channel_id,snapshot_date" });

  if (snapshot.error) throw snapshot.error;

  return { channelId: id, snapshotDate };
}

export async function getChannelHistory(channelId, days = 28) {
  const id = String(channelId || "").trim();
  if (!/^UC[A-Za-z0-9_-]{20,}$/.test(id)) return [];

  const safeDays = Math.max(1, Math.min(90, Number(days) || 28));
  const today = saoPauloDate();
  const startDate = shiftDate(today, -(safeDays - 1));
  const queryStart = shiftDate(startDate, -1);

  const { data, error } = await getSupabase()
    .from("tubex_channel_view_snapshots")
    .select("snapshot_date,total_views,subscriber_count,video_count")
    .eq("channel_id", id)
    .gte("snapshot_date", queryStart)
    .lte("snapshot_date", today)
    .order("snapshot_date", { ascending: true })
    .limit(100);

  if (error) throw error;
  return dailyDeltaRows(data || [], safeDays);
}

export async function getTrackedChannels(limit = 500) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
  const { data, error } = await getSupabase()
    .from("tubex_tracked_channels")
    .select("channel_id,channel_title,custom_url,thumbnail_url,last_snapshot_at")
    .order("last_snapshot_at", { ascending: true, nullsFirst: true })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

export async function recordCronChannelSnapshot(channel) {
  const id = String(channel?.id || "").trim();
  const stats = channel?.statistics || {};
  const snippet = channel?.snippet || {};

  return recordChannelSnapshot({
    channelId: id,
    title: snippet.title || "",
    customUrl: snippet.customUrl || "",
    thumbnailUrl:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      "",
    totalViews: Number(stats.viewCount || 0),
    subscribers: Number(stats.subscriberCount || 0),
    videoCount: Number(stats.videoCount || 0)
  });
}



async function attachPublicHistory(responseData, channelId) {
  try {
    global.tubexPublicSnapshotDays = global.tubexPublicSnapshotDays || new Map();
    global.tubexPublicHistoryCache = global.tubexPublicHistoryCache || new Map();
    const channel = responseData?.data?.channel;
    const stats = channel?.statistics || {};
    const totalViews = Number(stats.viewCount ?? responseData?.data?.metrics?.totalChannelViews ?? 0);
    const subscribers = Number(stats.subscriberCount ?? responseData?.data?.metrics?.subscribers ?? 0);
    const videoCount = Number(stats.videoCount ?? responseData?.data?.metrics?.totalVideos ?? 0);

    const snapshotDay = saoPauloDate();
    const snapshotKey = `${channelId}:${snapshotDay}`;
    const snapshotDays = global.tubexPublicSnapshotDays;
    if (channelId && Number.isFinite(totalViews) && totalViews >= 0 && !snapshotDays.has(snapshotKey)) {
      // Marca em andamento antes do I/O para evitar duplicidade em requisições
      // simultâneas na mesma instância. Em falha, libera nova tentativa.
      snapshotDays.set(snapshotKey, "pending");
      try {
        await recordChannelSnapshot({
          channelId,
          title: channel?.snippet?.title || channel?.snippet?.localized?.title || "",
          customUrl: channel?.snippet?.customUrl || "",
          thumbnailUrl:
            channel?.snippet?.thumbnails?.high?.url ||
            channel?.snippet?.thumbnails?.medium?.url ||
            channel?.snippet?.thumbnails?.default?.url ||
            "",
          totalViews,
          subscribers,
          videoCount
        });
        snapshotDays.set(snapshotKey, "done");
      } catch (snapshotError) {
        snapshotDays.delete(snapshotKey);
        throw snapshotError;
      }
      // Mantém o mapa pequeno em instâncias de longa duração.
      if (snapshotDays.size > 500) {
        for (const key of snapshotDays.keys()) {
          if (!key.endsWith(`:${snapshotDay}`)) snapshotDays.delete(key);
          if (snapshotDays.size <= 350) break;
        }
      }
    }

    const historyKey = `${channelId}:28:${snapshotDay}`;
    const cachedHistory = global.tubexPublicHistoryCache.get(historyKey);
    let history;
    if (cachedHistory && cachedHistory.expiresAt > Date.now()) {
      history = cachedHistory.value;
    } else {
      history = channelId ? await getChannelHistory(channelId, 28) : [];
      global.tubexPublicHistoryCache.set(historyKey, { value: history, expiresAt: Date.now() + 5 * 60 * 1000 });
      if (global.tubexPublicHistoryCache.size > 500) {
        const firstKey = global.tubexPublicHistoryCache.keys().next().value;
        if (firstKey) global.tubexPublicHistoryCache.delete(firstKey);
      }
    }
    return {
      ...responseData,
      data: {
        ...(responseData?.data || {}),
        channelHistory: history,
        channelHistorySource: "tubex_supabase_public_snapshots",
        channelHistoryDays: 28
      }
    };
  } catch (error) {
    console.warn("[TubeX][ChannelHistory] enrichment failed:", error?.message || error);
    return {
      ...responseData,
      data: {
        ...(responseData?.data || {}),
        channelHistory: [],
        channelHistorySource: "unavailable",
        channelHistoryDays: 28
      }
    };
  }
}

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
    let channelId = String(body?.channelId || "").trim();
    const channelUrl = String(body?.channelUrl || body?.url || "").trim();


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
        activeViews: null,
        engagedViews: null,
        days
      });
    }

    const dateAtStartOfDay = offsetDays => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - Number(offsetDays || 0));
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
          if (engagedIndex < 0 || viewsIndex < 0) {
            console.warn("[TubeX][ActiveViews][Channel] required Analytics columns missing", { headers, startDate, endDate });
            continue;
          }
          const engagedViews = rows.reduce((sum, row) => sum + Number(row[engagedIndex] ?? 0), 0);
          const views = rows.reduce((sum, row) => sum + Number(row[viewsIndex] ?? 0), 0);
          if (!Number.isFinite(engagedViews) || !Number.isFinite(views) || engagedViews < 0 || views < 0 || engagedViews > views) continue;

          return res.status(200).json({
            success: true,
            activeViews: engagedViews,
            engagedViews,
            views,
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
          if (engagedIndex < 0 || viewsIndex < 0) {
            console.warn("[TubeX][ActiveViews][Channel] required fallback columns missing", { headers: exactHeaders, startDate, endDate });
            continue;
          }
          const engagedViews = Number(first[engagedIndex]);
          const views = Number(first[viewsIndex]);
          if (!Number.isFinite(engagedViews) || !Number.isFinite(views) || engagedViews < 0 || views < 0 || engagedViews > views) continue;
          return res.status(200).json({
            success: true,
            activeViews: engagedViews,
            engagedViews,
            views,
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
      activeViews: null,
      engagedViews: null,
      days
    });
  }

// =====================================
// 🔥 CACHE GLOBAL CHANNEL
// =====================================


    // Resolve o canal diretamente a partir da URL aberta no navegador.
    // /channel/UC... é direto; /@handle é resolvido pela YouTube Data API.
    if (!channelId && channelUrl) {
      try {
        const parsed = new URL(channelUrl);
        if (!/(^|\.)youtube\.com$/i.test(parsed.hostname)) throw new Error("invalid_youtube_url");
        const direct = parsed.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]{20,})/);
        if (direct) channelId = direct[1];
        else {
          const handleMatch = parsed.pathname.match(/^\/@([^/]+)/);
          const keyForResolve = String(process.env.YOUTUBE_API_KEY || "").split(",")[0].trim();
          if (handleMatch && keyForResolve) {
            const handle = decodeURIComponent(handleMatch[1]).replace(/^@/, "");
            const lookupUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
            lookupUrl.searchParams.set("part", "id");
            lookupUrl.searchParams.set("forHandle", handle);
            lookupUrl.searchParams.set("key", keyForResolve);
            const lookupRes = await fetch(lookupUrl.toString());
            const lookupJson = await lookupRes.json().catch(() => ({}));
            if (!lookupRes.ok) {
              const reason = lookupJson?.error?.errors?.[0]?.reason || lookupJson?.error?.message || `youtube_http_${lookupRes.status}`;
              return res.status(200).json({success:false,error:reason,items:[],data:{channel:null,videos:[]}});
            }
            channelId = String(lookupJson?.items?.[0]?.id || "");
          }
          // Fallback para URLs legadas /c/ e /user/: ler somente o HTML do próprio canal
          // para extrair o ID canônico; as estatísticas continuam vindo da YouTube Data API.
          if (!channelId && !handleMatch) {
            const pageRes = await fetch(parsed.toString(), {headers:{"Accept":"text/html"}});
            if (pageRes.ok) {
              const html = await pageRes.text();
              const patterns = [
                /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[a-zA-Z0-9_-]{20,})["']/i,
                /<meta[^>]+content=["'](UC[a-zA-Z0-9_-]{20,})["'][^>]+itemprop=["']channelId["']/i,
                /data-channel-external-id=["'](UC[a-zA-Z0-9_-]{20,})["']/i,
                /["']externalId["']\s*:\s*["'](UC[a-zA-Z0-9_-]{20,})["']/i
              ];
              for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) { channelId = match[1]; break; }
              }
            }
          }
        }
      } catch (resolveError) {
        console.warn("[TubeX] channelUrl resolution failed:", resolveError?.message || resolveError);
      }
    }

    if (!channelId) {
      return res.status(200).json({ success:false, error:"channel_url_unresolved", items:[], data:{channel:null,videos:[]} });
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
    const cachedWithHistory = await attachPublicHistory(cached.data, channelId);
    return res.status(200).json(cachedWithHistory);
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

  const finalDataWithHistory = await attachPublicHistory(finalData, channelId);
  return res.status(200).json(finalDataWithHistory);
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


// 📈 Registra snapshot público e devolve o histórico persistido do canal.
const finalDataWithHistory = await attachPublicHistory(finalData, channelId);

// 💾 SALVA CACHE
global.tubexChannelCache[cacheKey] = {
  data: finalDataWithHistory,
  expires: Date.now() + CHANNEL_CACHE_TTL,
  staleUntil: Date.now() + CHANNEL_STALE_TTL

};

return res.status(200).json(finalDataWithHistory);

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
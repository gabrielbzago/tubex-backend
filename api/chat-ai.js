export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, authorization, x-client");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return res.status(200).json({ success: true, service: "tubex-chat-ai", status: "online" });
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const apiKey = req.headers["x-api-key"] || req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  if (!process.env.API_KEY || apiKey !== process.env.API_KEY) {
    return res.status(403).json({ success: false, error: "unauthorized" });
  }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ success: false, error: "invalid_json" }); }

  const action = body.action || "chat";
  try {
    if (action === "connect") return await connectChannel(body, res);
    if (action === "chat") return await chat(body, res);
    return res.status(400).json({ success: false, error: "invalid_action" });
  } catch (err) {
    console.error("[TubeX Chat AI]", err);
    return res.status(500).json({ success: false, error: "server_error", message: String(err?.message || err).slice(0, 300) });
  }
}

const yt = (path, params = {}, token = "") => {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  if (!token) u.searchParams.set("key", activeYoutubeKey());
  return { url: u.toString(), headers: token ? { Authorization: `Bearer ${token}` } : {} };
};

function activeYoutubeKey() {
  return String(process.env.YOUTUBE_API_KEY || "").split(",")[0].trim();
}

async function getJson(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok || data?.error) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || "http_error";
    const err = new Error(data?.error?.message || `HTTP ${r.status}`);
    err.status = r.status; err.reason = reason; err.data = data;
    throw err;
  }
  return data;
}

async function connectChannel(body, res) {
  const accessToken = String(body.accessToken || "").trim();
  if (!activeYoutubeKey()) return res.status(200).json({ success: false, error: "youtube_api_unavailable" });

  // OAuth token is required for MINE/Analytics. Public channel/video data uses the same
  // YOUTUBE_API_KEY convention as the existing TubeX production backend.
  if (!accessToken) return res.status(400).json({ success: false, error: "accessToken_required" });

  const me = await getJson("channels", { part: "snippet,statistics,contentDetails", mine: "true" }, accessToken);
  const channel = me.items?.[0];
  if (!channel) return res.status(404).json({ success: false, error: "channel_not_found" });

  const channelId = channel.id;
  const search = await getJson("search", { part: "snippet", channelId, order: "date", type: "video", maxResults: "25" }, activeYoutubeKey());
  const ids = (search.items || []).map(x => x.id?.videoId).filter(Boolean);
  let videos = [];
  if (ids.length) {
    const stats = await getJson("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") }, activeYoutubeKey());
    videos = stats.items || [];
  }

  let analytics = null;
  try {
    const end = new Date(); end.setDate(end.getDate() - 1);
    const start = new Date(); start.setDate(start.getDate() - 30);
    const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    u.searchParams.set("ids", "channel==MINE");
    u.searchParams.set("startDate", start.toISOString().slice(0, 10));
    u.searchParams.set("endDate", end.toISOString().slice(0, 10));
    u.searchParams.set("metrics", "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost");
    analytics = await getJson(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (e) {
    console.warn("[TubeX Chat AI] channel analytics unavailable:", e?.message || e);
  }

  const latestVideos = videos.map(v => ({
    id: v.id,
    title: v.snippet?.title || "",
    description: v.snippet?.description || "",
    publishedAt: v.snippet?.publishedAt || "",
    thumbnail: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || "",
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
    duration: v.contentDetails?.duration || ""
  }));

  return res.status(200).json({
    success: true,
    data: {
      channel: {
        id: channelId,
        title: channel.snippet?.title || "",
        description: channel.snippet?.description || "",
        customUrl: channel.snippet?.customUrl || "",
        publishedAt: channel.snippet?.publishedAt || "",
        country: channel.snippet?.country || "",
        subscribers: Number(channel.statistics?.subscriberCount || 0),
        totalViews: Number(channel.statistics?.viewCount || 0),
        totalVideos: Number(channel.statistics?.videoCount || 0)
      },
      latestVideos,
      analytics: analytics ? {
        columnHeaders: analytics.columnHeaders || [],
        rows: analytics.rows || []
      } : null,
      generatedAt: new Date().toISOString()
    }
  });
}

async function chat(body, res) {
  const prompt = String(body.prompt || body.message || "").trim();
  if (!prompt) return res.status(400).json({ success: false, error: "prompt_required" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ success: false, error: "openai_api_unavailable" });

  const context = sanitizeContext(body.context || {});
  const model = String(body.model || "gpt-4.1-mini");
  const system = `Você é o TubeX Chat AI, um consultor sênior de crescimento no YouTube.\n\nSua função é conversar com o criador usando os dados reais do canal fornecidos no contexto. Não invente métricas. Se uma informação não estiver no contexto, diga claramente que ela não está disponível. Sempre diferencie fato, interpretação e recomendação.\n\nResponda em português do Brasil, de forma direta, prática e premium. Não dê dicas genéricas quando houver dados suficientes para uma análise específica. Ao analisar desempenho, use números do contexto. Ao recomendar uma ação, explique por que ela faz sentido para ESTE canal.\n\nCONTEXTO DO CANAL:\n${JSON.stringify(context, null, 2)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 2500,
      messages: [
        { role: "system", content: system },
        ...(Array.isArray(body.history) ? body.history.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 6000) })) : []),
        { role: "user", content: prompt.slice(0, 6000) }
      ]
    })
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || data?.error) {
    return res.status(response.status || 500).json({ success: false, error: "openai_error", message: data?.error?.message || text?.slice(0, 300) });
  }
  const answer = data?.choices?.[0]?.message?.content?.trim() || "Não foi possível gerar uma resposta.";
  return res.status(200).json({ success: true, answer, text: answer, model: data.model || model, usage: data.usage || null });
}

function sanitizeContext(input) {
  const c = input && typeof input === "object" ? input : {};
  const channel = c.channel && typeof c.channel === "object" ? c.channel : {};
  const videos = Array.isArray(c.latestVideos || c.videos) ? (c.latestVideos || c.videos).slice(0, 25) : [];
  return {
    channel: {
      id: String(channel.id || ""), title: String(channel.title || ""), description: String(channel.description || "").slice(0, 3000),
      subscribers: Number(channel.subscribers || 0), totalViews: Number(channel.totalViews || 0), totalVideos: Number(channel.totalVideos || 0),
      averageViews: Number(channel.averageViews || 0), averageLikes: Number(channel.averageLikes || 0), averageComments: Number(channel.averageComments || 0)
    },
    latestVideos: videos.map(v => ({ id: String(v.id || ""), title: String(v.title || "").slice(0, 300), publishedAt: String(v.publishedAt || ""), views: Number(v.views || 0), likes: Number(v.likes || 0), comments: Number(v.comments || 0) })),
    analytics: c.analytics || null,
    extra: typeof c.extra === "object" ? c.extra : undefined
  };
}

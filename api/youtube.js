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

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const keyword = body?.keyword?.trim();
    const mode = body?.mode || "seo";
    const videoId = body?.videoId;

    if (!keyword && !videoId) {
      return res.status(400).json({
        success: false,
        error: "keyword_required"
      });
    }

    // =========================
    // 🔑 YOUTUBE API KEY (ROTATE)
    // =========================
    const keys = (process.env.YOUTUBE_API_KEY || "")
      .split(",")
      .filter(Boolean);

    const key = keys[Math.floor(Math.random() * keys.length)];

    // =========================
    // 🎬 VIDEO MODE
    // =========================
    if (videoId) {

      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${key}`;

      const resYT = await fetch(url);
      const json = await resYT.json();

      return res.status(200).json({
        success: true,
        data: json.items?.[0] || { snippet: { tags: [] } }
      });
    }

    // =========================
    // 📊 SUMMARY MODE (CANAL REAL)
    // =========================
    if (mode === "summary") {

      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(keyword)}&key=${key}`
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
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${key}`
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
    // 🚀 SEO MODE (BUSCA DE VÍDEOS)
    // =========================
    let allIds = [];
    let nextPageToken = "";
    let pageCount = 0;

    while (pageCount < 3) {

      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&type=video&maxResults=50` +
        `&q=${encodeURIComponent(keyword)}` +
        `&pageToken=${nextPageToken}` +
        `&key=${key}`;

      const searchRes = await fetch(searchUrl);
      const searchJson = await searchRes.json();

      const ids = searchJson.items
        ?.map(v => v.id?.videoId)
        .filter(Boolean) || [];

      allIds.push(...ids);

      nextPageToken = searchJson.nextPageToken || "";
      pageCount++;

      if (!nextPageToken) break;
    }

    const uniqueIds = [...new Set(allIds)];

    let items = [];

    for (let i = 0; i < uniqueIds.length; i += 50) {

      const chunk = uniqueIds.slice(i, i + 50).join(",");

      const videosUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet,statistics&id=${chunk}&key=${key}`;

      const resVideos = await fetch(videosUrl);
      const jsonVideos = await resVideos.json();

      if (Array.isArray(jsonVideos.items)) {
        items.push(...jsonVideos.items);
      }
    }

    if (!items.length) {
      return res.status(200).json({
        success: true,
        items: [],
        volume: 0,
        competition: 0
      });
    }

    // =========================
    // 📈 MÉTRICAS
    // =========================
    items.sort((a, b) =>
      Number(b.statistics.viewCount || 0) -
      Number(a.statistics.viewCount || 0)
    );

    const totalViews = items.reduce((acc, v) =>
      acc + Number(v.statistics?.viewCount || 0), 0
    );

    const avgViews = totalViews / items.length;

    const top = Number(items[0]?.statistics?.viewCount || 0);
    const median = Number(items[Math.floor(items.length / 2)]?.statistics?.viewCount || 0);

    const volume = Math.min(100,
      Math.round(
        (Math.log10(top + 1) * 10) +
        (Math.log10(median + 1) * 5)
      )
    );

    const dominance = top / (median || 1);
    const competition = Math.min(100, Math.log10(dominance + 1) * 40);

    return res.status(200).json({
      success: true,
      items,
      volume,
      competition
    });

  } catch (e) {

    console.error("💥 ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}

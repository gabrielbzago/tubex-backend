import {
  getTrackedChannels,
  recordCronChannelSnapshot
} from "./youtube-channel.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const secret = String(process.env.CRON_SECRET || "").trim();
  const authorization = String(req.headers.authorization || "");
  const supplied = authorization.replace(/^Bearer\s+/i, "").trim();

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
  // Keep the same secret check for manual POST invocations.
  if (!secret || supplied !== secret) {
    return res.status(401).json({ success: false, error: "unauthorized_cron" });
  }

  const apiKey = String(process.env.YOUTUBE_API_KEY || "").split(",")[0].trim();
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "youtube_api_key_missing" });
  }

  try {
    const tracked = await getTrackedChannels(500);
    if (!tracked.length) {
      return res.status(200).json({
        success: true,
        message: "no_tracked_channels",
        totalTracked: 0,
        processed: 0,
        failed: 0
      });
    }

    let processed = 0;
    let failed = 0;
    const errors = [];

    // YouTube channels.list accepts up to 50 channel IDs per request.
    for (let offset = 0; offset < tracked.length; offset += 50) {
      const batch = tracked.slice(offset, offset + 50);
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "snippet,statistics");
      url.searchParams.set("id", batch.map(item => item.channel_id).join(","));
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        failed += batch.length;
        errors.push({
          batchStart: offset,
          error: payload?.error?.message || `youtube_http_${response.status}`
        });
        continue;
      }

      const returned = Array.isArray(payload.items) ? payload.items : [];
      const returnedIds = new Set(returned.map(item => item.id));

      for (const channel of returned) {
        try {
          await recordCronChannelSnapshot(channel);
          processed += 1;
        } catch (error) {
          failed += 1;
          errors.push({
            channelId: channel?.id || null,
            error: String(error?.message || error).slice(0, 180)
          });
        }
      }

      // Channels no longer visible/available are not treated as zero-view channels.
      failed += batch.filter(item => !returnedIds.has(item.channel_id)).length;
    }

    return res.status(200).json({
      success: failed === 0,
      totalTracked: tracked.length,
      processed,
      failed,
      limit: 500,
      hasMore: tracked.length === 500,
      errors: errors.slice(0, 20),
      source: "youtube_data_api_public_channel_statistics"
    });
  } catch (error) {
    console.error("[TubeX][ChannelHistoryCron]", error?.message || error);
    return res.status(500).json({
      success: false,
      error: String(error?.message || error || "cron_failed").slice(0, 180)
    });
  }
}

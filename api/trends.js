/**
 * TubeX — Google Trends backend v6
 * Vercel route: /api/trends
 * Provider: SerpApi Google Trends engine.
 *
 * Uses the existing SERPAPI_API_KEY already present in Vercel.
 * Google Trends property is YouTube Search (gprop=youtube).
 */

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_VERSION = "v6-serpapi";
const cache = globalThis.__tubexGoogleTrendsCacheV6 ||
  (globalThis.__tubexGoogleTrendsCacheV6 = new Map());

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=3600");
}

function cleanKeyword(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeRange(value) {
  return value === "12m" ? "12m" : "30d";
}

function serpDate(range) {
  return range === "12m" ? "today 12-m" : "today 1-m";
}

function zeroSeries(range) {
  const count = range === "12m" ? 52 : 30;
  const step = range === "12m" ? 7 * 86400000 : 86400000;
  const now = Date.now();
  return Array.from({length: count}, (_, i) => {
    const date = new Date(now - (count - 1 - i) * step);
    return {
      time: date.toISOString(),
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      value: 0,
      noData: true
    };
  });
}

function extractTimeline(payload) {
  const timeline = payload?.interest_over_time?.timeline_data;
  if (!Array.isArray(timeline)) return [];

  const result = [];
  for (const point of timeline) {
    const first = Array.isArray(point?.values) ? point.values[0] : null;
    const raw = first?.extracted_value ?? first?.value;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;

    const timestamp = Number(point?.timestamp || 0);
    const time = timestamp > 0
      ? new Date(timestamp * 1000).toISOString()
      : null;

    result.push({
      time,
      timestamp: timestamp || null,
      label: String(point?.date || ""),
      value: Math.max(0, Math.min(100, Math.round(value))),
      isPartial: !!point?.isPartial
    });
  }
  return result;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "TubeX/1.0"
      },
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!response.ok) {
      throw new Error(json?.error || `SerpApi HTTP ${response.status}`);
    }
    if (!json || typeof json !== "object") {
      throw new Error("SerpApi retornou JSON inválido");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTrend(keyword, range, geo) {
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("serpapi_not_configured");
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("q", keyword);
  url.searchParams.set("data_type", "TIMESERIES");
  url.searchParams.set("date", serpDate(range));
  url.searchParams.set("gprop", "youtube");
  url.searchParams.set("hl", "pt-BR");
  url.searchParams.set("tz", "-180");
  if (geo) url.searchParams.set("geo", geo.toUpperCase());
  url.searchParams.set("no_cache", "false");
  url.searchParams.set("api_key", process.env.SERPAPI_API_KEY);

  const payload = await fetchJson(url.toString());
  const status = String(payload?.search_metadata?.status || "").toLowerCase();
  if (status === "error") {
    throw new Error(payload?.error || "SerpApi Google Trends error");
  }

  return extractTimeline(payload);
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin || "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success:false, error:"method_not_allowed" });
  }

  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(403).json({ success:false, error:"unauthorized" });
  }

  if (!process.env.SERPAPI_API_KEY) {
    return res.status(500).json({
      success:false,
      error:"serpapi_not_configured",
      message:"Configure SERPAPI_API_KEY na Vercel."
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const keyword = cleanKeyword(body.keyword);
    const range = normalizeRange(body.range);
    const geo = String(body.geo || "").trim().toUpperCase();

    if (!keyword) {
      return res.status(400).json({ success:false, error:"keyword_required" });
    }

    const cacheKey = CACHE_VERSION + ":" + JSON.stringify({ keyword:keyword.toLowerCase(), range, geo });
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return res.status(200).json({ ...cached.data, cached:true });
    }

    let trend = [];
    try {
      trend = await fetchTrend(keyword, range, geo);
    } catch (error) {
      console.warn("[TubeX] SerpApi Trends failed:", error?.message || error);
      // A failed/empty Trends lookup is intentionally represented by a real
      // zero baseline in the UI. No synthetic non-zero values are generated.
      trend = [];
    }

    const noData = trend.length < 2;
    const finalTrend = noData ? zeroSeries(range) : trend;

    const data = {
      success: true,
      source: "google_trends",
      provider: "SerpApi",
      engine: "google_trends",
      property: "youtube",
      geo: geo || "WORLD",
      keyword,
      range,
      noData,
      trend: finalTrend,
      trend30d: range === "30d" ? finalTrend : undefined,
      trend12m: range === "12m" ? finalTrend : undefined,
      generatedAt: new Date().toISOString()
    };

    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, data });
    return res.status(200).json(data);

  } catch (error) {
    console.error("[TubeX] Trends error:", error);
    return res.status(502).json({
      success:false,
      error:"google_trends_failed",
      message:"Não foi possível consultar o Google Trends agora.",
      source:"google_trends",
      noData:true
    });
  }
}

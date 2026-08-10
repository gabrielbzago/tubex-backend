/**
 * TubeX — Google Trends backend
 *
 * Vercel route: /api/trends
 *
 * The extension never calls trends.google.com directly. This serverless
 * endpoint obtains the public Google Trends time-series data server-side.
 * The official Google Trends API is currently an Alpha program with
 * limited tester access; this route therefore reads the same public
 * Trends data used by the Google Trends website.
 */

const CACHE_TTL = 15 * 60 * 1000;

const cache =
  globalThis.__tubexGoogleTrendsCache ||
  (globalThis.__tubexGoogleTrendsCache = new Map());

function stripXssi(text) {
  return String(text || "")
    .replace(/^\)\]\}',?\s*/, "")
    .trim();
}

function cleanKeyword(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeRange(value) {
  return value === "12m" ? "12m" : "30d";
}

function trendsTime(range) {
  return range === "12m"
    ? "today 12-m"
    : "today 1-m";
}

function normalizePoint(point) {

  const value = Number(
    Array.isArray(point?.value)
      ? point.value[0]
      : point?.value
  );

  if (!Number.isFinite(value)) {
    return null;
  }

  const timestamp =
    Number(point?.time || point?.timestamp || 0);

  const time =
    Number.isFinite(timestamp) && timestamp > 0
      ? new Date(
          timestamp < 1e12
            ? timestamp * 1000
            : timestamp
        ).toISOString()
      : null;

  return {
    time,
    label: String(
      point?.formattedTime ||
      point?.formattedAxisTime ||
      ""
    ),
    value: Math.max(
      0,
      Math.min(100, Math.round(value))
    ),
    isPartial: !!point?.isPartial
  };
}

async function requestJson(url, options = {}) {

  const response =
    await fetch(url, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/151.0 Safari/537.36",
        "Accept":
          "application/json,text/plain,*/*",
        "Accept-Language":
          "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(options.headers || {})
      }
    });

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Google Trends HTTP ${response.status}`
    );
  }

  let json;

  try {
    json =
      JSON.parse(
        stripXssi(text)
      );
  } catch {
    throw new Error(
      "Google Trends retornou JSON inválido"
    );
  }

  return {
    json,
    headers: response.headers
  };
}

function buildExploreRequest(
  keyword,
  range,
  geo,
  property
) {

  return {
    comparisonItem: [
      {
        keyword,
        geo,
        time: trendsTime(range)
      }
    ],
    category: 0,
    property
  };
}

function findTimeseriesWidget(widgets) {

  if (!Array.isArray(widgets)) {
    return null;
  }

  return (
    widgets.find(widget =>
      String(widget?.id || "")
        .toUpperCase() === "TIMESERIES"
    ) ||
    widgets.find(widget =>
      /interest over time|interesse ao longo/i
        .test(
          String(widget?.title || "")
        )
    ) ||
    widgets.find(widget =>
      widget?.request &&
      widget?.token
    )
  );
}

async function fetchGoogleTrend(
  keyword,
  range,
  geo,
  property
) {

  const apiKey = String(
    process.env.SERPAPI_API_KEY || ""
  ).trim();

  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY não configurada na Vercel");
  }

  const url = new URL("https://serpapi.com/search.json");

  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("q", keyword);
  url.searchParams.set("data_type", "TIMESERIES");
  url.searchParams.set(
    "date",
    range === "12m" ? "today 12-m" : "today 1-m"
  );
  url.searchParams.set("gprop", property === "youtube" ? "youtube" : "youtube");
  url.searchParams.set("tz", "-180");
  url.searchParams.set("api_key", apiKey);

  if (geo) {
    url.searchParams.set("geo", geo);
  }

  const { json } = await requestJson(url.toString());

  if (
    json?.search_metadata?.status &&
    json.search_metadata.status !== "Success"
  ) {
    throw new Error(
      json?.error ||
      `SerpApi status: ${json.search_metadata.status}`
    );
  }

  if (json?.error) {
    throw new Error(String(json.error));
  }

  const timeline =
    json?.interest_over_time?.timeline_data || [];

  const trend = timeline
    .map(point => {
      const first =
        Array.isArray(point?.values)
          ? point.values[0]
          : null;

      const value = Number(
        first?.extracted_value ??
        first?.value
      );

      if (!Number.isFinite(value)) return null;

      const timestamp = Number(point?.timestamp || 0);

      return {
        time:
          timestamp > 0
            ? new Date(timestamp * 1000).toISOString()
            : null,
        label: String(point?.date || ""),
        value: Math.max(0, Math.min(100, Math.round(value))),
        isPartial: !!point?.is_partial
      };
    })
    .filter(Boolean);

  if (trend.length < 2) {
    throw new Error(
      "Google Trends não retornou dados suficientes para esta palavra-chave"
    );
  }

  return trend;
}

export default async function handler(req, res) {

  const origin =
    req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-api-key"
  );

  res.setHeader(
    "Cache-Control",
    "s-maxage=900, stale-while-revalidate=3600"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  if (
    req.headers["x-api-key"] !==
    process.env.API_KEY
  ) {
    return res.status(403).json({
      success: false,
      error: "unauthorized"
    });
  }

  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const keyword =
      cleanKeyword(body.keyword);

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword_required"
      });
    }

    const range =
      normalizeRange(body.range);

    const geo =
      String(body.geo || "");

    const property =
      String(
        body.property || "youtube"
      ).toLowerCase() === "youtube"
        ? "youtube"
        : "";

    const cacheKey =
      JSON.stringify({
        keyword: keyword.toLowerCase(),
        range,
        geo,
        property
      });

    const cached =
      cache.get(cacheKey);

    if (
      cached &&
      cached.expires > Date.now()
    ) {
      return res.status(200).json({
        ...cached.data,
        cached: true
      });
    }

    const trend =
      await fetchGoogleTrend(
        keyword,
        range,
        geo,
        property
      );

    const data = {
      success: true,
      source: "google_trends",
      property,
      geo: geo || "WORLD",
      keyword,
      range,
      trend,
      trend30d:
        range === "30d"
          ? trend
          : undefined,
      trend12m:
        range === "12m"
          ? trend
          : undefined,
      generatedAt:
        new Date().toISOString()
    };

    cache.set(
      cacheKey,
      {
        expires:
          Date.now() + CACHE_TTL,
        data
      }
    );

    return res.status(200).json(data);

  } catch (error) {

    console.error(
      "[TubeX] Google Trends error:",
      error
    );

    return res.status(502).json({
      success: false,
      error:
        error?.message ||
        "google_trends_failed"
    });
  }
}

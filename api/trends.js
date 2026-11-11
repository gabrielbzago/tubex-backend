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

const CACHE_TTL = 30 * 60 * 1000;
const CACHE_VERSION = "v9-rate-limit";

const cache =
  globalThis.__tubexGoogleTrendsCacheV2 ||
  (globalThis.__tubexGoogleTrendsCacheV2 = new Map());

const STALE_TTL = 6 * 60 * 60 * 1000;
const GOOGLE_TRENDS_COOLDOWN_MS = 2 * 60 * 1000;
const sessionState =
  globalThis.__tubexGoogleTrendsSessionV1 ||
  (globalThis.__tubexGoogleTrendsSessionV1 = {
    cookie: "",
    expires: 0,
    promise: null
  });
let trendsCooldownUntil =
  Number(globalThis.__tubexGoogleTrendsCooldownUntil || 0);

function markTrendsRateLimit() {
  trendsCooldownUntil = Date.now() + GOOGLE_TRENDS_COOLDOWN_MS;
  globalThis.__tubexGoogleTrendsCooldownUntil = trendsCooldownUntil;
}

function assertTrendsNotCoolingDown() {
  const until = Math.max(
    trendsCooldownUntil,
    Number(globalThis.__tubexGoogleTrendsCooldownUntil || 0)
  );
  if (until > Date.now()) {
    const error = new Error("Google Trends rate limit (HTTP 429). Aguarde antes de consultar novamente.");
    error.status = 429;
    error.retryAfter = Math.ceil((until - Date.now()) / 1000);
    throw error;
  }
}


let trendsRequestQueue = Promise.resolve();
let lastTrendsRequestAt = 0;

async function waitForGoogleTrendsSlot() {
  const previous = trendsRequestQueue;
  let release;
  trendsRequestQueue = new Promise(resolve => { release = resolve; });
  await previous;

  try {
    const waitMs = Math.max(
      0,
      900 - (Date.now() - lastTrendsRequestAt)
    );
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastTrendsRequestAt = Date.now();
  } finally {
    release();
  }
}


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
  return ["7d", "30d", "60d", "90d", "12m"].includes(value)
    ? value
    : "30d";
}

function formatTrendDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function trendsTime(range, exactRange = false) {
  if (!exactRange) {
    if (range === "7d") {
      return "today 7-d";
    }

    if (range === "60d" || range === "90d") {
      return "today 3-m";
    }

    if (range === "12m") {
      return "today 12-m";
    }

    return "today 1-m";
  }

  // Real-data fallback using an explicit interval.
  const end = new Date();
  const days = ({ "7d": 7, "30d": 30, "60d": 60, "90d": 90, "12m": 365 })[range] || 30;

  const start =
    new Date(
      end.getTime() -
      (days * 24 * 60 * 60 * 1000)
    );

  return `${formatTrendDate(start)} ${formatTrendDate(end)}`;
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

  assertTrendsNotCoolingDown();
  await waitForGoogleTrendsSlot();

  const response =
    await fetch(url, {
      ...options,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/151.0 Safari/537.36",
        "Accept":
          "application/json,text/plain,*/*",
        "Accept-Language":
          "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer":
          "https://trends.google.com/trends/explore",
        ...(options.headers || {})
      }
    });

  const text =
    await response.text();

  if (!response.ok) {
    if (response.status === 429) markTrendsRateLimit();
    const detail = text
      .replace(/^\\s+|\\s+$/g, "")
      .slice(0, 300);

    throw new Error(
      `Google Trends HTTP ${response.status}` +
      (detail ? `: ${detail}` : "")
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
  property,
  exact12m = false
) {

  return {
    comparisonItem: [
      {
        keyword,
        geo,
        time: trendsTime(range, exact12m)
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

function extractSetCookie(headers) {

  if (!headers) {
    return "";
  }

  // Node/Vercel may expose combined Set-Cookie values.
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : null;

  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(value => String(value).split(";")[0])
      .filter(Boolean)
      .join("; ");
  }

  const combined =
    headers.get("set-cookie") || "";

  if (!combined) {
    return "";
  }

  return String(combined)
    .split(/,(?=[^;=]+=[^;]+)/g)
    .map(value => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(...cookieValues) {

  const jar = new Map();

  for (const value of cookieValues) {

    if (!value) {
      continue;
    }

    String(value)
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => {

        const separator =
          part.indexOf("=");

        if (separator <= 0) {
          return;
        }

        const name =
          part.slice(0, separator).trim();

        const cookieValue =
          part.slice(separator + 1).trim();

        if (name) {
          jar.set(name, `${name}=${cookieValue}`);
        }
      });
  }

  return [...jar.values()].join("; ");
}

async function warmGoogleTrendsSession() {
  assertTrendsNotCoolingDown();

  if (sessionState.expires > Date.now()) {
    return sessionState.cookie || "";
  }

  if (sessionState.promise) {
    return sessionState.promise;
  }

  sessionState.promise = (async () => {
    const warmupUrl =
      "https://trends.google.com/trends/?hl=pt-BR&geo=BR";
    const warmup = await requestJsonText(warmupUrl);
    const cookie = extractSetCookie(warmup.headers);

    // Reuse the session cookie instead of warming Google on every query.
    // If Google supplies no cookie, memoize that result briefly as well.
    sessionState.cookie = cookie;
    sessionState.expires = Date.now() + (cookie ? 20 : 2) * 60 * 1000;
    return cookie;
  })();

  try {
    return await sessionState.promise;
  } finally {
    sessionState.promise = null;
  }
}

async function requestJsonText(
  url,
  options = {}
) {

  assertTrendsNotCoolingDown();
  await waitForGoogleTrendsSlot();

  const response =
    await fetch(url, {
      ...options,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/151.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer":
          "https://trends.google.com/",
        ...(options.headers || {})
      }
    });

  const text =
    await response.text();

  if (!response.ok) {
    if (response.status === 429) markTrendsRateLimit();
    const error = new Error(
      `Google Trends warmup HTTP ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return {
    text,
    headers: response.headers
  };
}

async function fetchGoogleTrendOnce(
  keyword,
  range,
  geo,
  property,
  exactRange = false
) {

  const exploreRequest =
    buildExploreRequest(
      keyword,
      range,
      geo,
      property,
      exactRange
    );

  const exploreUrl =
    "https://trends.google.com/trends/api/explore" +
    "?hl=pt-BR" +
    "&tz=-180" +
    "&req=" +
    encodeURIComponent(
      JSON.stringify(
        exploreRequest
      )
    );

  // Google Trends currently expects a warmed session cookie
  // (notably NID) before the /api/explore request. Vercel's
  // serverless runtime does not keep browser cookies between requests,
  // so we explicitly bootstrap the session and carry the cookie forward.
  const sessionCookie =
    await warmGoogleTrendsSession();

  const explore =
    await requestJson(
      exploreUrl,
      sessionCookie
        ? {
            headers: {
              Cookie: sessionCookie
            }
          }
        : {}
    );

  const widget =
    findTimeseriesWidget(
      explore.json?.widgets
    );

  if (
    !widget ||
    !widget.request ||
    !widget.token
  ) {
    throw new Error(
      "Widget TIMESERIES não encontrado no Google Trends"
    );
  }

  const requestPayload = {
    ...widget.request,
    requestOptions: {
      ...(widget.request.requestOptions || {}),
      category: 0,
      property
    }
  };

  const cookie =
    mergeCookies(
      sessionCookie,
      extractSetCookie(explore.headers)
    );

  const widgetUrl =
    "https://trends.google.com/trends/api/widgetdata/multiline" +
    "?hl=pt-BR" +
    "&tz=-180" +
    "&req=" +
    encodeURIComponent(
      JSON.stringify(
        requestPayload
      )
    ) +
    "&token=" +
    encodeURIComponent(
      widget.token
    );

  const result =
    await requestJson(
      widgetUrl,
      cookie
        ? {
            headers: {
              Cookie: cookie,
              Referer:
                "https://trends.google.com/trends/explore"
            }
          }
        : {
            headers: {
              Referer:
                "https://trends.google.com/trends/explore"
            }
          }
    );

  const timeline =
    result.json?.default?.timelineData ||
    result.json?.timelineData ||
    [];

  const trend =
    timeline
      .map(normalizePoint)
      .filter(Boolean);

  if (trend.length < 2) {
    throw new Error(
      "Google Trends não retornou dados suficientes"
    );
  }

  // A single-keyword Trends series may legitimately be flat at 100.
  // Keep valid real data instead of discarding it.
  return trend;
}


async function fetchGoogleTrend(
  keyword,
  range,
  geo,
  property
) {
  // Never retry HTTP 429. Nested retries previously multiplied requests.
  assertTrendsNotCoolingDown();

  try {
    return await fetchGoogleTrendOnce(
      keyword,
      range,
      geo,
      property,
      range === "60d" || range === "90d"
    );
  } catch (error) {
    if (Number(error?.status) === 429 || /HTTP 429/.test(error?.message || "")) {
      markTrendsRateLimit();
      error.status = 429;
    }
    throw error;
  }
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

    // Keep the response contract stable for the extension.
    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

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

    const rawProperty =
      body.property === undefined || body.property === null
        ? "youtube"
        : String(body.property).trim().toLowerCase();

    // Google Trends gprop contract:
    //   "youtube" => YouTube Search
    //   "" / "web" / "google" => Google Web Search
    const property =
      rawProperty === "youtube"
        ? "youtube"
        : "";

    const cacheKey =
      CACHE_VERSION + ":" + JSON.stringify({
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
      trend7d:
        range === "7d"
          ? trend
          : undefined,
      trend30d:
        range === "30d"
          ? trend
          : undefined,
      trend60d:
        range === "60d" ? trend : undefined,
      trend90d:
        range === "90d" ? trend : undefined,
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
        staleUntil:
          Date.now() + CACHE_TTL + STALE_TTL,
        data
      }
    );

    return res.status(200).json(data);

  } catch (error) {

    const stale = cache.get(cacheKey);
    if (
      stale &&
      stale.staleUntil > Date.now() &&
      (Number(error?.status) === 429 || /HTTP 429|rate limit/i.test(error?.message || ""))
    ) {
      return res.status(200).json({
        ...stale.data,
        cached: true,
        stale: true,
        staleReason: "google_trends_rate_limited"
      });
    }

    console.error(
      "[TubeX] Google Trends error:",
      error
    );

    const message =
      error?.message ||
      "google_trends_failed";

    const status =
      Number(error?.status) === 429 || /HTTP 429|rate limit/i.test(message)
        ? 429
        : message.includes("dados suficientes") ||
          message.includes("série degenerada")
          ? 422
          : 502;

    if (status === 429) {
      res.setHeader("Retry-After", String(error?.retryAfter || 120));
    }

    return res.status(status).json({
      success: false,
      error: message,
      source: "google_trends",
      noData: status === 422
    });
  }
}

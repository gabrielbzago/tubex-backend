// ============================================================
// TubeX — Google SERP Verification Backend v1
// api/google-search.js
//
// Provider: SerpApi
// Google Search: https://serpapi.com/search?engine=google
// Optional Google Videos fallback:
// https://serpapi.com/search?engine=google_videos
//
// Required Vercel environment variables:
//   API_KEY            -> existing TubeX backend key
//   SERPAPI_API_KEY   -> private SerpApi key
//
// The SerpApi key NEVER reaches the Chrome extension.
// ============================================================

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = "v3";
const REQUEST_TIMEOUT_MS = 15000;

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-api-key"
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isYoutubeUrl(url) {
  const value = String(url || "").toLowerCase();

  return (
    value.includes("youtube.com/") ||
    value.includes("youtu.be/")
  );
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function toAbsolutePosition(item) {
  const position =
    Number(
      item?.position_on_page ??
      item?.position ??
      item?.rank
    );

  return Number.isFinite(position) ? position : null;
}

function normalizeGoogleResult(item, source, fallbackPosition = null) {
  const link =
    item?.link ||
    item?.url ||
    item?.original_link ||
    "";

  const position =
    toAbsolutePosition(item) ??
    fallbackPosition;

  return {
    position,
    title:
      String(
        item?.title ||
        item?.name ||
        ""
      ).trim(),
    url: String(link || "").trim(),
    domain:
      getDomain(link) ||
      String(
        item?.displayed_link ||
        item?.source ||
        ""
      ).trim(),
    snippet:
      String(
        item?.snippet ||
        item?.description ||
        ""
      ).trim(),
    source
  };
}

function uniqueResults(results) {
  const seen = new Set();
  const output = [];

  for (const item of results) {
    const key =
      String(item?.url || "").trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent":
            "TubeX/1.0 (+https://tubex.app)"
        },
        signal: controller.signal
      });

    const text =
      await response.text();

    let json = null;

    try {
      json = JSON.parse(text);
    } catch (_) {
      json = null;
    }

    if (!response.ok) {
      const providerError =
        json?.error ||
        json?.search_metadata?.status ||
        `HTTP ${response.status}`;

      throw new Error(
        `SerpApi: ${providerError}`
      );
    }

    if (!json || typeof json !== "object") {
      throw new Error(
        "SerpApi retornou JSON inválido"
      );
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGoogleUrl({
  keyword,
  gl,
  hl,
  num
}) {
  const url =
    new URL(
      "https://serpapi.com/search.json"
    );

  url.searchParams.set(
    "engine",
    "google"
  );

  url.searchParams.set(
    "q",
    keyword
  );

  url.searchParams.set(
    "gl",
    gl
  );

  url.searchParams.set(
    "hl",
    hl
  );

  url.searchParams.set(
    "google_domain",
    gl === "br"
      ? "google.com.br"
      : "google.com"
  );

  url.searchParams.set(
    "num",
    String(num)
  );

  // Let SerpApi use its normal cache.
  url.searchParams.set(
    "no_cache",
    "false"
  );

  url.searchParams.set(
    "api_key",
    process.env.SERPAPI_API_KEY
  );

  return url.toString();
}

function buildGoogleVideosUrl({
  keyword,
  gl,
  hl,
  num
}) {
  const url =
    new URL(
      "https://serpapi.com/search.json"
    );

  url.searchParams.set(
    "engine",
    "google_videos"
  );

  url.searchParams.set(
    "q",
    keyword
  );

  url.searchParams.set(
    "gl",
    gl
  );

  url.searchParams.set(
    "hl",
    hl
  );

  url.searchParams.set(
    "google_domain",
    gl === "br"
      ? "google.com.br"
      : "google.com"
  );

  url.searchParams.set(
    "num",
    String(num)
  );

  url.searchParams.set(
    "no_cache",
    "false"
  );

  url.searchParams.set(
    "api_key",
    process.env.SERPAPI_API_KEY
  );

  return url.toString();
}

function extractGoogleResults(payload) {
  const results = [];

  const organic =
    Array.isArray(
      payload?.organic_results
    )
      ? payload.organic_results
      : [];

  organic.forEach(
    (item, index) => {
      results.push(
        normalizeGoogleResult(
          item,
          "google_organic",
          index + 1
        )
      );
    }
  );

  const videos =
    Array.isArray(
      payload?.video_results
    )
      ? payload.video_results
      : [];

  videos.forEach(
    (item, index) => {
      results.push(
        normalizeGoogleResult(
          item,
          "google_video",
          index + 1
        )
      );
    }
  );

  return uniqueResults(
    results
  );
}

function extractYoutubeResults(payload) {
  const output = [];

  const videoResults =
    Array.isArray(
      payload?.video_results
    )
      ? payload.video_results
      : [];

  videoResults.forEach(
    (item, index) => {
      const result =
        normalizeGoogleResult(
          item,
          "google_video",
          index + 1
        );

      if (
        isYoutubeUrl(result.url)
      ) {
        output.push(result);
      }
    }
  );

  const organic =
    Array.isArray(
      payload?.organic_results
    )
      ? payload.organic_results
      : [];

  organic.forEach(
    (item, index) => {
      const result =
        normalizeGoogleResult(
          item,
          "google_organic",
          index + 1
        );

      if (
        isYoutubeUrl(result.url)
      ) {
        output.push(result);
      }
    }
  );

  return uniqueResults(
    output
  );
}

export default async function handler(
  req,
  res
) {
  const origin =
    req.headers.origin || "*";

  setCors(res, origin);

  if (
    req.method === "OPTIONS"
  ) {
    return res.status(200).end();
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

  if (
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  if (
    !process.env.SERPAPI_API_KEY
  ) {
    return res.status(500).json({
      success: false,
      error: "serpapi_not_configured",
      message:
        "Configure SERPAPI_API_KEY na Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const keyword =
      String(
        body?.keyword || ""
      ).trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: "keyword_required"
      });
    }

    const gl =
      String(
        body?.gl ||
        body?.geo ||
        "br"
      )
        .trim()
        .toLowerCase();

    const hl =
      String(
        body?.hl ||
        "pt-BR"
      ).trim();

    const num = Math.min(
      20,
      Math.max(
        10,
        Number(body?.num) || 20
      )
    );

    global.tubexGoogleSerpCache =
      global.tubexGoogleSerpCache ||
      {};

    const cacheKey =
      CACHE_VERSION + ":" + JSON.stringify({
        keyword: normalizeText(keyword),
        gl,
        hl,
        num
      });

    const cached =
      global.tubexGoogleSerpCache[
        cacheKey
      ];

    if (
      cached &&
      cached.expires > Date.now()
    ) {
      return res.status(200).json(
        cached.data
      );
    }

    // --------------------------------------------------------
    // 1. Google Search real
    // --------------------------------------------------------

    const googlePayload =
      await fetchJson(
        buildGoogleUrl({
          keyword,
          gl,
          hl,
          num
        })
      );

    let googleResults =
      extractGoogleResults(
        googlePayload
      );

    let youtubeResults =
      extractYoutubeResults(
        googlePayload
      );

    // --------------------------------------------------------
    // 2. If Google Search did not expose a YouTube video
    //    result, use Google's video-results endpoint.
    //
    // This is still Google SERP data, not YouTube Data API.
    // --------------------------------------------------------

    if (
      youtubeResults.length === 0
    ) {
      try {
        const videoPayload =
          await fetchJson(
            buildGoogleVideosUrl({
              keyword,
              gl,
              hl,
              num
            })
          );

        const fallbackYoutube =
          extractYoutubeResults(
            videoPayload
          );

        if (
          fallbackYoutube.length
        ) {
          youtubeResults =
            fallbackYoutube;

          googleResults =
            uniqueResults([
              ...googleResults,
              ...fallbackYoutube
            ]);
        }
      } catch (videoError) {
        console.warn(
          "[TubeX SERP] Google Videos fallback failed:",
          videoError?.message ||
            videoError
        );
      }
    }

    const appearing =
      youtubeResults.length > 0;

    const firstYoutube =
      youtubeResults[0] || null;

    const result = {
      success: true,

      provider: "SerpApi",
      engine: "google",

      keyword,

      verified: true,
      appearing,

      // Explicit fields consumed by TubeX frontend.
      googleSearch: {
        verified: true,
        appearing,

        source: "SerpApi / Google Search",

        provider: "SerpApi",

        checkedAt:
          new Date().toISOString(),

        resultCount:
          youtubeResults.length,

        youtubeResults:
          youtubeResults.length,

        position:
          firstYoutube?.position ??
          null,

        rank:
          firstYoutube?.position ??
          null,

        results:
          googleResults.length
      },

      totalResults:
        Number(
          googlePayload?.search_information
            ?.total_results
        ) || null,

      // All Google results returned to TubeX.
      results:
        googleResults.slice(
          0,
          num
        ),

      // Only YouTube results found inside
      // Google's result surface.
      youtubeResults:
        youtubeResults.slice(
          0,
          num
        ),

      // Convenient aliases for older frontend builds.
      googleResults:
        googleResults.slice(
          0,
          num
        ),

      hasYoutube:
        appearing
    };

    global.tubexGoogleSerpCache[
      cacheKey
    ] = {
      expires:
        Date.now() +
        CACHE_TTL_MS,
      data: result
    };

    return res.status(200).json(
      result
    );

  } catch (error) {
    console.error(
      "[TubeX SERP] error:",
      error?.message ||
        error
    );

    return res.status(502).json({
      success: false,
      error: "serp_provider_error",
      message:
        "Não foi possível consultar o Google agora.",
      provider:
        "SerpApi"
    });
  }
}

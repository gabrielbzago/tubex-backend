/**
 * TubeX — Google Search signal
 *
 * Vercel route: /api/google-search
 *
 * Purpose:
 *   Verify, without inventing metrics, whether a Google web search
 *   exposes YouTube video results for the requested keyword.
 *
 * The endpoint intentionally returns "appearing: null" when Google
 * blocks/changes the response format. That means "not verified",
 * not "no".
 */

const CACHE_TTL = 15 * 60 * 1000;
const cache =
  globalThis.__tubexGoogleSearchCache ||
  (globalThis.__tubexGoogleSearchCache = new Map());

function cleanKeyword(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractYoutubeLinks(html) {

  const text = decodeHtml(html);
  const found = new Set();

  const patterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^"'&<>\\\s]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[^"'&<>\\\s]+/gi,
    /https?:\/\/youtu\.be\/[^"'&<>\\\s]+/gi
  ];

  patterns.forEach(pattern => {
    for (const match of text.matchAll(pattern)) {
      try {
        const url = decodeURIComponent(match[0])
          .replace(/\\u003d/g, "=")
          .replace(/\\u0026/g, "&");

        const id =
          url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1] ||
          url.match(/\/shorts\/([A-Za-z0-9_-]{6,})/)?.[1] ||
          url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)?.[1];

        if (id) found.add(id);
      } catch {}
    }
  });

  return [...found];
}

function looksLikeVideoSection(html) {

  const text = decodeHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  return (
    /(?:vídeos|videos|video)/i.test(text) &&
    /youtube\.com|youtu\.be/i.test(html)
  );
}

async function requestGoogle(keyword) {

  const url =
    "https://www.google.com/search" +
    "?hl=pt-BR" +
    "&gl=BR" +
    "&num=20" +
    "&q=" +
    encodeURIComponent(keyword);

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/151.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.7",
      "Cache-Control": "no-cache"
    }
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`Google Search HTTP ${response.status}`);
  }

  return { html, url };
}

export default async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    req.headers.origin || "*"
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

    const cacheKey =
      keyword.toLowerCase();

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

    const result =
      await requestGoogle(keyword);

    const youtubeIds =
      extractYoutubeLinks(result.html);

    const appearing =
      youtubeIds.length >= 2 &&
      looksLikeVideoSection(result.html);

    const data = {
      success: true,
      source: "google_search",
      keyword,
      googleSearch: {
        appearing,
        youtubeCarousel: appearing,
        verified: true,
        matchedYoutubeResults: youtubeIds.length,
        checkedAt: new Date().toISOString(),
        url: result.url
      }
    };

    cache.set(
      cacheKey,
      {
        expires: Date.now() + CACHE_TTL,
        data
      }
    );

    return res.status(200).json(data);

  } catch (error) {

    console.error(
      "[TubeX] Google Search error:",
      error
    );

    // "Not verified" is deliberately represented by null,
    // never by false, because an HTTP/Google failure is not
    // evidence that YouTube is absent from Google.
    return res.status(200).json({
      success: true,
      source: "google_search",
      googleSearch: {
        appearing: null,
        youtubeCarousel: null,
        checkedAt: new Date().toISOString(),
        error:
          error?.message ||
          "google_search_failed"
      }
    });
  }
}

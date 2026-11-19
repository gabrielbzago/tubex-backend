
// =========================================================
// 🔎 KEYWORD SEARCH INTEREST — FREE / TRANSPARENT MODE
// No paid DataForSEO or Zyla provider is called. Absolute search counts
// are not exposed by the public YouTube Data API or Google Trends.
// Relative 0–100 time series are served by the separate /api/trends route.
// =========================================================
async function tubexFetchKeywordVolume(keyword) {
  const query = String(keyword || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!query) return { success: false, keyword: query, google: null, youtube: null };
  const unavailable = (provider, note) => ({
    available: false,
    provider,
    monthlySearches: null,
    averageMonthlySearches: null,
    latestMonthSearches: null,
    period: "not_available_from_free_public_source",
    note
  });
  return {
    success: true,
    keyword: query,
    periodDays: 30,
    google: unavailable("google_trends", "O Google Trends fornece índice relativo de interesse (0–100), não quantidade absoluta de pesquisas."),
    youtube: unavailable("youtube_data_api", "A API pública do YouTube não fornece contagem de pesquisas por palavra-chave. Use o índice do Google Trends filtrado para YouTube Search."),
    hasAnyProvider: false,
    disclaimer: "Nenhum volume absoluto foi inventado. Consulte os índices reais do Google Trends nas abas Google e YouTube, separadamente."
  };
}

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



async function fetchGoogleVerification(keyword) {
  if (!process.env.SERPAPI_API_KEY) {
    return {
      verified: false,
      appearing: null,
      error: "serpapi_not_configured",
      checkedAt: new Date().toISOString()
    };
  }

  const normalizeYoutubeUrl = value => String(value || "").toLowerCase().includes("youtube.com/") || String(value || "").toLowerCase().includes("youtu.be/");

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", keyword);
    url.searchParams.set("gl", "br");
    url.searchParams.set("hl", "pt-BR");
    url.searchParams.set("google_domain", "google.com.br");
    url.searchParams.set("num", "20");
    url.searchParams.set("no_cache", "false");
    url.searchParams.set("api_key", process.env.SERPAPI_API_KEY);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let payload;
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "TubeX/1.0" },
        signal: controller.signal
      });
      const text = await response.text();
      payload = JSON.parse(text);
      if (!response.ok) throw new Error(payload?.error || `SerpApi HTTP ${response.status}`);
    } finally {
      clearTimeout(timer);
    }

    let youtube = [];
    const organic = Array.isArray(payload?.organic_results) ? payload.organic_results : [];
    const videos = Array.isArray(payload?.video_results) ? payload.video_results : [];
    [...videos, ...organic].forEach((item, index) => {
      const link = item?.link || item?.url || item?.original_link || "";
      if (normalizeYoutubeUrl(link)) {
        youtube.push({
          position: Number(item?.position ?? item?.position_on_page ?? index + 1),
          title: String(item?.title || item?.name || "").trim(),
          url: String(link).trim()
        });
      }
    });

    const unique = [];
    const seen = new Set();
    for (const item of youtube) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    return {
      verified: true,
      appearing: unique.length > 0,
      source: "SerpApi / Google Search",
      provider: "SerpApi",
      checkedAt: new Date().toISOString(),
      resultCount: unique.length,
      youtubeResults: unique.length,
      position: unique[0]?.position ?? null,
      rank: unique[0]?.position ?? null,
      results: unique
    };
  } catch (error) {
    console.warn("[TubeX] Google verification failed:", error?.message || error);
    return {
      verified: false,
      appearing: null,
      error: "google_search_unavailable",
      message: String(error?.message || error || "Google Search indisponível").slice(0, 180),
      checkedAt: new Date().toISOString()
    };
  }
}

  try {

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;
const accessToken =
    body?.accessToken || "";

    const keyword = body?.keyword?.trim();
    const mode = body?.mode || "seo";
    const videoId = body?.videoId;


    // =========================================================
    // 🔒 ISOLATED DASHBOARD METRIC — ENGAGED VIEWS
    // This branch runs BEFORE the SEO pipeline and therefore does
    // not alter Keyword Explorer, search volume, competition,
    // related keywords, caching, or any existing SEO response.
    // =========================================================
    if (mode === "engaged_views") {
      const token = String(accessToken || "").trim();
      const target = body?.target === "channel" ? "channel" : "video";
      const requestedDays = Number(body?.days);
      const days = [7, 28, 30].includes(requestedDays) ? requestedDays : 28;

      if (!token) {
        return res.status(200).json({
          success: false,
          error: "analytics_auth_required",
          engagedViews: null,
          target
        });
      }

      // Resolve the YouTube Data API key locally inside this isolated branch.
      // IMPORTANT: activeKey is declared later in the SEO pipeline, so referencing
      // it here would trigger a Temporal Dead Zone ReferenceError and make the
      // engaged_views endpoint return no data.
      const apiKey = String(process.env.YOUTUBE_API_KEY || "")
        .split(",")[0]
        .trim();
      const dateAtStartOfDay = offsetDays => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - Number(offsetDays || 0));
        return d.toISOString().slice(0, 10);
      };

      const queryAnalytics = async ({ startDate, endDate, dimensions = "", filters = "" }) => {
        const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
        url.searchParams.set("ids", "channel==MINE");
        url.searchParams.set("startDate", startDate);
        url.searchParams.set("endDate", endDate);
        url.searchParams.set("metrics", "views,engagedViews");
        if (dimensions) url.searchParams.set("dimensions", dimensions);
        if (filters) url.searchParams.set("filters", filters);
        if (dimensions === "day") url.searchParams.set("sort", "day");

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });

        const text = await response.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch {}

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

      let videoId = String(body?.videoId || "").trim();
      let startDate = target === "channel" ? dateAtStartOfDay(days) : dateAtStartOfDay(30);

      // For video metrics we try to preserve lifetime semantics by resolving
      // the video's publication date. If it cannot be resolved, 30 days is
      // used as a safe fallback.
      if (target === "video") {
        if (!videoId) {
          return res.status(200).json({
            success: false,
            error: "video_id_required",
            engagedViews: null,
            target
          });
        }

        if (apiKey) {
          try {
            const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
            videoUrl.searchParams.set("part", "snippet");
            videoUrl.searchParams.set("id", videoId);
            videoUrl.searchParams.set("key", apiKey);

            const videoResponse = await fetch(videoUrl.toString());
            const videoJson = await videoResponse.json().catch(() => ({}));
            const publishedAt = videoJson?.items?.[0]?.snippet?.publishedAt;
            if (publishedAt) startDate = new Date(publishedAt).toISOString().slice(0, 10);
          } catch (e) {
            console.warn("[TubeX] engagedViews publication lookup failed:", e?.message || e);
          }
        }
      }

      // Analytics can lag recent dates. Use yesterday first and two days ago
      // as a fallback without changing any existing SEO behavior.
      const endDates = [dateAtStartOfDay(1), dateAtStartOfDay(2)];
      let lastError = null;

      for (const endDate of endDates) {
        if (endDate < startDate) continue;

        try {
          // Keep video and channel scopes separate. For a video request,
          // include the video dimension and verify every returned row belongs
          // to the requested video before summing any metric.
          const data = await queryAnalytics({
            startDate,
            endDate,
            dimensions: target === "video" ? "video,day" : "day",
            filters: target === "video" ? `video==${videoId}` : ""
          });

          const headers = Array.isArray(data?.columnHeaders)
            ? data.columnHeaders.map(x => String(x?.name || ""))
            : [];
          const rows = Array.isArray(data?.rows) ? data.rows : [];
          const videoIndex = headers.indexOf("video");
          const engagedIndex = headers.indexOf("engagedViews");
          const viewsIndex = headers.indexOf("views");

          const scopedRows = target === "video"
            ? rows.filter(row => videoIndex >= 0 && String(row?.[videoIndex] || "") === videoId)
            : rows;

          if (scopedRows.length && engagedIndex >= 0 && viewsIndex >= 0) {
            const engagedViews = scopedRows.reduce(
              (sum, row) => sum + Number(row[engagedIndex] || 0), 0
            );
            const views = scopedRows.reduce(
              (sum, row) => sum + Number(row[viewsIndex] || 0), 0
            );

            // Analytics metrics can have slightly different definitions, but
            // engaged views should not be allowed to exceed the same report's
            // views by an implausible amount. Return unavailable instead of
            // displaying a potentially mismatched/aggregate value.
            if (
              Number.isFinite(engagedViews) &&
              Number.isFinite(views) &&
              engagedViews >= 0 &&
              views >= 0 &&
              (target !== "video" || engagedViews <= views)
            ) {
              return res.status(200).json({
                success: true,
                engagedViews,
                views,
                target,
                videoId: target === "video" ? videoId : undefined,
                days: target === "channel" ? days : undefined,
                startDate,
                endDate,
                source: "youtube-analytics-api",
                scopeVerified: target === "video"
              });
            }

            console.warn("[TubeX] engagedViews rejected inconsistent metrics", {
              target, videoId, views, engagedViews, startDate, endDate
            });
          }

          // IMPORTANT: do not use a dimensionless fallback for video requests.
          // A response without a video dimension cannot be verified as belonging
          // to the requested video. Channel-level requests may safely retry
          // without dimensions because their scope is the whole channel.
          if (target === "channel") {
            const exact = await queryAnalytics({ startDate, endDate });
            const exactHeaders = Array.isArray(exact?.columnHeaders)
              ? exact.columnHeaders.map(x => String(x?.name || ""))
              : [];
            const first = Array.isArray(exact?.rows) ? exact.rows[0] : null;
            const exactEngagedIndex = exactHeaders.indexOf("engagedViews");
            const exactViewsIndex = exactHeaders.indexOf("views");

            if (first && exactEngagedIndex >= 0 && exactViewsIndex >= 0) {
              return res.status(200).json({
                success: true,
                engagedViews: Number(first[exactEngagedIndex] || 0),
                views: Number(first[exactViewsIndex] || 0),
                target,
                days,
                startDate,
                endDate,
                source: "youtube-analytics-api",
                scopeVerified: true
              });
            }
          }
        } catch (error) {
          lastError = error;
          console.warn("[TubeX] engagedViews analytics:", error?.message || error);
          if (error?.status === 401 || error?.status === 403) break;
        }
      }

      return res.status(200).json({
        success: false,
        error: lastError?.message || "engaged_views_unavailable",
        engagedViews: null,
        target,
        videoId: target === "video" ? videoId : undefined,
        days: target === "channel" ? days : undefined
      });
    }

    if (

    mode === "video_ai"

    &&

    !videoId

){

    return res.status(400).json({

        success:false,

        error:"videoId_required"

    });

}

if(

    mode !== "video_ai"

    &&

    !keyword

){

    return res.status(400).json({

        success:false,

        error:"keyword_required"

    });

}

    // =========================
    // 📦 CACHE SEO
    // =========================
    global.tubexSeoCache = global.tubexSeoCache || {};
    global.tubexChannelCache = global.tubexChannelCache || {};

    const normalizedPlan = String(body?.plan || "free").toLowerCase();
    const cachePlan = normalizedPlan === "owner" ? "expert" : normalizedPlan;
    const cacheKey = keyword ? `seo_v7_contextual_related_${cachePlan}_${keyword.toLowerCase()}` : null;

    // O cache SEO só pode atender ao modo SEO padrão.
    // Modos isolados (tags, keyword_insights etc.) nunca devem receber
    // acidentalmente um payload de outro modo para a mesma palavra-chave.
    if (cacheKey && mode === "seo") {
      const cached = global.tubexSeoCache[cacheKey];

      if (cached && cached.expires > Date.now()) {
        console.log("⚡ CACHE HIT SEO:", keyword);
        return res.status(200).json(cached.data);
      }
    }

    // =========================
    // 🔑 SINGLE YOUTUBE API KEY
    // =========================
    // Production uses exactly one credential/project.
    // Any additional comma-separated values are intentionally ignored.
    const activeKey = String(process.env.YOUTUBE_API_KEY || "")
      .split(",")[0]
      .trim();


    // =========================================================
    // 🔎 KEYWORD VOLUME — independent provider lookup
    // =========================================================
    if (mode === "keyword_volume") {
      const query = String(body?.keyword || "").trim().slice(0, 80);
      if (!query) return res.status(400).json({ success: false, error: "keyword_required" });
      const volume = await tubexFetchKeywordVolume(query);
      return res.status(200).json({ ...volume, mode: "keyword_volume" });
    }

    // =========================================================
    // 📊 KEYWORD INSIGHTS — uploads recentes e total estimado
    // Fonte: YouTube Data API oficial, usando a mesma YOUTUBE_API_KEY
    // do backend. Não depende de OAuth da extensão.
    // =========================================================
    if (mode === "keyword_insights") {
      const query = String(body?.keyword || "").trim().slice(0, 180);
      const normalizeInsight = value => String(value || "")
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ").trim();

      const stop = new Set([
        "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos",
        "em","no","na","nos","nas","para","por","com","sem","e","ou","que",
        "se","como","mais","menos","sobre","entre","video","videos","youtube",
        "canal","oficial"
      ]);
      const anchors = normalizeInsight(query).split(" ").filter(w => w.length > 2 && !stop.has(w));
      if (!anchors.length) {
        return res.status(200).json({
          success: false, mode: "keyword_insights", error: "query_too_generic",
          message: "Pesquisa muito ampla. Informe um assunto ou nicho mais específico.",
          totalResults: 0, recentVideos: []
        });
      }

      global.tubexKeywordInsightsCache = global.tubexKeywordInsightsCache || {};
      const insightCacheKey = "v1_" + normalizeInsight(query);
      const cachedInsight = global.tubexKeywordInsightsCache[insightCacheKey];
      if (cachedInsight && cachedInsight.expires > Date.now()) {
        return res.status(200).json({ ...cachedInsight.data, cached: true });
      }

      if (!activeKey) {
        return res.status(200).json({
          success: false, mode: "keyword_insights", error: "youtube_api_unavailable",
          message: "A chave da YouTube Data API não está configurada.",
          totalResults: 0, recentVideos: []
        });
      }

      // Variações semânticas restritas ao mesmo assunto. O totalResults
      // permanece o estimado da consulta original; não somamos estimativas
      // de consultas diferentes, pois haveria duplicidade.
      const synonymMap = {
        capa: ["capas","thumbnail","thumbnails","thumb","miniatura","miniaturas"],
        capas: ["capa","thumbnail","thumbnails","thumb","miniatura","miniaturas"],
        thumbnail: ["thumbnails","thumb","capa","capas","miniatura"],
        thumbnails: ["thumbnail","thumb","capa","capas","miniatura"],
        montar: ["criar","fazer","produzir"],
        criar: ["montar","fazer","produzir"],
        fazer: ["criar","montar","produzir"],
        coleiro: ["coleirinho","papa","capim"],
        coleirinho: ["coleiro","papa","capim"],
        papa: ["coleiro","coleirinho"],
        capim: ["coleiro","coleirinho"]
      };
      const relatedAnchors = new Set(anchors);
      anchors.forEach(word => (synonymMap[word] || []).forEach(term => relatedAnchors.add(term)));

      const publishedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("order", "date");
      searchUrl.searchParams.set("maxResults", "50");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("publishedAfter", publishedAfter);
      searchUrl.searchParams.set("relevanceLanguage", "pt");
      searchUrl.searchParams.set("regionCode", "BR");
      searchUrl.searchParams.set("key", activeKey);

      const insightResponse = await fetch(searchUrl.toString());
      const insightPayload = await insightResponse.json().catch(() => ({}));
      if (!insightResponse.ok || insightPayload?.error) {
        const apiMessage = insightPayload?.error?.message || `youtube_insights_http_${insightResponse.status}`;
        console.warn("[TubeX] keyword_insights API:", apiMessage);
        return res.status(200).json({
          success: false, mode: "keyword_insights", error: "youtube_api_error",
          message: apiMessage, totalResults: 0, recentVideos: []
        });
      }

      const recentVideos = (Array.isArray(insightPayload.items) ? insightPayload.items : [])
        .map(item => {
          const snippet = item?.snippet || {};
          const videoId = String(item?.id?.videoId || "");
          const title = String(snippet.title || "");
          const description = String(snippet.description || "");
          const normalizedText = normalizeInsight(`${title} ${description}`);
          const words = normalizedText.split(" ").filter(Boolean);
          const matches = [...relatedAnchors].filter(term =>
            words.some(word => word === term ||
              (term.length >= 5 && word.length >= 5 && (word.startsWith(term) || term.startsWith(word))))
          );
          const relevance = Math.round(Math.min(1, matches.length / Math.max(1, anchors.length)) * 100);
          return {
            videoId,
            title,
            channelTitle: String(snippet.channelTitle || ""),
            publishedAt: String(snippet.publishedAt || ""),
            thumbnail: String(snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || ""),
            relevance
          };
        })
        .filter(video => video.videoId && video.relevance > 0)
        .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));

      const keywordVolume = await tubexFetchKeywordVolume(query);
      const insightData = {
        success: true,
        mode: "keyword_insights",
        keywordVolume,
        keyword: query,
        totalResults: Number(insightPayload?.pageInfo?.totalResults || 0),
        totalResultsIsEstimate: true,
        sampleSize: Array.isArray(insightPayload.items) ? insightPayload.items.length : 0,
        relevantSampleCount: recentVideos.length,
        recentVideos,
        periodDays: 30,
        source: "youtube_data_api_search"
      };
      global.tubexKeywordInsightsCache[insightCacheKey] = {
        data: insightData,
        expires: Date.now() + 10 * 60 * 1000
      };
      return res.status(200).json(insightData);
    }

    // =========================================================
    // 🏷️ TAG SUGGESTIONS MODE — isolated from the SEO pipeline
    // Uses YouTube Search relevance + public tags + YouTube autocomplete.
    // Independent cache; does not execute volume/competition/Trends/SerpApi.
    // =========================================================
    if (mode === "tag_suggestions") {
      const query = String(body?.keyword || body?.title || "").trim().slice(0, 180);
      if (!query) {
        return res.status(400).json({ success: false, error: "keyword_required", tags: [] });
      }

      global.tubexTagSuggestionsCache = global.tubexTagSuggestionsCache || {};
      const tagCacheKey = "v5_context_" + query.toLocaleLowerCase("pt-BR");
      const cachedTags = global.tubexTagSuggestionsCache[tagCacheKey];
      if (cachedTags && cachedTags.expires > Date.now() && Array.isArray(cachedTags.tags) && cachedTags.tags.length) {
        return res.status(200).json({
          success: true, mode: "tag_suggestions", keyword: query,
          tags: cachedTags.tags, total: cachedTags.tags.length,
          source: cachedTags.source || "youtube_data_api", cached: true
        });
      }

      if (!activeKey) {
        return res.status(200).json({
          success: false, mode: "tag_suggestions", keyword: query,
          tags: [], total: 0, error: "youtube_api_unavailable"
        });
      }

      const normalizeTagText = value => String(value || "").toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();

      // Retira palavras funcionais e termos genéricos. O título completo
      // continua sendo preservado para a busca, mas a relevância é medida
      // pelos conceitos que realmente identificam o assunto.
      const stopwords = new Set([
        "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos",
        "em","no","na","nos","nas","por","para","com","sem","e","ou","que",
        "porque","como","qual","quais","quando","onde","se","sua","seu","suas",
        "seus","isso","esta","este","estas","estes","essas","esses","coisas",
        "simples","maioria","ignora","tres","3","mais","menos","muito","muita",
        "ser","ter","fazer","sobre","ainda","voce","seu","sua","meu","minha",
        "video","videos","oficial","novo","nova","faz","qualquer","hoje","2024","2025","2026"
      ]);
      const genericTerms = new Set([
        "canal","canais","conteudo","criador","criadores","dicas","melhor",
        "melhores","estrategia","estrategias","coisas","segredos","guia"
      ]);
      const canonicalToken = token => {
        let value = normalizeTagText(token);
        // Normalize common Portuguese inflections without an external NLP service.
        if (value.endsWith("ais") && value.length > 5) value = value.slice(0, -3) + "al";
        else if (value.endsWith("oes") && value.length > 5) value = value.slice(0, -3) + "ao";
        else if (value.endsWith("s") && value.length > 4) value = value.slice(0, -1);
        if (/^(cresce|crescer|crescem|cresceu|crescendo|crescimento)$/.test(value)) value = "crescimento";
        if (/^(canal|canais)$/.test(value)) value = "canal";
        if (/^(visualizacao|visualizacoes|views)$/.test(value)) value = "views";
        if (/^(criador|criadores|creator|creators)$/.test(value)) value = "criador";
        return value;
      };
      // Keep meaningful subject nouns such as "canais". The previous code
      // removed generic/domain words and reduced this title to just "cresce",
      // causing autocomplete to return unrelated "massa não cresce" phrases.
      const platformTerms = new Set(["youtube", "video", "canal", "shorts", "seo"]);
      const queryTokens = normalizeTagText(query).split(" ")
        .filter(w => w.length > 2)
        .map(canonicalToken);
      const contextTokens = [...new Set(queryTokens.filter(w => platformTerms.has(w)))];
      const titleTokens = queryTokens.filter(w => !stopwords.has(w) && !platformTerms.has(w));
      // Para buscas curtas compostas apenas por um termo de plataforma
      // (ex.: "youtube"), esse termo passa a ser o próprio conceito-âncora.
      // Assim o endpoint não descarta a consulta antes de buscar no YouTube.
      const coreTokens = [...new Set(titleTokens.length ? titleTokens : contextTokens)];
      const anchorTokens = coreTokens.slice(0, 6);
      // Nunca pesquisar só o substantivo isolado quando a busca original
      // especifica plataforma/formato. Preserva o contexto na SERP.
      const anchorQuery = [...anchorTokens, ...contextTokens].join(" ") || query;
      const queryKey = normalizeTagText(query);
      const topicTerms = coreTokens.some(w => ["titulo", "headline"].includes(w))
        ? new Set(["titulo","headline","viral","virais","chamativo","chamativos","atrativo","atrativos","clickbait","ctr","seo","youtube","video","canal","shorts","monetizar","views","visualizacao","algoritmo","engajamento","retencao","otimizado","otimizacao","modelo","modelos"])
        : coreTokens.some(w => ["capa","thumbnail","thumb","miniatura"].includes(w))
          ? new Set(["capa","thumbnail","thumb","miniatura","youtube","video","canal","shorts","canva","photoshop","design","arte","criativo","criativa","profissional","personalizada","clickbait","viral","imagem"])
          : new Set([...coreTokens, ...contextTokens]);
      const secondaryTopicTerms = new Set([...topicTerms].filter(w => !coreTokens.includes(w)));
      const candidates = new Map();

      const addTag = (raw, rank, source, videoId = "", sourceTitle = "") => {
        const keyword = String(raw || "").trim().replace(/\s+/g, " ");
        const key = normalizeTagText(keyword);
        if (!key || key.length < 3 || key.length > 90 || key === queryKey) return;
        const words = [...new Set(key.split(" ")
          .filter(w => w.length > 2 && !stopwords.has(w))
          .map(canonicalToken))];
        if (!words.length || words.length > 8) return;

        const matchedCore = words.filter(w => coreTokens.includes(w)).length;
        const phraseHasTopicContext =
          words.some(w => secondaryTopicTerms.has(w)) ||
          matchedCore >= 2 ||
          (coreTokens.length === 1 && platformTerms.has(coreTokens[0]) && words.length >= 2);
        const sourceTitleTokens = normalizeTagText(sourceTitle).split(" ").map(canonicalToken);
        const sourceHasPlatformContext = sourceTitleTokens.some(w => contextTokens.includes(w));
        const phraseHasPlatformContext = words.some(w => contextTokens.includes(w));

        const coreCoverage = matchedCore / Math.max(1, Math.min(words.length, 4));
        const titleCoverage = matchedCore / Math.max(1, Math.min(words.length, 5));

        // Uma tag precisa representar o conceito central e o contexto do tema.
        // Em tags públicas, o contexto pode estar no título do vídeo-fonte.
        if (matchedCore === 0 || !phraseHasTopicContext) return;
        if (contextTokens.length && !phraseHasPlatformContext && !sourceHasPlatformContext) return;
        if (source === "youtube_autocomplete" && contextTokens.length && !phraseHasPlatformContext) return;

        const exactPhrase = queryKey.includes(key) || key.includes(queryKey);
        const rankSignal = Math.max(0, 1 - Number(rank || 0) / 50);
        const specificity = Math.min(words.length, 4) / 4;
        const directBonus = matchedCore >= 2 ? 24 : matchedCore === 1 ? 10 : 0;
        const score = Math.min(100, Math.round(
          16 + coreCoverage * 34 + titleCoverage * 12 + directBonus +
          rankSignal * 10 + specificity * 7 + (exactPhrase ? 5 : 0)
        ));

        const old = candidates.get(key) || {
          keyword, scoreTotal: 0, count: 0, bestMatch: 0,
          videoIds: new Set(), sources: new Set()
        };
        old.scoreTotal += score;
        old.count += 1;
        old.bestMatch = Math.max(old.bestMatch || 0, matchedCore);
        if (videoId) old.videoIds.add(videoId);
        old.sources.add(source);
        candidates.set(key, old);
      };

      // Busca em até 3 variações semânticas para ampliar a coleta sem
      // depender de uma única consulta muito restritiva.
      const queryVariants = [...new Set([
        query,        // intenção completa digitada pelo usuário
        anchorQuery   // assunto + contexto de plataforma/formato
      ].map(v => String(v || "").trim()).filter(v => v.length >= 3))].slice(0, 2);

      let youtubeIds = [];
      const rankMap = new Map();
      for (const searchQuery of queryVariants) {
        try {
          const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
          searchUrl.searchParams.set("part", "snippet");
          searchUrl.searchParams.set("type", "video");
          searchUrl.searchParams.set("order", "relevance");
          searchUrl.searchParams.set("maxResults", "50");
          searchUrl.searchParams.set("q", searchQuery);
          searchUrl.searchParams.set("relevanceLanguage", "pt");
          searchUrl.searchParams.set("regionCode", "BR");
          searchUrl.searchParams.set("key", activeKey);
          const searchResponse = await fetch(searchUrl.toString());
          const searchData = await searchResponse.json().catch(() => ({}));
          if (!searchResponse.ok) {
            console.warn("[TubeX] tag search variant failed:", searchQuery,
              searchData?.error?.message || searchResponse.status);
            continue;
          }
          (searchData.items || []).forEach(video => {
            const id = video?.id?.videoId;
            if (id && !rankMap.has(id)) {
              rankMap.set(id, youtubeIds.length);
              youtubeIds.push(id);
            }
          });
        } catch (error) {
          console.warn("[TubeX] tag search variant error:", searchQuery, error?.message || error);
        }
      }

      // videos.list aceita até 50 IDs por chamada. Coletamos as tags públicas
      // de todos os vídeos encontrados nas consultas relevantes.
      for (let i = 0; i < youtubeIds.length; i += 50) {
        try {
          const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
          detailsUrl.searchParams.set("part", "snippet");
          detailsUrl.searchParams.set("id", youtubeIds.slice(i, i + 50).join(","));
          detailsUrl.searchParams.set("key", activeKey);
          const detailsResponse = await fetch(detailsUrl.toString());
          const detailsData = await detailsResponse.json().catch(() => ({}));
          if (!detailsResponse.ok) {
            console.warn("[TubeX] tag details batch failed:", detailsData?.error?.message || detailsResponse.status);
            continue;
          }

          (detailsData.items || []).forEach(video => {
            const rank = rankMap.get(video.id) ?? 149;
            (Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [])
              .forEach(tag => addTag(tag, rank, "public_video_tags", video.id, video?.snippet?.title || ""));
          });
        } catch (error) {
          console.warn("[TubeX] tag details batch error:", error?.message || error);
        }
      }

      // Autocomplete em cada variação amplia as sugestões de pesquisa do YouTube.
      for (const suggestQuery of queryVariants) {
        try {
          const suggestUrl = new URL("https://suggestqueries.google.com/complete/search");
          suggestUrl.searchParams.set("client", "firefox");
          suggestUrl.searchParams.set("ds", "yt");
          suggestUrl.searchParams.set("q", suggestQuery);
          suggestUrl.searchParams.set("hl", "pt-BR");
          suggestUrl.searchParams.set("gl", "BR");
          const suggestResponse = await fetch(suggestUrl.toString(), {
            headers: { Accept: "application/json" }
          });
          if (!suggestResponse.ok) continue;
          const suggestData = await suggestResponse.json();
          (Array.isArray(suggestData?.[1]) ? suggestData[1] : [])
            .forEach((term, index) => addTag(term, index, "youtube_autocomplete"));
        } catch (error) {
          console.warn("[TubeX] tag autocomplete variant failed:", error?.message || error);
        }
      }

      const tags = [...candidates.values()]
        // A title match is enough for a direct suggestion. A broader niche
        // term must recur in at least two independently discovered videos.
        .filter(item => (item.bestMatch || 0) >= 1 || item.videoIds.size >= 2)
        .map(item => {
          const corroboration = Math.min(item.videoIds.size, 8) * 4;
          const sourceBonus = item.sources.size > 1 ? 6 : 0;
          const relevance = Math.round(item.scoreTotal / Math.max(1, item.count));
          const directBonus = (item.bestMatch || 0) >= 2 ? 8 : (item.bestMatch || 0) === 1 ? 3 : 0;
          return {
            keyword: item.keyword,
            // Relative relevance estimate, not YouTube search volume.
            score: Math.max(25, Math.min(96, Math.round(relevance * 0.78 + corroboration + sourceBonus + directBonus))),
            frequency: item.videoIds.size || item.count,
            relevanceLayer: (item.bestMatch || 0) >= 1 ? "title" : "niche",
            source: [...item.sources].join("+")
          };
        })
        .sort((a, b) => {
          if (a.relevanceLayer !== b.relevanceLayer) return a.relevanceLayer === "title" ? -1 : 1;
          return b.score - a.score || b.frequency - a.frequency;
        })
        // Retorna até 150 sugestões relevantes; a inserção continua respeitando
        // o limite real de 500 caracteres imposto pelo YouTube.
        .slice(0, 150);

      const source = tags.some(t => t.source.includes("public_video_tags"))
        ? "youtube_data_api_and_autocomplete"
        : "youtube_autocomplete";
      if (tags.length) {
        global.tubexTagSuggestionsCache[tagCacheKey] = {
          tags, source, expires: Date.now() + 10 * 60 * 1000
        };
      }

      return res.status(200).json({
        success: true, mode: "tag_suggestions", keyword: query,
        tags, total: tags.length, source, cached: false,
        diagnostics: {
          searchVideos: youtubeIds.length,
          searchQueries: queryVariants.length,
          tagsReturned: tags.length,
          publicTagsAvailable: tags.some(t => t.source.includes("public_video_tags"))
        }
      });
    }

    let items = [];
    let success = false;
    let youtubeSearchSucceeded = false;
    let totalResults = 0;

    if (!activeKey) {
      return res.status(200).json({
        success: false,
        items: [],
        volume: 0,
        competition: null,
        error: "youtube_api_unavailable"
      });
    }

    // =========================
    // 🎯 OPTIMIZED SEARCH FETCH
    // =========================
    // Keep the same maximum result coverage while cutting search.list calls:
    // 25 x 6 pages = 150 results (600 quota units)
    // 50 x 3 pages = 150 results (300 quota units)
    // Free remains 50 results in a single call.
    let maxPages = 3;
    if (body?.plan === "free") maxPages = 1;

    try {
      let allIds = [];
      let nextPageToken = "";
      let pageCount = 0;

      while (pageCount < maxPages) {
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&type=video&order=relevance&maxResults=50` +
          `&q=${encodeURIComponent(keyword)}` +
          (nextPageToken ? `&pageToken=${nextPageToken}` : "") +
          `&key=${activeKey}`;

        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json().catch(() => ({}));

        const reason = searchJson?.error?.errors?.[0]?.reason || "";
        if (searchRes.status === 403 || searchRes.status === 429) {
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || searchRes.status === 429) {
            throw new Error("quota_exceeded");
          }
          throw new Error(searchJson?.error?.message || `youtube_search_http_${searchRes.status}`);
        }

        if (!searchRes.ok || searchJson?.error) {
          throw new Error(searchJson?.error?.message || `youtube_search_http_${searchRes.status}`);
        }

        youtubeSearchSucceeded = true;
        if (pageCount === 0) {
          totalResults = Number(searchJson.pageInfo?.totalResults || 0);
        }

        const ids = (searchJson.items || [])
          .map(v => v.id?.videoId)
          .filter(Boolean);

        allIds.push(...ids);
        nextPageToken = searchJson.nextPageToken || "";
        pageCount++;

        if (!nextPageToken) break;
      }

      const uniqueIds = [...new Set(allIds)];

      // videos.list is already inexpensive and supports up to 50 IDs/request.
      for (let i = 0; i < uniqueIds.length; i += 50) {
        const chunk = uniqueIds.slice(i, i + 50).join(",");
        if (!chunk) continue;

        const videosUrl =
          `https://www.googleapis.com/youtube/v3/videos` +
          `?part=snippet,statistics&id=${chunk}&key=${activeKey}`;

        const resVideos = await fetch(videosUrl);
        const jsonVideos = await resVideos.json().catch(() => ({}));

        const reason = jsonVideos?.error?.errors?.[0]?.reason || "";
        if (resVideos.status === 403 || resVideos.status === 429) {
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || resVideos.status === 429) {
            throw new Error("quota_exceeded");
          }
          throw new Error(jsonVideos?.error?.message || `youtube_videos_http_${resVideos.status}`);
        }

        if (!resVideos.ok || jsonVideos?.error) {
          throw new Error(jsonVideos?.error?.message || `youtube_videos_http_${resVideos.status}`);
        }

        if (Array.isArray(jsonVideos.items)) {
          const filtered = jsonVideos.items.filter(v => {
            const title = String(v?.snippet?.title || "").toLowerCase();
            if (title.includes("#shorts")) return false;

            const videoViews = Number(v?.statistics?.viewCount || 0);
            const published = new Date(v?.snippet?.publishedAt).getTime();
            const ageDays = (Date.now() - published) / (1000 * 60 * 60 * 24);

            if (ageDays > 900 && videoViews < 5000) return false;
            return true;
          });

          items.push(...filtered);
        }
      }

      success = true;

    } catch (e) {
      console.warn("[TubeX] YouTube search failed:", e?.message || e);
    }

    if (youtubeSearchSucceeded) success = true;

 // =========================
// 🚫 FALHA TOTAL DA API
// =========================
//
// IMPORTANTE:
// Isso NÃO significa "keyword sem volume".
// Significa que o YouTube API não respondeu
// corretamente após tentar as chaves disponíveis.
//

if (!success) {

    return res.status(200).json({

        success: false,

        items: [],

        volume: 0,

        competition: null,

        error: "youtube_api_unavailable"

    });

}

// =========================
// 🎬 VIDEO DATA
// =========================

if (mode === "video_ai") {

  if (!videoId) {

    return res.status(400).json({
      success: false,
      error: "videoId_required"
    });

  }

console.log("================================");
console.log("VIDEO AI");
console.log("videoId:", videoId);
console.log("accessToken recebido:", !!accessToken);
console.log(
    accessToken
        ? accessToken.substring(0, 25) + "..."
        : "TOKEN NULO"
);
console.log("================================");

  // ======================================
  // VIDEO
  // ======================================

  const videoUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,statistics,contentDetails,status` +
    `&id=${videoId}` +
    `&key=${activeKey}`;

  const videoRes = await fetch(videoUrl);

  const videoJson = await videoRes.json();

  const video = videoJson.items?.[0];

  if (!video) {

    return res.status(404).json({
      success: false,
      error: "video_not_found"
    });

  }

  const snippet =
    video.snippet || {};

  const stats =
    video.statistics || {};

  const details =
    video.contentDetails || {};

  const status =
    video.status || {};

  const published =
    new Date(
      snippet.publishedAt
    ).getTime();

  const ageDays = Math.max(
    1,
    Math.round(
      (Date.now() - published) /
      86400000
    )
  );


// ======================================
// YOUTUBE ANALYTICS
// ======================================

let analytics = {

    ctr: null,

    impressions: null,

    averageViewDuration: null,

    averageViewPercentage: null,

    estimatedMinutesWatched: null,

    views: null

};

console.log("================================");
console.log("ACCESS TOKEN:", !!accessToken);
console.log(
    accessToken
        ? accessToken.substring(0, 20) + "..."
        : "TOKEN NULO"
);
console.log("================================");

console.log("Entrou no bloco Analytics?", !!accessToken);

if (accessToken) {

    console.log(">>> CHAMANDO YOUTUBE ANALYTICS API");

    try {

        const startDate =
            snippet.publishedAt.slice(0, 10);

        const yesterday = new Date();

yesterday.setDate(
    yesterday.getDate() - 1
);

const endDate =
    yesterday
        .toISOString()
        .slice(0, 10);

        const analyticsUrl =

            "https://youtubeanalytics.googleapis.com/v2/reports"

            +

            "?ids=channel==MINE"

            +

            `&startDate=${startDate}`

            +

            `&endDate=${endDate}`

            +

            "&dimensions=video"

            +

            `&filters=video==${video.id}`

            +

            "&metrics=" +

            [

                "views",

                "estimatedMinutesWatched",

                "averageViewDuration",

                "averageViewPercentage"

            ].join(",");

        let analyticsJson = {};

        let row = null;

        // ======================================
        // PRIMEIRA TENTATIVA
        // ======================================

        for (let attempt = 1; attempt <= 2; attempt++) {

            const analyticsRes = await fetch(

                analyticsUrl,

                {

                    headers: {

                        Authorization:

                            `Bearer ${accessToken}`

                    }

                }

            );

            console.log(
                "📡 Analytics Status:",
                analyticsRes.status
            );

            const analyticsText =
                await analyticsRes.text();

            console.log(
                "📡 Analytics Body:",
                analyticsText
            );

            try {

                analyticsJson =
                    JSON.parse(analyticsText);

            }

            catch (e) {

                analyticsJson = {};

            }

            console.log(
                "📊 Analytics JSON:",
                analyticsJson
            );

            row =
                analyticsJson?.rows?.[0];

            if (row) {

                break;

            }

            console.warn(

                `⚠ Analytics vazia. Tentativa ${attempt}/2`

            );

            if (attempt < 2) {

                await new Promise(

                    resolve =>

                        setTimeout(

                            resolve,

                            2500

                        )

                );

            }

        }

        // ======================================
        // SEM DADOS
        // ======================================

if (!row) {

    console.warn(
        "⚠ Analytics ainda não disponível para este vídeo."
    );

}
else {

    analytics = {

        videoId: row[0],

        views:
            Number(row[1] ?? 0),

        estimatedMinutesWatched:
            Number(row[2] ?? 0),

        averageViewDuration:
            Number(row[3] ?? 0),

        averageViewPercentage:
            Number(row[4] ?? -1),

        impressions: null,

        ctr: null

    };

    console.log(
        "✅ Analytics carregada:",
        analytics
    );

}

       }

    catch (e) {

        console.error(

            "❌ Analytics API:",

            e

        );

    }

}

  // Optional additive analytics metric. It is deliberately isolated from
  // the existing VIDEO AI metrics so existing consumers keep the same shape.
  if (accessToken) {
    try {
      const evUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
      evUrl.searchParams.set("ids", "channel==MINE");
      evUrl.searchParams.set("startDate", snippet.publishedAt.slice(0, 10));
      const evEnd = new Date();
      evEnd.setDate(evEnd.getDate() - 1);
      evUrl.searchParams.set("endDate", evEnd.toISOString().slice(0, 10));
      evUrl.searchParams.set("dimensions", "video");
      evUrl.searchParams.set("filters", `video==${video.id}`);
      evUrl.searchParams.set("metrics", "views,engagedViews");

      const evRes = await fetch(evUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const evJson = await evRes.json().catch(() => ({}));
      const headers = Array.isArray(evJson?.columnHeaders)
        ? evJson.columnHeaders.map(x => String(x?.name || ""))
        : [];
      const row = Array.isArray(evJson?.rows) ? evJson.rows[0] : null;
      const engagedIndex = headers.indexOf("engagedViews");

      analytics.engagedViews = row && engagedIndex >= 0
        ? Number(row[engagedIndex] || 0)
        : null;
    } catch {
      analytics.engagedViews = null;
    }
  } else {
    analytics.engagedViews = null;
  }

  // ======================================
  // CHANNEL + LAST VIDEOS
  // ======================================
  // Cache these channel-scoped calls independently from the keyword cache.
  // This prevents every new keyword from spending another search.list call
  // just to rebuild the same channel overview.
  const channelCacheKey = `channel_v2_${snippet.channelId}`;
  const cachedChannel = global.tubexChannelCache[channelCacheKey];

  let channel = cachedChannel?.expires > Date.now() ? cachedChannel.data.channel : null;
  let latestVideos = cachedChannel?.expires > Date.now() ? cachedChannel.data.latestVideos : null;

  if (!channel || !Array.isArray(latestVideos)) {
    const channelUrl =
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=snippet,statistics` +
      `&id=${snippet.channelId}` +
      `&key=${activeKey}`;

    const channelRes = await fetch(channelUrl);
    const channelJson = await channelRes.json().catch(() => ({}));
    if (!channelRes.ok) {
      throw new Error(channelJson?.error?.message || `youtube_channel_http_${channelRes.status}`);
    }

    channel = channelJson.items?.[0] || {};

    const latestSearchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${snippet.channelId}` +
      `&order=date` +
      `&type=video` +
      `&maxResults=12` +
      `&key=${activeKey}`;

    const latestSearchRes = await fetch(latestSearchUrl);
    const latestSearchJson = await latestSearchRes.json().catch(() => ({}));
    if (!latestSearchRes.ok) {
      throw new Error(latestSearchJson?.error?.message || `youtube_latest_search_http_${latestSearchRes.status}`);
    }

    const latestIds = (latestSearchJson.items || [])
      .map(v => v.id?.videoId)
      .filter(Boolean);

    latestVideos = [];

    if (latestIds.length) {
      const latestStatsUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet,statistics` +
        `&id=${latestIds.join(",")}` +
        `&key=${activeKey}`;

      const latestStatsRes = await fetch(latestStatsUrl);
      const latestStatsJson = await latestStatsRes.json().catch(() => ({}));
      if (!latestStatsRes.ok) {
        throw new Error(latestStatsJson?.error?.message || `youtube_latest_videos_http_${latestStatsRes.status}`);
      }

      latestVideos = latestStatsJson.items || [];
    }

    global.tubexChannelCache[channelCacheKey] = {
      data: { channel, latestVideos },
      expires: Date.now() + (15 * 60 * 1000)
    };
  }

  const channelSnippet = channel.snippet || {};
  const channelStats = channel.statistics || {};

  // ======================================
  // CHANNEL AVERAGES
  // ======================================

  const averageViews =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.viewCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  const averageLikes =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.likeCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  const averageComments =
    Math.round(

      latestVideos.reduce(

        (acc, v) =>

          acc +

          Number(
            v.statistics?.commentCount || 0
          ),

        0

      )

      /

      Math.max(
        latestVideos.length,
        1
      )

    );

  // ======================================
  // RESPONSE
  // ======================================

  return res.status(200).json({

    success: true,

    data: {

      // ======================================
      // VIDEO
      // ======================================

      id: video.id,

      title:
        snippet.title || "",

      titleLength:
        (snippet.title || "").length,

      description:
        snippet.description || "",

      descriptionLength:
        (snippet.description || "").length,

      hasDescription:
        (snippet.description || "").trim().length > 0,

      tags:
        snippet.tags || [],

      tagCount:
        snippet.tags?.length || 0,

      hasTags:
        (snippet.tags?.length || 0) > 0,

      categoryId:
        snippet.categoryId || "",

      language:
        snippet.defaultLanguage || "",

      channelId:
        snippet.channelId || "",

      channelTitle:
        snippet.channelTitle || "",

      publishedAt:
        snippet.publishedAt || "",

      publishedYear:
        new Date(
          snippet.publishedAt
        ).getFullYear(),

      thumbnail:

        snippet.thumbnails?.maxres?.url ||

        snippet.thumbnails?.standard?.url ||

        snippet.thumbnails?.high?.url ||

        snippet.thumbnails?.medium?.url ||

        "",

      hasThumbnail:
        !!snippet.thumbnails?.high,

      duration:
        details.duration || "",

      privacy:
        status.privacyStatus || "",

      licensed:
        status.license || "",

      embeddable:
        status.embeddable,

      madeForKids:
        status.madeForKids,

      views:

        Number(
          stats.viewCount || 0
        ),

      likes:

        Number(
          stats.likeCount || 0
        ),

      comments:

        Number(
          stats.commentCount || 0
        ),

      favorites:

        Number(
          stats.favoriteCount || 0
        ),

      ageDays,

      viewsPerDay:

        Math.round(

          Number(
            stats.viewCount || 0
          )

          /

          ageDays

        ),
ctr:
    analytics.ctr ?? 0,

impressions:
    analytics.impressions ?? 0,

averageViewDuration:

analytics.averageViewDuration,

averageViewPercentage:

Number(
    analytics.averageViewPercentage ?? -1
),

estimatedMinutesWatched:

analytics.estimatedMinutesWatched,

engagedViews:

analytics.engagedViews ?? null,

      seo: {

        titleLength:
          (snippet.title || "").length,

        descriptionLength:
          (snippet.description || "").length,

        tagCount:
          snippet.tags?.length || 0,

        keywordDensity: null

      },

      // ======================================
      // CHANNEL
      // ======================================

      channel: {

        id:
          snippet.channelId,

        title:
          channelSnippet.title || "",

        description:
          channelSnippet.description || "",

        customUrl:
          channelSnippet.customUrl || "",

        country:
          channelSnippet.country || "",

        publishedAt:
          channelSnippet.publishedAt || "",

        subscribers:

          Number(
            channelStats.subscriberCount || 0
          ),

        totalViews:

          Number(
            channelStats.viewCount || 0
          ),

        totalVideos:

          Number(
            channelStats.videoCount || 0
          ),

        averageViews,

        averageLikes,

        averageComments

      },

      // ======================================
      // LAST VIDEOS
      // ======================================

      latestVideos:

        latestVideos.map(video=>({

          id:
            video.id,

          title:
            video.snippet?.title || "",

          views:

            Number(
              video.statistics?.viewCount || 0
            ),

          likes:

            Number(
              video.statistics?.likeCount || 0
            ),

          comments:

            Number(
              video.statistics?.commentCount || 0
            ),

          publishedAt:
            video.snippet?.publishedAt || ""

        })),

      // ======================================
      // PERFORMANCE
      // ======================================

      performance: {

        isAboveChannelAverage:

          Number(
            stats.viewCount || 0
          ) > averageViews,

        channelAverageViews:
          averageViews,

        differenceFromAverage:

          Number(
            stats.viewCount || 0
          ) - averageViews,

        percentageOfAverage:

          averageViews > 0

            ? Math.round(

                (
                  Number(
                    stats.viewCount || 0
                  )

                  /

                  averageViews

                ) * 100

              )

            : 0

      },

      // ======================================
      // FLAGS
      // ======================================

      flags: {

        hasDescription:

          (snippet.description || "")
          .trim()
          .length > 0,

        hasTags:

          (snippet.tags?.length || 0) > 0,

        hasThumbnail:

          !!snippet.thumbnails?.high,

        isPublic:

          status.privacyStatus === "public",

        isEmbeddable:

          !!status.embeddable,

        madeForKids:

          !!status.madeForKids

      },

      // ======================================
      // RAW
      // ======================================

      raw: {

        snippet,

        statistics: stats,

        contentDetails: details,

        status

      }

    }

  });

}

    // =========================
    // 📊 SUMMARY MODE
    // =========================
    if (mode === "summary") {

      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(keyword)}&key=${activeKey}`
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
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${activeKey}`
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
    // 📈 MÉTRICAS SEO
    // =========================
    items.sort((a, b) =>
      Number(b.statistics.viewCount || 0) -
      Number(a.statistics.viewCount || 0)
    );


// =========================
// 📅 VÍDEOS DOS ÚLTIMOS 31 DIAS
// =========================

const recentItems = items.filter(video => {

    const published =
        new Date(video.snippet?.publishedAt).getTime();

    const ageDays =
        (Date.now() - published) / 86400000;

    return ageDays <= 31;

});

console.log("================================");
console.log("Vídeos encontrados:", items.length);
console.log("Vídeos últimos 31 dias:", recentItems.length);
console.log("================================");

// =========================
// 📊 ESTATÍSTICAS DA SERP
// =========================

const totalViews = items.reduce((acc, video) => {

    return acc +

        Number(
            video.statistics?.viewCount || 0
        );

}, 0);

const avgViews =

    totalViews /

    Math.max(
        items.length,
        1
    );

const top =

    Number(
        items[0]?.statistics?.viewCount || 0
    );

const median =

    Number(

        items[
            Math.floor(items.length / 2)
        ]?.statistics?.viewCount || 0

    );

// =========================
// 📅 IDADE MÉDIA DOS VÍDEOS
// =========================

const averageAgeDays = Math.round(

    items.reduce((acc, video) => {

        const published =
            new Date(
                video.snippet?.publishedAt
            ).getTime();

        const age =

            (Date.now() - published)

            /

            86400000;

        return acc + age;

    }, 0)

    /

    Math.max(items.length, 1)

);

// =========================
// 🚀 VIEWS POR DIA (31 DIAS)
// =========================

// Usa apenas vídeos recentes quando existirem.
// Caso não existam vídeos dos últimos 31 dias,
// utiliza toda a SERP como fallback.

const velocitySource =
    recentItems.length
        ? recentItems
        : items;

const viewsPerDayList = velocitySource.map(video => {

    const views =
        Number(video.statistics?.viewCount || 0);

    const published =
        new Date(
            video.snippet?.publishedAt
        ).getTime();

    const ageDays =
        Math.max(
            1,
            (Date.now() - published) / 86400000
        );

    return views / ageDays;

});

const averageViewsPerDay = Math.round(

    viewsPerDayList.reduce(
        (acc, value) => acc + value,
        0
    )

    /

    Math.max(
        viewsPerDayList.length,
        1
    )

);

const maxViewsPerDay = Math.round(

    Math.max(
        ...viewsPerDayList,
        0
    )

);




// =========================
// 📊 SCORE DE VIEWS/DIA
// =========================

const viewsPerDayScore = Math.min(

    100,

    Math.round(

        Math.log10(

            averageViewsPerDay + 1

        ) * 18

    )

);

// =========================
// 💪 VÍDEOS FORTES
// =========================

const strongVideos =
(recentItems.length ? recentItems : items)
.filter(video => {

    const views = Number(
        video.statistics?.viewCount || 0
    );

    const published = new Date(
        video.snippet?.publishedAt
    ).getTime();

    const ageDays = Math.max(
        1,
        (Date.now() - published) / 86400000
    );

    const viewsPerDay = views / ageDays;

    return (
        views >= median &&
        viewsPerDay >= averageViewsPerDay
    );

}).length;


let viralVideos=0;

velocitySource.forEach(video=>{

const views=
Number(video.statistics.viewCount||0);

const age=Math.max(

1,

(Date.now()-new Date(video.snippet.publishedAt))/86400000

);

const velocity=views/age;

if(velocity>=100000){

viralVideos++;

}

});

const viralScore=Math.round(

viralVideos/

Math.max(velocitySource.length,1)

*100

);

// =========================
// 💪 SCORE DE VÍDEOS FORTES
// =========================

const strongVideosScore = Math.min(

    100,

    Math.round(

        (

            strongVideos /

            Math.max(items.length, 1)

        ) * 100

    )

);

// =========================
// 📈 DESVIO PADRÃO DAS VIEWS
// =========================

const variance = items.reduce((acc, video) => {

    const views =
        Number(video.statistics?.viewCount || 0);

    return acc + Math.pow(
        views - avgViews,
        2
    );

}, 0) / Math.max(items.length, 1);

const standardDeviation =
    Math.sqrt(variance);

// =========================
// 📊 COEFICIENTE DE VARIAÇÃO
// =========================

const coefficientVariation =
    avgViews > 0
        ? standardDeviation / avgViews
        : 0;


// =========================
// 📊 CONSISTÊNCIA DA SERP
// =========================

const consistencyScore = Math.max(

    0,

    Math.min(

        100,

        Math.round(

            100 -

            (coefficientVariation * 35)

        )

    )

);


// =========================
// 📊 VIEW DISTRIBUTION SCORE
// =========================

// Soma total de views

const totalViewCount =
    items.reduce(

        (acc, video)=>

            acc +

            Number(
                video.statistics?.viewCount || 0
            ),

        0

    );

// Top 20% dos vídeos

const topVideos =

    items.slice(

        0,

        Math.max(
            1,
            Math.ceil(items.length * 0.20)
        )

    );

// Views concentradas no topo

const topViews =

    topVideos.reduce(

        (acc, video)=>

            acc +

            Number(
                video.statistics?.viewCount || 0
            ),

        0

    );

// Percentual concentrado

const topShare =

    totalViewCount > 0

        ? topViews / totalViewCount

        : 1;

// Score

const distributionScore = Math.round(

    Math.max(

        0,

        Math.min(

            100,

            100 -

            ((topShare - 0.20) * 125)

        )

    )

);


// =========================
// 🔍 KEYWORD SCORE
// =========================

const keywordWords =
    keyword
        .toLowerCase()
        .trim()
        .split(/\s+/);

const keywordWordCount =
    keywordWords.length;

let keywordScore = 50;

// Long Tail
if (keywordWordCount >= 4)
    keywordScore += 15;

// Muito específica
if (keywordWordCount >= 6)
    keywordScore += 10;

// Ano
if (/(2025|2026|2027)/.test(keyword))
    keywordScore += 10;

// Pergunta
if (/^(como|how|what|qual|porque|why)/i.test(keyword))
    keywordScore += 8;

// Muito curta costuma ser extremamente concorrida
if (keywordWordCount === 1)
    keywordScore -= 20;

if (keywordWordCount === 2)
    keywordScore -= 10;

keywordScore = Math.max(
    10,
    Math.min(
        100,
        keywordScore
    )
);


// =========================
// MARKET SIZE
// =========================

let marketDifficulty = 0;

if(keywordWordCount === 1){

    marketDifficulty = 100;

}

else if(keywordWordCount === 2){

    marketDifficulty = 85;

}

else if(keywordWordCount === 3){

    marketDifficulty = 65;

}

else if(keywordWordCount === 4){

    marketDifficulty = 45;

}

else if(keywordWordCount === 5){

    marketDifficulty = 30;

}

else{

    marketDifficulty = 15;

}


// =========================
// TOTAL RESULTS SCORE
// =========================

const totalResultsScore = Math.min(

    100,

    Math.round(

        Math.log10(totalResults + 1) * 12

    )

);


// =========================
// 🎯 RELEVANCE SCORE
// Quanto os títulos realmente respondem à busca
// =========================

const normalizedKeyword =
    keyword
        .toLowerCase()
        .trim();

let relevancePoints = 0;

items.forEach(video=>{

    const title =
        String(video.snippet?.title || "")
            .toLowerCase()
            .trim();

    if(title === normalizedKeyword){

        relevancePoints += 5;
        return;

    }

    if(title.startsWith(normalizedKeyword)){

        relevancePoints += 4;
        return;

    }

    if(title.includes(normalizedKeyword)){

        relevancePoints += 3;
        return;

    }

    const matchedWords =
        keywordWords.filter(word=>
            title.includes(word)
        ).length;

    relevancePoints +=
        (matchedWords / keywordWords.length) * 2;

});

const relevanceScore = Math.round(

    Math.min(

        100,

        (relevancePoints /

        (items.length * 5))

        *100

    )

);

// =========================
// 🎯 MATCHES DE TÍTULO
// =========================
//
// Mede quanto a SERP realmente
// responde à keyword pesquisada.
//

let exactTitleMatches = 0;
let prefixTitleMatches = 0;
let phraseTitleMatches = 0;
let partialTitleMatches = 0;

items.forEach(video => {

    const title =
        String(video.snippet?.title || "")
            .toLowerCase()
            .trim();

    if (title === normalizedKeyword) {

        exactTitleMatches++;

    }
    else if (title.startsWith(normalizedKeyword)) {

        prefixTitleMatches++;

    }
    else if (title.includes(normalizedKeyword)) {

        phraseTitleMatches++;

    }
    else {

        const matchedWords =
            keywordWords.filter(word =>
                title.includes(word)
            ).length;

        if (
            matchedWords >=
            Math.ceil(keywordWords.length * 0.5)
        ) {

            partialTitleMatches++;

        }

    }

});

const titleDemandScore = Math.min(
    100,
    Math.round(

        (
            exactTitleMatches * 5 +

            prefixTitleMatches * 4 +

            phraseTitleMatches * 3 +

            partialTitleMatches * 1
        )

        /

        Math.max(items.length * 5, 1)

        * 100

    )
);

// =========================
// 🚀 TUBEX VOLUME SCORE V6
// =========================
//
// Volume = DEMANDA ESTIMADA
//
// Sinais:
//
// 1. Presença da keyword nos títulos
// 2. Mediana da SERP
// 3. Força do líder
// 4. Velocidade
// 5. Vídeos fortes
//
// IMPORTANTE:
// Tamanho da keyword NÃO é
// usado como proxy de volume.
//

// =========================
// 1. FORÇA DO VÍDEO LÍDER
// =========================

const topScore = Math.min(
    100,
    Math.round(
        Math.log10(top + 1) * 16
    )
);


// =========================
// 2. FORÇA DA MEDIANA
// =========================

const medianScore = Math.min(
    100,
    Math.round(
        Math.log10(median + 1) * 16
    )
);


// =========================
// 3. VELOCIDADE
// =========================

const velocityScore = Math.min(
    100,
    Math.round(
        Math.log10(
            averageViewsPerDay + 1
        ) * 20
    )
);


// =========================
// 4. VÍDEOS FORTES
// =========================

const strengthScore = Math.min(
    100,
    Math.round(
        (
            strongVideos /
            Math.max(items.length, 1)
        ) * 100
    )
);


// =========================
// 6. DEMANDA DA SERP
// =========================
//
// A mediana é mais importante
// que apenas o vídeo líder.
//
// Um único vídeo gigante
// não deve transformar uma
// keyword pequena em "Muito Alta".
//

const serpDemandScore = Math.round(

      medianScore * 0.40

    + topScore * 0.20

    + velocityScore * 0.20

    + strengthScore * 0.10

    + titleDemandScore * 0.10

);


// =========================
// 7. VOLUME FINAL
// =========================

const finalVolume = Math.max(
    0,
    Math.min(
        100,
        Math.round(
            serpDemandScore
        )
    )
);

// =========================
// 🚀 TUBEX COMPETITION V7
// =========================
//
// UMA ÚNICA ENGINE DE CONCORRÊNCIA.
//
// A pontuação oficial é finalCompetition.
// competitionScore será apenas um alias desse mesmo valor.
//
// Sinais:
// 1. Match exato
// 2. Match no início do título
// 3. Cobertura da keyword
// 4. Força da SERP
// 5. Freshness ponderado por idade
// 6. Dominância/repetição de canais
// 7. Distribuição/consistência como sinal secundário
// 8. Market difficulty como sinal pequeno
//
// A janela de 31 dias NÃO limita a SERP.
// Ela já é usada para velocidade/demanda.
// Para competição, toda a SERP permanece válida,
// com peso maior para vídeos recentes.

let exactMatches = 0;
let startsWithMatches = 0;
let containsMatches = 0;
let partialMatches = 0;

let freshnessTotal = 0;
let recentVideos = 0;

// -------------------------
// MATCH + FRESHNESS
// -------------------------

items.forEach(video => {

    const title = String(
        video.snippet?.title || ""
    )
        .toLowerCase()
        .trim();

    const publishedAt = new Date(
        video.snippet?.publishedAt
    ).getTime();

    const ageDays = Number.isFinite(publishedAt)
        ? Math.max(
            0,
            (Date.now() - publishedAt) / 86400000
        )
        : 9999;

    // -------------------------
    // MATCH DO TÍTULO
    // -------------------------

    if (title === normalizedKeyword) {

        exactMatches++;

    } else if (title.startsWith(normalizedKeyword)) {

        startsWithMatches++;

    } else if (title.includes(normalizedKeyword)) {

        containsMatches++;

    } else {

        const matchedWords = keywordWords.filter(word =>
            title.includes(word)
        ).length;

        partialMatches +=
            matchedWords /
            Math.max(keywordWords.length, 1);

    }

    // -------------------------
    // FRESHNESS PONDERADO
    // -------------------------
    //
    // Não exclui vídeos antigos.
    // Apenas reduz sua influência.
    //
    // 0-31   = 100
    // 32-90  = 80
    // 91-180 = 60
    // 181-365= 40
    // >365   = 20

    let freshnessWeight = 20;

    if (ageDays <= 31) {

        freshnessWeight = 100;
        recentVideos++;

    } else if (ageDays <= 90) {

        freshnessWeight = 80;

    } else if (ageDays <= 180) {

        freshnessWeight = 60;

    } else if (ageDays <= 365) {

        freshnessWeight = 40;

    }

    freshnessTotal += freshnessWeight;

});

const itemCount = Math.max(items.length, 1);

// -------------------------
// MATCH SCORE
// -------------------------
//
// Cada nível é separado para que:
// - match exato pese mais
// - prefixo pese menos
// - contains seja intermediário
// - parcial tenha peso pequeno
//
// Isso evita transformar "contém a palavra" em
// equivalente a "o título foi feito para aquela busca".

const exactMatchScore = Math.round(
    (exactMatches / itemCount) * 100
);

const prefixMatchScore = Math.round(
    (startsWithMatches / itemCount) * 100
);

const containsMatchScore = Math.round(
    (containsMatches / itemCount) * 100
);

const partialMatchScore = Math.round(
    Math.min(
        100,
        (partialMatches / itemCount) * 100
    )
);

// Cobertura final dos títulos.
// É um sinal importante, mas não domina a competição.

const coverageDifficulty = Math.round(

    exactMatchScore * 0.45 +

    prefixMatchScore * 0.30 +

    containsMatchScore * 0.15 +

    partialMatchScore * 0.10

);

// -------------------------
// FRESHNESS SCORE
// -------------------------

const freshnessDifficulty = Math.round(
    freshnessTotal / itemCount
);

// -------------------------
// DOMINÂNCIA DE CANAIS
// -------------------------
//
// Sem fazer novas chamadas à API, usamos a própria SERP.
// Um canal que ocupa vários resultados indica uma SERP
// mais concentrada e difícil.
//
// Não confundimos isso com autoridade de inscritos,
// porque subscriberCount não está disponível nos objetos
// de pesquisa atuais.

const channelCount = {};

items.forEach(video => {

    const channelId =
        video.snippet?.channelId;

    if (!channelId) return;

    channelCount[channelId] =
        (channelCount[channelId] || 0) + 1;

});

const channelValues =
    Object.values(channelCount);

const biggestChannel = Math.max(
    ...channelValues,
    0
);

const channelDominance = Math.round(

    (
        biggestChannel /
        itemCount
    ) * 100

);

const repeatedChannelVideos =
    channelValues.reduce(
        (total, count) =>
            total + Math.max(count - 1, 0),
        0
    );

const repetitionScore = Math.round(

    (
        repeatedChannelVideos /
        itemCount
    ) * 100

);

// -------------------------
// SERP STRENGTH
// -------------------------
//
// Usa exclusivamente os quatro sinais pedidos:
// - mediana
// - top
// - velocidade
// - vídeos fortes
//
// serpPower é a única variável de força da SERP.

const serpPower = Math.round(

    Math.min(
        100,

        (
            Math.min(
                100,
                Math.round(Math.log10(median + 1) * 14)
            ) * 0.35

            +

            Math.min(
                100,
                Math.round(Math.log10(top + 1) * 14)
            ) * 0.25

            +

            viewsPerDayScore * 0.25

            +

            strongVideosScore * 0.15
        )
    )

);

// -------------------------
// DISTRIBUIÇÃO / CONSISTÊNCIA
// -------------------------
//
// Sinal secundário.
// Não pode dominar a competição.

const serpStructureScore = Math.round(

    distributionScore * 0.50 +

    consistencyScore * 0.50

);

// -------------------------
// MARKET DIFFICULTY
// -------------------------
//
// O marketDifficulty já foi calculado acima.
// Ele é deliberadamente pequeno na fórmula final,
// pois tamanho da keyword sozinho não prova competição.

const marketDifficultyScore = Math.max(

    0,

    Math.min(
        100,
        Number(marketDifficulty) || 0
    )

);

// -------------------------
// 🎯 COMPETITION FINAL V7
// -------------------------
//
// PRIMEIRO calculamos a DIFICULDADE REAL da SERP.
//
// Quanto maior:
// - SERP mais forte
// - mais matches
// - mais vídeos recentes
// - mais domínio de canais
// - mais repetição
//
// = MAIS DIFÍCIL.
//
// Depois fazemos UMA ÚNICA INVERSÃO
// para transformar dificuldade em
// SCORE DE OPORTUNIDADE.
//
// Resultado oficial:
// 100 = baixa competição / ótima oportunidade
// 50  = competição média
// 0   = competição muito alta
//

const finalCompetitionDifficulty = Math.max(
    0,

    Math.min(
        100,

        Math.round(

            serpPower * 0.35 +

            coverageDifficulty * 0.25 +

            freshnessDifficulty * 0.15 +

            channelDominance * 0.10 +

            repetitionScore * 0.05 +

            serpStructureScore * 0.05 +

            marketDifficultyScore * 0.05

        )

    )

);


// -------------------------
// 🔄 INVERSÃO OFICIAL
// -------------------------
//
// Dificuldade alta
//      ↓
// oportunidade baixa
//
// Dificuldade baixa
//      ↓
// oportunidade alta
//
// Exemplo:
//
// dificuldade 90 → competição 10
// dificuldade 70 → competição 30
// dificuldade 50 → competição 50
// dificuldade 30 → competição 70
// dificuldade 10 → competição 90
//

const finalCompetition = Math.max(
    0,

    Math.min(
        100,

        100 - finalCompetitionDifficulty

    )

);


// -------------------------
// 🎯 ALIAS OFICIAL
// -------------------------
//
// Existe UMA única pontuação oficial.
//
// competition
// competitionScore
//
// apontam exatamente para
// finalCompetition.
//
// O frontend continuará recebendo
// o score de oportunidade.
//

const competition = finalCompetition;

const competitionScore = finalCompetition;


// -------------------------
// 📊 DETALHES DA COMPETIÇÃO
// -------------------------
//
// Mantemos os sinais individuais
// disponíveis para o frontend/debug.
//

const competitionDetails = {

    // SCORE OFICIAL
    finalCompetition,

    // DIFICULDADE BRUTA ANTES DA INVERSÃO
    competitionDifficulty:
        finalCompetitionDifficulty,

    // FORÇA DA SERP
    serpPower,

    // COBERTURA DOS TÍTULOS
    coverageDifficulty,

    // FRESHNESS
    freshnessDifficulty,

    // DOMINÂNCIA
    channelDominance,

    // REPETIÇÃO
    repetitionScore,

    // ESTRUTURA DA SERP
    serpStructureScore,

    // MERCADO
    marketDifficulty:
        marketDifficultyScore,

    // MATCHES
    exactMatches,

    startsWithMatches,

    containsMatches,

    partialMatches,

    // SCORES DE MATCH
    exactMatchScore,

    prefixMatchScore,

    containsMatchScore,

    partialMatchScore,

    // VÍDEOS RECENTES
    recentVideos

};

// =========================
// 🧠 UNIVERSAL SEO ENGINE
// =========================

// mapa final
const tagMap = new Map();



function hashString(str){

    let hash = 0;

    for(let i = 0; i < str.length; i++){

        hash =
            str.charCodeAt(i) +
            ((hash << 5) - hash);

    }

    return Math.abs(hash);

}

// ======================================
// GERA HISTÓRICO ESTIMADO (30 DIAS)
// ======================================

function generateEstimatedTrend(volume, competition){

    const seedBase =
        hashString(keyword);

    let seed = seedBase;

    const trend = [];

    // ======================================
    // MÉDIA DE PESQUISAS/DIA
    // ======================================

    const average = Math.round(

        400 +

        Math.pow(volume, 1.35) * 18

    );

    // ======================================
    // DIREÇÃO DA CURVA
    // ======================================

    let tendency = 1;

    // Concorrência BAIXA (ótima)
if(competition >= 70){

    tendency = 1.008;

}

// Concorrência MÉDIA
else if(competition >= 40){

    tendency = 1.000;

}

// Concorrência ALTA (difícil)
else{

    tendency = 0.994;

}


    // ======================================
    // VOLATILIDADE
    // ======================================

   const volatility =
    average * 0.030;

    // começa próximo da média

   let current =

    average *

    (0.90 + ((seed % 20) / 100));

    // ======================================
    // 30 DIAS
    // ======================================

    for(let i = 0; i < 30; i++){

        // random determinístico

        seed =
            (seed * 9301 + 49297) % 233280;

        const random =
            seed / 233280;

        // tendência

current *= tendency;

// perde força conforme sobe

current -=

    (current-average)

    *0.04;


        // pequenas oscilações

        current +=

            Math.round(

                (random - 0.5)

                * volatility

            );

        // limites

        current = Math.max(

            average * 0.60,

            current

        );

        current = Math.min(

            average * 1.60,

            current

        );

        trend.push({

            day: i + 1,

            value: Math.round(current)

        });

    }

    return trend;

}

function normalizeText(text = ""){

  return text

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^\w\s-]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}

// =====================================
// TOKENIZA
// =====================================

function tokenize(text = ""){

  return normalizeText(text)

    .split(" ")

    .filter(word =>

      word.length >= 3

    );

}

// =====================================
// EXTRAI TAGS DO TÍTULO
// =====================================

function extractTitleTags(title = "") {
  const stopwords = new Set([
    "como","para","com","sem","mais","menos","muito","muita","muitos","muitas",
    "de","da","do","das","dos","em","no","na","nos","nas","por","e","ou",
    "que","se","um","uma","uns","umas","the","and","for","with","from"
  ]);
  const words = tokenize(title).filter(word => !stopwords.has(word));
  const tags = new Set();
  if (!words.length) return [];

  // A frase original é preservada como uma tag de cauda longa.
  const fullPhrase = normalizeText(title);
  if (fullPhrase.length >= 4 && fullPhrase.length <= 90) tags.add(fullPhrase);

  // Termos individuais e combinações são criados somente a partir dos
  // conceitos úteis da pesquisa, nunca de preposições/artigos.
  words.forEach(word => tags.add(word));
  for (let i = 0; i < words.length - 1; i++) {
    tags.add(words.slice(i, i + 2).join(" "));
  }
  for (let i = 0; i < words.length - 2; i++) {
    tags.add(words.slice(i, i + 3).join(" "));
  }
  return [...tags];
}

// =====================================
// TAGS DO TÍTULO
// =====================================

const titleTags =
  extractTitleTags(keyword);

// adiciona peso forte
titleTags.forEach(tag => {

  tagMap.set(

    tag,

    (tagMap.get(tag) || 0)

    + 20

  );

});

// =====================================
// API YOUTUBE COMPLEMENTAR
// =====================================

items

  .sort((a,b)=>

    Number(b.statistics?.viewCount || 0)

    -

    Number(a.statistics?.viewCount || 0)

  )

  .slice(0,10)

  .forEach(video => {

    const tags =
      video?.snippet?.tags || [];

    tags.forEach(tag => {

      const normalized =
        normalizeText(tag);

      // tamanho
      if(
        !normalized
        ||
        normalized.length < 3
        ||
        normalized.length > 80
      ){
        return;
      }

      // Relevância contextual por tokens completos, sem substring.
      // A tag precisa corresponder ao conceito central e ao contexto da busca.
      const relevanceStop = new Set([
        "como","para","com","sem","mais","menos","muito","muita","muitos","muitas",
        "de","da","do","das","dos","em","no","na","nos","nas","por","e","ou",
        "que","se","um","uma","uns","umas","fazer","criar","montar","produzir"
      ]);
      const platformTerms = new Set(["youtube","video","canal","shorts","seo"]);
      const canonical = value => {
        let token = normalizeText(value);
        if (token.endsWith("oes") && token.length > 5) token = token.slice(0, -3) + "ao";
        else if (token.endsWith("s") && token.length > 4) token = token.slice(0, -1);
        return token;
      };
      const queryTokens = tokenize(keyword).map(canonical);
      const coreTokens = [...new Set(queryTokens.filter(token =>
        !relevanceStop.has(token) && !platformTerms.has(token)
      ))];
      const contextTokens = [...new Set(queryTokens.filter(token => platformTerms.has(token)))];
      const candidateTokens = [...new Set(tokenize(normalized).map(canonical))];
      const sourceTokens = [
        ...tokenize(video?.snippet?.title || ""),
        ...(Array.isArray(video?.snippet?.tags) ? video.snippet.tags.flatMap(tokenize) : [])
      ].map(canonical);

      const synonymGroups = [
        ["capa","thumbnail","thumb","miniatura"],
        ["titulo","headline"],
        ["coleiro","coleirinho","papa","capim"],
        ["passaro","ave","aves","passaros"],
        ["gaiola","viveiro"]
      ];
      const expandedCore = new Set(coreTokens);
      synonymGroups.forEach(group => {
        if (group.some(term => coreTokens.includes(canonical(term)))) {
          group.forEach(term => expandedCore.add(canonical(term)));
        }
      });

      const matchedCore = candidateTokens.filter(token => expandedCore.has(token));
      const sourceCoreMatches = sourceTokens.filter(token => expandedCore.has(token));
      const hasContext = tokens => !contextTokens.length ||
        contextTokens.some(token => tokens.includes(token));
      const titleTopicTerms = new Set([
        "viral","virais","chamativo","chamativos","atrativo","atrativos",
        "clickbait","ctr","seo","youtube","video","canal","shorts","monetizar",
        "views","visualizacao","algoritmo","engajamento","retencao","busca",
        "pesquisa","otimizado","otimizacao","modelo","modelos"
      ]);
      const coverTopicTerms = new Set([
        "thumbnail","thumb","miniatura","youtube","video","canal","shorts",
        "canva","photoshop","design","arte","criativo","criativa","profissional",
        "personalizada","clickbait","viral","imagem"
      ]);
      const topicTerms = coreTokens.some(token => ["titulo","headline"].includes(token))
        ? titleTopicTerms
        : coreTokens.some(token => ["capa","thumbnail","thumb","miniatura"].includes(token))
          ? coverTopicTerms
          : new Set([...coreTokens, ...contextTokens]);
      const secondaryTopicTerms = new Set([...topicTerms].filter(token => !expandedCore.has(canonical(token))));

      const candidateHasTopic = candidateTokens.some(token => secondaryTopicTerms.has(token));
      const sourceHasContext = hasContext(sourceTokens);
      const candidateHasContext = hasContext(candidateTokens);
      const enoughCore = coreTokens.length >= 2
        ? new Set(sourceCoreMatches).size >= 2
        : sourceCoreMatches.length >= 1;

      const relevance = matchedCore.length >= 1 &&
        (candidateHasTopic || matchedCore.length >= 2) &&
        enoughCore &&
        sourceHasContext &&
        (candidateHasContext || sourceHasContext);

      if (!relevance) return;

      // views
      const views =
        Number(
          video.statistics?.viewCount || 0
        );

      // peso
      const weight =

        Math.max(
          1,
          Math.log10(views + 1)
        );

      tagMap.set(

        normalized,

        (tagMap.get(normalized) || 0)

        +

        weight

      );

    });

  });

// =====================================
// ORDENA
// =====================================

const rankedTags =

  [...tagMap.entries()]

    .sort((a,b)=>

      b[1] - a[1]

    )

    .slice(0,40)

    .map(([keyword,score]) => ({

      keyword,

      score: Math.min(

        99,

        Math.round(
          60 + (score * 2)
        )

      )

    }));
// =========================
// 📊 EXTRA METRICS
// =========================

const averageViews =
  Math.round(avgViews);

const averageLikes =
  Math.round(

    items.reduce(

      (acc,v)=>

        acc +

        Number(
          v.statistics?.likeCount || 0
        ),

      0

    )

    /

    Math.max(items.length,1)

  );

const averageComments =
  Math.round(

    items.reduce(

      (acc,v)=>

        acc +

        Number(
          v.statistics?.commentCount || 0
        ),

      0

    )

    /

    Math.max(items.length,1)

  );

const maxViews =
items.length
? Math.max(
    ...items.map(v =>
      Number(
        v.statistics?.viewCount || 0
      )
    )
  )
: 0;

const minViews =
items.length
? Math.min(
    ...items.map(v =>
      Number(
        v.statistics?.viewCount || 0
      )
    )
  )
: 0;

// =========================
// 🚀 COMPETITION SCORE
// =========================
//
// Não existe cálculo paralelo.
// competitionScore já foi definido como alias
// oficial de finalCompetition na Competition V7.

// =========================
// 🔎 RELATED KEYWORDS ENGINE
// =========================
// Gera oportunidades a partir dos próprios resultados reais da SERP.
// Não usa palavras inventadas por IA nem faz chamadas adicionais para
// cada sugestão (preserva a cota da YouTube Data API).
function buildRelatedKeywords(items, seedKeyword, limit=30) {
    const videos = Array.isArray(items) ? items : [];
    const normalize = value => String(value || "")
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const canonical = word => {
        const value = normalize(word);
        if (value.endsWith("oes") && value.length > 5) return value.slice(0, -3) + "ao";
        if (value.endsWith("ais") && value.length > 5) return value.slice(0, -3) + "al";
        return value.endsWith("s") && value.length > 4 ? value.slice(0, -1) : value;
    };
    const stop = new Set([
        "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos",
        "em","no","na","nos","nas","para","por","com","sem","e","ou","que",
        "se","como","mais","menos","sobre","entre","melhor","melhores","muito",
        "muita","muitos","muitas","fazer","fazendo","feito","criar","criado",
        "montar","produzir","the","and","for","with","from","how","what",
        "this","that","your","you","los","las","con","una","del","here","there"
    ]);
    const platformTerms = new Set(["youtube","video","canal","shorts","seo"]);
    const rawTokens = normalize(seedKeyword).split(" ").filter(Boolean).map(canonical);
    const anchors = [...new Set(rawTokens.filter(token =>
        token.length >= 3 && !stop.has(token) && !platformTerms.has(token)
    ))];
    const contextTerms = [...new Set(rawTokens.filter(token => platformTerms.has(token)))];
    if (!anchors.length || !videos.length) return [];

    const synonymGroups = [
        ["capa","thumbnail","thumb","miniatura"],
        ["coleiro","coleirinho","papa","capim"],
        ["passaro","ave","aves","passaros"],
        ["gaiola","viveiro"],
        ["semente","sementes"],
        ["titulo","headline"]
    ];
    const expandedAnchors = new Set(anchors);
    synonymGroups.forEach(group => {
        if (group.some(term => anchors.includes(canonical(term)))) {
            group.forEach(term => expandedAnchors.add(canonical(term)));
        }
    });

    const titleTopicTerms = new Set([
        "viral","virais","chamativo","chamativos","chamativa","chamativas",
        "atrativo","atrativos","atrativa","atrativas","clique","clickbait",
        "ctr","seo","youtube","video","canal","shorts","monetizar","views",
        "visualizacao","visualizacoes","algoritmo","engajamento","retencao",
        "busca","pesquisa","titulo","titulos","headline","ideia","ideias",
        "otimizado","otimizacao","copiar","modelo","modelos"
    ]);
    const coverTopicTerms = new Set([
        "thumbnail","thumb","miniatura","youtube","video","canal","shorts",
        "canva","photoshop","design","arte","criativo","criativa","atrativo",
        "atrativa","clickbait","viral","virais","imagem","imagens"
    ]);
    const birdTopicTerms = new Set([
        "coleiro","coleirinho","passaro","ave","alimentacao","manejo",
        "reproducao","criar","criadouro","gaiola","viveiro","semente",
        "papa","capim","canto","fibra","ninho"
    ]);
    const topicTerms = anchors.some(a => ["titulo","headline"].includes(a))
        ? titleTopicTerms
        : anchors.some(a => ["capa","thumbnail","thumb","miniatura"].includes(a))
            ? coverTopicTerms
            : anchors.some(a => ["coleiro","coleirinho","passaro","ave"].includes(a))
                ? birdTopicTerms
                : new Set([...anchors, ...contextTerms]);

    const secondaryTopicTerms = new Set([...topicTerms].filter(term => !expandedAnchors.has(canonical(term))));
    const tokensOf = value => normalize(value).split(" ").filter(Boolean).map(canonical);
    const hasAny = (tokens, set) => tokens.some(token => set.has(token));
    const hasAnchor = value => hasAny(tokensOf(value), expandedAnchors);
    const sourceIsRelevant = video => {
        const title = tokensOf(video?.snippet?.title || "");
        const description = tokensOf(video?.snippet?.description || "");
        const tags = (Array.isArray(video?.snippet?.tags) ? video.snippet.tags : []).flatMap(tokensOf);
        const all = [...title, ...description, ...tags];
        const matchedAnchors = [...expandedAnchors].filter(anchor => all.includes(anchor));
        if (!matchedAnchors.length) return false;

        // Quando a busca especifica plataforma/formato, a fonte precisa
        // confirmar esse contexto no título, descrição ou tags do vídeo.
        if (contextTerms.length && !contextTerms.some(term => all.includes(term))) return false;

        // Evita resultados incidentais com apenas a palavra principal.
        // Para uma busca com um único conceito, exige também contexto de nicho.
        if (anchors.length === 1 && !hasAny(all, secondaryTopicTerms) && !contextTerms.length) return false;
        return true;
    };
    const phraseIsRelevant = (phrase, sourceVideo) => {
        const phraseTokens = tokensOf(phrase);
        if (!hasAny(phraseTokens, expandedAnchors)) return false;
        // A frase sugerida precisa fazer sentido dentro do tema, não basta
        // conter uma palavra solta como "título" ou "capa".
        if (!hasAny(phraseTokens, secondaryTopicTerms) && anchors.length < 2) return false;
        if (contextTerms.length &&
            !contextTerms.some(term => phraseTokens.includes(term)) &&
            !hasAny(phraseTokens, topicTerms)) return false;
        return sourceIsRelevant(sourceVideo);
    };

    const candidates = new Map();
    const addCandidate = (raw, video, sourceWeight = 1) => {
        const phrase = normalize(raw);
        if (!phrase || phrase.length < 3 || phrase.length > 70 ||
            phrase === normalize(seedKeyword)) return;
        const words = phrase.split(" ").filter(Boolean);
        const allowedConnectors = new Set(["para","de","do","da","no","na","em"]);
        if (words.length < 1 || words.length > 5 || stop.has(words[0]) || stop.has(words[words.length - 1])) return;
        if (words.some(word => stop.has(word) && !allowedConnectors.has(word))) return;
        if (words.some(word => word.length < 3 && !stop.has(word))) return;
        if (!phraseIsRelevant(phrase, video)) return;

        const matchedAnchors = [...expandedAnchors].filter(anchor =>
            words.some(word => canonical(word) === anchor)
        );
        const key = words.map(canonical).join(" ");
        const videoId = String(video?.id || video?.snippet?.title || "");
        const entry = candidates.get(key) || {
            keyword: phrase, videos: new Map(), sourceWeight: 0,
            matchedAnchors: new Set()
        };
        if (videoId && !entry.videos.has(videoId)) entry.videos.set(videoId, video);
        entry.sourceWeight += sourceWeight;
        matchedAnchors.forEach(term => entry.matchedAnchors.add(term));
        candidates.set(key, entry);
    };

    videos.forEach(video => {
        if (!sourceIsRelevant(video)) return;
        const tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];
        tags.forEach(tag => addCandidate(tag, video, 3));

        const words = normalize(video?.snippet?.title || "").split(" ").filter(Boolean);
        for (let n = 2; n <= 4; n++) {
            for (let i = 0; i + n <= words.length; i++) {
                const phraseWords = words.slice(i, i + n);
                if (stop.has(phraseWords[0])) continue;
                addCandidate(phraseWords.join(" "), video, n === 2 ? 1 : 1.5);
            }
        }
    });

    const minimumSupport = videos.length >= 12 ? 2 : 1;
    const rows = [];
    for (const entry of candidates.values()) {
        const support = [...entry.videos.values()];
        if (support.length < minimumSupport) continue;
        const views = support.map(video => Number(video?.statistics?.viewCount || 0))
            .filter(value => Number.isFinite(value) && value >= 0);
        if (!views.length) continue;
        const averageViews = Math.round(views.reduce((sum, value) => sum + value, 0) / views.length);
        const supportRate = support.length / Math.max(videos.length, 1);
        const anchorCoverage = entry.matchedAnchors.size / Math.max(expandedAnchors.size, 1);
        const relevance = Math.max(0, Math.min(100, Math.round(
            anchorCoverage * 65 + Math.min(35, entry.sourceWeight * 4)
        )));
        const competition = Math.max(0, Math.min(100, 100 - Math.round(
            supportRate * 55 + Math.min(1, support.length / 8) * 25
        )));
        const demand = Math.max(10, Math.min(100, Math.round(
            Math.log10(averageViews + 1) * 12 + relevance * 0.35 +
            Math.min(100, supportRate * 100) * 0.25
        )));
        const opportunity = Math.max(10, Math.min(100, Math.round(
            demand * 0.45 + competition * 0.30 + relevance * 0.25
        )));
        rows.push({
            keyword: entry.keyword, avgViews: averageViews,
            videosAnalyzed: support.length, competition, opportunity,
            score: opportunity, relevance, searchDemand: demand,
            searchVolume: null, searchVolumeSource: "unavailable"
        });
    }
    return rows.sort((a,b) =>
        b.relevance-a.relevance || b.searchDemand-a.searchDemand ||
        b.opportunity-a.opportunity || b.videosAnalyzed-a.videosAnalyzed
    ).slice(0, Math.max(3, Math.min(30, Number(limit) || 30)));
}


// =========================
// 📦 RESPONSE
// =========================

// Keep `volume` as the existing 0-100 demand score.
// The YouTube Data API does not expose an absolute monthly keyword-search count,
// so these fields are deterministic TubeX ESTIMATES derived from the existing
// demand score/trend engine. No existing score is changed.
const trend = items.length
    ? generateEstimatedTrend(finalVolume, finalCompetition)
    : [];

const estimatedMonthlySearches = trend.length
    ? Math.max(0, Math.round(
        trend.reduce((sum, point) => sum + Number(point?.value || 0), 0)
      ))
    : null;

const monthlySearchesEstimated = estimatedMonthlySearches;
const monthlySearchesMin = estimatedMonthlySearches !== null
    ? Math.max(0, Math.round(estimatedMonthlySearches * 0.75))
    : null;
const monthlySearchesMax = estimatedMonthlySearches !== null
    ? Math.max(monthlySearchesMin, Math.round(estimatedMonthlySearches * 1.25))
    : null;
// =========================
// 📊 YOUTUBE METRICS
// =========================

const youtubeMetrics = {

    videoCount: items.length,

    averageViews,

keywordScore,
relevanceScore,
    averageAgeDays,

    averageViewsPerDay,
strongVideos,
distributionScore,
topShare,

    maxViewsPerDay,

    maxViews,

    minViews,

    medianViews: median

};

const googleSearch = await fetchGoogleVerification(keyword);

const relatedPlan = String(body?.plan || "free").toLowerCase();
const requestedRelatedLimit =
    relatedPlan === "free" ? 5 :
    relatedPlan === "pro" ? 15 :
    relatedPlan === "expert" || relatedPlan === "owner" ? 30 :
    relatedPlan === "member" ? 15 : 5;

const relatedKeywords = buildRelatedKeywords(items, keyword, requestedRelatedLimit);

const keywordVolume = await tubexFetchKeywordVolume(keyword);
const monthlyGoogleSearches = keywordVolume?.google?.available
  ? Number(keywordVolume.google.monthlySearches)
  : null;

const responseData = {

    success: true,
    keywordVolume,
    // Absolute monthly searches come only from the configured provider.
    // The internal TubeX 0–100 demand score remains a separate proprietary index.

    items,
    totalResults,
    recentItemsCount: recentItems.length,

    volume: finalVolume,

    // Backward-compatible fields for the Keyword Explorer.
    // `monthlySearches` is an estimate, not an official YouTube search count.
    monthlySearches: monthlyGoogleSearches,
    monthlySearchesEstimated: null,
    monthlySearchesMin: null,
    monthlySearchesMax: null,
    searchVolume: monthlyGoogleSearches,
    searchVolumeSource: monthlyGoogleSearches !== null ? "dataforseo_google_ads" : "unavailable",
    searchVolumeType: monthlyGoogleSearches !== null ? "provider_monthly_estimate" : "unavailable",

    competition: finalCompetition,
competitionDetails,
competitionScore,

    // Google Trends
    interest: 0,

youtubeMetrics,

    trend,

    googleSearch,

    tags: rankedTags,
    relatedKeywords,

  metrics: {

    averageViews,

    averageViewsPerDay,
distributionScore,

topShare,
    maxViewsPerDay,
strongVideos,
relevanceScore,
    averageLikes,
standardDeviation,

coefficientVariation,

consistencyScore,
    averageComments,

    maxViews,

    minViews,
exactTitleMatches,
prefixTitleMatches,
phraseTitleMatches,
partialTitleMatches,
titleDemandScore,
topScore,
medianScore,
velocityScore,
strengthScore,
serpDemandScore,

    monthlySearches: monthlyGoogleSearches,
    monthlySearchesEstimated: null,
    monthlySearchesMin: null,
    monthlySearchesMax: null,
    keywordVolume,

    medianViews: median

}

};
// =========================
// 💾 CACHE SAVE
// =========================

if (cacheKey) {

  global.tubexSeoCache[cacheKey] = {

    data: responseData,

    expires:
      Date.now() +
      (15 * 60 * 1000)

  };

}

return res
  .status(200)
  .json(responseData);

  } catch (e) {

    console.error("💥 ERROR:", e);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
}
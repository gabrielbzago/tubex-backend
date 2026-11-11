// TubeX — Google Ads Keyword Planner bridge.
// Uses the signed-in user's short-lived OAuth access token; never stores it.
// Google Ads API access is managed by the Google Cloud project.
// Since the September 9, 2026 migration, developer-token headers are optional and ignored.

const API_VERSION = "v26";
const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const BRAZIL_GEO = "geoTargetConstants/2076";
const PORTUGUESE_LANGUAGE = "languageConstants/1014";

function cleanKeyword(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function periodEstimates(monthly) {
  if (monthly === null) return { days7: null, days30: null, days60: null, days90: null };
  // Google Ads supplies monthly averages, not daily query counts.
  // These are transparent prorated estimates derived from the monthly average.
  const daily = monthly / 30.4375;
  return {
    days7: Math.round(daily * 7),
    days30: Math.round(daily * 30),
    days60: Math.round(daily * 60),
    days90: Math.round(daily * 90)
  };
}
function normalizeMetrics(result) {
  const metrics = result?.keywordMetrics || result?.keywordIdeaMetrics ||
    result?.keyword_metrics || result?.keyword_idea_metrics || {};
  const monthly = numberOrNull(metrics.avgMonthlySearches ?? metrics.avg_monthly_searches);
  const rawHistory = metrics.monthlySearchVolumes ?? metrics.monthly_search_volumes;
  const history = Array.isArray(rawHistory)
    ? rawHistory.map(item => ({
        year: Number(item.year),
        month: String(item.month || ""),
        searches: numberOrNull(item.monthlySearches ?? item.monthly_searches)
      })).filter(item => item.searches !== null)
    : [];
  return {
    keyword: String(result?.text || result?.keyword || "").trim(),
    monthlySearches: monthly,
    periods: periodEstimates(monthly),
    monthlyHistory: history,
    competition: metrics.competition || "UNSPECIFIED",
    competitionIndex: numberOrNull(metrics.competitionIndex ?? metrics.competition_index),
    lowTopOfPageBidMicros: numberOrNull(metrics.lowTopOfPageBidMicros ?? metrics.low_top_of_page_bid_micros),
    highTopOfPageBidMicros: numberOrNull(metrics.highTopOfPageBidMicros ?? metrics.high_top_of_page_bid_micros),
    source: "google_ads_keyword_planner",
    metricType: "average_monthly_searches"
  };
}
function normalizeKeywordKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function resultMatchesKeyword(item, requestedKey) {
  if (normalizeKeywordKey(item?.text || item?.keyword) === requestedKey) return true;
  const variants = item?.closeVariants ?? item?.close_variants;
  return Array.isArray(variants) && variants.some(value => normalizeKeywordKey(value) === requestedKey);
}

// Mantém a consulta completa e cria sementes de frases do próprio contexto.
// Isso permite ao Planejador encontrar variações de cauda longa sem reduzir
// "ferramentas de SEO para YouTube" apenas a "YouTube".
const STOP_WORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em",
  "no", "na", "nos", "nas", "para", "por", "com", "sem", "um", "uma",
  "uns", "umas", "ao", "aos", "à", "às", "que", "como"
]);

function meaningfulTokens(value) {
  return normalizeKeywordKey(value)
    .split(" ")
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function buildKeywordSeeds(keyword) {
  const original = cleanKeyword(keyword);
  const tokens = meaningfulTokens(original);
  const seeds = [original];
  const add = value => {
    const cleaned = cleanKeyword(value);
    const key = normalizeKeywordKey(cleaned);
    if (cleaned && key && !seeds.some(seed => normalizeKeywordKey(seed) === key)) {
      seeds.push(cleaned);
    }
  };

  // Adiciona subfrases contíguas, preservando a ordem e o assunto pesquisado.
  // Prioriza frases de 2–4 termos; não envia palavras soltas genéricas.
  for (let size = Math.min(4, tokens.length); size >= 2; size--) {
    for (let i = 0; i <= tokens.length - size; i++) {
      add(tokens.slice(i, i + size).join(" "));
      if (seeds.length >= 10) return seeds;
    }
  }
  return seeds.slice(0, 10);
}

function contextualCandidate(seed, candidate) {
  const seedKey = normalizeKeywordKey(seed);
  const candidateKey = normalizeKeywordKey(candidate);
  if (!candidateKey || candidateKey === seedKey) return false;

  const seedTokens = meaningfulTokens(seed);
  const candidateTokens = meaningfulTokens(candidate);
  if (!seedTokens.length || !candidateTokens.length) return false;

  const candidateSet = new Set(candidateTokens);
  const matched = seedTokens.filter(token => candidateSet.has(token));
  const overlap = matched.length / Math.max(1, new Set(seedTokens).size);

  // Evita sugestões que só compartilham um termo amplo quando a busca
  // contém vários conceitos. Para consultas curtas, um termo específico basta.
  const uniqueSeed = [...new Set(seedTokens)];
  if (uniqueSeed.length >= 4 && matched.length < 2) return false;
  if (uniqueSeed.length >= 2 && matched.length === 0) return false;

  // Recompensa a preservação de pares consecutivos da consulta: por exemplo,
  // "seo youtube" em "ferramentas de seo para youtube".
  let consecutive = 0;
  for (let i = 0; i < seedTokens.length - 1; i++) {
    const pair = `${seedTokens[i]} ${seedTokens[i + 1]}`;
    if (candidateKey.includes(pair)) consecutive++;
  }

  // Uma ideia precisa manter parte do assunto; não basta conter uma palavra
  // incidental ou apenas o primeiro termo da frase.
  if (uniqueSeed.length >= 3 && overlap < 0.25 && consecutive === 0) return false;
  return true;
}

function contextualRelevance(seed, candidate) {
  const seedTokens = meaningfulTokens(seed);
  const candidateTokens = meaningfulTokens(candidate);
  const candidateSet = new Set(candidateTokens);
  const matched = seedTokens.filter(token => candidateSet.has(token));
  let consecutive = 0;
  for (let i = 0; i < seedTokens.length - 1; i++) {
    if (normalizeKeywordKey(candidate).includes(`${seedTokens[i]} ${seedTokens[i + 1]}`)) {
      consecutive++;
    }
  }
  const coverage = matched.length / Math.max(1, new Set(seedTokens).size);
  const phraseBonus = normalizeKeywordKey(candidate).includes(normalizeKeywordKey(seed))
    ? 3 : 0;
  return coverage * 10 + consecutive * 2 + phraseBonus;
}

async function adsFetch(path, token, body) {
  // OAuth access token + Google Cloud project's approved Google Ads API access.
  // Do not require GOOGLE_ADS_DEVELOPER_TOKEN: it was sunset on 2026-09-09.
  const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.details?.[0]?.errors?.[0]?.message ||
      payload?.error?.message || `Google Ads API HTTP ${response.status}`;
    const code = payload?.error?.details?.[0]?.errors?.[0]?.errorCode
      ? JSON.stringify(payload.error.details[0].errors[0].errorCode)
      : String(response.status);
    const error = new Error(detail);
    error.status = response.status;
    error.adsCode = code;
    throw error;
  }
  return payload;
}
async function accessibleCustomerIds(token) {
  const data = await adsFetch("customers:listAccessibleCustomers", token);
  return (data.resourceNames || [])
    .map(name => String(name).split("/").pop())
    .filter(id => /^\d{8,12}$/.test(id));
}
async function historicalMetrics(customerId, token, keywords) {
  return adsFetch(`customers/${customerId}:generateKeywordHistoricalMetrics`, token, {
    keywords,
    geoTargetConstants: [BRAZIL_GEO],
    language: PORTUGUESE_LANGUAGE,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false
  });
}
async function keywordIdeas(customerId, token, keyword) {
  return adsFetch(`customers/${customerId}:generateKeywordIdeas`, token, {
    keywordSeed: { keywords: buildKeywordSeeds(keyword) },
    geoTargetConstants: [BRAZIL_GEO],
    language: PORTUGUESE_LANGUAGE,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false
  });
}
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key,x-client");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  if (req.headers["x-api-key"] !== process.env.API_KEY) return res.status(403).json({ success: false, error: "unauthorized" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const keyword = cleanKeyword(body.keyword);
  const token = String(body.accessToken || "").trim();
  if (!keyword) return res.status(400).json({ success: false, error: "keyword_required" });
  if (!token) return res.status(401).json({ success: false, error: "google_ads_oauth_required", message: "Autorize o acesso ao Google Ads pela sua conta Google conectada." });

  try {
    // Validate that this token includes the required Google Ads scope.
    const tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    const tokenInfo = await tokenInfoResponse.json().catch(() => ({}));
    const scopes = String(tokenInfo.scope || "").split(/\s+/);
    if (!tokenInfoResponse.ok || !scopes.includes(ADS_SCOPE)) {
      return res.status(403).json({
        success: false,
        error: "google_ads_scope_missing",
        message: "A conta Google ainda não autorizou o acesso ao Google Ads. Faça a autorização adicional no TubeX."
      });
    }

    const customerIds = await accessibleCustomerIds(token);
    if (!customerIds.length) {
      return res.status(422).json({
        success: false,
        error: "google_ads_account_not_found",
        message: "Esta conta Google não possui uma conta Google Ads acessível. Crie ou acesse uma conta em ads.google.com."
      });
    }

    const requestedKey = normalizeKeywordKey(keyword);
    let lastError = null;
    const accountDiagnostics = [];
    let best = null;

    // Uma conta Google pode ter acesso direto a mais de uma conta Ads.
    // Não encerramos no primeiro HTTP 200 vazio: isso escondia resultados
    // disponíveis em outra conta vinculada ao mesmo usuário.
    for (const customerId of customerIds.slice(0, 5)) {
      try {
        const [historyResponse, ideasResponse] = await Promise.all([
          historicalMetrics(customerId, token, [keyword]),
          keywordIdeas(customerId, token, keyword)
        ]);
        const historyResults = Array.isArray(historyResponse.results) ? historyResponse.results : [];
        const ideaResults = Array.isArray(ideasResponse.results) ? ideasResponse.results : [];

        const primaryHistoricalRaw = historyResults.find(item =>
          resultMatchesKeyword(item, requestedKey)
        ) || null;
        const primaryIdeaRaw = ideaResults.find(item =>
          resultMatchesKeyword(item, requestedKey)
        ) || null;
        const primaryRaw = primaryHistoricalRaw || primaryIdeaRaw;
        const primary = primaryRaw
          ? { ...normalizeMetrics(primaryRaw), keyword }
          : {
              keyword,
              monthlySearches: null,
              periods: periodEstimates(null),
              monthlyHistory: [],
              source: "google_ads_keyword_planner",
              metricType: "average_monthly_searches"
            };

        const seen = new Set([requestedKey]);
        const relatedKeywords = ideaResults
          .map(normalizeMetrics)
          .filter(item => item.keyword && !seen.has(normalizeKeywordKey(item.keyword)))
          .filter(item => contextualCandidate(keyword, item.keyword))
          .filter(item => {
            const key = normalizeKeywordKey(item.keyword);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => {
            const relevance = contextualRelevance(keyword, b.keyword) -
              contextualRelevance(keyword, a.keyword);
            if (relevance !== 0) return relevance;
            return (b.monthlySearches || 0) - (a.monthlySearches || 0);
          })
          .slice(0, 50);

        const diagnostics = {
          historicalResultsCount: historyResults.length,
          ideaResultsCount: ideaResults.length,
          exactTermFoundInHistoricalMetrics: Boolean(primaryHistoricalRaw),
          exactTermFoundInKeywordIdeas: Boolean(primaryIdeaRaw)
        };
        accountDiagnostics.push({ customerId, ...diagnostics });

        const candidate = {
          customerId,
          primary,
          relatedKeywords,
          diagnostics: { ...diagnostics, seedsUsed: buildKeywordSeeds(keyword) },
          resultCount: historyResults.length + ideaResults.length
        };
        if (!best || candidate.resultCount > best.resultCount) best = candidate;

        // Continua avaliando as contas diretamente acessíveis para escolher
        // a resposta mais completa, em vez de depender da ordem do Google.
      } catch (error) {
        lastError = error;
        accountDiagnostics.push({
          customerId,
          error: String(error?.message || "Falha na consulta").slice(0, 180),
          status: Number(error?.status) || null,
          adsCode: error?.adsCode || null
        });
        // Erros de conta/permissão podem variar por customer ID; tenta a próxima.
        if (![400, 403, 404].includes(Number(error.status))) break;
      }
    }

    if (best && best.resultCount > 0) {
      return res.status(200).json({
        success: true,
        provider: "google_ads_keyword_planner",
        customerId: best.customerId,
        keyword,
        primary: best.primary,
        primaryDiagnostics: best.diagnostics,
        relatedKeywords: best.relatedKeywords,
        geo: "BR",
        language: "pt",
        monthlySearchesSource: "Google Ads API average monthly searches",
        periodEstimateNote: "7/30/60/90 dias são projeções proporcionais calculadas a partir da média mensal do Google Ads; não são contagens diárias observadas.",
        checkedAt: new Date().toISOString()
      });
    }

    if (lastError) throw lastError;

    // Não sinaliza falsamente "Conta conectada" quando a API respondeu
    // com sucesso HTTP, mas não retornou nenhum dado utilizável.
    return res.status(200).json({
      success: false,
      error: "google_ads_no_keyword_data",
      message: "O Google Ads aceitou a consulta, mas não retornou métricas nem ideias para esta palavra-chave. Tente uma variação mais ampla ou confira se a conta tem acesso ao Planejador de Palavras-chave.",
      keyword,
      accountDiagnostics,
      help: "A consulta foi feita com a conta Google autorizada, no Brasil e em português."
    });
  } catch (error) {
    const message = String(error?.message || "Falha na consulta Google Ads").slice(0, 260);
    const status = Number(error?.status) || 502;
    const lower = message.toLowerCase();
    const code = lower.includes("cloud_project_not_approved") || lower.includes("developer token")
      ? "google_ads_api_access_not_enabled"
      : lower.includes("customer") || lower.includes("account")
        ? "google_ads_customer_access_error"
        : "google_ads_request_failed";
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      success: false, error: code, message,
      adsCode: error?.adsCode || null,
      help: "Verifique se a Google Ads API está habilitada e se o projeto Google Cloud do OAuth possui acesso Básico ou superior."
    });
  }
}

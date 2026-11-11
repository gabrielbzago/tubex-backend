// TubeX — Google Ads Keyword Planner bridge.
// Uses the signed-in user's short-lived OAuth access token; never stores it.
// As of Sep  9, 2026, new Google Ads API onboarding/access is managed by
// the Google Cloud project. Developer-token header is intentionally omitted.
const API_VERSION = "v25";
const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const BRAZIL_GEO = "geoTargetConstants/2076";
const PORTUGUESE_LANGUAGE = "languageConstants/1014";

function cleanKeyword(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

// Context groups prevent broad Google Ads ideas from drifting to an unrelated
// meaning (for example "ferramentas de SEO para YouTube" -> power drills).
const CONTEXT_GROUPS = [
  { id: "youtube", terms: ["youtube", "youtuber", "youtubers", "canal", "canais", "shorts", "video", "videos", "vídeo", "vídeos"] },
  { id: "seo", terms: ["seo", "otimizacao", "otimizar", "ranqueamento", "posicionamento", "palavra-chave", "palavras-chave", "busca", "pesquisa", "pesquisas"] },
  { id: "tool", terms: ["ferramenta", "ferramentas", "software", "programa", "aplicativo", "app", "plataforma", "extensao", "extensão"] },
  { id: "marketing", terms: ["marketing", "digital", "trafego", "tráfego", "conteudo", "conteúdo", "criador", "criadores"] }
];
const STOP_WORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "do", "da", "dos", "das",
  "para", "por", "no", "na", "nos", "nas", "com", "e", "em", "como"
]);
function foldText(value) {
  return String(value || "").toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function keywordTokens(value) {
  return foldText(value).split(" ").filter(token => token && !STOP_WORDS.has(token));
}
function contextProfile(keyword) {
  const folded = foldText(keyword);
  const tokens = new Set(keywordTokens(keyword));
  const groups = new Set();
  for (const group of CONTEXT_GROUPS) {
    if (group.terms.some(term => {
      const normalized = foldText(term);
      return normalized.includes(" ")
        ? folded.includes(normalized)
        : tokens.has(normalized);
    })) groups.add(group.id);
  }
  return { tokens, groups };
}
function isContextuallyRelevant(seedKeyword, candidateKeyword) {
  const seed = contextProfile(seedKeyword);
  const candidate = contextProfile(candidateKeyword);
  const candidateTokens = keywordTokens(candidateKeyword);
  if (!candidateTokens.length) return false;

  // For multi-word searches, require at least two matching concepts when
  // the seed contains recognizable semantic groups. This keeps the intent.
  if (seed.groups.size >= 2) {
    let matchedGroups = 0;
    for (const group of seed.groups) {
      const definition = CONTEXT_GROUPS.find(item => item.id === group);
      if (definition && definition.terms.some(term => {
        const normalized = foldText(term);
        return normalized.includes(" ")
          ? foldText(candidateKeyword).includes(normalized)
          : candidate.tokens.has(normalized);
      })) matchedGroups++;
    }
    return matchedGroups >= 2;
  }

  // Generic or single-concept searches: require meaningful token overlap.
  const meaningfulSeedTokens = [...seed.tokens].filter(token => token.length > 2);
  if (!meaningfulSeedTokens.length) return true;
  const overlap = meaningfulSeedTokens.filter(token => candidate.tokens.has(token)).length;
  const required = meaningfulSeedTokens.length >= 3 ? 2 : 1;
  return overlap >= required;
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
  const metrics = result?.keywordMetrics || result?.keywordIdeaMetrics || {};
  const monthly = numberOrNull(metrics.avgMonthlySearches);
  const history = Array.isArray(metrics.monthlySearchVolumes)
    ? metrics.monthlySearchVolumes.map(item => ({
        year: Number(item.year),
        month: String(item.month || ""),
        searches: numberOrNull(item.monthlySearches)
      })).filter(item => item.searches !== null)
    : [];
  return {
    keyword: String(result?.text || result?.keyword || "").trim(),
    monthlySearches: monthly,
    periods: periodEstimates(monthly),
    monthlyHistory: history,
    competition: metrics.competition || "UNSPECIFIED",
    competitionIndex: numberOrNull(metrics.competitionIndex),
    lowTopOfPageBidMicros: numberOrNull(metrics.lowTopOfPageBidMicros),
    highTopOfPageBidMicros: numberOrNull(metrics.highTopOfPageBidMicros),
    source: "google_ads_keyword_planner",
    metricType: "average_monthly_searches"
  };
}
async function adsFetch(path, token, body) {
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
    keywordSeed: { keywords: [keyword] },
    geoTargetConstants: [BRAZIL_GEO],
    language: PORTUGUESE_LANGUAGE,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
    pageSize: 30
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

    let lastError = null;
    for (const customerId of customerIds.slice(0, 5)) {
      try {
        const [historyResponse, ideasResponse] = await Promise.all([
          historicalMetrics(customerId, token, [keyword]),
          keywordIdeas(customerId, token, keyword)
        ]);
        const normalizedRequestedKeyword = foldText(keyword);
        const primaryRaw = (historyResponse.results || []).find(item =>
          foldText(item.text || item.keyword || "") === normalizedRequestedKeyword
        ) || null;
        const primary = primaryRaw ? normalizeMetrics(primaryRaw) : {
          keyword, monthlySearches: null,
          periods: periodEstimates(null), monthlyHistory: [],
          source: "google_ads_keyword_planner",
          metricType: "average_monthly_searches"
        };
        const seen = new Set([keyword.toLocaleLowerCase("pt-BR")]);
        const relatedKeywords = (ideasResponse.results || [])
          .map(normalizeMetrics)
          .filter(item => item.keyword && !seen.has(foldText(item.keyword)))
          .filter(item => isContextuallyRelevant(keyword, item.keyword))
          .filter(item => { const key = foldText(item.keyword); if (seen.has(key)) return false; seen.add(key); return true; })
          .sort((a, b) => (b.monthlySearches || 0) - (a.monthlySearches || 0))
          .slice(0, 25);
        return res.status(200).json({
          success: true,
          provider: "google_ads_keyword_planner",
          customerId,
          keyword,
          primary,
          relatedKeywords,
          relatedKeywordsFiltering: "contextual_semantic_groups_v1",
          primaryExactMatchOnly: true,
          geo: "BR",
          language: "pt",
          monthlySearchesSource: "Google Ads API average monthly searches",
          periodEstimateNote: "7/30/60/90 dias são projeções proporcionais calculadas a partir da média mensal do Google Ads; não são contagens diárias observadas.",
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        lastError = error;
        // Try another accessible Ads account only for account-specific errors.
        if (![400, 403, 404].includes(Number(error.status))) break;
      }
    }
    throw lastError || new Error("Nenhuma conta Google Ads autorizada pôde ser consultada.");
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
      help: "Verifique se a Google Ads API está habilitada e se o projeto OAuth do TubeX possui acesso Explorer à API."
    });
  }
}

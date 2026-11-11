// TubeX — Google Ads Keyword Planner bridge.
// Uses the signed-in user's short-lived OAuth access token; never stores it.
// Google Ads requires BOTH the user's OAuth token and the app's developer token.

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
  const developerToken = String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim();
  if (!developerToken) {
    const error = new Error("Falta configurar GOOGLE_ADS_DEVELOPER_TOKEN no Vercel.");
    error.status = 500;
    error.adsCode = "DEVELOPER_TOKEN_MISSING";
    throw error;
  }
  const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": developerToken,
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
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return res.status(500).json({
      success: false,
      error: "google_ads_developer_token_missing",
      message: "O backend TubeX ainda não tem GOOGLE_ADS_DEVELOPER_TOKEN configurado no Vercel."
    });
  }
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
        const primaryRaw = (historyResponse.results || []).find(item =>
          String(item.text || "").toLocaleLowerCase("pt-BR") === keyword.toLocaleLowerCase("pt-BR")
        ) || historyResponse.results?.[0] || null;
        const primary = primaryRaw ? normalizeMetrics(primaryRaw) : {
          keyword, monthlySearches: null,
          periods: periodEstimates(null), monthlyHistory: [],
          source: "google_ads_keyword_planner",
          metricType: "average_monthly_searches"
        };
        const seen = new Set([keyword.toLocaleLowerCase("pt-BR")]);
        const relatedKeywords = (ideasResponse.results || [])
          .map(normalizeMetrics)
          .filter(item => item.keyword && !seen.has(item.keyword.toLocaleLowerCase("pt-BR")))
          .filter(item => { const key = item.keyword.toLocaleLowerCase("pt-BR"); if (seen.has(key)) return false; seen.add(key); return true; })
          .sort((a, b) => (b.monthlySearches || 0) - (a.monthlySearches || 0))
          .slice(0, 25);
        return res.status(200).json({
          success: true,
          provider: "google_ads_keyword_planner",
          customerId,
          keyword,
          primary,
          relatedKeywords,
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

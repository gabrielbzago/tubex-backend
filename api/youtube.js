
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

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";


const MCP_VERSION = "2025-06-18";
const SERVICE_URL = "https://tubex-backend.vercel.app";
const RESOURCE_URL = `${SERVICE_URL}/api/mcp`;
const AUTH_METADATA_URL = `${SERVICE_URL}/.well-known/oauth-authorization-server`;
const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

const TOOLS = [
  {
    name: "list_my_youtube_channels",
    title: "Listar meus canais do YouTube",
    description: "Lista os canais do YouTube que a conta Google conectada pode administrar, com inscritos, views totais e quantidade de vídeos.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        channels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              channelId: { type: "string" }, title: { type: "string" }, handle: { type: "string" },
              description: { type: "string" }, publishedAt: { type: "string" }, country: { type: "string" },
              subscribers: { type: "number" }, totalViews: { type: "number" }, videoCount: { type: "number" },
              hiddenSubscriberCount: { type: "boolean" }
            },
            required: ["channelId", "title", "subscribers", "totalViews", "videoCount"],
            additionalProperties: true
          }
        }
      },
      required: ["channels"],
      additionalProperties: false
    }
  },
  {
    name: "get_my_channel_analytics",
    title: "Consultar métricas do meu canal",
    description: "Consulta métricas oficiais do YouTube Analytics do canal conectado no período escolhido (7, 28 ou 90 dias).",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "ID de um dos canais listados por list_my_youtube_channels; opcional se a conta tiver um único canal." },
        days: { type: "integer", enum: [7, 28, 90], description: "Período em dias, padrão 28." }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", additionalProperties: true }
  },
  {
    name: "get_public_youtube_channel",
    title: "Consultar canal público do YouTube",
    description: "Busca os dados públicos de um canal do YouTube por @handle ou ID: inscritos, visualizações totais, vídeos recentes e informações do canal.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "@handle do canal." },
        channelId: { type: "string", description: "ID do canal." },
        recentVideos: { type: "integer", minimum: 0, maximum: 10, description: "Quantidade de vídeos recentes (padrão 5)." }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", additionalProperties: true }
  },
  {
    name: "search_public_youtube_videos",
    title: "Pesquisar vídeos públicos do YouTube",
    description: "Pesquisa vídeos públicos no YouTube por palavra-chave e retorna título, canal, data e contagens públicas de views, likes e comentários.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 2, maxLength: 120 },
        maxResults: { type: "integer", minimum: 1, maximum: 10, description: "Quantidade de vídeos (padrão 5)." }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", additionalProperties: true }
  },
  {
    name: "compare_my_channel_with_public_channel",
    title: "Comparar meu canal com outro canal",
    description: "Compara métricas do seu canal conectado com as métricas públicas de outro canal. Os dados privados vêm do YouTube Analytics; os dados do outro canal são públicos.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      required: ["competitor"],
      properties: {
        channelId: { type: "string", description: "ID de um canal seu; opcional se houver somente um canal." },
        competitor: { type: "string", description: "@handle ou ID do canal público para comparar." },
        days: { type: "integer", enum: [7, 28, 90], description: "Período das métricas privadas do seu canal, padrão 28." }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", additionalProperties: true }
  }
];

const TOOL_REQUIRED_SCOPES = {
  list_my_youtube_channels: ["channel.read"],
  get_my_channel_analytics: ["channel.read", "analytics.read"],
  get_public_youtube_channel: [],
  search_public_youtube_videos: [],
  compare_my_channel_with_public_channel: ["channel.read", "analytics.read", "public.youtube.read"]
};
for (const tool of TOOLS) {
  const scopes = TOOL_REQUIRED_SCOPES[tool.name] || [];
  tool._meta = {
    ...(tool._meta || {}),
    securitySchemes: scopes.length ? [{ type: "oauth2", scopes }] : [{ type: "noauth" }]
  };
}

function jsonRpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}
function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch {} }
  return {};
}
function bearer(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`server_config_missing:${name}`);
  return value;
}
function supabaseHeaders(prefer = "") {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
function supabaseUrl(table, query = "") {
  const base = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  return `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;
}
async function dbSelect(table, query) {
  const response = await fetch(supabaseUrl(table, query), { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`mcp_storage_read_failed:${response.status}`);
  return response.json();
}
async function dbInsert(table, row) {
  const response = await fetch(supabaseUrl(table), { method: "POST", headers: supabaseHeaders("return=minimal"), body: JSON.stringify(row) });
  if (!response.ok) throw new Error(`mcp_storage_write_failed:${response.status}`);
}
async function dbDelete(table, query) {
  const response = await fetch(supabaseUrl(table, query), { method: "DELETE", headers: supabaseHeaders("return=minimal") });
  if (!response.ok) throw new Error(`mcp_storage_delete_failed:${response.status}`);
}
async function dbUpdate(table, query, row) {
  const response = await fetch(supabaseUrl(table, query), { method: "PATCH", headers: supabaseHeaders("return=minimal"), body: JSON.stringify(row) });
  if (!response.ok) throw new Error(`mcp_storage_update_failed:${response.status}`);
}

async function findAccessToken(token) {
  const digest = hash(token);
  const rows = await dbSelect("mcp_access_tokens", `token_hash=eq.${digest}&resource=eq.${encodeURIComponent(RESOURCE_URL)}&select=grant_id,expires_at`);
  const row = rows[0];
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  const grants = await dbSelect("mcp_oauth_grants", `id=eq.${encodeURIComponent(row.grant_id)}&revoked_at=is.null&select=id,email,encrypted_google_refresh_token,scopes`);
  return grants[0] || null;
}

async function decryptRefreshToken(ciphertext) {
  const { createDecipheriv, createHash: makeHash } = await import("node:crypto");
  const key = makeHash("sha256").update(requireEnv("MCP_TOKEN_ENCRYPTION_KEY")).digest();
  const [ivPart, tagPart, dataPart] = String(ciphertext || "").split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("mcp_refresh_token_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

async function googleAccessToken(grant) {
  const refreshToken = await decryptRefreshToken(grant.encrypted_google_refresh_token);
  const form = new URLSearchParams({
    client_id: requireEnv("GOOGLE_MCP_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_MCP_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("google_reauthorization_required");
  return data.access_token;
}

async function googleJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.errors?.[0]?.reason || data?.error?.status || `http_${response.status}`;
    throw new Error(`youtube_api_error:${error}`);
  }
  return data;
}
function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 10);
}
function publicApiKey() { return String(process.env.YOUTUBE_API_KEY || "").split(",")[0].trim(); }
function channelShape(channel) {
  const s = channel?.statistics || {};
  return {
    channelId: channel?.id || "",
    title: channel?.snippet?.title || "",
    handle: channel?.snippet?.customUrl || "",
    description: String(channel?.snippet?.description || "").slice(0, 1200),
    publishedAt: channel?.snippet?.publishedAt || "",
    country: channel?.snippet?.country || "",
    subscribers: Number(s.subscriberCount || 0),
    totalViews: Number(s.viewCount || 0),
    videoCount: Number(s.videoCount || 0),
    hiddenSubscriberCount: !!s.hiddenSubscriberCount
  };
}
async function publicChannel(identifier) {
  const apiKey = publicApiKey();
  if (!apiKey) throw new Error("youtube_api_unavailable");
  const value = String(identifier || "").trim();
  if (!value) throw new Error("channel_identifier_required");
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails", key: apiKey });
  if (/^UC[\w-]{20,}$/.test(value)) params.set("id", value);
  else params.set("forHandle", value.replace(/^@/, ""));
  const data = await fetch(`${YT_API}/channels?${params}`).then(r => r.json());
  if (data.error) throw new Error(`youtube_api_error:${data.error.errors?.[0]?.reason || data.error.code || "unknown"}`);
  const channel = data.items?.[0];
  if (!channel) throw new Error("public_channel_not_found");
  return channel;
}
async function recentPublicVideos(channel, count) {
  const limit = Math.max(0, Math.min(10, Number(count ?? 5) || 0));
  if (!limit) return [];
  const key = publicApiKey();
  const playlistId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return [];
  const params = new URLSearchParams({ part: "snippet,contentDetails", playlistId, maxResults: String(limit), key });
  const playlist = await fetch(`${YT_API}/playlistItems?${params}`).then(r => r.json());
  if (playlist.error) throw new Error("youtube_api_error:recent_videos_unavailable");
  const ids = (playlist.items || []).map(item => item.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videoParams = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(","), key });
  const videos = await fetch(`${YT_API}/videos?${videoParams}`).then(r => r.json());
  if (videos.error) throw new Error("youtube_api_error:video_stats_unavailable");
  return (videos.items || []).map(video => ({
    videoId: video.id,
    title: video.snippet?.title || "",
    publishedAt: video.snippet?.publishedAt || "",
    duration: video.contentDetails?.duration || "",
    views: Number(video.statistics?.viewCount || 0),
    likes: Number(video.statistics?.likeCount || 0),
    comments: Number(video.statistics?.commentCount || 0)
  }));
}
async function listOwnedChannels(token) {
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails", mine: "true", maxResults: "50" });
  const data = await googleJson(`${YT_API}/channels?${params}`, token);
  return (data.items || []).map(channel => ({ ...channelShape(channel), uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || "" }));
}
async function myAnalytics(token, channelId, days) {
  const owned = await listOwnedChannels(token);
  const channels = channelId ? owned.filter(channel => channel.channelId === channelId) : owned;
  if (!channels.length) throw new Error(channelId ? "channel_not_authorized_for_google_account" : "no_youtube_channel_found");
  if (channels.length > 1 && !channelId) return { chooseChannel: true, channels: channels.map(({ uploadsPlaylistId, ...channel }) => channel) };
  const channel = channels[0];
  const end = dateDaysAgo(1);
  const start = dateDaysAgo(days);
  const params = new URLSearchParams({
    ids: `channel==${channel.channelId}`,
    startDate: start,
    endDate: end,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained,subscribersLost"
  });
  const analytics = await googleJson(`${YT_ANALYTICS}?${params}`, token);
  return {
    channel: { ...channel, uploadsPlaylistId: undefined },
    period: { startDate: start, endDate: end, days },
    metrics: Object.fromEntries((analytics.columnHeaders || []).map((header, i) => [header.name, analytics.rows?.[0]?.[i] ?? null])),
    rows: analytics.rows || [],
    dataSource: "YouTube Analytics API"
  };
}
async function searchPublicVideos(query, maxResults) {
  const key = publicApiKey();
  if (!key) throw new Error("youtube_api_unavailable");
  const params = new URLSearchParams({ part: "snippet", type: "video", q: query, maxResults: String(Math.max(1, Math.min(10, Number(maxResults || 5)))) , key });
  const data = await fetch(`${YT_API}/search?${params}`).then(r => r.json());
  if (data.error) throw new Error(`youtube_api_error:${data.error.errors?.[0]?.reason || "search_failed"}`);
  const ids = (data.items || []).map(item => item.id?.videoId).filter(Boolean);
  const result = { items: data.items || [] };
  if (!ids.length) return [];
  const videoParams = new URLSearchParams({ part: "statistics,contentDetails", id: ids.join(","), key });
  const statsData = await fetch(`${YT_API}/videos?${videoParams}`).then(r => r.json());
  const stats = new Map((statsData.items || []).map(item => [item.id, item]));
  return result.items.map(item => {
    const v = stats.get(item.id?.videoId);
    return {
      videoId: item.id?.videoId || "",
      title: item.snippet?.title || "",
      channelId: item.snippet?.channelId || "",
      channelTitle: item.snippet?.channelTitle || "",
      publishedAt: item.snippet?.publishedAt || "",
      description: String(item.snippet?.description || "").slice(0, 300),
      views: Number(v?.statistics?.viewCount || 0),
      likes: Number(v?.statistics?.likeCount || 0),
      comments: Number(v?.statistics?.commentCount || 0),
      duration: v?.contentDetails?.duration || ""
    };
  });
}

async function executeTool(name, input, grant) {
  const scopes = Array.isArray(grant?.scopes) ? grant.scopes : [];
  const requiredScopes = TOOL_REQUIRED_SCOPES[name] || [];
  if (requiredScopes.some(scope => !scopes.includes(scope))) throw new Error("required_scope_not_granted");
  const googleToken = requiredScopes.includes("channel.read") ? await googleAccessToken(grant) : null;
  if (name === "list_my_youtube_channels") {
    return { channels: (await listOwnedChannels(googleToken)).map(({ uploadsPlaylistId, ...channel }) => channel) };
  }
  if (name === "get_my_channel_analytics") {
    const days = [7, 28, 90].includes(Number(input.days)) ? Number(input.days) : 28;
    return myAnalytics(googleToken, String(input.channelId || "").trim(), days);
  }
  if (name === "get_public_youtube_channel") {
    const identifier = input.channelId || input.handle;
    if (!identifier) throw new Error("handle_or_channelId_required");
    const channel = await publicChannel(identifier);
    const { uploadsPlaylistId, ...safeChannel } = { ...channelShape(channel), uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || "" };
    return { channel: safeChannel, recentVideos: await recentPublicVideos(channel, input.recentVideos ?? 5), dataSource: "YouTube Data API (dados públicos)" };
  }
  if (name === "search_public_youtube_videos") {
    const query = String(input.query || "").trim();
    if (query.length < 2 || query.length > 120) throw new Error("query_length_invalid");
    return { query, dataSource: "YouTube Data API (dados públicos)", videos: await searchPublicVideos(query, input.maxResults) };
  }
  if (name === "compare_my_channel_with_public_channel") {
    const identifier = String(input.competitor || "").trim();
    if (!identifier) throw new Error("competitor_required");
    const days = [7, 28, 90].includes(Number(input.days)) ? Number(input.days) : 28;
    const [own, competitor] = await Promise.all([
      myAnalytics(googleToken, String(input.channelId || "").trim(), days),
      publicChannel(identifier)
    ]);
    if (own.chooseChannel) return { chooseChannel: true, ownChannels: own.channels, publicChannel: channelShape(competitor) };
    const { uploadsPlaylistId, ...ownChannel } = own.channel;
    return {
      period: own.period,
      ownChannel: { ...ownChannel, analytics: own.metrics },
      publicChannel: channelShape(competitor),
      comparisonNote: "Métricas do próprio canal vêm do YouTube Analytics no período indicado. Métricas do outro canal são contadores públicos acumulados; a API pública não expõe o Analytics privado de terceiros."
    };
  }
  throw new Error("tool_not_found");
}

async function tubexMcpHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const request = bodyOf(req);
  if (request.jsonrpc !== "2.0" || !request.method) return res.status(400).json(rpcError(request.id ?? null, -32600, "Invalid Request"));
  if (request.method === "notifications/initialized") return res.status(202).end();
  if (!Object.prototype.hasOwnProperty.call(request, "id")) return res.status(202).end();
  let grant = null;
  const token = bearer(req);
  if (token) {
    try { grant = await findAccessToken(token); }
    catch (error) {
      console.error("[TubeX MCP] token store unavailable", error?.message || error);
      return res.status(503).json({ error: "authorization_service_unavailable" });
    }
  }
  try {
    if (request.method === "initialize") {
      return res.status(200).json(jsonRpc(request.id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "TubeX MCP", version: "1.0.0" },
        instructions: "Use os dados públicos da YouTube Data API e, para o canal autorizado, métricas privadas da YouTube Analytics API. Sempre diferencie métricas de terceiros (públicas e acumuladas) das métricas privadas do canal conectado."
      }));
    }
    if (request.method === "ping") return res.status(200).json(jsonRpc(request.id, {}));
    if (request.method === "tools/list") {
      return res.status(200).json(jsonRpc(request.id, { tools: TOOLS }));
    }
    if (request.method === "tools/call") {
      const name = String(request.params?.name || "");
      const input = request.params?.arguments && typeof request.params.arguments === "object" ? request.params.arguments : {};
      if (!TOOLS.some(tool => tool.name === name)) return res.status(200).json(jsonRpc(request.id, {
        content: [{ type: "text", text: `Ferramenta desconhecida: ${name}` }], isError: true
      }));
      const requiredScopes = TOOL_REQUIRED_SCOPES[name] || [];
      const grantedScopes = Array.isArray(grant?.scopes) ? grant.scopes : [];
      if (requiredScopes.some(scope => !grantedScopes.includes(scope))) {
        const challenge = `Bearer resource_metadata="${SERVICE_URL}/.well-known/oauth-protected-resource/api/mcp", error="insufficient_scope", error_description="Conecte sua conta Google para usar esta ferramenta."`;
        return res.status(200).json(jsonRpc(request.id, {
          content: [{ type: "text", text: "Conecte sua conta Google para acessar as métricas privadas do seu canal." }],
          _meta: { "mcp/www_authenticate": [challenge] },
          isError: true
        }));
      }
      const output = await executeTool(name, input, grant);
      return res.status(200).json(jsonRpc(request.id, {
        content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output
      }));
    }
    return res.status(200).json(rpcError(request.id, -32601, "Method not found"));
  } catch (error) {
    const message = String(error?.message || "tool_execution_failed");
    console.error("[TubeX MCP] tool error", nameForLog(request), message);
    return res.status(200).json(jsonRpc(request.id, { content: [{ type: "text", text: message }], isError: true }));
  }
}

function nameForLog(request) { return String(request?.params?.name || request?.method || "unknown").slice(0, 64); }


const FALLBACK_BASE = "https://tubex-backend.vercel.app";
const MCP_AUTH_SCOPES = ["channel.read", "analytics.read", "public.youtube.read"];
function googleScopesFor(mcpScopes) {
  const scopes = ["openid", "email"];
  if (mcpScopes.includes("channel.read") || mcpScopes.includes("analytics.read")) scopes.push("https://www.googleapis.com/auth/youtube.readonly");
  if (mcpScopes.includes("analytics.read")) scopes.push("https://www.googleapis.com/auth/yt-analytics.readonly");
  return scopes;
}
const TABLE = {
  clients: "mcp_oauth_clients",
  transactions: "mcp_oauth_transactions",
  grants: "mcp_oauth_grants",
  access: "mcp_access_tokens",
  refresh: "mcp_refresh_tokens"
};

function baseUrl() { return String(process.env.MCP_PUBLIC_BASE_URL || FALLBACK_BASE).replace(/\/$/, ""); }
function issuer() { return String(process.env.MCP_ISSUER || baseUrl()).replace(/\/$/, ""); }
function resource() { return String(process.env.MCP_RESOURCE_URL || `${baseUrl()}/api/mcp`).replace(/\/$/, ""); }
function randomId(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function secret(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`server_config_missing:${name}`);
  return value;
}
function dbHeaders(prefer = "") {
  const key = secret("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
function dbUrl(table, query = "") { return `${secret("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${table}${query ? `?${query}` : ""}`; }
async function dbGet(table, query) {
  const response = await fetch(dbUrl(table, query), { headers: dbHeaders() });
  if (!response.ok) throw new Error(`mcp_storage_read_failed:${response.status}`);
  return response.json();
}
async function dbAdd(table, row) {
  const response = await fetch(dbUrl(table), { method: "POST", headers: dbHeaders("return=minimal"), body: JSON.stringify(row) });
  if (!response.ok) throw new Error(`mcp_storage_write_failed:${response.status}`);
}
async function dbRemove(table, query) {
  const response = await fetch(dbUrl(table, query), { method: "DELETE", headers: dbHeaders("return=minimal") });
  if (!response.ok) throw new Error(`mcp_storage_delete_failed:${response.status}`);
}
async function dbDeleteReturning(table, query) {
  const response = await fetch(dbUrl(table, query), { method: "DELETE", headers: dbHeaders("return=representation") });
  if (!response.ok) throw new Error(`mcp_storage_delete_failed:${response.status}`);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function dbPatch(table, query, row) {
  const response = await fetch(dbUrl(table, query), { method: "PATCH", headers: dbHeaders("return=minimal"), body: JSON.stringify(row) });
  if (!response.ok) throw new Error(`mcp_storage_update_failed:${response.status}`);
}
function encryptGoogleRefreshToken(plain) {
  const key = createHash("sha256").update(secret("MCP_TOKEN_ENCRYPTION_KEY")).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
function decryptGoogleRefreshToken(payload) {
  const key = createHash("sha256").update(secret("MCP_TOKEN_ENCRYPTION_KEY")).digest();
  const [iv, tag, encrypted] = String(payload || "").split(".");
  if (!iv || !tag || !encrypted) throw new Error("mcp_google_token_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function query(req, key) { return String(req.query?.[key] || new URL(req.url, baseUrl()).searchParams.get(key) || ""); }
function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch {}
    return Object.fromEntries(new URLSearchParams(req.body));
  }
  return {};
}
function redirectError(res, client, redirectUri, state, code) {
  const target = new URL(redirectUri);
  target.searchParams.set("error", code);
  target.searchParams.set("state", state || "");
  target.searchParams.set("iss", issuer());
  return res.redirect(302, target.toString());
}
function validHttpsRedirect(uri) {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
function oauthSafeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
async function consumeTransaction(id, kind) {
  if (!id || !/^[A-Za-z0-9_-]{30,100}$/.test(id)) return null;
  const row = await dbDeleteReturning(TABLE.transactions, `id=eq.${encodeURIComponent(id)}&kind=eq.${encodeURIComponent(kind)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,kind,payload,expires_at`);
  if (!row) return null;
  return row.payload || null;
}
async function findClient(clientId) {
  const rows = await dbGet(TABLE.clients, `client_id=eq.${encodeURIComponent(clientId)}&select=client_id,client_name,redirect_uris,token_endpoint_auth_method`);
  if (rows[0]) return rows[0];
  // ChatGPT uses a Client ID Metadata Document. Only fetch OpenAI's published
  // metadata document, never arbitrary client_id URLs, to prevent SSRF.
  if (!/^https:\/\/chatgpt\.com\/oauth\/(?:client\.json|[A-Za-z0-9_-]+\/client\.json)$/.test(clientId)) return null;
  const response = await fetch(clientId, { redirect: "error", headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const metadata = await response.json();
  if (metadata.client_id !== clientId || !Array.isArray(metadata.redirect_uris) || !metadata.redirect_uris.length) return null;
  return {
    client_id: clientId,
    client_name: String(metadata.client_name || "ChatGPT").slice(0, 100),
    redirect_uris: metadata.redirect_uris,
    token_endpoint_auth_method: String(metadata.token_endpoint_auth_method || "none")
  };
}
function asForm(req) { return parseBody(req); }
function codeChallenge(verifier) { return createHash("sha256").update(String(verifier)).digest("base64url"); }
function randomGoogleState() { return randomId(32); }
function publicResourceMetadata() {
  return {
    resource: resource(),
    authorization_servers: [issuer()],
    scopes_supported: MCP_AUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: "https://www.tubex.app.br"
  };
}
function authorizationMetadata() {
  const base = `${baseUrl()}/api/youtube`;
  return {
    issuer: issuer(),
    authorization_endpoint: `${base}?oauth=authorize`,
    token_endpoint: `${base}?oauth=token`,
    registration_endpoint: `${base}?oauth=register`,
    revocation_endpoint: `${base}?oauth=revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: MCP_AUTH_SCOPES,
    authorization_response_iss_parameter_supported: true
  };
}
function oauthError(res, status, error, description = "") {
  return res.status(status).json({ error, ...(description ? { error_description: description } : {}) });
}

async function handleRegister(req, res) {
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request", "POST required");
  const body = parseBody(req);
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirects.length || redirects.length > 10 || redirects.some(uri => !validHttpsRedirect(uri))) return oauthError(res, 400, "invalid_redirect_uri");
  const clientId = randomId(24);
  const clientName = String(body.client_name || body.software_id || "MCP client").slice(0, 100);
  await dbAdd(TABLE.clients, {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirects,
    token_endpoint_auth_method: "none",
    created_at: new Date().toISOString()
  });
  return res.status(201).json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirects,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: MCP_AUTH_SCOPES.join(" ")
  });
}

async function handleAuthorize(req, res) {
  if (req.method !== "GET") return oauthError(res, 405, "invalid_request");
  const clientId = query(req, "client_id");
  const client = await findClient(clientId);
  if (!client || client.token_endpoint_auth_method && client.token_endpoint_auth_method !== "none") return oauthError(res, 400, "invalid_client");
  const redirectUri = query(req, "redirect_uri");
  if (!client.redirect_uris?.includes(redirectUri)) return oauthError(res, 400, "invalid_request", "redirect_uri is not registered");
  const state = query(req, "state");
  const challenge = query(req, "code_challenge");
  if (query(req, "response_type") !== "code" || query(req, "code_challenge_method") !== "S256" || !challenge || !state) return oauthError(res, 400, "invalid_request", "Authorization code with PKCE S256 and state is required");
  const requestedResource = query(req, "resource");
  if (requestedResource && requestedResource !== resource()) return oauthError(res, 400, "invalid_target", "resource must identify the TubeX MCP server");
  const requestedScopes = query(req, "scope").split(/\s+/).filter(Boolean);
  const scopes = requestedScopes.length ? [...new Set(requestedScopes)] : MCP_AUTH_SCOPES;
  if (scopes.some(scope => !MCP_AUTH_SCOPES.includes(scope))) return oauthError(res, 400, "invalid_scope");
  const nonce = randomGoogleState();
  await dbAdd(TABLE.transactions, {
    id: nonce,
    kind: "google_authorization",
    payload: { client_id: clientId, redirect_uri: redirectUri, state, code_challenge: challenge, scopes, resource: resource() },
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  const callback = `${baseUrl()}/api/mcp-google-callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: secret("GOOGLE_MCP_CLIENT_ID"),
    redirect_uri: callback,
    response_type: "code",
    scope: googleScopesFor(scopes).join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: nonce
  }).toString();
  return res.redirect(302, url.toString());
}

async function handleGoogleCallback(req, res) {
  const googleState = query(req, "state");
  const pending = await consumeTransaction(googleState, "google_authorization");
  if (!pending) return res.status(400).send("A autorização expirou. Volte ao ChatGPT ou Claude e conecte novamente.");
  const googleError = query(req, "error");
  if (googleError) return redirectError(res, null, pending.redirect_uri, pending.state, "access_denied");
  const googleCode = query(req, "code");
  if (!googleCode) return redirectError(res, null, pending.redirect_uri, pending.state, "invalid_grant");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: googleCode,
      client_id: secret("GOOGLE_MCP_CLIENT_ID"),
      client_secret: secret("GOOGLE_MCP_CLIENT_SECRET"),
      redirect_uri: `${baseUrl()}/api/mcp-google-callback`,
      grant_type: "authorization_code"
    })
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) return redirectError(res, null, pending.redirect_uri, pending.state, "invalid_grant");
  const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user.email) return redirectError(res, null, pending.redirect_uri, pending.state, "access_denied");
  if (!token.refresh_token) return redirectError(res, null, pending.redirect_uri, pending.state, "consent_required");

  const code = randomId(32);
  await dbAdd(TABLE.transactions, {
    id: code,
    kind: "authorization_code",
    payload: {
      client_id: pending.client_id,
      redirect_uri: pending.redirect_uri,
      code_challenge: pending.code_challenge,
      scopes: pending.scopes,
      resource: pending.resource,
      email: String(user.email).toLowerCase(),
      encrypted_google_refresh_token: encryptGoogleRefreshToken(token.refresh_token)
    },
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
  const redirect = new URL(pending.redirect_uri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", pending.state);
  redirect.searchParams.set("iss", issuer());
  return res.redirect(302, redirect.toString());
}

async function issueTokens(grantId, clientId, resourceUrl, scopes, res) {
  const accessToken = randomId(32);
  const refreshToken = randomId(48);
  const accessExpires = new Date(Date.now() + 15 * 60 * 1000);
  const refreshExpires = new Date(Date.now() + 30 * 86400000);
  await Promise.all([
    dbAdd(TABLE.access, { token_hash: sha256(accessToken), grant_id: grantId, resource: resourceUrl, expires_at: accessExpires.toISOString() }),
    dbAdd(TABLE.refresh, { token_hash: sha256(refreshToken), grant_id: grantId, client_id: clientId, resource: resourceUrl, expires_at: refreshExpires.toISOString() })
  ]);
  return res.status(200).json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: refreshToken,
    refresh_token_expires_in: 2592000,
    scope: scopes.join(" ")
  });
}

async function handleToken(req, res) {
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request");
  const body = asForm(req);
  if (body.grant_type === "authorization_code") {
    const row = await consumeTransaction(String(body.code || ""), "authorization_code");
    if (!row) return oauthError(res, 400, "invalid_grant");
    const verifier = String(body.code_verifier || "");
    if (body.client_id !== row.client_id || body.redirect_uri !== row.redirect_uri || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !oauthSafeEqual(codeChallenge(verifier), row.code_challenge)) return oauthError(res, 400, "invalid_grant");
    const grantId = randomId(24);
    await dbAdd(TABLE.grants, {
      id: grantId,
      client_id: row.client_id,
      email: row.email,
      encrypted_google_refresh_token: row.encrypted_google_refresh_token,
      scopes: row.scopes,
      resource: row.resource,
      created_at: new Date().toISOString(),
      revoked_at: null
    });
    return issueTokens(grantId, row.client_id, row.resource, row.scopes, res);
  }
  if (body.grant_type === "refresh_token") {
    const oldHash = sha256(String(body.refresh_token || ""));
    const old = await dbDeleteReturning(TABLE.refresh, `token_hash=eq.${oldHash}&client_id=eq.${encodeURIComponent(String(body.client_id || ""))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash,grant_id,resource,expires_at`);
    if (!old) return oauthError(res, 400, "invalid_grant");
    const grants = await dbGet(TABLE.grants, `id=eq.${encodeURIComponent(old.grant_id)}&revoked_at=is.null&select=id,scopes`);
    if (!grants[0]) return oauthError(res, 400, "invalid_grant");
    return issueTokens(old.grant_id, String(body.client_id), old.resource, grants[0].scopes || [], res);
  }
  return oauthError(res, 400, "unsupported_grant_type");
}

async function handleRevoke(req, res) {
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request");
  const body = asForm(req);
  const value = String(body.token || "");
  if (!value) return res.status(200).end();
  const digest = sha256(value);
  const access = await dbGet(TABLE.access, `token_hash=eq.${digest}&select=grant_id`);
  const refresh = await dbGet(TABLE.refresh, `token_hash=eq.${digest}&select=grant_id`);
  const grantId = access[0]?.grant_id || refresh[0]?.grant_id;
  if (grantId) {
    await dbPatch(TABLE.grants, `id=eq.${encodeURIComponent(grantId)}`, { revoked_at: new Date().toISOString() });
    await Promise.all([
      dbRemove(TABLE.access, `grant_id=eq.${encodeURIComponent(grantId)}`),
      dbRemove(TABLE.refresh, `grant_id=eq.${encodeURIComponent(grantId)}`)
    ]);
  }
  return res.status(200).end();
}

async function tubexMcpAuthHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const action = query(req, "oauth");
  try {
    if (action === "openai-apps-challenge") {
      const token = String(process.env.OPENAI_MCP_DOMAIN_VERIFICATION_TOKEN || "").trim();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      if (!token) return res.status(503).send("Domain verification token is not configured");
      return res.status(200).send(token);
    }
    if (action === "protected-resource") return res.status(200).json(publicResourceMetadata());
    if (action === "metadata") return res.status(200).json(authorizationMetadata());
    if (action === "register") return await handleRegister(req, res);
    if (action === "authorize") return await handleAuthorize(req, res);
    if (action === "google-callback") return await handleGoogleCallback(req, res);
    if (action === "token") return await handleToken(req, res);
    if (action === "revoke") return await handleRevoke(req, res);
    return res.status(404).json({ error: "oauth_route_not_found" });
  } catch (error) {
    console.error("[TubeX MCP OAuth]", action, error?.message || error);
    if (action === "authorize" || action === "token" || action === "register" || action === "revoke") return oauthError(res, 500, "server_error");
    if (action === "google-callback") return res.status(500).send("Não foi possível completar a autorização. Tente conectar novamente.");
    return res.status(503).json({ error: "oauth_service_unavailable" });
  }
}

export default async function handler(req, res) {

  const routeUrl = new URL(req.url || "/", "https://tubex-backend.vercel.app");
  const mcpMode = String(req.query?.mcp || routeUrl.searchParams.get("mcp") || "");
  const oauthMode = String(req.query?.oauth || routeUrl.searchParams.get("oauth") || "");
  if (mcpMode === "1") return tubexMcpHandler(req, res);
  if (oauthMode) return tubexMcpAuthHandler(req, res);

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
      const requestedChannelId = String(body?.channelId || "").trim();
      const selectedChannelId = /^UC[A-Za-z0-9_-]{20,}$/.test(requestedChannelId) ? requestedChannelId : "";
      if (!selectedChannelId) {
        return res.status(200).json({
          success: false,
          error: "active_channel_id_required",
          engagedViews: null,
          target
        });
      }
      const analyticsChannelId = `channel==${selectedChannelId}`;

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
        url.searchParams.set("ids", analyticsChannelId);
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
      const isAnalyticsDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
      const requestedStartDate = String(body?.startDate || "").trim();
      const requestedEndDate = String(body?.endDate || "").trim();
      let startDate = isAnalyticsDate(requestedStartDate) ? requestedStartDate : target === "channel" ? dateAtStartOfDay(days) : dateAtStartOfDay(30);

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
            if (publishedAt && !isAnalyticsDate(requestedStartDate)) startDate = new Date(publishedAt).toISOString().slice(0, 10);
          } catch (e) {
            console.warn("[TubeX] engagedViews publication lookup failed:", e?.message || e);
          }
        }
      }

      // Analytics can lag recent dates. Use yesterday first and two days ago
      // as a fallback without changing any existing SEO behavior.
      const endDates = isAnalyticsDate(requestedEndDate)
        ? [requestedEndDate, (() => { const d = new Date(`${requestedEndDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })()]
        : [dateAtStartOfDay(1), dateAtStartOfDay(2)];
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
            const dayIndex = headers.indexOf("day");
            const returnedDays = dayIndex >= 0
              ? scopedRows.map(row => String(row?.[dayIndex] || "")).filter(value => isAnalyticsDate(value)).sort()
              : [];
            const actualEndDate = returnedDays.length ? returnedDays[returnedDays.length - 1] : endDate;
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
                endDate: actualEndDate,
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

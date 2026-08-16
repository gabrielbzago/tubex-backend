const YT = 'https://www.googleapis.com/youtube/v3';
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-client');
  res.setHeader('Vary', 'Origin');
}

function fail(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function bearer(req) {
  const raw = req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

async function googleJson(url, accessToken) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) {
    const err = new Error(data?.error?.message || `Google API ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function verifyGoogleToken(accessToken) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(accessToken));
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error_description) {
    const e = new Error(data.error_description || 'Token Google inválido ou expirado');
    e.status = 401;
    throw e;
  }
  return data;
}

function isoDate(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

async function fetchChannel(accessToken) {
  const data = await googleJson(`${YT}/channels?part=snippet,statistics,contentDetails&mine=true`, accessToken);
  const c = data.items?.[0];
  if (!c) {
    const e = new Error('Nenhum canal do YouTube foi encontrado na conta autorizada.');
    e.status = 404;
    throw e;
  }
  return {
    id: c.id,
    title: c.snippet?.title || '',
    description: c.snippet?.description || '',
    publishedAt: c.snippet?.publishedAt || '',
    country: c.snippet?.country || '',
    customUrl: c.snippet?.customUrl || '',
    thumbnail: c.snippet?.thumbnails?.high?.url || c.snippet?.thumbnails?.default?.url || '',
    subscribers: safeNum(c.statistics?.subscriberCount),
    views: safeNum(c.statistics?.viewCount),
    videoCount: safeNum(c.statistics?.videoCount),
    hiddenSubscriberCount: !!c.statistics?.hiddenSubscriberCount,
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads || ''
  };
}

async function fetchUploads(accessToken, playlistId, limit = 50) {
  if (!playlistId) return [];
  const p = await googleJson(`${YT}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=${Math.min(limit, 50)}`, accessToken);
  const ids = (p.items || []).map(x => x.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await googleJson(`${YT}/videos?part=snippet,statistics,contentDetails,status&id=${ids.join(',')}`, accessToken);
  return (v.items || []).map(x => ({
    id: x.id,
    title: x.snippet?.title || '',
    description: x.snippet?.description || '',
    publishedAt: x.snippet?.publishedAt || '',
    channelTitle: x.snippet?.channelTitle || '',
    duration: x.contentDetails?.duration || '',
    tags: x.snippet?.tags || [],
    categoryId: x.snippet?.categoryId || '',
    privacyStatus: x.status?.privacyStatus || '',
    views: safeNum(x.statistics?.viewCount),
    likes: safeNum(x.statistics?.likeCount),
    comments: safeNum(x.statistics?.commentCount),
    favoriteCount: safeNum(x.statistics?.favoriteCount)
  }));
}

async function analytics(accessToken, channelId) {
  const end = isoDate(1);
  const start = isoDate(29);
  const base = `ids=channel%3D${encodeURIComponent(channelId)}&startDate=${start}&endDate=${end}`;

  const dailyUrl = `${YTA}?${base}&dimensions=day&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained,subscribersLost&sort=day`;
  const topUrl = `${YTA}?${base}&dimensions=video&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained&sort=-views&maxResults=20`;
  const trafficUrl = `${YTA}?${base}&dimensions=trafficSourceType&metrics=views,estimatedMinutesWatched,averageViewDuration&sort=-views&maxResults=20`;
  const deviceUrl = `${YTA}?${base}&dimensions=deviceType&metrics=views,estimatedMinutesWatched,averageViewDuration&sort=-views&maxResults=20`;

  const results = await Promise.allSettled([
    googleJson(dailyUrl, accessToken),
    googleJson(topUrl, accessToken),
    googleJson(trafficUrl, accessToken),
    googleJson(deviceUrl, accessToken)
  ]);

  const [daily, top, traffic, device] = results.map(x => x.status === 'fulfilled' ? x.value : null);
  const failed = results.filter(x => x.status === 'rejected');
  const analyticsError = failed[0]?.reason?.data?.error?.errors?.[0]?.reason || failed[0]?.reason?.message || '';

  return {
    period: { startDate: start, endDate: end },
    daily: daily?.rows || [],
    topVideos: top?.rows || [],
    trafficSources: traffic?.rows || [],
    devices: device?.rows || [],
    available: !!(daily || top),
    error: analyticsError
  };
}

async function buildContext(accessToken) {
  const token = await verifyGoogleToken(accessToken);
  const channel = await fetchChannel(accessToken);
  const videos = await fetchUploads(accessToken, channel.uploadsPlaylistId, 50);
  let analyticsData;
  try {
    analyticsData = await analytics(accessToken, channel.id);
  } catch (e) {
    analyticsData = { available: false, daily: [], topVideos: [], trafficSources: [], devices: [], error: e.message };
  }

  return {
    fetchedAt: new Date().toISOString(),
    google: { email: token.email || '', scope: token.scope || '' },
    channel: { ...channel, uploadsPlaylistId: undefined },
    videos,
    analytics: analyticsData
  };
}

function contextForPrompt(ctx) {
  const compact = {
    fetchedAt: ctx.fetchedAt,
    channel: ctx.channel,
    videos: (ctx.videos || []).slice(0, 50),
    analytics: {
      period: ctx.analytics?.period,
      daily: (ctx.analytics?.daily || []).slice(-30),
      topVideos: (ctx.analytics?.topVideos || []).slice(0, 20),
      trafficSources: (ctx.analytics?.trafficSources || []).slice(0, 20),
      devices: (ctx.analytics?.devices || []).slice(0, 20),
      available: !!ctx.analytics?.available,
      error: ctx.analytics?.error || ''
    }
  };
  return JSON.stringify(compact);
}

function systemPrompt() {
  return `Você é o TubeX Chat AI, um consultor sênior especializado exclusivamente em YouTube.

Você está conversando com o proprietário de um canal. O contexto recebido contém dados reais do canal e, quando autorizado, dados reais do YouTube Analytics.

REGRAS CRÍTICAS:
- Use os dados fornecidos como fonte principal.
- Nunca invente métricas, vídeos, tendências ou resultados.
- Diferencie claramente dado observado de interpretação estratégica.
- Se uma métrica não estiver disponível, diga isso em vez de estimar.
- Quando fizer cálculos, mostre a lógica de forma simples.
- Não trate views totais como views de um período.
- Para terceiros, não presuma acesso a Analytics privado.
- Seja específico para ESTE canal; evite conselhos genéricos.
- Responda em português do Brasil, salvo pedido contrário.
- O usuário pode perguntar sobre SEO, títulos, thumbnails, CTR, retenção, conteúdo, calendário, monetização, concorrência, estratégia, performance e próximos vídeos.
- Não alegue acesso a dados que não estão no contexto.

ESTILO:
Consultoria premium: direto, claro, analítico e acionável. Quando houver um problema, explique evidência, interpretação, impacto e ação recomendada.`;
}

async function askOpenAI(message, history, ctx) {
  if (!process.env.OPENAI_API_KEY) {
    const e = new Error('OPENAI_API_KEY não configurada na Vercel.');
    e.status = 500;
    throw e;
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const safeHistory = Array.isArray(history) ? history.slice(-12).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content || '').slice(0, 5000)
  })) : [];

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'system', content: `DADOS DO CANAL:\n${contextForPrompt(ctx)}` },
      ...safeHistory,
      { role: 'user', content: String(message || '').slice(0, 5000) }
    ],
    temperature: 0.35,
    max_tokens: 2200
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data?.error?.message || `OpenAI ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ success: true, service: 'tubex-chat-ai', status: 'online' });
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

  const client = req.headers['x-client'] || '';
  if (client !== 'tubex-chat-ai-v1') return fail(res, 403, 'invalid_client');
  if (process.env.API_KEY) {
    const supplied = req.headers['x-api-key'] || bearer(req);
    if (supplied !== process.env.API_KEY) return fail(res, 403, 'unauthorized');
  }

  const body = getBody(req);
  const action = body.action || 'connect';
  const accessToken = body.accessToken || bearer(req);
  if (!accessToken) return fail(res, 401, 'google_auth_required');

  try {
    if (action === 'connect' || action === 'context') {
      const ctx = await buildContext(accessToken);
      return res.status(200).json({ success: true, connected: true, context: ctx });
    }

    if (action === 'chat') {
      if (!body.message || !String(body.message).trim()) return fail(res, 400, 'message_required');
      let ctx = body.context;
      if (!ctx?.channel?.id || body.refreshContext === true) ctx = await buildContext(accessToken);
      const answer = await askOpenAI(body.message, body.history, ctx);
      return res.status(200).json({ success: true, answer, context: ctx });
    }

    return fail(res, 400, 'invalid_action');
  } catch (e) {
    console.error('TubeX Chat backend error:', e);
    if (e.status === 401 || e.status === 403) return fail(res, 401, 'google_authorization_required', { detail: e.message });
    return fail(res, e.status || 500, 'backend_error', { detail: e.message });
  }
}

// TubeX — /api (health) + renovação do token Google da extensão (2026-11-25)
// Recebe o refresh token do Google que a extensão guardou no login
// (Supabase devolve como provider_refresh_token) e devolve um access token
// novo. O client secret fica só aqui no servidor.
//
// Variáveis de ambiente na Vercel (mesmos valores do provedor Google no
// Supabase → Authentication → Providers → Google):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
// Nunca registre o refresh token em log.

// Atende /api/google-token via rewrite no vercel.json (/api/google-token ->
// /api/api?google_token=1), para não criar uma 13ª função no plano Hobby.

async function googleTokenHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return res.status(503).json({ success: false, error: "google_oauth_env_missing" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const refreshToken = String(body?.refreshToken || "").trim();
  if (!refreshToken || refreshToken.length > 1024) {
    return res.status(400).json({ success: false, error: "refresh_token_required" });
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.access_token) {
      // invalid_grant = refresh token revogado/expirado: a extensão pede login de novo.
      const error = String(data?.error || `google_http_${response.status}`);
      return res.status(error === "invalid_grant" ? 401 : 502).json({ success: false, error });
    }
    return res.status(200).json({
      success: true,
      accessToken: data.access_token,
      expiresIn: Number(data.expires_in) || 3600,
      scope: String(data.scope || "")
    });
  } catch (error) {
    return res.status(502).json({ success: false, error: "google_token_request_failed" });
  }
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (q.google_token === "1" || String(req.url || "").includes("google_token=1")) {
    return googleTokenHandler(req, res);
  }
  res.status(200).json({
    status: "ok",
    service: "tubex-backend",
    time: new Date().toISOString()
  });
}

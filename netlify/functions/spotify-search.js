// ─── Spotify Search Proxy — Client Credentials flow ─────────────────────────
// Holds the client SECRET server-side and proxies public search requests to
// the Spotify Web API. This is a SEPARATE auth flow from the user-PKCE login
// in src/spotify-auth.js. Client Credentials tokens only grant access to
// public endpoints (search, artist, track) — no user data, no playback.
//
// Required Netlify env vars (set in the Netlify dashboard — NOT committed):
//   SPOTIFY_CLIENT_ID      (same value the frontend uses)
//   SPOTIFY_CLIENT_SECRET  (from the Spotify Developer Dashboard)

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
  // Re-use the cached token until ~1 minute before it expires.
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Spotify credentials");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
  const data = await r.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const type = url.searchParams.get("type") || "track";
    if (!q) {
      return new Response(JSON.stringify({ error: "Missing q" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const token = await getAppToken();
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&limit=1`;
    const r = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();

    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
};

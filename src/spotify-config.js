// ─── Spotify App Configuration ─────────────────────────────────────────────
//
// No editing needed here. On first load the app asks for your Spotify Client
// ID (see README) and remembers it on that device. For local development you
// can set VITE_SPOTIFY_CLIENT_ID in a .env file instead.
//
// The redirect URI is wherever the app is running plus /callback. Register
// that exact address in your Spotify app's settings, e.g.
//   http://127.0.0.1:5173/callback        (local dev — Spotify rejects "localhost")
//   https://your-site.netlify.app/callback
//
// BPM lookup keys live on the server, not here — see netlify/functions/bpm.mjs.

export const SPOTIFY_CONFIG = {
  redirectUri: `${window.location.origin}/callback`,
};

// ─── Per-device Client ID (localStorage) ─────────────────────────────────────
// Other orgs can run WOW Player with their own Spotify Developer app by saving
// their Client ID here. Falls back to VITE_SPOTIFY_CLIENT_ID env var (local dev).

export const SPOTIFY_CLIENT_ID_KEY = "wow_spotify_client_id";

export function getClientId() {
  try {
    const stored = localStorage.getItem(SPOTIFY_CLIENT_ID_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {}
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
}

export function saveClientId(id) {
  try { localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, id.trim()); } catch {}
}

export function clearClientId() {
  try { localStorage.removeItem(SPOTIFY_CLIENT_ID_KEY); } catch {}
}

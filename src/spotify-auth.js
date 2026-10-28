// ─── Spotify Auth (Authorization Code + PKCE) ─────────────────────────────
// Follows the exact spec from:
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

// INVARIANT: refreshAccessToken() must not call logout() on transient network
// errors. Only a Spotify invalid_grant response proves the refresh token is bad.

const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

const TOKEN_KEY = "wow_spotify_token";
const VERIFIER_KEY = "wow_pkce_verifier";

// ─── PKCE Helpers (per RFC 7636) ───────────────────────────────────────────

function generateCodeVerifier() {
  // Must be 43-128 characters, using unreserved URI characters
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~";
  const values = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(values, (v) => possible[v % possible.length]).join("");
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Auth Flow ─────────────────────────────────────────────────────────────

export async function loginWithSpotify(clientId, redirectUri) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier — we need it when exchanging the code for a token
  localStorage.setItem(VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    show_dialog: "true",
  });

  // Redirect to Spotify
  window.location.href = "https://accounts.spotify.com/authorize?" + params.toString();
}

export async function handleCallback(clientId, redirectUri) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const error = urlParams.get("error");

  if (error) {
    console.error("Spotify auth error:", error);
    // Clean URL
    window.history.replaceState({}, document.title, "/");
    return null;
  }

  if (!code) return null;

  const codeVerifier = localStorage.getItem(VERIFIER_KEY);
  if (!codeVerifier) {
    console.error("No PKCE verifier found in localStorage");
    window.history.replaceState({}, document.title, "/");
    return null;
  }

  console.log("Exchanging auth code for token...");
  console.log("Client ID:", clientId);
  console.log("Redirect URI:", redirectUri);
  console.log("Code verifier length:", codeVerifier.length);

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    console.log("Token request body:", body.toString());

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    const responseText = await response.text();
    console.log("Token response status:", response.status);
    console.log("Token response body:", responseText);

    if (!response.ok) {
      console.error("Token exchange failed:", response.status, responseText);
      // Clean up and let user try again
      localStorage.removeItem(VERIFIER_KEY);
      window.history.replaceState({}, document.title, "/");
      return null;
    }

    const tokenData = JSON.parse(responseText);
    const enriched = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };

    localStorage.setItem(TOKEN_KEY, JSON.stringify(enriched));
    localStorage.setItem("wow_token_first_stored_at", String(Date.now()));
    localStorage.removeItem(VERIFIER_KEY);

    // Clean URL — go to root
    window.history.replaceState({}, document.title, "/");

    return enriched;
  } catch (err) {
    console.error("Token exchange error:", err);
    localStorage.removeItem(VERIFIER_KEY);
    window.history.replaceState({}, document.title, "/");
    return null;
  }
}

export async function refreshAccessToken(clientId) {
  const stored = getStoredToken();
  if (!stored?.refresh_token) return null;

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: stored.refresh_token,
      }),
    });

    if (!response.ok) {
      let errorBody = {};
      try { errorBody = await response.json(); } catch {}
      console.error("Token refresh failed:", response.status, errorBody);

      if (errorBody.error === "invalid_grant") {
        console.warn("Refresh token is invalid — logging out (session revoked by Spotify)");
        logoutDueToRevocation();
        return null;
      }
      console.warn("Transient refresh failure — preserving tokens for retry", response.status, errorBody);
      return stored;
    }

    const tokenData = await response.json();
    const enriched = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || stored.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };

    localStorage.setItem(TOKEN_KEY, JSON.stringify(enriched));
    return enriched;
  } catch (err) {
    // Network error (DNS, offline, CORS blip, laptop just woke up and WiFi
    // hasn't fully reconnected). DO NOT nuke the token - Spotify hasn't told
    // us the refresh_token is invalid. The next attempt will retry.
    console.warn("Token refresh network error — preserving tokens", err);
    return stored;
  }
}

export async function getAccessToken(clientId) {
  let stored = getStoredToken();
  if (!stored) return null;

  if (stored.expires_at - Date.now() < 60000) {
    const refreshed = await refreshAccessToken(clientId);
    if (refreshed) stored = refreshed;
  }

  return stored.access_token;
}

export function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  const token = getStoredToken();
  return !!(token?.access_token || token?.refresh_token);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem("wow_token_first_stored_at");
}

// Called specifically when Spotify revokes the refresh token (invalid_grant).
// Sets a flag so the login screen can show an informative banner instead of
// the user just landing on login with no context. Also logs token age for
// diagnostic - helps identify whether Dev Mode tokens have an undocumented TTL.
export function logoutDueToRevocation() {
  try {
    const firstStored = localStorage.getItem("wow_token_first_stored_at");
    if (firstStored) {
      const ageDays = (Date.now() - parseInt(firstStored, 10)) / (1000 * 60 * 60 * 24);
      console.warn(`Refresh token died after ${ageDays.toFixed(2)} days since first store.`);
    }
  } catch {}
  localStorage.setItem("wow_session_revoked_at", String(Date.now()));
  logout();
}

export function consumeRevocationFlag() {
  const raw = localStorage.getItem("wow_session_revoked_at");
  if (!raw) return null;
  localStorage.removeItem("wow_session_revoked_at");
  const ts = parseInt(raw, 10);
  if (!Number.isFinite(ts)) return null;
  // Only treat as recent if within last 5 minutes - stale flags shouldn't fire.
  if (Date.now() - ts > 5 * 60 * 1000) return null;
  return ts;
}

// ─── DJ Roster (multi-DJ quick switch) ──────────────────────────────────────

const ROSTER_KEY = "wow_dj_roster";

export function loadRoster() {
  try { return JSON.parse(localStorage.getItem(ROSTER_KEY) || "[]"); }
  catch { return []; }
}

function saveRoster(roster) {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
}

// Save current DJ's token to the roster (called after successful login/refresh)
export function saveToRoster(userId, displayName, tokenData) {
  const roster = loadRoster();
  const existing = roster.findIndex((d) => d.userId === userId);
  const entry = {
    userId,
    displayName: displayName || userId,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    savedAt: Date.now(),
  };
  if (existing >= 0) {
    roster[existing] = entry;
  } else {
    roster.push(entry);
  }
  saveRoster(roster);
}

// Switch to a saved DJ — restores their token as the active session
export function switchToDJ(userId) {
  const roster = loadRoster();
  const dj = roster.find((d) => d.userId === userId);
  if (!dj) return false;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: dj.access_token,
    refresh_token: dj.refresh_token,
    expires_at: dj.expires_at,
  }));
  return true;
}

// Remove a DJ from the roster
export function removeFromRoster(userId) {
  const roster = loadRoster().filter((d) => d.userId !== userId);
  saveRoster(roster);
}

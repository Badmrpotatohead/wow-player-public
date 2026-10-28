// ─── App.jsx — Main entry point ────────────────────────────────────────────
// Handles auth state, DJ roster, and routes between login screen and player.

import { useState, useEffect, useCallback } from "react";
import { SPOTIFY_CONFIG, getClientId, saveClientId } from "./spotify-config";
import { isLoggedIn, handleCallback, logout, getStoredToken, getAccessToken, saveToRoster, switchToDJ, loadRoster } from "./spotify-auth";
import { getCurrentUser } from "./spotify-api";
import { useSpotifyPlayer } from "./useSpotifyPlayer";
import LoginScreen from "./LoginScreen";
import WOWPlayer from "./WOWPlayer";
import SetupScreen from "./SetupScreen";
import OtsAVImport from "./OtsAVImport";
import DJMode from "./DJMode";

// Initial DJ-mode view from the URL path (deep links / refresh mid-set).
function initialDjView() {
  try {
    const p = window.location.pathname;
    if (p.includes("/dj-import")) return "import";
    if (p.includes("/dj-mode")) return "play";
  } catch {}
  return null;
}

export default function App() {
  const [clientId, setClientId] = useState(() => getClientId());
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  // null = normal Spotify flow, "import" = CSV import, "play" = DJ Mode player
  const [djView, setDjView] = useState(initialDjView);

  const { redirectUri } = SPOTIFY_CONFIG;

  // Save the current user to the DJ roster after connecting
  const saveDJToRoster = useCallback(async () => {
    try {
      const token = await getAccessToken(clientId);
      if (!token) return;
      const user = await getCurrentUser(token);
      if (user) {
        const stored = getStoredToken();
        if (stored) {
          saveToRoster(user.id, user.display_name || user.id, stored);
        }
      }
    } catch (err) {
      console.warn("Could not save DJ to roster:", err.message);
    }
  }, [clientId]);

  // On mount: check for auth callback or existing session
  useEffect(() => {
    if (!clientId) return;

    // ─── INVARIANT (do not regress) ──────────────────────────────────────────
    // init() MUST always call setLoading(false), even on exception. If loading
    // stays true, the app freezes on "Connecting to Spotify…" with no path to
    // the login screen (see #38). The try/finally guarantees this.
    let loadingSafety;
    async function init() {
      try {
        const callbackResult = await handleCallback(clientId, redirectUri);
        if (callbackResult) {
          setAuthed(true);
          setTimeout(() => saveDJToRoster(), 1500);
          return;
        }
        if (isLoggedIn()) {
          setAuthed(true);
          setTimeout(() => saveDJToRoster(), 2000);
        }
      } catch (err) {
        console.error("Auth init failed — falling through to login:", err);
        try {
          localStorage.removeItem("wow_spotify_token");
          localStorage.removeItem("wow_pkce_verifier");
        } catch {}
      } finally {
        setLoading(false);
        if (loadingSafety) clearTimeout(loadingSafety);
      }
    }

    // Safety net: if init somehow never resolves, stop loading after 8s so the
    // user still reaches the login screen instead of an infinite spinner.
    loadingSafety = setTimeout(() => setLoading(false), 8000);

    init();

    return () => { if (loadingSafety) clearTimeout(loadingSafety); };
  }, [clientId, redirectUri, saveDJToRoster]);

  // Keep DJ view in sync with browser back/forward navigation.
  useEffect(() => {
    const onPop = () => setDjView(initialDjView());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Spotify player hook (only polls when authed)
  const player = useSpotifyPlayer(authed ? clientId : null);

  const handleLogout = () => {
    logout();
    setAuthed(false);
  };

  const handleSwitchDJ = (userId) => {
    if (switchToDJ(userId)) {
      setAuthed(true);
      // Update roster with potentially refreshed token
      setTimeout(() => saveDJToRoster(), 1500);
    }
  };

  // ─── DJ Mode navigation helpers ───────────────────────────────────────────
  const goDjView = (view) => {
    setDjView(view);
    try {
      const path = view === "import" ? "/dj-import" : view === "play" ? "/dj-mode" : "/";
      window.history.pushState({}, "", path);
    } catch {}
  };

  // DJ Mode views take priority — they're an explicit, separate flow that the
  // operator opts into from the login screen (Spotify-mode DJs are unaffected).
  if (djView === "import") {
    return (
      <OtsAVImport
        onComplete={() => goDjView("play")}
        onCancel={() => goDjView(null)}
      />
    );
  }
  if (djView === "play") {
    return <DJMode onEndSet={() => goDjView(null)} />;
  }

  // First-run: no Client ID saved yet — show setup screen before anything else
  if (!clientId) {
    return (
      <SetupScreen
        onComplete={(id) => {
          saveClientId(id);
          setClientId(id);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0a0a12, #0d1117, #111520)", fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.5)", fontSize: "18px" }}>
        Connecting to Spotify…
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginScreen
        clientId={clientId}
        redirectUri={redirectUri}
        onSwitchDJ={handleSwitchDJ}
        onStartDJImport={() => goDjView("import")}
        onResumeDJ={() => goDjView("play")}
      />
    );
  }

  return <WOWPlayer player={player} onLogout={handleLogout} />;
}

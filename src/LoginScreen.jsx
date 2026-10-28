// ─── Spotify Login Screen with DJ Quick Switch ───────────────────────────────
import { useEffect, useState } from "react";
import { consumeRevocationFlag, loginWithSpotify, loadRoster, removeFromRoster } from "./spotify-auth";

function SpotifyLogo() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.06 20.04 8.7c.5.3.7 1.02.4 1.56-.299.421-1.02.599-1.559.42z" />
    </svg>
  );
}

// Does a non-empty imported OtsAV set exist on this device?
function hasSavedDjSet() {
  try {
    const arr = JSON.parse(localStorage.getItem("wow_otsav_playlist") || "[]");
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

export default function LoginScreen({ clientId, redirectUri, onSwitchDJ, onStartDJImport, onResumeDJ }) {
  const [roster] = useState(loadRoster);
  const [removingId, setRemovingId] = useState(null);
  const [wasRevoked, setWasRevoked] = useState(false);
  const [resumable] = useState(hasSavedDjSet);

  useEffect(() => {
    if (consumeRevocationFlag()) setWasRevoked(true);
  }, []);

  const handleRemove = (userId, e) => {
    e.stopPropagation();
    if (window.confirm("Remove this DJ from the quick-switch list?")) {
      removeFromRoster(userId);
      setRemovingId(userId);
    }
  };

  const savedDJs = roster.filter((d) => d.userId !== removingId);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0a12 0%, #0d1117 20%, #111520 45%, #15121f 70%, #0d1117 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        color: "rgba(255,255,255,0.9)",
        padding: "40px",
      }}
    >
      <img
        src="/wow-logo.jpeg"
        alt="West Orlando Westies"
        style={{ height: "140px", objectFit: "contain", marginBottom: "32px", borderRadius: "14px", filter: "brightness(0.85) saturate(0.8)" }}
      />

      {resumable && (
        <button
          onClick={onResumeDJ}
          style={{
            marginBottom: "20px",
            background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)",
            color: "white",
            border: "none",
            borderRadius: "50px",
            padding: "12px 32px",
            fontSize: "15px",
            fontWeight: 700,
            fontFamily: "'Oswald', sans-serif",
            letterSpacing: "1px",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(91,184,196,0.3)",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          ▶ Resume DJ Set
        </button>
      )}

      {wasRevoked && (
        <div
          role="status"
          style={{
            position: "relative",
            maxWidth: "440px",
            width: "100%",
            marginBottom: "16px",
            padding: "16px 48px 16px 20px",
            borderRadius: "12px",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.34)",
            color: "rgba(255,255,255,0.88)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}
        >
          <button
            type="button"
            aria-label="Dismiss session ended message"
            onClick={() => setWasRevoked(false)}
            style={{
              position: "absolute",
              top: "10px",
              right: "12px",
              width: "28px",
              height: "28px",
              border: "none",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.72)",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px", color: "#fbbf24" }}>
            Spotify session ended
          </div>
          <div style={{ fontSize: "14px", lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>
            Your Spotify connection was revoked. This usually happens when too many DJs have used this app (the 5-user limit) or after a long period of inactivity. Just log in again to continue.
          </div>
        </div>
      )}

      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          borderRadius: "20px",
          padding: "48px",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <SpotifyLogo />

        <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: "24px", fontWeight: 500, marginTop: "16px", marginBottom: "12px" }}>
          {savedDJs.length > 0 ? "Welcome Back" : "Connect Your Spotify"}
        </h2>

        {/* Saved DJs quick switch */}
        {savedDJs.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>
              Tap your name to start DJing
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {savedDJs.map((dj) => (
                <div
                  key={dj.userId}
                  onClick={() => onSwitchDJ(dj.userId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    background: "rgba(91,184,196,0.08)",
                    border: "1px solid rgba(91,184,196,0.2)",
                    borderRadius: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(91,184,196,0.15)";
                    e.currentTarget.style.borderColor = "rgba(91,184,196,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(91,184,196,0.08)";
                    e.currentTarget.style.borderColor = "rgba(91,184,196,0.2)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 700, color: "white", fontFamily: "'Oswald', sans-serif" }}>
                      {(dj.displayName || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{dj.displayName}</div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>@{dj.userId}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemove(dj.userId, e)}
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: "16px", padding: "4px 8px" }}
                    title="Remove from quick switch"
                  >✕</button>
                </div>
              ))}
            </div>

            <div style={{ margin: "20px 0 0", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px" }}>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginBottom: "12px" }}>New DJ? Add yourself:</p>
            </div>
          </div>
        )}

        {savedDJs.length === 0 && (
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: "32px" }}>
            Sign in with your Spotify account to display the currently playing track, BPM, and upcoming queue in real time.
          </p>
        )}

        <button
          onClick={() => loginWithSpotify(clientId, redirectUri)}
          style={{
            background: "#1DB954",
            color: "white",
            border: "none",
            borderRadius: "50px",
            padding: savedDJs.length > 0 ? "12px 36px" : "16px 48px",
            fontSize: savedDJs.length > 0 ? "14px" : "16px",
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: "0 4px 16px rgba(29,185,84,0.3)",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = "scale(1.04)";
            e.target.style.boxShadow = "0 6px 24px rgba(29,185,84,0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "scale(1)";
            e.target.style.boxShadow = "0 4px 16px rgba(29,185,84,0.3)";
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.06 20.04 8.7c.5.3.7 1.02.4 1.56-.299.421-1.02.599-1.559.42z" />
          </svg>
          {savedDJs.length > 0 ? "Add New DJ" : "Log in with Spotify"}
        </button>

        {/* OtsAV DJ Mode — separate flow for DJs who run OtsAV instead of Spotify */}
        <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={onStartDJImport}
            style={{
              background: "rgba(91,184,196,0.1)",
              color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(91,184,196,0.3)",
              borderRadius: "50px",
              padding: "11px 28px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(91,184,196,0.18)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(91,184,196,0.1)"; }}
          >
            🎚️ OtsAV DJ Mode
          </button>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "10px", lineHeight: 1.5 }}>
            Import a DJ's OtsAV playlist export and run the set without Spotify.
          </p>
        </div>

        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", marginTop: "20px", lineHeight: 1.5 }}>
          Requires a Spotify Premium account for playback data.
          <br />
          We only read your playback state — nothing is stored on any server.
        </p>
      </div>

      <div style={{ marginTop: "28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <img
          src="/venmo-qr.png"
          alt="Venmo QR code for @Christopher-Steven"
          style={{ width: "88px", height: "88px", objectFit: "contain", borderRadius: "10px", opacity: 0.6 }}
        />
        <a
          href="https://venmo.com/Christopher-Steven"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "12px",
            color: "rgba(255,255,255,0.25)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
        >
          Enjoying WOW Player? Tip the developer —{" "}
          <span style={{ textDecoration: "underline" }}>@Christopher-Steven on Venmo</span>
        </a>
      </div>
    </div>
  );
}

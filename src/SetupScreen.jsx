import { useState } from "react";

const CLIENT_ID_PATTERN = /^[a-f0-9]{32}$/i;

export default function SetupScreen({ onComplete }) {
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");

  const appUrl = window.location.origin;

  const handleSubmit = (e) => {
    e.preventDefault();
    const id = clientId.trim();
    if (!id) { setError("Please enter your Spotify Client ID."); return; }
    if (!CLIENT_ID_PATTERN.test(id)) {
      setError("That doesn't look right — a Spotify Client ID is 32 lowercase hex characters.");
      return;
    }
    onComplete(id);
  };

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
      background: "linear-gradient(135deg, #0a0a12 0%, #0d1117 20%, #111520 45%, #15121f 70%, #0d1117 100%)",
      padding: "24px", boxSizing: "border-box"
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');`}</style>

      <div style={{
        width: "100%", maxWidth: "520px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px", padding: "40px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: "30px", fontWeight: 700,
            letterSpacing: "3px", textTransform: "uppercase", color: "#fff", marginBottom: "8px"
          }}>WOW Player</div>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px" }}>
            Spotify Client ID Setup
          </div>
        </div>

        <div style={{
          background: "rgba(91,184,196,0.08)", border: "1px solid rgba(91,184,196,0.2)",
          borderRadius: "12px", padding: "20px", marginBottom: "28px",
          fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.75"
        }}>
          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: "10px" }}>
            Quick setup — takes about 2 minutes:
          </div>
          <ol style={{ paddingLeft: "20px", margin: 0 }}>
            <li>Go to <strong style={{ color: "#5bb8c4" }}>developer.spotify.com</strong> and create a free app</li>
            <li style={{ marginTop: "6px" }}>Under <em>Redirect URIs</em>, add exactly:<br />
              <code style={{
                display: "inline-block", marginTop: "5px", padding: "4px 10px",
                background: "rgba(0,0,0,0.35)", borderRadius: "6px",
                fontSize: "12px", color: "#e8b84a", wordBreak: "break-all",
                userSelect: "all"
              }}>{appUrl}/callback</code>
            </li>
            <li style={{ marginTop: "6px" }}>Copy your <strong>Client ID</strong> and paste it below</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{
            display: "block", fontSize: "11px", fontWeight: 600, letterSpacing: "1.5px",
            textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: "8px"
          }}>
            Spotify Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setError(""); }}
            placeholder="32-character hex string"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            style={{
              width: "100%", padding: "12px 16px", fontSize: "15px", boxSizing: "border-box",
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${error ? "rgba(220,80,80,0.5)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: "10px", color: "rgba(255,255,255,0.9)",
              fontFamily: "'DM Sans', sans-serif", outline: "none",
              marginBottom: error ? "8px" : "20px", transition: "border-color 0.2s"
            }}
          />
          {error && (
            <div style={{ fontSize: "13px", color: "rgba(220,100,100,0.9)", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            style={{
              width: "100%", padding: "13px", fontSize: "15px", fontWeight: 600,
              background: "linear-gradient(135deg, #1DB954, #17a34a)",
              color: "#fff", border: "none", borderRadius: "12px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px",
              boxShadow: "0 4px 20px rgba(29,185,84,0.3)"
            }}
          >
            Save &amp; Continue
          </button>
        </form>
      </div>
    </div>
  );
}

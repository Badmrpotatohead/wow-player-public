import { useState, useEffect } from "react";
import BPMEditor from "./BPMEditor";
import { getClientId, clearClientId } from "./spotify-config";
import { isLoggedIn, logout } from "./spotify-auth";
import ProgressBar from "./ProgressBar";

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── BPM Color Coding ──────────────────────────────────────────────────────
function bpmColor(bpm) {
  if (!bpm) return "#5bb8c4";
  if (bpm < 80) return "#9b8ec4";   // slow — purple
  if (bpm < 100) return "#5bb8c4";  // medium — teal
  if (bpm < 121) return "#e8b84a";  // moderate — amber
  return "#e06070";                  // fast — rose
}

function bpmBg(bpm) {
  if (!bpm) return "rgba(91,184,196,0.15)";
  if (bpm < 80) return "rgba(155,142,196,0.15)";
  if (bpm < 100) return "rgba(91,184,196,0.15)";
  if (bpm < 121) return "rgba(232,184,74,0.15)";
  return "rgba(224,96,112,0.15)";
}

// ─── Theme Definitions ─────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "linear-gradient(135deg, #0a0a12 0%, #0d1117 20%, #111520 45%, #15121f 70%, #0d1117 100%)",
    glow1: "rgba(91,184,196,0.06)", glow2: "rgba(176,143,216,0.05)",
    headerBg: "rgba(0,0,0,0.3)", border: "rgba(255,255,255,0.06)",
    text: "rgba(255,255,255,0.9)", textMuted: "rgba(255,255,255,0.4)",
    textFaint: "rgba(255,255,255,0.2)", textGhost: "rgba(255,255,255,0.15)",
    textPrev: "rgba(255,255,255,0.7)", textPrevMuted: "rgba(255,255,255,0.35)",
    textPrevBpm: "rgba(255,255,255,0.3)", textPrevTime: "rgba(255,255,255,0.2)",
    nowBg: "rgba(255,255,255,0.03)", vizColor: "#5bb8c4",
    clockGrad: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6))",
    trackBg: "rgba(255,255,255,0.1)", trackHover: "rgba(255,255,255,0.04)",
    footerBg: "linear-gradient(transparent, rgba(10,10,18,0.95))",
    footerText: "rgba(255,255,255,0.35)", footerBtn: "rgba(255,255,255,0.15)",
    footerBtnText: "rgba(255,255,255,0.4)", scrollThumb: "rgba(255,255,255,0.1)",
    progressDot: "rgba(30,30,40,0.8)", modalBg: "#1e1e2a",
    modalBorder: "rgba(255,255,255,0.1)", inputBg: "rgba(255,255,255,0.05)",
    inputBorder: "rgba(255,255,255,0.15)", inputText: "rgba(255,255,255,0.9)",
    btnBg: "rgba(255,255,255,0.08)", btnText: "rgba(255,255,255,0.5)",
    shadow: "rgba(0,0,0,0.3)", shadowStrong: "rgba(0,0,0,0.4)",
  },
  light: {
    bg: "linear-gradient(135deg, #e8f8f5 0%, #d4f1f9 20%, #dce8f7 45%, #e5ddf5 70%, #d4f1f9 100%)",
    glow1: "rgba(91,184,196,0.12)", glow2: "rgba(176,143,216,0.1)",
    headerBg: "rgba(255,255,255,0.4)", border: "rgba(26,42,58,0.08)",
    text: "#1a2a3a", textMuted: "rgba(26,42,58,0.5)",
    textFaint: "rgba(26,42,58,0.3)", textGhost: "rgba(26,42,58,0.25)",
    textPrev: "#1a2a3a", textPrevMuted: "rgba(26,42,58,0.45)",
    textPrevBpm: "rgba(26,42,58,0.35)", textPrevTime: "rgba(26,42,58,0.3)",
    nowBg: "rgba(255,255,255,0.35)", vizColor: "#1a2a3a",
    clockGrad: "linear-gradient(135deg, #1a2a3a, #2c3e50)",
    trackBg: "rgba(26,42,58,0.12)", trackHover: "rgba(26,42,58,0.04)",
    footerBg: "linear-gradient(transparent, rgba(228,241,249,0.95))",
    footerText: "rgba(26,42,58,0.4)", footerBtn: "rgba(26,42,58,0.15)",
    footerBtnText: "rgba(26,42,58,0.5)", scrollThumb: "rgba(26,42,58,0.15)",
    progressDot: "white", modalBg: "white",
    modalBorder: "rgba(26,42,58,0.1)", inputBg: "white",
    inputBorder: "rgba(26,42,58,0.15)", inputText: "#1a2a3a",
    btnBg: "rgba(26,42,58,0.08)", btnText: "rgba(26,42,58,0.6)",
    shadow: "rgba(26,42,58,0.12)", shadowStrong: "rgba(26,42,58,0.15)",
  },
};

// ─── Branding Storage ──────────────────────────────────────────────────────
const BRAND_KEY = "wow_branding";
function loadBranding() {
  try { return JSON.parse(localStorage.getItem(BRAND_KEY) || "{}"); } catch { return {}; }
}
function saveBranding(b) { localStorage.setItem(BRAND_KEY, JSON.stringify(b)); }

// ─── DJ Alias Storage ──────────────────────────────────────────────────────
const DJ_ALIAS_KEY = "wow_dj_aliases";
function loadAliases() { try { return JSON.parse(localStorage.getItem(DJ_ALIAS_KEY) || "{}"); } catch { return {}; } }
function saveAlias(userId, alias) { const a = loadAliases(); a[userId] = alias; localStorage.setItem(DJ_ALIAS_KEY, JSON.stringify(a)); }
function getAlias(userId) { return loadAliases()[userId] || null; }

// ─── Sub-components ────────────────────────────────────────────────────────

function WOWLogo({ branding, isDark }) {
  const darkFilter = isDark ? "brightness(0.85) saturate(0.8)" : "none";
  if (branding?.logoUrl) {
    return <img src={branding.logoUrl} alt={branding.communityName || "Community"} style={{ height: "72px", objectFit: "contain", borderRadius: "8px", filter: darkFilter }} />;
  }
  return <img src="/wow-logo.jpeg" alt="West Orlando Westies" style={{ height: "72px", objectFit: "contain", borderRadius: "8px", filter: darkFilter }} />;
}

function AudioVisualizer({ isPlaying, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2.5px", height: "28px" }}>
      {Array.from({ length: 22 }).map((_, i) => (
        <div key={i} style={{ width: "3px", backgroundColor: t.vizColor, borderRadius: "2px", height: `${(0.3 + Math.random() * 0.7) * 100}%`, opacity: 0.7, animation: isPlaying ? `vizPulse ${0.3 + Math.random() * 0.5}s ease-in-out infinite alternate` : "none", animationDelay: `${Math.random() * 0.3}s` }} />
      ))}
    </div>
  );
}

function SpotifyIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381C8.64 5.801 15.6 6.06 20.04 8.7c.5.3.7 1.02.4 1.56-.299.421-1.02.599-1.559.42z" />
    </svg>
  );
}



function QueueTrack({ track, index, t, isPortrait }) {
  const bc = bpmColor(track.bpm);
  const bb = bpmBg(track.bpm);
  return (
    <div style={{ display: "flex", alignItems: "center", padding: isPortrait ? "12px 20px" : "14px 28px", gap: isPortrait ? "12px" : "16px", borderBottom: `1px solid ${t.border}`, animation: `slideIn 0.4s ease-out ${index * 0.08}s both`, transition: "background 0.2s", cursor: "default" }} onMouseEnter={(e) => e.currentTarget.style.background = t.trackHover} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <img src={track.albumArt || "https://via.placeholder.com/52x52?text=♪"} alt="" style={{ width: isPortrait ? "48px" : "52px", height: isPortrait ? "48px" : "52px", borderRadius: "8px", objectFit: "cover", boxShadow: `0 2px 12px ${t.shadow}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isPortrait ? "18px" : "20px", fontWeight: 500, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 400, color: t.textMuted, marginTop: "2px" }}>{track.artist}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "20px", flexShrink: 0, fontFamily: "'Oswald', sans-serif" }}>
        <span style={{ fontSize: "16px", fontWeight: 500, color: bc, background: bb, padding: "4px 12px", borderRadius: "20px", letterSpacing: "0.5px" }}>{track.bpm ? `${track.bpm} BPM` : "— BPM"}</span>
        <span style={{ fontSize: "17px", fontWeight: 400, color: t.textFaint, minWidth: "44px", textAlign: "right" }}>{formatTime(track.duration)}</span>
      </div>
    </div>
  );
}

function NothingPlaying({ t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center" }}>
      <div style={{ fontSize: "56px", marginBottom: "16px", opacity: 0.3 }}>🎵</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "24px", fontWeight: 500, color: t.textMuted, marginBottom: "8px" }}>Nothing Playing</div>
      <div style={{ fontSize: "15px", color: t.textGhost, maxWidth: "360px", lineHeight: 1.6 }}>Start playing music from Spotify on any device and it will appear here automatically.</div>
    </div>
  );
}

function NowPlayingSection({ track, elapsed, t, isPortrait }) {
  const bc = bpmColor(track.bpm);
  return (
    <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", gap: isPortrait ? "20px" : "28px", alignItems: isPortrait ? "center" : "flex-start" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <img src={track.albumArt || "https://via.placeholder.com/148x148?text=♪"} alt="" style={{ width: isPortrait ? "200px" : "148px", height: isPortrait ? "200px" : "148px", borderRadius: "14px", objectFit: "cover", boxShadow: `0 12px 40px ${t.shadowStrong}, 0 4px 12px rgba(91,184,196,0.15)` }} />
        <div style={{ position: "absolute", inset: "10%", borderRadius: "14px", background: "linear-gradient(135deg, rgba(91,184,196,0.15), rgba(176,143,216,0.15))", filter: "blur(20px)", zIndex: -1 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, width: isPortrait ? "100%" : "auto", textAlign: isPortrait ? "center" : "left" }}>
        <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", justifyContent: "space-between", alignItems: isPortrait ? "center" : "flex-start", gap: isPortrait ? "8px" : "0" }}>
          <div>
            <div style={{ fontSize: isPortrait ? "32px" : "36px", fontWeight: 700, color: t.text, lineHeight: 1.2 }}>{track.title}</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: isPortrait ? "22px" : "26px", fontWeight: 400, background: "linear-gradient(90deg, #5bb8c4, #7c9cf7, #b08fd8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginTop: "4px", lineHeight: 1.2 }}>{track.artist}</div>
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: isPortrait ? "32px" : "28px", fontWeight: 600, letterSpacing: "1px", flexShrink: 0, marginLeft: isPortrait ? "0" : "16px", color: bc }}>{track.bpm ? `${track.bpm} BPM` : "— BPM"}</div>
        </div>
        <div style={{ marginTop: "16px" }}>
          <ProgressBar elapsed={elapsed} duration={track.duration} t={t} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontFamily: "'Oswald', sans-serif", fontSize: "15px", fontWeight: 400, color: t.textFaint }}>
            <span>{formatTime(elapsed)}</span>
            <span>{formatTime(track.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviousTrack({ track, t, isPortrait }) {
  const bc = bpmColor(track.bpm);
  return (
    <div style={{ position: "relative", padding: isPortrait ? "8px 20px" : "10px 28px", display: "flex", alignItems: "center", gap: "14px", borderBottom: `1px solid ${t.border}`, background: t.nowBg, backdropFilter: "blur(8px)", animation: "fadeIn 0.4s ease-out", opacity: 0.5 }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: t.textFaint, writingMode: "vertical-lr", transform: "rotate(180deg)", marginRight: "2px" }}>Previous</div>
      <img src={track.albumArt || "https://via.placeholder.com/44x44?text=♪"} alt="" style={{ width: "44px", height: "44px", borderRadius: "6px", objectFit: "cover", boxShadow: `0 2px 8px ${t.shadow}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: t.textPrev, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
        <div style={{ fontSize: "13px", color: t.textPrevMuted, marginTop: "1px" }}>{track.artist}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0, fontFamily: "'Oswald', sans-serif" }}>
        {track.bpm && <span style={{ fontSize: "16px", fontWeight: 500, color: bc, opacity: 0.7 }}>{track.bpm} BPM</span>}
        <span style={{ fontSize: "15px", fontWeight: 400, color: t.textPrevTime }}>{formatTime(track.duration)}</span>
      </div>
    </div>
  );
}

// ─── DJ Alias Editor Modal ─────────────────────────────────────────────────

function DJAliasEditor({ userId, currentAlias, realName, onSave, onClose, t }) {
  const [alias, setAlias] = useState(currentAlias || "");
  const handleSave = () => { const v = alias.trim(); saveAlias(userId, v); onSave(v); onClose(); };
  const handleClear = () => { saveAlias(userId, ""); onSave(""); onClose(); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ background: t.modalBg, borderRadius: "16px", padding: "32px", width: "420px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: `1px solid ${t.modalBorder}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "22px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>DJ Name</div>
        <div style={{ fontSize: "13px", color: t.textMuted, marginBottom: "20px" }}>Set your display name. This is remembered each time you log in.</div>
        <div style={{ fontSize: "12px", color: t.textFaint, marginBottom: "6px" }}>Spotify name: {realName}</div>
        <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. DJ BIGKAT" autoFocus onKeyDown={(e) => e.key === "Enter" && handleSave()} style={{ width: "100%", padding: "12px 16px", fontSize: "18px", fontFamily: "'Oswald', sans-serif", fontWeight: 500, border: `2px solid ${t.inputBorder}`, borderRadius: "10px", outline: "none", color: t.inputText, background: t.inputBg, letterSpacing: "0.5px", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={handleSave} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save</button>
          <button onClick={handleClear} style={{ padding: "10px 16px", fontSize: "14px", fontWeight: 500, background: t.btnBg, color: t.btnText, border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Reset to Spotify Name</button>
          <button onClick={onClose} style={{ padding: "10px 16px", fontSize: "14px", fontWeight: 500, background: t.btnBg, color: t.btnText, border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Branding Settings Modal ───────────────────────────────────────────────

function BrandingEditor({ onClose, onSave, t }) {
  const current = loadBranding();
  const [name, setName] = useState(current.communityName || "");
  const [logoUrl, setLogoUrl] = useState(current.logoUrl || "");
  const isBase64 = logoUrl.startsWith("data:");

  const handleSave = () => {
    const b = { communityName: name.trim(), logoUrl: isBase64 ? logoUrl : logoUrl.trim() };
    saveBranding(b);
    onSave(b);
    onClose();
  };
  const handleReset = () => {
    localStorage.removeItem(BRAND_KEY);
    onSave({});
    onClose();
  };
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ background: t.modalBg, borderRadius: "16px", padding: "32px", width: "460px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: `1px solid ${t.modalBorder}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "22px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Community Branding</div>
        <div style={{ fontSize: "13px", color: t.textMuted, marginBottom: "20px" }}>Customize the display for your dance community. Saved locally on this device.</div>

        <div style={{ fontSize: "12px", color: t.textFaint, marginBottom: "6px" }}>Community Name</div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. West Orlando Westies" style={{ width: "100%", padding: "12px 16px", fontSize: "16px", fontFamily: "'DM Sans', sans-serif", border: `2px solid ${t.inputBorder}`, borderRadius: "10px", outline: "none", color: t.inputText, background: t.inputBg, boxSizing: "border-box", marginBottom: "16px" }} />

        <div style={{ fontSize: "12px", color: t.textFaint, marginBottom: "8px" }}>Logo</div>

        {/* Upload from device */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Upload from your device</div>
          {isBase64 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img src={logoUrl} alt="Logo preview" style={{ height: "48px", borderRadius: "8px", objectFit: "contain", border: `1px solid ${t.inputBorder}` }} />
              <div>
                <div style={{ fontSize: "13px", color: "#5bb8c4", fontWeight: 600 }}>Logo uploaded ✓</div>
                <button onClick={() => setLogoUrl("")} style={{ marginTop: "4px", fontSize: "11px", color: t.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif" }}>Remove</button>
              </div>
            </div>
          ) : (
            <label style={{ display: "inline-block", padding: "9px 16px", fontSize: "13px", fontWeight: 600, background: t.btnBg, color: t.btnText, border: `1px solid ${t.inputBorder}`, borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Choose Image
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          )}
        </div>

        {/* URL fallback */}
        {!isBase64 && (
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Or paste a URL</div>
            <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" style={{ width: "100%", padding: "12px 16px", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", border: `2px solid ${t.inputBorder}`, borderRadius: "10px", outline: "none", color: t.inputText, background: t.inputBg, boxSizing: "border-box" }} />
            {logoUrl && (
              <div style={{ marginTop: "10px", display: "flex", justifyContent: "center" }}>
                <img src={logoUrl} alt="Preview" style={{ maxHeight: "60px", borderRadius: "8px", objectFit: "contain" }} onError={(e) => e.target.style.display = "none"} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={handleSave} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save</button>
          <button onClick={handleReset} style={{ padding: "10px 16px", fontSize: "14px", fontWeight: 500, background: t.btnBg, color: t.btnText, border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Reset to Default</button>
          <button onClick={onClose} style={{ padding: "10px 16px", fontSize: "14px", fontWeight: 500, background: t.btnBg, color: t.btnText, border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Client ID Editor Modal ────────────────────────────────────────────────

function ClientIdEditor({ onClose, t }) {
  const current = getClientId();
  const masked = current ? `${current.slice(0, 6)}…${current.slice(-4)}` : "(none)";

  const handleReset = () => {
    if (!confirm("Clear your Spotify Client ID? You'll be prompted to enter a new one when the page reloads.")) return;
    clearClientId();
    window.location.reload();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ background: t.modalBg, borderRadius: "16px", padding: "32px", width: "420px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: `1px solid ${t.modalBorder}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "22px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Spotify Client ID</div>
        <div style={{ fontSize: "13px", color: t.textMuted, marginBottom: "20px" }}>The Spotify Developer app this device uses for login. Stored locally only.</div>
        <div style={{ fontSize: "12px", color: t.textFaint, marginBottom: "4px" }}>Current Client ID</div>
        <div style={{ fontSize: "15px", color: t.text, fontFamily: "monospace", marginBottom: "24px", padding: "10px 14px", background: t.inputBg, borderRadius: "8px", border: `1px solid ${t.inputBorder}` }}>{masked}</div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleReset} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, background: "rgba(220,60,60,0.15)", color: "rgba(220,100,100,0.9)", border: "1px solid rgba(220,60,60,0.3)", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Reset Client ID</button>
          <button onClick={onClose} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 500, background: t.btnBg, color: t.btnText, border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────

function FooterBar({ isLive, isConnected, rateLimited, onLogout, onOpenBpmEditor, onOpenAliasEditor, onOpenBranding, onOpenClientIdEditor, onToggleTheme, isDark, hidden, onHide, t }) {
  if (hidden) return null;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 28px", background: t.footerBg, backdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: isLive ? "#1DB954" : isConnected ? "#f59e0b" : "#999", boxShadow: `0 0 8px ${isLive ? "rgba(29,185,84,0.5)" : "rgba(245,158,11,0.4)"}` }} />
      <span style={{ fontSize: "12px", color: t.footerText, letterSpacing: "0.5px" }}>
        {rateLimited ? "⏳ Rate limited — waiting..." : isLive ? "Live — Connected to Spotify" : isConnected ? "Connected — Waiting for playback" : "Connecting to Spotify..."}
      </span>
      <a href="https://getsongbpm.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: t.textFaint, textDecoration: "none" }}>BPM data by GetSongBPM.com</a>
      <button onClick={onToggleTheme} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{isDark ? "☀️ Light" : "🌙 Dark"}</button>
      <button onClick={onOpenAliasEditor} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>✏️ DJ Name</button>
      <button onClick={onOpenBpmEditor} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>🎵 BPM Database</button>
      <button onClick={onOpenBranding} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>🎨 Branding</button>
      <button onClick={onOpenClientIdEditor} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>🔑 Client ID</button>
      <button onClick={onLogout} style={{ background: "none", border: "1px solid rgba(220,60,60,0.3)", borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: "rgba(220,60,60,0.5)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>⏏ Logout</button>
      <button onClick={onHide} style={{ background: "none", border: `1px solid ${t.footerBtn}`, borderRadius: "12px", padding: "4px 12px", fontSize: "11px", color: t.footerBtnText, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>👁 Hide</button>
    </div>
  );
}

// ─── Main Player Display ───────────────────────────────────────────────────

export default function WOWPlayer({ player, onLogout }) {
  const [currentTime, setCurrentTime] = useState("");
  const [showBpmEditor, setShowBpmEditor] = useState(false);
  const [showAliasEditor, setShowAliasEditor] = useState(false);
  const [showBranding, setShowBranding] = useState(false);
  const [showClientIdEditor, setShowClientIdEditor] = useState(false);
  const [djAlias, setDjAlias] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [footerHidden, setFooterHidden] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [branding, setBranding] = useState(loadBranding);
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem("wow_theme") !== "light"; } catch { return true; }
  });

  const t = isDark ? THEMES.dark : THEMES.light;

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem("wow_theme", next ? "dark" : "light"); } catch {}
  };

  useEffect(() => { if (player?.userId) { const s = getAlias(player.userId); if (s) setDjAlias(s); } }, [player?.userId]);

  // Detect fullscreen (F11 + API)
  useEffect(() => {
    const check = () => {
      const apiFs = !!document.fullscreenElement;
      const f11Fs = Math.abs(window.innerHeight - screen.height) < 5 && Math.abs(window.innerWidth - screen.width) < 5;
      setIsFullscreen(apiFs || f11Fs);
    };
    document.addEventListener("fullscreenchange", check);
    document.addEventListener("webkitfullscreenchange", check);
    document.addEventListener("mozfullscreenchange", check);
    window.addEventListener("resize", check);
    check();
    return () => {
      document.removeEventListener("fullscreenchange", check);
      document.removeEventListener("webkitfullscreenchange", check);
      document.removeEventListener("mozfullscreenchange", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // Detect portrait orientation
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth * 1.2);
    window.addEventListener("resize", check);
    check();
    return () => window.removeEventListener("resize", check);
  }, []);

  // Clock
  useEffect(() => {
    const tick = () => { const n = new Date(); const e = new Date(n.toLocaleString("en-US", { timeZone: "America/New_York" })); setCurrentTime(`${e.getHours() % 12 || 12}:${e.getMinutes().toString().padStart(2, "0")}`); };
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, []);

  const isLive = player?.isConnected && player?.currentTrack;
  const isConnecting = !player?.isConnected;
  const isAttemptingAuth = isConnecting && !player?.error && !player?.rateLimited;
  const currentTrack = isLive ? player.currentTrack : null;
  const previousTracks = isLive ? (player.previousTracks || []) : [];
  const maxPrevious = isPortrait ? 2 : 1;
  const elapsed = isLive ? player.elapsed : 0;
  const isPlaying = isLive ? player.isPlaying : false;
  const queue = isLive ? player.queue : [];
  const displayName = djAlias || player?.userName || "DJ";

  useEffect(() => {
    if (player?.isConnected || !isAttemptingAuth) return;
    const timer = setTimeout(() => {
      if (player?.isConnected) return;
      // Only nuke if there is an existing session. Mid-OAuth (no token
      // yet), we should NOT call logout() - it wipes the PKCE verifier.
      if (isLoggedIn()) {
        console.warn("Auth hang detected with stored token — resetting session");
        logout();
        window.location.reload();
      } else {
        console.warn("Auth hang detected with no stored token — letting OAuth flow continue");
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [player?.isConnected, isAttemptingAuth]);

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes vizPulse { 0% { transform: scaleY(0.35); } 100% { transform: scaleY(1); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 3px; }
      `}</style>

      <div onDoubleClick={() => footerHidden && setFooterHidden(false)} style={{ width: "100%", minHeight: "100vh", background: t.bg, backgroundSize: "300% 300%", animation: "gradientShift 20s ease infinite", color: t.text, fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden", transition: "background 0.3s" }}>

        <div style={{ position: "fixed", top: "-15%", right: "-10%", width: "500px", height: "500px", background: `radial-gradient(circle, ${t.glow1} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "-10%", left: "-10%", width: "600px", height: "600px", background: `radial-gradient(circle, ${t.glow2} 0%, transparent 65%)`, borderRadius: "50%", pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: isPortrait ? "14px 20px 10px" : "18px 28px 14px", borderBottom: `1px solid ${t.border}`, backdropFilter: "blur(20px)", background: t.headerBg }}>
          <WOWLogo branding={branding} isDark={isDark} />
          <div style={{ display: "flex", alignItems: "center", gap: isPortrait ? "20px" : "36px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <SpotifyIcon />
              <AudioVisualizer isPlaying={isPlaying} t={t} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "'Oswald', sans-serif", fontSize: isPortrait ? "28px" : "38px", fontWeight: 700, letterSpacing: "2px", color: "#fff", textTransform: "uppercase", textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>
              <span>🎧</span>
              <span>{isConnecting ? "Connecting..." : displayName}</span>
            </div>
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: isPortrait ? "42px" : "54px", fontWeight: 600, letterSpacing: "2px", lineHeight: 1, background: t.clockGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{currentTime}</div>
        </div>

        {/* Previous Tracks */}
        {previousTracks.slice(0, maxPrevious).reverse().map((track, i) => (
          <PreviousTrack key={track.id || i} track={track} t={t} isPortrait={isPortrait} />
        ))}

        {/* Now Playing */}
        {isConnecting ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px", animation: "vizPulse 1s ease-in-out infinite alternate" }}>🎵</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "22px", fontWeight: 500, color: t.textFaint }}>Connecting to Spotify...</div>
          </div>
        ) : isLive ? (
          <div key={currentTrack.id} style={{ position: "relative", padding: isPortrait ? "24px 20px 20px" : "28px 28px 24px", borderBottom: `1px solid ${t.border}`, background: t.nowBg, backdropFilter: "blur(12px)", animation: "fadeIn 0.4s ease-out" }}>
            <NowPlayingSection track={currentTrack} elapsed={elapsed} t={t} isPortrait={isPortrait} />
          </div>
        ) : <NothingPlaying t={t} />}

        {/* Queue */}
        <div style={{ position: "relative", paddingTop: "4px", paddingBottom: "60px" }}>
          <div style={{ padding: "12px 28px 6px", fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: t.textFaint }}>Up Next</div>
          {queue.length > 0 ? queue.slice(0, isPortrait ? 8 : 5).map((track, i) => (
            <QueueTrack key={track.id || i} track={track} index={i} t={t} isPortrait={isPortrait} />
          )) : !isConnecting ? (
            <div style={{ padding: "40px 28px", textAlign: "center", color: t.textGhost, fontStyle: "italic" }}>{isLive ? "Queue is empty" : "Waiting for playback..."}</div>
          ) : null}
        </div>

        <FooterBar isLive={isLive} isConnected={player?.isConnected} rateLimited={player?.rateLimited} onLogout={onLogout} onOpenBpmEditor={() => setShowBpmEditor(true)} onOpenAliasEditor={() => setShowAliasEditor(true)} onOpenBranding={() => setShowBranding(true)} onOpenClientIdEditor={() => setShowClientIdEditor(true)} onToggleTheme={toggleTheme} isDark={isDark} hidden={isFullscreen || footerHidden} onHide={() => setFooterHidden(true)} t={t} />
      </div>

      {showBpmEditor && <BPMEditor onClose={() => setShowBpmEditor(false)} />}
      {showAliasEditor && <DJAliasEditor userId={player?.userId || "default"} currentAlias={djAlias} realName={player?.userName || "DJ"} onSave={(a) => setDjAlias(a)} onClose={() => setShowAliasEditor(false)} t={t} />}
      {showBranding && <BrandingEditor onClose={() => setShowBranding(false)} onSave={(b) => setBranding(b)} t={t} />}
      {showClientIdEditor && <ClientIdEditor onClose={() => setShowClientIdEditor(false)} t={t} />}
    </div>
  );
}

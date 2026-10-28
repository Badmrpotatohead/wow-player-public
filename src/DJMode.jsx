// ─── DJ Mode ────────────────────────────────────────────────────────────────
// Sequential-play UI for the OtsAV DJ. The operator advances through an
// imported set with timer-driven Play / Pause / Next / Prev controls. Mirrors
// WOWPlayer.jsx's visual treatment but drives off an array + index instead of
// Spotify polling.

import { useCallback, useEffect, useRef, useState } from "react";
import ProgressBar from "./ProgressBar";

const PLAYLIST_KEY = "wow_otsav_playlist";
const INDEX_KEY = "wow_otsav_index";
const REMAINING_KEY = "wow_otsav_remaining_ms";
const PLAYING_KEY = "wow_otsav_is_playing";
const DEFAULT_TRACK_MS = 180000;

// ─── BPM color coding (matches WOWPlayer) ──────────────────────────────────
function bpmColor(bpm) {
  if (!bpm) return "#5bb8c4";
  if (bpm < 80) return "#9b8ec4";
  if (bpm < 100) return "#5bb8c4";
  if (bpm < 121) return "#e8b84a";
  return "#e06070";
}
function bpmBg(bpm) {
  if (!bpm) return "rgba(91,184,196,0.15)";
  if (bpm < 80) return "rgba(155,142,196,0.15)";
  if (bpm < 100) return "rgba(91,184,196,0.15)";
  if (bpm < 121) return "rgba(232,184,74,0.15)";
  return "rgba(224,96,112,0.15)";
}

function loadPlaylist() {
  try {
    const arr = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function loadIndex() {
  const n = parseInt(localStorage.getItem(INDEX_KEY) || "0", 10);
  return isNaN(n) ? 0 : n;
}
function loadRemainingMs() {
  const n = parseInt(localStorage.getItem(REMAINING_KEY) || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function loadIsPlaying() {
  return localStorage.getItem(PLAYING_KEY) === "true";
}
function parseTrackLength(length, track) {
  const raw = typeof length === "string" ? length.trim() : "";
  const label = track?.title || track?.originalTitle || "track";

  if (!raw) {
    console.warn(`Missing Length metadata for ${label}; using 3:00 estimate.`);
    return { ms: DEFAULT_TRACK_MS, estimated: true };
  }

  const parts = raw.split(":").map((part) => Number(part));
  const valid =
    (parts.length === 2 || parts.length === 3) &&
    parts.every((part) => Number.isFinite(part) && part >= 0);

  if (valid) {
    const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    if (totalSeconds > 0) return { ms: totalSeconds * 1000, estimated: false };
  }

  console.warn(`Unparseable Length metadata "${raw}" for ${label}; using 3:00 estimate.`);
  return { ms: DEFAULT_TRACK_MS, estimated: true };
}
function loadInitialSession() {
  const tracks = loadPlaylist();
  const index = Math.min(loadIndex(), Math.max(0, tracks.length - 1));
  const duration = tracks.length
    ? parseTrackLength(tracks[index]?.length, tracks[index])
    : { ms: DEFAULT_TRACK_MS, estimated: false };
  const savedRemaining = loadRemainingMs();

  return {
    tracks,
    index,
    isPlaying: loadIsPlaying(),
    remainingMs: savedRemaining ?? duration.ms,
    durationIsEstimated: duration.estimated,
  };
}
function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Artwork({ src, size }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: "14px",
          objectFit: "cover",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(91,184,196,0.15)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: typeof size === "number" ? size * 0.4 : "56px",
        background: "linear-gradient(135deg, rgba(91,184,196,0.18), rgba(176,143,216,0.18))",
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
      }}
    >
      🎵
    </div>
  );
}

export default function DJMode({ onEndSet }) {
  const [initialSession] = useState(loadInitialSession);
  const [tracks] = useState(initialSession.tracks);
  const [currentIndex, setCurrentIndex] = useState(initialSession.index);
  const [isPlaying, setIsPlaying] = useState(initialSession.isPlaying);
  const [remainingMs, setRemainingMs] = useState(initialSession.remainingMs);
  const [durationIsEstimated, setDurationIsEstimated] = useState(initialSession.durationIsEstimated);
  const [setComplete, setSetComplete] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const intervalRef = useRef(null);
  const isPlayingRef = useRef(initialSession.isPlaying);
  const remainingRef = useRef(initialSession.remainingMs);
  const didHandleIndexChangeRef = useRef(false);

  const saveRemaining = useCallback(() => {
    try {
      localStorage.setItem(REMAINING_KEY, String(remainingRef.current));
    } catch {}
  }, []);

  const pauseTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const advanceToNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < tracks.length - 1) return i + 1;

      pauseTimer();
      setIsPlaying(false);
      setSetComplete(true);
      setRemainingMs(0);
      remainingRef.current = 0;
      return i;
    });
  }, [pauseTimer, tracks.length]);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          advanceToNext();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
  }, [advanceToNext]);

  const next = useCallback(() => {
    setSetComplete(false);
    setCurrentIndex((i) => Math.min(i + 1, tracks.length - 1));
  }, [tracks.length]);

  const prev = useCallback(() => {
    setSetComplete(false);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pauseTimer();
      saveRemaining();
      setIsPlaying(false);
      return;
    }

    if (remainingMs <= 0) {
      const duration = parseTrackLength(tracks[currentIndex]?.length, tracks[currentIndex]);
      setRemainingMs(duration.ms);
      remainingRef.current = duration.ms;
      setDurationIsEstimated(duration.estimated);
    }
    setSetComplete(false);
    setIsPlaying(true);
    startTimer();
  }, [currentIndex, isPlaying, pauseTimer, remainingMs, saveRemaining, startTimer, tracks]);

  // Persist place in the set on every change.
  useEffect(() => {
    try {
      localStorage.setItem(INDEX_KEY, String(currentIndex));
    } catch {}
  }, [currentIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    try {
      localStorage.setItem(PLAYING_KEY, String(isPlaying));
    } catch {}
  }, [isPlaying]);

  useEffect(() => {
    remainingRef.current = remainingMs;
  }, [remainingMs]);

  useEffect(() => {
    const i = setInterval(saveRemaining, 5000);
    return () => clearInterval(i);
  }, [saveRemaining]);

  // Start from persisted playing state after a refresh.
  useEffect(() => {
    if (isPlaying && tracks.length && !setComplete) startTimer();
    return () => pauseTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a fresh duration whenever the operator or timer changes tracks.
  useEffect(() => {
    if (!didHandleIndexChangeRef.current) {
      didHandleIndexChangeRef.current = true;
      return;
    }

    const duration = parseTrackLength(tracks[currentIndex]?.length, tracks[currentIndex]);
    setRemainingMs(duration.ms);
    remainingRef.current = duration.ms;
    setDurationIsEstimated(duration.estimated);

    if (isPlayingRef.current) startTimer();
    else pauseTimer();
  }, [currentIndex, pauseTimer, startTimer, tracks]);

  useEffect(() => {
    if (!isPlaying) saveRemaining();
  }, [isPlaying, saveRemaining]);

  // Orientation
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth * 1.2);
    window.addEventListener("resize", check);
    check();
    return () => window.removeEventListener("resize", check);
  }, []);

  // Clock (ET, matches WOWPlayer)
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const e = new Date(n.toLocaleString("en-US", { timeZone: "America/New_York" }));
      setCurrentTime(`${e.getHours() % 12 || 12}:${e.getMinutes().toString().padStart(2, "0")}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  // Keyboard: arrow keys advance / rewind, space toggles play/pause.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, togglePlayback]);

  const handleEndSet = () => {
    if (!window.confirm("End this set? This clears the imported playlist.")) return;
    pauseTimer();
    try {
      localStorage.removeItem(PLAYLIST_KEY);
      localStorage.removeItem(INDEX_KEY);
      localStorage.removeItem(REMAINING_KEY);
      localStorage.removeItem(PLAYING_KEY);
    } catch {}
    onEndSet();
  };

  if (!tracks.length) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.4 }}>🎵</div>
          <div style={{ fontSize: "18px", color: "rgba(255,255,255,0.6)", marginBottom: "24px" }}>
            No set loaded.
          </div>
          <button onClick={onEndSet} style={primaryBtn}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const current = tracks[currentIndex];
  const upNext = tracks.slice(currentIndex + 1, currentIndex + 1 + (isPortrait ? 6 : 4));
  const previous = tracks.slice(Math.max(0, currentIndex - (isPortrait ? 2 : 1)), currentIndex);
  const bc = bpmColor(current.bpm);
  const atEnd = currentIndex >= tracks.length - 1;
  const durationMs = parseTrackLength(current?.length, current).ms;
  const elapsedMs = Math.max(0, durationMs - remainingMs);

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      <div
        style={{
          width: "100%",
          minHeight: "100vh",
          background:
            "linear-gradient(135deg, #0a0a12 0%, #0d1117 20%, #111520 45%, #15121f 70%, #0d1117 100%)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 20s ease infinite",
          color: "rgba(255,255,255,0.9)",
          fontFamily: "'DM Sans', sans-serif",
          position: "relative",
          overflow: "hidden",
          paddingBottom: "120px",
        }}
      >
        <div style={{ position: "fixed", top: "-15%", right: "-10%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(91,184,196,0.06) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "-10%", left: "-10%", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(176,143,216,0.05) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />

        {/* Header */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: isPortrait ? "14px 20px 10px" : "18px 28px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <img
            src="/wow-logo.jpeg"
            alt="West Orlando Westies"
            style={{ height: "72px", objectFit: "contain", borderRadius: "8px", filter: "brightness(0.85) saturate(0.8)" }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontFamily: "'Oswald', sans-serif",
              fontSize: isPortrait ? "28px" : "38px",
              fontWeight: 700,
              letterSpacing: "2px",
              color: "#fff",
              textTransform: "uppercase",
              textShadow: "0 0 20px rgba(255,255,255,0.3)",
            }}
          >
            <span>🎧</span>
            <span>DJ Mode</span>
          </div>
          <div
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontSize: isPortrait ? "42px" : "54px",
              fontWeight: 600,
              letterSpacing: "2px",
              lineHeight: 1,
              background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {currentTime}
          </div>
        </div>

        {setComplete ? (
          <div
            style={{
              position: "relative",
              minHeight: "52vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "22px",
              }}
            >
              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontSize: isPortrait ? "34px" : "46px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                  color: "rgba(255,255,255,0.92)",
                  textTransform: "uppercase",
                }}
              >
                Set Complete · {tracks.length} of {tracks.length} tracks played
              </div>
              <button onClick={handleEndSet} style={primaryBtnLarge(false)}>
                End Set
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Previous */}
            {previous
              .slice()
              .reverse()
              .map((track, i) => (
                <PreviousTrack key={`prev-${currentIndex}-${i}`} track={track} />
              ))}

            {/* Now Playing */}
            <div
              key={current.originalTitle + currentIndex}
              style={{
                position: "relative",
                padding: isPortrait ? "24px 20px 20px" : "28px 28px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
                animation: "fadeIn 0.4s ease-out",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: isPortrait ? "column" : "row",
                  gap: isPortrait ? "20px" : "28px",
                  alignItems: isPortrait ? "center" : "flex-start",
                }}
              >
                <Artwork src={current.albumArt || current.artistImage} size={isPortrait ? 200 : 148} />
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: isPortrait ? "100%" : "auto",
                    textAlign: isPortrait ? "center" : "left",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                    Now Playing · {currentIndex + 1} of {tracks.length}{!isPlaying && "  ·  paused"}
                  </div>
                  <ProgressBar elapsed={elapsedMs / 1000} duration={durationMs / 1000} />
                  <div style={{ fontSize: isPortrait ? "32px" : "36px", fontWeight: 700, color: "rgba(255,255,255,0.95)", lineHeight: 1.2, marginTop: "16px" }}>
                    {current.title}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      fontSize: isPortrait ? "22px" : "26px",
                      fontWeight: 400,
                      background: "linear-gradient(90deg, #5bb8c4, #7c9cf7, #b08fd8)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      marginTop: "4px",
                      lineHeight: 1.2,
                    }}
                  >
                    {current.artist}
                  </div>
                  <div
                    style={{
                      marginTop: "16px",
                      fontFamily: "'Oswald', sans-serif",
                      fontSize: isPortrait ? "32px" : "30px",
                      fontWeight: 600,
                      letterSpacing: "1px",
                      color: bc,
                    }}
                  >
                    {current.bpm ? `${current.bpm} BPM` : "— BPM"}
                  </div>
                </div>
              </div>
            </div>

            {/* Up Next */}
            <div style={{ position: "relative", paddingTop: "4px" }}>
              <div style={{ padding: "12px 28px 6px", fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                Up Next
              </div>
              {upNext.length > 0 ? (
                upNext.map((track, i) => (
                  <QueueTrack key={`next-${currentIndex}-${i}`} track={track} index={i} isPortrait={isPortrait} />
                ))
              ) : (
                <div style={{ padding: "40px 28px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
                  End of set
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      {!setComplete && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "14px 28px 12px",
            background: "linear-gradient(transparent, rgba(10,10,18,0.96))",
            backdropFilter: "blur(10px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <button onClick={prev} disabled={currentIndex === 0} style={secondaryBtn(currentIndex === 0)}>
              ‹ Prev
            </button>
            <button onClick={togglePlayback} style={primaryBtnLarge(false)}>
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onClick={next} disabled={atEnd} style={secondaryBtn(atEnd)}>
              Next ›
            </button>
          </div>
          <button onClick={handleEndSet} style={endSetLink}>
            End set
          </button>
        </div>
      )}
    </div>
  );
}

function PreviousTrack({ track }) {
  const bc = bpmColor(track.bpm);
  return (
    <div
      style={{
        position: "relative",
        padding: "10px 28px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.03)",
        animation: "fadeIn 0.4s ease-out",
        opacity: 0.5,
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
        Played
      </div>
      <SmallArt src={track.albumArt || track.artistImage} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", marginTop: "1px" }}>{track.artist}</div>
      </div>
      {track.bpm && (
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: "16px", fontWeight: 500, color: bc, opacity: 0.7 }}>{track.bpm} BPM</span>
      )}
    </div>
  );
}

function QueueTrack({ track, index, isPortrait }) {
  const bc = bpmColor(track.bpm);
  const bb = bpmBg(track.bpm);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: isPortrait ? "12px 20px" : "14px 28px",
        gap: isPortrait ? "12px" : "16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        animation: `slideIn 0.4s ease-out ${index * 0.08}s both`,
      }}
    >
      <SmallArt src={track.albumArt || track.artistImage} size={isPortrait ? 48 : 52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: isPortrait ? "18px" : "20px", fontWeight: 500, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
        <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{track.artist}</div>
      </div>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: "16px", fontWeight: 500, color: bc, background: bb, padding: "4px 12px", borderRadius: "20px", letterSpacing: "0.5px", flexShrink: 0 }}>
        {track.bpm ? `${track.bpm} BPM` : "— BPM"}
      </span>
    </div>
  );
}

function SmallArt({ src, size = 44 }) {
  if (src) {
    return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "8px", objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }} />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        background: "linear-gradient(135deg, rgba(91,184,196,0.15), rgba(176,143,216,0.15))",
      }}
    >
      🎵
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const pageStyle = {
  width: "100%",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #0a0a12, #0d1117, #111520)",
  fontFamily: "'DM Sans', sans-serif",
  color: "rgba(255,255,255,0.9)",
};

const primaryBtn = {
  background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "15px",
  fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif",
  cursor: "pointer",
};

function primaryBtnLarge(disabled) {
  return {
    background: disabled ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #5bb8c4, #7c9cf7)",
    color: disabled ? "rgba(255,255,255,0.3)" : "white",
    border: "none",
    borderRadius: "50px",
    padding: "16px 56px",
    fontSize: "20px",
    fontWeight: 700,
    fontFamily: "'Oswald', sans-serif",
    letterSpacing: "1px",
    cursor: disabled ? "default" : "pointer",
    boxShadow: disabled ? "none" : "0 6px 24px rgba(91,184,196,0.35)",
    transition: "all 0.2s",
  };
}

function secondaryBtn(disabled) {
  return {
    background: "rgba(255,255,255,0.06)",
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "50px",
    padding: "12px 28px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "'Oswald', sans-serif",
    letterSpacing: "0.5px",
    cursor: disabled ? "default" : "pointer",
  };
}

const endSetLink = {
  background: "none",
  border: "none",
  borderRadius: "50px",
  padding: "4px 12px",
  fontSize: "12px",
  color: "rgba(220,90,90,0.55)",
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

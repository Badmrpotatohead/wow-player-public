// ─── OtsAV Import Flow ──────────────────────────────────────────────────────
// File picker → parse (latin1) → sequential Spotify enrichment with a progress
// bar → persist to localStorage → hand off to DJ Mode.

import { useRef, useState } from "react";
import { parseOtsAVCSV, enrichWithSpotify, primeBpmCache } from "./otsav-importer";

const PLAYLIST_KEY = "wow_otsav_playlist";
const INDEX_KEY = "wow_otsav_index";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function OtsAVImport({ onComplete, onCancel }) {
  const [stage, setStage] = useState("pick"); // pick | parsing | enriching | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function readFileAsLatin1(file) {
    const buf = await file.arrayBuffer();
    // OtsAV exports are ISO-8859-1, NOT UTF-8.
    return new TextDecoder("iso-8859-1").decode(buf);
  }

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setStage("parsing");
    try {
      const text = await readFileAsLatin1(file);
      const tracks = parseOtsAVCSV(text);
      if (!tracks.length) {
        setError("No tracks found in that file. Make sure it's an OtsAV CSV export.");
        setStage("error");
        return;
      }

      // Seed the BPM cache up front so the BPM Editor sees these immediately.
      primeBpmCache(tracks);

      setStage("enriching");
      setProgress({ done: 0, total: tracks.length });

      const enriched = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = await enrichWithSpotify(tracks[i]);
        enriched.push(t);
        setProgress({ done: i + 1, total: tracks.length });
        await sleep(100); // be a polite client of our own serverless function
      }

      // Re-prime in case enrichment refined any titles (it doesn't change BPM,
      // but keeps the cache aligned with the displayed tracks).
      primeBpmCache(enriched);

      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(enriched));
      localStorage.setItem(INDEX_KEY, "0");
      onComplete();
    } catch (e) {
      console.error(e);
      setError(e.message || "Something went wrong reading that file.");
      setStage("error");
    }
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0a0a12 0%, #0d1117 20%, #111520 45%, #15121f 70%, #0d1117 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        color: "rgba(255,255,255,0.9)",
        padding: "40px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          borderRadius: "20px",
          padding: "48px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "12px" }}>🎚️</div>
        <h2
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: "24px",
            fontWeight: 500,
            marginBottom: "8px",
          }}
        >
          OtsAV DJ Mode
        </h2>

        {stage === "pick" && (
          <>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.5)",
                lineHeight: 1.6,
                marginBottom: "28px",
              }}
            >
              Import the DJ's OtsAV playlist export (.csv). We'll read the BPMs
              from the track titles and pull in artist images from Spotify.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#5bb8c4" : "rgba(255,255,255,0.2)"}`,
                borderRadius: "14px",
                padding: "36px 20px",
                cursor: "pointer",
                background: dragOver ? "rgba(91,184,196,0.08)" : "transparent",
                transition: "all 0.2s",
                marginBottom: "20px",
              }}
            >
              <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.7)", marginBottom: "6px" }}>
                Drag &amp; drop your CSV here
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>or click to choose a file</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
          </>
        )}

        {stage === "parsing" && (
          <div style={{ padding: "20px 0" }}>
            <Spinner />
            <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.6)", marginTop: "16px" }}>
              Parsing playlist…
            </div>
          </div>
        )}

        {stage === "enriching" && (
          <div style={{ padding: "20px 0" }}>
            <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.6)", marginBottom: "14px" }}>
              Looking up artist images… {progress.done} of {progress.total}
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                background: "rgba(255,255,255,0.1)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #5bb8c4, #7c9cf7, #b08fd8)",
                  borderRadius: "4px",
                  transition: "width 0.2s linear",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "10px" }}>{pct}%</div>
          </div>
        )}

        {stage === "error" && (
          <div style={{ padding: "12px 0" }}>
            <div
              style={{
                fontSize: "14px",
                color: "#e06070",
                marginBottom: "20px",
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
            <button
              onClick={() => {
                setStage("pick");
                setError("");
              }}
              style={btnStyle("#5bb8c4")}
            >
              Try Again
            </button>
          </div>
        )}

        <button
          onClick={onCancel}
          style={{
            marginTop: "24px",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            cursor: "pointer",
            fontSize: "13px",
            fontFamily: "'DM Sans', sans-serif",
            textDecoration: "underline",
          }}
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        margin: "0 auto",
        border: "3px solid rgba(255,255,255,0.15)",
        borderTopColor: "#5bb8c4",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

function btnStyle(color) {
  return {
    background: color,
    color: "white",
    border: "none",
    borderRadius: "50px",
    padding: "12px 32px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  };
}

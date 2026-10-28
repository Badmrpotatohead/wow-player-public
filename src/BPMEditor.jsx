import { useState, useEffect, useCallback } from "react";
import { setManualBPM, BUILTIN_DB } from "./bpm-lookup";
import ShareWithCommunity from "./ShareWithCommunity";

const BPM_CACHE_KEY = "wow_bpm_cache";
const BPM_HISTORY_KEY = "wow_bpm_history";

function loadCache() {
  try { return JSON.parse(localStorage.getItem(BPM_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveCache(cache) { localStorage.setItem(BPM_CACHE_KEY, JSON.stringify(cache)); }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(BPM_HISTORY_KEY) || "{}"); } catch { return {}; }
}
function saveHistory(history) {
  try { localStorage.setItem(BPM_HISTORY_KEY, JSON.stringify(history)); } catch {}
}
function addHistoryEntry(key, oldBpm, newBpm, source) {
  const history = loadHistory();
  if (!history[key]) history[key] = [];
  history[key].push({ oldBpm, newBpm, source, timestamp: Date.now() });
  // Keep last 10 edits per song
  if (history[key].length > 10) history[key] = history[key].slice(-10);
  saveHistory(history);
}

function parseCacheEntry(key, value) {
  const [title, artist] = key.split("|||");
  if (typeof value === "object" && value !== null) {
    return { title: title || "Unknown", artist: artist || "Unknown", bpm: value.bpm, source: value.source || "unknown" };
  }
  return { title: title || "Unknown", artist: artist || "Unknown", bpm: value, source: "unknown" };
}

function bpmColor(bpm) {
  if (!bpm) return "#5bb8c4";
  if (bpm < 80) return "#9b8ec4";
  if (bpm < 100) return "#5bb8c4";
  if (bpm < 121) return "#e8b84a";
  return "#e06070";
}

const SOURCE_LABELS = {
  builtin: { label: "Built-in", color: "#1DB954", bg: "rgba(29,185,84,0.1)" },
  manual: { label: "Manual", color: "#5bb8c4", bg: "rgba(91,184,196,0.1)" },
  getsongbpm: { label: "Lookup", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  firebase: { label: "Shared DB", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  ai: { label: "AI Guess", color: "#e74c3c", bg: "rgba(231,76,60,0.1)" },
  unknown: { label: "Legacy", color: "#999", bg: "rgba(153,153,153,0.1)" },
  master: { label: "Master DB", color: "#1DB954", bg: "rgba(29,185,84,0.1)" },
};

export default function BPMEditor({ onClose }) {
  const [cache, setCache] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newBpm, setNewBpm] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [filterSource, setFilterSource] = useState("all");
  const [viewMode, setViewMode] = useState("playlist"); // "playlist" or "master"
  const [historyKey, setHistoryKey] = useState(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => { setCache(loadCache()); }, []);

  // Build entries based on view mode
  const getEntries = () => {
    if (viewMode === "master") {
      // Show all 5,813 songs from built-in DB
      return Object.entries(BUILTIN_DB).map(([key, bpm]) => {
        const [title, artist] = key.split("|||");
        // Check if there's a cache override
        const cached = cache[key];
        const actualBpm = cached ? (typeof cached === "object" ? cached.bpm : cached) : bpm;
        const source = cached ? (typeof cached === "object" ? cached.source : "unknown") : "master";
        return { key, bpm: actualBpm, title: title || "Unknown", artist: artist || "Unknown", source };
      });
    }
    // Playlist mode — show cached songs
    return Object.entries(cache).map(([key, value]) => ({ key, ...parseCacheEntry(key, value) }));
  };

  const allEntries = getEntries();

  const entries = allEntries
    .filter((e) => {
      if (filterSource === "all") return true;
      if (filterSource === "lookup") return ["getsongbpm", "firebase", "ai", "unknown"].includes(e.source);
      return e.source === filterSource;
    })
    .filter((e) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.artist.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (viewMode === "master") return a.title.localeCompare(b.title);
      const sourcePriority = { ai: 0, unknown: 1, getsongbpm: 2, firebase: 3, builtin: 4, manual: 5, master: 6 };
      const pa = sourcePriority[a.source] ?? 3;
      const pb = sourcePriority[b.source] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });

  const sourceCounts = allEntries.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + 1;
    return acc;
  }, {});
  const lookupCount = (sourceCounts.getsongbpm || 0) + (sourceCounts.firebase || 0) + (sourceCounts.ai || 0) + (sourceCounts.unknown || 0);

  const handleSave = useCallback((key, newBpmVal) => {
    const bpm = parseInt(newBpmVal, 10);
    if (isNaN(bpm) || bpm < 30 || bpm > 300) return;
    const { title, artist, bpm: oldBpm } = parseCacheEntry(key, cache[key]);
    addHistoryEntry(key, oldBpm, bpm, "manual");
    setCache((prev) => {
      const updated = { ...prev, [key]: { bpm, source: "manual" } };
      saveCache(updated);
      return updated;
    });
    setManualBPM(title, artist, bpm);
    setEditingKey(null);
    setEditValue("");
  }, [cache]);

  const handleDelete = useCallback((key) => {
    setCache((prev) => {
      const updated = { ...prev };
      delete updated[key];
      saveCache(updated);
      return updated;
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (!newTitle.trim() || !newBpm.trim()) return;
    const bpm = parseInt(newBpm, 10);
    if (isNaN(bpm) || bpm < 30 || bpm > 300) return;
    const key = `${newTitle.trim()}|||${newArtist.trim()}`.toLowerCase();
    setCache((prev) => {
      const updated = { ...prev, [key]: { bpm, source: "manual" } };
      saveCache(updated);
      return updated;
    });
    setManualBPM(newTitle.trim(), newArtist.trim(), bpm);
    setNewTitle(""); setNewArtist(""); setNewBpm(""); setShowAdd(false);
  }, [newTitle, newArtist, newBpm]);

  const handleClearAll = useCallback(() => {
    if (window.confirm("Clear ALL cached BPMs? They will be re-looked up automatically as songs play.")) {
      localStorage.removeItem(BPM_CACHE_KEY);
      setCache({});
    }
  }, []);

  const handleRollback = useCallback((key, oldBpm) => {
    if (!oldBpm) return;
    const { title, artist } = parseCacheEntry(key, cache[key] || { bpm: oldBpm });
    addHistoryEntry(key, null, oldBpm, "rollback");
    setCache((prev) => {
      const updated = { ...prev, [key]: { bpm: oldBpm, source: "manual" } };
      saveCache(updated);
      return updated;
    });
    setManualBPM(title, artist, oldBpm);
    setHistoryKey(null);
  }, [cache]);

  const getSourceStyle = (source) => SOURCE_LABELS[source] || SOURCE_LABELS.unknown;
  const historyEntries = historyKey ? (loadHistory()[historyKey] || []) : [];

  return (
    <>
      <style>{`
        .bpm-editor-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(26,42,58,0.5); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; animation: bpmFadeIn 0.2s ease-out; }
        @keyframes bpmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bpmSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .bpm-editor-panel { background: white; border-radius: 16px; width: 90%; max-width: 720px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(26,42,58,0.25); animation: bpmSlideUp 0.25s ease-out; font-family: 'DM Sans', sans-serif; color: #1a2a3a; }
        .bpm-editor-header { padding: 20px 24px 16px; border-bottom: 1px solid rgba(26,42,58,0.08); display: flex; align-items: center; justify-content: space-between; }
        .bpm-editor-body { flex: 1; overflow-y: auto; padding: 0; }
        .bpm-editor-footer { padding: 12px 24px; border-top: 1px solid rgba(26,42,58,0.08); display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: rgba(26,42,58,0.4); }
        .bpm-row { display: flex; align-items: center; padding: 10px 24px; gap: 12px; border-bottom: 1px solid rgba(26,42,58,0.04); transition: background 0.15s; }
        .bpm-row:hover { background: rgba(91,184,196,0.04); }
        .bpm-row-flagged { background: rgba(245,158,11,0.04); }
        .bpm-row-flagged:hover { background: rgba(245,158,11,0.08); }
        .bpm-row-ai { background: rgba(231,76,60,0.04); }
        .bpm-row-ai:hover { background: rgba(231,76,60,0.08); }
        .bpm-input { width: 72px; padding: 6px 10px; border: 2px solid #5bb8c4; border-radius: 8px; font-family: 'Oswald', sans-serif; font-size: 16px; text-align: center; outline: none; color: #1a2a3a; background: rgba(91,184,196,0.06); }
        .bpm-input:focus { border-color: #7c9cf7; box-shadow: 0 0 0 3px rgba(124,156,247,0.15); }
        .bpm-badge { font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 500; padding: 4px 12px; border-radius: 16px; cursor: pointer; transition: all 0.15s; min-width: 72px; text-align: center; }
        .bpm-badge:hover { filter: brightness(1.1); }
        .bpm-badge.empty { color: rgba(26,42,58,0.3); background: rgba(26,42,58,0.05); font-style: italic; font-family: 'DM Sans', sans-serif; font-size: 13px; }
        .bpm-btn { padding: 6px 14px; border-radius: 8px; border: none; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .bpm-btn-primary { background: #5bb8c4; color: white; }
        .bpm-btn-primary:hover { background: #4aa8b4; }
        .bpm-btn-ghost { background: transparent; color: rgba(26,42,58,0.5); }
        .bpm-btn-ghost:hover { background: rgba(26,42,58,0.05); color: #1a2a3a; }
        .bpm-btn-danger { background: transparent; color: #e74c3c; }
        .bpm-btn-danger:hover { background: rgba(231,76,60,0.08); }
        .bpm-search { width: calc(100% - 48px); padding: 10px 16px; border: 1px solid rgba(26,42,58,0.1); border-radius: 10px; font-size: 14px; outline: none; font-family: 'DM Sans', sans-serif; color: #1a2a3a; background: rgba(26,42,58,0.02); margin: 12px 24px; }
        .bpm-search:focus { border-color: #5bb8c4; box-shadow: 0 0 0 3px rgba(91,184,196,0.1); }
        .bpm-add-row { padding: 12px 24px; background: rgba(91,184,196,0.04); border-bottom: 1px solid rgba(26,42,58,0.06); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .bpm-add-input { padding: 8px 12px; border: 1px solid rgba(26,42,58,0.12); border-radius: 8px; font-size: 13px; outline: none; font-family: 'DM Sans', sans-serif; color: #1a2a3a; }
        .bpm-add-input:focus { border-color: #5bb8c4; }
        .source-tag { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; }
        .filter-btn { padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(26,42,58,0.12); font-size: 11px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; background: transparent; color: rgba(26,42,58,0.5); }
        .filter-btn:hover { background: rgba(26,42,58,0.05); }
        .filter-btn.active { background: #5bb8c4; color: white; border-color: #5bb8c4; }
        .view-toggle { display: flex; border-radius: 10px; overflow: hidden; border: 1px solid rgba(26,42,58,0.12); }
        .view-toggle button { padding: 6px 14px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; background: transparent; color: rgba(26,42,58,0.5); transition: all 0.15s; }
        .view-toggle button.active { background: #5bb8c4; color: white; }
      `}</style>

      <div className="bpm-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bpm-editor-panel">
          <div className="bpm-editor-header">
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>BPM Database</div>
              <div style={{ fontSize: "13px", color: "rgba(26,42,58,0.45)", marginTop: "2px" }}>
                {viewMode === "master" ? `${Object.keys(BUILTIN_DB).length} songs in master database` : lookupCount > 0 ? <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ {lookupCount} song{lookupCount !== 1 ? "s" : ""} need review</span> : "All songs verified"}
              </div>
            </div>
            <button className="bpm-btn bpm-btn-ghost" onClick={onClose} style={{ fontSize: "22px", padding: "4px 10px" }}>✕</button>
          </div>

          {/* View Mode Toggle */}
          <div style={{ padding: "12px 24px 0", display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="view-toggle">
              <button className={viewMode === "playlist" ? "active" : ""} onClick={() => setViewMode("playlist")}>Current Session</button>
              <button className={viewMode === "master" ? "active" : ""} onClick={() => setViewMode("master")}>Full Master DB</button>
            </div>
          </div>

          <input className="bpm-search" type="text" placeholder={viewMode === "master" ? "Search 5,800+ songs..." : "Search songs..."} value={search} onChange={(e) => setSearch(e.target.value)} />

          {/* Filters + actions */}
          <div style={{ padding: "0 24px 8px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {viewMode === "playlist" && (
              <>
                <button className={`filter-btn ${filterSource === "all" ? "active" : ""}`} onClick={() => setFilterSource("all")}>All ({allEntries.length})</button>
                <button className={`filter-btn ${filterSource === "lookup" ? "active" : ""}`} onClick={() => setFilterSource("lookup")} style={lookupCount > 0 ? { borderColor: "#f59e0b", color: filterSource === "lookup" ? "white" : "#f59e0b", background: filterSource === "lookup" ? "#f59e0b" : "transparent" } : {}}>
                  ⚠ Needs Review ({lookupCount})
                </button>
                <button className={`filter-btn ${filterSource === "builtin" ? "active" : ""}`} onClick={() => setFilterSource("builtin")}>Built-in ({sourceCounts.builtin || 0})</button>
                <button className={`filter-btn ${filterSource === "manual" ? "active" : ""}`} onClick={() => setFilterSource("manual")}>Manual ({sourceCounts.manual || 0})</button>
              </>
            )}
            <div style={{ flex: 1 }} />
            {viewMode === "playlist" && (
              <>
                <button className="bpm-btn bpm-btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Cancel" : "+ Add Song"}</button>
                <button className="bpm-btn bpm-btn-ghost" onClick={() => setShowShare(true)}>Share with community</button>
                <button className="bpm-btn bpm-btn-danger" onClick={handleClearAll}>Clear All</button>
              </>
            )}
          </div>

          {showAdd && viewMode === "playlist" && (
            <div className="bpm-add-row">
              <input className="bpm-add-input" style={{ flex: 2, minWidth: "140px" }} placeholder="Song title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <input className="bpm-add-input" style={{ flex: 2, minWidth: "120px" }} placeholder="Artist" value={newArtist} onChange={(e) => setNewArtist(e.target.value)} />
              <input className="bpm-add-input" style={{ width: "64px" }} type="number" placeholder="BPM" min="30" max="300" value={newBpm} onChange={(e) => setNewBpm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
              <button className="bpm-btn bpm-btn-primary" onClick={handleAdd}>Save</button>
            </div>
          )}

          {/* History panel */}
          {historyKey && (
            <div style={{ padding: "12px 24px", background: "rgba(91,184,196,0.06)", borderBottom: "1px solid rgba(26,42,58,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#5bb8c4" }}>Edit History</div>
                <button className="bpm-btn bpm-btn-ghost" onClick={() => setHistoryKey(null)} style={{ fontSize: "12px" }}>Close</button>
              </div>
              {historyEntries.length === 0 ? (
                <div style={{ fontSize: "12px", color: "rgba(26,42,58,0.4)" }}>No edits recorded for this song</div>
              ) : (
                historyEntries.slice().reverse().map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", fontSize: "12px", color: "rgba(26,42,58,0.6)" }}>
                    <span>{new Date(h.timestamp).toLocaleString()}</span>
                    <span>{h.oldBpm || "?"} → {h.newBpm} BPM</span>
                    <span style={{ color: "#999" }}>({h.source})</span>
                    {h.oldBpm && <button className="bpm-btn bpm-btn-ghost" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => handleRollback(historyKey, h.oldBpm)}>↩ Rollback</button>}
                  </div>
                ))
              )}
            </div>
          )}

          <div className="bpm-editor-body">
            {entries.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "rgba(26,42,58,0.3)" }}>
                {search ? "No songs match your search" : viewMode === "master" ? "Loading master database..." : filterSource !== "all" ? "No songs in this category" : "No BPMs cached yet — play some music!"}
              </div>
            ) : (
              entries.slice(0, 200).map((entry) => {
                const ss = getSourceStyle(entry.source);
                const bc = bpmColor(entry.bpm);
                const rowClass = entry.source === "ai" ? "bpm-row bpm-row-ai"
                  : ["getsongbpm", "firebase", "unknown"].includes(entry.source) ? "bpm-row bpm-row-flagged"
                  : "bpm-row";

                return (
                  <div className={rowClass} key={entry.key}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.title}</div>
                        <span className="source-tag" style={{ color: ss.color, background: ss.bg }}>{ss.label}</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(26,42,58,0.45)", marginTop: "1px" }}>{entry.artist}</div>
                    </div>

                    {editingKey === entry.key ? (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <input className="bpm-input" type="number" min="30" max="300" value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSave(entry.key, editValue); if (e.key === "Escape") setEditingKey(null); }}
                          autoFocus />
                        <button className="bpm-btn bpm-btn-primary" onClick={() => handleSave(entry.key, editValue)}>✓</button>
                        <button className="bpm-btn bpm-btn-ghost" onClick={() => setEditingKey(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <div className={`bpm-badge ${entry.bpm ? "" : "empty"}`}
                          style={entry.bpm ? { color: bc, background: `${bc}18` } : {}}
                          onClick={() => { setEditingKey(entry.key); setEditValue(entry.bpm ? String(entry.bpm) : ""); }}>
                          {entry.bpm ? `${entry.bpm} BPM` : "Set BPM"}
                        </div>
                        <button className="bpm-btn bpm-btn-ghost" onClick={() => setHistoryKey(historyKey === entry.key ? null : entry.key)}
                          title="View edit history" style={{ fontSize: "14px", padding: "4px 8px", color: "rgba(26,42,58,0.3)" }}>🕐</button>
                        {viewMode === "playlist" && (
                          <button className="bpm-btn bpm-btn-ghost" onClick={() => handleDelete(entry.key)}
                            title="Re-lookup BPM next time this plays" style={{ fontSize: "14px", padding: "4px 8px", color: "rgba(26,42,58,0.25)" }}>🔄</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {entries.length > 200 && (
              <div style={{ padding: "16px 24px", textAlign: "center", color: "rgba(26,42,58,0.3)", fontSize: "13px" }}>
                Showing 200 of {entries.length} songs — use search to find more
              </div>
            )}
          </div>

          <div className="bpm-editor-footer">
            <span>{Math.min(entries.length, 200)} of {entries.length} song{entries.length !== 1 ? "s" : ""}{filterSource !== "all" ? " (filtered)" : ""}</span>
            <span>
              <span style={{ color: "#9b8ec4" }}>●</span> Slow&nbsp;&nbsp;
              <span style={{ color: "#5bb8c4" }}>●</span> Medium&nbsp;&nbsp;
              <span style={{ color: "#e8b84a" }}>●</span> Moderate&nbsp;&nbsp;
              <span style={{ color: "#e06070" }}>●</span> Fast
            </span>
          </div>
        </div>
      </div>
      {showShare && <ShareWithCommunity onClose={() => setShowShare(false)} />}
    </>
  );
}

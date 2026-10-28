// ─── Share with Community ───────────────────────────────────────────────────
// Sends the tempos this group's DJs entered by hand — new songs and
// corrections — to the WOW Player community master list. Nothing is published
// until the list's maintainers approve it; approved tempos then reach every
// group's player through the master-list lookup in netlify/functions/bpm.mjs.

import { useEffect, useState } from "react";

const COMMUNITY_URL = (import.meta.env.VITE_COMMUNITY_URL || "https://westorlandowesties.netlify.app").replace(/\/+$/, "");
const SUBMIT_URL = `${COMMUNITY_URL}/.netlify/functions/submit`;
const BPM_CACHE_KEY = "wow_bpm_cache";
const BRANDING_KEY = "wow_branding";
const SHARED_KEY = "wow_shared_bpms"; // song key → tempo already sent

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}

// Hand-entered tempos from this group's own database plus this device's edits,
// minus anything already sent with the same tempo.
async function gatherManualEntries() {
  const byKey = new Map();
  try {
    const resp = await fetch("/.netlify/functions/bpm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "manual-list" }),
    });
    if (resp.ok) {
      for (const e of (await resp.json()).entries || []) {
        byKey.set(`${e.title}|||${e.artist}`.toLowerCase(), e);
      }
    }
  } catch {}
  for (const [key, value] of Object.entries(loadJson(BPM_CACHE_KEY))) {
    if (value && typeof value === "object" && value.source === "manual" && value.bpm) {
      const [title, artist = ""] = key.split("|||");
      byKey.set(key, { title, artist, bpm: value.bpm });
    }
  }
  const shared = loadJson(SHARED_KEY);
  return [...byKey.entries()]
    .filter(([key, e]) => shared[key] !== e.bpm)
    .map(([key, e]) => ({ key, title: e.title, artist: e.artist, bpm: e.bpm }));
}

async function postSubmission(group, entries, dryRun) {
  const resp = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group, dryRun, entries: entries.map(({ title, artist, bpm }) => ({ title, artist, bpm })) }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Server error ${resp.status}`);
  return data;
}

function describe(newSongs, corrections) {
  const parts = [];
  if (newSongs) parts.push(`${newSongs} new song${newSongs === 1 ? "" : "s"}`);
  if (corrections) parts.push(`${corrections} correction${corrections === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

export default function ShareWithCommunity({ onClose }) {
  const [group, setGroup] = useState(() => loadJson(BRANDING_KEY).communityName || "");
  const [entries, setEntries] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | sending | done | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const found = await gatherManualEntries();
        setEntries(found);
        if (found.length === 0) { setStatus("ready"); return; }
        setPreview(await postSubmission("preview", found, true));
        setStatus("ready");
      } catch (err) {
        setMessage(err.message);
        setStatus("error");
      }
    })();
  }, []);

  const send = async () => {
    if (!group.trim()) return;
    setStatus("sending");
    try {
      const result = await postSubmission(group.trim(), entries, false);
      const shared = loadJson(SHARED_KEY);
      for (const e of entries) shared[e.key] = e.bpm;
      try { localStorage.setItem(SHARED_KEY, JSON.stringify(shared)); } catch {}
      setMessage(result.received
        ? `Sent ${describe(result.newSongs, result.corrections)}. Thanks! They'll appear for everyone once approved.`
        : "The master list already has all of these tempos. Nothing to send.");
      setStatus("done");
    } catch (err) {
      setMessage(err.message);
      setStatus("error");
    }
  };

  const nothingToSend = status === "ready" && (!entries?.length || !preview?.received);

  return (
    <div className="bpm-editor-overlay" style={{ zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bpm-editor-panel" style={{ maxWidth: "460px", padding: "24px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>Share with the community</div>
        <div style={{ fontSize: "14px", color: "rgba(26,42,58,0.6)", lineHeight: 1.5, marginBottom: "18px" }}>
          Send the tempos your DJs entered by hand to the shared WOW Player song list. They're reviewed before
          they go live, then every group using WOW Player gets them.
        </div>

        {status === "loading" && <div style={{ color: "rgba(26,42,58,0.5)" }}>Checking your tempos…</div>}

        {nothingToSend && (
          <div style={{ color: "rgba(26,42,58,0.6)" }}>
            {entries?.length
              ? "The master list already has all of your hand-entered tempos."
              : "No new hand-entered tempos to share. Edit or add songs in the BPM editor first."}
          </div>
        )}

        {status === "ready" && preview?.received > 0 && (
          <>
            <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>
              Ready to send: {describe(preview.newSongs, preview.corrections)}
            </div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Your group's name</label>
            <input
              className="bpm-add-input"
              style={{ width: "100%", boxSizing: "border-box", marginBottom: "18px" }}
              placeholder="e.g. Bay Area Swing"
              maxLength={80}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </>
        )}

        {status === "sending" && <div style={{ color: "rgba(26,42,58,0.5)" }}>Sending…</div>}
        {status === "done" && <div style={{ color: "#1a7f4b", fontWeight: 600 }}>{message}</div>}
        {status === "error" && <div style={{ color: "#e74c3c" }}>Couldn't reach the community list: {message}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button className="bpm-btn bpm-btn-ghost" onClick={onClose}>{status === "done" ? "Close" : "Cancel"}</button>
          {status === "ready" && preview?.received > 0 && (
            <button className="bpm-btn bpm-btn-primary" disabled={!group.trim()} onClick={send}>Send</button>
          )}
        </div>
      </div>
    </div>
  );
}

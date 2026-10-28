// Netlify Function: BPM lookup proxy
// Handles GetSongBPM API + Firebase read/write — avoids CORS issues
//
// Configure in Netlify → Site configuration → Environment variables.
// Every one is optional; a step whose variable is unset is skipped.
//   FIREBASE_DB_URL     your Realtime Database URL (shared BPM list for your DJs)
//   GETSONGBPM_API_KEY  free key from https://getsongbpm.com/api
//   ANTHROPIC_API_KEY   key from https://console.anthropic.com (AI estimate fallback)
//   ANTHROPIC_MODEL     optional model override (default below)
//   MASTER_DB_URL       community master list, read after your own database
//                       (defaults to the WOW Player list; set to "off" to skip)

const GETSONGBPM_API = "https://api.getsongbpm.com";
const GETSONGBPM_KEY = process.env.GETSONGBPM_API_KEY || "";
const FIREBASE_DB = (process.env.FIREBASE_DB_URL || "").replace(/\/+$/, "");
const MASTER_DB_SETTING = process.env.MASTER_DB_URL || "https://wow-player-default-rtdb.firebaseio.com";
const MASTER_DB = MASTER_DB_SETTING === "off" ? "" : MASTER_DB_SETTING.replace(/\/+$/, "");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { action, title, artist, key, bpm, source, token: spotifyToken, playlistId, offset: reqOffset } = JSON.parse(event.body || "{}");

    // ─── Spotify Playlist Tracks Proxy ──────────────────────────────
    if (action === "spotify-playlist") {
      if (!spotifyToken || !playlistId) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing token or playlistId" }) };
      }
      try {
        const off = reqOffset || 0;
        const resp = await fetch(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&offset=${off}`,
          { headers: { Authorization: `Bearer ${spotifyToken}` } }
        );
        if (!resp.ok) {
          const errText = await resp.text();
          console.error("Spotify playlist error:", resp.status, errText);
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ error: `Spotify ${resp.status}`, items: [] }) };
        }
        const data = await resp.json();
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
      } catch (err) {
        console.error("Spotify playlist proxy error:", err);
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message, items: [] }) };
      }
    }

    // ─── Firebase Read ───────────────────────────────────────────────
    // Your own database first (your DJs' choices win), then the community master list.
    if (action === "firebase-get") {
      for (const db of [FIREBASE_DB, MASTER_DB !== FIREBASE_DB ? MASTER_DB : ""]) {
        if (!db) continue;
        try {
          const resp = await fetch(`${db}/bpms/${encodeURIComponent(key)}.json`);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.bpm) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: data.bpm }) };
          }
        } catch {}
      }
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
    }

    // ─── Hand-entered tempos in your own database (for sharing) ─────
    if (action === "manual-list") {
      if (!FIREBASE_DB) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ entries: [] }) };
      try {
        const resp = await fetch(`${FIREBASE_DB}/bpms.json`);
        const all = resp.ok ? (await resp.json()) || {} : {};
        const entries = Object.values(all)
          .filter((e) => e?.source === "manual" && e.title && e.bpm)
          .map(({ title, artist, bpm }) => ({ title, artist: artist || "", bpm }));
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ entries }) };
      } catch {}
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ entries: [] }) };
    }

    // ─── Firebase Write ──────────────────────────────────────────────
    if (action === "firebase-set") {
      if (!FIREBASE_DB) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: false }) };
      try {
        const resp = await fetch(`${FIREBASE_DB}/bpms/${encodeURIComponent(key)}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bpm, title, artist, source: source || "unknown", updated: Date.now() }),
        });
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: resp.ok }) };
      } catch {}
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: false }) };
    }

    // ─── GetSongBPM Search ───────────────────────────────────────────
    if (action === "search") {
      if (!title) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing title" }) };
      }
      if (!GETSONGBPM_KEY) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };

      const query = encodeURIComponent(`${title} ${artist || ""}`);
      const url = `${GETSONGBPM_API}/search/?api_key=${GETSONGBPM_KEY}&type=both&lookup=${query}`;

      const resp = await fetch(url);
      if (!resp.ok) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null, error: `API ${resp.status}` }) };
      }

      const data = await resp.json();
      if (!data?.search || data.search.length === 0) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
      }

      // Find best match
      const ct = title.toLowerCase().trim();
      const ca = (artist || "").toLowerCase().trim();
      let bestMatch = null;

      for (const result of data.search) {
        const rt = (result.title || "").toLowerCase();
        const ra = (result.artist?.name || "").toLowerCase();
        if ((rt === ct || rt.includes(ct) || ct.includes(rt)) &&
            (ra.includes(ca) || ca.includes(ra))) {
          bestMatch = result;
          break;
        }
        if (rt === ct || rt.includes(ct) || ct.includes(rt)) {
          if (!bestMatch) bestMatch = result;
        }
      }

      if (!bestMatch) bestMatch = data.search[0];

      // If tempo in search result
      if (bestMatch.tempo) {
        const bpmVal = parseInt(bestMatch.tempo, 10);
        if (!isNaN(bpmVal) && bpmVal > 30 && bpmVal < 300) {
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: bpmVal, source: "getsongbpm" }) };
        }
      }

      // Fetch song details for tempo
      if (bestMatch.id) {
        const songResp = await fetch(`${GETSONGBPM_API}/song/?api_key=${GETSONGBPM_KEY}&id=${bestMatch.id}`);
        if (songResp.ok) {
          const songData = await songResp.json();
          if (songData?.song?.tempo) {
            const bpmVal = parseInt(songData.song.tempo, 10);
            if (!isNaN(bpmVal) && bpmVal > 30 && bpmVal < 300) {
              return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: bpmVal, source: "getsongbpm" }) };
            }
          }
        }
      }

      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
    }

    // ─── AI BPM Estimate (Anthropic Claude) ─────────────────────────
    if (action === "ai-lookup") {
      if (!title) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing title" }) };
      }
      if (!ANTHROPIC_KEY) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            output_config: { effort: "low" },
            messages: [{
              role: "user",
              content: `What is the tempo in BPM of the song "${title}" by "${artist || "unknown"}"? I need the actual tempo for dance DJing. Most pop/R&B songs are 80-130 BPM. Reply with ONLY a number, nothing else.`,
            }],
          }),
        });

        if (!response.ok) {
          console.error("Anthropic API error:", response.status);
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
        }

        const data = await response.json();
        const text = data.content?.find((b) => b.type === "text")?.text?.trim();
        if (text) {
          const match = text.match(/\d{2,3}/);
          if (match) {
            const bpmVal = parseInt(match[0], 10);
            if (!isNaN(bpmVal) && bpmVal > 30 && bpmVal < 300) {
              return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: bpmVal, source: "ai-estimate" }) };
            }
          }
        }
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
      } catch (err) {
        console.error("AI lookup error:", err);
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bpm: null }) };
      }
    }

    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unknown action" }) };
  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Internal error" }) };
  }
};

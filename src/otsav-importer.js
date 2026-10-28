// ─── OtsAV Importer ─────────────────────────────────────────────────────────
// Pure functions to parse an OtsAV DJ Pro CSV export into the track shape the
// player understands, plus Spotify enrichment (artist images / album names)
// via our Client-Credentials serverless proxy.
//
// CSV columns: Artist, Title, Copyright, Length, Release Date, Album Name,
//              Album Copyright, File Name
// Encoding:    ISO-8859-1 (latin1) — decoded by the caller before parsing.
// Title shape: "<Name> <BPM> (<Genre>-<Number>) [optional tag]"

import Papa from "papaparse";

const BPM_CACHE_KEY = "wow_bpm_cache";

// Extract BPM from an OtsAV-style title. Returns { bpm, displayTitle }.
export function parseOtsAVTitle(rawTitle) {
  let t = rawTitle || "";
  let bpm = null;

  // Candidate BPMs: 2-3 digit numbers preceded by a space, followed by
  // space / "(" / end. Keep the first that falls in a sane musical range.
  const matches = [...t.matchAll(/\s(\d{2,3})(?=\s|\(|$)/g)];
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n >= 60 && n <= 200) {
      bpm = n;
      t = t.replace(new RegExp(`\\s${n}(?=\\s|\\(|$)`), "");
      break;
    }
  }

  // Strip parenthetical and bracket tags (genre codes, "[Wp Edit]", etc.)
  t = t.replace(/\s*\([^)]*\)\s*/g, " ");
  t = t.replace(/\s*\[[^\]]*\]\s*/g, " ");
  // Strip Wavepad tags (e.g. "Wp+2"). NOTE: we intentionally do NOT strip
  // standalone pitch shifts like " -4" — the sample data shows these are part
  // of the DJ's display title (e.g. "Abu Dhabi -4") and must be kept on screen.
  t = t.replace(/\b(Wp\s?[+-]?\d+(\.\d+)?|WP\s?[+-]?\d+(\.\d+)?)\b/gi, "");
  // Strip key / production tags
  t = t.replace(/\s*[+-]Key\b/gi, "");
  t = t.replace(/\b(Wp Edit|WP Edit|Wp Agc|WP Agc|Edit|Short|Splice|gj)\b/gi, "");
  // Final cleanup
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*-\s*$/, "").trim();

  return { bpm, displayTitle: t || rawTitle };
}

// Parse the full CSV text into an array of track objects.
export function parseOtsAVCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data
    .map((row) => {
      const { bpm, displayTitle } = parseOtsAVTitle(row.Title);
      return {
        artist: (row.Artist || "").trim(),
        title: displayTitle,
        originalTitle: row.Title || "",
        bpm,
        length: row.Length || null,
        albumName: (row["Album Name"] || "").trim() || null,
        source: "otsav",
      };
    })
    .filter((t) => t.artist && t.title); // drop empty rows
}

// Enrich a single track with Spotify artwork / metadata via the proxy.
export async function enrichWithSpotify(track) {
  try {
    const query = `track:${track.title} artist:${track.artist}`;
    const r = await fetch(
      `/.netlify/functions/spotify-search?q=${encodeURIComponent(query)}&type=track`
    );
    if (r.ok) {
      const data = await r.json();
      const item = data.tracks?.items?.[0];
      if (item) {
        return {
          ...track,
          albumArt: item.album?.images?.[0]?.url || null,
          artistImage: item.album?.images?.[0]?.url || null,
          albumName: item.album?.name || track.albumName,
          spotifyUri: item.uri || null,
        };
      }
    }
    // Track not found — fall back to artist-only search for at least an image.
    const ar = await fetch(
      `/.netlify/functions/spotify-search?q=${encodeURIComponent(track.artist)}&type=artist`
    );
    if (ar.ok) {
      const adata = await ar.json();
      const aitem = adata.artists?.items?.[0];
      if (aitem) {
        const img = aitem.images?.[0]?.url || null;
        return { ...track, albumArt: img, artistImage: img };
      }
    }
  } catch (e) {
    console.warn("Spotify enrichment failed for", track.artist, "-", track.title, e);
  }
  return track;
}

// Pre-populate the shared BPM cache so the existing BPM Editor (and any later
// Spotify-mode lookups) immediately see the BPMs the DJ already tagged.
// Mirrors the cache format used by src/bpm-lookup.js: key `title|||artist`
// lowercased, value `{ bpm, source }`.
export function primeBpmCache(tracks) {
  try {
    const cache = JSON.parse(localStorage.getItem(BPM_CACHE_KEY) || "{}");
    for (const t of tracks) {
      if (!t.bpm) continue;
      const key = `${t.title}|||${t.artist}`.toLowerCase().trim();
      // Don't clobber a manually-corrected entry.
      const existing = cache[key];
      const existingSource = existing && typeof existing === "object" ? existing.source : null;
      if (existingSource === "manual") continue;
      cache[key] = { bpm: t.bpm, source: "otsav" };
    }
    localStorage.setItem(BPM_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Could not prime BPM cache:", e);
  }
}

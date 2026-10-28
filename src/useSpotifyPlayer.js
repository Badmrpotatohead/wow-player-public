// ─── useSpotifyPlayer Hook ─────────────────────────────────────────────────
// Polls Spotify playback. Respects rate limits aggressively.

import { useState, useEffect, useRef, useCallback } from "react";
import { getAccessToken, isLoggedIn } from "./spotify-auth";
import { getCurrentPlayback, getQueue, getCurrentUser } from "./spotify-api";
import { lookupBPM } from "./bpm-lookup";

const PLAYBACK_POLL_MS = 5000;    // Poll every 5 seconds (safe rate)
const QUEUE_POLL_MS = 15000;      // Queue every 15 seconds
const RATE_LIMIT_PAUSE_MS = 60000; // On 429: STOP for 60 seconds

export function useSpotifyPlayer(clientId) {
  const [state, setState] = useState({
    isConnected: false,
    isPlaying: false,
    currentTrack: null,
    previousTracks: [],
    elapsed: 0,
    queue: [],
    playlistName: null,
    userName: null,
    userId: null,
    error: null,
    rateLimited: false,
  });

  const lastQueuePoll = useRef(0);
  const progressTimer = useRef(null);
  const lastPlaybackMs = useRef(0);
  const lastPlaybackTime = useRef(0);
  const bpmInFlight = useRef(new Set());
  const bpmNotFound = useRef(new Set());
  const userFetched = useRef(false);
  const rateLimitedUntil = useRef(0);
  const playlistPrefetched = useRef(null);
  const unauthorizedRetry = useRef(false);

  // Prefetch all tracks in a playlist via server proxy (avoids Spotify 403)
  const prefetchPlaylistBPMs = useCallback(async (token, playlistId) => {
    if (playlistPrefetched.current === playlistId) return;
    playlistPrefetched.current = playlistId;
    console.log(`📋 Prefetching BPMs for playlist ${playlistId} via proxy...`);

    try {
      // Fetch all tracks via Netlify proxy in batches of 50
      const allTracks = [];
      let offset = 0;
      let total = 0;
      do {
        const resp = await fetch("/.netlify/functions/bpm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "spotify-playlist", token, playlistId, offset }),
        });
        const data = await resp.json();
        if (data.error) {
          console.warn("📋 Playlist proxy error:", data.error);
          break;
        }
        if (!data.items) break;
        total = data.total || 0;
        for (const item of data.items) {
          const track = item?.track;
          if (!track?.id || !track?.name) continue;
          allTracks.push({
            id: track.id,
            title: track.name,
            artist: track.artists?.map((a) => a.name).join(", ") || "Unknown",
          });
        }
        offset += data.items.length;
      } while (offset < total);

      if (allTracks.length === 0) {
        console.log("📋 No tracks found in playlist");
        playlistPrefetched.current = null;
        return;
      }

      console.log(`📋 Found ${allTracks.length} tracks in playlist. Looking up BPMs...`);

      // Pre-populate missing cache entries. Skip if already cached to avoid overwriting real data.
      try {
        const existingCache = JSON.parse(localStorage.getItem("wow_bpm_cache") || "{}");
        let added = 0;
        for (const t of allTracks.slice(0, 500)) {
          const k = `${t.title}|||${t.artist}`.toLowerCase().trim();
          if (!(k in existingCache)) {
            existingCache[k] = { bpm: null, source: "pending" };
            added++;
          }
        }
        if (added > 0) localStorage.setItem("wow_bpm_cache", JSON.stringify(existingCache));
      } catch (e) { console.warn("Cache pre-populate limit/error:", e); }

      // Process sequentially
      let found = 0;
      let missed = 0;
      for (const track of allTracks) {
        try {
          const bpm = await lookupBPM(null, track.title, track.artist);
          if (bpm) {
            found++;
            setState((prev) => {
              const updated = { ...prev };
              if (updated.currentTrack?.id === track.id && !updated.currentTrack.bpm)
                updated.currentTrack = { ...updated.currentTrack, bpm };
              updated.queue = updated.queue.map((qt) =>
                qt.id === track.id && !qt.bpm ? { ...qt, bpm } : qt
              );
              return updated;
            });
          } else {
            missed++;
            console.log(`📋 No BPM for: "${track.title}" by "${track.artist}"`);
          }
        } catch (err) {
          missed++;
        }
        // Small delay between network lookups
        await new Promise((r) => setTimeout(r, 200));
      }

      console.log(`✅ Playlist prefetch complete: ${found} found, ${missed} missed out of ${allTracks.length}`);
    } catch (err) {
      console.warn("Playlist prefetch error:", err);
      playlistPrefetched.current = null;
    }
  }, []);

  const toDisplayTrack = useCallback((track) => {
    if (!track) return null;
    return {
      id: track.id,
      title: track.name,
      artist: track.artists?.map((a) => a.name).join(", ") || "Unknown",
      bpm: null,
      duration: Math.round((track.duration_ms || 0) / 1000),
      albumArt: track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || null,
    };
  }, []);

  const lookupTrackBPM = useCallback(async (trackId, title, artist) => {
    if (bpmInFlight.current.has(trackId)) return;
    if (bpmNotFound.current.has(trackId)) return;
    bpmInFlight.current.add(trackId);
    try {
      const bpm = await lookupBPM(null, title, artist);
      if (bpm) {
        setState((prev) => {
          const updated = { ...prev };
          if (updated.currentTrack?.id === trackId)
            updated.currentTrack = { ...updated.currentTrack, bpm };
          if (updated.previousTrack?.id === trackId)
            updated.previousTrack = { ...updated.previousTrack, bpm };
          updated.queue = updated.queue.map((t) =>
            t.id === trackId ? { ...t, bpm } : t
          );
          return updated;
        });
      } else {
        bpmNotFound.current.add(trackId);
      }
    } catch (err) {
      console.warn("BPM lookup failed for", title, err);
      bpmNotFound.current.add(trackId);
    } finally {
      bpmInFlight.current.delete(trackId);
    }
  }, []);

  // Smooth progress interpolation
  useEffect(() => {
    if (!state.isPlaying) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      return;
    }
    progressTimer.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isPlaying || !prev.currentTrack) return prev;
        const now = Date.now();
        const interpolated = lastPlaybackMs.current + (now - lastPlaybackTime.current);
        const newElapsed = Math.min(Math.round(interpolated / 1000), prev.currentTrack.duration);
        return { ...prev, elapsed: newElapsed };
      });
    }, 250);
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [state.isPlaying]);

  // Main polling loop
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let pollTimeout;

    async function poll() {
      if (!active || !isLoggedIn()) return;

      // Check if we're in rate limit cooldown
      const now = Date.now();
      if (now < rateLimitedUntil.current) {
        const waitSec = Math.ceil((rateLimitedUntil.current - now) / 1000);
        console.log(`Rate limit cooldown: ${waitSec}s remaining. Not polling.`);
        setState((prev) => ({ ...prev, isConnected: true, rateLimited: true }));
        if (active) pollTimeout = setTimeout(poll, 5000); // Check again in 5s
        return;
      }

      // Clear rate limit flag
      setState((prev) => prev.rateLimited ? { ...prev, rateLimited: false } : prev);

      let token;
      try {
        token = await getAccessToken(clientId);
      } catch (err) {
        console.error("Token error:", err);
        setState((prev) => ({ ...prev, isConnected: false, error: "Session expired." }));
        return;
      }

      if (!token) {
        setState((prev) => ({ ...prev, isConnected: false, error: "No token. Please log in." }));
        return;
      }

      // Mark connected
      setState((prev) => prev.isConnected ? prev : { ...prev, isConnected: true });

      // Fetch user profile once
      if (!userFetched.current) {
        userFetched.current = true;
        try {
          const user = await getCurrentUser(token);
          if (user) {
            setState((prev) => ({
              ...prev,
              userName: user.display_name || user.id,
              userId: user.id,
              isConnected: true,
            }));
          }
        } catch (err) {
          console.warn("User fetch failed:", err.message);
          if (err.message?.includes("429")) {
            rateLimitedUntil.current = Date.now() + RATE_LIMIT_PAUSE_MS;
            console.warn("Rate limited on user fetch. Pausing for 60s.");
            setState((prev) => ({ ...prev, isConnected: true, rateLimited: true }));
            if (active) pollTimeout = setTimeout(poll, RATE_LIMIT_PAUSE_MS);
            return;
          }
          userFetched.current = false;
        }
      }

      // Fetch playback
      try {
        const playback = await getCurrentPlayback(token);
        unauthorizedRetry.current = false;

        if (!playback || !playback.item) {
          setState((prev) => ({
            ...prev, isConnected: true, isPlaying: false,
            currentTrack: null, elapsed: 0, error: null,
          }));
        } else {
          const track = playback.item;
          const progressMs = playback.progress_ms || 0;
          lastPlaybackMs.current = progressMs;
          lastPlaybackTime.current = Date.now();
          const currentDisplay = toDisplayTrack(track);

          // Queue (throttled separately)
          let queueDisplay;
          if (Date.now() - lastQueuePoll.current > QUEUE_POLL_MS) {
            lastQueuePoll.current = Date.now();
            try {
              const queueData = await getQueue(token);
              if (queueData?.queue) {
                queueDisplay = queueData.queue.slice(0, 6).map(toDisplayTrack).filter(Boolean);
                for (const qt of queueDisplay) {
                  lookupTrackBPM(qt.id, qt.title, qt.artist);
                }
              }
            } catch (qErr) {
              if (qErr.message?.includes("429")) {
                // Queue got rate limited — skip queue but don't kill main loop
                console.warn("Queue rate limited, skipping this cycle");
              }
            }
          }

          if (currentDisplay) {
            lookupTrackBPM(currentDisplay.id, currentDisplay.title, currentDisplay.artist);
          }

          // Prefetch entire playlist for BPM database (via server proxy)
          if (playback.context?.type === "playlist" && playback.context?.uri) {
            const playlistId = playback.context.uri.split(":").pop();
            if (playlistId) {
              prefetchPlaylistBPMs(token, playlistId);
            }
          }

          setState((prev) => {
            let previousTracks = [...(prev.previousTracks || [])];
            if (currentDisplay && prev.currentTrack && prev.currentTrack.id !== currentDisplay.id) {
              previousTracks = [prev.currentTrack, ...previousTracks].slice(0, 3);
            }
            if (currentDisplay && prev.currentTrack?.id === currentDisplay.id && prev.currentTrack.bpm) {
              currentDisplay.bpm = prev.currentTrack.bpm;
            }
            const newQueue = queueDisplay !== undefined ? queueDisplay : prev.queue;
            const mergedQueue = newQueue.map((qt) => {
              const existing = prev.queue.find((pq) => pq.id === qt.id);
              return existing?.bpm && !qt.bpm ? { ...qt, bpm: existing.bpm } : qt;
            });
            return {
              ...prev, isConnected: true, isPlaying: playback.is_playing,
              currentTrack: currentDisplay, previousTracks,
              elapsed: Math.round(progressMs / 1000), queue: mergedQueue,
              playlistName: prev.playlistName || (playback.context?.type === "playlist" ? "Playlist" : null),
              error: null,
            };
          });
        }
      } catch (err) {
        if (err.message === "UNAUTHORIZED") {
          // Access token likely just expired (normal, ~hourly). Try a refresh and
          // one retry before giving up. DO NOT call logout() on a single 401 —
          // that strands the user on the Connecting screen. getAccessToken() handles
          // the refresh and preserves the token on transient failures (see #37).
          if (!unauthorizedRetry.current) {
            unauthorizedRetry.current = true;
            console.warn("Poll got 401 — attempting token refresh and retry");
            try {
              const fresh = await getAccessToken(clientId);
              if (fresh) {
                // Refresh succeeded — retry the poll shortly. Keep isConnected true
                // so the UI doesn't flash the Connecting screen.
                if (active) pollTimeout = setTimeout(poll, 1000);
                return;
              }
            } catch (refreshErr) {
              console.error("Refresh after 401 failed:", refreshErr);
            }
            // Refresh returned nothing / failed — surface a soft error but do NOT
            // logout(). If the refresh token is truly dead, spotify-auth already
            // called logout() internally on invalid_grant. Leave recovery to the
            // user via the login screen.
            setState((prev) => ({ ...prev, isConnected: false, error: "Session expired. Please log in again." }));
            return;
          }
          // Second consecutive 401 even after a refresh — genuine auth failure.
          console.error("Poll got 401 again after refresh — session cannot be recovered");
          setState((prev) => ({ ...prev, isConnected: false, error: "Session expired. Please log in again." }));
          unauthorizedRetry.current = false;
          return;
        }
        if (err.message?.includes("429")) {
          // STOP polling for 60 seconds
          rateLimitedUntil.current = Date.now() + RATE_LIMIT_PAUSE_MS;
          console.warn("🛑 Rate limited by Spotify. STOPPING all requests for 60 seconds.");
          setState((prev) => ({ ...prev, isConnected: true, rateLimited: true, error: null }));
          if (active) pollTimeout = setTimeout(poll, RATE_LIMIT_PAUSE_MS);
          return; // Don't schedule normal poll
        }
        console.error("Polling error:", err);
      }

      // Schedule next normal poll
      if (active) pollTimeout = setTimeout(poll, PLAYBACK_POLL_MS);
    }

    // Start with a small delay to avoid immediate spam on page load
    pollTimeout = setTimeout(poll, 1000);

    return () => { active = false; if (pollTimeout) clearTimeout(pollTimeout); };
  }, [clientId, toDisplayTrack, lookupTrackBPM, prefetchPlaylistBPMs]);

  return state;
}

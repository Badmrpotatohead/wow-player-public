// ─── Spotify API Client ────────────────────────────────────────────────────
// Wraps the Spotify Web API endpoints needed for the WOW player.
// All methods require a valid access token.

const BASE = "https://api.spotify.com/v1";

async function apiFetch(endpoint, token, options = {}) {
  const response = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 204) return null; // No content (nothing playing)
  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "5";
    throw new Error(`429: Too many requests. Retry after ${retryAfter}s`);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── Playback State ────────────────────────────────────────────────────────

/**
 * Get the user's current playback state.
 * Returns null if nothing is playing.
 * @returns {{ 
 *   is_playing: boolean,
 *   progress_ms: number,
 *   item: { id, name, artists, album, duration_ms },
 *   context: { uri, type }
 * } | null}
 */
export async function getCurrentPlayback(token) {
  return apiFetch("/me/player", token);
}

/**
 * Get the user's playback queue.
 * @returns {{ currently_playing: object, queue: object[] }}
 */
export async function getQueue(token) {
  return apiFetch("/me/player/queue", token);
}

// ─── Audio Features (BPM) ──────────────────────────────────────────────────

/**
 * Get audio features for a single track.
 * @returns {{ tempo: number, energy: number, danceability: number, ... }}
 */
export async function getAudioFeatures(token, trackId) {
  return apiFetch(`/audio-features/${trackId}`, token);
}

/**
 * Get audio features for multiple tracks (max 100).
 * @param {string[]} trackIds
 * @returns {{ audio_features: Array<{ id, tempo, energy, ... }> }}
 */
export async function getMultipleAudioFeatures(token, trackIds) {
  if (trackIds.length === 0) return { audio_features: [] };
  const ids = trackIds.slice(0, 100).join(",");
  return apiFetch(`/audio-features?ids=${ids}`, token);
}

// ─── Playlists ─────────────────────────────────────────────────────────────

/**
 * Get a playlist's tracks.
 * @param {string} playlistId
 * @param {number} limit - Max 50
 * @param {number} offset
 */
export async function getPlaylistTracks(token, playlistId, limit = 50, offset = 0) {
  return apiFetch(
    `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
    token
  );
}

/**
 * Get the current user's playlists.
 */
export async function getUserPlaylists(token, limit = 50) {
  return apiFetch(`/me/playlists?limit=${limit}`, token);
}

/**
 * Get playlist metadata.
 */
export async function getPlaylist(token, playlistId) {
  return apiFetch(
    `/playlists/${playlistId}?fields=id,name,description,owner(display_name),images,tracks(total)`,
    token
  );
}

// ─── User Profile ──────────────────────────────────────────────────────────

export async function getCurrentUser(token) {
  return apiFetch("/me", token);
}

// ─── Combined: Build display-ready track data ──────────────────────────────

/**
 * Takes raw Spotify track objects and enriches them with BPM from audio features.
 * Returns display-ready track objects matching the WOW player format.
 *
 * @param {string} token
 * @param {object[]} spotifyTracks - Array of Spotify track objects
 * @returns {Promise<Array<{
 *   id: string,
 *   title: string,
 *   artist: string,
 *   bpm: number,
 *   duration: number,
 *   albumArt: string
 * }>>}
 */
export async function enrichTracksWithBPM(token, spotifyTracks) {
  const validTracks = spotifyTracks.filter((t) => t && t.id);
  const trackIds = validTracks.map((t) => t.id);

  // Fetch BPM in batches of 100
  const bpmMap = {};
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    try {
      const features = await getMultipleAudioFeatures(token, batch);
      if (features?.audio_features) {
        features.audio_features.forEach((f) => {
          if (f) bpmMap[f.id] = Math.round(f.tempo);
        });
      }
    } catch (err) {
      console.warn("Failed to fetch audio features for batch:", err);
    }
  }

  return validTracks.map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
    bpm: bpmMap[track.id] || null,
    duration: Math.round((track.duration_ms || 0) / 1000),
    albumArt:
      track.album?.images?.[0]?.url ||
      track.album?.images?.[1]?.url ||
      "https://via.placeholder.com/300x300?text=No+Art",
  }));
}

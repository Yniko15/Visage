/*
  spotify.js — Spotify Integration (PKCE Auth Flow)
  Fixed: SDK initialization timing + connection state persistence

  NOTE: SPOTIFY_CONFIG, AUTH_CONFIG, SECURITY_CONFIG, and
  PLAYBACK_CONFIG are defined in config.js (loaded before this file).
*/

let spotifyToken = null;
let spotifyRefreshToken = null;
let spotifyTokenExpiry = 0;
let spotifyPlayer = null;
let deviceId = null;
let sdkReady = false;
let progressPoller = null;

/* ── PKCE HELPERS ──────────────────────────────────────*/
function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/* ── LOGIN ─────────────────────────────────────────────*/
async function loginWithSpotify() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_verifier', verifier);

  const url = 'https://accounts.spotify.com/authorize'
    + '?response_type=code'
    + '&client_id=' + encodeURIComponent(SPOTIFY_CONFIG.clientId)
    + '&scope=' + encodeURIComponent(SPOTIFY_CONFIG.scopes)
    + '&redirect_uri=' + encodeURIComponent(SPOTIFY_CONFIG.redirectUri)
    + '&code_challenge_method=S256'
    + '&code_challenge=' + encodeURIComponent(challenge);

  window.location.href = url;
}

/* ── TOKEN EXCHANGE ────────────────────────────────────*/
async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('spotify_verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    client_id: SPOTIFY_CONFIG.clientId,
    code_verifier: verifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });

  const data = await response.json();

  if (data.access_token) {
    spotifyToken = data.access_token;
    localStorage.removeItem('spotify_verifier');

    /* Save token + refresh token + expiry to localStorage */
    localStorage.setItem('spotify_token', spotifyToken);

    if (data.refresh_token) {
      spotifyRefreshToken = data.refresh_token;
      localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }

    /* expires_in is in seconds — save the absolute expiry timestamp */
    const expiresIn = data.expires_in || 3600;
    spotifyTokenExpiry = Date.now() + (expiresIn * 1000) - 60000; /* 1 min buffer */
    localStorage.setItem('spotify_token_expiry', String(spotifyTokenExpiry));

    console.log('Token saved. Expires in', expiresIn, 'seconds.');
    return spotifyToken;
  } else {
    console.error('Token exchange failed:', data);
    showToast('SPOTIFY LOGIN FAILED — TRY AGAIN');
    return null;
  }
}

/* ── TOKEN REFRESH ────────────────────────────────────*/
async function refreshAccessToken() {
  const refreshToken = spotifyRefreshToken || localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) {
    console.warn('[VISAGE] No refresh token available — user must re-login');
    return false;
  }

  console.log('[VISAGE] Refreshing access token...');

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CONFIG.clientId,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });

    const data = await response.json();

    if (data.access_token) {
      spotifyToken = data.access_token;
      localStorage.setItem('spotify_token', spotifyToken);

      /* Spotify may issue a new refresh token */
      if (data.refresh_token) {
        spotifyRefreshToken = data.refresh_token;
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }

      const expiresIn = data.expires_in || 3600;
      spotifyTokenExpiry = Date.now() + (expiresIn * 1000) - 60000;
      localStorage.setItem('spotify_token_expiry', String(spotifyTokenExpiry));

      console.log('[VISAGE] Token refreshed! Expires in', expiresIn, 'seconds.');
      return true;
    } else {
      console.error('[VISAGE] Token refresh failed:', data);
      return false;
    }
  } catch (err) {
    console.error('[VISAGE] Token refresh network error:', err);
    return false;
  }
}

/* Check if token needs refreshing and refresh if possible */
async function ensureValidToken() {
  if (!spotifyToken) return false;

  /* If we have an expiry time and it's passed, try to refresh */
  if (spotifyTokenExpiry && Date.now() > spotifyTokenExpiry) {
    console.log('[VISAGE] Token expired, attempting refresh...');
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      /* Clear everything and ask user to re-login */
      localStorage.removeItem('spotify_token');
      localStorage.removeItem('spotify_refresh_token');
      localStorage.removeItem('spotify_token_expiry');
      spotifyToken = null;
      return false;
    }
  }
  return true;
}

/* ── SDK INIT ──────────────────────────────────────────*/
function initSpotifySDK(token) {
  spotifyToken = token;

  /*
    If the SDK script is already loaded (e.g. after a page reload),
    we don't load it again — we just create a new player directly.
  */
  if (window.Spotify) {
    createSpotifyPlayer();
    return;
  }

  /*
    onSpotifyWebPlaybackSDKReady is called by the SDK script
    once it has fully loaded. define it BEFORE loading the script.
  */
  window.onSpotifyWebPlaybackSDKReady = () => {
    createSpotifyPlayer();
  };

  const script = document.createElement('script');
  script.src = 'https://sdk.scdn.co/spotify-player.js';
  script.async = true;
  document.body.appendChild(script);
}

/*
  createSpotifyPlayer()
  ──────────────────────
  Separated from initSpotifySDK so then can call it
  whether the SDK just loaded or was already present from the file
*/
function createSpotifyPlayer() {
  spotifyPlayer = new Spotify.Player({
    name: 'VISAGE',
    getOAuthToken: callback => callback(spotifyToken),
    volume: 0.8
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    sdkReady = true;
    console.log('Spotify ready. Device ID:', device_id);
    /* Save device ID so we can check it later */
    localStorage.setItem('spotify_device_id', device_id);
    onSpotifyReady();
    startProgressPoller();
  });

  spotifyPlayer.addListener('not_ready', ({ device_id }) => {
    console.log('Device went offline:', device_id);
    sdkReady = false;
    /* Update UI to show disconnected */
    const btn = document.getElementById('spotify-btn');
    if (btn) { btn.textContent = 'RECONNECT SPOTIFY'; btn.classList.remove('connected'); }
  });

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return;
    onSpotifyStateChanged(state);
  });

  spotifyPlayer.addListener('initialization_error', ({ message }) => {
    console.error('Init error:', message);
    showToast('SPOTIFY INIT ERROR — REFRESH PAGE');
  });

  spotifyPlayer.addListener('authentication_error', ({ message }) => {
    console.error('Auth error:', message);
    /* Token expired — clear it and ask to re-login */
    localStorage.removeItem('spotify_token');
    showToast('SESSION EXPIRED — CLICK CONNECT SPOTIFY AGAIN');
    const btn = document.getElementById('spotify-btn');
    if (btn) { btn.textContent = 'CONNECT SPOTIFY'; btn.classList.remove('connected'); }
  });

  spotifyPlayer.addListener('account_error', () => {
    showToast('SPOTIFY PREMIUM REQUIRED');
  });

  spotifyPlayer.connect().then(success => {
    if (success) {
      console.log('Spotify player connected successfully');
    } else {
      console.error('Spotify player failed to connect');
      showToast('SPOTIFY FAILED TO CONNECT — REFRESH AND TRY AGAIN');
    }
  });
}

/* ── PLAYBACK CONTROL ──────────────────────────────────*/

async function spotifyPlay(trackUri) {
  /*
    Wait up to 5 seconds for the SDK to be ready
    before giving up. This fixes the "connect first" issue
    that happens when play is clicked too soon after login.
  */
  if (!sdkReady) {
    console.log('SDK not ready, waiting...');
    const ready = await waitForSDK(5000);
    if (!ready) {
      showToast('SPOTIFY NOT READY — WAIT A MOMENT AND TRY AGAIN');
      return;
    }
  }

  await ensureValidToken();
  console.log('Playing:', trackUri, 'on device:', deviceId);

  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + spotifyToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [trackUri] }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('Play failed:', response.status, err);
    if (response.status === 401) {
      localStorage.removeItem('spotify_token');
      showToast('SESSION EXPIRED — CLICK CONNECT SPOTIFY AGAIN');
    } else if (response.status === 404) {
      showToast('DEVICE NOT FOUND — REFRESH PAGE AND RECONNECT');
    } else {
      showToast('PLAYBACK ERROR — CHECK CONSOLE');
    }
  }
}

/*
  spotifyPlayContext(contextUri, shuffle)
  ────────────────────────────────────────
  Plays an entire playlist/album as a Spotify context.
  This is the workaround for dev-mode restrictions that block
  fetching individual track listings. Instead of queuing tracks
  one by one, we tell Spotify "play this whole playlist".

  The SDK's player_state_changed event will give us track info
  (title, artist, album art, duration) as each song plays.
*/
async function spotifyPlayContext(contextUri, shuffle = true) {
  if (!sdkReady) {
    console.log('SDK not ready, waiting...');
    const ready = await waitForSDK(5000);
    if (!ready) {
      showToast('SPOTIFY NOT READY — WAIT A MOMENT AND TRY AGAIN');
      return;
    }
  }

  await ensureValidToken();
  console.log('[VISAGE] Playing context:', contextUri, 'shuffle:', shuffle);

  /* Set shuffle state first */
  try {
    await fetch(
      `https://api.spotify.com/v1/me/player/shuffle?state=${shuffle}&device_id=${deviceId}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + spotifyToken },
    });
  } catch (e) {
    console.warn('[VISAGE] Could not set shuffle:', e.message);
  }

  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + spotifyToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context_uri: contextUri }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[VISAGE] Context play failed:', response.status, err);
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return spotifyPlayContext(contextUri, shuffle);
      showToast('SESSION EXPIRED — CLICK LINK SPOTIFY AGAIN');
    } else if (response.status === 404) {
      showToast('DEVICE NOT FOUND — REFRESH PAGE AND RECONNECT');
    } else {
      showToast('PLAYBACK ERROR — CHECK CONSOLE');
    }
  }
}

/*
  getSpotifyCurrentTrack()
  ─────────────────────────
  Gets the currently playing track from the Spotify Player SDK.
  Returns a normalized track object or null.
*/
async function getSpotifyCurrentTrack() {
  if (!spotifyPlayer || !sdkReady) return null;
  const state = await spotifyPlayer.getCurrentState();
  if (!state) return null;

  const t = state.track_window.current_track;
  if (!t) return null;

  return {
    id: t.id,
    title: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    uri: t.uri,
    duration: Math.floor(state.duration / 1000),
    albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    albumName: t.album?.name || '',
  };
}

/*
  waitForSDK(timeoutMs)
  ──────────────────────
  Waits for sdkReady to become true, checking every 200ms.
  Returns true if it becomes ready within the timeout, false if not.
  This is called a "polling promise" — a common pattern in JS.
*/
function waitForSDK(timeoutMs) {
  return new Promise(resolve => {
    if (sdkReady) { resolve(true); return; }

    const interval = setInterval(() => {
      if (sdkReady) {
        clearInterval(interval);
        resolve(true);
      }
    }, 200);

    /* Give up after timeoutMs milliseconds */
    setTimeout(() => {
      clearInterval(interval);
      resolve(false);
    }, timeoutMs);
  });
}

async function spotifySeek(positionMs) {
  if (!sdkReady) return;
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + spotifyToken },
  });
  if (!response.ok) console.error('Seek failed:', response.status);
}

async function spotifyPause() { if (spotifyPlayer) await spotifyPlayer.pause(); }
async function spotifyResume() { if (spotifyPlayer) await spotifyPlayer.resume(); }
async function spotifySetVolume(v) { if (spotifyPlayer) await spotifyPlayer.setVolume(v); }

/* ── LOGOUT ────────────────────────────────────────────*/
/**
 * logoutSpotify()
 * ────────────────
 * Disconnects the Spotify player, wipes all stored auth tokens,
 * and resets the UI back to pre-login state.
 */
function logoutSpotify() {
  /* Stop playback & disconnect the SDK player */
  if (spotifyPlayer) {
    spotifyPlayer.pause().catch(() => {});
    spotifyPlayer.disconnect();
    spotifyPlayer = null;
  }

  /* Stop progress polling */
  stopProgressPoller();

  /* Clear all auth data from localStorage */
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expiry');
  localStorage.removeItem('spotify_verifier');
  localStorage.removeItem('spotify_device_id');

  /* Reset in-memory state */
  spotifyToken       = null;
  spotifyRefreshToken = null;
  spotifyTokenExpiry  = 0;
  deviceId           = null;
  sdkReady           = false;

  /* Reset player state (defined in player.js) */
  spotifyConnected   = false;
  isPlaying          = false;
  currentTrack       = null;
  activeMoodPlaylist = null;
  moodPlaylistMap    = {};

  /* Update UI */
  updateSpotifyUI();
  renderIdleState();
  document.getElementById('play-btn').textContent = '▶';

  showToast('SPOTIFY DISCONNECTED');
  console.log('[VISAGE] Logged out — all tokens cleared.');
}

/* ── WEB API HELPERS (PLAYLIST INGEST) ─────────────────*/

async function spotifyApiGet(path, _isRetry = false) {
  if (!spotifyToken) throw new Error('No Spotify token — please connect Spotify first');

  /* Auto-refresh expired token before making the request */
  await ensureValidToken();
  if (!spotifyToken) throw new Error('Spotify session expired — click LINK SPOTIFY to reconnect');

  console.log('[VISAGE] API GET:', path);

  try {
    const res = await fetch(`https://api.spotify.com${path}`, {
      headers: {
        'Authorization': 'Bearer ' + spotifyToken,
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `Spotify API GET failed`;
      console.error(`[VISAGE] API ${res.status} on ${path}:`, msg);

      /* If 401, try to refresh token and retry once */
      if (res.status === 401 && !_isRetry) {
        console.log('[VISAGE] Got 401, attempting token refresh...');
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return spotifyApiGet(path, true); /* retry with fresh token */
        }
      }

      throw new Error(`${msg} (${res.status})`);
    }
    return res.json();

  } catch (fetchErr) {
    /*
      "Failed to fetch" = browser-level error (no response at all).
      This happens when:
      - Token expired and Spotify's 401 response lacks CORS headers
      - Network issue
      We try refreshing the token and retrying once.
    */
    if (fetchErr.message === 'Failed to fetch' && !_isRetry) {
      console.warn('[VISAGE] "Failed to fetch" — likely expired token. Trying refresh...');
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return spotifyApiGet(path, true); /* retry with fresh token */
      }
      throw new Error(
        'Failed to fetch — your Spotify session has expired. ' +
        'Click LINK SPOTIFY to reconnect.'
      );
    }
    throw fetchErr;
  }
}

function parseSpotifyPlaylistId(input) {
  if (!input) return null;
  const raw = input.trim();

  /* Accept: spotify URI */
  const uriMatch = raw.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];

  /* Accept: URL — handles locale prefixes like /intl-ph/, /intl-us/, etc. */
  const urlMatch = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  /* Fall back: looks like a raw playlist ID */
  if (/^[a-zA-Z0-9]{16,}$/.test(raw)) return raw;

  return null;
}

async function spotifyFetchMyPlaylists(limit = 30) {
  const data = await spotifyApiGet(`/v1/me/playlists?limit=${limit}`);
  return (data.items || []).map(pl => ({
    id: pl.id,
    name: pl.name,
    image: pl.images?.[0]?.url || null,
    totalTracks: pl.tracks?.total || 0,
    owner: pl.owner?.display_name || 'Unknown',
  }));
}

async function spotifyFetchPlaylistTracks(playlistId, maxTracks = 250) {
  /*
    Strategy (March 2026):
    Spotify deprecated /playlists/{id}/tracks and restricted the full
    playlist object in dev mode. The new endpoint is:
      GET /v1/playlists/{playlist_id}/items

    We try multiple strategies in order:
    1. /v1/playlists/{id}/items  (new official endpoint)
    2. /v1/playlists/{id}        (full object with embedded tracks)
    3. /v1/playlists/{id}/tracks (legacy, likely 403)
  */
  const encodedId = encodeURIComponent(playlistId);
  const items = [];

  /* ── Strategy 1: /items endpoint (preferred) ── */
  try {
    console.log('[VISAGE] Trying /items endpoint...');
    let path = `/v1/playlists/${encodedId}/items?limit=100&offset=0`;

    while (path && items.length < maxTracks) {
      const page = await spotifyApiGet(path);
      const pageItems = page.items || [];
      items.push(...pageItems);
      console.log('[VISAGE] /items page returned', pageItems.length, 'items, total so far:', items.length);

      if (pageItems.length === 0) break;
      /* next is a full URL — strip the domain */
      path = page.next ? page.next.replace('https://api.spotify.com', '') : null;
    }
  } catch (err1) {
    console.warn('[VISAGE] /items endpoint failed:', err1.message);

    /* ── Strategy 2: full playlist object ── */
    try {
      console.log('[VISAGE] Trying full playlist object...');
      const data = await spotifyApiGet(`/v1/playlists/${encodedId}`);

      /* Debug */
      console.log('[VISAGE] Playlist response keys:', Object.keys(data));
      const tracksObj = data.tracks || data.items || {};
      console.log('[VISAGE] tracks/items keys:', Object.keys(tracksObj));

      const firstPage = tracksObj.items || [];
      items.push(...firstPage);
      console.log('[VISAGE] Embedded tracks:', firstPage.length);

      /* Try pagination */
      let nextUrl = tracksObj.next || null;
      while (nextUrl && items.length < maxTracks) {
        try {
          const pagePath = nextUrl.replace('https://api.spotify.com', '');
          const page = await spotifyApiGet(pagePath);
          const pageItems = page.items || [];
          items.push(...pageItems);
          nextUrl = page.next || null;
          if (pageItems.length === 0) break;
        } catch (pagErr) {
          console.warn('[VISAGE] Pagination failed:', pagErr.message);
          break;
        }
      }
    } catch (err2) {
      console.warn('[VISAGE] Full playlist object failed:', err2.message);

      /* ── Strategy 3: legacy /tracks endpoint (last resort) ── */
      try {
        console.log('[VISAGE] Trying legacy /tracks endpoint...');
        let path = `/v1/playlists/${encodedId}/tracks?limit=100&offset=0`;
        while (path && items.length < maxTracks) {
          const page = await spotifyApiGet(path);
          const pageItems = page.items || [];
          items.push(...pageItems);
          path = page.next ? page.next.replace('https://api.spotify.com', '') : null;
          if (pageItems.length === 0) break;
        }
      } catch (err3) {
        console.error('[VISAGE] All playlist fetch strategies failed.');
        console.error('  /items:', err1.message);
        console.error('  /playlist:', err2.message);
        console.error('  /tracks:', err3.message);
        throw new Error(
          `Could not fetch playlist tracks. ` +
          `The Spotify API rejected all attempts (${err1.message}). ` +
          `Make sure your account is added to the app's "Users and Access" ` +
          `in the Spotify Developer Dashboard, and that you have Premium.`
        );
      }
    }
  }

  if (items.length === 0) {
    throw new Error('Playlist returned 0 items. It may be empty, private, or restricted.');
  }

  /* Debug: log the structure of the first 3 items so we can see what Spotify returns */
  if (items.length > 0) {
    console.log('[VISAGE] First item structure:', JSON.stringify(items[0], null, 2).substring(0, 800));
    if (items.length > 1) {
      console.log('[VISAGE] Second item keys:', Object.keys(items[1]));
      if (items[1]?.track) console.log('[VISAGE] Second item.track keys:', Object.keys(items[1].track));
    }
  }

  /*
    Extract track objects from items.
    The API may return items in different shapes:
    A) { track: { id, name, uri, ... } }           — standard playlist items format
    B) { id, name, uri, ... }                       — track object directly
    C) { track: { id, name, ... } } but missing uri — need to generate uri from id
  */
  const extracted = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) continue;

    /* Try to get the track object — could be nested or at top level */
    let t = it.track || null;

    /* If it.track is null/undefined but the item itself looks like a track, use it */
    if (!t && it.id && it.name) {
      t = it;
    }

    if (!t) {
      if (i < 3) console.log(`[VISAGE] Item ${i}: skipped — no track data. Keys:`, Object.keys(it));
      continue;
    }

    /* Skip local files */
    if (t.is_local) {
      if (i < 3) console.log(`[VISAGE] Item ${i}: skipped — local file "${t.name}"`);
      continue;
    }

    /* Must have at least an id or uri */
    if (!t.id && !t.uri) {
      if (i < 3) console.log(`[VISAGE] Item ${i}: skipped — no id or uri. Keys:`, Object.keys(t));
      continue;
    }

    /* Generate missing fields */
    if (!t.uri && t.id) {
      t.uri = `spotify:track:${t.id}`;
    }
    if (!t.id && t.uri) {
      const m = t.uri.match(/spotify:track:(\w+)/);
      if (m) t.id = m[1];
    }

    /* duration_ms might be missing — default to 180s (3 min) so the track isn't rejected */
    if (!t.duration_ms) {
      t.duration_ms = 180000;
      if (i < 3) console.log(`[VISAGE] Item ${i}: "${t.name}" — missing duration_ms, defaulting to 180s`);
    }

    /* Ensure artists array exists */
    if (!t.artists || !Array.isArray(t.artists)) {
      t.artists = [{ name: t.artist || 'Unknown Artist' }];
    }

    /* Ensure album object exists */
    if (!t.album) {
      t.album = { name: '', images: [] };
    }

    extracted.push(t);
  }

  console.log('[VISAGE] Raw items:', items.length, '→ Playable tracks:', extracted.length);
  return extracted;
}

async function spotifyFetchAudioFeatures(trackIds) {
  const ids = (trackIds || []).filter(Boolean);
  if (ids.length === 0) return [];

  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const data = await spotifyApiGet(`/v1/audio-features?ids=${batch.join(',')}`);
    out.push(...(data.audio_features || []));
  }
  return out;
}

async function spotifyFetchPlaylistMeta(playlistId) {
  /*
    Fetch playlist metadata. The ?fields= parameter may be restricted
    in dev mode, so we try without it first, then with fields as fallback.
  */
  const encodedId = encodeURIComponent(playlistId);
  let data;
  try {
    data = await spotifyApiGet(`/v1/playlists/${encodedId}`);
  } catch (err) {
    console.warn('[VISAGE] Full playlist meta fetch failed, trying with fields:', err.message);
    data = await spotifyApiGet(
      `/v1/playlists/${encodedId}?fields=name,images,tracks.total,owner.display_name`
    );
  }
  return {
    name: data.name || 'Unknown Playlist',
    image: data.images?.[0]?.url || null,
    totalTracks: data.tracks?.total ?? 0,
    owner: data.owner?.display_name || 'Unknown',
  };
}

/* ── STATE SYNC ────────────────────────────────────────*/
/*
  onSpotifyStateChanged is defined in player.js (v3).
  It handles both timeline sync AND track info updates
  from the SDK's player_state_changed event.
*/

function startProgressPoller() {
  clearInterval(progressPoller);
  progressPoller = setInterval(async () => {
    if (!spotifyPlayer || !sdkReady) return;
    const state = await spotifyPlayer.getCurrentState();
    if (!state || state.paused) return;
    const positionSec = state.position / 1000;
    const durationSec = state.duration / 1000;
    syncTimelineUI(positionSec, durationSec);
    checkAutoSkip(positionSec);
  }, 1000);
}

function stopProgressPoller() {
  clearInterval(progressPoller);
}

/* ── AUTO INIT ON PAGE LOAD ────────────────────────────*/
(async function checkAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    /* Returning from Spotify login */
    window.history.replaceState({}, document.title, window.location.pathname);
    const token = await exchangeCodeForToken(code);
    if (token) initSpotifySDK(token);
    return;
  }

  /*
    Check localStorage for a saved token.
    Restore refresh token and expiry too.
  */
  const saved = localStorage.getItem('spotify_token');
  const savedRefresh = localStorage.getItem('spotify_refresh_token');
  const savedExpiry = localStorage.getItem('spotify_token_expiry');

  if (savedRefresh) spotifyRefreshToken = savedRefresh;
  if (savedExpiry) spotifyTokenExpiry = parseInt(savedExpiry, 10);

  if (saved) {
    spotifyToken = saved;

    /* If token is expired but we have a refresh token, refresh it first */
    if (spotifyTokenExpiry && Date.now() > spotifyTokenExpiry && savedRefresh) {
      console.log('[VISAGE] Saved token expired, refreshing before init...');
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        console.log('[VISAGE] Token refreshed, initializing SDK...');
        initSpotifySDK(spotifyToken);
      } else {
        console.warn('[VISAGE] Refresh failed — user needs to re-login');
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expiry');
        spotifyToken = null;
      }
    } else {
      console.log('Found saved token, reconnecting...');
      initSpotifySDK(saved);
    }
  }
})();

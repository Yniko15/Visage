/*
  player.js — The Orchestrator (v3 — Context-Based Playback)
  ──────────────────────────────────────────────────────────
  Updated for Spotify's March 2026 dev-mode restrictions.
  
  Instead of fetching individual tracks (which is now blocked),
  the player uses context-based playback:
  - Each mood maps to a Spotify playlist URI
  - Playing a mood = telling Spotify "play this whole playlist"
  - Track info comes from the SDK player_state_changed events

  The mood system detects emotions and switches to the
  matching playlist automatically.
*/

/* ── STATE ─────────────────────────────────────────────*/
let isPlaying        = false;
let currentMood      = null;
let cameraOn         = false;
let mpCamera         = null;
let demoInterval     = null;
let spotifyConnected = false;

/*
  moodPlaylistMap
  ────────────────
  Maps mood → { uri: 'spotify:playlist:...', meta: { name, image, ... } }
  Filled by loadMoodPlaylists() from onboarding.js.
*/
let moodPlaylistMap = {};

/*
  currentTrack
  ─────────────
  Info about the currently playing track, populated from SDK state events.
*/
let currentTrack = null;
let activeMoodPlaylist = null; // which mood's playlist is currently playing


/* ── INIT ──────────────────────────────────────────────*/
window.addEventListener('load', () => {
  buildEmotionBars();
  renderIdleState();
  updateSpotifyUI();
});

function renderIdleState() {
  const albumEl = document.getElementById('album');
  albumEl.style.backgroundImage = 'none';
  document.getElementById('album-emoji').style.display = 'block';
  document.getElementById('album-emoji').textContent   = '[ > ]';
  document.getElementById('song-title').textContent    = 'NO TRACK LOADED';
  document.getElementById('song-artist').textContent   = '—';
  document.getElementById('t-total').textContent       = '0:00';
  document.getElementById('t-current').textContent     = '0:00';
  document.getElementById('t-fill').style.width        = '0%';
}

/* ── SPOTIFY CALLBACKS ─────────────────────────────────*/

function onSpotifyReady() {
  spotifyConnected = true;
  updateSpotifyUI();
  showToast('SPOTIFY CONNECTED');
  startProgressPoller();
  /* Show onboarding now that Spotify is ready */
  showOnboarding();
}

function onSpotifySongEnded() {
  /* With context playback, Spotify handles next-track automatically */
}

function syncTimelineUI(positionSec, durationSec) {
  if (!durationSec || durationSec <= 0) return;
  const pct = (positionSec / durationSec) * 100;
  document.getElementById('t-fill').style.width    = Math.min(pct, 100) + '%';
  document.getElementById('t-current').textContent = formatTime(positionSec);
}

function onSpotifyStateChanged(state) {
  if (!state) return;

  const positionSec = state.position / 1000;
  const durationSec = state.duration / 1000;
  syncTimelineUI(positionSec, durationSec);

  /* Update track info from SDK state */
  const t = state.track_window?.current_track;
  if (t) {
    const newId = t.id || t.uri;
    const oldId = currentTrack?.id || currentTrack?.uri;

    if (newId !== oldId) {
      /* New track started — update the UI */
      currentTrack = {
        id:        t.id,
        title:     t.name,
        artist:    t.artists?.map(a => a.name).join(', ') || 'Unknown',
        uri:       t.uri,
        duration:  Math.floor(state.duration / 1000),
        albumArt:  t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
        albumName: t.album?.name || '',
      };
      renderCurrentTrack();
    }
  }

  /* Update play/pause button state */
  if (state.paused && isPlaying) {
    isPlaying = false;
    document.getElementById('play-btn').textContent = '▶';
  } else if (!state.paused && !isPlaying) {
    isPlaying = true;
    document.getElementById('play-btn').textContent = '⏸';
  }
}

function checkAutoSkip(positionSec) {
  /* With context playback, we don't auto-skip — Spotify handles the queue */
}

function updateSpotifyUI() {
  const btn = document.getElementById('spotify-btn');
  const logoutBtn = document.getElementById('logout-btn');
  if (!btn) return;
  if (spotifyConnected) {
    btn.textContent = '✓ SPOTIFY';
    btn.classList.add('connected');
    btn.onclick = null; /* Prevent re-login while connected */
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else {
    btn.textContent = 'LINK SPOTIFY';
    btn.classList.remove('connected');
    btn.onclick = loginWithSpotify;
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}


/* ── MOOD PLAYLISTS ────────────────────────────────────

  loadMoodPlaylists(map)
  ───────────────────────
  Called by onboarding.js once the user assigns playlists to moods.
  Stores the mood → playlist mappings.
*/
function loadMoodPlaylists(map) {
  moodPlaylistMap = map;
  showToast(`VISAGE READY — ${Object.keys(map).length} MOODS MAPPED`);

  /* Play the first mood's playlist to get things started */
  const firstMood = Object.keys(map)[0];
  if (firstMood) {
    playMoodPlaylist(firstMood);
  }
}


/* ── TRACK RENDERING ──────────────────────────────────*/

function renderCurrentTrack() {
  if (!currentTrack) return;

  const albumEl = document.getElementById('album');
  if (currentTrack.albumArt) {
    albumEl.style.backgroundImage    = `url(${currentTrack.albumArt})`;
    albumEl.style.backgroundSize     = 'cover';
    albumEl.style.backgroundPosition = 'center';
    document.getElementById('album-emoji').style.display = 'none';
  } else {
    albumEl.style.backgroundImage = 'none';
    albumEl.style.background      = '#ddd';
    document.getElementById('album-emoji').style.display = 'block';
    document.getElementById('album-emoji').textContent   = '[♫]';
  }

  document.getElementById('song-title').textContent  = currentTrack.title.toUpperCase();
  document.getElementById('song-artist').textContent = currentTrack.artist;
  document.getElementById('t-total').textContent     = formatTime(currentTrack.duration);
  document.getElementById('t-current').textContent   = '0:00';
  document.getElementById('t-fill').style.width      = '0%';

  /* Hide peak marker — we don't have peak data in context mode */
  const pm = document.getElementById('peak-marker');
  pm.style.left  = '0%';
  pm.style.width = '0%';
}


/* ── PLAYBACK ──────────────────────────────────────────*/

async function playMoodPlaylist(mood) {
  const entry = moodPlaylistMap[mood];
  if (!entry || !entry.uri) {
    showToast('NO PLAYLIST FOR THIS MOOD');
    return;
  }

  if (activeMoodPlaylist === mood && isPlaying) {
    /* Already playing this mood's playlist */
    return;
  }

  activeMoodPlaylist = mood;
  console.log('[VISAGE] Playing mood playlist:', mood, entry.uri);
  await spotifyPlayContext(entry.uri, true);
  isPlaying = true;
  document.getElementById('play-btn').textContent = '⏸';

  /* Show mood wash */
  const m = MOOD_META[mood];
  if (m) {
    const wash = document.getElementById('mood-wash');
    wash.style.background = `radial-gradient(ellipse at 30% 50%, ${m.wash}, transparent 70%)`;
    wash.style.opacity    = '1';
  }
}

async function togglePlay() {
  if (!spotifyConnected) {
    showToast('CONNECT SPOTIFY FIRST');
    return;
  }
  if (isPlaying) {
    await spotifyPause();
    isPlaying = false;
    document.getElementById('play-btn').textContent = '▶';
  } else {
    /* If we have an active mood playlist, resume. Otherwise play first available */
    if (activeMoodPlaylist) {
      await spotifyResume();
    } else {
      const firstMood = Object.keys(moodPlaylistMap)[0];
      if (firstMood) {
        await playMoodPlaylist(firstMood);
      } else {
        showToast('SET UP PLAYLISTS FIRST');
        return;
      }
    }
    isPlaying = true;
    document.getElementById('play-btn').textContent = '⏸';
  }
}

async function nextSong() {
  if (!spotifyConnected || !spotifyPlayer) return;
  await spotifyPlayer.nextTrack();
}

async function prevSong() {
  if (!spotifyConnected || !spotifyPlayer) return;
  await spotifyPlayer.previousTrack();
}

async function seekClick(event) {
  if (!currentTrack) return;
  const rect   = event.currentTarget.getBoundingClientRect();
  const pct    = (event.clientX - rect.left) / rect.width;
  const seekMs = pct * currentTrack.duration * 1000;

  document.getElementById('t-fill').style.width    = (pct * 100) + '%';
  document.getElementById('t-current').textContent = formatTime(pct * currentTrack.duration);

  if (spotifyConnected) await spotifySeek(seekMs);
}


/* ── CAMERA ────────────────────────────────────────────*/
function toggleCamera() {
  cameraOn ? stopCamera() : startCamera();
}

async function startCamera() {
  const video = document.getElementById('video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 340, height: 280, facingMode: 'user' }
    });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);
    video.classList.add('on');
    document.getElementById('cam-placeholder').classList.add('hidden');
    document.getElementById('cam-btn').textContent = 'STOP CAMERA';
    document.getElementById('cam-btn').classList.add('active');
    cameraOn = true;

    const canvas  = document.getElementById('hand-canvas');
    canvas.width  = video.videoWidth  || 340;
    canvas.height = video.videoHeight || 280;

    const faceModel = initFaceMesh(video);
    const handModel = initHands(video);

    mpCamera = new Camera(video, {
      onFrame: async () => {
        if (!cameraOn) return;
        await handModel.send({ image: video });
        await faceModel.send({ image: video });
      },
      width: 340, height: 280
    });
    mpCamera.start();

  } catch (error) {
    document.getElementById('cam-placeholder').innerHTML = `
      <div class="cam-placeholder-icon">🎭</div>
      <div class="cam-placeholder-text">CAMERA UNAVAILABLE<br>Running demo mode</div>`;
    cameraOn = true;
    document.getElementById('cam-btn').textContent = 'STOP DEMO';
    document.getElementById('cam-btn').classList.add('active');
    startDemoMode();
  }
}

function stopCamera() {
  cameraOn = false;
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  const video = document.getElementById('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.classList.remove('on');
  clearInterval(demoInterval);
  updateEmotionUI({ happy: 0, sad: 0, angry: 0, neutral: 1, calm: 0 });

  const ph = document.getElementById('cam-placeholder');
  ph.classList.remove('hidden');
  ph.innerHTML = `
    <div class="cam-placeholder-icon" style="font-family:'Space Mono',monospace;font-size:24px">[CAM]</div>
    <div class="cam-placeholder-text">CAMERA OFF<br>Press start to activate</div>`;

  document.getElementById('cam-btn').textContent = 'START CAMERA';
  document.getElementById('cam-btn').classList.remove('active');
  document.getElementById('mood-emoji').textContent    = '[—]';
  document.getElementById('mood-detected').textContent = 'WAITING';
  document.getElementById('mood-sub').textContent      = 'Activate camera to detect';
}


/* ── DEMO MODE ─────────────────────────────────────────*/
function startDemoMode() {
  const sequence = ['neutral','happy','calm','sad','angry','neutral'];
  let step = 0;
  demoInterval = setInterval(() => {
    const mood   = sequence[step % sequence.length];
    const scores = { happy:0.02, sad:0.02, angry:0.02, neutral:0.02, calm:0.02 };
    scores[mood] = 0.85;
    const total  = Object.values(scores).reduce((a,b) => a+b, 0);
    Object.keys(scores).forEach(k => scores[k] /= total);
    updateEmotionUI(scores);
    onMoodChanged(mood);
    step++;
  }, 3500);
}


/* ── MOOD HANDLING ─────────────────────────────────────*/
function onMoodChanged(newMood) {
  if (newMood === currentMood) return;
  currentMood = newMood;

  const m = MOOD_META[newMood];
  if (!m) return;

  document.getElementById('mood-emoji').textContent    = m.emoji;
  document.getElementById('mood-detected').textContent = m.label;
  document.getElementById('mood-sub').textContent      = m.sub;

  /* If we have a playlist mapped to this mood, switch to it */
  if (moodPlaylistMap[newMood]) {
    document.getElementById('queued-badge').textContent = `MOOD: ${m.label.toUpperCase()}`;
    document.getElementById('queued-badge').classList.add('show');
    document.getElementById('queued-hint').classList.add('show');
    showToast(`${m.emoji} MOOD SHIFT — SWITCHING PLAYLIST`);

    /* Small delay so the user sees the mood change before the playlist switches */
    setTimeout(() => {
      playMoodPlaylist(newMood);
      document.getElementById('queued-badge').classList.remove('show');
      document.getElementById('queued-hint').classList.remove('show');
    }, 1500);
  } else {
    /* No playlist for this mood — just update the UI */
    const wash = document.getElementById('mood-wash');
    wash.style.background = `radial-gradient(ellipse at 30% 50%, ${m.wash}, transparent 70%)`;
    wash.style.opacity    = '1';
  }
}


/* gesture handler works as obtaining the gesture from the user */
function triggerGesture(type) {
  const flash = document.getElementById('gesture-flash');

  if (type === 'swipe-right') {
    flash.textContent = '→';
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 250);
    nextSong();
    showToast('SWIPE RIGHT — NEXT SONG');
  } else if (type === 'swipe-left') {
    flash.textContent = '←';
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 250);
    prevSong();
    showToast('SWIPE LEFT — PREVIOUS SONG');
  } else if (type === 'palm') {
    flash.textContent = '✋';
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 300);
    togglePlay();
    showToast('OPEN PALM — ' + (isPlaying ? 'PAUSING' : 'PLAYING'));
  }
}


/* ── UTILITIES ─────────────────────────────────────────*/
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let toastTimer;
function showToast(message) {
  const el = document.getElementById('gesture-toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
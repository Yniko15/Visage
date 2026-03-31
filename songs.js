/*
  songs.js — The Song Database
  ─────────────────────────────
  DATA only. No logic. No visuals.

  DEFAULT_SONGS is the fallback playlist used when:
  - The user hasn't gone through onboarding yet
  - Spotify search fails entirely
  - The app loads for the first time

  Once onboarding completes, dynamicPlaylist in player.js
  takes over and these songs are no longer used.
*/


/* ── UTILITIES ──────────────────────────────────────────*/

function shuffleArray(array) {
  let arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getUserPreferredSongs() {
  const saved = localStorage.getItem('preferredSongs');
  if (saved) {
    try {
      const songs = JSON.parse(saved);
      if (Array.isArray(songs) && songs.every(s => s && s.spotifyUri)) return songs;
    } catch (e) { }
  }
  return [];
}

function getRandomizedSongs() {
  const preferred = getUserPreferredSongs();
  /* Return preferred songs if saved, otherwise empty array.
     The app uses dynamicPlaylist from onboarding once Spotify connects,
     so this fallback just needs to not crash. */
  return preferred.length > 0 ? shuffleArray(preferred) : [];
}

function getMoodSongs(songs) {
  const moods = {};
  songs.forEach((song, idx) => {
    if (!moods[song.mood]) moods[song.mood] = [];
    moods[song.mood].push(idx);
  });
  return moods;
}

const SONGS = getRandomizedSongs();
const MOOD_SONGS = getMoodSongs(SONGS);

/* ── MOOD & EMOTION METADATA ────────────────────────────*/

const MOOD_META = {
  happy: { emoji: ".*.", label: "HAPPY", sub: "Upbeat queue loaded", wash: "rgba(232,168,56,0.10)" },
  sad: { emoji: "~.~", label: "SAD", sub: "Emotional tracks queued", wash: "rgba(107,140,174,0.12)" },
  angry: { emoji: "/!\\", label: "ANGRY", sub: "High-energy tracks ready", wash: "rgba(196,69,58,0.10)" },
  neutral: { emoji: "-.-", label: "NEUTRAL", sub: "Mixed mood queue", wash: "rgba(122,140,110,0.08)" },
  calm: { emoji: "~~~", label: "CALM", sub: "Relaxing picks queued", wash: "rgba(155,142,176,0.10)" },
};

const EMOTIONS = [
  { key: "happy", label: "Happy", color: "#e8a838" },
  { key: "sad", label: "Sad", color: "#6b8cae" },
  { key: "angry", label: "Angry", color: "#c4453a" },
  { key: "neutral", label: "Neutral", color: "#7a8c6e" },
  { key: "calm", label: "Calm", color: "#9b8eb0" },
];
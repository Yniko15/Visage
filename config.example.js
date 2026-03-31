/*
  config.example.js — Template for config.js
  ─────────────────────────────────────────────
  Copy this file to config.js and fill in your values.

    cp config.example.js config.js

  config.js is gitignored so your secrets stay local.
  On Netlify, build.js generates config.js automatically
  from environment variables.
*/

/* ── APP SECRETS ─────────────────────────────────────*/
const APP_CONFIG = {
  /**
   * Your Spotify Client ID from the Developer Dashboard.
   * https://developer.spotify.com/dashboard
   *
   * Paste your real client ID below ↓
   */
  spotifyClientId: 'YOUR_SPOTIFY_CLIENT_ID_HERE',
};


/* ── SPOTIFY AUTH ─────────────────────────────────────*/
const SPOTIFY_CONFIG = {
  clientId: APP_CONFIG.spotifyClientId,
  redirectUri: window.location.origin,
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-modify-playback-state',
    'user-read-playback-state',
  ].join(' '),
};


/* ── TOKEN / SESSION SETTINGS ─────────────────────────*/
const AUTH_CONFIG = {
  storageKeys: {
    token:        'spotify_token',
    refreshToken: 'spotify_refresh_token',
    tokenExpiry:  'spotify_token_expiry',
    verifier:     'spotify_verifier',
    deviceId:     'spotify_device_id',
  },
  expiryBufferMs: 60_000,
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
  authorizeEndpoint: 'https://accounts.spotify.com/authorize',
  apiBase: 'https://api.spotify.com',
};


/* ── SECURITY SETTINGS ────────────────────────────────*/
const SECURITY_CONFIG = {
  pkceMethod: 'S256',
  verifierLength: 64,
  allowedOrigins: [
    'https://accounts.spotify.com',
    'https://api.spotify.com',
    'https://sdk.scdn.co',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://i.scdn.co',
  ],
  maxTokenRetries: 1,
  clearOnLogout: true,
};


/* ── PLAYBACK SETTINGS ────────────────────────────────*/
const PLAYBACK_CONFIG = {
  defaultVolume: 0.8,
  progressPollInterval: 1000,
  sdkReadyTimeout: 5000,
};

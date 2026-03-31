# VISAGE

A browser-based music player that reads your facial expressions and hand gestures in real time, then switches your Spotify playlist to match your detected mood.

Built as a personal portfolio project. No frameworks, no build tools — plain HTML, CSS, and JavaScript.

---

<img width="1270" height="871" alt="image" src="https://github.com/user-attachments/assets/ced9f2fe-c97a-4f20-81ae-53e581c082ba" />


## What it does

- Uses your webcam to detect facial landmarks via MediaPipe FaceMesh
- Estimates your current emotion (happy, sad, angry, calm, neutral) from those landmarks
- Switches to a Spotify playlist you've pre-assigned to that mood
- Lets you control playback with hand gestures — swipe left/right to skip, open palm to pause
- Draws a live hand skeleton overlay on the camera feed

---

<img width="1278" height="877" alt="image" src="https://github.com/user-attachments/assets/47cc6633-122f-4be9-9ddb-539d990a9ce7" />


<img width="1277" height="881" alt="image" src="https://github.com/user-attachments/assets/934dd17c-aa0a-4367-9f4e-cb929ca84373" />

<img width="1276" height="875" alt="image" src="https://github.com/user-attachments/assets/4aad40d9-152c-4402-b572-532b77e07694" />

<img width="805" height="553" alt="image" src="https://github.com/user-attachments/assets/7495d5bd-5a73-4d3d-addf-9e53eb64e8af" />


## Why cloning this won't work out of the box

This project connects to external services that require your own credentials. If you clone it and open `index.html`, nothing will play. Here's what's missing and why:

### 1. Spotify credentials (required)

The app uses the Spotify Web API and Web Playback SDK to stream music. To use it, you need:

- A **Spotify Premium account** — the Web Playback SDK does not work on free accounts
- A **Spotify Developer App** — created at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
- Your app's **Client ID** — a unique identifier for your registered app

The Client ID goes into a `config.js` file that is **intentionally excluded from this repository** (see `.gitignore`). On a live deploy, it is injected automatically by `build.js` from an environment variable.

Without a valid Client ID, every call to Spotify's API returns a 401 error and the player never initializes.

### 2. `config.js` is not in this repo

`config.js` is generated at build time by `build.js`. It is gitignored on purpose — it contains your Client ID and should never be committed. To run locally, copy `config.example.js` to `config.js` and paste your own Client ID:

```bash
cp config.example.js config.js
# Then open config.js and replace YOUR_SPOTIFY_CLIENT_ID_HERE
```

### 3. The 5-user limit

Spotify apps in development mode are restricted to **5 registered users**. Anyone not added to the app's allowlist in the Spotify Developer Dashboard will receive a 403 error and cannot log in. This is a Spotify platform restriction, not a bug in the code.

This means the live version of this app can only be used by people the owner has manually added. It cannot be opened publicly.

### 4. Camera permission

MediaPipe needs access to your webcam. The browser will ask for permission on first use. If you deny it, the app falls back to a demo mode that cycles through moods automatically — playback still works, but face and hand detection do not.

### 5. No server

This is a purely client-side app. There is no backend, no database, and no server to run. Everything runs in the browser. Tokens are stored in `sessionStorage` (cleared on tab close) with `localStorage` as a fallback.

---

## Running it locally

```bash
# 1. Clone the repo
git clone https://github.com/your-username/visage.git
cd visage

# 2. Create your config
cp config.example.js config.js
# Open config.js and paste your Spotify Client ID

# 3. Serve the files (a live server is required — file:// won't work
#    because the browser blocks camera access and module requests on file://)
npx serve .
# or: python3 -m http.server 8080

# 4. Go to http://localhost:8080 in your browser
# 5. Click CONNECT SPOTIFY and log in with your Spotify Premium account
```

> **Why you need a live server:** Browsers block webcam access and certain JavaScript APIs when opening files directly from disk (`file://`). A local server serves the files over `http://localhost`, which the browser treats as a trusted origin.

---

## Deploying to Netlify

The repo includes a `netlify.toml` that runs `build.js` before every deploy. `build.js` reads your Client ID from a Netlify environment variable and writes `config.js` automatically — so you never commit the real Client ID.

Steps:
1. Push this repo to GitHub
2. Connect the repo in Netlify
3. Go to **Site Settings → Environment Variables** and add `SPOTIFY_CLIENT_ID` with your real Client ID
4. In your Spotify Developer Dashboard, add your Netlify URL as a Redirect URI
5. Deploy

---

## Tech stack

| Layer | What's used |
|---|---|
| Face detection | MediaPipe FaceMesh (468 landmarks) |
| Hand detection | MediaPipe Hands |
| Music streaming | Spotify Web Playback SDK |
| Auth | Spotify PKCE (no client secret, browser-safe) |
| Hosting | Netlify (static, no backend) |
| Languages | HTML, CSS, vanilla JavaScript — no frameworks |

---

## Project structure

```
visage/
├── index.html          # App shell and structure
├── style.css           # All styling
├── player.js           # Main orchestrator — camera, mood, playback state
├── spotify.js          # Spotify auth (PKCE), API calls, SDK wrapper
├── face-engine.js      # Webcam → emotion scores via FaceMesh landmarks
├── hand-engine.js      # Webcam → gesture detection via MediaPipe Hands
├── onboarding.js       # Mood-to-playlist assignment flow
├── songs.js            # Mood metadata and emotion definitions
├── config.example.js   # Template — copy to config.js and fill in your Client ID
├── config.js           # GITIGNORED — generated by build.js or created manually
├── build.js            # Netlify pre-deploy script — writes config.js from env var
└── netlify.toml        # Netlify build config
```

---

## Known limitations

- **Spotify Premium only** — the Web Playback SDK is a Premium feature
- **Dev mode cap** — maximum 5 users without Spotify's extended quota approval (requires a registered organization with 250k+ MAU — not available to individual developers)
- **Emotion detection is heuristic** — it measures facial geometry, not true emotional state. Lighting, angle, and face shape all affect accuracy
- **No mobile support** — MediaPipe's camera utils and the Spotify SDK both have limited mobile browser support
- **Chromium-based browsers recommended** — Chrome and Edge have the best WebRTC and Web Audio API support for this stack

---

## Security notes

- Auth uses **PKCE** — no client secret is ever sent from the browser
- The Client ID is public by design (PKCE does not require secrecy for the client ID)
- Tokens are stored in `sessionStorage` (cleared on tab close) with `localStorage` as fallback
- A Content Security Policy in `index.html` restricts which domains can load resources
- There is no cross-user data — each person's session lives entirely in their own browser

---

*Built with MediaPipe, the Spotify Web API, and no frameworks.*

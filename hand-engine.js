/*
  hand-engine.js — Hand Gesture Detection (v3)
  ──────────────────────────────────────────────
  Fixes in this version:
  - Swipe now works even when fingers are extended (wave gesture)
  - Swipe and palm are fully separated — wave = nav, palm = pause
  - Swipe always navigates immediately, never confused with queue
  - Palm still requires hold + reset cycle to prevent rapid fire
*/

/* ── TUNING CONSTANTS ──────────────────────────────────*/

/* How far the wrist must travel to count as a swipe (18% of frame) */
const SWIPE_THRESHOLD = 0.18;

/* How many frames to measure swipe over */
const SWIPE_FRAMES = 6;

/* Minimum speed — filters out slow drifts */
const SWIPE_MIN_SPEED = 0.0006;

/* Frames palm must be held open before triggering pause */
const PALM_HOLD_FRAMES = 10;

/* Frames palm must be closed before allowing next palm trigger */
const PALM_RESET_FRAMES = 8;

/* Cooldowns */
const SWIPE_COOLDOWN_MS = 1000;
const PALM_COOLDOWN_MS = 2000;

/*
  PALM_OPEN_REQUIRED_FINGERS
  How many fingers must be extended to count as an open palm.
  We use 4 (all fingers) for palm, but for swipe detection
  we track the wrist regardless of finger state.
  This is the KEY fix — swipe no longer checks if fingers are open/closed.
*/
const PALM_FINGERS_REQUIRED = 4;


/* ── STATE ─────────────────────────────────────────────*/
let wristHistory = [];
let palmOpenCount = 0;
let palmClosedCount = 0;
let waitingForPalmReset = false;
let lastSwipeTime = 0;
let lastPalmTime = 0;
let handsModel = null;


/* ── INIT ──────────────────────────────────────────────*/
function initHands(video) {
  handsModel = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  handsModel.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.55
  });

  handsModel.onResults(onHandResults);
  return handsModel;
}


/* ── MAIN CALLBACK ─────────────────────────────────────*/
function onHandResults(results) {
  const canvas = document.getElementById('hand-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    resetHandState();
    return;
  }

  const lm = results.multiHandLandmarks[0];
  const now = Date.now();

  drawHandSkeleton(ctx, lm, canvas.width, canvas.height);

  /*
    Count how many fingers are currently extended.
    We use this for both palm detection and visual feedback.
  */
  const extendedCount = countExtendedFingers(lm);
  const palmOpen = extendedCount >= PALM_FINGERS_REQUIRED;

  /* ── PALM CHECK (all 4 fingers extended + held still) ── */
  if (palmOpen) {
    palmClosedCount = 0;

    if (!waitingForPalmReset && now - lastPalmTime > PALM_COOLDOWN_MS) {
      palmOpenCount++;
      drawPalmProgress(
        ctx, lm, canvas.width, canvas.height,
        palmOpenCount / PALM_HOLD_FRAMES
      );

      if (palmOpenCount >= PALM_HOLD_FRAMES) {
        lastPalmTime = now;
        waitingForPalmReset = true;
        palmOpenCount = 0;
        /*
          Clear swipe history when palm fires.
          Prevents a swipe from registering right after a palm.
        */
        wristHistory = [];
        triggerGesture('palm');
      }
    } else if (waitingForPalmReset) {
      drawPalmProgress(ctx, lm, canvas.width, canvas.height, 0, true);
    }

  } else {
    /* Palm closed or partially closed */
    palmOpenCount = 0;
    palmClosedCount++;

    if (waitingForPalmReset && palmClosedCount >= PALM_RESET_FRAMES) {
      waitingForPalmReset = false;
      palmClosedCount = 0;
    }
  }

  /* ── SWIPE CHECK ────────────────────────────────────────
    KEY CHANGE: Swipe is now checked REGARDLESS of finger state.
    A wave (fingers open) and a fist-swipe both work.
    We only skip swipe detection during the palm cooldown window
    to prevent a palm trigger from also registering as a swipe.
  */
  if (now - lastSwipeTime > SWIPE_COOLDOWN_MS && !waitingForPalmReset) {
    const wristX = lm[0].x;
    wristHistory.push({ x: wristX, t: now });
    if (wristHistory.length > SWIPE_FRAMES) wristHistory.shift();

    if (wristHistory.length === SWIPE_FRAMES) {
      const oldest = wristHistory[0];
      const newest = wristHistory[wristHistory.length - 1];
      const delta = newest.x - oldest.x;
      const timeMs = newest.t - oldest.t || 1;
      const speed = Math.abs(delta) / timeMs;

      if (Math.abs(delta) > SWIPE_THRESHOLD && speed > SWIPE_MIN_SPEED) {
        lastSwipeTime = now;
        wristHistory = [];
        palmOpenCount = 0; /* reset palm count after a swipe */

        /*
          Video is mirrored (CSS scaleX -1).
          delta > 0 = wrist moved right in raw = LEFT on screen = BACK
          delta < 0 = wrist moved left in raw  = RIGHT on screen = FORWARD
        */
        triggerGesture(delta > 0 ? 'swipe-left' : 'swipe-right');
      }
    }
  }
}


/* ── RESET ─────────────────────────────────────────────*/
function resetHandState() {
  wristHistory = [];
  palmOpenCount = 0;
  palmClosedCount = 0;
}


/* ── FINGER COUNTING ───────────────────────────────────

  countExtendedFingers(lm)
  ─────────────────────────
  Returns how many of the 4 main fingers are extended.
  Used for palm detection and visual finger count display.

  A finger is "extended" when its tip is clearly above
  its middle joint (pip) — with a margin of 0.02.
*/
function countExtendedFingers(lm) {
  const fingers = [
    [8, 6],   /* index */
    [12, 10],  /* middle */
    [16, 14],  /* ring */
    [20, 18],  /* pinky */
  ];
  return fingers.filter(([tip, pip]) => lm[tip].y < lm[pip].y - 0.02).length;
}

/* Kept for palm detection specifically */
function isPalmOpen(lm) {
  return countExtendedFingers(lm) >= PALM_FINGERS_REQUIRED;
}


/* ── VISUAL FEEDBACK ───────────────────────────────────*/

function drawPalmProgress(ctx, lm, w, h, progress, locked = false) {
  const wrist = lm[0];
  const cx = wrist.x * w;
  const cy = wrist.y * h - 34;
  const radius = 16;

  /* Background ring */
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = locked ? 'rgba(80,80,80,0.5)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.stroke();

  /* Fill arc */
  if (progress > 0 && !locked) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = '#90e0a0';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /* Center dot */
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = locked ? 'rgba(80,80,80,0.6)' : 'rgba(255,255,255,0.7)';
  ctx.fill();
}


/* ── SKELETON DRAWING ──────────────────────────────────*/
function drawHandSkeleton(ctx, lm, w, h) {
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  ctx.strokeStyle = 'rgba(240,240,240,0.35)';
  ctx.lineWidth = 1.5;
  connections.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  });

  lm.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  });
}
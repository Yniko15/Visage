/*
  face-engine.js — Emotion Detection
  ────────────────────────────────────
  This file's only job is to READ THE FACE.

  It uses MediaPipe FaceMesh, which gives us 468 "landmarks" —
  tiny numbered points scattered across the face.
  We measure distances and positions between specific points
  to estimate what emotion is being expressed.

  This file does NOT control music. It does NOT update most of the UI.
  It just produces emotion scores and calls onMoodChanged() in player.js.
*/


/*
  FACE_SMOOTH — how many frames to average over.

  Raw facial landmark data is "jittery" — it flickers frame to frame
  even if your face isn't moving. Averaging over 6 frames smooths this out.
  Higher number = smoother but slower to react.
  Lower number = faster but more jittery.
*/
const FACE_SMOOTH = 6;

/*
  faceBuffer — stores the last N raw emotion readings.
  We average these to get stable scores.
  "let" means this variable CAN be reassigned (unlike const).
*/
let faceBuffer = [];

/*
  faceMeshModel — will hold the MediaPipe FaceMesh object
  once it's initialized. Starts as null (nothing).
*/
let faceMeshModel = null;


/*
  buildEmotionBars()
  ──────────────────
  Creates the HTML for the 5 emotion bar rows in the UI.
  Called once when the page loads.

  We build HTML as a string and inject it using innerHTML.
  This is faster than creating elements one by one.
*/
function buildEmotionBars() {
  const wrap = document.getElementById('emotions');

  /*
    .map() — transforms each item in an array into something else.
    Here: each emotion object → an HTML string for one bar row.
    .join('') — joins the array of strings into one big string.
  */
  wrap.innerHTML = EMOTIONS.map(e => `
    <div class="e-row">
      <div class="e-name" id="en-${e.key}">${e.label}</div>
      <div class="e-bar-bg">
        <div class="e-bar-fill" id="eb-${e.key}" style="background:${e.color}"></div>
      </div>
      <div class="e-val" id="ev-${e.key}">0%</div>
    </div>
  `).join('');
}


/*
  updateEmotionUI(scores)
  ───────────────────────
  Updates the emotion bars in the UI to reflect new scores.
  "scores" is an object like: { happy: 0.7, sad: 0.1, angry: 0.05, neutral: 0.1, calm: 0.05 }

  Called every time new face data comes in (many times per second).
*/
function updateEmotionUI(scores) {
  /*
    Find the dominant (highest scoring) emotion.
    Object.entries() converts { happy: 0.7, sad: 0.1 } into [["happy", 0.7], ["sad", 0.1]]
    .sort() sorts by value descending — highest first.
    [0][0] gets the key (emotion name) of the first (highest) item.
  */
  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

  /* Update each emotion's bar width and percentage label */
  EMOTIONS.forEach(e => {
    const pct = Math.round((scores[e.key] || 0) * 100);

    /* getElementById finds the element with that specific id */
    document.getElementById(`eb-${e.key}`).style.width = pct + '%';
    document.getElementById(`ev-${e.key}`).textContent  = pct + '%';

    /*
      classList.toggle(className, condition)
      Adds the class if condition is true, removes it if false.
      This highlights the dominant emotion's name in white.
    */
    document.getElementById(`en-${e.key}`).classList.toggle('dominant', e.key === dominant);
  });
}


/*
  initFaceMesh(video)
  ───────────────────
  Creates and configures the MediaPipe FaceMesh model.
  "video" is the <video> HTML element from the camera.

  This is called by player.js when the camera starts.
*/
function initFaceMesh(video) {
  faceMeshModel = new FaceMesh({
    /*
      locateFile tells MediaPipe where to download its model files from.
      "f" is the filename MediaPipe asks for — we prefix it with the CDN URL.
    */
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
  });

  faceMeshModel.setOptions({
    maxNumFaces: 1,              /* only track one face at a time */
    refineLandmarks: false,      /* faster processing, less precise iris tracking */
    minDetectionConfidence: 0.5, /* how confident it needs to be before reporting a face */
    minTrackingConfidence: 0.5   /* how confident it needs to be to keep tracking */
  });

  /*
    .onResults() — registers a callback function.
    A "callback" is a function you give to something else to call later.
    Every time FaceMesh processes a frame, it calls onFaceResults().
  */
  faceMeshModel.onResults(onFaceResults);

  return faceMeshModel;
}


/*
  onFaceResults(results)
  ──────────────────────
  Called automatically by FaceMesh every time it processes a camera frame.
  "results" contains all the landmark data MediaPipe found.
*/
function onFaceResults(results) {
  /* If no face is detected, do nothing and return early */
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  /*
    multiFaceLandmarks[0] = the first (and only) face's landmarks.
    This is an array of 468 points, each with x, y, z coordinates.
    x and y are normalized: 0 = left/top edge, 1 = right/bottom edge.
  */
  const lm = results.multiFaceLandmarks[0];

  /* Estimate emotion from the landmark positions */
  const raw = estimateEmotion(lm);

  /* Add to the smoothing buffer */
  faceBuffer.push(raw);

  /* Remove the oldest entry if buffer is too long */
  if (faceBuffer.length > FACE_SMOOTH) faceBuffer.shift();

  /* Average all entries in the buffer */
  const avg = { happy: 0, sad: 0, angry: 0, neutral: 0, calm: 0 };

  faceBuffer.forEach(frame => {
    Object.keys(avg).forEach(k => avg[k] += frame[k]);
  });

  Object.keys(avg).forEach(k => avg[k] /= faceBuffer.length);

  updateEmotionUI(avg);

  const dominant = Object.entries(avg).sort((a, b) => b[1] - a[1])[0][0];
  onMoodChanged(dominant);
}


/*
  estimateEmotion(lm)
  ───────────────────
  Takes 468 landmarks and returns:
  { happy, sad, angry, neutral, calm }

  Measurements:
  1. Mouth corner height  → smile = happy, corners down = sad
  2. Eyebrow distance     → brows low/furrowed = angry
  3. Eye openness         → relaxed/half-closed = calm
*/
function estimateEmotion(lm) {

  const mouthOpen = Math.max(0, (lm[14].y - lm[13].y) * 10 - 0.05);

  const mouthMidY   = (lm[13].y + lm[14].y) / 2;
  const cornersAvgY = (lm[61].y + lm[291].y) / 2;
  const smileScore  = Math.max(0, (mouthMidY - cornersAvgY) * 30);

  const leftBrowDist  = lm[159].y - lm[105].y;
  const rightBrowDist = lm[386].y - lm[334].y;
  const avgBrowDist   = (leftBrowDist + rightBrowDist) / 2;
  const browLow = Math.max(0, 0.045 - avgBrowDist) * 40;

  /* Relaxed / half-closed eyes → calm */
  const eyeOpenness = Math.max(0, (lm[145].y - lm[159].y) * 18);
  const calmScore   = Math.max(0, 0.5 - eyeOpenness) * 1.2;

  let scores = {
    happy:   Math.min(1, smileScore * 0.8 + mouthOpen * 0.3),
    sad:     Math.min(1, Math.max(0, 0.3 - smileScore) * 1.2),
    angry:   Math.min(1, browLow),
    calm:    Math.min(1, calmScore),
    neutral: 0,
  };

  /*
    Neutral only fills strongly when active signals are genuinely weak.
    This prevents neutral from dominating on a resting face.
  */
  const activeSum = scores.happy + scores.sad + scores.angry + scores.calm;
  if (activeSum < 0.35) {
    scores.neutral = Math.max(0, 1 - activeSum);
  } else {
    scores.neutral = Math.max(0, (1 - activeSum) * 0.3);
  }

  /* Normalize to sum to 1.0 */
  const total = Object.values(scores).reduce((sum, val) => sum + val, 0) || 1;
  Object.keys(scores).forEach(k => scores[k] = scores[k] / total);

  return scores;
}

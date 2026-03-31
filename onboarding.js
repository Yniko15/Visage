/*
  onboarding.js — 3-Playlist Assignment (v4)
  ────────────────────────────────────────
  Step 1: Pick 3 specific moods and assign a playlist to each.
  Step 2: Fetch tracks from each playlist directly into the chosen mood.
*/

const MOOD_DISPLAY = {
  happy:   { ascii: '[*]', label: 'Happy',   desc: 'Upbeat & bright'      },
  sad:     { ascii: '[~]', label: 'Sad',     desc: 'Emotional & deep'     },
  angry:   { ascii: '[!]', label: 'Angry',   desc: 'Intense & raw'        },
  neutral: { ascii: '[-]', label: 'Neutral', desc: 'Chill & focused'      },
  calm:    { ascii: '[.]', label: 'Calm',    desc: 'Relaxed & soothing'   },
};

const MIN_SONGS = 5; /* Lowered — we can't verify actual playable tracks in dev mode */

// The 3 slots the user needs to fill
let slots = [
  { id: 1, mood: null, meta: null, playlistUri: null },
  { id: 2, mood: null, meta: null, playlistUri: null },
  { id: 3, mood: null, meta: null, playlistUri: null }
];

let importState = {};
let currentStep = 1;

let selectingForSlot = null; // Which slot is currently picking a playlist in the modal
let modalTracksCache = [];   // Temporary storage for tracks fetched during validation
let modalMetaCache   = null;

/* ── SHOW ONBOARDING ──────────────────────────────────*/
function showOnboarding() {
  if (document.getElementById('onboarding-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id    = 'onboarding-overlay';

  overlay.innerHTML = `
    <div class="ob-box" style="max-width:640px;">

      <!-- STEP INDICATOR -->
      <div class="ob-steps" id="ob-steps">
        <div class="ob-step active" id="ob-step-1">
          <span class="ob-step-num">1</span>
          <span class="ob-step-label">ASSIGN</span>
        </div>
        <div class="ob-step-line" id="ob-line-1"></div>
        <div class="ob-step" id="ob-step-2">
          <span class="ob-step-num">2</span>
          <span class="ob-step-label">IMPORT</span>
        </div>
      </div>

      <!-- ═══ STEP 1: PLAYLIST SLOTS ═══ -->
      <div id="ob-step1" class="ob-screen">
        <div class="ob-header">
          <div class="ob-title">SET YOUR<br>MOODS</div>
          <div class="ob-sub">Assign 3 different playlists to 3 moods</div>
        </div>

        <div class="ob-slots">
          ${[1, 2, 3].map(id => `
            <div class="ob-slot-card" id="slot-card-${id}">
              <div class="ob-slot-top">
                <div class="ob-slot-num">${id}</div>
                <select class="ob-slot-mood" id="slot-mood-${id}">
                  <option value="" disabled selected>-- Select a Mood --</option>
                  ${Object.entries(MOOD_DISPLAY).map(([k, v]) => `<option value="${k}">${v.ascii} ${v.label}</option>`).join('')}
                </select>
              </div>
              
              <div class="ob-slot-content" id="slot-content-${id}">
                <button class="ob-slot-btn" onclick="openPlaylistModal(${id})">
                  <span class="ob-btn-ascii">[+]</span> ASSIGN PLAYLIST
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ob-footer" style="margin-top: 24px; justify-content: flex-end;">
          <button class="ob-next-btn" id="ob-build-btn" disabled>
            BUILD VISAGE <span class="ob-btn-ascii">&gt;&gt;</span>
          </button>
        </div>
      </div>

      <!-- ═══ STEP 2: IMPORT PROGRESS ═══ -->
      <div id="ob-step2" class="ob-screen ob-screen-hidden">
        <div class="ob-header">
          <div class="ob-title">IMPORTING<br>TRACKS</div>
          <div class="ob-sub" id="ob-progress-sub">Mapping playlists to moods...</div>
        </div>

        <!-- ASCII progress bar -->
        <div class="ob-ascii-bar-wrap">
          <pre class="ob-ascii-bar" id="ob-ascii-bar">[....................] 0%</pre>
        </div>

        <!-- Per-mood status rows -->
        <div class="ob-mood-rows" id="ob-mood-rows"></div>

        <!-- Songs found counter -->
        <div class="ob-songs-found" id="ob-songs-found">
          <span class="ob-hint-ascii">[~]</span> Waiting...
        </div>

        <!-- Error display -->
        <div class="ob-error-card" id="ob-step2-error">
          <div class="ob-error-icon" id="ob-step2-error-icon">[x]</div>
          <div class="ob-error-body">
            <div class="ob-error-title" id="ob-step2-error-title">Error</div>
            <div class="ob-error-msg" id="ob-step2-error-msg"></div>
          </div>
        </div>

        <!-- Retry / continue buttons -->
        <div class="ob-footer ob-footer-import" id="ob-import-footer">
          <button class="ob-back-btn" id="ob-back-step1" style="display:none;">
            <span class="ob-btn-ascii">&lt;&lt;</span> GO BACK
          </button>
          <button class="ob-next-btn" id="ob-continue-btn" style="display:none;">
            DONE <span class="ob-btn-ascii">&gt;&gt;</span>
          </button>
        </div>
      </div>

    </div>

    <!-- ═══ MODAL: PLAYLIST PICKER ═══ -->
    <div id="ob-modal" class="ob-modal ob-modal-hidden">
      <div class="ob-modal-content">
        <div class="ob-modal-header">
          <div class="ob-modal-title">Select a Playlist for Slot <span id="ob-modal-slot-num"></span></div>
          <button class="ob-modal-close" onclick="closePlaylistModal()">&times;</button>
        </div>
        
        <!-- Tabs: Browse / Paste URL -->
        <div class="ob-tabs" id="ob-tabs">
          <button class="ob-tab active" id="ob-tab-browse" data-tab="browse">
            <span class="ob-btn-ascii">[~]</span> MY PLAYLISTS
          </button>
          <button class="ob-tab" id="ob-tab-paste" data-tab="paste">
            <span class="ob-btn-ascii">&gt;_</span> PASTE URL
          </button>
        </div>

        <!-- TAB: Browse playlists -->
        <div class="ob-tab-content" id="ob-tab-browse-content">
          <div class="ob-browse-grid" id="ob-browse-grid">
            <div class="ob-browse-loading" id="ob-browse-loading">
              <pre class="ob-ascii-bar">[....................] loading</pre>
            </div>
          </div>
        </div>

        <!-- TAB: Paste URL -->
        <div class="ob-tab-content ob-tab-hidden" id="ob-tab-paste-content">
          <div class="ob-input-wrap" id="ob-input-wrap">
            <div class="ob-input-icon">&gt;_</div>
            <input
              type="text"
              id="ob-playlist-input"
              class="ob-input"
              placeholder="spotify:playlist:... or open.spotify.com/playlist/..."
              spellcheck="false"
              autocomplete="off"
            >
            <button class="ob-input-clear" id="ob-input-clear" title="Clear">&times;</button>
          </div>
          <div class="ob-input-hint" id="ob-input-hint">
            <span class="ob-hint-ascii">[i]</span> Paste a Spotify playlist link or URI
          </div>
          <button class="ob-action-btn" id="ob-validate-btn" disabled>
            <span class="ob-btn-ascii">&gt;</span> LOAD PLAYLIST
          </button>
        </div>

        <!-- Playlist preview (hidden until validated) -->
        <div class="ob-preview" id="ob-preview">
          <div class="ob-preview-art" id="ob-preview-art"></div>
          <div class="ob-preview-info">
            <div class="ob-preview-name" id="ob-preview-name"></div>
            <div class="ob-preview-meta" id="ob-preview-meta"></div>
          </div>
          <div class="ob-preview-check">[ok]</div>
        </div>

        <!-- Error display -->
        <div class="ob-error-card" id="ob-modal-error">
          <div class="ob-error-icon" id="ob-modal-error-icon">[x]</div>
          <div class="ob-error-body">
            <div class="ob-error-title" id="ob-modal-error-title">Error</div>
            <div class="ob-error-msg" id="ob-modal-error-msg"></div>
          </div>
        </div>

        <div class="ob-modal-footer">
          <button class="ob-action-btn" id="ob-modal-confirm" disabled>
            CONFIRM ASSIGNMENT
          </button>
        </div>
      </div>
    </div>
  `;

  const style       = document.createElement('style');
  style.id          = 'ob-styles';
  style.textContent = getOnboardingStyles();
  if(!document.getElementById('ob-styles')) document.head.appendChild(style);
  document.body.appendChild(overlay);

  /* Bind Slot Select Changes */
  [1, 2, 3].forEach(id => {
    document.getElementById(`slot-mood-${id}`).addEventListener('change', (e) => {
      slots[id - 1].mood = e.target.value;
      updateBuildState();
    });
  });

  document.getElementById('ob-build-btn').addEventListener('click', startImport);
  document.getElementById('ob-back-step1').addEventListener('click', () => goToStep(1));
  document.getElementById('ob-continue-btn').addEventListener('click', finalizeDone);

  setupModalEvents();
}


/* ── STEP NAVIGATION ──────────────────────────────────*/
function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.ob-screen').forEach(el => el.classList.add('ob-screen-hidden'));
  document.getElementById(`ob-step${step}`).classList.remove('ob-screen-hidden');

  for (let i = 1; i <= 2; i++) {
    const stepEl = document.getElementById(`ob-step-${i}`);
    stepEl.classList.remove('active', 'completed');
    if (i < step) stepEl.classList.add('completed');
    if (i === step) stepEl.classList.add('active');
  }

  const line1 = document.getElementById('ob-line-1');
  line1.classList.toggle('filled', step > 1);
}

function updateBuildState() {
  const btn = document.getElementById('ob-build-btn');
  // Check if all 3 slots have both a mood and a playlist
  const allFilled = slots.every(s => s.mood && s.meta && s.playlistUri);
  
  // Check if moods are unique
  const selectedMoods = slots.map(s => s.mood).filter(Boolean);
  const uniqueMoods = new Set(selectedMoods).size === selectedMoods.length;

  if (allFilled && uniqueMoods) {
    btn.disabled = false;
    btn.innerHTML = 'BUILD VISAGE <span class="ob-btn-ascii">&gt;&gt;</span>';
  } else if (!uniqueMoods) {
    btn.disabled = true;
    btn.innerHTML = 'MOODS MUST BE UNIQUE';
  } else {
    btn.disabled = true;
    btn.innerHTML = 'ASSIGN 3 PLAYLISTS';
  }
}

/* ── MODAL LOGIC ──────────────────────────────────────*/
function openPlaylistModal(slotId) {
  selectingForSlot = slotId;
  document.getElementById('ob-modal-slot-num').textContent = slotId;
  document.getElementById('ob-modal').classList.remove('ob-modal-hidden');
  
  // reset state
  modalTracksCache = [];
  modalMetaCache = null;
  document.getElementById('ob-modal-confirm').disabled = true;
  hidePreview();
  hideModalError();
  
  // Load playlists if grid is empty
  const grid = document.getElementById('ob-browse-grid');
  if (grid.innerHTML.includes('loading')) {
    browseMyPlaylists();
  }
}

function closePlaylistModal() {
  document.getElementById('ob-modal').classList.add('ob-modal-hidden');
  selectingForSlot = null;
}

function setupModalEvents() {
  /* Tabs */
  document.getElementById('ob-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.ob-tab');
    if (!tab) return;
    const tabName = tab.dataset.tab;
    document.querySelectorAll('.ob-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('ob-tab-browse-content').classList.toggle('ob-tab-hidden', tabName !== 'browse');
    document.getElementById('ob-tab-paste-content').classList.toggle('ob-tab-hidden', tabName !== 'paste');
  });

  /* Paste URL */
  const input     = document.getElementById('ob-playlist-input');
  const clearBtn  = document.getElementById('ob-input-clear');
  const validateBtn = document.getElementById('ob-validate-btn');

  input.addEventListener('input', () => {
    const val = input.value.trim();
    validateBtn.disabled = val.length === 0;
    clearBtn.style.display = val.length > 0 ? 'flex' : 'none';
    hideModalError();
    hidePreview();
    document.getElementById('ob-modal-confirm').disabled = true;
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    validateBtn.disabled = true;
    hideModalError();
    hidePreview();
    document.getElementById('ob-modal-confirm').disabled = true;
    input.focus();
  });

  validateBtn.addEventListener('click', () => validatePlaylistUrl());

  /* Browse grid */
  document.getElementById('ob-browse-grid').addEventListener('click', e => {
    const card = e.target.closest('.ob-pl-card:not(.ob-pl-disabled)');
    if (card) selectBrowsedPlaylist(card.dataset.id, card.dataset.name, card.dataset.image, parseInt(card.dataset.tracks), card.dataset.owner);
  });

  /* Confirm Assignment */
  document.getElementById('ob-modal-confirm').addEventListener('click', () => {
    if (!selectingForSlot || !modalMetaCache) return;
    
    // Assign to slot
    const slotIdx = selectingForSlot - 1;
    slots[slotIdx].meta = modalMetaCache;
    slots[slotIdx].playlistUri = `spotify:playlist:${modalMetaCache.id}`;
    
    // Update Slot UI
    const contentDiv = document.getElementById(`slot-content-${selectingForSlot}`);
    const imgStyle = modalMetaCache.image ? `background-image:url(${modalMetaCache.image})` : '';
    const imgAscii = modalMetaCache.image ? '' : '<span>[#]</span>';
    
    const slotDisplayTracks = modalMetaCache.totalTracks > 0 ? modalMetaCache.totalTracks + ' tracks' : 'Tracks hidden';
    
    contentDiv.innerHTML = `
      <div class="ob-slot-assigned">
        <div class="ob-pl-art" style="${imgStyle}">${imgAscii}</div>
        <div class="ob-pl-info">
          <div class="ob-pl-name">${modalMetaCache.name}</div>
          <div class="ob-pl-meta">${slotDisplayTracks}</div>
        </div>
        <button class="ob-slot-reassign" onclick="openPlaylistModal(${selectingForSlot})" title="Change Playlist">&times;</button>
      </div>
    `;
    
    updateBuildState();
    closePlaylistModal();
  });
}


/* ── BROWSE PLAYLISTS ─────────────────────────*/
async function browseMyPlaylists() {
  const grid    = document.getElementById('ob-browse-grid');
  try {
    const playlists = await spotifyFetchMyPlaylists(30);
    if (playlists.length === 0) {
      grid.innerHTML = `<div class="ob-browse-empty"><span class="ob-hint-ascii">[0]</span> No playlists found</div>`;
      return;
    }
    grid.innerHTML = playlists.map(pl => {
      /* Spotify API Dev Mode sometimes returns 0 for tracks.total on /me/playlists */
      const disabled = false;
      const displayTracks = pl.totalTracks > 0 ? pl.totalTracks + ' tracks' : 'Tracks hidden';

      return `
        <div class="ob-pl-card"
             data-id="${pl.id}"
             data-name="${pl.name.replace(/"/g, '&quot;')}"
             data-image="${pl.image || ''}"
             data-tracks="${pl.totalTracks}"
             data-owner="${(pl.owner || '').replace(/"/g, '&quot;')}">
          <div class="ob-pl-art" style="${pl.image ? `background-image:url(${pl.image})` : ''}">
            ${pl.image ? '' : '<span>[#]</span>'}
          </div>
          <div class="ob-pl-info">
            <div class="ob-pl-name">${pl.name}</div>
            <div class="ob-pl-meta">${displayTracks} · ${pl.owner}</div>
          </div>
          <div class="ob-pl-badge ob-pl-ok">[ok]</div>
        </div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="ob-browse-empty"><span class="ob-hint-ascii">[x]</span> Could not load playlists</div>`;
  }
}

async function selectBrowsedPlaylist(id, name, image, totalTracks, owner) {
  document.querySelectorAll('.ob-pl-card').forEach(c => c.classList.remove('ob-pl-selected'));
  const card = document.querySelector(`.ob-pl-card[data-id="${id}"]`);
  if (card) card.classList.add('ob-pl-selected');

  hideModalError();
  hidePreview();
  document.getElementById('ob-modal-confirm').disabled = true;

  /* No need to fetch individual tracks — just use the metadata we already have */
  modalMetaCache = { name, image, totalTracks, owner, id };

  showPreview(modalMetaCache, totalTracks);
  document.querySelector('.ob-preview-check').textContent = '[ok]';
  document.getElementById('ob-modal-confirm').disabled = false;
}

/* ── VALIDATE URL ────────────────────────*/
async function validatePlaylistUrl() {
  const input = document.getElementById('ob-playlist-input');
  const raw = input.value.trim();
  const sanitized = raw.replace(/[<>"'`\\]/g, '');
  const playlistId = parseSpotifyPlaylistId(sanitized);
  if (!playlistId) {
    showModalError('INVALID_URL', 'Could not parse playlist URL', 'Try a valid Spotify link.');
    return;
  }

  const validateBtn = document.getElementById('ob-validate-btn');
  validateBtn.disabled = true;
  validateBtn.innerHTML = '<span class="ob-btn-ascii">[~]</span> LOADING...';
  document.getElementById('ob-input-wrap').classList.add('loading');

  try {
    /* Only fetch metadata — track listings are blocked by Spotify dev mode */
    const meta = await spotifyFetchPlaylistMeta(playlistId);

    modalMetaCache = { ...meta, id: playlistId };

    showPreview(modalMetaCache, meta.totalTracks);
    document.getElementById('ob-modal-confirm').disabled = false;
    resetValidateBtn();
  } catch (err) {
    categorizeAndShowModalError(err);
    resetValidateBtn();
  }
}

function resetValidateBtn() {
  const btn = document.getElementById('ob-validate-btn');
  btn.disabled = document.getElementById('ob-playlist-input').value.trim().length === 0;
  btn.innerHTML = '<span class="ob-btn-ascii">&gt;</span> LOAD PLAYLIST';
  document.getElementById('ob-input-wrap').classList.remove('loading');
}

function showPreview(meta, trackCount) {
  const el = document.getElementById('ob-preview');
  const artEl = document.getElementById('ob-preview-art');
  if (meta.image) {
    artEl.style.backgroundImage = `url(${meta.image})`;
    artEl.textContent = '';
  } else {
    artEl.style.backgroundImage = 'none';
    artEl.textContent = '[#]';
  }
  document.getElementById('ob-preview-name').textContent = meta.name;
  const displayTracks = trackCount > 0 ? trackCount + ' tracks' : 'Tracks hidden';
  document.getElementById('ob-preview-meta').textContent = `${displayTracks} · by ${meta.owner}`;
  el.classList.add('show');
}

function hidePreview() {
  document.getElementById('ob-preview').classList.remove('show');
}


/* ── MODAL ERROR HANDLING ───────────────────────────*/
function categorizeAndShowModalError(err) {
  const msg = err.message || String(err);
  if (msg.includes('401')) {
    showModalError('AUTH', 'Session expired', 'Reconnect Spotify and try again.');
  } else if (msg.includes('403')) {
    showModalError('FORBIDDEN', 'Access denied (403)', 'Spotify dev mode restricts playlist access. Make sure: (1) your account is added in the Developer Dashboard under "Users and Access", (2) you have Spotify Premium, and (3) try reconnecting Spotify.');
  } else if (msg.includes('404')) {
    showModalError('NOT_FOUND', 'Playlist not found', 'Make sure it is public or that you follow it.');
  } else {
    showModalError('GENERIC', 'Error', msg);
  }
}

function showModalError(type, title, message) {
  document.getElementById('ob-modal-error-title').textContent = title;
  document.getElementById('ob-modal-error-msg').textContent = message;
  document.getElementById('ob-modal-error').classList.add('show');
}

function hideModalError() {
  const el = document.getElementById('ob-modal-error');
  if (el) el.classList.remove('show');
}


/* ── STEP 2: IMPORT BUILD ─────────────────────────*/
function getMoodColor(mood) {
  const colors = { happy: '#f5e6c8', sad: '#d4dfe8', angry: '#f0d0cd', neutral: '#dfe8da', calm: '#e4dfe8' };
  return colors[mood] || '#ede8df';
}

function buildMoodRows() {
  const wrap = document.getElementById('ob-mood-rows');
  wrap.innerHTML = slots.map(slot => {
    const mood = slot.mood;
    return `
      <div class="ob-mood-row" id="ob-row-${mood}">
        <span class="ob-row-ascii">${MOOD_DISPLAY[mood].ascii}</span>
        <span class="ob-row-label">${MOOD_DISPLAY[mood].label}</span>
        <span class="ob-row-count" id="ob-count-${mood}">0</span>
        <span class="ob-row-status" id="ob-status-${mood}">---</span>
      </div>
    `;
  }).join('');
}

function setMoodStatus(mood, status, count = 0) {
  const el = document.getElementById(`ob-status-${mood}`);
  if (!el) return;

  const states = {
    pending:   { text: '---',            cls: 'status-pending'   },
    importing: { text: '[~] importing',  cls: 'status-searching' },
    done:      { text: '[+] ready',      cls: 'status-done'      },
    failed:    { text: '[x] failed',     cls: 'status-failed'    },
  };
  const s = states[status];
  el.textContent = s.text;
  el.className   = `ob-row-status ${s.cls}`;

  document.getElementById(`ob-count-${mood}`).textContent = count;
}

function updateAsciiBar(current, total) {
  const barEl = document.getElementById('ob-ascii-bar');
  if (!barEl) return;
  const barWidth = 20;
  const pct      = total === 0 ? 0 : Math.round((current / total) * 100);
  const filled   = Math.round((current / total) * barWidth);
  const empty    = barWidth - filled;
  barEl.textContent = '[' + '#'.repeat(filled) + '.'.repeat(empty) + '] ' + pct + '%';
}

function updateSongsFound(total) {
  const el = document.getElementById('ob-songs-found');
  el.innerHTML = total === 0
    ? '<span class="ob-hint-ascii">[~]</span> Importing...'
    : `<span class="ob-hint-ascii">[+]</span> ${total} song${total !== 1 ? 's' : ''} imported`;
}

function updateProgressSub(text) {
  const el = document.getElementById('ob-progress-sub');
  if (el) el.textContent = text;
}

async function startImport() {
  goToStep(2);
  importState = {};
  slots.forEach(s => {
    importState[s.mood] = { status: 'pending', playlistUri: null, meta: null };
  });

  buildMoodRows();
  updateProgressSub('Mapping playlists to moods...');
  
  const totalSlots = slots.length;
  let doneCount = 0;
  updateAsciiBar(0, totalSlots);

  for (const slot of slots) {
    const mood = slot.mood;
    setMoodStatus(mood, 'importing', 0);
    
    // Slight delay for UI feedback
    await new Promise(r => setTimeout(r, 600));

    importState[mood].playlistUri = slot.playlistUri;
    importState[mood].meta = slot.meta;
    importState[mood].status = 'done';
    doneCount++;

    setMoodStatus(mood, 'done', slot.meta?.totalTracks || 0);
    updateAsciiBar(doneCount, totalSlots);
    updateSongsFound(doneCount);
  }

  updateProgressSub(`${totalSlots} playlists mapped — ready to go!`);
  updateSongsFound(0); // reset the counter display
  document.getElementById('ob-songs-found').innerHTML =
    `<span class="ob-hint-ascii">[+]</span> ${totalSlots} playlists assigned to moods`;
  document.getElementById('ob-continue-btn').style.display = 'inline-flex';
}

function finalizeDone() {
  /*
    Build a mood → playlistUri mapping for context-based playback.
    Instead of individual tracks, the player will play entire playlists
    when a mood is detected.
  */
  const moodPlaylists = {};
  for (const slot of slots) {
    moodPlaylists[slot.mood] = {
      uri:   slot.playlistUri,
      meta:  slot.meta,
    };
  }

  loadMoodPlaylists(moodPlaylists);

  const overlay = document.getElementById('onboarding-overlay');
  overlay.classList.add('fade-out');
  setTimeout(() => overlay.remove(), 500);
}

function shuffleOnboardingArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


/* ── STYLES ───────────────────────────────────────────*/
function getOnboardingStyles() {
  return `

    #onboarding-overlay {
      position: fixed;
      inset: 0;
      background: rgba(245,240,232,0.98);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.5s;
      overflow-y: auto;
    }
    #onboarding-overlay.fade-out { opacity: 0; pointer-events: none; }

    .ob-box {
      width: 100%;
      max-width: 560px;
      padding: 32px 28px;
      position: relative;
    }

    /* ── STEP INDICATOR ── */
    .ob-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 36px;
    }

    .ob-step {
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.3;
      transition: opacity 0.3s;
    }
    .ob-step.active    { opacity: 1; }
    .ob-step.completed { opacity: 0.6; }

    .ob-step-num {
      width: 28px;
      height: 28px;
      border: 1px solid rgba(42,37,32,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: rgba(42,37,32,0.5);
      transition: border-color 0.3s, color 0.3s, background 0.3s;
    }
    .ob-step.active .ob-step-num {
      border-color: rgba(122,140,110,0.6);
      color: var(--accent2, #5c6b52);
      background: rgba(122,140,110,0.08);
    }
    .ob-step.completed .ob-step-num {
      border-color: rgba(122,140,110,0.3);
      color: rgba(122,140,110,0.7);
      background: rgba(122,140,110,0.05);
    }

    .ob-step-label {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 2px;
      color: rgba(42,37,32,0.4);
    }
    .ob-step.active .ob-step-label { color: rgba(42,37,32,0.75); }

    .ob-step-line {
      width: 40px;
      height: 1px;
      background: rgba(42,37,32,0.1);
      margin: 0 12px;
      transition: background 0.4s;
    }
    .ob-step-line.filled { background: rgba(122,140,110,0.4); }

    /* ── SCREENS ── */
    .ob-screen-hidden { display: none !important; }
    .ob-screen {
      animation: ob-fadeIn 0.3s ease;
    }
    @keyframes ob-fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── HEADER ── */
    .ob-header { margin-bottom: 28px; }

    .ob-title {
      font-family: 'Space Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 2px;
      line-height: 1.15;
      color: #2a2520;
      margin-bottom: 10px;
    }

    .ob-sub {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      color: rgba(42,37,32,0.4);
      text-transform: uppercase;
    }

    /* ── TABS ── */
    .ob-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 20px;
      border: 1px solid rgba(42,37,32,0.12);
      border-radius: 4px;
      overflow: hidden;
    }

    .ob-tab {
      flex: 1;
      background: rgba(42,37,32,0.02);
      border: none;
      color: rgba(42,37,32,0.4);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      padding: 11px 14px;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .ob-tab:not(:last-child) { border-right: 1px solid rgba(42,37,32,0.12); }
    .ob-tab:hover { background: rgba(42,37,32,0.04); color: rgba(42,37,32,0.6); }
    .ob-tab.active { background: rgba(122,140,110,0.08); color: var(--accent2, #5c6b52); }

    .ob-tab-content { animation: ob-fadeIn 0.25s ease; }
    .ob-tab-hidden  { display: none !important; }

    /* ── BROWSE GRID ── */
    .ob-browse-grid {
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 18px;
      padding-right: 4px;
    }

    .ob-browse-grid::-webkit-scrollbar { width: 3px; }
    .ob-browse-grid::-webkit-scrollbar-track { background: transparent; }
    .ob-browse-grid::-webkit-scrollbar-thumb { background: rgba(42,37,32,0.15); border-radius: 2px; }

    .ob-pl-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: rgba(42,37,32,0.02);
      border: 1px solid rgba(42,37,32,0.10);
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, transform 0.1s;
    }
    .ob-pl-card:hover { border-color: rgba(42,37,32,0.20); background: rgba(42,37,32,0.04); transform: translateX(2px); }
    .ob-pl-card.ob-pl-selected {
      border-color: rgba(122,140,110,0.45);
      background: rgba(122,140,110,0.06);
    }
    .ob-pl-card.ob-pl-disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    .ob-pl-art {
      width: 40px;
      height: 40px;
      border-radius: 4px;
      background: rgba(42,37,32,0.06);
      background-size: cover;
      background-position: center;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: rgba(42,37,32,0.3);
    }

    .ob-pl-info { flex: 1; min-width: 0; }

    .ob-pl-name {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #2a2520;
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .ob-pl-meta {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(42,37,32,0.4);
      letter-spacing: 0.5px;
    }

    .ob-pl-badge {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(42,37,32,0.35);
      flex-shrink: 0;
    }
    .ob-pl-badge.ob-pl-ok { color: rgba(92,107,82,0.7); }

    .ob-browse-loading,
    .ob-browse-empty {
      padding: 30px 0;
      text-align: center;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: rgba(42,37,32,0.4);
      letter-spacing: 1px;
    }

    /* ── INPUT ── */
    .ob-input-wrap {
      display: flex;
      align-items: center;
      background: rgba(42,37,32,0.03);
      border: 1px solid rgba(42,37,32,0.12);
      border-radius: 4px;
      padding: 0 14px;
      transition: border-color 0.25s, box-shadow 0.25s;
      margin-bottom: 8px;
    }
    .ob-input-wrap:focus-within {
      border-color: rgba(122,140,110,0.5);
      box-shadow: 0 0 0 3px rgba(122,140,110,0.08);
    }
    .ob-input-wrap.loading {
      border-color: rgba(122,140,110,0.3);
      animation: ob-inputPulse 1.2s ease infinite;
    }
    @keyframes ob-inputPulse {
      0%,100% { box-shadow: 0 0 0 3px rgba(122,140,110,0.04); }
      50%     { box-shadow: 0 0 0 6px rgba(122,140,110,0.10); }
    }

    .ob-input-icon {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      color: rgba(122,140,110,0.6);
      margin-right: 10px;
      flex-shrink: 0;
    }

    .ob-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: #2a2520;
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.5px;
      padding: 14px 0;
    }
    .ob-input::placeholder { color: rgba(42,37,32,0.25); }

    .ob-input-clear {
      display: none;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: rgba(42,37,32,0.4);
      font-size: 16px;
      cursor: pointer;
      padding: 4px;
      margin-left: 8px;
      transition: color 0.2s;
    }
    .ob-input-clear:hover { color: #c4453a; }

    .ob-input-hint {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(42,37,32,0.35);
      letter-spacing: 1px;
      margin-bottom: 18px;
    }

    .ob-hint-ascii {
      color: rgba(122,140,110,0.7);
      margin-right: 4px;
    }

    /* ── PREVIEW CARD ── */
    .ob-preview {
      display: none;
      align-items: center;
      gap: 14px;
      background: rgba(122,140,110,0.06);
      border: 1px solid rgba(122,140,110,0.18);
      border-radius: 4px;
      padding: 14px 16px;
      margin-bottom: 20px;
      animation: ob-fadeIn 0.3s ease;
    }
    .ob-preview.show { display: flex; }

    .ob-preview-art {
      width: 48px;
      height: 48px;
      border-radius: 4px;
      background: rgba(42,37,32,0.06);
      background-size: cover;
      background-position: center;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: rgba(42,37,32,0.3);
    }

    .ob-preview-info { flex: 1; min-width: 0; }

    .ob-preview-name {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #2a2520;
      letter-spacing: 1px;
      margin-bottom: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ob-preview-meta {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(42,37,32,0.5);
      letter-spacing: 1px;
    }

    .ob-preview-check {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: rgba(92,107,82,0.8);
      flex-shrink: 0;
    }

    /* ── ERROR CARD ── */
    .ob-error-card {
      display: none;
      align-items: flex-start;
      gap: 12px;
      background: rgba(196,69,58,0.06);
      border: 1px solid rgba(196,69,58,0.18);
      border-radius: 4px;
      padding: 14px 16px;
      margin-bottom: 18px;
      animation: ob-fadeIn 0.25s ease;
    }
    .ob-error-card.show { display: flex; }

    .ob-error-icon {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      color: #c4453a;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .ob-error-body { flex: 1; min-width: 0; }

    .ob-error-title {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #c4453a;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }

    .ob-error-msg {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(196,69,58,0.65);
      letter-spacing: 0.5px;
      line-height: 1.6;
    }

    /* ── MOOD CARDS ── */
    .ob-moods {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 28px;
    }

    .ob-mood-card {
      border: 1px solid rgba(42,37,32,0.12);
      border-radius: 4px;
      padding: 18px 12px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.1s;
      text-align: center;
      background: rgba(42,37,32,0.02);
      user-select: none;
    }
    .ob-mood-card:hover    { border-color: rgba(42,37,32,0.25); background: rgba(42,37,32,0.04); transform: translateY(-2px); }
    .ob-mood-card.selected { border-color: rgba(122,140,110,0.5); background: rgba(122,140,110,0.06); }

    .ob-mood-ascii,
    .ob-mood-label,
    .ob-mood-desc { pointer-events: none; }

    .ob-mood-ascii {
      font-family: 'Space Mono', monospace;
      font-size: 18px;
      color: rgba(122,140,110,0.8);
      margin-bottom: 8px;
      display: block;
    }

    .ob-mood-label {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #2a2520;
      margin-bottom: 3px;
    }

    .ob-mood-desc {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: rgba(42,37,32,0.4);
      letter-spacing: 1px;
    }

    /* ── FOOTER ── */
    .ob-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .ob-footer-import {
      justify-content: flex-end;
      gap: 10px;
    }

    .ob-selected-count {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: rgba(42,37,32,0.4);
      letter-spacing: 2px;
      flex: 1;
      text-align: center;
    }
    .ob-selected-count.shake { animation: ob-shake 0.3s ease; }
    @keyframes ob-shake {
      0%,100%{transform:translateX(0)}
      25%{transform:translateX(-6px)}
      75%{transform:translateX(6px)}
    }

    /* Buttons */
    .ob-btn-ascii {
      font-family: 'Space Mono', monospace;
      opacity: 0.5;
    }

    .ob-action-btn {
      background: rgba(122,140,110,0.08);
      border: 1px solid rgba(122,140,110,0.25);
      color: var(--accent2, #5c6b52);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      padding: 11px 20px;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.2s, background 0.2s, transform 0.1s;
    }
    .ob-action-btn:disabled { opacity: 0.25; cursor: not-allowed; }
    .ob-action-btn:not(:disabled):hover  { background: rgba(122,140,110,0.14); }
    .ob-action-btn:not(:disabled):active { transform: scale(0.97); }

    .ob-next-btn {
      background: #2a2520;
      border: none;
      color: #F5F0E8;
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 3px;
      padding: 12px 22px;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }
    .ob-next-btn:disabled                 { opacity: 0.15; cursor: not-allowed; }
    .ob-next-btn:not(:disabled):hover     { transform: scale(1.02); }
    .ob-next-btn:not(:disabled):active    { transform: scale(0.97); }

    .ob-back-btn {
      background: none;
      border: 1px solid rgba(42,37,32,0.2);
      color: rgba(42,37,32,0.5);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      padding: 10px 18px;
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }
    .ob-back-btn:hover { border-color: rgba(42,37,32,0.4); color: rgba(42,37,32,0.7); }

    .ob-retry-btn {
      background: none;
      border: 1px solid rgba(196,69,58,0.3);
      color: rgba(196,69,58,0.75);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      padding: 10px 18px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .ob-retry-btn:hover { background: rgba(196,69,58,0.08); color: #c4453a; }

    /* ── ASCII PROGRESS BAR ── */
    .ob-ascii-bar-wrap {
      margin-bottom: 24px;
    }

    .ob-ascii-bar {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      letter-spacing: 1px;
      color: rgba(122,140,110,0.8);
      text-align: center;
      margin: 0;
    }

    /* ── PER-MOOD ROWS ── */
    .ob-mood-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 18px;
    }

    .ob-mood-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: rgba(42,37,32,0.02);
      border: 1px solid rgba(42,37,32,0.08);
      border-radius: 4px;
      transition: border-color 0.3s;
    }

    .ob-row-ascii {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      color: rgba(122,140,110,0.7);
      flex-shrink: 0;
    }

    .ob-row-label {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #2a2520;
      flex: 1;
    }

    .ob-row-count {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: rgba(42,37,32,0.4);
      min-width: 24px;
      text-align: right;
    }

    .ob-row-status {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 1px;
      min-width: 90px;
      text-align: right;
    }

    .status-pending   { color: rgba(42,37,32,0.2); }
    .status-searching { color: rgba(42,37,32,0.5); animation: ob-pulse 1s infinite; }
    .status-done      { color: rgba(92,107,82,0.85); }
    .status-failed    { color: rgba(196,69,58,0.85); }

    @keyframes ob-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    /* ── SONGS FOUND ── */
    .ob-songs-found {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      color: rgba(42,37,32,0.4);
      margin-bottom: 16px;
    }
  `;
}

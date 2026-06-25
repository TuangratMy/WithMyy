/* ══════════════════════════════════════════════
   PAGE 6 — GORGEOUS PUZZLE ENGINE  (v2)
   Flow:
     INTRO → HOWTO → FRAME (make frame with 2 hands)
     → snap fingers (quick pinch) → white flash → PREVIEW (1.5s) → COUNTDOWN → PUZZLE → WIN/LOSE
   Changes from v1:
     • Snap-to-capture: quick pinch replaces 5s hold
     • White shutter flash on capture
     • Captured image preview card before countdown
     • Neon hand skeleton (bone lines + joint dots)
     • Frame progress arc replaced with animated dashed border
     • Stability required reduced (feels snappier)
     • Puzzle pieces scatter more naturally
     • Smoother drag (higher EMA for drag state)
══════════════════════════════════════════════ */

let p6Video, p6Canvas, p6Ctx, p6Overlay, p6OCtx;
let p6W = 0, p6H = 0, p6Started = false;
let p6HandsMp, p6Camera6;

const P6_STATE = {
  INTRO:'intro', HOWTO:'howto', FRAME:'frame',
  CAPTURING:'capturing', PREVIEW:'preview',
  COUNTDOWN:'countdown', PUZZLE:'puzzle',
  WIN:'win', LOSE:'lose'
};
let p6State = P6_STATE.INTRO;
let p6TimeLeft = 90, p6TimerInterval = null;
let p6PiecesPlaced = 0;
const P6_GRID = 3;
const P6_TOTAL = P6_GRID * P6_GRID;

let p6CapturedImage = null;   // ImageBitmap
let p6PreviewDataURL = null;  // for <img> preview

let p6Pieces = [];
let p6BoardX = 0, p6BoardY = 0, p6BoardW = 0, p6BoardH = 0;

/* ── Smoothing constants ── */
const P6_SMOOTH_IDLE  = 0.30;  // gentle when not dragging
const P6_SMOOTH_DRAG  = 0.55;  // snappier while dragging

/* ── Hand state ── */
let p6Hands = [
  { lm:null, cx:0, cy:0, pinching:false, lastPinch:false, pinchProgress:0, cooldown:0, smoothInit:false, wasPinching:false },
  { lm:null, cx:0, cy:0, pinching:false, lastPinch:false, pinchProgress:0, cooldown:0, smoothInit:false, wasPinching:false }
];
let p6DragPiece = null;
let p6DragHandIdx = -1;

/* ── Frame state ── */
let p6FrameBox = null;
let p6LockedBox = null;
let p6FrameStableFrames = 0;
let p6FrameStableRef = null;
const P6_STABLE_NEEDED    = 45;   // ~1.5s at 30fps — just needs to be reasonably still
const P6_STABLE_TOLERANCE = 35;   // px drift allowed

/* ── Snap-to-capture ── */
// A "snap" = a very fast pinch: pinch appears and releases within P6_SNAP_MAX_FRAMES,
// after the frame has been stable (p6LockedBox is set).
let p6SnapPinchStartFrame = -1;
const P6_SNAP_MAX_FRAMES = 15;    // ~0.5s hold to capture
let p6SnapTriggered = false;
// We only accept snap from hand 0 (first detected hand) to avoid accidental double-fire.
const P6_SNAP_HAND = 0;

/* ── Shutter flash ── */
let p6FlashActive = false;

/* ── Neon skeleton palette ── */
const P6_NEON = {
  hand0: { bone:'rgba(120,220,255,0.75)', joint:'rgba(180,240,255,0.95)', pinch:'rgba(0,200,255,1)' },
  hand1: { bone:'rgba(200,120,255,0.75)', joint:'rgba(230,180,255,0.95)', pinch:'rgba(200,0,255,1)' },
};
// Mediapipe hand connections (21 landmarks)
const MP_HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],         // thumb
  [0,5],[5,6],[6,7],[7,8],         // index
  [0,9],[9,10],[10,11],[11,12],    // middle
  [0,13],[13,14],[14,15],[15,16],  // ring
  [0,17],[17,18],[18,19],[19,20],  // pinky
  [5,9],[9,13],[13,17],            // palm
];

/* ── Countdown steps ── */
const p6CountdownSteps = [
  { num:'3', cue:'Get ready!' },
  { num:'2', cue:'Almost there…' },
  { num:'1', cue:'Here we go!' },
  { num:'GO!', cue:'Puzzle time!', go:true },
];

/* ══════════════════════════
   INIT
══════════════════════════ */
function initPage6() {
  p6Video   = document.getElementById('p6-video');
  p6Canvas  = document.getElementById('p6-canvas');
  p6Ctx     = p6Canvas.getContext('2d');
  p6Overlay = document.getElementById('p6-overlay');
  p6OCtx    = p6Overlay.getContext('2d');

  p6Started = true;
  p6ResizeCanvases();
  window.addEventListener('resize', p6ResizeCanvases);

  p6HandsMp = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  p6HandsMp.setOptions({ maxNumHands:2, modelComplexity:1, minDetectionConfidence:0.7, minTrackingConfidence:0.6 });
  p6HandsMp.onResults(p6OnHandResults);

  p6Camera6 = new Camera(p6Video, {
    onFrame: async () => { await p6HandsMp.send({ image: p6Video }); },
    width:1280, height:720
  });
  p6Camera6.start();
  p6RenderLoop();
  p6ShowState(P6_STATE.INTRO);
}

function p6ResizeCanvases() {
  p6W = window.innerWidth;
  p6H = window.innerHeight;
  [p6Canvas, p6Overlay].forEach(c => { c.width = p6W; c.height = p6H; });
}

/* ══════════════════════════
   STATE MACHINE
══════════════════════════ */
function p6ShowState(state) {
  p6State = state;
  const ids = ['p6-intro-wrap','p6-howto-wrap','p6-countdown-wrap','p6-hud','p6-win-wrap','p6-lose-wrap','p6-preview-wrap'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('p6-snap-hint') && (document.getElementById('p6-snap-hint').style.display = 'none');

  if (state === P6_STATE.INTRO)      { document.getElementById('p6-intro-wrap').style.display = 'flex'; }
  if (state === P6_STATE.HOWTO)      { document.getElementById('p6-howto-wrap').style.display = 'flex'; }
  if (state === P6_STATE.FRAME)      { p6ResetFrameTracking(); document.getElementById('p6-snap-hint').style.display = 'block'; }
  if (state === P6_STATE.COUNTDOWN)  { p6RunCountdown(); }
  if (state === P6_STATE.PUZZLE)     { p6StartPuzzle(); }
  if (state === P6_STATE.WIN)        { p6ShowWin(); }
  if (state === P6_STATE.LOSE)       { p6ShowLose(); }
}

function p6ResetFrameTracking() {
  p6FrameBox = null;
  p6LockedBox = null;
  p6FrameStableFrames = 0;
  p6FrameStableRef = null;
  p6SnapPinchStartFrame = -1;
  p6SnapTriggered = false;
  p6FlashActive = false;
}

/* ══════════════════════════
   COUNTDOWN
══════════════════════════ */
function p6RunCountdown() {
  const wrap = document.getElementById('p6-countdown-wrap');
  wrap.style.display = 'flex';
  const numEl = document.getElementById('p6-count-num');
  const cueEl = document.getElementById('p6-count-cue');
  let step = 0;
  function tick() {
    const s = p6CountdownSteps[step];
    numEl.className = 'p6-num' + (s.go ? ' go' : '');
    numEl.style.animation = 'none'; void numEl.offsetWidth; numEl.style.animation = '';
    numEl.textContent = s.num;
    cueEl.textContent = s.cue;
    step++;
    if (step < p6CountdownSteps.length) setTimeout(tick, 900);
    else setTimeout(() => { wrap.style.display = 'none'; p6ShowState(P6_STATE.PUZZLE); }, 800);
  }
  tick();
}

/* ══════════════════════════
   HAND RESULTS
══════════════════════════ */
let p6FrameCount = 0;

function p6OnHandResults(results) {
  p6FrameCount++;
  p6Hands.forEach(h => { h.lm = null; });

  if (results.multiHandLandmarks) {
    results.multiHandLandmarks.forEach((lm, i) => {
      if (i > 1) return;
      const h = p6Hands[i];
      h.lm = lm;

      const toC = (lx, ly) => ({ x: (1 - lx) * p6W, y: ly * p6H });
      const idx = toC(lm[8].x, lm[8].y);
      const thb = toC(lm[4].x, lm[4].y);
      const rawCx = (idx.x + thb.x) / 2;
      const rawCy = (idx.y + thb.y) / 2;

      // Dynamic EMA: snappier while dragging this hand
      const alpha = (p6DragPiece && p6DragHandIdx === i) ? P6_SMOOTH_DRAG : P6_SMOOTH_IDLE;
      if (!h.smoothInit) { h.cx = rawCx; h.cy = rawCy; h.smoothInit = true; }
      else { h.cx = h.cx + (rawCx - h.cx) * alpha; h.cy = h.cy + (rawCy - h.cy) * alpha; }

      const dx = lm[8].x - lm[4].x, dy = lm[8].y - lm[4].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      h.pinchProgress = Math.max(0, Math.min(1, 1 - (dist - 0.045) / 0.03));
      h.pinching = dist < 0.045;
      if (h.cooldown > 0) h.cooldown--;
    });
  }

  if (p6State === P6_STATE.FRAME)  { p6HandleFrameMode(); }
  if (p6State === P6_STATE.PUZZLE) { p6HandlePuzzleMode(); }
}

/* ══════════════════════════
   FRAME MODE
══════════════════════════ */
function p6HandleFrameMode() {
  const h0 = p6Hands[0], h1 = p6Hands[1];
  if (!h0.lm || !h1.lm) {
    p6FrameBox = null;
    p6FrameStableFrames = 0;
    p6FrameStableRef = null;
    return;
  }

  const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });

  // Use thumb tip (4) + index tip (8) of each hand as frame corners
  // — this matches the "L-shape finger frame" gesture shown in the reference video
  const thb0 = toC(h0.lm, 4), idx0 = toC(h0.lm, 8);
  const thb1 = toC(h1.lm, 4), idx1 = toC(h1.lm, 8);

  const xs = [thb0.x, idx0.x, thb1.x, idx1.x];
  const ys = [thb0.y, idx0.y, thb1.y, idx1.y];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  p6FrameBox = { x:minX, y:minY, w:maxX-minX, h:maxY-minY };

  // Stability
  if (!p6FrameStableRef) {
    p6FrameStableRef = { ...p6FrameBox };
    p6FrameStableFrames = 1;
  } else {
    const drift = Math.abs(p6FrameBox.x - p6FrameStableRef.x)
                + Math.abs(p6FrameBox.y - p6FrameStableRef.y)
                + Math.abs(p6FrameBox.w - p6FrameStableRef.w)
                + Math.abs(p6FrameBox.h - p6FrameStableRef.h);
    if (drift < P6_STABLE_TOLERANCE) {
      p6FrameStableFrames++;
    } else {
      p6FrameStableRef = { ...p6FrameBox };
      p6FrameStableFrames = 1;
    }
  }

  const stableEnough = p6FrameStableFrames >= P6_STABLE_NEEDED
                    && p6FrameBox.w > 60 && p6FrameBox.h > 60;

  if (stableEnough && !p6LockedBox) {
    p6LockedBox = { ...p6FrameBox };
  } else if (!stableEnough) {
    p6LockedBox = null; // unlock if drifted
  }

  // ── Capture: pinch and hold for ~0.5s while frame is locked ──
  if (p6LockedBox && !p6SnapTriggered) {
    const anyPinching = p6Hands.some(h => h.lm && h.pinching);
    if (anyPinching) {
      if (p6SnapPinchStartFrame < 0) p6SnapPinchStartFrame = p6FrameCount;
      const held = p6FrameCount - p6SnapPinchStartFrame;
      if (held >= P6_SNAP_MAX_FRAMES) {
        p6SnapTriggered = true;
        p6DoCapture();
      }
    } else {
      p6SnapPinchStartFrame = -1;
    }
  }
}

/* ══════════════════════════
   CAPTURE + FLASH + PREVIEW
══════════════════════════ */
async function p6DoCapture() {
  if (!p6LockedBox) return;
  p6State = P6_STATE.CAPTURING;

  // 1. Shutter flash
  p6TriggerFlash();

  // 2. Draw mirrored frame to offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = p6W; offscreen.height = p6H;
  const offCtx = offscreen.getContext('2d');
  offCtx.save();
  offCtx.translate(p6W, 0);
  offCtx.scale(-1, 1);
  offCtx.drawImage(p6Video, 0, 0, p6W, p6H);
  offCtx.restore();

  // 3. Crop locked box
  const { x, y, w, h } = p6LockedBox;
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), p6W - cx);
  const ch = Math.min(Math.round(h), p6H - cy);

  const imgData = offCtx.getImageData(cx, cy, cw, ch);
  const tmp = document.createElement('canvas');
  tmp.width = imgData.width; tmp.height = imgData.height;
  tmp.getContext('2d').putImageData(imgData, 0, 0);

  p6CapturedImage = await createImageBitmap(tmp);
  p6PreviewDataURL = tmp.toDataURL('image/jpeg', 0.85);

  // 4. Show preview card for 1.8s, then countdown
  p6ShowPreview();
}

function p6TriggerFlash() {
  const flashEl = document.getElementById('p6-flash');
  if (!flashEl) return;
  flashEl.style.transition = 'none';
  flashEl.style.opacity = '1';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flashEl.style.transition = 'opacity 0.55s ease-out';
      flashEl.style.opacity = '0';
    });
  });
}

function p6ShowPreview() {
  const wrap = document.getElementById('p6-preview-wrap');
  const img  = document.getElementById('p6-preview-img');
  if (!wrap || !img) { p6ShowState(P6_STATE.COUNTDOWN); return; }
  img.src = p6PreviewDataURL;
  wrap.style.display = 'flex';
  setTimeout(() => { wrap.style.display = 'none'; p6ShowState(P6_STATE.COUNTDOWN); }, 1800);
}

/* ══════════════════════════
   PUZZLE SETUP
══════════════════════════ */
function p6StartPuzzle() {
  p6PiecesPlaced = 0;
  p6DragPiece = null;
  p6DragHandIdx = -1;

  const maxDim = Math.min(p6W, p6H) * 0.58;
  const aspect = p6CapturedImage.width / p6CapturedImage.height;
  let boardW, boardH;
  if (aspect >= 1) { boardW = maxDim; boardH = maxDim / aspect; }
  else             { boardH = maxDim; boardW = maxDim * aspect; }

  p6BoardW = boardW; p6BoardH = boardH;
  p6BoardX = (p6W - boardW) / 2;
  p6BoardY = (p6H - boardH) / 2 + 20;

  const pw = boardW / P6_GRID;
  const ph = boardH / P6_GRID;

  // Scatter pieces around screen edges in clusters
  p6Pieces = [];
  const zones = [
    { zx: p6W * 0.08,  zy: p6H * 0.15 },   // top-left
    { zx: p6W * 0.50,  zy: p6H * 0.06 },   // top-center
    { zx: p6W * 0.88,  zy: p6H * 0.15 },   // top-right
    { zx: p6W * 0.08,  zy: p6H * 0.82 },   // bot-left
    { zx: p6W * 0.50,  zy: p6H * 0.90 },   // bot-center
    { zx: p6W * 0.88,  zy: p6H * 0.82 },   // bot-right
    { zx: p6W * 0.04,  zy: p6H * 0.50 },   // mid-left
    { zx: p6W * 0.92,  zy: p6H * 0.38 },   // mid-right
    { zx: p6W * 0.92,  zy: p6H * 0.62 },   // mid-right-2
  ];

  // Shuffle zones so pieces aren't always in same spot
  for (let i = zones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }

  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      const zone = zones[id % zones.length];
      const jitter = Math.min(pw, ph) * 0.3;
      const tx = zone.zx + (Math.random() - 0.5) * jitter * 2;
      const ty = zone.zy + (Math.random() - 0.5) * jitter * 2;
      p6Pieces.push({
        id, col, row,
        x: Math.max(10, Math.min(p6W - pw - 10, tx - pw/2)),
        y: Math.max(80, Math.min(p6H - ph - 10, ty - ph/2)),
        w: pw, h: ph,
        placed: false, dragging: false,
        snapX: p6BoardX + col * pw,
        snapY: p6BoardY + row * ph,
        // Small random rotation offset (visual only, doesn't affect hit test)
        rot: (Math.random() - 0.5) * 0.18,
      });
    }
  }

  p6TimeLeft = 90;
  document.getElementById('p6-hud').style.display = 'flex';
  document.getElementById('p6-hud-timer').textContent = '1:30';
  document.getElementById('p6-hud-timer').className = 'p6-hud-val';
  document.getElementById('p6-hud-pieces').textContent = '0/' + P6_TOTAL;

  clearInterval(p6TimerInterval);
  p6TimerInterval = setInterval(() => {
    p6TimeLeft--;
    const m = Math.floor(p6TimeLeft / 60), s = p6TimeLeft % 60;
    document.getElementById('p6-hud-timer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (p6TimeLeft <= 5)  document.getElementById('p6-hud-timer').className = 'p6-hud-val danger';
    else if (p6TimeLeft <= 20) document.getElementById('p6-hud-timer').className = 'p6-hud-val warning';
    if (p6TimeLeft <= 0)  { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.LOSE); }
  }, 1000);
}

/* ══════════════════════════
   PUZZLE HAND CONTROLS
══════════════════════════ */
const SNAP_RADIUS = 60;

function p6HandlePuzzleMode() {
  p6Hands.forEach((h, hi) => {
    if (!h.lm) return;
    const nowPinch = h.pinching;

    if (nowPinch && !h.lastPinch && h.cooldown <= 0 && p6DragPiece === null) {
      const hit = p6PieceAt(h.cx, h.cy);
      if (hit && !hit.placed) {
        p6DragPiece = hit;
        p6DragHandIdx = hi;
        hit.dragging = true;
        // Bring to front
        p6Pieces.splice(p6Pieces.indexOf(hit), 1);
        p6Pieces.push(hit);
        h.cooldown = 10;
      }
    }

    if (p6DragPiece && p6DragHandIdx === hi) {
      p6DragPiece.x = h.cx - p6DragPiece.w / 2;
      p6DragPiece.y = h.cy - p6DragPiece.h / 2;

      if (!nowPinch && h.lastPinch) {
        p6TrySnap(p6DragPiece);
        p6DragPiece.dragging = false;
        p6DragPiece = null;
        p6DragHandIdx = -1;
        h.cooldown = 12;
      }
    }

    h.lastPinch = nowPinch;
  });
}

function p6PieceAt(cx, cy) {
  for (let i = p6Pieces.length - 1; i >= 0; i--) {
    const p = p6Pieces[i];
    if (p.placed) continue;
    if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) return p;
  }
  return null;
}

function p6TrySnap(piece) {
  const cx = piece.x + piece.w / 2, cy = piece.y + piece.h / 2;
  const snapCx = piece.snapX + piece.w / 2, snapCy = piece.snapY + piece.h / 2;
  if (Math.hypot(cx - snapCx, cy - snapCy) < SNAP_RADIUS) {
    piece.x = piece.snapX; piece.y = piece.snapY;
    piece.placed = true; piece.rot = 0;
    p6PiecesPlaced++;
    document.getElementById('p6-hud-pieces').textContent = p6PiecesPlaced + '/' + P6_TOTAL;
    if (p6PiecesPlaced === P6_TOTAL) {
      clearInterval(p6TimerInterval);
      setTimeout(() => p6ShowState(P6_STATE.WIN), 500);
    }
  }
}

/* ══════════════════════════
   RENDER LOOP
══════════════════════════ */
function p6RenderLoop() {
  if (!document.getElementById('page6').classList.contains('active')) {
    requestAnimationFrame(p6RenderLoop); return;
  }

  // Draw mirrored camera feed
  p6Ctx.clearRect(0, 0, p6W, p6H);
  if (p6Video.readyState >= 2) {
    p6Ctx.save();
    p6Ctx.translate(p6W, 0);
    p6Ctx.scale(-1, 1);
    p6Ctx.drawImage(p6Video, 0, 0, p6W, p6H);
    p6Ctx.restore();
  }

  p6OCtx.clearRect(0, 0, p6W, p6H);

  if (p6State === P6_STATE.FRAME)  { p6DrawFrameMode(); p6DrawNeonHands(); }
  if (p6State === P6_STATE.PUZZLE) { p6DrawPuzzle(); p6DrawNeonHands(); }

  requestAnimationFrame(p6RenderLoop);
}

/* ══════════════════════════
   FRAME MODE DRAW
══════════════════════════ */
function p6DrawFrameMode() {
  if (!p6FrameBox || p6FrameBox.w < 30 || p6FrameBox.h < 30) {
    // No hands — show hint
    p6OCtx.save();
    p6OCtx.fillStyle = 'rgba(255,255,255,0.85)';
    p6OCtx.font = `600 ${Math.round(p6W/60)}px 'Manrope'`;
    p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'middle';
    p6OCtx.fillText('Show both hands to make a frame 🤳', p6W/2, p6H - 70);
    p6OCtx.restore();
    return;
  }

  const { x, y, w, h } = p6FrameBox;
  const stableProgress = Math.min(1, p6FrameStableFrames / P6_STABLE_NEEDED);
  const isLocked = p6LockedBox !== null;

  // Dark vignette outside frame
  p6OCtx.save();
  p6OCtx.fillStyle = 'rgba(0,0,0,0.48)';
  p6OCtx.fillRect(0, 0, p6W, p6H);
  p6OCtx.clearRect(x, y, w, h);
  p6OCtx.restore();

  // Frame border — animated dashes when not locked, solid green when locked
  p6OCtx.save();
  if (isLocked) {
    p6OCtx.strokeStyle = 'rgba(39,207,120,0.95)';
    p6OCtx.lineWidth = 2.5;
    p6OCtx.setLineDash([]);
  } else {
    p6OCtx.strokeStyle = `rgba(255,255,255,${0.4 + stableProgress * 0.5})`;
    p6OCtx.lineWidth = 2;
    // Animated march dash
    const dashOffset = (p6FrameCount * 1.5) % 20;
    p6OCtx.setLineDash([10, 10]);
    p6OCtx.lineDashOffset = -dashOffset;
  }
  p6OCtx.strokeRect(x, y, w, h);
  p6OCtx.setLineDash([]);
  p6OCtx.restore();

  // Corner L-brackets
  const cLen = 22;
  p6OCtx.save();
  p6OCtx.strokeStyle = isLocked ? 'rgba(39,207,120,1)' : `rgba(255,255,255,${0.7 + stableProgress*0.3})`;
  p6OCtx.lineWidth = isLocked ? 4 : 3;
  p6OCtx.lineCap = 'round';
  const corners = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
  const dirs    = [[1,1],[-1,1],[1,-1],[-1,-1]];
  corners.forEach(([cx2,cy2], i) => {
    const [dx,dy] = dirs[i];
    p6OCtx.beginPath();
    p6OCtx.moveTo(cx2+dx*cLen, cy2);
    p6OCtx.lineTo(cx2, cy2);
    p6OCtx.lineTo(cx2, cy2+dy*cLen);
    p6OCtx.stroke();
  });
  p6OCtx.restore();

  // Pinch-hold progress arc + status label
  const holdProgress = (p6SnapPinchStartFrame >= 0)
    ? Math.min(1, (p6FrameCount - p6SnapPinchStartFrame) / P6_SNAP_MAX_FRAMES)
    : 0;

  if (isLocked && holdProgress > 0) {
    // Progress ring at center of frame
    const arcX = x + w/2, arcY = y + h/2;
    p6OCtx.save();
    p6OCtx.beginPath();
    p6OCtx.arc(arcX, arcY, 36, -Math.PI/2, -Math.PI/2 + Math.PI*2*holdProgress);
    p6OCtx.strokeStyle = 'rgba(39,207,120,0.95)';
    p6OCtx.lineWidth = 6; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
    // Inner fill
    p6OCtx.beginPath();
    p6OCtx.arc(arcX, arcY, 28, 0, Math.PI*2);
    p6OCtx.fillStyle = `rgba(39,207,120,${0.15 + holdProgress * 0.25})`;
    p6OCtx.fill();
    p6OCtx.restore();
  }

  p6OCtx.save();
  p6OCtx.font = `700 ${Math.round(p6W/58)}px 'Manrope'`;
  p6OCtx.textAlign = 'center';
  p6OCtx.textBaseline = 'top';
  if (isLocked && holdProgress > 0) {
    p6OCtx.fillStyle = 'rgba(39,207,120,0.95)';
    p6OCtx.fillText('📸 Capturing…', p6W/2, y + h + 14);
  } else if (isLocked) {
    p6OCtx.fillStyle = 'rgba(39,207,120,0.95)';
    p6OCtx.fillText('✓  Locked! Pinch to capture 🤌', p6W/2, y + h + 14);
  } else {
    p6OCtx.fillStyle = 'rgba(255,255,255,0.85)';
    p6OCtx.fillText('Hold the frame steady…', p6W/2, y + h + 14);
  }
  p6OCtx.restore();
}

/* ══════════════════════════
   NEON HAND SKELETON
══════════════════════════ */
function p6DrawNeonHands() {
  p6Hands.forEach((h, hi) => {
    if (!h.lm) return;
    const pal = hi === 0 ? P6_NEON.hand0 : P6_NEON.hand1;
    const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });

    // Bones
    p6OCtx.save();
    p6OCtx.strokeStyle = pal.bone;
    p6OCtx.lineWidth = 2;
    p6OCtx.lineCap = 'round';
    MP_HAND_CONNECTIONS.forEach(([a, b]) => {
      const pa = toC(h.lm, a), pb = toC(h.lm, b);
      p6OCtx.beginPath();
      p6OCtx.moveTo(pa.x, pa.y);
      p6OCtx.lineTo(pb.x, pb.y);
      p6OCtx.stroke();
    });
    p6OCtx.restore();

    // Joints
    for (let j = 0; j < 21; j++) {
      const pt = toC(h.lm, j);
      const isTip = [4,8,12,16,20].includes(j);
      const r = isTip ? 5 : 3;
      p6OCtx.beginPath();
      p6OCtx.arc(pt.x, pt.y, r, 0, Math.PI*2);
      p6OCtx.fillStyle = pal.joint;
      p6OCtx.fill();
    }

    // Pinch indicator between index tip (8) and thumb tip (4)
    const idx8 = toC(h.lm, 8);
    const thb4 = toC(h.lm, 4);
    const pf = h.pinchProgress;
    if (pf > 0.3) {
      p6OCtx.save();
      p6OCtx.strokeStyle = pal.pinch;
      p6OCtx.lineWidth = 2 + pf * 2;
      p6OCtx.globalAlpha = 0.4 + pf * 0.6;
      p6OCtx.setLineDash([4,4]);
      p6OCtx.beginPath();
      p6OCtx.moveTo(idx8.x, idx8.y);
      p6OCtx.lineTo(thb4.x, thb4.y);
      p6OCtx.stroke();
      p6OCtx.setLineDash([]);
      p6OCtx.restore();

      // Glow circle at pinch midpoint
      const mid = { x: (idx8.x+thb4.x)/2, y: (idx8.y+thb4.y)/2 };
      const grad = p6OCtx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, 20*pf);
      grad.addColorStop(0, `${pal.pinch.replace('1)', `${pf*0.8})`).replace('255,1)', `255,${pf*0.8})`)}`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      p6OCtx.beginPath();
      p6OCtx.arc(mid.x, mid.y, 20*pf, 0, Math.PI*2);
      p6OCtx.fillStyle = grad;
      p6OCtx.fill();
    }
  });
}

/* ══════════════════════════
   PUZZLE DRAW
══════════════════════════ */
function p6DrawPuzzle() {
  if (!p6CapturedImage) return;
  const pw = p6BoardW / P6_GRID;
  const ph = p6BoardH / P6_GRID;

  // Board ghost slots
  p6OCtx.save();
  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      if (p6Pieces[id] && p6Pieces[id].placed) continue;
      const sx = p6BoardX + col*pw, sy = p6BoardY + row*ph;
      // Subtle image ghost in empty slot
      p6OCtx.globalAlpha = 0.18;
      const srcX = (col/P6_GRID)*p6CapturedImage.width;
      const srcY = (row/P6_GRID)*p6CapturedImage.height;
      const srcW = p6CapturedImage.width/P6_GRID;
      const srcH = p6CapturedImage.height/P6_GRID;
      p6OCtx.drawImage(p6CapturedImage, srcX, srcY, srcW, srcH, sx, sy, pw, ph);
      p6OCtx.globalAlpha = 1;
      p6OCtx.strokeStyle = 'rgba(255,255,255,0.22)';
      p6OCtx.lineWidth = 1.5;
      p6OCtx.strokeRect(sx, sy, pw, ph);
    }
  }
  p6OCtx.restore();

  // Pieces — non-dragging first, then dragging on top
  p6Pieces.forEach(piece => { if (!piece.dragging) p6DrawPiece(piece); });
  if (p6DragPiece) p6DrawPiece(p6DragPiece);
}

function p6DrawPiece(piece) {
  const { col, row, x, y, w, h, placed, dragging, rot } = piece;
  p6OCtx.save();

  // Apply rotation for scattered pieces (not placed)
  if (!placed && !dragging && rot) {
    const cx2 = x + w/2, cy2 = y + h/2;
    p6OCtx.translate(cx2, cy2);
    p6OCtx.rotate(rot);
    p6OCtx.translate(-cx2, -cy2);
  }

  // Shadow for dragging
  if (dragging) {
    p6OCtx.shadowColor = 'rgba(39,127,83,0.65)';
    p6OCtx.shadowBlur = 22;
    p6OCtx.shadowOffsetY = 4;
  }

  // Clip & draw image
  p6OCtx.beginPath();
  p6OCtx.roundRect ? p6OCtx.roundRect(x, y, w, h, placed ? 0 : 4) : p6OCtx.rect(x, y, w, h);
  p6OCtx.clip();

  const srcX = (col/P6_GRID)*p6CapturedImage.width;
  const srcY = (row/P6_GRID)*p6CapturedImage.height;
  const srcW = p6CapturedImage.width/P6_GRID;
  const srcH = p6CapturedImage.height/P6_GRID;
  p6OCtx.drawImage(p6CapturedImage, srcX, srcY, srcW, srcH, x, y, w, h);

  // Border
  p6OCtx.strokeStyle = placed ? 'rgba(39,207,120,0.9)' : (dragging ? '#2CF07A' : 'rgba(255,255,255,0.45)');
  p6OCtx.lineWidth = placed ? 2.5 : 1.5;
  p6OCtx.strokeRect(x, y, w, h);

  // Placed checkmark badge
  if (placed) {
    p6OCtx.fillStyle = 'rgba(39,187,100,0.9)';
    p6OCtx.beginPath(); p6OCtx.arc(x+w-14, y+14, 11, 0, Math.PI*2); p6OCtx.fill();
    p6OCtx.strokeStyle = '#fff'; p6OCtx.lineWidth = 2.5; p6OCtx.lineCap = 'round';
    p6OCtx.beginPath();
    p6OCtx.moveTo(x+w-19, y+14);
    p6OCtx.lineTo(x+w-14, y+19);
    p6OCtx.lineTo(x+w-8,  y+9);
    p6OCtx.stroke();
  }

  p6OCtx.restore();
}

/* ══════════════════════════
   WIN / LOSE
══════════════════════════ */
function p6ShowWin() {
  document.getElementById('p6-hud').style.display = 'none';
  document.getElementById('p6-win-wrap').style.display = 'flex';
}
function p6ShowLose() {
  document.getElementById('p6-hud').style.display = 'none';
  document.getElementById('p6-lose-pieces').textContent = p6PiecesPlaced;
  const inline = document.getElementById('p6-lose-pieces-inline');
  if (inline) inline.textContent = p6PiecesPlaced;
  document.getElementById('p6-lose-wrap').style.display = 'flex';
}

/* ══════════════════════════
   NAVIGATION
══════════════════════════ */
function p6GoIntro()      { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.INTRO); }
function p6GoHowto()      { p6ShowState(P6_STATE.HOWTO); }
function p6GoCountdown()  { p6ShowState(P6_STATE.FRAME); }
function p6CaptureAgain() { clearInterval(p6TimerInterval); document.getElementById('p6-hud').style.display='none'; p6ShowState(P6_STATE.FRAME); }
function p6PlayAgain()    { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.FRAME); }
function p6ForceExit()    { clearInterval(p6TimerInterval); goTo('page2'); }

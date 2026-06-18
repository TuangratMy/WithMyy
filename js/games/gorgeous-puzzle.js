/* ══════════════════════════════════════════════
   PAGE 6 — GORGEOUS PUZZLE ENGINE
   Flow: L-shape frame (hold steady to lock) → both-hand pinch hold to capture
         → 3-2-1 countdown → puzzle (snap pieces, keep captured aspect ratio)
══════════════════════════════════════════════ */

let p6Video, p6Canvas, p6Ctx, p6Overlay, p6OCtx;
let p6W = 0, p6H = 0, p6Started = false;

let p6HandsMp, p6Camera6;

const P6_STATE = { INTRO:'intro', HOWTO:'howto', FRAME:'frame', LOCKED:'locked', CAPTURING:'capturing', COUNTDOWN:'countdown', PUZZLE:'puzzle', WIN:'win', LOSE:'lose' };
let p6State = P6_STATE.INTRO;
let p6TimeLeft = 60, p6TimerInterval = null;
let p6PiecesPlaced = 0;
const P6_GRID = 3;
const P6_TOTAL = P6_GRID * P6_GRID;

let p6CapturedImage = null; // ImageBitmap, keeps original frame aspect ratio

let p6Pieces = [];
let p6BoardX = 0, p6BoardY = 0, p6BoardW = 0, p6BoardH = 0;

/* ── Hand smoothing (EMA) ── */
const P6_SMOOTH = 0.45; // higher = snappier, lower = smoother
let p6Hands = [
  { lm:null, rawCx:0, rawCy:0, cx:0, cy:0, pinching:false, lastPinch:false, pinchProgress:0, cooldown:0, smoothInit:false },
  { lm:null, rawCx:0, rawCy:0, cx:0, cy:0, pinching:false, lastPinch:false, pinchProgress:0, cooldown:0, smoothInit:false }
];
let p6DragPiece = null;
let p6DragHandIdx = -1;

/* ── Frame lock state ── */
let p6FrameBox = null;        // current live box {x,y,w,h} while in FRAME state
let p6LockedBox = null;       // box once locked (used for capture + puzzle aspect)
let p6FrameStableFrames = 0;  // how many frames the box has stayed within tolerance
let p6FrameStableRef = null;  // reference box to compare drift against
const P6_STABLE_NEEDED = 150; // ~5s at 30fps
const P6_STABLE_TOLERANCE = 28; // px drift allowed

/* ── Capture confirm (post-lock pinch) ── */
let p6CaptureHoldFrames = 0;
const P6_CAPTURE_HOLD_NEEDED = 15; // short hold ~0.5s at 30fps

/* ── Countdown (now plays AFTER capture, before puzzle) ── */
const p6CountdownSteps = [
  { num:'3', cue:'Get Ready' },
  { num:'2', cue:'Frame your best shot.' },
  { num:'1', cue:'Almost there.' },
  { num:'GO', cue:'Create your puzzle.', go:true },
];

/* ════════════════════════════
   INIT
════════════════════════════ */
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

/* ════════════════════════════
   STATE MACHINE
════════════════════════════ */
function p6ShowState(state) {
  p6State = state;
  const ids = ['p6-intro-wrap','p6-howto-wrap','p6-countdown-wrap','p6-hud','p6-win-wrap','p6-lose-wrap'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  if (state === P6_STATE.INTRO)  { document.getElementById('p6-intro-wrap').style.display = 'flex'; }
  if (state === P6_STATE.HOWTO)  { document.getElementById('p6-howto-wrap').style.display = 'flex'; }
  if (state === P6_STATE.FRAME)  { p6ResetFrameTracking(); }
  if (state === P6_STATE.COUNTDOWN) { p6RunCountdown(); }
  if (state === P6_STATE.PUZZLE) { p6StartPuzzle(); }
  if (state === P6_STATE.WIN)    { p6ShowWin(); }
  if (state === P6_STATE.LOSE)   { p6ShowLose(); }
}

function p6ResetFrameTracking() {
  p6FrameBox = null;
  p6LockedBox = null;
  p6FrameStableFrames = 0;
  p6FrameStableRef = null;
  p6CaptureHoldFrames = 0;
}

/* ════════════════════════════
   COUNTDOWN (plays after capture)
════════════════════════════ */
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
    if (step < p6CountdownSteps.length) { setTimeout(tick, 1000); }
    else { setTimeout(() => { wrap.style.display = 'none'; p6ShowState(P6_STATE.PUZZLE); }, 900); }
  }
  tick();
}

/* ════════════════════════════
   HAND RESULTS
════════════════════════════ */
function p6OnHandResults(results) {
  p6Hands.forEach(h => { h.lm = null; });
  if (results.multiHandLandmarks) {
    results.multiHandLandmarks.forEach((lm, i) => {
      if (i > 1) return;
      const h = p6Hands[i];
      h.lm = lm;
      const toC = (lx, ly) => ({ x: (1 - lx) * p6W, y: ly * p6H });
      const idx = toC(lm[8].x, lm[8].y);
      const thb = toC(lm[4].x, lm[4].y);
      h.rawCx = (idx.x + thb.x) / 2;
      h.rawCy = (idx.y + thb.y) / 2;

      // EMA smoothing for cursor / drag position
      if (!h.smoothInit) { h.cx = h.rawCx; h.cy = h.rawCy; h.smoothInit = true; }
      else {
        h.cx = h.cx + (h.rawCx - h.cx) * P6_SMOOTH;
        h.cy = h.cy + (h.rawCy - h.cy) * P6_SMOOTH;
      }

      const dx = lm[8].x - lm[4].x, dy = lm[8].y - lm[4].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      h.pinchProgress = Math.max(0, Math.min(1, 1 - (dist - 0.045) / 0.03));
      h.pinching = dist < 0.045;
      if (h.cooldown > 0) h.cooldown--;
    });
  }

  if (p6State === P6_STATE.FRAME)  { p6HandleFrameMode(); }
  if (p6State === P6_STATE.LOCKED) { p6HandleLockedMode(); }
  if (p6State === P6_STATE.PUZZLE){ p6HandlePuzzleMode(); }
}

/* ════════════════════════════
   FRAME MODE — build box from wrist/palm anchor (stable point, not fingertips)
   so the box does NOT shrink when the user pinches to confirm.
════════════════════════════ */
function p6HandleFrameMode() {
  const h0 = p6Hands[0], h1 = p6Hands[1];
  if (!h0.lm || !h1.lm) { p6FrameBox = null; p6FrameStableFrames = 0; p6FrameStableRef = null; return; }

  const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });

  // Use the WRIST (landmark 0) of each hand as the frame anchor — this point
  // does not move when thumb/index pinch together, so the box stays put.
  const wrist0 = toC(h0.lm, 0);
  const wrist1 = toC(h1.lm, 0);
  // Also include index fingertip direction so the box still feels hand-shaped,
  // but anchor size primarily on wrist span + a fixed extension toward fingers.
  const idx0 = toC(h0.lm, 8);
  const idx1 = toC(h1.lm, 8);

  const xs = [wrist0.x, wrist1.x, idx0.x, idx1.x];
  const ys = [wrist0.y, wrist1.y, idx0.y, idx1.y];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  p6FrameBox = { x:minX, y:minY, w:maxX - minX, h:maxY - minY };

  // Stability check — compare to reference box, reset if drifted too much
  if (!p6FrameStableRef) {
    p6FrameStableRef = { ...p6FrameBox };
    p6FrameStableFrames = 1;
  } else {
    const drift = Math.abs(p6FrameBox.x - p6FrameStableRef.x) + Math.abs(p6FrameBox.y - p6FrameStableRef.y)
                + Math.abs(p6FrameBox.w - p6FrameStableRef.w) + Math.abs(p6FrameBox.h - p6FrameStableRef.h);
    if (drift < P6_STABLE_TOLERANCE) {
      p6FrameStableFrames++;
    } else {
      p6FrameStableRef = { ...p6FrameBox };
      p6FrameStableFrames = 1;
    }
  }

  if (p6FrameStableFrames >= P6_STABLE_NEEDED && p6FrameBox.w > 80 && p6FrameBox.h > 80) {
    // Lock it in — average the recent box for a clean lock
    p6LockedBox = { ...p6FrameBox };
    p6CaptureHoldFrames = 0;
    p6ShowState(P6_STATE.LOCKED);
  }
}

/* ════════════════════════════
   LOCKED MODE — box is fixed, wait for both-hand pinch hold to capture
════════════════════════════ */
function p6HandleLockedMode() {
  const h0 = p6Hands[0], h1 = p6Hands[1];
  const bothPresent = h0.lm && h1.lm;
  const bothPinching = bothPresent && h0.pinching && h1.pinching;

  if (bothPinching) {
    p6CaptureHoldFrames++;
    if (p6CaptureHoldFrames >= P6_CAPTURE_HOLD_NEEDED) {
      p6CaptureHoldFrames = 0;
      p6DoCapture();
    }
  } else {
    p6CaptureHoldFrames = 0;
  }
}

/* ── Reset back to frame mode if the player wants to re-frame ── */
function p6Reframe() {
  p6LockedBox = null;
  p6ShowState(P6_STATE.FRAME);
}

/* ════════════════════════════
   CAPTURE — uses the LOCKED box, keeps its real aspect ratio
════════════════════════════ */
async function p6DoCapture() {
  if (!p6LockedBox) return;
  p6State = P6_STATE.CAPTURING;

  const offscreen = document.createElement('canvas');
  offscreen.width = p6Canvas.width;
  offscreen.height = p6Canvas.height;
  const offCtx = offscreen.getContext('2d');

  offCtx.save();
  offCtx.translate(p6W, 0);
  offCtx.scale(-1, 1);
  offCtx.drawImage(p6Video, 0, 0, p6W, p6H);
  offCtx.restore();

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

  p6ShowState(P6_STATE.COUNTDOWN);
}

/* ════════════════════════════
   PUZZLE SETUP — board keeps the captured image's real aspect ratio
════════════════════════════ */
function p6StartPuzzle() {
  p6PiecesPlaced = 0;
  p6DragPiece = null;
  p6DragHandIdx = -1;

  // Fit the captured aspect ratio inside ~55% of the shorter screen dimension
  const maxDim = Math.min(p6W, p6H) * 0.6;
  const aspect = p6CapturedImage.width / p6CapturedImage.height;
  let boardW, boardH;
  if (aspect >= 1) { boardW = maxDim; boardH = maxDim / aspect; }
  else { boardH = maxDim; boardW = maxDim * aspect; }

  p6BoardW = boardW; p6BoardH = boardH;
  p6BoardX = (p6W - boardW) / 2;
  p6BoardY = (p6H - boardH) / 2 + 20;

  const pw = boardW / P6_GRID;
  const ph = boardH / P6_GRID;

  p6Pieces = [];
  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      const angle = (id / P6_TOTAL) * Math.PI * 2;
      const radius = Math.max(boardW, boardH) * 0.78;
      const tx = p6W / 2 + Math.cos(angle) * radius - pw / 2;
      const ty = p6H / 2 + Math.sin(angle) * radius - ph / 2;
      p6Pieces.push({
        id, col, row,
        x: tx, y: ty, w: pw, h: ph,
        placed: false, dragging: false,
        snapX: p6BoardX + col * pw,
        snapY: p6BoardY + row * ph,
      });
    }
  }
  p6Pieces.forEach(p => {
    p.x = Math.max(10, Math.min(p6W - pw - 10, p.x + (Math.random() - 0.5) * pw * 0.4));
    p.y = Math.max(80, Math.min(p6H - ph - 10, p.y + (Math.random() - 0.5) * ph * 0.4));
  });

  p6TimeLeft = 60;
  document.getElementById('p6-hud').style.display = 'flex';
  document.getElementById('p6-hud-timer').textContent = '1:00';
  document.getElementById('p6-hud-timer').className = 'p6-hud-val';
  document.getElementById('p6-hud-pieces').textContent = '0/' + P6_TOTAL;

  clearInterval(p6TimerInterval);
  p6TimerInterval = setInterval(() => {
    p6TimeLeft--;
    const m = Math.floor(p6TimeLeft / 60), s = p6TimeLeft % 60;
    document.getElementById('p6-hud-timer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (p6TimeLeft <= 5) document.getElementById('p6-hud-timer').className = 'p6-hud-val danger';
    else if (p6TimeLeft <= 15) document.getElementById('p6-hud-timer').className = 'p6-hud-val warning';
    if (p6TimeLeft <= 0) { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.LOSE); }
  }, 1000);
}

/* ════════════════════════════
   PUZZLE HAND CONTROLS (smoothed cx/cy already EMA'd above)
════════════════════════════ */
const SNAP_RADIUS = 55;

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
  const dist = Math.hypot(cx - snapCx, cy - snapCy);
  if (dist < SNAP_RADIUS) {
    piece.x = piece.snapX; piece.y = piece.snapY; piece.placed = true;
    p6PiecesPlaced++;
    document.getElementById('p6-hud-pieces').textContent = p6PiecesPlaced + '/' + P6_TOTAL;
    if (p6PiecesPlaced === P6_TOTAL) {
      clearInterval(p6TimerInterval);
      setTimeout(() => p6ShowState(P6_STATE.WIN), 500);
    }
  }
}

/* ════════════════════════════
   RENDER LOOP
════════════════════════════ */
function p6RenderLoop() {
  if (!document.getElementById('page6').classList.contains('active')) {
    requestAnimationFrame(p6RenderLoop); return;
  }

  p6Ctx.clearRect(0, 0, p6W, p6H);
  if (p6Video.readyState >= 2) {
    p6Ctx.save();
    p6Ctx.translate(p6W, 0);
    p6Ctx.scale(-1, 1);
    p6Ctx.drawImage(p6Video, 0, 0, p6W, p6H);
    p6Ctx.restore();
  }

  p6OCtx.clearRect(0, 0, p6W, p6H);

  if (p6State === P6_STATE.FRAME)  { p6DrawFrameMode(); p6DrawHandCursors(); }
  if (p6State === P6_STATE.LOCKED) { p6DrawLockedMode(); p6DrawHandCursors(); }
  if (p6State === P6_STATE.PUZZLE) { p6DrawPuzzle(); p6DrawHandCursors(); }

  requestAnimationFrame(p6RenderLoop);
}

/* ── Frame mode overlay (live, box can move freely) ── */
function p6DrawFrameMode() {
  if (!p6FrameBox || p6FrameBox.w < 20 || p6FrameBox.h < 20) {
    p6OCtx.save();
    p6OCtx.fillStyle = 'rgba(255,255,255,0.9)';
    p6OCtx.font = `600 ${Math.round(p6W / 60)}px 'Manrope'`;
    p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'middle';
    p6OCtx.fillText('Show both hands — make an L-shape with thumb + index', p6W / 2, p6H - 60);
    p6OCtx.restore();
    return;
  }
  const { x, y, w, h } = p6FrameBox;

  p6OCtx.save();
  p6OCtx.fillStyle = 'rgba(0,0,0,0.45)';
  p6OCtx.fillRect(0, 0, p6W, p6H);
  p6OCtx.clearRect(x, y, w, h);
  p6OCtx.restore();

  const stableProgress = Math.min(1, p6FrameStableFrames / P6_STABLE_NEEDED);
  const frameColor = `rgba(39,127,83,${0.6 + stableProgress * 0.4})`;

  p6OCtx.save();
  p6OCtx.strokeStyle = frameColor;
  p6OCtx.lineWidth = 3;
  p6OCtx.strokeRect(x, y, w, h);

  const cLen = 24;
  const corners = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
  const dirs = [[1,1],[-1,1],[1,-1],[-1,-1]];
  p6OCtx.lineWidth = 4;
  corners.forEach(([cx,cy], i) => {
    const [dx,dy] = dirs[i];
    p6OCtx.beginPath(); p6OCtx.moveTo(cx+dx*cLen, cy); p6OCtx.lineTo(cx,cy); p6OCtx.lineTo(cx, cy+dy*cLen); p6OCtx.stroke();
  });

  // Stability progress ring at center
  if (stableProgress > 0) {
    const arcX = x + w/2, arcY = y + h/2;
    p6OCtx.beginPath();
    p6OCtx.arc(arcX, arcY, 30, -Math.PI/2, -Math.PI/2 + Math.PI*2*stableProgress);
    p6OCtx.strokeStyle = 'rgba(39,127,83,0.95)';
    p6OCtx.lineWidth = 5; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
  }

  p6OCtx.fillStyle = 'rgba(255,255,255,0.95)';
  p6OCtx.font = `600 ${Math.round(p6W/65)}px 'Manrope'`;
  p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'top';
  p6OCtx.fillText('Hold the frame steady…', p6W/2, y + h + 14);
  p6OCtx.restore();
}

/* ── Locked mode overlay (box fixed, waiting for pinch-hold) ── */
function p6DrawLockedMode() {
  if (!p6LockedBox) return;
  const { x, y, w, h } = p6LockedBox;

  p6OCtx.save();
  p6OCtx.fillStyle = 'rgba(0,0,0,0.45)';
  p6OCtx.fillRect(0, 0, p6W, p6H);
  p6OCtx.clearRect(x, y, w, h);
  p6OCtx.restore();

  p6OCtx.save();
  p6OCtx.strokeStyle = 'rgba(252,202,89,0.95)';
  p6OCtx.lineWidth = 3.5;
  p6OCtx.setLineDash([10,6]);
  p6OCtx.strokeRect(x, y, w, h);
  p6OCtx.setLineDash([]);

  const holdProgress = Math.min(1, p6CaptureHoldFrames / P6_CAPTURE_HOLD_NEEDED);
  if (holdProgress > 0) {
    const arcX = x + w/2, arcY = y + h/2;
    p6OCtx.beginPath();
    p6OCtx.arc(arcX, arcY, 30, -Math.PI/2, -Math.PI/2 + Math.PI*2*holdProgress);
    p6OCtx.strokeStyle = 'rgba(39,127,83,0.95)';
    p6OCtx.lineWidth = 5; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
  }

  p6OCtx.fillStyle = '#fff';
  p6OCtx.font = `bold ${Math.round(p6W/45)}px 'Manrope'`;
  p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'top';
  p6OCtx.fillText('Good to go! Pinch it! 🤏', p6W/2, y + h + 14);
  p6OCtx.restore();
}

/* ── Puzzle draw ── */
function p6DrawPuzzle() {
  if (!p6CapturedImage) return;
  const pw = p6BoardW / P6_GRID;
  const ph = p6BoardH / P6_GRID;

  p6OCtx.save();
  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      const piece = p6Pieces[id];
      if (piece && piece.placed) continue;
      p6OCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      p6OCtx.lineWidth = 1.5;
      p6OCtx.strokeRect(p6BoardX + col*pw, p6BoardY + row*ph, pw, ph);
    }
  }
  p6OCtx.restore();

  p6Pieces.forEach(piece => { if (!piece.dragging) p6DrawPiece(piece); });
  if (p6DragPiece) p6DrawPiece(p6DragPiece);
}

function p6DrawPiece(piece) {
  const { col, row, x, y, w, h, placed, dragging } = piece;
  p6OCtx.save();
  if (dragging) { p6OCtx.shadowColor = 'rgba(39,127,83,0.7)'; p6OCtx.shadowBlur = 18; }

  p6OCtx.beginPath();
  p6OCtx.rect(x, y, w, h);
  p6OCtx.clip();

  const srcX = (col / P6_GRID) * p6CapturedImage.width;
  const srcY = (row / P6_GRID) * p6CapturedImage.height;
  const srcW = p6CapturedImage.width / P6_GRID;
  const srcH = p6CapturedImage.height / P6_GRID;
  p6OCtx.drawImage(p6CapturedImage, srcX, srcY, srcW, srcH, x, y, w, h);

  p6OCtx.strokeStyle = placed ? 'rgba(39,127,83,0.8)' : (dragging ? '#267F53' : 'rgba(255,255,255,0.5)');
  p6OCtx.lineWidth = placed ? 2 : 1.5;
  p6OCtx.strokeRect(x, y, w, h);

  if (placed) {
    p6OCtx.fillStyle = 'rgba(39,127,83,0.85)';
    p6OCtx.beginPath(); p6OCtx.arc(x+w-14, y+14, 11, 0, Math.PI*2); p6OCtx.fill();
    p6OCtx.strokeStyle = '#fff'; p6OCtx.lineWidth = 2.5; p6OCtx.lineCap = 'round';
    p6OCtx.beginPath(); p6OCtx.moveTo(x+w-19, y+14); p6OCtx.lineTo(x+w-14, y+19); p6OCtx.lineTo(x+w-8, y+9); p6OCtx.stroke();
  }
  p6OCtx.restore();
}

/* ── Hand cursors (smoothed) ── */
function p6DrawHandCursors() {
  p6Hands.forEach(h => {
    if (!h.lm) return;
    const pf = h.pinchProgress;
    const toC = (lm, idx) => ({ x:(1-lm[idx].x)*p6W, y:lm[idx].y*p6H });
    const idx = toC(h.lm, 8);
    const thb = toC(h.lm, 4);

    p6OCtx.beginPath(); p6OCtx.moveTo(idx.x, idx.y); p6OCtx.lineTo(thb.x, thb.y);
    p6OCtx.strokeStyle = `rgba(255,255,255,${0.2+pf*0.5})`; p6OCtx.lineWidth = 2; p6OCtx.setLineDash([4,4]); p6OCtx.stroke(); p6OCtx.setLineDash([]);

    [idx, thb].forEach(tip => {
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 20, 0, Math.PI*2);
      p6OCtx.fillStyle = `rgba(39,127,83,${0.1+pf*0.3})`; p6OCtx.fill();
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 20, -Math.PI/2, -Math.PI/2+Math.PI*2*pf);
      p6OCtx.strokeStyle = pf > 0.85 ? '#267F53' : 'rgba(255,255,255,0.85)'; p6OCtx.lineWidth = 3; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 4, 0, Math.PI*2); p6OCtx.fillStyle = '#fff'; p6OCtx.fill();
    });

    const R = h.pinching ? 15 : 11;
    p6OCtx.beginPath(); p6OCtx.arc(h.cx, h.cy, R, 0, Math.PI*2);
    p6OCtx.fillStyle = h.pinching ? 'rgba(39,127,83,0.9)' : 'rgba(255,255,255,0.8)'; p6OCtx.fill();
    p6OCtx.beginPath(); p6OCtx.arc(h.cx, h.cy, R, 0, Math.PI*2);
    p6OCtx.strokeStyle = h.pinching ? '#267F53' : 'rgba(255,255,255,0.4)'; p6OCtx.lineWidth = 2; p6OCtx.stroke();
  });
}

/* ════════════════════════════
   WIN / LOSE
════════════════════════════ */
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

/* ════════════════════════════
   NAVIGATION
════════════════════════════ */
function p6GoIntro()      { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.INTRO); }
function p6GoHowto()      { p6ShowState(P6_STATE.HOWTO); }
function p6GoCountdown()  { p6ShowState(P6_STATE.FRAME); } // "Ready" now starts frame mode directly
function p6CaptureAgain() { clearInterval(p6TimerInterval); document.getElementById('p6-hud').style.display='none'; p6ShowState(P6_STATE.FRAME); }
function p6PlayAgain()    { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.FRAME); }
function p6ForceExit()    { clearInterval(p6TimerInterval); goTo('page2'); }

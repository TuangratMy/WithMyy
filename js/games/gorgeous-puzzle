/* ══════════════════════════════════════════════
   PAGE 6 — GORGEOUS PUZZLE ENGINE
   Hand tracking: L-shape frame gesture + pinch to capture & drag pieces
══════════════════════════════════════════════ */

let p6Video, p6Canvas, p6Ctx, p6Overlay, p6OCtx;
let p6W = 0, p6H = 0, p6Started = false;

/* ── MediaPipe ── */
let p6HandsMp, p6Camera6;

/* ── Game state ── */
const P6_STATE = { INTRO: 'intro', HOWTO: 'howto', COUNTDOWN: 'countdown', FRAME: 'frame', PUZZLE: 'puzzle', WIN: 'win', LOSE: 'lose' };
let p6State = P6_STATE.INTRO;
let p6TimeLeft = 60, p6TimerInterval = null;
let p6PiecesPlaced = 0;
const P6_GRID = 3; // 3x3
const P6_TOTAL = P6_GRID * P6_GRID;

/* ── Captured image ── */
let p6CapturedImage = null; // ImageBitmap

/* ── Puzzle pieces ── */
let p6Pieces = [];       // { id, col, row, x, y, w, h, placed, dragging }
let p6BoardX = 0, p6BoardY = 0, p6BoardSize = 0;
let p6TrayPieces = [];   // layout refs

/* ── Hand state ── */
let p6Hands = [
  { lm: null, pinching: false, lastPinch: false, cx: 0, cy: 0, pinchProgress: 0, cooldown: 0 },
  { lm: null, pinching: false, lastPinch: false, cx: 0, cy: 0, pinchProgress: 0, cooldown: 0 }
];
let p6DragPiece = null;
let p6DragHandIdx = -1;

/* ── Frame corners (for capture mode) ── */
let p6FrameCorners = null; // { tl, tr, bl, br } in canvas coords
let p6PinchBothFrames = 0; // frames both hands pinched
const P6_CAPTURE_HOLD = 18; // frames to hold pinch before capture

/* ── Countdown ── */
const p6CountdownSteps = [
  { num: '3', cue: 'Get Ready' },
  { num: '2', cue: 'Frame your best shot.' },
  { num: '1', cue: 'Almost there.' },
  { num: 'GO', cue: 'Create your puzzle.', go: true },
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
  p6HandsMp.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
  p6HandsMp.onResults(p6OnHandResults);

  p6Camera6 = new Camera(p6Video, {
    onFrame: async () => { await p6HandsMp.send({ image: p6Video }); },
    width: 1280, height: 720
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
  const ids = ['p6-intro-wrap', 'p6-howto-wrap', 'p6-countdown-wrap', 'p6-hud', 'p6-win-wrap', 'p6-lose-wrap'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  if (state === P6_STATE.INTRO)     { document.getElementById('p6-intro-wrap').style.display = 'flex'; }
  if (state === P6_STATE.HOWTO)     { document.getElementById('p6-howto-wrap').style.display = 'flex'; }
  if (state === P6_STATE.COUNTDOWN) { p6RunCountdown(); }
  if (state === P6_STATE.FRAME)     { /* overlay only, no card */ }
  if (state === P6_STATE.PUZZLE)    { p6StartPuzzle(); }
  if (state === P6_STATE.WIN)       { p6ShowWin(); }
  if (state === P6_STATE.LOSE)      { p6ShowLose(); }
}

/* ════════════════════════════
   COUNTDOWN
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
    else { setTimeout(() => { wrap.style.display = 'none'; p6ShowState(P6_STATE.FRAME); }, 900); }
  }
  tick();
}

/* ════════════════════════════
   HAND RESULTS
════════════════════════════ */
function p6OnHandResults(results) {
  p6Hands.forEach(h => { h.lm = null; });
  if (!results.multiHandLandmarks) return;
  results.multiHandLandmarks.forEach((lm, i) => {
    if (i > 1) return;
    const h = p6Hands[i];
    h.lm = lm;
    const toC = (lx, ly) => ({ x: (1 - lx) * p6W, y: ly * p6H });
    const idx = toC(lm[8].x, lm[8].y);
    const thb = toC(lm[4].x, lm[4].y);
    h.cx = (idx.x + thb.x) / 2;
    h.cy = (idx.y + thb.y) / 2;
    const dx = lm[8].x - lm[4].x, dy = lm[8].y - lm[4].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    h.pinchProgress = Math.max(0, Math.min(1, 1 - (dist - 0.045) / 0.03));
    const nowPinch = dist < 0.045;
    h.pinching = nowPinch;
    if (h.cooldown > 0) h.cooldown--;
  });

  if (p6State === P6_STATE.FRAME) { p6HandleFrameMode(); }
  if (p6State === P6_STATE.PUZZLE) { p6HandlePuzzleMode(); }
}

/* ── Detect L-shape (thumb+index up, others folded) ── */
function p6IsLShape(lm) {
  if (!lm) return false;
  // index tip (8) above pip (6), thumb tip (4) far from index base (5)
  const indexUp = lm[8].y < lm[6].y;
  const middleFolded = lm[12].y > lm[10].y;
  const ringFolded   = lm[16].y > lm[14].y;
  const pinkyFolded  = lm[20].y > lm[18].y;
  return indexUp && middleFolded && ringFolded && pinkyFolded;
}

/* ════════════════════════════
   FRAME MODE
════════════════════════════ */
function p6HandleFrameMode() {
  const h0 = p6Hands[0], h1 = p6Hands[1];
  if (!h0.lm || !h1.lm) { p6FrameCorners = null; p6PinchBothFrames = 0; return; }

  const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });

  // L-shape: use thumb tip of each hand as one corner, index tip as other
  const thumb0  = toC(h0.lm, 4);
  const index0  = toC(h0.lm, 8);
  const thumb1  = toC(h1.lm, 4);
  const index1  = toC(h1.lm, 8);

  // Build bounding box from all 4 fingertips
  const xs = [thumb0.x, index0.x, thumb1.x, index1.x];
  const ys = [thumb0.y, index0.y, thumb1.y, index1.y];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  p6FrameCorners = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

  // Capture: both hands pinching
  const bothPinching = h0.pinching && h1.pinching;
  if (bothPinching) {
    p6PinchBothFrames++;
    if (p6PinchBothFrames >= P6_CAPTURE_HOLD) {
      p6PinchBothFrames = 0;
      p6CaptureFrame();
    }
  } else {
    p6PinchBothFrames = 0;
  }
}

async function p6CaptureFrame() {
  if (!p6FrameCorners || p6FrameCorners.w < 60 || p6FrameCorners.h < 60) return;

  // Draw current video frame to offscreen canvas, capture region
  const offscreen = document.createElement('canvas');
  offscreen.width = p6Canvas.width;
  offscreen.height = p6Canvas.height;
  const offCtx = offscreen.getContext('2d');

  // Mirror video onto offscreen (same as render)
  offCtx.save();
  offCtx.translate(p6W, 0);
  offCtx.scale(-1, 1);
  offCtx.drawImage(p6Video, 0, 0, p6W, p6H);
  offCtx.restore();

  const { x, y, w, h } = p6FrameCorners;
  const imgData = offCtx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(w, p6W - x), Math.min(h, p6H - y));
  const tmp = document.createElement('canvas');
  tmp.width = imgData.width; tmp.height = imgData.height;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  p6CapturedImage = await createImageBitmap(tmp);

  p6ShowState(P6_STATE.PUZZLE);
}

/* ════════════════════════════
   PUZZLE SETUP
════════════════════════════ */
function p6StartPuzzle() {
  p6PiecesPlaced = 0;
  p6DragPiece = null;
  p6DragHandIdx = -1;

  // Board: centered square, 55% of shorter dimension
  const size = Math.min(p6W, p6H) * 0.52;
  p6BoardSize = size;
  p6BoardX = (p6W - size) / 2;
  p6BoardY = (p6H - size) / 2 + 20;

  const pw = size / P6_GRID;
  const ph = size / P6_GRID;

  // Create pieces
  p6Pieces = [];
  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      // Tray: scatter around outside board in a circle
      const angle = (id / P6_TOTAL) * Math.PI * 2;
      const radius = size * 0.72;
      const tx = p6W / 2 + Math.cos(angle) * radius - pw / 2;
      const ty = p6H / 2 + Math.sin(angle) * radius - ph / 2;
      p6Pieces.push({
        id, col, row,
        x: tx, y: ty,
        w: pw, h: ph,
        placed: false,
        dragging: false,
        snapX: p6BoardX + col * pw,
        snapY: p6BoardY + row * ph,
      });
    }
  }
  // Shuffle tray positions a bit
  p6Pieces.forEach(p => {
    if (!p.placed) {
      p.x += (Math.random() - 0.5) * pw * 0.4;
      p.y += (Math.random() - 0.5) * ph * 0.4;
      // Clamp inside screen
      p.x = Math.max(10, Math.min(p6W - pw - 10, p.x));
      p.y = Math.max(80, Math.min(p6H - ph - 10, p.y));
    }
  });

  // Timer
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
   PUZZLE HAND CONTROLS
════════════════════════════ */
const SNAP_RADIUS = 55;

function p6HandlePuzzleMode() {
  p6Hands.forEach((h, hi) => {
    if (!h.lm) return;
    const nowPinch = h.pinching;

    // Pinch START → pick up piece
    if (nowPinch && !h.lastPinch && h.cooldown <= 0 && p6DragPiece === null) {
      const hit = p6PieceAt(h.cx, h.cy);
      if (hit && !hit.placed) {
        p6DragPiece = hit;
        p6DragHandIdx = hi;
        hit.dragging = true;
        h.cooldown = 10;
      }
    }

    // Dragging
    if (p6DragPiece && p6DragHandIdx === hi) {
      p6DragPiece.x = h.cx - p6DragPiece.w / 2;
      p6DragPiece.y = h.cy - p6DragPiece.h / 2;

      // Pinch RELEASE → try snap
      if (!nowPinch && h.lastPinch) {
        p6TrySnap(p6DragPiece);
        p6DragPiece.dragging = false;
        p6DragPiece = null;
        p6DragHandIdx = -1;
        h.cooldown = 12;
      }
    }

    h.lastPinch = nowPinch;
    if (h.cooldown > 0) h.cooldown--;
  });
}

function p6PieceAt(cx, cy) {
  // Check in reverse so top-rendered pieces hit first
  for (let i = p6Pieces.length - 1; i >= 0; i--) {
    const p = p6Pieces[i];
    if (p.placed) continue;
    if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) return p;
  }
  return null;
}

function p6TrySnap(piece) {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  const snapCx = piece.snapX + piece.w / 2;
  const snapCy = piece.snapY + piece.h / 2;
  const dist = Math.hypot(cx - snapCx, cy - snapCy);
  if (dist < SNAP_RADIUS) {
    piece.x = piece.snapX;
    piece.y = piece.snapY;
    piece.placed = true;
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

  // Draw mirrored video to main canvas
  p6Ctx.clearRect(0, 0, p6W, p6H);
  if (p6Video.readyState >= 2) {
    p6Ctx.save();
    p6Ctx.translate(p6W, 0);
    p6Ctx.scale(-1, 1);
    p6Ctx.drawImage(p6Video, 0, 0, p6W, p6H);
    p6Ctx.restore();
  }

  p6OCtx.clearRect(0, 0, p6W, p6H);

  if (p6State === P6_STATE.FRAME) { p6DrawFrameMode(); }
  if (p6State === P6_STATE.PUZZLE) { p6DrawPuzzle(); }

  p6DrawHandCursors();
  requestAnimationFrame(p6RenderLoop);
}

/* ── Frame mode overlay ── */
function p6DrawFrameMode() {
  if (!p6FrameCorners) return;
  const { x, y, w, h } = p6FrameCorners;
  if (w < 20 || h < 20) return;

  // Dimmed overlay outside frame
  p6OCtx.save();
  p6OCtx.fillStyle = 'rgba(0,0,0,0.45)';
  p6OCtx.fillRect(0, 0, p6W, p6H);
  p6OCtx.clearRect(x, y, w, h);
  p6OCtx.restore();

  // Frame border
  const bothPinching = p6Hands[0].pinching && p6Hands[1].pinching;
  const progress = p6PinchBothFrames / P6_CAPTURE_HOLD;
  const frameColor = bothPinching ? `rgba(39,127,83,${0.7 + progress * 0.3})` : 'rgba(255,255,255,0.85)';
  p6OCtx.save();
  p6OCtx.strokeStyle = frameColor;
  p6OCtx.lineWidth = bothPinching ? 3 + progress * 3 : 3;
  p6OCtx.strokeRect(x, y, w, h);

  // Corner accents
  const cLen = 24;
  const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  const dirs = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  p6OCtx.lineWidth = 4;
  corners.forEach(([cx, cy], i) => {
    const [dx, dy] = dirs[i];
    p6OCtx.beginPath(); p6OCtx.moveTo(cx + dx * cLen, cy); p6OCtx.lineTo(cx, cy); p6OCtx.lineTo(cx, cy + dy * cLen); p6OCtx.stroke();
  });

  // Capture progress arc
  if (bothPinching && progress > 0) {
    const arcX = x + w / 2, arcY = y + h / 2;
    p6OCtx.beginPath();
    p6OCtx.arc(arcX, arcY, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    p6OCtx.strokeStyle = 'rgba(39,127,83,0.9)';
    p6OCtx.lineWidth = 5; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
    p6OCtx.fillStyle = '#fff'; p6OCtx.font = `bold ${Math.round(p6W / 55)}px 'Manrope'`;
    p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'middle';
    p6OCtx.fillText('📸', arcX, arcY);
  }

  // Hint text
  p6OCtx.fillStyle = 'rgba(255,255,255,0.9)';
  p6OCtx.font = `600 ${Math.round(p6W / 65)}px 'Manrope'`;
  p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'top';
  p6OCtx.fillText(bothPinching ? 'Hold to capture…' : 'Pinch both hands to capture', p6W / 2, y + h + 14);
  p6OCtx.restore();
}

/* ── Puzzle draw ── */
function p6DrawPuzzle() {
  if (!p6CapturedImage) return;
  const pw = p6BoardSize / P6_GRID;
  const ph = p6BoardSize / P6_GRID;

  // Board slots (ghost)
  p6OCtx.save();
  for (let row = 0; row < P6_GRID; row++) {
    for (let col = 0; col < P6_GRID; col++) {
      const id = row * P6_GRID + col;
      const piece = p6Pieces[id];
      if (piece && piece.placed) continue; // will draw image instead
      p6OCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      p6OCtx.lineWidth = 1.5;
      p6OCtx.strokeRect(p6BoardX + col * pw, p6BoardY + row * ph, pw, ph);
    }
  }
  p6OCtx.restore();

  // Draw pieces (placed ones on board, tray ones floating)
  p6Pieces.forEach(piece => {
    if (piece.dragging) return; // draw on top later
    p6DrawPiece(piece);
  });
  // Draw dragged piece on top
  if (p6DragPiece) p6DrawPiece(p6DragPiece);
}

function p6DrawPiece(piece) {
  const { col, row, x, y, w, h, placed, dragging } = piece;
  p6OCtx.save();
  if (dragging) {
    p6OCtx.shadowColor = 'rgba(39,127,83,0.7)';
    p6OCtx.shadowBlur = 18;
  } else if (placed) {
    p6OCtx.shadowColor = 'rgba(0,0,0,0)';
  }

  // Clip to piece rect
  p6OCtx.beginPath();
  p6OCtx.rect(x, y, w, h);
  p6OCtx.clip();

  // Draw the corresponding slice of captured image
  const srcX = (col / P6_GRID) * p6CapturedImage.width;
  const srcY = (row / P6_GRID) * p6CapturedImage.height;
  const srcW = p6CapturedImage.width / P6_GRID;
  const srcH = p6CapturedImage.height / P6_GRID;
  p6OCtx.drawImage(p6CapturedImage, srcX, srcY, srcW, srcH, x, y, w, h);

  // Border
  p6OCtx.strokeStyle = placed ? 'rgba(39,127,83,0.8)' : (dragging ? '#267F53' : 'rgba(255,255,255,0.5)');
  p6OCtx.lineWidth = placed ? 2 : 1.5;
  p6OCtx.strokeRect(x, y, w, h);

  // Placed checkmark
  if (placed) {
    p6OCtx.fillStyle = 'rgba(39,127,83,0.85)';
    p6OCtx.beginPath(); p6OCtx.arc(x + w - 14, y + 14, 11, 0, Math.PI * 2); p6OCtx.fill();
    p6OCtx.strokeStyle = '#fff'; p6OCtx.lineWidth = 2.5; p6OCtx.lineCap = 'round';
    p6OCtx.beginPath(); p6OCtx.moveTo(x + w - 19, y + 14); p6OCtx.lineTo(x + w - 14, y + 19); p6OCtx.lineTo(x + w - 8, y + 9); p6OCtx.stroke();
  }
  p6OCtx.restore();
}

/* ── Hand cursors ── */
function p6DrawHandCursors() {
  p6Hands.forEach(h => {
    if (!h.lm) return;
    const pf = h.pinchProgress;
    const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });
    const idx = toC(h.lm, 8);
    const thb = toC(h.lm, 4);

    // Line between fingertips
    p6OCtx.beginPath(); p6OCtx.moveTo(idx.x, idx.y); p6OCtx.lineTo(thb.x, thb.y);
    p6OCtx.strokeStyle = `rgba(255,255,255,${0.2 + pf * 0.5})`; p6OCtx.lineWidth = 2; p6OCtx.setLineDash([4, 4]); p6OCtx.stroke(); p6OCtx.setLineDash([]);

    [idx, thb].forEach(tip => {
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
      p6OCtx.fillStyle = `rgba(39,127,83,${0.1 + pf * 0.3})`; p6OCtx.fill();
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pf);
      p6OCtx.strokeStyle = pf > 0.85 ? '#267F53' : 'rgba(255,255,255,0.85)'; p6OCtx.lineWidth = 3; p6OCtx.lineCap = 'round'; p6OCtx.stroke();
      p6OCtx.beginPath(); p6OCtx.arc(tip.x, tip.y, 4, 0, Math.PI * 2); p6OCtx.fillStyle = '#fff'; p6OCtx.fill();
    });

    const R = h.pinching ? 15 : 11;
    p6OCtx.beginPath(); p6OCtx.arc(h.cx, h.cy, R, 0, Math.PI * 2);
    p6OCtx.fillStyle = h.pinching ? 'rgba(39,127,83,0.9)' : 'rgba(255,255,255,0.8)'; p6OCtx.fill();
    p6OCtx.beginPath(); p6OCtx.arc(h.cx, h.cy, R, 0, Math.PI * 2);
    p6OCtx.strokeStyle = h.pinching ? '#267F53' : 'rgba(255,255,255,0.4)'; p6OCtx.lineWidth = 2; p6OCtx.stroke();
  });
}

/* ════════════════════════════
   WIN / LOSE
════════════════════════════ */
function p6ShowWin() {
  p6ShowState_raw(P6_STATE.WIN);
  document.getElementById('p6-win-wrap').style.display = 'flex';
}
function p6ShowLose() {
  p6ShowState_raw(P6_STATE.LOSE);
  document.getElementById('p6-lose-pieces').textContent = p6PiecesPlaced;
  document.getElementById('p6-lose-wrap').style.display = 'flex';
}
function p6ShowState_raw(s) {
  p6State = s;
  document.getElementById('p6-hud').style.display = 'none';
}

/* ════════════════════════════
   NAVIGATION
════════════════════════════ */
function p6GoIntro()     { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.INTRO); }
function p6GoHowto()     { p6ShowState(P6_STATE.HOWTO); }
function p6GoCountdown() { p6ShowState(P6_STATE.COUNTDOWN); }
function p6CaptureAgain(){ clearInterval(p6TimerInterval); document.getElementById('p6-hud').style.display='none'; p6ShowState(P6_STATE.FRAME); }
function p6PlayAgain()   { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.COUNTDOWN); }
function p6ForceExit()   { clearInterval(p6TimerInterval); goTo('page2'); }

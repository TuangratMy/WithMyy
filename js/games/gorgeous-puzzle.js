/* ══════════════════════════════════════════════
   PAGE 6 — GORGEOUS PUZZLE ENGINE (INSTANT SNAP FIX)
══════════════════════════════════════════════ */

let p6Video, p6Canvas, p6Ctx, p6Overlay, p6OCtx;
let p6W = 0, p6H = 0, p6Started = false;

let p6HandsMp, p6Camera6;
let p6CameraRunning = false;

const P6_STATE = { INTRO:'intro', HOWTO:'howto', FRAME:'frame', LOCKED:'locked', CAPTURING:'capturing', COUNTDOWN:'countdown', PUZZLE:'puzzle', WIN:'win', LOSE:'lose' };
let p6State = P6_STATE.INTRO;
let p6TimeLeft = 60, p6TimerInterval = null;
let p6PiecesPlaced = 0;
const P6_GRID = 3;
const P6_TOTAL = P6_GRID * P6_GRID;

let p6CapturedImage = null;

let p6Pieces = [];
let p6BoardX = 0, p6BoardY = 0, p6BoardW = 0, p6BoardH = 0;

/* ── Hand smoothing (EMA) ── */
const P6_SMOOTH = 0.45;
function p6MakeHandSlot() {
  return { lm:null, rawCx:0, rawCy:0, cx:0, cy:0, pinching:false, lastPinch:false, pinchProgress:0, cooldown:0, smoothInit:false, seenFrames:0 };
}
let p6Hands = [ p6MakeHandSlot(), p6MakeHandSlot() ];

let p6DragPiece = null;
let p6DragHandIdx = -1;

/* ── Pinch thresholds ── */
const P6_PINCH_ON  = 0.058;
const P6_PINCH_OFF = 0.075;

/* ── Frame Box ── */
let p6FrameBox = null;
let p6LockedBox = null;
let p6WasPinchingLastFrame = false; // สำหรับ Instant Snap

/* ── Countdown ── */
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
  p6HandsMp.setOptions({ maxNumHands:2, modelComplexity:1, minDetectionConfidence:0.65, minTrackingConfidence:0.55 });
  p6HandsMp.onResults(p6OnHandResults);

  p6Camera6 = new Camera(p6Video, {
    onFrame: async () => {
      if (!p6CameraRunning) return;
      await p6HandsMp.send({ image: p6Video });
    },
    width:1280, height:720
  });
  p6Camera6.start();
  p6CameraRunning = true;
  p6RenderLoop();
  p6ShowState(P6_STATE.INTRO);
}

function p6PauseCamera() {
  if (!p6Started || !p6CameraRunning) return;
  p6CameraRunning = false;
  if (p6Camera6 && typeof p6Camera6.stop === 'function') p6Camera6.stop();
  clearInterval(p6TimerInterval);
}

function p6ResumeCamera() {
  if (!p6Started) return;
  if (p6CameraRunning) return;
  p6CameraRunning = true;
  if (p6Camera6 && typeof p6Camera6.start === 'function') p6Camera6.start();
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

  if (state === P6_STATE.INTRO)   { document.getElementById('p6-intro-wrap').style.display = 'flex'; }
  if (state === P6_STATE.HOWTO)   { document.getElementById('p6-howto-wrap').style.display = 'flex'; }
  if (state === P6_STATE.FRAME)   { p6ResetFrameTracking(); }
  if (state === P6_STATE.COUNTDOWN) { p6RunCountdown(); }
  if (state === P6_STATE.PUZZLE) { p6StartPuzzle(); }
  if (state === P6_STATE.WIN)     { p6ShowWin(); }
  if (state === P6_STATE.LOSE)    { p6ShowLose(); }
}

function p6ResetFrameTracking() {
  p6FrameBox = null;
  p6LockedBox = null;
  p6WasPinchingLastFrame = false;
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
    else { setTimeout(() => { wrap.style.display = 'none'; p6ShowState(P6_STATE.PUZZLE); }, 900); }
  }
  tick();
}

/* ════════════════════════════
   HAND RESULTS
════════════════════════════ */
function p6OnHandResults(results) {
  const seenThisFrame = [false, false];

  if (results.multiHandLandmarks) {
    results.multiHandLandmarks.forEach((lm, i) => {
      const handedness = results.multiHandedness && results.multiHandedness[i]
        ? results.multiHandedness[i].label
        : (i === 0 ? 'Left' : 'Right');
      const slot = handedness === 'Left' ? 0 : 1;
      seenThisFrame[slot] = true;

      const h = p6Hands[slot];
      h.lm = lm;
      h.seenFrames++;
      const toC = (lx, ly) => ({ x: (1 - lx) * p6W, y: ly * p6H });
      const idx = toC(lm[8].x, lm[8].y);
      const thb = toC(lm[4].x, lm[4].y);
      h.rawCx = (idx.x + thb.x) / 2;
      h.rawCy = (idx.y + thb.y) / 2;

      if (!h.smoothInit) { h.cx = h.rawCx; h.cy = h.rawCy; h.smoothInit = true; }
      else {
        h.cx = h.cx + (h.rawCx - h.cx) * P6_SMOOTH;
        h.cy = h.cy + (h.rawCy - h.cy) * P6_SMOOTH;
      }

      const dx = lm[8].x - lm[4].x, dy = lm[8].y - lm[4].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      h.pinchProgress = Math.max(0, Math.min(1, 1 - (dist - P6_PINCH_ON) / (P6_PINCH_OFF - P6_PINCH_ON)));

      if (!h.pinching && dist < P6_PINCH_ON) h.pinching = true;
      else if (h.pinching && dist > P6_PINCH_OFF) h.pinching = false;

      if (h.cooldown > 0) h.cooldown--;
    });
  }

  for (let slot = 0; slot < 2; slot++) {
    if (!seenThisFrame[slot]) p6Hands[slot].lm = null;
  }

  if (p6State === P6_STATE.FRAME)  { p6HandleFrameMode(); }
  if (p6State === P6_STATE.PUZZLE) { p6HandlePuzzleMode(); }
}

/* ════════════════════════════
   FRAME MODE & INSTANT SNAP FIX
════════════════════════════ */
function p6HandleFrameMode() {
  const h0 = p6Hands[0], h1 = p6Hands[1];
  const toC = (lm, idx) => ({ x: (1 - lm[idx].x) * p6W, y: lm[idx].y * p6H });

  let xs = [], ys = [];

  // สร้างกรอบจากมือที่ตรวจจับได้
  if (h0.lm) {
    const w0 = toC(h0.lm, 0), i0 = toC(h0.lm, 8), t0 = toC(h0.lm, 4);
    xs.push(w0.x, i0.x, t0.x); ys.push(w0.y, i0.y, t0.y);
  }
  if (h1.lm) {
    const w1 = toC(h1.lm, 0), i1 = toC(h1.lm, 8), t1 = toC(h1.lm, 4);
    xs.push(w1.x, i1.x, t1.x); ys.push(w1.y, i1.y, t1.y);
  }

  if (xs.length > 0) {
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 150);
    const h = Math.max(maxY - minY, 150);
    p6FrameBox = { x: minX, y: minY, w: w, h: h };
  } else {
    // Default Frame ถ้าไม่เจอมือ
    const defaultSize = Math.min(p6W, p6H) * 0.5;
    p6FrameBox = { x: (p6W - defaultSize)/2, y: (p6H - defaultSize)/2, w: defaultSize, h: defaultSize };
  }

  // INSTANT SNAP: เมื่อมีการประกบนิ้ว (Pinch) ชิ้นส่วน สั่งแคปเจอร์ทันทีไม่ต้องรอ
  const isPinching = (h0.lm && h0.pinching) || (h1.lm && h1.pinching);
  if (isPinching && !p6WasPinchingLastFrame) {
    p6LockedBox = { ...p6FrameBox };
    p6DoCapture();
  }
  p6WasPinchingLastFrame = isPinching;
}

/* ════════════════════════════
   CAPTURE
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
   PUZZLE SETUP
════════════════════════════ */
function p6StartPuzzle() {
  p6PiecesPlaced = 0;
  p6DragPiece = null;
  p6DragHandIdx = -1;

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
   PUZZLE HAND CONTROLS
════════════════════════════ */
const SNAP_RADIUS = 65;

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
  const page6El = document.getElementById('page6');
  if (page6El && !page6El.classList.contains('active')) {
    requestAnimationFrame(p6RenderLoop); return;
  }

  p6Ctx.clearRect(0, 0, p6W, p6H);
  if (p6Video && p6Video.readyState >= 2) {
    p6Ctx.save();
    p6Ctx.translate(p6W, 0);
    p6Ctx.scale(-1, 1);
    p6Ctx.drawImage(p6Video, 0, 0, p6W, p6H);
    p6Ctx.restore();
  }

  p6OCtx.clearRect(0, 0, p6W, p6H);

  if (p6State === P6_STATE.FRAME)  { p6DrawFrameMode(); p6DrawHandCursors(); }
  if (p6State === P6_STATE.PUZZLE) { p6DrawPuzzle(); p6DrawHandCursors(); }

  requestAnimationFrame(p6RenderLoop);
}

function p6DrawFrameMode() {
  if (!p6FrameBox) return;
  const { x, y, w, h } = p6FrameBox;

  p6OCtx.save();
  p6OCtx.fillStyle = 'rgba(0,0,0,0.35)';
  p6OCtx.fillRect(0, 0, p6W, p6H);
  p6OCtx.clearRect(x, y, w, h);
  p6OCtx.restore();

  p6OCtx.save();
  p6OCtx.strokeStyle = '#277f53';
  p6OCtx.lineWidth = 3;
  p6OCtx.strokeRect(x, y, w, h);

  p6OCtx.fillStyle = 'rgba(255,255,255,0.95)';
  p6OCtx.font = `600 ${Math.round(p6W/65)}px 'Manrope'`;
  p6OCtx.textAlign = 'center'; p6OCtx.textBaseline = 'top';
  p6OCtx.fillText('Pinch thumb & index to Instant Snap!', p6W/2, y + h + 14);
  p6OCtx.restore();
}

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
   WIN / LOSE & NAVIGATION
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

function p6GoIntro()      { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.INTRO); }
function p6GoHowto()      { p6ShowState(P6_STATE.HOWTO); }
function p6GoCountdown()  { p6ShowState(P6_STATE.FRAME); }
function p6CaptureAgain() { clearInterval(p6TimerInterval); document.getElementById('p6-hud').style.display='none'; p6ShowState(P6_STATE.FRAME); }
function p6PlayAgain()    { clearInterval(p6TimerInterval); p6ShowState(P6_STATE.FRAME); }
function p6ForceExit()    { clearInterval(p6TimerInterval); p6PauseCamera(); if (typeof goTo === 'function') goTo('page2'); }

/* ════ PAGE 8 — AIR DRAW ════ */

let p8Started = false;
let p8Hands = null;
let p8Camera = null;
let p8AnimFrame = null;

// Canvas & video references
let p8Video, p8Canvas, p8Ctx;

// Drawing state
let p8Strokes = [];          // [{color, size, points:[{x,y}]}]
let p8CurrentStroke = null;
let p8IsDrawing = false;

// Move state
let p8IsPinching = false;
let p8PinchHitStrokeIdx = -1;
let p8PinchHitPointIdx = -1;
let p8PinchStartX = 0;
let p8PinchStartY = 0;
let p8StrokeOffsets = [];    // [{dx, dy}] per stroke when drag starts

// Cursor
let p8CursorX = -999, p8CursorY = -999;
let p8PinchCursorX = -999, p8PinchCursorY = -999;

// Settings
let p8ActiveColor = '#FF6B6B';
let p8BrushSize = 12;
let p8Mode = 'paint'; // 'paint' | 'eraser'

// Vibrant 8 colors
const p8VibrantColors = [
  '#FF6B6B', '#FF9500', '#FFD60A', '#34C759',
  '#00C7BE', '#0A84FF', '#BF5AF2', '#FF375F'
];
// Pastel 8 colors
const p8PastelColors = [
  '#FFB3B3', '#FFCF99', '#FFF0A0', '#A8E6CF',
  '#A0E7E5', '#A8C8FF', '#DDB3FF', '#FFB3C6'
];

function initPage8() {
  if (p8Started) return;
  p8Started = true;

  p8Video  = document.getElementById('p8-video');
  p8Canvas = document.getElementById('p8-canvas');
  p8Ctx    = p8Canvas.getContext('2d');

  p8SetupControls();

  // Show camera permission card
  document.getElementById('p8-cam-wrap').style.display = 'flex';
}

function p8SetupControls() {
  // Color buttons
  const grid = document.getElementById('p8-color-grid');
  grid.innerHTML = '';
  [...p8VibrantColors, ...p8PastelColors].forEach((hex, i) => {
    const btn = document.createElement('button');
    btn.className = 'p8-color-btn' + (hex === p8ActiveColor ? ' active' : '');
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.title = hex;
    btn.addEventListener('click', () => {
      p8ActiveColor = hex;
      p8Mode = 'paint';
      document.querySelectorAll('.p8-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('p8-btn-paint').classList.add('active');
      document.getElementById('p8-btn-eraser').classList.remove('active');
    });
    grid.appendChild(btn);
  });

  // Size slider
  const sizeSlider = document.getElementById('p8-size-slider');
  sizeSlider.addEventListener('input', () => {
    p8BrushSize = parseInt(sizeSlider.value);
    p8UpdateSliderTrack(sizeSlider);
  });
  p8UpdateSliderTrack(sizeSlider);

  // Paint / Eraser
  document.getElementById('p8-btn-paint').addEventListener('click', () => {
    p8Mode = 'paint';
    document.getElementById('p8-btn-paint').classList.add('active');
    document.getElementById('p8-btn-eraser').classList.remove('active');
  });
  document.getElementById('p8-btn-eraser').addEventListener('click', () => {
    p8Mode = 'eraser';
    document.getElementById('p8-btn-eraser').classList.add('active');
    document.getElementById('p8-btn-paint').classList.remove('active');
  });

  // Clear
  document.getElementById('p8-btn-clear').addEventListener('click', () => {
    p8Strokes = [];
    p8CurrentStroke = null;
  });

  // Save
  document.getElementById('p8-btn-save').addEventListener('click', p8SaveDrawing);
}

function p8UpdateSliderTrack(r) {
  const p = ((r.value - r.min) / (r.max - r.min)) * 100;
  r.style.background = `linear-gradient(to right,var(--orange) 0%,var(--orange) ${p}%,#f0e8ff ${p}%)`;
}

/* ── Camera start ── */
function p8StartCamera() {
  document.getElementById('p8-cam-wrap').style.display = 'none';
  document.getElementById('p8-loading').style.display = 'flex';

  p8Hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  p8Hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75
  });
  p8Hands.onResults(p8OnHandResults);

  p8Camera = new Camera(p8Video, {
    onFrame: async () => { await p8Hands.send({ image: p8Video }); },
    width: 1280, height: 720
  });
  p8Camera.start().then(() => {
    p8ResizeCanvas();
    document.getElementById('p8-loading').style.display = 'none';
    requestAnimationFrame(p8DrawLoop);
  }).catch(() => {
    document.getElementById('p8-loading').style.display = 'none';
    alert('Could not access camera. Please allow camera access and try again.');
  });

  window.addEventListener('resize', p8ResizeCanvas);
}

function p8ResizeCanvas() {
  if (!p8Canvas) return;
  const zone = document.getElementById('p8-draw-zone');
  const rect = zone.getBoundingClientRect();
  p8Canvas.width  = rect.width;
  p8Canvas.height = rect.height;
}

/* ── Hand results ── */
function p8OnHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    p8IsDrawing  = false;
    p8IsPinching = false;
    p8CurrentStroke = null;
    p8CursorX = p8CursorY = -999;
    return;
  }

  const W = p8Canvas.width;
  const H = p8Canvas.height;

  // Use first hand
  const hand = results.multiHandLandmarks[0];

  // Index fingertip = landmark 8
  // Thumb tip = landmark 4
  const idx   = hand[8];
  const thumb = hand[4];
  const middle = hand[12]; // middle finger tip

  // Mirror X (camera is mirrored)
  const ix = (1 - idx.x) * W;
  const iy = idx.y * H;
  const tx = (1 - thumb.x) * W;
  const ty = thumb.y * H;

  p8CursorX = ix;
  p8CursorY = iy;

  // Pinch detection: distance index tip to thumb tip
  const pinchDist = Math.hypot(ix - tx, iy - ty);
  const pinchThreshold = W * 0.06; // ~6% of width

  const wasPinching = p8IsPinching;
  p8IsPinching = pinchDist < pinchThreshold;

  p8PinchCursorX = (ix + tx) / 2;
  p8PinchCursorY = (iy + ty) / 2;

  if (p8IsPinching) {
    // PINCH = move mode
    p8IsDrawing = false;
    p8CurrentStroke = null;

    if (!wasPinching) {
      // Just started pinch — find nearest stroke
      p8PinchHitStrokeIdx = -1;
      let minDist = Infinity;
      const px = p8PinchCursorX, py = p8PinchCursorY;
      p8Strokes.forEach((stroke, si) => {
        stroke.points.forEach((pt, pi) => {
          const d = Math.hypot(pt.x - px, pt.y - py);
          if (d < minDist) { minDist = d; p8PinchHitStrokeIdx = si; p8PinchHitPointIdx = pi; }
        });
      });
      const hitRadius = Math.max(W * 0.08, 60);
      if (minDist > hitRadius) p8PinchHitStrokeIdx = -1;

      // Save offsets of ALL points in that stroke
      p8PinchStartX = px; p8PinchStartY = py;
      if (p8PinchHitStrokeIdx >= 0) {
        const s = p8Strokes[p8PinchHitStrokeIdx];
        p8StrokeOffsets = s.points.map(pt => ({ dx: pt.x - px, dy: pt.y - py }));
      }
    }

    // Drag stroke
    if (p8PinchHitStrokeIdx >= 0) {
      const px = p8PinchCursorX, py = p8PinchCursorY;
      const s = p8Strokes[p8PinchHitStrokeIdx];
      s.points.forEach((pt, i) => {
        pt.x = px + (p8StrokeOffsets[i]?.dx || 0);
        pt.y = py + (p8StrokeOffsets[i]?.dy || 0);
      });
    }
  } else {
    // No pinch = drawing mode (index finger)
    p8IsPinching = false;
    p8PinchHitStrokeIdx = -1;

    if (p8Mode === 'eraser') {
      p8EraseNear(ix, iy);
      p8IsDrawing = false;
      p8CurrentStroke = null;
    } else {
      // Check if index finger is "up" — middle finger should be lower than index
      const mx = (1 - middle.x) * W;
      const my = middle.y * H;
      const indexUp = iy < my - H * 0.03; // index must be notably above middle

      if (indexUp) {
        if (!p8IsDrawing) {
          p8IsDrawing = true;
          p8CurrentStroke = { color: p8ActiveColor, size: p8BrushSize, points: [{ x: ix, y: iy }] };
          p8Strokes.push(p8CurrentStroke);
        } else {
          p8CurrentStroke.points.push({ x: ix, y: iy });
        }
      } else {
        p8IsDrawing = false;
        p8CurrentStroke = null;
      }
    }
  }
}

function p8EraseNear(x, y) {
  const r = p8BrushSize * 2;
  p8Strokes = p8Strokes.filter(stroke => {
    return !stroke.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < r);
  });
}

/* ── Draw loop ── */
function p8DrawLoop() {
  p8AnimFrame = requestAnimationFrame(p8DrawLoop);
  if (!p8Canvas || !p8Ctx) return;
  const W = p8Canvas.width, H = p8Canvas.height;

  p8Ctx.clearRect(0, 0, W, H);

  // Draw all strokes
  p8Strokes.forEach(stroke => {
    if (stroke.points.length < 2) {
      // Single dot
      p8Ctx.beginPath();
      p8Ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      p8Ctx.fillStyle = stroke.color;
      p8Ctx.fill();
      return;
    }
    p8Ctx.beginPath();
    p8Ctx.strokeStyle = stroke.color;
    p8Ctx.lineWidth = stroke.size;
    p8Ctx.lineCap = 'round';
    p8Ctx.lineJoin = 'round';
    p8Ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];
      const mx = (prev.x + curr.x) / 2;
      const my = (prev.y + curr.y) / 2;
      p8Ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    p8Ctx.stroke();
  });

  // Draw cursor
  if (p8CursorX > 0) {
    if (p8IsPinching) {
      // Pinch cursor — circle with arrows hint
      p8Ctx.beginPath();
      p8Ctx.arc(p8PinchCursorX, p8PinchCursorY, 18, 0, Math.PI * 2);
      p8Ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      p8Ctx.lineWidth = 3;
      p8Ctx.stroke();
      p8Ctx.beginPath();
      p8Ctx.arc(p8PinchCursorX, p8PinchCursorY, 6, 0, Math.PI * 2);
      p8Ctx.fillStyle = 'rgba(255,255,255,0.9)';
      p8Ctx.fill();
    } else if (p8Mode === 'eraser') {
      // Eraser cursor
      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize, 0, Math.PI * 2);
      p8Ctx.strokeStyle = 'rgba(255,100,100,0.8)';
      p8Ctx.lineWidth = 2;
      p8Ctx.setLineDash([4, 4]);
      p8Ctx.stroke();
      p8Ctx.setLineDash([]);
    } else {
      // Drawing cursor
      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize / 2, 0, Math.PI * 2);
      p8Ctx.fillStyle = p8IsDrawing ? p8ActiveColor : 'rgba(255,255,255,0.7)';
      p8Ctx.fill();
      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize / 2 + 3, 0, Math.PI * 2);
      p8Ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      p8Ctx.lineWidth = 2;
      p8Ctx.stroke();
    }
  }
}

/* ── Save ── */
function p8SaveDrawing() {
  const offscreen = document.createElement('canvas');
  offscreen.width  = p8Canvas.width;
  offscreen.height = p8Canvas.height;
  const oc = offscreen.getContext('2d');
  oc.fillStyle = '#FAF7F0';
  oc.fillRect(0, 0, offscreen.width, offscreen.height);
  oc.drawImage(p8Canvas, 0, 0);
  const link = document.createElement('a');
  link.download = 'air-draw.png';
  link.href = offscreen.toDataURL('image/png');
  link.click();
}

/* ── Cleanup when leaving page ── */
function p8ForceExit() {
  if (p8Camera) { p8Camera.stop(); p8Camera = null; }
  if (p8Hands)  { p8Hands.close(); p8Hands = null; }
  if (p8AnimFrame) { cancelAnimationFrame(p8AnimFrame); p8AnimFrame = null; }
  p8Started = false;
  p8Strokes = [];
  p8CurrentStroke = null;
  goTo('page2');
}

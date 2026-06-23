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
let p8StrokeOffsets = [];    // [{dx, dy}] per point in grabbed stroke

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
  [...p8VibrantColors, ...p8PastelColors].forEach((hex) => {
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
    maxNumHands: 1,
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
    // Show card again with error message
    document.getElementById('p8-cam-wrap').style.display = 'flex';
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

  const hand   = results.multiHandLandmarks[0];

  // Key landmarks
  const idx    = hand[8];   // index fingertip
  const thumb  = hand[4];   // thumb tip
  const middle = hand[12];  // middle fingertip

  // Mirror X
  const ix = (1 - idx.x)    * W;
  const iy =      idx.y      * H;
  const tx = (1 - thumb.x)  * W;
  const ty =      thumb.y    * H;
  const mx = (1 - middle.x) * W;
  const my =      middle.y   * H;

  p8CursorX = ix;
  p8CursorY = iy;

  // Pinch: index tip close to thumb tip
  const pinchDist      = Math.hypot(ix - tx, iy - ty);
  const pinchThreshold = W * 0.065;

  const wasPinching = p8IsPinching;
  p8IsPinching = pinchDist < pinchThreshold;

  p8PinchCursorX = (ix + tx) / 2;
  p8PinchCursorY = (iy + ty) / 2;

  if (p8IsPinching) {
    // ── PINCH = move mode ──
    p8IsDrawing     = false;
    p8CurrentStroke = null;

    if (!wasPinching) {
      // Just started pinch — find nearest stroke to grab
      p8PinchHitStrokeIdx = -1;
      let minDist = Infinity;
      const px = p8PinchCursorX, py = p8PinchCursorY;
      p8Strokes.forEach((stroke, si) => {
        stroke.points.forEach(pt => {
          const d = Math.hypot(pt.x - px, pt.y - py);
          if (d < minDist) { minDist = d; p8PinchHitStrokeIdx = si; }
        });
      });
      const hitRadius = Math.max(W * 0.09, 60);
      if (minDist > hitRadius) p8PinchHitStrokeIdx = -1;

      // Save per-point offsets relative to pinch position
      if (p8PinchHitStrokeIdx >= 0) {
        const s = p8Strokes[p8PinchHitStrokeIdx];
        p8StrokeOffsets = s.points.map(pt => ({ dx: pt.x - px, dy: pt.y - py }));
      }
    }

    // Drag grabbed stroke
    if (p8PinchHitStrokeIdx >= 0) {
      const px = p8PinchCursorX, py = p8PinchCursorY;
      const s  = p8Strokes[p8PinchHitStrokeIdx];
      s.points.forEach((pt, i) => {
        pt.x = px + (p8StrokeOffsets[i] ? p8StrokeOffsets[i].dx : 0);
        pt.y = py + (p8StrokeOffsets[i] ? p8StrokeOffsets[i].dy : 0);
      });
    }

  } else {
    // ── NO PINCH = drawing / erasing mode ──
    p8IsPinching        = false;
    p8PinchHitStrokeIdx = -1;

    if (p8Mode === 'eraser') {
      p8EraseNear(ix, iy);
      p8IsDrawing     = false;
      p8CurrentStroke = null;
    } else {
      // Only draw when index finger is clearly raised above middle finger
      const indexUp = iy < my - H * 0.03;

      if (indexUp) {
        if (!p8IsDrawing) {
          p8IsDrawing     = true;
          p8CurrentStroke = { color: p8ActiveColor, size: p8BrushSize, points: [{ x: ix, y: iy }] };
          p8Strokes.push(p8CurrentStroke);
        } else {
          // Smooth — only add point if moved enough
          const last = p8CurrentStroke.points[p8CurrentStroke.points.length - 1];
          if (Math.hypot(ix - last.x, iy - last.y) > 3) {
            p8CurrentStroke.points.push({ x: ix, y: iy });
          }
        }
      } else {
        p8IsDrawing     = false;
        p8CurrentStroke = null;
      }
    }
  }
}

function p8EraseNear(x, y) {
  const r = p8BrushSize * 2.5;
  p8Strokes = p8Strokes.filter(stroke =>
    !stroke.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < r)
  );
}

/* ── Draw loop ── */
function p8DrawLoop() {
  p8AnimFrame = requestAnimationFrame(p8DrawLoop);
  if (!p8Canvas || !p8Ctx) return;
  const W = p8Canvas.width, H = p8Canvas.height;

  p8Ctx.clearRect(0, 0, W, H);

  // Draw mirrored camera feed as background
  if (p8Video && p8Video.readyState >= 2) {
    p8Ctx.save();
    p8Ctx.translate(W, 0);
    p8Ctx.scale(-1, 1);
    p8Ctx.drawImage(p8Video, 0, 0, W, H);
    p8Ctx.restore();
  }

  // Draw all strokes
  p8Strokes.forEach(stroke => {
    if (stroke.points.length === 0) return;

    if (stroke.points.length === 1) {
      // Single dot
      p8Ctx.beginPath();
      p8Ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      p8Ctx.fillStyle = stroke.color;
      p8Ctx.fill();
      return;
    }

    p8Ctx.beginPath();
    p8Ctx.strokeStyle = stroke.color;
    p8Ctx.lineWidth   = stroke.size;
    p8Ctx.lineCap     = 'round';
    p8Ctx.lineJoin    = 'round';
    p8Ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      p8Ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
    }
    // Last point
    const last = stroke.points[stroke.points.length - 1];
    p8Ctx.lineTo(last.x, last.y);
    p8Ctx.stroke();
  });

  // Draw cursor
  if (p8CursorX > 0) {
    if (p8IsPinching) {
      // Pinch cursor — double ring
      p8Ctx.beginPath();
      p8Ctx.arc(p8PinchCursorX, p8PinchCursorY, 20, 0, Math.PI * 2);
      p8Ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      p8Ctx.lineWidth   = 3;
      p8Ctx.stroke();
      p8Ctx.beginPath();
      p8Ctx.arc(p8PinchCursorX, p8PinchCursorY, 7, 0, Math.PI * 2);
      p8Ctx.fillStyle = 'rgba(255,255,255,0.85)';
      p8Ctx.fill();
    } else if (p8Mode === 'eraser') {
      // Eraser cursor — dashed circle
      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize * 1.2, 0, Math.PI * 2);
      p8Ctx.strokeStyle = 'rgba(255,80,80,0.8)';
      p8Ctx.lineWidth   = 2;
      p8Ctx.setLineDash([5, 5]);
      p8Ctx.stroke();
      p8Ctx.setLineDash([]);
    } else {
      // Paint cursor — filled circle + outline ring
      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize / 2, 0, Math.PI * 2);
      p8Ctx.fillStyle = p8IsDrawing ? p8ActiveColor : 'rgba(255,255,255,0.6)';
      p8Ctx.fill();

      p8Ctx.beginPath();
      p8Ctx.arc(p8CursorX, p8CursorY, p8BrushSize / 2 + 4, 0, Math.PI * 2);
      p8Ctx.strokeStyle = p8IsDrawing ? p8ActiveColor : 'rgba(150,150,150,0.5)';
      p8Ctx.lineWidth   = 2;
      p8Ctx.stroke();
    }
  }
}

/* ── Save drawing — strokes only on white background ── */
function p8SaveDrawing() {
  const offscreen = document.createElement('canvas');
  offscreen.width  = p8Canvas.width;
  offscreen.height = p8Canvas.height;
  const oc = offscreen.getContext('2d');

  // White background
  oc.fillStyle = '#FAF7F0';
  oc.fillRect(0, 0, offscreen.width, offscreen.height);

  // Re-draw strokes only (no camera, no cursor)
  p8Strokes.forEach(stroke => {
    if (stroke.points.length === 0) return;
    if (stroke.points.length === 1) {
      oc.beginPath();
      oc.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      oc.fillStyle = stroke.color;
      oc.fill();
      return;
    }
    oc.beginPath();
    oc.strokeStyle = stroke.color;
    oc.lineWidth   = stroke.size;
    oc.lineCap     = 'round';
    oc.lineJoin    = 'round';
    oc.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      oc.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
    }
    const last = stroke.points[stroke.points.length - 1];
    oc.lineTo(last.x, last.y);
    oc.stroke();
  });

  const link = document.createElement('a');
  link.download = 'air-draw.png';
  link.href = offscreen.toDataURL('image/png');
  link.click();
}

/* ── Cleanup when leaving page ── */
function p8ForceExit() {
  if (p8Camera) { try { p8Camera.stop(); } catch(e){} p8Camera = null; }
  if (p8Hands)  { try { p8Hands.close();  } catch(e){} p8Hands  = null; }
  if (p8AnimFrame) { cancelAnimationFrame(p8AnimFrame); p8AnimFrame = null; }
  window.removeEventListener('resize', p8ResizeCanvas);
  p8Started       = false;
  p8Strokes       = [];
  p8CurrentStroke = null;
  p8IsDrawing     = false;
  p8IsPinching    = false;
  goTo('page2');
}

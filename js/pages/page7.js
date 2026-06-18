/* ══════════════════ PAGE 7 ENGINE — FULL OF BLOOMIE ══════════════════
   Concept: fullscreen body-segmentation "hug" particle effect, same
   mechanic as Page 3/4 (Bloomie Rain), but pure visual — no control
   panel, particles always Mixed (star/heart/flower) at a lively density.

   Architecture (mirrors Page 4):
   - p7Canvas: camera feed drawn in JS (flipped) + particles
   - p7PersonCanvas: person cutout on top (so person reads in front of particles)
   - SelfieSegmentation for body detection (same model as p3/p4)
══════════════════════════════════════════════════ */
const p7Video        = document.getElementById('p7-video');
const p7Canvas       = document.getElementById('p7-canvas');
const p7Ctx          = p7Canvas.getContext('2d');
const p7PersonCanvas = document.getElementById('p7-person-canvas');
const p7PersonCtx    = p7PersonCanvas.getContext('2d');
const p7Loading      = document.getElementById('p7-loading');

let p7Started = false, p7W = 0, p7H = 0;

/* Fixed "feel" for the fullscreen experience — no panel, so we pick
   lively defaults once instead of reading sliders. */
const P7_DENSITY = 180;
const P7_SIZE_SCALE = 1.0;
const P7_SPEED = 4;

/* Mask sampling buffers — same low-res approach as p3/p4 for perf */
const P7_MW = 80, P7_MH = 60;
const p7SampC = document.createElement('canvas'); p7SampC.width = P7_MW; p7SampC.height = P7_MH;
const p7SampX = p7SampC.getContext('2d');
let p7MaskData = null;
const p7PersonBuf = document.createElement('canvas');
const p7PersonBufCtx = p7PersonBuf.getContext('2d');

function p7IsPerson(cx, cy) {
  if (!p7MaskData || cx < 0 || cy < 0 || cx >= p7W || cy >= p7H) return false;
  /* Canvas is drawn mirrored, so flip x back to match raw mask coords */
  const mx = p7W - 1 - cx;
  return p7MaskData[(Math.floor((cy / p7H) * P7_MH) * P7_MW + Math.floor((mx / p7W) * P7_MW)) * 4] > 100;
}
function p7FindEdge(cx, cy) {
  let lx = cx, rx = cx;
  while (lx > 0 && p7IsPerson(lx - 1, cy)) lx--;
  while (rx < p7W - 1 && p7IsPerson(rx + 1, cy)) rx++;
  return (cx - lx) <= (rx - cx) ? { side: -1, edgeX: lx } : { side: 1, edgeX: rx };
}

/* Particles — reuses shared palette/allShapes/drawShape from app.js,
   always "Mixed" shapes for a full, lively bloom field. */
let p7Particles = [];
class P7Particle {
  constructor(ry = true) { this.color = palette[Math.floor(Math.random() * palette.length)]; this.reset(ry); }
  reset(ry = false) {
    this.x = Math.random() * p7W; this.y = ry ? Math.random() * p7H : -40;
    this.scale = (Math.random() * .35 + .5) * P7_SIZE_SCALE * (p7W / 800);
    this.angle = Math.random() * Math.PI * 2; this.spin = (Math.random() - .5) * .06;
    this.state = 'falling'; this.hugDir = 0; this.hugFrames = 0; this.hugMax = Math.floor(Math.random() * 80) + 60;
    this.myShape = allShapes[Math.floor(Math.random() * allShapes.length)];
  }
  update() {
    const s = P7_SPEED * (p7W / 800); this.angle += this.spin;
    if (this.state === 'falling') {
      const ny = this.y + s;
      if (p7IsPerson(this.x, ny)) {
        this.state = 'hugging'; this.hugFrames = 0; this.hugMax = Math.floor(Math.random() * 80) + 60;
        const { side } = p7FindEdge(this.x, this.y); this.hugDir = side;
      } else { this.y = ny; }
    } else {
      this.hugFrames++; this.x += this.hugDir * 1.8 * (p7W / 800);
      const ny = this.y + s * .5;
      if (!p7IsPerson(this.x, ny + 4)) { this.y = ny; this.state = 'falling'; }
      else {
        this.y = ny;
        const { side } = p7FindEdge(this.x, this.y);
        if (side === this.hugDir) { this.x += this.hugDir * 2; } else { this.state = 'falling'; }
      }
      if (this.hugFrames > this.hugMax) this.state = 'falling';
      this.x = Math.max(-20, Math.min(p7W + 20, this.x));
    }
    if (this.y > p7H + 60) this.reset(false);
  }
  draw(c) { c.save(); c.translate(this.x, this.y); c.rotate(this.angle); c.scale(this.scale, this.scale); drawShape(c, this.myShape, this.color); c.restore(); }
}

function p7AdjustParticles() {
  while (p7Particles.length < P7_DENSITY) p7Particles.push(new P7Particle(true));
  if (p7Particles.length > P7_DENSITY) p7Particles.length = P7_DENSITY;
}

let p7SelfieSegmentation, p7Camera;

function resizeP7() {
  p7W = window.innerWidth; p7H = window.innerHeight;
  p7Canvas.width = p7W; p7Canvas.height = p7H;
  p7PersonCanvas.width = p7W; p7PersonCanvas.height = p7H;
  p7PersonBuf.width = p7W; p7PersonBuf.height = p7H;
  p7Particles.forEach(p => p.reset(true));
}

function initPage7() {
  p7Started = true;
  resizeP7();
  window.addEventListener('resize', () => { resizeP7(); });
  p7AdjustParticles();

  p7SelfieSegmentation = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  p7SelfieSegmentation.setOptions({ modelSelection: 1 });
  p7SelfieSegmentation.onResults(onP7SelfieResults);

  p7Camera = new Camera(p7Video, {
    onFrame: async () => { await p7SelfieSegmentation.send({ image: p7Video }); },
    width: 1280, height: 720
  });
  p7Camera.start().then(() => { p7Loading.style.display = 'none'; });
}

function onP7SelfieResults(results) {
  /* Sample mask in RAW (unmirrored) orientation — isPerson flips x to match */
  p7SampX.clearRect(0, 0, P7_MW, P7_MH);
  p7SampX.drawImage(results.segmentationMask, 0, 0, P7_MW, P7_MH);
  p7MaskData = p7SampX.getImageData(0, 0, P7_MW, P7_MH).data;

  /* Person cutout buffer: mask clipped to camera, both drawn MIRRORED for display */
  p7PersonBufCtx.clearRect(0, 0, p7W, p7H);
  p7PersonBufCtx.save(); p7PersonBufCtx.translate(p7W, 0); p7PersonBufCtx.scale(-1, 1);
  p7PersonBufCtx.drawImage(results.segmentationMask, 0, 0, p7W, p7H);
  p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation = 'source-in';
  p7PersonBufCtx.save(); p7PersonBufCtx.translate(p7W, 0); p7PersonBufCtx.scale(-1, 1);
  p7PersonBufCtx.drawImage(results.image, 0, 0, p7W, p7H);
  p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation = 'source-over';

  /* Main canvas: mirrored camera → particles */
  p7Ctx.clearRect(0, 0, p7W, p7H);
  p7Ctx.save(); p7Ctx.translate(p7W, 0); p7Ctx.scale(-1, 1);
  p7Ctx.drawImage(results.image, 0, 0, p7W, p7H);
  p7Ctx.restore();
  p7Particles.forEach(p => { p.update(); p.draw(p7Ctx); });

  /* Person on top so they read in front of the blooms */
  p7PersonCtx.clearRect(0, 0, p7W, p7H);
  p7PersonCtx.drawImage(p7PersonBuf, 0, 0);
}

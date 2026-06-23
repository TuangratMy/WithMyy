/* ══════════════════ PAGE 7 — FULL OF BLOOMIE ══════════════════
   Bloomie pile at the bottom. Scoop them up with your hands —
   they float toward your palm. Let go and gravity pulls them back down.
   They bounce off each other like real balls.
══════════════════════════════════════════════════ */
const p7Video       = document.getElementById('p7-video');
const p7Canvas      = document.getElementById('p7-canvas');
const p7Ctx         = p7Canvas.getContext('2d');
const p7PersonCanvas= document.getElementById('p7-person-canvas');
const p7PersonCtx   = p7PersonCanvas.getContext('2d');
const p7Loading     = document.getElementById('p7-loading');

let p7Started = false, p7W = 0, p7H = 0;

/* ─── Tuning ─── */
const P7_COUNT        = 120;
const P7_GRAVITY      = 0.18;   // pulls bloomie downward every frame
const P7_DAMPING      = 0.88;   // velocity decay
const P7_RESTITUTION  = 0.55;   // bounciness on collision (0=dead, 1=elastic)
const P7_FLOOR_BOUNCE = 0.35;   // bounciness off floor
const P7_GATHER_R     = 200;    // px — hand attract radius
const P7_GATHER_STR   = 0.32;   // how hard hand pulls bloomie toward it
const P7_SCATTER_R    = 180;    // px — fast-hand scatter radius
const P7_SCATTER_STR  = 2.8;    // how hard fast hand pushes bloomie away
const P7_SLOW_SPD     = 8;      // px/frame — below this = "slow" (gather)
const P7_FAST_SPD     = 24;     // px/frame — above this = "fast" (scatter)
const P7_MAX_SPEED    = 16;

/* ─── Mask (person cutout) ─── */
const P7_MW = 60, P7_MH = 45;
const p7SampC = document.createElement('canvas');
p7SampC.width = P7_MW; p7SampC.height = P7_MH;
const p7SampX = p7SampC.getContext('2d');
let p7MaskData = null;
const p7PersonBuf    = document.createElement('canvas');
const p7PersonBufCtx = p7PersonBuf.getContext('2d');

/* ─── Hand state ─── */
let p7Hands, p7Camera, p7SelfieSegmentation;
let p7HandState = [
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false }
];

function onP7HandResults(results) {
  const seen = [false, false];
  if (results.multiHandLandmarks) {
    for (let i = 0; i < Math.min(2, results.multiHandLandmarks.length); i++) {
      /* Use wrist (0) + middle-MCP (9) midpoint as "palm center" */
      const lm0 = results.multiHandLandmarks[i][0];
      const lm9 = results.multiHandLandmarks[i][9];
      const rawX = (lm0.x + lm9.x) / 2;
      const rawY = (lm0.y + lm9.y) / 2;
      const nx = (1 - rawX) * p7W;
      const ny = rawY * p7H;
      const h = p7HandState[i];
      if (h.active) {
        h.vx = nx - h.x; h.vy = ny - h.y;
        h.speed = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
      } else {
        h.vx = 0; h.vy = 0; h.speed = 0;
      }
      h.x = nx; h.y = ny; h.active = true;
      seen[i] = true;
    }
  }
  for (let i = 0; i < 2; i++) {
    if (!seen[i]) { p7HandState[i].active = false; p7HandState[i].speed = 0; }
  }
}

/* ─── Particle ─── */
let p7Particles = [];

const P7_SIZES = [0.35, 0.5, 0.65]; // base scale options (small!)

class P7Bloomie {
  constructor(x, y) {
    this.color   = palette[Math.floor(Math.random() * palette.length)];
    this.myShape = allShapes[Math.floor(Math.random() * allShapes.length)];
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = Math.random() * -1;
    this.baseSize = P7_SIZES[Math.floor(Math.random() * P7_SIZES.length)];
    this.r = this.baseSize * 20; // collision radius (px at 800w baseline, scaled live)
    this.angle = Math.random() * Math.PI * 2;
    this.spin   = (Math.random() - 0.5) * 0.06;
  }

  update(wScale) {
    this.angle += this.spin;
    const r = this.r * wScale;

    /* gravity */
    this.vy += P7_GRAVITY * wScale;

    /* hand interaction */
    for (let hi = 0; hi < 2; hi++) {
      const h = p7HandState[hi];
      if (!h.active) continue;
      const dx = this.x - h.x, dy = this.y - h.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      if (h.speed >= P7_FAST_SPD && dist < P7_SCATTER_R * wScale) {
        /* fast hand → scatter */
        const t = 1 - dist / (P7_SCATTER_R * wScale);
        const hdx = h.vx / h.speed, hdy = h.vy / h.speed;
        this.vx += ((dx / dist) * 0.55 + hdx * 0.45) * P7_SCATTER_STR * t * t * wScale;
        this.vy += ((dy / dist) * 0.55 + hdy * 0.45) * P7_SCATTER_STR * t * t * wScale;
      } else if (h.speed < P7_SLOW_SPD && dist < P7_GATHER_R * wScale) {
        /* slow hand → gather toward palm */
        const t = 1 - dist / (P7_GATHER_R * wScale);
        this.vx -= (dx / dist) * P7_GATHER_STR * t * wScale;
        this.vy -= (dy / dist) * P7_GATHER_STR * t * wScale;
      }
    }

    /* damping + speed cap */
    this.vx *= P7_DAMPING;
    this.vy *= P7_DAMPING;
    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const maxSpd = P7_MAX_SPEED * wScale;
    if (spd > maxSpd) { this.vx = (this.vx / spd) * maxSpd; this.vy = (this.vy / spd) * maxSpd; }

    this.x += this.vx; this.y += this.vy;

    /* walls */
    if (this.x - r < 0)   { this.x = r;        this.vx =  Math.abs(this.vx) * 0.6; }
    if (this.x + r > p7W) { this.x = p7W - r;  this.vx = -Math.abs(this.vx) * 0.6; }
    if (this.y - r < 0)   { this.y = r;         this.vy =  Math.abs(this.vy) * 0.4; }
    /* floor bounce */
    if (this.y + r > p7H) {
      this.y = p7H - r;
      this.vy = -Math.abs(this.vy) * P7_FLOOR_BOUNCE;
      this.vx *= 0.85; // friction on floor
    }
  }

  draw(c, wScale) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.angle);
    c.scale(this.baseSize * wScale, this.baseSize * wScale);
    drawShape(c, this.myShape, this.color);
    c.restore();
  }
}

/* ─── Ball-ball collision resolution (spatial grid) ─── */
const p7Grid = new Map();

function p7ResolveCollisions(wScale) {
  const n = p7Particles.length;
  if (n < 2) return;

  const maxR = 0.65 * 20 * wScale; // largest baseSize * collision px
  const cellSize = maxR * 2.2;

  p7Grid.clear();
  for (let i = 0; i < n; i++) {
    const p = p7Particles[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = cx + ',' + cy;
    let b = p7Grid.get(key);
    if (!b) { b = []; p7Grid.set(key, b); }
    b.push(i);
  }

  for (let i = 0; i < n; i++) {
    const a  = p7Particles[i];
    const ar = a.r * wScale;
    const acx = Math.floor(a.x / cellSize);
    const acy = Math.floor(a.y / cellSize);

    for (let cy = acy - 1; cy <= acy + 1; cy++) {
      for (let cx = acx - 1; cx <= acx + 1; cx++) {
        const bucket = p7Grid.get(cx + ',' + cy);
        if (!bucket) continue;
        for (let bi = 0; bi < bucket.length; bi++) {
          const j = bucket[bi];
          if (j <= i) continue;
          const b  = p7Particles[j];
          const br = b.r * wScale;
          const minD = ar + br;
          const dx = b.x - a.x, dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= minD * minD || distSq < 1e-8) continue;
          const dist = Math.sqrt(distSq);
          const nx = dx / dist, ny = dy / dist;
          const overlap = minD - dist;
          const mA = ar * ar, mB = br * br, mT = mA + mB;
          a.x -= nx * overlap * (mB / mT);
          a.y -= ny * overlap * (mB / mT);
          b.x += nx * overlap * (mA / mT);
          b.y += ny * overlap * (mA / mT);
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const relV = rvx * nx + rvy * ny;
          if (relV < 0) {
            const imp = -(1 + P7_RESTITUTION) * relV / (1 / mA + 1 / mB);
            a.vx -= imp * nx / mA; a.vy -= imp * ny / mA;
            b.vx += imp * nx / mB; b.vy += imp * ny / mB;
          }
        }
      }
    }
  }
}

/* ─── Seed: spawn all bloomie piled at bottom ─── */
function p7SeedSwarm() {
  p7Particles = [];
  /* stack them in a grid near the bottom center */
  const cols = Math.ceil(Math.sqrt(P7_COUNT * 2));
  const rows = Math.ceil(P7_COUNT / cols);
  const cellW = Math.min(p7W * 0.8, cols * 60) / cols;
  const startX = p7W / 2 - (cols * cellW) / 2;
  const startY = p7H - 30;
  let made = 0;
  for (let r = 0; r < rows && made < P7_COUNT; r++) {
    for (let c = 0; c < cols && made < P7_COUNT; c++) {
      const x = startX + c * cellW + Math.random() * cellW;
      const y = startY - r * 45 + (Math.random() - 0.5) * 20;
      p7Particles.push(new P7Bloomie(x, y));
      made++;
    }
  }
}

/* ─── Resize ─── */
function resizeP7() {
  const prevW = p7W, prevH = p7H;
  p7W = window.innerWidth; p7H = window.innerHeight;
  p7Canvas.width       = p7W; p7Canvas.height       = p7H;
  p7PersonCanvas.width = p7W; p7PersonCanvas.height = p7H;
  p7PersonBuf.width    = p7W; p7PersonBuf.height    = p7H;
  if (prevW && prevH && p7Particles.length) {
    const sx = p7W / prevW, sy = p7H / prevH;
    p7Particles.forEach(p => { p.x *= sx; p.y *= sy; });
  }
}

/* ─── Init ─── */
function initPage7() {
  p7Started = true;
  resizeP7();
  window.addEventListener('resize', resizeP7);
  p7SeedSwarm();

  p7SelfieSegmentation = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  p7SelfieSegmentation.setOptions({ modelSelection: 1 });
  p7SelfieSegmentation.onResults(onP7SelfieResults);

  p7Hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  p7Hands.setOptions({ maxNumHands: 2, modelComplexity: 1,
    minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
  p7Hands.onResults(onP7HandResults);

  p7Camera = new Camera(p7Video, {
    onFrame: async () => {
      await p7SelfieSegmentation.send({ image: p7Video });
      await p7Hands.send({ image: p7Video });
    },
    width: 1280, height: 720
  });
  p7Camera.start().then(() => { p7Loading.style.display = 'none'; });
}

/* ─── Per-frame (called by selfie segmentation) ─── */
function onP7SelfieResults(results) {
  /* sample mask */
  p7SampX.clearRect(0, 0, P7_MW, P7_MH);
  p7SampX.drawImage(results.segmentationMask, 0, 0, P7_MW, P7_MH);
  p7MaskData = p7SampX.getImageData(0, 0, P7_MW, P7_MH).data;

  /* person cutout buffer (mirrored) */
  p7PersonBufCtx.clearRect(0, 0, p7W, p7H);
  p7PersonBufCtx.save();
  p7PersonBufCtx.translate(p7W, 0); p7PersonBufCtx.scale(-1, 1);
  p7PersonBufCtx.drawImage(results.segmentationMask, 0, 0, p7W, p7H);
  p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation = 'source-in';
  p7PersonBufCtx.save();
  p7PersonBufCtx.translate(p7W, 0); p7PersonBufCtx.scale(-1, 1);
  p7PersonBufCtx.drawImage(results.image, 0, 0, p7W, p7H);
  p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation = 'source-over';

  /* draw camera feed */
  p7Ctx.clearRect(0, 0, p7W, p7H);
  p7Ctx.save();
  p7Ctx.translate(p7W, 0); p7Ctx.scale(-1, 1);
  p7Ctx.drawImage(results.image, 0, 0, p7W, p7H);
  p7Ctx.restore();

  /* update + collide + draw bloomie */
  const wScale = p7W / 800 || 1;
  for (let i = 0; i < p7Particles.length; i++) p7Particles[i].update(wScale);
  p7ResolveCollisions(wScale);
  for (let i = 0; i < p7Particles.length; i++) p7Particles[i].draw(p7Ctx, wScale);

  /* person on top */
  p7PersonCtx.clearRect(0, 0, p7W, p7H);
  p7PersonCtx.drawImage(p7PersonBuf, 0, 0);
}

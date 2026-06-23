/* ══════════════════ PAGE 7 ENGINE — FULL OF BLOOMIE ══════════════════
   Bloomie float and fill the whole screen.
   When the person moves, Bloomie near the body bounce away.
   Bloomie slowly drift back to fill the screen again when still.
══════════════════════════════════════════════════ */
const p7Video        = document.getElementById('p7-video');
const p7Canvas        = document.getElementById('p7-canvas');
const p7Ctx           = p7Canvas.getContext('2d');
const p7PersonCanvas  = document.getElementById('p7-person-canvas');
const p7PersonCtx     = p7PersonCanvas.getContext('2d');
const p7Loading       = document.getElementById('p7-loading');

let p7Started = false, p7W = 0, p7H = 0;

/* ─── Swarm tuning ─── */
const P7_COUNT         = 180;
const P7_WANDER_SPEED  = 0.4;
const P7_MAX_SPEED     = 10;
const P7_DAMPING       = 0.90;
const P7_HOME_STRENGTH = 0.018;
const P7_HOME_JITTER_T = 0.003;
const P7_BODY_PUSH     = 7.0;    // how hard bloomie bounce off body
const P7_BODY_RADIUS   = 55;     // px — how far from body edge to start pushing

/* ─── Mask sampling — low-res for perf ─── */
const P7_MW = 60, P7_MH = 45;
const p7SampC = document.createElement('canvas');
p7SampC.width = P7_MW; p7SampC.height = P7_MH;
const p7SampX = p7SampC.getContext('2d');

/* Previous frame mask — used to detect body movement */
let p7PrevMask   = null;
let p7CurrMask   = null;
let p7BodyMoving = 0; // 0–1 intensity, decays each frame

/* person cutout buffer */
const p7PersonBuf    = document.createElement('canvas');
const p7PersonBufCtx = p7PersonBuf.getContext('2d');

function p7IsPerson(cx, cy) {
  if (!p7CurrMask || cx < 0 || cy < 0 || cx >= p7W || cy >= p7H) return false;
  const mx = p7W - 1 - cx; // canvas is mirrored, flip back
  const mi = (Math.floor((cy / p7H) * P7_MH) * P7_MW + Math.floor((mx / p7W) * P7_MW)) * 4;
  return p7CurrMask[mi] > 80;
}

/* Sample points around a bloomie and return the average push direction away from body */
function p7BodyPushVec(bx, by, wScale) {
  const r = P7_BODY_RADIUS * wScale;
  const steps = 8;
  let pushX = 0, pushY = 0, hits = 0;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const sx = bx + Math.cos(angle) * r * 0.5;
    const sy = by + Math.sin(angle) * r * 0.5;
    if (p7IsPerson(sx, sy)) {
      pushX += Math.cos(angle + Math.PI);
      pushY += Math.sin(angle + Math.PI);
      hits++;
    }
  }
  if (hits === 0 && !p7IsPerson(bx, by)) return null;
  // If center is inside body, push in a random outward direction
  if (hits === 0) {
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle), t: 1 };
  }
  const mag = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
  const t = Math.min(1, hits / (steps * 0.5));
  return { x: pushX / mag, y: pushY / mag, t };
}

/* ─── Hand tracking (optional extra interaction) ─── */
let p7Hands, p7Camera;
let p7HandState = [
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false }
];

function onP7HandResults(results) {
  const seen = [false, false];
  if (results.multiHandLandmarks) {
    for (let i = 0; i < Math.min(2, results.multiHandLandmarks.length); i++) {
      const lm = results.multiHandLandmarks[i][9];
      const nx = (1 - lm.x) * p7W;
      const ny = lm.y * p7H;
      const h = p7HandState[i];
      if (h.active) {
        const dx = nx - h.x, dy = ny - h.y;
        h.vx = dx; h.vy = dy;
        h.speed = Math.sqrt(dx * dx + dy * dy);
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

/* ─── Bloomie particle ─── */
let p7Particles = [];

const P7_SIZES = [
  { min: 0.5, max: 0.8  },
  { min: 0.9, max: 1.3  },
  { min: 1.4, max: 2.0  }
];

class P7Bloomie {
  constructor(homeX, homeY) {
    this.color    = palette[Math.floor(Math.random() * palette.length)];
    this.myShape  = allShapes[Math.floor(Math.random() * allShapes.length)];
    this.x        = homeX;
    this.y        = homeY;
    this.homeX    = homeX;
    this.homeY    = homeY;

    const band    = P7_SIZES[Math.floor(Math.random() * P7_SIZES.length)];
    this.baseSize = band.min + Math.random() * (band.max - band.min);

    this.angle       = Math.random() * Math.PI * 2;
    this.spin        = (Math.random() - 0.5) * 0.04;
    this.heading     = Math.random() * Math.PI * 2;
    this.headingSpin = (Math.random() - 0.5) * 0.03;
    this.vx          = Math.cos(this.heading) * P7_WANDER_SPEED;
    this.vy          = Math.sin(this.heading) * P7_WANDER_SPEED;

    this.homeAngle  = Math.random() * Math.PI * 2;
    this.homeDriftR = 25 + Math.random() * 45;
  }

  update(wScale) {
    this.angle += this.spin;

    /* organic wander */
    this.heading += this.headingSpin;
    if (Math.random() < 0.012) this.headingSpin = (Math.random() - 0.5) * 0.03;
    this.vx += (Math.cos(this.heading) * P7_WANDER_SPEED * wScale - this.vx) * 0.025;
    this.vy += (Math.sin(this.heading) * P7_WANDER_SPEED * wScale - this.vy) * 0.025;

    /* drifting home point */
    this.homeAngle += P7_HOME_JITTER_T;
    const curHomeX = this.homeX + Math.cos(this.homeAngle) * this.homeDriftR;
    const curHomeY = this.homeY + Math.sin(this.homeAngle) * this.homeDriftR;

    /* ── BODY PUSH — core feature ── */
    let bodyInfluence = 0;
    const push = p7BodyPushVec(this.x, this.y, wScale);
    if (push) {
      /* Scale push strength with how much the body is moving */
      const movementBoost = 1 + p7BodyMoving * 5;
      const strength = P7_BODY_PUSH * push.t * movementBoost * wScale;
      this.vx += push.x * strength;
      this.vy += push.y * strength;
      bodyInfluence = push.t;
    }

    /* ── HAND INTERACTION (scatter fast / gather slow) ── */
    const HAND_SCATTER_R  = 200 * wScale;
    const HAND_GATHER_R   = 180 * wScale;
    const HAND_SLOW_SPD   = 8;
    const HAND_FAST_SPD   = 22;
    const HAND_SCATTER_STR = 2.2;
    const HAND_GATHER_STR  = 0.5;

    for (let hi = 0; hi < 2; hi++) {
      const h = p7HandState[hi];
      if (!h.active) continue;
      const dx = this.x - h.x, dy = this.y - h.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      if (h.speed >= HAND_FAST_SPD && dist < HAND_SCATTER_R) {
        const t = 1 - dist / HAND_SCATTER_R;
        const hdx = h.vx / (h.speed || 1), hdy = h.vy / (h.speed || 1);
        this.vx += ((dx / dist) * 0.6 + hdx * 0.4) * HAND_SCATTER_STR * t * t;
        this.vy += ((dy / dist) * 0.6 + hdy * 0.4) * HAND_SCATTER_STR * t * t;
      } else if (h.speed < HAND_SLOW_SPD && dist < HAND_GATHER_R) {
        const t = 1 - dist / HAND_GATHER_R;
        this.vx -= (dx / dist) * HAND_GATHER_STR * t * t;
        this.vy -= (dy / dist) * HAND_GATHER_STR * t * t;
      }
    }

    /* soft homing — back off when body/hand is pushing */
    const homeMul = 1 - Math.min(1, bodyInfluence * 0.9);
    this.vx += (curHomeX - this.x) * P7_HOME_STRENGTH * homeMul;
    this.vy += (curHomeY - this.y) * P7_HOME_STRENGTH * homeMul;

    /* damping + speed cap */
    this.vx *= P7_DAMPING;
    this.vy *= P7_DAMPING;
    const spSq  = this.vx * this.vx + this.vy * this.vy;
    const maxSp = P7_MAX_SPEED * wScale;
    if (spSq > maxSp * maxSp) {
      const sp = Math.sqrt(spSq);
      this.vx = (this.vx / sp) * maxSp;
      this.vy = (this.vy / sp) * maxSp;
    }

    this.x += this.vx;
    this.y += this.vy;

    /* wall bounce */
    const r = this.baseSize * 18 * wScale;
    if (this.x - r < 0)      { this.x = r;          this.vx =  Math.abs(this.vx) * 0.8; }
    if (this.x + r > p7W)    { this.x = p7W - r;    this.vx = -Math.abs(this.vx) * 0.8; }
    if (this.y - r < 0)      { this.y = r;           this.vy =  Math.abs(this.vy) * 0.8; }
    if (this.y + r > p7H)    { this.y = p7H - r;     this.vy = -Math.abs(this.vy) * 0.8; }
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

/* Evenly-jittered grid seed */
function p7SeedSwarm() {
  p7Particles = [];
  const aspect = p7W / p7H || 16 / 9;
  const cols   = Math.round(Math.sqrt(P7_COUNT * aspect));
  const rows   = Math.ceil(P7_COUNT / cols);
  const cellW  = p7W / cols, cellH = p7H / rows;
  let made = 0;
  for (let r = 0; r < rows && made < P7_COUNT; r++) {
    for (let c = 0; c < cols && made < P7_COUNT; c++) {
      const hx = c * cellW + Math.random() * cellW;
      const hy = r * cellH + Math.random() * cellH;
      p7Particles.push(new P7Bloomie(hx, hy));
      made++;
    }
  }
}

/* ─── Detect body movement via mask diff ─── */
function p7DetectMovement() {
  if (!p7PrevMask || !p7CurrMask) return 0;
  let diff = 0;
  const len = P7_MW * P7_MH;
  for (let i = 0; i < len; i++) {
    const a = p7PrevMask[i * 4] > 80 ? 1 : 0;
    const b = p7CurrMask[i * 4] > 80 ? 1 : 0;
    if (a !== b) diff++;
  }
  return diff / len; // 0–1 fraction of pixels that changed
}

let p7SelfieSegmentation;

function resizeP7() {
  const prevW = p7W, prevH = p7H;
  p7W = window.innerWidth; p7H = window.innerHeight;
  p7Canvas.width       = p7W; p7Canvas.height       = p7H;
  p7PersonCanvas.width = p7W; p7PersonCanvas.height = p7H;
  p7PersonBuf.width    = p7W; p7PersonBuf.height    = p7H;
  if (prevW && prevH && p7Particles.length) {
    const sx = p7W / prevW, sy = p7H / prevH;
    p7Particles.forEach(p => {
      p.x *= sx; p.y *= sy;
      p.homeX *= sx; p.homeY *= sy;
    });
  }
}

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
  p7Hands.setOptions({
    maxNumHands: 2, modelComplexity: 1,
    minDetectionConfidence: 0.6, minTrackingConfidence: 0.5
  });
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

function onP7SelfieResults(results) {
  /* ── 1. Sample mask & detect movement ── */
  p7SampX.clearRect(0, 0, P7_MW, P7_MH);
  p7SampX.drawImage(results.segmentationMask, 0, 0, P7_MW, P7_MH);
  const newMask = p7SampX.getImageData(0, 0, P7_MW, P7_MH).data;

  p7PrevMask = p7CurrMask;
  p7CurrMask = newMask;

  /* movement intensity: 0 = still, 1 = lots of motion */
  const rawMovement = p7DetectMovement();
  /* smooth it — ramp up fast, decay slowly so pushes feel snappy */
  p7BodyMoving = Math.max(p7BodyMoving * 0.75, Math.min(1, rawMovement * 18));

  /* ── 2. Person cutout (mirrored) ── */
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

  /* ── 3. Draw camera feed ── */
  p7Ctx.clearRect(0, 0, p7W, p7H);
  p7Ctx.save();
  p7Ctx.translate(p7W, 0); p7Ctx.scale(-1, 1);
  p7Ctx.drawImage(results.image, 0, 0, p7W, p7H);
  p7Ctx.restore();

  /* ── 4. Update + draw bloomie ── */
  const wScale = p7W / 800 || 1;
  for (let i = 0; i < p7Particles.length; i++) p7Particles[i].update(wScale);
  for (let i = 0; i < p7Particles.length; i++) p7Particles[i].draw(p7Ctx, wScale);

  /* ── 5. Person on top ── */
  p7PersonCtx.clearRect(0, 0, p7W, p7H);
  p7PersonCtx.drawImage(p7PersonBuf, 0, 0);
}

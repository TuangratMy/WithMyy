/* ══════════════════ PAGE 7 ENGINE — FULL OF BLOOMIE ══════════════════
   Concept: a living swarm of Bloomie that exists on screen from the
   very beginning and never despawns. No falling, no spawning, no
   score/timer/win condition — purely relaxing play.

   Idle behaviour : gentle organic wander (slowly-turning heading).
   Hand behaviour  : up to 2 hands tracked independently.
                     - slow hand movement  -> nearby Bloomie are gently
                       attracted toward the hand (gather)
                     - fast hand movement  -> nearby Bloomie are pushed
                       away along the hand's travel direction (scatter)
   Person visibility: SelfieSegmentation still draws the camera + person
                     cutout on top (so the player is always visible), but
                     instead of "hugging" the body like Page 3/4, Bloomie
                     near the body are steered AROUND it so they never
                     cover the player's face/body.

   Architecture (same layer pattern as Page 4):
   - p7Canvas: mirrored camera feed + swarm particles
   - p7PersonCanvas: person cutout drawn on top (in front of particles)
══════════════════════════════════════════════════ */
const p7Video        = document.getElementById('p7-video');
const p7Canvas        = document.getElementById('p7-canvas');
const p7Ctx           = p7Canvas.getContext('2d');
const p7PersonCanvas  = document.getElementById('p7-person-canvas');
const p7PersonCtx     = p7PersonCanvas.getContext('2d');
const p7Loading       = document.getElementById('p7-loading');

let p7Started = false, p7W = 0, p7H = 0;

/* Swarm tuning */
const P7_COUNT          = 170;   // fixed population, never spawns/despawns
const P7_SIZE_SCALE      = 1.0;
const P7_WANDER_SPEED    = 0.55; // idle drift speed (px/frame at 800w baseline)
const P7_MAX_SPEED       = 6.5;  // hard cap so scatter doesn't fling off-model
const P7_DAMPING         = 0.94; // velocity decay toward idle each frame
const P7_GATHER_RADIUS   = 230;
const P7_SCATTER_RADIUS  = 260;
const P7_GATHER_STRENGTH = 0.55;
const P7_SCATTER_STRENGTH= 2.6;
const P7_SLOW_HAND_SPEED = 9;    // px/frame below this = "slow" (gather)
const P7_FAST_HAND_SPEED = 26;   // px/frame above this = "fast" (scatter)
const P7_PERSON_PUSH     = 3.2;  // how hard Bloomie are steered off the body

/* Mask sampling buffer — low-res for perf, same approach as p3/p4 */
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

/* ─── Hands: up to 2, tracked independently ─── */
let p7Hands, p7Camera;
/* hand[i] = {x,y,vx,vy,speed,active} in canvas (mirrored) coordinates */
let p7HandState = [
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, active: false }
];

function onP7HandResults(results) {
  const seen = [false, false];
  if (results.multiHandLandmarks) {
    for (let i = 0; i < Math.min(2, results.multiHandLandmarks.length); i++) {
      const lm = results.multiHandLandmarks[i][9]; // middle-finger MCP ~= palm center
      const nx = (1 - lm.x) * p7W; // mirror to match mirrored canvas
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

/* ─── Bloomie swarm particle ─── */
let p7Particles = [];
class P7Bloomie {
  constructor() {
    this.color = palette[Math.floor(Math.random() * palette.length)];
    this.myShape = allShapes[Math.floor(Math.random() * allShapes.length)];
    this.x = Math.random() * p7W;
    this.y = Math.random() * p7H;
    this.scale = (Math.random() * .35 + .5) * P7_SIZE_SCALE * (p7W / 800 || 1);
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - .5) * .05;
    /* idle wander heading + velocity — keeps Bloomie alive even with no hands */
    this.heading = Math.random() * Math.PI * 2;
    this.headingSpin = (Math.random() - .5) * 0.04;
    this.vx = Math.cos(this.heading) * P7_WANDER_SPEED;
    this.vy = Math.sin(this.heading) * P7_WANDER_SPEED;
  }
  update() {
    const wScale = p7W / 800 || 1;
    this.angle += this.spin;

    /* idle organic wander: heading slowly turns, gently nudges velocity */
    this.heading += this.headingSpin;
    if (Math.random() < 0.01) this.headingSpin = (Math.random() - .5) * 0.04;
    const wanderAx = Math.cos(this.heading) * P7_WANDER_SPEED * wScale;
    const wanderAy = Math.sin(this.heading) * P7_WANDER_SPEED * wScale;
    this.vx += (wanderAx - this.vx) * 0.02;
    this.vy += (wanderAy - this.vy) * 0.02;

    /* hand interaction — independent per hand */
    for (const h of p7HandState) {
      if (!h.active) continue;
      const dx = this.x - h.x, dy = this.y - h.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

      if (h.speed <= P7_SLOW_HAND_SPEED && dist < P7_GATHER_RADIUS) {
        /* slow hand -> gentle attraction toward hand */
        const t = 1 - dist / P7_GATHER_RADIUS;
        const pull = P7_GATHER_STRENGTH * t * t;
        this.vx -= (dx / dist) * pull;
        this.vy -= (dy / dist) * pull;
      } else if (h.speed >= P7_FAST_HAND_SPEED && dist < P7_SCATTER_RADIUS) {
        /* fast hand -> scatter away, biased along the hand's travel direction */
        const t = 1 - dist / P7_SCATTER_RADIUS;
        const push = P7_SCATTER_STRENGTH * t * t;
        const hdx = h.vx / (h.speed || 1), hdy = h.vy / (h.speed || 1);
        this.vx += ((dx / dist) * 0.6 + hdx * 0.4) * push;
        this.vy += ((dy / dist) * 0.6 + hdy * 0.4) * push;
      } else if (dist < P7_GATHER_RADIUS) {
        /* medium speed -> light following drift, keeps swarm feeling alive */
        const t = 1 - dist / P7_GATHER_RADIUS;
        this.vx -= (dx / dist) * P7_GATHER_STRENGTH * 0.35 * t;
        this.vy -= (dy / dist) * P7_GATHER_STRENGTH * 0.35 * t;
      }
    }

    /* steer around the player's body instead of hugging it, so Bloomie
       never sit on top of / cover the person */
    if (p7IsPerson(this.x, this.y)) {
      let lx = this.x, rx = this.x;
      while (lx > 0 && p7IsPerson(lx - 1, this.y)) lx--;
      while (rx < p7W - 1 && p7IsPerson(rx + 1, this.y)) rx++;
      const side = (this.x - lx) <= (rx - this.x) ? -1 : 1;
      this.vx += side * P7_PERSON_PUSH * wScale;
      /* small vertical jitter so a whole column doesn't push the same way */
      this.vy += (Math.random() - .5) * P7_PERSON_PUSH * 0.4;
    }

    /* damping keeps motion smooth and prevents runaway speeds */
    this.vx *= P7_DAMPING; this.vy *= P7_DAMPING;
    const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const maxSp = P7_MAX_SPEED * wScale;
    if (sp > maxSp) { this.vx = (this.vx / sp) * maxSp; this.vy = (this.vy / sp) * maxSp; }

    this.x += this.vx; this.y += this.vy;

    /* soft bounce off screen edges — Bloomie never leave/respawn */
    const m = 20;
    if (this.x < -m) { this.x = -m; this.vx = Math.abs(this.vx) * 0.6; }
    if (this.x > p7W + m) { this.x = p7W + m; this.vx = -Math.abs(this.vx) * 0.6; }
    if (this.y < -m) { this.y = -m; this.vy = Math.abs(this.vy) * 0.6; }
    if (this.y > p7H + m) { this.y = p7H + m; this.vy = -Math.abs(this.vy) * 0.6; }
  }
  draw(c) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.angle);
    c.scale(this.scale, this.scale);
    drawShape(c, this.myShape, this.color);
    c.restore();
  }
}

function p7SeedSwarm() {
  p7Particles = [];
  for (let i = 0; i < P7_COUNT; i++) p7Particles.push(new P7Bloomie());
}

let p7SelfieSegmentation;

function resizeP7() {
  const prevW = p7W, prevH = p7H;
  p7W = window.innerWidth; p7H = window.innerHeight;
  p7Canvas.width = p7W; p7Canvas.height = p7H;
  p7PersonCanvas.width = p7W; p7PersonCanvas.height = p7H;
  p7PersonBuf.width = p7W; p7PersonBuf.height = p7H;
  /* rescale existing Bloomie positions proportionally instead of
     re-seeding, so the same living swarm persists through resize */
  if (prevW && prevH && p7Particles.length) {
    const sx = p7W / prevW, sy = p7H / prevH;
    p7Particles.forEach(p => { p.x *= sx; p.y *= sy; });
  }
}

function initPage7() {
  p7Started = true;
  resizeP7();
  window.addEventListener('resize', () => { resizeP7(); });
  p7SeedSwarm();

  p7SelfieSegmentation = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  p7SelfieSegmentation.setOptions({ modelSelection: 1 });
  p7SelfieSegmentation.onResults(onP7SelfieResults);

  p7Hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  p7Hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
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
  /* Sample mask in RAW (unmirrored) orientation — p7IsPerson flips x to match */
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

  /* Main canvas: mirrored camera -> living swarm (always-on, never reseeded) */
  p7Ctx.clearRect(0, 0, p7W, p7H);
  p7Ctx.save(); p7Ctx.translate(p7W, 0); p7Ctx.scale(-1, 1);
  p7Ctx.drawImage(results.image, 0, 0, p7W, p7H);
  p7Ctx.restore();
  p7Particles.forEach(p => { p.update(); p.draw(p7Ctx); });

  /* Person drawn on top so the player is always fully visible */
  p7PersonCtx.clearRect(0, 0, p7W, p7H);
  p7PersonCtx.drawImage(p7PersonBuf, 0, 0);
}

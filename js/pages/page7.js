/* ══════════════════ PAGE 7 ENGINE — FULL OF BLOOMIE ══════════════════
   Concept: a living swarm of Bloomie that exists on screen from the
   very beginning and never despawns. No falling, no spawning, no
   score/timer/win condition — purely relaxing play.

   Idle behaviour : gentle organic wander PLUS a soft "homing" pull
                     back toward an evenly-spread home point. This is
                     what keeps the swarm filling the whole screen
                     instead of drifting into a pile against an edge —
                     after a hand pushes/pulls a Bloomie around, the
                     homing force gently brings it back out into open
                     space once the hand lets go.
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
const P7_COUNT            = 520;   // fixed population, never spawns/despawns
const P7_WANDER_SPEED     = 0.55;  // idle drift speed (px/frame at 800w baseline)
const P7_MAX_SPEED        = 7.5;   // hard cap so scatter doesn't fling off-model
const P7_DAMPING          = 0.94;  // velocity decay each frame
const P7_GATHER_RADIUS    = 230;
const P7_GATHER_RADIUS_SQ = P7_GATHER_RADIUS * P7_GATHER_RADIUS;
const P7_SCATTER_RADIUS   = 260;
const P7_SCATTER_RADIUS_SQ= P7_SCATTER_RADIUS * P7_SCATTER_RADIUS;
const P7_GATHER_STRENGTH  = 0.55;
const P7_SCATTER_STRENGTH = 2.6;
const P7_SLOW_HAND_SPEED  = 9;     // px/frame below this = "slow" (gather)
const P7_FAST_HAND_SPEED  = 26;    // px/frame above this = "fast" (scatter)
const P7_PERSON_PUSH      = 3.2;   // how hard Bloomie are steered off the body
const P7_HOME_STRENGTH    = 0.022; // gentle pull back to home point — keeps swarm spread out
const P7_HOME_JITTER_T    = 0.0035;// how fast each Bloomie's home point itself wanders

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

/* ─── Bloomie swarm particle ───
   Each Bloomie gets a "home" position assigned from an evenly-jittered
   grid (not pure random) so the initial fill has no empty gaps or
   accidental clusters. A soft homing force constantly nudges it back
   toward that home — weak enough that hand interaction always wins
   while a hand is active, but strong enough that within a couple of
   seconds after the hand lets go, the swarm redistributes itself back
   across the whole screen instead of piling up wherever it was last
   pushed. The home point itself also drifts slowly over time so the
   "resting" layout isn't perfectly static. */
let p7Particles = [];

const P7_SIZES = [
  { min: 0.34, max: 0.5 },  // small
  { min: 0.55, max: 0.8 },  // medium
  { min: 0.85, max: 1.25 }  // large
];

class P7Bloomie {
  constructor(homeX, homeY) {
    this.color = palette[Math.floor(Math.random() * palette.length)];
    this.myShape = allShapes[Math.floor(Math.random() * allShapes.length)];
    this.x = homeX; this.y = homeY;
    this.homeX = homeX; this.homeY = homeY;

    /* size variety: pick a size band first, then vary within it, so we
       reliably get a mix of small/medium/large rather than a uniform blur */
    const band = P7_SIZES[Math.floor(Math.random() * P7_SIZES.length)];
    this.baseSize = band.min + Math.random() * (band.max - band.min);

    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - .5) * .05;
    this.heading = Math.random() * Math.PI * 2;
    this.headingSpin = (Math.random() - .5) * 0.04;
    this.vx = Math.cos(this.heading) * P7_WANDER_SPEED;
    this.vy = Math.sin(this.heading) * P7_WANDER_SPEED;

    /* home point drifts in its own slow circle so resting layout breathes */
    this.homeAngle = Math.random() * Math.PI * 2;
    this.homeDriftR = 30 + Math.random() * 50;
  }
  update(wScale) {
    this.angle += this.spin;

    /* idle organic wander: heading slowly turns, gently nudges velocity */
    this.heading += this.headingSpin;
    if (Math.random() < 0.01) this.headingSpin = (Math.random() - .5) * 0.04;
    const wanderAx = Math.cos(this.heading) * P7_WANDER_SPEED * wScale;
    const wanderAy = Math.sin(this.heading) * P7_WANDER_SPEED * wScale;
    this.vx += (wanderAx - this.vx) * 0.02;
    this.vy += (wanderAy - this.vy) * 0.02;

    /* slowly drifting home point — keeps the resting swarm gently alive */
    this.homeAngle += P7_HOME_JITTER_T;
    const curHomeX = this.homeX + Math.cos(this.homeAngle) * this.homeDriftR;
    const curHomeY = this.homeY + Math.sin(this.homeAngle) * this.homeDriftR;

    /* hand interaction — independent per hand. We also track how strongly
       ANY hand is currently influencing this particle (0 = untouched,
       1 = fully in a hand's grip) so the homing pull below can back off
       while a hand is actively playing with it, then snap back to full
       strength once hands let go. This is what lets gather/scatter feel
       strong during play while still guaranteeing the swarm redistributes
       across the whole screen afterward instead of clumping at an edge. */
    let handInfluence = 0;
    for (let hi = 0; hi < 2; hi++) {
      const h = p7HandState[hi];
      if (!h.active) continue;
      const dx = this.x - h.x, dy = this.y - h.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > P7_GATHER_RADIUS_SQ && distSq > P7_SCATTER_RADIUS_SQ) continue; // cheap reject, no sqrt
      const dist = Math.sqrt(distSq) || 0.0001;

      if (h.speed <= P7_SLOW_HAND_SPEED && dist < P7_GATHER_RADIUS) {
        const t = 1 - dist / P7_GATHER_RADIUS;
        const pull = P7_GATHER_STRENGTH * t * t;
        this.vx -= (dx / dist) * pull;
        this.vy -= (dy / dist) * pull;
        handInfluence = Math.max(handInfluence, t);
      } else if (h.speed >= P7_FAST_HAND_SPEED && dist < P7_SCATTER_RADIUS) {
        const t = 1 - dist / P7_SCATTER_RADIUS;
        const push = P7_SCATTER_STRENGTH * t * t;
        const hdx = h.vx / (h.speed || 1), hdy = h.vy / (h.speed || 1);
        this.vx += ((dx / dist) * 0.6 + hdx * 0.4) * push;
        this.vy += ((dy / dist) * 0.6 + hdy * 0.4) * push;
        handInfluence = Math.max(handInfluence, t);
      } else if (dist < P7_GATHER_RADIUS) {
        const t = 1 - dist / P7_GATHER_RADIUS;
        this.vx -= (dx / dist) * P7_GATHER_STRENGTH * 0.35 * t;
        this.vy -= (dy / dist) * P7_GATHER_STRENGTH * 0.35 * t;
        handInfluence = Math.max(handInfluence, t * 0.5);
      }
    }

    /* soft homing pull — this is what prevents permanent edge-clumping.
       Scaled down while a hand is actively influencing this particle so
       gather/scatter aren't fought, then ramps back to full strength
       within a moment of the hand releasing it. */
    const homeMul = 1 - handInfluence * 0.85;
    this.vx += (curHomeX - this.x) * P7_HOME_STRENGTH * homeMul;
    this.vy += (curHomeY - this.y) * P7_HOME_STRENGTH * homeMul;

    /* steer around the player's body instead of hugging it */
    if (p7IsPerson(this.x, this.y)) {
      let lx = this.x, rx = this.x;
      while (lx > 0 && p7IsPerson(lx - 1, this.y)) lx--;
      while (rx < p7W - 1 && p7IsPerson(rx + 1, this.y)) rx++;
      const side = (this.x - lx) <= (rx - this.x) ? -1 : 1;
      this.vx += side * P7_PERSON_PUSH * wScale;
      this.vy += (Math.random() - .5) * P7_PERSON_PUSH * 0.4;
    }

    /* damping keeps motion smooth and prevents runaway speeds */
    this.vx *= P7_DAMPING; this.vy *= P7_DAMPING;
    const spSq = this.vx * this.vx + this.vy * this.vy;
    const maxSp = P7_MAX_SPEED * wScale;
    if (spSq > maxSp * maxSp) {
      const sp = Math.sqrt(spSq);
      this.vx = (this.vx / sp) * maxSp; this.vy = (this.vy / sp) * maxSp;
    }

    this.x += this.vx; this.y += this.vy;

    /* hard clamp to screen (homing force keeps this from triggering often) */
    const m = 20;
    if (this.x < -m) { this.x = -m; this.vx = Math.abs(this.vx) * 0.5; }
    if (this.x > p7W + m) { this.x = p7W + m; this.vx = -Math.abs(this.vx) * 0.5; }
    if (this.y < -m) { this.y = -m; this.vy = Math.abs(this.vy) * 0.5; }
    if (this.y > p7H + m) { this.y = p7H + m; this.vy = -Math.abs(this.vy) * 0.5; }
  }
  draw(c, wScale) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.angle);
    const s = this.baseSize * wScale;
    c.scale(s, s);
    drawShape(c, this.myShape, this.color);
    c.restore();
  }
}

/* Evenly-jittered grid seeding: divide the screen into a grid with
   roughly one cell per Bloomie, then place each Bloomie at a random
   point inside its own cell. This guarantees full, even screen
   coverage from frame one — pure Math.random() positions can (and did)
   leave large empty gaps purely by chance. */
function p7SeedSwarm() {
  p7Particles = [];
  const aspect = p7W / p7H || 16 / 9;
  let cols = Math.round(Math.sqrt(P7_COUNT * aspect));
  let rows = Math.ceil(P7_COUNT / cols);
  const cellW = p7W / cols, cellH = p7H / rows;
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

let p7SelfieSegmentation;

function resizeP7() {
  const prevW = p7W, prevH = p7H;
  p7W = window.innerWidth; p7H = window.innerHeight;
  p7Canvas.width = p7W; p7Canvas.height = p7H;
  p7PersonCanvas.width = p7W; p7PersonCanvas.height = p7H;
  p7PersonBuf.width = p7W; p7PersonBuf.height = p7H;
  /* rescale existing Bloomie positions + home points proportionally
     instead of re-seeding, so the same living swarm persists through
     resize without ever "disappearing" */
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
  const wScale = p7W / 800 || 1;
  for (let i = 0; i < p7Particles.length; i++) {
    p7Particles[i].update(wScale);
    p7Particles[i].draw(p7Ctx, wScale);
  }

  /* Person drawn on top so the player is always fully visible */
  p7PersonCtx.clearRect(0, 0, p7W, p7H);
  p7PersonCtx.drawImage(p7PersonBuf, 0, 0);
}

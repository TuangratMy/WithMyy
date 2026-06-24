/* ══════════════════ PAGE 7 — FULL OF BLOOMIE ══════════════════ */
const p7Video        = document.getElementById('p7-video');
const p7Canvas       = document.getElementById('p7-canvas');
const p7Ctx          = p7Canvas.getContext('2d');
const p7PersonCanvas = document.getElementById('p7-person-canvas');
const p7PersonCtx    = p7PersonCanvas.getContext('2d');
const p7Loading      = document.getElementById('p7-loading');

let p7Started = false, p7W = 0, p7H = 0;

/* ─── Tuning ─── */
const P7_COUNT        = 320;
const P7_DAMPING      = 0.88;
const P7_RESTITUTION  = 0.72;
const P7_WALL_BOUNCE  = 0.55;
const P7_HOME_STR     = 0.030;  // pull back to home — keeps screen filled
const P7_HOME_JITTER  = 0.002;
const P7_BODY_STR     = 6.0;    // how hard body pushes bloomie
const P7_HAND_STR     = 4.5;    // how hard fast hand pushes bloomie
const P7_HAND_R       = 200;    // px — hand push radius
const P7_HAND_SPD     = 12;     // min hand speed to trigger push
const P7_MAX_SPD      = 20;

/* ─── Mask ─── */
const P7_MW = 60, P7_MH = 45;
const p7SampC = document.createElement('canvas');
p7SampC.width = P7_MW; p7SampC.height = P7_MH;
const p7SampX = p7SampC.getContext('2d');
let p7MaskData = null, p7PrevMask = null, p7BodyMoving = 0;
const p7PersonBuf    = document.createElement('canvas');
const p7PersonBufCtx = p7PersonBuf.getContext('2d');

function p7IsPerson(cx, cy) {
  if (!p7MaskData || cx < 0 || cy < 0 || cx >= p7W || cy >= p7H) return false;
  const mx = p7W - 1 - cx;
  const mi = (Math.floor((cy / p7H) * P7_MH) * P7_MW + Math.floor((mx / p7W) * P7_MW)) * 4;
  return p7MaskData[mi] > 80;
}

/* ─── Hands ─── */
let p7Hands, p7Camera, p7SelfieSegmentation;
let p7HandState = [
  { x:0, y:0, vx:0, vy:0, speed:0, active:false },
  { x:0, y:0, vx:0, vy:0, speed:0, active:false }
];
function onP7HandResults(results) {
  const seen = [false, false];
  if (results.multiHandLandmarks) {
    for (let i = 0; i < Math.min(2, results.multiHandLandmarks.length); i++) {
      const lm = results.multiHandLandmarks[i][9];
      const nx = (1 - lm.x) * p7W, ny = lm.y * p7H;
      const h = p7HandState[i];
      if (h.active) { h.vx = nx - h.x; h.vy = ny - h.y; h.speed = Math.sqrt(h.vx*h.vx+h.vy*h.vy); }
      else { h.vx=0; h.vy=0; h.speed=0; }
      h.x=nx; h.y=ny; h.active=true; seen[i]=true;
    }
  }
  for (let i=0;i<2;i++) if (!seen[i]) { p7HandState[i].active=false; p7HandState[i].speed=0; }
}

/* ─── Particle ─── */
let p7Particles = [];
const P7_BANDS = [0.28, 0.38, 0.52];

class P7Bloomie {
  constructor(hx, hy) {
    this.color    = palette[Math.floor(Math.random()*palette.length)];
    this.myShape  = allShapes[Math.floor(Math.random()*allShapes.length)];
    this.homeX    = hx; this.homeY = hy;
    this.x        = hx + (Math.random()-0.5)*60;
    this.y        = hy + (Math.random()-0.5)*60;
    this.vx       = (Math.random()-0.5)*0.8;
    this.vy       = (Math.random()-0.5)*0.8;
    this.baseSize = P7_BANDS[Math.floor(Math.random()*P7_BANDS.length)];
    this.r        = this.baseSize * 18;
    this.angle    = Math.random()*Math.PI*2;
    this.spin     = (Math.random()-0.5)*0.05;
    this.homeAngle= Math.random()*Math.PI*2;
    this.homeDrift= 18 + Math.random()*28;
  }

  update(wScale) {
    this.angle += this.spin;
    const r = this.r * wScale;

    /* ── body push ── */
    let bpx=0, bpy=0, bhits=0;
    const sr = r * 2.2;
    for (let s=0; s<8; s++) {
      const a = (s/8)*Math.PI*2;
      if (p7IsPerson(this.x + Math.cos(a)*sr*0.5, this.y + Math.sin(a)*sr*0.5)) {
        bpx += Math.cos(a+Math.PI); bpy += Math.sin(a+Math.PI); bhits++;
      }
    }
    if (bhits > 0) {
      const boost = 1 + p7BodyMoving * 6;
      const mag = Math.sqrt(bpx*bpx+bpy*bpy)||1;
      this.vx += (bpx/mag)*P7_BODY_STR*boost*wScale;
      this.vy += (bpy/mag)*P7_BODY_STR*boost*wScale;
    } else if (p7IsPerson(this.x, this.y)) {
      const a = Math.random()*Math.PI*2;
      this.vx += Math.cos(a)*P7_BODY_STR*2*wScale;
      this.vy += Math.sin(a)*P7_BODY_STR*2*wScale;
    }

    /* ── hand push ── */
    for (let hi=0; hi<2; hi++) {
      const h = p7HandState[hi];
      if (!h.active || h.speed < P7_HAND_SPD) continue;
      const dx=this.x-h.x, dy=this.y-h.y;
      const dist=Math.sqrt(dx*dx+dy*dy)||0.001;
      if (dist > P7_HAND_R*wScale) continue;
      const t = 1 - dist/(P7_HAND_R*wScale);
      const hdx=h.vx/h.speed, hdy=h.vy/h.speed;
      this.vx += ((dx/dist)*0.5 + hdx*0.5)*P7_HAND_STR*t*t*wScale;
      this.vy += ((dy/dist)*0.5 + hdy*0.5)*P7_HAND_STR*t*t*wScale;
    }

    /* ── homing — pulls back to spread position ── */
    this.homeAngle += P7_HOME_JITTER;
    const hx = this.homeX + Math.cos(this.homeAngle)*this.homeDrift;
    const hy = this.homeY + Math.sin(this.homeAngle)*this.homeDrift;
    this.vx += (hx - this.x)*P7_HOME_STR;
    this.vy += (hy - this.y)*P7_HOME_STR;

    /* damping + cap */
    this.vx *= P7_DAMPING; this.vy *= P7_DAMPING;
    const spd = Math.sqrt(this.vx*this.vx+this.vy*this.vy);
    const maxS = P7_MAX_SPD*wScale;
    if (spd > maxS) { this.vx=(this.vx/spd)*maxS; this.vy=(this.vy/spd)*maxS; }

    this.x += this.vx; this.y += this.vy;

    /* walls */
    if (this.x-r<0)   { this.x=r;       this.vx= Math.abs(this.vx)*P7_WALL_BOUNCE; }
    if (this.x+r>p7W) { this.x=p7W-r;   this.vx=-Math.abs(this.vx)*P7_WALL_BOUNCE; }
    if (this.y-r<0)   { this.y=r;        this.vy= Math.abs(this.vy)*P7_WALL_BOUNCE; }
    if (this.y+r>p7H) { this.y=p7H-r;   this.vy=-Math.abs(this.vy)*P7_WALL_BOUNCE; }
  }

  draw(c, wScale) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.angle);
    c.scale(this.baseSize*wScale, this.baseSize*wScale);
    drawShape(c, this.myShape, this.color);
    c.restore();
  }
}

/* ─── Seed: jittered grid ACROSS ENTIRE SCREEN ─── */
function p7SeedSwarm() {
  p7Particles = [];
  const aspect = p7W/p7H || 16/9;
  const cols = Math.round(Math.sqrt(P7_COUNT*aspect));
  const rows = Math.ceil(P7_COUNT/cols);
  const cW = p7W/cols, cH = p7H/rows;
  let n = 0;
  for (let r=0; r<rows && n<P7_COUNT; r++)
    for (let c=0; c<cols && n<P7_COUNT; c++) {
      p7Particles.push(new P7Bloomie(
        c*cW + cW*0.1 + Math.random()*cW*0.8,
        r*cH + cH*0.1 + Math.random()*cH*0.8
      ));
      n++;
    }
}

/* ─── Ball collisions (spatial grid) ─── */
const p7Grid = new Map();
function p7ResolveCollisions(wScale) {
  const n = p7Particles.length; if (n<2) return;
  const cell = 0.52*18*wScale*2.5;
  p7Grid.clear();
  for (let i=0;i<n;i++) {
    const p=p7Particles[i], key=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);
    let b=p7Grid.get(key); if(!b){b=[];p7Grid.set(key,b);} b.push(i);
  }
  for (let i=0;i<n;i++) {
    const a=p7Particles[i], ar=a.r*wScale;
    const acx=Math.floor(a.x/cell), acy=Math.floor(a.y/cell);
    for (let cy=acy-1;cy<=acy+1;cy++) for (let cx=acx-1;cx<=acx+1;cx++) {
      const bkt=p7Grid.get(cx+','+cy); if(!bkt) continue;
      for (let bi=0;bi<bkt.length;bi++) {
        const j=bkt[bi]; if(j<=i) continue;
        const b=p7Particles[j], br=b.r*wScale, minD=ar+br;
        const dx=b.x-a.x, dy=b.y-a.y, dSq=dx*dx+dy*dy;
        if (dSq>=minD*minD||dSq<1e-8) continue;
        const dist=Math.sqrt(dSq), nx=dx/dist, ny=dy/dist, ov=minD-dist;
        const mA=ar*ar, mB=br*br, mT=mA+mB;
        a.x-=nx*ov*(mB/mT); a.y-=ny*ov*(mB/mT);
        b.x+=nx*ov*(mA/mT); b.y+=ny*ov*(mA/mT);
        const rvx=b.vx-a.vx, rvy=b.vy-a.vy, rv=rvx*nx+rvy*ny;
        if (rv<0) {
          const imp=-(1+P7_RESTITUTION)*rv/(1/mA+1/mB);
          a.vx-=imp*nx/mA; a.vy-=imp*ny/mA;
          b.vx+=imp*nx/mB; b.vy+=imp*ny/mB;
        }
      }
    }
  }
}

/* ─── Resize ─── */
function resizeP7() {
  const pw=p7W, ph=p7H;
  p7W=window.innerWidth; p7H=window.innerHeight;
  p7Canvas.width=p7W; p7Canvas.height=p7H;
  p7PersonCanvas.width=p7W; p7PersonCanvas.height=p7H;
  p7PersonBuf.width=p7W; p7PersonBuf.height=p7H;
  if (pw&&ph&&p7Particles.length) {
    const sx=p7W/pw, sy=p7H/ph;
    p7Particles.forEach(p=>{p.x*=sx;p.y*=sy;p.homeX*=sx;p.homeY*=sy;});
  }
}

/* ─── Init ─── */
function initPage7() {
  p7Started=true; resizeP7();
  window.addEventListener('resize', resizeP7);
  p7SeedSwarm();

  p7SelfieSegmentation = new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  p7SelfieSegmentation.setOptions({modelSelection:1});
  p7SelfieSegmentation.onResults(onP7SelfieResults);

  p7Hands = new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
  p7Hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:0.6,minTrackingConfidence:0.5});
  p7Hands.onResults(onP7HandResults);

  p7Camera = new Camera(p7Video, {
    onFrame: async()=>{ await p7SelfieSegmentation.send({image:p7Video}); await p7Hands.send({image:p7Video}); },
    width:1280, height:720
  });
  p7Camera.start().then(()=>{ p7Loading.style.display='none'; });
}

/* ─── Per frame ─── */
function onP7SelfieResults(results) {
  /* mask + movement */
  p7SampX.clearRect(0,0,P7_MW,P7_MH);
  p7SampX.drawImage(results.segmentationMask,0,0,P7_MW,P7_MH);
  p7PrevMask = p7MaskData;
  p7MaskData = p7SampX.getImageData(0,0,P7_MW,P7_MH).data;
  if (p7PrevMask) {
    let diff=0; const len=P7_MW*P7_MH;
    for (let i=0;i<len;i++) { const a=p7PrevMask[i*4]>80?1:0, b=p7MaskData[i*4]>80?1:0; if(a!==b)diff++; }
    const raw = diff/len;
    p7BodyMoving = Math.max(p7BodyMoving*0.65, Math.min(1, raw*25));
  }

  /* person cutout */
  p7PersonBufCtx.clearRect(0,0,p7W,p7H);
  p7PersonBufCtx.save(); p7PersonBufCtx.translate(p7W,0); p7PersonBufCtx.scale(-1,1);
  p7PersonBufCtx.drawImage(results.segmentationMask,0,0,p7W,p7H); p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation='source-in';
  p7PersonBufCtx.save(); p7PersonBufCtx.translate(p7W,0); p7PersonBufCtx.scale(-1,1);
  p7PersonBufCtx.drawImage(results.image,0,0,p7W,p7H); p7PersonBufCtx.restore();
  p7PersonBufCtx.globalCompositeOperation='source-over';

  /* camera */
  p7Ctx.clearRect(0,0,p7W,p7H);
  p7Ctx.save(); p7Ctx.translate(p7W,0); p7Ctx.scale(-1,1);
  p7Ctx.drawImage(results.image,0,0,p7W,p7H); p7Ctx.restore();

  /* bloomie */
  const wScale = p7W/800||1;
  for (let i=0;i<p7Particles.length;i++) p7Particles[i].update(wScale);
  p7ResolveCollisions(wScale);
  for (let i=0;i<p7Particles.length;i++) p7Particles[i].draw(p7Ctx,wScale);

  /* person on top */
  p7PersonCtx.clearRect(0,0,p7W,p7H);
  p7PersonCtx.drawImage(p7PersonBuf,0,0);
}

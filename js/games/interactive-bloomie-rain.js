/* ══════════════════════════════════════════════
   PAGE 5 — BLOOMIE RAIN CATCHER ENGINE
   2-hand tracking: each hand's index+thumb pinch = catch
══════════════════════════════════════════════ */
/* Element references resolved lazily in initPage5 to avoid null refs
   (page5 HTML is injected after this script block) */
let p5Video, p5Canvas, p5Ctx, p5PersonCanvas, p5PersonCtx, p5Overlay, p5OCtx;

let p5W=0, p5H=0, p5Started=false;

const p5SampC=document.createElement('canvas'); p5SampC.width=MW; p5SampC.height=MH;
const p5SampX=p5SampC.getContext('2d');
let p5MaskData=null;
const p5PersonBuf=document.createElement('canvas');
const p5PersonBufCtx=p5PersonBuf.getContext('2d');

function p5IsPerson(cx,cy){
  if(!p5MaskData||cx<0||cy<0||cx>=p5W||cy>=p5H) return false;
  const mx=p5W-1-cx;
  return p5MaskData[(Math.floor((cy/p5H)*MH)*MW+Math.floor((mx/p5W)*MW))*4]>100;
}
function p5FindEdge(cx,cy){
  let lx=cx,rx=cx;
  while(lx>0&&p5IsPerson(lx-1,cy))lx--;
  while(rx<p5W-1&&p5IsPerson(rx+1,cy))rx++;
  return (cx-lx)<=(rx-cx)?{side:-1}:{side:1};
}

/* Game state */
let p5PlayerName='', p5Score=0, p5TimeLeft=60, p5GameActive=false;
let p5TimerInterval=null;

/* Particles */
let p5Particles=[];
const P5_DENSITY=150, P5_SPEED=4;

class P5Particle {
  constructor(ry=true){
    this.color=palette[Math.floor(Math.random()*palette.length)];
    this.shape=allShapes[Math.floor(Math.random()*allShapes.length)];
    this.reset(ry);
  }
  reset(ry=false){
    this.x=Math.random()*p5W; this.y=ry?Math.random()*p5H:-40;
    this.scale=(Math.random()*.35+.5)*(p5W/800);
    this.angle=Math.random()*Math.PI*2; this.spin=(Math.random()-.5)*.06;
    this.state='falling'; this.hugDir=0; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60;
    this.caught=false; this.catchAnim=0; this.vx=(Math.random()-.5)*0.5;
  }
  update(){
    if(this.caught){ this.catchAnim++; return; }
    const s=P5_SPEED*(p5W/800); this.angle+=this.spin; this.x+=this.vx;
    if(this.state==='falling'){
      const ny=this.y+s;
      if(p5IsPerson(this.x,ny)){ this.state='hugging'; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60; const{side}=p5FindEdge(this.x,this.y); this.hugDir=side; }
      else { this.y=ny; }
    } else {
      this.hugFrames++; this.x+=this.hugDir*1.8*(p5W/800);
      const ny=this.y+s*.5;
      if(!p5IsPerson(this.x,ny+4)){ this.y=ny; this.state='falling'; }
      else { this.y=ny; const{side}=p5FindEdge(this.x,this.y); if(side===this.hugDir){ this.x+=this.hugDir*2; } else { this.state='falling'; } }
      if(this.hugFrames>this.hugMax) this.state='falling';
      this.x=Math.max(-20,Math.min(p5W+20,this.x));
    }
    if(this.y>p5H+60) this.reset(false);
  }
  draw(c){
    if(this.caught){
      const prog=this.catchAnim/20;
      c.save(); c.translate(this.x,this.y); c.rotate(this.angle);
      c.scale(this.scale*(1+prog*1.5),this.scale*(1+prog*1.5));
      c.globalAlpha=Math.max(0,1-prog); drawShape(c,this.shape,this.color); c.globalAlpha=1; c.restore();
      return;
    }
    c.save(); c.translate(this.x,this.y); c.rotate(this.angle); c.scale(this.scale,this.scale);
    drawShape(c,this.shape,this.color); c.restore();
  }
}

function p5AdjustParticles(){
  while(p5Particles.length<P5_DENSITY) p5Particles.push(new P5Particle(true));
}

/* 2-hand state */
let p5HandsState=[
  {indexTip:null,thumbTip:null,pinching:false,pinchProgress:0,cx:0,cy:0,lastPinch:false,cooldown:0},
  {indexTip:null,thumbTip:null,pinching:false,pinchProgress:0,cx:0,cy:0,lastPinch:false,cooldown:0}
];
let p5Bursts=[];

function onP5HandResults(results){
  p5HandsState.forEach(h=>{h.indexTip=null;h.thumbTip=null;});
  if(!results.multiHandLandmarks) return;
  results.multiHandLandmarks.forEach((lm,i)=>{
    if(i>1) return;
    const h=p5HandsState[i];
    const toC=(lmx,lmy)=>({x:(1-lmx)*p5W,y:lmy*p5H});
    h.indexTip=toC(lm[8].x,lm[8].y); h.thumbTip=toC(lm[4].x,lm[4].y);
    h.cx=(h.indexTip.x+h.thumbTip.x)/2; h.cy=(h.indexTip.y+h.thumbTip.y)/2;
    const dx=lm[8].x-lm[4].x,dy=lm[8].y-lm[4].y,dist=Math.sqrt(dx*dx+dy*dy);
    h.pinchProgress=Math.max(0,Math.min(1,1-(dist-0.045)/0.03));
    const nowPinch=dist<0.045;
    if(nowPinch&&!h.lastPinch&&h.cooldown<=0&&p5GameActive){
      h.pinching=true; p5TryCatch(h.cx,h.cy); h.cooldown=18;
    } else { h.pinching=false; }
    h.lastPinch=nowPinch; if(h.cooldown>0)h.cooldown--;
  });
}

const CATCH_RADIUS=80;
function p5TryCatch(cx,cy){
  let best=null,bestD=CATCH_RADIUS*(p5W/800)*1.5;
  for(const p of p5Particles){
    if(p.caught) continue;
    const d=Math.hypot(p.x-cx,p.y-cy); if(d<bestD){bestD=d;best=p;}
  }
  if(best){
    best.caught=true; p5Score++;
    document.getElementById('p5-score').textContent=p5Score;
    p5Bursts.push({x:best.x,y:best.y,color:best.color,frame:0});
    setTimeout(()=>{ const idx=p5Particles.indexOf(best); if(idx>-1){p5Particles.splice(idx,1);p5Particles.push(new P5Particle(false));} },400);
  }
}

/* Game flow */
function p5SubmitName(){
  const val=document.getElementById('p5-name-input').value.trim();
  p5PlayerName=val||'Friend';
  document.getElementById('p5-name-wrap').style.display='none';
  document.getElementById('p5-howto-wrap').style.display='flex';
}
/* Bind name-input Enter key after DOM is built */
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('p5-name-input');
  if(inp) inp.addEventListener('keydown',e=>{if(e.key==='Enter')p5SubmitName();});
});

const countdownSteps=[
  {num:'3',cue:'Bloomies are on their way...'},
  {num:'2',cue:'Get your fingers ready!'},
  {num:'1',cue:'Catch them all!'},
  {num:'GO!',cue:'Let the Bloomie rain begin!',go:true},
];

function p5StartCountdown(){
  document.getElementById('p5-howto-wrap').style.display='none';
  const wrap=document.getElementById('p5-countdown-wrap'); wrap.style.display='flex';
  const numEl=document.getElementById('p5-count-num'), cueEl=document.getElementById('p5-count-cue');
  let step=0;
  function tick(){
    const s=countdownSteps[step];
    numEl.className='p5-num'+(s.go?' go':'');
    numEl.style.animation='none'; void numEl.offsetWidth; numEl.style.animation='';
    numEl.textContent=s.num; cueEl.textContent=s.cue;
    step++;
    if(step<countdownSteps.length){setTimeout(tick,1000);}
    else{setTimeout(()=>{wrap.style.display='none';p5BeginGame();},900);}
  }
  tick();
}

function p5BeginGame(){
  p5Score=0; p5TimeLeft=60; p5GameActive=true;
  document.getElementById('p5-score').textContent='0';
  document.getElementById('p5-timer').textContent='1:00';
  document.getElementById('p5-timer').className='p5-hud-val';
  document.getElementById('p5-hud').style.display='flex';
  p5AdjustParticles();
  p5TimerInterval=setInterval(()=>{
    p5TimeLeft--;
    const m=Math.floor(p5TimeLeft/60),s=p5TimeLeft%60;
    document.getElementById('p5-timer').textContent=m+':'+(s<10?'0':'')+s;
    if(p5TimeLeft<=5){ document.getElementById('p5-timer').className='p5-hud-val danger'; p5ShowAlert('Just a few seconds left!'); }
    else if(p5TimeLeft<=10){ document.getElementById('p5-timer').className='p5-hud-val warning'; p5ShowAlert('The Bloomies are drifting away!'); }
    if(p5TimeLeft<=0){clearInterval(p5TimerInterval);p5EndGame();}
  },1000);
}

let alertTimeout5=null;
function p5ShowAlert(msg){
  const el=document.getElementById('p5-alert');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(alertTimeout5);
  alertTimeout5=setTimeout(()=>el.classList.remove('show'),2500);
}

function p5EndGame(){
  p5GameActive=false;
  document.getElementById('p5-hud').style.display='none';
  p5ShowAlert('The Bloomie rain has stopped.');
  setTimeout(()=>{ document.getElementById('p5-alert').classList.remove('show'); p5ShowResult(); },1800);
}

function p5ShowResult(){
  const sc=p5Score;
  const msg=sc<=10?'Every Bloomie counts. Thanks for catching them today.':
            sc<=30?'Nice catch! The Bloomies are happy you found them.':
            sc<=50?'Great job! You saved a beautiful shower of Bloomies.':
            sc<=80?"Amazing! You're a true Bloomie Catcher.":
                   "Incredible! Not a single Bloomie wanted to escape you today.";
  document.getElementById('p5-result-name').textContent='Well Done, '+p5PlayerName+'!';
  document.getElementById('p5-result-score').textContent=sc;
  document.getElementById('p5-result-msg').textContent=msg;
  document.getElementById('p5-result-wrap').style.display='flex';
}

function p5PlayAgain(){
  document.getElementById('p5-result-wrap').style.display='none';
  p5Particles.forEach(p=>p.reset(true));
  p5StartCountdown();
}

function p5Exit(){
  p5GameActive=false; clearInterval(p5TimerInterval);
  ['p5-hud','p5-result-wrap','p5-countdown-wrap','p5-howto-wrap'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('p5-name-wrap').style.display='flex';
  document.getElementById('p5-name-input').value='';
  goTo('page2');
}

/* p5ForceExit — ใช้โดย header button และปุ่ม Return to Joy ในหน้า name card */
function p5ForceExit(){
  p5Exit();
}

function p5RenderLoop(){
  if(!document.getElementById('page5').classList.contains('active')){requestAnimationFrame(p5RenderLoop);return;}
  p5OCtx.clearRect(0,0,p5W,p5H);
  /* Burst FX */
  p5Bursts=p5Bursts.filter(b=>{
    const prog=b.frame/25;
    for(let i=0;i<8;i++){
      const a=(i/8)*Math.PI*2,r=prog*60;
      p5OCtx.beginPath(); p5OCtx.arc(b.x+Math.cos(a)*r,b.y+Math.sin(a)*r,6*(1-prog),0,Math.PI*2);
      p5OCtx.fillStyle=b.color; p5OCtx.globalAlpha=1-prog; p5OCtx.fill(); p5OCtx.globalAlpha=1;
    }
    p5OCtx.font=`bold ${Math.round(p5W/45)}px 'Manrope'`;
    p5OCtx.fillStyle='#fff'; p5OCtx.textAlign='center';
    p5OCtx.globalAlpha=Math.max(0,1-prog*1.5);
    p5OCtx.fillText('+1',b.x,b.y-prog*50); p5OCtx.globalAlpha=1;
    b.frame++; return b.frame<25;
  });
  /* Hand cursors */
  p5HandsState.forEach(h=>{
    if(!h.indexTip||!h.thumbTip) return;
    const pf=h.pinchProgress;
    p5OCtx.beginPath(); p5OCtx.moveTo(h.indexTip.x,h.indexTip.y); p5OCtx.lineTo(h.thumbTip.x,h.thumbTip.y);
    p5OCtx.strokeStyle=`rgba(255,255,255,${0.2+pf*0.5})`; p5OCtx.lineWidth=2; p5OCtx.setLineDash([4,4]); p5OCtx.stroke(); p5OCtx.setLineDash([]);
    [h.indexTip,h.thumbTip].forEach(tip=>{
      p5OCtx.beginPath(); p5OCtx.arc(tip.x,tip.y,22,0,Math.PI*2); p5OCtx.fillStyle=`rgba(252,202,89,${0.1+pf*0.3})`; p5OCtx.fill();
      p5OCtx.beginPath(); p5OCtx.arc(tip.x,tip.y,22,-Math.PI/2,-Math.PI/2+Math.PI*2*pf);
      p5OCtx.strokeStyle=pf>0.85?'#FCCA59':'rgba(255,255,255,0.85)'; p5OCtx.lineWidth=3; p5OCtx.lineCap='round'; p5OCtx.stroke();
      p5OCtx.beginPath(); p5OCtx.arc(tip.x,tip.y,5,0,Math.PI*2); p5OCtx.fillStyle='#fff'; p5OCtx.fill();
    });
    const R=h.pinching?16:12;
    p5OCtx.beginPath(); p5OCtx.arc(h.cx,h.cy,R,0,Math.PI*2);
    p5OCtx.fillStyle=h.pinching?'rgba(252,202,89,0.9)':'rgba(255,255,255,0.8)'; p5OCtx.fill();
    p5OCtx.beginPath(); p5OCtx.arc(h.cx,h.cy,R,0,Math.PI*2);
    p5OCtx.strokeStyle=h.pinching?'#F5793B':'rgba(255,255,255,0.4)'; p5OCtx.lineWidth=2; p5OCtx.stroke();
  });
  requestAnimationFrame(p5RenderLoop);
}

/* Selfie + Hands for page 5 */
let p5SelfieSegmentation, p5HandsMp, p5Camera5;

function onP5SelfieResults(results){
  p5SampX.clearRect(0,0,MW,MH); p5SampX.drawImage(results.segmentationMask,0,0,MW,MH);
  p5MaskData=p5SampX.getImageData(0,0,MW,MH).data;
  p5PersonBufCtx.clearRect(0,0,p5W,p5H);
  p5PersonBufCtx.save(); p5PersonBufCtx.translate(p5W,0); p5PersonBufCtx.scale(-1,1);
  p5PersonBufCtx.drawImage(results.segmentationMask,0,0,p5W,p5H); p5PersonBufCtx.restore();
  p5PersonBufCtx.globalCompositeOperation='source-in';
  p5PersonBufCtx.save(); p5PersonBufCtx.translate(p5W,0); p5PersonBufCtx.scale(-1,1);
  p5PersonBufCtx.drawImage(results.image,0,0,p5W,p5H); p5PersonBufCtx.restore();
  p5PersonBufCtx.globalCompositeOperation='source-over';
  p5Ctx.clearRect(0,0,p5W,p5H);
  p5Ctx.save(); p5Ctx.translate(p5W,0); p5Ctx.scale(-1,1);
  p5Ctx.drawImage(results.image,0,0,p5W,p5H); p5Ctx.restore();
  p5Particles.forEach(p=>{p.update();p.draw(p5Ctx);});
  p5PersonCtx.clearRect(0,0,p5W,p5H); p5PersonCtx.drawImage(p5PersonBuf,0,0);
}

function resizeP5(){
  p5W=window.innerWidth; p5H=window.innerHeight;
  [p5Canvas,p5PersonCanvas,p5Overlay,p5PersonBuf].forEach(c=>{c.width=p5W;c.height=p5H;});
  p5SampC.width=MW; p5SampC.height=MH;
}

function initPage5(){
  /* Resolve element references now that the page5 DOM is available */
  p5Video        = document.getElementById('p5-video');
  p5Canvas       = document.getElementById('p5-canvas');
  p5Ctx          = p5Canvas.getContext('2d');
  p5PersonCanvas = document.getElementById('p5-person-canvas');
  p5PersonCtx    = p5PersonCanvas.getContext('2d');
  p5Overlay      = document.getElementById('p5-overlay');
  p5OCtx         = p5Overlay.getContext('2d');

  p5Started=true; resizeP5();
  window.addEventListener('resize',resizeP5);
  p5AdjustParticles();
  p5SelfieSegmentation=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  p5SelfieSegmentation.setOptions({modelSelection:1});
  p5SelfieSegmentation.onResults(onP5SelfieResults);
  p5HandsMp=new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
  p5HandsMp.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:0.7,minTrackingConfidence:0.6});
  p5HandsMp.onResults(onP5HandResults);
  p5Camera5=new Camera(p5Video,{
    onFrame:async()=>{ await p5SelfieSegmentation.send({image:p5Video}); await p5HandsMp.send({image:p5Video}); },
    width:1280,height:720
  });
  p5Camera5.start();
  p5RenderLoop();
}

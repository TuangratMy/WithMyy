/* ══════════════════ PAGE 4 ENGINE ══════════════════
   Architecture:
   - p4Canvas: camera feed drawn in JS (flipped) + particles
   - p4PersonCanvas: person cutout on top (so person appears in front of particles)
   - p4Overlay: hand circles drawn here (no flip, coords already converted)
   - SelfieSegmentation for body detection
   - MediaPipe Hands for finger tracking
══════════════════════════════════════════════════ */
const p4Video         = document.getElementById('p4-video');
const p4Canvas        = document.getElementById('p4-canvas');
const p4Ctx           = p4Canvas.getContext('2d');
const p4PersonCanvas  = document.getElementById('p4-person-canvas');
const p4PersonCtx     = p4PersonCanvas.getContext('2d');
const p4Overlay       = document.getElementById('p4-overlay');
const p4OCtx          = p4Overlay.getContext('2d');
const p4Loading       = document.getElementById('p4-loading');
const p4DensitySlider = document.getElementById('p4DensitySlider');
const p4SizeSlider    = document.getElementById('p4SizeSlider');
const p4SpeedSlider   = document.getElementById('p4SpeedSlider');
const p4ShapeBtns     = document.querySelectorAll('#p4ShapeGrid .shape-btn');
const p4MixedBtn      = document.getElementById('p4MixedBtn');

let p4Started=false, p4W=0, p4H=0;

/* Mask data — uses same MW/MH as p3 but separate buffers */
const p4SampC=document.createElement('canvas'); p4SampC.width=MW; p4SampC.height=MH;
const p4SampX=p4SampC.getContext('2d');
let p4MaskData=null;
const p4PersonBuf=document.createElement('canvas');
const p4PersonBufCtx=p4PersonBuf.getContext('2d');

function p4IsPerson(cx,cy){
  if(!p4MaskData||cx<0||cy<0||cx>=p4W||cy>=p4H)return false;
  /* Canvas is drawn mirrored, so flip x back to match raw mask coords */
  const mx = p4W - 1 - cx;
  return p4MaskData[(Math.floor((cy/p4H)*MH)*MW+Math.floor((mx/p4W)*MW))*4]>100;
}
function p4FindEdge(cx,cy){
  let lx=cx,rx=cx;
  while(lx>0&&p4IsPerson(lx-1,cy))lx--;
  while(rx<p4W-1&&p4IsPerson(rx+1,cy))rx++;
  return (cx-lx)<=(rx-cx)?{side:-1,edgeX:lx}:{side:1,edgeX:rx};
}

/* Particles */
let p4Particles=[],P4_SHAPE='star',P4_MIXED=false;
class P4Particle {
  constructor(ry=true){ this.color=palette[Math.floor(Math.random()*palette.length)]; this.reset(ry); }
  reset(ry=false){
    this.x=Math.random()*p4W; this.y=ry?Math.random()*p4H:-40;
    const sb=parseInt(p4SizeSlider.value)/80; this.scale=(Math.random()*.35+.5)*sb*(p4W/800);
    this.angle=Math.random()*Math.PI*2; this.spin=(Math.random()-.5)*.06;
    this.state='falling'; this.hugDir=0; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60;
    this.myShape=P4_MIXED?allShapes[Math.floor(Math.random()*allShapes.length)]:P4_SHAPE;
  }
  update(){
    const s=parseFloat(p4SpeedSlider.value)*(p4W/800); this.angle+=this.spin;
    if(this.state==='falling'){
      const ny=this.y+s;
      if(p4IsPerson(this.x,ny)){ this.state='hugging'; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60; const{side}=p4FindEdge(this.x,this.y); this.hugDir=side; }
      else { this.y=ny; }
    } else {
      this.hugFrames++; this.x+=this.hugDir*1.8*(p4W/800);
      const ny=this.y+s*.5;
      if(!p4IsPerson(this.x,ny+4)){ this.y=ny; this.state='falling'; }
      else { this.y=ny; const{side}=p4FindEdge(this.x,this.y); if(side===this.hugDir){ this.x+=this.hugDir*2; } else { this.state='falling'; } }
      if(this.hugFrames>this.hugMax) this.state='falling';
      this.x=Math.max(-20,Math.min(p4W+20,this.x));
    }
    if(this.y>p4H+60) this.reset(false);
  }
  draw(c){ c.save(); c.translate(this.x,this.y); c.rotate(this.angle); c.scale(this.scale,this.scale); drawShape(c,this.myShape,this.color); c.restore(); }
}

function p4AdjustParticles(){ const t=parseInt(p4DensitySlider.value); while(p4Particles.length<t)p4Particles.push(new P4Particle(true)); if(p4Particles.length>t)p4Particles.length=t; }

/* Hand state */
let handState={ indexTip:null, thumbTip:null, pinchProgress:0, pinching:false, cursorX:0, cursorY:0 };
const PINCH_CLOSE=0.045, PINCH_OPEN=0.075;
let pinchCooldown=0, lastPinch=false;

/* Slider drag state */
let sliderDrag={ active:false, slider:null, startX:0, startVal:0 };

/* Hand results — coords already flipped to match JS-mirrored canvas */
function onHandResults(results){
  if(!results.multiHandLandmarks||results.multiHandLandmarks.length===0){
    handState.indexTip=null; handState.thumbTip=null; handState.pinching=false;
    if(sliderDrag.active) sliderDrag.active=false;
    return;
  }
  const lm=results.multiHandLandmarks[0];
  const toCanvas=(lmx,lmy)=>({ x:(1-lmx)*p4W, y:lmy*p4H });
  const idx=toCanvas(lm[8].x,lm[8].y);
  const thumb=toCanvas(lm[4].x,lm[4].y);
  handState.indexTip=idx; handState.thumbTip=thumb;
  handState.cursorX=(idx.x+thumb.x)/2; handState.cursorY=(idx.y+thumb.y)/2;

  const dx=lm[8].x-lm[4].x, dy=lm[8].y-lm[4].y, dist=Math.sqrt(dx*dx+dy*dy);
  handState.pinchProgress=Math.max(0,Math.min(1,1-(dist-PINCH_CLOSE)/(PINCH_OPEN-PINCH_CLOSE)));

  const nowPinch=dist<PINCH_CLOSE;

  if(nowPinch){
    /* If already dragging a slider, update its value based on horizontal movement */
    if(sliderDrag.active && sliderDrag.slider){
      const r=sliderDrag.slider.getBoundingClientRect();
      const camRect=document.querySelector('.p4-cam-zone').getBoundingClientRect();
      const pageX=camRect.left+handState.cursorX;
      /* Map cursor x within slider track to value */
      const ratio=Math.max(0,Math.min(1,(pageX-r.left)/r.width));
      const min=parseFloat(sliderDrag.slider.min), max=parseFloat(sliderDrag.slider.max);
      sliderDrag.slider.value=min+ratio*(max-min);
      sliderDrag.slider.dispatchEvent(new Event('input'));
    } else if(!lastPinch && pinchCooldown<=0){
      /* New pinch — check if over a slider or button */
      const camRect=document.querySelector('.p4-cam-zone').getBoundingClientRect();
      const pageX=camRect.left+handState.cursorX, pageY=camRect.top+handState.cursorY;

      /* Check sliders first */
      let hitSlider=false;
      for(const sl of [p4DensitySlider,p4SizeSlider,p4SpeedSlider]){
        const r=sl.getBoundingClientRect();
        /* Expand hit area vertically ±20px for easier grabbing */
        if(pageX>=r.left&&pageX<=r.right&&pageY>=r.top-20&&pageY<=r.bottom+20){
          sliderDrag.active=true; sliderDrag.slider=sl;
          sliderDrag.startX=pageX; sliderDrag.startVal=parseFloat(sl.value);
          hitSlider=true; break;
        }
      }
      /* Check buttons if no slider hit */
      if(!hitSlider){
        for(const el of document.querySelectorAll('#page4 .shape-btn, #page4 .mixed-btn, #page4 .act-btn')){
          const r=el.getBoundingClientRect();
          if(pageX>=r.left&&pageX<=r.right&&pageY>=r.top&&pageY<=r.bottom){
            el.click(); el.style.transform='scale(0.95)'; setTimeout(()=>el.style.transform='',200);
            break;
          }
        }
        pinchCooldown=30;
      }
    }
    handState.pinching=true;
  } else {
    /* Released pinch */
    sliderDrag.active=false; sliderDrag.slider=null;
    handState.pinching=false;
    pinchCooldown=Math.max(0,pinchCooldown-1);
  }

  lastPinch=nowPinch;
  if(pinchCooldown>0&&!nowPinch) pinchCooldown--;
}

function drawTipCircle(c,x,y,pf){
  const R=22;
  c.beginPath(); c.arc(x,y,R,0,Math.PI*2); c.fillStyle=`rgba(252,202,89,${0.12+pf*0.3})`; c.fill();
  c.beginPath(); c.arc(x,y,R,-Math.PI/2,-Math.PI/2+Math.PI*2*pf);
  c.strokeStyle=pf>0.85?'#FCCA59':'rgba(255,255,255,0.9)'; c.lineWidth=3; c.lineCap='round'; c.stroke();
  c.beginPath(); c.arc(x,y,R,0,Math.PI*2); c.strokeStyle='rgba(255,255,255,0.3)'; c.lineWidth=1.5; c.stroke();
  c.beginPath(); c.arc(x,y,5,0,Math.PI*2); c.fillStyle='#fff'; c.fill();
}
function drawCursor(c,cx,cy,pinching){
  const R=pinching?16:12;
  c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2);
  c.fillStyle=pinching?'rgba(252,202,89,0.9)':'rgba(255,255,255,0.8)'; c.fill();
  c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2);
  c.strokeStyle=pinching?'#F5793B':'rgba(255,255,255,0.4)'; c.lineWidth=2; c.stroke();
}

let p4SelfieSegmentation, p4HandsMp, p4Camera;
let p4SelfieReady=false;

function resizeP4(){
  p4W=window.innerWidth; p4H=window.innerHeight;
  p4Canvas.width=p4W; p4Canvas.height=p4H;
  p4PersonCanvas.width=p4W; p4PersonCanvas.height=p4H;
  p4Overlay.width=p4W; p4Overlay.height=p4H;
  p4PersonBuf.width=p4W; p4PersonBuf.height=p4H;
  p4SampC.width=MW; p4SampC.height=MH;
  p4Particles.forEach(p=>p.reset(true));
}

function initPage4(){
  p4Started=true;
  resizeP4();
  window.addEventListener('resize',()=>{ resizeP4(); });
  p4AdjustParticles();

  /* Selfie segmentation */
  p4SelfieSegmentation=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  p4SelfieSegmentation.setOptions({modelSelection:1});
  p4SelfieSegmentation.onResults(onP4SelfieResults);

  /* Hands */
  p4HandsMp=new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
  p4HandsMp.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:0.7,minTrackingConfidence:0.6});
  p4HandsMp.onResults(onHandResults);

  /* Single camera feed both models */
  p4Camera=new Camera(p4Video,{
    onFrame:async()=>{
      await p4SelfieSegmentation.send({image:p4Video});
      await p4HandsMp.send({image:p4Video});
    },
    width:1280, height:720
  });
  p4Camera.start().then(()=>{ p4Loading.style.display='none'; p4RenderLoop(); });
}

function onP4SelfieResults(results){
  /* Sample mask in RAW (unmirrored) orientation — isPerson will flip x to match */
  p4SampX.clearRect(0,0,MW,MH);
  p4SampX.drawImage(results.segmentationMask,0,0,MW,MH);
  p4MaskData=p4SampX.getImageData(0,0,MW,MH).data;

  /* Person cutout buffer: mask clipped to camera, both drawn MIRRORED for display */
  p4PersonBufCtx.clearRect(0,0,p4W,p4H);
  p4PersonBufCtx.save(); p4PersonBufCtx.translate(p4W,0); p4PersonBufCtx.scale(-1,1);
  p4PersonBufCtx.drawImage(results.segmentationMask,0,0,p4W,p4H);
  p4PersonBufCtx.restore();
  p4PersonBufCtx.globalCompositeOperation='source-in';
  p4PersonBufCtx.save(); p4PersonBufCtx.translate(p4W,0); p4PersonBufCtx.scale(-1,1);
  p4PersonBufCtx.drawImage(results.image,0,0,p4W,p4H);
  p4PersonBufCtx.restore();
  p4PersonBufCtx.globalCompositeOperation='source-over';

  /* Main canvas: mirrored camera → particles → person on top */
  p4Ctx.clearRect(0,0,p4W,p4H);
  p4Ctx.save(); p4Ctx.translate(p4W,0); p4Ctx.scale(-1,1);
  p4Ctx.drawImage(results.image,0,0,p4W,p4H);
  p4Ctx.restore();
  p4Particles.forEach(p=>{p.update();p.draw(p4Ctx);});

  /* Person on top */
  p4PersonCtx.clearRect(0,0,p4W,p4H);
  p4PersonCtx.drawImage(p4PersonBuf,0,0);
}

function p4RenderLoop(){
  if(!document.getElementById('page4').classList.contains('active')){ requestAnimationFrame(p4RenderLoop); return; }

  /* Hand overlay */
  p4OCtx.clearRect(0,0,p4W,p4H);
  if(handState.indexTip&&handState.thumbTip){
    const pf=handState.pinchProgress;
    /* Line between tips */
    p4OCtx.beginPath(); p4OCtx.moveTo(handState.indexTip.x,handState.indexTip.y);
    p4OCtx.lineTo(handState.thumbTip.x,handState.thumbTip.y);
    p4OCtx.strokeStyle=`rgba(255,255,255,${0.2+pf*0.5})`; p4OCtx.lineWidth=2; p4OCtx.setLineDash([4,4]); p4OCtx.stroke(); p4OCtx.setLineDash([]);
    drawTipCircle(p4OCtx,handState.indexTip.x,handState.indexTip.y,pf);
    drawTipCircle(p4OCtx,handState.thumbTip.x,handState.thumbTip.y,pf);
    drawCursor(p4OCtx,handState.cursorX,handState.cursorY,handState.pinching);

    /* If dragging slider — draw a horizontal drag indicator */
    if(sliderDrag.active && sliderDrag.slider){
      const sl=sliderDrag.slider;
      const camRect=document.querySelector('.p4-cam-zone').getBoundingClientRect();
      const r=sl.getBoundingClientRect();
      /* Draw a glowing bar hint at the slider's y position */
      const barY=r.top+r.height/2-camRect.top;
      const barX1=r.left-camRect.left, barX2=r.right-camRect.left;
      const ratio=(parseFloat(sl.value)-parseFloat(sl.min))/(parseFloat(sl.max)-parseFloat(sl.min));
      /* Track bg */
      p4OCtx.beginPath(); p4OCtx.roundRect(barX1,barY-5,barX2-barX1,10,5);
      p4OCtx.fillStyle='rgba(255,255,255,0.2)'; p4OCtx.fill();
      /* Fill */
      p4OCtx.beginPath(); p4OCtx.roundRect(barX1,barY-5,(barX2-barX1)*ratio,10,5);
      p4OCtx.fillStyle='rgba(252,202,89,0.85)'; p4OCtx.fill();
      /* Thumb glow */
      const thumbX=barX1+(barX2-barX1)*ratio;
      p4OCtx.beginPath(); p4OCtx.arc(thumbX,barY,10,0,Math.PI*2);
      p4OCtx.fillStyle='#FCCA59'; p4OCtx.fill();
      p4OCtx.beginPath(); p4OCtx.arc(thumbX,barY,14,0,Math.PI*2);
      p4OCtx.strokeStyle='rgba(252,202,89,0.5)'; p4OCtx.lineWidth=3; p4OCtx.stroke();
    }
  }

  requestAnimationFrame(p4RenderLoop);
}

/* Page 4 panel controls */
p4ShapeBtns.forEach(btn=>btn.addEventListener('click',()=>{
  p4ShapeBtns.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  P4_SHAPE=btn.dataset.shape; P4_MIXED=false; p4MixedBtn.classList.remove('active');
  p4Particles.forEach(p=>p.myShape=P4_SHAPE);
}));
p4MixedBtn.addEventListener('click',()=>{
  P4_MIXED=!P4_MIXED;
  if(P4_MIXED){ p4MixedBtn.classList.add('active'); p4ShapeBtns.forEach(b=>b.classList.remove('active')); p4Particles.forEach(p=>p.myShape=allShapes[Math.floor(Math.random()*allShapes.length)]); }
  else { p4MixedBtn.classList.remove('active'); }
});
p4DensitySlider.addEventListener('input',p4AdjustParticles);
document.getElementById('p4BtnReset').addEventListener('click',()=>{
  p4DensitySlider.value=120; p4SizeSlider.value=80; p4SpeedSlider.value=4;
  document.querySelectorAll('#page4 .styled-range').forEach(r=>r.dispatchEvent(new Event('input')));
  p4ShapeBtns.forEach(b=>b.classList.remove('active')); document.querySelector('#p4ShapeGrid [data-shape="star"]').classList.add('active');
  P4_SHAPE='star'; P4_MIXED=false; p4MixedBtn.classList.remove('active');
  p4Particles.forEach(p=>p.reset(true)); p4AdjustParticles();
});

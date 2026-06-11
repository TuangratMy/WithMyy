/* ══════════════════ PAGE 3 ENGINE ══════════════════ */
const p3Video=document.getElementById('webcam');
const p3Canvas=document.getElementById('mainCanvas');
const p3Ctx=p3Canvas.getContext('2d');
const loadingOverlay=document.getElementById('loading-overlay');
const densitySlider=document.getElementById('densitySlider');
const sizeSlider=document.getElementById('sizeSlider');
const speedSlider=document.getElementById('speedSlider');
const shapeBtns=document.querySelectorAll('#page3 .shape-btn');
const mixedBtn=document.getElementById('mixedBtn');

const W=640,H=480; p3Canvas.width=W; p3Canvas.height=H;
const MW=80,MH=60;
const sampC=document.createElement('canvas'); sampC.width=MW; sampC.height=MH;
const sampX=sampC.getContext('2d');
let maskData=null;
const personC=document.createElement('canvas'); personC.width=W; personC.height=H;
const personX=personC.getContext('2d');

function isPerson(cx,cy){ if(!maskData||cx<0||cy<0||cx>=W||cy>=H)return false; return maskData[(Math.floor((cy/H)*MH)*MW+Math.floor((cx/W)*MW))*4]>100; }
function findEdge(cx,cy){ let lx=cx,rx=cx; while(lx>0&&isPerson(lx-1,cy))lx--; while(rx<W-1&&isPerson(rx+1,cy))rx++; return (cx-lx)<=(rx-cx)?{side:-1,edgeX:lx}:{side:1,edgeX:rx}; }

let p3Particles=[],P3_SHAPE='star',P3_MIXED=false,p3CameraStarted=false;

class P3Particle {
  constructor(ry=true){ this.color=palette[Math.floor(Math.random()*palette.length)]; this.reset(ry); }
  reset(ry=false){
    this.x=Math.random()*W; this.y=ry?Math.random()*H:-30;
    const sb=parseInt(sizeSlider.value)/80; this.scale=(Math.random()*.35+.5)*sb;
    this.angle=Math.random()*Math.PI*2; this.spin=(Math.random()-.5)*.06;
    this.state='falling'; this.hugDir=0; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60;
    this.myShape=P3_MIXED?allShapes[Math.floor(Math.random()*allShapes.length)]:P3_SHAPE;
  }
  update(){
    const s=parseFloat(speedSlider.value); this.angle+=this.spin;
    if(this.state==='falling'){
      const ny=this.y+s;
      if(isPerson(this.x,ny)){ this.state='hugging'; this.hugFrames=0; this.hugMax=Math.floor(Math.random()*80)+60; const{side,edgeX}=findEdge(this.x,this.y); this.hugDir=side; this.edgeX=edgeX; } else { this.y=ny; }
    } else {
      this.hugFrames++; this.x+=this.hugDir*1.8;
      const ny=this.y+s*.5;
      if(!isPerson(this.x,ny+4)){ this.y=ny; this.state='falling'; }
      else { this.y=ny; const{side,edgeX}=findEdge(this.x,this.y); if(side===this.hugDir){ this.edgeX=edgeX; this.x=this.edgeX+(this.hugDir===-1?-1:1)*2; } else { this.state='falling'; } }
      if(this.hugFrames>this.hugMax) this.state='falling';
      this.x=Math.max(-10,Math.min(W+10,this.x));
    }
    if(this.y>H+40) this.reset(false);
  }
  draw(c){ c.save(); c.translate(this.x,this.y); c.rotate(this.angle); c.scale(this.scale,this.scale); drawShape(c,this.myShape,this.color); c.restore(); }
}

function p3AdjustParticles(){ const t=parseInt(densitySlider.value); while(p3Particles.length<t)p3Particles.push(new P3Particle(true)); if(p3Particles.length>t)p3Particles.length=t; }

let p3SelfieSegmentation,p3Camera;
function initP3Camera(){
  p3CameraStarted=true;
  p3SelfieSegmentation=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  p3SelfieSegmentation.setOptions({modelSelection:1});
  p3SelfieSegmentation.onResults(results=>{
    if(loadingOverlay.style.display!=='none') loadingOverlay.style.display='none';
    sampX.clearRect(0,0,MW,MH); sampX.drawImage(results.segmentationMask,0,0,MW,MH);
    maskData=sampX.getImageData(0,0,MW,MH).data;
    personX.clearRect(0,0,W,H); personX.drawImage(results.segmentationMask,0,0,W,H);
    personX.globalCompositeOperation='source-in'; personX.drawImage(results.image,0,0,W,H); personX.globalCompositeOperation='source-over';
    p3Ctx.clearRect(0,0,W,H); p3Ctx.drawImage(results.image,0,0,W,H);
    p3Particles.forEach(p=>{p.update();p.draw(p3Ctx);}); p3Ctx.drawImage(personC,0,0);
  });
  p3Camera=new Camera(p3Video,{onFrame:async()=>{await p3SelfieSegmentation.send({image:p3Video});},width:W,height:H}); p3Camera.start();
}

shapeBtns.forEach(btn=>btn.addEventListener('click',()=>{
  shapeBtns.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  P3_SHAPE=btn.dataset.shape; P3_MIXED=false; mixedBtn.classList.remove('active');
  p3Particles.forEach(p=>p.myShape=P3_SHAPE);
}));
mixedBtn.addEventListener('click',()=>{
  P3_MIXED=!P3_MIXED;
  if(P3_MIXED){ mixedBtn.classList.add('active'); shapeBtns.forEach(b=>b.classList.remove('active')); p3Particles.forEach(p=>p.myShape=allShapes[Math.floor(Math.random()*allShapes.length)]); }
  else { mixedBtn.classList.remove('active'); }
});
densitySlider.addEventListener('input',p3AdjustParticles);
document.getElementById('btnSnapshot').addEventListener('click',()=>{
  const s=document.createElement('canvas'); s.width=W; s.height=H;
  const sc=s.getContext('2d'); sc.translate(W,0); sc.scale(-1,1); sc.drawImage(p3Canvas,0,0);
  const a=document.createElement('a'); a.href=s.toDataURL('image/png'); a.download=`bloomie-rain-${Date.now()}.png`; a.click();
});
document.getElementById('btnReset').addEventListener('click',()=>{
  densitySlider.value=120; sizeSlider.value=80; speedSlider.value=4;
  document.querySelectorAll('#page3 .styled-range').forEach(r=>r.dispatchEvent(new Event('input')));
  shapeBtns.forEach(b=>b.classList.remove('active')); document.querySelector('#page3 [data-shape="star"]').classList.add('active');
  P3_SHAPE='star'; P3_MIXED=false; mixedBtn.classList.remove('active');
  p3Particles.forEach(p=>p.reset(true)); p3AdjustParticles();
});
p3AdjustParticles();

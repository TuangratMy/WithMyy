/* ══ PAGE NAV + BUILDERS ══ */
const interactiveTiltsByIndex = [-2,1.5,-1,2,-1.5,1,-2,1.5,-1,2,-1.5];
function buildPage1() {
  const row1=document.getElementById('p1Row1'), row2=document.getElementById('p1Row2');
  if(!row1||row1.dataset.built) return;
  row1.dataset.built='1'; row2.dataset.built='1';
  const badge=document.createElement('span'); badge.className='p1-badge'; badge.textContent='AN'; row1.appendChild(badge);
  const iw=document.createElement('span'); iw.className='p1-word-interactive';
  'Interactive'.split('').forEach((ch,i)=>{ const s=document.createElement('span'); s.className='p1-letter'; s.textContent=ch; s.style.transform=`rotate(${interactiveTiltsByIndex[i]||0}deg)`; s.style.display='inline-block'; iw.appendChild(s); });
  row1.appendChild(iw);
  'Play'.split('').forEach(ch=>{ const s=document.createElement('span'); s.className='wiggle-play p1-play-letter'; s.style.setProperty('--d',(Math.random()*.6).toFixed(2)+'s'); s.textContent=ch; row2.appendChild(s); });
  const g=document.createElement('span'); g.className='p1-word-ground'; g.textContent='ground'; row2.appendChild(g);
}
function buildWiggleTitle(elId,text) {
  const el=document.getElementById(elId); if(!el||el.dataset.built) return; el.dataset.built='1';
  text.split('').forEach(ch=>{
    if(ch===' '){ const sp=document.createElement('span'); sp.style.display='inline-block'; sp.style.width='.28em'; el.appendChild(sp); return; }
    const s=document.createElement('span'); s.className='wiggle-title'; s.style.setProperty('--d',(Math.random()*.8).toFixed(2)+'s'); s.textContent=ch; el.appendChild(s);
  });
}
function goTo(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(id==='page3'){ buildWiggleTitle('p3Title','Bloomie Rain'); if(!p3CameraStarted) initP3Camera(); }
  if(id==='page4'){ buildWiggleTitle('p4Title','Interactive Bloomie Rain'); if(!p4Started) initPage4(); }
  if(id==='page5'){ buildWiggleTitle('p5Title','Bloomie Rain Catcher'); if(!p5Started) initPage5(); }
  if(id==='page6'){ buildWiggleTitle('p6Title','Gorgeous Puzzle'); if(!p6Started) initPage6(); }
  if(id==='page7'){ buildWiggleTitle('p7Title','Full of Bloomie'); if(!p7Started) initPage7(); }
}
buildPage1();
/* Slider track fill — handles all .styled-range */
function initSlider(r) {
  const isP4 = !!r.closest('#page4');
  const fillColor = isP4 ? 'rgba(252,202,89,0.9)' : 'var(--pink)';
  const trackColor = isP4 ? 'rgba(255,255,255,0.2)' : '#f0e8ff';
  const upd=()=>{ const p=((r.value-r.min)/(r.max-r.min))*100; r.style.background=`linear-gradient(to right,${fillColor} 0%,${fillColor} ${p}%,${trackColor} ${p}%)`; };
  r.addEventListener('input',upd); upd();
}
document.querySelectorAll('.styled-range').forEach(initSlider);
/* ══ SHARED ══ */
function drawShape(c,shape,color) {
  c.fillStyle=color;
  if(shape==='star'){
    const pts=5,OR=18,IR=7; c.beginPath();
    for(let i=0;i<pts*2;i++){ const a=(i*Math.PI/pts)-Math.PI/2,r=i%2===0?OR:IR; if(i===0)c.moveTo(Math.cos(a)*r,Math.sin(a)*r); else c.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
    c.closePath(); c.fill();
  } else if(shape==='heart'){
    c.beginPath(); c.moveTo(0,12); c.bezierCurveTo(0,5,-20,0,-18,13); c.bezierCurveTo(-16,26,0,33,0,36); c.bezierCurveTo(0,33,16,26,18,13); c.bezierCurveTo(20,0,0,5,0,12); c.fill();
  } else if(shape==='flower'){
    for(let i=0;i<5;i++){ c.save(); c.rotate((i*2*Math.PI)/5); c.beginPath(); c.arc(0,-13,9,0,Math.PI*2); c.fill(); c.restore(); }
    c.beginPath(); c.arc(0,0,10,0,Math.PI*2); c.fill();
  }
}
const palette=['#99B7F5','#267F53','#F5793B','#F296BD','#FCCA59'];
const allShapes=['star','heart','flower'];
/* p5ForceExit — "Return to Joy" from Catcher, works at ANY game state */
function p5ForceExit() {
  p5GameActive=false;
  clearInterval(p5TimerInterval);
  ['p5-hud','p5-result-wrap','p5-countdown-wrap','p5-howto-wrap','p5-name-wrap'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display='none';
  });
  goTo('page2');
}

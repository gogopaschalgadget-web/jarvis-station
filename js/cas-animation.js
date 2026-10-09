let ready=false, state='completed', frame=0, tick=0, blinkUntil=0;
export function setCasActivity(value){state=value;const el=document.getElementById('cas-activity');if(el)el.textContent=value==='running'?'Responding':value==='queued'?'Waiting for worker':value==='failed'?'Reply needs attention':'Ready';}
export function initCasAnimation(){
 if(ready)return;ready=true;
 const element=document.getElementById('cas-animation');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function draw(index){element.style.backgroundPosition=`${(index%4)*100/3}% ${Math.floor(index/4)*100}%`;element.dataset.frame=String(index);}
 draw(0);
 setInterval(()=>{
  const scene=document.getElementById('cas-scene');
  if(document.hidden||reduced.matches||scene.classList.contains('scene-paused')||scene.classList.contains('custom-portrait'))return;
  tick++;
  const working=state==='running';
  if(working){const phase=Math.floor(tick/12)%3;frame=phase===0?2+tick%2:phase===1?4+tick%2:6+tick%2;}
  else {frame=0;if(tick%29===0)blinkUntil=tick+1;if(tick<=blinkUntil)frame=1;}
  draw(frame);
 },160);
}

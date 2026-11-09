let ready=false, state='completed', projectWork='', frame=0, tick=0, blinkUntil=0;
const CHAT_WORDS={running:'Responding',queued:'Waiting for worker',failed:'Reply needs attention'};
function isWorking(){return state==='running'||!!projectWork;}
function showCaption(){
 const el=document.getElementById('cas-activity');
 if(!el)return;
 const chatBusy=state==='running'||state==='queued';
 el.textContent=chatBusy?CHAT_WORDS[state]:projectWork||CHAT_WORDS[state]||'Ready';
}
export function setCasActivity(value){state=value;showCaption();}
/** A chat reply and a project are separate work: the picture shows Cas working during either. */
export function setCasProjectWork(label){projectWork=label||'';showCaption();}
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
  if(isWorking()){const phase=Math.floor(tick/12)%3;frame=phase===0?2+tick%2:phase===1?4+tick%2:6+tick%2;}
  else {frame=0;if(tick%29===0)blinkUntil=tick+1;if(tick<=blinkUntil)frame=1;}
  draw(frame);
 },160);
}

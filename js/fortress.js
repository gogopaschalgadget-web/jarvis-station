import { ROOMS, PROGRESSION_STATES, OP_STATUSES } from './rooms.js';
let data=null, root=null, onTap=null;
const sigils={1:'⚖',2:'⚒',3:'⌖',4:'⚙',5:'◈',6:'⚗',7:'♜',8:'✣',9:'☉'};
export function initRenderer(canvas) {
  canvas.hidden=true;
  root=document.createElement('section');root.className='fortress-overview';
  root.innerHTML=`<header class="fortress-heading"><span>THE STATION</span><h1>Your research fortress</h1><p>Select a room to inspect its equipment and current work.</p></header><div class="fortress-atlas"><img src="assets/fortress-map.png" alt="Cutaway overview of the candlelit Station fortress"><div class="fortress-hotspots"></div></div><div class="fortress-roster" aria-label="Station rooms"></div><footer class="fortress-caption">Room status comes from the latest Station snapshot. Artwork is illustrative.</footer>`;
  canvas.parentElement.append(root);
  for(const room of ROOMS) {
    const point=document.createElement('button');point.type='button';point.className='fortress-hotspot';point.dataset.room=room.id;
    point.style.left=(25+room.col*25)+'%';point.style.top=(20+room.row*23)+'%';
    const icon=document.createElement('span');icon.textContent=sigils[room.id];
    const name=document.createElement('b');name.textContent=room.name;point.append(icon,name);
    point.addEventListener('click',()=>onTap?.(room));root.querySelector('.fortress-hotspots').append(point);
    const entry=document.createElement('button');entry.type='button';entry.className='fortress-room';entry.dataset.room=room.id;
    const crest=document.createElement('span');crest.className='room-sigil';crest.textContent=sigils[room.id];
    const copy=document.createElement('span');const title=document.createElement('b');title.textContent=room.name;
    const description=document.createElement('small');description.textContent=room.desc;
    const status=document.createElement('em');copy.append(title,description,status);entry.append(crest,copy);
    entry.addEventListener('click',()=>onTap?.(room));root.querySelector('.fortress-roster').append(entry);
  }
  requestRedraw();
}
export function requestRedraw() {
  if(!root)return;
  for(const room of ROOMS) {
    const live=data?.rooms?.[String(room.id)];
    const label=live ? [PROGRESSION_STATES[live.progression]?.label,OP_STATUSES[live.operational]?.label].filter(Boolean).join(' · ') || 'Snapshot received' : 'Awaiting room snapshot';
    root.querySelector(`.fortress-room[data-room="${room.id}"] em`).textContent=label;
    root.querySelector(`.fortress-hotspot[data-room="${room.id}"]`).setAttribute('aria-label',room.name+': '+label);
  }
}
export function setRoomTapHandler(fn){onTap=fn;}
export function setDrawCallback(){}
export function setApiData(value){data=value;requestRedraw();}
export function getApiData(){return data;}
export function resetView(){root?.scrollTo({top:0,behavior:'smooth'});}



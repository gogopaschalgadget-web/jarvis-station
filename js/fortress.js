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
  const board=document.createElement('section');board.className='station-work-board';
  board.innerHTML='<h2>Verified Station work</h2><p>Local drafts execute through the Station host. Other projects retain their owners. Unknown work stays still.</p><div id="station-work-list">No verified Station jobs in this device conversation yet.</div>';
  root.append(board);
  const machines=document.createElement('div');machines.className='station-machinery';
  root.querySelector('.fortress-atlas').append(machines);
  for(const room of ROOMS){
    const machine=document.createElement('button');machine.type='button';machine.className='room-machine';machine.dataset.room=room.id;machine.dataset.state='unknown';
    machine.style.left=(25+room.col*25)+'%';machine.style.top=(29+room.row*23)+'%';
    machine.setAttribute('aria-label',room.name+' equipment: work unknown');
    machine.innerHTML='<svg viewBox="0 0 100 60" aria-hidden="true"><rect x="8" y="28" width="59" height="24" rx="3" fill="#352819" stroke="#ce9f55" stroke-width="2"/><path d="M12 52h70M15 35h48" stroke="#a27536" stroke-width="4"/><g class="machine-wheel" style="transform-origin:28px 27px"><path d="M28 12v30M13 27h30M17 16l22 22M17 38l22-22" stroke="#e6be74" stroke-width="5"/><circle cx="28" cy="27" r="10" fill="#37261c" stroke="#d4a755" stroke-width="3"/></g><rect class="machine-piston" x="49" y="14" width="10" height="17" fill="#c59850"/><path d="M53 31v12" stroke="#d4a755" stroke-width="4"/><g class="machine-operator"><circle cx="82" cy="24" r="6" fill="#baa690"/><path d="M82 31v14m0-10l-10 5m10-5l8 5m-8 5l-5 10m5-10l5 10" stroke="#859cab" stroke-width="4"/></g><circle class="machine-lamp" cx="58" cy="43" r="3" fill="#8b8b7e"/></svg><small>Unknown</small>';
    machine.addEventListener('click',()=>board.scrollIntoView({behavior:'smooth',block:'start'}));machines.append(machine);
  }
  window.addEventListener('station-work-observed',event=>{
    const drafts=event.detail.filter(j=>j.project==='Station drafts');
    const running=drafts.find(j=>j.state==='running');
    const latest=running || drafts[drafts.length-1];
    const machine=machines.querySelector('[data-room="2"]');
    const state=latest?.state || 'unknown';machine.dataset.state=state;
    const label=state==='running'?'Draft generating':state==='completed'?'Draft verified':state==='needs_approval'?'Review needed':state==='requested'?'Queued':state==='failed'?'Draft failed':'Unknown';
    machine.querySelector('small').textContent=label;machine.setAttribute('aria-label','Station draft equipment: '+label+'. Inspect verified work.');
  });
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



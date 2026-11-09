(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RoomInfo=api;})(typeof window==='object'?window:this,function(){
'use strict';
function visible(mesh,inside){return !inside||(mesh.building===inside&&!['roof','structure','apron'].includes(mesh.role));}
const rooms={spire:{purpose:'Command and personal AI · visual role',details:'Cas Sanctum; Command; independent Overseer; Architect unstaffed; Optimizer; Librarian.'},library:{purpose:'Knowledge library · visual role',details:'Shelves and reading table are DEMO furnishings. Actual shelf occupancy: Unknown.'},workshop:{purpose:'Maintenance workshop · visual role',details:'Recorded Maintenance hold. Actual work/readiness: Unknown. Workbench and tools are DEMO.'}};
function create(host){
 const doc=host.ownerDocument,dialog=doc.createElement('dialog'),title=doc.createElement('h2'),purpose=doc.createElement('p'),details=doc.createElement('p'),truth=doc.createElement('p'),closeButton=doc.createElement('button');
 dialog.className='room-info';dialog.setAttribute('aria-label','Room information');closeButton.type='button';closeButton.textContent='Close information';truth.textContent='Current activity and actual assignment: Unknown · visual DEMO only · no live actions.';
 dialog.appendChild(title);dialog.appendChild(purpose);dialog.appendChild(details);dialog.appendChild(truth);dialog.appendChild(closeButton);host.appendChild(dialog);let previous=null;
 function close(){if(!dialog.open)return;if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');dialog.open=false;}if(previous&&previous.isConnected!==false&&typeof previous.focus==='function')previous.focus();}
 const click=()=>close(),cancel=e=>{e.preventDefault();close();};closeButton.addEventListener('click',click);dialog.addEventListener('cancel',cancel);
 return {show(id,name){const room=rooms[id];if(!room)return false;title.textContent=name||id;purpose.textContent=room.purpose;details.textContent=room.details;if(!dialog.open){previous=doc.activeElement;if(typeof dialog.showModal==='function'){dialog.showModal();dialog.setAttribute('aria-modal','true');}else{dialog.setAttribute('open','');dialog.open=true;dialog.setAttribute('aria-modal','false');}}closeButton.focus();return true;},close,isOpen:()=>!!dialog.open,dispose(){close();closeButton.removeEventListener('click',click);dialog.removeEventListener('cancel',cancel);dialog.remove();}};
}
return {visible,create};
});

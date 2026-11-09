(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.Placement=api;})(typeof window==='object'?window:this,function(){
const KEY='armybase-bunker-v2',OLD='armybase-real3d-v1',EPS=1e-6;
const world=(b,p,shape='footprint')=>b[shape].map(v=>[v[0]+p[0],v[1]+p[1]]);
function overlap(a,b){for(const poly of [a,b])for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],n=[q[1]-p[1],p[0]-q[0]],aa=a.map(v=>v[0]*n[0]+v[1]*n[1]),bb=b.map(v=>v[0]*n[0]+v[1]*n[1]);if(Math.max(...aa)<=Math.min(...bb)+EPS||Math.max(...bb)<=Math.min(...aa)+EPS)return false;}return true;}
function valid(bs,id,p){const b=bs.find(b=>b.id===id);return !!b&&Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p.every(v=>Math.abs(v)<100)&&!bs.some(o=>o.id!==id&&overlap(world(b,p),world(o,o.position)));}
function endpoint(b,edge,offset=0){return b.footprint[(edge+offset)%8];}
function snap(bs,id,p,threshold=2.4){const b=bs.find(b=>b.id===id);let best=null;if(!b)return null;for(const o of bs)if(o.id!==id)for(const e of b.edges)for(const f of o.edges){if(e.normal[0]*f.normal[0]+e.normal[1]*f.normal[1]>-.999)continue;const q=[o.position[0]+f.midpoint[0]-e.midpoint[0],o.position[1]+f.midpoint[1]-e.midpoint[1]],distance=Math.hypot(q[0]-p[0],q[1]-p[1]);if(distance>threshold||best&&distance>=best.distance||!valid(bs,id,q))continue;const pairs=[[endpoint(b,e.index),endpoint(o,f.index,1)],[endpoint(b,e.index,1),endpoint(o,f.index)]];if(!pairs.every(([a,c])=>Math.hypot(a[0]+q[0]-c[0]-o.position[0],a[1]+q[1]-c[1]-o.position[1])<1e-5))continue;best={position:q,distance,edge:e.index,neighbor:o.id,neighborEdge:f.index,corners:pairs.map(([a])=>[a[0]+q[0],a[1]+q[1]]),boundary:'OUTER_SIDEWALK',wallClearance:2*.85};}return best;}
class Controller{
 constructor(bs,storage){this.buildings=JSON.parse(JSON.stringify(bs));this.storage=storage;this.mode='orbit';this.moving=null;this.storageStatus='Session only · no saved layout';this.load();}
 snapshot(){return Object.fromEntries(this.buildings.map(b=>[b.id,b.position.slice()]));}
 load(){try{if(!this.storage)throw Error('unavailable');let raw=this.storage.getItem(KEY),legacy=false;if(!raw){raw=this.storage.getItem(OLD);legacy=!!raw;}if(!raw)return;const d=JSON.parse(raw);if(d.version!==(legacy?1:2)||!d.positions)throw Error('version');const bs=JSON.parse(JSON.stringify(this.buildings));for(const b of bs){const p=d.positions[b.id];if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('position');b.position=p.slice();}if(!bs.every(b=>valid(bs,b.id,b.position)))throw Error('collision');this.buildings=bs;this.storageStatus=legacy?'Previous layout migrated · sidewalk safety checked':'Saved bunker layout restored';if(legacy)this.save('Previous layout migrated · ');}catch(e){this.storageStatus='Saved layout unavailable/unsafe · safe connected seed · session only';}}
 arm(id){this.cancel();const b=this.buildings.find(b=>b.id===id);if(!b)return false;this.mode='move';this.moving={id,original:b.position.slice()};return true;}
 preview(p,threshold=2.4){if(!this.moving)return null;const hit=snap(this.buildings,this.moving.id,p,threshold);return {position:hit?hit.position:p,valid:!!hit,snap:hit};}
 drop(p,threshold=2.4){if(!this.moving)return {ok:false,reason:'Shift-drag was not armed'};const v=this.preview(p,threshold),b=this.buildings.find(b=>b.id===this.moving.id);if(!v.valid){this.cancel();return {ok:false,reason:'No valid sidewalk connection · previous position restored'};}b.position=v.position.slice();this.moving=null;this.mode='orbit';this.save();return {ok:true,snapped:true,connection:v.snap};}
 cancel(){if(this.moving)this.buildings.find(b=>b.id===this.moving.id).position=this.moving.original.slice();this.moving=null;this.mode='orbit';}
 save(prefix=''){try{if(!this.storage)throw Error('no storage');const s=JSON.stringify({version:2,boundary:'OUTER_SIDEWALK',positions:this.snapshot()});this.storage.setItem(KEY,s);if(this.storage.getItem(KEY)!==s)throw Error('readback');this.storageStatus=prefix+'Saved locally · readback verified';}catch(e){this.storageStatus='Session only · storage unavailable';}}
}
// Shared by real pointer handlers and regression tests; modifier is latched at press.
class Gesture{
 constructor(controller){this.controller=controller;this.active=null;}
 start({id,shift,x,y,ground}){if(this.active)this.cancel();const moving=!!(shift&&id);if(moving)this.controller.arm(id);this.active={id,move:moving,x,y,lastX:x,lastY:y,ground,original:moving?this.controller.moving.original.slice():null,drag:false};return moving?'move':'orbit';}
 update(x,y){if(!this.active)return null;const a=this.active,delta=[x-a.lastX,y-a.lastY];a.lastX=x;a.lastY=y;if(Math.hypot(x-a.x,y-a.y)>3)a.drag=true;return {action:a.move?'move':'orbit',drag:a.drag,delta};}
 end(p,threshold){const a=this.active;this.active=null;if(!a)return {action:'none'};if(a.move){if(!a.drag||!p){this.controller.cancel();return {action:'select',id:a.id};}return {action:'drop',...this.controller.drop(p,threshold)};}return a.drag?{action:'orbit'}:{action:'enter',id:a.id};}
 cancel(){this.active=null;this.controller.cancel();}
}
return {KEY,OLD,world,overlap,valid,snap,Controller,Gesture};
});

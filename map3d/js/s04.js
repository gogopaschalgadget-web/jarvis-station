(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.TouchHoldIntent=api;})(typeof window==='object'?window:this,function(){
'use strict';
const HOLD_MS=500,SLOP_CSS_PX=8;
class Controller{
 constructor({clock,callbacks={}}){this.clock=clock;this.callbacks=callbacks;this.mode='idle';this.primary=null;this.points=new Set();this.timer=null;this.generation=0;}
 emit(name,...args){const f=this.callbacks[name];return f?f(...args):undefined;}
 clearTimer(){if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;}
 setMode(mode){this.mode=mode;this.emit('onState',mode);}
 armTimer(){const generation=this.generation,p=this.primary;this.timer=this.clock.setTimeout(()=>{this.timer=null;if(generation!==this.generation||this.mode!=='pending'||this.primary!==p||this.points.size!==1)return;const elapsed=this.clock.now()-p.started;if(elapsed<HOLD_MS){this.armTimer();return;}this.setMode('moving');if(this.emit('onActivate',p)===false)this.cancel('activation-rejected');},Math.max(0,HOLD_MS-(this.clock.now()-p.started)));}
 down(e,meta={}){
  if(e.pointerType!=='touch')return false;
  this.points.add(e.pointerId);
  if(this.points.size>1){const prior=this.mode;this.clearTimer();this.generation++;this.primary=null;this.setMode('blocked');this.emit('onCancel','second-pointer',prior);return true;}
  if(this.mode==='blocked')return true;
  this.generation++;this.primary={pointerId:e.pointerId,x0:e.clientX,y0:e.clientY,lastX:e.clientX,lastY:e.clientY,started:this.clock.now(),meta};
  if(meta.id){this.setMode('pending');this.emit('onPending',this.primary);this.armTimer();}
  else{this.setMode('pan');this.emit('onPanStart',this.primary);}
  return true;
 }
 move(e){
  if(e.pointerType!=='touch')return false;
  const p=this.primary;if(!p||e.pointerId!==p.pointerId)return true;p.lastX=e.clientX;p.lastY=e.clientY;
  if(this.mode==='pending'&&Math.hypot(p.lastX-p.x0,p.lastY-p.y0)>SLOP_CSS_PX){this.clearTimer();this.generation++;this.setMode('pan');this.emit('onPanStart',p);}
  if(this.mode==='pan')this.emit('onPanMove',e,p);else if(this.mode==='moving')this.emit('onMove',e,p);
  return true;
 }
 up(e){
  if(e.pointerType!=='touch')return false;
  this.points.delete(e.pointerId);
  if(this.mode==='blocked'){if(!this.points.size)this.setMode('idle');return true;}
  const p=this.primary;if(!p||p.pointerId!==e.pointerId)return true;
  const mode=this.mode,elapsed=this.clock.now()-p.started;this.clearTimer();this.generation++;this.primary=null;this.setMode('idle');
  if(mode==='pending'){if(elapsed<HOLD_MS)this.emit('onTap',p);else this.emit('onCancel','released-before-delayed-activation',mode);}
  else if(mode==='pan')this.emit('onPanEnd',e,p);else if(mode==='moving')this.emit('onCommit',e,p);
  return true;
 }
 cancel(reason='cancel'){
  const prior=this.mode;this.clearTimer();this.generation++;this.primary=null;this.points.clear();this.setMode('idle');if(prior!=='idle')this.emit('onCancel',reason,prior);
 }
 dispose(){this.cancel('dispose');}
}
return {Controller,HOLD_MS,SLOP_CSS_PX};
});

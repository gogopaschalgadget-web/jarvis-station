(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MapRenderDiagnostic=api;})(typeof window==='object'?window:this,function(){
'use strict';
function create(root){
 const status=root.querySelector('[data-map-status]'),proof=root.querySelector('[data-map-proof]');
 let stage='not-started',submissions=0,terminal=false,first=false;
 function set(next,message){stage=next;root.dataset.renderStage=next;status.textContent=message.slice(0,240);}
 function fail(error){terminal=true;first=false;const message=String(error&&error.message||error||'');let code='E_INIT';if(/shader|compile|program|link/i.test(message))code='E_SHADER';else if(/context/i.test(message))code='E_CONTEXT';else if(/E_GL/.test(message))code='E_GL';set('error','Render error · '+code+' · no current map/building visibility proof.');proof.textContent='Initialization/draw error caught. No raw logs or credentials are displayed. Human rendering acceptance remains failed.';}
 return {
  begin(){if(terminal)return;set('initializing','Initialization attempted · waiting for actual mesh draw, not just script load.');},
  unsupported(){terminal=true;set('unsupported','Unsupported context · this surface did not provide WebGL. No map draw occurred.');},
  fail,
  pending(){if(!terminal&&!first)set('waiting','Initialization pending · no mesh draw confirmed. Report this exact status to the preview owner.');},
  frameStart(){submissions=0;},meshSubmitted(){submissions++;},
  frameComplete(gl,canvas){
   if(terminal)return false;
   if(!canvas||canvas.width<=0||canvas.height<=0||canvas.clientWidth<=0||canvas.clientHeight<=0){set('waiting','Waiting · map container has no nonzero drawable size.');return false;}
   if(submissions===0)return false;
   if(gl.getError()!==gl.NO_ERROR){fail(new Error('E_GL'));return false;}
   if(!first){first=true;set('first-draw','First WebGL mesh draw completed · '+submissions+' mesh submissions. Human map/building visibility is still unverified.');proof.textContent='Mesh draw commands returned with no reported WebGL error and nonzero canvas. This is not pixel/readback or human visibility proof.';}return true;
  },
  contextLost(){terminal=true;first=false;set('context-lost','WebGL context lost · no current map/building visibility proof.');},
  restored(){first=false;terminal=true;set('waiting','Context restored · renderer resources are not reinitialized. No new draw confirmed.');},
  state(){return {stage,submissions,terminal,firstDrawConfirmed:first};}
 };
}
return {create};
});

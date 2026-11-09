(function(){const opsRoot=document.getElementById('station-mobile-diagnostic-ops-1'),findOps=id=>opsRoot.querySelector('#station-diag-ops-'+id);'use strict';
(function(){
const M=window.OfflineOpsModel,snapshot=JSON.parse(findOps('snapshot-data').textContent),view=M.evaluate(snapshot,Date.now()),$=id=>findOps(id);
function element(tag,value,className){const e=document.createElement(tag);if(value!==undefined)e.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);if(className)e.className=className;return e;}
function row(dl,label,value){dl.append(element('dt',label),element('dd',value));}
function time(raw){const ms=M.parseInstant(raw);return ms===null?'Unknown':new Date(ms).toISOString();}
function age(value){return value===null?'Unknown':value<0?`${Math.abs(value).toFixed(1)} s ahead of evaluation clock`:`${Math.floor(value)} s old`;}
$('capture').textContent=`Snapshot capture: ${snapshot.captured_at||'Unknown'} · UTC ${time(snapshot.captured_at)}. Capture time does not refresh source as-of dates.`;
$('clock').textContent=`Evaluated once at page load: ${new Date(view.now).toISOString()} · source stale after >900 s · future-clock tolerance ≤60 s. This is not a live refresh.`;
$('schema').textContent=view.snapshotOK?'Pinned recorded snapshot · no live operational assertion':'Unknown snapshot validity · inspect schema, clock and provenance';
const states=[['all','All records'],['stale','Stale evidence'],['unknown','Unknown'],['completed_qualified','Qualified completed record'],['approved_for_dispatch','Approved for dispatch'],['unverified','Unverified'],['clock_tolerated','Clock tolerance'],['held','Held'],['historical','Historical']];
for(const [value,label] of states){const option=element('option',label);option.value=value;$('state-filter').append(option);}
function render(){const records=M.filterRecords(view.records,{query:$('search').value,state:$('state-filter').value});$('records').replaceChildren();$('count').textContent=`${records.length} of ${view.records.length} recorded items`;
 for(const r of records){const card=element('article',undefined,'record');const heading=element('div',undefined,'record-heading');heading.append(element('h2',r.label),element('span',r.derived==='stale'?'Stale recorded evidence':r.derived==='unknown'?'Unknown':r.derived==='clock_tolerated'?'Clock tolerance':r.reportedLabel,'badge '+r.derived));card.append(heading);
 const dl=element('dl');row(dl,'Sees',`${r.outcome} · Source-reported state: ${r.reportedLabel}`);row(dl,'Means',r.meaning);row(dl,'Can do',r.canDo);row(dl,'Real effect',r.realEffect);row(dl,'Proof',`${r.proof.length} referenced sources · oldest valid source as-of ${r.asOf||'Unknown'} · ${age(r.ageSeconds)}`);card.append(dl);
 const detail=element('details');detail.append(element('summary','Inspect proof · source paths, hashes, raw dates and limits'));detail.append(element('p',r.proofNote,'muted'));
 for(const p of r.proof){const proof=element('section',undefined,'proof');proof.append(element('h3',p.id||'Unknown source'));const d=element('dl');row(d,'Source path',p.path||'Unknown');row(d,'Recorded SHA256',p.sha256||'Unknown');row(d,'Recorded bytes',p.bytes===undefined?'Unknown':String(p.bytes));row(d,'Raw as-of',p.as_of||'Unknown');row(d,'UTC as-of',time(p.as_of));row(d,'Timestamp basis',p.timestamp_basis||'Unknown');row(d,'Evidence status',`${p.valid?'Valid recorded provenance':'Unknown provenance/clock'} · ${p.reason}`);proof.append(d);detail.append(proof);}
 card.append(detail);$('records').append(card);
 }if(!records.length)$('records').append(element('p','No matching recorded items. This filter does not change operations.','empty'));
}
$('search').addEventListener('input',render);$('state-filter').addEventListener('change',render);
for(const role of view.roles){const card=element('article',undefined,'role');card.append(element('h3',role.role||'Recorded role · Unknown'),element('p',role.responsibility||'Responsibility Unknown'),element('p','Recorded owner: '+(role.owner||'Unknown'),'mono'),element('p','Recorded assignment only · no live presence, readiness or activity assertion','muted'));const details=element('details');details.append(element('summary','Role evidence · recorded, not live'),element('pre',role.evidence===undefined?'Unknown':role.evidence));card.append(details);$('roles').append(card);}
for(const [i,flow] of view.workflow.entries()){const item=element('article',undefined,'workflow');item.append(element('h3','Recorded workflow item '+(i+1)),element('pre',flow),element('p','Recorded workflow description only · not an executing job, control or current heartbeat.','muted'));$('workflow').append(item);}
$('supersession').textContent=typeof view.supersession==='string'?view.supersession:JSON.stringify(view.supersession,null,2);
$('seed-proof').textContent=JSON.stringify(view.seed||{status:'Unknown seed provenance'},null,2);render();
})();

})();
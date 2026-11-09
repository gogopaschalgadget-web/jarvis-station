(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.OfflineOpsModel=api;})(typeof window==='object'?window:this,function(){
'use strict';
const SCHEMA='offline-operations-snapshot/1';
const STATES=new Set(['completed_qualified','approved_for_dispatch','unverified','unknown','held','paused','historical','blocked','pending']);
const STALE_SECONDS=900,CLOCK_SECONDS=60;
const labels={completed_qualified:'Completed · qualified record',approved_for_dispatch:'Approved for dispatch · not execution',unverified:'Unverified',unknown:'Unknown',held:'Held record',paused:'Paused record',historical:'Historical record',blocked:'Blocked record',pending:'Pending record'};
function text(value){return typeof value==='string'&&value.trim()?value:null;}
function parseInstant(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
 if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),oh=m[10]?Number(m[10]):0,om=m[11]?Number(m[11]):0;
 if(year<1970||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59||oh>14||om>59||oh===14&&om!==0)return null;
 const fraction=(m[7]||'').padEnd(3,'0').slice(0,3),offset=m[8]==='Z'?0:(m[9]==='-'?-1:1)*(oh*60+om)*60000;
 const ms=Date.UTC(year,month-1,day,hour,minute,second,Number(fraction))-offset;
 return Number.isFinite(ms)?ms:null;
}
function stamp(raw,now){
 const ms=parseInstant(raw);
 if(ms===null)return {valid:false,raw,asOfMs:null,ageSeconds:null,kind:'unknown',reason:'Missing, invalid or out-of-range source date'};
 if(!Number.isFinite(now))return {valid:false,raw,asOfMs:ms,ageSeconds:null,kind:'unknown',reason:'Evaluation clock unavailable'};
 const age=(now-ms)/1000;
 if(age < -CLOCK_SECONDS)return {valid:false,raw,asOfMs:ms,ageSeconds:age,kind:'unknown',reason:'Clock issue · source is more than 60 seconds in the future'};
 return {valid:true,raw,asOfMs:ms,ageSeconds:age,kind:age<0?'clock_tolerated':age>STALE_SECONDS?'stale':'within_window',reason:age<0?'Source ahead within 60-second tolerance; not a live/freshness claim':age>STALE_SECONDS?'Source older than 900 seconds':'Source date within 900-second window; recorded evidence only'};
}
function source(s,now){
 const p=s&&typeof s==='object'?s:{},date=stamp(p.as_of,now),provenance=!!(text(p.id)&&text(p.path)&&text(p.timestamp_basis)&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/i.test(p.sha256)&&Number.isSafeInteger(p.bytes)&&p.bytes>=0);
 return {...p,date,valid:provenance&&date.valid,reason:provenance?date.reason:'Missing source provenance, size or SHA256 · Unknown',provenanceValid:provenance};
}
function evaluate(snapshot,now=Date.now()){
 const s=snapshot&&typeof snapshot==='object'?snapshot:{},capture=stamp(s.captured_at,now),seed=s.source_seed||{},seedOK=!!(text(seed.path)&&text(seed.scope_path)&&/^[a-f0-9]{64}$/i.test(seed.sha256||'')&&/^[a-f0-9]{64}$/i.test(seed.scope_sha256||'')&&Number.isSafeInteger(seed.bytes)&&seed.bytes>=0),schemaOK=s.schema===SCHEMA&&seedOK&&Array.isArray(s.sources)&&Array.isArray(s.records)&&Array.isArray(s.roles)&&Array.isArray(s.workflow)&&s.default_task_stale_after_seconds===STALE_SECONDS&&s.clock_tolerance_seconds===CLOCK_SECONDS;
 const sources=(Array.isArray(s.sources)?s.sources:[]).map(p=>source(p,now)),byId=new Map();
 let duplicate=false;for(const p of sources){if(byId.has(p.id))duplicate=true;byId.set(p.id,p);}
 const snapshotOK=schemaOK&&capture.valid&&!duplicate;
 const records=(Array.isArray(s.records)?s.records:[]).map((r,index)=>{
   r=r&&typeof r==='object'?r:{};
   const declared=STATES.has(r.state)?r.state:'unknown',refs=Array.isArray(r.source_ids)?r.source_ids:[],proof=refs.map(id=>byId.get(id)||{id,valid:false,reason:'Referenced source missing',date:{kind:'unknown',ageSeconds:null,asOfMs:null}});
   const valid=snapshotOK&&!!text(r.id)&&!!text(r.label)&&STATES.has(r.state)&&refs.length>0&&refs.every(id=>typeof id==='string')&&proof.every(p=>p.valid);
   const dated=proof.filter(p=>p.valid&&p.date&&p.date.valid),oldest=dated.length?Math.min(...dated.map(p=>p.date.asOfMs)):null,age=oldest===null||!Number.isFinite(now)?null:(now-oldest)/1000;
   let derived='unknown',meaning='Unknown · insufficient schema, clock, state or source provenance';
   if(valid){if(proof.some(p=>p.date.kind==='stale')){derived='stale';meaning='Stale recorded evidence · reported state retained for history; not current completion or presence';}
   else if(proof.some(p=>p.date.kind==='clock_tolerated')){derived='clock_tolerated';meaning='Clock tolerance · recorded state only, not a freshness or presence assertion';}
   else{derived=declared;meaning=declared==='approved_for_dispatch'?'Finite scope approved for dispatch; snapshot does not establish execution, result or completion':declared==='completed_qualified'?'Source records a qualified completed outcome; read its limits. This is not human/product/native acceptance':'Recorded informational state only; no live operational conclusion';}}
   return {id:text(r.id)||'unknown-'+index,label:text(r.label)||'Unknown record',outcome:text(r.outcome)||'Unknown',reportedState:declared,reportedRaw:r.state,reportedLabel:labels[declared],derived,meaning,proof,asOf:oldest===null?null:new Date(oldest).toISOString(),ageSeconds:age,valid,canDo:'Inspect, filter and disclose recorded evidence locally',realEffect:'None · no operation, refresh, control, save or deployment',proofNote:'Hashes/paths are recorded provenance from the pinned seed, not live file verification'};
 });
 return {schemaOK,snapshotOK,capture,sources,records,roles:Array.isArray(s.roles)?s.roles:[],workflow:Array.isArray(s.workflow)?s.workflow:[],supersession:s.supersession,captureMeaning:s.capture_meaning,effect:'Informational offline snapshot only · no live presence or controls',metrics:{work:'Unknown',revenue:'Unknown',health:'Unknown',crew:'Unknown'},now:now,seed:s.source_seed};
}
function filterRecords(records,{query='',state='all'}={}){const q=String(query).toLowerCase();return records.filter(r=>(state==='all'||r.derived===state)&&[r.label,r.outcome,r.reportedLabel,r.meaning,...r.proof.map(p=>p.id||'')].join(' ').toLowerCase().includes(q));}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function serializeForHTML(value){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
return {SCHEMA,STATES,STALE_SECONDS,CLOCK_SECONDS,labels,parseInstant,stamp,source,evaluate,filterRecords,escapeHTML,serializeForHTML};
});

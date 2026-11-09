/* StationWorld */
/* StationWorld: shared world and per-building courtyard dressing for the Jarvis Station 3D map.
   Author: Ollama qwen3.8:27b (local), 2026-10-25. Reviewed and corrected by Claude acting as Cas:
   - hedges now follow the octagon edge (rotation.y = -a + PI/2) instead of pointing outward
   - flower positions use a seeded RNG and follow the hedge, so the layout is stable between loads */
window.StationWorld = {
  build(THREE) {
    const g = new THREE.Group();
    let seed = 42;
    const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // 1. Sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vP;void main(){
        float y=normalize(vP).y;
        vec3 top=vec3(.165,.141,.251),amb=vec3(.722,.408,.227),bel=vec3(.039,.031,.024);
        vec3 c=mix(bel,amb,smoothstep(-.08,.06,y));c=mix(c,top,smoothstep(.06,.3,y));
        gl_FragColor=vec4(c,1.);}`
    });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(180, 32, 24), skyMat));

    const dn = 400, dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) {
      const a = R() * 6.2832, r = 120 + R() * 30;
      dp[i*3]=Math.cos(a)*r; dp[i*3+1]=4+R()*36; dp[i*3+2]=Math.sin(a)*r;
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    g.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffb347, size: 0.6 })));

    // 2. Skyline
    const sm = new THREE.MeshBasicMaterial({ color: 0x120d0a });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.2832 + R() * .1, r = 90 + R() * 50;
      const w = 4 + R() * 6, h = 25 + R() * 45;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const bx = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), sm); bx.position.set(x, h / 2, z);
      const cp = new THREE.Mesh(new THREE.ConeGeometry(w * .6, h * .25, 4), sm); cp.position.set(x, h + h * .125, z);
      g.add(bx, cp);
    }

    // 3. Ground
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#0f0c0a'; cx.fillRect(0, 0, 512, 512);
    for (let ro = 0; ro < 8; ro++) for (let co = 0; co < 8; co++) {
      const sx = co * 64 + 3 + (R()-.5)*5, sy = ro * 64 + 3 + (R()-.5)*5;
      const sw = 55 + R()*4, sh = 55 + R()*4;
      cx.fillStyle = `rgb(${38+R()*9|0},${33+R()*9|0},${27+R()*8|0})`;
      cx.fillRect(sx, sy, sw, sh);
    }
    const gt = new THREE.CanvasTexture(cv); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(20, 20);
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: gt, roughness: .95 }));
    gr.rotation.x = -Math.PI / 2; gr.position.y = -0.02; g.add(gr);
    g.userData.ground = gr;

    // 4. Lights
    g.add(new THREE.HemisphereLight(0x3a2c30, 0x0a0806, 0.55));
    const dl = new THREE.DirectionalLight(0xc98a5a, 0.5); dl.position.set(-30, 40, 20); g.add(dl);

    // 5. Fog in userData
    g.userData.fog = new THREE.Fog(0x1a1210, 60, 170);
    return g;
  },

  dressBuilding(THREE, building) {
    const g = new THREE.Group();
    /* step 6: dressing follows the sidewalk width (Chris widened sidewalks 2026-10-26) */
    const SAP = building.sidewalk_apothem || 5.54, SR = SAP / Math.cos(Math.PI / 8);
    const cA = k => (k * 45 + 22.5) * Math.PI / 180;
    let seed = 7 + String(building.id || '').length * 131;
    const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // Shared materials
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x241c12, metalness: .6, roughness: .4 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffb347, emissiveIntensity: 2.5 });
    const banPoleMat = new THREE.MeshStandardMaterial({ color: 0x1a1410 });
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x1c2416 });
    const flowerMat = new THREE.PointsMaterial({ color: 0xe8e4d8, size: .08 });

    // Glow sprite texture (shared)
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gx = gc.getContext('2d');
    const gd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gd.addColorStop(0, 'rgba(255,179,71,.85)'); gd.addColorStop(1, 'rgba(255,179,71,0)');
    gx.fillStyle = gd; gx.fillRect(0, 0, 64, 64);
    const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });

    // 1. Lamp posts (even corners k=0,2,4,6)
    const poleGeo = new THREE.CylinderGeometry(.07, .1, 2.4, 6);
    const headGeo = new THREE.SphereGeometry(.16, 8, 6);
    [0, 2, 4, 6].forEach(k => {
      const a = cA(k), x = Math.cos(a) * SR * 0.9, z = Math.sin(a) * SR * 0.9;
      const p = new THREE.Mesh(poleGeo, poleMat); p.position.set(x, 1.2, z);
      const h = new THREE.Mesh(headGeo, headMat); h.position.set(x, 2.5, z);
      const s = new THREE.Sprite(glowMat); s.scale.set(1.4, 1.4, 1); s.position.set(x, 2.5, z);
      g.add(p, h, s);
    });

    // 2. Banners
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 256;
    const bx = bc.getContext('2d');
    bx.fillStyle = '#8e1c2a'; bx.fillRect(0, 0, 128, 256);
    bx.save(); bx.translate(64, 128); bx.fillStyle = '#c9a227';
    bx.beginPath();
    for (let i = 0; i < 8; i++) {
      const t = i / 8 * 6.2832;
      bx.lineTo(Math.cos(t)*32, Math.sin(t)*32);
      bx.lineTo(Math.cos(t+.26)*32, Math.sin(t+.26)*32);
      bx.lineTo(Math.cos(t+.42)*22, Math.sin(t+.42)*22);
      bx.lineTo(Math.cos(t+.68)*22, Math.sin(t+.68)*22);
    }
    bx.closePath(); bx.fill();
    bx.beginPath(); bx.arc(0, 0, 10, 0, 6.2832); bx.fillStyle = '#8e1c2a'; bx.fill();
    bx.restore();
    const bTex = new THREE.CanvasTexture(bc);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x8e1c2a, map: bTex, side: THREE.DoubleSide, roughness: .8 });
    const bPoleGeo = new THREE.CylinderGeometry(.04, .04, 3.2, 5);
    const bGeo = new THREE.PlaneGeometry(.9, 1.7);
    const banners = [];
    [-2.2, 2.2].forEach(x => {
      const p = new THREE.Mesh(bPoleGeo, banPoleMat); p.position.set(x, 1.6, SAP - 0.9); g.add(p);
      const b = new THREE.Mesh(bGeo, bMat); b.position.set(x, 2.2, SAP - 0.85); banners.push(b); g.add(b);
    });
    g.userData.banners = banners;

    // 3. Hedges (odd corners k=1,3,5,7), long side along the octagon edge
    const hGeo = new THREE.BoxGeometry(1.4, .5, .6);
    [1, 3, 5, 7].forEach(k => {
      const a = cA(k), x = Math.cos(a) * SR * 0.88, z = Math.sin(a) * SR * 0.88;
      const hd = new THREE.Mesh(hGeo, hedgeMat); hd.position.set(x, .25, z); hd.rotation.y = -a + Math.PI / 2; g.add(hd);
      const tx = -Math.sin(a), tz = Math.cos(a);
      const fp = new Float32Array(36);
      for (let i = 0; i < 12; i++) {
        const along = (R()-.5)*1.2, across = (R()-.5)*.4;
        fp[i*3] = x + along*tx + across*Math.cos(a);
        fp[i*3+1] = .55;
        fp[i*3+2] = z + along*tz + across*Math.sin(a);
      }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      g.add(new THREE.Points(fg, flowerMat));
    });

    // 4. PointLight (stored, NOT added)
    g.userData.light = new THREE.PointLight(0xffb347, 6, 14, 2);
    g.userData.light.position.set(0, 3, 0);
    return g;
  }
};

/* RoomPanels v6 (step 14, 2026-10-27): the X building room with one row per account (status and stats); lift only where a B1 exists.
   RoomPanels v5 (step 13, 2026-10-27): tube channels per room with a labelled preview of the working look.
   RoomPanels v4 (step 10, 2026-10-26): every building has a lift with a B1 basement level (Spire: B1 Undercroft below the lobby).
   RoomPanels v3 (step 4, 2026-10-26): adds the Mint, Content Engine and Traffic Control (room map approved by Chris 2026-10-26),
   the multilevel Spire (elevator up/down, two executive offices per floor, click an office to see its workflow) and
   provider sigil colours (amber Claude, green Codex, white Ollama, violet local tools).
   RoomPanels v2: the Station as an operations console for Chris's AI agents (Codex, Claude, Ollama, others).
   Reads a jarvis-station-status/1 object (agents + blockers). Any AI operating as Cas writes that file.
   Inside a room: Workflow panel (stages with live agent state) and Production panel (agents here, needs-you blockers,
   what each piece of equipment stands for). Base view: Operations panel (all agents, all blockers, click to open room).
   Honesty rule: only what the status file reports is shown; anything not reported is Unknown. */
window.RoomPanels=(function(){
'use strict';
const ROOMS={
 library:{title:'Library',sub:'Vault documentation: filed, verified, findable.',
  stages:['Assign in the Spire','Descend and cross','Write and store','Verify, return, wait'],
  stageHelp:['Cas issues a scoped documentation item with its source.','Worker rides the Spire elevator and crosses the courtyard.','Canonical writer files the note with provenance.','Reread and hash check, receipt, then return and wait.'],
  equipment:[['Wall shelves','Vault knowledge in aggregate'],['Lectern','Chief Librarian review'],['Writing desk','Canonical write'],['VERIFYING sign','Lit only during a real verification']]},
 workshop:{title:'Workshop',sub:'Build and maintenance: investigate, build, validate, hand to QA.',
  stages:['Assign','Investigate / build','Validate','QA handoff'],
  stageHelp:['Job taken from the assignment board queue.','Diagnostic terminal, workbench, parts shelves.','Test bench runs local checks (not independent QA).','Inspection tray, AWAITING QA.'],
  equipment:[['Assignment board','Job queue'],['Diagnostic terminal','Investigation'],['Workbench','Build'],['Test bench','Local validation'],['Inspection tray','Ready for QA'],['Blocked-job area','Jobs stuck on a blocker']]},
 spire:{title:'Sovereign Spire',sub:'Command: who is directing work right now.',
  stages:['Direct','Dispatch','Review','Record'],
  stageHelp:['Cas and Command decide the next step.','Work sent to the Library or Workshop.','Overseer reviews finished work.','Outcome sent to the Library for the vault.'],
  equipment:[['Cas Sanctum','Your operator, Cas'],['Command','Coordinator'],['Overseer','Independent review'],['Architect','UNSTAFFED'],['Optimizer','Workflow improvement'],['Librarian (exec)','Sends documentation work']],
  floors:[
   {name:'B4 · Undercroft',help:'Deepest level, reserved for expansion. Nothing runs here yet.',offices:[],basement:true},
   {name:'B3 · Architect and Librarian (exec)',help:'Architect and Librarian executive.',offices:['Architect','Librarian (exec)']},
   {name:'B2 · Overseer and Optimizer',help:'Overseer and Optimizer.',offices:['Overseer','Optimizer']},
   {name:'B1 · Cas Sanctum and Command',help:'Cas Sanctum and Command.',offices:['Cas Sanctum','Command']},
   {name:'Lobby · Agent Bay (street)',help:'Missions leave the holo-table for the other buildings.',offices:[]}],
  officeHelp:{'Cas Sanctum':'Your operator. Issues scoped orders with their source.','Command':'Coordinator: dispatches work to the buildings.','Overseer':'Independent review of finished work and handoffs.','Optimizer':'Workflow improvement and handoff context checks.','Architect':'UNSTAFFED. No agent holds this role yet.','Librarian (exec)':'Sends documentation work to the Library.'}},
 x:{title:'X',sub:'Outside platform. Every X account has a booth here, with its status and stats.',
  stages:['Arrive','Post','Measure'],
  stageHelp:['Posts arrive from Traffic Control, which approves and sends them.','The account posts to X (DRY_RUN or LIVE).','Stats come back to each account floor (FUTURE: needs a reporter).'],
  equipment:[['Account floors','One floor per X account'],['Status lamps','Lit when the account is reported working'],['Stats boards','Followers, following and posts, as reported'],['Tube intake','Posts from Traffic Control']]},
 mint:{title:'The Mint',sub:'Revenue Room: products made, checked, approved, published, measured.',
  stages:['The Mint','The Credit Line','The Auditor','The Ledger Board','The Controller','The Disbursement Press','The Revenue Gauge and Dividend Pipe'],
  stageHelp:['Generator: Gumroad prompt packs and listing fixes. Automatic optimizer not built yet.','Transport: products ride to the Auditor.','QC gate: product rules (no fake data, guarantee present). Pass or reject bin.','Queue: pending, approved, done, declined, failed. Budget gauge beside it.','Approval: YOU. Nothing is published or spent without your yes.','Execution: upload to Gumroad. Manual today; last vault record shows uploads blocked on a browser setting.','Metrics and feedback: dark until the first real sale, then $100 (vault triggers).'],
  equipment:[['Coin press','Product generator'],['Credit line','Transport'],['Auditor arch','Quality gate'],['Ledger board','Queue and budget'],['Controller terminal','Your approval'],['Disbursement press','Upload to Gumroad'],['Revenue gauge','Sales (FUTURE)'],['Dividend pipe','Feedback (FUTURE)']]},
 content:{title:'Content Engine',sub:'Social posts and site content. No agent reports this room yet.',
  stages:['The Forge','The Conveyor','The Inspector','The Job Board','The Hand-off','The Gauge Panel and Analyst'],
  stageHelp:['Generator: drafts posts.','Transport to the Inspector.','QC rules as data.','Queue of ready posts.','Sends ready posts to Traffic Control, which approves and posts them.','Metrics and feedback (FUTURE).'],
  equipment:[['The Forge','Post generator'],['Conveyor','Transport'],['Inspector arch','QC rules'],['Job Board','Post queue'],['The Hand-off','Ready posts to Traffic Control'],['Gauge Panel and Analyst','Metrics and feedback (FUTURE)'],['Spec','50-Cassian/design/content-room-loop-spec.md']]},
 traffic:{title:'Traffic Control',sub:'SEO fixes and distribution. No agent reports this room yet.',
  stages:['The Signal Tower','The Data Stream','The Filter','The Campaign Rack','The Traffic Lead','The Distribution Hub','The Analytics Wall and Signal Feedback'],
  stageHelp:['Generator: SEO audits and where to post.','Transport to the Filter.','QC rules.','Queue, one section per platform.','Approval across platforms.','Execution: X, Reddit, Quora, Pinterest, RSS.','Metrics and feedback (FUTURE, needs GA4).'],
  equipment:[['Signal Tower radar','Opportunity scanner'],['Data Stream','Transport'],['Filter','QC rules'],['Campaign Rack','Campaign queue'],['Traffic Lead console','Approval across platforms'],['Distribution Hub','X, Reddit, Quora, Pinterest, RSS'],['Analytics Wall','Metrics (FUTURE, needs GA4)'],['Spec','50-Cassian/design/traffic-control-loop-spec.md']]}
};
const previewOn={};
const BASEMENT={library:'Deep Archive',workshop:'Parts Store',mint:'Vault',content:'Draft Store',traffic:'Relay Room'};
const STATE={working:['WORKING','ok'],waiting:['WAITING','warn'],paused:['PAUSED','muted'],blocked:['BLOCKED','bad'],done:['DONE','ok'],idle:['IDLE','muted']};
const PROVIDER={codex:'Codex',claude:'Claude',ollama:'Ollama',grok:'Grok',human:'Chris',local:'Local'};
const SIGIL={claude:'#f0a030',codex:'#3fd07f',ollama:'#f2f0ea',local:'#a070ff'};
const css=`.rp-panel{position:absolute;top:10px;bottom:10px;width:min(330px,31%);background:#120d0a;border:1px solid #c9a227;box-shadow:0 6px 24px rgba(0,0,0,.65);color:#e8dcc4;font:13px/1.45 system-ui,sans-serif;overflow:auto;padding:12px 14px;z-index:5;border-radius:4px}
.rp-left{left:10px}.rp-right{right:10px}.rp-ops{left:10px;bottom:auto;max-height:calc(100% - 20px);width:min(300px,34%)}
.rp-panel h3{margin:0 0 2px;font:600 15px/1.2 Georgia,serif;color:#c9a227;letter-spacing:.04em;text-transform:uppercase}
.rp-sub{margin:0 0 8px;color:#b9a98c;font-size:12px}
.rp-panel h4{margin:12px 0 6px;font:600 11px/1 system-ui;color:#c9a227;letter-spacing:.12em;text-transform:uppercase}
.rp-stage{display:grid;grid-template-columns:24px 1fr;gap:6px;margin:0 0 8px}
.rp-num{width:22px;height:22px;border:1px solid #c9a227;border-radius:50%;display:grid;place-items:center;color:#c9a227;font-size:11px}
.rp-stage b{display:block;color:#f0e2c6}.rp-stage small{display:block;color:#9d8e76;font-size:11.5px}
.rp-chip{display:inline-block;padding:1px 6px;border-radius:2px;font-size:10px;letter-spacing:.08em;margin:0 6px 2px 0;border:1px solid}
.rp-chip.ok{color:#7fe0a8;border-color:#2e7a52;background:#0f2219}.rp-chip.warn{color:#f0c060;border-color:#7a5a1e;background:#22190b}
.rp-chip.bad{color:#ff8a7a;border-color:#8e1c2a;background:#2a0e10}.rp-chip.muted{color:#a9a294;border-color:#4a443a;background:#1a1612}
.rp-chip.prov{color:#e8dcc4;border-color:#5a4422;background:#2a1d14}
.rp-agent{border:1px solid #2e241a;background:#17110d;border-radius:3px;padding:7px 8px;margin:0 0 6px}
.rp-agent b{color:#f0e2c6}.rp-agent p{margin:3px 0 0;color:#b9a98c;font-size:12px}.rp-agent time{color:#7d705c;font-size:10.5px}
.rp-block{border:1px solid #8e1c2a;background:#22090c;border-radius:3px;padding:8px;margin:0 0 6px}
.rp-block b{color:#ffb3a8}.rp-block p{margin:3px 0;color:#e0c8c0;font-size:12px}.rp-block .rp-act{color:#ffd27a}
.rp-block.click{cursor:pointer}.rp-block.click:hover{border-color:#ff6a5a}
.rp-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #241b14;padding:4px 0;font-size:12px}.rp-row b{color:#d8ccb4;font-weight:600}.rp-row span{color:#9d8e76;text-align:right}
.rp-feed{color:#8d7e66;font-size:11px;margin:6px 0 0}
.rp-exit{margin-top:10px;width:100%;padding:8px;background:#2a1d14;color:#e8dcc4;border:1px solid #c9a227;border-radius:3px;cursor:pointer;font:600 12px system-ui}
.rp-lift{display:grid;grid-template-columns:40px 1fr 40px;gap:6px;align-items:center;margin:6px 0 8px}.rp-lift button{height:34px;background:#2a1d14;color:#ffd27a;border:1px solid #c9a227;border-radius:3px;font-size:16px;cursor:pointer}.rp-lift button:disabled{opacity:.35;cursor:default}.rp-lift div{text-align:center;color:#f0e2c6;font:600 12px/1.3 Georgia,serif}
.rp-office{border:1px solid #5a4422;background:#17110d;border-radius:3px;padding:7px 8px;margin:0 0 6px;cursor:pointer}.rp-office:hover,.rp-office.on{border-color:#c9a227}.rp-office b{color:#f0e2c6}.rp-office p{margin:3px 0 0;color:#b9a98c;font-size:12px}
.rp-hint{color:#8d7e66;font-size:11px;margin-top:6px}
@media (max-width:700px){.rp-panel{position:static;width:auto;margin:8px 0;max-height:none}}`;
function create(host,anchor,onExit,onOpenRoom,onFloor){
 const doc=host.ownerDocument,style=doc.createElement('style');style.textContent=css;host.appendChild(style);
 const left=doc.createElement('aside'),right=doc.createElement('aside'),ops=doc.createElement('aside');
 left.className='rp-panel rp-left';right.className='rp-panel rp-right';ops.className='rp-panel rp-ops';left.hidden=right.hidden=ops.hidden=true;
 left.setAttribute('aria-label','Room workflow');right.setAttribute('aria-label','Room agents and blockers');ops.setAttribute('aria-label','Station operations');
 if(getComputedStyle(anchor).position==='static')anchor.style.position='relative';
 const narrow=()=>doc.defaultView.innerWidth<=700;
 function place(){if(narrow()){anchor.after(ops);ops.after(left);left.after(right);}else{anchor.append(ops,left,right);}}
 place();
 let status={agents:[],blockers:[]},floor=4,office=null,level=1,levelRoom=null;
 function el(tag,cls,text){const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function chip(state){const s=STATE[state]||['UNKNOWN','muted'];return el('span','rp-chip '+s[1],s[0]);}
 function ago(iso){if(!iso)return 'time unknown';const d=new Date(iso);return isNaN(d)?iso:d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
 function agentCard(a,showRoom){const c=el('div','rp-agent');const top=el('div');const pc=el('span','rp-chip prov',PROVIDER[a.provider]||a.provider||'?');if(SIGIL[a.provider]){pc.style.borderColor=SIGIL[a.provider];pc.style.boxShadow='inset 3px 0 0 '+SIGIL[a.provider];}top.append(pc,chip(a.state),el('b',null,a.name));c.append(top);
  const line=[a.workflow,a.stage,showRoom&&ROOMS[a.room]?ROOMS[a.room].title:null].filter(Boolean).join(' · ');if(line)c.append(el('p',null,line));
  if(a.task)c.append(el('p',null,a.task));c.append(el('time',null,'Updated '+ago(a.updated_at)));return c;}
 function blockCard(b,clickable){const c=el('div','rp-block'+(clickable?' click':''));c.append(el('b',null,'NEEDS '+(b.needs||'YOU').toUpperCase()+': '+b.title));if(b.detail)c.append(el('p',null,b.detail));if(b.action)c.append(el('p','rp-act','Action: '+b.action));
  if(clickable&&b.room){c.tabIndex=0;c.setAttribute('role','button');c.addEventListener('click',()=>onOpenRoom&&onOpenRoom(b.room));}return c;}
 function setStatus(s){status=s&&Array.isArray(s.agents)?s:{agents:[],blockers:[]};if(!ops.hidden)showOps();}
 function feedLine(){return el('p','rp-feed','Status: '+(status.feed==='manual'?'written by the operating AI (manual)':status.feed||'no status file')+' · as of '+ago(status.updated_at)+(status.updated_by?' by '+status.updated_by:''));}
 function liftRow(names,i,go){const lift=el('div','rp-lift'),dn=el('button',null,'▼'),up=el('button',null,'▲'),lbl=el('div',null,names[i]);dn.type=up.type='button';
  dn.setAttribute('aria-label','Elevator down');up.setAttribute('aria-label','Elevator up');dn.disabled=i===0;up.disabled=i===names.length-1;
  dn.addEventListener('click',()=>go(i-1));up.addEventListener('click',()=>go(i+1));lift.append(dn,lbl,up);return lift;}
 function show(id,name){const r=ROOMS[id];if(!r){hide();return false;}if(r.floors)return showSpire(id,name);place();ops.hidden=true;left.replaceChildren();right.replaceChildren();
  if(levelRoom!==id){levelRoom=id;level=1;if(onFloor)onFloor(1,id);}
  const here=status.agents.filter(a=>a.room===id),blocks=(status.blockers||[]).filter(b=>b.room===id);
  /* Step 10 (Chris 2026-10-26: the basement had no elevator or arrows): every building has a lift to its B1 level. */
  const levels=['B1 · '+(BASEMENT[id]||'Basement'),'Ground · '+r.title];
  left.append(el('h3',null,name||r.title));if(BASEMENT[id])left.append(liftRow(levels,level,i=>setLevel(i,id,name)));else level=1;
  if(level===0){left.append(el('p','rp-sub','Below-ground level, reserved for expansion. Nothing runs here yet. More levels can be added above or below later.'));
   const exit0=el('button','rp-exit','Back to base view');exit0.type='button';exit0.addEventListener('click',()=>onExit&&onExit());left.append(exit0);
   right.append(el('h3',null,'Operations'),el('p','rp-sub','No agent reports this level. Activity Unknown.'),feedLine());left.hidden=right.hidden=false;return true;}
  left.append(el('p','rp-sub',r.sub),el('h4',null,'Workflow now'));
  r.stages.forEach((st,i)=>{const row=el('div','rp-stage'),t=el('div');const on=here.filter(a=>(a.stage||'').toLowerCase()===st.toLowerCase());
   if(on.length)on.forEach(a=>t.append(chip(a.state),el('span','rp-chip prov',a.name)));else t.append(el('span','rp-chip muted','NO AGENT REPORTED'));
   t.append(el('b',null,st),el('small',null,r.stageHelp[i]));row.append(el('div','rp-num',String(i+1)),t);left.append(row);});
  const exit=el('button','rp-exit','Back to base view');exit.type='button';exit.addEventListener('click',()=>onExit&&onExit());left.append(exit,el('div','rp-hint','Or double-click outside the room.'));
  right.append(el('h3',null,'Operations'),el('p','rp-sub','Agents and blockers in this room.'));
  right.append(el('h4',null,'Needs you ('+blocks.length+')'));if(blocks.length)blocks.forEach(b=>right.append(blockCard(b,false)));else right.append(el('p','rp-sub','Nothing waiting on you here.'));
  right.append(el('h4',null,'Agents here ('+here.length+')'));if(here.length)here.forEach(a=>right.append(agentCard(a,false)));else right.append(el('p','rp-sub','No agent reports this room. Activity Unknown.'));
  const demos=window.StationDemo?StationDemo.list(id):[];if(demos.length){right.append(el('h4',null,'Demo scenarios (not real activity)'));demos.forEach(d=>{const b=el('button','rp-exit',d.title);b.type='button';b.addEventListener('click',()=>StationDemo.play(d.id));right.append(b);});}
  const chans=(status.channels||[]).filter(c=>c.room===id);
  if(chans.length){right.append(el('h4',null,'Tubes = channels ('+chans.length+')'));
   chans.forEach(c=>{const row=el('div','rp-agent');row.append(chip(c.state),el('b',null,c.name));if(c.detail)row.append(el('p',null,c.detail));right.append(row);});
   right.append(el('p','rp-hint','Shiny glass and brass with capsules = working. Rusted iron = idle or not reported. Add a channel to the status file and a new tube is laid.'));
   const pv=el('button','rp-exit',previewOn[id]?'End preview':'Preview working tubes (not real activity)');pv.type='button';
   pv.addEventListener('click',()=>{previewOn[id]=!previewOn[id];window.dispatchEvent(new CustomEvent('station-tube-preview',{detail:{room:id,on:previewOn[id]}}));show(id,name);});right.append(pv);}
  const pf=(status.platforms||[]).find(p=>p.id===id);
  if(pf){const ac=pf.accounts||[];right.append(el('h4',null,'Accounts ('+ac.length+') · one floor each'));
   const q=v=>v==null?'Unknown':typeof v==='number'?v.toLocaleString():String(v);
   ac.forEach(a=>{const row=el('div','rp-agent');row.append(chip(a.state),el('b',null,a.handle?'@'+String(a.handle).replace(/^@/,''):a.name));const st=a.stats||{};
    row.append(el('p',null,'Followers '+q(st.followers)+' · Following '+q(st.following)+' · Posts '+q(st.posts)));if(a.note)row.append(el('p',null,a.note));right.append(row);});
   if(!ac.length)right.append(el('p','rp-sub','No accounts listed yet.'));
   right.append(el('p','rp-hint','Add an account to status.platforms (handle only, never a password) and the building grows a floor.'));}
  right.append(el('h4',null,'Equipment = real work'));r.equipment.forEach(e=>{const row=el('div','rp-row');row.append(el('b',null,e[0]),el('span',null,e[1]));right.append(row);});
  right.append(feedLine());left.hidden=right.hidden=false;return true;}

 function officeAgents(name){const key=n=>(n||'').toLowerCase().replace(/\s*\(exec\)|\s*executive/,' exec').trim();return status.agents.filter(a=>a.room==='spire'&&key(a.office)===key(name));}
 function showSpire(id,name){const r=ROOMS[id];place();ops.hidden=true;left.replaceChildren();right.replaceChildren();
  const f=r.floors[floor];left.append(el('h3',null,name||r.title),el('p','rp-sub','Ride the elevator. Tap an office to see its workflow.'));
  const lift=el('div','rp-lift'),dn=el('button',null,'▼'),up=el('button',null,'▲'),lbl=el('div',null,f.name);dn.type=up.type='button';dn.setAttribute('aria-label','Elevator down');up.setAttribute('aria-label','Elevator up');
  dn.disabled=floor===0;up.disabled=floor===r.floors.length-1;dn.addEventListener('click',()=>setFloor(floor-1,id,name));up.addEventListener('click',()=>setFloor(floor+1,id,name));
  lift.append(dn,lbl,up);left.append(el('h4',null,'Elevator'),lift,el('p','rp-sub',f.help));
  if(f.offices.length){left.append(el('h4',null,'Offices on this floor'));f.offices.forEach(o=>{const ag=officeAgents(o),c=el('div','rp-office'+(office===o?' on':''));c.tabIndex=0;c.setAttribute('role','button');
    const top=el('div');if(ag.length)ag.forEach(a=>top.append(chip(a.state)));else top.append(el('span','rp-chip muted',o==='Architect'?'UNSTAFFED':'NO AGENT REPORTED'));top.append(el('b',null,o));c.append(top,el('p',null,r.officeHelp[o]||''));
    c.addEventListener('click',()=>{office=o;showSpire(id,name);});left.append(c);});}
  else if(f.basement){/* help line above already explains the reserved level */}
  else if(/^Lobby/.test(f.name)){left.append(el('h4',null,'Agent Bay'));r.stages.forEach((st,i)=>{const row=el('div','rp-stage'),t=el('div');t.append(el('b',null,st),el('small',null,r.stageHelp[i]));row.append(el('div','rp-num',String(i+1)),t);left.append(row);});}
  const exit=el('button','rp-exit','Back to base view');exit.type='button';exit.addEventListener('click',()=>onExit&&onExit());left.append(exit,el('div','rp-hint','Or double-click outside the room.'));
  const blocks=(status.blockers||[]).filter(b=>b.room===id);
  if(office&&f.offices.includes(office)){const ag=officeAgents(office);right.append(el('h3',null,office),el('p','rp-sub',r.officeHelp[office]||''),el('h4',null,'Workflow in this office ('+ag.length+')'));
   if(ag.length)ag.forEach(a=>right.append(agentCard(a,false)));else right.append(el('p','rp-sub',office==='Architect'?'Unstaffed: no agent holds this role yet.':'No agent reports this office. Activity Unknown.'));}
  else right.append(el('h3',null,'Operations'),el('p','rp-sub','Agents and blockers in the Spire.'));
  right.append(el('h4',null,'Needs you ('+blocks.length+')'));if(blocks.length)blocks.forEach(b=>right.append(blockCard(b,false)));else right.append(el('p','rp-sub','Nothing waiting on you here.'));
  if(!office||!f.offices.includes(office)){const here=status.agents.filter(a=>a.room===id);right.append(el('h4',null,'Agents in the Spire ('+here.length+')'));here.forEach(a=>right.append(agentCard(a,false)));}
  right.append(feedLine());left.hidden=right.hidden=false;return true;}
 function setFloor(i,id,name){const r=ROOMS.spire;floor=Math.max(0,Math.min(r.floors.length-1,i));office=null;if(onFloor)onFloor(floor,'spire');showSpire(id||'spire',name);}
 function setLevel(i,id,name){level=Math.max(0,Math.min(1,i));if(onFloor)onFloor(level,id);show(id,name);}
 function showOps(){place();ops.replaceChildren();const bl=status.blockers||[];
  ops.append(el('h3',null,'Station operations'),el('p','rp-sub','Your AI agents and what needs you.'));
  ops.append(el('h4',null,'Needs you ('+bl.length+')'));if(bl.length)bl.forEach(b=>ops.append(blockCard(b,true)));else ops.append(el('p','rp-sub','No blockers reported.'));
  ops.append(el('h4',null,'Agents ('+status.agents.length+')'));status.agents.forEach(a=>ops.append(agentCard(a,true)));
  ops.append(feedLine());ops.hidden=false;}
 function hide(){left.hidden=right.hidden=true;showOps();}
 return {show,hide,showOps,setStatus,setFloor,setLevel,level:()=>level,floor:()=>floor,isOpen:()=>!left.hidden,dispose(){left.remove();right.remove();ops.remove();style.remove();}};
}
return {create,ROOMS,SIGIL};
})();

/* StationInteriors v4 (step 18, 2026-10-28): Spire office floors moved underground (B1 to B3, Undercroft B4), Crown dropped; every
   leveled interior reports levelIndex(L) for the open-room level picker.
 StationInteriors v3 (step 10, 2026-10-26): a B1 basement level with a lift in every building (Spire: Undercroft).
   StationInteriors v2 (step 4, 2026-10-26): characters restyled to the approved v4 storyboards (scribe-style Chief Librarian with
   teal and parchment scribes, robotic tech-priest Workshop Chief with iron and orange servitors, crimson and gold Spire attendants),
   provider sigils on every android (colour set at mount time from the status file), the multilevel Spire (lobby, three office
   floors with two offices each, crown observation deck; root.userData.setFloor(i)), and the Mint's 7-stage revenue line.
   StationInteriors v1: storyboard-matched room furniture for the Jarvis Station 3D map.
   Room-local coordinates (metres, y up). Floor top y=-1.6, inner wall apothem 4.4, wall top y=1.3, doorway on -z.
   Sources: library-grimdark-v5 and workshop-grimdark-v4 storyboards (Oct 24), accepted Workshop furnishings and
   Spire offices in 2026-10-21-army-base-design-v1.json. Figures are DEMO (userData.demo=true). Status equipment (VERIFYING sign, assignment board rows, test cube) sits on dim standby: no fake activity until a live feed drives it.
   Author: Claude acting as Cas (fallback while the local worker was still generating). */
window.StationInteriors=(function(){
'use strict';
const F=-1.6,AP=4.4;
const C={wood:0x3a2a18,darkWood:0x2e2014,iron:0x2a2620,brass:0xb08d3c,gold:0xc9a227,crimson:0x8e1c2a,parch:0xd8c9a0,flame:0xffb347,term:0x3fd0a0,green:0x2ecc71,steel:0x4a4640};
const M={};
function mat(hex,o={}){const k=hex+JSON.stringify(o);if(!M[k])M[k]=new THREE.MeshStandardMaterial({color:hex,roughness:o.r??.8,metalness:o.m??.1,emissive:o.e??0x000000,emissiveIntensity:o.ei??0,side:o.ds?THREE.DoubleSide:THREE.FrontSide});return M[k];}
function box(w,h,d,m,x,y,z){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o;}
function cyl(rt,rb,h,m,x,y,z,s=10){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s),m);o.position.set(x,y,z);return o;}
function sph(r,m,x,y,z){const o=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),m);o.position.set(x,y,z);return o;}
function piece(label,id,x,z,rot=0){const g=new THREE.Group();g.name=label;g.userData.equipment=id;g.position.set(x,F,z);g.rotation.y=rot;return g;}
/* wall segment k (0..7): centre angle of face k is k*45 deg; face normal points outward. Door is face at -z. */
function wallSlot(angleDeg,inset=.35){const a=angleDeg*Math.PI/180,r=AP-inset;return {x:Math.sin(a)*r,z:Math.cos(a)*r,rot:a+Math.PI};}
function candle(g,x,y,z){g.add(cyl(.03,.03,.16,mat(C.parch),x,y+.08,z,6));g.add(sph(.03,mat(C.flame,{e:C.flame,ei:3}),x,y+.2,z));}
const MH_CREW={'Cas':'cas','The Craftsman':'craftsman','The Foreman':'foreman','The Signal Officer':'signal_officer','The Traffic Lead':'traffic_lead',
 'Chief Librarian':'chief_librarian','Workshop Chief':'workshop_chief','Mint Master':'mint_master','The Controller':'controller'};   /* step 25: realistic MakeHuman leads */
function crewKind(label,o){return o.crew||MH_CREW[label]||(label==='Cas'?'cas':o.quill?'scribe':o.tool?'servitor':o.trim&&o.metal?'attendant':'adept');}
function figure(label,o){const g=new THREE.Group();g.name=label;g.userData.demo=true;g.userData.equipment='figure';
 const body=mat(o.body||0x2a2522,{r:.7,m:o.metal?.6:.05});
 g.add(cyl(.17,.26,1.15,body,0,.58,0,10));g.add(cyl(.12,.15,.25,body,0,1.25,0,8));
 g.add(sph(.13,mat(o.head||0x8a7a6a,{m:o.metal||o.mask?.7:0,r:o.mask?.3:.8}),0,1.5,0));
 if(o.hair)g.add(sph(.135,mat(o.hair),0,1.55,-.03));
 if(o.braids)[-.11,.11].forEach(x=>g.add(cyl(.03,.02,.5,mat(o.hair||0xc0c0c8),x,1.25,-.02,6)));
 if(o.hood){const h=new THREE.Mesh(new THREE.ConeGeometry(.2,.42,10,1,true),mat(o.hood,{ds:true}));h.position.set(0,1.6,-.02);g.add(h);}
 if(o.cloak){const c=new THREE.Mesh(new THREE.PlaneGeometry(.5,1.15),mat(o.cloak,{ds:true}));c.position.set(0,.75,-.2);g.add(c);}
 if(o.trim)g.add(cyl(.27,.27,.06,mat(o.trim,{m:.7,r:.3}),0,.06,0,10));
 if(o.eye)g.add(sph(.035,mat(o.eye,{e:o.eye,ei:3}),.05,1.52,.12));
 if(o.lens)g.add(sph(.045,mat(0xc9a227,{m:.8,r:.25,e:0x9fd0ff,ei:1.2}),-.05,1.53,.11));
 if(o.arms){const am=mat(o.arms,{m:.7,r:.35});for(let i=0;i<o.armCount;i++){const t=(i/(o.armCount-1||1)-.5)*1.6,arm=cyl(.025,.02,.85,am,Math.sin(t)*.22,1.2,-.15,6);arm.rotation.set(-.9,0,t*1.2);g.add(arm);}}
 if(o.quill){[-1,1].forEach(sd=>{const q=cyl(.015,.01,.55,mat(o.quill),sd*.24,1.0,.12,5);q.rotation.x=-1.1;g.add(q);g.add(sph(.03,mat(0xd8c9a0),sd*.24,.82,.36));});}
 if(o.tool){[-1,1].forEach(sd=>{const t=cyl(.04,.03,.5,mat(0x5a5652,{m:.7}),sd*.26,.95,.1,6);t.rotation.x=-1;g.add(t);g.add(box(.09,.09,.09,mat(o.tool,{m:.5}),sd*.26,.78,.32));});}
 g.children.forEach(c=>c.userData.placeholder=true);
 if(o.sigil!==false){const sg=sph(.05,mat(0x3a352e,{e:0x000000,ei:0}),.17,1.2,-.12);sg.material=sg.material.clone();sg.userData.sigil=true;sg.name='provider sigil';g.add(sg);}
 const arms=o.arms?o.armCount||2:0;if(MH_CREW[label]){g.userData.crew={kind:MH_CREW[label],human:true};return g;}
 g.userData.crew={kind:crewKind(label,o),robe:o.robe??o.hood??o.cloak??o.body,hair:o.hair??0x2a1d14,eye:o.eye,
  mods:{hood:!!o.hood,hair:!o.hood||!!o.hair,braids:!!o.braids,mask:!!o.mask,augeye:!!o.eye&&!o.mask,lens:!!o.lens,dendrites:arms>=1,dendrites2:arms>=3}};return g;}
/* Building identity (approved storyboards v4) */
const LOOK={
 attendant:{body:0x7a1421,head:0xc9a227,metal:true,trim:0xc9a227,eye:0xffb347},
 scribe:{robe:0x1f5a58,body:0x1f5a58,head:0xd8c9a0,metal:true,cloak:0xd8c9a0,eye:0x9fe8e0,quill:0x2a1a10},
 servitor:{body:0x2a2724,head:0x4a4642,metal:true,trim:0xd0661a,eye:0xff8a2a,tool:0xd0661a}};

function library(){const root=new THREE.Group();
 /* Bookshelves around the walls: 6 of 8 faces (skip door face 180 and neighbour 225). */
 const spines=[mat(0x5a3a22),mat(0x6e2230),mat(0x3a4a2a),mat(0x4a3a2a)];
 [0,45,90,135,270,315].forEach((deg,i)=>{const s=wallSlot(deg,.25),g=piece('Wall shelves','shelves-'+i,s.x,s.z,s.rot);
  g.add(box(2.2,2.6,.4,mat(C.darkWood),0,1.3,0));
  for(let b=0;b<4;b++){const y=.25+b*.62;g.add(box(2.1,.05,.38,mat(C.wood),0,y,0));
   let x=-1;let n=0;while(x<1&&n<18){const w=.06+((i*7+b*3+n)%4)*.02,h=.32+((i+b+n)%3)*.06;g.add(box(w,h,.28,spines[(i+b+n)%4],x+w/2,y+.025+h/2,.04));x+=w+.012;n++;}}
  root.add(g);});
 const lec=piece('Lectern','lectern',-.9,.6,0);lec.add(box(.5,1.05,.4,mat(C.wood),0,.52,0));const top=box(.7,.05,.5,mat(C.wood),0,1.1,0);top.rotation.x=-.35;lec.add(top);
 const book=box(.55,.02,.38,mat(C.parch),0,1.14,.02);book.rotation.x=-.35;lec.add(book);root.add(lec);
 const desk=piece('Writing desk','writing-desk',1.1,.9,0);desk.add(box(1.6,.75,.8,mat(C.wood),0,.375,0));desk.add(box(.5,.02,.35,mat(C.parch),-.2,.76,0));
 desk.add(cyl(.05,.05,.1,mat(C.brass,{m:.7,r:.3}),.4,.8,.15,8));candle(desk,.6,.75,-.25);candle(desk,-.6,.75,-.25);candle(desk,.65,.75,.25);
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.32),mat(C.green,{e:C.green,ei:.12,ds:true}));sign.position.set(0,1.9,0);sign.name='VERIFYING sign';desk.add(sign);desk.userData.sign=sign;root.add(desk);
 const chief=figure('Chief Librarian',{body:0x0f1414,head:0xb8a898,hair:0xc0c0c8,braids:true,cloak:0x1f3f40,lens:true,quill:0x2a1a10,sigil:false});chief.position.set(-.9,F,1.15);chief.rotation.y=Math.PI;root.add(chief);
 const d1=figure('Scribe android',LOOK.scribe);d1.position.set(1.1,F,1.6);d1.rotation.y=Math.PI;root.add(d1);
 const d2=figure('Scribe android',LOOK.scribe);d2.position.set(2.2,F,2.6);d2.rotation.y=Math.PI*.75;root.add(d2);
 return root;}

function workshop(){const root=new THREE.Group();const iron=mat(C.iron,{m:.5,r:.6});
 const bench=piece('Workbench','workbench',0,.4,0);bench.add(box(2.2,.85,.9,iron,0,.425,0));bench.add(box(2.3,.06,1,mat(C.wood),0,.88,0));
 bench.add(box(.4,.2,.3,mat(C.steel,{m:.6}),-.6,1,0));bench.add(cyl(.12,.12,.25,mat(C.brass,{m:.7}),.3,1.03,.1,10));bench.add(box(.6,.04,.4,mat(C.parch),.7,.92,-.1));root.add(bench);
 const cart=piece('Tool cart','tool-cart',1.7,1.3,-.4);cart.add(box(.7,.7,.45,mat(C.crimson,{m:.4}),0,.45,0));[-.25,.25].forEach(x=>[-.15,.15].forEach(z=>cart.add(cyl(.05,.05,.04,iron,x,.05,z,8))));root.add(cart);
 const boardS=wallSlot(0,.12),board=piece('Assignment board','assignment-board',boardS.x,boardS.z,boardS.rot);board.add(box(2,1.3,.08,mat(0x15110d),0,1.6,0));
 for(let r=0;r<4;r++)board.add(box(1.7,.16,.02,mat(C.term,{e:C.term,ei:.22}),0,2.05-r*.3,.05));root.add(board);
 const termS=wallSlot(90,.6),term=piece('Diagnostic terminal','diagnostic-terminal',termS.x,termS.z,termS.rot);term.add(box(1.2,.75,.6,iron,0,.375,0));
 const scr=box(.9,.55,.04,mat(C.term,{e:C.term,ei:1.4}),0,1.12,-.1);scr.rotation.x=-.25;term.add(scr);root.add(term);
 const testS=wallSlot(270,.7),test=piece('Test bench','test-bench',testS.x,testS.z,testS.rot);test.add(box(1.3,.6,.7,iron,0,.3,0));
 const cube=box(.3,.3,.3,mat(0x9fb0c0,{e:0xcfe8ff,ei:.15}),0,.85,0);cube.rotation.set(.5,.6,0);test.add(cube);test.userData.cube=cube;root.add(test);
 const shelfS=wallSlot(45,.3),shelf=piece('Parts shelves','parts-shelves',shelfS.x,shelfS.z,shelfS.rot);shelf.add(box(2,2.2,.45,iron,0,1.1,0));
 const parts=[mat(C.crimson),mat(C.gold,{m:.6}),mat(0x2a4a6a)];for(let b=0;b<3;b++){shelf.add(box(1.9,.05,.42,mat(C.wood),0,.35+b*.65,0));for(let i=0;i<5;i++)shelf.add(box(.22,.2,.25,parts[(i+b)%3],-.75+i*.37,.48+b*.65,.03));}root.add(shelf);
 const tray=piece('Outgoing inspection tray','inspection-tray',-1.7,-2.1,.3);tray.add(box(1,.4,.7,mat(C.wood),0,.2,0));tray.add(box(1.04,.05,.74,mat(C.gold,{m:.7,r:.3}),0,.42,0));tray.add(box(.5,.03,.35,mat(C.parch),0,.45,0));root.add(tray);
 const blk=piece('Blocked-job area','blocked-area',-2.4,1.6,0);[[-.6,0],[.6,0]].forEach(([x])=>{blk.add(cyl(.04,.04,.8,mat(C.crimson),x,.4,-.6,6));blk.add(cyl(.04,.04,.8,mat(C.crimson),x,.4,.6,6));});
 [[0,-.6],[0,.6]].forEach(([,z])=>blk.add(box(1.2,.05,.04,mat(C.crimson,{e:C.crimson,ei:.4}),0,.7,z)));blk.add(box(.5,.3,.4,mat(0x3a2a18),0,.15,0));root.add(blk);
 const mopS=wallSlot(315,.5),mop=piece('Mop bucket','mop-bucket',mopS.x,mopS.z,0);mop.add(cyl(.18,.15,.35,mat(0x5a5a52,{m:.4}),0,.175,0,10));const handle=cyl(.02,.02,1.3,mat(C.wood),.05,.8,0,6);handle.rotation.z=.15;mop.add(handle);root.add(mop);
 const chief=figure('Workshop Chief',{body:0x6e1018,head:0x9a9690,mask:true,hood:0x7a1421,cloak:0x5a0e14,eye:0xff2a1a,arms:0x6a6660,armCount:4,sigil:false});chief.position.set(-.8,F,1.4);chief.rotation.y=Math.PI;root.add(chief);
 const a1=figure('Servitor android',LOOK.servitor);a1.position.set(.6,F,-.4);root.add(a1);
 const a2=figure('Servitor android',LOOK.servitor);a2.position.set(termS.x-.6,F,termS.z);a2.rotation.y=-Math.PI/2;root.add(a2);
 return root;}

function lamp(g,x,y,z,name){const l=sph(.09,mat(0x3a352e),x,y,z);l.material=l.material.clone();l.name=name;l.userData.officeLamp=name;g.add(l);return l;}
function partition(g){const p=box(.12,2.6,5.4,mat(C.darkWood),0,F+1.3,-.3);p.userData.partition=true;g.add(p);}
function elevator(g){const e=new THREE.Group();e.name='Elevator';e.userData.equipment='elevator';e.position.set(0,F,3.3);
 e.add(skin(box(1.3,2.7,.25,mat(C.gold,{m:.7,r:.3}),0,1.35,.2),'iron'));e.add(skin(box(.9,2.2,.05,mat(0x2a1a10,{m:.4}),0,1.1,.05),'iron'));   /* step 21: skinned lift */
 const up=new THREE.Mesh(new THREE.ConeGeometry(.09,.14,3),mat(C.flame,{e:C.flame,ei:1.6}));up.position.set(.6,1.35,0);up.name='Elevator up';
 const dn=up.clone();dn.rotation.z=Math.PI;dn.position.y=1.12;dn.name='Elevator down';e.add(up,dn);g.add(e);return e;}
function desk(g,x,z,rot){const d=new THREE.Group();d.position.set(x,F,z);d.rotation.y=rot;d.add(box(1.2,.75,.65,mat(C.wood),0,.375,0));d.add(box(.55,.38,.05,mat(C.term,{e:C.term,ei:.6}),0,1.0,.18));d.add(box(.45,.45,.45,mat(C.iron),0,.225,-.7));g.add(d);return d;}
function spire(){const root=new THREE.Group();const floors=[];
 /* Lobby: Agent Bay holo-table and attendants */
 const lobby=new THREE.Group();lobby.name='Lobby · Agent Bay';
 const table=piece('Command holo-table','command-table',0,0,Math.PI/8);table.add(cyl(.95,1,.8,mat(C.iron,{m:.5}),0,.4,0,8));table.add(cyl(.9,.9,.04,mat(C.brass,{m:.6,r:.45}),0,.82,0,8));
 const holo=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.02,32),mat(0x40c0d0,{e:0x40c0d0,ei:.5}));holo.position.y=.86;table.add(holo);
 [0,1,2].forEach(i=>{const t=new THREE.Mesh(new THREE.OctahedronGeometry(.08),mat(C.gold,{e:C.flame,ei:1}));t.position.set(Math.cos(i*2.1)*.45,1.05,Math.sin(i*2.1)*.45);table.add(t);});lobby.add(table);
 [[-2.4,.8],[2.4,.8]].forEach(([x,z])=>{const a=figure('Spire attendant',LOOK.attendant);a.position.set(x,F,z);a.rotation.y=Math.PI;lobby.add(a);});
 elevator(lobby);floors.push(lobby);
 /* Office floors: two offices each, partition between, elevator at the back */
 const OFF=[['Cas Sanctum','Command'],['Overseer','Optimizer'],['Architect','Librarian (exec)']];
 OFF.forEach(([L,R],fi)=>{const fl=new THREE.Group();fl.name='Floor '+(fi+1);partition(fl);elevator(fl);
  [[L,-2.2],[R,2.2]].forEach(([name,x])=>{const o=new THREE.Group();o.name=name;o.userData.equipment='office '+name;fl.add(o);
   lamp(o,x,F+2.5,-1.6,name);
   if(name==='Architect'){o.add(box(1.6,.8,1.1,mat(0x2a2018),x,F+.4,0));o.add(box(1.4,.02,.9,mat(0xc8c0a8),x,F+.81,0));return;}
   desk(o,x,0,Math.PI);
   if(name==='Cas Sanctum'){const cas=figure('Cas',{body:0x7a1421,head:0xd8b8a0,hair:0xb0281e,cloak:0x5a0e18,sigil:false});cas.position.set(x-1.05,F,-.1);cas.rotation.y=Math.PI;o.add(cas);   /* step 28: beside the desk, in full view (the stool was inside her gown) */
    const orr=new THREE.Group();orr.position.set(x-.4,F+.95,-.05);[.16,.11,.07].forEach((rr,k)=>{const t=new THREE.Mesh(new THREE.TorusGeometry(rr,.008,6,24),mat(C.gold,{m:.8,r:.25}));t.rotation.x=k*.7;orr.add(t);});o.add(orr);
    candle(o,x+.35,F+.75,.2);candle(o,x+.45,F+.75,-.15);}
   if(name==='Overseer'){for(let i=0;i<6;i++)o.add(cyl(.18,.18,.05,mat(C.brass,{m:.7,r:.3,e:0x203040,ei:.4}),x-.9+(i%3)*.6,F+1.4+Math.floor(i/3)*.5,-2.4,16));}
   if(name==='Optimizer'){o.add(cyl(.02,.02,.5,mat(C.brass,{m:.7}),x,F+1.05,0,6));o.add(box(.6,.02,.02,mat(C.brass,{m:.7}),x,F+1.3,0));}
   if(name==='Librarian (exec)'){o.add(box(1.8,2.2,.4,mat(C.darkWood),x,F+1.1,-2.4));}
  });floors.push(fl);});
 /* Crown observation deck dropped (Chris 2026-10-28: "DROP IT"): open rooms have no tower top to look out from. */
 /* Step 18 (Chris 2026-10-28: expand underground): the Lobby stays at street level and the office floors go down.
    Order bottom to top so the elevator still reads down/up: B4 Undercroft, B3, B2, B1, Lobby. */
 const lobbyG=floors.shift();floors.forEach((f,i)=>{f.name='B'+(i+1)+' · '+f.name.replace(/^Floor \d+$/,['Cas Sanctum and Command','Overseer and Optimizer','Architect and Librarian (exec)'][i]);});
 floors.reverse();floors.unshift(basement('B4 · Undercroft',0x5a4030));floors.push(lobbyG);
 floors.forEach((f,i)=>{f.visible=i===floors.length-1;root.add(f);});
 root.userData.floors=floors;root.userData.setFloor=i=>floors.forEach((f,k)=>f.visible=k===i);
 root.userData.levelIndex=L=>(L>=0&&L<floors.length)?floors.length-1-L:-1;   /* L: 0 street, 1 = B1 ... */
 return root;}

function mint(){const root=new THREE.Group();const amber=mat(0xf0b040,{e:0xf0b040,ei:1.2}),dark=mat(0x2a2620);
 function stage(label,id,deg,r=3.0){const a=deg*Math.PI/180,g=piece(label,id,Math.sin(a)*r,Math.cos(a)*r,a+Math.PI);root.add(g);return g;}
 function stLamp(g,on,y=2.0){const l=sph(.09,on?amber:dark,0,y,0);l.name='stage lamp';g.add(l);}
 const p1=stage('The Mint (coin press)','mint-press',30);p1.add(cyl(.7,.8,1.2,mat(C.gold,{m:.7,r:.35}),0,.6,0,16));p1.add(cyl(.25,.25,1.2,mat(C.brass,{m:.7}),0,1.6,0,10));
 for(let k=0;k<12;k++){const a=k*Math.PI/6;p1.add(box(.16,.3,.14,mat(C.brass,{m:.6}),Math.cos(a)*.86,.6,Math.sin(a)*.86));}stLamp(p1,true,2.4);
 const mm=figure('Mint Master',{body:0x6e1018,head:0xb8a898,hood:0x7a1421,arms:0x8a8680,armCount:3,eye:0xffb347,sigil:false});mm.position.set(1.0,F,2.6);mm.rotation.y=Math.PI*.85;root.add(mm);
 const p2=stage('The Credit Line (transport)','credit-line',75);p2.add(box(2.2,.5,.6,mat(C.iron,{m:.5}),0,.25,0));for(let i=0;i<3;i++)p2.add(box(.35,.03,.25,mat(C.gold,{m:.6}),-.7+i*.7,.52,0));stLamp(p2,true,1.2);
 const p3=stage('The Auditor (QC gate)','auditor',120);const arch=new THREE.Mesh(new THREE.TorusGeometry(.8,.08,8,24,Math.PI),mat(C.brass,{m:.7,r:.3}));arch.position.y=.0;p3.add(arch);
 p3.add(box(.5,.5,.5,mat(0x15110d),.9,.25,.3));stLamp(p3,true,1.2);
 const p4=stage('The Ledger Board (queue)','ledger-board',165,3.8);p4.add(box(2.0,1.5,.08,mat(0x15110d),0,1.6,0));
 const cardCols=[0x6a6458,0xf0b040,0x3fd07f,0x8e1c2a];for(let r=0;r<3;r++)for(let c=0;c<6;c++)p4.add(box(.22,.3,.02,mat(cardCols[(r+c)%4],{e:cardCols[(r+c)%4],ei:.12}),-.75+c*.3,2.05-r*.42,.05));stLamp(p4,true,2.6);
 const p5=stage('The Controller (your approval)','controller',220);p5.add(box(.9,1.1,.6,mat(C.brass,{m:.6,r:.4}),0,.55,0));const scr=box(.6,.35,.04,mat(0xf0b040,{e:0xf0b040,ei:.8}),0,1.2,-.05);scr.rotation.x=-.3;p5.add(scr);stLamp(p5,true,1.9);
 const ctl=figure('The Controller',{body:0x3a0e14,head:0x8a7a6a,hood:0x4a0e18,cloak:0x2a0a10,sigil:false});ctl.position.set(-2.4,F,-1.2);ctl.rotation.y=Math.PI*.3;root.add(ctl);
 const p6=stage('The Disbursement Press (upload)','disbursement-press',275);p6.add(box(1.2,1.6,.9,mat(C.brass,{m:.6,r:.4}),0,.8,0));const sw=box(.08,.5,.08,mat(C.iron),.7,1.0,0);sw.rotation.z=.6;p6.add(sw);
 p6.add(cyl(.18,.18,2.6,mat(C.iron,{m:.5}),0,1.6+.0,-.6,8));p6.add(box(.7,.4,.5,mat(C.wood),-.9,.2,.4));stLamp(p6,true,2.2);
 const p7=stage('The Revenue Gauge (FUTURE)','revenue-gauge',325,3.9);const dial=cyl(.6,.6,.08,mat(0xd8c9a0),0,1.7,0,24);dial.rotation.x=Math.PI/2;p7.add(dial);
 const needle=box(.03,.5,.02,mat(0x1a1410),0,1.7-.2,.06);p7.add(needle);stLamp(p7,false,2.5);
 const pipe=new THREE.Mesh(new THREE.TorusGeometry(2.9,.07,6,40,Math.PI*.9),mat(0x2a2620,{m:.6}));pipe.rotation.x=Math.PI/2;pipe.rotation.z=-.3;pipe.position.y=F+2.7;pipe.name='The Dividend Pipe (FUTURE, dark)';root.add(pipe);
 [[-2.5,-2.4],[2.6,-2.3]].forEach(([x,z])=>{const s=figure('Mint servitor',LOOK.servitor);s.position.set(x,F,z);root.add(s);});
 return root;}


/* Content Engine and Traffic Control (2026-10-26): 7-stage loop rooms from the vault loop specs. Stage lamps amber because no
   agent reports these rooms; metrics and feedback stay dark (FUTURE) until their vault triggers. */
function loopRoom(stages,cast){const root=new THREE.Group();const amber=mat(0xf0b040,{e:0xf0b040,ei:1.2}),dark=mat(0x2a2620);
 stages.forEach(([label,id,deg,r,make,lit])=>{const a=deg*Math.PI/180,g=piece(label,id,Math.sin(a)*r,Math.cos(a)*r,a+Math.PI);make(g);const l=sph(.09,lit?amber:dark,0,2.3,0);l.name='stage lamp';g.add(l);root.add(g);});
 cast.forEach(([name,look,x,z,rot])=>{const f=figure(name,look);f.position.set(x,F,z);f.rotation.y=rot;root.add(f);});
 const wire=new THREE.Mesh(new THREE.TorusGeometry(2.9,.06,6,40,Math.PI*.85),mat(0x2a2620,{m:.6}));wire.rotation.x=Math.PI/2;wire.rotation.z=-.4;wire.position.y=F+2.7;wire.name='Feedback wire (FUTURE, dark)';root.add(wire);
 return root;}
/* Step 20 (2026-11-02), loop rooms v2. Chris: "everything should represent a real loop in the autonomus revenue generator and be
   intuitive in its meaning, representation, action, sequence, usefulness." Built from the vault loop spec
   (50-Cassian/design/content-room-loop-spec.md). Every station is one real loop stage, numbered in loop order with a sign saying
   what it does; a floor track with arrows runs 1 to 6 in sequence; the Press sends work out through the wall; the feedback wire
   7 back to 1 stays dark while Stage 7 is FUTURE. Stage lamps, queue cards, the Press mode plate and the service heartbeats read
   window.STATION_STATUS.loops[room]; anything not reported shows as unknown (dim), never as working. Work tokens travel the
   track only when an agent reports the room working, or during the labelled preview. */
const SKIN={iron:{tex:'rust_iron',tile:1.6,color:[.6,.55,.52],metal:.15,rough:.8,decay:.65,verd:.25},brass:{tex:'gold_panel',tile:.6,color:[.95,.72,.42],metal:.3,rough:.6,decay:.65,verd:.6},deck:{tex:'rust_iron',repeat:5,color:[.62,.55,.5],metal:.45,rough:.6},belt:{tex:'rust_iron',tile:.8,color:[.05,.045,.04],metal:.2,rough:.9,decay:.5,verd:0}};   /* station_kit recipes iron_decay, brass_pipe */
function skin(o,k){if(k)o.userData.skin=SKIN[k];return o;}
const LOOP_STATE={working:[0x3fd07f,1.6],waiting:[0xf0b040,1.2],blocked:[0xd03030,1.8],error:[0xd03030,1.8],paused:[0x8a6a3a,.5],unknown:[0x6a5a3a,.35],future:[0x1a1612,0]};
function loopStatus(id){return ((window.STATION_STATUS||{}).loops||{})[id]||{};}
function stageState(id,sid){const st=(loopStatus(id).stages||{})[sid];return (st&&st.state)||'unknown';}
const STATE_WORD={working:['WORKING','#5fe08f'],waiting:['WAITING','#f0b040'],blocked:['BLOCKED','#ff5040'],error:['ERROR','#ff5040'],paused:['PAUSED','#b08a5a'],unknown:['NOT REPORTED','#a89878'],future:['FUTURE','#7a7068']};
function sign(num,name,what,state){const cv=document.createElement('canvas');cv.width=640;cv.height=240;const x=cv.getContext('2d');const fut=state==='future';
 const [word,wc]=STATE_WORD[state]||STATE_WORD.unknown;x.fillStyle='rgba(18,14,12,.9)';x.fillRect(0,0,640,240);x.strokeStyle=fut?'#5a5048':'#c9a227';x.lineWidth=6;x.strokeRect(3,3,634,234);
 x.font='bold 30px Georgia';x.textAlign='right';x.textBaseline='middle';x.fillStyle=wc;x.fillText(word,616,36);const ww=x.measureText(word).width;x.beginPath();x.arc(616-ww-22,36,11,0,Math.PI*2);x.fill();
 x.beginPath();x.arc(100,130,72,0,Math.PI*2);x.fillStyle=fut?'#2a2420':'#c9a227';x.fill();x.lineWidth=10;x.strokeStyle=wc;x.stroke();x.fillStyle=fut?'#8a7e70':'#1a1410';x.font='bold 96px Georgia';x.textAlign='center';x.textBaseline='middle';x.fillText(String(num),100,136);
 x.textAlign='left';const fit=(txt,px,bold,y,col)=>{let f=px;do{x.font=(bold?'bold ':'')+f+'px Georgia';f-=2;}while(x.measureText(txt).width>430&&f>16);x.fillStyle=col;x.fillText(txt,192,y);};
 fit(name,54,true,112,fut?'#8a7e70':'#f0dca0');fit(what,40,false,184,fut?'#6a6058':'#cdbf9e');
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,depthTest:false}));s.renderOrder=20;s.scale.set(2.2,.825,1);s.name='stage sign';s.userData.loopSign=true;return s;}
function stateLamp(state){const [c,ei]=LOOP_STATE[state]||LOOP_STATE.unknown;const l=sph(.11,new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:ei,roughness:.4}),0,1.55,0);l.name='stage lamp';l.userData.state=state;return l;}
function statusPad(state,[w,d,cz]){const pad=new THREE.Group();pad.name='stage lamp';pad.userData.state=state;pad.position.z=cz;
 pad.add(skin(box(w,.1,d,mat(0x2a2620),0,.05,0),'iron'));const [c,ei]=LOOP_STATE[state]||LOOP_STATE.unknown,lm=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:state==='future'?0:Math.max(ei,.5),roughness:.4});
 const t=.07;[[0,d/2-t/2,w,t],[0,-d/2+t/2,w,t],[w/2-t/2,0,t,d],[-w/2+t/2,0,t,d]].forEach(([x,z,bw,bd])=>pad.add(box(bw,.03,bd,lm,x,.11,z)));
 pad.children.forEach(o=>o.userData.keep=true);pad.userData.lm=lm;return pad;}
function arcPts(a0,a1,r,y,step=.12){const pts=[],n=Math.max(2,Math.ceil(Math.abs(a1-a0)*r/step));for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;pts.push(new THREE.Vector3(Math.sin(a)*r,y,Math.cos(a)*r));}return pts;}
function loopRoom2(id,stages,cast,opt={}){const root=new THREE.Group();root.name=id+' loop room';const iron=mat(C.iron,{m:.5,r:.6}),brass=mat(C.brass,{m:.7,r:.35});
 const TR=1.75,deg=d=>d*Math.PI/180;const DR=AP/Math.cos(Math.PI/8);const deck=skin(cyl(DR,DR,.04,mat(0x2e2620),0,F+.02,0,8),'deck');deck.rotation.y=Math.PI/8;deck.name='deck plates';root.add(deck);
 const rim=skin(new THREE.Mesh(new THREE.TorusGeometry(DR-.05,.05,4,8),brass),'brass');rim.rotation.x=Math.PI/2;rim.rotation.z=Math.PI/8;rim.position.y=F+.05;root.add(rim);
 const lv={groups:{},stages:{},deg:{},TR,F};root.userData.live=lv;
 stages.forEach(s=>{const [num,name,what,sid,dg,r,make]=s,state=s[7]||stageState(id,sid),a=deg(dg);const g=piece(num+' '+name+': '+what,sid,Math.sin(a)*r,Math.cos(a)*r,a+Math.PI);g.userData.loopStage={room:id,num,name,what,state};
  const n0=g.children.length;make(g,state);g.children.slice(n0).forEach(o=>{if(!o.userData.keep)o.userData.placeholder=true;});const pad=statusPad(state,(opt.pads||{})[sid]||[1.6,1.2,0]);g.add(pad);
  const sg=sign(num,name,what,state);sg.position.set(0,3.1,.2);g.add(sg);root.add(g);lv.groups[sid]=g;lv.deg[sid]=dg;lv.stages[sid]={num,name,what,pad,sg,state,tex:{[state]:sg.material.map}};});
 /* step 38: change a station's state while running. The demo drives this now; real status reports will call the same thing. */
 lv.setStage=(sid,state)=>{const t=lv.stages[sid];if(!t||t.state===state)return;t.state=state;const [c,ei]=LOOP_STATE[state]||LOOP_STATE.unknown,lm=t.pad.userData.lm;lm.color.setHex(c);lm.emissive.setHex(c);lm.emissiveIntensity=state==='future'?0:Math.max(ei,.5);
  t.tex[state]=t.tex[state]||sign(t.num,t.name,t.what,state).material.map;t.sg.material.map=t.tex[state];t.sg.material.needsUpdate=true;};
 /* the track: stage 1 to the last live-path stage, in order, with arrows pointing the way work moves */
 const path=[],live=stages.filter(s=>!(opt.offTrack||[]).includes(s[3]));
 for(let i=0;i<live.length-1;i++){const p=arcPts(deg(live[i][4]),deg(live[i+1][4]),TR,F+.03);if(path.length)p.shift();path.push(...p);}
 const belt=mat(0x1c1814,{r:.9}),arrowM=mat(C.gold,{m:.6,r:.35,e:C.gold,ei:.15});let run=0;
 for(let i=0;i<path.length-1;i++){const p=path[i],q=path[i+1],d=q.clone().sub(p),L=d.length(),h=Math.atan2(d.x,d.z),mid=p.clone().add(q).multiplyScalar(.5);
  const seg=box(.46,.05,L+.02,belt,mid.x,mid.y,mid.z);seg.rotation.y=h;seg.name='loop track';skin(seg,'belt');root.add(seg);
  [-.25,.25].forEach(o=>{const e=skin(box(.05,.08,L+.02,brass,mid.x+Math.cos(h)*o,mid.y+.02,mid.z-Math.sin(h)*o),'brass');e.rotation.y=h;root.add(e);});
  run+=L;if(run>.55){run=0;const ag=new THREE.Group();ag.position.copy(mid);ag.position.y+=.06;ag.rotation.y=h;const c=new THREE.Mesh(new THREE.ConeGeometry(.12,.24,3),arrowM);c.rotation.x=Math.PI/2;c.scale.y=.6;ag.add(c);ag.name='loop arrow';root.add(ag);}}
 /* feedback wire: last stage back to stage 1, overhead; dark until that stage reports working */
 const last=stages[stages.length-1],fbOn=(last[7]||stageState(id,last[3]))==='working';
 const wp=arcPts(deg(last[4]),deg(stages[0][4])+Math.PI*2,TR+.9,F+2.2,.2),wire=skin(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wp),48,.05,6,false),fbOn?mat(0x3fd07f,{e:0x3fd07f,ei:1.4}):mat(0x24201c,{m:.6})),fbOn?null:'iron');
 wire.name='Feedback wire, last stage to 1 '+(fbOn?'(live)':'(dark: FUTURE)');root.add(wire);
 /* service heartbeats on the back wall (infrastructure strip) */
 const svc=loopStatus(id).services||opt.services||[],sp=new THREE.Group();sp.name='service heartbeats';const sa=deg(opt.servicesAt??0);const sr=opt.servicesR||4.1;sp.position.set(Math.sin(sa)*sr,F,Math.cos(sa)*sr);sp.rotation.y=sa+Math.PI;
 sp.add(skin(box(.25+.45*Math.max(1,svc.length),.9,.12,iron,0,1.1,0),'iron'));svc.forEach((s,k)=>{const L=stateLamp(s.state||'unknown');L.position.set((k-(svc.length-1)/2)*.45,1.25,.1);L.name='heartbeat '+s.name;sp.add(L);});root.add(sp);
 cast.forEach(([name,look,dg,r,rot])=>{const f=figure(name,look),a=deg(dg);f.position.set(Math.sin(a)*r,F,Math.cos(a)*r);f.rotation.y=a+Math.PI+(rot||0);root.add(f);});
 /* work tokens: drafts moving along the track, only while the room really works (or the labelled preview) */
 const tokM=mat(C.parch,{e:0xfff0c0,ei:.4}),toks=[];for(let k=0;k<5;k++){const t=box(.28,.03,.2,tokM,0,0,0);t.visible=false;t.name='work token';root.add(t);toks.push(t);}
 const curve=path.length>1?new THREE.CatmullRomCurve3(path):null;
 lv.trackAt=(dg)=>{const a=deg(dg);return new THREE.Vector3(Math.sin(a)*TR,F+.14,Math.cos(a)*TR);};
 root.userData.loopTick=(ms,active)=>{for(let k=0;k<toks.length;k++){const t=toks[k];t.visible=!!(active&&curve);if(!t.visible)continue;const u=((ms/1000)*.05+k/toks.length)%1,p=curve.getPointAt(u),q=curve.getPointAt(Math.min(1,u+.01));t.position.set(p.x,p.y+.08,p.z);t.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);}};
 return root;}
function content(){const iron=mat(C.iron,{m:.5,r:.6}),brass=mat(C.brass,{m:.7,r:.35}),ls=loopStatus('content');
 const glow=(c,e)=>mat(c,{e:c,ei:e});
 return loopRoom2('content',[
 [1,'The Forge','writes the posts','forge',30,3.0,g=>{g.add(box(1.3,1.0,1.0,iron,0,.5,0));g.add(cyl(.3,.35,1.6,iron,-.35,1.8,-.2,10));const fire=box(.6,.35,.05,glow(C.flame,1.6),0,.45,-.62);fire.userData.keep=true;g.add(fire);
   g.add(box(.5,.25,.3,mat(0x3a3530,{m:.7}),.55,1.12,.25));for(let k=0;k<3;k++)g.add(box(.26,.012,.2,mat(C.parch),.4,1.0+k*.02,.55));}],
 [2,'The Conveyor','carries each draft on','conveyor',85,3.0,g=>{g.add(box(2.2,.5,.6,iron,0,.25,0));for(let k=0;k<5;k++){const r=cyl(.06,.06,.62,brass,-1+k*.5,.52,0,8);r.rotation.x=Math.PI/2;g.add(r);}
   for(let k=0;k<3;k++)g.add(box(.3,.02,.4,mat(C.parch),-.7+k*.7,.57,0));}],
 [3,'The Inspector','checks the rules: pass or fail','inspector',140,3.0,g=>{const arch=new THREE.Mesh(new THREE.TorusGeometry(.8,.08,8,24,Math.PI),brass);g.add(arch);
   g.add(box(1.5,.03,.05,glow(0x3fd07f,.6),0,.9,0));const chute=box(.5,.5,.5,mat(0x2a1414),.95,.25,.35);chute.name='reject chute';g.add(chute);g.add(box(.44,.04,.44,glow(0x8e1c2a,.5),.95,.51,.35));}],
 [4,'The Job Board','posts ready to go','job-board',200,3.8,g=>{g.add(box(2.0,1.5,.08,mat(0x15110d),0,1.6,0));const n=Number.isInteger(ls.queue)?ls.queue:0;
   for(let r=0;r<3;r++)for(let c=0;c<6;c++){const k=r*6+c,on=k<n,cd=box(.22,.3,.02,on?glow(C.parch,.3):mat(0x2a2620),-.75+c*.3,2.12-r*.42,0);cd.userData.keep=true;cd.name='board card '+k;g.add(cd);}}],
 [5,'The Hand-off','sends ready posts to Traffic Control','handoff',262,3.0,g=>{g.add(cyl(.45,.5,.9,iron,0,.45,0,8));g.add(cyl(.12,.12,2.2,brass,0,2.0,0,10));
   const pl=namePlate('TO TRAFFIC CONTROL',.62,.16);pl.position.set(0,.62,.5);g.add(pl);}],
 [6,'Gauges and Analyst','learns what works, tunes the Forge','gauge-panel',325,3.9,g=>{[-.5,.5].forEach(x=>{const d=cyl(.4,.4,.06,mat(0x6a6050),x,1.7,0,20);d.rotation.x=Math.PI/2;g.add(d);});g.add(box(.9,.75,.5,mat(C.wood),0,.375,.6));}]],
 [['The Craftsman',{body:0x2a2724,head:0x9a8070,hood:0x5a4a3a,arms:0x8a8680,armCount:2,eye:0xffb347,sigil:false},44,2.5,.3],
  ['The Foreman',{body:0x3a2a1a,head:0x9a8070,cloak:0x2a1a10,eye:0xffb347,sigil:false},218,2.55,.2],
  ['Content servitor',LOOK.servitor,290,2.2,0]],
 {offTrack:['gauge-panel'],pads:{forge:[1.6,1.5,-.05],conveyor:[2.5,.95,0],inspector:[2.4,1.1,.15],'job-board':[2.6,.8,-.1],handoff:[1.5,1.4,.05],'gauge-panel':[1.9,1.7,.25]},servicesAt:0,servicesR:3.05,services:[{name:'Content generator service',state:'unknown'}]});}
/* Step 40 (2026-11-07): Chris picked option A. The Content Engine makes posts and hands them on; Traffic Control approves and sends them. */
function namePlate(txt,w,h){const cv=document.createElement('canvas');cv.width=320;cv.height=Math.round(320*h/w);const x=cv.getContext('2d');x.fillStyle='#17120d';x.fillRect(0,0,cv.width,cv.height);x.strokeStyle='#b08d3c';x.lineWidth=8;x.strokeRect(4,4,cv.width-8,cv.height-8);
 let f=Math.round(cv.height*.62);do{x.font='bold '+f+'px Georgia';f-=2;}while(x.measureText(txt).width>cv.width-34&&f>12);x.fillStyle='#e6cf98';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,cv.width/2,cv.height/2+2);
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:.6,metalness:.2}));m.userData.keep=true;m.name='plate '+txt;return m;}
/* Step 37 (2026-11-07): Traffic Control as a loop room. The rack has one section per platform and the hub one tube per platform; both show
   only what loops.traffic reports. The spec's platform emblems are left out (vault rule: no brand logos), so tubes carry name plates. */
function traffic(){const iron=mat(C.iron,{m:.5,r:.6}),ls=loopStatus('traffic'),q=ls.queues||{};
 return loopRoom2('traffic',[
 [1,'The Signal Tower','finds where to post, what to fix','signal-tower',30,3.0,g=>{g.add(box(1.4,.9,.8,iron,0,.45,0));const br=mat(C.brass,{m:.7,r:.35});[cyl(.09,.09,2.1,br,-.98,2.25,.38,10),cyl(.09,.2,.26,br,-.98,1.08,.38,12)].forEach(o=>{o.userData.keep=true;o.name='intake from Content Engine';g.add(o);});const ip=namePlate('FROM CONTENT ENGINE',.62,.15);ip.position.set(-.98,.78,.62);g.add(ip);}],
 [2,'The Data Stream','carries orders on','data-stream',75,3.0,g=>{const t=cyl(.12,.12,2.2,mat(0x24403a),0,.82,0,10);t.rotation.z=Math.PI/2;g.add(t);}],
 [3,'The Filter','checks SEO, content, platform limits','filter',120,3.0,g=>{g.add(box(1.0,1.4,.3,mat(C.brass,{m:.6}),0,.7,0));}],
 [4,'The Campaign Rack','orders waiting, by platform','campaign-rack',165,3.8,g=>{g.add(box(3,2.2,.1,iron,0,1.3,0));
   ['X','REDDIT','QUORA','PINTEREST','SEO'].forEach((nm,i)=>{const x=-1.16+i*.58,pl=namePlate(nm,.5,.15);pl.position.set(x,2.38,.14);g.add(pl);const n=Number.isInteger(q[nm])?q[nm]:0;
    for(let r=0;r<4;r++){const on=r<n,cd=box(.44,.3,.02,on?mat(C.parch,{e:C.parch,ei:.3}):mat(0x2a2620),x,1.92-r*.4,.065);cd.userData.keep=true;cd.name='rack card '+nm+' '+r;g.add(cd);}});}],
 [5,'The Traffic Lead','asks you to approve, platform by platform','traffic-lead',220,3.0,g=>{g.add(cyl(.8,.86,.9,iron,0,.45,0,8));}],
 [6,'The Distribution Hub','sends out to each platform','distribution-hub',275,3.0,g=>{g.add(cyl(.6,.7,1.2,iron,0,.6,0,12));
   ['RSS','REDDIT','X','QUORA','PINTEREST'].forEach((nm,k)=>{const a=(-120+k*60)*Math.PI/180,h=new THREE.Group();h.rotation.y=a;const st=(ls.platforms||{})[nm]||'unknown',[c,ei]=LOOP_STATE[st]||LOOP_STATE.unknown;
    const pl=namePlate(nm,.42,.12);pl.position.set(0,.86,.635);h.add(pl);const lamp=box(.42,.05,.02,new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:Math.max(ei,.5),roughness:.4}),0,.74,.635);lamp.userData.keep=true;lamp.name='platform lamp '+nm;lamp.userData.state=st;h.add(lamp);h.userData.keep=true;g.add(h);});}],
 [7,'Analytics Wall','learns what works, tunes the Tower','analytics-wall',325,3.9,g=>{g.add(box(2,1.4,.08,mat(0x15110d),0,1.3,0));}]],
 [['The Signal Officer',{sigil:false},30,2.06,Math.PI],['The Traffic Lead',{sigil:false},238,2.34,.2],['Signal servitor',LOOK.servitor,302,2.25,0]],
 {offTrack:['analytics-wall'],pads:{'signal-tower':[1.9,1.9,-.2],'data-stream':[2.6,.95,0],filter:[2.4,1.5,0],'campaign-rack':[3.4,.8,0],'traffic-lead':[1.9,1.9,0],'distribution-hub':[1.9,1.9,0],'analytics-wall':[2.5,.7,.05]},servicesAt:0,services:[{name:'Smart social engine',state:'unknown'},{name:'SEO engine',state:'unknown'},{name:'Post agent service (X)',state:'unknown'}]});}

/* Step 10: below-ground level B1 for every building. Same floor height as the ground room (levels swap in place, like the Spire
   floors). Bare retaining walls, iron columns, pipes along the ceiling, a few crates, the lift, and a dim RESERVED plate: the
   level exists for expansion and nothing runs there yet. */
function basement(name,tint){const g=new THREE.Group();g.name=name;g.userData.basement=true;const wall=mat(tint||0x3a3530,{r:.95}),iron=mat(C.iron,{m:.5,r:.6});
 for(let k=0;k<8;k++){const a=k*Math.PI/4;if(Math.abs(a-Math.PI)<.1)continue;const w=box(3.4,2.9,.18,wall,Math.sin(a)*4.25,F+1.45,Math.cos(a)*4.25);w.rotation.y=a;g.add(w);
  g.add(cyl(.12,.14,2.9,iron,Math.sin(a+Math.PI/8)*4.0,F+1.45,Math.cos(a+Math.PI/8)*4.0,8));}
 [[-3.2,2.2],[3.2,2.2]].forEach(([x,y])=>{const p=cyl(.07,.07,3.2,iron,x,F+y,-.6,8);p.rotation.x=Math.PI/2;g.add(p);});   // service pipes along the side walls
 [[-2.4,-1.2],[-2.0,-2.2],[2.3,-1.6],[2.6,-0.6]].forEach(([x,z],i)=>g.add(box(.7,.6+(i%2)*.3,.7,mat(C.darkWood),x,F+.3+(i%2)*.15,z)));
 const plate=box(1.4,.35,.05,mat(0x2a2620,{e:C.flame,ei:.25}),0,F+2.2,-3.9);plate.name='RESERVED';g.add(plate);
 elevator(g);return g;}
function withLevels(ground,id){const root=new THREE.Group();const b=basement('B1',{library:0x3a3326,workshop:0x332b26,mint:0x3a3020,content:0x34302e,traffic:0x2e3034}[id]);
 elevator(ground);const levels=[b,ground];levels.forEach((l,i)=>{l.visible=i===1;root.add(l);});
 root.userData.floors=levels;root.userData.loopTick=ground.userData.loopTick;root.userData.setFloor=i=>levels.forEach((l,k)=>l.visible=k===i);root.userData.levelIndex=L=>L===0?1:L===1?0:-1;return root;}
function build(T,id){if(id!=='spire'&&id!=='library'&&id!=='workshop'&&id!=='mint'&&id!=='content'&&id!=='traffic')return buildRaw(T,id);return id==='spire'?buildRaw(T,id):withLevels(buildRaw(T,id),id);}
function buildRaw(T,id){if(id==='library')return library();if(id==='workshop')return workshop();if(id==='spire')return spire();if(id==='mint')return mint();if(id==='content')return content();if(id==='traffic')return traffic();return new THREE.Group();}
return {build};
})();

/* StationSkins (step 9, 2026-10-26: material recipes shipped with each station_kit GLB; step 8, 2026-10-26: Spire 3B Rusted Deco Engine with glass lift; object-space triplanar textures and procedural decay for its GLB; step 7: materials for Blender-modelled GLB buildings by material name, with baked AO; step 6b: procedural polished gold shingles on the Spire roof and spikes, bronze ribs, gold finials; step 6, 2026-10-26: normal maps for relief, gold_ornate Spire cladding, plaza flagstones; step 5: storyboard textures for the Jarvis Station 3D map.
   Textures were painted locally with Flux 2 Klein on the local PC, using the approved exterior finals as palette references,
   then made seamless (storyboards-v5 textures, maketex.py). They are embedded as window.STATION_TEXTURES (key -> data URI).
   - uvFor(mesh): uses mesh.uvs when present (window panes, one gothic window per quad); otherwise face-planar UVs in metres:
     horizontal faces use (x, z), vertical faces use (distance along the face, height), so tiles keep their real size.
   - material(mesh): picks a skin by mesh name; returns null to fall back to the flat colour material.
   - environment(): a warm dusk environment map so gold and brass read as metal, not as flat paint.
   Author: Claude acting as Cas. */
window.StationSkins=(function(){
'use strict';
let T=null,cache={};
/* [name pattern, texture key, metres per tile, options] first match wins */
const SKINS=[
 [/elevator window tube/,null,0,{color:0xc89a50,metal:.6,rough:.15,glow:.15,opacity:.45}],
 [/beacon window|stack window/,null,0,{color:0xff9a40,glow:.5}],
 [/window/,'gothic_window',0,{emissive:true}],
 [/curb/,null,0,{color:0xc9a227,metal:.8,rough:.35}],
 [/apron/,'paving',2.2,{rough:.9}],
 [/planned floor slab/,'paving',2.2,{rough:.9}],
 [/spire bronze ribs/,null,0,{color:0x7a5218,metal:.9,rough:.28}],
 [/spire crockets|spire finial/,null,0,{color:0xf2c75a,metal:.95,rough:.18}],
 [/pinnacles/,'roof_gold',1.1,{metal:.9,rough:.22,tint:0xffffff,rmap:true}],
 [/spire gold frame trim/,'gold_panel',0.6,{metal:.8,rough:.28,tint:0xfff0c0}],
 [/spire buttress/,'gold_panel',1.0,{metal:.75,rough:.3,tint:0xfff0c8}],
 [/spire (gold cap|gold needle)/,'roof_gold',2.4,{metal:.9,rough:.22,tint:0xffffff,rmap:true}],
 [/spire .*(ledge|stop)|spire elevator cab|spire flag antenna/,'gold_panel',0.7,{metal:.85,rough:.25,tint:0xfff2c8}],
 [/spire (lobby upper wall|office floor|wall|entry pier|entry lintel)/,'gold_ornate',3.1,{metal:.65,rough:.32,tint:0xfff4dc}],
 [/spire flags/,null,0,{color:0x8e1c2a,rough:.8}],
 [/library (ribbed dome)/,'teal_copper',1.6,{metal:.35,rough:.55}],
 [/library (dome ribs|lantern cap|cornice band|porch pediment)/,'gold_panel',1.0,{metal:.75,rough:.35,tint:0xfff0c8}],
 [/library (drum wall|wall|entry|porch)/,'stone',2.2,{rough:.9}],
 [/workshop (forge wall|wall|entry)/,'rust_iron',2.0,{metal:.4,rough:.7}],
 [/workshop iron roof/,'rust_iron',1.6,{metal:.3,rough:.75,tint:0xd08070}],
 [/workshop (smoke stacks|crane)/,'rust_iron',1.2,{metal:.45,rough:.65}],
 [/workshop hazard band/,'gold_panel',1.0,{metal:.7,rough:.4}],
 [/mint (hall wall|wall|entry)/,'gold_panel',2.0,{metal:.45,rough:.5,tint:0xd8b880}],
 [/mint roof/,'slate',1.6,{rough:.8}],
 [/mint (coin press|gear teeth|press ram|cornice band)/,'gold_panel',1.0,{metal:.75,rough:.35,tint:0xfff0c8}],
 [/content (hall wall|wall|entry)/,'stone',2.2,{rough:.9,tint:0xe8d8d0}],
 [/content mansard roof/,'slate',1.6,{rough:.8}],
 [/content (press rollers|broadcast horn)/,'gold_panel',1.0,{metal:.75,rough:.35}],
 [/content (press frame)/,'rust_iron',1.2,{metal:.4,rough:.7}],
 [/traffic (base wall|wall|entry|signal mast)/,'rust_iron',2.0,{metal:.45,rough:.65,tint:0xb8b8c0}],
 [/traffic (roof deck)/,'slate',1.6,{rough:.8}],
 [/traffic (gold band|cabin cap|radar dish|aerial)/,'gold_panel',1.0,{metal:.75,rough:.35}]];
function load(THREE,renderer){if(T)return T;T={};const src=window.STATION_TEXTURES||{};const L=new THREE.TextureLoader();const an=renderer.capabilities.getMaxAnisotropy();
 for(const k in src){const t=L.load(src[k]);t.colorSpace=/_(n|r)$/.test(k)?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,an);T[k]=t;}return T;}
function environment(THREE,renderer){const pm=new THREE.PMREMGenerator(renderer);const env=new THREE.Scene();
 const sky=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec3 vP;void main(){float y=normalize(vP).y;vec3 c=mix(vec3(.08,.05,.03),vec3(1.1,.62,.3),smoothstep(-.2,.15,y));c=mix(c,vec3(.32,.26,.42),smoothstep(.15,.7,y));gl_FragColor=vec4(c,1.);}'}));
 env.add(sky);[[-20,8,10],[18,14,-12],[0,20,20]].forEach(p=>{const m=new THREE.Mesh(new THREE.SphereGeometry(4,16,8),new THREE.MeshBasicMaterial({color:0xffc070}));m.position.set(...p);env.add(m);});
 const rt=pm.fromScene(env,.04);pm.dispose();return rt.texture;}
function skinFor(name,enabled){for(const s of SKINS){if(s[0].test(name)){if(enabled&&!enabled(name))return null;return s;}}return null;}
function uvFor(m,tile){if(m.uvs)return new Float32Array(m.uvs.flat());const P=m.positions,N=m.normals,uv=new Float32Array(P.length*2),s=1/(tile||2);
 for(let i=0;i<P.length;i++){const p=P[i],n=N[i];if(Math.abs(n[1])>.7){uv[i*2]=p[0]*s;uv[i*2+1]=p[2]*s;}else{const l=Math.hypot(n[0],n[2])||1,tx=-n[2]/l,tz=n[0]/l;uv[i*2]=(p[0]*tx+p[2]*tz)*s;uv[i*2+1]=p[1]*s;}}return uv;}
function material(THREE,renderer,m,enabled){const s=skinFor(m.name,enabled);if(!s)return null;const [re,key,tile,o]=s;const tex=key?load(THREE,renderer)[key]:null;if(key&&!tex)return null;
 const mat=new THREE.MeshStandardMaterial({map:tex||null,color:o.color??(o.tint??0xffffff),metalness:o.metal??.05,roughness:o.rough??.85,side:THREE.DoubleSide});
 const nm=key&&T[key+'_n'];if(nm&&!o.emissive){mat.normalMap=nm;mat.normalScale=new THREE.Vector2(1.1,1.1);}
 if(o.rmap&&T[key+'_r']){mat.roughnessMap=T[key+'_r'];mat.roughness=1;}
 if(key==='roof_gold'&&nm)mat.normalScale=new THREE.Vector2(1.6,1.6);
 if(mat.metalness>.4)mat.envMapIntensity=1.4;
 if(o.opacity){mat.transparent=true;mat.opacity=o.opacity;mat.depthWrite=false;}
 if(o.glow){mat.emissive=new THREE.Color(o.color);mat.emissiveIntensity=o.glow;}
 if(o.emissive){mat.emissive=new THREE.Color(0xffc080);mat.emissiveMap=tex;mat.emissiveIntensity=m.role==='interior'?.4:.85;}
 mat.userData.base={color:mat.color.clone(),emissive:mat.emissive.clone(),emissiveIntensity:mat.emissiveIntensity};mat.userData.tile=tile;return mat;}
/* Blender GLB materials (UVs already in metres from Blender, so repeat 1). */
const GLB={
 spire_wall_gold:['gold_ornate',{metal:.65,rough:.32,tint:0xfff4dc}],
 roof_gold:['roof_gold',{metal:.9,rough:.22,rmap:true}],
 gold_trim:['gold_panel',{metal:.85,rough:.25,tint:0xfff2c8}],
 gold:['gold_panel',{metal:.9,rough:.25,tint:0xffdc99,tri:.8}],
 window_glass:[null,{color:0x6a3512,glowColor:0xff5c14,glow:.28,rough:.3}],
 stone_reveal:['stone',{rough:.9,tint:0x7a6e60}],
 bronze:[null,{color:0x5c3a17,metal:.9,rough:.3}],
 crimson_cloth:[null,{color:0x8e1c2a,rough:.85}],
 lift_glass:[null,{color:0xd8b47a,metal:.25,rough:.08,opacity:.32}],
 /* step 8: Spire 3B Rusted Deco Engine. Decay is painted procedurally in object space (see decayPatch), matching spire_steam.py. */
 deco_wall:['gold_ornate',{metal:.8,rough:.32,tint:0xfff0d0,tri:3.1,decay:1.0}],
 deco_trim:['gold_panel',{metal:.9,rough:.26,tint:0xffdc99,tri:.8,decay:.8}],
 brass_pipe:['gold_panel',{metal:.9,rough:.3,tint:0xf2b86b,tri:.6,decay:1.0}],
 iron_decay:['rust_iron',{metal:.6,rough:.55,tint:0x998c85,tri:1.6,decay:1.0}],
 soot_iron:['rust_iron',{metal:.5,rough:.7,tint:0x2e2926,tri:1.2}],
 cable:[null,{color:0x0d0b0a,metal:.2,rough:.55}],
 wood:['wood',{rough:.8,tint:0x806b59,tri:1.0}],
 clock_face:[null,{color:0xf2d999,glowColor:0xffcc73,glow:2.0,rough:.4}],
 optic_lens:[null,{color:0xff6614,glowColor:0xff590d,glow:4.0,rough:.1}]};
/* Object-space triplanar texturing (Blender box projection) plus run-off rust streaks, verdigris and soot rising from the ground. */
const NOISE='float dh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}'+
 'float dn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z);}'+
 'float dfbm(vec3 p){float a=.5,s=0.;for(int k=0;k<5;k++){s+=a*dn(p);p*=2.03;a*=.5;}return s;}';
function decayPatch(mat,tex,rust,tile,amt,verd=1){mat.onBeforeCompile=sh=>{
 Object.assign(sh.uniforms,{uTri:{value:tex},uRust:{value:rust},uTile:{value:tile},uAmt:{value:amt},uVerd:{value:verd}});
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vOP;varying vec3 vON;').replace('#include <begin_vertex>','#include <begin_vertex>\nvOP=position;vON=normal;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOP;varying vec3 vON;uniform sampler2D uTri;uniform sampler2D uRust;uniform float uTile;uniform float uAmt;uniform float uVerd;\n'+NOISE+
  '\nvec3 tri(sampler2D t,float s){vec3 w=pow(abs(normalize(vON)),vec3(4.));w/=w.x+w.y+w.z+1e-4;vec3 q=vOP/s;return texture2D(t,q.zy).rgb*w.x+texture2D(t,q.xz).rgb*w.y+texture2D(t,q.xy).rgb*w.z;}')
 .replace('#include <map_fragment>',`vec3 dcol=tri(uTri,uTile)*diffuseColor.rgb;float dmask=0.;
  if(uAmt>0.){float n=dfbm(vec3(vOP.x*1.6,vOP.y*.12,vOP.z*1.6)*3.);dmask=smoothstep(.58-.3*uAmt,.68-.2*uAmt,n);
   dcol=mix(dcol,tri(uRust,1.6),dmask);
   float v=dfbm(vOP*1.4);dcol=mix(dcol,vec3(.11,.24,.2),.6*uVerd*smoothstep(.64-.1*uAmt,.76,v));
   dcol*=mix(vec3(1.),vec3(.08,.06,.05),clamp(.75*uAmt*(1.-vOP.y/5.),0.,1.));}
  diffuseColor.rgb=dcol;`)
 .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.9,dmask);')
 .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.35,dmask);');};
 mat.customProgramCacheKey=()=>'decay'+amt+'_'+verd;}
/* Step 9: a GLB built with station_kit.py ships its own material recipes (window.STATION_GLB_MATS[building][name], from
   the .mats.json sidecar). Textured recipes are painted triplanar in object space with the same decay as in Blender. */
const WINDOW_GLOW=.28;
function recipeMaterial(THREE,renderer,r){const T=load(THREE,renderer),tex=r.tex?T[r.tex]:null,c=r.color||[1,1,1];
 const mat=new THREE.MeshStandardMaterial({color:new THREE.Color(c[0],c[1],c[2]),metalness:r.metal??.05,roughness:r.rough??.8});
 if(tex)decayPatch(mat,tex,T.rust_iron||tex,r.tile||2,r.decay||0,r.verd??1);
 if(r.emit&&r.emit_strength){mat.emissive=new THREE.Color(r.emit[0],r.emit[1],r.emit[2]);mat.emissiveIntensity=Math.min(1.6,r.emit_strength*.9);}
 if(r.window){mat.emissiveIntensity=WINDOW_GLOW;mat.color.multiplyScalar(.45);}   /* step 16: window glass glows softly (Chris: too bright, distracting) */   /* capped: Cycles strengths over-bloom in the Station */
 if(r.alpha!=null&&r.alpha<1){mat.transparent=true;mat.opacity=Math.min(1,r.alpha+.07);mat.depthWrite=false;mat.side=THREE.DoubleSide;}
 if(mat.metalness>.4)mat.envMapIntensity=1.4;return mat;}
function glbMaterial(THREE,renderer,name,aoTex,recipe){if(recipe)return recipeMaterial(THREE,renderer,/glass/.test(name)&&!/lift/.test(name)?{...recipe,window:true}:recipe);const spec=GLB[name];if(!spec)return null;const [key,o]=spec;const T=load(THREE,renderer),tex=key?T[key]:null;
 const mat=new THREE.MeshStandardMaterial({map:o.tri?null:(tex||null),color:o.color??(o.tint??0xffffff),metalness:o.metal??.05,roughness:o.rough??.85});
 if(o.tri&&tex)decayPatch(mat,tex,T.rust_iron||tex,o.tri,o.decay||0);
 if(o.glow){mat.emissive=new THREE.Color(o.glowColor??o.color);mat.emissiveIntensity=o.glow;}
 if(o.emissive){mat.emissive=new THREE.Color(0xffc080);mat.emissiveMap=tex;mat.emissiveIntensity=1.1;}
 const nm=key&&!o.tri&&T[key+'_n'];if(nm&&!o.emissive){mat.normalMap=nm;mat.normalScale=new THREE.Vector2(key==='roof_gold'?1.6:1.1,key==='roof_gold'?1.6:1.1);}
 if(o.rmap&&T[key+'_r']){mat.roughnessMap=T[key+'_r'];mat.roughness=1;}
 if(o.opacity){mat.transparent=true;mat.opacity=o.opacity;mat.depthWrite=false;mat.side=THREE.DoubleSide;}
 if(aoTex&&!o.opacity&&!o.tri){mat.aoMap=aoTex;mat.aoMapIntensity=1.0;}
 if(mat.metalness>.4)mat.envMapIntensity=1.4;return mat;}
return {SKINS,load,environment,uvFor,material,skinFor,glbMaterial};
})();

/* StationBackdrops (step 17, 2026-10-27): backdrop presets for the Jarvis Station map, for Chris to pick from.
   Chris: "Change the background to something like space. Or I'm open to ideas here the space station is a little overdone.
   So we build a 40K space station." Each preset paints an equirectangular sky on a canvas (no image files), swaps the ground
   for a matching deck or floor texture, and retints fog and fill light. Original art only: no logos, emblems or franchise
   marks. apply(THREE, scene, world, renderer, name) with name in PRESETS; 'dusk' restores the step 16 look.
   Author: Claude acting as Cas. */
window.StationBackdrops=(function(){
'use strict';
let seed=1;const R=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
const W=4096,H=2048,HZ=H/2;
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function vgrad(x,stops,y0=0,y1=HZ){const g=x.createLinearGradient(0,y0,0,y1);stops.forEach(([t,c])=>g.addColorStop(t,c));x.fillStyle=g;x.fillRect(0,y0,W,y1-y0);}
function stars(x,n,ymax,cols){for(let i=0;i<n;i++){const px=R()*W,py=R()*ymax,b=R();x.globalAlpha=.35+.65*b*b;x.fillStyle=cols[(R()*cols.length)|0];const r=b>.97?2.2:b>.85?1.4:.8;x.beginPath();x.arc(px,py,r,0,7);x.fill();}x.globalAlpha=1;}
function nebula(x,blobs){x.globalCompositeOperation='lighter';for(const [px,py,r,c,a] of blobs){for(let k=0;k<7;k++){const ox=px+(R()-.5)*r*.9,oy=py+(R()-.5)*r*.45,rr=r*(.35+R()*.5);const g=x.createRadialGradient(ox,oy,0,ox,oy,rr);g.addColorStop(0,c.replace('A',String(a)));g.addColorStop(1,c.replace('A','0'));x.fillStyle=g;x.fillRect(ox-rr,oy-rr,rr*2,rr*2);}}x.globalCompositeOperation='source-over';}
function planet(x,px,py,r,inner,outer,rim){const g=x.createRadialGradient(px-r*.35,py-r*.35,r*.1,px,py,r);g.addColorStop(0,inner);g.addColorStop(1,outer);x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,7);x.fill();
 if(rim){const h=x.createRadialGradient(px,py,r*.95,px,py,r*1.18);h.addColorStop(0,rim);h.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=h;x.beginPath();x.arc(px,py,r*1.18,0,7);x.fill();}}
function wrap(x,draw){draw(0);}
/* gothic towers: body, buttresses, pointed spire, pinnacles, a few lit windows */
function gothicSkyline(x,n,col,lit,hmin,hmax,base=HZ){for(let i=0;i<n;i++){const cx=R()*W,h=hmin+R()*(hmax-hmin),w=h*(.16+R()*.12),top=base-h;x.fillStyle=col;
 x.fillRect(cx-w/2,top+h*.18,w,h*.82);x.beginPath();x.moveTo(cx-w/2,top+h*.18);x.lineTo(cx,top-h*.22);x.lineTo(cx+w/2,top+h*.18);x.fill();
 for(const s of [-1,1]){const bw=w*.35,bx=cx+s*(w/2+bw/2);x.fillRect(bx-bw/2,top+h*.5,bw,h*.5);x.beginPath();x.moveTo(bx-bw/2,top+h*.5);x.lineTo(bx,top+h*.3);x.lineTo(bx+bw/2,top+h*.5);x.fill();
  x.beginPath();x.moveTo(cx+s*w/2,top+h*.35);x.lineTo(bx+s*bw/2,top+h*.62);x.lineTo(cx+s*w/2,top+h*.62);x.fill();}
 x.fillStyle=lit;const rows=(h/9)|0;for(let r=1;r<rows;r++)for(let c=0;c<3;c++)if(R()<.2){const wx=cx-w*.3+c*w*.3,wy=top+h*.25+r*8;x.fillRect(wx-1,wy,2,3);}}}
function hiveBlocks(x,n,col,lit,hmin,hmax){for(let i=0;i<n;i++){const cx=R()*W,w=20+R()*70,h=hmin+R()*(hmax-hmin),top=HZ-h;x.fillStyle=col;x.fillRect(cx,top,w,h);
 if(R()<.5){x.fillRect(cx+w*.2,top-h*.25,w*.5,h*.25);}if(R()<.4){x.fillRect(cx+w*.7,top-h*.5,6,h*.5);}
 x.fillStyle=lit;for(let k=0;k<h*w/400;k++)if(R()<.35)x.fillRect(cx+R()*w,top+R()*h,2,2);}}
function pipes(x,n,col){x.strokeStyle=col;for(let i=0;i<n;i++){x.lineWidth=4+R()*14;x.beginPath();const y=HZ-30-R()*260;x.moveTo(0,y);x.bezierCurveTo(W*.3,y+(R()-.5)*120,W*.6,y+(R()-.5)*120,W,y);x.stroke();}}
function stacks(x,n,col,plume){for(let i=0;i<n;i++){const cx=R()*W,h=45+R()*110,w=6+R()*9,top=HZ-h;x.fillStyle=col;x.fillRect(cx-w/2,top,w,h);x.fillRect(cx-w*.7,top,w*1.4,10);
 for(let k=0;k<14;k++){const py=top-k*10-R()*4,px=cx+k*k*.6+(R()-.5)*8,r=8+k*3.2;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,plume.replace('A',String(.22-k*.012)));g.addColorStop(1,plume.replace('A','0'));x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}}}
function horizonGlow(x,col,height){const g=x.createLinearGradient(0,HZ-height,0,HZ);g.addColorStop(0,col.replace('A','0'));g.addColorStop(1,col.replace('A','.85'));x.fillStyle=g;x.fillRect(0,HZ-height,W,height);}
function below(x,col){x.fillStyle=col;x.fillRect(0,HZ,W,H-HZ);}

const SKY={
 void(x){vgrad(x,[[0,'#02030a'],[.6,'#060a1c'],[1,'#0e1430']]);nebula(x,[[W*.2,HZ*.45,520,'rgba(90,40,140,A)',.10],[W*.62,HZ*.3,640,'rgba(30,110,140,A)',.09],[W*.85,HZ*.6,420,'rgba(150,60,110,A)',.08]]);
  stars(x,5200,HZ,['#ffffff','#cfe0ff','#ffe8c8']);for(const [u,v,r] of [[.06,.74,150],[.36,.72,230],[.62,.8,90],[.86,.66,170]])planet(x,W*u,HZ*v,r,'#6a8ab0','#0b1222','rgba(120,180,255,.35)');horizonGlow(x,'rgba(20,30,60,A)',140);below(x,'#0a0e1c');},
 gothic(x){vgrad(x,[[0,'#050204'],[.55,'#14060a'],[1,'#3a0e10']]);nebula(x,[[W*.3,HZ*.35,620,'rgba(150,20,30,A)',.10],[W*.7,HZ*.25,560,'rgba(90,30,90,A)',.08]]);stars(x,3200,HZ*.9,['#ffffff','#ffd8c0']);
  planet(x,W*.58,HZ*.55,120,'#ff9a50','#5a1408','rgba(255,120,60,.45)');horizonGlow(x,'rgba(110,30,20,A)',260);
  gothicSkyline(x,30,'#0c0708','rgba(255,170,90,.8)',80,190);gothicSkyline(x,60,'#070405','rgba(255,150,70,.9)',36,95);below(x,'#120808');},
 underhive(x){vgrad(x,[[0,'#020101'],[.5,'#0a0705'],[1,'#2a1a0e']]);pipes(x,14,'#0d0a08');horizonGlow(x,'rgba(160,80,20,A)',300);
  hiveBlocks(x,90,'#0b0806','rgba(255,170,80,.75)',50,170);hiveBlocks(x,90,'#060403','rgba(255,150,60,.85)',20,70);below(x,'#120c08');},
 forge(x){vgrad(x,[[0,'#1a1412'],[.5,'#3a2a22'],[1,'#a2461a']]);nebula(x,[[W*.4,HZ*.6,700,'rgba(80,60,50,A)',.12],[W*.8,HZ*.5,600,'rgba(70,50,45,A)',.12]]);horizonGlow(x,'rgba(255,110,30,A)',220);
  stacks(x,40,'#120c0a','rgba(60,50,45,A)');hiveBlocks(x,70,'#100a08','rgba(255,140,50,.9)',16,60);below(x,'#1a0e08');},
 hangar(x){vgrad(x,[[0,'#020304'],[.7,'#0a0d12'],[1,'#151a20']]);x.strokeStyle='#262d36';for(let i=0;i<48;i++){x.lineWidth=18;const px=i*W/48;x.beginPath();x.moveTo(px,0);x.lineTo(px,HZ-110);x.stroke();}
  for(const yy of [HZ*.35,HZ*.55,HZ*.7]){for(let i=0;i<96;i++){const px=i*W/96+W/192;const g=x.createRadialGradient(px,yy,0,px,yy,26);g.addColorStop(0,'rgba(220,235,255,.9)');g.addColorStop(1,'rgba(220,235,255,0)');x.fillStyle=g;x.fillRect(px-26,yy-26,52,52);}}
  x.fillStyle='#14181e';x.fillRect(0,HZ-110,W,110);for(let i=0;i<W;i+=64){x.fillStyle=(i/64)%2?'#8a6c18':'#121212';x.fillRect(i,HZ-24,64,5);}
  for(let i=0;i<70;i++){const px=R()*W,py=HZ-100+R()*60;x.fillStyle='rgba(150,200,255,.75)';x.beginPath();x.arc(px,py,3,0,7);x.fill();}below(x,'#101318');}
};
/* floor textures, 1024 px per tile */
function plates(base,vary,seam,opt={}){const [c,x]=cv(1024,1024);x.fillStyle=seam;x.fillRect(0,0,1024,1024);const n=opt.n||4,s=1024/n;
 for(let r=0;r<n;r++)for(let q=0;q<n;q++){const v=(R()-.5)*vary;x.fillStyle=`rgb(${base[0]+v|0},${base[1]+v|0},${base[2]+v|0})`;x.fillRect(q*s+3,r*s+3,s-6,s-6);
  if(opt.rivet){x.fillStyle=opt.rivet;for(const [a,b] of [[12,12],[s-12,12],[12,s-12],[s-12,s-12]]){x.beginPath();x.arc(q*s+a,r*s+b,3.2,0,7);x.fill();}}
  if(opt.hazard&&R()<.08){for(let k=-s;k<s;k+=40){x.fillStyle='#b08a1a';x.beginPath();x.moveTo(q*s+k,r*s+s);x.lineTo(q*s+k+20,r*s+s);x.lineTo(q*s+k+20+s,r*s);x.lineTo(q*s+k+s,r*s);x.fill();}}
  if(opt.inlay){x.strokeStyle=opt.inlay;x.lineWidth=3;x.strokeRect(q*s+18,r*s+18,s-36,s-36);}}
 for(let k=0;k<1400;k++){x.fillStyle=`rgba(0,0,0,${R()*.12})`;const r=4+R()*30;x.beginPath();x.arc(R()*1024,R()*1024,r,0,7);x.fill();}
 if(opt.cracks){x.strokeStyle=opt.cracks;x.lineWidth=2;for(let k=0;k<26;k++){let px=R()*1024,py=R()*1024;x.beginPath();x.moveTo(px,py);for(let j=0;j<6;j++){px+=(R()-.5)*90;py+=(R()-.5)*90;x.lineTo(px,py);}x.stroke();}}
 if(opt.lines){x.strokeStyle=opt.lines;x.lineWidth=10;x.beginPath();x.moveTo(0,512);x.lineTo(1024,512);x.stroke();}
 return c;}
const FLOOR={
 void:()=>plates([46,52,58],14,'#101418',{rivet:'#5a646e'}),
 gothic:()=>plates([40,30,26],12,'#0e0908',{rivet:'#6a5030',inlay:'rgba(150,110,50,.45)',n:2}),
 underhive:()=>plates([48,42,36],18,'#1a1612',{n:3,cracks:'rgba(10,8,6,.6)'}),
 forge:()=>plates([34,28,26],10,'#120c0a',{n:2,cracks:'rgba(255,110,30,.55)'}),
 hangar:()=>plates([52,56,60],10,'#16191c',{rivet:'#707880',lines:'rgba(200,160,30,.5)'})};
const FOG={void:[0x0a0e1c,70,230],gothic:[0x160909,60,210],underhive:[0x1c130c,45,170],forge:[0x2a1a12,50,190],hangar:[0x12161c,60,210]};
const HEMI={void:[0x5a6a90,0x0a0c12],gothic:[0x6a3a3a,0x0c0606],underhive:[0x5a4030,0x0a0806],forge:[0x7a5040,0x100806],hangar:[0x7a8aa0,0x0c0e12]};
const PRESETS=['dusk','void','gothic','underhive','forge','hangar'];
const NAMES={dusk:'Current dusk (step 16)',void:'Orbital void',gothic:'Gothic orbital cathedral',underhive:'Underhive cavern',forge:'Forge world',hangar:'Void-ship hangar'};
let saved=null,active=null;
function apply(THREE,scene,world,renderer,name){
 if(!saved){saved={vis:[],fog:scene.fog,ground:world.userData.ground,hemi:null};world.traverse(o=>{if(o===world)return;
   if((o.isMesh&&o.geometry.type==='SphereGeometry'&&o.geometry.parameters.radius>=150)||o.isPoints||(o.isMesh&&o.material&&o.material.isMeshBasicMaterial&&o.material.color.getHex()===0x120d0a))saved.vis.push(o);
   if(o.isHemisphereLight)saved.hemi={o,c:o.color.clone(),g:o.groundColor.clone()};});
  const g=saved.ground;if(g){saved.map=g.material.map;saved.scale=g.scale.clone();}}
 if(active){scene.remove(active.group);active.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});if(active.tex)active.tex.dispose();active=null;}
 const g=saved.ground;
 if(!name||name==='dusk'||!SKY[name]){saved.vis.forEach(o=>o.visible=true);scene.fog=saved.fog;if(g){g.material.map=saved.map;g.scale.copy(saved.scale);g.material.needsUpdate=true;}
  if(saved.hemi){saved.hemi.o.color.copy(saved.hemi.c);saved.hemi.o.groundColor.copy(saved.hemi.g);}return 'dusk';}
 seed=({void:11,gothic:40,underhive:77,forge:5,hangar:23})[name];
 saved.vis.forEach(o=>o.visible=false);
 const [c,x]=cv(W,H);SKY[name](x);const st=new THREE.CanvasTexture(c);st.colorSpace=THREE.SRGBColorSpace;st.anisotropy=4;
 const group=new THREE.Group();group.name='backdrop '+name;
 const sky=new THREE.Mesh(new THREE.SphereGeometry(190,64,32),new THREE.MeshBasicMaterial({map:st,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false}));sky.renderOrder=-1;group.add(sky);scene.add(group);
 let ft=null;if(g){ft=new THREE.CanvasTexture(FLOOR[name]());ft.colorSpace=THREE.SRGBColorSpace;ft.wrapS=ft.wrapT=THREE.RepeatWrapping;ft.anisotropy=renderer.capabilities.getMaxAnisotropy();
  g.scale.set(2.4,2.4,1);ft.repeat.set(48,48);g.material.map=ft;g.material.color.set(0xffffff);g.material.needsUpdate=true;}
 const f=FOG[name];scene.fog=new THREE.Fog(f[0],f[1],f[2]);
 if(saved.hemi){saved.hemi.o.color.setHex(HEMI[name][0]);saved.hemi.o.groundColor.setHex(HEMI[name][1]);}
 active={group,tex:ft};return name;}
return {apply,PRESETS,NAMES};
})();

/* StationDemo (step 38, 2026-11-07; step 39 adds the Content Engine; step 40 option A: Content hands off, Traffic sends): labelled demo scenarios for loop rooms. Chris: "I need to see an animation of all its features
   functioning in the different scenarios possible". A scenario is a script of beats; the state at any time is worked out from the script
   alone, so it can be played live or seeked frame by frame for video. Every frame carries DEMO SCENARIO, NOT REAL ACTIVITY (never fake
   activity). Moving parts and setStage are the same ones real status reports will drive later; only the script is demo. */
window.StationDemo=(function(){'use strict';
const deg=d=>d*Math.PI/180,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>x*x*(3-2*x);
const COL={working:0x3fd07f,waiting:0xf0b040,blocked:0xd03030,error:0xd03030,paused:0x8a6a3a,future:0x1a1612};
const SCN={},ORDER=[];let api=null,scn=null,clock=0,playing=false,lastT=null,rendered=0,ui=null,rigs={},ended=false;
function textCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function fitText(x,txt,px,maxW,bold){let f=px;do{x.font=(bold?'bold ':'')+f+'px Georgia';f-=2;}while(x.measureText(txt).width>maxW&&f>10);}
function labelSprite(txt,w,h,col){const t=textCanvas(Math.round(320*w/h),320/ (w/h>4?2:1.6),(x,W,H)=>{x.fillStyle='rgba(10,14,10,.88)';x.fillRect(0,0,W,H);x.strokeStyle=col||'#7fe0a0';x.lineWidth=8;x.strokeRect(4,4,W-8,H-8);fitText(x,txt,H*.6,W-30,true);x.fillStyle=col||'#c8f5d4';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,W/2,H/2+2);});
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false}));s.scale.set(w,h,1);s.renderOrder=30;return s;}
function pivot(mod,x,y,z){if(!mod)return null;const p=new THREE.Group();p.position.set(x,y,z);mod.parent.add(p);p.add(mod);mod.position.set(-x,-y,-z);return p;}
function find(g,n){let o=null;g.traverse(c=>{if(c.name===n&&!o)o=c;});return o;}
function basic(c,o){return new THREE.MeshBasicMaterial(Object.assign({color:c},o||{}));}

/* ---------- Traffic Control: the moving parts ---------- */
function tokRig(r,root,add){const tok=new THREE.Group();const card=new THREE.Mesh(new THREE.BoxGeometry(.34,.05,.26),basic(0x7fffa8));tok.add(card);const lbl=labelSprite(' ',1,.28);lbl.position.y=.34;tok.add(lbl);add(root,tok);r.tok=tok;r.card=card;r.lbl=lbl;r.lblCache={};}
function wpos(r,w){if(w[0]==='T')return r.L.trackAt(w[1]);const g=r.G[w[1]];g.updateMatrix();return new THREE.Vector3(w[2],w[3],w[4]).applyMatrix4(g.matrix);}
function tokApply(r,s){r.tok.visible=!!s.tok;if(!s.tok)return;const t=s.tok,p=t.spec;let pos;if(p.at)pos=wpos(r,p.at);else{if(!p._c)p._c=new THREE.CatmullRomCurve3(p.r.map(w=>wpos(r,w)),false,'centripetal');pos=p._c.getPointAt(.5*t.p+.5*smooth(t.p));}
 r.tok.position.copy(pos);const hex=p.col==='r'?0xff5030:p.col==='a'?0xf0b040:0x7fffa8;r.card.material.color.setHex(hex);tokenLabel(r,p.label||'',p.col||'g');const sc=p.fade?1-smooth(clamp((t.p-.7)/.3)):1;r.tok.scale.setScalar(Math.max(.01,sc));}
function wireRig(r,root,L,add){const pts=[];for(let i=0;i<=40;i++){const a=deg(325+(390-325)*i/40);pts.push(new THREE.Vector3(Math.sin(a)*(L.TR+.9),L.F+2.2,Math.cos(a)*(L.TR+.9)));}
 const wc=new THREE.CatmullRomCurve3(pts);r.wire=add(root,new THREE.Mesh(new THREE.TubeGeometry(wc,48,.065,6,false),basic(0x3fd07f)));r.wc=wc;r.wp=add(root,new THREE.Mesh(new THREE.SphereGeometry(.13,12,10),basic(0xc8ffd8)));}
function wireApply(r,s,T){r.wire.visible=!!s.wire;r.wp.visible=!!s.wire;if(s.wire)r.wp.position.copy(r.wc.getPointAt((T*.25)%1));}
function trafficRig(root){const L=root.userData.live,G=L.groups,r={L,G,root,base:{}};for(const k in L.stages)r.base[k]=L.stages[k].state;const all=[];const add=(p,o)=>{p.add(o);all.push(o);return o;};
 r.dish=find(G['signal-tower'],'mod_dish');r.crank=pivot(find(G['distribution-hub'],'mod_crank'),.42,.42,.72);r.bell=pivot(find(G['traffic-lead'],'mod_bell'),.84,1.48,-.28);
 /* scope sweep */
 const sc=new THREE.Group();sc.position.set(-.15,.82,.72);sc.rotation.x=deg(-28);G['signal-tower'].add(sc);all.push(sc);
 const wedge=textCanvas(256,256,(x)=>{const g=x.createRadialGradient(128,128,10,128,128,126);g.addColorStop(0,'rgba(120,255,160,.95)');g.addColorStop(1,'rgba(40,200,90,.5)');x.fillStyle='#04140a';x.beginPath();x.arc(128,128,127,0,7);x.fill();x.fillStyle=g;x.beginPath();x.moveTo(128,128);x.arc(128,128,126,-.75,0);x.closePath();x.fill();x.strokeStyle='rgba(90,220,130,.5)';x.lineWidth=2;[40,80,120].forEach(R=>{x.beginPath();x.arc(128,128,R,0,7);x.stroke();});});
 r.sweep=new THREE.Mesh(new THREE.CircleGeometry(.17,32),basic(0xffffff,{map:wedge}));sc.add(r.sweep);
 /* data stream pulse */
 r.stream=add(G['data-stream'],new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),basic(0x7fffa8)));
 /* filter: one lamp and one word per arch */
 r.arch=[['SEO',2.05,-.42],['CONTENT',1.8,0],['PLATFORM',1.55,.42]].map(([w,h,z])=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.1,14,10),basic(0x2a2a22));m.position.set(0,h+.12,z);add(G.filter,m);const s=labelSprite(w,.62,.17,'#e6cf98');s.position.set(z*1.35,h+.32,z);add(G.filter,s);return m;});
 /* rack cards */
 r.cards={};['X','REDDIT','QUORA','PINTEREST','SEO'].forEach(n=>{r.cards[n]=[0,1,2,3].map(i=>{const c=find(G['campaign-rack'],'rack card '+n+' '+i);c.userData.restore=c.material;c.userData.demo=new THREE.MeshStandardMaterial({color:0x2a2620,roughness:.7});return c;});});
 r.rackBase=['X','REDDIT','QUORA','PINTEREST','SEO'];
 /* lead screens */
 r.screens={};['X','REDDIT','QUORA','PINTEREST','SEO'].forEach((n,k)=>{const a=[-.8,-.4,0,.4,.8][k],m=new THREE.Mesh(new THREE.PlaneGeometry(.27,.22),basic(0xffffff));m.position.set(.72*Math.sin(a)-.035*Math.sin(a),1.2,-(.42*Math.cos(a)-.02)+.07*Math.cos(a));m.rotation.set(deg(-12),-a,0,'YXZ');add(G['traffic-lead'],m);r.screens[n]={m,key:'',cache:{}};});
 /* hub: lamps, tube pulse paths, the seal on Reddit */
 r.lamps={};r.tube={};['RSS','REDDIT','X','QUORA','PINTEREST'].forEach((n,k)=>{const l=find(G['distribution-hub'],'platform lamp '+n);l.userData.restore=l.material;l.userData.demo=l.material.clone();r.lamps[n]=l;const a=deg(-120+k*60),x=Math.sin(a),y=-Math.cos(a);
  r.tube[n]=new THREE.CatmullRomCurve3([[.5*x,.5*y,1.1],[.82*x,.82*y,1.5],[x,y,2.1],[1.12*x,1.1*y+.5,2.7]].map(([px,py,pz])=>new THREE.Vector3(px,pz,-py)));});
 r.pulse=add(G['distribution-hub'],new THREE.Mesh(new THREE.SphereGeometry(.155,16,12),basic(0x7fffa8)));r.pc={};r.xmode=add(G['distribution-hub'],plane(.42,.12,360));r.xmode.position.set(0,.6,.648);
 const a0=deg(-60),seal=new THREE.Group();const plate=new THREE.Mesh(new THREE.PlaneGeometry(.78,.26),new THREE.MeshStandardMaterial({map:textCanvas(420,140,(x,W,H)=>{x.fillStyle='#3a0d0a';x.fillRect(0,0,W,H);x.strokeStyle='#d03030';x.lineWidth=8;x.strokeRect(4,4,W-8,H-8);x.fillStyle='#ffd8c8';x.textAlign='center';x.textBaseline='middle';fitText(x,'SEALED: PENDING API',48,W-30,true);x.fillText('SEALED: PENDING API',W/2,H/2);}),roughness:.6}));plate.position.set(Math.sin(a0)*.92-.1,1.95,Math.cos(a0)*.92+.2);seal.add(plate);
 const band=new THREE.Mesh(new THREE.TorusGeometry(.15,.045,8,20),new THREE.MeshStandardMaterial({color:0x8a1c14,emissive:0x8a1c14,emissiveIntensity:.5,roughness:.5}));band.rotation.x=Math.PI/2;band.position.set(Math.sin(a0)*.92,1.75,Math.cos(a0)*.92);seal.add(band);add(G['distribution-hub'],seal);r.seal=seal;
 /* analytics wall and feedback wire (FUTURE scenario only) */
 const wt=textCanvas(1024,768,(x,W,H)=>{x.fillStyle='#031008';x.fillRect(0,0,W,H);for(let i=0;i<3;i++)for(let j=0;j<4;j++){const cx=j*W/4+W/8,cy=i*H/3+H/6;x.strokeStyle='#2fae62';x.lineWidth=3;x.strokeRect(j*W/4+14,i*H/3+14,W/4-28,H/3-28);if((i+j)%2){x.beginPath();x.moveTo(j*W/4+24,cy+30);for(let q=1;q<=9;q++)x.lineTo(j*W/4+24+q*(W/4-48)/9,cy+30-50*Math.abs(Math.sin(q*1.3+i+j*2)));x.lineWidth=4;x.stroke();}else{[35,70,100].forEach(R=>{x.beginPath();x.arc(cx,cy,R*.9,0,7);x.stroke();});x.fillStyle='rgba(90,255,150,.45)';x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,92,i+j,i+j+.9);x.fill();}}});
 r.wall=add(G['analytics-wall'],new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.66),basic(0xffffff,{map:wt,transparent:true})));r.wall.position.set(0,1.28,.07);
 wireRig(r,root,L,add);
 tokRig(r,root,add);
 r.all=all;r.enable=()=>{for(const n in r.cards)r.cards[n].forEach(c=>{c.material=c.userData.demo;});for(const n in r.lamps)r.lamps[n].material=r.lamps[n].userData.demo;};return r;}
const CARD={q:[0xb8a878,.1],w:[0xf0b040,.55],h:[0xd03030,.6],g:[0x3fd07f,.5]},ARCH={pass:0x3fd07f,fail:0xff3020,hold:0xf0b040};
function leadTex(s,n,w,c){const k=w+'|'+c;return s.cache[k]||(s.cache[k]=textCanvas(256,208,(x,W,H)=>{x.fillStyle='#04120a';x.fillRect(0,0,W,H);x.textAlign='center';x.textBaseline='middle';x.fillStyle='#8fd8a8';fitText(x,n,46,W-20,true);x.fillText(n,W/2,58);x.fillStyle=c;fitText(x,w,60,W-16,true);x.fillText(w,W/2,144);}));}
function tokenLabel(r,txt,col){const k=txt+col;if(!r.lblCache[k]){const s=labelSprite(txt,1.05,.3,col==='r'?'#ffb0a0':col==='a'?'#ffd890':'#c8f5d4');r.lblCache[k]=s.material.map;}r.lbl.material.map=r.lblCache[k];r.lbl.material.needsUpdate=true;r.lbl.scale.set(1.05,.3,1);}
function applyTraffic(r,s,T){const L=r.L;for(const k in s.st)L.setStage(k,s.st[k]);
 if(r.dish)r.dish.rotation.y=s.dishA;r.sweep.parent.visible=s.scope;r.sweep.rotation.z=-T*3;
 r.stream.visible=s.stream!=null;if(s.stream!=null)r.stream.position.set(1.15-2.3*s.stream,.82,0);
 r.arch.forEach((m,i)=>m.material.color.setHex(ARCH[s.arch[i]]||0x2a2a22));
 for(const n in r.cards)r.cards[n].forEach((c,i)=>{const v=(s.rack[n]||[])[i],q=CARD[v];c.material.color.setHex(q?q[0]:0x2a2620);c.material.emissive.setHex(q?q[0]:0);c.material.emissiveIntensity=q?q[1]:0;});
 for(const n in r.screens){const v=s.lead[n],o=r.screens[n],c=v[1]==='working'?'#5fe08f':v[1]==='blocked'?'#ff5040':'#f0b040',k=v[0]+c;if(o.key!==k){o.key=k;o.m.material.map=leadTex(o,n,v[0],c);o.m.material.needsUpdate=true;}}
 for(const n in r.lamps){const c=COL[s.plat[n]]||0x6a5a3a,m=r.lamps[n].material;m.color.setHex(c);m.emissive.setHex(c);m.emissiveIntensity=s.flash===n?5:1;}
 r.seal.visible=s.seal;r.pulse.visible=!!s.pulse;if(s.pulse){const q=s.pulse.p*(s.pulse.stop||1);r.pulse.position.copy(r.tube[s.pulse.nm].getPointAt(q));r.pulse.material.color.setHex(s.pulse.col==='r'?0xff5030:s.pulse.col==='a'?0xf0b040:0x7fffa8);}
 setPlate(r.xmode,r.pc,s.xmode==='DRY RUN'?['X: DRY RUN','waiting']:['X: LIVE','working']);
 if(r.crank)r.crank.rotation.z=-s.crankA;if(r.bell)r.bell.rotation.z=s.bell?.35*Math.sin(T*22)*(1-.5*s.bell):0;
 r.wall.visible=s.wall>0;r.wall.material.opacity=s.wall*.85;wireApply(r,s,T);tokApply(r,s);}
function resetTraffic(r){r.on=false;for(const k in r.L.stages)r.L.stages[k].sg.visible=true;for(const k in r.base)r.L.setStage(k,r.base[k]);r.all.forEach(o=>o.visible=false);for(const n in r.cards)r.cards[n].forEach(c=>{c.material=c.userData.restore;});for(const n in r.lamps)r.lamps[n].material=r.lamps[n].userData.restore;if(r.dish)r.dish.rotation.y=0;if(r.bell)r.bell.rotation.z=0;if(r.crank)r.crank.rotation.z=0;}

/* ---------- the script: state at time T comes from the beats alone ---------- */
function stateAt(T){const s=JSON.parse(JSON.stringify(scn.start));s.arch=[null,null,null];s.dishA=0;s.crankA=0;s.scope=false;s.seal=s.seal!==false;let t0=0,prev=null,cur=null,camT=0;
 for(const b of scn.beats){if(T<t0)break;const e=Math.min(T-t0,b.d),p=clamp(e/b.d),now=T<t0+b.d;
  for(const k of ['rack','lead','plat','st','board','hb'])if(b[k])s[k]=Object.assign(s[k]||{},b[k]);for(const k of ['mode','dish','scope','wall','wire','seal','phone','say','tier','press','fire','fplate','fs','gauge','term','xmode'])if(k in b)s[k]=b[k];if('arch' in b)s.arch=b.arch||[null,null,null];
  if(b.wallUp)s.wall=smooth(p);s.dishA+=(s.dish||0)*e;if(b.crank)s.crankA+=b.crank*e;if(b.arches)b.arches.forEach(([st,at],i)=>{if(p>=at)s.arch[i]=st;});
  if(b.cam!==undefined&&b.cam!==cur){prev=cur;cur=b.cam;camT=t0;}
  s.tok=null;s.pulse=null;s.flash=null;s.stream=null;s.bell=0;s.beat=b;s.scan=null;s.scanCol=null;s.slam=null;s.stamp=null;s.hop=0;s.bin=0;
  if(now){if(b.tok)s.tok={spec:b.tok,p};if(b.scan){s.scan=p;s.scanCol=b.scanCol;}if(b.slam)s.slam=Object.assign({},b.slam,{p});if(b.stamp)s.stamp=b.stamp;if(b.hop)s.hop=1;if(b.bin)s.bin=1;if(b.pulse){s.pulse=Object.assign({},b.pulse,{p});if(p>.75)s.flash=b.pulse.nm;}if(b.stream)s.stream=clamp(p*1.15);if(b.bell)s.bell=p;}
  t0+=b.d;}
 s.cam=[prev,cur,clamp((T-camT)/1.5)];return s;}
function shot(c,id,r){const bp=api.buildingPos(id),L=r.L;if(!c||c==='wide')return{y:3.75,p:.6,d:10.5,t:[bp[0],-1,bp[1]]};if(c==='svc'&&r.hb&&r.hb.gen){const v=new THREE.Vector3();r.hb.gen.getWorldPosition(v);return{y:Math.PI,p:.22,d:3.4,t:[v.x-.22,v.y-.15,v.z]};}const sid=typeof c==='string'?c:c.s,g=r.G[sid],a=deg(L.deg[sid]),R=Math.hypot(g.position.x,g.position.z);return{y:a+Math.PI+(c.yo||0),p:(c.p!=null?c.p:.34),d:c.d||6.2,t:[bp[0]+Math.sin(a)*R*.92,L.F+(c.h||1.6),bp[1]+Math.cos(a)*R*.92]};}
function applyCam(s,id,r){const f=s.cam[1],fs=typeof f==='string'?f:f&&f.s,wide=(!f||f==='wide')&&(s.cam[2]>=1||!s.cam[0]||s.cam[0]==='wide');for(const k in r.L.stages)r.L.stages[k].sg.visible=wide||k===fs;const b=shot(s.cam[1],id,r);let o=b;if(s.cam[0]!==null&&s.cam[2]<1){const a=shot(s.cam[0],id,r),k=smooth(s.cam[2]);let dy=(b.y-a.y)%(Math.PI*2);if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;o={y:a.y+dy*k,p:a.p+(b.p-a.p)*k,d:a.d+(b.d-a.d)*k,t:a.t.map((v,i)=>v+(b.t[i]-v)*k)};}api.view(o.y,o.p,o.d,o.t);}

/* ---------- overlay ---------- */
const CSS=`body.sd-cin [data-ab="view"]{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483000!important}body.sd-cin{overflow:hidden}
.sd{position:fixed;inset:0;z-index:2147483001;pointer-events:none;font-family:Georgia,serif;color:#f0e6cc}.sd *{box-sizing:border-box}.sd [hidden]{display:none!important}
.sd-ban{position:absolute;top:0;left:0;right:0;background:rgba(90,16,10,.92);color:#ffe4d0;font:bold 19px Georgia;letter-spacing:.06em;text-align:center;padding:6px}
.sd-head{position:absolute;top:44px;left:18px;background:rgba(12,10,8,.82);border:1px solid #c9a227;padding:7px 14px}.sd-t{font:bold 24px Georgia;color:#f0dca0}.sd-m{font:15px Georgia;color:#9fe0b0;margin-top:2px}
.sd-chips{position:absolute;top:44px;right:18px;display:flex;gap:6px}.sd-c{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:bold 19px Georgia;background:#1a1612;border:3px solid #6a5a3a;color:#d8c8a0}
.sd-say{position:absolute;left:50%;transform:translateX(-50%);bottom:18px;width:min(1000px,92vw);background:rgba(10,8,6,.9);border:2px solid #c9a227;padding:12px 20px;font:25px/1.3 Georgia;text-align:center;min-height:82px;display:flex;align-items:center;justify-content:center}
.sd-ph{position:absolute;right:26px;top:104px;width:230px;background:#0e1620;border:3px solid #55606e;border-radius:20px;padding:14px 12px;font:16px/1.3 Georgia}.sd-ph b{display:block;color:#8fc8ff;margin-bottom:6px}.sd-ph p{margin:0 0 10px;color:#e8eef4}.sd-bt{display:flex;gap:8px}.sd-bt span{flex:1;text-align:center;padding:7px 2px;background:#22303e;border-radius:8px;font-size:15px}.sd-bt span.on{background:#3fd07f;color:#04140a;font-weight:bold;outline:3px solid #fff}.sd-bt span.no{background:#d03030;color:#fff;font-weight:bold;outline:3px solid #fff}
.sd-card{position:absolute;inset:0;background:rgba(8,6,4,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 8vw}.sd-card h1{font:bold 46px Georgia;color:#f0dca0;margin:0 0 14px}.sd-card p{font:26px/1.35 Georgia;margin:0;max-width:900px}
.sd-x{position:absolute;left:18px;bottom:18px;pointer-events:auto;background:#1a1410;color:#c9a227;border:2px solid #c9a227;padding:8px 12px;font:600 15px Georgia}`;
function mkUI(){if(ui)return ui;const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);const w=document.createElement('div');w.className='sd';w.innerHTML='<div class="sd-ban">DEMO SCENARIO · NOT REAL ACTIVITY · SAMPLE DATA</div><div class="sd-head"><div class="sd-t"></div><div class="sd-m"></div></div><div class="sd-chips"></div><div class="sd-say"></div><div class="sd-ph" hidden><b></b><p></p><div class="sd-bt"></div></div><div class="sd-card" hidden><h1></h1><p></p></div><button class="sd-x" type="button">Exit demo</button>';document.body.appendChild(w);
 const q=c=>w.querySelector(c);q('.sd-x').addEventListener('click',()=>stop());const n=[];for(let i=1;i<=7;i++){const c=document.createElement('div');c.className='sd-c';c.textContent=i;q('.sd-chips').appendChild(c);n.push(c);}ui={w,q,chips:n,last:{}};return ui;}
function set(k,el,v,prop){if(ui.last[k]===v)return;ui.last[k]=v;el[prop||'textContent']=v;}
function paint(s,T){const u=mkUI(),hide=!!u.w.dataset.hideExit;u.q('.sd-x').hidden=hide;const n=SC_NUM();set('t',u.q('.sd-t'),scn.title);set('m',u.q('.sd-m'),'Scenario '+n+' of '+scn.of+' · Room mode: '+s.mode+(s.tier?' · Trust: '+s.tier:''));set('s',u.q('.sd-say'),s.say||'');
 const keys=Object.keys(s.st);if(u.chips.length!==keys.length){const bx=u.q('.sd-chips');bx.innerHTML='';u.chips=keys.map((k,i)=>{const c=document.createElement('div');c.className='sd-c';c.textContent=i+1;bx.appendChild(c);return c;});}u.chips.forEach((c,i)=>{const v=s.st[keys[i]],col={working:'#3fd07f',waiting:'#6a5a3a',blocked:'#d03030',error:'#d03030',future:'#2a2420'}[v]||'#6a5a3a';c.style.borderColor=col;c.style.background=v==='working'?'#14402a':v==='error'||v==='blocked'?'#4a1410':'#1a1612';});
 const ph=u.q('.sd-ph'),pk=JSON.stringify(s.phone);if(u.last.ph!==pk){u.last.ph=pk;ph.hidden=!s.phone;if(s.phone){ph.querySelector('b').textContent=s.phone.from||'Telegram';ph.querySelector('p').textContent=s.phone.text;ph.querySelector('.sd-bt').innerHTML=(s.phone.btn||[]).map(b=>'<span class="'+(s.phone.tap===b?(/reject|no/i.test(b)?'no':'on'):'')+'">'+b+'</span>').join('');}}
 const cd=u.q('.sd-card'),on=T<3;cd.hidden=!on;if(on){set('ct',cd.querySelector('h1'),scn.title);set('cp',cd.querySelector('p'),scn.blurb);}}
const SC_NUM=()=>ORDER.filter(i=>SCN[i].room===scn.room).indexOf(scn.id)+1;
const ROOMS={traffic:()=>({rig:trafficRig,apply:applyTraffic,reset:resetTraffic}),content:()=>({rig:contentRig,apply:applyContent,reset:resetContent})};
function rig(id){if(!rigs[id]){let room=null;api.interiors[id].traverse(o=>{if(o.userData.live&&!room)room=o;});rigs[id]=ROOMS[id]().rig(room);}const r=rigs[id];if(!r.on){r.on=true;r.all.forEach(o=>o.visible=true);if(r.enable)r.enable();}return r;}
function apply(T){const id=scn.room,r=rig(id),s=stateAt(T);ROOMS[id]().apply(r,s,T);applyCam(s,id,r);paint(s,T);}
function load(sid){api=window.armyBaseInstance;if(scn)stop(true);const S=SCN[sid];if(!S)throw new Error('no scenario '+sid);api.enter(S.room);scn=S;scn.of=ORDER.filter(i=>SCN[i].room===S.room).length;mkUI();document.body.classList.add('sd-cin');ui.w.hidden=false;clock=0;ended=false;return {duration:duration()};}
function duration(){return scn.beats.reduce((a,b)=>a+b.d,0);}
function play(sid){load(sid);playing=true;lastT=null;}
function stop(keep){if(!scn)return;const r=rigs[scn.room];if(r)ROOMS[scn.room]().reset(r);const id=scn.room;scn=null;playing=false;document.body.classList.remove('sd-cin');if(ui){ui.w.hidden=true;ui.last={};}if(!keep)api.enter(id);}
function frame(t){if(!scn)return;if(playing){if(lastT!=null)clock+=Math.min(.1,(t-lastT)/1000);lastT=t;if(clock>=duration()+1){ended=true;stop();return;}}apply(Math.min(clock,duration()-.001));rendered++;}

/* ---------- Traffic Control scenarios, from 50-Cassian/design/traffic-control-loop-spec.md ---------- */
const LEAD={s:'traffic-lead',d:3.7,h:1.42,p:.26,yo:.34};
const STAGES=['signal-tower','data-stream','filter','campaign-rack','traffic-lead','distribution-hub','analytics-wall'];
const only=(sid,o)=>{const m={};STAGES.forEach(k=>m[k]=k==='analytics-wall'?'future':k===sid?'working':'waiting');return Object.assign(m,o||{});};
const arc=(a,b)=>{const p=[],n=Math.max(2,Math.round(Math.abs(b-a)/9));for(let i=0;i<=n;i++)p.push(['T',a+(b-a)*i/n]);return p;};
const IDX={X:0,REDDIT:1,QUORA:2,PINTEREST:3,SEO:4},slot=(n,row)=>['L','campaign-rack',-1.16+IDX[n]*.58,1.92-row*.4,.16];
const OUT=[['L','signal-tower',0,.95,.8],...arc(40,100)],GATE=[['T',100],['L','filter',1.1,.95,-.95],['L','filter',0,.95,-.9],['L','filter',0,.95,.8]];
const START=()=>({tier:'X Tier 1 · Manual',xmode:'LIVE',mode:'WATCHING',dish:.12,wall:0,wire:false,seal:true,phone:null,say:'',st:only(null),rack:{X:[],REDDIT:['h'],QUORA:['q','q'],PINTEREST:[],SEO:[]},
 lead:{X:['ACTIVE','working'],REDDIT:['BLOCKED','blocked'],QUORA:['BY HAND','waiting'],PINTEREST:['READY','waiting'],SEO:['BY HAND','waiting']},plat:{X:'working',RSS:'working',REDDIT:'blocked',QUORA:'paused',PINTEREST:'waiting'}});
const pass3=[['pass',.42],['pass',.56],['pass',.72]];
const scan=(say,d)=>({say,d:d||4.5,cam:{s:'signal-tower',d:5.2,h:1.5},dish:1.1,scope:true,mode:'SCANNING',st:only('signal-tower')});
const flow=(label,say,col)=>({say,d:4.5,cam:'data-stream',dish:.12,scope:false,st:only('data-stream'),stream:1,tok:{r:OUT,label,col}});
const gate=(label,say,arches,d)=>({say,d:d||6,cam:'filter',st:only('filter'),tok:{r:GATE,label},arches:arches||pass3});
const inRack=(n,row,label,say,o)=>Object.assign({say,d:4,cam:'campaign-rack',mode:'DISTRIBUTING',st:only('campaign-rack'),tok:{r:[['L','filter',0,.95,.8],...arc(135,152),slot(n,row)],label}},o||{});
const toLead=(n,row,label,say,o)=>Object.assign({say,d:4.5,cam:LEAD,arch:null,st:only('traffic-lead'),tok:{r:[slot(n,row),...arc(178,212)],label}},o||{});
const toHub=(label,say,o)=>Object.assign({say,d:4,cam:'distribution-hub',st:only('distribution-hub'),phone:null,tok:{r:[...arc(222,268),['L','distribution-hub',0,.75,.85]],label}},o||{});
const send=(nm,say,o)=>Object.assign({say,d:3.5,cam:'distribution-hub',pulse:{nm}},o||{});
const rest=say=>({say,d:4.5,cam:'wide',mode:'WATCHING',dish:.12,scope:false,phone:null,st:only(null)});
const intro=()=>({d:3,cam:'wide',say:''});
const TG=(text,btn,tap)=>({from:'Telegram · Traffic Lead',text,btn:btn||['Approve','Reject'],tap});
function add(id,room,title,blurb,beats,o){beats.unshift(intro());SCN[id]={id,room,title,blurb,beats,start:Object.assign(START(),o||{})};ORDER.push(id);}
const INTAKE=[['L','signal-tower',-.98,3.1,.38],['L','signal-tower',-.98,1.0,.38],['L','signal-tower',-.5,.95,.72],['L','signal-tower',0,.95,.8]],HUBX={s:'distribution-hub',d:3.8,h:1.0};

add('t-watch','traffic','Quiet watch','Nothing to do. This is what the room looks like most of the time.',[
 {d:5,cam:'wide',say:'Default state: the room just watches. The dish sweeps slowly and nothing moves until there is real work.'},
 {d:4.5,cam:'signal-tower',say:'1. The Signal Tower. The dish turns slowly. The Signal Officer watches for places to post and pages to fix.'},
 {d:5,cam:{s:'campaign-rack',d:6},say:'4. The Campaign Rack. One column per platform. Lit cards are orders waiting. Red means stuck.'},
 {d:5,cam:LEAD,say:'5. The Traffic Lead. One screen per platform: X active, Reddit blocked, Quora by hand, Pinterest ready, SEO by hand.'},
 {d:5,cam:{s:'distribution-hub',d:5.4,h:1.4},say:'6. The Distribution Hub. Five tubes out of the room. Green lamp live, amber ready, red blocked. Reddit is sealed.'},
 {d:4,cam:{s:'analytics-wall',d:6},say:'7. The Analytics Wall stays dark. It is not built yet.'}]);

add('t-x','traffic','An X post goes out','The normal path, start to finish, with your approval.',[
 {say:'A finished post arrives by tube from the Content Engine, which wrote and checked it.',d:4.5,cam:{s:'signal-tower',d:5.2,h:1.5},mode:'SCANNING',tok:{r:INTAKE,label:'X POST'}},
 scan('Step 1. The Signal Tower works out the best time and place to send it.',4.5),
 flow('X POST','Step 2. That decision becomes a distribution order. The Data Stream carries it on.'),
 gate('X POST','Step 3. The Filter runs three checks in order: SEO, content rules, platform limits. X is at 2 of 5 today, so it passes.'),
 inRack('X',0,'X POST','All three lamps green. Step 4. The order drops into the X column of the Campaign Rack.'),
 {say:'It waits here for its turn. The rack shows at a glance what is queued on each platform.',d:3,rack:{X:['q']},tok:null},
 toLead('X',0,'X POST','Step 5. The Traffic Lead picks it up. The X screen changes to ask for approval.',{rack:{X:[]},lead:{X:['APPROVE?','waiting']}}),
 {say:'The bell rings and your phone gets an approval card on Telegram.',d:4.5,bell:1,phone:TG('X post ready, scheduled for today. Approve?')},
 {say:'You tap Approve.',d:2.5,phone:TG('X post ready, scheduled for today. Approve?',null,'Approve')},
 toHub('X POST','Step 6. Approved. The order rolls on to the Distribution Hub.',{lead:{X:['APPROVED','working']}}),
 send('X','It shoots up the X tube and out of the room. The lamp flashes. X is now 3 of 5 for today.'),
 rest('Done. The room goes back to watching. Step 7, learning from results, is not built yet, so the wall stays dark.')]);

add('t-filter','traffic','Stopped at the Filter','Two ways an order gets stopped before it ever reaches you.',[
 flow('X POST','An order comes down the Data Stream. This post has a rule problem in the text.','g'),
 Object.assign(gate('X POST','SEO passes. The content arch fails it: a banned term. It goes no further.',[['pass',.42],['fail',.6]]),{tok:{r:[...GATE,['L','filter',1.08,.8,.42],['L','filter',1.08,.15,.32]],label:'X POST',col:'r',fade:true}}),
 {say:'It drops down the reject chute. Nothing is sent and nobody is bothered. The rack stays empty.',d:3.5,cam:'filter',st:only(null,{filter:'error'})},
 Object.assign(flow('X POST','Second order. Clean text this time, but X has already hit its limit of 5 posts today.'),{arch:null,lead:{X:['5 OF 5','waiting']}}),
 gate('X POST','SEO and content pass. The platform arch goes amber: no room left today.',[['pass',.42],['pass',.56],['hold',.72]]),
 inRack('X',0,'X POST','It is not thrown away. It waits in the rack for tomorrow, marked amber.'),
 {say:'Amber card, X column: held by the daily limit. It goes on its own when the count resets.',d:4,rack:{X:['w']}},
 rest('Back to watching. Nothing reached your phone, because nothing needed you.')]);

add('t-reject','traffic','You say no (trust drops)','You stay in charge. One rejection from you trips the circuit breaker.',[
 {say:'Here X is at Tier 2 (21 to 50 posts). The Traffic Lead sends you a preview and waits one hour for a no.',d:5.5,cam:LEAD,lead:{X:['TIER 2','waiting']}},
 toLead('X',0,'X POST','A new X post has cleared the Filter and reaches the Traffic Lead.',{mode:'DISTRIBUTING',lead:{X:['PREVIEW SENT','waiting']}}),
 {say:'Your phone gets the preview.',d:4,bell:1,phone:TG('X post goes out in 60 min unless you decline.',['Decline','OK'])},
 {say:'You do not like it and tap Decline.',d:3,phone:TG('X post goes out in 60 min unless you decline.',['Decline','OK'],'Decline')},
 {say:'The post is cancelled. Nothing goes near the Hub.',d:4,phone:null,lead:{X:['DECLINED','blocked']}},
 {say:'One rejection trips the circuit breaker: X drops back to Tier 1, so every X post needs your OK again.',d:5.5,tier:'X Tier 1 · Manual',lead:{X:['TIER 1','blocked']},st:only(null,{'traffic-lead':'error'})},
 {say:'It cannot move back up for 48 hours. Trust is earned back one post at a time.',d:5,lead:{X:['48H COOLDOWN','waiting']},st:only(null)},
 Object.assign(rest('Back to watching.'),{lead:{X:['ACTIVE','working']}})],{tier:'X Tier 2 · Suggested'});

add('t-veto','traffic','Tier 2: silence means yes','At Tier 2 an X post goes out unless you stop it within the hour.',[
 toLead('X',0,'X POST','A new X post reaches the Traffic Lead. X is at Tier 2.',{mode:'DISTRIBUTING',lead:{X:['PREVIEW SENT','waiting']}}),
 {say:'Your phone gets a preview with a one-hour clock.',d:4.5,bell:1,phone:TG('X post goes out in 60 min unless you decline.',['Decline','OK'])},
 {say:'You are busy and do nothing. The hour runs out.',d:4,phone:TG('X post goes out in 0 min unless you decline.',['Decline','OK'])},
 {say:'No decline came, so the Traffic Lead approves it himself.',d:4,phone:null,lead:{X:['AUTO OK','working']}},
 toHub('X POST','On to the Distribution Hub.'),
 send('X','Out through the X tube.'),
 Object.assign(rest('Back to watching. You could have stopped it at any point in that hour.'),{lead:{X:['ACTIVE','working']}})],{tier:'X Tier 2 · Suggested'});

add('t-auto','traffic','Tier 3 and 4: X on its own','After enough good posts, X goes out without asking first.',[
 {say:'After 51 good X posts, X reaches Tier 3. After 100, Tier 4. The Traffic Lead no longer asks first.',d:5.5,cam:LEAD,lead:{X:['TIER 3','working']}},
 toLead('X',0,'X POST','A new X post reaches the Traffic Lead. No bell, no phone: he approves it himself.',{mode:'DISTRIBUTING',lead:{X:['AUTO','working']}}),
 toHub('X POST','On to the Distribution Hub.'),
 send('X','Out through the X tube.'),
 {say:'You get one digest a day at Tier 3, or one a week at Tier 4, to spot check what went out.',d:5,cam:'wide',phone:{from:'Telegram · Daily digest',text:'Today: 3 X posts out, 0 failed, 0 declined. Tap to review.',btn:['Review']}},
 Object.assign(rest('Back to watching. Any decline from you still drops X a tier.'),{lead:{X:['ACTIVE','working']}})],{tier:'X Tier 3 · Approved'});

add('t-dry','traffic','X test mode (DRY RUN)','The X poster runs every step except the final click.',[
 {say:'The X poster has a test mode, DRY RUN. The spec gives that as the setting today. The plate under the X lamp shows it.',d:5.5,cam:HUBX},
 toHub('X POST','An approved X post reaches the Hub.',{mode:'DISTRIBUTING',lead:{X:['APPROVED','working']}}),
 send('X','It goes through every step except clicking Post, so it never leaves the room.',{pulse:{nm:'X',stop:.5,col:'a'},d:4}),
 {say:'Nothing is published. That is how the whole loop can be tested safely.',d:4.5,cam:HUBX},
 {say:'Switching X to LIVE is the biggest single decision in the system. It stays your call.',d:5,cam:HUBX},
 Object.assign(rest('Back to watching.'),{lead:{X:['ACTIVE','working']}})],{xmode:'DRY RUN'});

add('t-reddit','traffic','Reddit is blocked','Reddit API approval is still pending, so the room works around it.',[
 scan('The smart social engine crafts a Reddit post for a good subreddit.'),
 flow('REDDIT POST','The order comes down the Data Stream like any other.'),
 gate('REDDIT POST','It passes the Filter. Reddit limit is 0 of 3.'),
 inRack('REDDIT',1,'REDDIT POST','It goes in the Reddit column, next to the red card already stuck there.'),
 {say:'Red cards: ready to go, with no way out of the room.',d:3.5,rack:{REDDIT:['h','h']}},
 {say:'The Hub cannot send it. The Reddit tube is sealed with a plate until the API ticket is approved.',d:5,cam:{s:'distribution-hub',d:4.6,h:1.2},st:only(null,{'distribution-hub':'blocked'})},
 {say:'So your phone tells you. Today you copy the text and post it yourself in the Reddit app.',d:5,cam:LEAD,st:only(null,{'traffic-lead':'waiting'}),bell:1,phone:TG('2 Reddit posts ready. Reddit API still blocked. Post by hand?',['Copy text','Later'])},
 {say:'You tap Copy text and post it from your phone. The card is cleared.',d:3.5,phone:TG('2 Reddit posts ready. Reddit API still blocked. Post by hand?',['Copy text','Later'],'Copy text'),rack:{REDDIT:['h']}},
 rest('Back to watching. When Reddit approves the API, the seal comes off and this tube works like X.')]);

add('t-quora','traffic','Quora by hand','Quora has no API, so this tube is worked by hand.',[
 {say:'The answer bank holds pre-written Quora answers. They sit as cards in the Quora column.',d:4.5,cam:{s:'campaign-rack',d:6},mode:'DISTRIBUTING'},
 toLead('QUORA',0,'QUORA ANSWER','The Traffic Lead picks the next one. Quora rule: at most 2 a day, no links until 30 answers.',{rack:{QUORA:['q']},lead:{QUORA:['YOUR TURN','waiting']}}),
 {say:'No automation is possible here, so your phone says it is your turn.',d:4.5,bell:1,phone:TG('Quora answer 1 of 2 today. Tap to copy, then post in Quora.',['Copy text','Later'])},
 {say:'You post it yourself from the Quora app.',d:3,phone:TG('Quora answer 1 of 2 today. Tap to copy, then post in Quora.',['Copy text','Later'],'Copy text')},
 {say:'At the Hub the hand crank turns. That is you, posting by hand. The lamp lights to show it went out.',d:6,cam:{s:'distribution-hub',d:4.2,h:.95,yo:.12},phone:null,crank:5,st:only('distribution-hub'),pulse:{nm:'QUORA'},lead:{QUORA:['1 OF 2','working']}},
 Object.assign(rest('Back to watching. Quora stays by hand for good, because the platform allows nothing else.'),{lead:{QUORA:['BY HAND','waiting']}})]);

add('t-pinterest','traffic','Pinterest on its own','How a trusted platform runs once you switch it on. Not active today.',[
 {say:'Pinterest is ready but waiting for you to activate it. This shows what happens after you do.',d:5,cam:LEAD,lead:{PINTEREST:['AUTO','working']},plat:{PINTEREST:'working'}},
 scan('The Signal Tower picks a blog post for a pin. RSS feeds keep Pinterest up to date in the background.'),
 flow('PINTEREST PIN','The pin order moves down the Data Stream.'),
 gate('PINTEREST PIN','Three checks. Pinterest limit is 15 a day.'),
 inRack('PINTEREST',0,'PINTEREST PIN','It drops into the Pinterest column.'),
 toLead('PINTEREST',0,'PINTEREST PIN','The Traffic Lead sees this platform is trusted. No bell, no phone. It passes straight through.'),
 toHub('PINTEREST PIN','It rolls on to the Hub with no approval step.',{lead:{PINTEREST:['AUTO','working']}}),
 send('PINTEREST','Out through the Pinterest tube, with tracking on the link.'),
 rest('Your phone stayed quiet. You see the count, and each platform earns this trust separately.')]);

add('t-seo','traffic','An SEO fix','SEO runs on a different rhythm: audit, fix, check again.',[
 scan('The Tower audits the five sites. One page scores 62. Anything under 70 gets flagged.',5.5),
 flow('SEO FIX','The fix proposal carries the page and what is wrong with it.'),
 gate('SEO FIX','The Filter checks the proposal against the SEO rules.'),
 inRack('SEO',0,'SEO FIX','It goes in the SEO column. There is no tube for SEO: fixes are made in a build session.'),
 {say:'The amber card waits for the next build session. The SEO screen shows it needs someone.',d:4.5,rack:{SEO:['w']},lead:{SEO:['1 WAITING','waiting']},cam:LEAD,st:only(null,{'traffic-lead':'waiting'})},
 {say:'The fix is made in a build session. The next audit scores the page at 78, so the card clears.',d:5,rack:{SEO:['g']},lead:{SEO:['FIXED','working']},cam:{s:'campaign-rack',d:6},st:only('campaign-rack')},
 send('RSS','Separately, the RSS tube pushes fresh feeds on its own. That one always runs.',{rack:{SEO:[]},lead:{SEO:['BY HAND','waiting']},st:only('distribution-hub')}),
 rest('Back to watching. SEO keeps going in the background alongside the posting.')]);

add('t-fail','traffic','A post fails','What the room does when something goes wrong on the way out.',[
 toHub('X POST','An approved X post reaches the Hub, as normal.',{mode:'DISTRIBUTING',lead:{X:['APPROVED','working']}}),
 send('X','It goes up the tube, but X refuses it: the login session has expired.',{pulse:{nm:'X',stop:.72,col:'r'}}),
 {say:'ERROR. The X lamp goes red and the room mode changes. Nothing else is sent on X.',d:4.5,mode:'ERROR',plat:{X:'error'},lead:{X:['ERROR','blocked']},st:only(null,{'distribution-hub':'error'}),cam:{s:'distribution-hub',d:4.4,h:1.2}},
 {say:'The order goes back to the rack, marked red, so it is not lost.',d:4,rack:{X:['h']},cam:{s:'campaign-rack',d:6},st:only(null,{'distribution-hub':'error','campaign-rack':'waiting'})},
 {say:'Bell, and your phone gets an alert saying what broke and what it needs.',d:4.5,cam:LEAD,bell:1,phone:TG('X post failed: login session expired. Refresh session?',['Refresh','Later'])},
 {say:'You tap Refresh. The session is renewed.',d:3,phone:TG('X post failed: login session expired. Refresh session?',['Refresh','Later'],'Refresh'),plat:{X:'working'},lead:{X:['ACTIVE','working']},st:only(null)},
 toLead('X',0,'X POST','The held post comes back out and goes round again. You already approved it, so it skips the phone.',{mode:'DISTRIBUTING',phone:null,rack:{X:[]}}),
 toHub('X POST','On to the Hub.'),
 send('X','Out through the X tube, and the lamp flashes green this time.'),
 rest('Back to watching. The room recovered without losing the post.')]);

add('t-future','traffic','Learning from results (not built)','Stage 7. This needs GA4 wired in and 50 tracked posts. Nothing here exists yet.',[
 {say:'NOT BUILT. Results come back: which posts got clicks, visits and sales.',d:5,mode:'NOT BUILT',cam:{s:'analytics-wall',d:6},st:only(null,{'analytics-wall':'working'}),wallUp:1},
 {say:'The Analytics Wall lights up with radar sweeps showing where attention goes.',d:5,wall:1,cam:{s:'analytics-wall',d:4.6}},
 {say:'NOT BUILT. Best results go back along the feedback wire overhead, from the Wall to the Tower.',d:6,wire:true,cam:'wide'},
 {say:'NOT BUILT. The dish changes its sweep: more attention on the platforms that sell, less on those that do not.',d:6,cam:'signal-tower',dish:.6,scope:true,st:only('signal-tower',{'analytics-wall':'working'})},
 {say:'At first these are only suggestions for you. Later the room could adjust itself. That is the full loop.',d:5,cam:'wide'}]);

/* ---------- Content Engine: the moving parts (step 39), from 50-Cassian/design/content-room-loop-spec.md ---------- */
const PC={working:'#5fe08f',waiting:'#f0b040',error:'#ff5040',idle:'#b8a888',blue:'#8fc8ff'};
function plateTex(cache,txt,col,W0,H0,sub){const k=txt+'|'+col+'|'+(sub||'');return cache[k]||(cache[k]=textCanvas(W0,H0,(x,W,H)=>{x.fillStyle='#0c0a08';x.fillRect(0,0,W,H);x.strokeStyle=col;x.lineWidth=6;x.strokeRect(3,3,W-6,H-6);x.textAlign='center';x.textBaseline='middle';x.fillStyle=col;
 if(sub){fitText(x,txt,H*.36,W-24,true);x.fillText(txt,W/2,H*.32);x.fillStyle='#e8dcc0';fitText(x,sub,H*.25,W-24,false);x.fillText(sub,W/2,H*.72);}else{fitText(x,txt,H*.5,W-24,true);x.fillText(txt,W/2,H/2+2);}}));}
function plane(w,h,pw,ph){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),basic(0xffffff));m.userData.w=pw||400;m.userData.h=ph||Math.round((pw||400)*h/w);return m;}
function setPlate(m,cache,v){if(!v)return;const [txt,ck,sub]=v,col=PC[ck]||ck,k=txt+col+(sub||'');if(m.userData.k===k)return;m.userData.k=k;m.material.map=plateTex(cache,txt,col,m.userData.w,m.userData.h,sub);m.material.needsUpdate=true;}
function dialTex(){return textCanvas(256,256,(x)=>{x.fillStyle='#e8dcc0';x.beginPath();x.arc(128,128,124,0,7);x.fill();x.strokeStyle='#2a2018';x.lineWidth=4;for(let i=0;i<=10;i++){const a=Math.PI*(.75+1.5*i/10);x.beginPath();x.moveTo(128+Math.cos(a)*92,128+Math.sin(a)*92);x.lineTo(128+Math.cos(a)*112,128+Math.sin(a)*112);x.stroke();}x.strokeStyle='#8e1c2a';x.lineWidth=8;x.beginPath();x.arc(128,128,104,Math.PI*1.95,Math.PI*2.25);x.stroke();});}
function contentRig(root){const L=root.userData.live,G=L.groups,r={L,G,root,base:{},pc:{}};for(const k in L.stages)r.base[k]=L.stages[k].state;const all=[];const add=(p,o)=>{p.add(o);all.push(o);return o;};
 r.fire=[];G.forge.traverse(o=>{if(o.isMesh&&o.material&&(/fire/i.test(o.material.name||'')||o.name==='forge fire')){o.userData.m0=o.material;o.userData.md=o.material.clone();r.fire.push(o);}});
 r.fplate=add(G.forge,plane(.56,.22));r.fplate.position.set(0,.86,.64);
 r.bar=add(G.inspector,new THREE.Mesh(new THREE.BoxGeometry(1.42,.035,.06),basic(0x60e0ff)));r.hop=add(G.inspector,new THREE.Mesh(new THREE.SphereGeometry(.09,12,10),basic(0x401010)));r.hop.position.set(.95,.78,.35);
 r.cards=[];for(let k=0;k<18;k++){const c=find(G['job-board'],'board card '+k);if(c){c.userData.restore=c.material;c.userData.demo=new THREE.MeshStandardMaterial({color:0x2a2620,roughness:.7});r.cards.push(c);}}
 r.pipe=new THREE.CatmullRomCurve3([[0,1.1,0],[0,2.2,0],[0,2.65,-.35],[0,2.9,-.9],[0,3.0,-1.5]].map(a=>new THREE.Vector3(...a)));r.pulse=add(G.handoff,new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),basic(0x7fffa8)));
 const dt=dialTex();r.needles=[-.48,.48].map(x=>{const f=add(G['gauge-panel'],new THREE.Mesh(new THREE.CircleGeometry(.32,40),basic(0xffffff,{map:dt})));f.position.set(x,1.6,-.035);const p=new THREE.Group();p.position.set(x,1.6,-.02);add(G['gauge-panel'],p);const n=new THREE.Mesh(new THREE.BoxGeometry(.025,.27,.012),basic(0x1a1410));n.position.y=.12;p.add(n);return p;});
 r.term=add(G['gauge-panel'],plane(.3,.2,360));r.term.position.set(0,.93,.68);
 wireRig(r,root,L,add);
 r.hb={};root.traverse(o=>{if(o.name==='heartbeat Content generator service')r.hb.gen=o;});for(const k in r.hb){const m=r.hb[k].material;r.hb[k].userData.c0=[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity];}
 tokRig(r,root,add);r.stampSp=labelSprite('PASS',.9,.32,'#5fe08f');r.stampMaps={PASS:r.stampSp.material.map,FAIL:labelSprite('FAIL',.9,.32,'#ff6050').material.map};add(root,r.stampSp);
 r.all=all;r.enable=()=>{r.cards.forEach(c=>c.material=c.userData.demo);r.fire.forEach(o=>o.material=o.userData.md);};return r;}
const BOARD={p:[0xe0d0a0,.25],a:[0x3fd07f,.5],s:[0x5a8fd0,.45],d:[0x6a625a,.05],f:[0xd03030,.7],k:[0xff3020,.9]};
function applyContent(r,s,T){const L=r.L;for(const k in s.st)L.setStage(k,s.st[k]);
 const fi=s.fire==='on'?2.2+.9*Math.sin(T*13)*Math.sin(T*3.1):s.fire==='off'?0:.3;r.fire.forEach(o=>{if(o.material.emissiveIntensity!==undefined)o.material.emissiveIntensity=fi;});
 setPlate(r.fplate,r.pc,s.fplate);r.bar.visible=s.scan!=null;if(s.scan!=null){r.bar.position.set(0,1.42-.8*s.scan,-.05);r.bar.material.color.setHex(s.scanCol==='r'&&s.scan>.6?0xff4030:0x60e0ff);}
 r.hop.material.color.setHex(s.hop?(Math.sin(T*18)>0?0xff3020:0x601010):0x401010);
 r.cards.forEach((c,i)=>{const q=BOARD[(s.board||{})[i]];const fl=(s.board||{})[i]==='k'&&Math.sin(T*6)>0;c.material.color.setHex(q?q[0]:0x2a2620);c.material.emissive.setHex(q?q[0]:0);c.material.emissiveIntensity=q?q[1]*(fl?2:1):0;});
 r.pulse.visible=!!s.pulse;if(s.pulse){r.pulse.position.copy(r.pipe.getPointAt(s.pulse.p*(s.pulse.stop||1)));r.pulse.material.color.setHex(s.pulse.col==='r'?0xff5030:0x7fffa8);}
 const g=s.gauge||0;r.needles.forEach((p,i)=>{p.parent&&(p.visible=g>0);p.rotation.z=2.2-g*(1.6+i*.9)-.12*Math.sin(T*1.7+i);});r.G['gauge-panel'].children.forEach(o=>{if(o.geometry&&o.geometry.type==='CircleGeometry')o.visible=g>0;});r.term.visible=g>0&&!!s.term;setPlate(r.term,r.pc,s.term||null);
 wireApply(r,s,T);for(const k in r.hb){const st=(s.hb||{})[k]||'working',m=r.hb[k].material,c=COL[st]||0x6a5a3a;m.color.setHex(c);m.emissive.setHex(c);m.emissiveIntensity=st==='working'?.6+1.4*Math.max(0,Math.sin(T*5)):st==='error'?2.2:1.2;}
 tokApply(r,s);r.stampSp.visible=!!s.stamp&&r.tok.visible;if(r.stampSp.visible){r.stampSp.material.map=r.stampMaps[s.stamp];r.stampSp.position.copy(r.tok.position);r.stampSp.position.y+=.75;}}
function resetContent(r){r.on=false;for(const k in r.L.stages)r.L.stages[k].sg.visible=true;for(const k in r.base)r.L.setStage(k,r.base[k]);r.all.forEach(o=>o.visible=false);r.cards.forEach(c=>c.material=c.userData.restore);r.fire.forEach(o=>o.material=o.userData.m0);
 for(const k in r.hb){const m=r.hb[k].material,c=r.hb[k].userData.c0;m.color.setHex(c[0]);m.emissive.setHex(c[1]);m.emissiveIntensity=c[2];}}

/* ---------- Content Engine scenarios (option A, Chris 2026-11-07: this room makes posts and hands them to Traffic Control) ---------- */
const CST=['forge','conveyor','inspector','job-board','handoff','gauge-panel'];
const onlyC=(sid,o)=>{const m={};CST.forEach(k=>m[k]=k==='gauge-panel'?'future':k===sid?'working':'waiting');return Object.assign(m,o||{});};
const FORGE={s:'forge',d:5.2,h:1.35},SLEEP=['SLEEPING','idle','next run in 5h 40m'],HAND={s:'handoff',d:5.4,h:1.6};
const card=k=>['L','job-board',-.75+(k%6)*.3,2.12-Math.floor(k/6)*.42,.16],INSPF=['L','inspector',0,.9,.75];
const FORGE_OUT=[['L','forge',.05,1.6,.05],['L','forge',.05,1.25,.8],['L','conveyor',1.1,.6,0],['L','conveyor',0,.6,0],['L','conveyor',-1.05,.6,0]];
const INSP=[['L','conveyor',-1.05,.6,0],['L','inspector',.9,.95,-.75],['L','inspector',0,.9,-.55],INSPF];
const HOP=[['L','inspector',0,.9,.5],['L','inspector',.95,.85,.35],['L','inspector',.95,.15,.35]];
const toBoard=k=>[INSPF,...arc(155,185),card(k)],toHand=k=>[card(k),...arc(213,250),['L','handoff',0,1.0,.5],['L','handoff',0,1.2,0]];
const TGF=(text,btn,tap,from)=>({from:from||'Telegram · Station',text,btn:btn||['OK'],tap});
const CSTART=()=>({mode:'SLEEPING',fire:'low',fplate:SLEEP,board:{0:'s',1:'s',2:'s'},hb:{gen:'working'},gauge:0,wire:false,term:null,phone:null,say:'',st:onlyC(null)});
const write=(say,d)=>({say,d:d||5,cam:FORGE,mode:'PRODUCING',fire:'on',fplate:['WRITING','working','new post'],st:onlyC('forge')});
const belt=(label,say,col)=>({say,d:5,cam:{s:'conveyor',d:5.6},fire:'low',fplate:SLEEP,st:onlyC('conveyor'),tok:{r:FORGE_OUT,label,col}});
const inspect=(label,say,fail)=>({say,d:5.5,cam:{s:'inspector',d:5.6},st:onlyC('inspector'),tok:{r:INSP,label},scan:1,scanCol:fail?'r':'c'});
const toB=(k,label,say)=>({say,d:4.5,cam:{s:'job-board',d:6.4},st:onlyC('job-board'),tok:{r:toBoard(k),label}});
const crest=say=>({say,d:4.5,cam:'wide',mode:'SLEEPING',fire:'low',fplate:SLEEP,phone:null,st:onlyC(null)});
function addC(id,title,blurb,beats,o){beats.unshift({d:3,cam:'wide',say:''});SCN[id]={id,room:'content',title,blurb,beats,start:Object.assign(CSTART(),o||{})};ORDER.push(id);}

addC('c-sleep','Sleeping (most of the time)','The room between runs. This room makes posts; Traffic Control approves and sends them.',[
 {d:5.5,cam:'wide',say:'Default state: the Forge sleeps between runs. It wakes at a random time every 4 to 8 hours so the account does not look like a bot.'},
 {d:5,cam:FORGE,say:'1. The Forge. The fire is banked low and the plate counts down to the next run.'},
 {d:5.5,cam:{s:'job-board',d:6.4},say:'4. The Job Board. Blue cards have gone to Traffic Control. Cream cards are ready and waiting to be collected.',board:{3:'p'}},
 {d:5,cam:{s:'job-board',d:6.4},say:'A ready post not collected within 2 hours turns red and blinks, so it stands out.',board:{3:'k'},st:onlyC(null,{'job-board':'waiting'})},
 {d:5.5,cam:HAND,say:'5. The Hand-off. Ready posts leave here by tube for Traffic Control. Approval and posting happen there.'},
 {d:5,cam:'svc',say:'Back wall: the heartbeat of the content writer service. A steady green pulse means it is alive.'}]);

addC('c-make','A post is made','From the Forge to the Hand-off. Traffic Control takes it from there.',[
 write('Step 1. The Forge wakes and writes a post from the product list, using Claude Haiku.'),
 belt('X POST','Step 2. The draft rolls out onto the Conveyor.'),
 inspect('X POST','Step 3. The Inspector scans it: no em-dashes, no fake data, a call to action, the right length, no banned words.'),
 {say:'PASS. A green stamp, and on it goes.',d:2.5,tok:{at:INSPF,label:'X POST'},stamp:'PASS'},
 toB(3,'X POST','Step 4. It takes a slot on the Job Board.'),
 {say:'A cream card: READY. It waits for Traffic Control to call for it.',d:3.5,board:{3:'p'},mode:'SLEEPING',fire:'low'},
 {say:'Step 5. Traffic Control calls for X posts. The Hand-off loads the post into a capsule.',d:5,cam:HAND,tok:{r:toHand(3),label:'X POST'},st:onlyC('handoff')},
 {say:'Up the tube and out of the room, to Traffic Control. The card turns blue: handed off.',d:4,pulse:{nm:'X'},board:{3:'s'}},
 crest('This room is done with it. Traffic Control approves it with you and posts it. That is in the Traffic Control video.')]);

addC('c-qc','Fails the Inspector','A post that breaks a rule never leaves this room.',[
 write('The Forge writes another post. This one has an em-dash in it.',4.5),
 belt('X POST','Onto the Conveyor.'),
 inspect('X POST','The Inspector scans it. The beam turns red.',true),
 {say:'FAIL. Red stamp: em-dash found.',d:3,tok:{at:INSPF,label:'X POST',col:'r'},stamp:'FAIL',st:onlyC(null,{inspector:'error'})},
 {say:'It drops into the reject chute and the lamp flashes. Rejects are logged, never queued.',d:4,tok:{r:HOP,label:'X POST',col:'r',fade:true},hop:1},
 {say:'The Job Board stays as it was. Nothing goes to Traffic Control and nothing reaches your phone.',d:4.5,cam:{s:'job-board',d:6.4}},
 {say:'Two Inspector fails in one week also lower the X trust level in Traffic Control by one step.',d:5,cam:HAND},
 crest('Back to sleeping. The Forge tries again on its next run.')]);

addC('c-down','A service stops','The heartbeat catches a dead service.',[
 {say:'The content writer service writes a heartbeat every 5 minutes. Watch its lamp.',d:5,cam:'svc'},
 {say:'No beat for over 5 minutes: the lamp goes amber.',d:4,hb:{gen:'waiting'}},
 {say:'Over 10 minutes: red. The service is down.',d:4,hb:{gen:'error'},mode:'ERROR'},
 {say:'At the Forge the fire is out and the plate says why.',d:4.5,cam:FORGE,fire:'off',fplate:['NO HEARTBEAT','error','last beat 11 min ago'],st:onlyC(null,{forge:'error'})},
 {say:'Your phone gets the alert.',d:4,cam:'wide',phone:TGF('Content writer service is down. Restart it?',['Restart','Later'])},
 {say:'You tap Restart.',d:3,phone:TGF('Content writer service is down. Restart it?',['Restart','Later'],'Restart')},
 {say:'The heartbeat comes back green and the Forge goes back to sleeping normally.',d:4.5,cam:'svc',phone:null,hb:{gen:'working'},fire:'low',fplate:SLEEP,mode:'SLEEPING',st:onlyC(null)},
 crest('Posts already handed off kept going out from Traffic Control the whole time.')]);

addC('c-learn','Learning from results (not built)','Stage 6 here. Needs 14 days of results, then 50 posts with data. Nothing here exists yet.',[
 {say:'NOT BUILT. Each posted X post is checked for likes, replies, reposts and views.',d:5.5,mode:'NOT BUILT',cam:{s:'gauge-panel',d:5},st:onlyC(null,{'gauge-panel':'working'}),gauge:.6},
 {say:'NOT BUILT. The Gauge Panel shows how posts are doing. The best one is called out on the terminal.',d:5.5,gauge:.8,term:['BEST POST','working','question posts: 2x replies'],cam:{s:'gauge-panel',d:4}},
 {say:'NOT BUILT. The Analyst sends what works back along the feedback wire to the Forge.',d:6,wire:true,cam:'wide'},
 {say:'NOT BUILT. The Forge writes with that in mind. At first these are suggestions you approve. Later it could adjust itself.',d:6,cam:FORGE,fire:'on',fplate:['WRITING','working','using 1 suggestion'],st:onlyC('forge',{'gauge-panel':'working'})},
 {say:'That closes this room’s loop: write, check, queue, hand off, learn.',d:5,cam:'wide',fire:'low'}]);

return {list:room=>ORDER.filter(i=>SCN[i].room===room).map(i=>({id:i,title:SCN[i].title})),ids:()=>ORDER.slice(),play,load,stop,frame,seek(t){playing=false;clock=t;},info:()=>({duration:scn?duration():0,rendered,ended,playing}),hideExit(v){mkUI();ui.w.dataset.hideExit=v?'1':'';}};
})();



(function(){const mapDiagnostics=document.getElementById('station-mobile-diagnostic-1').__mapDiagnostic;mapDiagnostics.begin();try{'use strict';
/* Jarvis Station 3D map, Three.js renderer (step 18, 2026-10-28: Forge world default backdrop; expansion goes underground: a level picker (Street, B1 to B4) swaps every open room to that level in place, unexcavated levels show as solid rock; Spire offices moved to B1 to B3, Crown dropped; step 17, 2026-10-27: open rooms, every building cut to half-height walls with its room in view, tubes from an in-room manifold, X account booths, backdrop presets; step 16, 2026-10-27: windows cut with the walls on all eight octagon faces, octagonal cutaway floor, window glow dimmed station-wide; step 15, 2026-10-27: view-following cutaway, Content Engine prototype; walls facing the camera and the near half of the roof are clipped with dark section caps, the room interior sits inside the shell, machines animate only when a real agent reports working there (or the labelled tube preview); step 14, 2026-10-27: the X building on its own plot, one floor per account, above-ground tube from the Content Engine; step 13, 2026-10-27: Pneumatic Post Office Content Engine with live tubes per channel; step 12, 2026-10-27: Smelter Mint GLB with the characterful door; step 11, 2026-10-26: Boiler House Workshop GLB; step 10, 2026-10-26: lift to a B1 basement in every building; step 9, 2026-10-26: Clockwork Archive Library GLB with turning book icon; modular GLBs, basements hidden until the level editor; step 8, 2026-10-26: Spire 3B Rusted Deco Engine GLB with glass lift and animated steam; step 7, 2026-10-26: Blender-modelled GLB exteriors (Spire first), soft shadows,
   ambient occlusion and bloom. Step 6, 2026-10-26: wide sidewalks, 14 m grid, auto plaza between connected buildings. Step 5, 2026-10-26: storyboard textures via StationSkins, dusk environment for metal. Step 4, 2026-10-26: approved exteriors, six-plot grid with the Mint and two planned plots,
   multilevel Spire with elevator floors, provider sigils. Step 3: operations console, live agent status and blockers).
   Interaction, picking, camera math, placement, touch-hold and room-info logic are carried over unchanged
   from spire-3d-room-inspection-1. Only the drawing layer moved from raw WebGL to Three.js r160. */
window.ArmyBase3D={mount(host,options={}){
const $=id=>host.querySelector('[data-ab="'+id+'"]'),canvas=$('view');
if(!window.THREE||!window.StationWorld){mapDiagnostics.fail(new Error('E_INIT renderer modules missing'));return {status:'MODULES_MISSING',dispose(){}};}
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){mapDiagnostics.unsupported();$('error').textContent='WebGL unavailable.';return {status:'WEBGL_UNAVAILABLE',dispose(){}};}
const gl=renderer.getContext();renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
let storage=options.storage;try{if(storage===undefined)storage=localStorage;}catch(e){storage=null;}
const scene=options.scene||window.BASE_SCENE,controller=new Placement.Controller(scene.buildings,storage),gesture=new Placement.Gesture(controller);
let disposed=false,raf=0;const listeners=[];function on(node,type,fn,opts){node.addEventListener(type,fn,opts);listeners.push([node,type,fn,opts]);}
function emit(type,detail){const event={schema:'army-base-component/2',type,detail,demo:true};host.dispatchEvent(new CustomEvent('armybase:'+type,{detail:event}));if(options.onEvent)options.onEvent(event);}
const panels=window.RoomPanels.create(host,canvas.parentElement,()=>home(),id=>enter(id),(i,id)=>{const r=interiors[id||'spire'];if(r&&r.userData.setFloor)r.userData.setFloor(i);});const stationStatus=options.status||window.STATION_STATUS||{agents:[],blockers:[]};panels.setStatus(stationStatus);let selected='spire',inside=null,yaw=.32,pitch=.55,distance=58,target=[0,3,6],vp,down=null,ghost=null,last=0;
const descriptions={spire:'Sovereign Spire · Lobby at street level; offices on B1 to B3, Undercroft on B4. Elevator in the room panel.',library:'Library · vault and research.',workshop:'Workshop · build, review, push gate.',mint:'The Mint · Revenue Room, 7-stage loop.',content:'Content Engine · posts and site content, 7-stage loop.',traffic:'Traffic Control · SEO and distribution, 7-stage loop.',x:'X · outside platform. One floor per X account, with status and stats.'};

/* ---- Three.js scene ---- */
const three=new THREE.Scene(),cam=new THREE.PerspectiveCamera(45,1,.1,400);
const world=StationWorld.build(THREE);three.add(world);if(world.userData.fog)three.fog=world.userData.fog;
/* Cas integration tuning: r160 uses physical light units, so worker intensities are scaled up here, not in the worker module. */
world.traverse(o=>{if(o.isHemisphereLight)o.intensity=1.8;else if(o.isDirectionalLight)o.intensity=1.3;});{renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;const key=new THREE.DirectionalLight(0xffd8a0,2.2);key.position.set(30,45,40);key.castShadow=true;key.shadow.mapSize.set(2048,2048);const sc=key.shadow.camera;sc.left=-45;sc.right=45;sc.top=45;sc.bottom=-45;sc.near=1;sc.far=160;key.shadow.bias=-.0004;key.shadow.normalBias=.04;three.add(key);}if(world.userData.ground)world.userData.ground.material.color.set(0xa8a39c);
let groundMesh=world.userData.ground||null;if(!groundMesh)world.traverse(o=>{if(!groundMesh&&o.isMesh&&o.geometry&&o.geometry.type==='PlaneGeometry'&&o.geometry.parameters.width>=100)groundMesh=o;});if(groundMesh)groundMesh.receiveShadow=true;
const groups={},dress={},interiors={},dressLights={};
for(const b of controller.buildings){const g=new THREE.Group();g.name='building-'+b.id;three.add(g);groups[b.id]=g;
 const d=StationWorld.dressBuilding(THREE,{...b,footprint_radius:scene.footprint_radius,apothem:scene.apothem});d.rotation.y=Math.PI;/* banners face the -z doorway */g.add(d);dress[b.id]=d;
 if(window.StationInteriors){const fit=StationInteriors.build(THREE,b.id);fit.name='interior-'+b.id;fit.visible=false;g.add(fit);interiors[b.id]=fit;}if(d.userData.light){const L=d.userData.light;L.intensity=45;L.distance=18;L.position.y=.9;g.add(L);dressLights[b.id]=L;}}
/* Live status markers: one light per reported agent over its room, red beacon where a blocker needs Chris. */
const STATE_COLOR={working:0x3fd07f,waiting:0xf0b040,paused:0x8a8478,blocked:0xff3a2a,done:0x3fd07f,idle:0x6a6458};
function dotTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
const dotTex=dotTexture(),beacons={},statusSprites=[];
/* Provider sigils (approved by Chris 2026-10-26): amber Claude, green Codex, white Ollama, violet local tools. */
const SIGIL={claude:0xf0a030,codex:0x3fd07f,ollama:0xf2f0ea,local:0xa070ff};
function ringTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.strokeStyle='rgba(255,255,255,1)';x.lineWidth=7;x.beginPath();x.arc(32,32,24,0,Math.PI*2);x.stroke();return new THREE.CanvasTexture(c);}
const ringTex=ringTexture();
for(const b of controller.buildings){const fit=interiors[b.id];if(!fit)continue;const ag=(stationStatus.agents||[]).filter(a=>a.room===b.id),lead=ag.find(a=>a.state==='working')||ag[0];
 fit.traverse(o=>{if(o.userData.sigil){if(lead&&SIGIL[lead.provider]!==undefined){o.material.color.setHex(SIGIL[lead.provider]);o.material.emissive.setHex(SIGIL[lead.provider]);o.material.emissiveIntensity=lead.state==='paused'||lead.state==='idle'?.25:1.4;}else{o.material.color.setHex(0x3a352e);}}
  if(o.userData.officeLamp){const who=(stationStatus.agents||[]).find(a=>a.room==='spire'&&(a.office||'').toLowerCase()===o.userData.officeLamp.toLowerCase());if(who){const col=STATE_COLOR[who.state]||0x6a6458;o.material.color.setHex(col);o.material.emissive.setHex(col);o.material.emissiveIntensity=who.state==='paused'?.3:1.6;}}});}
for(const b of controller.buildings){const agents=(stationStatus.agents||[]).filter(a=>a.room===b.id),blocks=(stationStatus.blockers||[]).filter(k=>k.room===b.id);
 agents.forEach((a,i)=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:STATE_COLOR[a.state]||0x6a6458,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));sp.scale.set(1.1,1.1,1);sp.position.set((i-(agents.length-1)/2)*1.4,Math.min(b.height,14)+2.4,0);sp.name='agent '+a.id;groups[b.id].add(sp);if(SIGIL[a.provider]!==undefined){const rg=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,color:SIGIL[a.provider],transparent:true,depthWrite:false,depthTest:false}));rg.scale.set(1.5,1.5,1);rg.position.copy(sp.position);rg.name='sigil '+a.provider;groups[b.id].add(rg);}});
 if(blocks.length){const bc=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:0xff2a1a,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));bc.scale.set(2.6,2.6,1);bc.position.set(0,Math.min(b.height,14)+4.2,0);bc.name='blocker beacon';groups[b.id].add(bc);beacons[b.id]=bc;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.6,6),new THREE.MeshStandardMaterial({color:0x8e1c2a,emissive:0x8e1c2a,emissiveIntensity:.8}));pole.position.set(0,Math.min(b.height,14)+3.1,0);groups[b.id].add(pole);}}

for(const b of controller.buildings)for(const o of groups[b.id].children)if(o.isSprite||(o.isMesh&&o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.height===1.6)){const top=Math.min(b.height,14);statusSprites.push({o,hi:o.position.y,lo:o.position.y-top+3.2});}
/* Auto plaza (Chris 2026-10-26): connected buildings (sidewalks touching) form a cluster; the open ground between them is
   paved as one plaza, the convex hull of their sidewalk corners, with a brass border. Rebuilt whenever a building moves. */
const plazaGroup=new THREE.Group();plazaGroup.name='auto plaza';three.add(plazaGroup);let plazaKey='';
function hull(pts){pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
 for(const p of pts){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>1&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}up.pop();lo.pop();return lo.concat(up);}
function rebuildPlaza(){const bs=controller.buildings,key=bs.map(b=>b.id+':'+b.position.map(v=>v.toFixed(2)).join(',')).join('|');if(key===plazaKey)return;plazaKey=key;
 plazaGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();});plazaGroup.clear();
 const par=bs.map((_,i)=>i),find=i=>par[i]===i?i:(par[i]=find(par[i]));
 for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const ri=(bs[i].sidewalk_apothem||scene.apothem),rj=(bs[j].sidewalk_apothem||scene.apothem),d=Math.hypot(bs[i].position[0]-bs[j].position[0],bs[i].position[1]-bs[j].position[1]);if(d<=ri+rj+.15)par[find(i)]=find(j);}
 const groups={};bs.forEach((b,i)=>(groups[find(i)]=groups[find(i)]||[]).push(b));
 const tex=window.StationSkins?StationSkins.load(THREE,renderer):{};let mat=null;
 if(tex.plaza){const t=tex.plaza.clone();t.needsUpdate=true;t.repeat.set(1/3.2,1/3.2);const nm=tex.plaza_n?tex.plaza_n.clone():null;if(nm){nm.needsUpdate=true;nm.repeat.set(1/3.2,1/3.2);}mat=new THREE.MeshStandardMaterial({map:t,normalMap:nm,color:0xb8aea0,roughness:.85});}
 else mat=new THREE.MeshStandardMaterial({color:0x6a6258,roughness:.9});
 const brass=new THREE.MeshStandardMaterial({color:0xc9a227,metalness:.8,roughness:.35});
 for(const g of Object.values(groups)){if(g.length<2)continue;const pts=[];g.forEach(b=>b.footprint.forEach(v=>pts.push([v[0]+b.position[0],v[1]+b.position[1]])));const h=hull(pts);
  const shape=new THREE.Shape(h.map(p=>new THREE.Vector2(p[0],-p[1])));const geo=new THREE.ShapeGeometry(shape);const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.rotation.x=-Math.PI/2;mesh.position.y=-.012;mesh.name='plaza paving';plazaGroup.add(mesh);
  for(let i=0;i<h.length;i++){const a=h[i],b=h[(i+1)%h.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);const c=new THREE.Mesh(new THREE.BoxGeometry(L,.14,.22),brass);c.position.set((a[0]+b[0])/2,.05,(a[1]+b[1])/2);c.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);c.name='plaza brass border';plazaGroup.add(c);}}}
rebuildPlaza();

/* Blender exteriors (step 7): a building with a GLB in window.STATION_GLB renders that model instead of its generated
   exterior meshes. The generated meshes still drive picking, sidewalks, floor and the cutaway, so interaction is unchanged. */
/* Step 8: animated steam above each smokestack of a GLB building (stack tops from glb_join.py, window.STATION_STEAM).
   One Points draw per building; each puff rises, drifts with the wind, swells and fades. */
const steamMats=[],spinners=[];
function steamPoints(stacks){const per=18,n=stacks.length*per,pos=new Float32Array(n*3),seed=new Float32Array(n),rad=new Float32Array(n);
 stacks.forEach((s,i)=>{for(let k=0;k<per;k++){const j=i*per+k;pos.set([s[0],s[1],s[2]],j*3);seed[j]=(k+Math.random()*.6)/per;rad[j]=s[3];}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aRad',new THREE.BufferAttribute(rad,1));
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),gr=x.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.5,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uTex:{value:new THREE.CanvasTexture(c)},uScale:{value:renderer.getPixelRatio()*window.innerHeight*.5}},
  vertexShader:'attribute float aSeed;attribute float aRad;uniform float uTime;uniform float uScale;varying float vA;varying float vL;void main(){float l=fract(uTime*.09+aSeed);vL=l;float h=fract(sin(aSeed*91.7)*437.5);'+
   'vec3 p=position+vec3((h-.5)*aRad+l*l*2.6,l*5.5,(fract(h*7.3)-.5)*aRad-l*1.2);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(aRad*2.2+l*3.8)*uScale/-mv.z;vA=smoothstep(0.,.12,l)*(1.-l)*.55;}',
  fragmentShader:'uniform sampler2D uTex;varying float vA;varying float vL;void main(){vec4 t=texture2D(uTex,gl_PointCoord);gl_FragColor=vec4(mix(vec3(.62,.57,.52),vec3(.34,.32,.32),vL),t.a*vA*.85);}'});
 steamMats.push(m);const p=new THREE.Points(g,m);p.name='steam';p.frustumCulled=false;return p;}
/* Step 13 (Chris 2026-10-27: "GET THE TUBES FUNCTIONAL, EXPANDABLE, AND VISIBLE WHEN IN USE. LIKE A SHINY TUBE IS WORKING,
   AN OLD RUSTED ONE IS NOT."). Pneumatic tubes are laid at runtime, one per channel the status file lists for the room
   (status.channels: {id, room, name, state, detail}). Adding a channel adds a tube on the next free drum port.
   A channel reported 'working' gets a glass tube with polished brass rings and glowing capsules shooting through it.
   Anything else (idle, blocked, unknown, not reported) is an opaque rusted iron tube. Each tube arcs off the sorting drum
   and dives into the street through a brass port, toward the underground. A 'preview' (panel button) shows the
   working look without claiming real activity. */
const tubeSets={},tubeAnims=[];let tubePreview={};
function tubeMats(){if(tubeMats.m)return tubeMats.m;const S=window.StationSkins;
 tubeMats.m={glass:new THREE.MeshStandardMaterial({color:0xffd9a0,metalness:.1,roughness:.05,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}),
  brass:new THREE.MeshStandardMaterial({color:0xe0a848,metalness:1,roughness:.16,envMapIntensity:1.8}),
  rust:S?S.glbMaterial(THREE,renderer,'tube_rust',null,{tex:'rust_iron',tile:1.2,color:[.62,.5,.45],metal:.45,rough:.8,decay:1,verd:.4}):new THREE.MeshStandardMaterial({color:0x6a3a24,roughness:.9}),
  capsule:new THREE.MeshStandardMaterial({color:0xffc060,metalness:.6,roughness:.3,emissive:new THREE.Color(0xffa040),emissiveIntensity:2.6})};return tubeMats.m;}
function tubeCurve(p,i,n){const a=Math.PI/2+(i+.5)*(2*Math.PI/Math.max(n,3))*.999,ca=Math.cos(a),sa=Math.sin(a);   /* fan out, away from the door side first */
 const P=(r,y)=>new THREE.Vector3(ca*r,y,sa*r);
 /* Chris 2026-10-27: "I want the tubes to stay above ground." A channel with no building yet ends in a capped flange on a trestle at the plaza edge. */
 return new THREE.CatmullRomCurve3([new THREE.Vector3(p[0],p[1],p[2]),new THREE.Vector3(p[0],p[1]+1.2,p[2]),P(3.6,p[1]+2.4),P(6.4,6.4),P(8.2,3.6),P(8.8,3.0)]);}
/* Intake on a platform building, in that building's local frame (Blender face 180 = Station -x, 3.2 m up, hopper mouth ~6.4 m out). */
const INTAKES={x:[-6.4,3.2,0]};
function routeCurve(id,p,to){const a=controller.buildings.find(b=>b.id===id),b=controller.buildings.find(b=>b.id===to),it=intakeOf(to);if(!a||!b||!it)return null;
 const t=new THREE.Vector3(b.position[0]-a.position[0]+it[0],it[1],b.position[1]-a.position[1]+it[2]),s=new THREE.Vector3(p[0],p[1],p[2]);
 const away=new THREE.Vector3(it[0],0,it[2]).normalize(),hi=Math.max(s.y,t.y)+2.2;
 const L=(u,y)=>new THREE.Vector3(s.x+(t.x-s.x)*u,y,s.z+(t.z-s.z)*u);
 return new THREE.CatmullRomCurve3([s,new THREE.Vector3(s.x,s.y+1.3,s.z),L(.3,hi),L(.62,hi-.6),t.clone().addScaledVector(away,2.4).setY(t.y+1.0),t.clone().addScaledVector(away,.9),t]);}
function trestles(curve,o,id,to,mat){/* iron trestle posts under the tube wherever it runs over open plaza */
 const a=controller.buildings.find(b=>b.id===id),b=to&&controller.buildings.find(b=>b.id===to),L=curve.getLength(),n=Math.max(2,Math.floor(L/3.2));
 for(let k=1;k<n;k++){const pt=curve.getPointAt(k/n);if(pt.y<1.6)continue;const wx=pt.x,wz=pt.z,d1=Math.hypot(wx,wz);
  const d2=b?Math.hypot(wx-(b.position[0]-a.position[0]),wz-(b.position[1]-a.position[1])):99;if(d1<5.6||d2<5.6)continue;
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,pt.y-.15,8),mat);post.position.set(wx,(pt.y-.15)/2,wz);o.add(post);
  const sad=new THREE.Mesh(new THREE.BoxGeometry(.5,.08,.5),mat);sad.position.set(wx,pt.y-.17,wz);o.add(sad);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,.12,8),mat);foot.position.set(wx,.06,wz);o.add(foot);}}
function buildTubes(id,ports){const g=new THREE.Group();g.name='tubes-'+id;tubeSets[id]={group:g,ports,tubes:[]};layTubes(id);return g;}
function layTubes(id){const set=tubeSets[id];if(!set)return;const M=tubeMats();
 for(const t of set.tubes){set.group.remove(t.obj);t.obj.traverse(o=>{if(o.geometry)o.geometry.dispose();});}set.tubes=[];
 const chans=((stationStatus.channels)||[]).filter(c=>c.room===id).slice(0,set.ports.length),ports=portsOf(id,set.ports);
 chans.forEach((c,i)=>{const curve=(c.to&&routeCurve(id,ports[i],c.to))||tubeCurve(ports[i],i,chans.length),o=new THREE.Group();o.name='tube '+c.name;
  const working=c.state==='working'||!!tubePreview[id];
  const body=new THREE.Mesh(new THREE.TubeGeometry(curve,96,.14,14,false),working?M.glass:M.rust);body.castShadow=!working;o.add(body);
  const L=curve.getLength(),nr=Math.floor(L/1.1);
  for(let k=1;k<nr;k++){const u=k/nr,pt=curve.getPointAt(u),tg=curve.getTangentAt(u),ring=new THREE.Mesh(new THREE.TorusGeometry(.17,.035,6,18),working?M.brass:M.rust);
   ring.position.copy(pt);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tg);o.add(ring);}
  trestles(curve,o,id,c.to,M.rust);
  if(!c.to||!routeCurve(id,ports[i],c.to)){const end=curve.getPointAt(1),tg=curve.getTangentAt(1),cap=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.12,16),working?M.brass:M.rust);
   cap.position.copy(end);cap.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tg);o.add(cap);
   const post=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,end.y,8),M.rust);post.position.set(end.x,end.y/2,end.z);o.add(post);}
  const caps=[];if(working){for(let k=0;k<4;k++){const cp=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.5,10),M.capsule);o.add(cp);caps.push({m:cp,off:k/4});}}
  set.group.add(o);set.tubes.push({obj:o,curve,caps,channel:c});});}
let tubeSig='';
function animateTubes(t){const sig=controller.buildings.map(b=>b.position.join(',')).join(';');if(sig!==tubeSig&&!controller.moving){tubeSig=sig;for(const id in tubeSets)layTubes(id);}for(const id in tubeSets)for(const tb of tubeSets[id].tubes)for(const c of tb.caps){const u=((t/1000)*.16+c.off)%1,pt=tb.curve.getPointAt(u);
 c.m.position.copy(pt);c.m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tb.curve.getTangentAt(u));c.m.visible=true;}}
window.addEventListener('station-tube-preview',e=>{const d=e.detail||{};tubePreview[d.room]=!!d.on;layTubes(d.room);});
/* Step 14 (Chris 2026-10-27: "For the x building each account should live there ... their status and stats"). A platform
   building stacks one floor per account in status.platforms[].accounts: the GLB's mod_floor is cloned and the crown lifted
   3.2 m per extra account. Each floor gets a painted nameplate (account name or handle), two status lamps (working = lit
   amber, waiting = gold, blocked = red, anything else dark) and a stats board. Unreported values read "?" (Unknown). */
const PLATFORM_FLOOR={x:{z0:4.6,ap:4.56}};
function canvasPlate(lines,w,h,opt={}){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=opt.bg||'#1a1410';x.fillRect(0,0,w,h);
 x.strokeStyle=opt.edge||'#c9a227';x.lineWidth=6;x.strokeRect(3,3,w-6,h-6);x.fillStyle=opt.fg||'#f0d48a';x.textAlign='center';x.textBaseline='middle';
 lines.forEach((l,i)=>{x.font=(i===0&&opt.title?'bold ':'')+(opt.size||36)+'px Georgia, serif';x.fillText(l,w/2,h*(i+.5)/lines.length);});
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const LAMP_COLOR={working:0xffa040,waiting:0xf0b040,blocked:0xff3a2a};
function accountFloors(id,root){const pf=(stationStatus.platforms||[]).find(p=>p.id===id),cfg=PLATFORM_FLOOR[id];if(!pf||!cfg)return;
 let floor=null,crown=null;root.traverse(o=>{if(o.name==='mod_floor')floor=o;if(o.name==='mod_crown')crown=o;});if(!floor)return;
 const accts=pf.accounts||[],n=Math.max(1,accts.length);
 for(let k=1;k<n;k++){const f=floor.clone(true);f.position.y+=PITCH_M*k;floor.parent.add(f);}
 if(crown)crown.position.y+=PITCH_M*(n-1);
 const fmt=v=>v==null?'?':typeof v==='number'?v.toLocaleString():String(v);
 for(let k=0;k<n;k++){const a=accts[k],y0=cfg.z0+PITCH_M*k,z=-(cfg.ap+0.1),g=new THREE.Group();g.name='account '+(a?a.name:'none');
  const name=a?(a.handle?'@'+a.handle.replace(/^@/,''):a.name):'No account yet';
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.34),new THREE.MeshBasicMaterial({map:canvasPlate([name],512,116,{size:44,title:true}),toneMapped:false}));
  plate.position.set(0,y0+2.45,z);plate.rotation.y=Math.PI;g.add(plate);
  const col=a&&LAMP_COLOR[a.state],lm=new THREE.MeshStandardMaterial({color:col||0x2a2622,emissive:new THREE.Color(col||0x000000),emissiveIntensity:col?2.2:0,roughness:.4});
  for(const x of [-1.1,1.1]){const l=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.12),lm);l.position.set(x,y0+2.45,z-0.02);g.add(l);}
  const st=(a&&a.stats)||{},lines=a?['Followers '+fmt(st.followers)+'   Following '+fmt(st.following),'Posts '+fmt(st.posts)+'   State '+(a.state||'unknown').toUpperCase()]:['Add an account in the status file','(handle only, never a password)'];
  const board=new THREE.Mesh(new THREE.PlaneGeometry(1.42,.5),new THREE.MeshBasicMaterial({map:canvasPlate(lines,640,224,{size:34,bg:'#0d1f19',edge:'#3a8a6a',fg:'#8ff0c4'}),toneMapped:false}));
  board.position.set(0,y0+.44,-(cfg.ap+0.045));board.rotation.y=Math.PI;g.add(board);root.add(g);}}
const PITCH_M=3.2;
const glbBuildings=new Set(Object.keys(window.STATION_GLB||{})),glbGroups={};
if(THREE.GLTFLoader&&glbBuildings.size){const loader=new THREE.GLTFLoader();const tex=window.StationSkins?StationSkins.load(THREE,renderer):{};
 for(const id of glbBuildings){if(!groups[id])continue;const buf=new Uint8Array(window.STATION_GLB[id]);
  let ao=tex['ao_'+id]||null;if(ao){ao=ao.clone();ao.needsUpdate=true;ao.channel=1;ao.flipY=false;ao.colorSpace=THREE.NoColorSpace;}
  loader.parse(buf.buffer,'',g=>{const root=g.scene;root.name='glb-'+id;root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    const rec=((window.STATION_GLB_MATS||{})[id]||{})[o.material.name];const nm=window.StationSkins&&StationSkins.glbMaterial(THREE,renderer,o.material.name,rec?null:ao,rec);if(nm)o.material=nm;});
    /* Step 9, modular buildings: basement levels exist in the model but stay hidden until the level editor adds them;
       an 'icon' module (the Library book) turns slowly about the building axis. */
    root.traverse(o=>{if(o.name==='mod_basement')o.visible=false;if(o.name==='mod_icon')spinners.push(o);});
    const st=(window.STATION_STEAM||{})[id];if(st&&st.length)root.add(steamPoints(st));groups[id].add(root);glbGroups[id]=root;accountFloors(id,root);const pt=(window.STATION_PORTS||{})[id];if(pt)root.add(buildTubes(id,pt));setupOpen(id,root);},
   e=>console.warn('GLB load failed for '+id,e));}}

/* Step 21 (2026-11-02): Blender machines for loop-room stations. A GLB named prop_<room>_<stage> replaces that station's
   placeholder blocks; lamps, signs, queue cards and mode plates stay live from the status file. Primitives tagged
   userData.skin (track, posts, panels) get the same decay materials as the buildings. */
function skinInteriors(){if(!window.StationSkins)return;const T=StationSkins.load(THREE,renderer),cache={};
 /* plain textured material (box UVs) for primitives; the triplanar decay shader washed flat primitive panels out to white */
 for(const id in interiors)interiors[id].traverse(o=>{const r=o.isMesh&&o.userData.skin;if(!r)return;const k=JSON.stringify(r);
  if(!cache[k]){const c=r.color||[1,1,1],rep=t=>{if(!t||!r.repeat)return t||null;const q=t.clone();q.repeat.set(r.repeat,r.repeat);q.needsUpdate=true;return q;};cache[k]=new THREE.MeshStandardMaterial({map:rep(T[r.tex]),normalMap:rep(T[r.tex+'_n']),color:new THREE.Color(c[0]*.55,c[1]*.55,c[2]*.55),metalness:r.metal??.3,roughness:r.rough??.7});}
  o.material=cache[k];o.castShadow=true;o.receiveShadow=true;});}
function loadProps(){if(!THREE.GLTFLoader)return;const loader=new THREE.GLTFLoader();
 for(const id in interiors)interiors[id].traverse(g=>{const st=g.userData.loopStage;if(!st)return;const key='prop_'+st.room+'_'+g.userData.equipment,src=(window.STATION_GLB||{})[key];if(!src)return;
  const buf=new Uint8Array(src);
  loader.parse(buf.buffer,'',res=>{const root=res.scene;root.name='machine '+key;root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    const rec=((window.STATION_GLB_MATS||{})[key]||{})[o.material.name];const nm=window.StationSkins&&StationSkins.glbMaterial(THREE,renderer,o.material.name,null,rec);if(nm)o.material=nm;
    if(o.material.emissiveIntensity>.9)o.material.emissiveIntensity=.9;o.material.clippingPlanes=[openPlane];o.material.clipShadows=true;});
   g.children.forEach(c=>{if(c.userData.placeholder)c.visible=false;});g.add(root);},e=>console.warn('prop load failed '+key,e));});}
/* Step 23 (2026-11-03): Blender crew. Each figure with userData.crew loads crew_<kind> (parsed once, cloned per figure); robe,
   hair and optic take that figure's own colours, the old primitives hide, the provider sigil stays live. */
function loadCrew(){if(!THREE.GLTFLoader)return;const loader=new THREE.GLTFLoader(),want={};
 for(const id in interiors)interiors[id].traverse(g=>{const c=g.userData.crew;if(c&&(window.STATION_GLB||{})['crew_'+c.kind])(want[c.kind]=want[c.kind]||[]).push(g);});
 for(const kind in want){const key='crew_'+kind,buf=new Uint8Array(window.STATION_GLB[key]);
  loader.parse(buf.buffer,'',res=>{const proto=res.scene;proto.traverse(o=>{if(!o.isMesh)return;const name=o.material.name,rec=((window.STATION_GLB_MATS||{})[key]||{})[name];
    const nm=window.StationSkins&&StationSkins.glbMaterial(THREE,renderer,name,null,rec);if(nm){nm.name=name;o.material=nm;}
    if(/^Human\./.test(name)&&!/body|low-poly/.test(name)){o.material.alphaTest=.5;o.material.transparent=false;o.material.depthWrite=true;o.material.side=THREE.DoubleSide;}   /* hair, brows, lashes: cut-out */
    if(/^Human\.(body|low-poly)/.test(name)){o.material.transparent=false;o.material.depthWrite=true;o.material.alphaTest=0;o.material.side=THREE.FrontSide;}   /* skin and eyes solid (exported as BLEND) */
    if(o.material.emissiveIntensity>.9)o.material.emissiveIntensity=.9;o.material.clippingPlanes=[openPlane];o.material.clipShadows=true;o.castShadow=true;o.receiveShadow=true;});
   want[kind].forEach(g=>{const c=g.userData.crew,fig=proto.clone(true);fig.name='crew '+kind;
    fig.traverse(o=>{if(!o.isMesh)return;const n=o.material.name,tint=/robe/.test(n)?c.robe:/hair/.test(n)?c.hair:/optic_lens/.test(n)?c.eye:undefined;
     if(tint!==undefined){o.material=o.material.clone();o.material.color.setHex(tint);if(/optic/.test(n))o.material.emissive.setHex(tint);if(/robe/.test(n))o.material.side=THREE.DoubleSide;}});
    if(c.mods)fig.children.forEach(ch=>{const k=ch.name.replace(/^mod_/,'');if(k in c.mods)ch.visible=c.mods[k];});   /* step 24: each lead's own hood, hair, eye, arms */
    g.children.forEach(ch=>{if(ch.userData.placeholder)ch.visible=false;});g.add(fig);});},e=>console.warn('crew load failed '+key,e));}}
skinInteriors();loadProps();loadCrew();

/* Step 17, open rooms (Chris 2026-10-27: "keep the octagon and sidewalk and general function but take the walls and cut them
   in half ... so it aligns more with the reference image of just busy open rooms"). Replaces the step 15/16 view-following
   cutaway. Every building is cut by one shared horizontal plane at OPEN_H: roofs, crowns, icons, upper floors and steam go,
   the walls stand at half height with dark section caps, and each building's furnished room sits on its ground floor in plain
   view from any angle. Tubes leave from a manifold inside the room and run above the plazas as before. The "Open rooms"
   button restores the full buildings. */
const OPEN_H=2.4,NOCLIP=1e5,openPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),OPEN_H),open={};let openOn=true,openLabel=()=>{},level=0,levelUI=()=>{};const LEVEL_MAX=4;renderer.localClippingEnabled=true;
const capOpen=new THREE.MeshStandardMaterial({color:0x3a2f27,roughness:.95,side:THREE.BackSide,clippingPlanes:[openPlane],clipShadows:true});
const ROOM_AP=4.45;
function moduleOf(o){while(o){if(o.name&&o.name.startsWith('mod_'))return o.name;o=o.parent;}return '';}
let DECK=null;function deckMat(){if(DECK)return DECK;const T=window.StationSkins?StationSkins.load(THREE,renderer):{},rep=t=>{if(!t)return null;const q=t.clone();q.repeat.set(5,5);q.needsUpdate=true;return q;};
 DECK=new THREE.MeshStandardMaterial({map:rep(T.rust_iron),normalMap:rep(T.rust_iron_n),color:new THREE.Color(.34,.3,.27),metalness:.45,roughness:.6});return DECK;}
function roomExtras(id){const g=new THREE.Group();g.name='open room floor and lamp';
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(ROOM_AP/Math.cos(Math.PI/8),ROOM_AP/Math.cos(Math.PI/8),.08,8),deckMat());   /* step 22: riveted iron deck plates (Chris: texture the floor) */floor.rotation.y=Math.PI/8;floor.position.y=.04;floor.receiveShadow=true;g.add(floor);
 const grate=new THREE.Mesh(new THREE.RingGeometry(1.2,1.32,8),new THREE.MeshStandardMaterial({color:0x6a5a3a,metalness:.7,roughness:.4}));grate.rotation.x=-Math.PI/2;grate.rotation.z=Math.PI/8;grate.position.y=.085;g.add(grate);
 /* step 18: underground level dressing. Rock retaining walls stand in for the street shell; an unexcavated level is solid rock. */
 const rock=new THREE.MeshStandardMaterial({color:0x2c241e,roughness:.95}),ug=new THREE.Group();ug.name='underground walls';const side=2*4.62*Math.tan(Math.PI/8);
 for(let k=0;k<8;k++){const a=k*Math.PI/4,w=new THREE.Mesh(new THREE.BoxGeometry(side+.06,2.4,.34),rock);w.position.set(Math.sin(a)*4.62,1.2,Math.cos(a)*4.62);w.rotation.y=a;w.castShadow=true;w.receiveShadow=true;ug.add(w);}
 const iron=new THREE.MeshStandardMaterial({color:0x3a302a,metalness:.6,roughness:.5});for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,r=4.62/Math.cos(Math.PI/8)-.15,c=new THREE.Mesh(new THREE.BoxGeometry(.32,2.5,.32),iron);c.position.set(Math.sin(a)*r,1.25,Math.cos(a)*r);ug.add(c);}
 g.add(ug);g.userData.ug=ug;
 const sealed=new THREE.Mesh(new THREE.CylinderGeometry(4.8/Math.cos(Math.PI/8),4.8/Math.cos(Math.PI/8),2.4,8),new THREE.MeshStandardMaterial({color:0x241d18,roughness:1}));sealed.rotation.y=Math.PI/8;sealed.position.y=1.2;sealed.name='unexcavated rock';sealed.castShadow=true;sealed.receiveShadow=true;g.add(sealed);g.userData.sealed=sealed;
 groups[id].add(g);return g;}
function skipClip(o){while(o){if(o.name&&(/^tubes-/.test(o.name)||/^account /.test(o.name)))return true;o=o.parent;}return false;}
function setupOpen(id,root){const hide=[],glows=[];root.traverse(o=>{const mod=moduleOf(o);
  if(o.name==='mod_crown'||o.name==='mod_icon'||o.isPoints||/^account /.test(o.name))hide.push(o);
  if(!o.isMesh||mod==='mod_basement'||skipClip(o))return;if(o.material.emissiveIntensity>1)glows.push([o.material,o.material.emissiveIntensity]);o.material.clippingPlanes=[openPlane];o.material.clipShadows=true;o.material.needsUpdate=true;
  if(!o.material.transparent){const cap=new THREE.Mesh(o.geometry,capOpen);cap.castShadow=false;cap.receiveShadow=true;cap.name='section cap';cap.position.copy(o.position);cap.quaternion.copy(o.quaternion);cap.scale.copy(o.scale);o.parent.add(cap);}});
 /* open rooms put every interior in the overview, so tone down glows that only suited a close-up (Spire holo-table bloomed) */
 if(interiors[id])interiors[id].traverse(o=>{if(o.isMesh&&o.material&&o.material.emissiveIntensity>.9&&!o.userData.sigil){o.material=o.material.clone();o.material.emissiveIntensity=.9;}});
 open[id]={hide,glows,extra:roomExtras(id),fit:interiors[id],hooks:id==='content'?activityHooks(interiors[id]):null};if(id==='x')open[id].booths=accountBooths(id);}
function activityHooks(fit){const hooks={fire:null,sheets:[],arm:null,figures:[]};if(fit)fit.traverse(o=>{const e=o.userData.equipment;
  if(o.isMesh&&o.parent){const pe=o.parent.userData.equipment,gp=o.geometry.parameters||{};
   if(pe==='forge'&&gp.width===.6&&gp.height===.35){o.material=o.material.clone();hooks.fire=o;}
   if(pe==='conveyor'&&gp.height===.02){hooks.sheets.push({o,x0:o.position.x});}
   if(pe==='press'&&gp.width===.08&&gp.height===.5)hooks.arm=o;}
  if(e==='figure')hooks.figures.push({o,y0:o.position.y});});return hooks;}
/* X: each account gets a booth in the open room (desk, nameplate, status lamps, stats board), in place of the stacked floors. */
function accountBooths(id){const pf=(stationStatus.platforms||[]).find(p=>p.id===id),g=new THREE.Group();g.name='account booths';const accts=(pf&&pf.accounts)||[],n=Math.max(1,accts.length);
 const wood=new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:.8}),brass=new THREE.MeshStandardMaterial({color:0x9a7a3a,metalness:.7,roughness:.35}),fmt=v=>v==null?'?':typeof v==='number'?v.toLocaleString():String(v);
 for(let k=0;k<n;k++){const a=accts[k],ang=Math.PI+(k-(n-1)/2)*.8,r=2.7,b=new THREE.Group();b.position.set(Math.sin(ang)*r,0,Math.cos(ang)*r);b.rotation.y=ang+Math.PI;b.name='booth '+(a?a.name:'none');
  b.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.5,.8,.6),wood),{castShadow:true}));b.children[0].position.y=.4;
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.6,.05,.7),brass);top.position.y=.82;b.add(top);
  const name=a?(a.handle?'@'+a.handle.replace(/^@/,''):a.name):'No account yet';
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.32),new THREE.MeshBasicMaterial({map:canvasPlate([name],512,116,{size:44,title:true}),toneMapped:false}));plate.position.set(0,1.75,-.25);b.add(plate);
  const st=(a&&a.stats)||{},lines=a?['Followers '+fmt(st.followers)+'   Posts '+fmt(st.posts),'State '+(a.state||'unknown').toUpperCase()]:['Add an account in the status file','(handle only, never a password)'];
  const board=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.46),new THREE.MeshBasicMaterial({map:canvasPlate(lines,640,224,{size:34,bg:'#0d1f19',edge:'#3a8a6a',fg:'#8ff0c4'}),toneMapped:false}));board.position.set(0,1.22,-.25);board.rotation.x=-.15;b.add(board);
  const post=new THREE.Mesh(new THREE.BoxGeometry(.06,1.2,.06),brass);post.position.set(0,1.4,-.3);b.add(post);
  const col=a&&LAMP_COLOR[a.state],lm=new THREE.MeshStandardMaterial({color:col||0x2a2622,emissive:new THREE.Color(col||0x000000),emissiveIntensity:col?2.2:0,roughness:.4});
  for(const x of [-.82,.82]){const l=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.1),lm);l.position.set(x,1.75,-.26);b.add(l);}
  g.add(b);}
 groups[id].add(g);return g;}
/* Tubes in open mode leave from a manifold inside the room (Content Engine: the Press), so they rise out of the open top. */
const OPEN_PORTS={content:{c:[-2.55,2.0,.3],dx:.36}},OPEN_INTAKES={x:[-4.75,2.25,0]};
function portsOf(id,ports){const o=OPEN_PORTS[id];if(!openOn||!o)return ports;return ports.map((p,i)=>[o.c[0]+((i%3)-1)*o.dx,o.c[1],o.c[2]+(i<3?-o.dx/2:o.dx/2)]);}
function intakeOf(to){return (openOn&&OPEN_INTAKES[to])||INTAKES[to];}
function contentActive(id){return (stationStatus.agents||[]).some(a=>a.room===id&&a.state==='working')||!!tubePreview[id];}
function updateOpen(t){const on=openOn&&!inside,ug=on&&level>0;openPlane.constant=on?OPEN_H:NOCLIP;if(typeof lowPlane!=='undefined')lowPlane.constant=on?1.1:NOCLIP;
 /* the ambient-occlusion pass renders its own normal/depth buffer; clip it too, or cut-off towers leave dark ghosts */
 if(gtao&&gtao.normalMaterial&&!(gtao.normalMaterial.clippingPlanes||[]).length){gtao.normalMaterial.clippingPlanes=[openPlane];gtao.normalMaterial.needsUpdate=true;}
 for(const id in open){const c=open[id];c.extra.visible=on;for(const o of c.hide)o.visible=!on;if(c.booths)c.booths.visible=on&&level===0;
  for(const [m,e] of c.glows)m.emissiveIntensity=on?Math.min(e,.5):e;   /* lamps seen from above (Spire lift car) dimmed */
  const idx=c.fit?(c.fit.userData.levelIndex?c.fit.userData.levelIndex(on?level:0):(level===0?0:-1)):-1;
  c.extra.userData.ug.visible=ug&&idx>=0;c.extra.userData.sealed.visible=ug&&idx<0;
  if(dress[id])dress[id].visible=!ug;if(tubeSets[id])tubeSets[id].group.visible=!ug;if(glbGroups[id])glbGroups[id].visible=!inside&&!ug;
  if(c.fit){if(on){c.fit.visible=idx>=0;c.fit.position.y=1.6;if(idx>=0&&c.fit.userData.setFloor)c.fit.userData.setFloor(idx);}else if(inside===id){c.fit.visible=true;c.fit.position.y=0;}else c.fit.visible=false;}
  if(c.fit&&c.fit.userData.loopTick)c.fit.userData.loopTick(t,contentActive(id));   /* step 20: work tokens on the loop track, real activity or labelled preview only */
  const h=c.hooks;if(!h)continue;const act=contentActive(id),s=t/1000;
  if(h.fire)h.fire.material.emissiveIntensity=act?1.7+.7*Math.sin(s*13)*Math.sin(s*3.1):.18;
  h.sheets.forEach((q,i)=>{q.o.position.x=act?-1.05+((s*.45+i*.7)%2.1):q.x0;});
  if(h.arm)h.arm.rotation.z=act?.6+.4*Math.sin(s*4):.6;
  h.figures.forEach((f,i)=>{f.o.position.y=act?f.y0+.03*Math.abs(Math.sin(s*3+i)):f.y0;});}
 for(const sp of statusSprites)sp.o.position.y=on?sp.lo:sp.hi;
 /* the room lamp hung at 0.9 m for the sunken rooms; in open rooms it hangs above the half walls and burns softer */
 for(const id in dressLights){const L=dressLights[id];L.position.y=on?3.8:.9;L.intensity=on?24:45;}}
/* buildings without a GLB (Traffic Control) get the same open-room entry: floor, underground walls, its leveled interior */
for(const b of controller.buildings)if(!glbBuildings.has(b.id))open[b.id]={hide:[],glows:[],extra:roomExtras(b.id),fit:interiors[b.id],hooks:null};
/* interiors are cut at the same height (tall office partitions and basement walls blocked the view); status lamps are kept whole */
const lowPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),NOCLIP);   /* office partitions drop to rail height in open rooms */
for(const id in interiors)interiors[id].traverse(o=>{if(o.isMesh&&o.userData.partition){o.material=o.material.clone();o.material.clippingPlanes=[lowPlane];o.material.needsUpdate=true;return;}if(o.isMesh&&o.material&&!o.userData.officeLamp&&o.name!=='stage lamp'&&!o.material.clippingPlanes){o.material.clippingPlanes=[openPlane];o.material.needsUpdate=true;}});
const warm=new THREE.Color(0xffb347);
const SKIN_SCOPE=window.STATION_SKIN_SCOPE||null,skinOn=SKIN_SCOPE?(n=>SKIN_SCOPE.some(p=>n.includes(p))):null;
if(window.StationSkins){three.environment=StationSkins.environment(THREE,renderer);if(groundMesh&&(!SKIN_SCOPE||skinOn('ground'))){const t=StationSkins.load(THREE,renderer).cobblestone;if(t){const g=t.clone();g.needsUpdate=true;g.repeat.set(46,46);groundMesh.material.map=g;groundMesh.material.color.set(0xffffff);groundMesh.material.needsUpdate=true;}}}
function materialFor(m){if(window.StationSkins){const sk=StationSkins.material(THREE,renderer,m,skinOn);if(sk)return sk;}const color=new THREE.Color().setRGB(m.color[0],m.color[1],m.color[2],THREE.SRGBColorSpace);
 const glass=/window|observation ring|command table/.test(m.name),metal=/antenna|lintel|crown|upper tier/.test(m.name);
 const mat=new THREE.MeshStandardMaterial({color:glass?new THREE.Color(0x2a1a10):color,roughness:glass?.35:.9,metalness:metal?.55:.08,side:THREE.DoubleSide});
 if(glass){mat.emissive=warm.clone();mat.emissiveIntensity=m.role==='interior'?.2:(m.role==='roof'?.22:.3);}   /* step 16: windows dimmed (Chris: too bright, distracting) */
 mat.userData.base={color:mat.color.clone(),emissive:mat.emissive.clone(),emissiveIntensity:mat.emissiveIntensity};return mat;}
const meshes=scene.meshes,threeMeshes=[];
for(const m of meshes){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(m.positions.flat()),3));geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(m.normals.flat()),3));
 const mt=materialFor(m);if(window.StationSkins)geo.setAttribute('uv',new THREE.BufferAttribute(StationSkins.uvFor(m,mt.userData.tile),2));const mesh=new THREE.Mesh(geo,mt);mesh.castShadow=m.role!=='apron'&&m.role!=='floor';mesh.receiveShadow=true;mesh.userData.src=m;groups[m.building].add(mesh);threeMeshes.push(mesh);}
const ghostOk=new THREE.Color().setRGB(.54,.45,.22,THREE.SRGBColorSpace),ghostBad=new THREE.Color().setRGB(.62,.18,.10,THREE.SRGBColorSpace);

/* Post-processing (step 7): ground-truth ambient occlusion, soft bloom on lit windows, then tone mapping and colour output. */
let composer=null,gtao=null,bloom=null,lastW=0,lastH=0;
if(THREE.EffectComposer&&window.STATION_POST!==false){try{composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(three,cam));
 if(THREE.GTAOPass){gtao=new THREE.GTAOPass(three,cam,canvas.clientWidth||1,canvas.clientHeight||1);gtao.blendIntensity=.85;composer.addPass(gtao);}
 bloom=new THREE.UnrealBloomPass(new THREE.Vector2(canvas.clientWidth||1,canvas.clientHeight||1),.55,.45,.82);composer.addPass(bloom);composer.addPass(new THREE.OutputPass());}catch(e){console.warn('post-processing off',e);composer=null;}}
on(canvas,'webglcontextlost',e=>e.preventDefault());

/* ---- unchanged camera/picking math (labels and hit tests depend on it) ---- */
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
function multiply(a,b){const c=Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c;}
function camera(){const eye=[target[0]+distance*Math.sin(yaw)*Math.cos(pitch),target[1]+distance*Math.sin(pitch),target[2]+distance*Math.cos(yaw)*Math.cos(pitch)];const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x),v=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];const f=1/Math.tan(Math.PI/8),a=canvas.clientWidth/Math.max(1,canvas.clientHeight),near=.1,far=400,p=[f/a,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];return {eye,x,y,z,f,a,matrix:multiply(p,v)};}
function project(p){const a=[...p,1],v=Array(4).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)v[i]+=vp[j*4+i]*a[j];return {x:(v[0]/v[3]+1)*canvas.clientWidth/2,y:(1-v[1]/v[3])*canvas.clientHeight/2,w:v[3]};}
function groundPoint(e){const r=canvas.getBoundingClientRect(),c=camera(),nx=(e.clientX-r.left)/r.width*2-1,ny=1-(e.clientY-r.top)/r.height*2;const dir=c.z.map((v,i)=>-v+c.x[i]*nx*c.a/c.f+c.y[i]*ny/c.f);if(Math.abs(dir[1])<1e-6)return null;const t=-c.eye[1]/dir[1];return t>0?[c.eye[0]+dir[0]*t,c.eye[2]+dir[2]*t]:null;}
function pick(e){const r=canvas.getBoundingClientRect(),c=camera(),nx=(e.clientX-r.left)/r.width*2-1,ny=1-(e.clientY-r.top)/r.height*2,dir=norm(c.z.map((v,i)=>-v+c.x[i]*nx*c.a/c.f+c.y[i]*ny/c.f));let hit=null;
 for(const m of meshes){if(inside&&(m.building!==inside||!window.RoomInfo.visible(m,inside)))continue;const b=controller.buildings.find(b=>b.id===m.building);for(let i=0;i<m.positions.length;i+=3){const a=m.positions[i].map((v,j)=>v+(j===0?b.position[0]:j===2?b.position[1]:0)),bb=m.positions[i+1].map((v,j)=>v+(j===0?b.position[0]:j===2?b.position[1]:0)),cc=m.positions[i+2].map((v,j)=>v+(j===0?b.position[0]:j===2?b.position[1]:0)),u=sub(bb,a),v=sub(cc,a),h=cross(dir,v),det=dot(u,h);if(Math.abs(det)<1e-8)continue;const s=sub(c.eye,a),aa=dot(s,h)/det;if(aa<0||aa>1)continue;const q=cross(s,u),ab=dot(dir,q)/det,t=dot(v,q)/det;if(ab>=0&&aa+ab<=1&&t>0&&(!hit||t<hit.t))hit={id:m.building,t};}}
 return hit&&hit.id;
}
for(const b of controller.buildings){const div=document.createElement('div');div.className='label'+(/planned/i.test(b.name)?' planned':'');div.textContent=b.name;if(/planned/i.test(b.name)){div.style.opacity='.6';div.style.fontSize='11px';}div.dataset.ab='label-'+b.id;$('labels').appendChild(div);}
function ui(){const b=controller.buildings.find(b=>b.id===selected);$('selection').textContent=b.name;$('description').textContent=descriptions[selected];$('saving').textContent=controller.storageStatus;$('interior').hidden=!inside;}
function home(){panels.hide();inside=null;touch.cancel('home');gesture.cancel();down=null;ghost=null;target=[0,3,6];distance=58;pitch=.55;$('status').textContent='Base view · tap to enter · hold 500 ms to move.';ui();emit('view',{view:'base'});}
function enter(id){touch.cancel('enter');gesture.cancel();ghost=null;selected=id;inside=id;const b=controller.buildings.find(b=>b.id===id);target=[b.position[0],-1.2,b.position[1]];distance=11.5;pitch=.95;$('status').textContent='Inside '+b.name+' · cutaway · props DEMO · current activity Unknown';ui();const L=openOn?level:0;if(id==='spire'&&panels.setFloor){panels.show(id,b.name);panels.setFloor(4-Math.min(L,4),id,b.name);}else{panels.show(id,b.name);if(L===1&&panels.setLevel)panels.setLevel(0,id,b.name);}emit('selection',{id,view:'cutaway'});}
on($('enter'),'click',()=>enter(selected));on($('base'),'click',home);
/* Exit a room: double-click (or double-tap) anywhere outside the room you are in. */
on(canvas,'dblclick',e=>{if(inside&&pick(e)!==inside)home();});let lastOutsideTap=0;
function tolerance(e){const a=groundPoint(e),b=groundPoint({clientX:e.clientX+40,clientY:e.clientY});return a&&b?Math.max(1.6,Math.min(5,Math.hypot(a[0]-b[0],a[1]-b[1]))):2.4;}

const touchCancel=document.createElement('button');touchCancel.type='button';touchCancel.textContent='Cancel move';touchCancel.className='touch-cancel';touchCancel.hidden=true;touchCancel.setAttribute('aria-label','Cancel pending or active touch move');$('status').parentElement.appendChild(touchCancel);$('status').setAttribute('aria-live','polite');
const touch=new window.TouchHoldIntent.Controller({clock:window.__touchTestClock||{now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},callbacks:{
 onState:mode=>{touchCancel.hidden=mode!=='pending'&&mode!=='moving';},
 onPending:p=>{selected=p.meta.id;ui();$('status').textContent='Hold 500 ms to move · release to enter · drag more than 8 CSS px to orbit';},
 onActivate:p=>{if(inside||!controller.buildings.some(b=>b.id===p.meta.id))return false;selected=p.meta.id;if(inside){inside=null;target=[0,0,0];distance=45;}gesture.start({id:selected,shift:true,x:p.lastX,y:p.lastY,ground:groundPoint({clientX:p.lastX,clientY:p.lastY})});down=gesture.active;ghost=null;ui();$('status').textContent='Move mode · drag to a valid sidewalk join · Cancel restores';emit('move-start',{id:selected,source:'touch-hold'});return true;},
 onPanStart:p=>{gesture.start({id:p.meta.id,shift:false,x:p.x0,y:p.y0,ground:p.meta.ground});down=gesture.active;ghost=null;},
 onPanMove:e=>{const update=gesture.update(e.clientX,e.clientY);if(update&&update.drag){yaw-=update.delta[0]*.007;pitch=Math.max(.18,Math.min(1.48,pitch+update.delta[1]*.006));}},
 onPanEnd:e=>{gesture.end(null,tolerance(e));down=null;ghost=null;ui();},
 onTap:p=>{if(inside&&p.meta.id!==inside){const now=performance.now();if(now-lastOutsideTap<400){lastOutsideTap=0;home();}else lastOutsideTap=now;return;}if(p.meta.id&&p.meta.id!==inside)enter(p.meta.id);},
 onMove:e=>{const update=gesture.update(e.clientX,e.clientY);if(!update||!update.drag)return;const p=groundPoint(e);if(p&&down&&down.ground){ghost=controller.preview([down.original[0]+p[0]-down.ground[0],down.original[1]+p[1]-down.ground[1]],tolerance(e));$('status').textContent=ghost.valid?'Valid sidewalk join · release to save · Cancel restores':'No valid sidewalk join · release restores';}},
 onCommit:e=>{const result=gesture.end(ghost&&ghost.position,tolerance(e));down=null;ghost=null;if(result.action==='drop'){$('status').textContent=result.ok?'Sidewalk connection saved · walls remain inset':result.reason;emit('layout',{ok:result.ok,positions:controller.snapshot(),storage:controller.storageStatus});}else $('status').textContent='Hold released without a move · placement unchanged';ui();},
 onCancel:(reason,prior)=>{gesture.cancel();down=null;ghost=null;ui();$('status').textContent='Touch '+(prior==='pending'?'hold':'move')+' cancelled · placement restored';emit('move-cancel',{source:'touch',reason,positions:controller.snapshot()});}
}});
on(touchCancel,'click',()=>touch.cancel('button'));on(window,'blur',()=>touch.cancel('blur'));on(document,'visibilitychange',()=>{if(document.hidden)touch.cancel('hidden');});
on(canvas,'pointerdown',e=>{if(e.button!==0)return;if(e.pointerType==='touch'){if(touch.mode==='idle'&&gesture.active){gesture.cancel();down=null;ghost=null;}touch.down(e,{id:pick(e),ground:groundPoint(e)});canvas.setPointerCapture(e.pointerId);return;}const id=pick(e);if(e.shiftKey&&id){selected=id;if(inside){inside=null;target=[0,0,0];distance=45;}ui();}const action=gesture.start({id,shift:e.shiftKey,x:e.clientX,y:e.clientY,ground:groundPoint(e)});down=gesture.active;ghost=null;canvas.setPointerCapture(e.pointerId);if(action==='move'){$('status').textContent='Sidewalk move · nearest valid corner pair highlights · Esc restores';emit('move-start',{id});}});
on(canvas,'pointermove',e=>{if(touch.move(e))return;const update=gesture.update(e.clientX,e.clientY);if(!update||!update.drag)return;if(update.action==='move'){const p=groundPoint(e);if(p&&down.ground){const candidate=[down.original[0]+p[0]-down.ground[0],down.original[1]+p[1]-down.ground[1]];ghost=controller.preview(candidate,tolerance(e));$('status').textContent=ghost.valid?'Sidewalk corners aligned · continuous pavement · 1.7 m structural gap · release to save':'No valid sidewalk join nearby · release restores · Esc cancels';}}else{yaw-=update.delta[0]*.007;pitch=Math.max(.18,Math.min(1.48,pitch+update.delta[1]*.006));}});
on(canvas,'pointerup',e=>{if(touch.up(e))return;const result=gesture.end(ghost&&ghost.position,tolerance(e));down=null;ghost=null;if(result.action==='drop'){$('status').textContent=result.ok?'Sidewalk connection saved · walls remain inset':result.reason;emit('layout',{ok:result.ok,positions:controller.snapshot(),storage:controller.storageStatus});}else if(result.action==='enter'&&result.id)enter(result.id);else if(result.action==='select'&&result.id){selected=result.id;$('status').textContent='Selected '+selected+' · hold Shift and drag to move';}ui();});
function cancel(){const moving=controller.mode==='move';gesture.cancel();down=null;ghost=null;if(moving){$('status').textContent='Move cancelled · committed sidewalk position restored';emit('move-cancel',{positions:controller.snapshot()});}ui();}
on(canvas,'pointercancel',e=>{if(e.pointerType==='touch')touch.cancel('pointercancel');else cancel();});on(canvas,'lostpointercapture',e=>{if(e.pointerType==='touch'){if(touch.mode!=='idle')touch.cancel('lostcapture');}else if(gesture.active)cancel();});on(window,'keydown',e=>{if(e.key==='Escape'){touch.cancel('escape');cancel();}});on(canvas,'wheel',e=>{if(touch.mode==='pending'||touch.mode==='moving'||controller.mode==='move')return;e.preventDefault();distance=Math.max(9,Math.min(100,distance*Math.exp(e.deltaY*.001)));},{passive:false});

/* ---- frame: Three.js draw ---- */
function frameCore(t){if(disposed)return;raf=requestAnimationFrame(frame);if(t-last<25)return;last=t;for(const m of steamMats)m.uniforms.uTime.value=t/1000;for(const o of spinners)o.rotation.y=t/1000*.25;animateTubes(t);
 const ratio=Math.min(devicePixelRatio||1,window.STATION_MAX_RATIO||2);renderer.setPixelRatio(ratio);renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
 mapDiagnostics.frameStart();const c=camera();vp=c.matrix;cam.aspect=c.a;cam.updateProjectionMatrix();cam.position.set(c.eye[0],c.eye[1],c.eye[2]);cam.up.set(0,1,0);cam.lookAt(target[0],target[1],target[2]);
 if(groundMesh)groundMesh.visible=!inside;if(!controller.moving)rebuildPlaza();plazaGroup.visible=!inside;
 for(const b of controller.buildings){const isGhost=!!(ghost&&controller.moving&&controller.moving.id===b.id),p=isGhost?ghost.position:b.position,g=groups[b.id];g.position.set(p[0],0,p[1]);g.visible=!inside||inside===b.id;
  if(beacons[b.id]){const k=.8+.2*Math.sin(t/260);beacons[b.id].scale.set(2.6*k,2.6*k,1);}/* pulse only because a real blocker is reported */
  const banners=dress[b.id].userData.banners||[];banners.forEach((bn,i)=>{bn.rotation.z=.03*Math.sin(t/700+i);});}
 for(const id in interiors)if(!open[id])interiors[id].visible=inside===id;for(const id in glbGroups)if(!open[id])glbGroups[id].visible=!inside;updateOpen(t);if(window.StationDemo)StationDemo.frame(t);
 const openNow=openOn&&!inside,below=openNow&&level>0;for(const mesh of threeMeshes){const m=mesh.userData.src,lift=openNow&&!glbBuildings.has(m.building)&&(m.role==='structure'||m.role==='floor');mesh.position.y=lift?1.6:0;const show=window.RoomInfo.visible(m,inside)&&!(m.role==='interior'&&interiors[m.building])&&!(glbBuildings.has(m.building)&&(m.role==='roof'||m.role==='structure'))&&!(openNow&&m.role==='roof')&&!(below&&m.role!=='apron');mesh.visible=show;if(!show)continue;mapDiagnostics.meshSubmitted();
  const isGhost=!!(ghost&&controller.moving&&controller.moving.id===m.building),base=mesh.material.userData.base;
  if(isGhost){mesh.material.color.copy(ghost.valid?ghostOk:ghostBad);mesh.material.emissiveIntensity=0;}else{mesh.material.color.copy(base.color);mesh.material.emissiveIntensity=base.emissiveIntensity;}}
 if(composer){const w=canvas.clientWidth,h=canvas.clientHeight;if(w!==lastW||h!==lastH){composer.setPixelRatio(ratio);composer.setSize(w,h);lastW=w;lastH=h;}composer.render();}else renderer.render(three,cam);mapDiagnostics.frameComplete(gl,canvas);
 for(const b of controller.buildings){const p=project([b.position[0],(openOn&&!inside?2.4:Math.min(b.height,14))+.6,b.position[1]]),label=$('label-'+b.id);label.hidden=!!inside||p.w<=0;label.style.left=p.x+'px';label.style.top=p.y+'px';}}
function frame(t){try{frameCore(t);}catch(error){disposed=true;cancelAnimationFrame(raf);mapDiagnostics.fail(error);}}{const cb=document.createElement('button');cb.type='button';cb.className='open-rooms-toggle';cb.style.cssText='position:absolute;top:10px;right:10px;z-index:5;padding:8px 12px;background:#1a1410;color:#c9a227;border:2px solid #c9a227;font:600 14px Georgia,serif;cursor:pointer';const lab=openLabel=()=>{cb.textContent='Open rooms: '+(openOn?'ON':'OFF');cb.setAttribute('aria-pressed',String(openOn));};lab();on(cb,'click',()=>{openOn=!openOn;lab();levelUI();for(const id in tubeSets)layTubes(id);});const par=canvas.parentElement;if(getComputedStyle(par).position==='static')par.style.position='relative';par.appendChild(cb);
 if(window.StationBackdrops){const sel=document.createElement('select');sel.setAttribute('aria-label','Backdrop');sel.style.cssText='position:absolute;top:52px;right:10px;z-index:5;padding:6px 8px;background:#1a1410;color:#c9a227;border:2px solid #c9a227;font:600 13px Georgia,serif';
  StationBackdrops.PRESETS.forEach((n,i)=>{const o=document.createElement('option');o.value=n;o.textContent=(i+1)+'  '+StationBackdrops.NAMES[n];sel.appendChild(o);});on(sel,'change',()=>StationBackdrops.apply(THREE,three,world,renderer,sel.value));par.appendChild(sel);
  sel.value='forge';StationBackdrops.apply(THREE,three,world,renderer,'forge');}   /* Chris picked 5 Forge world, 2026-10-28 */
 {const lv=document.createElement('select');lv.setAttribute('aria-label','Level');lv.style.cssText='position:absolute;top:92px;right:10px;z-index:5;padding:6px 8px;background:#1a1410;color:#c9a227;border:2px solid #c9a227;font:600 13px Georgia,serif';
  const NAMES=['Street level','B1 · Spire: Cas Sanctum, Command · basements','B2 · Spire: Overseer, Optimizer','B3 · Spire: Architect, Librarian','B4 · Spire: Undercroft'];
  NAMES.forEach((n,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=n;lv.appendChild(o);});
  levelUI=()=>{lv.value=String(level);lv.disabled=!openOn;lv.title=openOn?'':'Turn on Open rooms to look at other levels';};levelUI();
  on(lv,'change',()=>{level=+lv.value;});par.appendChild(lv);}}ui();panels.showOps();raf=requestAnimationFrame(frame);
return {status:'MOUNTED_UNVERIFIED_RENDER',renderer:'three-r160',enter,home,interiors,getView:()=>({yaw,pitch,distance,target:target.slice(),inside,touch:touch.mode}),touchStop:why=>touch.cancel(why),buildingPos:id=>{const b=controller.buildings.find(b=>b.id===id);return b&&b.position;},view(y,p,d,t){yaw=y;pitch=p;distance=d;if(t)target=t;},openRooms(v){openOn=!!v;openLabel();levelUI();for(const id in tubeSets)layTubes(id);},level(n){level=Math.max(0,Math.min(LEVEL_MAX,n|0));levelUI();},backdrop(n){if(window.StationBackdrops)StationBackdrops.apply(THREE,three,world,renderer,n);},exportLayout:()=>({version:2,boundary:'OUTER_SIDEWALK',positions:controller.snapshot()}),cancelMove:cancel,
dispose(){disposed=true;cancelAnimationFrame(raf);panels.dispose();touch.dispose();touchCancel.remove();gesture.cancel();for(const [node,type,fn,opts] of listeners)node.removeEventListener(type,fn,opts);three.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(mt=>{if(mt.map)mt.map.dispose();mt.dispose();});}});renderer.dispose();$('labels').replaceChildren();}};
}};
const armyBaseHost=document.getElementById('station-mobile-diagnostic-1').querySelector('[data-army-base]');if(armyBaseHost)window.armyBaseInstance=window.ArmyBase3D.mount(armyBaseHost);
}catch(error){mapDiagnostics.fail(error);}})();

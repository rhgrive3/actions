#!/usr/bin/env node
// Focused attack-scale and depth-tested carrier-glow regression. Only initial positions and shield-hit
// input are seeded; pickup, charge/release, flight, impact and cleanup are native.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {observeRankedBoot} from './lib/ranked-boot-diagnostics.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const phase=arg('--phase')||'candidate';
const barrierOnly=process.argv.includes('--barrier-only');
const carrierOnly=process.argv.includes('--carrier-only');
const holdOnly=process.argv.includes('--hold-only');
assert(['baseline','candidate'].includes(phase),'--phase baseline|candidate');
const site=path.resolve(arg('--site')||'_site');
const out=path.resolve(arg('--evidence-dir')||`.browser-evidence/rainmaker/${phase}`);
const profile=path.resolve(arg('--profile-dir')||`.browser-evidence/rainmaker/profile-${phase}`);
for(const dir of [out,profile])assert(!/^\/(?:tmp|var\/tmp|dev\/shm)(?:\/|$)/.test(dir),'Evidence and profile require persistent storage');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(profile,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?shadercheck=1`,errors=[],captures=[],boot={};
let context,page;
async function capture(name,view='barrier'){
 const state=await page.evaluate(({view,carrierOnly})=>{
  const G=RG,m=G.match,w=m.rankedWorld,a=m.local,s=m.ranked.rule.state;
  const liveShot=__rainmakerEvidence.shotRoots.at(-1);
  const at=view==='barrier'?w.rainmaker.position:view==='shot'&&liveShot?liveShot.position:a.pos;
  G.camera.fov=48;G.camera.updateProjectionMatrix();
  if(view==='barrier')G.camera.position.set(at.x+7.2,at.y+5.3,at.z+8.6);
  else if(view==='shot')G.camera.position.set(at.x+11,at.y+8,at.z+8);
  else G.camera.position.set(at.x+3.4,at.y+2.1,at.z+4.1);
  G.camera.lookAt(at.x,at.y+(view==='barrier'?1:1.1),at.z+(view==='shot'?1.7:0));
  if(view.startsWith('carrier-')){
   // Keep the camera in the known clear firing lane while the body turns.
   const forward=a.pos.clone().set(Math.sin(a.aimYaw),0,Math.cos(a.aimYaw)),right=a.pos.clone().set(forward.z,0,-forward.x);
   const side=view==='carrier-side',back=view==='carrier-back';
   G.camera.position.copy(at).addScaledVector(right,side?3.5:.7).addScaledVector(forward,side?.45:back?-4.2:4.2);G.camera.position.y=at.y+1.65;
   G.camera.lookAt(at.clone().addScaledVector(forward,.3).add({x:0,y:1.05,z:0}));
  }
  if(view==='carrier-play'){const rig=G.game.rig;rig.follow(a,true);rig.yaw=a.aimYaw;rig.pitch=a.aimPitch;rig.update(0);}
  G.camera.updateMatrixWorld(true);G.game._updateHud(0);
  G.scene.updateMatrixWorld(true);G.paint.flush(1/60);
  // Settle camera-dependent native callbacks / post targets before paired
  // readback. These draws do not advance Actor, FX, paint or any game clock.
  G.game.R.render();G.game.R.render();G.game.R.render();G.renderer.getContext().finish();
  // A .visible flag cannot prove a material linked or put any ink on screen.
  // Compare the real framebuffer with only the named effect hidden, then
  // restore and draw it for evidence. Native simulation stays frozen.
  const gl=G.renderer.getContext(),canvas=G.renderer.domElement;
  const pixels=new Uint8Array(canvas.width*canvas.height*4),hiddenPixels=new Uint8Array(pixels.length);
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const effectNames=view==='barrier'?['rainmaker-barrier']:view.startsWith('carrier')?[carrierOnly?'rainmaker-carrier-marker':'rainmaker-carrier-aura']:['rainmaker-shot','rainmaker-ink-splashes'];
  const effects=[];G.scene.traverse(o=>{if(effectNames.includes(o.name))effects.push([o,o.visible]);});
  for(const [o]of effects)o.visible=false;
  G.game.R.render();gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,hiddenPixels);
  for(const [o,visible]of effects)o.visible=visible;
  G.game.R.render();gl.finish();
  let changedPixels=0,maxDelta=0;for(let i=0;i<pixels.length;i+=4){const delta=Math.abs(pixels[i]-hiddenPixels[i])+Math.abs(pixels[i+1]-hiddenPixels[i+1])+Math.abs(pixels[i+2]-hiddenPixels[i+2]);if(delta>20)changedPixels++;maxDelta=Math.max(maxDelta,delta);}
  let shellPixels=null;const shell=G.scene.getObjectByName('rainmaker-body-charge-shell');
  if(view.startsWith('carrier')&&shell?.visible){shell.visible=false;G.game.R.render();gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,hiddenPixels);shell.visible=true;G.game.R.render();shellPixels=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-hiddenPixels[i])+Math.abs(pixels[i+1]-hiddenPixels[i+1])+Math.abs(pixels[i+2]-hiddenPixels[i+2])>20)shellPixels++;}
  const programs=G.renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??null,linked:!!gl.getProgramParameter(p.program,gl.LINK_STATUS)}));
  const nodes=[];G.scene.traverse(o=>{if(/rainmaker/i.test(o.name)){let visible=o.visible;for(let p=o.parent;p;p=p.parent)visible&&=p.visible;const userData={};for(const key of ['phase','charge','pressure','carrier','symbol','seconds'])if(o.userData[key]!==undefined)userData[key]=o.userData[key];nodes.push({name:o.name,type:o.type,visible,position:o.getWorldPosition(a.pos.clone()).toArray(),scale:o.scale.toArray(),opacity:o.material?.opacity??null,wireframe:o.material?.wireframe??null,userData});}});
  let hold=null;const ch=a.character,core=w.rainmakerCore;
  if(ch?._rainmakerPose){
   const point=a.pos.clone(),grip=ch.weapon.pivot.getWorldPosition(point.clone()),muzzle=core.localToWorld(point.fromArray(core.userData.rainmakerModel.muzzle)).clone();
   const support=ch.weapon.pivot.position.clone();support.x=-support.x;ch.bones.handL.localToWorld(support);
   const target=core.localToWorld(point.set(0,0,.07));
   hold={grip:grip.toArray(),gripInKid:ch.kid.worldToLocal(grip.clone()).toArray(),muzzle:muzzle.toArray(),head:ch.bones.head.getWorldPosition(point.clone()).toArray(),shoulder:ch.bones.uArmR.getWorldPosition(point.clone()).toArray(),leftGripError:support.distanceTo(target),rightGripError:grip.distanceTo(core.getWorldPosition(point.clone())),pitch:ch._rainmakerPitch,ready:ch._rainmakerReady};
  }
  return {nativeTime:G.time,matchTime:m.time,barrier:{...s.barrier},carrier:s.carrier,holderRemaining:s.holderRemaining,charge:structuredClone(s.charge),actor:{pos:a.pos.toArray(),form:a.form,alive:a.alive,yaw:a.yaw,aimYaw:a.aimYaw,aim:a.aimDir.toArray()},hold,renderSettings:{quality:G.game.settings.quality,bloom:G.game.settings.bloom,shadows:G.game.settings.shadows,teamInk:G.teamColors.map(c=>c.getHexString())},nodes,effectPixels:{changedPixels,maxDelta,shellPixels},programs,draw:{...G.renderer.info.render},contextLost:G.renderer.getContext().isContextLost()};
 },{view,carrierOnly});
 assert(!state.contextLost,`${name}: WebGL context lost`);assert(state.draw.triangles>100,`${name}: no meaningful scene rendered`);
 const cdp=await context.newCDPSession(page);
 try{const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});const bytes=Buffer.from(data,'base64');assert(bytes.length>12000,`${name}: empty screenshot`);fs.writeFileSync(path.join(out,`${name}.png`),bytes);}finally{await cdp.detach();}
 fs.writeFileSync(path.join(out,`${name}.json`),JSON.stringify(state,null,2));captures.push({name,...state});console.log(`Captured ${name}`);
 return {name,...state};
}
async function step(n,fire=false,move=null){return page.evaluate(({n,fire,move})=>{
 const G=RG,m=G.match,a=m.local,dt=1/60;
 for(let i=0;i<n;i++){
  G.time+=dt;if(move)a.intent.move.fromArray(move);else a.intent.move.set(0,0,0);a.intent.fire=fire;a.intent.sub=a.intent.squid=a.intent.jump=a.intent.special=false;
  a.update(dt);m.advanceRanked(dt);G.fx.update(dt,G.camera);G.paint.flush(dt);
  const shot=__rainmakerEvidence.shotRoots.at(-1);if(shot?.parent)__rainmakerEvidence.trajectory.push({time:G.time,pos:shot.position.toArray(),phase:shot.userData.phase});
 }
 const root=__rainmakerEvidence.shotRoots.at(-1);
 return {shots:__rainmakerEvidence.events.filter(e=>e.kind==='rainmaker-shot').length,charge:m.ranked.rule.state.charge.value,shot:root?{attached:!!root.parent,visible:root.visible,phase:root.userData.phase??null}:null};
},{n,fire,move});}
try{
 const launch={headless:true,viewport:{width:1280,height:800},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;else launch.channel='chromium';
 context=await chromium.launchPersistentContext(profile,launch);page=context.pages()[0]||await context.newPage();
 page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push({kind:'pageerror',message:e.message}));
 page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS false|shader.*(?:fail|error|not compiled)|INVALID_(?:OPERATION|VALUE|ENUM)|program not valid|context lost/i.test(m.text())&&['error','warning'].includes(m.type())){errors.push({kind:'webgl',message:m.text()});console.error(m.text().slice(0,20000));}});
 await context.addInitScript(()=>{let seed=0x12345678;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true}));});
 await observeRankedBoot(page,url,boot,async()=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{globalThis.RG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});},{artifacts:build.artifacts});
 console.log('Boot ready');
 await page.evaluate(async()=>{RG.game.debug.freeze();RG.game._skipRender=true;RG.game.menus.wipe.cancel();await RG.game.startMatch({mapId:'tidewater',difficulty:'easy',mode:'rainmaker'});for(let i=0,n=(RG.match.turfIntroFrames??253)+197;i<n;i++)RG.game._frame(1/60);RG.game.debug.freezeBots();await RG.audio.requireRecordedMainShot(RG.game.profile.weapon||'shooter');});
 await page.waitForFunction(()=>RG.match?.state==='playing'&&RG.match.ranked&&RG.game.hud?._visible&&!document.querySelector('.iw-lineup')&&!document.querySelector('.iw-bn--go'),null,{polling:250,timeout:30000});
 await page.evaluate(()=>{
  const G=RG,m=G.match,a=m.local,w=m.rankedWorld;
  globalThis.__rainmakerEvidence={events:[],shotRoots:[],shotBirths:[],trajectory:[],originalPlay:m.playRankedEvents};
  m.playRankedEvents=function(events,...rest){const before=events.some(e=>e.kind==='rainmaker-shot')?new Set(G.scene.children):null;__rainmakerEvidence.events.push(...structuredClone(events));const result=__rainmakerEvidence.originalPlay.call(this,events,...rest);if(before){const roots=G.scene.children.filter(o=>!before.has(o)&&o.name==='rainmaker-shot');__rainmakerEvidence.shotRoots.push(...roots);__rainmakerEvidence.shotBirths.push(...roots.map(o=>o.position.toArray()));}return result;};
  a.vel.set(0,0,0);a.intent.move.set(0,0,0);a.intent.fire=false;
  // Keep the initial shield untouched and freeze all actors at their settled
  // native positions while the objective is composed for comparison.
  w.update(m.ranked,0);
 });
 const neutral=await capture('01-barrier-neutral');
 assert(neutral.barrier.active,'Initial shield must be active');
 await page.evaluate(()=>{const m=RG.match,a=m.local;m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:650,kind:'main'});m.advanceRanked(1/60);});
 const pressured=await capture('02-barrier-pressured');
 assert(pressured.barrier.active&&pressured.barrier.health<neutral.barrier.health,'Native shield input must grow the pressured barrier');
 if(barrierOnly){
  await page.evaluate(()=>{const m=RG.match,a=m.local;m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:300,kind:'main'});m.advanceRanked(1/60);});
  const nearBurst=await capture('03-barrier-near-burst');
  assert(nearBurst.barrier.active&&nearBurst.barrier.health===50,'Near-pop shield must remain active');
  await page.evaluate(()=>{const m=RG.match,a=m.actors.find(a=>a.alive&&a.team!==m.local.team);if(!a)throw Error('No opponent for shield counter-pressure');m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:1250,kind:'main'});m.advanceRanked(1/60);});
  const counter=await capture('04-barrier-counter-color');
  assert(counter.barrier.active&&counter.barrier.team!==pressured.barrier.team,'Counter-pressure must reverse the shield color');
  for(const frame of captures){
   assert(frame.nodes.some(n=>n.visible&&n.name==='rainmaker-barrier'&&n.wireframe===false),'Shield must have a visible filled surface');
   assert(frame.programs.every(p=>p.linked&&p.runnable!==false),'Every drawn GPU program must link and run');
   assert(frame.effectPixels.changedPixels>50,'Shield must contribute actual visible pixels');
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',phase,scope:'Four native shield states: neutral, pressure, near pop, reversed team. Chromium SwiftShader, low quality, bloom disabled. GPU links and framebuffer coverage; not retail equivalence.',build:{revision:build.build.revision,inputHash:build.inputHash,contentHash:build.contentHash},renderSettings:captures[0].renderSettings,captures:captures.map(c=>({name:c.name,barrier:c.barrier,effectPixels:c.effectPixels,gpuPrograms:c.programs.length})),errors},null,2));
  console.log(`Rainmaker barrier: passed; ${out}`);
 }else{
 await page.evaluate(async()=>{
  const {PLAYER}=await import(new URL('src/config.js',document.baseURI));const m=RG.match,a=m.local,w=m.rankedWorld,s=m.ranked.rule.state;
  a.pos.fromArray(s.pos);a.vel.set(0,0,0);a.grounded=true;
  m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:2000,kind:'main'});m.advanceRanked(1/60);
  a.pos.fromArray(s.pos);m.advanceRanked(1/60);
  if(s.carrier!==String(a.nid??`${a.team}:${a.slot}`))throw Error('Native Rainmaker pickup failed');
  const ground=RG.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,.3,.3,PLAYER.footRadius,a.ground,false);
  if(!ground.hit)throw Error('Carrier has no real ground support');a.pos.y=ground.y;a.groundN.copy(ground.normal);
  // Pick an existing unobstructed flat firing corridor, using native terrain.
  const start=a.pos.clone().add({x:0,y:1,z:0});let lane=null;
  for(const [dx,dz]of [[0,1],[1,0],[0,-1],[-1,0]]){let good=true;for(const d of [1,2,3,4.3]){const y=w.floorAt(a.pos.x+dx*d,a.pos.z+dz*d);const p=start.clone().add({x:dx*d,y:0,z:dz*d});if(!Number.isFinite(y)||Math.abs(y-a.pos.y)>.25||!RG.physics.los(start,p)){good=false;break;}}if(good){lane=[dx,dz];break;}}
  if(!lane)throw Error('No clear real floor corridor for Rainmaker flight');
  a.yaw=a.aimYaw=Math.atan2(lane[0],lane[1]);a.aimPitch=.10;a.aimDir.set(lane[0]*Math.cos(.10),Math.sin(.10),lane[1]*Math.cos(.10));
  __rainmakerEvidence.lane=lane;a.update(1/60);w.update(m.ranked,0);
 });
 // The native friendly shield-pop burst is intentionally large. Let its
 // presentation retire before inspecting the carrier's own idle/charge aura.
 await step(45,false);
 const idle=await capture('03-carrier-idle','carrier');await capture('03-idle-play-camera','carrier-play');
 if(holdOnly){
  const frames=[];
  for(const view of ['carrier-side','carrier-front','carrier-back'])frames.push(await capture(`hold-idle-${view.slice(8)}`,view));
  await step(63,true);
  for(const view of ['carrier-side','carrier-front','carrier-back'])frames.push(await capture(`hold-charge-${view.slice(8)}`,view));
  await step(2,false);frames.push(await capture('hold-release-side','carrier-side'));
  await step(30,false);frames.push(await capture('hold-recovered-side','carrier-side'));
  const move=await page.evaluate(()=>[__rainmakerEvidence.lane[0],0,__rainmakerEvidence.lane[1]]);
  await step(30,false,move);frames.push(await capture('hold-moving-side','carrier-side'));
  await step(30,false,[-move[2],0,move[0]]);const turning=await capture('hold-turning-side','carrier-side');frames.push(turning);
  assert(Math.abs(Math.sin(turning.actor.yaw-turning.actor.aimYaw))>.2,'Native walking must exercise different body and aim headings');
  for(const frame of frames){
   assert(frame.hold&&frame.hold.leftGripError<.001&&frame.hold.rightGripError<1e-6,'Both hands must retain the live objective grip');
   assert(frame.programs.every(p=>p.linked&&p.runnable!==false),'Hold shaders must link and run');
  }
  const shots=await page.evaluate(()=>__rainmakerEvidence.events.filter(e=>e.kind==='rainmaker-shot'));
  assert.equal(shots.length,1,'Native release must emit one shot');assert.equal(shots[0].charge,1);
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:'Native pickup, carry, full charge, release, recovery, walking and a turn with separate body/aim headings; three camera views with both live grips. Chromium SwiftShader, not retail measurement.',build:{revision:build.build.revision,inputHash:build.inputHash,contentHash:build.contentHash},renderSettings:idle.renderSettings,captures:frames.map(c=>({name:c.name,actor:c.actor,charge:c.charge,hold:c.hold,effectPixels:c.effectPixels})),shots,errors},null,2));
  console.log(`Rainmaker carry position: passed; ${out}`);
 }else if(carrierOnly){
  const marker=frame=>frame.nodes.find(n=>n.name==='rainmaker-carrier-marker');
  assert(!marker(neutral).visible&&!marker(pressured).visible,'Unclaimed objective must have no carrier marker');
  assert.equal(marker(idle).userData.symbol,'anchor-shield');
  await step(120,false);const later=await capture('04-carrier-countdown','carrier');
  for(const frame of [idle,later]){
   assert(frame.programs.every(p=>p.linked&&p.runnable!==false),'Carrier shader must link and run');
   assert(marker(frame).visible&&frame.effectPixels.changedPixels>50,'Carrier marker must contribute real pixels');
   assert.equal(marker(frame).userData.seconds,Math.ceil(frame.holderRemaining),'Countdown must read the real rule state');
  }
  assert(marker(later).userData.seconds<marker(idle).userData.seconds,'Native carry time must count down');
  await step(61,true);const chargedMarker=await capture('05-carrier-charged','carrier');
  assert.equal(chargedMarker.charge.value,1,'Native full charge must be reached');
  assert(chargedMarker.effectPixels.changedPixels>50&&marker(chargedMarker).visible,'Full-charge glow must not hide the carrier marker');
  await page.evaluate(()=>{const m=RG.match,a=m.local;m.ranked.rule.removeActor(String(a.nid??`${a.team}:${a.slot}`));m.advanceRanked(1/60);});
  const dropped=await capture('06-carrier-dropped','carrier');
  assert(!marker(dropped).visible&&dropped.effectPixels.changedPixels===0,'Drop must remove the carrier marker');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:'Native Rainmaker pickup, countdown and drop; camera-facing anchor-shield marker, GPU links and actual marker pixels. Chromium SwiftShader, low quality, bloom disabled.',build:{revision:build.build.revision,inputHash:build.inputHash,contentHash:build.contentHash},renderSettings:idle.renderSettings,captures:captures.map(c=>({name:c.name,carrier:c.carrier,holderRemaining:c.holderRemaining,effectPixels:c.effectPixels,marker:marker(c)})),errors},null,2));
  console.log(`Rainmaker carrier marker: passed; ${out}`);
 }else{
 const half=await step(30,true);assert(half.charge>.3&&half.charge<.8,'Native held input must reach a partial charge');
 const partial=await capture('04-carrier-half-charge','carrier');
 const full=await step(33,true);assert.equal(full.charge,1,'Native held input must reach full charge');
 const charged=await capture('05-carrier-full-charge','carrier');const play=await capture('05-full-play-camera','carrier-play');
 if(phase==='candidate')assert(play.effectPixels.shellPixels>50,'Body shell must contribute real pixels through the production post stack in the actual follow camera');
 await step(1,false);for(let i=0;i<10;i++){const r=await step(1,false);if(r.shots)break;}
 const shot=await page.evaluate(()=>__rainmakerEvidence.events.filter(e=>e.kind==='rainmaker-shot'));
 assert.equal(shot.length,1,'Exactly one native released shot event required');assert.equal(shot[0].charge,1);
 await step(3,false);const flight=await capture('06-shot-flight','shot');
 // Sample native impact/fuse and detonation at bounded fixed ticks. No
 // synthesized impact event or new particle system is injected by this check.
 let impactTicks=0;
 for(;impactTicks<90;impactTicks++){const s=await step(1,false);if(s.shot?.phase==='armed'||s.shot?.visible===false||s.shot?.attached===false)break;}
 assert(impactTicks<90,'Native flight must reach an impact within a bounded 1.5 seconds');
 const impact=await capture('07-shot-impact','shot');
 await step(13,false);const detonation=await capture('08-shot-detonation','shot');
 await step(7,false);const spray=await capture('08b-shot-blast-spray','shot');
 await step(120,false);
 const cleaned=await capture('09-effects-cleaned','shot');
 const events=await page.evaluate(()=>__rainmakerEvidence.events);
 const active=state=>state.nodes.filter(n=>n.visible&&/rainmaker-(?:shot|splash|blast|impact|ink-tail)/.test(n.name));
 if(phase==='candidate'){
  assert(neutral.nodes.some(n=>n.visible&&n.name==='rainmaker-barrier'&&n.wireframe===false),'Candidate shield must render a filled surface');
  assert(charged.nodes.some(n=>n.visible&&/aura|body-glow/.test(n.name)),'Full charge must render a visible body aura');
  for(const name of ['rainmaker-shot-head','rainmaker-shot-ink-sheet','rainmaker-shot-droplets'])assert(flight.nodes.some(n=>n.visible&&n.name===name),`Flight requires visible ${name}`);
  assert(impact.nodes.some(n=>n.visible&&n.name==='rainmaker-shot'&&n.userData.phase==='armed'),'Ground impact must retain the native armed shot');
  assert(impact.nodes.some(n=>n.visible&&n.name==='rainmaker-impact-splash'&&n.userData.phase==='impact'),'Ground impact must render its ink splash');
  assert(detonation.nodes.some(n=>n.visible&&n.name==='rainmaker-impact-splash'&&n.userData.phase==='blast'),'Delayed native detonation must render a blast splash');
  assert(spray.nodes.some(n=>n.visible&&n.name==='rainmaker-impact-splash'&&n.userData.phase==='blast')&&spray.effectPixels.changedPixels>50,'Blast must visibly expand into separated droplets after its initial mass');
  for(const frame of [neutral,pressured,idle,partial,charged,flight,impact,detonation]){
   assert(frame.programs.every(p=>p.linked&&p.runnable!==false),'Every drawn GPU program must link and run');
   assert(frame.effectPixels.changedPixels>50,`Actual ${frame===neutral?'neutral barrier':frame===pressured?'pressured barrier':frame===idle?'idle aura':frame===partial?'partial aura':frame===charged?'full aura':frame===flight?'flight':frame===impact?'impact':'detonation'} must contribute visible pixels`);
  }
  assert.equal(active(cleaned).length,0,'Temporary shot/splash visuals must retire');
  assert.equal(cleaned.effectPixels.changedPixels,0,'Retired shot/splash visuals must stop contributing pixels');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 const trajectory=await page.evaluate(()=>({births:__rainmakerEvidence.shotBirths,frames:__rainmakerEvidence.trajectory}));
 const maxTravel=Math.max(...trajectory.frames.map(f=>Math.hypot(f.pos[0]-trajectory.births[0][0],f.pos[2]-trajectory.births[0][2])));
 if(phase==='candidate')assert(maxTravel>15,'Real full-charge shot must pass the former 4.4-world range (native corridor check)');
 const receipt={trajectory,maxTravel,status:'passed',phase,scope:'Chromium SwiftShader; real offline tidewater native game, production Renderer post stack, seeded global setup RNG 0x12345678. Debug freeze and fixed 60 Hz Actor/Match/FX ticks; seeded shield-hit input and initial carrier position. Effect framebuffer hidden/visible comparison and GPU program link checks. No Switch real-device equivalence claim.',build:{revision:build.build.revision,inputHash:build.inputHash,contentHash:build.contentHash},browser:context.browser()?.version(),renderSettings:captures[0]?.renderSettings??null,boot,events,captures:captures.map(c=>({name:c.name,nativeTime:c.nativeTime,barrier:c.barrier,carrier:c.carrier,charge:c.charge.value,visibleRainmakerNodes:c.nodes.filter(n=>n.visible).map(n=>n.name),effectPixels:c.effectPixels,draw:c.draw})),errors};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2));console.log(`Rainmaker ${phase}: passed; ${out}`);
 }
 }
}catch(error){
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'failed',phase,error:error.stack,build:{revision:build.build.revision,inputHash:build.inputHash,contentHash:build.contentHash},boot,captures,errors},null,2));
 if(page)await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});throw error;
}finally{await context?.close();await new Promise(r=>server.close(r));}

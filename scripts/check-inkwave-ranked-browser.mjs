#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {observeRankedBoot} from './lib/ranked-boot-diagnostics.mjs';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
import {installRankedLiveAudioReader} from './lib/ranked-live-audio.mjs';
import {releaseFullRankedRainmaker} from './lib/ranked-rainmaker-charge.mjs';
const rankedModes = process.env.RANKED_MODE ? [process.env.RANKED_MODE] : ['zones','tower','rainmaker','clams'];
assert(rankedModes.every(mode => ['zones','tower','rainmaker','clams'].includes(mode)), 'Unknown RANKED_MODE');
const site=path.resolve(process.argv[2]||'_site-ranked'),out=path.resolve(process.argv[3]||'reports/ranked-browser');fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const publicUrl=process.env.RANKED_PUBLIC_URL;
let publishedIdentity=null;
if(publicUrl){
 assert.equal(new URL(publicUrl).origin,'https://rhgrive3.github.io');
 let lastError;
 for(let attempt=0;attempt<30;attempt++){
  try{const response=await fetch(new URL('inkwave-build.json?rankedVerify='+Date.now(),publicUrl),{signal:AbortSignal.timeout(15000)});assert(response.ok);const manifest=await response.json();assert.equal(manifest.inputHash,build.inputHash);assert.equal(manifest.contentHash,build.contentHash);assert.equal(manifest.build.revision,build.build.revision);publishedIdentity={url:publicUrl,inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build.revision};break;}
  catch(e){lastError=e;if(attempt<29)await new Promise(r=>setTimeout(r,10000));}
 }
 if(!publishedIdentity)throw new Error('Published build did not match the tested commit',{cause:lastError});
}
const served=new Set();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const[f,h]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,f))),h,f);
const delay=Number(process.env.RANKED_RELAY_DELAY_MS||0);assert(Number.isFinite(delay)&&delay>=0&&delay<=1000);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});served.add(path.relative(site,file));fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));const rooms=new Map();
const connectRelay=createLocalRelay({rooms});
relay.on('connection',(ws,req)=>connectRelay(ws,req,{send:(text,deliver)=>{if(delay&&text.startsWith('m|'))setTimeout(()=>deliver(text),delay);else deliver(text);}}));
const url=`${publicUrl||'http://127.0.0.1:'+server.address().port+'/'}?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const errors=[],results=[],contexts=[],pages=[],bootAttempts=[];let browser,browserInfo=null;
async function boot(){const c=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(c);await c.tracing.start({screenshots:true,snapshots:true,sources:false});const p=await c.newPage();pages.push(p);p.on('crash',()=>console.error('ranked browser page crashed'));p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true})));const receipt={context:contexts.length-1,inputHash:build.inputHash,revision:build.build.revision,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,contentHash:build.contentHash};bootAttempts.push(receipt);await observeRankedBoot(p,url,receipt,async()=>{await p.goto(url,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.RG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});},{artifacts:build.artifacts});return p;}
async function advance(p,n){
 return p.evaluate(async n=>{
  const g=RG.game,previous=g._skipRender;
  g._skipRender=true;
  try{for(let i=0;i<n;i++)g._frame(1/60);}finally{g._skipRender=previous;}
  // Preserve the atomic simulation sequence. Let the same recorded sounds
  // required by START settle before the explicit SwiftShader draw can block
  // their wall-clock load deadline. Keep every readiness failure fatal.
  await RG.audio.requireRecordedMainShot(g.profile.weapon||'shooter');
  RG.renderer.render(RG.scene,RG.camera);
 },n);
}
async function capture(p,options){
 const label=path.basename(options.path),started=Date.now();
 const state=await p.evaluate(async()=>{
  const r=RG.renderer,canvas=r.domElement,box=canvas.getBoundingClientRect(),before={frame:RG.game._frameN,time:RG.time,matchTime:RG.match?.time};
  const raf=await Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);
  return {before,after:{frame:RG.game._frameN,time:RG.time,matchTime:RG.match?.time},raf,frozen:RG.game.frozen,skipRender:RG.game._skipRender,mode:RG.match?.mode,state:RG.match?.state,actors:RG.match?.actors.length,fonts:document.fonts.status,visibility:document.visibilityState,canvas:{width:canvas.width,height:canvas.height,box:{x:box.x,y:box.y,width:box.width,height:box.height},display:getComputedStyle(canvas).display,contextLost:r.getContext().isContextLost()},draw:{...r.info.render},hud:document.querySelector('.iw-ranked-hud')?.textContent};
 });
 fs.writeFileSync(path.join(out,label+'.state.json'),JSON.stringify(state,null,2));console.log('ranked capture state',label,JSON.stringify(state));
 const drainMs=await p.evaluate(()=>{const t=performance.now();RG.renderer.getContext().finish();return performance.now()-t;});
 if(drainMs>100)console.log(`GPU queue drained in ${drainMs.toFixed(1)}ms before ${path.basename(options.path)}`);
 try {
  let session=null;
  try {
   session=await p.context().newCDPSession(p);
   const {data}=await session.send('Page.captureScreenshot',{format:options.type||'jpeg',quality:options.quality??60,captureBeyondViewport:false,fromSurface:false});
   const bytes=Buffer.from(data,'base64');
   if(bytes.length<4096||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new Error('Ranked screenshot: incomplete JPEG viewport capture');
   fs.writeFileSync(options.path,bytes);
   console.log('ranked capture complete via CDP',label,Date.now()-started);
   return bytes;
  }catch(error){console.warn('CDP viewport screenshot failed; retrying Playwright:',error.message);}
  finally{if(session)await session.detach().catch(()=>{});}
  const image=await p.screenshot({...options,animations:'disabled',timeout:90000});
  console.log('ranked capture complete via Playwright',label,Date.now()-started);
  return image;
 }catch(error){console.error('ranked capture failed',label,Date.now()-started);throw error;}
}
async function checkRankedRemoteContactGear(host, guest, save) {
 const pages=[host,guest],receipt={status:'running',scope:'native two-context gameplay, real relay and WebAudio lifecycle; not acoustic listening',phases:[]};
 const timeout={timeout:30000};
 const snapshot=async pending=>{const handle=await pending;try{return await handle.jsonValue();}finally{await handle.dispose();}};
 const phase=(name,value)=>{receipt.phases.push({name,...value});save(receipt);};
 // Native keyboard events own both held keys and physical press edges. A
 // keys-only Space hold cannot admit a jump/dodge through Player -> Actor.
 // Dispatch only transitions so repeated helper calls never replay an edge.
 const setInput=(page,fire,keys=[])=>page.evaluate(({fire,keys})=>{
  const state=__rankedReplication;state.cancelMotionStart?.(new Error('Ranked input start superseded'));clearTimeout(state.motionTimer);
  const apply=()=>{
   if(keys.includes('Space'))state.armDodge();
   RG.input.mouse.left=fire;
   for(const key of ['KeyW','KeyS','KeyA','KeyD','Space'])if(RG.input.down(key)&&!keys.includes(key))window.dispatchEvent(new KeyboardEvent('keyup',{code:key}));
   for(const key of keys)if(!RG.input.down(key))window.dispatchEvent(new KeyboardEvent('keydown',{code:key}));
   if(keys.includes('KeyW'))state.motionTimer=setTimeout(()=>RG.input.keys.delete('KeyW'),250);
  };
  if(!keys.includes('KeyW')){apply();return;}
  // Begin the same bounded wall-clock pulse immediately before the next real
  // native frame consumes it. A slow RAF must not erase the whole pulse before
  // any native input sample. Restore the exact original frame ownership first.
  const game=RG.game,descriptor=Object.getOwnPropertyDescriptor(game,'_frame'),frame=game._frame;
  return new Promise((resolve,reject)=>{
   let active=true;
   const restore=()=>{
    if(!active)return;active=false;clearTimeout(deadline);
    if(game._frame===start){if(descriptor)Object.defineProperty(game,'_frame',descriptor);else delete game._frame;}
    if(state.cancelMotionStart===cancel)state.cancelMotionStart=null;
   };
   const cancel=error=>{restore();reject(error);};
   const start=function(...args){
    restore();
    try{apply();const result=Reflect.apply(frame,this,args);resolve();return result;}
    catch(error){reject(error);throw error;}
   };
   const deadline=setTimeout(()=>cancel(new Error('Ranked input did not reach a native frame within 30000ms')),30000);
   state.cancelMotionStart=cancel;
   try{game._frame=start;}catch(error){cancel(error);}
  });
 },{fire,keys});
 const place=(page,position,yaw)=>page.evaluate(async({position,yaw})=>{
  const {PLAYER}=await import(new URL('src/config.js',document.baseURI)),a=RG.match.local;
  a.pos.fromArray(position);a.vel.set(0,0,0);a.yaw=a.aimYaw=yaw;a.yawVel=0;a._faceTarget=null;RG.rig.yaw=yaw;RG.rig.pitch=0;
  const ground=RG.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,.3,.3,PLAYER.footRadius,a.ground,false);
  if(!ground.hit)throw Error('Replication acceptance setup has no native foot support');
  a.pos.y=ground.y;a.grounded=true;a.groundN.copy(ground.normal);
 },{position,yaw});
 const read=(page,nid)=>page.evaluate(nid=>__rankedReplication.read(nid),nid);
 let identities,previousFrozen;
 try {
  previousFrozen=await Promise.all(pages.map(p=>p.evaluate(()=>{const value=RG.game.frozen;RG.game.debug.unfreeze();return value;})));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>RG.match.local.alive&&!RG.match.local.s3?.squidSpawn&&!RG.match.local.superJumpState&&!RG.match.local.specialActive,null,timeout)));
  identities=await Promise.all(pages.map((p,index)=>p.evaluate(async frozen=>{
   const G=RG,a=G.match.local,{objectShredderEquipped}=await import(new URL('patches/splatoon3/runtime/object-gear.mjs',document.baseURI)),{on}=await import(new URL('src/core/ctx.js',document.baseURI));
   if(globalThis.__rankedReplication)throw Error('Replication acceptance already installed');
   const state={frozen,position:a.pos.toArray(),velocity:a.vel.toArray(),yaw:a.yaw,yawVel:a.yawVel,faceTarget:a._faceTarget,aimYaw:a.aimYaw,aimPitch:a.aimPitch,rigYaw:G.rig.yaw,rigPitch:G.rig.pitch,profileWeapon:G.game.profile.weapon,invuln:a.invuln,
    loadout:structuredClone(a.s3.loadout),bots:G.actors.filter(a=>a.bot&&!a.isLocal).map(a=>[a.bot,a.bot.update]),
    socket:G.net.tr.ws,send:G.net.tr.ws.send,loop:G.audio.loop,wire:[],audio:[],objectShredderEquipped};
   globalThis.__rankedReplication=state;
   const dodgeRunner=a.weaponRunner;
   const armDodgeWitness=()=>{
    const token=dodgeRunner._rollToken??0;
    if(a.weaponRunner!==dodgeRunner||!Number.isSafeInteger(token)||token<0)throw Error('Ranked Dodge observer lost its native runner');
    state.dodgeReceipt=null;state.dodgeArm={token};
   };
   const observeDodgeWitness=event=>{
    const arm=state.dodgeArm,dodge=dodgeRunner.dodge;
    if(!arm||event?.actor!==a||a.weaponRunner!==dodgeRunner||!dodge||!Number.isSafeInteger(dodge.token)||dodge.token<=arm.token||dodgeRunner._rollToken!==dodge.token)return;
    state.dodgeReceipt={token:dodge.token,nativeTime:G.time,renderFrame:G.game._frameN};state.dodgeArm=null;
   };
   // Native acceptance emits synchronously while the fresh live Dodge exists.
   // Fixed ticks can finish it before a render-frame polling callback runs.
   state.armDodge=armDodgeWitness;state.offDodge=on('weapon:dodge',observeDodgeWitness);
   // Observe the exact serialized text handed to the real WebSocket. Delegate
   // first, preserve return/throw behavior, and retain at most 64 tick receipts.
   state.socket.send=function(text,...args){const result=state.send.call(this,text,...args);
    if(typeof text==='string'&&text.startsWith('b|')){const packet=JSON.parse(text.slice(2));if(packet.k==='t'){
     const row=packet.a?.find(row=>row[0]===a.nid);if(row){state.wire.push({ts:packet.ts,f:row[10],life:packet.l?.[a.nid],gear:packet.gg?.[a.nid]??null});if(state.wire.length>64)state.wire.shift();}}}
    return result;
   };
   // Retain public request handles for exact cleanup. The installed reader
   // resolves their owned live voices in AudioEngine.loops; loader/request
   // wrappers alone never qualify. Calls still reach real WebAudio unchanged.
   G.audio.loop=function(name,options,...args){const h=state.loop.call(this,name,options,...args);
    if(h&&options?.actor?.remote){const record={nid:options.actor.nid,name,options,handle:h,volume:options.volume??1,stops:0};state.audio.push(record);
     const set=h.set,stop=h.stop;h.set=function(p,...rest){if(p?.volume!=null)record.volume=p.volume;return set.call(this,p,...rest);};
     h.stop=function(...rest){record.stops++;return stop.apply(this,rest);};}
    return h;
   };
   state.read=nid=>{const actor=G.netm.byNid.get(nid);if(!actor)return null;const cur=actor.net?.cur,proof=actor.s3?.objectGearSnapshot;
    return {nid,owner:actor.owner,remote:actor.remote,alive:actor.alive,weapon:actor.weaponId,grounded:actor.grounded,held:!!actor.weaponRunner.rolling,
     suspended:actor.weaponRunner.s3RollerSuspendedHold===true,ready:!!actor.net?.ready,f:cur?.f??null,sampledOwner:cur?.rollerContactOwner??null,
     life:actor.netLife,sampledLife:cur?.life??null,near:actor._nearCamera(),rollLoop:!!actor.net?.loops?.roll?.playing,
     realRollLoops:state.readAudio(nid),
     audioState:G.audio.ctx?.state??'none',audioTime:G.audio.ctx?.currentTime??null,
     equipment:objectShredderEquipped(actor),gearOverride:typeof actor.s3?.objectHitGear==='boolean'?actor.s3.objectHitGear:null,proof:proof?{...proof}:null,acceptedSequence:actor.net?._adoptionSeq??null,
     sampledGear:cur?.adoption?.gear?.loadout?.[2]?.main??null,turret:!!actor.character.s3RemoteTurretPose};
   };
   a.invuln=999;G.game.debug.freezeBots();G.audio.init();
   return {nid:a.nid,owner:a.owner,weapon:a.weaponId,position:state.position,yaw:state.yaw};
  },previousFrozen[index])));
  assert.equal(identities[0].weapon,'roller');assert.equal(identities[1].weapon,'dualies');
  await Promise.all(pages.map(p=>p.evaluate(installRankedLiveAudioReader)));
  // A real browser gesture unlocks the real context. No silent/mock handles or
  // autoplay policy relaxation qualify as the positive audio control.
  for(const p of pages){await p.mouse.click(12,12);await p.waitForFunction(()=>RG.audio.ctx?.state==='running',null,timeout);}
  const lane=await host.evaluate(async()=>{
   const {rollerDrumSupport}=await import(new URL('patches/splatoon3/runtime/roller.mjs',document.baseURI));
   const {PLAYER}=await import(new URL('src/config.js',document.baseURI));
   const G=RG,a=G.match.local,V=a.pos.constructor,scratch={ids:[],start:new V(),delta:new V(),normalY:0,contactPoint:new V(),wallPoint:new V()};
   const query=(x,y,z,yaw)=>{const point=new V(x,y,z),probe={normal:new V()};
    if(G.level.spawnPads.some(p=>Math.hypot(x-p.x,z-p.z)<G.level.spawnBarrier+PLAYER.radius))return null;
    G.physics.groundProbe(x,y,z,.3,.3,PLAYER.footRadius,probe,false);if(!probe.hit||G.level.blocks[probe.block]?.roof||G.level.blocks[probe.block]?.rail||Math.abs(probe.y-y)>.1)return null;
    point.y=probe.y;
    // Ground and drum support do not imply that the actor fits beside a cover
    // wall. Use the same lifted humanoid capsule as Actor._resolve, including
    // every sampled point along the bounded positive-control corridor.
    const radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
    if(!G.physics.bodyFits(point,radius,PLAYER.stepUp,PLAYER.height,false))return null;
    const support=rollerDrumSupport({pos:point,yaw,grounded:true},G,scratch);return {pos:point.toArray(),support};};
   let attempts=0;
   // Existing native solid tops only. No new floor, collision stub, model or
   // guessed water coordinate. Failure to find a real edge fails the scenario.
   for(const block of G.level.blocks){if(!block.solid||block.roof||block.rail||!block.axes||Math.abs(block.axes[1].y)<.999)continue;
    for(const axis of [0,2])for(const sign of [-1,1])for(const inset of [.1,.2,.3]){
     if(++attempts>6000)throw Error('Native ledge search exceeded bounded budget');
     const dir=block.axes[axis],dx=dir.x*sign,dz=dir.z*sign,len=axis===0?block.half.x:block.half.z;
     if(len<3)continue;const y=block.center.y+block.half.y,yaw=Math.atan2(dx,dz);
     const x=block.center.x+dx*(len-inset),z=block.center.z+dz*(len-inset);
     const travelYaw=yaw+Math.PI;
     const edge=query(x,y,z,yaw),supported=query(x-dx*3,y,z-dz*3,travelYaw),observer=query(x-dx*5-dz*3,y,z-dz*5+dx*3,travelYaw);
     if(edge&&!edge.support.supported&&supported?.support.floor&&observer?.support.floor){
      // A roller travels along its current body heading before the facing
      // spring turns toward a reverse stick. Face into the verified corridor
      // and use forward input; a 250ms reverse pulse can hit the edge mid-turn.
      const corridor=[];for(let distance=0;distance<=4;distance+=.25){const at=query(x-dx*(3+distance),y,z-dz*(3+distance),travelYaw);if(!at?.support.floor)break;corridor.push(at.pos);}
      if(corridor.length===17)return {attempts,block:block.id,yaw,travelYaw,edge:edge.pos,supported:supported.pos,observer:observer.pos,edgeSupport:edge.support,corridor};
     }
    }
   }
   throw Error('Native ranked stage has no eligible feet-supported/drum-unsupported lane');
  });
  phase('native-ledge',{lane,identities});
  await place(host,lane.supported,lane.travelYaw);await place(guest,lane.observer,lane.yaw+Math.PI);
  await Promise.all(pages.map(p=>p.evaluate(()=>{RG.input.mouse.left=RG.input.mouse.right=false;RG.input.keys.clear();RG.game.debug.unfreeze();})));
  await setInput(host,true);
  await host.waitForFunction(()=>RG.match.local.weaponRunner.rolling&&!RG.match.local.weaponRunner.s3RollerSuspendedHold,null,timeout);
  // First require the real remote roll buffer/handle at zero speed. Then a
  // A real 250ms pulse can cover >3m. Verify 4m of native floor before admission;
  // a cold recording can never drive movement for the whole async timeout.
  await guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.held&&!s.suspended&&s.near&&s.rollLoop&&s.realRollLoops.some(h=>h.playing&&h.registered);},identities[0].nid,timeout);
  await setInput(host,true,['KeyW']);
  const supported=await snapshot(guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.held&&s.grounded&&!s.suspended&&s.near&&s.rollLoop&&s.audioState==='running'&&s.realRollLoops.some(h=>h.playing&&h.registered&&h.volume>0)?s:false;},identities[0].nid,timeout));
  await setInput(host,true);
  const movement=await host.evaluate(origin=>({position:RG.match.local.pos.toArray(),distance:Math.hypot(...RG.match.local.pos.toArray().map((v,i)=>v-origin[i]))}),lane.supported);
  assert(movement.distance<=4,'native movement pulse stayed inside verified 4m support corridor');
  phase('supported-real-audio',{remote:supported,movement});
  await place(host,lane.edge,lane.yaw);
  await host.waitForFunction(()=>RG.match.local.grounded&&RG.match.local.weaponRunner.rolling&&RG.match.local.weaponRunner.s3RollerSuspendedHold===true,null,timeout);
  const suspended=await snapshot(guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.ready&&s.remote&&s.alive&&s.grounded&&s.held&&s.suspended&&s.near&&s.audioState==='running'&&!!(s.f&(1<<28))&&!s.rollLoop&&s.realRollLoops.every(h=>!h.playing)?s:false;},identities[0].nid,timeout));
  const wire=await host.evaluate(()=>__rankedReplication.wire.at(-1));
  assert.equal(suspended.sampledOwner,identities[0].owner);assert.equal(suspended.sampledLife,suspended.life);
  assert(wire.f&(1<<28));assert(wire.f&16);assert(wire.f&256);assert(suspended.audioTime>supported.audioTime);
  assert(suspended.realRollLoops.some(h=>h.stops>0),'real supported loop was stopped');
  phase('suspended-owner-to-remote',{wire,remote:suspended});
  // Recovery must re-admit native contact and a real remote live loop at rest
  // before the bounded movement pulse. Relay/interpolation delay must not
  // consume that pulse while the remote is still observing suspension.
  await place(host,lane.supported,lane.travelYaw);await setInput(host,true);
  await host.waitForFunction(()=>RG.match.local.grounded&&RG.match.local.weaponRunner.rolling&&!RG.match.local.weaponRunner.s3RollerSuspendedHold,null,timeout);
  await guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.held&&s.grounded&&!s.suspended&&!(s.f&(1<<28))&&s.near&&s.rollLoop&&s.audioState==='running'&&s.realRollLoops.some(h=>h.playing&&h.registered);},identities[0].nid,timeout);
  await setInput(host,true,['KeyW']);
  const recovered=await snapshot(guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s?.held&&s.grounded&&!s.suspended&&!(s.f&(1<<28))&&s.rollLoop&&s.realRollLoops.some(h=>h.playing&&h.registered&&h.volume>0)?s:false;},identities[0].nid,timeout));
  phase('recovered-real-audio',{remote:recovered});await setInput(host,false);
  await guest.waitForFunction(nid=>{const s=__rankedReplication.read(nid);return s&&!s.held&&!s.suspended&&s.near&&s.audioState==='running'&&!(s.f&(1<<28))&&!s.rollLoop&&s.realRollLoops.every(h=>!h.playing);},identities[0].nid,timeout);
  phase('released',{remote:await read(guest,identities[0].nid)});

  await place(guest,identities[1].position,identities[1].yaw);
  const equip=value=>guest.evaluate(value=>{const a=RG.match.local;a.s3.loadout=a.s3.loadout.map(piece=>({...piece,subs:[...piece.subs]}));a.s3.loadout[2].main=value?'objectShredder':'none';a.s3RefreshGear();},value);
  async function gearState(equipped,turret){
   const remote=await snapshot(host.waitForFunction(({nid,equipped,turret})=>{const s=__rankedReplication.read(nid);return s?.ready&&s.proof?.source==='accepted-gear'&&s.proof.owner===s.owner&&s.proof.life===s.life&&s.proof.sequence===s.acceptedSequence&&s.proof.equipped===equipped&&s.gearOverride===null&&s.equipment===equipped&&s.sampledGear===(equipped?'objectShredder':'none')&&s.turret===turret&&!!(s.f&(1<<27))===turret&&!(s.f&(1<<28))?s:false;},{nid:identities[1].nid,equipped,turret},timeout));
   const wire=await guest.evaluate(()=>__rankedReplication.wire.at(-1));
   assert.equal(!!(wire.f&(1<<27)),turret);assert.equal(!!(wire.f&(1<<28)),false);assert(wire.gear,'real serialized gear sidecar is present');
   phase('gear-'+Number(equipped)+'-turret-'+Number(turret),{wire,remote});
  }
  await setInput(guest,false);await equip(true);await gearState(true,false);
  await equip(false);await gearState(false,false);
  // Native input starts and completes the genuine dodge. Do not set s3Turret,
  // dodge timers, flags, receiver loadout, or any accepted receipt directly.
  await setInput(guest,true,['KeyD','Space']);
  receipt.nativeDodgeStart=await snapshot(guest.waitForFunction(()=>__rankedReplication.dodgeReceipt||false,null,timeout));save(receipt);
  await setInput(guest,true);
  await guest.waitForFunction(()=>RG.match.local.weaponRunner.s3Turret===true&&!RG.match.local.weaponRunner.dodge,null,timeout);
  await gearState(false,true);await equip(true);await gearState(true,true);
  await setInput(guest,false);await gearState(true,false);
  receipt.status='passed';save(receipt);return receipt;
 }catch(error){
  receipt.status='failed';receipt.error=error?.stack||String(error);
  receipt.failureAfter=receipt.phases.at(-1)?.name??'initialization';
  // Capture before finally restores actors and stops voices. Diagnostics are
  // observational only and must neither replace the original failure nor
  // turn a closed/unreadable page into a successful acceptance receipt.
  receipt.failureState=await Promise.all(pages.map(async(p,index)=>{
   try{return {context:index,...await p.evaluate(nid=>{
    const G=globalThis.RG,a=G?.match?.local,s=globalThis.__rankedReplication;
    return {local:a?{nid:a.nid,alive:a.alive,grounded:a.grounded,held:!!a.weaponRunner?.rolling,suspended:a.weaponRunner?.s3RollerSuspendedHold===true,
     position:a.pos?.toArray()??null,velocity:a.vel?.toArray()??null,ink:a.ink}:null,
     remote:s&&nid!=null?s.read(nid):null,wire:s?.wire?.at(-1)??null};
   },identities?.[0]?.nid)};}catch(diagnosticError){return {context:index,diagnosticError:diagnosticError?.message||String(diagnosticError)};}
  }));
  save(receipt);throw error;
 }
 finally{
  const cleanupErrors=[];receipt.restoration=[];
  for(const [index,p]of pages.entries())try{receipt.restoration.push(await p.evaluate(frozen=>{
   const s=globalThis.__rankedReplication;if(!s){if(frozen)RG.game.debug.freeze();return;}const G=RG,a=G.match.local;
   s.cancelMotionStart?.(new Error('Ranked input cleanup'));s.offDodge?.();clearTimeout(s.motionTimer);G.input.mouse.left=G.input.mouse.right=false;for(const key of ['KeyW','KeyS','KeyA','KeyD','Space'])G.input.keys.delete(key);
   s.socket.send=s.send;G.audio.loop=s.loop;for(const r of s.audio)r.handle.stop(.05);
   a.weaponRunner.reset();a.s3.loadout=s.loadout;a.s3RefreshGear();a.pos.fromArray(s.position);a.vel.fromArray(s.velocity);a.yaw=s.yaw;a.yawVel=s.yawVel;a._faceTarget=s.faceTarget;a.aimYaw=s.aimYaw;a.aimPitch=s.aimPitch;G.rig.yaw=s.rigYaw;G.rig.pitch=s.rigPitch;a.invuln=s.invuln;
   for(const [bot,update]of s.bots)bot.update=update;
   if(s.frozen)G.game.debug.freeze();else G.game.debug.unfreeze();
   const restored={profileWeapon:G.game.profile.weapon,profileUnchanged:G.game.profile.weapon===s.profileWeapon,rigYaw:G.rig.yaw,rigPitch:G.rig.pitch,frozen:G.game.frozen,gear:structuredClone(a.s3.loadout)};
   delete globalThis.__rankedReplication;if(!restored.profileUnchanged)throw Error('Replication acceptance changed the persistent profile weapon');return restored;
  },previousFrozen?.[index]));}catch(error){cleanupErrors.push(error?.message||String(error));}
  save(receipt);
  if(cleanupErrors.length){const wasPassed=receipt.status==='passed';receipt.status='failed';receipt.cleanupErrors=cleanupErrors;save(receipt);if(wasPassed)throw Error('Replication acceptance cleanup failed: '+cleanupErrors.join('; '));}
 }
}

try{
 const launchOptions={headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(process.env.CHROMIUM_EXECUTABLE)launchOptions.executablePath=process.env.CHROMIUM_EXECUTABLE;
 else launchOptions.channel='chromium'; // Use Playwright's full Chromium headless mode; CI's default headless shell hangs on offline WebGL screenshots.
 browser=await chromium.launch(launchOptions);
 browserInfo={version:browser.version(),channel:launchOptions.channel||'custom-executable'};console.log(`Chromium ${browserInfo.version} (${browserInfo.channel})`);
 const p=await boot();await p.evaluate(()=>{RG.game.debug.freeze();RG.game._skipRender=true;});
 for(const mode of process.env.RANKED_ONLINE_ONLY ? [] : rankedModes){
  console.log('offline',mode);
  await p.evaluate(async mode=>{RG.game.debug.freeze();RG.game.menus.wipe.cancel();await RG.game.startMatch({mapId:'tidewater',difficulty:'easy',mode});},mode);
  // Native intro presentation follows Match.stateT; the frozen game must
  // advance its real clock before waiting for wall-clock DOM/CSS settlement.
  await advance(p,330);
  await p.waitForFunction(()=>RG.game.hud?._visible&&!document.querySelector('.iw-lineup'),null,{timeout:30000});
  await p.waitForFunction(()=>!document.querySelector('.iw-bn--go'),null,{timeout:15000});
  await advance(p,120);
  const initial=await p.evaluate(()=>({mode:RG.match.mode,state:RG.match.state,time:RG.match.time,actors:RG.match.actors.length,ranked:!!RG.match.ranked,hud:document.querySelector('.iw-ranked-hud')?.textContent}));assert(initial.ranked&&initial.actors===8&&initial.time<=300&&initial.time>290);assert(initial.hud?.length>5);
  await capture(p,{path:path.join(out,mode+'-offline.jpg'),type:'jpeg',quality:60});
  const proof=await p.evaluate(async mode=>{
   const m=RG.match,e=m.ranked,w=m.rankedWorld,a=m.local;RG.game.debug.freezeBots();
   if(mode==='zones'){e.stage.zones.forEach((_,i)=>w.captureZone(i,0));m.advanceRanked(1.2);if(e.counts[0]>98)throw Error('Native paint capture did not score');}
   if(mode==='tower'){a.pos.fromArray(e.rule.state.position);a.grounded=true;a._rankedOnTower=true;m.advanceRanked(1);if(e.rule.state.controllingTeam!==a.team)throw Error('Real tower rider not detected');}
   if(mode==='rainmaker'){a.pos.fromArray(e.rule.state.pos);a.grounded=true;m.rankedBarrierHits.push({id:String(a.nid??`${a.team}:${a.slot}`),team:a.team,damage:2000,kind:'main'});m.advanceRanked(1/60);if(e.rule.state.barrier.active)throw Error('Native shield did not pop');a.pos.fromArray(e.rule.state.pos);m.advanceRanked(1/60);if(e.rule.state.carrier!==String(a.nid??`${a.team}:${a.slot}`))throw Error('Native local holder failed pickup');}
   if(mode==='clams'){const c=e.rule.state.clams[0];a.pos.fromArray(c.pos);a.grounded=true;m.advanceRanked(1/60);const id=String(a.nid??`${a.team}:${a.slot}`);if(!(e.rule.state.inventories[id]?.small||e.rule.state.inventories[id]?.power))throw Error('Real actor failed clam pickup');}
   let weapon = null;
   if(mode==='rainmaker'){
    const {PLAYER}=await import(new URL('src/config.js',document.baseURI));
    const target=m.actors.find(v=>v.team!==a.team&&v.alive&&!v.specialActive&&!v.superJumpState&&!v.s3?.squidSpawn);if(!target)throw Error('No settled real actor for Rainmaker attack');
    const lane=[[0,2],[2,0],[0,-2],[-2,0]].map(([x,z])=>({x:a.pos.x+x,z:a.pos.z+z,dx:x/2,dz:z/2})).find(q=>{
     const y=w.floorAt(q.x,q.z);return Number.isFinite(y)&&Math.abs(y-a.pos.y)<.2&&RG.physics.los(a.pos.clone().add({x:0,y:1,z:0}),target.pos.clone().set(q.x,y+.7,q.z));
    });if(!lane)throw Error('No clear native floor lane for Rainmaker attack');
    // BEGIN RAINMAKER PROOF TARGET SETUP (exercised verbatim by the CPU regression)
    function prepareRainmakerProofTarget(target,lane,floor,physics,foot){
     if(!target.alive||target.specialActive||target.superJumpState||target.s3?.squidSpawn)throw Error('Rainmaker proof requires a settled target');
     target.pos.set(lane.x,floor,lane.z);target.vel.set(0,0,0);
     const support=physics.groundProbe(target.pos.x,target.pos.y,target.pos.z,.3,.3,foot,target.ground,false);
     if(!support.hit)throw Error('Rainmaker proof target has no native floor support');
     target.pos.y=support.y;target.grounded=true;target.groundN.copy(support.normal);
     // This is a stationary attack target. Releasing a pre-existing charged
     // Splatana or retaining an active Dualies roll otherwise moves it away.
     target.weaponRunner.reset();
     target.invuln=0;target.s3.spawnArmor=null;target.intent.move.set(0,0,0);
     target.intent.fire=target.intent.sub=target.intent.special=target.intent.squid=target.intent.jump=false;
    }
    // END RAINMAKER PROOF TARGET SETUP
    const targetState=()=>{
     const r=target.weaponRunner,c=r.catalogState;
     const phase=v=>v?Object.fromEntries(['t','dur','remaining','startup','elapsed','delay','duration','speed'].filter(k=>Number.isFinite(v[k])).map(k=>[k,v[k]])):null;
     return {id:String(target.nid??`${target.team}:${target.slot}`),weapon:target.weaponId,pos:target.pos.toArray(),vel:target.vel.toArray(),hp:target.hp,alive:target.alive,grounded:target.grounded,groundHit:target.ground.hit,groundBlock:target.ground.block,groundNormal:target.groundN.toArray(),form:target.form,jump:target.superJumpState?.phase??null,spawn:target.s3?.squidSpawn?.phase??null,
      runner:{charging:r.charging,charge:r.charge,cooldown:r.cooldown,dodge:phase(r.dodge),glide:phase(r.s3DualiesGlide),catalogId:c?.id??null,chargeF:c?.chargeF??0,stop:c?.stop??0,roll:phase(c?.roll),slip:phase(c?.slip),lunge:phase(c?.lunge),pending:!!c?.pending,stepStick:Array.from(c?.stepStick||[])}};
    };
    const targetBefore=targetState();
    prepareRainmakerProofTarget(target,lane,w.floorAt(lane.x,lane.z),RG.physics,PLAYER.footRadius);
    const targetPrepared=targetState();
    a.form='kid';a.aimYaw=Math.atan2(lane.dx,lane.dz);a.aimPitch=0;a.aimDir.set(lane.dx,0,lane.dz);a.intent.move.set(0,0,0);a.vel.set(0,0,0);
    const events=[],damage=[],play=m.playRankedEvents,hurt=target.damage,beforeInk=a.ink,beforeSpecial=a.special;
    m.playRankedEvents=function(es,...args){events.push(...es.filter(e=>e.kind==='rainmaker-shot'));return play.call(this,es,...args);};
    target.damage=function(amount,...args){damage.push(amount);return hurt.call(this,amount,...args);};
    const step=(n,fire)=>{for(let i=0;i<n;i++){RG.time+=1/60;a.intent.fire=fire;a.intent.sub=false;a.intent.squid=false;a.update(1/60);target.update(1/60);m.advanceRanked(1/60);}};
    try{step(61,true);if(e.rule.state.charge.value!==1)throw Error('Rainmaker failed full charge through Actor.update');step(1,false);step(20,true);
     if(events.length!==1||e.rule.state.charge.seconds>1e-8)throw Error('Rainmaker recovery admitted another shot/charge');
     step(20,false);if(!damage.includes(60)||!damage.includes(180)||target.alive)throw Error('Native Rainmaker direct/delayed blast did not splat: '+JSON.stringify(damage));
     if(a.ink<beforeInk||a.special!==beforeSpecial)throw Error('Carrier attack consumed ink or gained special');
     weapon={targetCondition:'unarmored',shots:events.length,charge:events[0].charge,direct:events[0].damage,blast:events[0].blastDamage,damage,inkBefore:beforeInk,inkAfter:a.ink,targetSplat:!target.alive,targetState:{before:targetBefore,prepared:targetPrepared,after:targetState()}};
     const wallOwner=m.actors.find(v=>v.team!==a.team&&v.alive&&!v.specialActive);
     if(!wallOwner)throw Error('No native owner for Rainmaker wall proof');
     wallOwner.weapon={...wallOwner.weapon,sub:'splashWall'};
     wallOwner.s3.abilityPoints={...wallOwner.s3.abilityPoints,subPower:0};a.s3.objectHitGear=false;a.vel.set(0,0,0);
     const wall=RG.projectiles.throwBomb(wallOwner);if(!wall||wall.subId!=='splashWall')throw Error('Native wall creation failed');
     wall.phase='deployed';wall.pos.set(a.pos.x+lane.dx*1.2,a.pos.y,a.pos.z+lane.dz*1.2);wall.yaw=Math.atan2(lane.dx,lane.dz);
     const wallBefore=wall.hp;
     step(61,true);step(1,false);step(20,true);step(20,false);
     if(events.length!==2||wallBefore!==800||Math.abs(wall.hp-380)>1e-8)throw Error('Native Rainmaker wall direct/blast did not apply 60+360: '+JSON.stringify({shots:events.length,before:wallBefore,after:wall.hp}));
     if(a.ink<beforeInk||a.special!==beforeSpecial)throw Error('Wall attack consumed ink or gained special');
     weapon.wall={shots:1,hpBefore:wallBefore,hpAfter:wall.hp,direct:60,blast:360};

    }catch(error){throw Error(error.message+'; Rainmaker proof receipt '+JSON.stringify({targetBefore,targetPrepared,targetAfter:targetState(),damage,shots:events,shooter:{pos:a.pos.toArray(),vel:a.vel.toArray(),special:a.special}}));}finally{m.playRankedEvents=play;target.damage=hurt;a.intent.fire=false;}
   }
   const snap=e.snapshot();if(!e.restore(snap))throw Error('Own snapshot rejected');return {counts:[...e.counts],snapshotBytes:JSON.stringify(snap).length,weapon};
  },mode);
  await advance(p,60);
  await capture(p,{path:path.join(out,mode+'-objective.jpg'),type:'jpeg',quality:60});
  const deadline=await p.evaluate(()=>{const m=RG.match,e=m.ranked;e.time=.001;m.time=.001;m.advanceRanked(1/60);return {winner:e.winner,overtime:e.overtime,state:m.state};});
  let clamVoidDrop=null;
  if(mode==='clams')clamVoidDrop=await p.evaluate(async()=>{
   const {RankedEngine}=await import(new URL('patches/splatoon3/runtime/ranked/engine.mjs',document.baseURI));
   const {PLAYER}=await import(new URL('src/config.js',document.baseURI));
   // BEGIN CLAM VOID DROP PROOF (also executed verbatim by the CPU regression)
   function runClamVoidDropProof(G,RankedEngine,PLAYER){
    const m=G.match,w=m.rankedWorld,dt=1/60,rows=[];
    const check=(ok,message)=>{if(!ok)throw Error('Clam void proof: '+message);};
    check(m.mode==='clams'&&!m.follower,'offline Clam match required');
    const pool=m.actors.filter(a=>a.alive&&!a.remote&&!a.specialActive&&!a.superJumpState&&!a.s3?.squidSpawn&&Number.isFinite(w.floorAt(a.pos.x,a.pos.z)));
    check(pool.length>=2,'two settled native actors required');
    const bounds=G.level.bounds;let water=null,searches=0;
    // Bounded terrain query, not a guessed water coordinate or a stubbed floor.
    for(let iz=0;iz<25&&!water;iz++)for(let ix=0;ix<25&&!water;ix++){
     const x=bounds.minX+1+(bounds.maxX-bounds.minX-2)*ix/24,z=bounds.minZ+1+(bounds.maxZ-bounds.minZ-2)*iz/24;searches++;
     if(w.floorAt(x,z,Infinity)===null&&G.level.groundHeight(x,z,PLAYER.fallDeathY+.6)===-Infinity)water=[x,z];
    }
    check(water,'native stage has no sampled unsupported water lane');
    const fields=['ranked','actors','state','stateT','time','rankedGains','rankedBarrierHits'],saved=Object.fromEntries(fields.map(k=>[k,m[k]]));
    try{
     for(const [index,kind]of ['floor','water'].entries()){
      const a=pool[index],id=String(a.nid??`${a.team}:${a.slot}`),team=a.team;
      // Only initial conditions are seeded. Death, dropped objects, overtime and
      // the winning result below are produced by actual Actor/Match/World code.
      const stage={...saved.ranked.stage,clams:{...saved.ranked.stage.clams,spawns:[]}},e=new RankedEngine('clams',stage);
      m.ranked=e;m.actors=[a];m.state='playing';m.stateT=0;m.rankedGains=[0,0];m.rankedBarrierHits=[];
      a.weaponRunner.reset();a.intent.move.set(0,0,0);a.intent.fire=a.intent.sub=a.intent.special=a.intent.squid=a.intent.jump=a.intent.throw=false;a._rankedInput=null;
      a.vel.set(0,0,0);a.pos.y=w.floorAt(a.pos.x,a.pos.z);a.grounded=true;
      e.rule.state.inventories[id]={team,small:0,power:true};e.counts[team]=70;e.counts[1-team]=50;e.leader=1-team;e.rule.state.scoredPoints[team]=30;e.rule.state.scoredPoints[1-team]=50;e.time=dt;
      m.advanceRanked(dt);check(e.overtime&&e.winner===null,kind+' did not enter comeback');
      if(kind==='water'){
       a.pos.set(water[0],PLAYER.fallDeathY-.1,water[1]);a.vel.set(0,-1,0);a.grounded=a.ground.hit=false;G.time+=dt;a.update(dt);
       check(!a.alive,'Actor.update did not produce water death');check(w.floorAt(a.pos.x,a.pos.z,a.pos.y+.25)===null,'water death gained floor support');
      }else a.splat(null,'weapon');
      const before=e.elapsed;m.advanceRanked(dt);const s=e.rule.state,dropElapsed=e.elapsed;
      check(!a.alive&&!s.inventories[id].power,'death did not consume held Power Clam');
      if(kind==='water'){
       check(s.clams.length===0&&e.winner===1-team&&e.reason==='clam-overtime-power-clams-lost'&&m.state==='finish','water loss did not finish on the ranked tick');
       check(e.elapsed-before<=dt+1e-9,'water death added a new waiting period');
       rows.push({kind,team,deathPos:a.pos.toArray(),floor:null,clams:0,endedAt:e.elapsed,reason:e.reason});
      }else{
       check(s.clams.length===1&&s.clams[0].kind==='power'&&s.clams[0].grounded&&s.clams[0].expiresIn===10&&e.winner===null,'supported drop lost its ten-second lifetime');
       const floor=w.floorAt(a.pos.x,a.pos.z),dropPos=s.clams[0].pos.slice();check(dropPos[1]===floor,'supported drop moved away from floor');
       for(let tick=0;tick<599;tick++)m.advanceRanked(dt);
       check(s.clams.length===1&&e.winner===null,'supported Power Clam expired before ten seconds');
       const remaining=s.clams[0].expiresIn;m.advanceRanked(dt);
       check(s.clams.length===0&&e.winner===1-team&&e.reason==='clam-overtime-power-clams-lost','supported Power Clam did not expire on its existing deadline');
       rows.push({kind,team,dropPos,floor,lifetime:10,aliveAtTick599:true,remainingAtTick599:remaining,expiredAtTick600:true,dropElapsed,endedAt:e.elapsed,reason:e.reason});
      }
     }
     return {fixture:'initial losing counts and held Power; outputs untouched',searches,water,rows};
    }finally{for(const key of fields)m[key]=saved[key];w.update(saved.ranked,0);}
   }
   // END CLAM VOID DROP PROOF
   return runClamVoidDropProof(RG,RankedEngine,PLAYER);
  });
  results.push({mode,offline:initial,proof:{...proof,...deadline},...(clamVoidDrop?{clamVoidDrop}:{})});
 }
 const guest=process.env.RANKED_OFFLINE_ONLY?null:await boot();
 // Real native session and production relay across isolated browser contexts.
 for(const mode of process.env.RANKED_OFFLINE_ONLY?[]:rankedModes){
  console.log('online',mode);
  // Run both native simulations/relay clients continuously, but submit GPU work
  // only for the captured evidence. Two SwiftShader render loops otherwise
  // starve Chromium's screenshot compositor on CI runners.
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>{RG.game._skipRender=true;RG.game.debug.unfreeze();RG.game.menus.launchLobby=async()=>{};})));
  const code=await p.evaluate(()=>RG.net.create('Ranked Host'));await guest.evaluate(c=>RG.net.join(c,'Ranked Guest'),code);
  await p.waitForFunction(()=>RG.net.lobby.players.length===2);await guest.waitForFunction(()=>RG.net.lobby.players.length===2);
  await p.evaluate(mode=>{RG.net.setSettings({mode,bots:true,map:'tidewater'});},mode);
  await guest.waitForFunction(mode=>RG.net.lobby.mode===mode,mode,{timeout:30000});
  if(mode==='zones'){
   await p.evaluate(()=>RG.net.setMe({weapon:'roller'}));await guest.evaluate(()=>RG.net.setMe({weapon:'dualies'}));
   await p.waitForFunction(()=>RG.net.lobby.players.some(a=>a.id===RG.net.myId&&a.weapon==='roller')&&RG.net.lobby.players.some(a=>a.id!==RG.net.myId&&a.weapon==='dualies'),null,{timeout:30000});
  }
  await p.evaluate(()=>{if(!RG.net.confirmTeams())throw Error('Team confirmation failed');});
  await guest.waitForFunction(()=>RG.net.lobby.teamsConfirmed);
  await guest.evaluate(()=>RG.net.setMe({ready:true}));await p.evaluate(()=>RG.net.setMe({ready:true}));
  await p.waitForFunction(()=>RG.net.canStart());await p.evaluate(()=>{if(!RG.net.start())throw Error('Room start rejected');});
  await Promise.all([p,guest].map(pg=>pg.waitForFunction(()=>RG.match?.state==='playing'&&RG.net.active&&RG.match.ranked,null,{timeout:180000})));
  await p.evaluate(()=>{RG.game.debug.freeze();RG.game.debug.freezeBots();RG.match.ranked.setCount(0,65);RG.match.ranked.revision++;RG.netm._sendNow({k:'rkstate',rk:{match:RG.netm.cfg.id,host:RG.netm.s.hostId,state:RG.match.ranked.snapshot(),gains:RG.match.rankedGains}});});
  await guest.waitForFunction(()=>RG.match.ranked.counts[0]===65,null,{timeout:30000});
  const online=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({mode:RG.match.mode,counts:[...RG.match.ranked.counts],follower:RG.match.follower,actors:RG.match.actors.length,time:RG.match.time}))));assert.deepEqual(online[0].counts,online[1].counts);assert.equal(online[0].mode,mode);assert.equal(online[1].mode,mode);
  const remoteContactGear=mode==='zones'?await checkRankedRemoteContactGear(p,guest,value=>fs.writeFileSync(path.join(out,'remote-contact-gear.json'),JSON.stringify({contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision,...value},null,2))):null;
  let onlineWeapon = null, onlineWall = null, onlineCharge = null;
  if(mode==='rainmaker'){
   await Promise.all([p,guest].map(pg=>pg.waitForFunction(()=>!document.querySelector('.iw-lineup')&&!document.querySelector('.iw-bn--go'),null,{timeout:15000})));
   const guestId=await guest.evaluate(()=>String(RG.match.local.nid??`${RG.match.local.team}:${RG.match.local.slot}`));
   await Promise.all([p,guest].map(pg=>pg.evaluate(()=>{
    globalThis.rankedWeaponEvents=[];const effects=RG.match.rankedEffects,previous=effects.event;
    effects.event=function(e,...args){if(e.kind==='rainmaker-shot')rankedWeaponEvents.push({...e,visualOnly:!!args[0]});return previous.call(this,e,...args);};
   })));
   await p.evaluate(id=>{
    const m=RG.match,e=m.ranked,s=e.rule.state,a=m.actors.find(a=>String(a.nid??`${a.team}:${a.slot}`)===id);if(!a?.remote||!a.alive)throw Error('Guest-owned remote carrier unavailable');
    s.carrier=id;s.carrierTeam=a.team;s.lastCarrierTeam=a.team;s.pos=a.pos.toArray();s.pickupZ=a.pos.z;s.lastGroundedPos=s.pos.slice();s.barrier.active=false;s.respawnRemaining=0;s.holderTime=0;s.holderRemaining=60;
    s.charge={seconds:0,value:0,firing:false,delay:0,recovery:0,pending:null,wasSwimming:a.form==='squid'};e.revision++;
    RG.netm._sendNow({k:'rkstate',rk:{match:RG.netm.cfg.id,host:RG.netm.s.hostId,state:e.snapshot(),gains:m.rankedGains}});
    RG.game.debug.unfreeze();
   },guestId);
   await guest.waitForFunction(id=>RG.match.ranked.rule.state.carrier===id,guestId,{timeout:30000});
   const wallPlacement=await guest.evaluate(()=>{
    const a=RG.match.local,world=RG.match.rankedWorld;
    const dirs=[[0,1],[1,0],[0,-1],[-1,0]];
    const dir=dirs.find(([dx,dz])=>{const at=a.pos.clone();at.x+=dx*2;at.z+=dz*2;const floor=world.floorAt(at.x,at.z);return Number.isFinite(floor)&&Math.abs(floor-a.pos.y)<.8&&(!world.hasLineOfSight||world.hasLineOfSight(a.pos,at));});
    if(!dir)throw Error('No native floor lane for online wall proof');
    const [dx,dz]=dir,yaw=Math.atan2(dx,dz);RG.rig.yaw=yaw;RG.rig.pitch=0;a.vel.set(0,0,0);a.s3.objectHitGear=false;
    return {pos:[a.pos.x+dx*1.2,a.pos.y,a.pos.z+dz*1.2],yaw};
   });
   const wallIdentity=await p.evaluate(placement=>{
    const owner=RG.match.local;owner.weapon={...owner.weapon,sub:'splashWall'};owner.s3.abilityPoints={...owner.s3.abilityPoints,subPower:0};
    const wall=RG.projectiles.throwBomb(owner);if(!wall||wall.subId!=='splashWall')throw Error('Host native wall creation failed');
    wall.phase='deployed';wall.pos.fromArray(placement.pos);wall.yaw=placement.yaw;globalThis.rankedNativeWall=wall;globalThis.rankedWallDrops=[];globalThis.rankedWallPlay=RG.netm._play;
    RG.netm._play=function(from,e,...args){
     const tracks=e?.[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='objectHit'&&e[5].targetOwnerId===owner.nid;
     const before=wall.hp,result=rankedWallPlay.call(this,from,e,...args);if(tracks)rankedWallDrops.push(before-wall.hp);return result;
    };
    return {ownerNid:owner.nid,seq:wall.seq,sourceLife:wall.sourceLife};
   },wallPlacement);
   await guest.evaluate(({placement,identity})=>{
    const owner=RG.netm.byNid.get(identity.ownerNid);if(!owner)throw Error('Missing wall owner on guest');
    owner.weapon={...owner.weapon,sub:'splashWall'};owner.s3.abilityPoints={...owner.s3.abilityPoints,subPower:0};
    const remote=owner.remote;let wall;try{owner.remote=false;wall=RG.projectiles.throwBomb(owner);}finally{owner.remote=remote;}
    if(!wall||wall.subId!=='splashWall')throw Error('Guest native wall creation failed');
    wall.ghost=true;wall.phase='deployed';wall.pos.fromArray(placement.pos);wall.yaw=placement.yaw;wall.seq=identity.seq;wall.sourceLife=identity.sourceLife;
    globalThis.rankedNativeWall=wall;globalThis.rankedWallPackets=[];globalThis.rankedWallRec=RG.netm._rec;
    RG.netm._rec=function(e,...args){if(e[0]==='ac'&&e[1]==='sub'&&e[4]?.phase==='objectHit'&&e[4].targetOwnerId===identity.ownerNid)
     rankedWallPackets.push({...e[4]});return rankedWallRec.call(this,e,...args);};
   },{placement:wallPlacement,identity:wallIdentity});
   try{
    onlineCharge = await releaseFullRankedRainmaker(p, guest, guestId, receipt => fs.writeFileSync(path.join(out,'rainmaker-charge-receipts.json'), JSON.stringify(receipt,null,2)));
    await p.waitForFunction(()=>rankedWeaponEvents.length===1,null,{timeout:30000});
    await guest.waitForFunction(()=>rankedWeaponEvents.length===1,null,{timeout:30000});
    onlineWeapon=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>rankedWeaponEvents.map(e=>({actorId:e.actorId,charge:e.charge,damage:e.damage,blastDamage:e.blastDamage,visualOnly:e.visualOnly})))));
    assert.equal(onlineWeapon[0][0].actorId,guestId);assert.equal(onlineWeapon[0][0].charge,1);assert.equal(onlineWeapon[0][0].damage,60);assert.equal(onlineWeapon[0][0].blastDamage,180);
    assert.equal(onlineWeapon[0][0].visualOnly,false);assert.equal(onlineWeapon[1][0].visualOnly,true);
    assert.deepEqual({...onlineWeapon[0][0],visualOnly:true},onlineWeapon[1][0]);
    await p.waitForFunction(()=>rankedWallDrops.length===2,null,{timeout:30000});
    onlineWall=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({hp:rankedNativeWall.hp,ghost:!!rankedNativeWall.ghost,drops:globalThis.rankedWallDrops||[],packets:(globalThis.rankedWallPackets||[]).map(e=>({damage:e.damage,cause:e.cause,targetOwnerId:e.targetOwnerId,targetSeq:e.targetSeq}))}))));
    assert.deepEqual(onlineWall[0].drops,[60,360]);assert.equal(onlineWall[0].ghost,false);
    assert.ok(onlineWall[1].hp>0&&onlineWall[1].hp<=800);assert.equal(onlineWall[1].ghost,true);
    assert.deepEqual(onlineWall[1].packets.map(e=>e.damage),[60,180]);assert.deepEqual(onlineWall[1].packets.map(e=>e.cause),['Gachihoko_Bullet','Gachihoko_BombCore']);
   }finally{await guest.evaluate(()=>{RG.input.mouse.left=false;if(globalThis.rankedWallRec)RG.netm._rec=rankedWallRec;});await p.evaluate(()=>{if(globalThis.rankedWallPlay)RG.netm._play=rankedWallPlay;RG.game.debug.freeze();});}
  }
  for(const [i,pg] of [p,guest].entries()){
   await pg.waitForFunction(()=>!document.querySelector('.iw-bn--go'),null,{timeout:15000});
   await pg.evaluate(()=>RG.renderer.render(RG.scene,RG.camera));
   await capture(pg,{path:path.join(out,mode+'-online-'+i+'.jpg'),type:'jpeg',quality:60});
  }
  let record=results.find(r=>r.mode===mode);if(!record)results.push(record={mode});record.online=online;if(onlineWeapon)record.onlineWeapon=onlineWeapon;if(onlineWall)record.onlineWall=onlineWall;if(onlineCharge)record.onlineCharge=onlineCharge;if(remoteContactGear)record.remoteContactGear=remoteContactGear;
  await p.evaluate(()=>{RG.match.ranked.setCount(0,0);RG.match.advanceRanked(1/60);});
  await guest.waitForFunction(()=>RG.match.ranked.winner===0&&RG.match.ranked.knockout&&RG.match.state==='finish',null,{timeout:30000});
  record.terminal=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({winner:RG.match.ranked.winner,knockout:RG.match.ranked.knockout,counts:[...RG.match.ranked.counts],state:RG.match.state}))));
  assert.deepEqual(record.terminal[0],record.terminal[1]);
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>RG.net.leave())));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:process.env.RANKED_OFFLINE_ONLY?'offline-only':process.env.RANKED_ONLINE_ONLY?'online-only':'offline-and-online',publishedIdentity,contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision,browser:browserInfo,delayMs:delay,served:[...served],results,errors,bootAttempts},null,2));
}catch(e){
 // Never let diagnostic image capture replace the original ranked/relay failure.
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'failed',publishedIdentity,contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision,browser:browserInfo,error:e?.stack||String(e),results,errors,bootAttempts},null,2));
 for(let i=0;i<pages.length;i++){
  try { await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),timeout:5000}); }
  catch(captureError){console.warn('ranked failure screenshot '+i+' unavailable:',captureError.message);}
 }
 throw e;
}
finally{for(const [i,c]of contexts.entries()){try{await c.tracing.stop({path:path.join(out,'trace-'+i+'.zip')});}catch(e){console.warn('ranked trace unavailable',i,e.message);}await c.close();}await browser?.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}

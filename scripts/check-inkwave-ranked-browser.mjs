#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
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
const errors=[],results=[],contexts=[],pages=[];let browser,browserInfo=null;
async function boot(){const c=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(c);await c.tracing.start({screenshots:true,snapshots:true,sources:false});const p=await c.newPage();pages.push(p);p.on('crash',()=>console.error('ranked browser page crashed'));p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true})));await p.goto(url,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{globalThis.RG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});await p.waitForFunction(()=>RG.game?.menus&&RG.s3?.installed&&RG.mode!=='boot',null,{timeout:180000});return p;}
async function advance(p,n){return p.evaluate(n=>{const g=RG.game,previous=g._skipRender;g._skipRender=true;try{for(let i=0;i<n;i++)g._frame(1/60);}finally{g._skipRender=previous;}RG.renderer.render(RG.scene,RG.camera);},n);}
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
try{
 const launchOptions={headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(process.env.CHROMIUM_EXECUTABLE)launchOptions.executablePath=process.env.CHROMIUM_EXECUTABLE;
 else launchOptions.channel='chromium'; // Use Playwright's full Chromium headless mode; CI's default headless shell hangs on offline WebGL screenshots.
 browser=await chromium.launch(launchOptions);
 browserInfo={version:browser.version(),channel:launchOptions.channel||'custom-executable'};console.log(`Chromium ${browserInfo.version} (${browserInfo.channel})`);
 const p=await boot();await p.evaluate(()=>{RG.game.debug.freeze();RG.game._skipRender=true;});
 for(const mode of process.env.RANKED_ONLINE_ONLY ? [] : ['zones','tower','rainmaker','clams']){
  console.log('offline',mode);
  await p.evaluate(async mode=>{RG.game.debug.freeze();RG.game.menus.wipe.cancel();await RG.game.startMatch({mapId:'tidewater',difficulty:'easy',mode});},mode);
  await p.waitForFunction(()=>RG.game.hud?._visible&&!document.querySelector('.iw-lineup'),null,{timeout:30000});
  await advance(p,330);
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
  results.push({mode,offline:initial,proof:{...proof,...deadline}});
 }
 const guest=process.env.RANKED_OFFLINE_ONLY?null:await boot();
 // Real native session and production relay across isolated browser contexts.
 for(const mode of process.env.RANKED_OFFLINE_ONLY?[]:['zones','tower','rainmaker','clams']){
  console.log('online',mode);
  // Run both native simulations/relay clients continuously, but submit GPU work
  // only for the captured evidence. Two SwiftShader render loops otherwise
  // starve Chromium's screenshot compositor on CI runners.
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>{RG.game._skipRender=true;RG.game.debug.unfreeze();RG.game.menus.launchLobby=async()=>{};})));
  const code=await p.evaluate(()=>RG.net.create('Ranked Host'));await guest.evaluate(c=>RG.net.join(c,'Ranked Guest'),code);
  await p.waitForFunction(()=>RG.net.lobby.players.length===2);await guest.waitForFunction(()=>RG.net.lobby.players.length===2);
  await p.evaluate(mode=>{RG.net.setSettings({mode,bots:true,map:'tidewater'});},mode);
  await guest.waitForFunction(mode=>RG.net.lobby.mode===mode,mode,{timeout:30000});
  await p.evaluate(()=>{if(!RG.net.confirmTeams())throw Error('Team confirmation failed');});
  await guest.waitForFunction(()=>RG.net.lobby.teamsConfirmed);
  await guest.evaluate(()=>RG.net.setMe({ready:true}));await p.evaluate(()=>RG.net.setMe({ready:true}));
  await p.waitForFunction(()=>RG.net.canStart());await p.evaluate(()=>{if(!RG.net.start())throw Error('Room start rejected');});
  await Promise.all([p,guest].map(pg=>pg.waitForFunction(()=>RG.match?.state==='playing'&&RG.net.active&&RG.match.ranked,null,{timeout:180000})));
  await p.evaluate(()=>{RG.game.debug.freeze();RG.game.debug.freezeBots();RG.match.ranked.setCount(0,65);RG.match.ranked.revision++;RG.netm._sendNow({k:'rkstate',rk:{match:RG.netm.cfg.id,host:RG.netm.s.hostId,state:RG.match.ranked.snapshot(),gains:RG.match.rankedGains}});});
  await guest.waitForFunction(()=>RG.match.ranked.counts[0]===65,null,{timeout:30000});
  const online=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({mode:RG.match.mode,counts:[...RG.match.ranked.counts],follower:RG.match.follower,actors:RG.match.actors.length,time:RG.match.time}))));assert.deepEqual(online[0].counts,online[1].counts);assert.equal(online[0].mode,mode);assert.equal(online[1].mode,mode);
  let onlineWeapon = null, onlineWall = null;
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
    await guest.evaluate(()=>{RG.input.mouse.left=true;});
    await p.waitForFunction(()=>RG.match.ranked.rule.state.charge.value===1,null,{timeout:30000});
    await guest.evaluate(()=>{RG.input.mouse.left=false;});
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
  let record=results.find(r=>r.mode===mode);if(!record)results.push(record={mode});record.online=online;if(onlineWeapon)record.onlineWeapon=onlineWeapon;if(onlineWall)record.onlineWall=onlineWall;
  await p.evaluate(()=>{RG.match.ranked.setCount(0,0);RG.match.advanceRanked(1/60);});
  await guest.waitForFunction(()=>RG.match.ranked.winner===0&&RG.match.ranked.knockout&&RG.match.state==='finish',null,{timeout:30000});
  record.terminal=await Promise.all([p,guest].map(pg=>pg.evaluate(()=>({winner:RG.match.ranked.winner,knockout:RG.match.ranked.knockout,counts:[...RG.match.ranked.counts],state:RG.match.state}))));
  assert.deepEqual(record.terminal[0],record.terminal[1]);
  await Promise.all([p,guest].map(pg=>pg.evaluate(()=>RG.net.leave())));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:process.env.RANKED_OFFLINE_ONLY?'offline-only':process.env.RANKED_ONLINE_ONLY?'online-only':'offline-and-online',publishedIdentity,contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision,browser:browserInfo,delayMs:delay,served:[...served],results,errors},null,2));
}catch(e){
 // Never let diagnostic image capture replace the original ranked/relay failure.
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'failed',contentHash:build.contentHash,browser:browserInfo,error:e?.stack||String(e),results,errors},null,2));
 for(let i=0;i<pages.length;i++){
  try { await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),timeout:5000}); }
  catch(captureError){console.warn('ranked failure screenshot '+i+' unavailable:',captureError.message);}
 }
 throw e;
}
finally{for(const [i,c]of contexts.entries()){try{await c.tracing.stop({path:path.join(out,'trace-'+i+'.zip')});}catch(e){console.warn('ranked trace unavailable',i,e.message);}await c.close();}await browser?.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}

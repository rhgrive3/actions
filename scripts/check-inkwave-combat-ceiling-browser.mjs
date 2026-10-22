#!/usr/bin/env node
// QA-only: two full native Game/Actor instances over the production local relay.
// Native projectile contact authors the 36 packet. Only that outbound packet is
// held; its 220 clone and original are then delivered over the real transport.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
import {installCombatPlacementQA,advanceUntilNativeShotProof,advanceUntilNativePlacement} from './lib/inkwave-combat-ceiling-placement.mjs';
import {verifyRuntimeBuild, persistentDirectory, hash} from './lib/inkwave-runtime-evidence.mjs';
import {serveProjectileCaptureFile} from './lib/inkwave-projectile-http-file.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(option('--site','_site'));
const evidence=persistentDirectory(option('--evidence-dir',path.join(ROOT,'.ci-scratch/combat-ceiling')));
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
assert.equal(option('--source-sha',sourceSha),sourceSha,'checkout must equal requested head');
const build=verifyRuntimeBuild(site,ROOT,sourceSha);
assert.equal(build.schema,1);assert.equal(hash(JSON.stringify(build.files)),build.inputHash);
const self=fileURLToPath(import.meta.url),selfRelative=path.relative(ROOT,self);
for(const file of [selfRelative,'scripts/lib/inkwave-combat-ceiling-placement.mjs','scripts/lib/inkwave-local-relay-fixture.mjs','scripts/lib/inkwave-runtime-evidence.mjs','scripts/lib/inkwave-projectile-http-file.mjs','server/src/index.js']){
 const actual=execFileSync('git',['hash-object','--',file],{cwd:ROOT,encoding:'utf8'}).trim();
 const expected=execFileSync('git',['rev-parse',sourceSha+':'+file],{cwd:ROOT,encoding:'utf8'}).trim();
 assert.equal(actual,expected,'QA/relay source must match head: '+file);
}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const errors=[],wire=[],loaded=new Set(),contexts=[],pages=[];
const report={schema:1,status:'running',sourceSha,inputHash:build.inputHash,contentHash:build.contentHash,
 harnessHash:hash(fs.readFileSync(self)),scenario:'native-shooter-220-reject-36-accept',
 scope:'Full native Game/Actor/Projectiles/NetMatch; deterministic native component steps after online startup; no Actor damage or receiver admission replacement',
 phase:'initialization'};
let server,relay,browser;
try {
 server=http.createServer((req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
   const file=fs.realpathSync(path.resolve(site,name));
   if(!file.startsWith(fs.realpathSync(site)+path.sep)||!fs.statSync(file).isFile())throw Error('Not in build');
   serveProjectileCaptureFile(req,res,file,mime);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>relay.once('listening',resolve));
 const connect=createLocalRelay({rooms:new Map()});
 relay.on('connection',(ws,req)=>{void connect(ws,req,{receive:text=>{if(wire.length<4096)wire.push({at:Date.now(),text});else errors.push('wire receipt overflow');}}).then(receipt=>{(report.relayAdmissions||=[]).push(receipt);}).catch(error=>errors.push('relay: '+String(error)));});
 const base='http://127.0.0.1:'+server.address().port;
 const relayURL='ws://127.0.0.1:'+relay.address().port;
 const address=base+'/?map=tidewater&difficulty=normal&skipTitle&relay='+encodeURIComponent(relayURL);
 const actorURL=base+'/_versions/'+build.build.revision+'/src/game/actor.js';
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks','--disable-background-timer-throttling','--disable-renderer-backgrounding','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.phase='native-menu';
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});contexts.push(context);
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push('player'+i+': '+e.message));
  page.on('requestfailed',r=>errors.push('player'+i+': '+r.url()+': '+r.failure()?.errorText));
  await page.addInitScript(installCombatPlacementQA);
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,matchLength:180,lastStage:'tidewater',lastMode:'turf'})));
  await page.route(base+'/**',async route=>{
   const response=await route.fetch(),body=await response.body(),key=decodeURIComponent(new URL(response.url()).pathname).slice(1)||'index.html';
   if(build.artifacts[key])assert.equal(hash(body),build.artifacts[key],'served artifact '+key);
   loaded.add(key);await route.fulfill({response,body});
  });
  await page.goto(address,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>{if(document.querySelector('#boot-error')?.textContent)throw Error('Native boot error');const G=window.__G,g=window.__inkwave;return !!G&&!!g&&G.game===g&&G.mode==='menu'&&g.menus&&g.debug&&G.net&&!g._nativeStageSwitchPending&&!g.frozen;},null,{timeout:180000});
 }
 const [host,guest]=pages;
 report.phase='native-room-start';
 const code=await host.evaluate(()=>__G.net.create('Ceiling QA Host'));
 await guest.evaluate(code=>__G.net.join(code,'Ceiling QA Guest'),code);
 await Promise.all(pages.map(p=>p.waitForFunction(()=>__G.net.lobby.players.length===2)));
 const owners=await Promise.all(pages.map(p=>p.evaluate(()=>__G.net.myId)));
 await guest.evaluate(()=>__G.net.setMe({weapon:'shooter'}));
 await host.evaluate(({owners})=>{const n=__G.net;n.setMe({weapon:'shooter'});n.setSettings({map:'tidewater',mode:'turf',bots:false});n.assignTeam(owners[0],0);n.assignTeam(owners[1],1);},{owners});
 await Promise.all(pages.map(p=>p.waitForFunction(()=>{const l=__G.net.lobby;return l.players.length===2&&l.players.every(x=>x.weapon==='shooter')&&!l.bots&&l.map==='tidewater'&&l.mode==='turf'&&new Set(l.players.map(x=>x.team)).size===2;})));
 assert.equal(await host.evaluate(()=>__G.net.confirmTeams()),true);
 await guest.waitForFunction(()=>__G.net.lobby.teamsConfirmed===true);
 await guest.evaluate(()=>__G.net.setMe({ready:true}));await host.evaluate(()=>__G.net.setMe({ready:true}));
 await host.waitForFunction(()=>__G.net.canStart());assert.equal(await host.evaluate(()=>__G.net.start()),true);
 await Promise.all(pages.map(p=>p.waitForFunction(()=>{const G=__G,g=__inkwave,m=g.match,n=G.net;return G.mode==='match'&&m===G.match&&m?.state==='playing'&&!m.attract&&m.local?.isLocal&&m.controller&&n.active&&n._setupReady&&G.netm===n.match&&G.netm.match===m&&m.actors.length===2;},null,{timeout:240000})));
 report.phase='native-actor-placement';
 report.roles=await Promise.all(pages.map(p=>p.evaluate(async url=>{
  const {Actor}=await import(url),G=__G,n=G.netm;__inkwave.debug.freeze();
  const actors=G.match.actors.map(a=>{if(!(a instanceof Actor)||a.damage!==Actor.prototype.damage||a.weapon.id!=='shooter'||a.weapon.damage!==36)throw Error('Native Actor/shooter identity failed');return {nid:a.nid,owner:a.owner,remote:a.remote,team:a.team,weapon:a.weapon.id,damage:a.weapon.damage};});
  window.__ceilingOriginalDamage=new Map(G.match.actors.map(a=>[a,a.damage]));
  return {myId:n.myId,isHost:n.isHost,local:G.match.local.nid,actors};
 },actorURL)));
 assert.equal(report.roles[0].isHost,true);assert.equal(report.roles[1].isHost,false);
 const attacker=report.roles[1].local,victim=report.roles[0].local,attackerOwner=owners[1];
 const placement=await host.evaluate(()=>__ceilingPlacement.select());
 report.placement=placement;
 await Promise.all(pages.map(p=>p.evaluate(({attacker,placement})=>{
  const G=__G,V=G.camera.position.constructor;G.projectiles.clear();
  for(const a of G.match.actors){
   if(a.remote)continue;
   const pos=placement[a.nid===attacker?0:1],other=placement[a.nid===attacker?1:0];
   a.spawnAt(new V(...pos),Math.atan2(other[0]-pos[0],other[2]-pos[2]));
   // Mark the QA relocation exactly as a native teleport. Peers must receive
   // and sample it through the unchanged production 20Hz owner snapshots.
   a.netTp=(a.netTp||0)+1;
   a.invuln=0;a.grounded=true;a.kidT=99;a.ink=100;a.intent.move.set(0,0,0);
   for(const k of ['fire','jump','squid','sub','special']){a.intent[k]=false;a._prevIntent[k]=false;}
   a.aimDir.set(other[0]-pos[0],other[1]-pos[1],other[2]-pos[2]).normalize();a.aimYaw=a.yaw;a.aimPitch=0;
   a.aimPoint.set(...other).add(new V(0,1.05,0));a.weaponRunner.reset();
   a.character.root.position.copy(a.pos);a.character.root.rotation.y=a.yaw;a.character.root.updateMatrixWorld(true);
  }
  G.scene.updateMatrixWorld(true);
 },{attacker,placement})));
 const step=async({realtime=false}={})=>{await Promise.all(pages.map(p=>p.evaluate(({attacker,victim,placement})=>{
  const G=__G,dt=1/60;G.time+=dt;G.net.update(dt);
  for(const a of G.match.actors){
   if(a.remote)G.netm.applyRemote(a,dt);
   else {
    if(window.__ceilingFirePending&&a.nid===attacker)window.__ceilingShot.preShotAim=__ceilingPlacement.aim({attacker,victim,requested:placement});
    const ink=a.ink;
    a.update(dt);
    // Advance the real first-shot delay, pose and firing owner. Stop holding
    // after its first paid round so this remains exactly one native shot.
    if(window.__ceilingFirePending&&a===G.match.local&&a.ink<ink-1e-8){
     window.__ceilingFirePending=false;a.intent.fire=false;
     window.__ceilingEmission={beforeInk:ink,afterInk:a.ink,at:G.time};
     const q=window.__ceilingShot,rounds=G.projectiles.list.filter(p=>p.owner===a&&!p.ghost);
     if(!q||q.first||rounds.length!==1)throw Error('Expected one actual owned projectile at paid emission');
     q.first=rounds[0];
     const p=q.first,v=G.netm.byNid.get(victim);
     q.initial={beforeInk:ink,afterInk:a.ink,at:G.time,pos:p.pos.toArray(),velocity:p.vel.toArray(),
       age:p.age,life:p.life,attacker:a.pos.toArray(),victim:v.pos.toArray(),victimSmoothY:v.smoothY,
       aimPoint:a.aimPoint.toArray(),aimDir:a.aimDir.toArray(),playerRadius:p.inkPlayerRadius,
       preShotAim:q.preShotAim,
       launchComparisonScope:'Origin difference is measured; velocityAngle includes native aim correction, ballistic correction and spread, not just muzzle shift',
       launchVsAim:__ceilingPlacement.compareShot(q.preShotAim,p.pos.toArray(),p.vel.toArray()),
       actualOriginLOS:G.physics.los(p.pos,new G.camera.position.constructor(...q.preShotAim.target))};
    }
   }
  }
  G.projectiles.update(dt);
 },{attacker,victim,placement})));await new Promise(resolve=>setTimeout(resolve,realtime?1000/60:0));};
 const placementAdvance=await advanceUntilNativePlacement({step:()=>step({realtime:true}),inspect:async()=>{
  const settled=await Promise.all(pages.map(p=>p.evaluate(({attacker,victim,placement})=>
   __ceilingPlacement.inspect({attacker,victim,requested:placement}),{attacker,victim,placement})));
  for(let i=0;i<2;i++)assert(Math.hypot(...settled[0].points[i].map((v,k)=>v-settled[1].points[i][k]))<=.05,'Both peers must agree on the settled native positions');
  return settled;
 }});
 report.placementAdvance={steps:placementAdvance.steps};report.settled=placementAdvance.settled;
 for(let i=0;i<2;i++)assert(Math.hypot(...report.settled[0].points[i].map((v,k)=>v-report.settled[1].points[i][k]))<=.05,'Both peers must agree on the settled native positions');
 report.aim=await guest.evaluate(({attacker,victim,placement})=>__ceilingPlacement.aim({attacker,victim,requested:placement}),{attacker,victim,placement});
 report.phase='arm-packet-observers';
 await guest.evaluate(({attacker,victim})=>{
  const G=__G,n=G.netm,tr=n.s.tr,send=tr.sendTo;
  // Observe one real round without replacing collision, damage, or admission.
  const system=G.projectiles,flight=system.inkFlight,step=system._step,impact=flight.impact;
  const shot=window.__ceilingShot={system,flight,step,impact,first:null,initial:null,removal:null,steps:0};
  flight.impact=function(p,hit){if(p===shot.first&&!shot.removal)shot.removal={reason:'world-impact',at:G.time,
   point:hit.point?.toArray(),normal:hit.normal?.toArray(),face:hit.face,block:hit.block,age:p.age};
   return impact.apply(this,arguments);};
  system._step=function(p,dt){const watched=p===shot.first;if(watched)shot.steps++;
   const done=step.apply(this,arguments);
   if(watched&&done&&!shot.removal)shot.removal={reason:p._netHitActor?'actor-contact':p.age+1e-9>=p.life?'lifetime':'other-native-removal',
    at:G.time,pos:p.pos.toArray(),age:p.age,life:p.life};
   return done;};
  const originalMessage=n.onMessage;
  const q=window.__ceilingGuest={tr,send,n,originalMessage,acks:[],packet:null,to:null,count:0};
  n.onMessage=function(from,p){const result=originalMessage.apply(this,arguments);if(p?.k==='hit_ack'&&p.a===attacker&&p.v===victim)q.acks.push({from,packet:structuredClone(p)});return result;};
  tr.sendTo=function(to,p){
   if(p?.k==='hit'&&p.a===attacker&&p.v===victim){
    q.count++;if(q.count!==1||p.d!==36)throw Error('Expected exactly one real near-hit 36');
    q.packet=structuredClone(p);q.to=to;return true;
   }
   return send.apply(this,arguments);
  };
 },{attacker,victim});
 await host.evaluate(({attacker,victim,attackerOwner})=>{
  const n=__G.netm,v=n.byNid.get(victim),original=n.onMessage;
  if(v.hp!==100||v.invuln!==0||v.remote||n.byNid.get(attacker).owner!==attackerOwner)throw Error('Wrong receiving owner/health');
  const serial=value=>JSON.parse(JSON.stringify(value??null,(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?[...v]:v));
  const snapshot=()=>{const peer=n.peers.get(attackerOwner);return {hp:v.hp,life:v.netLife,alive:v.alive,local:!v.remote,attackerOwner:n.byNid.get(attacker).owner,proofs:(n._combatProvenance?.proofs.get(attackerOwner)||[]).map(p=>({key:p.key,actor:p.actor,at:p.at,kind:p.kind,uses:p.uses,maxUses:p.maxUses})),pending:n._combatProvenance?.pending.get(attackerOwner)?.length||0,dedupe:serial({lastHit:peer?.lastHit,hitSequences:peer?.hitSequences,hitSequenceSlots:peer?.hitSequenceSlots})};};
  const q=window.__ceilingHost={n,original,rows:[],snapshot};
  n.onMessage=function(from,p){const watched=from===attackerOwner&&p?.k==='hit'&&p.a===attacker&&p.v===victim;const before=watched?snapshot():null;const at=performance.now()/1000;const result=original.apply(this,arguments);if(watched)q.rows.push({from,at,packet:structuredClone(p),before,after:snapshot()});return result;};
 },{attacker,victim,attackerOwner});
 report.phase='real-projectile-contact';
 await guest.evaluate(()=>{const a=__G.match.local;window.__ceilingFirePending=true;window.__ceilingEmission=null;a.intent.fire=true;});
 let captured=false,shotTicks=0;
 for(let i=0;i<60;i++){await step();shotTicks++;captured=await guest.evaluate(()=>!!__ceilingGuest.packet);if(captured)break;}
 report.emission=await guest.evaluate(()=>({emission:window.__ceilingEmission,pending:window.__ceilingFirePending,ink:__G.match.local.ink,firstRemaining:__G.match.local.weaponRunner.s3ShooterFirstRemaining,projectiles:__G.projectiles.list.length}));
 report.shot=await guest.evaluate(()=>{const q=__ceilingShot;return {initial:q.initial,removal:q.removal,steps:q.steps};});
 assert(captured,'Native projectile never authored a 36 hit packet');
 assert(report.emission.emission&&report.emission.pending===false,'Exactly one native paid round must finish the firing request');
 report.heldPacket=await guest.evaluate(()=>__ceilingGuest.packet);
 report.phase='await-native-shot-proof';
 // Fire is already released. Preserve the same held packet while normal
 // update() flushes the birth/fire queue on its own 20Hz schedule.
 const hasProof=()=>host.evaluate(({attackerOwner,attacker})=>
  (__G.netm._combatProvenance?.proofs.get(attackerOwner)||[]).some(p=>p.actor===attacker&&p.kind==='main'&&p.uses<p.maxUses),{attackerOwner,attacker});
 report.proofAdvance=await advanceUntilNativeShotProof({step,hasProof,remainingSteps:60-shotTicks});
 await host.waitForFunction(({attackerOwner,attacker})=>(__G.netm._combatProvenance?.proofs.get(attackerOwner)||[]).some(p=>p.actor===attacker&&p.kind==='main'&&p.uses<p.maxUses),{attackerOwner,attacker},{timeout:2000});
 const preserved=await guest.evaluate(()=>({packet:__ceilingGuest.packet,count:__ceilingGuest.count,
  pending:__ceilingFirePending,fire:__G.match.local.intent.fire,emission:__ceilingEmission}));
 assert.deepEqual(preserved.packet,report.heldPacket,'Network advance must retain the same captured native hit');
 assert.equal(preserved.count,1,'Network advance must not create another hit');
 assert.equal(preserved.pending,false);assert.equal(preserved.fire,false);
 assert.deepEqual(preserved.emission,report.emission.emission,'Network advance must not create another paid round');
 report.proofCount=await host.evaluate(({attackerOwner,attacker})=>
  (__G.netm._combatProvenance?.proofs.get(attackerOwner)||[]).filter(p=>p.actor===attacker&&p.kind==='main').length,{attackerOwner,attacker});
 assert.equal(report.proofCount,1,'Exactly one real main-shot proof must arrive');
 assert.equal(report.heldPacket.d,36);
 assert(Number.isSafeInteger(report.heldPacket.h)&&report.heldPacket.h>0);
 assert(Number.isSafeInteger(report.heldPacket.seq)&&report.heldPacket.seq>0);
 assert(Array.isArray(report.heldPacket.bg)&&report.heldPacket.bg.length===7&&report.heldPacket.bg.every(Number.isFinite),'Native collision geometry required');
 assert(report.heldPacket.bg[6]>=0&&report.heldPacket.bg[6]<=10);
 report.phase='reject-220';
 await guest.evaluate(()=>{const q=__ceilingGuest;q.send.call(q.tr,q.to,{...q.packet,d:220});});
 await host.waitForFunction(()=>__ceilingHost.rows.length===1,null,{timeout:2000});
 const rejected=await host.evaluate(()=>__ceilingHost.rows[0]);report.rejected=rejected;
 assert.equal(rejected.before.hp,100);assert.equal(rejected.after.hp,100);
 assert.equal(rejected.from,attackerOwner);assert.equal(rejected.before.attackerOwner,attackerOwner);
 assert.equal(rejected.before.life,rejected.packet.l);assert(rejected.before.alive&&rejected.before.local);
 assert(rejected.before.proofs.some(p=>p.actor===attacker&&p.kind==='main'&&p.uses<p.maxUses&&rejected.at-p.at>=0&&rejected.at-p.at<=3.5),'Fresh native shot proof required');
 assert.deepEqual(rejected.after.dedupe,rejected.before.dedupe,'Oversize claim reserved hit ID');
 assert.deepEqual(rejected.after.proofs,rejected.before.proofs,'Oversize claim consumed proof');
 assert.equal(rejected.after.pending,rejected.before.pending,'Oversize claim queued');
 assert(!(rejected.before.dedupe.hitSequences||[]).includes(rejected.packet.h),'Hit ID must be fresh before oversize rejection');
 assert.equal(await guest.evaluate(()=>__ceilingGuest.acks.length),0,'Rejected oversize claim must not ACK');
 report.phase='accept-same-id-36';
 await guest.evaluate(()=>{const q=__ceilingGuest;q.send.call(q.tr,q.to,q.packet);});
 await host.waitForFunction(()=>__ceilingHost.rows.length===2,null,{timeout:2000});
 const accepted=await host.evaluate(()=>__ceilingHost.rows[1]);report.accepted=accepted;
 await guest.waitForFunction(()=>__ceilingGuest.acks.length===1,null,{timeout:2000});
 report.acks=await guest.evaluate(()=>__ceilingGuest.acks);
 assert.equal(accepted.before.hp,100);assert.equal(accepted.after.hp,64);
 assert.equal(accepted.from,attackerOwner);assert.equal(accepted.before.life,accepted.packet.l);
 assert(accepted.before.proofs.some(p=>p.actor===attacker&&p.kind==='main'&&p.uses<p.maxUses&&accepted.at-p.at>=0&&accepted.at-p.at<=3.5),'Same fresh shot proof must remain usable');
 assert.deepEqual({...rejected.packet,d:36},accepted.packet,'Only damage may differ; h/seq/bg must be identical');
 const increments=accepted.after.proofs.map(p=>p.uses-(accepted.before.proofs.find(b=>b.key===p.key)?.uses??0));
 assert.equal(increments.reduce((a,b)=>a+b,0),1,'Exactly one shot proof must be consumed');
 assert.equal(accepted.after.pending,0,'Valid hit left pending');
 assert.deepEqual(accepted.before.proofs,rejected.after.proofs,'No new firing or substituted proof between claims');
 assert.deepEqual([...(accepted.before.dedupe.hitSequences||[]),accepted.packet.h].sort((a,b)=>a-b),[...(accepted.after.dedupe.hitSequences||[])].sort((a,b)=>a-b),'Only this hit ID may be admitted');
 assert.equal(accepted.after.dedupe.lastHit,Math.max(accepted.before.dedupe.lastHit||0,accepted.packet.h));
 assert.equal(accepted.after.dedupe.hitSequenceSlots.filter(([,h])=>h===accepted.packet.h).length,1);
 const ack=report.acks[0];assert.equal(ack.from,owners[0]);
 for(const key of ['m','h','a','v'])assert.equal(ack.packet[key],accepted.packet[key],'ACK '+key);
 assert.equal(ack.packet.d,36);assert.equal(ack.packet.hp,64);assert.equal(ack.packet.vl,accepted.packet.l);
 report.damageUnchanged=await Promise.all(pages.map(p=>p.evaluate(()=>[...__ceilingOriginalDamage].every(([a,fn])=>a.damage===fn))));
 assert(report.damageUnchanged.every(Boolean));
 assert.equal(errors.length,0,JSON.stringify(errors));
 assert.equal(report.relayAdmissions?.length,2);assert(report.relayAdmissions.every(x=>x.status===101&&x.accepted===true),'Both browsers must enter the production relay');
 report.status='passed';report.phase='complete';
} catch(error) {
 report.status='failed';report.error=String(error.stack||error);process.exitCode=1;
 try{if(pages[1])report.shot=await pages[1].evaluate(()=>{const q=window.__ceilingShot;return q?{initial:q.initial,removal:q.removal,steps:q.steps}:null;});}catch{}
 try{if(pages[1])report.placementDiagnostic=await pages[1].evaluate(()=>{
  const G=window.__G,n=x=>Number.isFinite(x)?x:null,xyz=p=>p?[n(p.x),n(p.y),n(p.z)]:null;
  return {bounds:G?.level?.bounds?Object.fromEntries(['minX','maxX','minZ','maxZ'].map(k=>[k,n(G.level.bounds[k])])):null,
   spawnBarrier:n(G?.level?.spawnBarrier),spawnPads:(G?.level?.spawnPads||[]).slice(0,2).map(xyz),
   actors:(G?.match?.actors||[]).slice(0,2).map(a=>({local:a.isLocal===true,remote:a.remote===true,
    alive:a.alive===true,grounded:a.grounded===true,form:['kid','squid'].includes(a.form)?a.form:'other',pos:xyz(a.pos)}))};
 });}catch{}
} finally {
 report.errors=errors;report.loadedArtifacts=[...loaded];report.wire=wire;
 for(const page of pages){
  try{await page.evaluate(()=>{const g=window.__ceilingGuest,h=window.__ceilingHost,s=window.__ceilingShot;if(s){s.system._step=s.step;s.flight.impact=s.impact;}if(g){g.tr.sendTo=g.send;g.n.onMessage=g.originalMessage;}if(h)h.n.onMessage=h.original;});}
  catch(e){(report.cleanupErrors||=[]).push(String(e));}
 }
 // Persist before closing sockets/browser, so a cleanup failure cannot erase evidence.
 fs.writeFileSync(path.join(evidence,'combat-ceiling-browser-result.json'),JSON.stringify(report,null,2)+'\n');
 for(const c of contexts)try{await c.close();}catch(e){(report.cleanupErrors||=[]).push(String(e));}
 try{await browser?.close();}catch(e){(report.cleanupErrors||=[]).push(String(e));}
 if(relay){for(const ws of relay.clients)ws.terminate();await new Promise(resolve=>relay.close(resolve));}
 if(server)await new Promise(resolve=>server.close(resolve));
 if(report.cleanupErrors?.length||errors.length){report.status='failed';process.exitCode=1;}
 fs.writeFileSync(path.join(evidence,'combat-ceiling-browser-result.json'),JSON.stringify(report,null,2)+'\n');
}
// Keep CI failure diagnosis useful when the artifact archive is unavailable.
// Only fixed error labels and numeric emission state reach stdout; never wire data.
const failure = report.status === 'failed' ? {
 error: ['Native projectile never authored a 36 hit packet',
  'Exactly one native paid round must finish the firing request',
  'Expected exactly one real near-hit 36',
  'Expected one actual owned projectile at paid emission',
  'Combat placement: missing level bounds',
  'Combat placement: no neutral playable pair with a clear stage path',
  'Combat placement: Actors must be alive grounded kids',
  'Combat placement: inside spawn barrier or nonfinite position',
  'Combat placement: settled separation is not 2m',
  'Combat placement: native settle moved selected placement',
  'Combat placement: settled muzzle path blocked by stage',
  'Combat placement: nonfinite settled aim',
  'Combat placement: nonfinite shot comparison',
  'Combat placement: zero shot comparison direction'].find(message => report.error?.includes(message))
  || (report.error?.includes('Timeout') ? 'timeout' : 'other-error-see-artifact'),
 emission: report.emission ? {
  pending: report.emission.pending === true,
  ink: Number.isFinite(report.emission.ink) ? report.emission.ink : null,
  firstRemaining: Number.isFinite(report.emission.firstRemaining) ? report.emission.firstRemaining : null,
  projectiles: Number.isFinite(report.emission.projectiles) ? report.emission.projectiles : null,
  paidRound: !!report.emission.emission,
 } : null,
 shot: report.shot ? {
  reason: ['world-impact','actor-contact','lifetime','other-native-removal'].includes(report.shot.removal?.reason) ? report.shot.removal.reason : null,
  steps: Number.isSafeInteger(report.shot.steps)&&report.shot.steps>=0 ? report.shot.steps : null,
  initialInk: Number.isFinite(report.shot.initial?.afterInk) ? report.shot.initial.afterInk : null,
  initialHeight: Number.isFinite(report.shot.initial?.pos?.[1]) ? report.shot.initial.pos[1] : null,
  removalAge: Number.isFinite(report.shot.removal?.age) ? report.shot.removal.age : null,
  originDistance: Number.isFinite(report.shot.initial?.launchVsAim?.originDistance) ? report.shot.initial.launchVsAim.originDistance : null,
  velocityAngle: Number.isFinite(report.shot.initial?.launchVsAim?.velocityAngle) ? report.shot.initial.launchVsAim.velocityAngle : null,
 } : null,
 proofAdvance: report.proofAdvance ? {
  steps: Number.isSafeInteger(report.proofAdvance.steps)&&report.proofAdvance.steps>=0 ? report.proofAdvance.steps : null,
  ready: report.proofAdvance.ready===true,
 } : null,
 placement: report.placementDiagnostic||null,
 browserErrorCount: errors.length,
} : undefined;
console.log(JSON.stringify({status:report.status,sourceSha,phase:report.phase,evidence,failure}));

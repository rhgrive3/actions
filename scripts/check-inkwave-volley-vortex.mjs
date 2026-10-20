#!/usr/bin/env node
// Built native Actor/Projectiles/NetMatch/Transport with three browser clients.
// Display/audio/world collision are controlled; this is not retail evidence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
import {persistVolleyFailure,cleanupVolleyResources,boundedVolleySnapshot} from './lib/inkwave-volley-failure-evidence.mjs';
const site=path.resolve(process.argv[2]||'_site'), engines=process.argv.includes('--webkit')?['chromium','webkit']:['chromium'];
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
for(const [file,digest] of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe'){
    res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><body></body></html>');return;
  }
  const file=path.resolve(site,'.'+url.pathname);
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>relay.once('listening',r));
const rooms=new Map(),wire=[],withheld=[];
const connectRelay=createLocalRelay({rooms});
relay.on('connection',(ws,req)=>connectRelay(ws,req,{send:(text,deliver)=>{if(new URL(req.url,'http://localhost').searchParams.get('name')==='Delay'&&text.includes('"welcome"'))withheld.push({ws,text});else deliver(text);},receive:text=>wire.push(text)}));
const address=`http://127.0.0.1:${server.address().port}/probe?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const results=[];let browser,primaryError=null;
const evidenceArg=process.argv.indexOf('--evidence-dir');
const evidence=path.resolve(evidenceArg>=0?process.argv[evidenceArg+1]:process.env.CI_STORAGE?path.join(process.env.CI_STORAGE,'evidence/volley-vortex'):'.dev-state/volley-vortex');
let activeEngine=null,phase='launch',client=null,activePages=[];
const pageErrors=[],consoleErrors=[],failedRequests=[],badResponses=[];
const record=(list,item)=>{list.push(item);if(list.length>64)list.shift();};
try{
 for(const engine of engines){
  activeEngine=engine;phase='launch';client=null;
  browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks']}: {})});
  const pages=[],errors=[];activePages=pages;
  for(let i=0;i<3;i++){
   client=i;phase='client initialization';
   const page=await browser.newPage();pages.push(page);
   page.on('pageerror',e=>{errors.push(e.message);record(pageErrors,{engine,client:i,message:String(e.message).slice(0,2000)});});
   page.on('console',m=>{if(m.type()==='error'){console.error(m.text());record(consoleErrors,{engine,client:i,message:m.text().slice(0,2000)});}});
   // Only request paths are retained, never URLs with credentials/query data.
   page.on('requestfailed',r=>record(failedRequests,{engine,client:i,path:new URL(r.url()).pathname,error:String(r.failure()?.errorText||'').slice(0,1000)}));
   page.on('response',r=>{if(r.status()>=400)record(badResponses,{engine,client:i,path:new URL(r.url()).pathname,status:r.status()});});
   await page.goto(address);
   await page.evaluate(async()=>{
    const THREE=await import('three'),ctx=await import('/src/core/ctx.js'),{Actor}=await import('/src/game/actor.js'),{Projectiles}=await import('/src/game/weapons.js'),{NetSession}=await import('/src/net/session.js');
    const {install}=await import('/patches/splatoon3/runtime/install.mjs');install(await fetch('/patches/splatoon3/profile.json').then(r=>r.json()));
    globalThis.hit=(await import('/patches/splatoon3/runtime/weapons.mjs')).applyProjectileHit;
    globalThis.vac=await import('/patches/splatoon3/runtime/kit-ink-vac.mjs');
    const {G}=ctx;globalThis.G=G;globalThis.clock=0;Object.defineProperty(performance,'now',{value:()=>clock});
    G.time=0;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8800'),new THREE.Color('#0033ff')];
    G.level={blocks:[],groundHeight:()=>0};G.physics={los:()=>true,raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;}};
    G.paint={sample:()=>0,splat:()=>0};G.projectiles=new Projectiles(G.scene);
    class Display{constructor(a){this.actor=a;this.root=new THREE.Group();}_owner(){return this.actor;}_runner(){return this.actor.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new THREE.Vector3(0,1,0));}}
    G.game={profile:{weapon:'slosher'},settings:{},menus:{launchLobby:async()=>{}},
      async startNetMatch(cfg,nm){
       G.actors=cfg.roster.map(r=>{const a=new Actor({team:r.team,name:'probe',weapon:r.weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{owner:r.owner,nid:r.nid});a.netLife=1;a.grounded=true;a.ground.hit=true;a.ground.face=0;a._spawnBarrier=()=>{};a._integrate=()=>{};a._finishFrame=()=>{};a.pos.set(r.nid===1?0:30,0,r.nid===1?5:0);return a;});
       G.local=G.actors.find(a=>a.owner===G.net.myId);G.local.isLocal=true;
       G.match=this.match={actors:G.actors,state:'init',time:180,playing:()=>true,canRespawn:()=>false};nm.bind(G.match);
       globalThis.births=[];const ghost=G.projectiles.ghostProjectile.bind(G.projectiles);
       G.projectiles.ghostProjectile=(a,e)=>{const p=ghost(a,e);if(p?.type==='slosh')births.push({delay:p.delay,index:p.fidelitySloshPacketIndex,unit:p.fidelitySloshIndex,pos:p.start.toArray()});return p;};
      },netMatchGo(){G.match.state='playing';},netMatchAborted(){}};
    G.net=new NetSession();globalThis.step=()=>{clock+=1000/60;G.time+=1/60;G.net.update(1/60);};
   });
  }
  phase='room admission';client=null;
  const [host,guest,observer]=pages,code=await host.evaluate(()=>G.net.create('Owner'));
  await guest.evaluate(code=>G.net.join(code,'Victim'),code);await observer.evaluate(code=>G.net.join(code,'Observer'),code);
  phase='three-client membership';
  await host.waitForFunction(()=>G.net._members.size===3);
  const owners=await Promise.all(pages.map(p=>p.evaluate(()=>G.net.myId)));
  const cfg={...await host.evaluate(async()=>{const {PROTO,COMPAT}=await import('/src/net/transport.js');return {proto:PROTO,compat:COMPAT};}),id:engine+'-volley-vortex',map:'',mode:'turf',roster:owners.map((owner,nid)=>({owner,nid,team:nid===1?1:0,slot:nid===2?1:0,weapon:'slosher',bot:false}))};
  phase='match begin';
  await Promise.all(pages.map(p=>p.evaluate(cfg=>G.net._begin(cfg),cfg)));
  assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>G.net._setupReady))),[true,true,true]);
  phase='match playing';
  await host.evaluate(()=>G.net._go());await Promise.all(pages.map(p=>p.waitForFunction(()=>G.match?.state==='playing')));
  const frames=async n=>{for(let i=0;i<n;i++){await Promise.all(pages.map(p=>p.evaluate(()=>step())));await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,0)))));}};
  phase='volley replication';
  await frames(12);
  assert.equal(await host.evaluate(()=>{G.projectiles.fireSlosh(G.local,G.local.weapon);globalThis.volley=G.projectiles.list.at(-1);return G.netm.out.filter(e=>e[1]==='p').length;}),0);
  for(let i=0;i<14;i++){await host.evaluate(()=>{G.local.pos.x+=.02;G.local.grounded=G.time<.3;G.projectiles.update(1/60);});await frames(1);}
  await frames(30);
  for(const p of [guest,observer]){const births=await p.evaluate(()=>globalThis.births);assert.equal(births.length,9);assert.deepEqual(births.map(x=>x.index),[0,1,2,3,4,5,6,7,8]);assert(births.every(x=>x.delay===0));}
  phase='volley damage';
  for(const damage of [30.39,34.31,34.31])await host.evaluate(d=>hit(G.projectiles,volley,G.actors[1],d,G.actors[1].pos),damage);
  phase='victim damage acceptance';
  await guest.waitForFunction(()=>Math.abs(G.local.hp-65.7)<1e-8);
  await Promise.all(pages.map(p=>p.evaluate(()=>{G.projectiles.clear();G.actors[0].pos.set(0,0,0);G.actors[1].pos.set(0,0,30);G.actors[0].aimDir.set(0,0,1);}))); 
  phase='ink vac startup';
  await host.evaluate(()=>{G.local.setWeapon('charger');G.local.special=G.local.specialCost();G.local._startSpecial();G.local.intent.fire=true;});
  await frames(25);await guest.waitForFunction(()=>vac.inkVacState(G.actors[0])?.phase==='inhale');
  await Promise.all(pages.map(p=>p.evaluate(()=>{G.actors[1].hp=100;G.actors[1].ink=100;})));
  phase='ink vac contact and release';
  // The sourced Ink Vac cone starts at zero length and extends by 0.3334 per 60 Hz frame.
  // Grow it with real Actor updates while the victim is outside the 15 m maximum reach.
  for(let i=0;i<100;i++){
   await host.evaluate(()=>G.local.update(1/60));await guest.evaluate(()=>{ vac.advanceInkVacReplica(G.actors[0],1/60); G.local.update(1/60); });await frames(1);
  }
  assert.equal(await host.evaluate(()=>vac.inkVacState(G.local).absorbedDamage ?? 0),0);
  assert(await host.evaluate(()=>vac.inkVacState(G.local).length>5));
  // This minimal fake Match never calls NetMatch.applyRemote; drive the same replica hook explicitly.
  assert(await guest.evaluate(()=>vac.inkVacState(G.actors[0])?.length>5), 'remote owner cone did not advance in fixture');
  await Promise.all(pages.map(p=>p.evaluate(()=>G.actors[1].pos.set(0,0,5))));
  // From the first contact frame, count exactly 30 real 60 Hz suction updates.
  for(let i=0;i<30;i++){
   await host.evaluate(()=>G.local.update(1/60));await guest.evaluate(()=>{ vac.advanceInkVacReplica(G.actors[0],1/60); G.local.update(1/60); });await frames(1);
  }
  const owner=await host.evaluate(()=>({damage:vac.inkVacState(G.local).absorbedDamage,count:vac.inkVacState(G.local).absorbed,remoteInk:G.actors[1].ink}));
  const victim=await guest.evaluate(()=>({ink:G.local.ink,hp:G.local.hp,replicaDamage:vac.inkVacState(G.actors[0]).absorbedDamage||0}));
  assert(Math.abs(owner.damage-45)<1e-8);assert.equal(owner.count,0);assert.equal(owner.remoteInk,100);
  assert(Math.abs(victim.ink-93.4)<1e-8);assert.equal(victim.hp,100);assert.equal(victim.replicaDamage,0);
  const slow=await guest.evaluate(()=>{const a=G.local;a.intent.move.set(1,0,0);a.vel.set(20,0,0);a._horizontal(1/60,false,false);const inside=a.vel.length();a.pos.z=-5;a.vel.set(20,0,0);a._horizontal(1/60,false,false);return{inside,outside:a.vel.length(),cap:a.weaponRunner.moveSpeed()*.6};});
  assert(slow.inside<=slow.cap+1e-8);assert(slow.outside>slow.cap);
  await host.evaluate(()=>{G.local.intent.fire=false;G.local.update(1/60);});await frames(15);
  await guest.evaluate(()=>vac.advanceInkVacReplica(G.actors[0],1/60));
  assert.equal(await host.evaluate(()=>vac.inkVacState(G.local).length),0,'owner stops on ZR release');
  assert.equal(await guest.evaluate(()=>vac.inkVacState(G.actors[0]).length),0,'replica stops from the delivered held-input snapshot');
  await host.evaluate(()=>vac.disposeInkVac(G.local));await frames(25);
  assert.equal(await guest.evaluate(()=>vac.inkVacActorContact(G.actors[0],G.local)),false);
  assert.deepEqual(errors,[]);results.push({engine,clients:3,births:9,damage:34.3,contact:owner.damage,victimInk:victim.ink});
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({build:build.build.revision,results},null,2));
}catch(error){
 primaryError=error;
 // Persist before any asynchronous teardown; no screenshot/evaluate can advance
 // the failing browser or prevent the original failure from being recorded.
 const detail={sourceSha:process.env.SOURCE_SHA||null,contentHash:build.contentHash,
   revision:build.build.revision,engine:activeEngine,phase,client,results,pageErrors,consoleErrors,failedRequests,badResponses};
 const saved=persistVolleyFailure(evidence,detail,error);
 if(saved.status!=='written')console.error('Volley failure evidence unavailable:',saved.error);
 // Read current values only after the original failure is safely on disk. No
 // simulation ticks, input, retries, screenshots or animation advancement.
 const snapshots=await Promise.all(activePages.map((page,index)=>boundedVolleySnapshot(()=>page.evaluate(()=>{
  const g=globalThis.G,finite=value=>Number.isFinite(value)?value:null;
  const vector=v=>v?{x:finite(v.x),y:finite(v.y),z:finite(v.z)}:null;
  const actor=a=>a?{nid:a.nid??null,owner:a.owner??null,hp:finite(a.hp),ink:finite(a.ink),netLife:a.netLife??null,isLocal:!!a.isLocal,
   remote:a.remote??null,alive:a.alive??null,invuln:finite(a.invuln),position:vector(a.pos),aimDir:vector(a.aimDir),
   weapon:{id:a.weapon?.id??null,kind:a.weapon?.kind??null}}:null;
  const sampleMap=(map,project)=>{
   if(!(map instanceof Map))return null;
   const peers=[];let rowsLeft=8;
   for(const [peer,rows] of map){
    if(peers.length>=8)break;
    const list=Array.isArray(rows)?rows:[],sample=list.slice(0,rowsLeft).map(project);rowsLeft-=sample.length;
    peers.push({peer,count:list.length,sample});
   }
   return {peerCount:map.size,sampledPeers:peers};
  };
  const triple=v=>Array.isArray(v)?v.slice(0,3).map(finite):null;
  const provenance=g?.netm?._combatProvenance;
  const combat=provenance?{
   proofs:sampleMap(provenance.proofs,p=>({actor:p.actor,at:finite(p.at),ts:finite(p.ts),origin:triple(p.origin),unit:triple(p.unit),
    reach:finite(p.reach),cause:p.cause,kind:p.kind,maxUses:finite(p.maxUses),uses:finite(p.uses)})),
   pending:sampleMap(provenance.pending,p=>({type:p.type,at:finite(p.at),claim:p.d?{a:p.d.a,v:p.d.v,d:p.d.d,w:p.d.w,g:p.d.g,h:p.d.h,seq:p.d.seq,l:p.d.l}:null})),
   contactCount:provenance.contacts?.size??null,
  }:null;
  return {clock:finite(globalThis.clock),time:finite(g?.time),matchState:g?.match?.state??null,
   combat,local:actor(g?.local),actors:(g?.actors||[]).slice(0,8).map(actor),
   network:g?.net?{myId:g.net.myId??null,setupReady:g.net._setupReady??null,members:g.net._members?.size??null}:null,
   births:Array.isArray(globalThis.births)?globalThis.births.length:null,
   volley:globalThis.volley?{damageGroup:globalThis.volley.s3DamageGroupId??null,ownerNid:globalThis.volley.owner?.nid??null}:null};
 })).then(snapshot=>({client:index,...snapshot}))));
 const enriched=persistVolleyFailure(evidence,{...detail,snapshots},error);
 if(enriched.status!=='written')console.error('Volley failure snapshot evidence unavailable:',enriched.error);
 throw error;
}finally{
 const cleanupErrors=await cleanupVolleyResources([
  async()=>{if(browser)await browser.close();},
  async()=>{for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));},
  async()=>{await new Promise(r=>server.close(r));},
 ],primaryError);
 for(const error of cleanupErrors)console.error('Volley teardown after original failure:',error);
}


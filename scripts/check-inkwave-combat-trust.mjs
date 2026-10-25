#!/usr/bin/env node
// #1665: built native Actor/Projectiles/NetMatch/Transport with two browser
// clients and the local relay. The attacker fires a real Splattershot round;
// the victim owner's real combat provenance decides each remote hit claim.
// World collision is a controlled wall model on the victim client only, so
// this is runtime-path evidence, not retail Splatoon 3 timing or geometry.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {createLocalRelay} from './lib/inkwave-local-relay-fixture.mjs';
const site=path.resolve(process.argv[2]||'_site'),engines=process.argv.includes('--webkit')?['chromium','webkit']:['chromium'];
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
const connectRelay=createLocalRelay({rooms:new Map()});
relay.on('connection',(ws,req)=>connectRelay(ws,req,{send:(text,deliver)=>deliver(text),receive:()=>{}}));
const address=`http://127.0.0.1:${server.address().port}/probe?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const results=[];let browser;
try{
 for(const engine of engines){
  browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks']}:{})});
  const pages=[],errors=[],missing=new Set();
  for(let i=0;i<2;i++){
   const page=await browser.newPage();pages.push(page);
   // Page exceptions fail the check; missing optional assets are reported.
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)missing.add(new URL(r.url()).pathname);});
   await page.goto(address);
   await page.evaluate(async()=>{
    const THREE=await import('three'),ctx=await import('/src/core/ctx.js'),{Actor}=await import('/src/game/actor.js'),{Projectiles}=await import('/src/game/weapons.js'),{NetSession}=await import('/src/net/session.js');
    const {install}=await import('/patches/splatoon3/runtime/install.mjs');install(await fetch('/patches/splatoon3/profile.json').then(r=>r.json()));
    const {G}=ctx;globalThis.G=G;globalThis.clock=0;Object.defineProperty(performance,'now',{value:()=>clock});
    G.time=0;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8800'),new THREE.Color('#0033ff')];
    // Controlled wall: plane z=6 for |x|<4, y<4, enabled only where a check asks.
    globalThis.wall=false;
    const crosses=(a,b)=>{if(!wall||(a.z-6)*(b.z-6)>=0)return false;const k=(6-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*k,y=a.y+(b.y-a.y)*k;return Math.abs(x)<4&&y<4;};
    G.level={blocks:[],groundHeight:()=>0};
    G.physics={los:(a,b)=>!crosses(a,b),raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;}};
    G.paint={sample:()=>0,splat:()=>0};G.projectiles=new Projectiles(G.scene);
    class Display{constructor(a){this.actor=a;this.root=new THREE.Group();}_owner(){return this.actor;}_runner(){return this.actor.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new THREE.Vector3(0,1.05,.3));}}
    G.game={profile:{weapon:'shooter'},settings:{},menus:{launchLobby:async()=>{}},
      async startNetMatch(cfg,nm){
       G.actors=cfg.roster.map(r=>{const a=new Actor({team:r.team,name:'probe',weapon:r.weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{owner:r.owner,nid:r.nid});a.netLife=1;a.grounded=true;a.ground.hit=true;a.ground.face=0;a._spawnBarrier=()=>{};a._integrate=()=>{};a._finishFrame=()=>{};return a;});
       G.local=G.actors.find(a=>a.owner===G.net.myId);G.local.isLocal=true;
       G.match=this.match={actors:G.actors,state:'init',time:180,playing:()=>true,canRespawn:()=>false};nm.bind(G.match);
      },netMatchGo(){G.match.state='playing';},netMatchAborted(){}};
    G.net=new NetSession();globalThis.step=()=>{clock+=1000/60;G.time+=1/60;G.net.update(1/60);};
    // Same placement on both clients (this fake match never runs applyRemote).
    globalThis.place=(victimX=0,victimZ=10)=>{const [a,v]=G.actors;a.pos.set(0,0,0);v.pos.set(victimX,0,victimZ);a.aimDir.set(victimX,0,victimZ).normalize();a.aimPoint.set(victimX,1,victimZ);G.projectiles.clear();};
   });
  }
  const [host,guest]=pages,code=await host.evaluate(()=>G.net.create('Owner'));
  await guest.evaluate(code=>G.net.join(code,'Victim'),code);
  await host.waitForFunction(()=>G.net._members.size===2);
  const owners=await Promise.all(pages.map(p=>p.evaluate(()=>G.net.myId)));
  const cfg={...await host.evaluate(async()=>{const {PROTO,COMPAT}=await import('/src/net/transport.js');return {proto:PROTO,compat:COMPAT};}),id:engine+'-combat-trust',map:'',mode:'turf',roster:owners.map((owner,nid)=>({owner,nid,team:nid,slot:0,weapon:'shooter',bot:false}))};
  await Promise.all(pages.map(p=>p.evaluate(cfg=>G.net._begin(cfg),cfg)));
  await host.evaluate(()=>G.net._go());await Promise.all(pages.map(p=>p.waitForFunction(()=>G.match?.state==='playing')));
  // BEGIN COMBAT FRAME PACING (exercised verbatim by the CPU regression)
  function createCombatFramePacer(now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
    const started=now();let frame=0;
    return async()=>{const delay=started+(++frame)*1000/60-now();if(delay>0)await wait(delay);};
  }
  // END COMBAT FRAME PACING
  // Browser performance.now() is controlled above, but the real production
  // relay authenticates ticks with Date.now(). Never fast-forward only the
  // owner clock: the fixed relay origin must continue admitting fresh ticks.
  const pace=createCombatFramePacer();
  const frames=async n=>{for(let i=0;i<n;i++){await pace();await Promise.all(pages.map(p=>p.evaluate(()=>step())));await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,0)))));}};
  // Settle longer than the receiver's 1.2 s lag-compensation window, so an
  // earlier placement is no longer a legal past pose of the victim.
  const reset=async(victimX=0,victimZ=10)=>{
    // A wall-rejected claim can remain deferred for 0.95 s. Keep the OLD
    // environment intact until it expires; opening the wall first would turn
    // scenario C's old claim into damage during scenario D's setup.
    const hp=await guest.evaluate(()=>G.local.hp);
    await frames(80);
    assert.equal(await guest.evaluate(()=>G.local.hp),hp,'old scenario cannot gain a late admitted hit while draining');
    const pending=await Promise.all(pages.map(p=>p.evaluate(()=>[...(G.netm._combatProvenance?.pending.values()||[])].reduce((n,items)=>n+items.length,0))));
    assert.deepEqual(pending,[0,0],'old claims must expire before changing collision or restoring HP');
    await Promise.all(pages.map(p=>p.evaluate(([x,z])=>{place(x,z);G.actors[1].hp=100;wall=false;},[victimX,victimZ])));
    await frames(80);
    assert.equal(await guest.evaluate(()=>G.local.hp),100,'new scenario starts without inherited damage');
  };
  await frames(12);

  // A. Genuine round in the open: the victim loses exactly what the owner sent.
  await reset();
  const sent=await host.evaluate(()=>{const out=[];const send=G.netm.sendHit.bind(G.netm);G.netm.sendHit=(a,v,d,w)=>{out.push(d);return send(a,v,d,w);};globalThis.sent=out;
    G.projectiles.fireShooter(G.local,G.local.weapon,0);for(let i=0;i<60&&!out.length;i++)G.projectiles.update(1/60);return out.slice();});
  assert.equal(sent.length,1,'real round reached the remote victim on the owner client');
  await frames(20);
  const genuine=await guest.evaluate(()=>G.local.hp);
  assert(Math.abs(genuine-(100-sent[0]))<.11,`genuine hit applied: hp ${genuine} after ${sent[0]}`);

  // B. Same real round, forged lethal magnitude: rejected by the equipped-slot ceiling.
  await reset();
  await host.evaluate(()=>{G.projectiles.fireShooter(G.local,G.local.weapon,0);G.projectiles.clear();G.netm.sendHit(G.local,G.actors[1],220,G.local.weapon.id);});
  await frames(20);
  assert.equal(await guest.evaluate(()=>G.local.hp),100,'220 claim from a Splattershot is rejected');

  // C. Real round toward a victim the receiver sees behind its wall, then a
  // forged ordinary-size claim (owner client ignoring collision): rejected.
  await reset();
  await guest.evaluate(()=>{wall=true;});
  await host.evaluate(()=>{G.projectiles.fireShooter(G.local,G.local.weapon,0);G.projectiles.clear();G.netm.sendHit(G.local,G.actors[1],36,G.local.weapon.id);});
  await frames(20);
  assert.equal(await guest.evaluate(()=>G.local.hp),100,'occluded straight-fire claim is rejected');

  // D. Positive control for C: the same forged-size claim with the wall away
  // from the line of fire (victim stepped out) is a legal hit and applies.
  // At z=7 and x=5 the actual trajectory crosses the z=6 wall at x=30/7>4,
  // while staying inside the real shooter's reach. The old (9,10) probe was
  // outside the same weapon's effective reach, so no legal hit could follow.
  await reset(5,7);
  await guest.evaluate(()=>{wall=true;});
  assert.equal(await guest.evaluate(()=>G.physics.los(G.actors[0].pos,G.actors[1].pos)),true,'positive control is not behind the controlled wall');
  await host.evaluate(()=>{G.projectiles.fireShooter(G.local,G.local.weapon,0);G.projectiles.clear();G.netm.sendHit(G.local,G.actors[1],36,G.local.weapon.id);});
  await frames(20);
  assert.equal(await guest.evaluate(()=>G.local.hp),64,'visible victim takes the legal 36');
  assert.deepEqual(errors,[]);
  results.push({engine,clients:2,genuineDamage:sent[0],genuineHp:genuine,missing:[...missing]});
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({build:build.build.revision,results},null,2));
}finally{
 if(browser)await browser.close();
 for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));
}

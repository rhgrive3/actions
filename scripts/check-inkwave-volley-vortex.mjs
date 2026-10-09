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
import {RoomDurableObject} from '../server/src/index.js';
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
relay.on('connection',(ws,req)=>{
  const url=new URL(req.url,'http://localhost'),code=url.pathname.split('/')[2],name=url.searchParams.get('name');
  let room=rooms.get(code);if(!room)rooms.set(code,room=new RoomDurableObject({},{}));
  room.handleSession({send(text){if(name==='Delay'&&text.includes('"welcome"'))withheld.push({ws,text});else if(ws.readyState===1)ws.send(text);},
    addEventListener:(name,fn)=>ws.on(name,name==='message'?data=>{wire.push(data.toString());fn({data:data.toString()});}:fn)},name);
});
const address=`http://127.0.0.1:${server.address().port}/probe?relay=${encodeURIComponent('ws://127.0.0.1:'+relay.address().port)}`;
const results=[];let browser;
try{
 for(const engine of engines){
  browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=LocalNetworkAccessChecks']}: {})});
  const pages=[],errors=[];
  for(let i=0;i<3;i++){
   const page=await browser.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.goto(address);
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
  const [host,guest,observer]=pages,code=await host.evaluate(()=>G.net.create('Owner'));
  await guest.evaluate(code=>G.net.join(code,'Victim'),code);await observer.evaluate(code=>G.net.join(code,'Observer'),code);
  await host.waitForFunction(()=>G.net._members.size===3);
  const owners=await Promise.all(pages.map(p=>p.evaluate(()=>G.net.myId)));
  const cfg={id:engine+'-volley-vortex',map:'',mode:'turf',roster:owners.map((owner,nid)=>({owner,nid,team:nid===1?1:0,weapon:'slosher',bot:false}))};
  await Promise.all(pages.map(p=>p.evaluate(cfg=>G.net._begin(cfg),cfg)));
  assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>G.net._setupReady))),[true,true,true]);
  await host.evaluate(()=>G.net._go());await Promise.all(pages.map(p=>p.waitForFunction(()=>G.match?.state==='playing')));
  const frames=async n=>{for(let i=0;i<n;i++){await Promise.all(pages.map(p=>p.evaluate(()=>step())));await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(r=>setTimeout(r,0)))));}};
  await frames(12);
  assert.equal(await host.evaluate(()=>{G.projectiles.fireSlosh(G.local,G.local.weapon);globalThis.volley=G.projectiles.list.at(-1);return G.netm.out.filter(e=>e[1]==='p').length;}),0);
  for(let i=0;i<14;i++){await host.evaluate(()=>{G.local.pos.x+=.02;G.local.grounded=G.time<.3;G.projectiles.update(1/60);});await frames(1);}
  await frames(30);
  for(const p of [guest,observer]){const births=await p.evaluate(()=>globalThis.births);assert.equal(births.length,9);assert.deepEqual(births.map(x=>x.index),[0,1,2,3,4,5,6,7,8]);assert(births.every(x=>x.delay===0));}
  for(const damage of [30.39,34.31,34.31])await host.evaluate(d=>hit(G.projectiles,volley,G.actors[1],d,G.actors[1].pos),damage);
  await guest.waitForFunction(()=>Math.abs(G.local.hp-65.7)<1e-8);
  await Promise.all(pages.map(p=>p.evaluate(()=>{G.projectiles.clear();G.actors[0].pos.set(0,0,0);G.actors[1].pos.set(0,0,5);G.actors[0].aimDir.set(0,0,1);}))); 
  await host.evaluate(()=>{G.local.setWeapon('charger');G.local.special=G.local.specialCost();G.local._startSpecial();});
  await frames(25);await guest.waitForFunction(()=>vac.inkVacState(G.actors[0])?.phase==='inhale');
  await Promise.all(pages.map(p=>p.evaluate(()=>{G.actors[1].hp=100;G.actors[1].ink=100;})));
  for(let i=0;i<30;i++){
   await host.evaluate(()=>G.local.update(1/60));await guest.evaluate(()=>G.local.update(1/60));await frames(1);
  }
  const owner=await host.evaluate(()=>({damage:vac.inkVacState(G.local).absorbedDamage,count:vac.inkVacState(G.local).absorbed,remoteInk:G.actors[1].ink}));
  const victim=await guest.evaluate(()=>({ink:G.local.ink,hp:G.local.hp,replicaDamage:vac.inkVacState(G.actors[0]).absorbedDamage||0}));
  assert(Math.abs(owner.damage-45)<1e-8);assert.equal(owner.count,0);assert.equal(owner.remoteInk,100);
  assert(Math.abs(victim.ink-94)<1e-8);assert.equal(victim.hp,100);assert.equal(victim.replicaDamage,0);
  const slow=await guest.evaluate(()=>{const a=G.local;a.intent.move.set(1,0,0);a.vel.set(20,0,0);a._horizontal(1/60,false,false);const inside=a.vel.length();a.pos.z=-5;a.vel.set(20,0,0);a._horizontal(1/60,false,false);return{inside,outside:a.vel.length(),cap:a.weaponRunner.moveSpeed()*.6};});
  assert(slow.inside<=slow.cap+1e-8);assert(slow.outside>slow.cap);
  await host.evaluate(()=>vac.disposeInkVac(G.local));await frames(25);
  assert.equal(await guest.evaluate(()=>vac.inkVacActorContact(G.actors[0],G.local)),false);
  assert.deepEqual(errors,[]);results.push({engine,clients:3,births:9,damage:34.3,contact:owner.damage,victimInk:victim.ink});
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({build:build.build.revision,results},null,2));
}finally{if(browser)await browser.close();for(const ws of relay.clients)ws.terminate();await new Promise(r=>relay.close(r));await new Promise(r=>server.close(r));}

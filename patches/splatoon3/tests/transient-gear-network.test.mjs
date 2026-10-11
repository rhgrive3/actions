import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
const json=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function world(id,weapon='shooter'){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {Match} from './inkwave-public/src/game/match.js'; export {giveDrink,retireDrink} from './patches/splatoon3/runtime/support-cooler.mjs';"});
 f.profile.flow.threshold=1e6;
 f.G.level={...f.G.level,spawnPads:[new f.THREE.Vector3(),new f.THREE.Vector3()],blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 f.G.scene ||= new f.THREE.Scene();f.G.camera ||= new f.THREE.PerspectiveCamera();
 const a=f.make(weapon);Object.assign(a,{nid:1,owner:'owner',invuln:0});
 let packet;const session={myId:id,hostId:'owner',isHost:id==='owner',tr:{sendTo(){},broadcast:d=>{packet=json(d);}}};
 const nm=new f.NetMatch(session,{id:'gear-match'}),m={actors:[a],state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false};
 nm.bind(m);f.G.netm=nm;f.G.match=m;f.G.actors=[a];
 return{f,a,nm,m,send(){f.G.time+=1/60;nm._sendTick();return json(packet);}};
}
function receive(w,p,from='owner',sample=true){w.f.context.__wire=JSON.stringify(p);w.nm.onMessage(from,vm.runInContext('JSON.parse(__wire)',w.f.context));delete w.f.context.__wire;if(sample){const peer=w.nm._peer(from);peer.tr=Math.max(peer.tr||0,p.ts);w.nm._sample(w.a,peer.tr,0);w.nm.applyRemote(w.a,1/60);}}
function adopt(w){w.nm.s.hostId='viewer';w.nm.s.isHost=true;w.nm.onLeave('owner',true);}
function head(w,id){w.a.s3.loadout=emptyLoadout();w.a.s3.loadout[0].main=id;w.a.s3RefreshGear();}
function enemy(w){const a=w.f.make();a.team=1;a.invuln=0;return a;}
function advance(w,seconds,hz=60){for(let i=0;i<Math.round(seconds*hz);i++){const dt=1/hz;w.f.G.time+=dt;w.nm.update(dt);if(!w.m.paused){w.m.time-=dt;if(w.a.remote)w.nm.applyRemote(w.a,dt);else w.a.update(dt);}}}
function comeback(w){w.a.splat(enemy(w));w.a.respawn();}

function takeActualDrink(w){w.a.special=w.a.specialCost();w.a._startSpecial();assert.equal(w.f.G.projectiles._s3SupportCoolers.length,1);w.f.G.time+=1/60;w.nm.update(1/60);w.f.G.projectiles.update(1/60);assert.equal(w.a.s3.drink,true);}
function ageAndRetire(w,seconds,hz){advance(w,seconds,hz);w.f.G.projectiles.update(1/hz);}
for(const hz of [30,60,120])test(`actual Tacticooler pickup survives JSON takeover and expires at ${hz}Hz`,async()=>{
 const o=await world('owner','s3-shooter-quickmiddle'),r=await world('viewer','s3-shooter-quickmiddle');takeActualDrink(o);const boosted=o.a.s3.modifiers.runSpeed;ageAndRetire(o,5,hz);r.m.time=o.m.time;receive(r,o.send());assert.notEqual(r.a.s3.drink,true,'presentation is not gameplay authority');assert.ok(r.a.s3.modifiers.runSpeed<boosted);
 advance(r,2,hz);adopt(r);assert.equal(r.a.s3.drink,true);near(r.a.s3.modifiers.runSpeed,boosted);near(r.a.s3.drinkUntil-r.f.G.time,10-1/60);
 ageAndRetire(r,10,hz);assert.equal(r.a.s3.drink,false);assert.ok(r.a.s3.modifiers.runSpeed<boosted);
});
test('same drink generation cannot refill and cancellation cannot replay its generation',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,o.f.G.time);receive(r,o.send());advance(r,5);let p=o.send();p.gb[1][6][1]=25;receive(r,p);adopt(r);near(r.a.s3.drinkUntil-r.f.G.time,12-1/60);
 const o2=await world('owner'),r2=await world('viewer');o2.f.giveDrink(o2.a,o2.f.G.time);const first=o2.send();receive(r2,first);o2.f.retireDrink(o2.a,o2.f.G.time,true);receive(r2,o2.send());p=o2.send();p.gb[1][6]=first.gb[1][6];receive(r2,p);adopt(r2);assert.notEqual(r2.a.s3.drink,true);
});
test('transient claims reject wrong owner, life, sequence, match, slot and arbitrary values',async()=>{
 for(const bad of ['duration','negative','extra','life','sequence','match','noGear','foreign','dropWrongSlot']){
  const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);const p=o.send();
  if(bad==='duration')p.gb[1][6][1]=25.1;if(bad==='negative')p.gb[1][6][1]=-1;if(bad==='extra')p.gb[1][6].push(57);
  if(bad==='life')p.gb[1][3]++;if(bad==='sequence')p.gb[1][4]--;if(bad==='match')p.gb[1][1]='other';if(bad==='noGear')delete p.gg;
  if(bad==='dropWrongSlot')p.gb[1][7]=[1,3];receive(r,p,bad==='foreign'?'intruder':'owner');adopt(r);assert.notEqual(r.a.s3.drink,true,bad);assert.equal(r.a.s3.dropRollerBuffRemaining||0,0,bad);
 }
});
test('fresh drink can renew but older generations cannot resurrect after cancellation',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);const old=o.send();receive(r,old);advance(o,6);advance(r,6);o.f.giveDrink(o.a,o.f.G.time);let p=o.send();receive(r,p);const renewed=p.gb[1][6][1];p=o.send();p.gb[1][6]=old.gb[1][6];receive(r,p);adopt(r);near(r.a.s3.drinkUntil-r.f.G.time,renewed);
});
test('missing sidecar ages the old receipt, pause preserves it, and new match/life cannot inherit it',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);receive(r,o.send());advance(r,3);let p=o.send();delete p.gb;receive(r,p);r.m.paused=true;advance(r,7);r.m.paused=false;adopt(r);near(r.a.s3.drinkUntil-r.f.G.time,14-1/60);
 for(const kind of ['life','match']){
  const a=await world('owner'),b=await world('viewer');a.f.giveDrink(a.a,0);receive(b,a.send());
  if(kind==='life'){a.a.splat(null,'water');a.a.respawn();p=a.send();delete p.gb;receive(b,p);}else{const next={...b.m,time:180},session=b.nm.s,cfg=b.nm.cfg;b.nm.dispose();b.nm=new b.f.NetMatch(session,cfg);b.nm.bind(next);b.f.G.match=next;b.m=next;}
  adopt(b);assert.notEqual(b.a.s3.drink,true,kind);
 }
});
test('pending native respawn cannot restore the previous life drink from its last sample',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);receive(r,o.send());r.nm._remoteRespawn(r.a);assert.equal(r.a.net.spawnPending,true);adopt(r);assert.notEqual(r.a.s3.drink,true);assert.equal(r.a.s3.dropRollerBuffRemaining||0,0);
});
test('100ms ordered delivery subtracts elapsed match time before adopting a drink',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);const p=o.send();advance(o,.1);advance(r,.1);receive(r,p);adopt(r);
 const ownerLeft=o.a.s3.drinkUntil-o.f.G.time,adoptedLeft=r.a.s3.drinkUntil-r.f.G.time;near(adoptedLeft,ownerLeft);
});
test('two successive host migrations keep the original deadline and honor new-owner cancellation',async()=>{
 for(const mode of ['missing','cancel']){
  const o=await world('owner'),r=await world('viewer'),t=await world('third');o.f.giveDrink(o.a,0);const p=o.send();receive(r,p);receive(t,p);advance(r,2);advance(t,2);adopt(r);
  t.nm.s.hostId='viewer';t.nm.onLeave('owner',true);assert.equal(t.a.owner,'viewer');advance(r,2);advance(t,2);
  const prior=r.send();receive(t,prior,'viewer');
  if(mode==='cancel')r.f.retireDrink(r.a,r.f.G.time,true);
  const next=r.send();if(mode==='missing')delete next.gb;receive(t,next,'viewer');receive(t,prior,'viewer');
  t.nm.s.hostId='third';t.nm.s.isHost=true;t.nm.onLeave('viewer',true);
  if(mode==='cancel')assert.notEqual(t.a.s3.drink,true);else near(t.a.s3.drinkUntil-t.f.G.time,13-2/60);
  const before=t.a.s3.drinkUntil||0;receive(t,p,'owner',false);assert.equal(t.a.s3.drinkUntil||0,before,'original owner cannot replay after two migrations');
 }
});
test('never-used owners omit gb, but a lost cancellation is repeated after prior transmission',async()=>{
 const o=await world('owner'),r=await world('viewer');assert.equal(Object.hasOwn(o.send(),'gb'),false);
 o.f.giveDrink(o.a,0);receive(r,o.send());o.f.retireDrink(o.a,o.f.G.time,true);
 const lost=o.send();assert.deepEqual(lost.gb[1].slice(6),[null,null]);delete lost.gb;receive(r,lost);
 const repeated=o.send();assert.deepEqual(repeated.gb[1].slice(6),[null,null]);receive(r,repeated);adopt(r);assert.notEqual(r.a.s3.drink,true);
});
test('death and new life keep explicit retirement for an actor that previously sent a buff',async()=>{
 const o=await world('owner'),r=await world('viewer');o.f.giveDrink(o.a,0);receive(r,o.send());o.a.splat(null,'water');o.a.respawn();const p=o.send();assert.deepEqual(p.gb[1].slice(6),[null,null]);receive(r,p);adopt(r);assert.notEqual(r.a.s3.drink,true);
});
test('adopting an already-cancelled receipt still sends explicit retirement to another old peer',async()=>{
 const o=await world('owner'),r=await world('viewer'),t=await world('third');o.f.giveDrink(o.a,0);const first=o.send();receive(r,first);receive(t,first);
 o.f.retireDrink(o.a,o.f.G.time,true);receive(r,o.send());adopt(r);t.nm.s.hostId='viewer';t.nm.onLeave('owner',true);
 const p=r.send();assert.deepEqual(p.gb[1].slice(6),[null,null]);receive(t,p,'viewer');t.nm.s.hostId='third';t.nm.s.isHost=true;t.nm.onLeave('viewer',true);assert.notEqual(t.a.s3.drink,true);
});

test('negotiated paint preserves sparse transient receipt and cancellation through JSON takeover',async()=>{
 for(const cancel of [false,true]){
  const o=await world('owner'),r=await world('viewer'),q=[];
  for(const w of [o,r]){w.f.context.crypto=globalThis.crypto;w.nm.s._members=new Map([['owner','Owner'],['viewer','Viewer']]);w.nm.s.tr.sendTo=(to,d)=>{q.push([w.nm.s.myId,to,json(d)]);return true;};}
  assert.equal(Object.hasOwn(o.send(),'gb'),false);r.send();let budget=30;while(q.length){assert.ok(budget-->0);const[from,to,d]=q.shift();(to==='owner'?o:r).nm.onMessage(from,d);}
  const paint=()=>{for(let i=0;i<24;i++)o.nm.recSplat(new o.f.THREE.Vector3(i*.02,0,0),.3,0,{seed:.31,kind:'drop',face:0,claimOwner:o.a});};
  head(o,'comeback');comeback(o);o.f.giveDrink(o.a,o.f.G.time);paint();const packet=o.send();assert.ok(packet.pe);assert.equal(packet.e,undefined);assert.ok(packet.gg[1]);assert.ok(packet.gc[1]);assert.ok(packet.gb[1][6]);receive(r,packet);
  advance(r,2);
  if(cancel){o.f.retireDrink(o.a,o.f.G.time,true);paint();const p=o.send();assert.ok(p.pe);assert.deepEqual(p.gb[1].slice(6),[null,null]);receive(r,p);}
  adopt(r);
  if(cancel)assert.notEqual(r.a.s3.drink,true);
  else{assert.equal(r.a.s3.drink,true);near(r.a.s3.drinkUntil-r.f.G.time,15-1/60);ageAndRetire(r,15,60);assert.equal(r.a.s3.drink,false);}
 }
});

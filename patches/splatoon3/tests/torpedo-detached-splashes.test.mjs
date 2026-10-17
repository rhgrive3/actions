import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';
const STEP=1/60;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

// S3 11.3.0 GP0. Eight terrain-contact blasts are explicit raw values and
// documented behavior. Kinematics retain the labelled custom gravity; this
// verifies the authoritative runtime and replay, not retail trajectory parity.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード#r2c63076
async function world(client=null){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {paint}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const owner=f.make(),victim=f.make();
  Object.assign(owner,{nid:1,owner:'a',team:0,netLife:0,remote:client==='b'});owner.pos.set(50,0,50);
  Object.assign(victim,{nid:2,owner:'b',team:1,netLife:0,remote:client==='a',invuln:0});victim.pos.set(0,0,38);
  owner.weapon={...owner.weapon,sub:'torpedo'};owner.weaponRunner.reset();
  let nm=null;const packets=[];
  if(client){
    nm=new f.NetMatch({myId:client,isHost:client==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),
      tr:{broadcast(){},sendTo(to,p){packets.push({to,p:JSON.parse(JSON.stringify(p))});}}},{id:'torpedo-detached',map:'map',difficulty:'normal'});
    nm.bind({actors:[owner,victim],state:'playing',time:180,follower:false,playing:()=>true});
    f.G.netm=nm;f.G.match=nm.match;
    for(const a of [owner,victim]){nm.byNid.set(a.nid,a);nm._setupActor(a);}
  }
  const hits=[],stamps=[],events=[];
  const hit=f.G.projectiles.applyHit.bind(f.G.projectiles),splat=paint.splat.bind(paint);
  f.G.projectiles.applyHit=(a,v,n,c,...args)=>{hits.push({victim:v,amount:n,cause:c,time:f.G.time});return hit(a,v,n,c,...args);};
  paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),radius:r,team:t});return splat(p,r,t,o);};
  f.on('all:sub',e=>events.push(e));
  function step(){f.G.time+=STEP;f.G.projectiles.update(STEP);paint.advanceSimulation(STEP);}
  function fire(){
    owner.ink=100;
    for(let i=0;i<8;i++)owner.weaponRunner.update(STEP,{sub:true});
    owner.weaponRunner.update(STEP,{sub:false,subReleased:true});owner.weaponRunner.update(STEP,{sub:false});
    const b=f.G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');assert.ok(b);assert.equal(owner.ink,35);
    b.pos.set(0,2,30);b.prev.copy(b.pos);b.vel.set(0,0,0);return b;
  }
  function contact(b){
    for(let i=0;i<51;i++)step();assert.equal(b.phase,'chase');
    victim.pos.set(0,0,30);b.pos.set(-1,.7,30);b.prev.copy(b.pos);b.vel.set(120,0,0);step();
    assert.equal(b.dead,true,'the real swept actor contact bursts the launched parent');
    return f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');
  }
  return {f,paint,owner,victim,nm,packets,hits,stamps,events,step,fire,contact};
}
function landing(drop){
  const g=drop.source.spec.gravity,time=(drop.vel.y+Math.sqrt(drop.vel.y**2+2*g*drop.pos.y))/g;
  return drop.pos.clone().addScaledVector(drop.vel,time).setY(0);
}
function wire(e){const r=JSON.parse(JSON.stringify(e));r._netSeq=e._netSeq;r._netTick=e._netTick;return r;}
function play(w,rows){w.nm._peer('a');for(const row of rows)w.nm._play('a',wire(row));}
function settle(w){for(let i=0;i<180;i++)w.paint.advanceSimulation(STEP);}

test('Torpedo extracted chase and acquisition droplets are separate pinned patterns',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/source-1130/weapon/WeaponBombTorpedo.game__GameParameterTable.json',import.meta.url))).GameParameters;
  const spec=ALL_SUB_SPECS.torpedo,splash=raw.BlastParamChase.SplashAroundParam,find=raw.MoveParam.FindSpawnSplashAroundParam;
  assert.equal(spec.splashAround.count,splash.Num);assert.equal(spec.splashAround.pitchDegrees,splash.PitchMin);
  assert.equal(splash.PitchMin,splash.PitchMax);
  near(spec.splashAround.velocityMin,splash.VelocityMin*60);near(spec.splashAround.velocityMax,splash.VelocityMax*60);
  assert.equal(spec.findSplashAround.count,find.Num);assert.equal(spec.findSplashAround.paintRadius,find.PaintRadius);
});

test('Torpedo main contact does not apply an immediate extra12 and each detached terrain blast paints once after owner death',async()=>{
  const w=await world(),b=w.fire();
  for(let i=0;i<6;i++)w.step();
  assert.equal(w.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='find').length,6);
  // Finish the already-entered rotation/wait, then use the real actor contact.
  for(let i=0;i<45;i++)w.step();assert.equal(b.phase,'chase');
  w.victim.pos.set(0,0,30);b.pos.set(-1,.7,30);b.prev.copy(b.pos);b.vel.set(120,0,0);w.step();
  const drops=w.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');assert.equal(drops.length,8);
  assert.deepEqual(w.hits.map(h=>h.amount),[60]);assert.equal(w.victim.hp,40);
  assert.equal(w.stamps.filter(s=>s.radius===2).length,0,'chase splash paint waits for its own terrain contact');
  for(const d of drops){
    assert.equal(d.age,0);near(Math.atan2(d.vel.y,Math.hypot(d.vel.x,d.vel.z)),65*Math.PI/180);
    assert.ok(d.vel.length()>=.42*60&&d.vel.length()<=.48*60);
  }
  w.victim.pos.copy(landing(drops[0]));w.owner.splat(null,'fall');
  for(let i=0;i<200;i++)w.step();
  assert.equal(w.f.G.projectiles._s3TorpedoSplashes.length,0);
  assert.equal(w.stamps.filter(s=>s.radius===2).length,8,'all8 children paint once, independently of retired parent/dead owner');
  assert.equal(w.stamps.filter(s=>s.radius===.7).length,6,'capture paint has6 independent harmless droplets');
  assert.deepEqual(w.hits.filter(h=>h.cause==='torpedo-splash').map(h=>h.amount),[12]);
  assert.equal(w.victim.hp,28);
  const before=[w.hits.length,w.stamps.length];for(let i=0;i<10;i++)w.step();assert.deepEqual([w.hits.length,w.stamps.length],before);
});

test('Torpedo detached children clear with the world without inventing impact damage or paint',async()=>{
  const w=await world(),b=w.fire(),drops=w.contact(b),meshes=drops.map(d=>d.mesh);
  const before=[w.hits.length,w.stamps.length];w.f.G.projectiles.clear();
  assert.equal(w.f.G.projectiles._s3TorpedoSplashes.length,0);
  assert.ok(meshes.every(m=>m.parent===null));for(let i=0;i<200;i++)w.step();
  assert.deepEqual([w.hits.length,w.stamps.length],before);
});

test('Torpedo JSON replay keeps native hit and paint authority while ghosts carry detached visuals only',async()=>{
  const source=await world('a'),receiver=await world('b'),b=source.fire(),drops=source.contact(b);
  source.victim.pos.copy(landing(drops[0]));receiver.victim.pos.copy(source.victim.pos);
  play(receiver,source.nm.out.filter(e=>e[1]==='ac'));
  assert.equal(receiver.f.G.projectiles._s3SubObjects.length,0,'parent expire does not remove detached child visuals');
  assert.equal(receiver.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase').length,8);
  const counters=[receiver.hits.length,receiver.stamps.length,receiver.packets.length,receiver.events.length];
  for(let i=0;i<200;i++)receiver.step();
  assert.deepEqual([receiver.hits.length,receiver.stamps.length,receiver.packets.length,receiver.events.length],counters,'ghost child impacts cannot propose hit/paint/events');
  assert.equal(receiver.victim.hp,100);
  source.owner.splat(null,'fall');for(let i=0;i<200;i++)source.step();
  const hits=source.packets.filter(p=>p.p.k==='hit').map(p=>p.p);
  assert.deepEqual(hits.map(p=>[p.w,p.d]),[['torpedo',60],['torpedo-splash',12]]);
  for(const p of hits)receiver.nm.onMessage('a',p);
  assert.equal(receiver.victim.hp,28);
  const rows=source.nm.out.filter(e=>e[1]==='s');play(receiver,rows);settle(source);settle(receiver);
  assert.deepEqual(Array.from(receiver.paint.grid),Array.from(source.paint.grid));
  const before=Array.from(receiver.paint.grid);play(receiver,rows);for(const p of hits)receiver.nm.onMessage('a',p);settle(receiver);
  assert.deepEqual(Array.from(receiver.paint.grid),before);assert.equal(receiver.victim.hp,28);
});

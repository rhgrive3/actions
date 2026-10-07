import { updateStormHold } from '../runtime/storm-effects.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {ABILITIES,normalizeLoadout,abilityPoints,gearCurve} from '../runtime/gear.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function loadout(points,ability){
 for(let m=0;m<=3;m++){const s=(points-10*m)/3;if(Number.isInteger(s)&&s>=0&&s<=9)return Array.from({length:3},(_,i)=>({main:i<m?ability:'none',subs:Array.from({length:3},(_,j)=>i*3+j<s?ability:'none')}));}
 throw Error('unrepresentable GP');
}
function equip(a,gp,ability){a.s3.loadout=loadout(gp,ability);a.setWeapon(a.weaponId);}
function throwStorm(f,a){a._startSpecial();assert.equal(a.specialActive.phase,'hold');a.intent.sub=true;updateStormHold(a,DT,f.G);a.intent.sub=false;updateStormHold(a,DT,f.G);assert.equal(a.specialActive.phase,'throw');}
const step=(a,n,input={})=>{for(let i=0;i<n;i++)a.weaponRunner.update(DT,input);};

test('#193: Splat Bomb per-sub Lv2 curve crosses the two-bomb boundary at 35AP, not 34AP',async()=>{
 for(const gp of [0,3,10,34,35,57]){
  const f=await fixture(),a=f.make();equip(a,gp,'inkSaverSub');let bombs=0;f.G.projectiles.throwBomb=()=>bombs++;
  const cost=70*gearCurve(gp,1,.825,.65);near(a.s3.modifiers.inkSaverSub*70,cost);
  for(let attempt=0;attempt<2;attempt++){step(a,6,{sub:true});step(a,1,{subReleased:true});}
  assert.equal(bombs,gp>=35?2:1);near(a.ink,100-cost*bombs);near(f.SUB.bomb.inkCost,70);
 }
});

test('#235: human 1F/4F release waits until elapsed5F; a long hold has no extra delay',async()=>{
 for(const hold of [1,4,5,12]){
  const f=await fixture(),a=f.make(),r=a.weaponRunner,ticks=[];let tick=0;f.G.projectiles.throwBomb=()=>ticks.push(tick);
  for(tick=0;tick<hold;tick++)r.update(DT,{sub:true});
  r.update(DT,{subReleased:true});for(tick=hold+1;tick<15;tick++)r.update(DT,{});
  assert.deepEqual(ticks,[Math.max(5,hold)]);near(a.ink,30);assert.equal(r.s3SubReady,null);
 }
});

test('#235: real Actor distinguishes squid-origin10F from human5F with no doubled emerge wait',async()=>{
 for(const [origin,frame]of [['kid',5],['squid',10]]){
  const f=await fixture(),a=f.make(),times=[];let tick=0;f.G.projectiles.throwBomb=()=>times.push(tick);
  a.form=origin;a.intent.squid=origin==='squid';if(origin==='squid')f.tick(a,2);a.intent.sub=true;f.tick(a);
  a.intent.sub=false;a.intent.squid=false;
  for(tick=1;tick<=12;tick++)f.tick(a);
  assert.deepEqual(times,[frame]);
 }
});

test('#235: no deferred bomb survives ink failure, death, reset, special or Super Jump',async()=>{
 for(const cancel of ['ink','death','reset','special','jump']){
  const f=await fixture(),a=f.make(),r=a.weaponRunner;let bombs=0;f.G.projectiles.throwBomb=()=>bombs++;f.G.projectiles.throwStorm=()=>{};
  if(cancel==='ink')a.ink=0;step(a,1,{sub:true});step(a,1,{subReleased:true});
  if(cancel==='death'){a.alive=false;r.onDeath();}
  if(cancel==='reset')a.reset();
  if(cancel==='special'){a.weapon.special='storm';a._startSpecial();}
  if(cancel==='jump')a.superJumpState={phase:'charge'};
  step(a,12);assert.equal(bombs,0,cancel);assert.equal(r.s3SubReady,null);
  a.alive=true;a.specialActive=null;a.superJumpState=null;a.ink=100;step(a,12);assert.equal(bombs,0);
 }
});

test('#245: ground bomb-ready speed is4.32 at0/57AP, restoring walk gear on release; air is untouched',async()=>{
 const speeds=[];
 for(const gp of [0,57]){
  const f=await fixture(),a=f.make();equip(a,gp,'runSpeed');const walk=a.weaponRunner.moveSpeed();
  step(a,6,{sub:true});near(a.weaponRunner.moveSpeed(),4.32);
  a.grounded=false;near(a.weaponRunner.moveSpeed(),walk);a.grounded=true;
  step(a,1);near(a.weaponRunner.moveSpeed(),walk);speeds.push(walk);
 }
 near(speeds[1]/speeds[0],1.5);near(4.32/speeds[0],.75);
});

test('#298: special-power gear survives normalization/AP collection and follows sourced frame checkpoints',async()=>{
 assert.equal(ABILITIES.specialPower,'スペシャル性能アップ');
 for(const [gp,frames]of [[0,480],[3,491],[6,502],[10,516],[20,546],[30,569],[57,600]]){
  const f=await fixture(),a=f.make();equip(a,gp,'specialPower');
  assert.equal(abilityPoints(normalizeLoadout(loadout(gp,'specialPower'))).specialPower||0,gp);
  near(a.s3.modifiers.stormDuration*60,frames);near(a.s3.modifiers.stormThrowScale,gearCurve(gp,1,1.25,1.5));
 }
});

test('#298: actor-local activation snapshot changes Storm launch component, not inherited movement or other clouds',async()=>{
 const f=await fixture(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;
 const a=f.make(),b=f.make();equip(a,57,'specialPower');equip(b,0,'specialPower');
 for(const x of [a,b]){x.weapon.special='storm';x.aimYaw=.3;x.aimPitch=.2;x.vel.set(2,7,-3);throwStorm(f,x);}
 const [hi,lo]=ps.bombs;near(hi.s3StormDuration,10);near(lo.s3StormDuration,8);
 const inherited=new f.THREE.Vector3(2*.4,1.5,-3*.4);
 near(hi.vel.clone().sub(inherited).length()/lo.vel.clone().sub(inherited).length(),1.5);
 a.s3.modifiers.stormDuration=8;a.s3.modifiers.stormThrowScale=1;
 ps._spawnCloud(hi);ps._spawnCloud(lo);near(ps.clouds[0].dur,10);near(ps.clouds[1].dur,8);near(f.SPECIALS.storm.duration,8);
});

test('#298: real bomb packet and ghost preserve duration even when remote actor has no gear',async()=>{
 const f=await fixture(),ps=new f.Projectiles(new f.THREE.Scene()),a=f.make();f.G.projectiles=ps;equip(a,57,'specialPower');a.nid=7;a.weapon.special='storm';
 const net=new f.NetMatch({myId:'local'},{});f.G.netm=net;throwStorm(f,a);
 const packet=JSON.parse(JSON.stringify(net.out.find(e=>e[1]==='b')));near(packet[10].stormDuration,10);
 const remote=f.make();remote.nid=7;remote.remote=true;remote.owner='peer';net.byNid.set(7,remote);net.peers.set('peer',{tr:packet[0]});
 const count=ps.bombs.length;net._play('peer',packet);assert.equal(ps.bombs.length,count+1);
 near(ps.bombs.at(-1).s3StormDuration,10);assert.equal(ps.bombs.at(-1).ghost,true);
 ps._spawnCloud(ps.bombs.at(-1));near(ps.clouds.at(-1).dur,10);
});

test('sub pending throw and ink spending have identical fixed-tick traces at30/60/120Hz renders',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),a=f.make(),clock=new FixedClock(),rows=[];let bombs=0;f.G.projectiles.throwBomb=()=>bombs++;
  for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{const t=rows.length;a.weaponRunner.update(dt,{sub:t===0,subReleased:t===1});rows.push([bombs,a.ink,a.weaponRunner.s3SubReady?.age??null]);});traces.push(rows);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#298: cloud lifetime expires at its exact480/491/600F snapshot, never one floating-point tick late',async()=>{
 for(const [gp,frames]of [[0,480],[3,491],[57,600]]){
  const f=await fixture(),a=f.make(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;f.G.actors=[a];f.G.camera={position:new f.THREE.Vector3()};
  equip(a,gp,'specialPower');a.weapon.special='storm';throwStorm(f,a);ps._spawnCloud(ps.bombs[0]);
  for(let i=0;i<frames-1;i++)ps._updateClouds(DT);assert.equal(ps.clouds.length,1);ps._updateClouds(DT);assert.equal(ps.clouds.length,0);
 }
});

test('#193: nested actor sub updates cannot double-apply the other players saver curve',async()=>{
 const f=await fixture(),a=f.make(),b=f.make();equip(a,57,'inkSaverSub');equip(b,0,'inkSaverSub');let second=false;
 f.G.projectiles.throwBomb=owner=>{if(owner===a&&!second){second=true;step(b,6,{sub:true});step(b,1,{subReleased:true});}};
 step(a,6,{sub:true});step(a,1,{subReleased:true});near(a.ink,54.5);near(b.ink,30);near(f.SUB.bomb.inkCost,70);
});

test('#267: actual guide and released bomb use the same actor-local speed at0/10/57AP',async()=>{
 for(const gp of [0,10,57]){
  const f=await fixture(),a=f.make(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;equip(a,gp,'subPower');a.vel.set(2,3,-1);a.aimPitch=-.1;
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};ps.updateArc(a,true);
  const preview=new f.THREE.Vector3(ps._arcCache.vx,ps._arcCache.vy,ps._arcCache.vz);
  step(a,6,{sub:true});step(a,1,{subReleased:true});const actual=ps.bombs.at(-1).vel;
  near(actual.distanceTo(preview),0);near(f.SUB.bomb.throwSpeed,67.2);
  const inherited=new f.THREE.Vector3(.8,1.5,-.4);near(actual.clone().sub(inherited).length()/67.2,gearCurve(gp,1,1.25,1.5));
  for(let tick=1;tick<=20;tick++){ps._updateBombs(DT);if(tick%2===0){const expected=new f.THREE.Vector3().fromBufferAttribute(ps.arcGeo.attributes.position,tick/2);assert.ok(ps.bombs[0].pos.distanceTo(expected)<3e-5,'Float32 arc matches actual semi-implicit path');}}
 }
});

test('#267: preview cache invalidates after gear changes and low ink does not suppress equipped trajectory',async()=>{
 const f=await fixture(),a=f.make(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 ps.updateArc(a,true);const before=ps._arcCache.vz;a.ink=0;equip(a,57,'subPower');ps.updateArc(a,true);assert.ok(ps._arcCache.vz>before);near(f.SUB.bomb.throwSpeed,67.2);
 equip(a,0,'subPower');ps.updateArc(a,true);near(ps._arcCache.vz,before);
});

test('#267: nested other-actor guide and throw cannot inherit the first actors57AP boost',async()=>{
 const f=await fixture(),a=f.make(),b=f.make(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;equip(a,57,'subPower');equip(b,0,'subPower');f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};let inside=false,preview;
 f.G.netm={recBomb:bomb=>{if(bomb.owner!==a||inside)return;inside=true;ps.updateArc(b,true);preview=[ps._arcCache.vx,ps._arcCache.vy,ps._arcCache.vz];step(b,6,{sub:true});step(b,1,{subReleased:true});}};
 step(a,6,{sub:true});step(a,1,{subReleased:true});assert.equal(ps.bombs.length,2);
 near(ps.bombs[1].vel.distanceTo(new f.THREE.Vector3(...preview)),0);near(ps.bombs[0].vel.clone().sub(new f.THREE.Vector3(0,1.5,0)).length()/ps.bombs[1].vel.clone().sub(new f.THREE.Vector3(0,1.5,0)).length(),1.5);near(f.SUB.bomb.throwSpeed,67.2);
});

test('#267: subPower and Storm specialPower do not strengthen each others launch',async()=>{
 const f=await fixture(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;
 const sub=f.make(),special=f.make();equip(sub,57,'subPower');equip(special,57,'specialPower');
 sub.weapon.special=special.weapon.special='storm';throwStorm(f,sub);throwStorm(f,special);const [normal,powered]=ps.bombs;
 near(powered.vel.clone().sub(new f.THREE.Vector3(0,1.5,0)).length()/normal.vel.clone().sub(new f.THREE.Vector3(0,1.5,0)).length(),1.5);
 ps.throwBomb(special);ps.throwBomb(sub);const plain=ps.bombs[2].vel.clone().sub(new f.THREE.Vector3(0,1.5,0)),strong=ps.bombs[3].vel.clone().sub(new f.THREE.Vector3(0,1.5,0));near(strong.length()/plain.length(),1.5);
});

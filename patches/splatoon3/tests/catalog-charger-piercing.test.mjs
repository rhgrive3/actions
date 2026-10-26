import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const DT=1/60;
async function setup({weapon='s3-charger-long',frames=150}={}) {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.setRandom(()=>.5);
  f.G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[-30,0,-30],[30,0,30]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-40,-1,-40],max:[40,0,40]}]});
  f.G.physics=new f.Physics(f.G.level);
  const owner=f.make(weapon);owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1.05,50);
  owner.intent.fire=true;f.tick(owner,frames);owner.intent.fire=false;f.tick(owner);
  const p=f.G.projectiles.list.find(p=>p.catalog);
  assert.ok(p?.catalog,'real Charger admission');
  return {...f,p,owner};
}

test('catalogue full-charge Charger pierces every victim along one tick without losing travel',async()=>{
  const f=await setup(),origin=f.p.pos.clone(),expected=origin.clone().addScaledVector(f.p.vel,DT);
  assert.equal(f.p.catalog.descriptor.charge,1,'full charge');
  const near=f.make('shooter'),far=f.make('shooter');
  for(const [actor,fraction]of [[near,.25],[far,.75]]){
    actor.team=1;actor.invuln=0;actor.hp=1000;
    actor.pos.copy(origin).lerp(expected,fraction);actor.pos.y-=.7;
  }
  f.G.actors=[f.owner,far,near];
  const order=[],applyHit=f.G.projectiles.applyHit;
  f.G.projectiles.applyHit=function(owner,victim,...args){order.push(victim);return applyHit.call(this,owner,victim,...args);};
  f.G.projectiles.update(DT);
  assert.deepEqual(order,[near,far],'damage callbacks follow contact time, not reversed roster order');
  assert.ok(near.hp<1000,'near contact');
  assert.ok(far.hp<1000,'far contact occurs in the same tick');
  assert.ok(f.p.pos.distanceTo(expected)<1e-9,'piercing does not spend range on untravelled space');
  const damage=[near.hp,far.hp];
  f.G.projectiles.update(DT);
  assert.deepEqual([near.hp,far.hp],damage,'each victim is damaged only once per shot');
  const state=f.p.catalog;
  for(let i=0;i<10&&f.G.projectiles.list.includes(f.p);i++)f.G.projectiles.update(DT);
  assert.ok(Math.abs(f.p.pos.distanceTo(origin)-state.range)<1e-8,'full sourced range survives both contacts');
  f.G.projectiles.clear();
});

for(const options of [{weapon:'s3-charger-light'},{frames:15}])test(`catalogue nonpiercing ${options.weapon||'partial charge'} keeps first-contact stop`,async()=>{
  const f=await setup(options),origin=f.p.pos.clone(),end=origin.clone().addScaledVector(f.p.vel,DT);
  if(options.frames)assert.ok(f.p.catalog.descriptor.charge<1);
  else assert.equal(f.p.catalog.descriptor.m.ThroughFullCharge,false);
  const near=f.make('shooter'),far=f.make('shooter');
  for(const [actor,t]of [[near,.2],[far,.85]]){
    actor.team=1;actor.invuln=0;actor.hp=1000;actor.pos.copy(origin).lerp(end,t);actor.pos.y-=.7;
  }
  f.G.actors=[f.owner,far,near];
  f.G.projectiles.update(DT);
  assert.ok(near.hp<1000);assert.equal(far.hp,1000);
  assert.ok(!f.G.projectiles.list.includes(f.p));
  f.G.projectiles.clear();
});

test('catalogue piercing remains ordered and stops behind terrain in the same tick',async()=>{
  const f=await setup(),origin=f.p.pos.clone(),end=origin.clone().addScaledVector(f.p.vel,DT);
  const near=f.make('shooter'),far=f.make('shooter'),wallZ=origin.z+(end.z-origin.z)*.5;
  for(const [actor,t]of [[near,.2],[far,.8]]){
    actor.team=1;actor.invuln=0;actor.hp=1000;actor.pos.copy(origin).lerp(end,t);actor.pos.y-=.7;
  }
  f.G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[-30,0,-30],[30,0,30]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-40,-1,-40],max:[40,0,40]},{kind:'box',min:[-2,0,wallZ],max:[2,4,wallZ+.2]}]});
  f.G.physics=new f.Physics(f.G.level);
  f.G.projectiles.update(DT);
  assert.ok(near.hp<1000);assert.equal(far.hp,1000);
  assert.ok(!f.G.projectiles.list.includes(f.p),'same tick also resolves the wall');
  assert.ok(f.p.pos.z<wallZ,'projectile centre stops at the wall shell');
  f.G.projectiles.clear();
});

test('catalogue piercing contacts settle before a later defense without passing through it',async()=>{
  const f=await setup(),origin=f.p.pos.clone(),end=origin.clone().addScaledVector(f.p.vel,DT);
  const near=f.make('shooter'),far=f.make('shooter'),calls=[];
  for(const [actor,t]of [[near,.2],[far,.8]]){
    actor.team=1;actor.invuln=0;actor.hp=1000;actor.pos.copy(origin).lerp(end,t);actor.pos.y-=.7;
  }
  f.G.projectiles.kitDefenseCandidate=()=>({distance:origin.distanceTo(end)*.5,onHit(){calls.push([near.hp,far.hp]);}});
  f.G.projectiles.update(DT);
  assert.equal(calls.length,1);assert.ok(calls[0][0]<1000);assert.equal(calls[0][1],1000);
  assert.ok(!f.G.projectiles.list.includes(f.p));
  f.G.projectiles.clear();
});

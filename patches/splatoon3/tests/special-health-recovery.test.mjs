import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
const IDS=['tentaMissiles','inkjet','booyahBomb','ultraStamp','killerWail','tripleInkstrike','superChump','krakenRoyale','zipcaster'];
for(const hz of [30,60,120])test(`body-owning specials retain native HP recovery without ordinary ink refill at ${hz}Hz`,()=>{
 for(const id of IDS){
  const {G}=f;G.projectiles.clear();G.actors=[];G.time=0;G.mode='match';G.match={playing:()=>true,canRespawn:()=>false,state:'playing'};
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,
   half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};
  const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a._startSpecial();assert.equal(a.specialActive?.id,id);
  const dt=1/hz;a.hp=40;a.ink=25;a.lastFire=0;a.lastDamage=1-2*dt;
  G.time+=dt;a.update(dt);assert.equal(a.hp,40,`${id}: the post-damage wait remains closed`);
  G.time+=dt;a.update(dt);assert.ok(a.hp>40,`${id}: recovery resumes at the native deadline`);
  const rate=a.submerged||a.form==='squid'&&a.climbing?f.profile.resources.regenRateSwim:f.profile.resources.regenRate;
  assert.ok(Math.abs(a.hp-(40+rate*dt))<1e-7,`${id}: exactly one shared recovery step`);
  assert.equal(a.ink,25,`${id}: the HP hook cannot refill ordinary main ink`);
  if(id!=='inkjet'&&id!=='booyahBomb'){
   a.hp=40;a.lastDamage=2;G.paint.sample=()=>2;a.grounded=true;a.ground.hit=true;
   G.time+=dt;a.update(dt);assert.equal(a.hp,40,`${id}: enemy ink still suppresses recovery`);
  }
 }
});

for(const hz of [30,60,120])test(`Wail keeps ordinary main-ink recovery and enemy-ink contact at ${hz}Hz`,()=>{
 const {G}=f;G.projectiles.clear();G.actors=[];G.time=0;G.mode='match';G.match={playing:()=>true,canRespawn:()=>false,state:'playing'};
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,
  half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};
 const a=f.make();a.weapon={...a.weapon,special:'killerWail',specialCost:100};a.special=100;a.invuln=0;a._startSpecial();a._resolve=()=>{};
 const step=n=>{for(let i=0;i<n;i++){G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);}};
 a.intent.fire=true;step(Math.ceil(1.5*hz));const spent=a.ink;
 assert.ok(spent<100,'ordinary main shots really spend ink during Wail');
 a.intent.fire=false;step(hz);assert.ok(a.ink>spent,'the normal recovery delay/rate keep running while the lasers fire');
 assert.equal(a.specialActive?.id,'killerWail');
 a.hp=100;G.paint.sample=()=>2;step(hz);assert.ok(a.hp<100,'a non-invulnerable Wail user still takes ordinary enemy-ink contact damage');
 G.projectiles.clear();
});

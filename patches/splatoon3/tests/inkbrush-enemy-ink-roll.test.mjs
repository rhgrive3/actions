import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function actor(id='s3-brush-mini'){
 f.G.actors.length=0;f.G.paint.sample=()=>2;f.G.paint.sampleWorld=()=>2;
 const a=f.make(id);a.form='kid';a.grounded=true;a.groundTeam=2;a.pos.set(0,0,0);a.yaw=0;
 a.intent.fire=true;a.intent.move.set(0,0,1);a.vel.set(0,0,6);a.weaponRunner.rolling=true;
 a.invuln=0;a.kidT=10;a.lastDamage=10;a.hp=90;
 return a;
}
test('source Inkbrush moving roll keeps dry-ground speed while crossing enemy ink',()=>{
 for(const hz of [30,60,120]){
  const a=actor(),b=actor();
  for(let i=0;i<hz/2;i++){a._horizontal(1/hz,false,true);b._horizontal(1/hz,false,false);}
  assert.ok(Math.abs(a.vel.z-b.vel.z)<1e-9,`${hz}: enemy ${a.vel.z} vs dry ${b.vel.z}`);
  assert.ok(a.vel.z>10,'roll reaches the source running speed');
 }
 const slowed=actor();
 f.G.projectiles._s3SubObjects=[{subId:'toxicMist',team:1,phase:'deployed',dead:false,
  pos:slowed.pos.clone().setY(.7),expireAt:1e9,spec:{radius:100,slowScale:.5}}];
 for(let i=0;i<60;i++)slowed._horizontal(1/60,false,true);
 assert.ok(slowed.vel.z<7,'enemy floor immunity does not suppress Poison Mist');
 f.G.projectiles._s3SubObjects=[];
});
test('real Actor resource phase ignores floor damage and allows normal healing during moving Inkbrush roll',()=>{
 const a=actor();a.update(1/60);
 assert.equal(a.damageFromInk,0);assert.ok(a.hp>90);assert.equal(a.onEnemy,false);
 const hp=a.hp;a.damage(5,null,'shooter');assert.ok(Math.abs(a.hp-(hp-5))<1e-9,'weapon damage is never exempted');
});
test('stationary, released, empty, airborne, sub-ready, pending swing and other brushes receive no exemption',()=>{
 for(const condition of ['stationary','released','empty','airborne','sub','pending','octobrush','painbrush']){
  const a=actor(condition==='octobrush'?'s3-brush-normal':condition==='painbrush'?'s3-brush-heavy':'s3-brush-mini');
  if(condition==='stationary'){a.vel.set(0,0,0);a.intent.move.set(0,0,0);}
  if(condition==='released')a.intent.fire=false;
  if(condition==='empty')a.ink=0;
  if(condition==='airborne')a.grounded=false;
  if(condition==='sub'){a.intent.sub=true;a.weaponRunner.aimingSub=true;}
  if(condition==='pending')a.weaponRunner.catalogState={id:a.weapon.id,pending:{remaining:.2,fire(){}}};
  // Probe the live resource sampler independently of movement/weapon changes.
  f.resourceSurface(a);
  assert.equal(a.onEnemy,condition!=='airborne',condition);
 }
});

test('real wall collision keeps an active Inkbrush roll immune after velocity is clipped to zero',()=>{
 for(const hz of [30,60,120]){
  const level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
   spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
   single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]},
    {kind:'box',min:[-10,0,1],max:[10,10,2]}],half:[]});
  f.G.level=level;f.G.physics=new f.Physics(level);f.G.projectiles._s3SubObjects=[];
  const a=actor();a.pos.z=.85;a._prevIntent.fire=true; // ZR is already held, so do not admit a new swing
  // make() normally freezes integration. Restore the production collision
  // phase so the resource sampler sees the actual wall-resolved velocity.
  a._integrate=f.Actor.prototype._integrate;
  for(let i=0;i<hz/2;i++){
   a.update(1/hz);
   assert.equal(a.contacts.wall,true);
   assert.ok(Math.hypot(a.vel.x,a.vel.z)<1e-9,'wall removes all incoming horizontal velocity');
   assert.equal(a.onEnemy,false,`${hz}Hz active wall push keeps floor immunity`);
   assert.equal(a.damageFromInk,0);
  }
  assert.ok(a.hp>90,'wall contact does not suppress ordinary health recovery');
  const dry=a.weaponRunner.moveSpeed();
  f.G.projectiles._s3SubObjects=[{subId:'toxicMist',team:1,phase:'deployed',dead:false,
   pos:a.pos.clone().setY(.7),expireAt:1e9,spec:{radius:100,slowScale:.5}}];
  assert.ok(Math.abs(a.weaponRunner.moveSpeed()-dry*.5)<1e-9,'wall immunity does not suppress Poison Mist');
  f.G.projectiles._s3SubObjects=[];
  const hp=a.hp;a.damage(5,null,'shooter');assert.ok(Math.abs(a.hp-(hp-5))<1e-9,'wall immunity never rejects weapon damage');
  for(const [label,move]of [['neutral',[0,0,0]],['away',[0,0,-1]],['tangent',[1,0,0]]]){
   a.intent.move.set(...move);f.resourceSurface(a);assert.equal(a.onEnemy,true,label+' input is not an active push into the wall');
  }
  a.intent.move.set(0,0,1);
  for(const condition of ['released','empty','airborne','sub','pending','octobrush','painbrush']){
   const b=actor(condition==='octobrush'?'s3-brush-normal':condition==='painbrush'?'s3-brush-heavy':'s3-brush-mini');
   b.pos.copy(a.pos);b.vel.set(0,0,0);b.contacts.wall=true;b.contacts.wallNormal.copy(a.contacts.wallNormal);
   if(condition==='released')b.intent.fire=false;
   if(condition==='empty')b.ink=0;
   if(condition==='airborne')b.grounded=false;
   if(condition==='sub'){b.intent.sub=true;b.weaponRunner.aimingSub=true;}
   if(condition==='pending')b.weaponRunner.catalogState={id:b.weapon.id,pending:{remaining:.2,fire(){}}};
   f.resourceSurface(b);assert.equal(b.onEnemy,condition!=='airborne',condition+' wall contact does not grant immunity');
  }
 }
});

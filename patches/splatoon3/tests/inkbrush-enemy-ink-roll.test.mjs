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

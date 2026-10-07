import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function setup(swim=true){
 const f=await fixture(),a=f.make('charger');f.G.actors=[a];f.G.camera={position:new f.THREE.Vector3(0,20,0)};f.G.match.canRespawn=()=>false;
 if(swim){a.intent.squid=true;f.tick(a,20);assert.equal(a.form,'squid');}
 return {...f,a};
}
test('fresh swim charge starts six elapsed intervals after native form exit',async()=>{
 const f=await setup(),a=f.a,r=a.weaponRunner;a.intent.fire=true;
 for(let elapsed=0;elapsed<=6;elapsed++){
  f.tick(a);assert.ok(Math.abs(a.kidT-elapsed/60)<1e-9);
  if(elapsed<6){assert.equal(r.charging,false);assert.equal(r.chargeT,0);assert.equal(a.ink,100);}
 }
 assert.equal(r.charging,true);assert.ok(Math.abs(r.chargeT-1/60)<1e-9);
 f.tick(a,59);assert.ok(Math.abs(r.charge-1)<1e-9);assert.equal(f.shots.length,0);
});
test('stable human spends1F startup before60 charge updates',async()=>{
 const f=await setup(false),r=f.a.weaponRunner;f.a.intent.fire=true;f.tick(f.a);assert.equal(r.charging,false);assert.equal(r.chargeT,0);f.tick(f.a);assert.ok(Math.abs(r.chargeT-1/60)<1e-9);f.tick(f.a,58);assert.ok(r.charge<1);f.tick(f.a);assert.equal(r.charge,1);
});
test('manual emergence before ZR uses remaining native exit time, not a restarted timer',async()=>{
 for(const before of [1,3,5,8]){
  const f=await setup(),a=f.a,r=a.weaponRunner;a.intent.squid=false;f.tick(a,before);a.intent.fire=true;
  let first;for(let i=0;i<8;i++){f.tick(a);if(r.charging){first=a.kidT;break;}}
  // An unmasked first ZR at the native5F exit boundary still pays fresh1F after the6F swim gate.
  assert.ok(Math.abs(first-({1:6,3:6,5:7,8:9}[before])/60)<1e-9,`${before} ${first}`);
 }
});
test('stored full charge is delegated without adding fresh6F and release cancels keep',async()=>{
 const f=await setup(false),a=f.a,r=a.weaponRunner;a.intent.fire=true;f.tick(a,61);a.intent.squid=true;f.tick(a,2);assert.ok(r.s3Stored);
 a.intent.squid=false;f.tick(a,6);assert.ok(r.s3Stored);assert.equal(r.charging,false);f.tick(a,25);assert.equal(r.charging,true);assert.equal(r.charge,1);
 a.intent.squid=true;f.tick(a,2);assert.ok(r.s3Stored);a.intent.fire=false;f.tick(a);assert.equal(r.s3Stored,null);assert.equal(r.charge,0);
});
test('release, sub, death and weapon reset leave no queued fresh charge',async()=>{
 for(const cancel of ['release','sub','death','weapon']){
  const f=await setup(),a=f.a;a.intent.fire=true;f.tick(a,4);
  a.intent.fire=false;
  if(cancel==='sub')a.intent.sub=true;
  if(cancel==='death'){a.weaponRunner.onDeath();a.alive=false;}
  if(cancel==='weapon'){a.setWeapon('shooter');a.setWeapon('charger');}
  f.tick(a,20);assert.equal(a.weaponRunner.charging,false,cancel);assert.equal(f.shots.length,0,cancel);
 }
});
test('display30/60/120/144 all reach fresh startup at fixed index6',async()=>{
 for(const hz of [30,60,120,144]){
  const f=await setup(),clock=new FixedClock();let tick=-1,first=null;f.a.intent.fire=true;
  for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>{tick++;f.tick(f.a);if(first==null&&f.a.weaponRunner.charging)first=tick;});
  assert.equal(first,6,`${hz}Hz`);
 }
});

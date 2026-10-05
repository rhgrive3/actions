import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function setup() {
 const f=await fixture(),a=f.make('dualies');
 f.G.camera={position:new f.THREE.Vector3(0,20,0)};f.G.actors=[a];f.G.match.canRespawn=()=>false;
 a.intent.squid=true;f.tick(a,20);assert.equal(a.form,'squid');assert.equal(a.submerged,true);
 return {...f,a};
}
// Frame1 is the recognized ZR edge, not the preceding idle tick. Thus 13
// counted frames means 12 elapsed intervals, matching the existing human3F.
test('swim edge emits on counted13 only, then18/23, with no earlier ink debit',async()=>{
 const f=await setup(),a=f.a,rows=[];a.intent.fire=true;
 for(let frame=1;frame<=23;frame++){
  const n=f.shots.length;f.tick(a);
  if(frame<13){assert.equal(f.shots.length,0);assert.equal(a.ink,100);}
  if(f.shots.length!==n)rows.push(frame);
 }
 assert.deepEqual(rows,[13,18,23]);assert.ok(Math.abs(a.ink-(100-3*a.weapon.inkPerShot))<1e-8);
});
test('generic emergence and startup clocks overlap instead of stacking',async()=>{
 for(const emerge of [0,2/60,5/60,10/60]){
  const f=await setup();f.PLAYER.emergeDelay=emerge;f.a.intent.fire=true;
  let first=0;for(let frame=1;frame<=20;frame++){f.tick(f.a);if(f.shots.length){first=frame;break;}}
  assert.equal(first,13,`generic emerge ${emerge}`);
 }
});
test('released swim taps at each boundary cannot survive native fireBuffer',async()=>{
 for(const held of [1,4,8,12]){
  const f=await setup();f.a.intent.fire=true;f.tick(f.a,held);assert.equal(f.shots.length,0);
  f.a.intent.fire=false;f.a.intent.squid=false;f.tick(f.a,25);
  assert.equal(f.shots.length,0);assert.equal(f.a.fireBuffer,0);assert.equal(f.a.weaponRunner.s3DualiesSwimStart,null);
  f.a.intent.fire=true;f.tick(f.a,2);assert.equal(f.shots.length,0);f.tick(f.a);assert.equal(f.shots.length,1);
 }
});
test('sub/special/death/reset/weapon/roll/re-dive cancel pending swim ownership',async()=>{
 for(const cancel of ['sub','special','death','reset','weapon','roll','squid']){
  const f=await setup(),a=f.a,r=a.weaponRunner;a.intent.fire=true;f.tick(a,7);
  if(cancel==='sub')a.intent.sub=true;
  if(cancel==='special'){a.specialActive={};a._updateSpecial=()=>{};}
  if(cancel==='death'){r.onDeath();a.alive=false;}
  if(cancel==='reset'){r.reset();a.intent.fire=false;}
  if(cancel==='weapon'){a.setWeapon('shooter');a.setWeapon('dualies');a.intent.fire=false;}
  if(cancel==='roll'){a.intent.move.set(1,0,0);assert.equal(r.tryDodge(a.intent.move),true);}
  if(cancel==='squid'){a.intent.squid=false;f.tick(a);a.intent.squid=true;}
  f.tick(a);assert.equal(r.s3DualiesSwimStart,null,cancel);assert.equal(f.shots.length,0,cancel);
  if(!['death','special','roll'].includes(cancel)){a.intent.fire=false;a.intent.sub=false;a._prevIntent.sub=false;f.tick(a,20);assert.equal(f.shots.length,0,cancel);}
 }
});
test('render partition cannot advance the authoritative first shot',async()=>{
 for(const hz of [30,60,120,144]){
  const f=await setup(),clock=new FixedClock(),rows=[];let ticks=0;f.a.intent.fire=true;
  for(let i=0;i<hz;i++)clock.advance(1/hz,()=>{ticks++;const n=f.shots.length;f.tick(f.a);if(f.shots.length!==n)rows.push(ticks);});
  assert.deepEqual(rows.slice(0,3),[13,18,23],`${hz}Hz`);
 }
});

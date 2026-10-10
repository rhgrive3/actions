import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const hz of [30,60,120])for(const tank of [18,100])test(`full-charge to keep has no free refill tick (${tank} tank, ${hz}Hz)`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true}),a=f.make('charger'),r=a.weaponRunner;
 f.tick(a,60);a.ink=tank;a.intent.fire=true;f.tick(a,85);
 assert.equal(r.charge,1);near(r.s3ChargerSpent,18);assert.equal(r.s3Stored,null);
 const before=a.ink,clock=new FixedClock();let ticks=0;
 a.intent.squid=true;
 for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>{
  f.tick(a);ticks++;assert.equal(a.ink,before,`no refill on keep entry/hold tick ${ticks}`);
  assert.ok(r.s3Stored);near(r.s3Stored.paid,18);
 });
 assert.equal(a.form,'squid');assert.equal(f.shots.length,0);
});
test('keep entered before death cannot refund ink or revive on actual respawn',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true}),a=f.make('charger'),r=a.weaponRunner;
 f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=()=>({hit:false});
 f.tick(a,60);a.intent.fire=true;f.tick(a,85);const paid=a.ink;
 a.intent.squid=true;f.tick(a);assert.equal(a.ink,paid);assert.ok(r.s3Stored);
 a.intent.fire=a.intent.squid=false;a.splat(null);assert.equal(a.ink,paid);assert.equal(r.s3Stored,null);
 f.tick(a,20);a.respawn();assert.equal(a.ink,100);assert.equal(r.s3Stored,null);assert.equal(r.charge,0);
 f.tick(a,90);assert.equal(f.shots.length,0);assert.equal(a.ink,100);
});

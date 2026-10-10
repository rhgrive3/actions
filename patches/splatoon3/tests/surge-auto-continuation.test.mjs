import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
async function rig(chargeFrames=45){
 const f=await fixture(),a=f.make();let terrain='wall';
 a.grounded=false;a.form='squid';a.intent.squid=true;a.climbing=true;a.wallN.set(0,0,1);a.intent.move.set(0,0,-1);a.intent.jump=true;
 f.G.physics.raycast=(p,dir,max,h)=>{if(terrain==='throw')throw Error('probe terrain failure');h.hit=Math.abs(dir.y)<.5&&terrain!=='top';if(h.hit){h.face=0;h.u=h.v=.5;h.normal.set(0,0,1);h.point.copy(p).addScaledVector(dir,.3);}return h;};
 f.G.paint.sample=()=>terrain==='ink-end'?0:1;
 f.tick(a,chargeFrames);const charge=a.s3.surge.charge;a.intent.jump=false;a.intent.move.set(0,0,0);
 return {...f,a,charge,terrain(v){terrain=v;}};
}
test('Refs846 neutral automatic climb survives boost expiry at native climb speed without extending boost or armor',async()=>{const h=await rig();h.tick(h.a,17);assert.equal(h.a.s3.surge.phase,'burst');assert.equal(h.a.climbV,15);h.tick(h.a,23);assert.equal(h.a.s3.surge.phase,'auto-climb');assert.equal(h.a.climbV,h.PLAYER.climbSpeed);assert.equal(h.a.s3.surge.time,0);assert.ok(Math.abs(h.a.s3.surge.armorTime-0)<1e-9);h.tick(h.a,20);assert.equal(h.a.s3.surge.armorTime,0);assert.deepEqual(Array.from(h.a.intent.move.toArray()),[0,0,0]);});
test('Refs846 partial charge retains its existing weaker boost then ordinary automatic climb',async()=>{const h=await rig(15);h.tick(h.a);assert.equal(h.a.climbV,h.profile.movement.surge.minimumVelocity+(h.profile.movement.surge.velocity-h.profile.movement.surge.minimumVelocity)*h.charge);assert.ok(h.a.climbV<15);h.tick(h.a,40);assert.equal(h.a.s3.surge.phase,'auto-climb');assert.equal(h.a.climbV,h.PLAYER.climbSpeed);assert.ok(Math.abs(h.a.s3.surge.armorTime-0)<1e-9);h.tick(h.a,6);assert.equal(h.a.s3.surge.armorTime,0);});
test('Refs846 native wall-top, end-of-ink and away input retire automatic continuation',async()=>{for(const cause of ['top','ink-end','away']){const h=await rig();h.tick(h.a,40);if(cause==='away')h.a.intent.move.set(0,0,1);else h.terrain(cause);h.tick(h.a);assert.equal(h.a.climbing,false,cause);assert.equal(h.a.s3.surge,null,cause);if(cause==='top')assert.ok(h.a.vel.y>0,'native ledge launch remains');}});
test('Refs846 fresh charge and wall Roll remain independently admitted after continuation',async()=>{const h=await rig();h.tick(h.a,40);h.a.intent.jump=true;h.tick(h.a);assert.equal(h.a.s3.surge.phase,'charge');const r=await rig();r.tick(r.a,40);r.a.intent.move.set(0,0,1);r.a.intent.jump=true;r.tick(r.a);assert.ok(r.a.s3.roll);assert.equal(r.a.s3.surge,null);});
test('Refs846 native movement intent and shared speed are restored even when wall probing throws',async()=>{const h=await rig();h.tick(h.a,40);const speed=h.PLAYER.climbSpeed;h.terrain('throw');assert.throws(()=>h.a._updateClimb(1/60,true),/terrain failure/);assert.deepEqual(Array.from(h.a.intent.move.toArray()),[0,0,0]);assert.equal(h.PLAYER.climbSpeed,speed);});
test('Refs846 reset, form change and Super Jump retire continuation through existing owners',async()=>{for(const cause of ['reset','form','jump']){const h=await rig();h.tick(h.a,40);if(cause==='reset')h.a.reset();else if(cause==='form'){h.a.intent.squid=false;h.tick(h.a);}else h.a.superJump(new h.THREE.Vector3(0,0,8));assert.equal(h.a.s3.surge,null,cause);}});
test('Refs846 30/60/120Hz rendering produces the same sixty fixed continuation ticks',async()=>{const rows=[];for(const hz of [30,60,120]){const h=await rig(),clock=new FixedClock();let ticks=0;for(let i=0;i<hz;i++)clock.advance(1/hz,()=>{ticks++;h.tick(h.a);});rows.push({ticks,phase:h.a.s3.surge.phase,speed:h.a.climbV,armor:h.a.s3.surge.armorTime});}assert.deepEqual(rows[0],rows[1]);assert.deepEqual(rows[1],rows[2]);assert.equal(rows[0].ticks,60);});
test('Refs846 a real ledge after long automatic climb emits the same crest transition as an early ledge', async () => {
  for (const delay of [2, 40]) {
    const f = await rig(); f.tick(f.a, delay);
    const oldVelocity = f.a.vel.y;
    const phase = f.a.s3.surge.phase;
    f.terrain('top'); f.tick(f.a);
    assert.equal(f.a.climbing, false);
    const crests = f.a.character.events.filter(([name]) => name === 'squidsurge_top');
    assert.equal(crests.length, 1, `ledge after ${delay}F (${phase})`);
    assert.equal(crests[0][1].charge, f.charge);
    assert.equal(crests[0][1].duration, f.profile.movement.surge.duration);
    if (phase === 'auto-climb') assert.ok(f.a.vel.y <= oldVelocity, 'presentation must not reapply the expired boost');
    // A later helper call without a wall transition must not replay the crest.
    f.a._ledgePop(new f.THREE.Vector3(0, 0, -1));
    f.tick(f.a, 3);
    assert.equal(f.a.character.events.filter(([name]) => name === 'squidsurge_top').length, 1);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';

test('#538 Squid Roll mid-air steering updates lateral horizontal velocity under stick input', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');
  a.grounded = false;
  a.form = 'squid';
  a.vel.set(0, 0, 5);
  a.s3.roll = { time: 0.25, steerReady: true };

  const initialVx = a.vel.x;
  assert.equal(initialVx, 0);

  // Apply lateral stick input (+X)
  a.intent = { move: { x: 1, z: 0 } };
  a._horizontal(1 / 60, a.intent.move);

  // Velocity in X should increase towards the input direction
  assert.ok(a.vel.x > initialVx, `mid-air stick input accelerates lateral velocity (vx = ${a.vel.x})`);
});

test('#538 Squid Roll naturally decelerates horizontally when stick is neutral', async () => {
  const f = await world({ fidelity: true });
  const a = f.make('shooter');
  a.grounded = false;
  a.form = 'squid';
  a.vel.set(3, 0, 5);
  a.s3.roll = { time: 0.25, steerReady: true };

  const initialVx = a.vel.x;

  // Stick released to neutral (0, 0)
  a.intent = { move: { x: 0, z: 0 } };
  a._horizontal(1 / 60, a.intent.move);

  // Lateral velocity must naturally decelerate rather than stay frozen
  assert.ok(a.vel.x < initialVx, `neutral input produces horizontal deceleration (vx ${a.vel.x} < ${initialVx})`);
});


// Admit a real roll through the full Actor/Physics action path. Synthetic
// s3.roll objects (above) cannot prove early steering admission or 15F timing.
import { fixture as liveActor } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function liveRoll(move, steps = 12) {
  const f = await liveActor(), a = f.make('shooter');
  a.form = 'squid';
  a.intent.squid = true;
  a.submerged = true;
  a.grounded = true;
  a.vel.set(0, 0, f.PLAYER.swimSpeed);
  a.intent.move.set(0, 0, -1);
  a.intent.jump = true;
  f.tick(a); // real 60Hz floor roll admission / fresh B
  assert.ok(a.s3.roll, 'real B edge admits an actual Squid Roll');
  assert.equal(a.character.events.filter(x => x[0] === 'squidroll').length, 1);
  a.intent.jump = false;
  a.intent.move.set(move[0], 0, move[1]);
  const rows = [];
  for (let i = 0; i < steps; i++) {
    f.tick(a);
    rows.push([a.vel.x, a.vel.y, a.vel.z, a.s3.roll?.time ?? 0,
      a.character.events.filter(x => x[0] === 'squidroll').length]);
  }
  return rows;
}
test('#538 actual admitted 15F Squid Roll admits lateral, held, neutral and reverse stick input', async () => {
  const still = await liveRoll([0,0]), held = await liveRoll([0,-1]);
  const side = await liveRoll([1,0]), opposite = await liveRoll([0,1]);
  assert.ok(side[4][0] > 0, '90-degree stick steers during the action, not after expiry');
  assert.ok(Math.abs(held[4][2]) > Math.abs(still[4][2]),
    'full travel-direction input can accelerate toward its allowed cap');
  assert.ok(Math.abs(opposite[4][2]) < Math.abs(held[4][2]),
    'opposite stick brakes on the actual roll clock');
  assert.ok(Math.abs(still[8][2]) < Math.abs(held[8][2]),
    'neutral input is not frozen for 15F');
  for (let i = 0; i < 12; i++) {
    for (const row of [still[i], side[i], opposite[i]]) {
      assert.equal(row[3], held[i][3], 'horizontal steering never retimes roll expiry');
      assert.equal(row[1], held[i][1], 'horizontal steering never edits roll vertical arc');
      assert.equal(row[4], 1, 'held/changed stick must not re-trigger launch');
    }
  }
});
test('#538 full native Squid Roll directional switch has deterministic 30/60/120Hz fixed traces', async () => {
  const traces = [];
  for (const hz of [30,60,120]) {
    const f = await liveActor(), a = f.make('shooter'), clock = new FixedClock();
    a.form='squid'; a.intent.squid=true; a.submerged=true; a.grounded=true;
    a.vel.set(0,0,f.PLAYER.swimSpeed);
    let tick=0;
    const rows=[];
    for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>{
      tick++;
      a.intent.jump=tick===1;
      const move=tick===1?[0,-1]:tick<7?[1,0]:tick<14?[0,0]:[0,1];
      a.intent.move.set(move[0],0,move[1]);
      f.tick(a);
      rows.push([a.vel.x,a.vel.y,a.vel.z,!!a.s3.roll]);
    });
    assert.equal(tick,30);
    traces.push(rows);
  }
  assert.deepEqual(traces[0],traces[1]);
  assert.deepEqual(traces[1],traces[2]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './storm-effects-fixture.mjs';

const STEP = 1 / 60;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-8, msg || `${a} != ${b}`);

// Production composition: the native rain contact and the recovery query both
// run through the built adapter. Actor physics is pinned so y-positions hold.
async function setup() {
  const f = await fixture();
  f.G.scene = new f.THREE.Scene(); f.G.actors = [];
  const p = f.G.projectiles = new f.Projectiles(f.G.scene);
  const owner = f.make(), ally = f.make(), enemy = f.make();
  ally._resolve = () => { ally.grounded = true; };
  enemy._resolve = () => { enemy.grounded = true; };
  enemy.team = 1; f.G.actors = [ally, enemy];
  const group = new f.THREE.Group(); group.position.set(0, 5, 0);
  const cloud = { owner, team: owner.team, group, t: 1, dur: 8, dir: new f.THREE.Vector3(), rainT: 1e9, ghost: false };
  p.clouds.push(cloud);
  f.G.physics.los = () => true;
  return { ...f, p, owner, ally, enemy, cloud };
}
function recover(f, { x = 0, y = 0 } = {}) {
  f.ally.pos.set(x, y, 0); f.ally.hp = 50; f.ally.lastDamage = 5;
  f.tick(f.ally);
  return f.ally.hp;
}

test('#927 allied recovery uses the same growth/fade rain area as native contact', async () => {
  const f = await setup(), radius = f.SPECIALS.storm.radius;
  for (const age of [0, 1 / 60, .2, 1, 7.5]) {
    f.cloud.t = age;
    const grow = Math.min(1, age / .5), fade = Math.min(1, (8 - age) / .6);
    const R = radius * (.3 + .7 * (1 - (1 - grow) ** 3)) * (.2 + .8 * fade);
    for (const x of [0, R - 1e-5, R + 1e-5, radius + .1]) {
      const inside = x < R;
      // Native contact at dt=0 reads eligibility without advancing the cloud.
      f.enemy.pos.set(x, 0, 0);
      let hits = 0; f.enemy.damage = () => { hits++; return false; };
      f.p._updateClouds(0);
      assert.equal(hits > 0, inside, `native contact age=${age} x=${x}`);
      const hp = recover(f, { x });
      close(hp, 50 + (inside ? f.profile.resources.regenRateSwim : f.profile.resources.regenRate) * STEP,
        `recovery age=${age} x=${x}`);
    }
  }
});

test('#927 allied recovery stops above the cloud and below the finite rain trace', async () => {
  const f = await setup();
  f.cloud.t = 1;
  for (const y of [100, 5.1, -9.1, -50]) {
    close(recover(f, { y }), 50 + f.profile.resources.regenRate * STEP, `allied y=${y}`);
  }
  for (const y of [-8.9, 0, 5]) {
    close(recover(f, { y }), 50 + f.profile.resources.regenRateSwim * STEP, `allied y=${y}`);
  }
  f.cloud.team = 1;
  for (const y of [-8.9, 0]) {
    close(recover(f, { y }), 50, `enemy rain suppresses recovery at y=${y}`);
  }
  for (const y of [-9.1, 5.1]) {
    close(recover(f, { y }), 50 + f.profile.resources.regenRate * STEP, `enemy rain bounded at y=${y}`);
  }
});

test('#927 allied recovery stays live through the final 0.3 seconds and stops at expiry', async () => {
  const f = await setup();
  for (const age of [7.7, 7.8, 7.95]) {
    f.cloud.t = age;
    close(recover(f), 50 + f.profile.resources.regenRateSwim * STEP, `age ${age}`);
  }
  f.cloud.t = 8;
  close(recover(f), 50 + f.profile.resources.regenRate * STEP, 'expired cloud is not a recovery source');
});

test('#927 cover and overlapping allied rain keep one recovery source', async () => {
  const f = await setup();
  f.cloud.t = 1;
  f.G.physics.los = () => false;
  close(recover(f), 50 + f.profile.resources.regenRate * STEP, 'covered rain');
  f.G.physics.los = () => true;
  f.p.clouds.push({ ...f.cloud });
  close(recover(f), 50 + f.profile.resources.regenRateSwim * STEP, 'overlap is not additive');
});

test('#927 moving allied rain edge yields identical recovery at 30, 60 and 120 Hz', async () => {
  let expected = null;
  for (const hz of [30, 60, 120]) {
    const f = await setup(), clock = new f.FixedClock(), rows = [];
    f.cloud.t = 0; f.ally.pos.set(f.SPECIALS.storm.radius * .7, 0, 0);
    for (let frame = 0; frame < hz * 8; frame++) clock.advance(1 / hz, dt => {
      f.p._updateClouds(dt);
      f.ally.hp = 50; f.ally.lastDamage = 5;
      f.tick(f.ally);
      rows.push([f.p.clouds.length, f.cloud.t, f.ally.hp]);
    });
    if (expected) assert.deepEqual(rows, expected); else expected = rows;
  }
});

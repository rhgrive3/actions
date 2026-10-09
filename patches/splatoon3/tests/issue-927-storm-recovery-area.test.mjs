import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const STEP = 1 / 60;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
async function setup() {
  const f = await fixture({ productionComposition: true, extraExports:
    "export { cloudCoversActor, stormRecoveryState } from './patches/splatoon3/runtime/storm-effects.mjs';" });
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.netm = null;
  const p = G.projectiles = new f.Projectiles(G.scene), owner = f.make(), ally = f.make(), enemy = f.make();
  enemy.team = 1; G.actors = [ally, enemy];
  const cloud = { t: 1, dur: 8, team: owner.team, owner, dir: new THREE.Vector3(), rainT: 1, group: new THREE.Group() };
  cloud.group.position.set(0, 5, 0); p.clouds.push(cloud);
  let damageCalls = 0;
  enemy.damage = () => { damageCalls++; return false; };
  function sample({ age = 1, x = 0, y = 0, cloudY = 5, team = 0, cover = false } = {}) {
    cloud.t = age; cloud.team = team; cloud.group.position.set(0, cloudY, 0);
    ally.pos.set(x, y, 0); enemy.pos.copy(ally.pos);
    G.physics.los = () => !cover;
    ally.hp = 50; ally.lastDamage = 5;
    // Read the native cloud's contact eligibility without advancing its age.
    damageCalls = 0; p._updateClouds(0);
    f.tick(ally);
    return { hp: ally.hp, enemyContact: damageCalls > 0 };
  }
  return { ...f, p, cloud, ally, enemy, sample };
}

test('#927 growth/fade recovery uses the same active horizontal rain area as native damage', async () => {
  const f = await setup(), radius = f.SPECIALS.storm.radius;
  for (const age of [0, 1 / 60, .2, 1, 7.5, 7.75, 7.95]) {
    const grow = Math.min(1, Math.max(0, age / .5));
    const fade = Math.min(1, Math.max(0, (8 - age) / .6));
    const activeRadius = radius * (.3 + .7 * (1 - (1 - grow) ** 3)) * (.2 + .8 * fade);
    for (const x of [0, activeRadius - 1e-5, activeRadius + 1e-5, radius + .1]) {
      const result = f.sample({ age, x });
      const inside = x <= activeRadius;
      assert.equal(result.enemyContact, inside, `native area age=${age}, x=${x}`);
      close(result.hp, 50 + (inside ? f.profile.resources.regenRateSwim : f.profile.resources.regenRate) * STEP);
    }
  }
});

test('#927 recovery and enemy-rain suppression stop below finite rain reach and above the cloud', async () => {
  const f = await setup();
  for (const y of [100, 5.01, -9.001, -50]) for (const team of [0, 1]) {
    const result = f.sample({ y, team });
    close(result.hp, 50 + f.profile.resources.regenRate * STEP);
  }
  for (const y of [-8.999, 0, 5]) {
    close(f.sample({ y }).hp, 50 + f.profile.resources.regenRateSwim * STEP);
    close(f.sample({ y, team: 1 }).hp, 50);
  }
});

test('#927 blocked, ended, remote and overlapping clouds preserve recovery ownership', async () => {
  const f = await setup();
  close(f.sample({ cover: true }).hp, 50 + f.profile.resources.regenRate * STEP);
  f.cloud.ghost = true; f.cloud.owner.remote = true;
  close(f.sample().hp, 50 + f.profile.resources.regenRateSwim * STEP, 'local ally consumes a remote cloud once');
  f.p.clouds.push({ ...f.cloud });
  close(f.sample().hp, 50 + f.profile.resources.regenRateSwim * STEP);
  f.p.clouds.pop();
  close(f.sample({ age: 8 }).hp, 50 + f.profile.resources.regenRate * STEP);
});


test('#927 changing live cloud area yields identical recovery at 30/60/120 Hz', async () => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const f = await setup(), clock = new FixedClock(), rows = [];
    f.cloud.t = 0; f.cloud.rainT = 1e9;
    f.ally.pos.set(f.SPECIALS.storm.radius * .7, 0, 0);
    for (let frame = 0; frame < hz * 8; frame++) clock.advance(1 / hz, () => {
      f.p._updateClouds(STEP);
      f.ally.hp = 50; f.ally.lastDamage = 5;
      f.tick(f.ally);
      rows.push([f.p.clouds.length, f.cloud.t, f.ally.hp]);
    });
    if (expected) assert.deepEqual(rows, expected); else expected = rows;
  }
});

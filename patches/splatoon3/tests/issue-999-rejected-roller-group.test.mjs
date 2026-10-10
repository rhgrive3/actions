import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function setup() {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { applyFidelityProjectileHit, fidelityDamage } from './patches/splatoon3/runtime/weapons-fidelity.mjs';" });
  const attacker = f.make('roller'), victim = f.make();
  attacker.team = 0; victim.team = 1;
  victim.invuln = 0;
  victim.s3.spawnArmorManaged = true;
  victim.s3.spawnArmor = { hp: f.profile.spawnArmor.hp, remaining: f.profile.spawnArmor.duration, breakRemaining: null };
  const group = new WeakMap();
  const projectile = { s3Weapon: attacker.weapon, owner: attacker, s3DamageGroup: group, wid: 'roller', type: 'drop' };
  const hit = amount => f.applyProjectileHit(f.G.projectiles, projectile, victim, amount);
  return { ...f, attacker, victim, group, projectile, hit };
}

test('#999 rejected spawn-flight contribution cannot erase the later admitted swing penetration', async () => {
  const f = await setup(), { victim, group } = f;
  victim.invuln = 1 / 60;
  f.hit(90);
  assert.equal(victim.hp, 100); assert.equal(victim.s3.spawnArmor.hp, 30);
  assert.equal(group.has(victim), false, 'a rejected first contact cannot establish the maximum');
  victim.invuln = 0;
  f.hit(150);
  assert.equal(victim.hp, 50); assert.equal(group.get(victim), 150);
});

test('#999 a rejected larger contribution preserves the previously admitted armor budget', async () => {
  const f = await setup(), { victim, group } = f;
  f.hit(90);
  assert.equal(victim.hp, 100); assert.equal(group.get(victim), 90);
  assert.equal(victim.s3.spawnArmor.hp, 0, 'armor absorption is an admitted contribution even without HP loss');
  victim.invuln = 1 / 60; f.hit(150);
  assert.equal(group.get(victim), 90);
  victim.invuln = 0; f.hit(160);
  assert.equal(victim.hp, 40, 'the real armor resolver receives 90 + 70, not 90 + 10');
});

test('#999 ordinary accepted group order, independent attacks and separate victims retain their owners', async () => {
  for (const amounts of [[90, 150], [150, 90], [60, 90, 150]]) {
    const f = await setup(); for (const amount of amounts) f.hit(amount);
    assert.equal(f.victim.hp, 50); assert.equal(f.group.get(f.victim), 150);
    f.hit(150); assert.equal(f.victim.hp, 50, 'repeat contact stays deduplicated');
    f.projectile.s3DamageGroup = new WeakMap(); f.hit(60);
    assert.equal(f.victim.hp, 50, 'a separate sub-threshold attack still meets break-delay armor');
  }
  const f = await setup(), other = f.make(); other.team = 1; other.invuln = 0;
  f.victim.invuln = 1; f.hit(90);
  f.applyProjectileHit(f.G.projectiles, f.projectile, other, 60);
  assert.equal(other.hp, 40); assert.equal(f.group.get(other), 60);
  assert.equal(f.group.has(f.victim), false);
});

test('#999 known remote invulnerability cannot shrink the next transmitted Roller contribution', async () => {
  const f = await setup(), sent = [];
  f.victim.remote = true;
  f.G.netm = { shouldApplyHit: () => 'send', sendHit: (...args) => { sent.push(args); return true; } };
  f.victim.invuln = 1; f.hit(90);
  assert.equal(sent.length, 0); assert.equal(f.group.has(f.victim), false);
  f.victim.invuln = 0; f.hit(150);
  assert.equal(sent.length, 1); assert.equal(sent[0][2], 150);
  assert.equal(f.group.get(f.victim), 150, 'pending send keeps the existing sender-side dedupe contract');
});

test('#999 emitted Roller units use the same restored budget through the production fidelity contact at 30/60/120Hz', async () => {
  const rows = [];
  for (const hz of [30, 60, 120]) {
    const f = await setup(), { attacker, victim } = f, ps = f.G.projectiles;
    attacker.aimDir.set(0, 0, 1); attacker.aimPoint.set(0, 1.05, 100); attacker.aimYaw = 0;
    f.setRandom(() => .5); ps.fireFlick(attacker, attacker.weapon);
    const [low, high] = ps.list;
    assert.ok(low.fidelityRollerUnit); assert.equal(low.s3DamageGroup, high.s3DamageGroup);
    // Use the existing near/far table, not a new damage/age calibration.
    const bands = attacker.weapon.flickDamageBands;
    const distance = bands[2][0] + (bands[2][1] - 90) / (bands[2][1] - bands[3][1]) * (bands[3][0] - bands[2][0]);
    const pointFor = (p, d) => p.start.clone().add(new f.THREE.Vector3(Math.sin(p.fidelitySectorYaw) * d, 0, Math.cos(p.fidelitySectorYaw) * d));
    const far = pointFor(low, distance), near = pointFor(high, 1);
    assert.ok(Math.abs(f.fidelityDamage(low, far) - 90) < 1e-8);
    assert.equal(f.fidelityDamage(high, near), 150);
    const clock = new f.FixedClock(); let frame = 0;
    for (let render = 0; render < hz / 10; render++) clock.advance(1 / hz, () => {
      frame++;
      if (frame === 1) {
        victim.invuln = 1 / 60;
        f.applyFidelityProjectileHit(ps, low, victim, 999, far);
        assert.equal(low.s3DamageGroup.has(victim), false);
      }
      if (frame === 2) {
        victim.invuln = 0;
        f.applyFidelityProjectileHit(ps, high, victim, 999, near);
      }
    });
    rows.push([victim.hp, victim.s3.spawnArmor.hp, low.s3DamageGroup.get(victim)]);
  }
  assert.deepEqual(rows, [[50, 0, 150], [50, 0, 150], [50, 0, 150]]);
});

test('#999 native swept contacts across an actual invulnerability expiry retain 50 HP penetration at every cadence', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await setup(), { attacker, victim } = f, ps = f.G.projectiles;
    f.G.level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [],
      single: [{ kind: 'box', min: [-50, -1, -50], max: [50, 0, 50] }] });
    f.G.physics = new f.Physics(f.G.level); f.G.camera = new f.THREE.PerspectiveCamera();
    f.G.paint.sample = () => 0; f.G.boss = null;
    victim.pos.set(0, 0, 5);
    // Existing spawn launch uses duration + 1e-6; choose its last three ticks.
    // Actor.update, rather than the test's contact callback, expires the timer.
    victim.invuln = 3 / 60 + 1e-6;
    attacker.aimDir.set(0, 0, 1); attacker.aimPoint.set(0, 1.05, 100); attacker.aimYaw = 0;
    let seed = 0x1a2b3c4d;
    f.setRandom(() => { seed |= 0; seed = seed + 0x6d2b79f5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296; });
    const contacts = [], damage = victim.damage; let frame = 0;
    victim.damage = function (amount, ...args) {
      contacts.push([frame, amount, this.invuln]);
      return damage.call(this, amount, ...args);
    };
    ps.fireFlick(attacker, attacker.weapon);
    const clock = new f.FixedClock();
    for (let render = 0; render < hz / 2; render++) clock.advance(1 / hz, dt => {
      frame++; f.G.time += dt; victim.update(dt); ps.update(dt);
    });
    assert.ok(contacts.some(([tick, amount, invuln]) => tick === 3 && amount === 150 && invuln > 0));
    assert.ok(contacts.some(([tick, amount, invuln]) => tick === 4 && amount === 150 && invuln === 0));
    assert.equal(victim.hp, 50, `${hz}Hz: later real glob must reach the armor resolver`);
  }
});

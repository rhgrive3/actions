import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// This counterfactual changes only a copied projectile descriptor in memory.
// The emitted fixture is a different scope; do not mislabel this source test.
if (process.env.INKWAVE_BUILT_SITE || process.env.INKWAVE_BUILT_ROOT) {
  throw new Error('Dynamo crossfire counterfactual requires the source fixture');
}

test('#1813 separate Dynamo owners retain independent central and secondary hits', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  f.setRandom(() => .5);
  try {
    function trial(mode) {
      const { G } = f;
      G.projectiles.clear(); G.actors.length = 0; G.time = 0;
      G.level = new f.Level({
        bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
        spawnPads: [[-20, 0, -20], [20, 0, 20]], spawnBarrier: 0,
        half: [], single: [{ kind: 'box', min: [-30, -1, -30], max: [30, 0, 30] }],
      });
      G.physics = new f.Physics(G.level); G.paint.sample = () => 0;
      function fire(x, unit) {
        const owner = f.make('s3-roller-heavy');
        owner.pos.set(x, 0, 0); owner.aimYaw = owner.yaw = 0;
        owner.aimPoint.set(x, 1.05, 80); owner.intent.fire = true;
        const before = new Set(G.projectiles.list);
        let ticks = 0;
        while (!G.projectiles.list.some(p => p.catalog && !before.has(p)) && ticks++ < 120) {
          G.time += 1 / 60; owner.update(1 / 60); owner.intent.fire = false;
        }
        const volley = G.projectiles.list.filter(p => p.catalog && !before.has(p));
        assert.equal(volley.filter(p => p.catalog.descriptor.unit === 1).length, 2);
        const p = volley.find(p => p.catalog.descriptor.unit === unit);
        assert.ok(p, 'admitted volley contains the selected source unit');
        assert.equal(p.catalog.descriptor.packet.UnitDamageRate, unit === 1 ? 0 : undefined);
        G.projectiles.list = G.projectiles.list.filter(q => !volley.includes(q) || q === p);
        return { owner, p };
      }
      const zero = fire(0, 1), main = fire(10, 0);
      if (mode === 'remove') G.projectiles.list = G.projectiles.list.filter(p => p !== zero.p);
      if (mode === 'force') {
        zero.p.catalog.descriptor = {
          ...zero.p.catalog.descriptor,
          packet: { ...zero.p.catalog.descriptor.packet, UnitDamageRate: 1 },
        };
      }
      function target(p) {
        const at = p.start.clone().addScaledVector(p.vel, 1 / 60);
        const victim = f.make('shooter'); victim.team = 1; victim.invuln = 0; victim.hp = 1000;
        victim.pos.copy(at); victim.pos.y -= .7;
        return victim;
      }
      const zeroTarget = target(zero.p), mainTarget = target(main.p);
      for (let i = 0; i < 12; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
      const result = { zeroLoss: 1000 - zeroTarget.hp, mainLoss: 1000 - mainTarget.hp };
      zero.owner.weaponRunner.reset(); main.owner.weaponRunner.reset();
      return result;
    }
    const present = trial('present'), removed = trial('remove'), forced = trial('force');
    assert.equal(present.zeroLoss, 0, 'zero-rate projectile cannot damage its target');
    assert.ok(present.mainLoss > 0, 'other owner central projectile hits its target');
    assert.deepEqual(present, removed, 'secondary unit does not change the other hit');
    assert.ok(forced.zeroLoss > 0, 'rate-one counterfactual proves the secondary target is reachable');
    assert.equal(forced.mainLoss, present.mainLoss, 'counterfactual leaves the other hit intact');
    console.log(JSON.stringify({ present, removed, forced }));
  } finally {
    f.restoreRandom(); f.G.projectiles.clear();
  }
});

// Both admitted shots geometrically reach one controlled target. The order is
// explicit because ProjectileSystem.update iterates its list backwards.
test('#1813 secondary before another owner central shot preserves same-target damage', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G } = f;
  f.setRandom(() => .5);
  try {
    function trial(mode) {
      G.projectiles.clear(); G.actors.length = 0; G.time = 0;
      G.level = new f.Level({
        bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
        spawnPads: [[-20, 0, -20], [20, 0, 20]], spawnBarrier: 0,
        half: [], single: [{ kind: 'box', min: [-30, -1, -30], max: [30, 0, 30] }],
      });
      G.physics = new f.Physics(G.level); G.paint.sample = () => 0;
      const owners = [];
      const originalApplyHit = G.projectiles.applyHit;
      try {
        function fire(unit) {
          const owner = f.make('s3-roller-heavy'); owners.push(owner);
          owner.pos.set(0, 0, 0); owner.aimYaw = owner.yaw = 0;
          owner.aimPoint.set(0, 1.05, 80); owner.intent.fire = true;
          const before = new Set(G.projectiles.list);
          let ticks = 0;
          while (!G.projectiles.list.some(p => p.catalog && !before.has(p)) && ticks++ < 120) {
            G.time += 1 / 60; owner.update(1 / 60); owner.intent.fire = false;
          }
          const volley = G.projectiles.list.filter(p => p.catalog && !before.has(p));
          assert.equal(volley.filter(p => p.catalog.descriptor.unit === 1).length, 2);
          const p = volley.find(p => p.catalog.descriptor.unit === unit);
          assert.ok(p, 'actual admitted volley contains selected source unit');
          assert.equal(p.catalog.descriptor.packet.UnitDamageRate, unit === 1 ? 0 : undefined);
          G.projectiles.list = G.projectiles.list.filter(q => !volley.includes(q) || q === p);
          return { owner, p };
        }
        const zero = fire(1), main = fire(0);
        assert.notEqual(zero.owner, main.owner, 'different admitted owners');
        if (mode === 'remove') G.projectiles.list = G.projectiles.list.filter(p => p !== zero.p);
        if (mode === 'force') zero.p.catalog.descriptor = {
          ...zero.p.catalog.descriptor,
          packet: { ...zero.p.catalog.descriptor.packet, UnitDamageRate: 1 },
        };
        const victim = f.make('shooter'); victim.team = 1; victim.invuln = 0; victim.hp = 1000;
        victim.pos.copy(zero.p.start).addScaledVector(zero.p.vel, 1 / 60); victim.pos.y -= .7;
        const calls = [];
        G.projectiles.applyHit = function(attacker, target, ...args) {
          if (target === victim) calls.push(attacker === zero.owner ? 'zero' : attacker === main.owner ? 'main' : 'other');
          return originalApplyHit.call(this, attacker, target, ...args);
        };
        G.projectiles.list.reverse(); // Secondary is evaluated first by reverse iteration.
        for (let i = 0; i < 12; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
        return { loss: 1000 - victim.hp, calls };
      } finally {
        G.projectiles.applyHit = originalApplyHit;
        for (const owner of owners) owner.weaponRunner.reset();
        G.projectiles.clear(); G.actors.length = 0;
      }
    }
    const present = trial('present'), removed = trial('remove'), forced = trial('force');
    assert.deepEqual(present, { loss: 180, calls: ['main'] });
    assert.deepEqual(removed, present, 'the secondary does not consume the other owner hit');
    assert.deepEqual(forced, { loss: 360, calls: ['zero', 'main'] },
      'rate-one counterfactual reaches the same target before the central shot');
    console.log(JSON.stringify({ sameTarget: { present, removed, forced } }));
  } finally {
    f.restoreRandom(); G.projectiles.clear(); G.actors.length = 0;
  }
});

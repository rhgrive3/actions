import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { fixture } from './source-fixture.mjs';

/**
 * Diagnostic for #1750. Prints physical endpoints and rebound-speed ratios for
 * ALL FOUR emitted Bloblobber bullets on a completely level, unobstructed floor.
 * This is INKWAVE code/model evidence, NOT a Nintendo reference capture.
 * Do not turn these numbers into parity assertions without retail measurements.
 */
test('issue #1750: flat-floor Bloblobber 0/-20/-45 flight logs all four rounds', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const weapon = MAIN_WEAPON_CATALOG.records.find(r => r.sourceActor === 'WeaponSlosherBathtub');
  assert.ok(weapon, '11.3.0 source weapon record must be present');
  const system = f.G.projectiles;
  const box = {
    solid: true, grate: false, id: 0,
    center: new f.THREE.Vector3(0, -0.5, 0),
    half: new f.THREE.Vector3(1000, 0.5, 1000),
    axes: [
      new f.THREE.Vector3(1, 0, 0),
      new f.THREE.Vector3(0, 1, 0),
      new f.THREE.Vector3(0, 0, 1),
    ],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  const floor = {
    blocks: [box], faces: [],
    queryBlocks: (_x0, _z0, _x1, _z1, out) => {
      out.length = 0; out.push(0); return out;
    },
  };
  const result = [];
  // Paired comparison: the second case changes ONLY the three small rounds'\n  // outgoing total-speed cap, never the shipped game code or saved weapon data.\n  for (const scenario of ['current', 'research_only_without_small_speed_cap']) for (const degrees of [0, -20, -45]) {
    system.clear(); f.G.actors.length = 0;
    f.G.physics.level = null;
    const actor = f.make(weapon.id);
    actor.form = 'kid'; actor.ink = 100;
    actor.aimYaw = 0;
    actor.aimPitch = degrees * Math.PI / 180;
    actor.pos.set(0, 0, 0);
    actor.character.root.position.copy(actor.pos);
    actor.aimPoint.set(0,
      1.05 + 70 * Math.sin(actor.aimPitch),
      70 * Math.cos(actor.aimPitch));
    actor.intent.fire = true;
    for (let i = 0; i < 24 && !system.list.some(p => p.catalog?.r?.sourceActor === 'WeaponSlosherBathtub'); i++)
      f.tick(actor);
    actor.intent.fire = false;
    const all = system.list.filter(p => p.catalog?.r?.sourceActor === 'WeaponSlosherBathtub');
    assert.equal(all.length, 4, 'one actual trigger must fire four real projectiles');
    f.G.physics.level = floor;
    const rounds = [];
    for (const p of all) {
      // _step resolves pending source release at the real, stationary character's muzzle;
      // each projectile uses its own elapsed flight time after its sourced 5F stagger.
      if (scenario === 'research_only_without_small_speed_cap' && p.catalog.descriptor.unit === 1) {\n        const source = p.catalog.r, params = source.parameters;\n        const group = params.BounceGroupParam;\n        const uncapped = group.BounceParam.map(row => (row.UnitOrderNum ?? 0) === 1\n          ? { ...row, BounceAfterMaxSpeed: null } : row);\n        p.catalog.r = { ...source, parameters: { ...params, BounceGroupParam: { ...group, BounceParam: uncapped } } };\n      }\n      const startZ = p.start.z;
      const sourceUnit = p.catalog.descriptor.unit;
      const index = p.catalog.index;
      const contacts = [];
      let endpoint = null;
      for (let frame = 1; frame <= 480; frame++) {
        const prevBounces = p.catalog.groundBounces;
        const before = p.vel.length();
        const done = system._step(p, 1 / 60);
        if (p.catalog.groundBounces !== prevBounces) {
          contacts.push({
            frame, z: Number((p.pos.z - p.start.z).toFixed(5)),
            vx: Number(p.vel.x.toFixed(5)),
            vy: Number(p.vel.y.toFixed(5)),
            vz: Number(p.vel.z.toFixed(5)),
            speed: Number(p.vel.length().toFixed(5)),
            speedBeforeFrame: Number(before.toFixed(5)),
          });
        }
        if (done) {
          endpoint = { frame, z: Number((p.pos.z - p.start.z).toFixed(5)), reason: 'contact-or-guard' };
          break;
        }
      }
      assert.ok(endpoint, 'all flat-ground rounds must finish before the 480F safety guard');
      assert.equal(contacts.length, 2, 'two physical rebounds, then third-floor termination');
      rounds.push({ sourceUnit, index, initialSpeed: Number((p.catalog.descriptor.packet?.SpawnSpeedGround ?? 0).toFixed(5)), contacts, endpoint, startZ: Number(startZ.toFixed(5)) });
    }
    result.push({ scenario, degrees, rounds });
  }
  console.log('BLOBLOBBER_FLAT_BOUNCE_AUDIT ' + JSON.stringify({
    reference: 'INKWAVE/main (source-guided 11.3.0 parameters, not retail trajectory capture)',\n    warning: 'research_only_without_small_speed_cap removes one runtime parameter on test-only cloned records. Not a proposed retail rule.',
    shotAngles: result,
  }));
});

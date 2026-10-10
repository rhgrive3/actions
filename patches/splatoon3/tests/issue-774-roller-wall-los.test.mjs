import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { rollerContactClear } from '../runtime/contact-recovery.mjs';

test('#774 roller roll contact is blocked by solid wall obstruction', () => {
  const player = { height: 1.6, squidHeight: 0.8 };
  const weapon = { rollWidth: 2.8 };

  // Roller actor A at origin, facing along +Z
  const a = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    smoothY: 0,
    form: 'human',
  };

  // Enemy B at (0, 0, 1.0)
  const e = {
    pos: new THREE.Vector3(0, 0, 1.0),
    yaw: 0,
    smoothY: 0,
    form: 'human',
  };

  // Mock physics with a wall segment that intercepts segment(drum, target)
  const blockedPhysics = {
    segment(from, to, hit, terrainOnly) {
      // Intercept any segment crossing Z = 0.5
      if ((from.z < 0.5 && to.z > 0.5) || (from.z > 0.5 && to.z < 0.5)) {
        hit.hit = true;
        hit.point.set(0, 0, 0.5);
        return { hit: true, point: hit.point };
      }
      hit.hit = false;
      return { hit: false };
    },
    level: {
      pointInside() { return false; },
    },
  };

  // With solid wall between roller drum and enemy, contact must be blocked
  assert.equal(
    rollerContactClear(a, e, weapon, blockedPhysics, player),
    false,
    'roller roll contact through solid wall is blocked'
  );

  // Without wall obstruction, contact is clear
  const clearPhysics = {
    segment(from, to, hit, terrainOnly) {
      hit.hit = false;
      return { hit: false };
    },
    level: {
      pointInside() { return false; },
    },
  };

  assert.equal(
    rollerContactClear(a, e, weapon, clearPhysics, player),
    true,
    'roller roll contact with clear line of sight is admitted'
  );
});

test('#774 roller roll contact rejects points inside geometry', () => {
  const player = { height: 1.6, squidHeight: 0.8 };
  const weapon = { rollWidth: 2.8 };

  const a = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    smoothY: 0,
    form: 'human',
  };

  const e = {
    pos: new THREE.Vector3(0, 0, 1.0),
    yaw: 0,
    smoothY: 0,
    form: 'human',
  };

  const insidePhysics = {
    segment() { return { hit: false }; },
    level: {
      pointInside(pt) {
        // drum is at z ~= 0.75
        return pt.z > 0.5;
      },
    },
  };

  assert.equal(
    rollerContactClear(a, e, weapon, insidePhysics, player),
    false,
    'roller drum inside geometry cannot damage opponent'
  );
});


// Full native Physics.segment + real WeaponRunner._roller contact (not a mock
// segment callback or a pure helper invocation). The wall has real OBB axes,
// hash-query membership and solidity used by the game at the collision point.
import { fixture as nativeWorld } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function contactWorld({ wall = 'none', x = 0, z = 1 } = {}) {
  const f = await nativeWorld({ fidelity: true, floor: true });
  const roller = f.make('roller');
  const target = f.make('shooter', { team: 1, x, z, hp: 1000 });
  f.G.actors = [roller, target];
  roller.pos.set(0, 0, 0);
  roller.yaw = 0;
  roller.grounded = true;
  // Feed an actual forward movement command. The S3 adapter intentionally
  // forbids Roller-drum contact on an idle stick even if fire is held.
  roller.intent.move.set(0, 0, 1);
  roller.vel.set(0, 0, 6);
  roller.ink = 100;
  roller.weaponRunner.cooldown = 0;
  if (wall !== 'none') {
    if (wall === 'forward' || wall === 'grate') {
      f.wall(.5, { width: 5, height: 4, thickness: .06 });
      if (wall === 'grate') {
        const b = f.G.level.blocks.at(-1);
        b.solid = false;
        b.grate = true; // non-solid/pass-through grate cannot occlude contact
      }
    }
    if (wall === 'side') {
      const V = (...a) => new f.THREE.Vector3(...a);
      f.G.level.blocks.push({ id: f.G.level.blocks.length, solid: true, grate: false,
        center: V(.45, 2, .75), half: V(.025, 2, 1),
        axes: [V(1,0,0), V(0,1,0), V(0,0,1)],
        faces: [-1,-1,-1,-1,-1,-1],
        aabbMin: V(.425, 0, -.25), aabbMax: V(.475, 4, 1.75) });
    }
  }
  return { f, roller, target };
}
function rollFrame(w) {
  w.f.tick(w.roller, { fire: true });
  return 1000 - w.target.hp;
}

test('#774 actual native roll contact blocks thin forward/parallel walls, preserves clear and pass-through controls', async () => {
  const clear = await contactWorld();
  const cleanDamage = rollFrame(clear);
  assert.equal(cleanDamage, clear.roller.weapon.rollDamage, 'ordinary uncovered roll still hits');
  for (const kind of ['forward', 'side']) {
    const w = await contactWorld({ wall: kind, x: kind === 'side' ? .9 : 0 });
    assert.equal(rollFrame(w), 0, kind + ' solid obstruction never applies contact damage');
    assert.equal(w.roller.weaponRunner.rollHits.size, 0, 'rejected contact does not consume cooldown');
  }
  const grate = await contactWorld({ wall: 'grate' });
  assert.equal(rollFrame(grate), cleanDamage, 'transparent non-solid grate preserves hit admission');
  const sameSide = await contactWorld({ wall: 'forward', z: .35 });
  assert.equal(rollFrame(sameSide), cleanDamage, 'a valid contact on the same side remains active');
});

test('#774 live roller damage/LOS outcome is fixed-tick identical at 30/60/120Hz render cadence', async () => {
  for (const wall of ['none', 'forward']) {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const w = await contactWorld({ wall }), clock = new FixedClock(), samples = [];
      for (let frame = 0; frame < hz * .3; frame++) clock.advance(1 / hz, () => {
        rollFrame(w);
        samples.push([w.target.hp, w.roller.weaponRunner.rollHits.size]);
      });
      assert.equal(clock.ticks, 18);
      traces.push(samples);
    }
    assert.deepEqual(traces[0], traces[1]);
    assert.deepEqual(traces[1], traces[2]);
    assert.equal(traces[0][0][0] < 1000, wall === 'none');
  }
});

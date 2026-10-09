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

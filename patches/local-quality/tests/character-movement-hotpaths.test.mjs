import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { rollerContactClear } from '../../splatoon3/runtime/contact-recovery.mjs';

const read = (rel) => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const readRepo = (rel) => fs.readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');

test('MOV-01 superjump.mjs reuses module-scoped _wallOrigin and _wallDir in prepareSuperJump', async () => {
  const src = readRepo('patches/splatoon3/runtime/superjump.mjs');
  assert.match(src, /const _wallOrigin = new THREE\.Vector3\(\), _wallDir = new THREE\.Vector3\(\);/);
  assert.match(src, /const origin = _wallOrigin\.set\(a\.pos\.x \+ 0, a\.pos\.y \+ \.3, a\.pos\.z \+ 0\);/);
  assert.match(src, /const direction = _wallDir\.copy\(s\.wallSupport\)\.negate\(\);/);

  const { fixture } = await import('../../splatoon3/tests/source-fixture.mjs');
  const f = await fixture({
    extraExports: "export { prepareSuperJump } from './patches/splatoon3/runtime/superjump.mjs';",
  });
  const seenOrigins = new Set();
  const seenDirs = new Set();
  f.G.physics = {
    raycast(origin, dir) {
      seenOrigins.add(origin);
      seenDirs.add(dir);
      return { hit: true, normal: { y: 0 }, face: 0, u: 0.5, v: 0.5 };
    },
  };
  f.G.paint = {
    sample() { return 1; },
  };
  const actor = {
    team: 0,
    superJumpState: {
      phase: 'charge',
      t: 0,
      wallSupport: new f.THREE.Vector3(1, 0, 0),
    },
    pos: new f.THREE.Vector3(2, 1, -3),
    vel: new f.THREE.Vector3(0, 0, 0),
    form: 'kid',
    grounded: false,
    wallHit: {},
  };
  for (let i = 0; i < 5; i++) {
    assert.equal(f.prepareSuperJump(actor, 1 / 60), true);
  }
  assert.equal(seenOrigins.size, 1, 'raycast origin vector should be reused across ticks');
  assert.equal(seenDirs.size, 1, 'raycast direction vector should be reused across ticks');
});

test('MOV-02 rollerContactClear reuses scratch vectors and hit instance across calls', () => {
  const seenStart = new Set();
  const seenEnd = new Set();
  const seenHits = new Set();
  const attacker = {
    pos: new THREE.Vector3(1, 2, 3),
    yaw: 0.4,
    smoothY: 0,
  };
  const enemy = {
    pos: new THREE.Vector3(1.4, 2, 3.5),
    form: 'kid',
    smoothY: 0,
  };
  const weapon = { rollWidth: 1.8 };
  const physics = {
    level: { pointInside() { return false; } },
    segment(a, b, hit) {
      seenStart.add(a);
      seenEnd.add(b);
      seenHits.add(hit);
      hit.hit = false;
      return hit;
    },
  };
  const player = { height: 1.6, squidHeight: 0.6 };
  for (let i = 0; i < 6; i++) {
    enemy.pos.x = 1.4 + i * 0.05;
    assert.equal(rollerContactClear(attacker, enemy, weapon, physics, player), true);
  }
  assert.equal(seenStart.size, 2, 'from and drum scratch vectors should be reused across calls');
  assert.equal(seenEnd.size, 2, 'drum and target scratch vectors should be reused across calls');
  assert.equal(seenHits.size, 1, 'hit scratch object should be reused across calls');
});

test('MOV-03..05 and MOV-08a..b compose cleanly in cameraRig.js, player.js, actor.js, bots.js, and character.js', () => {
  const builtCam = adaptBuildSource('src/game/cameraRig.js', read('src/game/cameraRig.js'));
  assert.match(builtCam, /if \(projectionDirty\) gc\.updateProjectionMatrix\(\);\s*gc\.updateMatrixWorld\(\);/);

  const builtPlayer = adaptBuildSource('src/game/player.js', read('src/game/player.js'));
  assert.match(builtPlayer, /const ew = this\._effWeapon \|\| \(this\._effWeapon = \{\}\);/);
  assert.match(builtPlayer, /const allies = this\._padMapAllies \|\| \(this\._padMapAllies = \[\]\);/);

  const builtActor = adaptBuildSource('src/game/actor.js', read('src/game/actor.js'));
  assert.match(builtActor, /const si = this\._stormIntent \|\| \(this\._stormIntent =/);
  assert.match(builtActor, /if \(intent\.jumpPressed !== undefined\) intent\.jumpPressed = false;/);

  const builtBots = adaptBuildSource('src/game/bots.js', read('src/game/bots.js'));
  assert.match(builtBots, /const choices = this\._paintChoices \|\| \(this\._paintChoices = \[\]\);/);
  assert.match(builtBots, /const tried = this\._triedGoals \|\| \(this\._triedGoals = new Set\(\)\); tried\.clear\(\);/);

  const builtChar = adaptBuildSource('src/game/character.js', read('src/game/character.js'));
  assert.match(builtChar, /_q3\.setFromRotationMatrix\(this\.model\.matrixWorld\);/);
  assert.match(builtChar, /this\.root\.getWorldPosition\(_v5\)\.addScaledVector\(UP, 0\.26/);
});

test('MOV-06a..c and MOV-07a..b native movement and triangle-world modules reuse module-scoped scratch structures', () => {
  assert.match(readRepo('patches/native-stages/runtime/native-climb.mjs'), /const _v0=new THREE\.Vector3\(\),_v1=new THREE\.Vector3\(\),_v2=new THREE\.Vector3\(\);/);
  assert.match(readRepo('patches/native-stages/runtime/native-surge.mjs'), /const _goal=new THREE\.Vector3\(\),_spine=new THREE\.Vector3\(\),_normal=new THREE\.Vector3\(\),_v0=new THREE\.Vector3\(\),_v1=new THREE\.Vector3\(\),_v2=new THREE\.Vector3\(\);/);
  assert.match(readRepo('patches/native-stages/runtime/native-jump-attach.mjs'), /const _normal=new THREE\.Vector3\(\),_goal=new THREE\.Vector3\(\),_start=new THREE\.Vector3\(\),_v0=new THREE\.Vector3\(\),_v1=new THREE\.Vector3\(\),_v2=new THREE\.Vector3\(\);/);
  assert.match(readRepo('patches/native-stages/runtime/triangle-world.mjs'), /const _groundOrigin=V\(\),_groundDown=new THREE\.Vector3\(0,-1,0\);/);
  assert.match(readRepo('patches/native-stages/runtime/native-physics.mjs'), /const FOOT_SUPPORT_KEYS=Object\.freeze\(\['block','face','u','v','center','grate'\]\);/);
});

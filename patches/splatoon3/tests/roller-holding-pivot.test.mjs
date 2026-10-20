// Holding calibration must move the hands, not the live cylinder used by paint.
// Uses the existing production-composed native Actor fixture, not a new rig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const PIVOT_GATE = 'if (neededGround && rollBlend > .001 && armLeftHeld && bound && rollAxisAligned && Number.isFinite(this.weapon.drumA)) {';
function exact(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'one current-source pivot anchor');
  return source.replace(needle, replacement);
}
async function trace(mode) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true,
    realProjectiles: true, vmMathRandom: () => .4,
    adaptRuntime(rel, source) {
      if (rel !== 'patches/splatoon3/runtime/roller.mjs') return source;
      if (mode === 'control') return exact(source, PIVOT_GATE, PIVOT_GATE.replace('if (', 'if (false && '));
      if (mode === 'off-center') return exact(source, 'target.copy(rollTarget);', 'target.copy(rollTarget).addScaledVector(rollAxis, .02);');
      if (mode === 'lost-phase') return exact(source, 'rollDrum.rotation.x = this.weapon.drumA + lo;', 'rollDrum.rotation.x = this.weapon.drumA;');
      return source;
    } });
  const { G, THREE } = f, v = () => new THREE.Vector3();
  G.scene = new THREE.Scene();
  G.level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, 0], [20, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -.5, -30], max: [30, 0, 30] }] });
  G.physics = new f.Physics(G.level); G.projectiles = new f.Projectiles(G.scene);
  const a = new f.Actor({ team: 0, name: 'holding pivot regression', isLocal: true, weapon: 'roller',
    CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; a.character.onEvent = null; G.actors = [a]; G.scene.add(a.character.root);
  a.pos.set(0, 0, 0); a.grounded = a.ground.hit = true; a.groundN.set(0, 1, 0);
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 20); a.intent.move.set(0, 0, 1); a.intent.fire = true;
  const rows = [], captured = {};
  const solve = a.character._solveLimb;
  a.character._solveLimb = function (limb, target, pole, orientation, weight, index) {
    const side = limb === this.limbs.armR ? 'right' : limb === this.limbs.armL ? 'left' : null;
    if (side) captured[side] = [limb, target.clone(), pole.clone(), orientation?.clone(), weight, index];
    return solve.call(this, limb, target, pole, orientation, weight, index);
  };
  for (let tick = 1; tick <= 180; tick++) {
    if (tick === 121) a.intent.fire = false;
    a.ink = 100; f.tick(a); const c = a.character, w = c.weapon;
    c.root.updateMatrixWorld(true);

    if (!w.def.drum.boundingBox) w.def.drum.computeBoundingBox();
    const box = w.def.drum.boundingBox;
    const center = w.drum.localToWorld(box.min.clone().add(box.max).multiplyScalar(.5));
    const m = w.drum.matrixWorld.elements, axis = v().set(m[0], m[1], m[2]).normalize();
    const hand = c.bones.handR.getWorldPosition(v());
    const errors = ['handR', 'handL'].map(name => c.bones[name].getWorldPosition(v())
      .distanceTo(w.off.localToWorld(w.def[name].pos.clone())));
    rows.push({ tick, contact: !!c._s3RollerContactPose, roll: c.wRoll, center: center.toArray(), axis: axis.toArray(), radial: [m[4], m[5], m[6], m[8], m[9], m[10]],
      spin: [w.drumA, w.drumW], hand: hand.toArray(),
      errors, pos: Array.from(a.pos.toArray()), ink: a.ink, rolling: a.weaponRunner.rolling });
    // The next native frame resets the rig; full trajectory parity below also
    // checks that this same-clock exercise does not contaminate release.
    if (mode === 'current' && tick === 120) {
    const c = a.character, w = c.weapon, phase = w.drumA, speed = w.drumW;
    const repeat = (side, weight) => {
      const [limb, target, pole, orientation, oldWeight, index] = captured[side];
      solve.call(c, limb, target.clone(), pole.clone(), orientation?.clone(), weight ?? oldWeight, index);
      c.root.updateMatrixWorld(true);
      return Array.from(w.drum.matrixWorld.elements);
    };
    const first = repeat('right'), rotation = w.drum.rotation.x, second = repeat('right');
    assert.equal(w.drumA, phase); assert.equal(w.drumW, speed);
    assert.ok(Math.abs(w.drum.rotation.x - rotation) < 1e-12, 'repeated IK must not accumulate drum compensation');
    assert.ok(first.every((value, i) => Math.abs(value - second[i]) < 1e-9), 'repeated IK preserves the full drum transform');
    repeat('left');
    assert.equal(w.drum.rotation.x, rotation, 'left IK must not undo right-hand compensation');
    repeat('right', .5);
    assert.equal(w.drum.rotation.x, phase, 'ineligible right IK restores canonical drum phase');
    }
  }
  if (mode === 'current') {
    a.character._s3CancelRollerFlick();
    assert.equal(a.character._s3RollerGripBlend, 0, 'cancelling clears derived holding blend');
  }
  a.character.dispose(); G.actors = [];
  assert.equal(rows.length, 180, 'natural entry, settled hold and release are recorded');
  return rows;
}
function sameContact(before, after) {
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    assert.deepEqual({ tick: b.tick, pos: b.pos, ink: b.ink, rolling: b.rolling, contact: b.contact, roll: b.roll },
      { tick: a.tick, pos: a.pos, ink: a.ink, rolling: a.rolling, contact: a.contact, roll: a.roll }, 'native gameplay unchanged');
    // Geometry roundoff only: 1nm is far below the existing 1e-5 paint-contact gate.
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(b.center[j] - a.center[j]) < 1e-9, 'live drum center must stay pinned');
      assert.ok(Math.abs(b.axis[j] - a.axis[j]) < 1e-9, 'live drum axle must stay pinned');
    }
    assert.deepEqual(Array.from(b.spin), Array.from(a.spin), 'native drum clock and speed are unchanged');
    assert.ok(b.radial.every((value, j) => Math.abs(value - a.radial[j]) < 1e-9), 'live drum radial frame must stay pinned');
    if (b.contact) assert.ok(b.errors.every(error => error < 1e-6), 'both post-IK wrists stay on their original sockets');
  }
}
test('held Roller lowers its hands about the same live cylinder; off-center fault is rejected', async () => {
  const control = await trace('control'), current = await trace('current');
  sameContact(control, current);
  const drop = Math.max(...current.map((row, i) => control[i].hand[1] - row.hand[1]));
  assert.ok(drop > .05, 'the holding calibration actually lowers the hand, not a no-op');
  const correction = current.map((row, i) => row.hand[1] - control[i].hand[1]);
  const entryStep = Math.max(...correction.slice(1, 60).map((value, i) => Math.abs(value - correction[i])));
  assert.ok(entryStep < .05, 'existing roll blend must not add a sudden 5cm wrist step at entry');
  const releaseStep = rows => Math.abs(rows[120].hand[1] - rows[119].hand[1]);
  assert.ok(releaseStep(current) <= releaseStep(control) + .01, 'release must not enlarge the native vertical wrist step by over 1cm');
  assert.ok(correction[120] < -.001, 'release retains its reachable fading correction');
  assert.ok(Math.abs(correction[179]) < .005, 'the existing release clock fades the correction away');
  const lostPhase = await trace('lost-phase');
  assert.throws(() => sameContact(control, lostPhase), /live drum radial frame must stay pinned/,
    'a missing counter-spin must not pass even with an axis-centered cylinder');
  const fault = await trace('off-center');
  assert.throws(() => sameContact(control, fault), /live drum center must stay pinned/,
    'a deliberate 2cm wrist-only offset must not pass the contact-preservation gate');
});

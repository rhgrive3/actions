// Holding calibration must move the hands, not the live cylinder used by paint.
// Uses the existing production-composed native Actor fixture, not a new rig.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';
import { fixture } from './source-fixture.mjs';

const SUPPORT_GATE = "if (limb === this.limbs.armL && this.weaponKind === 'roller' && this.kidForm && !this.dance &&";
const PIVOT_GATE = 'if (neededGround && rollBlend > .001 && armLeftHeld && bound && rollAxisAligned && Number.isFinite(this.weapon.drumA)) {';
function exact(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'one current-source pivot anchor');
  return source.replace(needle, replacement);
}
function holdingVariant(mode, source) {
  // Isolate the original hand-height calibration from the new lateral layout.
  // Its old high-hand counterfactual has different native reach feedback.
  // The full emitted candidate is still exercised by the right-grip and side tests.
  if (['control', 'pivot-current', 'left-disabled', 'off-center', 'lost-phase'].includes(mode))
    source = exact(source, 'target.addScaledVector(axis, -.09 * rollBlend / scale);', 'void 0; // isolated pivot control');

  if (mode === 'lateral-disabled') return exact(source,
    'target.addScaledVector(axis, -.09 * rollBlend / scale);', 'void 0; // deliberate missing lateral hold');
  if (mode === 'right-disabled') return exact(source,
    "if (contacting && armLeftHeld && d.modelId === 'roller' && rollBlend > .001 && Number.isFinite(d.modelScale)) {", 'if (false) {');
  if (mode === 'right-uncompensated') return exact(source, 'this.weapon.off.position.sub(delta);', '// deliberate uncompensated attachment');
  if (mode === 'left-disabled') return exact(source, SUPPORT_GATE, SUPPORT_GATE.replace('if (', 'if (false && '));
  if (mode === 'control') return exact(source, PIVOT_GATE, PIVOT_GATE.replace('if (', 'if (false && '));
  if (mode === 'off-center') return exact(source, 'target.copy(rollTarget);', 'target.copy(rollTarget).addScaledVector(rollAxis, .02);');
  if (mode === 'lost-phase') return exact(source, 'rollDrum.rotation.x = this.weapon.drumA + lo;', 'rollDrum.rotation.x = this.weapon.drumA;');
  return source;
}
const emittedCompiler = process.env.INKWAVE_BUILT_SITE ? await (async () => {
  // Keep the real emitted module as the subject. Counterfactuals may use the
  // source anchors only after reproducing its exact production output bytes.
  const { transformSync } = await import(process.env.ESBUILD_MODULE
    ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
  const canonical = fs.readFileSync(new URL('../runtime/roller.mjs', import.meta.url), 'utf8');
  const rel = 'patches/splatoon3/runtime/roller.mjs';
  const compile = code => compactModuleStrings(transformSync(adaptBuildSource(rel, code), {
    loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: rel,
  }).code).code;
  return { canonical, compile, original: compile(canonical) };
})() : null;
function holdingRuntimeVariant(mode, source) {
  if (!emittedCompiler) return holdingVariant(mode, source);
  assert.equal(source, emittedCompiler.original, 'actual emitted Roller must match the exact production compiler before fault injection');
  const altered = holdingVariant(mode, emittedCompiler.canonical);
  return altered === emittedCompiler.canonical ? source : emittedCompiler.compile(altered);
}

function shaftSideClearance(c, w, THREE) {
  // Actual skinned torso silhouette, not a sign test against the actor origin.
  const torso = new Set(['hips', 'spine', 'chest', 'hem', 'hemF', 'hemB']);
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  let vertices = 0;
  c.skeleton.update();
  c.kid.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinIndex) return;
    for (let parent = mesh; parent && parent !== c.kid; parent = parent.parent)
      if (!parent.visible) return;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < indices.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++)
        if (torso.has(mesh.skeleton.bones[indices.getComponent(i, j)]?.name))
          weight += weights.getComponent(i, j);
      if (weight < .75) continue;
      bounds.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld));
      vertices++;
    }
  });
  assert.ok(vertices > 100, 'measure the actual skinned torso, not an empty bound');
  const rear = w.off.localToWorld(new THREE.Vector3(0, 0, -.112 * w.def.modelScale));
  const front = w.off.localToWorld(new THREE.Vector3(0, 0, .215 * w.def.modelScale));
  const t = Math.max(0, Math.min(1, (bounds.max.z - rear.z) / (front.z - rear.z)));
  return bounds.min.x - (rear.x + (front.x - rear.x) * t);
}
function assertSideHold(rows) {
  const held = rows.filter(row => row.shaftClearance !== null);
  assert.ok(held.length > 30, 'side clearance covers a settled gait, not one chosen frame');
  assert.ok(held.every(row => row.shaftClearance > .005),
    'the shaft axis must clear the actual torso right edge, not merely lie right of its center');
}

function catalogGripRecorder(f) {
  // Execute the actual browser recorder against the native rig, not a copy of
  // its socket formula. This source extraction must fail closed if it moves.
  const source = fs.readFileSync(new URL('../../../scripts/check-inkwave-motion-catalog.mjs', import.meta.url), 'utf8');
  const start = '  function grip(ch, side) {', end = '  function record(ch, a, frame, last, invariant, contactEpoch) {';
  assert.equal(source.split(start).length, 2); assert.equal(source.split(end).length, 2);
  const body = source.slice(source.indexOf(start), source.indexOf(end));
  return new Function('THREE', 'C', 'FIST_OFFSET', 'GRIP_HOLE_L', body + '; return grip;')(
    f.THREE, f.CHARACTER_CHANNELS, f.FIST_OFFSET, f.GRIP_HOLE_L);
}

async function trace(mode, exerciseRepeatedIK = false) {
  const adaptHoldingRuntime = (rel, source) =>
    rel === 'patches/splatoon3/runtime/roller.mjs' ? holdingRuntimeVariant(mode, source) : source;
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true,
    realProjectiles: true, vmMathRandom: () => .4,
    extraExports: "export { FIST_OFFSET, GRIP_HOLE_L } from './inkwave-public/src/game/character-weapons.js';",
    adaptRuntime: adaptHoldingRuntime, adaptEmittedRuntime: adaptHoldingRuntime });
  const { G, THREE } = f, v = () => new THREE.Vector3();
  const catalogGrip = mode === 'current' ? catalogGripRecorder(f) : null;
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
    const left = c.bones.handL, blend = c._s3RollerGripBlend || 0;
    const hole = w.def.gripL.pos.clone().sub(w.def.handL.pos).applyQuaternion(w.def.handL.quat.clone().invert());
    const target = w.def.gripL.pos.clone();
    target.z += Number.isFinite(c._s3RollerSupportAdvance) ? c._s3RollerSupportAdvance :
      Math.max(0,(w.def.gripR.pos.z + w.def.fold.pivot.z)*.5-target.z)*.15*blend;
    const actualHole = left.localToWorld(hole), requestedHole = w.off.localToWorld(target);
    const errors = [hand.distanceTo(w.off.localToWorld(w.def.handR.pos.clone().add(v().set(0, 0, c._s3RollerRightAdvance || 0)))), actualHole.distanceTo(requestedHole)];
    const palmUp = v().set(-1, 0, 0).applyQuaternion(left.getWorldQuaternion(new THREE.Quaternion()))
      .dot(v().set(0, 1, 0).applyQuaternion(w.off.getWorldQuaternion(new THREE.Quaternion())));
    const rightHole = w.off.worldToLocal(c.bones.handR.localToWorld(v().set(.0255, -.0525, 0)));
    const rightFraction = (rightHole.z / w.def.modelScale - -.112) / (.215 - -.112);
    const shaftClearance = (mode === 'current' || mode === 'lateral-disabled') &&
      c._s3RollerContactPose && c.wRoll > .99 ? shaftSideClearance(c, w, THREE) : null;
    const stroke = a.weaponRunner.s3ContactPaint;
    const paintError = stroke?.active ? stroke.point.clone()
      .addScaledVector(stroke.heading, stroke.depth * .5).distanceTo(center) : null;
    const feet = [Array.from(c.bones.footL.getWorldPosition(v()).toArray()),
      Array.from(c.bones.footR.getWorldPosition(v()).toArray())];
    const catalog = catalogGrip ? catalogGrip(c, 'right') : null;
    if (catalogGrip && tick === 90) {
      for (const advance of [undefined, NaN, Infinity, 0]) {
        const missing = Object.assign(Object.create(c), { _s3RollerRightAdvance: advance });
        assert.ok(catalogGrip(missing, 'right').gap >= .025,
          'missing or invalid effective advance must expose the old detached socket');
      }
      const movedHand = c.bones.handR.clone(false);
      movedHand.matrixAutoUpdate = false;
      movedHand.matrix.copy(c.bones.handR.matrixWorld);
      movedHand.matrix.elements[12] += .03;
      movedHand.matrixWorldNeedsUpdate = true;
      movedHand.updateWorldMatrix(false, false);
      assert.ok(Math.abs(movedHand.matrixWorld.elements[12] - c.bones.handR.matrixWorld.elements[12] - .03) < 1e-12,
        'the detached-hand fault actually changes its native world transform');
      const detached = Object.assign(Object.create(c), { bones: { ...c.bones, handR: movedHand } });
      assert.ok(catalogGrip(detached, 'right').gap >= .025,
        'moving the actual measured hand 3cm must still fail the unchanged grip budget');
    }
    rows.push({ catalog, shaftClearance, paintError, feet, rightAdvance: c._s3RollerRightAdvance || 0, rightFraction, tick, contact: !!c._s3RollerContactPose, roll: c.wRoll, center: center.toArray(), axis: axis.toArray(), radial: [m[4], m[5], m[6], m[8], m[9], m[10]],
      spin: [w.drumA, w.drumW], hand: hand.toArray(), rightMatrix: Array.from(c.bones.handR.matrixWorld.elements),
      weaponMatrix: Array.from(w.off.matrixWorld.elements), palmUp,
      errors, pos: Array.from(a.pos.toArray()), ink: a.ink, rolling: a.weaponRunner.rolling });
    // Repeated solves mutate the live pose. Exercise them on an isolated trace
    // so the following release comparison starts from untouched native frames.
    if (exerciseRepeatedIK && tick === 120) {
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
  if (mode === 'current' || mode === 'pivot-current') {
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
      assert.ok(Math.abs(b.center[j] - a.center[j]) < 1e-9, `live drum center must stay pinned: tick ${i + 1} axis ${j} delta ${b.center[j] - a.center[j]}`);
      assert.ok(Math.abs(b.axis[j] - a.axis[j]) < 1e-9, 'live drum axle must stay pinned');
    }
    assert.deepEqual(Array.from(b.spin), Array.from(a.spin), 'native drum clock and speed are unchanged');
    assert.ok(b.radial.every((value, j) => Math.abs(value - a.radial[j]) < 1e-9), 'live drum radial frame must stay pinned');
    if (b.contact) {
      assert.ok(b.errors[0] < 1e-6, 'right wrist stays on its original socket');
      assert.ok(b.errors[1] <= .0005, 'left palm contact stays within the existing native 0.5mm retry threshold');
      if (b.roll > .99) assert.ok(b.palmUp > .99, 'settled left palm supports the shaft from underneath');
    }
  }
}
test('held Roller lowers its hands about the same live cylinder; off-center fault is rejected', async () => {
  const control = await trace('control'), current = await trace('pivot-current');
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
  const leftDisabled = await trace('left-disabled');
  for (let i = 0; i < current.length; i++) {
    assert.deepEqual(current[i].rightMatrix, leftDisabled[i].rightMatrix, 'left support must not move the right hand on later frames');
    assert.deepEqual(current[i].weaponMatrix, leftDisabled[i].weaponMatrix, 'left support must not move the whole weapon on later frames');
  }
  const detached = current.map(row => ({ ...row, errors: [row.errors[0], .000501] }));
  assert.throws(() => sameContact(control, detached), /left palm contact/, 'contact beyond native 0.5mm budget is rejected');
  const lostPhase = await trace('lost-phase');
  assert.throws(() => sameContact(control, lostPhase), /live drum radial frame must stay pinned/,
    'a missing counter-spin must not pass even with an axis-centered cylinder');
  await trace('pivot-current', true);
  const fault = await trace('off-center');
  assert.throws(() => sameContact(control, fault), /live drum center must stay pinned/,
    'a deliberate 2cm wrist-only offset must not pass the contact-preservation gate');
});


test('rolling right grip advances to one third without moving the actual drum or release pose', async () => {
  const before = await trace('right-disabled'), after = await trace('right-enabled');
  sameContact(before, after);
  let settled = 0;
  for (let i = 0; i < after.length; i++) {
    const a = before[i], b = after[i];
    assert.ok(b.weaponMatrix.every((v, j) => Math.abs(v - a.weaponMatrix[j]) < 1e-9),
      'moving the hand must not translate the weapon or its paint owner');
    if (!b.contact) {
      assert.equal(b.rightAdvance, 0, 'nonrolling and release keep the canonical attachment');
      assert.ok(b.rightMatrix.every((v, j) => Math.abs(v - a.rightMatrix[j]) < 1e-9),
        'nonrolling right hand keeps its native pose');
    } else if (b.roll > .99999) {
      assert.ok(Math.abs(b.rightFraction - 1 / 3) < 1e-5,
        'actual palm hole reaches one third of the black grip, not a reported scalar alone');
      settled++;
    }
  }
  assert.ok(settled > 30, 'settled rolling is actually exercised');
  assert.throws(() => assert.ok(Math.abs(before[89].rightFraction - 1 / 3) < 1e-5),
    'the old right socket must fail the new position requirement');
  const uncompensated = await trace('right-uncompensated');
  assert.throws(() => sameContact(before, uncompensated), /live drum center must stay pinned/,
    'moving the wrist without its inverse attachment cannot pass');
});


test('rolling shaft clears the torso while actual paint follows the shifted drum', async () => {
  const current = await trace('current');
  assertSideHold(current);
  for (const row of current) {
    assert.ok(row.catalog.gap < 1e-6, 'catalog measures the native effective right socket through holding and release');
    assert.equal(row.catalog.held, true, 'effective contact is measured, not exempted from held-hand validation');
  }
  assert.ok(current[89].catalog.boneOriginGap >= .025,
    'raw old-socket diagnostic remains visible after correcting physical grip measurement');
  const lateralDisabled = await trace('lateral-disabled');
  assert.throws(() => assertSideHold(lateralDisabled), /shaft axis must clear/,
    'the previous centered holding must fail the actual body-edge criterion');
  const movedFeet = current[0].feet.map(foot => Array.from(foot));
  movedFeet[0][0] += 1e-12;
  assert.throws(() => assert.deepEqual(movedFeet, lateralDisabled[0].feet),
    'one changed foot component must fail exact equality after realm normalization');
  for (let i = 0; i < current.length; i++) {
    const a = lateralDisabled[i], b = current[i];
    assert.deepEqual(b.feet, a.feet, 'side holding does not move either native foot');
    assert.deepEqual({ pos: b.pos, ink: b.ink, rolling: b.rolling, contact: b.contact, roll: b.roll },
      { pos: a.pos, ink: a.ink, rolling: a.rolling, contact: a.contact, roll: a.roll },
      'side holding does not change actor movement, ink, or admission');
    if (b.paintError !== null) assert.ok(b.paintError < 1e-5, 'paint follows its own actual shifted drum');
    if (b.contact) {
      assert.ok(b.center.every((value, j) =>
        Math.abs(value - a.center[j] + .09 * b.roll * a.axis[j]) < 1e-8),
        'side holding translates the actual drum along its axle without gait-dependent drift');
    } else {
      assert.deepEqual(b.weaponMatrix, a.weaponMatrix, `nonrolling weapon returns to the canonical pose: tick ${i + 1}`);
    }
  }


  for (const row of current) if (row.contact) {
    assert.ok(row.errors[0] < 1e-6, 'the full candidate right wrist stays on its effective grip');
    assert.ok(row.errors[1] <= .0005, 'the full candidate left palm retains native contact tolerance');
    if (row.roll > .99) assert.ok(row.palmUp > .99, 'the full candidate retains underhand support');
  }
});

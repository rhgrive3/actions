import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { SPECIAL_DEVICES, SPECIAL_DEVICE_MOTION } from '../runtime/special-presentation.mjs';

// Real procedural Character bones/IK and device geometry; this does not load
// the optional source animation clips or establish Nintendo joint curves.
const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true });
const { THREE: T, G } = f;
G.scene = new T.Scene();
const a = new f.Actor({ team: 0, name: 'holds-quality', weapon: 'shooter', CharacterClass: f.Character });
const ch = a.character;
ch.actor = a; G.actors = [a]; G.scene.add(ch.root);
a.pos.set(0, 0, 0); a.grounded = a.ground.hit = true;
const view = { form: 'kid', hp: 100, grounded: true };
function activate(id, phase = 'active') {
  a.specialActive = null; a._s3AllSpecialState = null; ch.update(0, view);
  a.specialActive = { id, phase };
  a._s3AllSpecialState = { id, phase, t: 1, charge: .7, stampHolding: false };
  ch.update(0, view);
}
function step(dt) { G.time += Math.max(0, dt); ch.update(dt, view); ch.root.updateWorldMatrix(true, true); }
function gripErrors(d) {
  return ['R', 'L'].filter(side => d.spec.hands?.[side]).map(side => {
    const target = new T.Vector3(...d.spec.hands[side]); d.model.root.localToWorld(target);
    const hole = new T.Vector3(side === 'R' ? .0255 : -.0255, -.0525, 0); ch.bones['hand' + side].localToWorld(hole);
    return hole.distanceTo(target);
  });
}

test('handheld sockets meet the actual finger holes across aims, charges and render rates', () => {
  for (const hz of [30, 60, 120]) for (const id of ['tentaMissiles', 'inkjet', 'ultraStamp', 'superChump', 'waveBreaker', 'splattercolorScreen']) {
    activate(id);
    for (let i = 0; i < 8; i++) {
      a.aimYaw = .9 + i * .03; a.aimPitch = -.6 + i * .15;
      a.aimDir.set(Math.sin(a.aimYaw) * Math.cos(a.aimPitch), Math.sin(a.aimPitch), Math.cos(a.aimYaw) * Math.cos(a.aimPitch));
      a._s3AllSpecialState.charge = i / 7; a.intent.sub = i > 3;
      step(1 / hz);
      for (const d of ch.s3SpecialDevices()) for (const error of gripErrors(d)) assert.ok(error < 1e-5, `${id} ${hz}Hz grip error ${error}`);
    }
  }
  a.intent.sub = false;
});

test('Booyah floating sphere keeps its overhead clearance while its body pose remains uncalibrated', () => {
  activate('booyahBomb'); step(1 / 60);
  assert.ok(ch.s3SpecialDevices()[0].holder.position.y >= 1.95);
});

test('Inkjet visible bore follows world aim through body yaw lag without changing actor aim', () => {
  activate('inkjet');
  for (const yaw of [-1.3, .4, 1.6]) for (const pitch of [-.65, 0, .7]) {
    a.yaw = -.3; a.aimYaw = yaw; a.aimPitch = pitch;
    a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const before = [a.pos.toArray(), a.aimDir.toArray(), a.yaw, a.aimYaw, a.aimPitch, a._s3AllSpecialState.t];
    a._s3SpecialMarks = { shot: G.time };
    step(1 / 60);
    const d = ch.s3SpecialDevices().find(d => d.spec.aim);
    const direction = new T.Vector3(0, 0, 1).applyQuaternion(d.model.root.getWorldQuaternion(new T.Quaternion()));
    assert.ok(direction.dot(a.aimDir) > 1 - 1e-12, 'visible bore follows authoritative direction even in recoil');
    assert.deepEqual([a.pos.toArray(), a.aimDir.toArray(), a.yaw, a.aimYaw, a.aimPitch, a._s3AllSpecialState.t], before);
  }
});

test('Ultra Stamp throw wind-back is equal at 30/60/120Hz and does not advance while paused', () => {
  const arcs = [];
  for (const hz of [30, 60, 120]) {
    activate('ultraStamp');
    a._s3AllSpecialState.phase = 'aimThrow';
    for (let i = 0; i < hz / 5; i++) step(1 / hz);
    const d = ch.s3SpecialDevices()[0], arc = d.holder.rotation.x - SPECIAL_DEVICES.ultraStamp[0].rot[0];
    arcs.push(arc);
    assert.ok(Math.abs(arc - SPECIAL_DEVICE_MOTION.stamp.throwBack * (1 - .75 ** 12)) < 1e-12);
    for (let i = 0; i < 20; i++) step(0);
    assert.ok(Math.abs(d.holder.rotation.x - SPECIAL_DEVICES.ultraStamp[0].rot[0] - arc) < 1e-12, 'paused arc');
    assert.ok(d.holder.matrixWorld.elements.every(Number.isFinite));
  }
  assert.ok(Math.max(...arcs) - Math.min(...arcs) < 1e-12);
});

test('salvo, marker-case lid and throw-ready blends keep the 60Hz response at every cadence', () => {
  for (const id of ['tentaMissiles', 'tripleInkstrike', 'waveBreaker']) {
    const values = [];
    for (const hz of [30, 60, 120]) {
      activate(id);
      a._s3AllSpecialState.phase = 'launching';
      a._s3AllSpecialState.throwAt = 100;
      a.intent.sub = true;
      const d = ch.s3SpecialDevices()[0];
      const value = () => id === 'tripleInkstrike' ? d.model.groups.lid.rotation.x : d.holder.rotation.x;
      for (let i = 0; i < hz / 5; i++) step(1 / hz);
      values.push(value());
      for (let i = 0; i < 12; i++) step(0);
      assert.equal(value(), values.at(-1), id + ' pauses');
      a.intent.sub = false;
    }
    assert.ok(Math.max(...values) - Math.min(...values) < 1e-12, id + ' cadence invariance');
  }
});

test('vehicle chassis and grips do not inherit the kid pose', () => {
  for (const id of ['crabTank', 'reefslider']) {
    activate(id); step(1 / 60);
    const d = ch.s3SpecialDevices()[0];
    assert.equal(d.holder.parent, ch.root);
    const world = d.holder.matrixWorld.clone();
    ch.kid.position.set(.1, .2, -.1); ch.kid.rotation.set(.5, .2, -.1); ch.root.updateWorldMatrix(true, true);
    assert.deepEqual(d.holder.matrixWorld.elements, world.elements);

  }
});

test('retirement restores the main weapon and removes all owned device transforms', () => {
  for (const id of ['ultraStamp', 'inkjet', 'reefslider', 'crabTank']) {
    activate(id); step(1 / 60);
    const holders = ch.s3SpecialDevices().map(d => d.holder);
    a.specialActive = null; a._s3AllSpecialState = null; step(1 / 60);
    assert.equal(ch.s3SpecialDevices(), null);
    assert.equal(ch.weapon.pivot.visible, true);
    assert.ok(holders.every(holder => holder.parent === null));
  }
});

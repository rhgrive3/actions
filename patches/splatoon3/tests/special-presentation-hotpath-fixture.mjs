import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

export const before = JSON.parse(fs.readFileSync(new URL('./fixtures/special-presentation-before-parallel.json', import.meta.url)));
const motion = fs.readFileSync(new URL('../runtime/special-motion.mjs', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../runtime/special-presentation.mjs', import.meta.url), 'utf8');
export const currentSHA256 = Object.fromEntries(Object.entries({ motion, presentation }).map(([name, body]) => [name, createHash('sha256').update(body).digest('hex')]));
const releaseStart = presentation.indexOf('  function releaseWeapon(s) {');
const releaseWeapon = new Function('return ' + presentation.slice(releaseStart, presentation.indexOf('  function retire(ch)', releaseStart)))();
export const current = {
  fit: motion.slice(motion.indexOf('  function fit(ch,m,g){'), motion.indexOf('  cp._buildPose=function', motion.indexOf('  function fit(ch,m,g){'))),
  pose: presentation.slice(presentation.indexOf('  function pose(ch, s, dt) {'), presentation.indexOf('  const cp = Character.prototype, chUpdate = cp.update')),
};
for (const [name, body] of Object.entries(current)) assert.ok(body.startsWith('  function ' + name), name + ' production owner');

// Executes the actual constraint function and real THREE transforms. Native
// shoulder/arm callbacks are deterministic sinks here; full Character coverage
// is supplied separately by special-presentation-hotpath.test.mjs.
export function createFitRunner(body, { instrument = true } = {}) {
  let rotations = 0, refreshes = 0;
  class Vec extends THREE.Vector3 {
    applyQuaternion(q) { rotations++; return super.applyQuaternion(q); }
  }
  const Vector = instrument ? Vec : THREE.Vector3;
  const fit = new Function('THREE', 'return ' + body)({ ...THREE, Vector3: Vector });
  const vector = (...args) => new Vector(...args);
  const m = { a: vector(), b: vector(), p: vector(), handQ: new THREE.Quaternion(), pole: vector(),
    shoulders: [vector(), vector()], error: 0 };
  const g = new THREE.Group();
  g.userData = { handR: vector(-.18, -.25, .12), handL: vector(.2, -.1, .25),
    handQR: new THREE.Quaternion(), handQL: new THREE.Quaternion(),
    gripR: vector(-.18, -.25, .12), gripL: vector(.2, -.1, .25), holeR: vector(), holeL: vector() };
  const solve = []; let capture = true;
  const ch = { kid: new THREE.Group(), bones: { handR: new THREE.Group(), handL: new THREE.Group() },
    limbs: { armR: { a: .22, b: .2, up: { position: vector(-.2, 1.2, 0), parent: 0 } },
      armL: { a: .22, b: .2, up: { position: vector(.2, 1.2, 0), parent: 1 } } },
    _kidXform(parent, p, q) { p.set(0, parent ? -.03 : .03, 0); q.setFromEuler(new THREE.Euler(.1, -.1, parent ? .2 : -.2)); },
    _solveLimb(limb, p, pole, handQ, weight, side) {
      if (capture) solve.push([side, ...p.toArray(), ...pole.toArray(), ...handQ.toArray(), weight]);
      const bone = side ? ch.bones.handR : ch.bones.handL; bone.position.copy(p); bone.quaternion.copy(handQ);
    } };
  ch.kid.add(g, ch.bones.handR, ch.bones.handL);
  if (instrument) for (const o of [ch.kid, g, ch.bones.handR, ch.bones.handL]) {
    const update = o.updateWorldMatrix;
    o.updateWorldMatrix = function (...args) { refreshes++; return update.apply(this, args); };
  }
  return { g, m, ch, setSockets(seed) {
    g.userData.handR = vector(-.18 + seed * .03, -.25, .12);
    g.userData.handL = vector(.2, -.1 + seed * .01, .25);
  }, step(position, quaternion, captureValues = true) {
    capture = captureValues; rotations = 0; refreshes = 0; solve.length = 0; g.position.fromArray(position); g.quaternion.fromArray(quaternion);
    fit(ch, m, g);
    if (!capture) return;
    return { position: g.position.toArray(), quaternion: g.quaternion.toArray(), error: m.error,
      solve: solve.map(row => [...row]), rotations, refreshes };
  } };
}

export function createSpeakerRunner(body, { mutate = null, instrument = true } = {}) {
  const counts = { sin: 0, cos: 0, pow: 0, axisAngle: 0 }, math = Object.create(Math);
  for (const key of ['sin', 'cos', 'pow']) math[key] = (...args) => { counts[key]++; return Math[key](...args); };
  const runtimeMath = instrument ? math : Math;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const easeOutBack = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * runtimeMath.pow(x - 1, 3) + c * runtimeMath.pow(x - 1, 2); };
  const G = { time: 0 }, q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const kick = (age, rate = 18) => age >= 0 && age < 2 ? Math.exp(-age * rate) : 0;
  const speakerMarks = new WeakMap();
  const motion = { speakers: { deploy: .38, recoil: .07 } };
  let poseIndex = 0;
  const poseSubModel = model => { if (mutate) mutate(poseIndex++, model, actor, state, q, motion); };
  const animateDevice = () => {}; // no killerWail branch in the production helper
  const pose = new Function('G', 'THREE', 'poseSubModel', 'subModelUsesSpeed', 'clamp01', 'SPECIAL_DEVICE_MOTION',
    'easeOutBack', 'kick', 'speakerMarks', 'v', 'fwd', 'up', 'q', 'animateDevice', 'releaseWeapon', 'Math', 'return ' + body)
    (G, THREE, poseSubModel, () => false, clamp01, motion, easeOutBack, kick,
      speakerMarks, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), up, q, animateDevice, releaseWeapon, instrument ? math : Math);
  const actor = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1),
    aimYaw: .3, yaw: .1, aimPitch: .1, specialActive: { id: 'killerWail', phase: 'laser' }, _s3SpecialMarks: { laser: 0 } };
  const state = { id: 'killerWail', startedAt: 0, devices: [], weapon: null };
  const ch = { actor, kid: new THREE.Group(), weapon: { pivot: { visible: true } } };
  for (let i = 0; i < 6; i++) {
    const model = { id: 'spKillerSpeaker', materials: new Map([['ink', { emissiveIntensity: .08 }]]) };
    state.devices.push({ model, holder: new THREE.Group(), base: [i % 2 ? -.5 : .5, 1.7 + Math.floor(i / 2) * .3, -.2],
      spec: { speakers: true, scale: 1, hideWeapon: true } });
  }
  return { actor, state, ch, speakerMarks, step(t, dt, yaw = .3, captureValues = true) {
    poseIndex = 0; G.time = t; actor.aimYaw = yaw;
    for (const key of Object.keys(counts)) counts[key] = 0;
    if (instrument) {
      const original = THREE.Vector3.prototype.applyAxisAngle;
      THREE.Vector3.prototype.applyAxisAngle = function (...args) { counts.axisAngle++; return original.apply(this, args); };
      try { pose(ch, state, dt); } finally { THREE.Vector3.prototype.applyAxisAngle = original; }
    } else pose(ch, state, dt);
    if (!captureValues) return;
    return { devices: state.devices.map(d => ({ position: d.holder.position.toArray(), quaternion: d.holder.quaternion.toArray(),
      scale: d.holder.scale.toArray(), visible: d.holder.visible, emissive: d.model.materials.get('ink').emissiveIntensity })),
      hidden: !ch.weapon.pivot.visible, counts: { ...counts } };
  } };
}

export function valuesWithoutCounts(row) {
  const { rotations, refreshes, counts, ...values } = row; return values;
}

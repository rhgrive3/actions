import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// One module realm and the unmodified production installer. Do not combine this
// with individual installers in another realm: their WeakSets are independent.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let installed;
async function production() {
  if (installed) return installed;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'motion-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  // Pose/clock fixture: actual Actor, Runner, Character and rig; contact and
  // projectile collision are covered by the separate native-physics suites.
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  installed = { ...api, ...entry.namespace, profile }; return installed;
}
function rig(api, kind) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'production motion regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.onEvent = null; ch.actor = a;
  G.actors = [a]; G.scene.add(ch.root); a.grounded = true; a.ground.hit = true;
  let ticks = 0, shots = 0, kicks = 0;
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => { shots++; }]));
  const nativeKick = ch._hairKick;
  ch._hairKick = function (...args) {
    const heave = args[0] === 0 && args[1] === 2.4 && args[2] === 1.6;
    const previous = heave ? Array.from(this.hv.slice(0, 3)) : null;
    const result = nativeKick.apply(this, args);
    if (heave) {
      assert.ok(Math.abs(this.hv[0] - previous[0] - .96) < 1e-6);
      assert.ok(Math.abs(this.hv[2] - previous[2] - 1.2) < 1e-6);
      kicks++;
    }
    return result;
  };
  function step(dt = 1 / 60, input = {}) {
    ticks++; a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true); assert.ok(Array.from(ch.P).every(Number.isFinite));
  }
  function grip(side) {
    const weapon = side === 'L' ? ch.weapon.left : ch.weapon;
    const bone = side === 'L' ? ch.bones.handL : ch.bones.handR;
    const point = side === 'L' ? weapon.def.handL : weapon.def.handR;
    return weapon.off.localToWorld(point.pos.clone()).distanceTo(bone.getWorldPosition(new THREE.Vector3()));
  }
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { a, ch, step, grip, get shots() { return shots; }, get kicks() { return kicks; },
    close() { G.scene.remove(ch.root); ch.dispose(); } };
}

test('production installer composes all motion hooks in one realm', async t => {
  const api = await production(), { CHARACTER_TIMERS: T, CHARACTER_CHANNELS: C } = api;
  await t.test('30/60/120Hz rendering produces identical full pose, grips and hair at each 60Hz gameplay tick', () => {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const r = rig(api, 'slosher'), clock = new api.FixedClock(), rows = [];
      try {
        for (let frame = 0; frame < 2 * hz; frame++) clock.advance(1 / hz, dt => {
          r.step(dt, { fire: true });
          rows.push({ pose: Array.from(r.ch.P), hips: r.ch.bones.hips.position.toArray(),
            hand: r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3()).toArray(),
            muzzle: r.ch.getMuzzle(new api.THREE.Vector3()).toArray(), shots: r.shots, kicks: r.kicks,
            hairPosition: Array.from(r.ch.hx), hairVelocity: Array.from(r.ch.hv),
            hairBones: r.ch.hairBones.map(bone => bone.quaternion.toArray()) });
        });
        assert.equal(clock.ticks, 120); assert.ok(r.shots >= 4); assert.equal(r.kicks, r.shots);
        traces.push(rows);
      } finally { r.close(); }
    }
    assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
  });
  await t.test('reset clears exact exported clocks, held bomb and dualies stance', () => {
    const r = rig(api, 'dualies');
    try {
      for (const event of ['shoot', 'throw', 'slosh', 'charge_release', 'dodge']) r.ch.trigger(event, event === 'dodge' ? { x: 1, z: 0, t: .2 } : undefined);
      r.ch.bombHeld = true; r.ch.bombSwap = 1; r.ch.lockW = 1; r.a.reset();
      for (const name of ['T_SHOOT', 'T_SHOOTL', 'T_THROW', 'T_SLOSH', 'T_REL', 'T_DODGE']) {
        assert.ok(Number.isInteger(T[name]), name); assert.equal(r.ch.tr[T[name]], 99, name);
      }
      assert.equal(r.ch.bombHeld, false); assert.equal(r.ch.bombSwap, 0);
      assert.equal(r.ch.lockW, 0); assert.equal(r.ch.tumble, 0); assert.equal(r.ch.chargeFlash, 0);
      r.a.grounded = true; r.step(); assert.equal(r.ch.P[C.IKL], 1);
    } finally { r.close(); }
  });
  await t.test('actual post-slide turret keeps both pistol grips through stance and clears on return', () => {
    const r = rig(api, 'dualies');
    try {
      r.a.intent.fire = true; r.a.intent.move.set(1, 0, 0);
      assert.equal(r.a.weaponRunner.tryDodge(r.a.intent.move), true); r.a.intent.move.set(0, 0, 0);
      for (let i = 0; i < 120; i++) r.step(1 / 60, { fire: true });
      assert.equal(r.a.weaponRunner.lockT, 0); assert.equal(r.a.weaponRunner.s3Turret, true);
      assert.ok(r.ch.lockW > .999); assert.ok(r.grip('R') < .025); assert.ok(r.grip('L') < .025);
      // Hand targets can match while the native two-bone solver is clamped.
      assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(error => error < .0005));
      assert.ok(r.ch.P[C.IKR] > .999); assert.ok(r.ch.P[C.IKL] > .999);
      r.a.weaponRunner.reset(); r.a.form = 'squid'; for (let i = 0; i < 30; i++) r.step();
      r.a.form = 'kid'; for (let i = 0; i < 90; i++) r.step();
      assert.ok(r.ch.lockW < 1e-8); assert.ok(r.grip('R') < .025); assert.ok(r.grip('L') < .025);
      r.a.setWeapon('slosher'); r.step(1 / 60, { fire: true }); r.a.setWeapon('dualies'); r.step();
      assert.ok(r.ch.tr[T.T_SLOSH] > 1); assert.equal(r.ch.weaponKind, 'dualies');
    } finally { r.close(); }
  });
  await t.test('squid roll and reset cancel old slosh curve before a fresh attack', () => {
    const r = rig(api, 'slosher');
    try {
      r.step(1 / 60, { fire: true }); for (let i = 0; i < 4; i++) r.step();
      r.a.weaponRunner.reset(); r.a.form = 'squid'; r.a.grounded = false;
      r.a.s3.actions = { roll: { age: 0 }, surge: null };
      r.ch.trigger('squidroll', { duration: api.profile.movement.roll.duration }); r.step();
      assert.equal(api.movementMotionSnapshot(r.ch).phase, 'roll'); r.a.reset(); r.a.grounded = true; r.step();
      assert.equal(api.movementMotionSnapshot(r.ch).phase, null); assert.ok(r.ch.tr[T.T_SLOSH] > 1);
      let oldCalls = 0; const nativeSlosh = r.ch._poseSlosh;
      r.ch._poseSlosh = function (...args) { oldCalls++; return nativeSlosh.apply(this, args); };
      for (let i = 0; i < 45; i++) r.step(); assert.equal(oldCalls, 0); assert.equal(r.shots, 0);
      const before = r.kicks; r.step(1 / 60, { fire: true }); for (let i = 0; i < 18; i++) r.step();
      assert.equal(r.shots, 1); assert.equal(r.kicks, before + 1);
    } finally { r.close(); }
  });
});

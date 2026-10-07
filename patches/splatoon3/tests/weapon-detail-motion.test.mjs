import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { splatlingMotorStep, bucketDrain, installWeaponDetailMotion as installFromAnotherRealm,
  weaponDetailMotionSnapshot as snapshotFromAnotherRealm } from '../runtime/weapon-detail-motion.mjs';
import { BLASTER_MECHANISM } from '../runtime/blaster-mechanism.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
// One VM runs the complete production installer exactly once. Duplicate
// installers below may verify guards, but cannot repair a missing installation.
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    // Optional prior-owned-runtime reproduction over the same production
    // installer. Normal validation always reads the current production bytes.
    const baseline = process.env.INKWAVE_ADMISSION_BASELINE_RUNTIME_DIR;
    const prior = baseline && file.startsWith(path.join(ROOT, 'patches/splatoon3/runtime') + path.sep)
      ? path.join(fs.realpathSync(baseline), path.basename(file)) : null;
    const source = fs.readFileSync(prior && fs.existsSync(prior) ? prior : file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    import { Character } from './src/game/character.js';
    export const nativeThrow = Character.prototype._poseThrow;
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { carryMotionSnapshot } from './patches/splatoon3/runtime/carry-motion.mjs';
    export { NetMatch } from './src/net/netmatch.js';
    export * from './patches/splatoon3/runtime/weapon-detail-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'weapon-detail-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
    : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  assert.ok(Object.hasOwn(api.Character.prototype, Symbol.for('inkwave.weapon-detail-motion.installed')));
  // A module from a different realm must not wrap the actual classes twice.
  const guarded = ['trigger', '_updateStates', '_poseWeapon', '_poseSlosh', '_animWeapon', '_solveLimb']
    .map(name => [name, api.Character.prototype[name]]);
  const reset = api.WeaponRunner.prototype.reset;
  entry.namespace.installWeaponDetailMotion(api, profile);
  installFromAnotherRealm(api, profile);
  for (const [name, method] of guarded) assert.equal(api.Character.prototype[name], method);
  assert.equal(api.WeaponRunner.prototype.reset, reset);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = new api.Physics(G.level);
  G.actors = []; G.time = 0;
  cached = { ...api, ...entry.namespace, profile }; return cached;
}
function rig(api, kind, enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'weapon detail regression', weapon: kind, CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.onEvent = null; ch.actor = a; ch.s3WeaponDetailMotionEnabled = enabled;
  G.actors = [a]; G.scene.add(ch.root); a.grounded = true; a.ground.hit = true;
  let ticks = 0, kicks = 0;
  const events = [];
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick']
    .map(name => [name, (...args) => events.push({ name, tick: ticks, charge: name === 'fireCharger' ? args[2] : null })]));
  const nativeKick = ch._hairKick;
  ch._hairKick = function (...args) { if (args[0] === 0 && args[1] === 2.4 && args[2] === 1.6) kicks++; return nativeKick.apply(this, args); };
  function step(dt = 1 / 60, input = {}) {
    ticks++; a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt); ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite), 'actual full Character pose is finite');
    assert.ok(ch.ikErr.every(Number.isFinite), 'native two-bone solver errors are finite');
    assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));
  }
  for (let i = 0; i < 90; i++) step();
  const snapshot = () => ({ ...api.weaponDetailMotionSnapshot(ch) });
  function grip(side) {
    const hand = side === 'L' ? ch.weapon.def.handL : ch.weapon.def.handR;
    const bone = side === 'L' ? ch.bones.handL : ch.bones.handR;
    return ch.weapon.off.localToWorld(hand.pos.clone()).distanceTo(bone.getWorldPosition(new THREE.Vector3()));
  }
  return { a, ch, step, events, snapshot, grip, get kicks() { return kicks; },
    close() { G.scene.remove(ch.root); ch.dispose(); } };
}
function drawnVertices(api, mesh, space) {
  const g = mesh.geometry, p = g.getAttribute('position'), ix = g.index;
  const count = ix ? ix.count : p.count, start = Math.max(0, g.drawRange.start || 0);
  const end = Math.min(count, start + g.drawRange.count), vertices = [];
  mesh.updateMatrixWorld(true); space?.updateMatrixWorld(true);
  for (let i = start; i < end; i++) {
    const v = new api.THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    if (space) space.worldToLocal(v);
    vertices.push(v);
  }
  assert.ok(vertices.length > 0, 'actual indexed draw has vertices'); return vertices;
}
function height(api, mesh, space) {
  const ys = drawnVertices(api, mesh, space).map(v => v.y);
  return { bottom: Math.min(...ys), top: Math.max(...ys) };
}

test('Heavy motor integrates coast independently of render partition and pause', () => {
  for (const target of [0, 64]) {
    const direct = splatlingMotorStep(60, .4, target, .2);
    for (const schedule of [Array(6).fill(1 / 30), Array(12).fill(1 / 60), Array(24).fill(1 / 120), [.037, .009, .023, .011, .07, .05]]) {
      let s = { speed: 60, angle: .4 };
      for (const dt of schedule) s = splatlingMotorStep(s.speed, s.angle, target, dt);
      assert.ok(Math.abs(s.speed - direct.speed) < 1e-10);
      assert.ok(Math.abs(s.angle - direct.angle) < 1e-10);
      assert.deepEqual(splatlingMotorStep(s.speed, s.angle, target, 0), s);
    }
  }
  assert.equal(splatlingMotorStep(64, 1, 0, 1).speed, 0);
  assert.equal(bucketDrain(null, 17 / 60), 0);
  assert.equal(bucketDrain(0, 17 / 60), 0);
  assert.equal(bucketDrain(3 / 60, 17 / 60), 1);
  assert.equal(bucketDrain(17 / 60, 17 / 60), 0);
});

test('second-realm helpers observe the installed weapon attack and reset state', async () => {
  const api = await production();
  for (const kind of ['slosher', 'charger']) {
    const r = rig(api, kind);
    try {
      r.step(1 / 60, { fire: true });
      if (kind === 'charger') r.step();
      const active = r.snapshot();
      assert.notEqual(kind === 'slosher' ? active.sloshElapsed : active.chargerReleaseAge, null);
      assert.deepEqual(JSON.parse(JSON.stringify(snapshotFromAnotherRealm(r.ch))), JSON.parse(JSON.stringify(active)));
      r.a.weaponRunner.reset();
      assert.deepEqual(JSON.parse(JSON.stringify(snapshotFromAnotherRealm(r.ch))), JSON.parse(JSON.stringify(r.snapshot())));
    } finally { r.close(); }
  }
});

test('production supported shooter carry retains both actual indexed grips through Flow and aim', async t => {
  const api = await production(), r = rig(api, 'shooter'), C = api.CHARACTER_CHANNELS, rows = [];
  function contact(frame) {
    const w = r.ch.weapon, vertices = [];
    w.off.traverse(mesh => {
      let shown = true;
      for (let node = mesh; node; node = node.parent) if (!node.visible) shown = false;
      if (mesh.isMesh && shown) vertices.push(...drawnVertices(api, mesh));
    });
    assert.ok(vertices.length > 50);
    const left = r.ch.bones.handL.getWorldPosition(new api.THREE.Vector3());
    const nearestLeft = Math.min(...vertices.map(v => v.distanceTo(left)));
    return { frame, aim: r.ch.wAim, support: r.ch.wTwo, ikL: r.ch.P[C.IKL], ikR: r.ch.P[C.IKR],
      explicitLeft: r.ch.P[C.LTW], nativeIK: Array.from(r.ch.ikErr.slice(0, 2)),
      nearestLeft, gripL: r.grip('L'), gripR: r.grip('R'), indexedVertices: vertices.length };
  }
  try {
    assert.equal(r.ch.hold.twoCarry, 0); assert.equal(r.ch.hold.twoAim, 1);
    for (let frame = 0; frame < 240; frame++) {
      if (frame === 20) { r.a.s3.flow.active = true; r.a.s3.flow.remaining = 10; }
      if (frame === 90) r.a.s3.flow.remaining += 5;
      if (frame === 160) { r.a.s3.flow.active = false; r.a.s3.flow.remaining = 0; }
      r.step();
      if ([21, 29, 45, 75, 95, 145, 200, 239].includes(frame)) {
        const row = contact(frame); rows.push(row);
        assert.ok(row.ikL > .99, 'the integrated supported carry uses native support-hand IK');
        assert.equal(row.explicitLeft, 0);
        assert.ok(row.gripL < .005 && row.gripR < .005, 'both actually held hands meet their authored grips');
        assert.ok(row.nearestLeft < .035, 'support is beside actual indexed geometry');
        assert.ok(row.nativeIK.every(e => e < .0005));
      }
    }
    r.ch.s3CarryMotionEnabled = false;
    for (let frame = 0; frame < 20; frame++) r.step();
    const free = contact(260); rows.push(free);
    assert.equal(free.ikL, 0, 'opt-out retains the native free hand');
    assert.ok(free.nearestLeft > .2); assert.ok(free.gripR < .005);
    r.ch.s3CarryMotionEnabled = true;
    for (let frame = 0; frame < 60; frame++) {
      r.step(1 / 60, { fire: true });
      if (r.ch.P[C.IKL] > .99) {
        const row = contact(240 + frame); rows.push(row);
        assert.ok(row.gripL < .005 && row.gripR < .005, 'both truly held hands must meet their authored native grips');
        assert.ok(row.nativeIK.every(e => e < .0005));
        assert.ok(row.nearestLeft < .035, 'held support is also next to actual indexed weapon geometry');
      }
    }
    assert.ok(rows.some(row => row.ikL > .99), 'full two-handed aim was exercised');
    t.diagnostic(JSON.stringify({ flowKidContact: rows.filter(row => row.frame < 240 || row.frame === 299) }));
  } finally { r.close(); }
});

test('actual Slosher drains only after its wave, visibly lowers indexed fill and refills before repeat', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) for (const air of [false, true]) {
    const r = rig(api, 'slosher');
    try {
      r.a.grounded = !air;
      const w = r.ch.weapon, rest = height(api, w.ink, w.off), surfaceRest = w.parts.surface.userData.rest.y;
      r.step(1 / hz, { fire: true });
      while (!r.events.length) {
        assert.equal(r.snapshot().bucketDrain, 0, 'no emptying before actual projectile event');
        assert.equal(w.parts.surface.position.y, surfaceRest);
        r.step(1 / hz);
      }
      let maxDrain = 0;
      for (let i = 0; i < Math.ceil(hz * .3); i++) {
        r.step(1 / hz); const s = r.snapshot(); maxDrain = Math.max(maxDrain, s.bucketDrain);
        const current = height(api, w.ink, w.off);
        assert.ok(Math.abs(current.bottom - rest.bottom) < 1e-7, 'drawn fill bottom stays anchored');
        assert.ok(Math.abs(current.top - rest.top + .012 * s.bucketDrain) < 1e-7, 'drawn fill top follows free surface, no hidden disc-only drain');
        assert.ok(Math.abs(w.parts.surface.position.y - surfaceRest + .012 * s.bucketDrain) < 1e-7);
        assert.equal(w.parts.lever.rotation.x, 0, 'unsupported thumb lever stays static');
        assert.ok(r.ch.P[api.CHARACTER_CHANNELS.IKL] > .99, 'support hand remains braced through heave');
      }
      assert.ok(maxDrain > .85); assert.equal(r.snapshot().bucketDrain, 0);
      for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.kicks, r.events.length, 'one existing hair heave impulse per actual wave');
      r.a.weaponRunner.reset(); r.step(0);
      assert.equal(r.snapshot().sloshReleaseAge, null); assert.equal(r.snapshot().bucketDrain, 0);
      assert.equal(w.parts.surface.position.y, surfaceRest);
    } finally { r.close(); }
  }
});

test('full Character 30/60/120Hz render clocks preserve the actual 12F first / 29F repeat release', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api, 'slosher'), clock = new api.FixedClock(), rows = [];
    try {
      for (let frame = 0; frame < 2 * hz; frame++) clock.advance(1 / hz, dt => {
        r.step(dt, { fire: true }); rows.push({ snapshot: r.snapshot(), pose: Array.from(r.ch.P),
          nativeIK: Array.from(r.ch.ikErr), muzzle: r.ch.getMuzzle(new api.THREE.Vector3()).toArray(), kicks: r.kicks, events: r.events.length });
      });
      assert.deepEqual(r.events.slice(0, 4).map(e => e.tick - 90), [13, 42, 71, 100]);
      assert.equal(r.kicks, r.events.length); traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('Blaster holds actual foregrip through return, and shortened native recoil stays within IK reach', async t => {
  const api = await production(), measured = [];
  for (const enabled of [false, true]) {
    const r = rig(api, 'blaster', enabled); let peak = 0, pump = 0, reach = 0;
    try {
      r.step(1 / 60, { fire: true });
      const delayPose = r.ch.P[api.CHARACTER_CHANNELS.ANCR];
      for (let i = 0; i < 50; i++) {
        r.step(); peak = Math.max(peak, Math.abs(r.ch.rcP)); pump = Math.max(pump, Math.abs(r.ch.weapon.pump));
        reach = Math.max(reach, ...r.ch.ikErr.slice(0, 2));
        if (enabled) assert.equal(r.ch.weapon.parts.pump.position.z, r.ch.weapon.parts.pump.userData.rest.z);
      }
      assert.equal(r.events.length, 1); assert.ok(reach < .015, `native arm reach error ${reach}`);
      if (enabled) { assert.ok(r.grip('L') < .025); assert.ok(r.grip('R') < .025); }
      measured.push({ peak, pump, reach, delayPose });
    } finally { r.close(); }
  }
  assert.ok(measured[0].pump > .9, 'baseline delayed pump is exercised'); assert.equal(measured[1].pump, 0);
  assert.ok(measured[1].peak < measured[0].peak * .7, 'calibrated short kick reduces exaggerated native recoil');
  t.diagnostic(JSON.stringify({ weapon: 'blaster', before: measured[0], after: measured[1] }));
});

test('Shooter has smaller faster native recoil and gameplay shot stream is unchanged', async t => {
  const api = await production(), measured = [];
  for (const enabled of [false, true]) {
    const r = rig(api, 'shooter', enabled); let peak = 0, reach = 0;
    try {
      for (let i = 0; i < 60; i++) { r.step(1 / 60, { fire: true }); peak = Math.max(peak, Math.abs(r.ch.rcP)); reach = Math.max(reach, ...r.ch.ikErr.slice(0, 2)); }
      const events = r.events.map(e => e.tick);
      for (let i = 0; i < 24; i++) r.step();
      assert.ok(reach < .015); measured.push({ peak, events, returned: Math.abs(r.ch.rcP) });
    } finally { r.close(); }
  }
  assert.deepEqual(measured[0].events, measured[1].events);
  assert.ok(measured[1].peak < measured[0].peak * .7); assert.ok(measured[1].returned < .001);
  t.diagnostic(JSON.stringify({ weapon: 'shooter', before: measured[0], after: measured[1] }));
});

test('actual Charger stores full charge across form on a held ZR, then releases into faster carry return', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const r = rig(api, 'charger');
    try {
      for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
      assert.ok(r.ch.charge > .99); assert.equal(r.events.length, 0);
      // Charge keep belongs to the held shot, so ZR stays down across the form change.
      r.a.form = 'squid'; for (let i = 0; i < hz / 4; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.a.weaponRunner.s3Stored.charge, 1);
      r.a.form = 'kid'; for (let i = 0; i < hz / 4; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.events.length, 0); assert.ok(r.ch.weapon.coil.userData.u.uCharge.value > .99);
      r.step(1 / hz, { fire: true }); r.step(1 / hz);
      assert.equal(r.events.length, 1); assert.equal(r.events[0].charge, 1);
      let peak = 0, reach = 0;
      for (let i = 0; i < hz / 2; i++) { r.step(1 / hz); peak = Math.max(peak, Math.abs(r.ch.rcP)); reach = Math.max(reach, ...r.ch.ikErr.slice(0, 2)); }
      assert.ok(peak > .06); assert.equal(r.ch.wAim, 0, 'released charger returns to carry rather than lingering at cheek');
      assert.ok(reach < .02); r.step(1 / hz, { fire: true });
      assert.equal(r.snapshot().chargerReleaseAge, null, 'new charge supersedes previous follow-through');
    } finally { r.close(); }
  }
});

test('actual Heavy barrel stops after final stream and transitions clear hidden, form, swap, death and reset', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const r = rig(api, 'splatling');
    try {
      for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
      assert.ok(r.ch.weapon.spinW > 40); r.step(0, { fire: true });
      const paused = r.snapshot(); r.step(0, { fire: true }); assert.deepEqual(r.snapshot(), paused);
      r.step(1 / hz); let guard = 6 * hz;
      while (r.a.weaponRunner.streaming && guard-- > 0) r.step(1 / hz);
      assert.ok(guard > 0); assert.ok(r.events.length > 1);
      for (let i = 0; i < hz * .4; i++) r.step(1 / hz);
      assert.equal(r.ch.weapon.spinW, 0, 'coast reaches stationary rather than several seconds of tail');
      const stopped = r.ch.weapon.spinA; r.step(1 / hz); assert.equal(r.ch.weapon.spinA, stopped);
      for (const transition of ['hide', 'form', 'swap', 'death', 'reset']) {
        for (let i = 0; i < hz; i++) r.step(1 / hz, { fire: true });
        if (transition === 'hide') r.ch.setVisible(false);
        if (transition === 'form') r.a.form = 'squid';
        if (transition === 'swap') r.a.setWeapon('shooter');
        if (transition === 'death') r.a.alive = false;
        if (transition === 'reset') r.a.weaponRunner.reset();
        r.step(1 / hz); const w = r.ch.weapons.splatling;
        assert.equal(w.spinW, 0, transition); assert.equal(w.parts.barrels.rotation.z, 0, transition);
        r.ch.setVisible(true); r.a.alive = true; r.a.form = 'kid'; r.a.setWeapon('splatling'); r.a.weaponRunner.reset();
      }
    } finally { r.close(); }
  }
});

test('nullable preview states are safe after release and opt-out reset preserves unowned part poses', async () => {
  const api = await production();
  for (const kind of ['charger', 'slosher', 'blaster', 'splatling', 'shooter']) {
    const r = rig(api, kind);
    try {
      r.ch.trigger(kind === 'charger' ? 'charge_release' : 'shoot');
      assert.doesNotThrow(() => r.ch.update(0, null));
      assert.doesNotThrow(() => r.ch.update(1 / 60, undefined));
      assert.ok(Array.from(r.ch.P).every(Number.isFinite));
    } finally { r.close(); }
  }
  const old = rig(api, 'slosher', false);
  try {
    const w = old.ch.weapon;
    w.parts.surface.position.y += .004; w.parts.surface.rotation.x = .12;
    w.parts.lever.rotation.x = .23; w.ink.scale.y = .8;
    const before = { surface: w.parts.surface.position.toArray(), rotation: w.parts.surface.rotation.toArray(),
      lever: w.parts.lever.rotation.x, fill: w.ink.scale.toArray() };
    old.a.weaponRunner.reset();
    assert.deepEqual({ surface: w.parts.surface.position.toArray(), rotation: w.parts.surface.rotation.toArray(),
      lever: w.parts.lever.rotation.x, fill: w.ink.scale.toArray() }, before);
  } finally { old.close(); }
});

test('actual Charger and Heavy before-after measurements include native reach and drawn cluster geometry', async t => {
  const api = await production(), rows = [];
  for (const kind of ['charger', 'splatling']) for (const enabled of [false, true]) {
    const r = rig(api, kind, enabled); let reach = 0, peak = 0;
    try {
      for (let i = 0; i < 120; i++) r.step(1 / 60, { fire: true });
      const chargePitch = r.ch.P[api.CHARACTER_CHANNELS.ANCR];
      const clusterAtCharge = kind === 'splatling' ? height(api, r.ch.weapon.parts.barrels.userData.mesh, r.ch.kid) : null;
      r.step();
      for (let i = 0; i < (kind === 'charger' ? 30 : 240); i++) {
        r.step(); reach = Math.max(reach, ...r.ch.ikErr.slice(0, 2)); peak = Math.max(peak, Math.abs(r.ch.rcP));
      }
      assert.ok(reach < .025);
      rows.push({ kind, enabled, chargePitch, clusterAtCharge, releasePeak: peak, nativeArmReach: reach,
        aimAfterRelease: r.ch.wAim, barrelSpeed: r.ch.weapon.spinW || 0, shots: r.events.length });
    } finally { r.close(); }
  }
  const charger = rows.filter(r => r.kind === 'charger'), heavy = rows.filter(r => r.kind === 'splatling');
  assert.ok(charger[0].aimAfterRelease > .8); assert.equal(charger[1].aimAfterRelease, 0);
  assert.ok(charger[1].releasePeak > charger[0].releasePeak);
  assert.ok(heavy[0].barrelSpeed > 1); assert.equal(heavy[1].barrelSpeed, 0);
  assert.equal(heavy[0].shots, heavy[1].shots);
  t.diagnostic(JSON.stringify({ weaponComparison: rows }));
});

test('fine weapon poses remain finite while moving, airborne, aiming, throwing and changing form', async t => {
  const api = await production(), rows = [];
  for (const kind of ['charger', 'splatling', 'blaster', 'shooter', 'slosher']) for (const enabled of [false, true]) {
    const r = rig(api, kind, enabled); let maxArmReach = 0, maxFullGripReach = 0, maxFullGripDistance = 0, worst = null, fullWorst = null;
    try {
      for (let i = 0; i < 120; i++) {
        const dt = [.037, .009, .023, .011][i % 4];
        r.a.grounded = i % 40 < 25; r.a.aimPitch = [.8, -.65, 0][Math.floor(i / 20) % 3];
        r.a.vel.set(1.5, r.a.grounded ? 0 : -1, 0); r.a.pos.addScaledVector(r.a.vel, dt);
        r.step(dt, { fire: i % 30 < 22, sub: i % 30 > 25 });
        const error = Math.max(...r.ch.ikErr.slice(0, 2));
        const C = api.CHARACTER_CHANNELS;
        for (const [slot, channel, side] of [[0, C.IKL, 'L'], [1, C.IKR, 'R']]) if (r.ch.P[channel] > .99 && !(slot === 0 && r.ch.P[C.LTW] > .001)) {
          if (r.ch.ikErr[slot] > maxFullGripReach) { maxFullGripReach = r.ch.ikErr[slot]; fullWorst = { frame: i, side, subWeight: r.ch.wSub }; }
          maxFullGripDistance = Math.max(maxFullGripDistance, r.grip(side));
        }
        if (error > maxArmReach) { maxArmReach = error; worst = { frame: i, errors: [...r.ch.ikErr.slice(0, 2)], ikWeights: [r.ch.P[C.IKL], r.ch.P[C.IKR]], aimPitch: r.a.aimPitch, grounded: r.a.grounded, subWeight: r.ch.wSub }; }
        assert.ok(r.ch.weapon.off.getWorldQuaternion(new api.THREE.Quaternion()).toArray().every(Number.isFinite));
      }
      r.a.weaponRunner.reset(); r.a.form = 'squid'; r.step(); r.a.form = 'kid';
      for (let i = 0; i < 30; i++) r.step();
      assert.equal(r.snapshot().sloshReleaseAge, null); assert.equal(r.snapshot().chargerReleaseAge, null);
      rows.push({ kind, enabled, maxArmReach, maxFullGripReach, maxFullGripDistance, worst, fullWorst, shots: r.events.length });
    } finally { r.close(); }
  }
  t.diagnostic(JSON.stringify({ combinedMotion: rows }));
  for (let i = 0; i < rows.length; i += 2) {
    assert.equal(rows[i].shots, rows[i + 1].shots);
    assert.ok(rows[i + 1].maxFullGripReach < .005, JSON.stringify(rows.slice(i, i + 2)));
    assert.ok(rows[i + 1].maxFullGripDistance < .025, JSON.stringify(rows.slice(i, i + 2)));
  }
});

test('unique native Slam preview keeps its original full pose and limb transforms', async () => {
  const api = await production();
  for (const kind of ['slosher', 'splatling', 'blaster', 'charger', 'shooter']) {
    const traces = [];
    for (const enabled of [false, true]) {
      // Both traces begin with the same native pre-special history, so this
      // checks the special itself rather than earlier weapon calibration.
      const r = rig(api, kind, false), rows = []; r.ch.s3WeaponDetailMotionEnabled = enabled; r.ch.s3SpecialMotionEnabled = false;
      try {
        r.ch.trigger('special_leap');
        for (let i = 0; i < 70; i++) {
          if (i === 25) r.ch.trigger('special_slam');
          r.step();
          rows.push({ pose: [...r.ch.P], errors: [...r.ch.ikErr],
            hands: ['handL', 'handR'].map(name => r.ch.bones[name].getWorldPosition(new api.THREE.Vector3()).toArray()),
            gripCorrection: r.snapshot().gripCorrection });
        }
      } finally { r.close(); }
      traces.push(rows);
    }
    for (let i = 0; i < traces[0].length; i++) {
      for (const key of ['pose', 'errors', 'hands']) {
        const before = traces[0][i][key].flat(), after = traces[1][i][key].flat();
        for (let j = 0; j < before.length; j++) assert.ok(Math.abs(before[j] - after[j]) < 1e-12,
          `${kind} frame=${i} ${key}[${j}] before=${before[j]} after=${after[j]}`);
      }
      assert.equal(traces[1][i].gripCorrection, 0);
    }
  }
});

test('held fists remain beside the actual indexed handles after native reach correction', async t => {
  const api = await production(), rows = [];
  for (const kind of ['slosher', 'splatling', 'blaster']) {
    const r = rig(api, kind); let correction = 0, indexedDistances = null;
    try {
      for (let i = 0; i < 120; i++) {
        r.a.aimPitch = i < 60 ? -.65 : .8; r.step(1 / 60, { fire: true });
        const C = api.CHARACTER_CHANNELS;
        if (r.ch.P[C.IKL] <= .99 || r.ch.P[C.IKR] <= .99) continue;
        const value = r.snapshot().gripCorrection;
        if (indexedDistances && value <= correction) continue;
        correction = Math.max(correction, value);
        const w = r.ch.weapon, vertices = drawnVertices(api, w.body);
        indexedDistances = ['R', 'L'].map(side => {
          const hand = w.def['hand' + side], authored = w.def['grip' + side], bone = r.ch.bones['hand' + side];
          // Derive the native model's fist-hole point from its authored frames;
          // no copied private hand offsets or assumed bounding boxes.
          const hole = authored.pos.clone().sub(hand.pos).applyQuaternion(hand.quat.clone().invert());
          const socket = bone.localToWorld(hole), grip = w.off.localToWorld(authored.pos.clone());
          const nearestDrawnVertex = Math.min(...vertices.map(v => v.distanceTo(socket)));
          assert.ok(socket.distanceTo(grip) < .025, `${kind} frame=${i} ${side} native socket-to-grip=${socket.distanceTo(grip)}`);
          assert.ok(nearestDrawnVertex < .035, `${kind} frame=${i} ${side} indexed handle distance=${nearestDrawnVertex}`);
          return { side, boneSocketToGrip: socket.distanceTo(grip), nearestDrawnVertex, indexedVertices: vertices.length };
        });
      }
      assert.ok(indexedDistances, 'actual full two-hand grip was sampled');
      rows.push({ kind, maxCorrection: correction, indexedDistances });
    } finally { r.close(); }
  }
  t.diagnostic(JSON.stringify({ indexedGripProof: rows }));
});

test('zero-time native throw pose evaluation preserves weapon tracks and grip diagnostics', async () => {
  const api = await production();
  for (const kind of ['slosher', 'splatling', 'blaster']) {
    const r = rig(api, kind);
    try {
      for (let i = 0; i < 35; i++) r.step(1 / 60, { fire: true });
      const before = r.snapshot(), anim = r.ch._animWeapon, dt = r.ch._dt;
      try {
        r.ch._dt = 0; r.ch._animWeapon = () => {};
        // The production WeaponMotion hook filters preview calls. Bomb's
        // sampler uses the original native curve, captured before install.
        api.nativeThrow.call(r.ch, r.ch.P, .10);
        assert.equal(r.ch.P[api.CHARACTER_CHANNELS.IKL], 0, 'native release frees the throwing hand');
        for (let i = 0; i < 4; i++) r.ch._applyPose(0, r.a.anim || {});
        assert.deepEqual(r.snapshot(), before, kind);
      } finally { r.ch._animWeapon = anim; r.ch._dt = dt; }
    } finally { r.close(); }
  }
});

test('admission managed Slam relinquishment restores actual Heavy brace and native grips before timer expiry', async () => {
  const api = await production(), r = rig(api, 'splatling');
  try {
    r.a.weapon = { ...r.a.weapon, special: 'slam' }; r.a._startSpecial(); r.a._finishFrame(0);
    r.a.specialActive = null; r.a.grounded = true; r.a._finishFrame(0);
    for (let i = 0; i < 15; i++) r.step(1 / 60, { fire: true });
    assert.ok(r.ch.tr[api.CHARACTER_TIMERS.T_LEAP] < 1.9);
    assert.ok(r.ch.wAim > .99); assert.ok(r.ch.spinW > .2);
    const pose = [...r.ch.P], bones = ['handL', 'handR'].map(n => r.ch.bones[n].getWorldPosition(new api.THREE.Vector3()).toArray());
    const vertices = drawnVertices(api, r.ch.weapon.parts.barrels.userData.mesh).map(v => v.toArray());
    const clocks = [...r.ch.tr];
    // Counterfactual differs only in obsolete presentation ages, at zero dt.
    r.ch.tr[api.CHARACTER_TIMERS.T_LEAP] = r.ch.tr[api.CHARACTER_TIMERS.T_SLAM] = 99;
    r.a._finishFrame(0); r.ch.root.updateMatrixWorld(true);
    assert.deepEqual([...r.ch.P], pose, 'native calibrated weapon pose cannot depend on released Special ages');
    // Native zero-dt limb solving converges again by about 1e-10; preserve
    // exact pose equality above and bound actual output at 1e-8 scene units.
    ['handL', 'handR'].forEach((n, i) => assert.ok(r.ch.bones[n].getWorldPosition(new api.THREE.Vector3()).distanceTo(new api.THREE.Vector3(...bones[i])) < 1e-8));
    drawnVertices(api, r.ch.weapon.parts.barrels.userData.mesh).forEach((v, i) => assert.ok(v.distanceTo(new api.THREE.Vector3(...vertices[i])) < 1e-8));
    r.ch.tr.set(clocks);
    assert.ok(r.grip('L') < .025 && r.grip('R') < .025); assert.ok(r.ch.ikErr.slice(0, 2).every(v => v < .001));
  } finally { r.close(); }
});

test('admission disposed weapon detail cannot recreate installed tracks across realms or zero-time native state hooks', async () => {
  const api = await production(), r = rig(api, 'splatling');
  try {
    r.step(1 / 60, { fire: true });
    assert.ok(drawnVertices(api, r.ch.weapon.parts.barrels.userData.mesh).length > 100);
    assert.ok(r.ch.ikErr.every(Number.isFinite));
    const registry = r.ch[Symbol.for('inkwave.weapon-detail-motion.installed')];
    assert.equal(registry.tracks.has(r.ch), true); r.ch.dispose();
    assert.equal(registry.tracks.has(r.ch), false);
    const clocks = [...r.ch.tr]; r.ch._updateStates(0, null);
    assert.equal(registry.tracks.has(r.ch), false, 'native state delegation cannot recreate disposed owned tracks');
    assert.equal(r.snapshot().enabled, false);
    assert.equal(snapshotFromAnotherRealm(r.ch).enabled, false);
    assert.deepEqual([...r.ch.tr], clocks);
  } finally { r.close(); }
});

// ---------------------------------------------------------------------------------------------- #915 S3 Blaster mechanism
const mechLever = r => r.ch.weapon.parts.lever.rotation.z;
const mechFront = r => { const p = r.ch.weapon.parts.front; return p.position.z - p.userData.rest.z; };
const mechRest = r => { assert.equal(mechLever(r), 0, 'lever returns to its rest rotation'); assert.equal(mechFront(r), 0, 'front returns to its rest translation'); };
const mechCycles = rows => {
  let cycles = 0, moving = false;
  for (const on of rows) { if (on && !moving) cycles++; moving = on; }
  return cycles;
};
const blasterShots = r => r.events.filter(e => e.name === 'fireBlaster').length;

test('Blaster S3 lever and spring-front run exactly one cycle per actual emission and rest everywhere else at 30/60/120Hz', async t => {
  const api = await production(), summary = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api, 'blaster');
    try {
      assert.ok(r.ch.weapon.parts.lever && r.ch.weapon.parts.front, 'S3 mechanism part channels exist');
      // idle: no emission, no movement, no owned age
      for (let i = 0; i < Math.round(hz * 0.5); i++) r.step(1 / hz);
      mechRest(r); assert.equal(blasterShots(r), 0); assert.equal(r.snapshot().blasterMechAge, null);

      // one accepted shot: production #308 winds up for preDelay (.1667s)
      // before the actual emission; the mechanism must stay at rest through the
      // entire windup and then run exactly one lever-down + spring-front-forward
      // cycle for the emission itself, with ZR held through the cooldown
      r.step(1 / hz, { fire: true });
      assert.equal(blasterShots(r), 0, 'pressing ZR only starts the windup; nothing is emitted yet');
      let wind = 0;
      while (blasterShots(r) === 0) {
        assert.ok(wind++ < Math.ceil(hz * 0.5), 'the actual emission arrives within preDelay');
        r.step(1 / hz, { fire: true });
        if (blasterShots(r) === 0) mechRest(r); // holding ZR before the shot moves nothing
      }
      assert.equal(blasterShots(r), 1, 'exactly one actual emission after the windup');
      let cycles = 0, moving = false, leverPeak = 0, frontPeak = 0, recoilPeak = 0, ageSeen = false, pumpMoved = false;
      const window = Math.round(hz * 0.72); // fireInterval .8333s: still one shot
      for (let i = 0; i < window; i++) {
        r.step(1 / hz, { fire: true });
        const on = mechLever(r) !== 0 || mechFront(r) !== 0;
        if (on && !moving) cycles++;
        moving = on;
        if (r.snapshot().blasterMechAge != null) ageSeen = true;
        leverPeak = Math.min(leverPeak, mechLever(r));
        frontPeak = Math.max(frontPeak, mechFront(r));
        recoilPeak = Math.max(recoilPeak, Math.abs(r.ch.rcP));
        if (r.ch.weapon.parts.pump.position.z !== r.ch.weapon.parts.pump.userData.rest.z) pumpMoved = true;
      }
      assert.equal(blasterShots(r), 1, 'holding ZR through cooldown emits no extra shot');
      assert.equal(cycles, 1, 'exactly one mechanism cycle for the actual shot');
      assert.ok(ageSeen, 'the emission-owned mechanism age was observable');
      assert.ok(leverPeak <= -BLASTER_MECHANISM.leverPeak * 0.99, `lever pulled down: ${leverPeak}`);
      assert.ok(frontPeak >= BLASTER_MECHANISM.frontPeak * 0.99, `spring front thrown forward: ${frontPeak}`);
      assert.ok(recoilPeak > 0.02, `generic whole-weapon recoil stays additive: ${recoilPeak}`);
      assert.equal(pumpMoved, false, 'suppressed pump stroke never substitutes for the S3 mechanism');
      mechRest(r); assert.equal(r.snapshot().blasterMechAge, null, 'recovered before the next shot window');

      // rejected shot (held ZR with no ink): nothing emits, nothing moves
      const runner = r.a.weaponRunner, nativeUpdate = runner.update;
      runner.update = function (dt, input) { const keep = this.a.ink; this.a.ink = 0;
        try { return nativeUpdate.call(this, dt, input); } finally { this.a.ink = keep; } };
      for (let i = 0; i < Math.round(hz * 0.4); i++) r.step(1 / hz, { fire: true });
      runner.update = nativeUpdate;
      assert.equal(blasterShots(r), 1, 'dry fire emits nothing'); mechRest(r);

      // squid form: production fire admission (actor.js) is upstream and
      // unchanged; the mechanism itself must stay at rest even for a stale
      // replayed emission trigger arriving while submerged
      r.a.form = 'squid';
      for (let i = 0; i < Math.round(hz * 0.3); i++) r.step(1 / hz, { fire: r.a.form === 'kid' });
      mechRest(r); assert.equal(blasterShots(r), 1);
      r.ch.trigger('shoot');
      r.step(1 / hz); mechRest(r);
      assert.equal(r.snapshot().blasterMechAge, null, 'stale trigger cannot actuate or leave an offset in squid form');
      r.a.form = 'kid';

      // death/respawn: no movement, stale trigger stays at rest
      r.a.alive = false;
      r.step(1 / hz); r.ch.trigger('shoot'); r.step(1 / hz);
      mechRest(r); assert.equal(r.snapshot().blasterMechAge, null);
      r.a.alive = true; r.a.weaponRunner.reset(); r.step(1 / hz); mechRest(r);

      // mid-cycle weapon swap restores every moving part to rest, no stale pose
      let waited = 0;
      while (blasterShots(r) < 2 && waited++ < Math.ceil(hz * 1.2)) r.step(1 / hz, { fire: true });
      assert.equal(blasterShots(r), 2, 'next accepted shot after cooldown');
      r.step(1 / hz);
      assert.ok(mechLever(r) !== 0 || mechFront(r) !== 0, 'swap interrupts an active cycle');
      r.a.setWeapon('shooter'); r.step(1 / hz);
      { const w = r.ch.weapons.blaster;
        assert.equal(w.parts.lever.rotation.z, 0, 'swap restores lever');
        assert.equal(w.parts.front.position.z, w.parts.front.userData.rest.z, 'swap restores front'); }
      r.a.setWeapon('blaster'); r.a.weaponRunner.reset(); r.step(1 / hz);
      mechRest(r); assert.equal(r.snapshot().blasterMechAge, null);

      // continuous fire: one complete restart-safe cycle per accepted shot
      const before = blasterShots(r), rows = [];
      for (let i = 0; i < Math.round(hz * 2.4); i++) {
        r.step(1 / hz, { fire: true });
        rows.push(mechLever(r) !== 0 || mechFront(r) !== 0);
      }
      const fired = blasterShots(r) - before;
      assert.ok(fired >= 2, `continuous fire emitted ${fired} shots`);
      const continuousCycles = mechCycles(rows);
      assert.equal(continuousCycles, fired, 'one cycle per accepted shot, no accumulation');
      mechRest(r); assert.equal(r.snapshot().blasterMechAge, null);
      summary.push({ hz, fired, continuousCycles, leverPeak, frontPeak, recoilPeak });
    } finally { r.close(); }
  }
  // detail layer off: the mechanism channels never move for a real shot
  const off = rig(api, 'blaster', false);
  try {
    let fired = 0;
    for (let i = 0; i < 60; i++) { off.step(1 / 60, { fire: true }); fired = blasterShots(off); }
    assert.ok(fired >= 1, 'opt-out rig still emits real shots');
    mechRest(off);
  } finally { off.close(); }
  t.diagnostic(JSON.stringify({ blasterMechanism: summary }));
});

test('actual emitted Blaster shot replays the identical mechanism cycle on a remote proxy through real NetMatch', async () => {
  const api = await production();
  const { G } = api;
  const prevNetm = G.netm, prevActors = G.actors;
  const local = rig(api, 'blaster');
  const localProj = G.projectiles;
  let nmLocal = null, remote = null;
  try {
    const session = (myId, host) => ({ myId, isHost: myId === host, hostId: host,
      _members: new Map([[myId, 'me'], [host, 'host']]), tr: { broadcast() {}, sendTo() {} } });
    nmLocal = new api.NetMatch(session('me', 'me'), { map: 'map', difficulty: 'normal' });
    G.netm = nmLocal;
    local.a.owner = 'me'; local.a.nid = 0;
    nmLocal.byNid.set(0, local.a); nmLocal._setupActor(local.a); // production trigger recording wrapper

    remote = rig(api, 'blaster');
    const remoteProj = G.projectiles;
    remote.a.owner = 'peer'; remote.a.nid = 0; // the same shooter seen by another client
    const nmRemote = new api.NetMatch(session('them', 'them'), { map: 'map', difficulty: 'normal' });
    nmRemote.byNid.set(0, remote.a); nmRemote._setupActor(remote.a); // installs _netTrig

    const localTrace = [], remoteTrace = [];
    const frames = Math.round(1.8 * 60), firing = Math.round(1.5 * 60);
    for (let f = 0; f < frames; f++) {
      G.actors = [local.a]; G.projectiles = localProj;
      const recorded = nmLocal.out.length;
      local.step(1 / 60, { fire: f < firing });
      localTrace.push([mechLever(local), mechFront(local)]);
      if (nmLocal.out.length > recorded) {
        assert.equal(nmLocal.out.length, recorded + 1, 'one recorded trigger per frame');
        const ev = nmLocal.out[recorded];
        assert.equal(ev[1], 'tr'); assert.equal(ev[3], 'shoot');
        nmRemote._play('me', ev); // production remote replay path for the same frame
      }
      G.actors = [remote.a]; G.projectiles = remoteProj;
      remote.step(1 / 60);
      remoteTrace.push([mechLever(remote), mechFront(remote)]);
    }
    assert.deepEqual(localTrace, remoteTrace, 'remote proxy runs the identical cycle frame for frame');
    const shots = blasterShots(local);
    assert.ok(shots >= 2, 'multiple actual emissions were exercised');
    assert.equal(blasterShots(remote), 0, 'the proxy only replays; it emits nothing locally');
    assert.equal(mechCycles(localTrace.map(([l, fr]) => l !== 0 || fr !== 0)), shots, 'local: one cycle per shot');
    assert.equal(mechCycles(remoteTrace.map(([l, fr]) => l !== 0 || fr !== 0)), shots, 'remote: one cycle per shot');
    mechRest(local); mechRest(remote);
  } finally {
    nmLocal?.dispose?.();
    G.netm = prevNetm; G.actors = prevActors;
    local.close(); remote?.close();
  }
});

test('Blaster mechanism cycle is identical across 30/60/120Hz render clocks on the fixed sim step', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api, 'blaster'), clock = new api.FixedClock(), rows = [];
    try {
      for (let frame = 0; frame < Math.round(2.5 * hz); frame++) clock.advance(1 / hz, dt => {
        r.step(dt, { fire: true });
        rows.push([mechLever(r), mechFront(r), r.events.length, r.snapshot().blasterMechAge]);
      });
      assert.ok(r.events.length >= 3, `${hz}Hz render clock emitted repeated actual shots`);
      assert.equal(mechCycles(rows.map(([l, fr]) => l !== 0 || fr !== 0)), r.events.length,
        `${hz}Hz exactly one cycle per shot`);
      const last = rows[rows.length - 1];
      assert.equal(last[0], 0, `${hz}Hz lever recovered`);
      assert.equal(last[1], 0, `${hz}Hz front recovered`);
      assert.equal(last[3], null, `${hz}Hz owned age expired before the trace ends`);
      traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1], '30Hz vs 60Hz render partition');
  assert.deepEqual(traces[1], traces[2], '60Hz vs 120Hz render partition');
});

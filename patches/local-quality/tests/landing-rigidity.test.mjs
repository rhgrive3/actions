import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { realCharacter } from '../../splatoon3/tests/real-character-fixture.mjs';
import { adaptLandingRigidity } from '../landing-rigidity-adapter.mjs';

// Real Character geometry/pose checks on the actual inkwave-public source plus
// the existing splatoon3 channel exports. No fake Character, no game prototype.
// Cheap by design: one settled Character per kind per realm; per-combo state is
// saved/restored instead of rebuilding the full skinned rig (42 combos).
// The unpatched baseline is the shared real-character fixture (its actual
// walk/roller motion hooks are installed in that same VM realm); only the
// patched source needs a second realm, built here with the same hooks.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const KINDS = ['shooter', 'roller', 'charger', 'blaster', 'dualies', 'slosher', 'splatling'];
const RATES = [30, 60, 120];
const OLD_SNIPPET = 'sp[S_SQ + 1] -= 3.6 * a;';
const SETTLE_FRAMES = 12;
// weapon pivot world basis: patched source must stay rigid, the old source's
// land squash must be detectable (measured floor: len 2.3e-3, gram 7.9e-3).
const RIGID_TOL = 1e-6;
const DISTORT_TOL = 1e-3;

function adapted(patched) {
  const rel = 'src/game/character.js';
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
  const withExports = adaptSource(rel, raw);
  return patched ? adaptLandingRigidity(rel, withExports) : withExports;
}

let newRealmCache = null;
async function realm(patched) {
  // Unpatched baseline: the shared real-character fixture (cached VM realm with
  // the actual motion hooks installed there). Patched source: one more realm.
  if (!patched) return realCharacter();
  if (newRealmCache) return newRealmCache;
  const code = adapted(patched);
  const context = vm.createContext({ console, performance, URL });
  const modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    let text = fs.readFileSync(file, 'utf8');
    if (file === path.join(SRC, 'src/game/character.js')) text = code;
    else if (file.startsWith(SRC + path.sep)) text = adaptSource(path.relative(SRC, file), text);
    const m = new vm.SourceTextModule(text,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m);
    return m;
  };
  const entry = new vm.SourceTextModule(
    `export * from './inkwave-public/src/game/character.js'; export * as THREE from 'three'; export {G} from './inkwave-public/src/core/ctx.js'; export {installWalkMotion,walkLean} from './patches/splatoon3/runtime/walk.mjs'; export {installRollerMotion} from './patches/splatoon3/runtime/roller.mjs';`,
    { context, identifier: path.join(ROOT, 'landing-rigidity-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', spec.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const api = { ...entry.namespace };
  api.profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  api.installWalkMotion(api, api.profile);
  api.installRollerMotion(api, api.profile);
  if (patched) newRealmCache = api;
  return api;
}

function makeState() {
  return { form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0 };
}

// One settled Character per kind per realm, cached for every test in this file.
const rigCache = new Map();
function rigsFor(api) {
  let rigs = rigCache.get(api);
  if (!rigs) {
    rigs = new Map(KINDS.map(kind => [kind, settle(api, kind)]));
    rigCache.set(api, rigs);
  }
  return rigs;
}


function settle(api, kind) {
  const ch = new api.Character({ name: `landing rigidity ${kind}`, weapon: kind, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ch.onEvent = null;
  ch.root.position.set(0, 0, 0);
  ch.root.rotation.set(0, 0, 0);
  const state = makeState();
  for (let i = 0; i < SETTLE_FRAMES; i++) ch.update(1 / 60, state);
  return { ch, state, saved: saveState(ch) };
}

function saveState(ch) {
  return {
    sp: Float32Array.from(ch.sp), tr: Float32Array.from(ch.tr),
    P: Float32Array.from(ch.P), landAmp: ch.landAmp,
    feet: ch.feet.map(f => ({
      pw: f.pw.toArray(), yaw: f.yaw, n: f.n.toArray(), planted: f.planted,
      sw: f.sw, mode: f.mode, su: f.su, dur: f.dur,
      from: f.from.toArray(), to: f.to.toArray(), fromYaw: f.fromYaw, toYaw: f.toYaw,
      lift: f.lift, toe: f.toe, land: f.land, tn: f.tn.toArray(),
      cw: f.cw.toArray(), cyaw: f.cyaw, pitch: f.pitch, cn: f.cn.toArray(),
      disp: f.disp.toArray(), dispYaw: f.dispYaw, dispOK: f.dispOK,
    })),
  };
}

function restoreState(ch, saved) {
  ch.sp.set(saved.sp); ch.tr.set(saved.tr); ch.P.set(saved.P);
  ch.landAmp = saved.landAmp;
  ch.feet.forEach((f, i) => {
    const s = saved.feet[i];
    f.pw.fromArray(s.pw); f.yaw = s.yaw; f.n.fromArray(s.n); f.planted = s.planted;
    f.sw = s.sw; f.mode = s.mode; f.su = s.su; f.dur = s.dur;
    f.from.fromArray(s.from); f.to.fromArray(s.to); f.fromYaw = s.fromYaw; f.toYaw = s.toYaw;
    f.lift = s.lift; f.toe = s.toe; f.land = s.land; f.tn.fromArray(s.tn);
    f.cw.fromArray(s.cw); f.cyaw = s.cyaw; f.pitch = s.pitch; f.cn.fromArray(s.cn);
    f.disp.fromArray(s.disp); f.dispYaw = s.dispYaw; f.dispOK = s.dispOK;
  });
}

function wpos(api, ch, bone) {
  return ch.bones[bone].getWorldPosition(new api.THREE.Vector3());
}

function kneeAngle(api, ch, side) {
  // Measure in kid space: the old source's land squash scales the whole kid
  // group non-uniformly, which distorts world distances without changing the
  // joint articulation. The squash itself is asserted separately (kid scale,
  // weapon pivot basis), so articulation is compared scale-free here.
  const inv = new api.THREE.Matrix4().copy(ch.kid.matrixWorld).invert();
  const p = name => ch.bones[name].getWorldPosition(new api.THREE.Vector3()).applyMatrix4(inv);
  const hip = p('thigh' + side);
  const shin = p('shin' + side);
  const foot = p('foot' + side);
  return Math.PI - shin.clone().sub(hip).angleTo(shin.clone().sub(foot));
}

function snapshot(api, ch, CH, T) {
  ch.root.updateMatrixWorld(true);
  ch.skeleton.update();
  return {
    sqy: ch.P[CH.SQY], sqxz: ch.P[CH.SQXZ],
    kidScale: [...ch.kid.scale.toArray()],
    // pelvis Y offset: an absolute sign of this channel is not a zero-relative
    // baseline, so callers compare it against the equivalent no-land pose.
    pelvisY: ch.P[CH.HIPS_P + 1],
    kneeL: kneeAngle(api, ch, 'L'), kneeR: kneeAngle(api, ch, 'R'),
    head: wpos(api, ch, 'head').toArray(),
    handL: wpos(api, ch, 'handL').toArray(),
    handR: wpos(api, ch, 'handR').toArray(),
    hips: wpos(api, ch, 'hips').toArray(),
    tank: ch.slosh, landT: ch.tr[T.T_LAND],
  };
}

// Held weapon pivot world matrix: basis column lengths and Gram matrix (M^T·M).
// The pivot hangs off the hand bone under the kid group, so a land squash that
// scales the kid non-uniformly shows up here as a rigid-body shape violation.
function weaponShape(ch) {
  ch.root.updateMatrixWorld(true);
  const e = ch.weapon.pivot.matrixWorld.elements;
  const cols = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]];
  const len = cols.map(c => Math.hypot(c[0], c[1], c[2]));
  let gram = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const g = cols[i][0] * cols[j][0] + cols[i][1] * cols[j][1] + cols[i][2] * cols[j][2];
    gram = Math.max(gram, Math.abs(g - (i === j ? 1 : 0)));
  }
  const det = cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1])
    - cols[0][1] * (cols[1][0] * cols[2][2] - cols[1][2] * cols[2][0])
    + cols[0][2] * (cols[1][0] * cols[2][1] - cols[1][1] * cols[2][0]);
  return {
    lenDev: Math.max(...len.map(l => Math.abs(l - 1))),
    gram, det,
  };
}
test('landing adapter is a minimal S_SQ-only removal', () => {
  const before = 'sp[S_PELY + 1] -= 3.0 * a; sp[S_SQ + 1] -= 3.6 * a; sp[S_LEANP + 1] += 2.2 * a; sp[S_HEADP + 1] += 3.5 * a;';
  const out = adaptLandingRigidity('src/game/character.js', before);
  assert.equal(out, before.replace('sp[S_SQ + 1] -= 3.6 * a; ', ''));
  assert.ok(!out.includes(OLD_SNIPPET));
  for (const keep of ['sp[S_PELY + 1] -= 3.0 * a;', 'sp[S_LEANP + 1] += 2.2 * a;', 'sp[S_HEADP + 1] += 3.5 * a;']) {
    assert.ok(out.includes(keep), keep);
  }
  assert.equal(adaptLandingRigidity('src/game/other.js', before), before);
  assert.throws(() => adaptLandingRigidity('src/game/character.js', 'no anchor'), /landing rigidity/);
});


test('real Character keeps articulated land pose without squash stretch', async () => {
  const oldApi = await realm(false);
  const newApi = await realm(true);
  const CH = newApi.CHARACTER_CHANNELS;
  const T = newApi.CHARACTER_TIMERS;
  const oldCH = oldApi.CHARACTER_CHANNELS;
  const oldT = oldApi.CHARACTER_TIMERS;
  const oldRigs = rigsFor(oldApi);
  const newRigs = rigsFor(newApi);
  try {
    for (const kind of KINDS) {
      for (const hard of [false, true]) {
        for (const hz of RATES) {
          const dt = 1 / hz;
          const a = oldRigs.get(kind);
          const b = newRigs.get(kind);
          // Equivalent no-land pose: same rig, same dt, no trigger. Channel
          // signs are not a zero-relative baseline, so land responses are
          // measured against this pose instead of against absolute zero.
          restoreState(a.ch, a.saved);
          for (let i = 0; i < 2; i++) a.ch.update(dt, a.state);
          const refOldShape = weaponShape(a.ch);
          restoreState(b.ch, b.saved);
          for (let i = 0; i < 2; i++) b.ch.update(dt, b.state);
          const ref = snapshot(newApi, b.ch, CH, T);
          const refShape = weaponShape(b.ch);
          assert.ok(refShape.lenDev < RIGID_TOL && refShape.gram < RIGID_TOL && refShape.det > 0.999,
            `${kind} hard=${hard} hz=${hz} settled weapon basis ${JSON.stringify(refShape)}`);
          assert.ok(refOldShape.lenDev < RIGID_TOL && refOldShape.gram < RIGID_TOL,
            `${kind} hard=${hard} hz=${hz} old settled weapon basis ${JSON.stringify(refOldShape)}`);
          restoreState(a.ch, a.saved);
          restoreState(b.ch, b.saved);
          a.ch.trigger('land', hard ? 15.5 : 4.5);
          b.ch.trigger('land', hard ? 15.5 : 4.5);
          for (let i = 0; i < 2; i++) { a.ch.update(dt, a.state); b.ch.update(dt, b.state); }
          const before = snapshot(oldApi, a.ch, oldCH, oldT);
          const after = snapshot(newApi, b.ch, CH, T);
          const oldShape = weaponShape(a.ch);
          const newShape = weaponShape(b.ch);
          assert.ok(Math.abs(after.sqy - 1) < 1e-9, `${kind} hard=${hard} hz=${hz} SQY`);
          assert.ok(Math.abs(after.sqxz - 1) < 1e-9, `${kind} hard=${hard} hz=${hz} SQXZ`);
          assert.ok(Math.abs(before.sqy - 1) > 1e-4, `${kind} old source must squash`);
          for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(after.kidScale[axis] - 1) < 1e-9, `${kind} kid scale`);
          assert.ok(after.pelvisY < ref.pelvisY - 1e-4,
            `${kind} hard=${hard} hz=${hz} pelvis ${after.pelvisY} vs no-land ${ref.pelvisY}`);
          assert.ok(after.hips[1] < ref.hips[1],
            `${kind} hard=${hard} hz=${hz} articulated hips ${after.hips[1]} vs no-land ${ref.hips[1]}`);
          assert.ok(Number.isFinite(after.kneeL) && Number.isFinite(after.kneeR));
          assert.ok(Math.abs(after.kneeL - before.kneeL) < 0.05,
            `${kind} hard=${hard} hz=${hz} kneeL new=${after.kneeL} old=${before.kneeL}`);
          assert.ok(Math.abs(after.kneeR - before.kneeR) < 0.05,
            `${kind} hard=${hard} hz=${hz} kneeR new=${after.kneeR} old=${before.kneeR}`);
          for (const key of ['head', 'handL', 'handR', 'hips']) assert.ok(after[key].every(Number.isFinite), `${kind} ${key}`);
          assert.ok(Number.isFinite(after.tank), `${kind} tank hz=${hz}`);
          assert.ok(after.landT >= 0 && after.landT < 1, `${kind} land timer hz=${hz}`);
          assert.ok(Math.abs(after.landT - before.landT) < 1e-9, `${kind} land timing hz=${hz}`);
          // Held weapon pivot world basis stays rigid (unit lengths, orthonormal
          // Gram, positive determinant) for the patched source...
          assert.ok(newShape.lenDev < RIGID_TOL && newShape.gram < RIGID_TOL && newShape.det > 0.999,
            `${kind} hard=${hard} hz=${hz} weapon basis ${JSON.stringify(newShape)}`);
          // ...and the old source's land squash is a real negative control:
          // the same rig settles rigid but stretches the weapon parent basis.
          assert.ok(oldShape.lenDev > DISTORT_TOL && oldShape.gram > DISTORT_TOL,
            `${kind} hard=${hard} hz=${hz} old weapon stretch ${JSON.stringify(oldShape)}`);
        }
      }
    }
  } finally {
    // Real skinned Characters are expensive: the settled rigs stay cached for
    // the remaining tests in this file, which always restore before triggering.
  }
});

test('other jump/dodge/slam squash scales are unchanged', async () => {
  const newApi = await realm(true);
  const CH = newApi.CHARACTER_CHANNELS;
  const rigs = rigsFor(newApi);
  try {
    for (const kind of KINDS) {
      const { ch, state, saved } = rigs.get(kind);
      restoreState(ch, saved);
      ch.trigger('jump');
      ch.update(1 / 60, state);
      assert.ok(Number.isFinite(ch.P[CH.SQY]) && Number.isFinite(ch.P[CH.SQXZ]), `${kind} jump`);
      restoreState(ch, saved);
      ch.trigger('dodge', { x: 0, z: 1, t: 0.3 });
      ch.update(1 / 60, state);
      assert.ok(Number.isFinite(ch.P[CH.SQY]) && Number.isFinite(ch.P[CH.SQXZ]), `${kind} dodge`);
      restoreState(ch, saved);
      ch.trigger('special_leap');
      ch.trigger('special_slam');
      ch.grounded = true;
      for (let i = 0; i < 5; i++) ch.update(1 / 60, state);
      assert.ok(Number.isFinite(ch.P[CH.SQY]) && Number.isFinite(ch.P[CH.SQXZ]), `${kind} slam`);
    }
  } finally {
    // shared cached rigs: nothing to release here (see rigsFor).
  }
  const raw = fs.readFileSync(path.join(SRC, 'src/game/character.js'), 'utf8');
  const out = adaptLandingRigidity('src/game/character.js', adaptSource('src/game/character.js', raw));
  for (const keep of ['sp[S_SQ + 1] -= 1.6;', 'sp[S_SQ + 1] += 2.6;', 'this.sp[S_SQ + 1] -= 3.2;']) assert.ok(out.includes(keep), keep);
});

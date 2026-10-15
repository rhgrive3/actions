import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// Production composition in ONE realm WITH the optional source locomotion
// controller actually loaded: the real Player00 coefficient packs, the real
// HumanRetarget and SourceMotionController (adapted by adapter.mjs), the real
// Character rig and the production installer. Other VM tests have no dynamic
// import, so their Characters fall back to the native procedural motion.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const DEG = 180 / Math.PI;
let cached;

function fileFetch(url) {
  const href = String(url);
  if (!href.startsWith('file:')) return Promise.reject(new Error('fixture fetch is file-only: ' + href));
  const file = fileURLToPath(href);
  if (!fs.existsSync(file)) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(fs.readFileSync(file)));
}

// Host Blob does not recognise the VM realm's typed arrays as byte sources, and
// source-bank.js checks `instanceof ArrayBuffer` against the VM realm's constructor.
const RealmBlob = function (parts = [], options) {
  return new Blob(parts.map(p => ArrayBuffer.isView(p) ? Buffer.from(p.buffer, p.byteOffset, p.byteLength) : p), options);
};
function realmResponse(context) {
  const RealmArrayBuffer = vm.runInContext('ArrayBuffer', context);
  return class RealmResponse extends Response {
    async arrayBuffer() {
      const bytes = new Uint8Array(await super.arrayBuffer()), out = new RealmArrayBuffer(bytes.byteLength);
      new Uint8Array(out).set(bytes); return out;
    }
  };
}

async function production() {
  if (cached) return cached;
  const context = vm.createContext({
    console, performance, URL, Blob: RealmBlob, DecompressionStream, TextDecoder, crypto,
    queueMicrotask, setTimeout, clearTimeout,
  });
  const RealmResponse = context.Response = realmResponse(context);
  context.fetch = url => fileFetch(url).then(r => new RealmResponse(r.body, { status: r.status }));
  const modules = new Map();
  const resolve = (specifier, from) => specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from), specifier);
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source, {
      context, identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
      importModuleDynamically: async specifier => {
        const dep = load(resolve(specifier, file));
        if (dep.status === 'unlinked') await dep.link((s, from) => load(resolve(s, from.identifier)));
        if (dep.status === 'linked') await dep.evaluate();
        return dep;
      },
    });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export * as posture from './patches/splatoon3/runtime/source-posture.mjs';
  `, { context, identifier: path.join(ROOT, 'source-posture-entry.mjs') });
  await entry.link((specifier, from) => load(resolve(specifier, from.identifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), posture: entry.namespace.posture, profile };
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], spawnPads: [new THREE.Vector3()], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0; G.mode = 'match';
  cached = api; return api;
}

async function rig(api, weapon = 'shooter') {
  const ch = new api.Character({ name: 'source posture', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 }, weapon });
  api.G.scene.add(ch.root); ch.onEvent = null;
  await ch._sourceMotionLoader;
  assert.equal(ch.sourceMotion.status, 'ready', 'source locomotion bank must load in this fixture');
  return ch;
}
function state() {
  return { form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0, aimPitch: 0 };
}
/** Drive the root at `speed` (m/s) along +Z for `frames` ticks of `hz`. */
function drive(api, ch, st, { speed = 0, frames = 1, hz = 60, firing = false, onFrame } = {}) {
  const dt = 1 / hz;
  for (let f = 0; f < frames; f++) {
    ch.root.position.z += speed * dt;
    st.speed = speed; st.localMove.z = speed > 0 ? 1 : 0; st.firing = firing;
    api.G.time += dt;
    if (firing && f % Math.max(1, Math.round(hz / 12)) === 0) ch.trigger('shoot');
    ch.update(dt, st); ch.root.updateMatrixWorld(true);
    onFrame?.(f);
  }
}
function measure(api, ch) {
  const { THREE } = api, w = n => ch.bones[n].getWorldPosition(new THREE.Vector3()).sub(ch.root.position);
  const hips = w('hips'), chest = w('chest'), neck = w('neck'), head = w('head'), hand = w('handR'), handL = w('handL');
  const muzzle = ch.getMuzzle(new THREE.Vector3()).sub(ch.root.position), m = muzzle.clone().sub(hand).normalize();
  const tilt = v => Math.atan2(v.z, v.y) * DEG;
  return { handL, hands: hand.distanceTo(handL), reach: hand.z - chest.z, torso: tilt(chest.clone().sub(hips)), neck: tilt(head.clone().sub(neck)), pitch: Math.asin(m.y) * DEG, yaw: Math.atan2(m.x, m.z) * DEG, hand, muzzle };
}
function maxOver(api, ch, st, opts, fn) {
  let best = -Infinity;
  drive(api, ch, st, { ...opts, onFrame: () => { best = Math.max(best, fn()); } });
  return best;
}
function legFlex(api, ch) {
  const { THREE } = api; let flex = 0;
  for (const side of ['L', 'R']) {
    const leg = ch.limbs['leg' + side], hip = leg.up.getWorldPosition(new THREE.Vector3()), knee = leg.lo.getWorldPosition(new THREE.Vector3());
    const foot = ch.bones['foot' + side].getWorldPosition(new THREE.Vector3());
    flex = Math.max(flex, (Math.PI - knee.clone().sub(hip).angleTo(knee.clone().sub(foot))) * DEG);
  }
  return flex;
}

test('adapter connects the source posture hooks exactly once', () => {
  const retarget = adaptSource('src/game/motion/retarget.js', fs.readFileSync(path.join(SRC, 'src/game/motion/retarget.js'), 'utf8'));
  const controller = adaptSource('src/game/motion/source-controller.js', fs.readFileSync(path.join(SRC, 'src/game/motion/source-controller.js'), 'utf8'));
  assert.equal(controller.match(/sourceCarryHand/g), null);
  assert.equal(retarget.match(/sourcePostureBone\(this,target,this\.q,dir,isUpper&&upper\);/g)?.length, 1);
  assert.equal(retarget.match(/sourceFootLift\(this,this\.v3,label\);/g)?.length, 1);
  assert.equal(controller.match(/sourceCarryWeapon\(this,this\.weaponQ\);this\.weaponQ\.premultiply\(this\.retarget\.aim\);/g)?.length, 1);
  assert.throws(() => adaptSource('src/game/motion/retarget.js', 'export const broken = 1;'), /source torso\/neck posture/);
});

test('the Wii U hold clips lean forward; the corrected stance, walk and run stay upright with a level head', async () => {
  const api = await production(), ch = await rig(api), { bank } = ch.sourceMotion, ix = bank.index;
  const pose = new ch.sourceMotion.pose.constructor(bank), lean = (name, frame) => {
    bank.sample(name, frame, pose);
    const d = pose.wp[ix.chest].clone().sub(pose.wp[ix.spine1]);
    return Math.atan2(d.z, d.y) * DEG;
  };
  // Source facts this correction is about (Player00, not Splatoon 3 data).
  assert.ok(lean('WaitHold_Nrml', 0) > 15 && lean('WalkHold_Nrml', 10) > 25 && lean('RunHold_Nrml', 8) > 25);

  const st = state();
  api.posture.setSourcePostureEnabled(false);
  drive(api, ch, st, { frames: 120 });
  const raw = measure(api, ch);
  api.posture.setSourcePostureEnabled(true);
  drive(api, ch, st, { frames: 120 });
  const idle = measure(api, ch);
  assert.ok(raw.torso > 10 && raw.neck > 15, `baseline stance hunches (${raw.torso.toFixed(1)}°, neck ${raw.neck.toFixed(1)}°)`);
  assert.ok(Math.abs(idle.torso) < 8 && Math.abs(idle.neck) < 8, `upright stance (${idle.torso.toFixed(1)}°, neck ${idle.neck.toFixed(1)}°)`);
  for (const speed of [1.6, 6]) {
    const torso = maxOver(api, ch, st, { speed, frames: 150 }, () => measure(api, ch).torso);
    const neck = maxOver(api, ch, st, { speed, frames: 60 }, () => Math.abs(measure(api, ch).neck));
    assert.ok(torso < 14 && neck < 10, `${speed} m/s: torso ≤ ${torso.toFixed(1)}°, neck ≤ ${neck.toFixed(1)}°`);
  }
  ch.dispose();
});

test('a non-firing shooter: level two-hand carry when moving, the source two-hand hold kept when standing', async () => {
  const api = await production(), st = state(), runs = [];
  // Identical input on two fresh rigs (opt-out, corrected) so the standing clip phase matches.
  for (const on of [false, true]) {
    api.posture.setSourcePostureEnabled(on);
    const ch = await rig(api);
    drive(api, ch, st, { speed: 1.6, frames: 150 });
    const walk = measure(api, ch);
    drive(api, ch, st, { speed: 6, frames: 150 });
    const run = measure(api, ch);
    drive(api, ch, st, { frames: 150 });
    runs.push({ ch, walk, run, stand: measure(api, ch) });
    if (!on) ch.dispose();
  }
  const [{ walk: rawWalk, stand: rawStand }, { ch, walk, run, stand }] = runs;
  assert.ok(rawWalk.yaw > 50, `the Wii U carry crosses the belly (${rawWalk.yaw.toFixed(1)}°)`);
  for (const [name, m] of [['walk', walk], ['run', run]]) {
    assert.ok(Math.abs(m.yaw) < 25 && m.pitch > -25 && m.pitch < 10, `${name}: pitch ${m.pitch.toFixed(1)}°, yaw ${m.yaw.toFixed(1)}°`);
  }
  // Standing: the barrel direction and both hands on the gun stay as authored (S3 footage shows the
  // support hand on the gun; the arms keep their world direction while the torso is uprighted).
  assert.ok(Math.abs(stand.pitch - rawStand.pitch) < 1 && Math.abs(stand.yaw - rawStand.yaw) < 1,
    `standing barrel ${rawStand.pitch.toFixed(1)}°/${rawStand.yaw.toFixed(1)}° -> ${stand.pitch.toFixed(1)}°/${stand.yaw.toFixed(1)}°`);
  assert.ok(walk.hands < 0.2 && stand.hands < 0.2 && Math.abs(stand.hands - rawStand.hands) < 0.01,
    `two-hand hold (walk ${walk.hands.toFixed(3)}, stand ${rawStand.hands.toFixed(3)} -> ${stand.hands.toFixed(3)})`);
  // Stopping and starting turn the gun over several frames, never in one jump.
  let last = null, jump = 0;
  const track = () => { const m = measure(api, ch), d = m.muzzle.clone().sub(m.hand).normalize(); if (last) jump = Math.max(jump, d.angleTo(last)); last = d; };
  drive(api, ch, st, { speed: 1.6, frames: 90, onFrame: track });
  drive(api, ch, st, { frames: 90, onFrame: track });
  assert.ok(jump * 180 / Math.PI < 12, `barrel per-frame turn ${(jump * 180 / Math.PI).toFixed(2)}°`);
  ch.dispose();
});

test('firing keeps the native weapon pose; shot origins move by less than a millimetre', async () => {
  const api = await production(), { THREE } = api, st = state(), runs = [];
  // weapons.js _muzzle: the first shot blends the visible muzzle with the aim muzzle by aimReady().
  const origin = ch => {
    const out = ch.getMuzzle(new THREE.Vector3()), w = ch.aimReady(), aim = new THREE.Vector3();
    if (w < 0.98 && ch.getAimMuzzle(aim, 0)) out.lerp(aim, 1 - w);
    return out.sub(ch.root.position);
  };
  for (const on of [false, true]) {
    api.posture.setSourcePostureEnabled(on);
    for (const speed of [0, 1.6]) {
      const ch = await rig(api);
      drive(api, ch, st, { speed, frames: 90 });
      const first = origin(ch);
      drive(api, ch, st, { speed, frames: 60, firing: true });
      assert.equal(ch.sourceMotion.sourceUpper, false, 'the native upper body owns an attack');
      runs.push({ on, speed, first, held: origin(ch) }); ch.dispose();
    }
  }
  api.posture.setSourcePostureEnabled(true);
  for (const speed of [0, 1.6]) {
    const [off, on] = [false, true].map(v => runs.find(r => r.on === v && r.speed === speed));
    const first = off.first.distanceTo(on.first), held = off.held.distanceTo(on.held);
    console.log(`shot origin delta at ${speed} m/s: first ${(first * 1000).toFixed(3)} mm, after 1 s ${(held * 1000).toFixed(3)} mm`);
    assert.ok(first < 1e-3 && held < 1e-3, `${speed} m/s: first ${first}, held ${held}`);
  }
});

test('swing feet are lower while planted feet stay planted', async () => {
  const api = await production(), { THREE } = api, st = state(), flex = [], drifts = [];
  for (const on of [false, true]) {
    api.posture.setSourcePostureEnabled(on);
    const ch = await rig(api);
    drive(api, ch, st, { speed: 1.6, frames: 90 });
    const last = [null, null]; let drift = 0;
    flex.push(maxOver(api, ch, st, { speed: 1.6, frames: 120 }, () => {
      ch.sourceMotion.retarget.contacts.forEach((f, i) => {
        const p = ch.bones['foot' + f.side].getWorldPosition(new THREE.Vector3());
        if (f.locked && f.weight > 0.999 && last[i]) drift = Math.max(drift, p.distanceTo(last[i]));
        last[i] = f.locked && f.weight > 0.999 ? p : null;
      });
      return legFlex(api, ch);
    }));
    drifts.push(drift);
    ch.dispose();
  }
  api.posture.setSourcePostureEnabled(true);
  assert.ok(flex[1] < flex[0] - 8, `knee flexion ${flex[0].toFixed(1)}° -> ${flex[1].toFixed(1)}°`);
  assert.ok(drifts[1] <= drifts[0] + 1e-4, `planted ankle drift ${drifts.join(' -> ')}`);
});

test('the posture blend is frame-rate independent, holds on paused frames and leaves manual clips untouched', async () => {
  const api = await production(), weights = [];
  for (const hz of [30, 60, 120]) {
    const ch = await rig(api), st = state();
    drive(api, ch, st, { frames: 2 * hz, hz });
    assert.ok(Math.abs(api.posture.sourcePostureWeight(ch.sourceMotion.retarget) - 1) < 1e-4);
    ch.sourceMotion.playClip('Wait');
    drive(api, ch, st, { frames: hz / 10, hz });
    const released = api.posture.sourcePostureWeight(ch.sourceMotion.retarget);
    weights.push(released);
    for (let i = 0; i < 5; i++) ch.update(0, st); // a paused frame holds the blend instead of snapping
    assert.equal(api.posture.sourcePostureWeight(ch.sourceMotion.retarget), released);
    drive(api, ch, st, { frames: hz, hz });
    assert.ok(api.posture.sourcePostureWeight(ch.sourceMotion.retarget) < 1e-3, `${hz} Hz manual clip releases the correction`);
    ch.dispose();
  }
  assert.ok(Math.max(...weights) - Math.min(...weights) < 0.02, `0.1 s release weights ${weights.map(w => w.toFixed(3))}`);
});


test('source ToHuman bow is corrected after kid silhouette returns, without changing action clocks', async () => {
  const api = await production();
  const emergence = api.posture.sourceEmergePostureWeight;
  assert.equal(emergence({ state: 'ToHuman', formKid: true, grounded: true, formWeight: 0 }), 0);
  assert.equal(emergence({ state: 'ToHuman', formKid: true, grounded: true, formWeight: 0.001 }), 1);
  assert.equal(emergence({ state: 'ToHuman', formKid: true, grounded: true, formWeight: 0.85 }), 1);
  assert.equal(emergence({ state: 'ToHuman', formKid: false, grounded: true, formWeight: 1 }), 0);
  assert.equal(emergence({ state: 'ToHuman', formKid: true, grounded: false, formWeight: 1 }), 0);
  assert.equal(emergence({ state: 'manual', formKid: true, grounded: true, formWeight: 1 }), 0);
  assert.equal(emergence({ state: 'ToHuman', formKid: true, grounded: true,
    formWeight: 1, manual: { name: 'ToHuman' } }), 0);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const current = emergence({ state: 'ToHuman', formKid: true, grounded: true,
      formWeight: i / 100 });
    assert.ok(current >= previous - 1e-12 && current >= 0 && current <= 1);
    previous = current;
  }

  const traces = [];
  for (const on of [false, true]) {
    api.posture.setSourcePostureEnabled(on);
    const ch = await rig(api), st = state(), samples = [];
    drive(api, ch, st, { frames: 90 });
    st.form = 'squid';
    drive(api, ch, st, { frames: 45 });
    assert.equal(ch.sourceMotion.formKid, false);
    st.form = 'kid';
    drive(api, ch, st, { frames: 36, onFrame: () => {
      const c = ch.sourceMotion, m = measure(api, ch);
      samples.push({ state: c.state, formWeight: c.formWeight,
        weight: api.posture.sourcePostureWeight(c.retarget),
        torso: m.torso, neck: m.neck, formTime: c.formTime });
    } });
    traces.push(samples);
    ch.dispose();
  }
  api.posture.setSourcePostureEnabled(true);

  const [oldTrace, newTrace] = traces;
  assert.equal(oldTrace.length, newTrace.length);
  const visible = newTrace.map((p, i) => ({ ...p, i })).filter(p =>
    p.state === 'ToHuman' && p.formWeight >= 0.65);
  assert.ok(visible.length >= 2, 'the actual source ToHuman clip must overlap visible kid frames');
  for (const sample of visible) {
    assert.equal(oldTrace[sample.i].state, 'ToHuman', 'the baseline uses the same transition clip');
    assert.ok(sample.weight >= emergence({ state: 'ToHuman', formKid: true,
      grounded: true, formWeight: sample.formWeight }) - 1e-8,
    'late form correction must not lag behind the returning silhouette');
    assert.ok(sample.torso <= oldTrace[sample.i].torso + 3,
      'the repair must not introduce an extra forward bow');
  }
  assert.ok(visible.some(p => oldTrace[p.i].torso - p.torso > 1),
    'the real sourced returning upper body should reduce its forward lean');
  const settled = newTrace.at(-1);
  assert.ok(Math.abs(settled.torso) < 8 && Math.abs(settled.neck) < 8,
    'settled humanoid should hand off smoothly to the existing upright idle calibration');
});

test('airborne carry survives an ordinary moving jump and landing', async () => {
  const api = await production(), ch = await rig(api), st = state(), samples = [];
  api.posture.setSourcePostureEnabled(true);
  const carryAngle = () => {
    const q = new api.THREE.Quaternion();
    api.posture.sourceCarryWeapon(ch.sourceMotion, q);
    return q.angleTo(new api.THREE.Quaternion());
  };
  drive(api, ch, st, { speed: 6, frames: 120 });
  assert.equal(ch.sourceMotion.state, 'move');
  assert.equal(api.posture.sourceCarryWeight(ch.sourceMotion.retarget), 1);
  const onGround = carryAngle();
  assert.ok(onGround > 0.05, 'moving sourced shooter produces the actual carry transform');
  st.grounded = false;
  drive(api, ch, st, { speed: 6, frames: 12, onFrame: () => {
    const c = ch.sourceMotion;
    samples.push({ phase: 'air', state: c.state,
      carry: api.posture.sourceCarryWeight(c.retarget),
      angle: carryAngle(), yaw: measure(api, ch).yaw });
  } });
  assert.ok(samples.every(p => p.state === 'air' && p.carry === 1),
    'ordinary ground-to-air retains the pre-existing shooter carry origin');
  assert.ok(samples[0].angle > 0.01 && samples.at(-1).angle > 0.001 &&
    samples[0].angle < onGround + 1e-5, 'airborne source carry fades rather than disappearing');
  assert.ok(Math.abs(samples[0].yaw) < 45,
    `first air frame unexpectedly rotated the shooter to ${samples[0].yaw.toFixed(2)}°`);

  st.grounded = true;
  drive(api, ch, st, { speed: 6, frames: 12, onFrame: () => {
    const c = ch.sourceMotion;
    samples.push({ phase: 'landing', state: c.state,
      carry: api.posture.sourceCarryWeight(c.retarget), angle: carryAngle() });
  } });
  const landed = samples.filter(p => p.phase === 'landing');
  assert.ok(landed.every(p => p.carry === 1 && p.angle > 0),
    'ordinary air-to-land must retain fading carry rather than snapping to authored hold');
  ch.dispose();
});

test('sourced ToHuman cannot generate a phantom carry while airborne or landing', async () => {
  const api = await production(), ch = await rig(api), st = state(), samples = [];
  api.posture.setSourcePostureEnabled(true);
  const carryAngle = () => {
    const q = new api.THREE.Quaternion();
    api.posture.sourceCarryWeapon(ch.sourceMotion, q);
    return q.angleTo(new api.THREE.Quaternion());
  };
  drive(api, ch, st, { frames: 90 });
  st.form = 'squid';
  drive(api, ch, st, { frames: 45 });
  assert.equal(ch.sourceMotion.formKid, false);
  assert.equal(api.posture.sourceCarryWeight(ch.sourceMotion.retarget), 0);

  st.form = 'kid';
  drive(api, ch, st, { frames: 10 });
  assert.equal(ch.sourceMotion.state, 'ToHuman');
  assert.equal(api.posture.sourceCarryWeight(ch.sourceMotion.retarget), 0);

  st.grounded = false;
  drive(api, ch, st, { speed: 6, frames: 50, onFrame: () => {
    const c = ch.sourceMotion;
    samples.push({ state: c.state, carry: api.posture.sourceCarryWeight(c.retarget),
      angle: carryAngle(), posture: api.posture.sourcePostureWeight(c.retarget) });
  } });
  const form = samples.filter(p => p.state === 'ToHuman');
  assert.ok(form.length > 0 && form.every(p => p.carry === 0 && p.angle < 1e-10),
    'visible form clip retains source-defined hold');
  const air = samples.filter(p => p.state === 'air');
  assert.ok(air.length > 10 && air.some(p => p.posture > 0.001),
    'the real bank transitions into air while posture correction is still fading');
  assert.ok(air.every(p => p.carry === 0 && p.angle < 1e-10),
    'ToHuman must not acquire a new airborne carry from residual weight');

  st.grounded = true;
  const landed = [];
  drive(api, ch, st, { speed: 6, frames: 12, onFrame: () =>
    landed.push({ state: ch.sourceMotion.state,
      carry: api.posture.sourceCarryWeight(ch.sourceMotion.retarget), angle: carryAngle() }) });
  assert.ok(landed.every(p => p.state === 'land' && p.carry === 0 && p.angle < 1e-10),
    'landing directly after emergence stays free of phantom carry');
  drive(api, ch, st, { speed: 6, frames: 90 });
  assert.ok(api.posture.sourceCarryWeight(ch.sourceMotion.retarget) > 0.999,
    'ordinary grounded walk gradually regains its carry after the native landing clip');
  assert.ok(carryAngle() > 0.01);
  ch.sourceMotion.playClip('Wait');
  drive(api, ch, st, { frames: 2 });
  assert.equal(api.posture.sourceCarryWeight(ch.sourceMotion.retarget), 0,
    'a manual source clip owns its own weapon');
  assert.ok(carryAngle() < 1e-10);
  ch.dispose();
});

test('reacquires shooter carry without a grounded ToHuman weapon snap', async () => {
  const api = await production(), ch = await rig(api), st = state(), samples = [];
  api.posture.setSourcePostureEnabled(true);
  const carryAngle = () => {
    const q = new api.THREE.Quaternion();
    api.posture.sourceCarryWeapon(ch.sourceMotion, q);
    return q.angleTo(new api.THREE.Quaternion());
  };
  drive(api, ch, st, { frames: 90 });
  st.form = 'squid';
  drive(api, ch, st, { speed: 6, frames: 45 });
  assert.equal(ch.sourceMotion.formKid, false);
  st.form = 'kid';
  drive(api, ch, st, { speed: 6, frames: 90, onFrame: () => {
    const c = ch.sourceMotion;
    samples.push({ state: c.state,
      carry: api.posture.sourceCarryWeight(c.retarget), angle: carryAngle() });
  } });
  const toHuman = samples.filter(x => x.state === 'ToHuman');
  assert.ok(toHuman.length > 0 && toHuman.every(x => x.carry === 0 && x.angle < 1e-10));
  const moving = samples.filter(x => x.state === 'move');
  assert.ok(moving.length >= 15, 'real source bank finishes ToHuman into ordinary movement');
  assert.ok(moving[0].carry > 0 && moving[0].carry < 0.20,
    'first grounded return must ease in, not apply the full shooter yaw in one frame');
  let previous = 0, previousAngle = 0;
  for (const x of moving.slice(0, 15)) {
    assert.ok(x.carry >= previous - 1e-8 && x.carry - previous < 0.15,
      'carry blend stays monotone and bounded at 60Hz');
    assert.ok(x.angle >= previousAngle - 0.005 && x.angle - previousAngle < 0.03,
      'effective weapon rotation must not jump at the clip boundary');
    previous = x.carry; previousAngle = x.angle;
  }
  // The retail/source ToHuman clip length is not a guessed frame constant.
  // After the recorded handoff, provide a full steady-state interval.
  drive(api, ch, st, { speed: 6, frames: 90 });
  assert.ok(api.posture.sourceCarryWeight(ch.sourceMotion.retarget) > 0.999,
    'steady moving source carry reaches original full strength');
  ch.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// Weapon holds and the attack/carry handoff (reports/inkwave-weapon-hold-motion-2026-10-17.md).
// Production composition in ONE realm with the optional source locomotion
// controller actually loaded (as source-posture.test.mjs): the handoff only
// exists where the Wii U source carry owns the idle upper body.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;

function fileFetch(url) {
  const href = String(url);
  if (!href.startsWith('file:')) return Promise.reject(new Error('fixture fetch is file-only: ' + href));
  const file = fileURLToPath(href);
  if (!fs.existsSync(file)) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(fs.readFileSync(file)));
}
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
    export * as handoff from './patches/splatoon3/runtime/weapon-handoff-motion.mjs';
    export * as registry from './patches/splatoon3/runtime/weapon-models/registry.mjs';
    export * as body from './patches/splatoon3/runtime/body-proportion.mjs';
  `, { context, identifier: path.join(ROOT, 'weapon-hold-motion-entry.mjs') });
  await entry.link((specifier, from) => load(resolve(specifier, from.identifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), handoff: entry.namespace.handoff, registry: entry.namespace.registry, body: entry.namespace.body };
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

async function rig(api, weapon) {
  const ch = new api.Character({ name: 'weapon hold', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 }, weapon });
  api.G.scene.add(ch.root); ch.onEvent = null;
  await ch._sourceMotionLoader;
  assert.equal(ch.sourceMotion.status, 'ready', 'source locomotion bank must load in this fixture');
  return ch;
}
const state = () => ({ form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0, aimPitch: 0 });
const kidPoint = (api, ch, o) => { const v = o.getWorldPosition(new api.THREE.Vector3()); ch.kid.worldToLocal(v); return v; };

/** Idle 1 s, fire 0.6 s (a shot every 0.1 s), release 1.5 s; per-frame rendered and gameplay muzzles. */
async function attackCycle(api, weapon, hz, enabled) {
  const ch = await rig(api, weapon), st = state(), dt = 1 / hz, out = [];
  ch.s3WeaponHandoffEnabled = enabled;
  const frames = Math.round(3.1 * hz), on = Math.round(hz), off = Math.round(1.6 * hz), every = Math.round(hz / 10);
  for (let f = 0; f < frames; f++) {
    st.firing = f >= on && f < off;
    api.G.time += dt;
    if (st.firing && (f - on) % every === 0) ch.trigger('shoot');
    ch.update(dt, st); ch.root.updateMatrixWorld(true);
    const shown = kidPoint(api, ch, ch.weapon.muzzle), game = ch.getMuzzle(new api.THREE.Vector3());
    out.push({ shown, game: game.toArray(), owner: ch.sourceMotion.sourceUpper ? 'source' : 'native', snap: api.handoff.weaponHandoffSnapshot(ch) });
  }
  ch.dispose();
  return out;
}
/** Kid-space heading (radians, +left) of a bone's +Z axis. */
const kidYaw = (api, ch, o) => {
  const q = o.getWorldQuaternion(new api.THREE.Quaternion()).premultiply(ch.kid.getWorldQuaternion(new api.THREE.Quaternion()).invert());
  const v = new api.THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(v.x, v.z);
};
const maxStep = rows => rows.slice(1).reduce((m, r, i) => Math.max(m, r.shown.distanceTo(rows[i].shown)), 0);

test('the attack/carry handoff no longer jumps the weapon; the gameplay muzzle is unchanged', async () => {
  const api = await production();
  for (const weapon of ['shooter', 'blaster', 'charger']) {
    const before = await attackCycle(api, weapon, 60, false), after = await attackCycle(api, weapon, 60, true);
    const owners = after.map(r => r.owner).join(',');
    assert.ok(owners.includes('source,native') && owners.includes('native,source'), `${weapon}: both ownership changes happen`);
    const jump = maxStep(before), smooth = maxStep(after);
    assert.ok(jump > 0.25, `${weapon}: the one-frame ownership switch moved the muzzle ${jump.toFixed(3)} m`);
    assert.ok(smooth < 0.6 * jump && smooth < 0.18, `${weapon}: faded handoff steps at most ${smooth.toFixed(3)} m (was ${jump.toFixed(3)} m)`);
    for (let i = 0; i < before.length; i++) assert.deepEqual(after[i].game, before[i].game, `${weapon} frame ${i}: gameplay muzzle`);
    assert.ok(after.some(r => r.snap?.weight > 0.5), `${weapon}: fade weight observed`);
  }
});

test('the handoff fade lasts the same time at 30, 60 and 120 Hz', async () => {
  const api = await production(), spans = [];
  for (const hz of [30, 60, 120]) {
    const rows = await attackCycle(api, 'shooter', hz, true);
    const faded = rows.filter(r => r.owner === 'source' && r.snap?.weight > 1e-4).length / hz;
    spans.push(faded);
    assert.ok(maxStep(rows) * (hz / 60) < 0.18, `${hz} Hz: per-1/60 s step ${(maxStep(rows) * hz / 60).toFixed(3)} m`);
  }
  const { HANDOFF_FADE } = api.handoff;
  for (const s of spans) assert.ok(Math.abs(s - HANDOFF_FADE) <= 1 / 30 + 1e-9, `release fade ${s.toFixed(3)} s vs ${HANDOFF_FADE}`);
});

test('shooters and blasters fire from beside the right cheek, not the chest', async () => {
  const api = await production(), drop = api.body.S3_BODY_PROPORTION.torsoShorten; // the shoulders sit this much lower
  for (const [weapon, minY] of [['shooter', 0.8 - drop], ['s3-shooter-first', 0.8 - drop], ['s3-shooter-long', 0.8 - drop], ['blaster', 0.8 - drop]]) {
    const ch = await rig(api, weapon), st = state();
    st.firing = true;
    for (let f = 0; f < 40; f++) { if (f % 6 === 0) ch.trigger('shoot'); ch.update(1 / 60, st); }
    ch.root.updateMatrixWorld(true);
    const hand = kidPoint(api, ch, ch.bones.handR), head = kidPoint(api, ch, ch.bones.head), shoulder = kidPoint(api, ch, ch.limbs.armR.up);
    assert.ok(hand.y > minY && hand.y > shoulder.y, `${weapon}: grip hand at ${hand.y.toFixed(3)} (shoulder ${shoulder.y.toFixed(3)})`);
    assert.ok(hand.x < head.x - 0.15, `${weapon}: grip beside the right cheek (x ${hand.x.toFixed(3)}, head ${head.x.toFixed(3)})`);
    assert.ok(hand.z - shoulder.z < 0.25, `${weapon}: elbows bent, gun pulled in (${(hand.z - shoulder.z).toFixed(3)} m ahead of the shoulder)`);
    ch.dispose();
  }
  // The family calibration shifts every model's own aim, keeping per-weapon tuning.
  const { registry } = api, base = { aim: { p: [0, 0, 0], r: [0, 0, 0] } };
  assert.deepEqual(registry.weaponHold('s3-shelter-normal', base), base, 'brellas share the shooter kind but not its calibration');
});

test('a stringer draws with the left hand on the string; at rest it hangs in the right hand', async () => {
  const api = await production(), ch = await rig(api, 's3-stringer-normal'), st = state();
  for (let f = 0; f < 60; f++) ch.update(1 / 60, st);
  assert.ok(ch.P[api.CHARACTER_CHANNELS.IKL] < 0.05, 'one-handed carry at rest');
  const handAt = charge => {
    st.firing = true; st.charge = charge;
    for (let f = 0; f < 40; f++) ch.update(1 / 60, st);
    ch.root.updateMatrixWorld(true);
    return { left: kidPoint(api, ch, ch.bones.handL), right: kidPoint(api, ch, ch.bones.handR), shoulder: kidPoint(api, ch, ch.limbs.armR.up) };
  };
  const loose = handAt(0.02), drawn = handAt(1);
  assert.ok(drawn.right.z - drawn.shoulder.z > 0.2, `bow arm reaches forward (${(drawn.right.z - drawn.shoulder.z).toFixed(3)} m)`);
  assert.ok(drawn.left.z < drawn.right.z - 0.25, 'the drawing hand is behind the riser');
  assert.ok(loose.left.z - drawn.left.z > 0.12, `the string hand follows the draw (${(loose.left.z - drawn.left.z).toFixed(3)} m)`);
  ch.dispose();
});

test('a brush rests in the ready stance, both fists at the butt, head up past the right shoulder', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS;
  for (const weapon of ['s3-brush-mini', 's3-brush-normal', 's3-brush-heavy']) {
    const ch = await rig(api, weapon), st = state();
    for (let f = 0; f < 60; f++) ch.update(1 / 60, st);
    ch.root.updateMatrixWorld(true);
    const tip = kidPoint(api, ch, ch.weapon.muzzle), head = kidPoint(api, ch, ch.bones.head);
    assert.ok(tip.y > head.y, `${weapon}: head carried up over the shoulder (${tip.y.toFixed(3)} vs head ${head.y.toFixed(3)})`);
    assert.ok(ch.P[C.IKL] > 0.99, `${weapon}: both hands at rest`);
    const left = kidPoint(api, ch, ch.bones.handL), right = kidPoint(api, ch, ch.bones.handR);
    assert.ok(left.y < right.y && left.distanceTo(right) < 0.16, `${weapon}: left fist on the butt, right fist just above it`);
    // The brush rests in the existing INKWAVE ready stance (shooter body clips), not the upright roller rest.
    assert.ok(ch.sourceMotion.active && !ch.sourceMotion.sourceUpper, `${weapon}: source body, native weapon arms`);
    assert.equal(ch.sourceMotion.debug.clips.map(c => c.name).join(), 'WaitHold_Nrml', `${weapon}: ready-stance rest clip`);
    ch.trigger('shoot');
    let held = 1;
    for (let f = 0; f < 20; f++) { ch.update(1 / 60, st); held = Math.min(held, ch.P[C.IKL]); }
    assert.ok(held > 0.99, `${weapon}: two-handed sweep`);
    ch.dispose();
  }
});

test('shooters, dualies and brushes are 30% larger about the grip; other families are not', async () => {
  const api = await production(), { registry } = api, unscaled = [];
  for (const [id, k] of [['shooter', 1.3], ['s3-shooter-long', 1.3], ['dualies', 1.3], ['s3-maneuver-short', 1.3], ['s3-brush-normal', 1.3],
    ['blaster', 1], ['charger', 1], ['roller', 1], ['s3-stringer-normal', 1], ['s3-shelter-normal', 1]]) {
    const ch = await rig(api, id), d = ch.weapon.def;
    assert.equal(d.modelScale ?? 1, k, `${id} model scale`);
    if (k === 1) unscaled.push(id);
    ch.dispose();
  }
  assert.equal(registry.weaponBehaviorFamily('s3-shelter-normal'), 'brella', 'brellas share the shooter model kind only');
  assert.ok(unscaled.length === 5);
});

test('standing still, the front (left) foot points straight ahead: shooter, brush and roller', async () => {
  const api = await production();
  for (const weapon of ['shooter', 's3-brush-normal', 'roller']) {
    const ch = await rig(api, weapon), st = state();
    for (let f = 0; f < 60; f++) ch.update(1 / 60, st);
    ch.root.updateMatrixWorld(true);
    const yaw = kidYaw(api, ch, ch.bones.footL) * 180 / Math.PI;
    assert.ok(Math.abs(yaw) < 2, `${weapon}: front foot heading ${yaw.toFixed(1)} deg`);
    ch.dispose();
  }
});

test('a brush stands with the right foot out to the side and the body twisted under a forward head', async () => {
  const api = await production(), feet = {};
  for (const weapon of ['shooter', 's3-brush-normal']) {
    const ch = await rig(api, weapon), st = state();
    for (let f = 0; f < 60; f++) ch.update(1 / 60, st);
    ch.root.updateMatrixWorld(true);
    feet[weapon] = { foot: kidPoint(api, ch, ch.bones.footR), chest: kidYaw(api, ch, ch.bones.chest), head: kidYaw(api, ch, ch.bones.head) };
    ch.dispose();
  }
  const shooter = feet.shooter, brush = feet['s3-brush-normal'];
  assert.ok(shooter.foot.z < -0.2, 'the shooter rear foot stays back');
  assert.ok(brush.foot.z > -0.12 && brush.foot.x < -0.19, `brush right foot to the side (${brush.foot.x.toFixed(3)}, ${brush.foot.z.toFixed(3)})`);
  assert.ok(brush.chest < shooter.chest - 0.12, `chest turned to the right (${brush.chest.toFixed(3)} vs ${shooter.chest.toFixed(3)})`);
  assert.ok(Math.abs(brush.head - shooter.head) < 0.06, 'the head keeps facing forward');
});


test('the torso is shorter: the shoulders and everything above drop, the crotch does not', async () => {
  const api = await production(), P = api.body.S3_BODY_PROPORTION, s = P.torsoShorten;
  assert.equal(s, 0.05);
  assert.ok(Math.abs(api.body.s3ProportionY(P.hipY) - api.body.S3_HIP_Y) < 1e-9, 'hip joint height unchanged');
  assert.ok(Math.abs(api.body.s3ProportionY(1.2) - (1.2 - s)) < 1e-12, 'above the shoulders: lowered by the shortening');
  const ch = await rig(api, 'shooter'), st = state(), rest = ch.rest;
  for (let f = 0; f < 10; f++) ch.update(1 / 60, st);
  for (const n of ['neck', 'clavL', 'clavR'])
    assert.ok(Math.abs(ch.bones[n].position.y - (rest[n].y - rest.chest.y - s)) < 1e-9, n + ' lowered on the chest after the update');
  ch.dispose();
});

// #767: an admitted wall Squid Roll must launch along the stick heading inside the
// outward cone. Real public modules plus the build adapter; no fake game model and no
// second gameplay engine. Pre-fix the launch direction was hard-pinned to the wall
// normal, so every admitted stick angle produced one identical heading.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const DT = 1 / 60;

// Fresh complete production realm, same construction the wall-motion suite uses.
async function production() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { beforeActions } from './patches/splatoon3/runtime/movement.mjs';
  `, { context, identifier: path.join(ROOT, 'wall-squid-roll-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.time = 0;
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = [];
  return api;
}

// Attached to the outward face of a wall whose normal is +Z, with the stick held at
// `deg` off that normal in the +X half-plane. Admission is dot(move, wallN) >= 0.3.
function onWall(api, deg) {
  const a = new api.Actor({ team: 0, name: 'wall squid roll', weapon: 'shooter', isLocal: true,
    CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const rad = deg * Math.PI / 180;
  a.form = 'squid'; a.submerged = false; a.climbing = true; a.grounded = false;
  a.wallN.set(0, 0, 1); a.anim.wallNormal.copy(a.wallN);
  a.intent.squid = true;
  a.intent.move.set(Math.sin(rad), 0, Math.cos(rad));
  a.vel.set(0, 0, 0);
  G_pump(api);
  return a;
}
function G_pump(api) { api.G.time += DT; }

// Launch on the jump frame and report the realised heading, speed and action state.
function launch(api, a, pressed = true) {
  const before = a.s3.actions?.chain ?? 0;
  const consumed = api.beforeActions(a, DT, pressed);
  const actions = a.s3.actions ?? {};
  const vx = a.vel.x, vz = a.vel.z;
  return {
    consumed,
    heading: Math.atan2(vx, vz) * 180 / Math.PI,   // 0 = straight out along the wall normal
    speed: Math.hypot(vx, vz),
    vertical: a.vel.y,
    chain: actions.chain ?? 0,
    chainBefore: before,
    roll: actions.roll && { time: actions.roll.time, armorTime: actions.roll.armorTime },
    climbing: a.climbing, grounded: a.grounded,
  };
}

test('#767 an admitted wall Squid Roll launches along the stick heading, not the wall normal', async () => {
  const api = await production();
  // Native negative baseline: pre-fix, every one of these produced heading 0 exactly,
  // because the direction was the wall normal rather than the stick.
  const angles = [0, 20, 40];
  const headings = angles.map(deg => launch(api, onWall(api, deg)).heading);
  assert.equal(headings[0], 0, 'a stick held on the normal still launches on the normal');
  for (const [i, deg] of angles.slice(1).entries()) {
    assert.ok(Math.abs(headings[i + 1] - deg) < 1e-6,
      `a ${deg} degree stick must launch at ${deg} degrees, got ${headings[i + 1]}`);
  }
  // The three headings must be distinct: this is exactly what the pinned normal made
  // impossible, and it fails loudly against the pre-fix runtime.
  assert.equal(new Set(headings.map(h => h.toFixed(6))).size, angles.length,
    `every admitted stick angle produced the same heading: ${headings}`);
});

test('#767 the lateral component is signed and survives on both halves of the cone', async () => {
  const api = await production();
  for (const sign of [1, -1]) {
    const rad = 35 * Math.PI / 180;
    const a = onWall(api, 0);
    a.intent.move.set(sign * Math.sin(rad), 0, Math.cos(rad));
    const r = launch(api, a);
    assert.ok(Math.abs(Math.abs(r.heading) - 35) < 1e-6, `expected a 35 degree heading, got ${r.heading}`);
    assert.ok(Math.sign(r.speed * Math.sin(r.heading * Math.PI / 180)) === sign,
      'the lateral component must follow the stick side, not be clamped to the normal');
  }
});

test('#767 admission, speed, vertical, chain and action timing are unchanged', async () => {
  const api = await production();
  const cfg = api.profile.movement;
  const along = launch(api, onWall(api, 0));
  const off = launch(api, onWall(api, 40));
  // Admission is untouched: only the heading may differ between cone positions.
  assert.equal(along.consumed, off.consumed, 'both cone positions must still be admitted');
  assert.ok(along.speed > 0 && off.speed > 0, 'the roll must still launch');
  assert.ok(Math.abs(along.speed - off.speed) < 1e-9, 'heading must not change the launch speed');
  assert.equal(off.vertical, cfg.roll.jumpVelocity,
    'the vertical component must be unchanged');
  assert.ok(Math.abs(along.vertical - off.vertical) < 1e-12, 'vertical must not depend on heading');
  assert.equal(off.chain, along.chain, 'the chain increment must not depend on heading');
  assert.equal(off.roll.time, cfg.roll.duration,
    'the action window must still start at the same duration');
  assert.equal(off.roll.armorTime, along.roll.armorTime, 'armour timing must be unchanged');
  assert.equal(off.climbing, false, 'the wall must still be released');
  assert.equal(off.grounded, false, 'the actor must still leave the ground');

  // Admission is still the same dot product against the wall normal: a stick facing
  // into the wall, and one too shallow to clear the threshold, must both be refused.
  const inward = onWall(api, 0); inward.intent.move.set(0, 0, -1);
  assert.equal(launch(api, inward).consumed, false, 'a stick into the wall must not wall-roll');
  const shallow = onWall(api, 0); shallow.intent.move.set(0.99, 0, 0.14);
  assert.ok(shallow.intent.move.x * shallow.wallN.x + shallow.intent.move.z * shallow.wallN.z
    < cfg.wallRollMinimumInput, 'the negative control must actually be outside the cone');
  assert.equal(launch(api, shallow).consumed, false, 'a stick outside the cone must not wall-roll');
});

test('#767 the own-ink roll path and a non-jump wall frame are unaffected', async () => {
  const api = await production();
  // A submerged own-ink roll never had the normal applied and must stay identical.
  const own = onWall(api, 40);
  own.climbing = false; own.submerged = true; own.vel.set(0, 0, -6);
  const r = launch(api, own);
  assert.ok(Math.abs(r.heading - 180) < 1e-6, `own-ink roll heading changed: ${r.heading}`);
  // Holding the wall without pressing jump must not launch at all.
  const idle = onWall(api, 40);
  const held = launch(api, idle, false);
  assert.equal(held.consumed, false, 'no jump must mean no roll');
  assert.equal(held.speed, 0, 'the actor must not have moved');
});

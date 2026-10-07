import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILT = process.env.INKWAVE_SUPERJUMP_SITE;
const SRC = BUILT ? path.resolve(BUILT) : path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const FPS = 60;

// Same source composition and installer as build-inkwave. With
// INKWAVE_SUPERJUMP_SITE this executes emitted/minified files. No GPU claim.
async function boot() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (!BUILT && file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (!BUILT && file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const source = BUILT ? raw : adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './src/world/level.js';
  `, { context, identifier: path.join(SRC, 'superjump-startup-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(BUILT ? SRC : ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100], grate: false }], half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new api.Projectiles(G.scene);
  function make({ pos = [0, 0, 0], team = 0, remote = false } = {}) {
    const a = new api.Actor({ team, name: 'super jump startup regression', weapon: 'shooter', isLocal: false, CharacterClass: api.Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.remote = remote; a.invuln = 0; return a;
  }
  const tick = (a, count = 1, dt = STEP) => { for (let i = 0; i < count; i++) { G.time += dt; a.update(dt); } };
  const close = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, profile, make, tick, close };
}

const composeActor = () => adaptSource('src/game/actor.js', fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/actor.js'), 'utf8'));

// Frames from confirmation until the jump leaves the charge phase.
const launchFrames = (a, f, cap = 6000, dt = STEP) => {
  let n = 0;
  while (a.superJumpState?.phase === 'charge' && n < cap) { f.tick(a, 1, dt); n++; }
  return n;
};

test('#708 pinned profile keeps the S3 initial-form term separate from the 80F charge wait and 138F flight', async t => {
  const f = await boot(); t.after(f.close);
  assert.equal(f.profile.superJump.chargeTime * FPS, 80, 'native charge wait stays pinned at 80F');
  assert.equal(f.profile.superJump.flightTime * FPS, 138, 'native flight stays pinned at 138F');
  assert.equal(f.profile.superJump.startupSwimF, 1, 'swim-form initial term is 1F');
  assert.equal(f.profile.superJump.startupHumanoidF, 22, 'humanoid-form initial term is 22F');
  assert.equal(f.profile.superJump.startupHumanoidF - f.profile.superJump.startupSwimF, 21, 'the S3 humanoid penalty is 21F');
  // The term must be added in front of the charge wait, never folded into it.
  const composed = composeActor();
  assert.ok(composed.includes('this.s3.jumpChargeTime + superJumpStartupTime(this)'),
    'the launch gate adds the startup term to the charge wait instead of replacing it');
  assert.ok(composed.includes('startForm: this.form,'), 'the admission form is captured on the jump state');
  assert.ok(!/jumpChargeTime\s*=\s*[^;\n]*startup/.test(composed), 'jumpChargeTime is never reassigned with the startup term');
  f.close();
});

test('#708 0 AP humanoid and swim starts launch 21F apart', async t => {
  const f = await boot(); t.after(f.close);
  const launch = form => { const a = f.make(); a.form = form; assert.equal(a.superJump(new f.THREE.Vector3(30, 0, 0)), true); return launchFrames(a, f); };
  const swim = launch('squid'), kid = launch('kid');
  assert.equal(swim, 1 + 80, 'swim start launches after the 1F term plus the 80F charge wait');
  assert.equal(kid, 22 + 80, 'humanoid start launches after the 22F term plus the 80F charge wait');
  assert.equal(kid - swim, 21, 'the form-dependent difference is exactly the S3 21F');
});

test('#708 0 AP totals are 219F from swim form and 240F from humanoid form', async t => {
  const f = await boot(); t.after(f.close);
  const total = form => {
    const a = f.make(); a.form = form; a.superJump(new f.THREE.Vector3(30, 0, 0));
    let n = 0;
    while (a.superJumpState && n < 900) { f.tick(a); n++; }
    assert.equal(a.superJumpState, null, `the ${form} jump actually landed`);
    return n;
  };
  assert.equal(total('squid'), 1 + 80 + 138, 'swim-form 0 AP total is 219F');
  assert.equal(total('kid'), 22 + 80 + 138, 'humanoid-form 0 AP total is 240F');
});

test('#708 the added humanoid startup frames stay vulnerable and flight authority still begins at launch', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make(), enemy = f.make({ team: 1 });
  a.form = 'kid'; a.superJump(new f.THREE.Vector3(30, 0, 0));
  assert.equal(a.superJumpState.startForm, 'kid', 'the captured admission form is the pre-jump form');
  // Every added frame is pre-charge, so weapons must still land on it. The
  // per-frame hit is small on purpose: the point is admission, not lethality.
  for (let frame = 1; frame <= 21; frame++) {
    f.G.projectiles.applyHit(enemy, a, 2, 'shooter');
    assert.equal(a.hp, 100 - 2 * frame, `the humanoid startup frame ${frame} is still vulnerable`);
    f.tick(a);
    assert.equal(a.superJumpState.phase, 'charge', `still charging at startup frame ${frame}`);
  }
  const charged = a.hp;
  let guard = 0;
  while (a.superJumpState?.phase === 'charge' && guard++ < 400) f.tick(a);
  assert.equal(a.superJumpState.phase, 'flight', 'the humanoid jump launches at the charge boundary');
  const flightHp = a.hp;assert.ok(flightHp >= charged,'existing health recovery may run during preparation');
  f.G.projectiles.applyHit(enemy, a, 2, 'shooter');
  assert.equal(a.hp, flightHp, 'flight-only authority is unchanged by the startup term');
});

test('#708 Quick Super Jump still scales charge and flight, and never the initial-form term', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make();
  const zero = { charge: a.s3.jumpChargeTime, flight: a.s3.jumpFlightTime, swim: a.s3.jumpStartupSwimF, kid: a.s3.jumpStartupHumanoidF };
  assert.equal(zero.swim, 1); assert.equal(zero.kid, 22);
  // equip() reads a.s3.loadout only for non-local Actors, so pin that first.
  // ABILITIES is keyed by the ASCII ability id, not its Japanese display name.
  a.isLocal = false;
  a.s3.loadout = [0, 1, 2].map(() => ({ main: 'quickSuperJump', subs: ['none', 'none', 'none'] }));
  a.reset();
  assert.ok(a.s3.jumpChargeTime < zero.charge, 'Quick Super Jump still shortens the charge wait');
  assert.ok(a.s3.jumpFlightTime < zero.flight, 'Quick Super Jump still shortens the flight');
  assert.equal(a.s3.jumpStartupSwimF, zero.swim, 'the swim-form initial term is not QSJ-scaled');
  assert.equal(a.s3.jumpStartupHumanoidF, zero.kid, 'the humanoid initial term is not QSJ-scaled');
});

test('#708 ally, spawn-return and remote jumps keep one form-dependent startup, never a duplicated one', async t => {
  const f = await boot(); t.after(f.close);
  const ally = f.make({ pos: [10, 0, 0] });
  const measure = (form, aim, remote = false) => {
    const a = f.make({ remote }); a.form = form; assert.equal(a.superJump(aim), true); return launchFrames(a, f);
  };
  assert.equal(measure('squid', ally), 81, 'ally shortcut from swim form launches at 81F');
  assert.equal(measure('kid', ally), 102, 'ally shortcut from humanoid form launches at 102F');
  assert.equal(measure('kid', new f.THREE.Vector3(25, 0, 8)), 102, 'spawn-return from humanoid form launches at 102F');
  assert.equal(measure('kid', new f.THREE.Vector3(25, 0, 8), true), 102, 'a remote peer does not add a second startup delay');
});

test('#708 30/60/120Hz preserve the same wall-clock launch time and phase boundary', async t => {
  const f = await boot(); t.after(f.close);
  for (const form of ['squid', 'kid']) {
    const seconds = [];
    for (const hz of [30, 60, 120]) {
      const a = f.make(); a.form = form; a.superJump(new f.THREE.Vector3(30, 0, 0));
      const n = launchFrames(a, f, 4000, 1 / hz);
      const elapsed = n / hz;
      assert.equal(a.superJumpState.phase, 'flight', `${hz}Hz ${form} jump reached flight`);
      assert.ok(Math.abs(elapsed - (a.s3.jumpChargeTime + (form === 'kid' ? 22 : 1) / FPS)) <= 1 / hz,
        `${hz}Hz ${form} launch is within one step of the fixed 60Hz target (${elapsed}s)`);
      seconds.push(elapsed);
    }
    assert.ok(Math.abs(seconds[0] - seconds[2]) < 1 / 30, '30Hz and 120Hz launch within a 30Hz step of each other');
  }
});
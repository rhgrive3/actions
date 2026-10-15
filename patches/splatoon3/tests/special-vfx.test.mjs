import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { SPECIAL_VFX_CALIBRATION, observeSpecialReplay, specialVfxDirector } from '../runtime/special-vfx.mjs';
import { vfxRandom } from '../runtime/special-vfx-kit.mjs';
import { SPECIAL_DEVICE_MOTION } from '../runtime/special-presentation.mjs';

// Presentation-only checks for the special effects layer (special-vfx.mjs): it
// attaches to the game's FX, draws every special without authoring gameplay,
// paint, randomness or network rows, and keeps bounded GPU pools. Visual parity
// with Splatoon 3 is a footage comparison (reference/special-vfx.md), not a test claim.

const IDS = ['tentaMissiles', 'inkjet', 'booyahBomb', 'ultraStamp', 'zipcaster', 'killerWail', 'crabTank', 'reefslider',
  'tripleInkstrike', 'superChump', 'krakenRoyale', 'splattercolorScreen', 'waveBreaker'];

async function boot() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const { G, THREE } = f, api = f.installedRuntime;
  G.scene = new THREE.Scene();
  G.projectiles = new api.Projectiles(G.scene);
  const fx = new api.FX(G.scene, { quality: 'high' });
  fx.setCollider(() => null);
  G.fx = fx;
  G.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300); G.camera.position.set(0, 4, -8); G.camera.lookAt(0, 1, 6);
  G.camera.updateMatrixWorld(true);
  const ground = { hit: false };
  G.physics = { los: () => true,
    raycast: (a, d, max, h) => { h.hit = false; if (d.y < -1e-6 && a.y >= 0) { const t = a.y / -d.y; if (t <= max) { h.hit = true; h.point.copy(a).addScaledVector(d, t); h.point.y = 0; h.normal.set(0, 1, 0); h.dist = t; } } return h; },
    segment: (a, b, h) => { h.hit = false; return h; } };
  void ground;
  return { f, G, THREE, api, fx };
}
function caster(f, G, id) {
  const a = f.make('shooter');
  a.isLocal = true; a._resolve = () => { if (a.pos.y < 0) { a.pos.y = 0; a.vel.y = Math.max(0, a.vel.y); a.grounded = true; } };
  a.aimDir.set(0, 0, 1); a.aimYaw = 0; a.aimPoint = a.pos.clone().add(new f.THREE.Vector3(0, 0, 12));
  a.weapon = { ...a.weapon, special: id, specialCost: 200 }; a.special = 200;
  return a;
}
const SCRIPT = {
  tentaMissiles: (k, a) => { a.intent.fire = k === 5; },
  inkjet: (k, a) => { a.intent.fire = k === 70; },
  booyahBomb: (k, a) => { a.intent.booyah = k % 12 < 2; },
  ultraStamp: (k, a) => { a.intent.fire = k < 100; },
  zipcaster: (k, a) => { a.intent.sub = k === 10; },
  crabTank: (k, a) => { a.intent.fire = k > 20 && k < 90; a.intent.sub = k === 95; },
  tripleInkstrike: (k, a) => { a.intent.sub = k > 22 && k < 28; },
  superChump: (k, a) => { a.intent.fire = k === 20; },
  krakenRoyale: (k, a) => { a.intent.fire = k > 70 && k < 110; },
  splattercolorScreen: (k, a) => { a.intent.sub = k > 5 && k < 10; },
  waveBreaker: (k, a) => { a.intent.sub = k > 5 && k < 10; },
};
function run(env, id, frames, dt, vfx) {
  const { f, G, fx } = env;
  const a = caster(f, G, id), enemy = f.make('shooter');
  enemy.team = 1; enemy.pos.set(0, 0, 9); enemy.hp = 1e6;
  fx.s3SpecialVfxEnabled = vfx;
  const paint = [], events = [];
  G.paint = { sample: () => 1, splat: (p, r, team) => { paint.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), +r.toFixed(3), team]); return 0; } };
  const off = f.on('all:special', e => events.push([e.id, e.action, e.activation, e.seed, ...(e.pos || [])].join(':')));
  a._startSpecial();
  const steps = Math.round(frames / (dt * 60));
  for (let k = 0; k < steps; k++) {
    for (const key of ['fire', 'sub', 'jump', 'squid', 'booyah']) a.intent[key] = false;
    SCRIPT[id]?.(Math.round(k * dt * 60), a);
    if (a.specialActive) a._updateSpecial(dt); else a._finishFrame?.(dt);
    G.projectiles.update(dt); G.time += dt;
    fx.update(dt, G.camera);
  }
  off?.();
  const state = { pos: a.pos.toArray().map(n => +n.toFixed(4)), hp: enemy.hp, special: a.specialActive?.id || null, paint: paint.length, paintHash: JSON.stringify(paint).length,
    objects: (G.projectiles._s3AllSpecialObjects || []).map(o => o.kind + ':' + o.serial).join(','), events };
  G.projectiles.clear(); fx.clear(); G.actors.length = 0;
  return state;
}

test('the effect pools attach to the game FX root once, one draw per pool, with a degenerate warm instance', async () => {
  const { fx, G } = await boot();
  const d = specialVfxDirector(fx);
  assert.ok(d, 'director built when the game wires its FX collider (before the boot shader warm-up)');
  const root = fx.root.getObjectByName('special-vfx');
  assert.ok(root, 'kit under fx.root (scene lifetime follows the FX instance)');
  const meshes = root.children.filter(m => m.isMesh);
  assert.equal(meshes.length, 12, 'twelve pooled draws');
  for (const m of meshes) {
    const g = m.geometry;
    const drawn = g.isInstancedBufferGeometry ? g.instanceCount : g.drawRange.count;
    assert.ok(drawn >= 1, `${m.name}: always draws one degenerate primitive so its program is compiled at boot`);
    assert.equal(m.frustumCulled, false, `${m.name}: never culled (instances span the stage)`);
  }
  fx.update(1 / 60, G.camera);
  assert.equal(specialVfxDirector(fx), d, 'one director per FX instance');
});

test('presentation never changes gameplay: identical state, paint, events and randomness with effects on or off', async () => {
  const env = await boot();
  const { f } = env;
  for (const id of IDS) {
    let seed = 7; const prng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    f.setRandom(prng); const off = run(env, id, 150, 1 / 60, false);
    seed = 7; f.setRandom(prng); const on = run(env, id, 150, 1 / 60, true);
    f.restoreRandom();
    assert.deepEqual(on, off, `${id}: effects are observers only`);
  }
});

test('every special drives effects at 30/60/120 Hz and the pools stay bounded', async () => {
  const env = await boot();
  const { fx } = env;
  const d = specialVfxDirector(fx);
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const id of IDS) {
    let peak = 0;
    const kit = d.kit, orig = kit.update.bind(kit);
    kit.update = (step, cam) => { orig(step, cam); const s = kit.stats(); peak = Math.max(peak, s.sparks + s.puffs + s.shapes + s.ribbons); };
    run(env, id, 150, dt, true);
    kit.update = orig;
    assert.ok(peak > 0, `${id} @${Math.round(1 / dt)}Hz: drew effects`);
    assert.ok(kit.sparks.n <= kit.sparks.cap && kit.puffs.n <= kit.puffs.cap, `${id}: sprite pools capped`);
    for (const p of [kit.beams, kit.inkBeams, kit.shells, kit.inkShells, kit.bands, kit.inkBands, kit.discs, kit.inkDiscs])
      assert.ok(p.recs.length < p.cap, `${id}: ${p.mesh.name} within its capacity`);
    assert.equal(kit.stats().sparks + kit.stats().puffs + kit.stats().shapes, 0, `${id}: clear() empties every pool`);
  }
});

test('impact effects reuse the game blast without its droplet paint, and never call Math.random', async () => {
  const { f, fx, THREE, G } = await boot();
  const d = specialVfxDirector(fx);
  let landed = 0;
  fx.onDropletLand = () => { landed++; };
  fx.setCollider((from, to) => (to.y <= 0 ? { point: new THREE.Vector3(to.x, 0, to.z), normal: new THREE.Vector3(0, 1, 0) } : null));
  fx.paintEffects = true;
  let calls = 0;
  f.setRandom(() => { calls++; return 0.5; });          // the game realm's Math.random
  try {
    for (let i = 0; i < 6; i++) d.inkBlast(new THREE.Vector3(i * 4, 0.5, 6), [0.9, 0.7, 0.05], 6, { native: false });
    d.activation({ pos: new THREE.Vector3(), team: 0 }, [0.9, 0.7, 0.05], 1.2);
    for (let k = 0; k < 120; k++) d.kit.update(1 / 60, { position: new THREE.Vector3(0, 5, -5) });
  } finally { f.restoreRandom(); }
  assert.equal(calls, 0, 'presentation has its own generator');
  const a = vfxRandom(), b = vfxRandom();
  assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1 && a !== b);
  d.nativeBlast(new THREE.Vector3(0, 0.5, 6), new THREE.Color(1, 0.8, 0), 4);
  assert.equal(fx.paintEffects, true, 'the game setting is restored');
  for (let k = 0; k < 180; k++) fx.update(1 / 60, G.camera);
  assert.equal(landed, 0, 'no presentation droplet may land as paint (offline turf)');
});

test('remote replay rows reach the effects only when accepted, and only for remote actors', async () => {
  const { fx, THREE } = await boot();
  const d = specialVfxDirector(fx), seen = [];
  const orig = d.event.bind(d); d.event = e => { seen.push(e.action); return orig(e); };
  const api = { specialVfxReplay: e => d.event(e) };
  const remote = { remote: true, pos: new THREE.Vector3(), team: 1 }, local = { remote: false, pos: new THREE.Vector3(), team: 0 };
  let accept = true;
  const wrapped = observeSpecialReplay(api, () => accept);
  wrapped(api, { actor: remote, id: 'killerWail', action: 'laser', pos: [0, 1, 0], target: [0, 1, 20] });
  accept = false; wrapped(api, { actor: remote, id: 'killerWail', action: 'laser', pos: [0, 1, 0], target: [0, 1, 20] });
  accept = true; wrapped(api, { actor: local, id: 'killerWail', action: 'laser', pos: [0, 1, 0], target: [0, 1, 20] });
  assert.deepEqual(seen, ['laser'], 'one accepted remote presentation row');
  assert.ok(remote._s3SpecialMarks.laser !== undefined, 'remote device motion receives the mark');
});

test('the effect kit retires its GPU resources with the FX instance', async () => {
  const { fx } = await boot();
  const d = specialVfxDirector(fx);
  let disposed = 0;
  for (const m of d.kit.root.children) { const g = m.geometry, mat = m.material; const dg = g.dispose.bind(g), dm = mat.dispose.bind(mat);
    g.dispose = () => { disposed++; dg(); }; mat.dispose = () => { disposed++; dm(); }; }
  fx.dispose();
  assert.equal(disposed >= 24, true, 'every pool geometry and material');
  assert.equal(specialVfxDirector(fx), null);
  assert.equal(SPECIAL_VFX_CALIBRATION.status.includes('not Nintendo'), true);
});

test('Ultra Stamp is raised while held, anticipates the authoritative swing and lands on it', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true });
  const actor = new f.Actor({ team: 0, name: 'stamp', weapon: 'shooter', CharacterClass: f.Character });
  actor.character.actor = actor; f.G.actors.push(actor);
  const ch = actor.character, view = { form: 'kid', hp: 100, grounded: true }, M = SPECIAL_DEVICE_MOTION.stamp;
  actor.specialActive = { id: 'ultraStamp', phase: 'active' };
  const state = { id: 'ultraStamp', phase: 'active', stampHolding: true, t: 0, nextSwing: 1 };
  actor._s3AllSpecialState = state;
  f.G.time = 10; ch.update(1 / 60, view);
  const holder = ch.s3SpecialDevices()[0].holder, rot0 = ch.s3SpecialDevices()[0].spec.rot[0];
  assert.ok(Math.abs(holder.rotation.x - (rot0 + M.raised)) < 1e-6, 'held overhead before the first swing');
  state.t = 1 - M.windup / 2; f.G.time += 0.5; ch.update(1 / 60, view);
  const mid = holder.rotation.x - rot0;
  assert.ok(mid > M.raised && mid < M.strike, 'mid downswing just before the swing frame');
  actor._s3SpecialMarks = { swing: f.G.time }; state.t = 1; state.nextSwing = 1 + 13 / 60; ch.update(1 / 60, view);
  assert.ok(Math.abs(holder.rotation.x - (rot0 + M.strike)) < 1e-6, 'on the ground at the swing event');
  f.G.time += M.hold + M.recover + 0.01; state.t = 1.1; ch.update(1 / 60, view);
  assert.ok(holder.rotation.x - rot0 < M.strike, 'recovering for the next swing');
  actor.specialActive = null; actor._s3AllSpecialState = null; ch.update(1 / 60, view);
});

test('effect meshes stay out of override passes (GTAO normal/depth) and draw normally otherwise', async () => {
  const { fx, THREE } = await boot();
  const d = specialVfxDirector(fx);
  const meshes = fx.root.children.flatMap(m => (m.name === 'special-vfx' ? m.children : [m])).filter(m => m.isMesh);
  assert.ok(meshes.length > 12, 'kit pools and the game FX pools are guarded');
  const scene = new THREE.Scene(), override = new THREE.MeshNormalMaterial();
  for (const m of meshes) {
    assert.equal(m.userData.s3NoOverridePass, true, `${m.name || 'fx pool'} guarded`);
    const g = m.geometry, count = g.drawRange.count;
    scene.overrideMaterial = override;
    m.onBeforeRender(null, scene, null, g, override, null);
    assert.equal(g.drawRange.count, 0, 'no primitives into the override pass');
    m.onAfterRender(null, scene, null, g, override, null);
    assert.equal(g.drawRange.count, count, 'range restored after the pass');
    scene.overrideMaterial = null;
    m.onBeforeRender(null, scene, null, g, m.material, null);
    assert.equal(g.drawRange.count, count, 'the colour pass draws as usual');
    m.onAfterRender(null, scene, null, g, m.material, null);
  }
  void d;
});

test('Super Chump aim preview shows exactly the twelve landing points the throw uses', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.projectiles = new f.installedRuntime.Projectiles(G.scene);
  G.physics = { los: () => true, segment: (a, b, h) => { h.hit = false; return h; },
    raycast: (a, d, max, h) => { h.hit = false; if (d.y < -1e-6 && a.y >= 0) { const t = a.y / -d.y; if (t <= max) { h.hit = true; h.point.copy(a).addScaledVector(d, t); h.point.y = 0; h.normal.set(0, 1, 0); h.dist = t; } } return h; } };
  const a = f.make('shooter'); a.isLocal = true;
  a.aimDir.set(0.3, -0.05, 1).normalize(); a.aimYaw = Math.atan2(0.3, 1); a.aimPoint = new THREE.Vector3(6, 0, 20);
  a.weapon = { ...a.weapon, special: 'superChump', specialCost: 200 }; a.special = 200;
  a._startSpecial();
  for (let k = 0; k < 5; k++) { a._updateSpecial(1 / 60); G.projectiles.update(1 / 60); G.time += 1 / 60; }
  // the module instance inside the fixture realm owns the live state
  const preview = f.installedRuntime.superChumpLandingPreview?.(f.installedRuntime, a);
  assert.ok(preview, 'preview available while aiming');
  assert.equal(preview.positions.length, 12);
  a.intent.fire = true; a._updateSpecial(1 / 60);
  const decoys = (G.projectiles._s3AllSpecialObjects || []).filter(o => o.kind === 'decoy');
  assert.equal(decoys.length, 12, 'the throw deployed twelve decoys');
  for (let i = 0; i < 12; i++) assert.ok(decoys[i].target.distanceTo(preview.positions[i]) < 1e-9, `decoy ${i} lands where the preview showed`);
  assert.equal(f.installedRuntime.superChumpLandingPreview(f.installedRuntime, a), null, 'no preview after the throw');
});

test('Tenta Missiles lock HUD brackets exactly the opponents the salvo locks', async () => {
  const env = await boot(), { f, G, fx } = env;
  const a = caster(f, G, 'tentaMissiles');
  const near = f.make('shooter'), wide = f.make('shooter');
  near.team = wide.team = 1; near.hp = wide.hp = 1e6;
  near.pos.set(0.5, 0, 14); wide.pos.set(16, 0, 14);
  a._startSpecial();
  const step = () => { for (const key of ['fire', 'sub', 'jump', 'squid', 'booyah']) a.intent[key] = false; a._updateSpecial(1 / 60); G.projectiles.update(1 / 60); G.time += 1 / 60; fx.update(1 / 60, G.camera); };
  for (let k = 0; k < 4; k++) step();
  const preview = f.installedRuntime.tentaMissilesLockPreview?.(f.installedRuntime, a);
  assert.ok(preview, 'lock read-out available while aiming');
  assert.ok(Math.abs(preview.limit - 140 / 360) < 1e-12, 'circle radius is TargetInCircleRadius 140 over 360 without Special Power Up');
  // the read-out comes from the fixture realm, so compare members rather than array prototypes
  assert.deepEqual([...preview.targets], [near], 'only the opponent inside the circle is locked');
  const t = specialVfxDirector(fx).tracks.get(a);
  assert.deepEqual([...(t?.d.locks?.keys() || [])], [near], 'the HUD fallback brackets the same opponent');
  const targets = [];
  const off = f.on('all:special', e => { if (e.id === 'tentaMissiles' && e.action === 'target') targets.push(e); });
  a.intent.fire = true; a._updateSpecial(1 / 60);
  off?.();
  assert.equal(targets.length, 1, 'the salvo locks one target');
  G.projectiles.clear(); fx.clear(); G.actors.length = 0;
});

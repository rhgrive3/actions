import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { kitBombExplosionPaint, resolveSubAtCharge, SUCTION } from '../runtime/kit-subs.mjs';
import { fixture } from './source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function makePaintWorld(f, { cell = 0.25 } = {}) {
  const { G, THREE, PaintSystem } = f;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
  const face = { origin: V(-40, 0, -5), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 1, 0),
    su: 80, sv: 105, wall: false, turf: true, paintable: true };
  const block = { id: 0, solid: true, grate: false, center: V(0, -1, 47.5), half: V(40, 1, 52.5), axes,
    faces: [0, -1, -1, -1, -1, -1], aabbMin: V(-40, -2, -5), aabbMax: V(40, 0, 100) };
  const level = { faces: [face], blocks: [block], pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; out.push(0); return out; } };
  G.level = level;
  G.physics = new f.Physics(level);
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0, 3, -4);
  G.teamColors = [new THREE.Color(0xff8a14), new THREE.Color(0x2f5bff)];
  G.actors = []; G.time = 0; G.mode = 'match';

  class CpuPaint extends PaintSystem {
    _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; this.submitted = []; this.drawCalls = 0; }
    _pushQuad(...args) { this.submitted.push({ team: args[9], tn: args[15], dT: args[16], mode: args[17] }); }
    _drawQuads() { this.drawCalls++; this.quads = 0; this.dryMesh.visible = false; }
  }
  const paint = new CpuPaint(null, level, { atlasSize: 4096, maxDensity: 30, cell });
  G.paint = paint;
  G.projectiles = new f.Projectiles(G.scene);
  return { paint, level, face, V };
}

test('production-composed paint keeps the landing body immediate and advances ownership with the 60 Hz paint clock', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, V } = makePaintWorld(f);
  const owner = f.make('shooter');
  const initial = paint.splat(V(0, 0, 5), 2.7, owner.team, { seed: 0.37, claimOwner: owner });
  const bodyCells = paint.counts[0];
  assert.ok(initial > 0);
  assert.equal(owner.stats.turf, 0, 'splat returns its immediate CPU body; the later mask has not been credited yet');
  assert.ok(paint.submitted.some(q => q.mode === 2), 'the native first draw remains body-only');
  assert.equal(paint.growing.length, 1);

  paint.useFixedPaintClock();
  const age = paint.growing[0].age;
  paint.flush(1 / 30);
  assert.equal(paint.growing[0].age, age, 'render flush does not advance fixed-clock paint');
  for (let i = 0; i < 32; i++) paint.advanceSimulation(1 / 60); // no render flushes: the simulation still submits growth

  assert.equal(paint.growing.length, 0);
  assert.ok(paint.submitted.some(q => q.mode === 0), 'later shader growth uses the native ancillary mode');
  assert.ok(paint.counts[0] > bodyCells, 'late visible cells enter the authoritative turf grid');
  assert.ok(owner.stats.turf > 0, 'late cells are credited through the real local Actor.addTurf callback');
  assert.equal(owner.special, owner.stats.turf, 'late ordinary paint keeps native special bookkeeping');
  assert.ok(paint.drawCalls >= 30, 'fixed simulation reaches the paint draw hook while render is idle');
});

test('composed weapon and kit paint paths attach their actual local owner to PaintSystem emissions', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G, THREE, Projectiles, WEAPONS } = f, { paint, V } = makePaintWorld(f);
  G.projectiles = new Projectiles(G.scene);
  const emissions = [], nativeSplat = paint.splat;
  paint.splat = function (center, radius, team, opts = {}) {
    emissions.push({ owner: opts.claimOwner ?? null, kind: opts.kind ?? null });
    return nativeSplat.call(this, center, radius, team, opts);
  };

  const roller = f.make('roller');
  roller.weaponRunner.rolling = true; roller.weaponRunner.rollT = 0.5;
  roller.intent = { ...(roller.intent || {}), move: V(0, 0, 1) };
  roller.weaponRunner.lastRollPos = roller.pos.clone().add(V(-1, 0, 0)); roller.pos.set(1, 0, 1); roller.vel.set(0, 0, 2);
  roller.weaponRunner.update(1 / 60, { fire: true });
  assert.ok(emissions.some(e => e.owner === roller), 'roller roll');

  const dualies = f.make('dualies');
  dualies.weaponRunner.firingT = 0.35;
  dualies.intent = { ...(dualies.intent || {}), fire: true, move: V(0, 0, 1) };
  assert.equal(dualies.weaponRunner.tryDodge(V(0, 0, 1)), true, 'enter the dodge through its native admission');
  dualies.weaponRunner.rollPaint = 0;
  dualies.weaponRunner.update(1 / 60, { fire: true });
  for (let i = 0; i < 3; i++) dualies.weaponRunner.update(1 / 60, { fire: true }); // pass the native dodge startup window
  dualies.weaponRunner._dualies(1 / 60, { fire: false }, dualies.weapon);
  assert.ok(emissions.some(e => e.owner === dualies), 'dualies trail');

  const charger = f.make('charger');
  G.projectiles.fireCharger(charger, WEAPONS.charger, 0.5);
  assert.ok(emissions.some(e => e.owner === charger), 'composed charger-flight feet / trail paint');

  const bomber = f.make('shooter');
  G.projectiles._explodeBomb({ pos: V(0, 0.2, 5), team: bomber.team, owner: bomber });
  assert.ok(emissions.some(e => e.owner === bomber), 'sub-special fidelity replacement splats');

  const kitOwner = f.make('shooter'), kitOptions = [];
  const kitBomb = { ghost: false, s3Resolved: resolveSubAtCharge(SUCTION, 0),
    pos: V(0, 0.2, 5), team: kitOwner.team, owner: kitOwner };
  const kitArea = kitBombExplosionPaint(SUCTION, kitBomb, { splat(_center, _radius, _team, opts) {
    kitOptions.push(opts); return 1;
  } });
  assert.equal(kitArea, 16, 'the #1123 core and 15 satellites emit through the paint owner');
  assert.ok(kitOptions.every(opts => opts.claimOwner === kitOwner), 'each kit explosion splat retains its local owner');
  const beforeGhost = kitOptions.length;
  assert.equal(kitBombExplosionPaint(SUCTION, { ...kitBomb, ghost: true }, { splat(...args) {
    kitOptions.push(args[3]); return 1;
  } }), null, 'ghost kit effects never enter authoritative paint');
  assert.equal(kitOptions.length, beforeGhost);

  const impactOwner = f.make('shooter');
  G.projectiles._impact({ owner: impactOwner, team: impactOwner.team, type: 'slosh', radius: 0.7,
    vel: V(0, -1, 2), seed: 0.22, head: false }, { point: V(1, 0, 6), normal: V(0, 1, 0) });
  assert.ok(emissions.some(e => e.owner === impactOwner), 'projectile impact');

  const rainOwner = f.make('shooter'), group = new THREE.Group();
  group.position.set(0, 5, 6);
  G.projectiles.clouds.push({ t: 0, dur: 5, group, dir: V(1, 0, 0), loop: null, rainT: 0,
    owner: rainOwner, team: rainOwner.team, ghost: false });
  G.projectiles._updateClouds(0.05);
  assert.ok(emissions.some(e => e.owner === rainOwner), 'special rain');
});

test('composed Super Jump emits no landing paint and Agent 3 wall drops retain their owner', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  assert.equal(typeof f.Actor.prototype._updateSuperJump, 'function', 'the installed production Actor keeps its native Super Jump update');
  const rawActor = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/actor.js'), 'utf8');
  const rel = 'src/game/actor.js';
  const composedActor = adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel,
    adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, rawActor))))));
  assert.match(composedActor, /Ordinary Super Jump does not leave ink/);
  assert.doesNotMatch(composedActor, /G\.paint\.splat\(_v\.copy\(this\.pos\)\.setY\(this\.pos\.y \+ 0\.3\), 1\.4/,
    'the production composition suppresses non-native landing paint');

  const wallDrop = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/agent3-weapon-physics.mjs'), 'utf8');
  assert.match(wallDrop, /kind: 'drop',\s*claimOwner: p\.owner/, 'Agent 3 wall-drop growth carries the projectile owner');
});

test('newer paint order wins, tiny and remote emissions do not receive late credit, and Range paint stays unowned', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, { paint, V } = makePaintWorld(f);
  const oldOwner = f.make('shooter'), newOwner = f.make('shooter'); newOwner.team = 1;
  paint.splat(V(0, 0, 5), 2.7, 0, { seed: 0.22, claimOwner: oldOwner });
  const oldOrder = paint.growing[0].paintOrder;
  paint.splat(V(0, 0, 5), 2.7, 1, { seed: 0.72, claimOwner: newOwner });
  assert.equal(paint.growing.length, 1, 'overlapping opposing growth is finished and released before the new body draws');
  const newerCells = paint._paintOwnershipOrder.map((order, i) => order > oldOrder && paint.grid[i] === 2);
  assert.ok(newerCells.some(Boolean));
  for (let i = 0; i < 30; i++) paint.advanceSimulation(1 / 60);
  for (let i = 0; i < newerCells.length; i++) if (newerCells[i]) assert.equal(paint.grid[i], 2, 'older ancillary growth cannot reclaim a newer cell');

  const remote = f.make('shooter'); remote.remote = true;
  const beforeRemote = remote.stats.turf;
  paint.splat(V(-8, 0, 5), 2.7, 0, { seed: 0.51, claimOwner: remote });
  const remoteGrowth = paint.growing.at(-1);
  assert.equal(remoteGrowth.paintOwner, null);
  for (let i = 0; i < 30; i++) paint.advanceSimulation(1 / 60);
  assert.equal(remote.stats.turf, beforeRemote);

  const tiny = f.make('shooter');
  assert.equal(paint.splat(V(8, 0, 5), 0.02, 0, { seed: 0.1, claimOwner: tiny }), 0);
  for (let i = 0; i < 30; i++) paint.advanceSimulation(1 / 60);
  assert.equal(tiny.stats.turf, 0, 'the native radius <= 0.02 scoring gate remains closed');

  const slam = f.make('shooter'), normalCalls = [], noSpecialCalls = [];
  const originalNoSpecial = slam.addTurfNoSpecial.bind(slam);
  slam.addTurf = area => normalCalls.push(area);
  slam.addTurfNoSpecial = area => { noSpecialCalls.push(area); originalNoSpecial(area); };
  const specialBefore = slam.special;
  paint.splat(V(16, 0, 5), 2.7, 0, { seed: 0.62, claimOwner: slam, claimMode: 'no-special' });
  for (let i = 0; i < 32; i++) paint.advanceSimulation(1 / 60);
  assert.ok(noSpecialCalls.some(area => area > 0));
  assert.equal(normalCalls.length, 0, 'Splat Slam late credit uses its no-special ledger');
  assert.equal(slam.special, specialBefore);

  G.mode = 'range';
  const rangeOwner = f.make('shooter');
  paint.splat(V(12, 0, 5), 2.7, 0, { seed: 0.4 });
  for (let i = 0; i < 30; i++) paint.advanceSimulation(1 / 60);
  assert.equal(rangeOwner.stats.turf, 0, 'practice-range paint without an owner callback stays unscored');

  const previousNet = G.netm;
  let transmitted;
  G.netm = { mute: 0, applying: false, recSplat(_center, _radius, _team, opts) { transmitted = opts; } };
  paint.splat(V(-16, 0, 5), 0.8, 0, { seed: 0.3, claimOwner: f.make('shooter') });
  assert.ok(transmitted);
  assert.equal('claimOwner' in transmitted, false, 'local ownership metadata never enters the network payload');
  G.netm = previousNet;
});

test('paint ownership and coverage are invariant across 30, 60, and 120 Hz render delivery', async () => {
  async function run(rate) {
    const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
    const { paint, V } = makePaintWorld(f), owner = f.make('shooter');
    paint.splat(V(0, 0, 5), 2.7, 0, { seed: 0.37, claimOwner: owner });
    paint.useFixedPaintClock();
    for (let i = 0; i < rate; i++) paint.advanceSimulation(1 / rate);
    return { grid: [...paint.grid], counts: [...paint.counts], turf: owner.stats.turf,
      special: owner.special, clock: paint.clock, draws: paint.drawCalls };
  }
  const at30 = await run(30), at60 = await run(60), at120 = await run(120);
  assert.deepEqual(at30, at60);
  assert.deepEqual(at60, at120);
});

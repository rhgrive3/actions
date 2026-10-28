import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let loaded;

async function production() {
  if (loaded) return loaded;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file)
      : file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : null;
    const module = new vm.SourceTextModule(rel ? adaptBuildSource(rel, source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './inkwave-public/src/world/level.js';
  `, { context, identifier: path.join(ROOT, 'issue-94-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  loaded = { ...api, Level: entry.namespace.Level, profile, vmContext: context };
  return loaded;
}

async function nearCoverScene() {
  const api = await production();
  const { G, THREE, Physics, Hit, Actor, Character, Projectiles, PlayerController } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  G.level = new api.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],
    spawnBarrier:0,single:[],half:[]});
  G.physics = new Physics(G.level);
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true };
  G.actors = [];
  G.time = 0;
  G.boss = null;

  const camera = new THREE.PerspectiveCamera(65, 1.6, 0.1, 1000);
  camera.position.set(-1.25, 1.3, -4);
  camera.lookAt(0.1, 1.3, 50);
  camera.updateMatrixWorld(true);
  G.camera = camera;
  G.rig = { gameCam: camera };

  const actor = new Actor({ team: 0, name: 'issue 94 cover regression', weapon: 'shooter',
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  actor.character.wAim = 1;
  G.scene.add(actor.character.root);
  actor.character.root.updateMatrixWorld(true);
  G.actors = [actor];
  const controller = new PlayerController(actor, null, null);
  const projectiles = G.projectiles = new Projectiles(G.scene);
  controller.computeAim();

  const muzzle = projectiles._muzzle(actor, new THREE.Vector3());
  const direction = projectiles._aimFrom(actor, muzzle, new THREE.Vector3());
  const nearDistance = Math.min(0.75, muzzle.distanceTo(actor.aimPoint) * 0.25);
  const center = muzzle.clone().addScaledVector(direction, nearDistance);
  G.level._addBlock({kind:'box',min:[center.x-.025,center.y-.12,center.z-.025],
    max:[center.x+.025,center.y+.12,center.z+.025],paint:false});
  G.level._buildHash();
  G.physics = new Physics(G.level);
  controller.computeAim();

  const forward = camera.getWorldDirection(new THREE.Vector3());
  const aimHeight = actor.pos.clone(); aimHeight.y += 1.3;
  const along = Math.max(0, aimHeight.sub(camera.position).dot(forward));
  const cameraStart = camera.position.clone().addScaledVector(forward, along);
  const cameraHit = G.physics.raycast(cameraStart, forward, 70, new Hit(), true);
  const actualMuzzle = projectiles._muzzle(actor, new THREE.Vector3());
  const actualDirection = projectiles._aimFrom(actor, actualMuzzle, new THREE.Vector3());
  const actualDistance = actualMuzzle.distanceTo(actor.aimPoint);
  const muzzleHit = G.physics.raycast(actualMuzzle, actualDirection, actualDistance, new Hit(), true);
  return { api, actor, camera, controller, projectiles, cameraHit, muzzleHit };
}

test('#94 composed main: camera ray is clear while the real shooter muzzle line hits field cover', async () => {
  const { cameraHit, muzzleHit, camera, THREE } = await nearCoverScene();
  assert.equal(cameraHit.hit, false, 'the gameplay camera ray clears the cover edge');
  assert.equal(muzzleHit.hit, true, 'the actual rig muzzle-to-aim line hits the existing solid field');
  const projected = muzzleHit.point.clone().project(camera);
  assert.ok(projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
    'the physical field contact is on screen');
});

test('#94 full composition routes that contact to a separate shooter HUD marker', async () => {
  const { api, actor, projectiles, muzzleHit } = await nearCoverScene();
  assert.equal(typeof projectiles.muzzleBlockFeedback, 'function',
    'the installed production runtime must expose presentation-only muzzle LOS contact');
  const marker = projectiles.muzzleBlockFeedback(actor);
  assert.ok(marker?.hit);
  // The composed cue sweeps the sourced field collision radius, so its contact
  // sits on the same physical cover face as the raw centreline query (solver
  // precision apart) and equals the real shot's impact.
  assert.ok(marker.point.distanceTo(muzzleHit.point) < 0.05, 'marker comes from the same physical field contact');

  const main = adaptBuildSource('src/main.js', fs.readFileSync(path.join(SRC, 'src/main.js'), 'utf8'));
  const hud = adaptBuildSource('src/ui/hud.js', fs.readFileSync(path.join(SRC, 'src/ui/hud.js'), 'utf8'));
  const css = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/ui.css'), 'utf8');
  assert.match(main, /muzzleBlockFeedback/);
  assert.match(main, /muzzleBlock/);
  assert.match(hud, /is-muzzle-blocked/);
  assert.match(css, /\.iw-xh\.is-muzzle-blocked::after/);
});

test('#94 presentation query is read-only and clears when the field line is clear', async () => {
  const { api, actor, projectiles, muzzleHit } = await nearCoverScene();
  assert.equal(typeof projectiles.muzzleBlockFeedback, 'function');
  const vmMath = vm.runInContext('Math', api.vmContext);
  const nativeRandom = vmMath.random;
  let randomCalls = 0;
  vmMath.random = () => { randomCalls++; return 0.5; };
  const before = {
    ink: actor.ink, time: api.G.time, projectiles: projectiles.list.length,
    bombs: projectiles.bombs.length, charge: actor.weaponRunner.charge,
    cooldown: actor.weaponRunner.cooldown, stats: { ...actor.stats },
  };
  try {
    const samples = [];
    for (const count of [30, 60, 120]) {
      for (let i = 0; i < count; i++) samples.push(projectiles.muzzleBlockFeedback(actor).point.clone());
    }
    assert.ok(samples.every(point => point.distanceTo(samples[0]) < 1e-9), 'repeat queries return one contact');
    assert.ok(samples.every(point => point.distanceTo(muzzleHit.point) < 0.05),
      'repeat queries stay on the physical cover contact');
    assert.equal(randomCalls, 0);
  } finally {
    vmMath.random = nativeRandom;
  }
  assert.equal(actor.ink, before.ink);
  assert.equal(api.G.time, before.time);
  assert.equal(projectiles.list.length, before.projectiles);
  assert.equal(projectiles.bombs.length, before.bombs);
  assert.equal(actor.weaponRunner.charge, before.charge);
  assert.equal(actor.weaponRunner.cooldown, before.cooldown);
  assert.deepEqual({ ...actor.stats }, before.stats);

  api.G.level.blocks.length = 0;
  api.G.level._buildHash();
  assert.equal(projectiles.muzzleBlockFeedback(actor), null, 'cleared field removes the marker input');
});


test('#94 stationary Shooter HUD reuses first-hit sweep, invalidating on aim, stage and time', async () => {
  const { api, actor, projectiles } = await nearCoverScene();
  const original = projectiles._nominalInkGuide;
  let solved = 0;
  projectiles._nominalInkGuide = function (...args) { solved++; return original.apply(this, args); };
  try {
    assert.ok(projectiles.muzzleBlockFeedback(actor)?.hit);
    const initial = solved;
    assert.equal(initial, 1);
    for (let frame = 0; frame < 120; frame++) assert.ok(projectiles.muzzleBlockFeedback(actor)?.hit);
    assert.equal(solved, initial, 'same pose and immutable field do not repeat trajectory sweeps each HUD frame');
    actor.aimPoint.x += 0.025;
    projectiles.muzzleBlockFeedback(actor);
    assert.equal(solved, initial + 1, 'changed aim invalidates immediately');
    api.G.level.markCollisionChanged();
    projectiles.muzzleBlockFeedback(actor);
    assert.equal(solved, initial + 2, 'actual collision revision invalidates immediately');
    api.G.time += 0.21;
    projectiles.muzzleBlockFeedback(actor);
    assert.equal(solved, initial + 3, 'existing periodic refresh remains bounded');
    api.G.level.blocks.length = 0;
    api.G.level._buildHash();
    assert.equal(projectiles.muzzleBlockFeedback(actor), null, 'a removed obstacle removes the contact marker');
    assert.equal(solved, initial + 4, 'block collection mutation invalidates immediately');
  } finally { projectiles._nominalInkGuide = original; }
});


test('#94 open-field fixed aim bounds swept broadphase cost at 60 Hz', async () => {
  const { api, actor, projectiles } = await nearCoverScene();
  api.G.level.blocks.length = 0;
  api.G.level._buildHash();
  const level = api.G.level, nativeQuery = level.queryBlocks;
  let broadphaseQueries = 0;
  level.queryBlocks = function (...args) {
    broadphaseQueries++;
    return nativeQuery.apply(this, args);
  };
  try {
    for (let frame = 0; frame < 120; frame++) {
      api.G.time = frame / 60;
      assert.equal(projectiles.muzzleBlockFeedback(actor), null);
    }
    assert.ok(broadphaseQueries < 1600,
      `idle Shooter preview must not run up to 72 field sweeps on every frame: ${broadphaseQueries} queries / 120 frames`);
  } finally {
    level.queryBlocks = nativeQuery;
  }
});

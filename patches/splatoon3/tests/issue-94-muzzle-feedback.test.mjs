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
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
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
  `, { context, identifier: path.join(ROOT, 'issue-94-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  loaded = { ...api, profile, vmContext: context };
  return loaded;
}

async function nearCoverScene() {
  const api = await production();
  const { G, THREE, Physics, Hit, Actor, Character, Projectiles, PlayerController } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  G.level = {
    blocks: [], faces: [], groundHeight: () => 0,
    queryBlocks(_minX, _minZ, _maxX, _maxZ, out) {
      out.length = 0;
      this.blocks.forEach((_block, index) => out.push(index));
      return out;
    },
  };
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
  G.level.blocks.push({
    id: 0, solid: true, grate: false, center,
    half: new THREE.Vector3(0.025, 0.12, 0.025),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  });
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
  assert.ok(marker.point.distanceTo(muzzleHit.point) < 1e-9, 'marker comes from the same physical field contact');

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
    assert.ok(samples.every(point => point.distanceTo(muzzleHit.point) < 1e-9));
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
  assert.deepEqual({
    turf: actor.stats.turf, splats: actor.stats.splats,
    deaths: actor.stats.deaths, specials: actor.stats.specials,
  }, before.stats);

  api.G.level.blocks.length = 0;
  assert.equal(projectiles.muzzleBlockFeedback(actor), null, 'cleared field removes the marker input');
});

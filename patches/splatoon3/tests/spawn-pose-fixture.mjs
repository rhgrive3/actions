import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installHitSpawnMotion as installAgain } from '../runtime/hit-spawn-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installHitSpawnMotion, hitSpawnMotionSnapshot } from './patches/splatoon3/runtime/hit-spawn-motion.mjs';
    export { installFlowMotion, flowMotionSnapshot } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { spawnPoseSnapshot, installSpawnPoseMotion } from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'hit-spawn-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const before = [api.Character.prototype.update, api.Character.prototype._poseSpawn,
    api.Actor.prototype.reset, api.Actor.prototype.spawnAt];
  api.installHitSpawnMotion(api, profile); installAgain(api, profile);
  assert.deepEqual([api.Character.prototype.update, api.Character.prototype._poseSpawn,
    api.Actor.prototype.reset, api.Actor.prototype.spawnAt], before);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.level = { blocks: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 40)], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true,
    groundProbe: (_x, _y, _z, _up, _down, _radius, hit) => { hit.hit = false; return hit; },
    raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, { kind = 'shooter', enabled = true, team = 0 } = {}) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team, name: 'hit spawn production regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.s3SpawnPoseMotionEnabled = process.env.INKWAVE_DISABLE_SPAWN_POSE !== '1'; ch.actor = a; ch.onEvent = null; ch.s3HitSpawnMotionEnabled = enabled;
  G.actors.push(a); G.scene.add(ch.root); a.grounded = a.ground.hit = true;
  // Keep actual Actor/Runner/Character code; collision integration is separate.
  a._integrate = () => {}; a._spawnBarrier = () => {}; a._updateClimb = () => {};
  const visual = (dt = 1 / 60) => {
    a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub; a.intent.squid = a.form === 'squid';
    G.time += dt; a.update(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
  };
  for (let i = 0; i < 90; i++) visual();
  return { a, ch, api, step, visual, snapshot: () => api.hitSpawnMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(x => x !== a); ch.dispose(); } };
}
function grip(r, side = 'R') {
  const w = side === 'L' ? r.ch.weapon.left : r.ch.weapon;
  const h = side === 'L' ? w.def.handL : w.def.handR;
  const b = side === 'L' ? r.ch.bones.handL : r.ch.bones.handR;
  return w.off.localToWorld(h.pos.clone()).distanceTo(b.getWorldPosition(new r.api.THREE.Vector3()));
}
function gameplay(r) {
  const a = r.a, runner = a.weaponRunner;
  return { alive: a.alive, hp: a.hp, ink: a.ink, special: a.special, invuln: a.invuln, spawnArmor: a.s3?.spawnArmor ? { ...a.s3.spawnArmor } : null,
    respawnTimer: a.respawnTimer, form: a.form, grounded: a.grounded,
    pos: a.pos.toArray(), vel: a.vel.toArray(), root: r.ch.root.position.toArray(),
    rootQuaternion: r.ch.root.quaternion.toArray(), input: { ...a.intent, move: a.intent.move.toArray() },
    runner: Object.fromEntries(Object.entries(runner).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')) };
}

export {production, rig, grip, gameplay};

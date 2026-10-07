// 847: Roller-body terrain contact via complete production composition.
// Current-main baseline and candidate run through all six source adapters,
// runtime install, and native Actor/Physics/Projectiles/PaintSystem/NetMatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { rollerDrumSupport, rollerStickActive } from '../runtime/roller.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const MAIN_BASE = '7ab20b44bbc00d497a50cbbbdb43b4da823b0a82';
const adaptProductionSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const headlessPaintRenderer = () => ({
  capabilities: { getMaxAnisotropy: () => 1 }, target: null,
  getRenderTarget() { return this.target; },
  getClearColor(out) { return out.setRGB(0, 0, 0); },
  getClearAlpha() { return 0; },
  setRenderTarget(target) { this.target = target; },
  setClearColor() {}, clear() {}, render() {}, // GPU surface stub; native CPU paint/contact still run
});
const apis = new Map();
function mainBaselineRollerSource() {
  try {
    return execFileSync('git', ['-C', ROOT, 'show', `${MAIN_BASE}:patches/splatoon3/runtime/roller.mjs`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}
async function production({ baselineRollerSource = null } = {}) {
  const cacheKey = baselineRollerSource ? 'main' : 'candidate';
  if (apis.has(cacheKey)) return apis.get(cacheKey);
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 });
  const modules = new Map();
  const load = (requested) => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);
    const raw = baselineRollerSource && rel === 'patches/splatoon3/runtime/roller.mjs'
      ? baselineRollerSource : fs.readFileSync(file, 'utf8');
    const source = adaptProductionSource(rel.split(path.sep).join('/'), raw);
    const mod = new vm.SourceTextModule(source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './inkwave-public/src/world/level.js';
    export { NetMatch } from './inkwave-public/src/net/netmatch.js';
  `, { context, identifier: path.join(ROOT, 'cl8-847-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const installed = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE, Physics, Level } = installed;
  // Compact native stage: flat pad at z=-5, wall at z=2, and a separate ledge below.
  const level = new Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [],
    single: [
      { kind: 'box', min: [-4, -.5, -7], max: [4, 0, 4] },
      { kind: 'box', min: [-4, 0, 2], max: [4, 3, 2.5] },
    ] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false },
    paint: new installed.PaintSystem(headlessPaintRenderer(), level, { atlasSize: 512, maxDensity: 2 }) });
  G.projectiles = new installed.Projectiles(G.scene);
  apis.set(cacheKey, installed); return installed;
}

test('847 flat rolling unchanged on full production composition', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847flat', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 3);
  const paintBefore = f.G.paint.version;
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  a.pos.z += 0.35;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(a.weaponRunner.rolling, true, 'flat + stick + fire keeps rolling');
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'roll speed preserved');
  assert.ok(a.ink < 100, 'native roll consumes ink while moving');
  assert.ok(f.G.paint.version > paintBefore, 'native paint system receives the roll stripe');
  f.G.actors = [];
});

test('847 no-stick residual stops native paint, ink drain, and damage without changing velocity', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847stick', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null;
  const v = new f.Actor({ team: 1, name: 'r847victim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  v.character.onEvent = null;
  f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 3);
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(a.weaponRunner.rolling, true);
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'residual speed present');
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8); v.hp = 500; v.alive = true; v.invuln = 0;
  f.G.actors = [a, v];
  a.intent.move.set(0, 0, 0); a.intent.fire = true;
  const inkBefore = a.ink, paintBefore = f.G.paint.version;
  a.pos.z += 0.35; a.vel.set(0, 0, 3);
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(v.hp, 500, 'no Left Stick input admits no roll damage despite residual speed');
  assert.equal(a.weaponRunner.rolling, false, 'native roll state stops when stick contact is absent');
  assert.equal(a.ink, inkBefore, 'residual displacement does not drain rolling ink');
  assert.equal(f.G.paint.version, paintBefore, 'residual displacement does not paint a roller stripe');
  assert.deepEqual([a.vel.x, a.vel.y, a.vel.z], [0, 0, 3], 'roller admission leaves native velocity intact');
  f.G.actors = [];
});

test('847 airborne wall drum contact preserves rolling', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847wall', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.ink = 100; a.yaw = 0; a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.intent.fire = true;
  // Just outside the authoritative 0.4 m radius must not count as contact.
  a.yaw = 0; a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.intent.fire = true;
  a.pos.set(0, 1.4, 0.8); a.grounded = false; a.vel.set(0, 0, 1);
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(a.weaponRunner.rolling, false, 'a nearby wall outside the body volume does not support rolling');
  // The actual Roller body reaches the wall at z=2 with its center at z=1.6.
  a.pos.set(0, 1.4, 0.85); a.vel.set(0, 0, 1);
  const wallHit = new f.Hit();
  f.G.physics.raycast(new f.THREE.Vector3(0, 1.8, 1.6), new f.THREE.Vector3(0, 0, 1), 0.4, wallHit, false);
  assert.equal(wallHit.hit, true, 'native physics confirms contact within the body radius');
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(a.grounded, false, 'actor stays airborne while pinned');
  assert.equal(a.weaponRunner.rolling, true, 'wall drum contact keeps the S3-valid roll while airborne');
  assert.deepEqual([a.vel.x, a.vel.y, a.vel.z], [0, 0, 1], 'wall admission does not overwrite airborne velocity');
  f.G.actors = [];
});

test('847 ledge drum void suppresses rolling while feet stay grounded', async () => {
  const f = await production();
  // Same realm, ledge stage: floor only at x<0. Fresh actor per stage.
  const ledge = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-4, -.5, -7], max: [0, 0, 4] }] });
  const keep = { level: f.G.level, physics: f.G.physics, projectiles: f.G.projectiles, paint: f.G.paint };
  f.G.level = ledge; f.G.physics = new f.Physics(ledge);
  f.G.projectiles = new f.Projectiles(f.G.scene);
  f.G.paint = new f.PaintSystem(headlessPaintRenderer(), ledge, { atlasSize: 512, maxDensity: 2 });
  try {
    const a = new f.Actor({ team: 0, name: 'r847ledge', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.onEvent = null; f.G.actors = [a];
    a.pos.set(-1.5, 0, 0); a.yaw = Math.PI / 2; a.aimYaw = Math.PI / 2; a.grounded = true; a.ink = 100;
    a.intent.move.set(1, 0, 0); a.intent.fire = true;
    f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
    assert.equal(a.weaponRunner.rolling, true, 'roll establishes on the ledge floor');
    // Pin feet at x=-0.25 (floor under feet) facing +x: drum center x=0.5 over void.
    a.pos.set(-0.25, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
    const inkBefore = a.ink, paintBefore = f.G.paint.version;
    f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
    assert.equal(a.grounded, true, 'feet stay grounded at the edge while pinned');
    assert.equal(a.weaponRunner.rolling, false, 'unsupported drum stops contact behavior at the ledge');
    assert.equal(a.ink, inkBefore, 'unsupported drum does not drain ink');
    assert.equal(f.G.paint.version, paintBefore, 'unsupported drum does not paint');
  } finally {
    f.G.level = keep.level; f.G.physics = keep.physics; f.G.projectiles = keep.projectiles; f.G.paint = keep.paint;
    f.G.actors = [];
  }
});

test('847 support probe falls back to feet grounding without stage collision', () => {
  const stubG = { physics: {} };
  const scratch = { ids: [], start: {}, delta: {} };
  const a = { grounded: true, yaw: 0, pos: { x: 0, y: 0, z: 0 }, intent: { move: { x: 0, z: 0 } }, remote: false };
  const sup = rollerDrumSupport(a, stubG, scratch);
  assert.equal(sup.supported, true, 'stub physics keeps the previous feet-grounded admission');
  assert.equal(rollerStickActive(a), false, 'zero stick reads inactive for the owner');
  assert.equal(rollerStickActive({ ...a, intent: { move: { x: 0, z: 1 } } }), true);
  assert.equal(rollerStickActive({ ...a, remote: true }), true, 'remote proxies defer to owner authority');
});

test('847 owner and remote share native contact; NetMatch drops remote damage and native hit updates survive', async () => {
  const f = await production();
  const owner = new f.Actor({ team: 0, name: 'r847owner', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const remote = new f.Actor({ team: 0, name: 'r847remote', isLocal: false, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const victim = new f.Actor({ team: 1, name: 'r847netvictim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  for (const actor of [owner, remote, victim]) actor.character.onEvent = null;
  owner.pos.set(0, 0, -5); remote.pos.copy(owner.pos); victim.pos.set(0, 0, -4.2);
  owner.yaw = remote.yaw = 0; owner.grounded = remote.grounded = true;
  remote.remote = true; remote.owner = 'peer-2';
  const ownerContact = rollerDrumSupport(owner, f.G, { ids: [], start: {}, delta: {} });
  const remoteContact = rollerDrumSupport(remote, f.G, { ids: [], start: {}, delta: {} });
  assert.deepEqual(ownerContact, remoteContact, 'stage contact depends only on the shared actor pose and stage collision');
  assert.equal(ownerContact.supported, true);

  const net = new f.NetMatch({ myId: 'peer-1', isHost: false }, { map: 'standard' });
  f.G.netm = net; f.G.actors = [owner, remote, victim];
  victim.hp = 500; victim.alive = true; owner.ink = remote.ink = 100;
  owner.vel.set(0, 0, 2); remote.vel.set(0, 0, 2);
  owner.intent.move.set(0, 0, 1); remote.intent.move.set(0, 0, 0);
  let hitEvents = 0;
  const off = f.on('hit', () => { hitEvents++; owner.vel.x = 2.25; });
  try {
    f.G.time += 1 / 60;
    owner.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
    assert.ok(victim.hp < 500, 'the owner applies the native Roller contact hit');
    assert.equal(hitEvents, 1, 'native hit event still dispatches once');
    assert.equal(owner.vel.x, 2.25, 'a synchronous native event velocity update is not restored over');

    const hpAfterOwner = victim.hp;
    assert.equal(net.shouldApplyHit(remote, victim), 'drop', 'the receiver remains authoritative for its actor');
    f.G.time += 0.6;
    remote.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
    assert.equal(victim.hp, hpAfterOwner, 'a remote roller never applies its own contact damage');
    assert.equal(hitEvents, 1, 'the dropped remote hit emits no local hit event');
  } finally {
    off(); f.G.netm = null; f.G.actors = [];
  }
});

test('847 current-main 7ab full production composition reproduces the uncovered gates', async t => {
  const baselineRoller = mainBaselineRollerSource();
  if (!baselineRoller) { t.skip('the pinned main baseline object is unavailable in this shallow checkout'); return; }
  const f = await production({ baselineRollerSource: baselineRoller });
  const a = new f.Actor({ team: 0, name: 'r847main', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const v = new f.Actor({ team: 1, name: 'r847mainvictim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  a.character.onEvent = v.character.onEvent = null;
  a.pos.set(0, 0, -5); a.yaw = 0; a.grounded = true; a.ink = 100; a.vel.set(0, 0, 2);
  a.intent.fire = true; a.intent.move.set(0, 0, 1); f.G.actors = [a];
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(a.weaponRunner.rolling, true, 'main admits flat contact');
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8); v.hp = 500; v.alive = true;
  const inkBefore = a.ink, paintBefore = f.G.paint.version;
  a.intent.move.set(0, 0, 0); a.pos.z += 0.35; a.vel.set(0, 0, 3); f.G.actors = [a, v];
  f.G.time += 1 / 60;
  a.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.ok(v.hp < 500, 'main allows residual-speed damage without Left Stick');
  assert.ok(a.ink < inkBefore, 'main drains ink from residual displacement');
  assert.ok(f.G.paint.version > paintBefore, 'main paints from residual displacement');

  const ledge = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-4, -.5, -7], max: [0, 0, 4] }] });
  f.G.level = ledge; f.G.physics = new f.Physics(ledge);
  const feet = { hit: false, y: 0, normal: new f.THREE.Vector3(), block: -1, face: -1, u: 0, v: 0, center: false, grate: false };
  f.G.physics.groundProbe(-0.25, 0, 0, f.PLAYER.stepUp, f.PLAYER.stepDown, f.PLAYER.footRadius, feet, false);
  assert.equal(feet.hit, true, 'native feet remain grounded at the ledge');
  const ledgeActor = new f.Actor({ team: 0, name: 'r847mainledge', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ledgeActor.pos.set(-0.25, 0, 0); ledgeActor.yaw = Math.PI / 2; ledgeActor.grounded = true;
  ledgeActor.intent.move.set(1, 0, 0); ledgeActor.intent.fire = true;
  ledgeActor.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(ledgeActor.weaponRunner.rolling, true, 'main uses feet grounding while the physical drum is over void');

  f.G.level = new f.Level({ bounds: { minX: -4, maxX: 4, minZ: -7, maxZ: 4 }, spawnPads: [[-3, 0, 0], [3, 0, 0]],
    spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-4, -.5, -7], max: [4, 0, 4] },
      { kind: 'box', min: [-4, 0, 2], max: [4, 3, 2.5] },
    ] });
  f.G.physics = new f.Physics(f.G.level);
  const airborne = new f.Actor({ team: 0, name: 'r847mainwall', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  airborne.pos.set(0, 1.4, 0.85); airborne.yaw = 0; airborne.grounded = false; airborne.intent.move.set(0, 0, 1);
  const wallHit = new f.Hit();
  f.G.physics.raycast(new f.THREE.Vector3(0, 1.8, 1.6), new f.THREE.Vector3(0, 0, 1), 0.4, wallHit, false);
  assert.equal(wallHit.hit, true, 'native stage collision confirms actual Roller-body wall contact');
  airborne.weaponRunner.update(1 / 60, { fire: true, firePressed: false, sub: false, subReleased: false });
  assert.equal(airborne.weaponRunner.rolling, false, 'main suppresses the airborne Roller-body wall contact');
  f.G.actors = [];
});

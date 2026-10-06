// Robustness fixture: the actual public net + projectile modules, run through the
// real build-time adapter chain. Nothing here re-implements gameplay; the VM only
// supplies the socket-free platform, the scene, and physics/paint/audio stubs.
//
// Composition order matches scripts/build-inkwave.mjs exactly:
//   adaptNetworkSource(adaptQualitySource(adaptReliability(adaptTouchLayout(adaptSource(...)))))
// Passing { network: false } omits ONLY the newest adapter so a test can reproduce
// the pre-fix baseline on the same sources.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../adapter.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
export const PATCH_ROOT = path.join(ROOT, 'patches/splatoon3');
export const QUALITY_ROOT = path.join(ROOT, 'patches/local-quality');

const netRoot = path.join(ROOT, 'patches/network-replication');

function relFor(file) {
  if (file.startsWith(UPSTREAM + path.sep)) return path.relative(UPSTREAM, file);
  if (file.startsWith(PATCH_ROOT + path.sep)) return 'patches/splatoon3/' + path.relative(PATCH_ROOT, file);
  if (file.startsWith(QUALITY_ROOT + path.sep)) return 'patches/local-quality/' + path.relative(QUALITY_ROOT, file);
  return path.relative(ROOT, file);
}

// One module environment. `network` selects whether the newest adapter participates.
export async function fixture({ network = true, rollerMotion = false } = {}) {
  let seconds = 1000;
  const context = vm.createContext({ console, performance: { now: () => seconds * 1000 } });
  const modules = new Map();

  const compose = network
    ? (rel, code) => adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)))))
    : (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(UPSTREAM, 'vendor/three/jsm', spec.slice('three/addons/'.length));
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }

  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    const isSource = file.startsWith(UPSTREAM + path.sep) || file.startsWith(PATCH_ROOT + path.sep) || file.startsWith(QUALITY_ROOT + path.sep);
    const source = isSource ? compose(relFor(file), raw) : raw;
    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }

  // Only the modules the replication path actually touches. No renderer, no
  // second physics engine, no fake game model.
  const rollerMotionExports = rollerMotion ? `
    export * from './inkwave-public/src/game/character.js';
    export * from './patches/splatoon3/runtime/roller.mjs';
    export * from './patches/splatoon3/runtime/walk.mjs';
  ` : '';
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/net/netmatch.js';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';
    export * from './patches/splatoon3/runtime/sub-special-fidelity.mjs';
    export * from './patches/local-quality/roller-visual.mjs';
    export * as THREE from 'three';
    ${rollerMotionExports}
  `, { context, identifier: path.join(ROOT, 'robustness-fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier)));
  await root.evaluate();

  const api = { ...root.namespace };
  const { G, THREE, PLAYER, WEAPONS, NetMatch, Projectiles } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player);
  Object.assign(api.SUB.bomb, profile.bomb);
  for (const [id,data] of Object.entries(profile.specials || {})) Object.assign(api.SPECIALS[id],data);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);

  api.installWeapons(api, profile);
  if (rollerMotion) { api.installWalkMotion(api, profile); api.installRollerMotion(api, profile); }
  api.installWeaponsFidelity(api, profile);
  api.installRollerVisualQuality(api);

  // ---- world stubs: physics only reports a flat floor at y = 0, no actors, no boss
  const floorHit = (a, b, hit) => {
    if (b.y <= 0 && a.y > 0) {
      const t = a.y / Math.max(1e-6, a.y - b.y);
      hit.hit = true;
      hit.point = a.clone().lerp(b, t);
      hit.normal = new THREE.Vector3(0, 1, 0);
      return hit;
    }
    hit.hit = false;
    return hit;
  };
  G.actors = [];
  G.boss = null;
  G.local = null;
  G.camera = { position: new THREE.Vector3() };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.time = 0;
  G.physics = { segment: floorHit, raycast: (_o, _d, _r, hit) => { hit.hit = false; return hit; }, los: () => true };
  G.paint = { splat: () => 0, sample: () => 1 };
  G.fx = null; G.audio = null;
  G.match = { playing: () => true };
  G.level = { blocks: [], groundHeight: () => 0, spawnPads: [{ y: 0 }, { y: 0 }] };

  const scene = new THREE.Scene();
  const projectiles = new Projectiles(scene);
  G.projectiles = projectiles;

  // ---- session / NetMatch helpers
  const makeSession = (id = 'me', host = 'me', members = [['me', 'Me'], ['p2', 'P2'], ['p3', 'P3']]) => ({
    myId: id, isHost: id === host, hostId: host,
    _members: new Map(members),
    tr: { broadcast: () => {}, sendTo: () => {} },
  });

  function makeNetMatch(session) {
    const nm = new NetMatch(session, { map: 'map', difficulty: 'normal' });
    G.netm = nm;
    return nm;
  }

  // Minimal actor for the replication path. `_setupActor` needs `character`;
  // `_sample` needs `net`; ghost replay needs `team`/`color`/`owner`.
  function makeActor({ nid, owner, remote, team = 0, vertical = false, roller = true } = {}) {
    return {
      nid, owner, remote, team, alive: true, grounded: false, yaw: 0, aimYaw: 0, aimPitch: 0.1,
      pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1), aimPoint: new THREE.Vector3(0, 2, 10),
      color: new THREE.Color('#ff8a14'), form: 'kid', hp: 100, ink: 100, special: 0, invuln: 0,
      weapon: roller ? WEAPONS.roller : WEAPONS.shooter,
      weaponRunner: { s3FlickVertical: !!vertical, s3RollerAttack: null, reset() {} },
      character: { s3RollerFlick: null, trigger() {}, _s3CancelRollerFlick() {}, root: { visible: true }, setVisible() {} },
      anim: {}, stats: { turf: 0, splats: 0, deaths: 0 },
      intent: { move: new THREE.Vector3(), fire: false, squid: false, jump: false, sub: false, special: false },
      respawn() {}, respawnTimer: 0, superJumpState: null, specialActive: null, netTp: 0, isBot: false,
      addTurf() {}, isLocal: !remote, _nearCamera: () => false, _finishFrame() {},
    };
  }

  function bind(nm, actors) {
    nm.match = {
      actors, state: 'playing', time: 0, follower: false,
      removeActor(a) { this.actors = this.actors.filter((x) => x !== a); },
    };
    for (const a of actors) { nm.byNid.set(a.nid, a); nm._setupActor(a); }
    return nm.match;
  }

  // ---- deterministic packet builders
  const r3 = (x) => Math.round(x * 1000) / 1000;
  // mirrors packActor() field order
  function packActor(a, { x = a.pos.x, y = a.pos.y, z = a.pos.z, vx = a.vel.x, vy = a.vel.y, vz = a.vel.z, yaw = a.yaw, f = 0, tp = a.netTp || 0 } = {}) {
    return [a.nid, r3(x), r3(y), r3(z), r3(vx), r3(vy), r3(vz), r3(yaw), r3(a.aimYaw), r3(a.aimPitch), f, 100, 100, 0, 0, 0, tp, 0, 0, 1, 0];
  }
  const tick = (nm, from, ts, { a = [], e, l = null } = {}) => nm.onMessage(from, {
    k: 't', ts,
    ...(a.length ? { a, l: l ?? Object.fromEntries(a.map(s => [s[0], 0])) } : {}),
    ...(e ? { e } : {}),
  });

  return {
    ...api, profile, G, THREE, NetMatch, Projectiles, projectiles, WEAPONS, PLAYER,
    network,
    clock: { now: () => seconds, set: (v) => { seconds = v; }, advance: (dt) => { seconds += dt; } },
    makeSession, makeNetMatch, makeActor, bind, packActor, tick,
    // the real roller flick path: owner records a projectile event, we return it
    flickPacket(nm, actor) {
      nm.out.length = 0;
      projectiles.fireFlick(actor, actor.weapon);
      return nm.out.slice();
    },
  };
}

// Independent integration fixture: real public Actor/Projectiles/NetMatch and
// complete production source-adapter order, or the actual emitted module graph.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export async function combatWorld(owner, { emitted = process.env.INKWAVE_COMBAT_SITE, paintArea = .123456789, network = false } = {}) {
  const SRC = emitted ? path.resolve(emitted) : path.join(ROOT, 'inkwave-public');
  let clock = 1000;
  const context = vm.createContext({ console, performance: { now: () => clock * 1000 } });
  const mods = new Map();
  const resolve = (spec, from) => {
    if (spec === 'three') return path.join(SRC, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (!emitted && file.startsWith(path.join(SRC, 'patches/'))) file = path.join(ROOT, path.relative(SRC, file));
    if (!emitted && file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    return file;
  };
  const load = file => {
    if (mods.has(file)) return mods.get(file);
    let source = fs.readFileSync(file, 'utf8');
    if (!emitted) {
      const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);
      source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source))));
      if (network) source = adaptNetworkSource(rel, source);
    }
    const mod = new vm.SourceTextModule(source, { context, identifier: file }); mods.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export * from './src/core/ctx.js'; export * from './src/config.js';
    export * from './src/game/actor.js'; export * from './src/game/weapons.js';
    export { Hit } from './src/game/physics.js';
    export * from './src/net/netmatch.js'; export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
  `, { context, identifier: path.join(SRC, 'integration-fixture.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier))); await entry.evaluate();
  const api = { ...entry.namespace }, { G, THREE, PLAYER, WEAPONS, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const name of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources']) api[name](api, profile);
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { spawnPads: [new THREE.Vector3(), new THREE.Vector3(20, 0, 20)], blocks: [], groundHeight: () => 0 };
  G.physics = { los: () => true, groundProbe: (_x,_y,_z,_a,_b,_c,h) => { h.hit = false; return h; } };
  const paint = [];
  G.paint = { sample: () => 1, splat: (pos, radius, team, opts = {}) => {
    paint.push({ pos: pos.toArray(), radius, team });
    G.netm?.recSplat(pos, radius, team, opts);
    return paintArea;
  } };
  G.time = 0;
  class Display {
    constructor() { this.root = new THREE.Group(); }
    trigger() {} setVisible(value) { this.root.visible = value; } setHurt() {} setWeapon() {}
  }
  const make = (nid, team, actorOwner) => {
    const a = new api.Actor({ team, name: 'integration', weapon: 'shooter', CharacterClass: Display });
    a.nid = nid; a.owner = actorOwner; a.isLocal = actorOwner === owner;
    a.spawnAt(new THREE.Vector3(nid * 2, 0, 0), 0); a.invuln = 0;
    a._nearCamera = () => false; a._finishFrame = () => {};
    return a;
  };
  const attacker = make(1, 0, 'A'), victim = make(2, 1, 'B');
  G.actors = [attacker, victim];
  const wire = [];
  const session = { myId: owner, hostId: 'A', isHost: owner === 'A', _members: new Map([['A', 'A'], ['B', 'B']]),
    tr: { sendTo: (to, data) => wire.push({ to, data: JSON.parse(JSON.stringify(data)) }), broadcast: data => wire.push({ data: JSON.parse(JSON.stringify(data)) }) } };
  const net = new api.NetMatch(session, { map: 'reef' });
  const match = { actors: G.actors, state: 'playing', time: 180, canRespawn: () => true };
  G.match = match; net.bind(match);
  G.projectiles = { list: [], bombs: [], clouds: [], beams: [], sights: new Map(), applyHit: api.Projectiles.prototype.applyHit };
  const deliver = (from, data) => {
    net.onMessage(from, JSON.parse(JSON.stringify(data)));
    const peer = net.peers.get(from);
    if (peer) { peer.tr = data.ts + 1; peer.sim = Number.MAX_SAFE_INTEGER; net._playEvents(); }
  };
  return { ...api, attacker, victim, net, wire, paint, deliver, advance: () => { clock += .05; }, dispose: () => net.dispose() };
}

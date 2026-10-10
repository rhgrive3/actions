// Actual public modules plus the build adapter. No renderer, fake game model,
// or second gameplay engine is used. Tests stub only display/audio/collisions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILT = process.env.INKWAVE_INPUT_POLICY_SITE;
if (!BUILT) throw new Error('Set INKWAVE_INPUT_POLICY_SITE to an authentic build');
const UPSTREAM = path.resolve(BUILT);
export async function fixture() {
  const listeners = new Map(), storage = new Map(); let pads = [];
  const classes = {add(){},remove(){},toggle(){},contains(){return false;}};
  const context = vm.createContext({ console, performance, URL, AbortController, setTimeout, clearTimeout,
    addEventListener(n,fn){listeners.set(n,[...(listeners.get(n)||[]),fn]);},
    removeEventListener(n,fn){listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==fn));},
    screen:{width:1000,height:700,orientation:{angle:0}},innerWidth:1000,innerHeight:700,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    navigator:{userAgent:'controls fixture',maxTouchPoints:0,getGamepads:()=>pads},
    window:{addEventListener(n,fn){listeners.set(n,[...(listeners.get(n)||[]),fn]);}},
    document:{documentElement:{classList:classes},addEventListener(n,fn){listeners.set(n,[...(listeners.get(n)||[]),fn]);},removeEventListener(n,fn){listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==fn));},querySelector(){return null;},pointerLockElement:null}
  });
  const modules = new Map();
  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(UPSTREAM, 'vendor/three/jsm', spec.slice('three/addons/'.length));
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (!BUILT && file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    if (BUILT && file.startsWith(path.join(ROOT, 'patches/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    const raw = fs.readFileSync(file, 'utf8');
    const source = raw; // Actual emitted bytes, never re-adapted.
    const mod = new vm.SourceTextModule(source, { context, identifier: file }); modules.set(file, mod); return mod;
  }
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';

    export * from './inkwave-public/src/core/input.js';
    export { getPlatformLifecycle } from './patches/local-quality/platform-lifecycle.mjs';
    export * from './inkwave-public/src/net/netmatch.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * as THREE from 'three';
    export { FixedClock, installClock, runSimulation } from './patches/splatoon3/runtime/clock.mjs';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier))); await root.evaluate();
  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(BUILT ? UPSTREAM : ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) api[install](api, profile);
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.time = 0;
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  const shots = [];
  G.projectiles = { fireCharger: (actor, weapon, charge) => shots.push({ kind: 'charger', charge }),
    fireShooter: () => shots.push({ kind: 'shooter' }), fireDualies: (_a, _w, spread) => shots.push({ kind: 'dualies', spread }),
    fireFlick: (actor, weapon) => shots.push({ kind: 'roller', windup: weapon.flickWindup }), fireBlaster: () => shots.push({ kind: 'blaster' }),
    fireSplatling: () => shots.push({ kind: 'splatling' }) };
  class Character {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {}
  }
  function make(weapon = 'shooter') {
    const a = new api.Actor({ team: 0, name: 'fixture', weapon, CharacterClass: Character });
    a.grounded = true; a.ground.hit = true; a.ground.face = 0;
    a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
    return a;
  }
  function tick(a, frames = 1) { for (let i = 0; i < frames; i++) { G.time += 1 / 60; a.update(1 / 60); } }
  return { ...api, profile, make, tick, shots, storage, setPads:p=>{pads=p;},
    event:(name,value)=>{for(const fn of listeners.get(name)||[])fn(value);},
    sources:modules };
}

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
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const close = (actual, expected, label, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);

// #816: post-shot admission must attach to the final installed finite-flight owner.
// Same composition and installer as build-inkwave (native Actor, Projectiles,
// Physics, Level); only display/audio objects are headless. No GPU claim.
async function boot({ wall = false, omitPostShot = false } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    let raw = fs.readFileSync(file, 'utf8'); const rel = path.relative(SRC, file);
    if (omitPostShot && file.endsWith('/runtime/weapons-charger-flight.mjs')) raw = raw.replace('      if(actor.weaponRunner)actor.weaponRunner.s3ChargerPostShot=16/60;\n', '');
    const source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { fidelityDamage } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
    export { Level } from './src/world/level.js';
  `, { context, identifier: path.join(SRC, 'wall-drop-guards-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const single = [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }];
  if (wall) single.push({ kind: 'box', min: [-10, 0, 6], max: [10, 20, 7] });
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single, half: [] });
  const painted = [];
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false },
    paint: { sample: () => 1, splat: (point, radius) => { painted.push({ y: point.y, radius }); return 1; } } });
  G.projectiles = new api.Projectiles(G.scene);
  function make({ pos = [0, 0, 0], weapon = 'shooter', team = 0 } = {}) {
    const a = new api.Actor({ team, name: 'wall-drop guard', weapon, CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  }
  const tick = (a, count = 1) => { for (let i = 0; i < count; i++) { G.time += STEP; a.update(STEP); G.projectiles.update(STEP); } };
  const closeAll = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, profile, make, tick, painted, close: closeAll };
}



for(const charge of [.5,1])test(`actual finite Charger ${charge} shot holds squid for 16F`,async t=>{const f=await boot();t.after(f.close);const a=f.make({weapon:'charger'});f.tick(a);f.G.projectiles.fireCharger(a,a.weapon,charge);assert.equal(f.G.projectiles._fidelityChargerFlights.length,1);close(a.weaponRunner.s3ChargerPostShot,16/60,'accepted shot');a.intent.squid=true;for(let i=1;i<=16;i++){f.tick(a);assert.equal(a.form,i<16?'kid':'squid',`${i}F`);}assert.equal(f.G.projectiles._fidelityChargerFlights.length<=1,true);});
test('ghost and rejected finite Charger launch do not arm local recovery; sub/reset retain their own owners',async t=>{const f=await boot();t.after(f.close);const a=f.make({weapon:'charger'});f.tick(a);const ps=f.G.projectiles;ps.ghostFire(a,{weapon:a.weapon.id,charge:.5,muzzle:a.pos,dir:new f.THREE.Vector3(0,0,1)});assert.equal(a.weaponRunner.s3ChargerPostShot,0);const n=ps._fidelityChargerFlights.length;const aim=ps._aimFrom;ps._aimFrom=(_a,_o,out)=>out.set(0,0,0);ps.fireCharger(a,a.weapon,.5);assert.equal(ps._fidelityChargerFlights.length,n);assert.equal(a.weaponRunner.s3ChargerPostShot,0);ps._aimFrom=aim;ps.fireCharger(a,a.weapon,.5);a.intent.sub=true;for(let frame=1;frame<=15;frame++){f.tick(a);assert.equal(a.weaponRunner.aimingSub,frame===15,'#837 reuses actual-shot recovery until15F');}a.weaponRunner.reset();assert.equal(a.weaponRunner.s3ChargerPostShot,0);});

test('negative control: missing finite-flight writer bypasses sub gate despite independent squid lock',async t=>{const f=await boot({omitPostShot:true});t.after(f.close);const a=f.make({weapon:'charger'});f.tick(a);f.G.projectiles.fireCharger(a,a.weapon,.5);assert.equal(f.G.projectiles._fidelityChargerFlights.length,1);assert.equal(a.weaponRunner.s3ChargerPostShot,0);a.intent.squid=true;f.tick(a);assert.equal(a.form,'kid','independent ChargerSurface still owns its squid gate');a.intent.squid=false;a.intent.sub=true;f.tick(a);assert.equal(a.weaponRunner.aimingSub,true,'missing actual-flight writer incorrectly admits sub before15F');});

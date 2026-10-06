import {catalogDualiesInput} from '../../../scripts/check-inkwave-motion-catalog.mjs';
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

// #604 plus the already-composed rows #770 #777 #638/#637 #644/#643 #556.
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
    export { dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
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




for(const actualActor of [false,true])test(`catalog Dualies clock ${actualActor}`,async t=>{const f=await boot();t.after(f.close);const a=f.make({weapon:'dualies'}),r=a.weaponRunner;const stats={roll:0,plant:0,blocked:0,shots:0};const orig=f.G.projectiles.fireDualies;f.G.projectiles.fireDualies=function(...args){stats.shots++;return orig.apply(this,args);};
const script=fs.readFileSync(path.join(ROOT,'scripts/check-inkwave-motion-catalog.mjs'),'utf8');
const body=script.slice(script.indexOf('      function step('),script.indexOf('      function move('));
const nativeStep=new Function('a','ch','G','scenario',body+'; return step;')(a,a.character,f.G,{name:'dualies-roll-lock-interrupt'});
function step(input={}){if(actualActor)return nativeStep(STEP,input);a.intent.fire=!!input.fire;a.intent.sub=!!input.sub;f.G.time+=STEP;r.update(STEP,input);a._finishFrame(STEP);}
for(let i=0;i<100;i++)step();const rows=[];
for(let frame=0;frame<(actualActor?240:180);frame++){const input=actualActor?catalogDualiesInput(frame,a,a.character,f.THREE):{fire:frame<145,sub:frame>=115&&frame<132};if(!actualActor&&(frame===0||frame===110)){a.intent.fire=true;assert(r.tryDodge(new f.THREE.Vector3(1,0,0)));}if(!actualActor){if(r.dodgeVel(a.vel))a.pos.addScaledVector(a.vel,STEP);else a.vel.set(0,0,0);}step(input);const snap=f.dualiesMotionSnapshot(a.character);if(snap?.phase==='roll')stats.roll++;if(snap?.phase==='plant')stats.plant++;if(snap?.blockedRoll)stats.blocked++;if(frame>=109&&frame<=118||frame===160||frame===164)rows.push({frame,t:r.s3DualiesPostShot,aim:r.aimingSub,phase:snap?.phase,blocked:snap?.blockedRoll});}
console.log(JSON.stringify({actualActor,stats,rows}));if(actualActor){assert(stats.roll>=5&&stats.plant>=10&&stats.blocked>=1&&stats.shots>0);assert.equal(rows.find(x=>x.frame===115).t,0);assert.equal(rows.find(x=>x.frame===115).aim,false);for(const n of [160,164])assert.equal(rows.find(x=>x.frame===n).aim,true);}else{assert.equal(stats.blocked,0);assert.equal(rows.find(x=>x.frame===115).t,4/60);assert.equal(rows.find(x=>x.frame===115).aim,false);}});

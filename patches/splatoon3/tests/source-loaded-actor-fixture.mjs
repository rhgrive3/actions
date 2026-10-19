// Real production-adapted Actor/Character with awaited dynamic Player00 bank.
// No renderer, GPU paint or full match; isolated floor and own-ink sample.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const adaptProduction = (await import(pathToFileURL(path.join(ROOT,'scripts/inkwave-source-composition.mjs')).href)).adaptBuildSource;
const RealmBlob = function(parts = [], options) { return new Blob(parts.map(p => ArrayBuffer.isView(p) ? Buffer.from(p.buffer, p.byteOffset, p.byteLength) : p), options); };

export async function sourceLoadedActorFixture({ transform = adaptProduction, emittedTransform = null, random = null, sourceOnly = false, extraExports = '' } = {}) {
  const EMITTED = !!process.env.INKWAVE_BUILT_SITE && !sourceOnly;
  const SITE = EMITTED ? path.resolve(process.env.INKWAVE_BUILT_SITE) : path.join(ROOT,'inkwave-public');
  const context = vm.createContext({ console, performance, URL, URLSearchParams, TextEncoder, TextDecoder, Blob: RealmBlob,
    DecompressionStream, crypto, structuredClone, setTimeout, clearTimeout, queueMicrotask, innerWidth:1280, innerHeight:720 });
  if (random) { context.__fixtureRandom = random; vm.runInContext('Math.random = globalThis.__fixtureRandom', context); delete context.__fixtureRandom; }
  const RealmArrayBuffer = vm.runInContext('ArrayBuffer', context);
  class RealmResponse extends Response { async arrayBuffer() { const bytes = new Uint8Array(await super.arrayBuffer()), out = new RealmArrayBuffer(bytes.length); new Uint8Array(out).set(bytes); return out; } }
  context.Response = RealmResponse;
  context.fetch = async url => { assert.ok(String(url).startsWith('file:'), 'file-only bank fetch'); const file = fileURLToPath(String(url)); return new RealmResponse(fs.existsSync(file) ? fs.readFileSync(file) : null, {status: fs.existsSync(file) ? 200 : 404}); };
  const modules = new Map();
  const resolve = (spec, from) => spec === 'three' ? path.join(SITE, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SITE, 'vendor/three/jsm', spec.slice('three/addons/'.length))
    : path.resolve(path.dirname(from), spec);
  function load(file) {
    if (!EMITTED && file.startsWith(path.join(SITE,'patches')+path.sep)) file=path.join(ROOT,path.relative(SITE,file));
    if (!EMITTED && file.startsWith(path.join(ROOT,'src')+path.sep)) file=path.join(SITE,path.relative(ROOT,file));
    if (modules.has(file)) return modules.get(file);
    const raw=fs.readFileSync(file,'utf8'), source=EMITTED&&emittedTransform?emittedTransform(path.relative(SITE,file),raw):!EMITTED&&file.startsWith(SITE+path.sep)?transform(path.relative(SITE,file),raw):raw;
    const m = new vm.SourceTextModule(source, { context, identifier:file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
      importModuleDynamically: async spec => { const dep = load(resolve(spec,file)); if (dep.status === 'unlinked') await dep.link((s,from) => load(resolve(s,from.identifier))); if (dep.status === 'linked') await dep.evaluate(); return dep; } });
    modules.set(file,m); return m;
  }
  const entry = new vm.SourceTextModule(`
    ${extraExports}
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installRanked, buildFrame } from './patches/splatoon3/runtime/ranked/install.mjs';
    export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
    export { Match } from './src/game/match.js';
    export { Level } from './src/world/level.js';
    export { toxicMistScale } from './patches/splatoon3/runtime/toxic-mist.mjs';
    export { emptyLoadout } from './patches/splatoon3/runtime/gear.mjs';
    export { inkVacState, inkVacAbsorbCandidate, INK_VAC_EVENTS, INK_VAC_CALIBRATION, disposeInkVac } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
    export { nativeWeaponPoseRequired } from './patches/splatoon3/runtime/source-weapon-owner.mjs';
    export { specialPresentationSnapshot } from './patches/splatoon3/runtime/special-motion.mjs';
    export { specialPresentationToken, withSpecialPresentation } from './patches/splatoon3/runtime/special-presentation-owner.mjs';
  `, {context, identifier:path.join(SITE,'source-loaded-probe.mjs')});
  await entry.link((s,from) => load(resolve(s,from.identifier))); await entry.evaluate();
  const f = {...entry.namespace.install(JSON.parse(fs.readFileSync(path.join(EMITTED?SITE:ROOT,'patches/splatoon3/profile.json')))), ...entry.namespace};
  f.installRanked(f);
  const {G,THREE}=f;
  G.scene = new THREE.Scene(); G.settings={quality:'high'}; G.mode='match'; G.time=0;
  G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.actors=[];
  G.projectiles=new f.Projectiles(G.scene);
  G.match={playing:()=>true,canRespawn:()=>false};
  let nextId=231;
  f.make=async(team=0)=>{const a=new f.Actor({team,name:'loaded-source-boundary',isLocal:true,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    a.nid=nextId++;a.character.actor=a;G.actors.push(a);G.scene.add(a.character.root);a.character.setLod('hero');
    a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
    await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;
    assert.equal(a.character.sourceMotion.status,'ready','production source bank loaded');return a;};
  f.tick=(a,dt=1/60)=>{G.time+=dt;a.update(dt);a.character.root.updateMatrixWorld(true);a.character.skeleton.update();};
  f.reset=()=>{for(const a of G.actors){f.disposeInkVac(a);G.scene.remove(a.character.root);a.character.dispose();}G.actors=[];G.projectiles.clear();G.match={playing:()=>true,canRespawn:()=>false};};
  return f;
}

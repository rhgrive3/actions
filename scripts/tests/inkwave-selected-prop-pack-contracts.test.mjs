import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareLoading, finalizeLoadingWorker, PROP_COMPATIBILITY_PRECACHE} from '../../patches/loading-cache/adapter.mjs';
import {World} from '../../patches/loading-cache/tests/worker-fixture.mjs';
import {fileURLToPath} from 'node:url';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';
import {adaptQueueVisualWorld20261031} from '../../patches/local-quality/queue-visual-world-20261031-adapter.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const optional=new Set(['src/world/props.js','src/world/stages/index.js','src/world/props-marina-vessels.js','src/world/props-marina-dock.js','src/world/stages/cargo/props.js']);
const read=rel=>fs.readFileSync(path.join(root,rel.startsWith('src/')||rel.startsWith('vendor/')?'inkwave-public/'+rel:rel),'utf8');
function source(rel, overrides) {const raw=overrides?.get(rel)??read(rel);return rel.startsWith('src/')?adaptBuildSource(rel,raw):raw;}
function resolve(spec, parent){
 if(spec==='three')return 'vendor/three/build/three.module.js';
 if(spec.startsWith('three/addons/'))return 'vendor/three/jsm/'+spec.slice(13);
 assert(spec.startsWith('.'),'unexpected external cold module '+spec);
 return path.posix.normalize(path.posix.join(path.posix.dirname(parent),spec));
}
function dependencyGraph(entries,overrides){
 const seen=new Set(),queue=[...entries];
 while(queue.length){const rel=queue.shift();if(seen.has(rel))continue;seen.add(rel);
  const ast=parse(source(rel,overrides),{ecmaVersion:'latest',sourceType:'module'});
  for(const n of ast.body)if(n.type==='ImportDeclaration'||(n.type==='ExportNamedDeclaration'||n.type==='ExportAllDeclaration')&&n.source)queue.push(resolve(n.source.value,rel));
 }
 return seen;
}
function assertColdGraph(overrides){const graph=dependencyGraph(['src/main.js','src/world/prop-packs.js'],overrides);for(const rel of optional)assert(!graph.has(rel),'eager optional builder/facade '+rel);return graph;}
test('the actual composed cold module graph excludes optional builders and the full compatibility facade',()=>{
 const graph=assertColdGraph();assert(graph.has('src/world/props-core.js'));assert(graph.has('src/world/props-marina-placements.js'));for (const rel of ['src/world/stages/cargo/placements.js', 'src/world/stages/cargo/murals.js', 'patches/practice-range/stage/props.mjs', 'patches/practice-range/stage/murals.mjs']) assert(!graph.has(rel),'unselected descriptor dependency '+rel);
 for(const entry of ['src/world/dressing.js','src/world/murals.js','src/world/prop-packs.js']){
  const mutant=new Map([[entry,read(entry)+"\nimport './props.js';\n"]]);
  assert.throws(()=>assertColdGraph(mutant),/eager optional/,'a static import through '+entry+' must fail');
 }
});
test('public PropKit facade retains the exact original named exports and both owners remain direct source',()=>{
 const exports=code=>parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers.map(s=>s.exported.name).concat(n.declaration?.id?[n.declaration.id.name]:n.declaration?.declarations?.map(d=>d.id.name)||[])).sort();
 const baseline=fs.readFileSync(new URL('../../patches/local-quality/tests/fixtures/props-before-selected-packs.js.txt',import.meta.url),'utf8');
 assert.deepEqual(exports(read('src/world/props.js')),exports(baseline));
 // The compatibility facade is byte-identical. The selected core now has a
 // separately reviewed, source-only bounding-box pass whose exact output is
 // the sole admitted difference. Other build passes cannot rewrite either.
 const facade='src/world/props.js',core='src/world/props-core.js',raw=read(core);
 assert.equal(adaptBuildSource(facade,read(facade)),read(facade));
 assert.equal(adaptBuildSource(core,raw,{queueVisualWorld20261031:false}),raw);
 const reviewed=adaptQueueVisualWorld20261031(core,raw);
 assert.notEqual(reviewed,raw,'production bounds pass is not accidentally omitted');
 assert.equal(adaptBuildSource(core,raw),reviewed,'only the explicit queued bounds owner may transform core');
 assert.throws(()=>adaptQueueVisualWorld20261031(core,raw.replace('  let vo = 0, io = 0;','  let vo = 0, io = 1;')),/visual\/world queue anchor/);

});

test('real loading preparation preserves the public facade closure offline without installing unrelated orphans',async()=>{
 const roots=['src/world/props.js','src/world/stages/index.js'];
 assert.deepEqual(PROP_COMPATIBILITY_PRECACHE,roots);
 const closure=dependencyGraph(roots),buildDir=fs.mkdtempSync(path.join(os.tmpdir(),'iw-prop-compat-'));
 const write=(rel,body)=>{const file=path.join(buildDir,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);};
 try{
  for(const rel of closure)write(rel,source(rel));
  write('src/main.js',source('src/main.js'));
  write('index.html','<!doctype html><body><script type="module" src="./patches/splatoon3/bootstrap.mjs"></script><script>if ("serviceWorker" in navigator && location.protocol === "https:") {}</script></body>');
  write('patches/splatoon3/profile.json',read('patches/splatoon3/profile.json'));
  write('patches/local-quality/assets/loading/arena.webp',fs.readFileSync(new URL('../../patches/local-quality/assets/loading/arena.webp',import.meta.url)));
  const orphan='src/world/unrelated-compat-orphan-control.js';write(orphan,'export const orphan=true;');
  const requested=[...closure].filter(rel=>!roots.includes(rel)).concat('src/main.js');
  const plan=prepareLoading(buildDir,requested);
  assert.deepEqual(plan.precache.filter(rel=>roots.includes(rel)),roots);
  assert(Object.hasOwn(plan.assets,orphan));assert(!plan.precache.includes(orphan),'explicit roots must not promote unrelated orphan assets');
  assert(!fs.readFileSync(path.join(buildDir,'index.html'),'utf8').includes('modulepreload'),'offline compatibility roots are not eager HTML requests');
  finalizeLoadingWorker(buildDir,'d'.repeat(64),plan);
  const workerSource=fs.readFileSync(path.join(buildDir,'sw.js'),'utf8'),ast=parse(workerSource,{ecmaVersion:'latest',sourceType:'script'});
  const binding=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='BUILD');
  const config=JSON.parse(workerSource.slice(binding.init.start,binding.init.end));
  const bodies=Object.fromEntries(Object.keys(plan.assets).map(rel=>[rel,fs.readFileSync(path.join(buildDir,rel))]));
  const build={config,index:fs.readFileSync(path.join(buildDir,'index.html')),bodies};
  const world=new World();world.serve(build);const worker=world.worker(build,workerSource);await worker.install();await worker.activate();world.offline=true;
  for(const rel of closure){const result=await worker.request(`_versions/${config.revision}/${rel}`);assert.equal(result.response.status,200,rel);assert.deepEqual(Buffer.from(await result.response.arrayBuffer()),bodies[rel],rel+' exact offline module bytes');}
  // Reproduce the real regression independently for each public API: all its
  // dependencies remain installed but omitting the entry itself breaks offline import.
  for(const missing of roots){
   const mutant={...build,config:{...config,precache:plan.precache.filter(rel=>rel!==missing)}};
   const negative=new World();negative.serve(mutant);const old=negative.worker(mutant);await old.install();await old.activate();negative.offline=true;
   await assert.rejects(old.request(`_versions/${config.revision}/${missing}`),/offline/i,missing+' omission must reproduce the failure');
  }
 }finally{fs.rmSync(buildDir,{recursive:true,force:true});}
});

const site=process.env.INKWAVE_BUILT_SITE;
test('emitted optional packs remain integrity-checked and offline-ready without eager HTML hints', {skip:!site}, async()=>{
 const {decodePrecacheEntries}=await import('../lib/inkwave-cache-manifest.mjs');
 const {createHash}=await import('node:crypto');
 const worker=fs.readFileSync(path.join(site,'sw.js'),'utf8');
 const ast=parse(worker,{ecmaVersion:'latest',sourceType:'script'});
 const binding=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='BUILD');
 assert(binding,'sealed worker build config');
 const config=JSON.parse(worker.slice(binding.init.start,binding.init.end)),precache=new Set(decodePrecacheEntries(config.precache,config.assets));
 const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
 const hints=(html.match(/<link\b[^>]*>/g)||[]).filter(tag=>/\brel=["']modulepreload["']/.test(tag));
 for(const rel of [...optional,'src/world/props-core.js','src/world/prop-packs.js','src/world/props-marina-placements.js','src/world/stages/cargo/placements.js','src/world/stages/data.js']){
  assert(precache.has(rel),rel+' must remain available offline');
  const bytes=fs.readFileSync(path.join(site,'_versions',config.revision,rel));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),config.assets[rel][1],rel+' exact sealed bytes');
  if(optional.has(rel))assert(!hints.some(tag=>tag.includes('/'+rel+'"')||tag.includes('/'+rel+"'")),rel+' must not become an eager HTML request');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BASE,BRANCH,CONTROL_PATHS,PAINT_PATHS,hash,selectRoute,assertReviewedTree,readCheckout,verifyBuildInventory,assertSourceReceipt,assertReceiptOutside,writeReceipt} from '../lib/inkwave-pr1869-current-pair.mjs';
import {prepareNativeStageBuild} from '../lib/inkwave-native-stages.mjs';
const event=()=>({number:1869,repository:{full_name:'rhgrive3/actions'},pull_request:{number:1869,base:{ref:'main',sha:BASE,repo:{full_name:'rhgrive3/actions'}},head:{ref:BRANCH,sha:'1'.repeat(40),repo:{full_name:'rhgrive3/actions'}}}});
test('route admits only the explicit same-repository PR1869 identity',()=>{
 const good=event();assert.deepEqual(selectRoute(good,'pull_request','rhgrive3/actions'),{repository:'rhgrive3/actions',pr:1869,branch:BRANCH,base:BASE,head:'1'.repeat(40)});
 for(const mutate of [e=>e.number=1870,e=>e.pull_request.number=1870,e=>e.repository.full_name='fork/actions',e=>e.pull_request.base.ref='other',e=>e.pull_request.base.sha='2'.repeat(40),e=>e.pull_request.base.repo.full_name='fork/actions',e=>e.pull_request.head.repo.full_name='fork/actions',e=>e.pull_request.head.ref=BRANCH+'-other',e=>e.pull_request.head.sha=BASE,e=>e.pull_request.head.sha='main',e=>delete e.pull_request]){const bad=event();mutate(bad);assert.throws(()=>selectRoute(bad,'pull_request','rhgrive3/actions'));}
 for(const name of ['push','workflow_dispatch','pull_request_target'])assert.throws(()=>selectRoute(good,name,'rhgrive3/actions'));
 assert.throws(()=>selectRoute(good,'pull_request','fork/actions'));
});
const row=(name,sha='a'.repeat(40),mode='100644')=>({path:name,mode,type:'blob',sha});
test('whole-tree admission permits only named QA controls, never production, reports or diagnostic routes',()=>{
 const allowed=CONTROL_PATHS[0],base=[row('inkwave-public/src/main.js'),row('reports/inkwave-splatoon3-behavior-2026-10-02.md'),...CONTROL_PATHS.map(name=>row(name))];
 assertReviewedTree(base,base.map(x=>({...x})));
 assertReviewedTree(base,base.map(x=>x.path===allowed?{...x,sha:'b'.repeat(40)}:{...x}));
 for(const name of ['inkwave-public/src/main.js','reports/inkwave-splatoon3-behavior-2026-10-02.md','scripts/check-unreviewed-browser.mjs','scripts/unreviewed-control.mjs']){
  const changed=base.map(x=>({...x}));const found=changed.find(x=>x.path===name);if(found)found.sha='b'.repeat(40);else changed.push(row(name));assert.throws(()=>assertReviewedTree(base,changed));
 }
 for(const name of CONTROL_PATHS)assert.throws(()=>assertReviewedTree(base,base.filter(x=>x.path!==name)),/every closed QA control must exist/);
 assert.equal(CONTROL_PATHS.length,24);
 assert.throws(()=>assertReviewedTree(base,base.map(x=>x.path===allowed?{...x,mode:'100755'}:x)));
 assert.throws(()=>assertReviewedTree(base,[...base,{...base[0]}]));
 assert.equal(new Set(CONTROL_PATHS).size,CONTROL_PATHS.length);assert.equal(PAINT_PATHS.length,13);assert.equal(new Set(PAINT_PATHS).size,13);
 for(const name of PAINT_PATHS)assert.equal(CONTROL_PATHS.includes(name),false);
});
test('benchmark preserves the exact public non-executable mode, not the old reviewed mode',()=>{
 const benchmark='scripts/benchmark-aplus-verification.mjs';
 const reviewed=CONTROL_PATHS.map(name=>row(name,'a'.repeat(40),name===benchmark?'100755':'100644'));
 const actual=reviewed.map(value=>value.path===benchmark?{...value,mode:'100644'}:{...value});
 assertReviewedTree(reviewed,actual);
 assert.throws(()=>assertReviewedTree(reviewed,reviewed),/control mode/);
 for(const rel of CONTROL_PATHS)assert.throws(()=>assertReviewedTree(reviewed,actual.map(value=>value.path===rel?{...value,mode:'100755'}:value)),/control mode/);
});

test('source receipt is an exact revalidated value, not an admitted flag',()=>{
 const actual={schema:1,mode:'pr1869-reviewed-current-no-replay',route:{base:BASE,head:'1'.repeat(40)},changes:[],writtenPaths:[]};
 assertSourceReceipt(structuredClone(actual),actual);
 for(const bad of [null,{}, {...actual,admitted:true},{...actual,writtenPaths:['paint.js']},{...actual,changes:['replayed']},{...actual,route:{...actual.route,head:'2'.repeat(40)}}])assert.throws(()=>assertSourceReceipt(bad,actual));
});
function withRepo(run){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'iw-pr1869-')));
 const root=path.join(dir,'source');fs.mkdirSync(root);
 const g=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 const put=(rel,body)=>{const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);return file;};
 g('init','-q');g('config','user.name','Fixture');g('config','user.email','fixture@example.invalid');
 put('inkwave-public/src/main.js','export const value=1;\n');put('scripts/build-inkwave.mjs','// fixture builder identity\n');put('scripts/lib/fixture.mjs','export const helper=1;\n');
 put('reports/identity-only.txt','metadata-only identity\n');put('package.json','{"private":true}\n');
 g('add','.');g('commit','-qm','fixture');const commit=g('rev-parse','HEAD');
 try{return run({dir,root,g,put,commit});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('actual Git checkout and physical source scan reject replay, dirt, modes, missing, extra and aliases',()=>withRepo(({root,put,commit})=>{
 const clean=readCheckout(root,commit);assert.equal(clean.commit,commit);assert.equal(clean.inputs.length,4);assert.equal(clean.rows.length,5);
 const packageFile=path.join(root,'package.json'),packageBytes=fs.readFileSync(packageFile);
 fs.appendFileSync(packageFile,' ');assert.throws(()=>readCheckout(root,commit));fs.writeFileSync(packageFile,packageBytes);
 for(const rel of ['package-lock.json','npm-shrinkwrap.json','.npmrc']){const extra=put(rel,'fixture\n');assert.throws(()=>readCheckout(root,commit));fs.unlinkSync(extra);}
 for(const rel of ['package-lock.json','npm-shrinkwrap.json','.npmrc']){const extra=path.join(root,rel);fs.symlinkSync(path.join(root,'absent-target'),extra);assert.throws(()=>readCheckout(root,commit),/unexpected root install configuration/);fs.unlinkSync(extra);}
 const file=path.join(root,'inkwave-public/src/main.js'),original=fs.readFileSync(file);
 fs.appendFileSync(file,'// replay attempted\n');assert.throws(()=>readCheckout(root,commit));fs.writeFileSync(file,original);
 fs.chmodSync(file,0o755);assert.throws(()=>readCheckout(root,commit));fs.chmodSync(file,0o644);
 fs.unlinkSync(file);assert.throws(()=>readCheckout(root,commit));fs.writeFileSync(file,original);
 const extra=put('scripts/lib/unlisted-producer.mjs','export {};');assert.throws(()=>readCheckout(root,commit));fs.unlinkSync(extra);
 fs.symlinkSync(path.join(root,'scripts/lib'),path.join(root,'scripts/alias'));assert.throws(()=>readCheckout(root,commit));fs.unlinkSync(path.join(root,'scripts/alias'));
 fs.unlinkSync(file);fs.symlinkSync(path.join(root,'scripts/lib/fixture.mjs'),file);assert.throws(()=>readCheckout(root,commit));fs.unlinkSync(file);fs.writeFileSync(file,original);
 assert.throws(()=>readCheckout(root,'f'.repeat(40)));assert.deepEqual(readCheckout(root,commit),clean);
}));
test('receipts stay outside protected roots, reject aliases and cannot overwrite different evidence',()=>withRepo(({dir,root})=>{
 const eventFile=path.join(dir,'event.json');fs.writeFileSync(eventFile,'{}');
 const out=path.join(dir,'evidence/source.json');assertReceiptOutside(out,[root],eventFile);writeReceipt(out,{schema:1,changes:[],writtenPaths:[]});
 const saved=fs.readFileSync(out);writeReceipt(out,{schema:1,changes:[],writtenPaths:[]});assert.deepEqual(fs.readFileSync(out),saved);
 assert.throws(()=>writeReceipt(out,{schema:2}));assert.deepEqual(fs.readFileSync(out),saved);
 for(const file of [path.join(root,'source.json'),path.join(root,'.built-site/source.json'),eventFile])assert.throws(()=>assertReceiptOutside(file,[root],eventFile));
 const alias=path.join(dir,'alias');fs.symlinkSync(root,alias);assert.throws(()=>assertReceiptOutside(path.join(alias,'receipt.json'),[root],eventFile));
 const evidenceAlias=path.join(dir,'evidence-alias');fs.symlinkSync(path.dirname(out),evidenceAlias);assert.throws(()=>assertReceiptOutside(path.join(evidenceAlias,'source.json'),[root],eventFile));
 const dangling=path.join(dir,'dangling-parent');fs.symlinkSync(path.join(dir,'does-not-exist'),dangling);assert.throws(()=>assertReceiptOutside(path.join(dangling,'source.json'),[root],eventFile),/symlinks/);
 assert.throws(()=>assertSourceReceipt(JSON.parse(fs.readFileSync(out)),{schema:1,changes:[],writtenPaths:[],head:'different'}));
}));
test('build inventory binds actual Git inputs and every output, with immutable native configuration',()=>withRepo(({dir,root,commit,put})=>{
 const site=path.join(dir,'site');fs.mkdirSync(site);
 const files={'upstream/src/main.js':hash(fs.readFileSync(path.join(root,'inkwave-public/src/main.js'))),'build-script/lib/fixture.mjs':hash(fs.readFileSync(path.join(root,'scripts/lib/fixture.mjs')))};
 const artifacts={'index.html':hash('fixture output\n')};fs.writeFileSync(path.join(site,'index.html'),'fixture output\n');
 const manifest={schema:1,files,artifacts,inputHash:hash(JSON.stringify(files)),contentHash:hash(JSON.stringify(artifacts)),build:{script:hash(fs.readFileSync(path.join(root,'scripts/build-inkwave.mjs'))),optimization:'esbuild-minify',esbuild:'0.28.2',revision:'c'.repeat(64),nativeStages:prepareNativeStageBuild(undefined).config}};
 const manifestFile=path.join(site,'inkwave-build.json'),write=value=>fs.writeFileSync(manifestFile,JSON.stringify(value,null,2)+'\n');write(manifest);
 const inputKeysSha256=hash(JSON.stringify(Object.keys(files).sort()));
 const run=()=>verifyBuildInventory({root,commit,site,inputKeysSha256});
 const good=run();assert.equal(good.inputLeaves,2);assert.equal(good.artifactLeaves,1);assert.deepEqual(good.writtenPaths,[]);
 assert.throws(()=>verifyBuildInventory({root,commit,site}),'production default must not accept a synthetic keyset');
 for(const mutate of [m=>m.files['upstream/src/main.js']='0'.repeat(64),m=>m.files['unknown/main.js']='0'.repeat(64),m=>delete m.files['build-script/lib/fixture.mjs'],m=>m.inputHash='0'.repeat(64),m=>m.contentHash='0'.repeat(64),m=>m.artifacts['index.html']='0'.repeat(64),m=>m.artifacts['../escape']='0'.repeat(64),m=>m.build.script='0'.repeat(64),m=>m.build.optimization='none-offline',m=>m.build.esbuild='0.0.0',m=>m.build.revision='branch',m=>m.build.account={enabled:true},m=>m.build.nativeStages.mode='local-prepared',m=>delete m.build.nativeStages]){
  const bad=structuredClone(manifest);mutate(bad);write(bad);assert.throws(run);write(manifest);
 }
 fs.writeFileSync(path.join(site,'extra.js'),'extra');assert.throws(run);fs.unlinkSync(path.join(site,'extra.js'));
 fs.writeFileSync(path.join(site,'index.html'),'tampered');assert.throws(run);fs.writeFileSync(path.join(site,'index.html'),'fixture output\n');
 fs.unlinkSync(path.join(site,'index.html'));fs.symlinkSync(path.join(root,'inkwave-public/src/main.js'),path.join(site,'index.html'));assert.throws(run);fs.unlinkSync(path.join(site,'index.html'));fs.writeFileSync(path.join(site,'index.html'),'fixture output\n');
 const input=path.join(root,'inkwave-public/src/main.js'),saved=fs.readFileSync(input);fs.appendFileSync(input,'// replay\n');assert.throws(run);fs.writeFileSync(input,saved);
 assert.deepEqual(run(),good);
}));
test('CLI rejects unsupported replay, skip and duplicate arguments without creating receipts',()=>withRepo(({dir,root})=>{
 const cli=new URL('../verify-inkwave-pr1869-current-pair.mjs',import.meta.url),eventFile=path.join(dir,'event.json'),receipt=path.join(dir,'receipt.json');fs.writeFileSync(eventFile,JSON.stringify(event()));
 const common=['--phase','source','--baseline',root,'--candidate',root,'--event',eventFile,'--receipt',receipt];
 for(const suffix of [['--skip','true'],['--replay','true'],['--phase','build'],['--source-receipt',path.join(dir,'missing.json')]]){
  assert.throws(()=>execFileSync(process.execPath,[cli.pathname,...common,...suffix],{encoding:'utf8',stdio:'pipe',env:{...process.env,GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'rhgrive3/actions'}}));assert.equal(fs.existsSync(receipt),false);
 }
}));

test('receipt publication cannot replace evidence created after its initial existence check',()=>withRepo(({dir})=>{
 const file=path.join(dir,'race.json'),originalLink=fs.linkSync;
 try{fs.linkSync=(from,to)=>{assert.equal(to,file);fs.writeFileSync(file,'other writer\n',{flag:'wx'});return originalLink(from,to);};assert.throws(()=>writeReceipt(file,{schema:1}),error=>error.code==='EEXIST');}
 finally{fs.linkSync=originalLink;}
 assert.equal(fs.readFileSync(file,'utf8'),'other writer\n');assert.deepEqual(fs.readdirSync(dir).filter(name=>name.startsWith('race.json.pending-')),[]);
}));

test('all present tracked bytes and index identity are checked despite sparse or assume-unchanged flags',()=>withRepo(({root,g,commit})=>{
 const rel='reports/identity-only.txt',file=path.join(root,rel),bytes=fs.readFileSync(file);
 const clean=readCheckout(root,commit);assert.equal(clean.tracked.omitted.length,0);
 for(const flag of ['--assume-unchanged','--skip-worktree']){
  g('update-index',flag,rel);fs.appendFileSync(file,'dirty outside consumed scope\n');assert.throws(()=>readCheckout(root,commit),/present tracked leaf/);fs.writeFileSync(file,bytes);g('update-index',flag==='--assume-unchanged'?'--no-assume-unchanged':'--no-skip-worktree',rel);
 }
 fs.unlinkSync(file);assert.throws(()=>readCheckout(root,commit),/missing ordinary tracked leaf/);fs.writeFileSync(file,bytes);
 fs.appendFileSync(file,'staged change\n');g('add',rel);assert.throws(()=>readCheckout(root,commit),/staged changes forbidden/);g('restore','--staged',rel);fs.writeFileSync(file,bytes);
 g('update-index','--skip-worktree',rel);fs.unlinkSync(file);const sparse=readCheckout(root,commit);assert.deepEqual(sparse.tracked.omitted.map(row=>row.path),[rel]);assert.equal(sparse.tracked.present.length,clean.tracked.present.length-1);fs.writeFileSync(file,bytes);g('update-index','--no-skip-worktree',rel);
 const consumed='inkwave-public/src/main.js',source=path.join(root,consumed),saved=fs.readFileSync(source);g('update-index','--skip-worktree',consumed);fs.unlinkSync(source);assert.throws(()=>readCheckout(root,commit),/consumed source cannot be sparse/);fs.writeFileSync(source,saved);g('update-index','--no-skip-worktree',consumed);
 assert.deepEqual(readCheckout(root,commit),clean);
}));

test('explicit controls inside excluded test directories remain mandatory physical inputs',()=>withRepo(({root,g,put})=>{
 const rel='patches/network-replication/tests/issue-1033-handoff-hit.test.mjs';assert(CONTROL_PATHS.includes(rel));
 const file=put(rel,'// exact committed control fixture\n');g('add',rel);g('commit','-qm','control fixture');const commit=g('rev-parse','HEAD');
 assert(readCheckout(root,commit).inputs.some(row=>row.path===rel));
 fs.unlinkSync(file);assert.throws(()=>readCheckout(root,commit),/consumed source cannot be sparse/);
}));


test('every closed QA control is a mandatory physical input, not a sparse metadata exemption',()=>withRepo(({root,g,put})=>{
 for (const rel of CONTROL_PATHS) put(rel, '// committed QA control fixture\n');
 g('add','.');g('commit','-qm','all twenty-four controls');const commit=g('rev-parse','HEAD');
 const clean=readCheckout(root,commit);
 for (const rel of CONTROL_PATHS) {
  const file=path.join(root,rel),bytes=fs.readFileSync(file);
  try {g('update-index','--skip-worktree',rel);fs.unlinkSync(file);assert.throws(()=>readCheckout(root,commit),/consumed source cannot be sparse/,rel);}
  finally {fs.writeFileSync(file,bytes);g('update-index','--no-skip-worktree',rel);}
 }
 assert.deepEqual(readCheckout(root,commit),clean);
}));

// Durable regression: run the checker's actual source slices, not a copied or
// relaxed predicate. The short original preflight slice is authenticated below;
// the candidate and all later browser predicates remain exact reviewed bytes.
test('Range actual checker preserves all 24 manifest/index and stage cases',async t=>{
 const candidate=fs.readFileSync(new URL('../check-inkwave-range.mjs',import.meta.url),'utf8');
 const baselinePreflight="const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');\nconst manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));\nif (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw new Error('Build identity mismatch');\nif (!Object.keys(manifest.files).some((k) => k.startsWith('practice-range/'))) throw new Error('Build does not include the practice range layer');\n// No baked AO pair exists for the range in this source tree. Verify the actual\n// artifact contract rather than requiring an asset that was never shipped.\nconst rangeLightmapFiles=['assets/lightmaps/range.json','assets/lightmaps/range.png'];\nconst rangeLightmapCount=rangeLightmapFiles.filter(f=>Object.hasOwn(manifest.artifacts,f)).length;\nif (rangeLightmapCount===1) throw new Error('Incomplete baked range AO pair');\n// The emitted runtime index is authoritative: packaged but unregistered\n// lightmap assets are not loaded by Game._loadLightmap, including Range.\nconst emittedLightmaps=(await import(pathToFileURL(path.join(site,'src/world/lightmap-assets.js')).href)).LIGHTMAP_LAYOUTS;\nif (!Array.isArray(emittedLightmaps) || emittedLightmaps.some(id=>typeof id!=='string')) throw new Error('Invalid emitted lightmap index');\nconst rangeLightmapAvailable=emittedLightmaps.includes('range');\nif (rangeLightmapAvailable && rangeLightmapCount!==2) throw new Error('Emitted Range lightmap index is missing its complete asset pair');\n\n";
 const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
 function uniqueOffset(source,anchor){const n=source.indexOf(anchor);assert(n>=0,anchor);assert.equal(source.indexOf(anchor,n+anchor.length),-1,anchor);return n;}
 function exactSlice(source,start,end){const a=uniqueOffset(source,start),b=uniqueOffset(source,end);assert(b>a);return source.slice(a,b);}
 const candidatePreflight=exactSlice(candidate,'const hash = (b) =>','const pw = await import(');
 const stageSource=exactSlice(candidate,'    const st = out.checks.stage;','    // #589: inspect the real constrained atlas');
 assert.equal(sha256(candidate),'ff79498bc6a7fb53626a035712ee34550254b49b7f1fbfc003e6f10915c68fb2');
 assert.equal(sha256(baselinePreflight),'e7c66d23f44eb2309034b5420b64a07524d9be601e068a463c99b43d2109559b');
 assert.equal(sha256(candidatePreflight),'b4689b6c386064b0e096e95bcd1923cc35ecc1392777252c987c219b64ab38df');
 assert.equal(sha256(stageSource),'7ccdbb0e97a249eb631d859085fe48f1631f9d44c8f81ca4712202f668d7f4b5');
 assert.equal(sha256(candidate.slice(uniqueOffset(candidate,'const pw = await import('))),'4132992c67d645f91fdfe8e2c1b3b4fc031ec6a6f6d63f85747f88b67e4f8cbb');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const variants=Object.entries({baseline:baselinePreflight,candidate:candidatePreflight}).map(([name,preflight])=>({name,execute:new AsyncFunction('fs','path','crypto','pathToFileURL','site','out',preflight+'\n'+stageSource)}));
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'iw-pr1869-range-'));
 try {
const goodStage = {
  layout: 'range', lightmap: true, signage: true, targets: 11, pads: 14,
  weaponPads: 7, separation: 2, bots: 0, rosterHidden: true, telemetry: true,
};
const pass = {status: 'passed'};
const failure = match => ({status: 'rejected', match});
const mismatch = failure('Range lightmap asset pair and emitted index disagree');
const absent = failure('Practice Range is missing required baked AO assets and registration');
const incomplete = failure('Incomplete baked range AO pair');
const stageFailure = failure('stage check ');
const cases = [
  {name: 'normal-pair-index-runtime-true', expected: {baseline: pass, candidate: pass}},
  {name: 'pair-present-index-absent-runtime-false-regression', layouts: ['tidewater'], stage: {lightmap: false}, expected: {baseline: pass, candidate: mismatch}},
  {name: 'pair-present-index-absent-runtime-true', layouts: ['tidewater'], expected: {baseline: stageFailure, candidate: mismatch}},
  {name: 'json-only-index-present', pair: ['json'], expected: {baseline: incomplete, candidate: incomplete}},
  {name: 'png-only-index-present', pair: ['png'], expected: {baseline: incomplete, candidate: incomplete}},
  {name: 'json-only-index-absent', pair: ['json'], layouts: [], stage: {lightmap: false}, expected: {baseline: incomplete, candidate: incomplete}},
  {name: 'png-only-index-absent', pair: ['png'], layouts: [], stage: {lightmap: false}, expected: {baseline: incomplete, candidate: incomplete}},
  {name: 'index-advertised-pair-missing', pair: [], expected: {baseline: failure('Emitted Range lightmap index is missing its complete asset pair'), candidate: mismatch}},
  {name: 'normal-range-pair-and-index-both-missing', pair: [], layouts: [], stage: {lightmap: false}, expected: {baseline: pass, candidate: absent}},
  {name: 'normal-pair-index-runtime-false', stage: {lightmap: false}, expected: {baseline: stageFailure, candidate: stageFailure}},
  {name: 'invalid-index-not-array', layouts: null, expected: {baseline: failure('Invalid emitted lightmap index'), candidate: failure('Invalid emitted lightmap index')}},
  {name: 'invalid-index-nonstring', layouts: ['range', 9], expected: {baseline: failure('Invalid emitted lightmap index'), candidate: failure('Invalid emitted lightmap index')}},
  {name: 'manifest-hash-mismatch', badHash: true, expected: {baseline: failure('Build identity mismatch'), candidate: failure('Build identity mismatch')}},
  {name: 'range-layer-missing', missingRangeLayer: true, expected: {baseline: failure('Build does not include the practice range layer'), candidate: failure('Build does not include the practice range layer')}},
  ...Object.entries({layout: 'tidewater', signage: false, targets: 10, pads: 13, weaponPads: 6, separation: 1.89, bots: 1, rosterHidden: false, telemetry: false})
    .map(([key, value]) => ({name: `preserved-stage-rejection-${key}`, stage: {[key]: value}, expected: {baseline: stageFailure, candidate: stageFailure}})),
  {name: 'preserved-stage-separation-boundary', stage: {separation: 1.9}, expected: {baseline: pass, candidate: pass}},
];


 assert.equal(cases.length,24);
for (const testCase of cases) await t.test(testCase.name, async () => {
  const site = path.join(temporary, testCase.name);
  fs.mkdirSync(path.join(site, 'src/world'), {recursive: true});
  fs.mkdirSync(path.join(site, 'assets/lightmaps'), {recursive: true});
  fs.writeFileSync(path.join(site, 'package.json'), '{"type":"module"}\n');
  const pair = testCase.pair ?? ['json', 'png'];
  // Small isolated file fixtures, not copies of game assets or production builds.
  const contents = {
    json: Buffer.from('{"fixture":"Range checker contract only"}\n'),
    png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  };
  const artifacts = {};
  for (const extension of pair) {
    const name = `assets/lightmaps/range.${extension}`;
    fs.writeFileSync(path.join(site, name), contents[extension]);
    artifacts[name] = sha256(contents[extension]);
  }
  const layouts = Object.hasOwn(testCase, 'layouts') ? testCase.layouts : ['range'];
  const index = `export const LIGHTMAP_LAYOUTS = ${JSON.stringify(layouts)};\n`;
  fs.writeFileSync(path.join(site, 'src/world/lightmap-assets.js'), index);
  artifacts['src/world/lightmap-assets.js'] = sha256(index);
  const manifest = {
    artifacts,
    contentHash: testCase.badHash ? 'intentionally-mismatched' : sha256(JSON.stringify(artifacts)),
    files: testCase.missingRangeLayer ? {} : {'practice-range/runtime/range.mjs': 'isolated-contract-fixture'},
  };
  fs.writeFileSync(path.join(site, 'inkwave-build.json'), JSON.stringify(manifest));
  const stage = {...goodStage, ...testCase.stage};
  const receipt = {case: testCase.name, pairCount: pair.length, layouts, runtimeLightmap: stage.lightmap, results: {}};
  for (const variant of variants) {
    let actual;
    try {
      await variant.execute(fs, path, crypto, pathToFileURL, site, {checks: {stage}});
      actual = {status: 'passed'};
    } catch (error) {
      actual = {status: 'rejected', message: error.message};
    }
    const expected = testCase.expected[variant.name];
    assert.equal(actual.status, expected.status, `${testCase.name}: ${variant.name}`);
    if (expected.match) assert.ok(actual.message.includes(expected.match), `${testCase.name}: ${variant.name}: ${actual.message}`);
    receipt.results[variant.name] = actual;
  }
  assert.equal(Object.keys(receipt.results).length, 2);
});

 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});

// Only three reviewed historical and workflow QA inputs expand the closed control set.
test('historical and workflow fixture admission names exactly three QA inputs and retains production exclusions',()=>{
 const added=['scripts/fixtures/inkwave-historical-05eb-1862-leaves.json','scripts/tests/inkwave-31pr-paint-source-pair.test.mjs','scripts/tests/continuous-browser-video.test.mjs'];
 const historical=CONTROL_PATHS.filter(name=>!added.includes(name));
 assert.equal(historical.length,21);
 for(const name of added)assert.equal(CONTROL_PATHS.filter(value=>value===name).length,1);
 const reviewed=[row('patches/network-replication/adapter.mjs'),row('patches/splatoon3/adapter.mjs'),...historical.map(name=>row(name)),row(added[1]),row(added[2])];
 const actual=[...reviewed.map(value=>added.includes(value.path)?{...value,sha:'b'.repeat(40)}:{...value}),row(added[0],'c'.repeat(40))];
 assertReviewedTree(reviewed,actual);
 for(const rel of [...PAINT_PATHS,'patches/splatoon3/adapter.mjs','scripts/lib/inkwave-main-ink-baseline.mjs','scripts/lib/inkwave-character-pose-baseline.mjs','scripts/fixtures/unreviewed-epoch.json','scripts/tests/unreviewed-epoch.test.mjs']){
  const changed=actual.map(value=>({...value})),found=changed.find(value=>value.path===rel);
  if(found)found.sha='d'.repeat(40);else changed.push(row(rel,'d'.repeat(40)));
  assert.throws(()=>assertReviewedTree(reviewed,changed),/unreviewed tree delta/,rel);
 }
 for(const rel of added){
  assert.throws(()=>assertReviewedTree(reviewed,actual.filter(value=>value.path!==rel)),/every closed QA control must exist/);
  assert.throws(()=>assertReviewedTree(reviewed,actual.map(value=>value.path===rel?{...value,mode:'100755'}:value)),/control mode/);
  assert.throws(()=>assertReviewedTree(reviewed,actual.map(value=>value.path===rel?{...value,type:'commit'}:value)));
 }
});

const PREVIOUS_CONTROL_PATHS=[".github/workflows/inkwave-projectile-visuals.yml", "patches/network-replication/tests/issue-1033-handoff-hit.test.mjs", "patches/splatoon3/tests/ranked-rainmaker-peer-compat.qa.mjs", "scripts/benchmark-aplus-verification.mjs", "scripts/check-inkwave-idle-resources.mjs", "scripts/check-inkwave-projectile-visuals.mjs", "scripts/check-inkwave-range.mjs", "scripts/lib/inkwave-pr1869-current-pair.mjs", "scripts/fixtures/inkwave-historical-05eb-1862-leaves.json", "scripts/tests/continuous-browser-video.test.mjs", "scripts/tests/inkwave-23pr-paint-source-pair.test.mjs", "scripts/tests/inkwave-31pr-paint-source-pair.test.mjs", "scripts/tests/inkwave-ci-source-admission.test.mjs", "scripts/tests/inkwave-pr1869-current-pair.test.mjs", "scripts/tests/inkwave-pr1869-workflow-route.test.mjs", "scripts/tests/inkwave-reef-splash-workflow-registration.test.mjs", "scripts/tests/inkwave-results-work-progress.test.mjs", "scripts/tests/inkwave-streamed-music-diagnostics.test.mjs", "scripts/verify-inkwave-pr1869-current-pair.mjs"];
const NAV_RESPONSIVE_CONTROL_PATHS=["scripts/check-inkwave-local-references.mjs", "scripts/tests/inkwave-local-references.test.mjs", "scripts/check-inkwave-responsive-core.mjs", "scripts/lib/inkwave-responsive-diagnostics.mjs", "scripts/tests/inkwave-responsive-diagnostics.test.mjs"];
test('navigation repair and responsive diagnostics add only five exact controls to the prior nineteen',()=>{
 assert.deepEqual([...CONTROL_PATHS].sort(),[...PREVIOUS_CONTROL_PATHS,...NAV_RESPONSIVE_CONTROL_PATHS].sort());
 const reviewed=[...CONTROL_PATHS.map(name=>row(name)),row('inkwave-public/src/game/nav.js'),row('inkwave-public/src/ui/menus.js')];
 const actual=reviewed.map(value=>NAV_RESPONSIVE_CONTROL_PATHS.includes(value.path)?{...value,sha:'b'.repeat(40)}:{...value});
 assertReviewedTree(reviewed,actual);
 for(const rel of ['scripts/tests/unreviewed-responsive.test.mjs','scripts/lib/unreviewed-responsive.mjs','scripts/fixtures/unreviewed-responsive.json','inkwave-public/src/game/nav.js','inkwave-public/src/ui/menus.js','.github/workflows/inkwave-update.yml',...PAINT_PATHS]){
  const changed=actual.map(value=>({...value})),found=changed.find(value=>value.path===rel);
  if(found)found.sha='c'.repeat(40);else changed.push(row(rel,'c'.repeat(40)));
  assert.throws(()=>assertReviewedTree(reviewed,changed),/unreviewed tree delta/,rel);
 }
 for(const rel of NAV_RESPONSIVE_CONTROL_PATHS){
  assert.throws(()=>assertReviewedTree(reviewed,actual.filter(value=>value.path!==rel)),/every closed QA control must exist/);
  for(const mutate of [x=>({...x,mode:'100755'}),x=>({...x,type:'commit'})])assert.throws(()=>assertReviewedTree(reviewed,actual.map(value=>value.path===rel?mutate(value):value)));
 }
});
test('five new controls bind actual candidate file bytes as mandatory physical checkout inputs',()=>withRepo(({root,g,put})=>{
 const expected=new Map();
 for(const rel of CONTROL_PATHS){
  const bytes=fs.readFileSync(new URL('../../'+rel,import.meta.url));
  assert(bytes.length>0,rel+' must contain candidate bytes');put(rel,bytes);
  expected.set(rel,crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'));
 }
 g('add','.');g('commit','-qm','actual twenty-four control bytes');const commit=g('rev-parse','HEAD'),clean=readCheckout(root,commit);
 for(const rel of NAV_RESPONSIVE_CONTROL_PATHS){
  assert.equal(clean.rows.find(value=>value.path===rel).sha,expected.get(rel));
  assert(clean.inputs.some(value=>value.path===rel));
  const file=path.join(root,rel),bytes=fs.readFileSync(file);
  try{fs.appendFileSync(file,'\n// uncommitted mutation\n');assert.throws(()=>readCheckout(root,commit));}finally{fs.writeFileSync(file,bytes);}
  try{g('update-index','--skip-worktree',rel);fs.unlinkSync(file);assert.throws(()=>readCheckout(root,commit),/consumed source cannot be sparse/);}finally{fs.writeFileSync(file,bytes);g('update-index','--no-skip-worktree',rel);}
 }
 assert.deepEqual(readCheckout(root,commit),clean);
}));

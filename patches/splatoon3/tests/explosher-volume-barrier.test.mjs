import path from 'node:path';import {pathToFileURL} from 'node:url';
const sourceRoot=path.resolve(process.env.EXPLOSHER_SOURCE_ROOT||'.');
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {awaitExistingExplosherVolumes as run,adaptExplosherControlledBoot as adapt} from '../../../scripts/lib/inkwave-explosher-volume-barrier.mjs';
const rng=()=>({algorithm:'xorshift32',seed:1,word:1,draws:0,resets:1,identityPreserved:true});
const wait=(G,game,t=20000)=>run(G,game,t,rng);
function setup(){const scene={},root={parent:scene},game={fxHooks:{time:0,stamp:0,sprayT:0,featherT:5}},assets=new Map(['roller','shooter'].map(k=>[k,{patterns:[{},{}],warmFrames:2,showAll:true}])),engine={root,isInkVolumes:true,disposed:false,assets};const fx={root,inkVolumeReady:Promise.resolve(true),inkVolumes:engine};return{G:{fx,scene,game,time:0},game};}
test('existing resolved readiness accepted without writing native state',async()=>{const{G,game}=setup();Object.freeze(game.fxHooks);Object.freeze(game);Object.freeze(G.fx);Object.freeze(G);const r=await wait(G,game);assert.equal(r.controlledInitialCondition,true);assert.equal(r.naturalBootAccepted,false);assert.deepEqual(r.before,r.after);});
test('waits already-started promise before admitting subsequent synchronous attract',async()=>{const{G,game}=setup();let resolve;G.fx.inkVolumeReady=new Promise(r=>resolve=r);let admitted=false;const p=wait(G,game).then(()=>{admitted=true});await Promise.resolve();assert.equal(admitted,false);resolve(true);await p;assert.equal(admitted,true);});
for(const [name,change]of Object.entries({missingPromise:({G})=>delete G.fx.inkVolumeReady,nullResolution:({G})=>G.fx.inkVolumeReady=Promise.resolve(null),rejection:({G})=>G.fx.inkVolumeReady=Promise.reject(Error('source reject')),disposed:({G})=>G.fx._inkVolumeDisposed=true,error:({G})=>G.fx.inkVolumeError='load failure',missingAsset:({G})=>G.fx.inkVolumes.assets.delete('shooter'),extraAsset:({G})=>G.fx.inkVolumes.assets.set('other',{}),wrongRoot:({G})=>G.fx.inkVolumes.root={},disposedEngine:({G})=>G.fx.inkVolumes.disposed=true,invalidWarm:({G})=>G.fx.inkVolumes.assets.get('roller').warmFrames=NaN,nonfinite:({game})=>game.fxHooks.sprayT=NaN}))test('reject '+name,async()=>{const s=setup();change(s);await assert.rejects(wait(s.G,s.game));});
for(const [name,change]of Object.entries({fx:({G})=>G.fx={...G.fx},promise:({G})=>G.fx.inkVolumeReady=Promise.resolve(true),engine:({G})=>G.fx.inkVolumes={...G.fx.inkVolumes},root:({G})=>G.fx.root={},scene:({G})=>G.scene={},hooks:({game})=>game.fxHooks={...game.fxHooks},clock:({G})=>G.time=1,timer:({game})=>game.fxHooks.sprayT=2}))test('reject pending '+name+' change',async()=>{const s=setup();let resolve;s.G.fx.inkVolumeReady=new Promise(r=>resolve=r);const p=wait(s.G,s.game);change(s);resolve(true);await assert.rejects(p);});
test('bounded pending load rejects without cancelling or resolving it',async()=>{const s=setup();s.G.fx.inkVolumeReady=new Promise(()=>{});await assert.rejects(wait(s.G,s.game,2),/timeout/);});
test('exact source transformation affects only initial async boot call, other sync callers unchanged',()=>{const s=fs.readFileSync(path.join(sourceRoot,'inkwave-public/src/main.js'),'utf8'),a='    this._bindEvents();\n    this._startAttract();',x=adapt(s);assert.equal(x.split('    this._startAttract();').length,s.split('    this._startAttract();').length);assert.equal(x.slice(x.indexOf('  _startAttract() {')),s.slice(s.indexOf('  _startAttract() {')));assert.equal((x.match(/globalThis.__inkwaveExplosherControlledStartup/g)||[]).length,1);assert.equal(x.slice(0,x.indexOf('    this._bindEvents();')),s.slice(0,s.indexOf(a)));assert.throws(()=>adapt(s.replace(a,'')));assert.throws(()=>adapt(s+'\n'+a));assert.throws(()=>adapt(s.replace('  async boot() {','  boot() {')));assert(!awaitExistingImport(x));function awaitExistingImport(code){return code.slice(code.indexOf('globalThis.__inkwaveExplosherControlledStartup'),code.indexOf('    this._startAttract();')).includes('import(');}});

test('reject warmed first-boot asset and anchor relocated to later method',async()=>{const {G,game}=setup();G.fx.inkVolumes.assets.get('roller').warmFrames=1;await assert.rejects(wait(G,game));const source=fs.readFileSync(path.join(sourceRoot,'inkwave-public/src/main.js'),'utf8'),anchor='    this._bindEvents();\n    this._startAttract();';assert.throws(()=>adapt(source.replace(anchor,'')+'\n'+anchor),/outside/);});
test('record legitimate RNG advance while only awaiting existing registration',async()=>{const {G,game}=setup();let n=0;const r=await run(G,game,100,()=>({...rng(),draws:n++,word:n}));assert.equal(r.rngBefore.draws,0);assert.equal(r.rngAfter.draws,1);assert.deepEqual(r.before,r.after);});
test('missing or invalid RNG reader fails closed',async()=>{const {G,game}=setup();await assert.rejects(run(G,game,100,null));await assert.rejects(run(G,game,100,()=>({...rng(),word:NaN})));});

test('controlled pair rejects retained timer/post RNG/asset drift but retains legitimate pre RNG difference',async()=>{
 const {requireControlledStartupPair:pair}=await import('../../../scripts/lib/inkwave-explosher-volume-barrier.mjs');const s=setup(),a=await wait(s.G,s.game),b=structuredClone(a);b.rngBefore.draws=96;assert.equal(pair(a,b).matched,true);
 for(const [group,key,value]of [['before','featherT',6],['after','sprayT',.3],['rngAfter','word',2]]){const x=structuredClone(b);x[group][key]=value;assert.throws(()=>pair(a,x));}
 for(const bad of [null,NaN,undefined]){const n=structuredClone(a);n.after.sprayT=bad;assert.throws(()=>pair(n,n));}
 const bothChanged=structuredClone(a);bothChanged.after.sprayT+=1;assert.throws(()=>pair(bothChanged,bothChanged),/within lane/);
 const x=structuredClone(b);x.assets[0].warmFrames=1;assert.throws(()=>pair(a,x));assert.throws(()=>pair(a,{...b,ownerVerified:false}));
});

// Use the actual production adapter chain, not a hand-authored composed fixture.
test('actual composed main preserves synchronous attract and accepts only its verified boot boundary',async()=>{
 const {adaptBuildSource}=await import(pathToFileURL(path.join(sourceRoot,'scripts/inkwave-source-composition.mjs')));
 const raw=fs.readFileSync(path.join(sourceRoot,'inkwave-public/src/main.js'),'utf8');
 const source=adaptBuildSource('src/main.js',raw),end='\n  async _buildWorld(map, flow = null) {';
 assert(source.includes(end));const result=adapt(source);
 assert.equal(result.slice(result.indexOf(end)),source.slice(source.indexOf(end)));
 assert.equal((result.match(/globalThis.__inkwaveExplosherControlledStartup/g)||[]).length,1);
 assert.equal(result.split('    this._startAttract();').length,source.split('    this._startAttract();').length);
 assert.throws(()=>adapt(source.replace(end,'\n  async _buildWorld(map, unknown = null) {')));
 assert.throws(()=>adapt(source+'\n  async _buildWorld(map) {'));
 assert.throws(()=>adapt(source+'\n'+end));
 const anchor='    this._bindEvents();\n    this._startAttract();';
 assert.throws(()=>adapt(source.replace(anchor,'')+'\n'+anchor),/outside/);
});

test('actual native loading adapter is mandatory before controlled emitted insertion',async()=>{
 const {adaptBuildSource}=await import(pathToFileURL(path.join(sourceRoot,'scripts/inkwave-source-composition.mjs')));
 const {adaptCompiledMain}=await import(pathToFileURL(path.join(sourceRoot,'patches/loading-cache/adapter.mjs')));
 const {parse}=await import(pathToFileURL(path.join(sourceRoot,'patches/loading-cache/vendor/acorn.mjs')));
 const {adaptExplosherControlledCompiledBoot:insert}=await import('../../../scripts/lib/inkwave-explosher-volume-barrier.mjs');
 const raw=fs.readFileSync(path.join(sourceRoot,'inkwave-public/src/main.js'),'utf8'),composed=adaptBuildSource('src/main.js',raw),native=adaptCompiledMain(composed).code;
 assert.notEqual(native,composed);assert.throws(()=>insert(composed,parse),/once-adapted/);
 assert.throws(()=>adaptCompiledMain(adapt(composed)),/topology/);
 const controlled=insert(native,parse);assert.equal((controlled.match(/globalThis.__inkwaveExplosherControlledStartup =/g)||[]).length,1);
 assert.equal(controlled.slice(controlled.indexOf('  _startAttract() {')),native.slice(native.indexOf('  _startAttract() {')));
 assert.throws(()=>insert(controlled,parse),/once-adapted/);
 assert.throws(()=>insert(native.replace("from './core/ctx.js'","from './wrong.js'"),parse),/G import/);
 assert.throws(()=>insert(native.replace('    this._startAttract();','    this._startAttract();this._startAttract();'),parse),/topology/);
 assert.throws(()=>insert(native.replace('    this._bindEvents();',''),parse),/topology/);
 const compiler=fs.readFileSync(new URL('../../../scripts/compile-inkwave-explosher-controlled-main.mjs',import.meta.url),'utf8');
 assert(compiler.includes('original=adaptCompiledMain(minified).code,transformed=adaptExplosherControlledCompiledBoot(original,parse)'));
 assert(compiler.includes('build.artifacts[p]!==originalSha'));assert(compiler.includes('hash(fs.readFileSync(path.join(site,p)))!==originalSha'));
});

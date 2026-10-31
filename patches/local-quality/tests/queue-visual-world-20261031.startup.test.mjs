import test from 'node:test';import assert from 'node:assert/strict';
import {composed,declaration} from './queue-visual-world-20261031.helper.mjs';
import {nativeFixture} from '../../native-stages/tests/fixture.mjs';
import {ShaderLib as shaderTemplates} from '../../../inkwave-public/vendor/three/build/three.module.js';
const source=composed('src/main.js');
const helper=declaration(source,'Game','_prepareLegacyPropRuntime').source.replace("import('./world/prop-packs.js')",'load()');
function make(load){return new (new Function('load','console','return class {'+helper+'}')(load,{error(){}}))();}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('native branch executes without evaluating or preparing any legacy prop module',async()=>{
 const method=declaration(source,'Game','_buildWorld').source;const end=method.indexOf('    this._nativeAbort?.abort();');assert(end>0);
 const partial=method.slice(0,end)+'\n  }';let prepared=0,native=0;const Game=new Function('G','UNAVAILABLE_NATIVE_STAGES','nativeStageEnabled','NATIVE_IDS','buildNativeWorld','return class {'+partial+'}')({scene:{}},[],true,['native-a'],async()=>{native++;});
 const game=new Game();game._prepareLegacyPropRuntime=async()=>{prepared++;return true;};await game._buildWorld({id:'native-a'});assert.equal(native,1);assert.equal(prepared,0);
 const init=source.slice(0,source.indexOf('  async _prepareLegacyPropRuntime('));assert(!init.includes("import('./world/prop-packs.js')"));
});

test('legacy runtime singleflights overlapping loads and stale builds never publish it',async()=>{
 let imports=0;const d=deferred(),prepared=[];const game=make(()=>{imports++;return d.promise;});let firstCurrent=true;
 const first=game._prepareLegacyPropRuntime('halyard',()=>firstCurrent);firstCurrent=false;const second=game._prepareLegacyPropRuntime('cargo',()=>true);
 class Kit{}d.resolve({PropKit:Kit,preparePropPacks:async(id,current)=>{prepared.push(id);return current();}});
 assert.equal(await first,false);assert.equal(await second,true);assert.equal(imports,1);assert.deepEqual(prepared,['cargo']);assert.equal(game.PropKit,Kit);
 assert.equal(await game._prepareLegacyPropRuntime('tidewater',()=>true),true);assert.equal(imports,1);assert.deepEqual(prepared,['cargo','tidewater']);
});

test('failed legacy import preserves no-props fallback and retries on the next request',async()=>{
 let n=0;class Kit{}const game=make(async()=>{if(++n===1)throw Error('temporary');return{PropKit:Kit,preparePropPacks:async()=>true};});
 assert.equal(await game._prepareLegacyPropRuntime('cargo',()=>true),true);assert.equal(game.PropKit,null);assert.equal(game._legacyPropRuntime,null);
 assert.equal(await game._prepareLegacyPropRuntime('cargo',()=>true),true);assert.equal(game.PropKit,Kit);assert.equal(n,2);
});

test('main already caches validated lightmap metadata across A B A revisits',async()=>{
 const methods=['_prefetchLightmapMetadata','_loadLightmap'].map(k=>declaration(source,'Game',k).source).join('\n');const jsonCalls=[];
 const THREE={NoColorSpace:0,LinearMipmapLinearFilter:1,LinearFilter:2,TextureLoader:class{async loadAsync(){return{};}}};
 const Game=new Function('THREE','fetch','console','LIGHTMAP_LAYOUTS','return class {'+methods+'}')(THREE,async url=>{jsonCalls.push(url);return{json:async()=>({hash:'valid',ppm:4,size:1024})};},{warn(){}},['cargo','halyard']);
 const game=new Game();for(const id of ['cargo','halyard','cargo']){const level={faces:[],layoutLightmap(){this.layoutHash='valid';}};assert(await game._loadLightmap(level,id,game._prefetchLightmapMetadata(id)));}assert.equal(jsonCalls.length,2);assert.equal(jsonCalls.filter(x=>x.includes('cargo')).length,1);
});

test('existing main retains selective packs, empty-grate omission and marina scan fast paths',()=>{
 assert.match(source,/if \(level\.faces\.some\(f => level\.blocks\[f\.block\]\?\.grate\)\)/);
 assert.match(source,/this\.grateMesh = this\.grateMat = null/);
 const env=composed('src/world/environment.js');assert.match(env,/const runs = marina \? \[\] : this\._boundaryRuns\(\)/);assert.match(env,/e\[3\] === 0/);
 const rig=composed('src/game/motion/squid-rig.js');assert.match(rig,/if\s*\(base\.boundingBox\s*==\s*null\)\s*base\.computeBoundingBox\(\)/);
});

test('only native autostart skips mural creation while all paths still join the wave',async()=>{
 const a=source.indexOf('const waveController ='),b=source.indexOf('    await this._buildWorld(map);',a);
 const body=source.slice(a,b).replace("await import('./world/texlib.js')",'await loadTexlib()');
 for(const [query,nativeEnabled,map,expected] of [['autostart=90',true,{id:'native-a'},0],['',true,{id:'native-a'},1],['autostart=90',false,{id:'native-a'},1],['autostart=90',true,{id:'cargo'},1],['autostart=90',true,{id:'alias',layout:'native-a'},0]]){
  let calls=0,finished=false,aborted=0;const wave=deferred(),texture={userData:{}},texlib={dispose(){throw Error('unexpected cleanup');}},game={};
  const boot=new Function('params','nativeStageEnabled','NATIVE_IDS','envMod','createMuralTexture','loadTexlib','stagePackFor','STAGE_SURFACES','G','q','return async function(map){'+body+'return waveData;}')
   (new URLSearchParams(query),nativeEnabled,['native-a'],{prewarmWaveTexture({signal}){signal.addEventListener('abort',()=>aborted++);return wave.promise;}},async()=>{calls++;return texture;},async()=>({createTextureLibrary:async()=>texlib}),()=>null,[],{renderer:{}},{paintAtlas:2048});
  const pending=boot.call(game,map).then(v=>{finished=true;return v;});await Promise.resolve();await Promise.resolve();assert.equal(finished,false);wave.resolve('owned-wave-bytes');
  assert.equal(await pending,'owned-wave-bytes');assert.equal(calls,expected);assert.equal(game.murals,expected?texture:null);assert.equal(game.texlib,texlib);assert.equal(aborted,0);
 }
 let aborted=0,disposed=0;const failure=Error('mural failed'),game={};
 const boot=new Function('params','nativeStageEnabled','NATIVE_IDS','envMod','createMuralTexture','loadTexlib','stagePackFor','STAGE_SURFACES','G','q','return async function(map){'+body+'return waveData;}')
  (new URLSearchParams(),true,['native-a'],{prewarmWaveTexture({signal}){signal.addEventListener('abort',()=>aborted++);return Promise.resolve('wave');}},async()=>{throw failure;},async()=>({createTextureLibrary:async()=>({dispose(){disposed++;}})}),()=>null,[],{renderer:{}},{paintAtlas:2048});
 await assert.rejects(boot.call(game,{id:'cargo'}),e=>e===failure);assert.equal(aborted,1);assert.equal(disposed,1);assert.equal(game.texlib,null);
});

test('lazy mural ownership singleflights, discards stale completion once, and retries failed creation',async()=>{
 const method=declaration(source,'Game','_prepareLegacyMurals').source;const create=load=>new(new Function('createMuralTexture','return class {'+method+'}')(load))();
 let calls=0,disposals=0;const d=deferred(),texture={dispose(){disposals++;}},game=create(()=>{calls++;return d.promise;});let oldCurrent=true;
 const old=game._prepareLegacyMurals('halyard',()=>oldCurrent);oldCurrent=false;const active=game._prepareLegacyMurals('cargo',()=>true);d.resolve(texture);
 assert.equal(await old,false);assert.equal(await active,true);assert.equal(calls,1);assert.equal(game.murals,texture);assert.equal(disposals,0);assert.equal(game._legacyMuralTask,null);
 assert.equal(await game._prepareLegacyMurals('tidewater',()=>true),true);assert.equal(calls,1);
 const cancelled=deferred(),stale=create(()=>cancelled.promise);let current=true;
 const p=stale._prepareLegacyMurals('halyard',()=>current),p2=stale._prepareLegacyMurals('cargo',()=>current);current=false;cancelled.resolve(texture);
 assert.equal(await p,false);assert.equal(await p2,false);assert.equal(disposals,1);assert.equal(stale.murals,undefined);assert.equal(stale._legacyMuralTask,null);
 const error=Error('font/canvas failure');let attempts=0;const retry=create(async()=>{if(++attempts===1)throw error;return texture;});
 await assert.rejects(retry._prepareLegacyMurals('cargo',()=>true),e=>e===error);assert.equal(retry._legacyMuralTask,null);
 assert.equal(await retry._prepareLegacyMurals('cargo',()=>true),true);assert.equal(attempts,2);assert.equal(disposals,1);
 const skipped=create(()=>{throw Error('stale request must not acquire');});assert.equal(await skipped._prepareLegacyMurals('cargo',()=>false),false);
});

test('actual native shader keeps mural reads unreachable with a null deferred texture',async()=>{
 const f=await nativeFixture({renderOnly:true}),{THREE}=f,paint={texture:new THREE.Texture(),size:256};
 const material=[new THREE.Texture(),null].map(m=>f.nativeInkMaterial(paint,m));
 const shaders=material.map(m=>{const shader={uniforms:{},vertexShader:shaderTemplates.physical.vertexShader,fragmentShader:shaderTemplates.physical.fragmentShader};m.onBeforeCompile(shader);return shader;});
 assert.equal(shaders[0].vertexShader,shaders[1].vertexShader);assert.equal(shaders[0].fragmentShader,shaders[1].fragmentShader);assert.deepEqual(material[0].defines,material[1].defines);
 assert.match(shaders[1].fragmentShader,/if \(\(-1\.0\) > -0\.5\)/);assert.equal(shaders[1].uniforms.uMural.value,null);
 const legacy=composed('src/world/levelMaterial.js');assert.match(legacy,/if \(vFaceFlags\.z > -0\.5\)/);assert.match(source,/await this\._prepareLegacyMurals\(layoutId, worldCurrent\)/);
 material.forEach(m=>m.dispose());paint.texture.dispose();
});

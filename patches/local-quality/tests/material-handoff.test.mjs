import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';

import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SITE=process.env.INKWAVE_MATERIAL_HANDOFF_SITE?path.resolve(process.env.INKWAVE_MATERIAL_HANDOFF_SITE):null;
const {beginMaterialHandoff,installMaterialHandoffCancellation,MATERIAL_HANDOFF_MS}=await import(pathToFileURL(path.join(SITE||ROOT,'patches/local-quality/material-handoff.mjs')));
const CONTROL=process.env.INKWAVE_MATERIAL_HANDOFF_RUNTIME_CONTROL_SITE;
function runtimeSource(rel){return SITE?fs.readFileSync(path.join(CONTROL||SITE,rel),'utf8'):adaptBuildSource(rel,fs.readFileSync(path.join(ROOT,'inkwave-public',rel),'utf8'));}
function aliasScope(code,bindings){
 const out={...bindings};
 if('DEV_STAGE' in bindings){const m=code.match(/mannequins:\s*([A-Za-z_$][\w$]*)/);assert(m,'native dev-stage binding');out[m[1]]=bindings.DEV_STAGE;}
 for(const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g))for(const spec of match[1].split(',')){const [name,alias]=spec.trim().split(/\s+as\s+/);if(name in bindings)out[alias||name]=bindings[name];}
 for(const match of code.matchAll(/import\s*\*\s*as\s+(\w+)\s*from\s*["']three["']/g))out[match[1]]=T;
 return out;
}
function attractMethod(code){const a=code.search(/\b_startAttract\(\)\s*\{/),b=code.search(/\b_attractShot\(\)\s*\{/);assert(a>=0&&b>a);return code.slice(a,b).trim();}

const context=vm.createContext({console}),mods=new Map();
function load(file){if(mods.has(file))return mods.get(file);let s=fs.readFileSync(file,'utf8');if(file.endsWith('/three.module.js'))s+='\nexport {WebGLPrograms};';const m=new vm.SourceTextModule(s,{context,identifier:file});mods.set(file,m);return m;}
const mod=load(path.join(ROOT,'inkwave-public/vendor/three/build/three.module.js'));
await mod.link((s,m)=>load(path.resolve(path.dirname(m.identifier),s)));await mod.evaluate();const T=mod.namespace;
function rig(){
 const counts={linked:0,deleted:0,uniforms:0,events:0},properties=new WeakMap(),timers=new Map(),listeners=new Map();let serial=0;
 const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,ACTIVE_UNIFORMS:35718,ACTIVE_ATTRIBUTES:35721,
  createShader:()=>({}),createProgram:()=>({}),shaderSource(){},compileShader(){},attachShader(){},bindAttribLocation(){},linkProgram(){counts.linked++;},deleteShader(){},deleteProgram(){counts.deleted++;},getProgramParameter(_p,n){if(n===35718){counts.uniforms++;return 0;}if(n===35721)return 0;return true;}};
 const renderer={getContext:()=>gl,debug:{checkShaderErrors:false},getRenderTarget:()=>({texture:{}}),state:{buffers:{depth:{getReversed:()=>false}}},shadowMap:{enabled:false,type:T.PCFShadowMap},outputColorSpace:T.SRGBColorSpace,toneMapping:T.NeutralToneMapping,
  domElement:{addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);}},render(){return 'rendered';},compile(){return 'compiled';},compileAsync(){return Promise.resolve('compiled');}};
 const cache=T.WebGLPrograms(renderer,{get:x=>x},{has:()=>false},{precision:'highp',getMaxPrecision:x=>x,logarithmicDepthBuffer:false},{releaseStatesOfProgram(){}},{numPlanes:0,numIntersection:0});
 const lights=Object.fromEntries(['sun','directional','point','spot','spotLightMap','rectArea','hemi','sunShadowMap','directionalShadowMap','pointShadowMap','spotShadowMap'].map(k=>[k,[]]));lights.numSpotLightShadowsWithMaps=0;lights.numLightProbes=0;
 const scene=new T.Scene(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());
 const acquire=material=>{
  let programs=properties.get(material);
  if(!programs){properties.set(material,programs=new Map());const dispose=()=>{material.removeEventListener('dispose',dispose);for(const p of programs.values())cache.releaseProgram(p);if(material.isShaderMaterial)cache.releaseShaderCache(material);properties.delete(material);};material.addEventListener('dispose',dispose);}
  const params=cache.getParameters(material,lights,[],scene,mesh,[]),key=cache.getProgramCacheKey(params);let program=programs.get(key);if(!program){program=cache.acquireProgram(params,key);programs.set(key,program);}return program;
 };
 const material=()=>{const m=new T.MeshBasicMaterial();m.addEventListener('dispose',()=>counts.events++);return m;};
 const match=(...mats)=>({actors:mats.map(m=>({character:{mats:{skin:m},_ownMats:[],matsD:[],weapons:{},root:{traverse:fn=>fn({material:m})}}}))});
 const env={console:{warn(){}},setTimeout(fn,ms){assert.equal(ms,MATERIAL_HANDOFF_MS);const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 const game={};return {counts,cache,renderer,material,match,acquire,game,env,timers,listeners,begin:m=>beginMaterialHandoff(game,m,renderer,env)};
}
function pending(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('native Three baseline destroys program and repeats first-use uniform reflection',()=>{
 const h=rig(),a=h.material(),b=h.material(),p=h.acquire(a);p.getUniforms();a.dispose();const q=h.acquire(b);q.getUniforms();assert.notEqual(p,q);assert.deepEqual(h.counts,{linked:2,deleted:1,uniforms:2,events:1});b.dispose();
});
test('distinct owned materials preserve native Three program and cached uniforms until replacement acquires it',async()=>{
 const h=rig(),a=h.material(),b=h.material(),p=h.acquire(a);p.getUniforms();const hold=h.begin(h.match(a));let gameplayDisposed=0;
 hold.dispose(()=>{gameplayDisposed++;a.dispose();});assert.equal(gameplayDisposed,1);assert.equal(hold.retained,1);assert.equal(h.counts.events,0);
 hold.setup(()=>{},()=>h.match(b));const wait=pending();assert.equal(hold.warm(()=>wait.promise),wait.promise);
 const q=h.acquire(b);assert.equal(p,q);q.getUniforms();assert.equal(p.usedTimes,2);wait.resolve();await flush();
 assert.deepEqual(h.counts,{linked:1,deleted:0,uniforms:1,events:1});assert.equal(p.usedTimes,1);assert.equal(h.game._materialHandoff,null);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);b.dispose();assert.equal(h.counts.deleted,1);
});
test('same material object is released before replacement warm and not disposed again on settle',async()=>{
 const h=rig(),a=h.material(),old=h.acquire(a);old.getUniforms();const hold=h.begin(h.match(a));hold.dispose(()=>a.dispose());
 hold.setup(()=>{},()=>h.match(a));assert.equal(h.counts.events,1);assert.equal(h.counts.deleted,1);const fresh=h.acquire(a);assert.notEqual(fresh,old);
 hold.warm(()=>Promise.resolve());await flush();assert.equal(h.counts.events,1);assert.equal(fresh.usedTimes,1);fresh.getUniforms();a.dispose();assert.equal(h.counts.events,2);assert.equal(h.counts.deleted,2);
});
test('shared old pair requests only one delayed material disposal and shared unowned material is never intercepted',()=>{
 const h=rig(),a=h.material(),shared=h.material();h.acquire(a);h.acquire(shared);const old=h.match(a,a);for(const actor of old.actors)actor.character.mats.shared=shared;
 const hold=h.begin(old);hold.dispose(()=>{a.dispose();a.dispose();shared.dispose();});assert.equal(h.counts.events,1);hold.release();hold.release();assert.equal(h.counts.events,2);assert.equal(h.counts.deleted,1,'both built-in materials share one native program');assert(!Object.hasOwn(a,'dispose'));
});
for(const boundary of ['render','compile','compileAsync'])test(`setup callback ${boundary} releases before program initialization`,()=>{
 const h=rig(),a=h.material();h.acquire(a);const hold=h.begin(h.match(a));hold.dispose(()=>a.dispose());const native=h.renderer[boundary];
 hold.setup(()=>{h.renderer[boundary]();assert.equal(h.counts.events,1);h.acquire(a);},()=>h.match(a));assert.equal(h.renderer[boundary],native);assert.equal(h.counts.deleted,1);hold.release();assert.equal(h.counts.deleted,1);a.dispose();
});
for(const failure of ['dispose','setup','warm'])test(`${failure} throw retires requested material exactly once`,()=>{
 const h=rig(),a=h.material();h.acquire(a);const hold=h.begin(h.match(a)),error=new Error('expected');
 if(failure==='dispose')assert.throws(()=>hold.dispose(()=>{a.dispose();throw error;}),e=>e===error);
 else {hold.dispose(()=>a.dispose());if(failure==='setup')assert.throws(()=>hold.setup(()=>{throw error;},()=>h.match()),e=>e===error);else assert.throws(()=>hold.warm(()=>{throw error;}),e=>e===error);}
 assert.equal(h.counts.events,1);assert.equal(h.counts.deleted,1);assert.equal(h.timers.size,0);
});
test('warm rejection, timeout and context loss release all resources',async()=>{
 for(const reason of ['reject','timeout','context']){const h=rig(),a=h.material();h.acquire(a);const hold=h.begin(h.match(a));hold.dispose(()=>a.dispose());const wait=pending();hold.warm(()=>wait.promise);
  if(reason==='reject')wait.reject(new Error('expected'));else if(reason==='timeout')[...h.timers.values()][0]();else h.listeners.get('webglcontextlost')();await flush();assert.equal(h.counts.events,1);assert.equal(h.counts.deleted,1);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);wait.resolve();await flush();assert.equal(h.counts.events,1);
 }
});
test('new generation retires old hold; old warm settling cannot clear the newer generation',async()=>{
 const h=rig(),a=h.material(),b=h.material();h.acquire(a);h.acquire(b);const first=h.begin(h.match(a));first.dispose(()=>a.dispose());const wait=pending();first.warm(()=>wait.promise);
 const second=h.begin(h.match(b));second.dispose(()=>b.dispose());assert.equal(h.counts.events,1);wait.resolve();await flush();assert.equal(h.game._materialHandoff,second);assert.equal(second.retained,1);second.release();assert.equal(h.counts.events,2);
});
test('new operation, stage, theme and palette boundaries release before their native work',()=>{
 const h=rig(),events=[];class Game{};for(const k of ['_beginMatchFlow','_buildWorld','_applyNight','_setPalette'])Game.prototype[k]=function(){events.push(k);assert.equal(this._materialHandoff,null);return k;};installMaterialHandoffCancellation(Game);installMaterialHandoffCancellation(Game);
 const game=new Game();for(const k of ['_beginMatchFlow','_buildWorld','_applyNight','_setPalette']){const a=h.material();h.acquire(a);const hold=beginMaterialHandoff(game,h.match(a),h.renderer,h.env);hold.dispose(()=>a.dispose());assert.equal(game[k](),k);}assert.equal(h.counts.events,4);assert.equal(events.length,4);
});
test('actual composed attract ordering tears down gameplay, checks reused material before start, then warms',()=>{
 const code=runtimeSource('src/main.js');
 const h=rig(),mat=h.material(),order=[];h.acquire(mat);const old=h.match(mat);old.dispose=()=>{order.push('dispose gameplay');mat.dispose();};
 class Match{constructor(){this.actors=h.match(mat).actors;}setup(){order.push('setup');}start(){order.push('start');assert.equal(h.counts.events,1,'shared disposed before native state callbacks');}}
 const G={renderer:h.renderer,projectiles:{clear(){}},fx:{clear(){}},paint:{clear(){}}};const Game=vm.runInNewContext('(class {'+attractMethod(code)+'})',aliasScope(code,{G,Match,mapNoBots:()=>false,isRangeMap:()=>false,DEV_STAGE:false,beginMaterialHandoff:(g,m,r)=>beginMaterialHandoff(g,m,r,h.env)}));
 const g=new Game();Object.assign(g,{match:old,rig:{},_attractShot(){},hud:{setVisible(){}},_warmCharacters(){order.push('warm');h.acquire(mat);return Promise.resolve();}});g._startAttract();assert.deepEqual(order,['dispose gameplay','setup','start','warm']);g._materialHandoff?.release();mat.dispose();
});


test('native dispose descriptors are restored immediately and outside disposal satisfies pending obligation',()=>{
 const h=rig(),a=h.material();const native=a.dispose,descriptor=Object.getOwnPropertyDescriptor(a,'dispose');h.acquire(a);const hold=h.begin(h.match(a));
 hold.dispose(()=>a.dispose());assert.equal(a.dispose,native);assert.deepEqual(Object.getOwnPropertyDescriptor(a,'dispose'),descriptor);
 a.dispose();assert.equal(h.counts.events,1);assert.equal(hold.retained,0);assert.equal(h.counts.deleted,1);
 hold.release();assert.equal(h.counts.events,1);assert.equal(a.dispose,native);
});
test('existing own disposal descriptor and exception path are restored exactly',()=>{
 const h=rig(),a=h.material();const native=a.dispose;Object.defineProperty(a,'dispose',{configurable:true,writable:true,enumerable:true,value:function(){return native.call(this);}});const descriptor=Object.getOwnPropertyDescriptor(a,'dispose');h.acquire(a);const hold=h.begin(h.match(a));
 assert.throws(()=>hold.dispose(()=>{a.dispose();throw Error('dispose failure');}),/dispose failure/);assert.deepEqual(Object.getOwnPropertyDescriptor(a,'dispose'),descriptor);assert.equal(h.counts.events,1);
});


test('twenty return cycles keep one warmed native program, then release it completely',async()=>{
 const h=rig();let old=h.material();h.acquire(old).getUniforms();
 for(let i=0;i<20;i++){const next=h.material(),hold=h.begin(h.match(old));hold.dispose(()=>old.dispose());hold.setup(()=>{},()=>h.match(next));h.acquire(next).getUniforms();hold.warm(()=>Promise.resolve());await flush();assert.equal(h.cache.programs.length,1);assert.equal(h.cache.programs[0].usedTimes,1);assert.equal(h.timers.size,0);old=next;}
 assert.equal(h.counts.linked,1);assert.equal(h.counts.uniforms,1);assert.equal(h.counts.events,20);old.dispose();assert.equal(h.cache.programs.length,0);assert.equal(h.counts.deleted,1);
});
test('cancellation during setup releases before later setup callbacks and late warm settlement',async()=>{
 const h=rig(),a=h.material();h.acquire(a);class Game{_beginMatchFlow(){return 'new';}_buildWorld(){}_applyNight(){}_setPalette(){}}installMaterialHandoffCancellation(Game);const g=new Game(),hold=beginMaterialHandoff(g,h.match(a),h.renderer,h.env);hold.dispose(()=>a.dispose());
 hold.setup(()=>{g._beginMatchFlow();assert.equal(h.counts.events,1);h.renderer.render();},()=>h.match(a));const p=pending();hold.warm(()=>p.promise);p.resolve();await flush();assert.equal(h.counts.events,1);assert.equal(g._materialHandoff,null);
});
test('non-extensible materials keep native disposal rather than breaking teardown',()=>{
 const h=rig(),a=h.material();h.acquire(a);Object.preventExtensions(a);const hold=h.begin(h.match(a));hold.dispose(()=>a.dispose());assert.equal(h.counts.events,1);hold.release();assert.equal(h.counts.events,1);
});

for (const draw of [false,true]) test(`composed start callback reuses old material safely, callback render=${draw}`,async()=>{
 const code=runtimeSource('src/main.js');
 const h=rig(),mat=h.material(),other=h.material();const oldProgram=h.acquire(mat),old=h.match(mat);old.dispose=()=>mat.dispose();let fresh;
 class Match{constructor(){this.actors=h.match(other).actors;}setup(){}start(){this.actors=h.match(mat).actors;if(draw){h.renderer.render();assert.equal(h.counts.events,1);fresh=h.acquire(mat);}}}
 const G={renderer:h.renderer,projectiles:{clear(){}},fx:{clear(){}},paint:{clear(){}}};const Game=vm.runInNewContext('(class {'+attractMethod(code)+'})',aliasScope(code,{G,Match,mapNoBots:()=>false,isRangeMap:()=>false,DEV_STAGE:false,beginMaterialHandoff:(g,m,r)=>beginMaterialHandoff(g,m,r,h.env)}));
 const g=new Game();Object.assign(g,{match:old,rig:{},_attractShot(){},hud:{setVisible(){}},_warmCharacters(){assert.equal(h.counts.events,1);fresh=h.acquire(mat);assert.notEqual(fresh,oldProgram);return Promise.resolve();}});
 g._startAttract();await flush();assert.equal(h.counts.events,1);assert.equal(fresh.usedTimes,1);assert.equal(h.cache.programs.length,1);assert.equal(g._materialHandoff??null,null);mat.dispose();assert.equal(h.cache.programs.length,0);
});

test('overflow disposes immediately beyond 512 retained materials and cleans every observer',()=>{
 const h=rig(),mats=Array.from({length:520},()=>h.material());for(const m of mats)h.acquire(m);
 const hold=h.begin(h.match(...mats));hold.dispose(()=>{for(const m of mats)m.dispose();});assert.equal(hold.retained,512);assert.equal(h.counts.events,8);
 hold.release();assert.equal(hold.retained,0);assert.equal(h.counts.events,520);assert.equal(h.cache.programs.length,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
 for(const m of mats)assert.equal(m._listeners.dispose.length,1,'only fixture counter listener remains');
});

function characterWarmFixture(patched){
 const raw=fs.readFileSync(path.join(ROOT,'inkwave-public/src/game/character.js'),'utf8'),code=patched?runtimeSource('src/game/character.js'):raw;
 const a=code.indexOf('async warmAll('),b=code.indexOf('setColor(',a),d=code.indexOf('dispose()',code.indexOf('getHeadPosition(')),e=code.indexOf('get dbg()',d);assert(a>=0&&b>a&&d>=0&&e>d);
 const calls={tiers:0,compile:0,skeleton:0,motion:0,squidEye:0},renderer={compileAsync(){calls.compile++;return Promise.resolve();},getRenderTarget(){return null;},setRenderTarget(){},shadowMap:{enabled:false}},G={renderer,camera:new T.PerspectiveCamera(),scene:new T.Scene(),settings:{quality:'high'},post:{composer:{readBuffer:{}}}};
 const C=vm.runInNewContext('(class {'+code.slice(a,b)+code.slice(d,e)+'})',aliasScope(code,{THREE:T,G,warmHeadgear(c){assert(!c.bones,'material handoff fixture has no head rig');},disposeHeadgear(c){assert(!c.bones,'material handoff fixture has no head rig');},LIVE:new Set(),[code.slice(d).match(/(\w+)\.delete\(this\)/)[1]]:new Set(),farGeometry(){},IDENT:new T.Matrix4(),console}));
 const make=loader=>{const ch=new C();Object.assign(ch,{root:new T.Group(),kid:new T.Group(),_sourceMotionLoader:loader,_sourceMotionDisposed:false,mats:Object.fromEntries(['skin','cloth','hair','eye','fill','squid','squidGhost','glow'].map(k=>[k,new T.MeshBasicMaterial()])),matsD:[],_ownMats:[],weapons:{},skeleton:{dispose(){calls.skeleton++;}},sourceMotion:{dispose(){calls.motion++;}},_tierSet(){calls.tiers++;return {list:[]};}});if(patched){ch.mats.squidEye=new T.MeshBasicMaterial();ch.mats.squidEye.addEventListener('dispose',()=>{calls.squidEye++;});}ch.root.add(ch.kid);return ch;};return {calls,make};
}
test('negative control: native pending warm builds tiers and compiles after Character.dispose',async()=>{
 const f=characterWarmFixture(false),p=pending(),ch=f.make(p.promise),work=ch.warmAll();ch.dispose();p.resolve();await work;assert.equal(f.calls.compile,1);assert.equal(f.calls.tiers,3);
});
test('disposed pending warm skips new resources while the shared loader still warms a live replacement',async()=>{
 const f=characterWarmFixture(true),p=pending(),old=f.make(p.promise),next=f.make(p.promise),before=old.warmAll(),after=next.warmAll();old.dispose();p.resolve();assert.equal(await before,false);assert.equal(await after,'high');assert.equal(f.calls.compile,1);assert.equal(f.calls.tiers,3);assert.equal(f.calls.skeleton,1);assert.equal(f.calls.motion,1);assert.equal(f.calls.squidEye,1,'disposed pending character releases its owned squid eye material');assert.equal(await old.warmAll(),false);next.dispose();assert.equal(f.calls.squidEye,2,'live replacement owns a distinct squid eye material');
});

test('actual attract replacement with distinct materials preserves the native warmed program',async()=>{
 const code=runtimeSource('src/main.js'),h=rig(),oldMat=h.material(),nextMat=h.material(),oldProgram=h.acquire(oldMat);oldProgram.getUniforms();const old=h.match(oldMat);old.dispose=()=>oldMat.dispose();
 class Match{constructor(){this.actors=h.match(nextMat).actors;}setup(){}start(){}}
 const G={renderer:h.renderer,projectiles:{clear(){}},fx:{clear(){}},paint:{clear(){}}};const Game=vm.runInNewContext('(class {'+attractMethod(code)+'})',aliasScope(code,{G,Match,mapNoBots:()=>false,isRangeMap:()=>false,DEV_STAGE:false,beginMaterialHandoff:(g,m,r)=>beginMaterialHandoff(g,m,r,h.env)}));
 const g=new Game();let fresh;Object.assign(g,{match:old,rig:{},_attractShot(){},hud:{setVisible(){}},_warmCharacters(){fresh=h.acquire(nextMat);fresh.getUniforms();return Promise.resolve();}});g._startAttract();await flush();
 assert.equal(h.counts.linked,1,'replacement must reuse rather than relink');assert.equal(h.counts.uniforms,1,'replacement must reuse cached uniform reflection');assert.equal(fresh,oldProgram);assert.equal(fresh.usedTimes,1);nextMat.dispose();assert.equal(h.cache.programs.length,0);
});

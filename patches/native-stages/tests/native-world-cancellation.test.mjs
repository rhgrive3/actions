import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
if(!vm.SourceTextModule){test('native world cancellation VM subprocess',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--max-old-space-size=128','--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});}else{
const source=fs.readFileSync(new URL('../runtime/native-world.mjs',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function fixture(){
 const counts={},bump=k=>counts[k]=(counts[k]||0)+1,warms=[],frames=[];let valid=true;
 const obj=kind=>({dispose(){bump(kind+'Dispose');}});
 const renderer={capabilities:{maxTextureSize:4096},target:'previous',getRenderTarget(){return this.target},setRenderTarget(x){this.target=x},compileAsync(){const d=deferred();warms.push(d);return d.promise;}};
 const G={renderer,scene:{add(){bump('publish')},remove(){}},paint:obj('oldPaint'),teamColors:[]};
 const game={settings:{quality:'high'},nativeWorld:obj('oldWorld'),_shadowRoots(){bump('shadows')}};
 const data={manifest:{geometry:{vertices:3,triangles:1}}};
 const modules={three:{LinearFilter:1},ctx:{G},paint:{PaintSystem:class{constructor(){bump('paint');Object.assign(this,obj('paint'),{texture:{},dryMesh:{visible:false},rt:{},scene:{},cam:{},grid:new Uint8Array(1),size:1,ppm:1});}}},nav:{NavGraph:class{constructor(){bump('nav')}}},minimap:{Minimap:class{constructor(level){assert.ok(level.nativeNav);bump('minimap')}}},swimWake:{SwimWake:class{reset(){bump('wake')}}},'native-load':{loadNativeData:async()=>data,loadNativeTextures:async()=>new Map()},'native-level':{NativeLevel:class{constructor(){this.faces=[];this.bounds={minX:0,minZ:0,maxX:1,maxZ:1}}}},'native-physics':{NativePhysics:class{}},'native-render':{nativeDisplay(){bump('display');return{...obj('display'),group:{}}},nativeInkGeometry(){bump('ink');return obj('geometry')},nativeInkMaterial(){bump('material');return obj('material')}},'native-ink-chunks':{NativeInkMesh:class{constructor(geo){bump('mesh');this.dispose=()=>{bump('meshDispose');geo.dispose()}}}},'source-menu':{sourceLoadingStatus(){return{update(){},close(){bump('statusClose')}}}}};
 const context=vm.createContext({AbortController,DOMException,performance,requestAnimationFrame:fn=>frames.push(fn)}),m=new vm.SourceTextModule(source,{context});
 await m.link(spec=>{const key=spec==='three'?'three':spec.split('/').pop().replace(/\.(mjs|js)$/,'');const values=modules[key];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context});});await m.evaluate();
 const start=()=>m.namespace.buildNativeWorld(game,{id:'tiny',name:'tiny'},()=>valid),tick=()=>new Promise(r=>setImmediate(r));
 return{counts,G,game,warms,frames,start,tick,stale:()=>{valid=false},cancel:()=>game._nativeAbort.abort(),release:()=>m.namespace.releaseNativeWorld(game)};
}
for(const phase of ['warm','frame'])for(const mode of ['stale','abort'])test(phase+' '+mode+' stops detached work and cleans once',async()=>{
 const f=await fixture(),p=f.start();await f.tick();assert.equal(f.warms.length,1);assert.equal(f.G.renderer.target,'previous');
 if(phase==='frame'){f.warms[0].resolve();await f.tick();assert.equal(f.frames.length,1);}
 mode==='stale'?f.stale():f.cancel();if(phase==='warm')f.warms[0].resolve();else f.frames.shift()();await f.tick();
 // Old source reaches the next scheduling boundary; release it so the negative terminates.
 while(f.frames.length)f.frames.shift()();await p;
 assert.equal(f.counts.ink||0,phase==='warm'?0:1);assert.equal(f.counts.nav||0,0);assert.equal(f.counts.publish||0,0);
 assert.equal(f.counts.displayDispose,1);assert.equal(f.counts.paintDispose,1);assert.equal(f.counts.statusClose,1);assert.equal(f.counts.oldWorldDispose||0,0);
 if(phase==='frame'){assert.equal(f.counts.meshDispose,1);assert.equal(f.counts.geometryDispose,1);assert.equal(f.counts.materialDispose,1);}
});
test('successful publish and explicit release retain existing ownership',async()=>{const f=await fixture(),p=f.start();await f.tick();f.warms[0].resolve();await f.tick();f.frames.shift()();await p;assert.equal(f.counts.nav,1);assert.equal(f.counts.publish,1);assert.equal(f.counts.oldWorldDispose,1);assert.equal(f.counts.oldPaintDispose,1);assert.equal(f.counts.displayDispose||0,0);assert.equal(f.counts.minimap,1);f.release();f.release();assert.equal(f.counts.displayDispose,1);assert.equal(f.counts.meshDispose,1);assert.equal(f.counts.materialDispose,1);});
test('new build aborts warm old build without releasing new world',async()=>{const f=await fixture(),first=f.start();await f.tick();const second=f.start();await f.tick();assert.equal(f.warms.length,2);f.warms[1].resolve();await f.tick();f.frames.shift()();await second;f.warms[0].resolve();await f.tick();while(f.frames.length)f.frames.shift()();await first;assert.equal(f.counts.nav,1);assert.equal(f.counts.ink,1);assert.equal(f.counts.publish,1);assert.equal(f.counts.displayDispose,1);assert.equal(f.counts.oldWorldDispose,1);assert.equal(f.counts.statusClose,2);});
test('compile rejection preserves primary error and detached cleanup',async()=>{const f=await fixture(),error=Error('compile failure'),p=f.start(),rejection=assert.rejects(p,e=>e===error);await f.tick();f.warms[0].reject(error);await rejection;assert.equal(f.counts.ink||0,0);assert.equal(f.counts.nav||0,0);assert.equal(f.counts.displayDispose,1);assert.equal(f.counts.paintDispose,1);assert.equal(f.counts.statusClose,1);assert.equal(f.G.renderer.target,'previous');});

}

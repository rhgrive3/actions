import test from 'node:test';
import * as nativeGpuBudget from '../runtime/native-gpu-budget.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(!vm.SourceTextModule){
 test('native quality/world lifecycle subprocess',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});
}else{
async function fixture(){
 const metrics={loads:0,displayDisposes:0,inkDisposes:0,materialDisposes:0,oldPaintDisposes:0};
 const data={manifest:{geometry:{vertices:3,triangles:1},materials:{}},id:'test'};
 const caps={maxDimension:1024,perRole:{normal:512}};
 const G={teamColors:[],scene:{add(){},remove(){}},renderer:{capabilities:{maxTextureSize:4096},getRenderTarget(){return null},setRenderTarget(){},compileAsync(){return Promise.resolve()}}};
 const game={settings:{quality:'high'},mobile:{touch:true},_shadowRoots(){},_setPalette(){},_pickPalette(){},_footprint(){return {}},nativeWorld:null};
 class Paint {constructor(){this.texture={};this.dryMesh={visible:false};this.grid=new Uint8Array(4);this.size=2048;this.ppm=4;}dispose(){metrics.oldPaintDisposes++;}}
 class Level {constructor(d){this.data=d;this.layout={id:'test'};this.bounds={minX:0,maxX:20,minZ:0,maxZ:20};this.faces=[];}}
 class Mesh {bindPaint(){return this}dispose(){metrics.inkDisposes++;}}
 const loader={async loadNativeData(){return data},async loadNativeTextures(){metrics.loads++;return new Map()}};
 const context=vm.createContext({console,AbortController,DOMException,performance,requestAnimationFrame:fn=>fn()});
 const make=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context});
 const links={
  three:make({LinearFilter:1}),
  '../../../src/core/ctx.js':make({G}),
  '../../../src/world/paint.js':make({PaintSystem:Paint}),
  '../../../src/game/nav.js':make({NavGraph:class{static async createNative(){return new this()}}}),
  '../../../src/game/minimap.js':make({Minimap:class{activate(){}}}),
  '../../../src/fx/swimWake.js':make({SwimWake:class{reset(){}}}),
  './native-load.mjs':make({loadNativeData:(...a)=>loader.loadNativeData(...a),loadNativeTextures:(...a)=>loader.loadNativeTextures(...a)}),
  './native-level.mjs':make({NativeLevel:Level}), './native-physics.mjs':make({NativePhysics:class{}}),
  './native-ink-chunks.mjs':make({NativeInkMesh:Mesh}),
  './native-texture-budget.mjs':make({nativeStageTextureCaps:()=>caps}),
  './native-gpu-budget.mjs':make({...nativeGpuBudget}),
  './source-menu.mjs':make({sourceLoadingStatus:()=>({update(){},close(){}}),showNativeWorldRecovery(){}}),
  './native-render.mjs':make({nativeDisplay(){return {group:{},dispose(){metrics.displayDisposes++},updateTextures(){}}},nativeInkGeometry(){return{}},nativeInkMaterial(){return{dispose(){metrics.materialDisposes++}}}})
 };
 const load=async file=>{const m=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/'+file,import.meta.url),'utf8'),{context});await m.link(s=>{assert(links[s],s);return links[s]});await m.evaluate();return m.namespace;};
 const world=await load('native-world.mjs'),quality=await load('native-quality.mjs');
 await world.buildNativeWorld(game,{id:'test',name:'Test'},()=>true);
 const deps={G,q:{paintAtlas:2048,shadowSize:2048,particles:0.7},updatePaintQuality(){},updateEnvironmentShadowQuality(){},updateFXQuality(){}};
 return{game,G,world,quality,metrics,loader,data,caps,deps};
}
test('real world creation seeds the exact initial profile; High/Ultra do not decode again',async()=>{
 const f=await fixture();assert.equal(f.game.nativeWorld.textureProfile.data,f.data);assert.equal(f.game.nativeWorld.textureProfile.caps,f.caps);assert.equal(f.metrics.loads,1);
 await f.quality.applyNativeQuality(f.game,{quality:'ultra'},f.game.mobile,f.deps);assert.equal(f.metrics.loads,1);
});
test('real world release cancels delayed quality loads and releases late images exactly once',async()=>{
 const f=await fixture();let release,signal;const counters={close:0,dispose:0};
 const textures=new Map([['x',{image:{close(){counters.close++}},dispose(){counters.dispose++}}]]);
 f.loader.loadNativeTextures=async(_id,_data,_r,_q,s)=>{signal=s;return new Promise(r=>release=r)};
 const pending=f.quality.applyNativeQuality(f.game,{quality:'low'},f.game.mobile,f.deps);
 await new Promise(r=>setImmediate(r));assert.equal(signal.aborted,false);
 const old=f.game.nativeWorld;f.world.releaseNativeWorld(f.game);assert.equal(signal.aborted,true);assert.equal(old.disposed,true);assert.equal(old.textureProfile,null);
 release(textures);await pending;assert.deepEqual(counters,{close:1,dispose:1});assert.equal(textures.size,0);
 old.dispose();assert.equal(f.metrics.displayDisposes,1);assert.equal(f.metrics.inkDisposes,1);assert.equal(f.metrics.materialDisposes,1);
});
test('world disposal attempts every sibling even when display cleanup fails',async()=>{
 const f=await fixture(),w=f.game.nativeWorld;
 w.display.dispose=()=>{f.metrics.displayDisposes++;throw Error('injected display dispose');};
 w.dispose();assert.equal(w.disposed,true);assert.equal(w.textureProfile,null);
 assert.equal(f.metrics.displayDisposes,1);assert.equal(f.metrics.inkDisposes,1);assert.equal(f.metrics.materialDisposes,1);
 w.dispose();assert.equal(f.metrics.displayDisposes,1);
});

}

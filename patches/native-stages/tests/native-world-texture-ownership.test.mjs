import * as nativeWork from '../runtime/native-work.mjs';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import * as nativeGpuBudget from '../runtime/native-gpu-budget.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
// Synthetic malformed display range; actual world/render and Three.Texture.
// Loading and game dependencies are isolated. This is not a device crash reproduction.
if(!vm.SourceTextModule){
 test('native display ownership subprocess',()=>execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{stdio:'pipe'}));
}else for(const mode of ['assembly-failure','before-transfer','stale-display'])test({
 'assembly-failure':'assembly failure retains original exception and releases pending textures',
 'before-transfer':'superseded level leaves untransferred textures with their caller',
 'stale-display':'stale display releases transferred textures once',
}[mode],async()=>{
const stale=mode==='stale-display',phases=[];let current=true;
const context=vm.createContext({console,AbortController,DOMException,performance,Float32Array,Uint32Array,Map,Promise});
const module=(values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});

let closes=0,disposes=0;const image={close(){closes++;}},texture=new THREE.Texture(image);texture.addEventListener('dispose',()=>disposes++);let textures=new Map([['test.png',texture]]);
const data={manifest:{materials:{m:{albedo:'test.png'}},objects:[{active:true,material:'m',vo:stale?0:1,vc:3,io:0,ic:3}]},vertices:new Float32Array(24),indices:new Uint32Array([0,1,2])};
const dependencies={three:module(THREE),'../../../src/world/levelMaterial.js':module({createLevelMaterial(){throw Error('unused');}}),'./native-paint-detail.mjs':module({enableNativePaintDetail(){throw Error('unused');}}),'../../../src/core/ctx.js':module({G:{renderer:{capabilities:{maxTextureSize:4096}}}}),'./native-gpu-budget.mjs':module({...nativeGpuBudget}),'./native-load.mjs':module({async loadNativeData(){phases.push('data');return data;},async loadNativeTextures(){phases.push('textures');assert.equal(current,true);return textures;}}),'./native-texture-budget.mjs':module({nativeStageTextureCaps(){return {maxDimension:1024,perRole:{}};}}),'./native-level.mjs':module({NativeLevel:class{static async create(){phases.push('level');if(mode==='before-transfer')current=false;return new this;}}}),'./native-physics.mjs':module({NativePhysics:class{}}),'./source-menu.mjs':module({showNativeWorldRecovery(){},sourceLoadingStatus(){return {update(){},close(){}};}})};
for(const [file,name]of [['../../../src/world/paint.js','PaintSystem'],['../../../src/game/nav.js','NavGraph'],['../../../src/game/minimap.js','Minimap'],['../../../src/fx/swimWake.js','SwimWake'],['./native-ink-chunks.mjs','NativeInkMesh']])dependencies[file]=module({[name]:class{constructor(){throw Error('unexpected '+name);}}});
dependencies['./native-work.mjs']=module(nativeWork);
const render=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs',import.meta.url),'utf8'),{context});await render.link(s=>dependencies[s]);await render.evaluate();dependencies['./native-render.mjs']=render;
let thrown;const actualDisplay=render.namespace.nativeDisplay;dependencies['./native-render.mjs']=module({...Object.fromEntries(Object.keys(render.namespace).map(k=>[k,render.namespace[k]])),nativeDisplay(...args){phases.push('display-start');try{const display=actualDisplay(...args);phases.push('display-created');assert.equal(current,true);if(stale)current=false;return display;}catch(e){thrown=e;throw e;}}});
const world=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-world.mjs',import.meta.url),'utf8'),{context});await world.link(s=>dependencies[s]);await world.evaluate();
let error;try{await world.namespace.buildNativeWorld({settings:{quality:'medium'}},{id:'synthetic',name:'Synthetic'},()=>current);}catch(e){error=e;}
if(mode==='before-transfer'){
 assert.equal(error,undefined);assert.deepEqual(phases,['data','level']);
 assert.equal(closes,0);assert.equal(disposes,0);assert.equal(textures.size,1,'world never acquired these textures');
 // The fixture caller still owns this resource; dispose only after witnessing the boundary.
 for(const t of textures.values()){t.image?.close?.();t.dispose();}textures.clear();
}else{
 assert.deepEqual(phases,stale?['data','level','textures','display-start','display-created']:['data','level','textures','display-start']);
 if(stale){assert.equal(error,undefined);assert.equal(current,false,'cancel only after actual display acquired textures');}
 else {assert.equal(error?.name,'RangeError');assert.match(error.message,/typed array length/);assert.equal(error,thrown,'original exception identity');}
 assert.equal(closes,1);assert.equal(disposes,1);assert.equal(textures.size,0);
}
// Control: successfully constructed display owns textures and clears them once.
closes=0;disposes=0;textures=new Map([['test.png',new THREE.Texture(image)]]);textures.get('test.png').addEventListener('dispose',()=>disposes++);data.manifest.objects[0].vo=0;const display=render.namespace.nativeDisplay(data,textures,'balanced');assert.equal(closes,0);assert.equal(disposes,0);assert.equal(textures.size,1);display.dispose();display.dispose();assert.equal(closes,1);assert.equal(disposes,1);assert.equal(textures.size,0);

});

import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
// Synthetic malformed display range; actual world/render and Three.Texture.
// Loading and game dependencies are isolated. This is not a device crash reproduction.
if(!vm.SourceTextModule){
 test('native display ownership subprocess',()=>execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{stdio:'pipe'}));
}else for(const stale of [false,true])test(stale?'stale display releases transferred textures once':'assembly failure retains original exception and releases pending textures',async()=>{
const context=vm.createContext({console,AbortController,performance,Float32Array,Uint32Array,Map,Promise});
const module=(values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});

let closes=0,disposes=0;const image={close(){closes++;}},texture=new THREE.Texture(image);texture.addEventListener('dispose',()=>disposes++);let textures=new Map([['test.png',texture]]);
const data={manifest:{materials:{m:{albedo:'test.png'}},objects:[{active:true,material:'m',vo:stale?0:1,vc:3,io:0,ic:3}]},vertices:new Float32Array(24),indices:new Uint32Array([0,1,2])};
const dependencies={three:module(THREE),'../../../src/world/levelMaterial.js':module({createLevelMaterial(){throw Error('unused');}}),'../../../src/core/ctx.js':module({G:{renderer:{}}}),'./native-load.mjs':module({async loadNativeData(){return data;},async loadNativeTextures(){return textures;}}),'./native-texture-budget.mjs':module({nativeStageTextureLimit(){return 1024;}}),'./native-level.mjs':module({NativeLevel:class{}}),'./native-physics.mjs':module({NativePhysics:class{}}),'./source-menu.mjs':module({sourceLoadingStatus(){return {update(){},close(){}};}})};
for(const [file,name]of [['../../../src/world/paint.js','PaintSystem'],['../../../src/game/nav.js','NavGraph'],['../../../src/game/minimap.js','Minimap'],['../../../src/fx/swimWake.js','SwimWake'],['./native-ink-chunks.mjs','NativeInkMesh']])dependencies[file]=module({[name]:class{constructor(){throw Error('unexpected '+name);}}});
const render=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs',import.meta.url),'utf8'),{context});await render.link(s=>dependencies[s]);await render.evaluate();dependencies['./native-render.mjs']=render;
let thrown;const actualDisplay=render.namespace.nativeDisplay;dependencies['./native-render.mjs']=module({...Object.fromEntries(Object.keys(render.namespace).map(k=>[k,render.namespace[k]])),nativeDisplay(...args){try{return actualDisplay(...args);}catch(e){thrown=e;throw e;}}});
const world=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-world.mjs',import.meta.url),'utf8'),{context});await world.link(s=>dependencies[s]);await world.evaluate();
let currentCalls=0;let error;try{await world.namespace.buildNativeWorld({settings:{quality:'medium'}},{id:'synthetic',name:'Synthetic'},()=>!stale||++currentCalls===1);}catch(e){error=e;}
if(stale)assert.equal(error,undefined);else {assert.equal(error?.name,'RangeError');assert.match(error.message,/typed array length/);}assert.equal(closes,1);assert.equal(disposes,1);assert.equal(textures.size,0);
if(!stale)assert.equal(error,thrown,'original exception identity');
const failed={name:error?.name,message:error?.message,closes,disposes,retainedTextures:textures.size};
// Control: successfully constructed display owns textures and clears them once.
closes=0;disposes=0;textures=new Map([['test.png',new THREE.Texture(image)]]);textures.get('test.png').addEventListener('dispose',()=>disposes++);data.manifest.objects[0].vo=0;const display=render.namespace.nativeDisplay(data,textures,'balanced');assert.equal(closes,0);assert.equal(disposes,0);assert.equal(textures.size,1);display.dispose();display.dispose();assert.equal(closes,1);assert.equal(disposes,1);assert.equal(textures.size,0);

});

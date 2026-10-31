// Synthetic resource-owner regression; no browser, actor/model or GPU rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as nativeWork from '../runtime/native-work.mjs';

async function fixture(){
 const geometries=[],materials=[];let textureCloses=0,textureDisposes=0;
 class Geometry extends THREE.BufferGeometry{constructor(){super();const row={owner:this,disposed:0};geometries.push(row);this.addEventListener('dispose',()=>row.disposed++);}}
 class Material extends THREE.MeshStandardMaterial{constructor(...args){super(...args);const row={owner:this,disposed:0};materials.push(row);this.addEventListener('dispose',()=>row.disposed++);}}
 const context=vm.createContext({console});
 const module=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const deps={three:module({...THREE,BufferGeometry:Geometry,MeshStandardMaterial:Material}),
  './native-work.mjs':module(nativeWork),
  '../../../src/world/levelMaterial.js':module({createLevelMaterial(){throw Error('unused');}}),
  './native-paint-detail.mjs':module({enableNativePaintDetail(){throw Error('unused');}})};
 const source=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs',import.meta.url),'utf8'),{context});
 await source.link(name=>{assert(deps[name],name);return deps[name];});await source.evaluate();
 const vertices=new Float32Array(2050*8);for(let i=0;i<2050;i++){vertices[i*8]=i%5;vertices[i*8+2]=i%7;vertices[i*8+4]=1;}
 const texture=new THREE.Texture({close(){textureCloses++;}});texture.addEventListener('dispose',()=>textureDisposes++);
 const textures=new Map([['colour.png',texture]]),data={vertices,indices:new Uint32Array([0,1,2]),manifest:{materials:{floor:{albedo:'colour.png'}},objects:[{active:true,material:'floor',vo:0,vc:2050,io:0,ic:3,collidable:true}]}};
 return {nativeDisplay:source.namespace.nativeDisplay,data,textures,texture,geometries,materials,textureCounts:()=>[textureCloses,textureDisposes]};
}

for(const cause of ['signal','generation','yield-failure'])test('cancelled async native display restores allocated owners and permits clean retry: '+cause,async()=>{
 const f=await fixture(),controller=new AbortController(),failure=Error('controlled work yield failure');let current=true,clock=0,yields=0;
 const pending=f.nativeDisplay.create(f.data,f.textures,'balanced',{signal:controller.signal,current:()=>current,now:()=>++clock,budgetMilliseconds:1,yieldTask:async()=>{
  yields++;assert.equal(f.geometries.length,1);assert.equal(f.materials.length,1);
  if(cause==='signal')controller.abort();else if(cause==='generation')current=false;else throw failure;
 }});
 await assert.rejects(pending,error=>cause==='yield-failure'?error===failure:error.name==='AbortError');
 assert.equal(yields,1);assert.deepEqual(f.geometries.map(r=>r.disposed),[1]);assert.deepEqual(f.materials.map(r=>r.disposed),[1]);
 assert.equal(f.textures.get('colour.png'),f.texture);assert.deepEqual(f.textureCounts(),[0,0],'an unpublished display never owns caller textures');
 const display=await f.nativeDisplay.create(f.data,f.textures,'balanced',{now:()=>0,yieldTask:async()=>assert.fail('constant clock does not schedule work')});
 assert.equal(display.group.children.length,1);assert.equal(display.currentTextures(),f.textures);
 assert.deepEqual(f.geometries.map(r=>r.disposed),[1,0]);assert.deepEqual(f.materials.map(r=>r.disposed),[1,0]);
 display.dispose();assert.deepEqual(f.geometries.map(r=>r.disposed),[1,1]);assert.deepEqual(f.materials.map(r=>r.disposed),[1,1]);assert.deepEqual(f.textureCounts(),[1,1]);assert.equal(f.textures.size,0);
});

test('an already cancelled native work request allocates no display resources',async()=>{
 const f=await fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(f.nativeDisplay.create(f.data,f.textures,'balanced',{signal:controller.signal}),{name:'AbortError'});
 assert.equal(f.geometries.length,0);assert.equal(f.materials.length,0);assert.deepEqual(f.textureCounts(),[0,0]);
 f.texture.image.close();f.texture.dispose();f.textures.clear();
});

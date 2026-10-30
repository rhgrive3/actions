import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
async function fixture(){
 const files=new Map(['a.png','o.png','n.png','r.png'].map((name,i)=>{const bytes=new Uint8Array(26);bytes[8]=i+1;bytes[25]=2;return[name,bytes.buffer];})),names=[...files.keys()],images=[],requests=[],signals=[],waits=[];let pause=false,failure=null,lost=false;const properties=new WeakMap();
 const data={integrity:Object.fromEntries(names.map(name=>[name,{bytes:26,gitSha1:name}])),manifest:{sourceMode:'browser-direct',materials:{m:{albedo:'a.png',maps:{opacity:'o.png',normal:'n.png',roughness:'r.png'},channels:{}}},objects:[{active:true,material:'m',vo:0,vc:3,io:0,ic:3,collidable:true,bounds:[[0,0,0],[1,1,1]]}]},vertices:new Float32Array(24),indices:new Uint32Array([0,1,2])};
 const context=vm.createContext({console,Blob,DOMException,AbortController,TextDecoder,TextEncoder,createImageBitmap:async(input,options)=>{const name=input instanceof Blob?names[new Uint8Array(await input.arrayBuffer())[8]-1]:input.name;const image={name,width:options.resizeWidth||8,height:options.resizeHeight||8,closed:0,close(){this.closed++;this.width=0;this.height=0;}};images.push(image);return image;},OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h}getContext(){return{drawImage(){},getImageData:(_x,_y,w,h)=>({data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>[17,0,99,255][i%4])})}}}});
 const make=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context});
 const modules={'three':make(THREE),'./registry.mjs':make({nativeStageURL:(_id,file)=>file}),'./build-config.mjs':make({nativeStageBuild:{mode:'browser-direct'}}),'./source-data.mjs':make({loadBrowserSource(){}}),'./source-cache.mjs':make({async sourceBytes(_id,url,_pin,signal){requests.push(url);signals.push(signal);if(failure?.file===url)throw failure.error;if(pause&&['n.png','r.png'].includes(url))await new Promise((resolve,reject)=>{waits.push(resolve);signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});return files.get(url);}}),'../../../src/world/levelMaterial.js':make({createLevelMaterial(){throw Error('unused');}})};
 const loader=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8'),{context});await loader.link(name=>modules[name]);await loader.evaluate();const render=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs',import.meta.url),'utf8'),{context});await render.link(name=>modules[name]);await render.evaluate();
 const renderer={capabilities:{getMaxAnisotropy:()=>4},getContext:()=>({isContextLost:()=>lost}),properties:{get(t){return properties.get(t);}}},load=(quality,previous=null,cap=8,signal=new AbortController().signal,sourceData=data)=>loader.namespace.loadNativeTextures('fixture',sourceData,renderer,quality,signal,{maxDimension:cap,perRole:{albedo:cap,opacity:cap,normal:cap,roughness:cap}},previous);
 return{data,load,display:render.namespace.nativeDisplay,images,requests,signals,waits,pause(){pause=true;},fail(file,error){failure={file,error};},upload(t){t.onUpdate?.(t);properties.set(t,{__webglTexture:{},__version:t.version});},lose(){lost=true;},forget(t){properties.delete(t);}};
}

test('Balanced to High to Balanced reuses exact colour/cutout handles and transfers sole ownership',async()=>{
 const f=await fixture(),initial=await f.load('balanced'),display=f.display(f.data,initial,'balanced'),a=initial.get('a.png'),o=initial.get('o.png');let disposed=0;for(const t of [a,o])t.addEventListener('dispose',()=>disposed++);const high=await f.load('high',display.currentTextures());assert.equal(high.get('a.png'),a);assert.equal(high.get('o.png'),o);assert.equal(high._nativeBorrowed.size,2);assert.deepEqual(f.requests,['a.png','o.png','n.png','r.png']);display.updateTextures(high,'high');assert.equal(initial.size,0);assert.equal(disposed,0);assert.equal(a.image.closed,0);assert.equal(high._nativeBorrowed.size,0);const normal=high.get('n.png'),roughness=high.get('r.png');
 const balanced=await f.load('balanced',display.currentTextures());assert.equal(balanced.get('a.png'),a);assert.equal(balanced.get('o.png'),o);display.updateTextures(balanced,'balanced');assert.equal(normal.image.closed,1);assert.equal(roughness.image.closed,1);assert.equal(disposed,0);display.dispose();display.dispose();assert.equal(a.image.closed,1);assert.equal(o.image.closed,1);assert.equal(disposed,2);assert.equal(f.requests.length,4);
});
test('Balanced to High commits inferred channels to the same shader and cache key as direct High',async()=>{
 const upgraded=await fixture(),initial=await upgraded.load('balanced'),display=upgraded.display(upgraded.data,initial,'balanced');
 const mat=display.group.children[0].material,version=mat.version;
 assert.equal(upgraded.data.manifest.materials.m.channels.roughness,undefined);
 const high=await upgraded.load('high',display.currentTextures());
 assert.equal(upgraded.data.manifest.materials.m.channels.roughness,'r');
 display.updateTextures(high,'high');
 const direct=await fixture(),directDisplay=direct.display(direct.data,await direct.load('high'),'high'),directMat=directDisplay.group.children[0].material;
 const shader=material=>{const result={fragmentShader:'#include <alphamap_fragment>\n#include <roughnessmap_fragment>'};material.onBeforeCompile(result);return result.fragmentShader;};
 assert.equal(mat,display.group.children[0].material,'quality upgrade keeps the material handle');
 assert.ok(mat.version>version,'the committed channel change recompiles the material');
 assert.equal(mat.customProgramCacheKey(),directMat.customProgramCacheKey());
 assert.equal(shader(mat),shader(directMat));
 assert.match(shader(mat),/max\(texelRoughness\.r, 0\.55\)/);
 const balanced=await upgraded.load('balanced',display.currentTextures());display.updateTextures(balanced,'balanced');
 assert.equal(mat.customProgramCacheKey(),'native-ambient-v2-1-r-g');
 assert.doesNotMatch(shader(mat),/max\(texelRoughness\.r, 0\.55\)/);
 display.dispose();directDisplay.dispose();
});
test('different cap, source identity, inferred metadata, role or texture properties force authenticated reload',async()=>{
 for(const change of ['cap','data','inference','role','state','integrity']){const f=await fixture(),initial=await f.load('balanced'),original=initial.get('a.png');let cap=8,quality='balanced';if(change==='cap')cap=4;if(change==='inference')f.data.manifest.materials.m.hasAlpha=true;if(change==='role'){f.data.manifest.materials.m.maps.normal='a.png';quality='high';}if(change==='state')original.wrapS=THREE.ClampToEdgeWrapping;if(change==='integrity')f.data.integrity['a.png'].gitSha1='changed';
 const next=await f.load(quality,initial,cap,new AbortController().signal,change==='data'?{...f.data}:f.data);assert.notEqual(next.get('a.png'),original,change);assert.equal(original.image.closed,0,change+' does not close the live profile before commit');for(const t of new Set(next.values()))if(!next._nativeBorrowed.has(t)){t.image.close();t.dispose();}for(const t of new Set(initial.values())){t.image.close();t.dispose();}
 }
});
test('abort during High-only downloads leaves borrowed current maps usable and never closes them',async()=>{
 const f=await fixture(),initial=await f.load('balanced'),display=f.display(f.data,initial,'balanced'),a=initial.get('a.png'),o=initial.get('o.png'),controller=new AbortController();f.pause();const pending=f.load('high',display.currentTextures(),8,controller.signal);for(let i=0;i<8;i++)await Promise.resolve();assert.equal(f.waits.length,2);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(a.image.closed,0);assert.equal(o.image.closed,0);assert.equal(display.currentTextures(),initial);display.dispose();assert.equal(a.image.closed,1);assert.equal(o.image.closed,1);
});
test('a fatal texture error aborts sibling fetches, preserves the primary failure and leaves the caller/current maps owned',async()=>{
 const f=await fixture(),initial=await f.load('balanced'),error=Error('pinned normal unavailable'),parent=new AbortController();
 const a=initial.get('a.png'),o=initial.get('o.png');let added=0,removed=0;
 const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
 parent.signal.addEventListener=(...args)=>{if(args[0]==='abort')added++;return add(...args);};
 parent.signal.removeEventListener=(...args)=>{if(args[0]==='abort')removed++;return remove(...args);};
 f.fail('n.png',error);f.pause();await assert.rejects(f.load('high',initial,8,parent.signal),e=>e===error);
 assert.equal(parent.signal.aborted,false);assert.equal(f.signals.at(-1).aborted,true);assert.equal(f.waits.length,1);
 assert.equal(added,removed);assert.equal(a.image.closed,0);assert.equal(o.image.closed,0);
 for(const t of initial.values()){t.image.close();t.dispose();}
});
test('closed uploaded bitmaps reuse only a live GPU handle of the same renderer and texture version',async()=>{
 for(const invalid of [null,'lost','forgotten','disposed','version']){
  const f=await fixture(),initial=await f.load('balanced'),a=initial.get('a.png'),o=initial.get('o.png');f.upload(a);f.upload(o);
  assert.equal(a.image.width,0);assert.equal(o.image.height,0);
  if(invalid==='lost')f.lose();else if(invalid==='forgotten')f.forget(a);else if(invalid==='disposed')a.dispose();else if(invalid==='version')a.needsUpdate=true;
  const next=await f.load('balanced',initial);
  if(invalid===null){assert.equal(next.get('a.png'),a);assert.equal(next.get('o.png'),o);assert.equal(f.requests.length,2);}
  else assert.notEqual(next.get('a.png'),a,invalid);
  for(const t of new Set([...initial.values(),...next.values()])){t.image?.close?.();t.dispose();}
 }
});
test('unchanged texture handles preserve material program version while changed roles invalidate it',async()=>{
 const f=await fixture(),initial=await f.load('balanced'),display=f.display(f.data,initial,'balanced'),material=display.group.children[0].material;
 const version=material.version,next=new Map(initial);display.updateTextures(next,'balanced');assert.equal(material.version,version);
 const high=await f.load('high',next);display.updateTextures(high,'high');assert.equal(material.version,version+1);
 const same=new Map(high);display.updateTextures(same,'high');assert.equal(material.version,version+1);display.dispose();
});

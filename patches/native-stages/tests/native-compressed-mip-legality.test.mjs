import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8');
async function fixture({limit=512,format=THREE.RGBA_BPTC_Format,delayedRgba=false,width=800,height=60}={}){
 const bytes=new ArrayBuffer(80);new DataView(bytes).setUint32(12,0,true);new Uint8Array(bytes)[79]=177;
 const calls={parsed:[],loaders:[],png:0,compressedDisposed:0};let pending;
 const dimensions=Array.from({length:Math.floor(Math.log2(Math.max(width,height)))+1},(_,i)=>[Math.max(1,Math.floor(width/2**i)),Math.max(1,Math.floor(height/2**i))]);
 const makeTexture=rgba=>{
  // The integrated native loader listens for real THREE Texture dispose events.
  // This lightweight transcode mock must honor that same ownership contract.
  const listeners=new Map();
  return {isCompressedTexture:true,format:rgba?THREE.RGBAFormat:format,image:{width,height},
   mipmaps:dimensions.map(([width,height])=>({width,height,data:new Uint8Array(rgba?width*height*4:Math.ceil(width/4)*Math.ceil(height/4)*16).fill(rgba?129:43)})),
   addEventListener(type,listener){listeners.set(type,listener);},
   removeEventListener(type,listener){if(listeners.get(type)===listener)listeners.delete(type);},
   dispose(){this.disposed=true;listeners.get('dispose')?.({type:'dispose'});if(!rgba)calls.compressedDisposed++;}};
 };
 class KTX2Loader{
  constructor(){this.workerConfig={bptcSupported:true,etc2Supported:true};calls.loaders.push(this);this.disposals=0;}
  setTranscoderPath(){return this;}detectSupport(){return this;}setWorkerLimit(n){this.workerLimit=n;return this;}
  dispose(){this.disposals++;}
  parse(buffer,onLoad,onError){const rgba=Object.values(this.workerConfig).every(v=>!v);calls.parsed.push({rgba,bytes:Array.from(new Uint8Array(buffer))});
   structuredClone(buffer,{transfer:[buffer]});const texture=makeTexture(rgba);
   if(rgba&&delayedRgba)pending={onLoad,onError,texture};else onLoad(texture);
  }
 }
 const context=vm.createContext({console,URL,DOMException,Blob,location:{href:'https://game.test/index.html'},
  createImageBitmap(){calls.png++;throw Error('Exact-mip path must not decode/resize PNG');}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const ready=async values=>{const m=synthetic(values);await m.link(()=>{});await m.evaluate();return m;};
 const modules={three:THREE,'./registry.mjs':{nativeStageURL:()=>''},'./build-config.mjs':{nativeStageBuild:{}},'./source-data.mjs':{loadBrowserSource(){}},'./source-cache.mjs':{sourceBytes(){throw Error('Unexpected PNG source');}}};
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:spec=>ready(spec.includes('KTX2Loader')?{KTX2Loader}:{fetchVerified:async()=>bytes.slice(0)})});
 await module.link(spec=>synthetic(modules[spec]));await module.evaluate();
 const data={manifest:{materials:{m:{maps:{normal:'normal.png'}}},prebuiltTextures:{'normal.png':{normal:{width,height,offset:0,bytes:80,pack:'p.bin'}}},prebuiltTexturePacks:[{file:'p.bin'}]}};
 const run=signal=>module.namespace.loadNativeTextures('stage',data,{capabilities:{getMaxAnisotropy:()=>4}},'high',signal,{maxDimension:1024,perRole:{normal:limit},fallback:{quality:'balanced',maxDimension:128,perRole:{}}});
 return{calls,run,get pending(){return pending;},needs:module.namespace.needsExactMipRgba,makeTexture};
}

test('illegal capped BC7 base retranscodes the identical source and keeps selected mip/pixels without PNG',async()=>{
 const f=await fixture(),textures=await f.run(),texture=textures.get('normal.png');
 assert.deepEqual([texture.image.width,texture.image.height],[400,30]);
 assert.equal(texture.format,THREE.RGBAFormat);assert.equal(texture.mipmaps.length,9);
 assert.equal(texture.mipmaps[0].data.length,400*30*4);assert.ok(texture.mipmaps[0].data.every(v=>v===129));
 assert.equal(f.calls.parsed.length,2);assert.deepEqual(f.calls.parsed.map(r=>r.rgba),[false,true]);
 assert.deepEqual(f.calls.parsed[0].bytes,f.calls.parsed[1].bytes,'retry source survives primary transferable-buffer detachment');
 assert.equal(f.calls.png,0);assert.equal(f.calls.compressedDisposed,1);
 assert.equal(f.calls.loaders[0].disposals,0,'normal compressed loader remains usable');
 assert.equal(f.calls.loaders[1].workerLimit,1);assert.equal(f.calls.loaders[1].disposals,1,'temporary RGBA worker retires after actual completion');
});

test('legal selected compressed mip retains the existing format, exact bytes and single loader',async()=>{
 const f=await fixture({limit:1024}),textures=await f.run(),texture=textures.get('normal.png');
 assert.deepEqual([texture.image.width,texture.image.height],[800,60]);
 assert.equal(texture.format,THREE.RGBA_BPTC_Format);assert.equal(texture.mipmaps.length,10);
 assert.ok(texture.mipmaps[0].data.every(v=>v===43));assert.equal(f.calls.parsed.length,1);
 assert.equal(f.calls.loaders.length,1);assert.equal(f.calls.compressedDisposed,0);assert.equal(f.calls.png,0);
});

test('RGBA and ASTC paths are not reclassified as incompatible BC-family base levels',async()=>{
 const f=await fixture();
 for(const format of [THREE.RGBAFormat,THREE.RGBA_ASTC_4x4_Format]){const t=f.makeTexture(false);t.format=format;assert.equal(f.needs(t,512),false);}
 for(const format of [THREE.RGBA_BPTC_Format,THREE.RGBA_S3TC_DXT5_Format,THREE.RED_GREEN_RGTC2_Format]){
  const t=f.makeTexture(false);t.format=format;assert.equal(f.needs(t,512),true);assert.equal(f.needs(t,1024),false);
 }
});

test('aborted exceptional transcode never publishes a late texture or disposes its worker prematurely',async()=>{
 const f=await fixture({delayedRgba:true}),controller=new AbortController(),result=f.run(controller.signal);
 await new Promise(resolve=>setTimeout(resolve,0));assert.ok(f.pending);
 const loader=f.calls.loaders[1];controller.abort();await assert.rejects(result,{name:'AbortError'});
 assert.equal(loader.disposals,0);f.pending.onLoad(f.pending.texture);
 assert.equal(f.pending.texture.disposed,true);assert.equal(loader.disposals,1);assert.equal(f.calls.png,0);
});

test('capping a thin BC texture preserves the exact 2x512 mip through RGBA32 rather than an illegal base',async()=>{
 const f=await fixture({width:4,height:1024,limit:512}),textures=await f.run(),texture=textures.get('normal.png');
 assert.deepEqual([texture.image.width,texture.image.height],[2,512]);
 assert.equal(texture.format,THREE.RGBAFormat);assert.equal(texture.mipmaps.length,10);
 assert.deepEqual(texture.mipmaps.map(m=>[m.width,m.height]),Array.from({length:10},(_,i)=>[Math.max(1,Math.floor(4/2**(i+1))),Math.max(1,Math.floor(1024/2**(i+1)))]));
 assert.equal(texture.mipmaps[0].data.length,2*512*4);assert.ok(texture.mipmaps.every(m=>m.data.every(v=>v===129)));
 assert.deepEqual(f.calls.parsed.map(r=>r.rgba),[false,true]);assert.deepEqual(f.calls.parsed[0].bytes,f.calls.parsed[1].bytes);
 assert.equal(f.calls.png,0);assert.equal(f.calls.compressedDisposed,1);assert.equal(f.calls.loaders[1].disposals,1);
});

test('terminal 1/2-texel mips stay compressed below a legal base and require RGBA only when promoted',async()=>{
 const f=await fixture();
 for(const format of [THREE.RGBA_BPTC_Format,THREE.RGBA_S3TC_DXT5_Format,THREE.RED_GREEN_RGTC2_Format]){
  const texture={isCompressedTexture:true,format,mipmaps:[4,2,1].map(n=>({width:n,height:n}))};
  assert.equal(f.needs(texture,4),false,'legal base retains its terminal compressed mips');
  assert.equal(f.needs(texture,2),true,'2x2 promoted base must retry');
  assert.equal(f.needs(texture,1),true,'1x1 promoted base must retry');
 }
});

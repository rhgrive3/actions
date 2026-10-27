import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Frozen preimage keeps the independent original reconstruction/classification oracle.
const before=fs.readFileSync(new URL('./fixtures/native-load-readback-before.mjs.txt',import.meta.url),'utf8');
const candidate=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8');

async function run(source,pixels,{encoding='unorm-rg',direct=false,size=256}={}) {
 let hypotCalls=0,readBytes=0;
 const countedMath=Object.create(Math);
 countedMath.hypot=(...args)=>{hypotCalls++;return Math.hypot(...args)};
 class Texture extends EventTarget { constructor(image){super();this.image=image} dispose(){this.dispatchEvent(new Event('dispose'));} }
 const context=vm.createContext({AbortController,Blob,DOMException,console,Math:countedMath,
  createImageBitmap:async()=>({width:size,height:size,sourcePixels:pixels,close(){}}),
  OffscreenCanvas:class { constructor(width,height){this.width=width;this.height=height} getContext(){return {drawImage(){},getImageData(x,y,w,h){
   assert.equal(x,0);assert.equal(w,size);
   const data=new Uint8ClampedArray(pixels.subarray(y*size*4,(y+h)*size*4));
   readBytes+=data.byteLength;return {data};
  }}}}
 });
 const dependencies={
  three:{Texture,DataTexture:class extends Texture {constructor(data,width,height){super({data,width,height})}},LinearMipmapLinearFilter:1,SRGBColorSpace:'s',NoColorSpace:'n',RepeatWrapping:2},
  './registry.mjs':{nativeStageURL:()=>''},'./build-config.mjs':{nativeStageBuild:{mode:'browser-direct'}},
  './source-data.mjs':{loadBrowserSource(){}},'./source-cache.mjs':{sourceBytes:async()=>new Uint8Array(26).buffer}
 };
 const mod=new vm.SourceTextModule(source,{context});
 await mod.link(name=>{const values=dependencies[name];return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context})});
 await mod.evaluate();
 const material={normalEncoding:encoding,maps:{normal:'n.png'},channels:{}};
 const textures=await mod.namespace.loadNativeTextures('fixture',{manifest:{sourceMode:direct?'browser-direct':undefined,materials:{normal:material}},integrity:{}},{capabilities:{getMaxAnisotropy:()=>4}},'high',{aborted:false});
 return {pixels:textures.get('n.png').image.data,sourcePixels:textures.get('n.png').image.sourcePixels,material,hypotCalls,readBytes};
}

function rgPixels(size=256) {
 const pixels=new Uint8ClampedArray(size*size*4);
 for(let p=0;p<size*size;p++)pixels.set([p&255,(p>>8)&255,0,p&255],p*4);
 return pixels;
}

for(const encoding of ['rg-reconstruct-z','unorm-rg','signed-byte-rg'])test(encoding+' all 65,536 RG byte pairs remain exact',async()=>{
 const pixels=rgPixels(),a=await run(before,pixels,{encoding}),b=await run(candidate,pixels,{encoding});
 assert.deepEqual(b.pixels,a.pixels);
 assert.deepEqual(b.material,a.material);
 assert.equal(a.hypotCalls,65536);
 assert.ok(b.hypotCalls<22000);
 console.log(JSON.stringify({encoding,pixels:65536,beforeHypot:a.hypotCalls,afterHypot:b.hypotCalls}));
});

for(const total of [200,65535,65536])test('normal classification preserves blue-sum boundary '+total,async()=>{
 const pixels=rgPixels();let remaining=total;
 for(let p=0;remaining;p++){const blue=Math.min(255,remaining);pixels[p*4+2]=blue;remaining-=blue;}
 const a=await run(before,pixels,{direct:true}),b=await run(candidate,pixels,{direct:true});
 assert.deepEqual(b.pixels,a.pixels);assert.deepEqual(b.material,a.material);
 assert.equal(b.material.normalEncoding==='rgb',total>=65536);
});

test('RGB classification reads one strip while preserving the image and metadata',async()=>{
 const size=1024,pixels=rgPixels(size);for(let i=2;i<pixels.length;i+=4)pixels[i]=200;
 const a=await run(before,pixels,{size,direct:true}),b=await run(candidate,pixels,{size,direct:true});
 assert.deepEqual(b.pixels,a.pixels);assert.deepEqual(b.material,a.material);
 assert.equal(a.sourcePixels,pixels);assert.equal(b.sourcePixels,pixels);
 assert.equal(a.readBytes,size*size*4);assert.equal(b.readBytes,size*64*4);
 console.log(JSON.stringify({scope:'Mock canvas API readback, not browser RSS',beforeReadBytes:a.readBytes,afterReadBytes:b.readBytes}));
});


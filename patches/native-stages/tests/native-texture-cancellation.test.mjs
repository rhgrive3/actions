import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(typeof vm.SourceTextModule!=='function'){
 test('native texture cancellation VM controls',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--max-old-space-size=128','--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});
}else{
 const baseline=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url));
 const cacheSource=fs.readFileSync(new URL('../runtime/source-cache.mjs',import.meta.url));
async function scenario(source,{cancelAt='decode',count=8,resize=false,noSignal=false,failure=null}={}){
 const controller=new AbortController(),bitmaps=[],textures=[],pending=[],reads=[];let decode=0,fetches=0;const intended=new Error('intentional '+failure+' failure');
 const bytes=new Uint8Array([137,80,78,71,1,2,3,4]),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const cache={async match(url){if(url.includes('stamp'))return new Response('0');reads.push(url);if(failure==='cache'&&url.endsWith('texture0.png'))throw intended;if(cancelAt==='cache'&&reads.length===1)controller.abort();return new Response(bytes);},async put(){},async delete(){return true;}};
 class Texture{constructor(image){this.image=image;this.disposes=0;textures.push(this);}dispose(){this.disposes++;}set needsUpdate(value){if(failure==='setup'&&textures.length===1)throw intended;this.updated=value;if(cancelAt==='transferred'&&textures.length===1)controller.abort();}}
 const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Float32Array,Uint32Array,Int32Array,Blob,Response,DOMException,AbortController,performance,crypto:crypto.webcrypto,
  caches:{async keys(){return[];},async open(){return cache;},async delete(){return true;}},
  fetch:async()=>{fetches++;if(failure==='cache')throw intended;throw Error('Unexpected network');},
  createImageBitmap:async(input,options)=>{decode++;if(failure==='decode'&&decode===1)throw intended;const isResize=!!options?.resizeWidth;const b={width:isResize?options.resizeWidth:resize?2048:8,height:isResize?options.resizeHeight:resize?2048:8,closes:0,close(){this.closes++;}};bitmaps.push(b);if((cancelAt==='decode'&&!isResize&&decode<=2)||(cancelAt==='resize'&&isResize&&pending.length<2))await new Promise(resolve=>pending.push(resolve));return b;}});
 const make=(exports)=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});
 const cacheModule=new vm.SourceTextModule(cacheSource.toString(),{context});await cacheModule.link(()=>{throw Error('Unexpected cache import');});
 const modules={'three':make({Texture,SRGBColorSpace:'srgb',NoColorSpace:'none',RepeatWrapping:1000}), './registry.mjs':make({nativeStageURL:(id,file)=>'https://example.invalid/'+id+'/'+file}), './build-config.mjs':make({nativeStageBuild:{mode:'browser-direct'}}),'./source-data.mjs':make({loadBrowserSource(){throw Error('Not used');}}),'./source-cache.mjs':cacheModule};
 const main=new vm.SourceTextModule(source,{context});await main.link(s=>{assert.ok(modules[s],s);return modules[s];});await main.evaluate();
 const materials={},integrity={};for(let i=0;i<count;i++){const file=`texture${i}.png`;materials[i]={albedo:file};integrity[file]={bytes:bytes.length,sha256:sha};}
 if(cancelAt==='before')controller.abort();
 const promise=main.namespace.loadNativeTextures('synthetic',{manifest:{materials},integrity},{capabilities:{getMaxAnisotropy:()=>4}},'balanced',noSignal?undefined:controller.signal,1024);
 if(cancelAt==='decode'||cancelAt==='resize'){for(let i=0;i<1000&&pending.length<2;i++)await new Promise(r=>setImmediate(r));assert.equal(pending.length,2);controller.abort();for(const release of pending)release();}
 let value,error;try{value=await promise;}catch(e){error=e;}
 if(failure){assert.equal(error,intended);assert.ok(bitmaps.every(b=>b.closes===1));assert.ok(textures.every(t=>t.disposes===1));}
 else if(cancelAt==='never'){assert.equal(error,undefined);assert.equal(value.size,count);assert.ok(textures.every(t=>t.colorSpace==='srgb'&&t.wrapS===1000&&t.wrapT===1000&&t.anisotropy===4&&t.updated===true));assert.ok(bitmaps.every(b=>b.closes===(resize&&b.width===2048?1:0)));assert.ok(textures.every(t=>t.disposes===0));for(const t of value.values()){t.image.close();t.dispose();}}
 else {assert.equal(error?.name,'AbortError');assert.ok(bitmaps.every(b=>b.closes===1));assert.ok(textures.every(t=>t.disposes===1));}
 assert.equal(fetches,failure==='cache'?1:0);return {reads:reads.length,decode,textures:textures.length,dimensions:textures.map(t=>[t.image.width,t.image.height]),closes:bitmaps.map(b=>b.closes),disposes:textures.map(t=>t.disposes),error:error?.name||null};
}
const source=baseline.toString();
for(const cancelAt of ['before','cache','decode','never'])test('cached textures '+cancelAt,async()=>{
 const r=await scenario(source,{cancelAt});console.log(JSON.stringify({cancelAt,...r}));
 const expected=true?{before:[0,0,0],cache:[2,0,0],decode:[2,2,0],never:[8,8,8]}:{before:[8,8,8],cache:[8,8,8],decode:[8,8,8],never:[8,8,8]};
 assert.deepEqual([r.reads,r.decode,r.textures],expected[cancelAt]);
});

for(const cancelAt of ['resize','never'])test('resized cached textures '+cancelAt,async()=>{
 const r=await scenario(source,{cancelAt,resize:true});console.log(JSON.stringify({cancelAt,resize:true,...r}));
 const expected=true&&cancelAt==='resize'?[2,4,0]:[8,16,8];
 assert.deepEqual([r.reads,r.decode,r.textures],expected);assert.ok(r.dimensions.every(([w,h])=>w===1024&&h===1024));
});
test('optional signal retains success',async()=>{const r=await scenario(source,{cancelAt:'never',noSignal:true});assert.deepEqual([r.reads,r.decode,r.textures],[8,8,8]);});

for(const failure of ['decode','setup','cache'])test('worker '+failure+' failure retains original error and once-only cleanup',async()=>{const r=await scenario(source,{cancelAt:'never',failure});assert.equal(r.error,'Error');assert.ok(r.closes.every(n=>n===1));assert.ok(r.disposes.every(n=>n===1));assert.equal(r.decode,failure==='cache'?7:8);assert.equal(r.textures,failure==='setup'?8:7);});

test('abort after first ownership transfer disposes retained texture once',async()=>{const r=await scenario(source,{cancelAt:'transferred'});console.log(JSON.stringify({cancelAt:'transferred',...r}));assert.equal(r.textures,true?1:8);assert.ok(r.closes.every(n=>n===1));assert.ok(r.disposes.every(n=>n===1));});
const names=['a','n','r','o','e'],rgba={a:[16,32,48,180],n:[255,0,0,255],r:[64,0,0,255],o:[192,0,0,255],e:[4,5,6,255]};
async function run(source,resize,failResize=false){
 const intended=new Error("synthetic resize rejection");let failedResize=false;
 const bitmap=[],textures=[],bytes=new Map(),integrity={};let fetches=0,reads=0;
 for(const [i,n] of names.entries()){const a=new Uint8Array(26);a.set([137,80,78,71]);a[8]=i;a[25]=6;bytes.set(n+'.png',a);integrity[n+'.png']={bytes:a.length,sha256:crypto.createHash('sha256').update(a).digest('hex')};}
 const store={async match(u){reads++;return new Response(bytes.get(u.split('/').at(-1)))},async put(){}};
 class Texture{constructor(image){this.image=image;this.disposed=0;textures.push(this)}dispose(){this.disposed++}}
 class DataTexture extends Texture{constructor(data,width,height){super({data,width,height});this.dataTexture=true}}
 class Canvas{constructor(w,h){this.width=w;this.height=h}getContext(){const canvas=this;return {drawImage(b){canvas.bitmap=b},getImageData(){const b=canvas.bitmap;const data=new Uint8ClampedArray(canvas.width*canvas.height*4);for(let i=0;i<data.length;i+=4)data.set(rgba[b.name],i);return{data}}}}}
 const context=vm.createContext({console,crypto:crypto.webcrypto,TextEncoder,TextDecoder,Blob,Response,DOMException,Uint8Array,Uint8ClampedArray,Float32Array,Uint32Array,Int32Array,performance,OffscreenCanvas:Canvas,
 caches:{async keys(){return[]},async open(){return store}},fetch(){fetches++;throw Error('Unexpected network')},
 async createImageBitmap(input,options){let name;if(input instanceof Blob){assert.equal(options.imageOrientation,'flipY');name=names[new Uint8Array(await input.arrayBuffer())[8]]}else{name=input.name;assert.equal(options.resizeQuality,'high');if(failResize&&!failedResize){failedResize=true;throw intended}}
 const b={name,width:options.resizeWidth||8,height:options.resizeHeight||8,closes:0,close(){this.closes++}};bitmap.push(b);return b;}});
 const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v)},{context});
 const cacheModule=new vm.SourceTextModule(cacheSource.toString(),{context});await cacheModule.link(()=>{throw Error('Unexpected cache import')});
 const modules={'three':synthetic({Texture,DataTexture,SRGBColorSpace:'srgb',NoColorSpace:'none',RepeatWrapping:'repeat',LinearMipmapLinearFilter:'linear-mip'}),'./registry.mjs':synthetic({nativeStageURL:(_id,file)=>'https://example.invalid/'+file}),'./build-config.mjs':synthetic({nativeStageBuild:{mode:'browser-direct'}}),'./source-data.mjs':synthetic({loadBrowserSource(){throw Error('Not used')}}),'./source-cache.mjs':cacheModule};
 const main=new vm.SourceTextModule(source.toString(),{context});await main.link(s=>{assert.ok(modules[s],s);return modules[s]});await main.evaluate();
 const materials={test:{albedo:'a.png',maps:{normal:'n.png',roughness:'r.png',opacity:'o.png',emissive:'e.png'},channels:{}}};
 let result,error;try{result=await main.namespace.loadNativeTextures('synthetic',{manifest:{sourceMode:'browser-direct',materials},integrity},{capabilities:{getMaxAnisotropy:()=>16}},'high',undefined,resize?4:1024)}catch(e){error=e}
 if(failResize){assert.equal(error,intended);assert.ok(bitmap.length>1);assert.ok(textures.length>0);assert.ok(bitmap.every(b=>b.closes===1));assert.ok(textures.every(t=>t.disposed===1));return{decode:bitmap.length,textures:textures.length,closes:bitmap.map(b=>b.closes),disposes:textures.map(t=>t.disposed),error:error.message}}assert.equal(error,undefined);
 assert.equal(result.size,5);assert.equal(reads,5);assert.equal(fetches,0);assert.equal(materials.test.hasAlpha,true);assert.equal(materials.test.normalEncoding,'signed-byte-rg');assert.deepEqual(materials.test.channels,{opacity:'r',roughness:'r'});
 const snapshot={materials,rows:[...result].sort(([a],[b])=>a.localeCompare(b)).map(([name,t])=>{assert.equal(t.disposed,0);assert.equal(t.colorSpace,['a.png','e.png'].includes(name)?'srgb':'none');assert.equal(t.wrapS,'repeat');assert.equal(t.wrapT,'repeat');assert.equal(t.anisotropy,4);assert.equal(t.needsUpdate,true);assert.equal(t.image.width,resize?4:8);assert.equal(t.image.height,resize?4:8);
 if(name==='n.png'){assert.equal(t.dataTexture,true);assert.equal(t.generateMipmaps,true);assert.equal(t.minFilter,'linear-mip');assert.deepEqual(Array.from(t.image.data.slice(0,4)),[126,128,255,255]);}
 else {assert.equal(t.image.closes,0);assert.equal(t.dataTexture,undefined)}
 return {name,dataTexture:!!t.dataTexture,width:t.image.width,height:t.image.height,pixels:t.image.data?Array.from(t.image.data):null,colorSpace:t.colorSpace,wrapS:t.wrapS,wrapT:t.wrapT,anisotropy:t.anisotropy,needsUpdate:t.needsUpdate,mipmaps:t.generateMipmaps??null,minFilter:t.minFilter??null};})};
 for(const b of bitmap){const owned=[...result.values()].some(t=>t.image===b);assert.equal(b.closes,owned?0:1)}
 for(const t of result.values()){t.image?.close?.();t.dispose()}
 assert.ok(bitmap.every(b=>b.closes===1));assert.ok(textures.every(t=>t.disposed===1));return{snapshot,decoded:bitmap.length,closed:bitmap.map(b=>b.closes),disposed:textures.map(t=>t.disposed)};
}

for(const resize of [false,true])test('browser-direct pixel metadata and ownership, resize='+resize,async()=>{const r=await run(baseline,resize);assert.equal(r.decoded,resize?10:5);assert.equal(r.disposed.length,5);});
test('resize rejection preserves sibling cleanup and original error',async()=>{const r=await run(baseline,true,true);assert.equal(r.decode,9);assert.equal(r.textures,4);});

}

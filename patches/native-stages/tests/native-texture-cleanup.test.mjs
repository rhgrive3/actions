import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8');
async function run(fault,options={}){
 const bitmaps=[],textures=[];let calls=0,transfers=0;
 const signal={aborted:!!options.abort};
 const fail=()=>{throw Error(fault)};
 class Texture {constructor(image){if(fault==='texture')fail();this.image=image;this.disposed=0;textures.push(this)}dispose(){this.disposed++}}
 class TransferMap extends Map {set(key,value){super.set(key,value);if(value instanceof Texture){transfers++;if(options.abortAfterTransfer)signal.aborted=true;}return this;}}
 const context=vm.createContext({Map:TransferMap,Blob,Uint8Array,DOMException,console,createImageBitmap:async(input,opts)=>{
  calls++;if(calls===2&&fault==='resize')fail();
  const b={width:opts.resizeWidth||options.size||2048,height:opts.resizeHeight||options.size||2048,closed:0,close(){this.closed++}};bitmaps.push(b);return b;
 },OffscreenCanvas:class {constructor(w,h){this.width=w;this.height=h}getContext(){return {drawImage(){if(fault==='canvas')fail()},getImageData(){return {data:new Uint8Array(4)}}}}}});
 const mods={'three':{Texture,DataTexture:class extends Texture {constructor(data,width,height){super({data,width,height})}}},'./registry.mjs':{nativeStageURL:()=>''},'./build-config.mjs':{nativeStageBuild:{mode:'browser-direct'}},'./source-data.mjs':{loadBrowserSource:()=>{}},'./source-cache.mjs':{sourceBytes:async()=>new Uint8Array(26).buffer}};
 const m=new vm.SourceTextModule(source,{context});await m.link(async name=>{const e=mods[name];return new vm.SyntheticModule(Object.keys(e),function(){for(const [k,v] of Object.entries(e))this.setExport(k,v)},{context})});await m.evaluate();
 let error,result;try{result=await m.namespace.loadNativeTextures('fixture',{manifest:{materials:{m:{albedo:options.normal?undefined:'a.png',normalEncoding:'unorm-rg',maps:options.normal?{normal:'a.png'}:{},channels:{}}}},integrity:{}},{capabilities:{getMaxAnisotropy(){if(fault==='anisotropy')fail();return 4}}},options.normal?'high':'balanced',signal)}catch(e){error=e}
 return {bitmaps,textures,error,result,transfers,calls};
}
test('success transfers resized bitmap ownership to returned texture',async()=>{const r=await run();assert.equal(r.error,undefined);assert.deepEqual(r.bitmaps.map(b=>b.closed),[1,0]);assert.equal(r.result.get('a.png').image,r.bitmaps[1]);});
test('failed resize closes original bitmap once',async()=>{const r=await run('resize');assert.equal(r.error.message,'resize');assert.deepEqual(r.bitmaps.map(b=>b.closed),[1]);assert.equal(r.textures.length,0);});
test('property setup failure closes bitmap and disposes unregistered texture',async()=>{const r=await run('anisotropy');assert.equal(r.error.message,'anisotropy');assert.deepEqual(r.bitmaps.map(b=>b.closed),[1,1]);assert.deepEqual(r.textures.map(t=>t.disposed),[1]);});

test('texture constructor failure closes resized bitmap once',async()=>{const r=await run('texture');assert.equal(r.error.message,'texture');assert.deepEqual(r.bitmaps.map(b=>b.closed),[1,1]);assert.equal(r.textures.length,0);});

test('unresized successful bitmap remains live',async()=>{const r=await run(undefined,{size:64});assert.equal(r.error,undefined);assert.deepEqual(r.bitmaps.map(b=>b.closed),[0]);assert.equal(r.result.get('a.png').image,r.bitmaps[0]);});
test('normal conversion closes input once and transfers DataTexture',async()=>{const r=await run(undefined,{normal:true});assert.equal(r.error,undefined);assert.deepEqual(r.bitmaps.map(b=>b.closed),[1]);assert.equal(r.result.get('a.png').disposed,0);});
test('canvas failure closes input once',async()=>{const r=await run('canvas',{normal:true});assert.equal(r.error.message,'canvas');assert.deepEqual(r.bitmaps.map(b=>b.closed),[1]);});
test('DataTexture setup failure does not double-close input',async()=>{const r=await run('anisotropy',{normal:true});assert.equal(r.error.message,'anisotropy');assert.deepEqual(r.bitmaps.map(b=>b.closed),[1]);assert.deepEqual(r.textures.map(t=>t.disposed),[1]);});
test('abort after successful transfer cleans returned-map ownership',async()=>{const r=await run(undefined,{abortAfterTransfer:true});assert.equal(r.error.name,'AbortError');assert.equal(r.transfers,1);assert.equal(r.calls,2);assert.deepEqual(r.bitmaps.map(b=>b.closed),[1,1]);assert.deepEqual(r.textures.map(t=>t.disposed),[1]);});

test('abort before work creates no bitmap or texture',async()=>{const r=await run(undefined,{abort:true});assert.equal(r.error.name,'AbortError');assert.equal(r.calls,0);assert.equal(r.transfers,0);assert.deepEqual(r.bitmaps,[]);assert.deepEqual(r.textures,[]);});

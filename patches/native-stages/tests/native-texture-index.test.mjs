import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const old=fs.readFileSync(new URL('./fixtures/native-load-07f44b97.mjs.txt',import.meta.url),'utf8');
const current=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8');

async function run(source,quality,sourceMode,count=96,{width=8,height=8,limit=4,pattern=0}={}){
 const materials={},integrity={},files=new Map(),bitmaps=[],textures=[];
 for(let i=0;i<count;i++)materials['material'+i]={albedo:`a${i%16}.png`,maps:{normal:`n${i%8}.png`,roughness:`r${i%8}.png`,opacity:`o${i%8}.png`,emissive:`e${i%8}.png`,metalness:`a${(i+1)%16}.png`},channels:{}};
 // A file can occur in several slots on one material and in unselected slots
 // on other materials. Match the old filter's once-only, all-role membership.
 if(count===96){materials.material0.maps.opacity=materials.material0.albedo;materials.material1.maps.normal=materials.material0.albedo;}
 for(const m of Object.values(materials))for(const file of [m.albedo,...Object.values(m.maps)])if(!files.has(file)){
  const bytes=new Uint8Array(32);bytes[8]=files.size+1;bytes[25]=6;
  files.set(file,bytes);integrity[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 }
 const names=Object.fromEntries([...files].map(([f,b])=>[b[8],f]));
 class Texture extends EventTarget{constructor(image){super();this.image=image;this.disposed=0;textures.push(this);}dispose(){this.disposed++;this.dispatchEvent(new Event('dispose'));}}
 class DataTexture extends Texture{constructor(data,width,height){super({data,width,height});}}
 let reads=0;
 const readbacks=[];
 class Canvas{constructor(width,height){this.width=width;this.height=height;}getContext(){const c=this;return {drawImage(b,x,y){assert.equal(x,0);assert.equal(y,0);c.bitmap=b;},getImageData(x=0,y=0,w=c.width,h=c.height){reads++;readbacks.push({width:w,height:h,bytes:w*h*4,name:c.bitmap.name});const bytes=new Uint8ClampedArray(w*h*4),n=c.bitmap.name;
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){const k=(y+row)*c.width+x+col;let rgba=n.startsWith('n')?[25,240,0,255]:n.startsWith('r')||n.startsWith('o')?[64,0,0,240]:[192,72,9,180];
 if(pattern){if(n.startsWith('n'))rgba=pattern%3===0?[127,127,1,255]:pattern%3===1?[128,128,0,255]:[(k*13)%256,(k*57)%256,0,255];else if(n.startsWith('r')||n.startsWith('o'))rgba=[pattern%2?2+(k%5):5,pattern%4===0?1:0,0,255];else rgba=[(k*17)%256,(k*61)%256,k%256,k===c.width*64?249:250];}
 bytes.set(rgba,(row*w+col)*4);}return {data:bytes};}};}}
 const counts={materialsValues:0,mapsValues:0},maps=new Set(Object.values(materials).map(m=>m.maps));
 const context=vm.createContext({AbortController,console,Blob,Uint8Array,Float32Array,Uint32Array,Int32Array,TextDecoder,TextEncoder,DOMException,crypto:{subtle:{digest:async(algorithm,bytes)=>{const b=crypto.createHash(algorithm.toLowerCase().replace('-','')).update(new Uint8Array(bytes)).digest();return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}},OffscreenCanvas:Canvas,
  async fetch(url){const name=String(url).split('/').pop();return {ok:true,arrayBuffer:async()=>files.get(name).buffer};},
  async createImageBitmap(input,options){const name=input instanceof Blob?names[new Uint8Array(await input.arrayBuffer())[8]]:input.name;const b={name,width:options.resizeWidth||width,height:options.resizeHeight||height,closed:0,close(){this.closed++;}};bitmaps.push(b);return b;}});
 const values=vm.runInContext('Object.values',context);
 context.countValues=o=>{if(o===materials)counts.materialsValues++;if(maps.has(o))counts.mapsValues++;return values(o);};
 vm.runInContext('Object.values=globalThis.countValues',context);
 const make=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
 const modules={'three':make({Texture,DataTexture,SRGBColorSpace:'srgb',NoColorSpace:'none',RepeatWrapping:'repeat',LinearMipmapLinearFilter:'mipmap'}),'./registry.mjs':make({nativeStageURL:(id,file)=>'https://example.invalid/'+file}),'./build-config.mjs':make({nativeStageBuild:{mode:'verified-assets'}}),'./source-data.mjs':make({loadBrowserSource(){throw Error('unused');}}),'./source-cache.mjs':make({sourceBytes(){throw Error('unused');}})};
 const m=new vm.SourceTextModule(source,{context});await m.link(s=>modules[s]);await m.evaluate();
 const loaded=await m.namespace.loadNativeTextures('fixture',{manifest:{sourceMode,materials},integrity},{capabilities:{getMaxAnisotropy:()=>8}},quality,undefined,limit);
 const snapshot={materials,rows:[...loaded].sort(([a],[b])=>a.localeCompare(b)).map(([file,t])=>[file,{name:t.image.name,width:t.image.width,height:t.image.height,data:t.image.data?Array.from(t.image.data):null,colorSpace:t.colorSpace,wrapS:t.wrapS,wrapT:t.wrapT,anisotropy:t.anisotropy,minFilter:t.minFilter,generateMipmaps:t.generateMipmaps,needsUpdate:t.needsUpdate}])};
 for(const b of bitmaps)assert.equal(b.closed,[...loaded.values()].some(t=>t.image===b)?0:1,'bitmap ownership');
 for(const t of loaded.values()){t.image.close?.();t.dispose();}
 assert.ok(bitmaps.every(b=>b.closed===1));assert.ok(textures.every(t=>t.disposed===1));
 return {snapshot,counts,readbacks,reads,decoded:bitmaps.length,textures:textures.length};
}
test('native texture index baseline is pinned to the previously published loader',()=>{
 assert.equal(crypto.createHash('sha256').update(old).digest('hex'),'93139d9328596b3ef59821a420759180ae9c9bdd644794aee582b8bb12296b98');
});
for(const sourceMode of [undefined,'browser-direct'])for(const quality of ['low','balanced','high'])test(`all material metadata, role precedence, pixels and ownership: ${sourceMode||'staged'}/${quality}`,async()=>{
 const before=await run(old,quality,sourceMode),after=await run(current,quality,sourceMode);
 assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.decoded,before.decoded);assert.equal(after.textures,before.textures);
 if(sourceMode){assert.ok(after.counts.mapsValues<before.counts.mapsValues/4);assert.ok(after.counts.materialsValues<=1,'material inventory is traversed at most once');}
 console.log(JSON.stringify({sourceMode:sourceMode||'staged',quality,materials:96,textures:after.textures,before:before.counts,after:after.counts}));
});

for(const [width,height]of [[1,1],[3,63],[7,64],[9,65],[17,129],[5,257]])for(let pattern=0;pattern<7;pattern++)test(`row strip metadata and reconstructed bytes match whole readback ${width}x${height} pattern${pattern}`,async()=>{
 const options={width,height,limit:1024,pattern},before=await run(old,'high','browser-direct',6,options),after=await run(current,'high','browser-direct',6,options);
 assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.decoded,before.decoded);
 for(const r of after.readbacks){if(r.height>64){assert(r.name.startsWith('n'),'whole buffer belongs only to reconstructed normal');}else assert(r.bytes<=width*Math.min(height,64)*4);}
 for(const prefix of ['a','r','o'])assert(after.readbacks.filter(r=>r.name.startsWith(prefix)).every(r=>r.height<=64));
});

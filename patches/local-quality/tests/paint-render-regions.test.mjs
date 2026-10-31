import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PaintDryRegions} from '../paint-dry-region-grid.mjs';
import {adaptPaintRenderRegions} from '../paint-render-regions-adapter.mjs';
import {nativeMipCompatibility} from '../paint-native-mip-guard.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {markPaintAttributeRange} from '../paint-attribute-upload-cache.mjs';

test('build adapter preserves the existing source and installs all three owners exactly once',()=>{
 const nativeUpload='const range=at._paintRange||(at._paintRange={start:0,count:0});\n        range.count=n*at.itemSize;\n        at.clearUpdateRanges(); at.updateRanges.push(range); at.needsUpdate = true;';
 const guardedUpload='markPaintAttributeRange(at, n, THREE.BufferAttribute);';
 const source='export class PaintSystem { _drawQuads(){'+nativeUpload+'} _regenerateMipmaps(){} }\nconst blend=THREE.ReverseSubtractEquation;';
 const result=adaptPaintRenderRegions('src/world/paint.js',source);
 assert.equal(result.split(guardedUpload).length,2);
 assert.equal(result.replace(guardedUpload,nativeUpload).split(source).length,2,'all original source bytes survive outside the single upload marking statement');
 assert.ok(result.indexOf('installPaintRegionalMips(PaintSystem);')<result.indexOf('installPaintDryRegions(PaintSystem);'));
 assert.ok(result.indexOf('installPaintDryRegions(PaintSystem);')<result.indexOf('installPaintProfileBatch(PaintSystem);'));
 assert.equal(result.split('installPaintProfileBatch(PaintSystem);').length,2);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js',result),/already composed/);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js','class Unknown {}'),/contract missing/);
 assert.equal(adaptPaintRenderRegions('src/main.js',source),source);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js',source.replace(nativeUpload,'')),/upload source contract/);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js',source+nativeUpload),/upload source contract/);
});

test('sparse region coverage exactly preserves UNORM8 drying over 900 deterministic mixed frames',()=>{
 for(const top of [1,.73]){
  const N=64,t=new PaintDryRegions(N,top),base=new Uint8Array(N*N),fast=new Uint8Array(base.length);
  let rng=0x38fed;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  for(let f=0;f<900;f++){
   const drying=f%3===0,n=drying?2+(f%9):0,next=t.credit+(drying?n-1:0);
   if(drying)t.expire();
   let rect=null;
   if(f%5===0&&f<300||f>750&&f%6===0){
    const x0=Math.floor(random()*58),y0=Math.floor(random()*58),x1=Math.min(N,x0+2+Math.floor(random()*5)),y1=Math.min(N,y0+2+Math.floor(random()*5));
    rect=[x0,y0,x1,y1];const x=x0/N*2-1,X=x1/N*2-1,y=y0/N*2-1,Y=y1/N*2-1;
    t.markPositions(new Float32Array([x,y,X,y,X,Y,x,Y]),1,next);
   }
   if(drying){
    t.rebuild();
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
     if(y+.5>=(top+1)*.5*N)continue;
     const k=y*N+x;base[k]=Math.max(0,base[k]-n);
     let covered=t.full;
     for(let q=0;!covered&&q<t.count;q++){const a=q*4;covered=x+.5>=t.rects[a]*t.tile&&x+.5<t.rects[a+2]*t.tile&&y+.5>=t.rects[a+1]*t.tile&&y+.5<t.rects[a+3]*t.tile;}
     if(covered)fast[k]=Math.max(0,fast[k]-n);
    }
   }
   if(rect){const [x0,y0,x1,y1]=rect;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)base[y*N+x]=fast[y*N+x]=255;}
   t.credit=next;assert.deepEqual(fast,base,'frame '+f+' top '+top);
  }
  t.reset();assert.equal(t.live,0);assert.equal(t.credit,0);assert.ok(t.expiry.every(x=>x===0));
 }
});

test('unknown bounds conservatively retain all cells instead of losing wetness',()=>{
 const t=new PaintDryRegions(2048);t.markPositions(new Float32Array([NaN,0,1,0,1,1,0,1]),1,0);t.rebuild();
 assert.equal(t.live,t.axis*t.axis);assert.equal(t.full,true);t.credit=255;t.expire();assert.equal(t.live,t.axis*t.axis);
 t.credit=256;t.expire();assert.equal(t.live,0);
 assert.throws(()=>new PaintDryRegions(0),RangeError);
 assert.equal(nativeMipCompatibility(null),false);assert.equal(nativeMipCompatibility({}),false);
});

test('normal frame path does not introduce a blocking GPU query or readback',()=>{
 const m=fs.readFileSync(new URL('../paint-regional-mips.mjs',import.meta.url),'utf8');
 const body=m.slice(m.indexOf('function generate(s,plan)'),m.indexOf('\nfunction release(p)'));
 assert.doesNotMatch(body,/readPixels|\.finish\(|getTexParameter|getQueryParameter/);
 const d=fs.readFileSync(new URL('../paint-dry-regions.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(d,/readPixels|\.finish\(|getQueryParameter|fetch\(/);
});

const vendorSource=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
const attributesNode=parse(vendorSource,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='WebGLAttributes');
assert(attributesNode,'use the actual native Three attribute upload owner, never a replacement algorithm');
const nativeAttributes=new Function('return ('+vendorSource.slice(attributesNode.start,attributesNode.end)+');')();
function recordingGL(){
 let bound=null,next=0;const data=new Map(),calls=[];
 const gl={ARRAY_BUFFER:34962,FLOAT:5126,createBuffer(){return{id:++next};},bindBuffer(_target,b){bound=b;},
  bufferData(_target,array){data.set(bound,Buffer.from(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)));calls.push('data');},
  bufferSubData(_target,offset,array,start=0,count=array.length-start){const bytes=Buffer.from(array.buffer,array.byteOffset+start*array.BYTES_PER_ELEMENT,count*array.BYTES_PER_ELEMENT);bytes.copy(data.get(bound),offset);calls.push('sub');},
  deleteBuffer(b){data.delete(b);}};
 return{gl,calls,data};
}
function nativeMark(attribute,count){const range=attribute._paintRange||(attribute._paintRange={start:0,count:0});range.count=count;attribute.clearUpdateRanges();attribute.updateRanges.push(range);attribute.needsUpdate=true;}
function markRange(attribute,count,Constructor){return markPaintAttributeRange(attribute,count/attribute.itemSize,Constructor);}
function setup(){const recording=recordingGL();return{...recording,owner:nativeAttributes(recording.gl)};}
function bytes(row,a,count){return row.data.get(row.owner.get(a).buffer).subarray(0,count*4);}

test('unchanged Float32 bits retain every native draw payload and reduce only redundant buffer uploads',()=>{
 const rows=[setup(),setup()],attrs=rows.map(()=>Array.from({length:5},(_,k)=>new THREE.BufferAttribute(new Float32Array(128),[2,3,4,3,4][k])));
 for(let tick=0;tick<15;tick++)for(let k=0;k<5;k++){
  for(let side=0;side<2;side++){
   const a=attrs[side][k];for(let i=0;i<48;i++)a.array[i]=k===4?tick+i/8:i/8;
   (side?markRange:nativeMark)(a,48,THREE.BufferAttribute);rows[side].owner.update(a,rows[side].gl.ARRAY_BUFFER);
  }
  assert.deepEqual(bytes(rows[1],attrs[1][k],48),bytes(rows[0],attrs[0][k],48),'exact native GPU buffer payload at every stamp');
 }
 assert.equal(rows[0].calls.filter(x=>x==='sub').length,70);
 assert.equal(rows[1].calls.filter(x=>x==='sub').length,18);
 assert.equal(rows[1].calls.filter(x=>x==='data').length,5);
});

test('signed zero, NaN payloads, active count changes and outside-prefix writes preserve exact upload bits',()=>{
 const row=setup(),a=new THREE.BufferAttribute(new Float32Array(16),4),words=new Uint32Array(a.array.buffer);
 const submit=n=>{markRange(a,n,THREE.BufferAttribute);row.owner.update(a,row.gl.ARRAY_BUFFER);assert.deepEqual(bytes(row,a,n),Buffer.from(a.array.buffer,0,n*4));};
 submit(8);submit(8);const clean=a.version;assert.equal(markRange(a,8,THREE.BufferAttribute),false);assert.equal(a.version,clean);
 for(const bits of [0x80000000,0,0x7fc00001,0x7fc00002,0x7fc00002]){words[0]=bits;submit(8);}
 a.array[12]=7;const before=a.version;assert.equal(markRange(a,8,THREE.BufferAttribute),false,'inactive suffix is not drawn');assert.equal(a.version,before);
 submit(16);submit(4);submit(16);
});

test('foreign versions, pending ranges, replacement arrays and custom callbacks retain the native path',()=>{
 const row=setup(),a=new THREE.BufferAttribute(new Float32Array(16),4);
 const submit=()=>{const changed=markRange(a,8,THREE.BufferAttribute);row.owner.update(a,row.gl.ARRAY_BUFFER);return changed;};
 submit();submit();assert.equal(submit(),false);
 a.needsUpdate=true;assert.equal(submit(),true,'outside version write forces native update');
 a.addUpdateRange(12,1);assert.equal(submit(),true,'outside pending range forces native marking');
 a.updateRanges=[];assert.equal(submit(),true,'outside empty range-array replacement also forces native marking');
 a.array=a.array.slice();assert.equal(submit(),true,'new array identity is not an old snapshot');
 let callbacks=0;a.onUpload(()=>callbacks++);assert.equal(submit(),true);assert.equal(submit(),true);assert.equal(callbacks,2);
});

test('GPU owner removal and context-cache reconstruction upload full current bytes without forcing a dirty version',()=>{
 const row=setup(),a=new THREE.BufferAttribute(Float32Array.from({length:16},(_,i)=>i),4);
 for(let i=0;i<2;i++){markRange(a,8,THREE.BufferAttribute);row.owner.update(a,row.gl.ARRAY_BUFFER);}
 assert.equal(markRange(a,8,THREE.BufferAttribute),false);const version=a.version;
 row.owner.remove(a);assert.equal(markRange(a,8,THREE.BufferAttribute),false);row.owner.update(a,row.gl.ARRAY_BUFFER);
 assert.equal(a.version,version);assert.deepEqual(row.data.get(row.owner.get(a).buffer),Buffer.from(a.array.buffer));
 const restored=setup();assert.equal(markRange(a,8,THREE.BufferAttribute),false,'a new GPU cache still creates a full buffer even with no new dirty version');restored.owner.update(a,restored.gl.ARRAY_BUFFER);
 assert.deepEqual(restored.data.get(restored.owner.get(a).buffer),Buffer.from(a.array.buffer));
});

test('zero ranges, shared buffers, subclass attributes and native failures never gain a cache exemption',()=>{
 for(const a of [new THREE.BufferAttribute(new Float32Array(8),2),new class extends THREE.BufferAttribute{}(new Float32Array(8),2),new THREE.BufferAttribute(new Float32Array(new SharedArrayBuffer(32)),2)]){
  const before=a.version;assert.equal(markRange(a,0,THREE.BufferAttribute),true);assert.equal(a.version,before+1);
 }
 const sentinel={error:'native range marking'};const a=new THREE.BufferAttribute(new Float32Array(8),2);a.clearUpdateRanges=()=>{throw sentinel;};
 assert.throws(()=>markRange(a,8,THREE.BufferAttribute),e=>e===sentinel);
});


test('separate attribute identities and unsupported nonzero uploads cannot share an exemption',()=>{
 const array=new Float32Array(8),a=new THREE.BufferAttribute(array,2),b=new THREE.BufferAttribute(array,2);
 for(const attr of [a,b]){assert.equal(markRange(attr,8,THREE.BufferAttribute),true);attr.clearUpdateRanges();}
 assert.equal(markRange(a,8,THREE.BufferAttribute),false);assert.equal(markRange(b,8,THREE.BufferAttribute),false);
 for(const attr of [new class extends THREE.BufferAttribute{}(new Float32Array(8),2),new THREE.BufferAttribute(new Float32Array(new SharedArrayBuffer(32)),2)])for(let i=0;i<2;i++){attr.clearUpdateRanges();assert.equal(markRange(attr,8,THREE.BufferAttribute),true);}
});


test('nonzero byte offsets and replacement views preserve the active GPU prefix exactly',()=>{
 const r=setup(),storage=new Float32Array(24);for(let i=0;i<storage.length;i++)storage[i]=i+.25;
 const a=new THREE.BufferAttribute(new Float32Array(storage.buffer,16,8),2);
 for(let i=0;i<3;i++){markRange(a,8,THREE.BufferAttribute);r.owner.update(a,r.gl.ARRAY_BUFFER);assert.deepEqual(bytes(r,a,8),Buffer.from(a.array.buffer,a.array.byteOffset,32));}
 a.array=new Float32Array(storage.buffer,32,8);assert.equal(markRange(a,8,THREE.BufferAttribute),true);r.owner.update(a,r.gl.ARRAY_BUFFER);assert.deepEqual(bytes(r,a,8),Buffer.from(a.array.buffer,a.array.byteOffset,32));
});


test('the emitted paint helper is included in the real production source identity',async()=>{
 const {qualityIdentity}=await import('../adapter.mjs');const {createHash}=await import('node:crypto');
 const bytes=fs.readFileSync(new URL('../paint-attribute-upload-cache.mjs',import.meta.url));
 assert.equal(qualityIdentity()['paint-attribute-upload-cache.mjs'],createHash('sha256').update(bytes).digest('hex'));
});

test('unsupported accessors execute only through the native marking path and preserve the primary throw',()=>{
 for(const key of ['clearUpdateRanges','onUploadCallback']){
  const a=new THREE.BufferAttribute(new Float32Array(8),2),sentinel={key};let reads=0;
  Object.defineProperty(a,key,{configurable:true,get(){reads++;if(reads===1)throw sentinel;return THREE.BufferAttribute.prototype[key];}});
  if(key==='clearUpdateRanges')assert.throws(()=>markRange(a,8,THREE.BufferAttribute),e=>e===sentinel);
  else assert.equal(markRange(a,8,THREE.BufferAttribute),true,'marking never reads an upload callback');
  assert.equal(reads,key==='clearUpdateRanges'?1:0);
 }
 const a=new THREE.BufferAttribute(new Float32Array(8),2),sentinel={key:'push'};let reads=0;
 Object.defineProperty(a.updateRanges,'push',{get(){reads++;if(reads===1)throw sentinel;return Array.prototype.push;}});
 assert.throws(()=>markRange(a,8,THREE.BufferAttribute),e=>e===sentinel);assert.equal(reads,1);assert.equal(a.version,0);
});

test('resizable ArrayBuffers retain native unsupported-resize errors even when the active prefix is unchanged',()=>{
 const row=setup(),buffer=new ArrayBuffer(32,{maxByteLength:64}),a=new THREE.BufferAttribute(new Float32Array(buffer),2);
 for(let i=0;i<2;i++){assert.equal(markRange(a,4,THREE.BufferAttribute),true);row.owner.update(a,row.gl.ARRAY_BUFFER);}
 buffer.resize(64);const before=a.version;
 assert.equal(markRange(a,4,THREE.BufferAttribute),true);assert.equal(a.version,before+1);
 assert.throws(()=>row.owner.update(a,row.gl.ARRAY_BUFFER),/Resizing buffer attributes is not supported/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as candidate from '../runtime/source-convert.mjs';
const dir=new URL('../runtime/',import.meta.url),read=name=>fs.readFileSync(new URL(name,dir),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-native-converter-before-20261026.json',import.meta.url)));
const oldSource=fixture.files['patches/native-stages/runtime/source-convert.mjs'].source;
assert.equal(crypto.createHash('sha256').update(oldSource).digest('hex'),'bfabbff973e461b57c52ed0fbcd06eadc793a310b503b7db2b373aa7ca88f374');
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source.replace(/from '(\.\/[^']+)'/g,(_m,p)=>'from '+JSON.stringify(new URL(p,dir).href))).toString('base64');
const baseline=await import(moduleURL(oldSource));
const semantics={inactiveObjectPatterns:['^Fld_Inactive'],nonCollidableObjectPatterns:['NoCollision'],nonPaintableObjectPatterns:['NoPaint']};
function sourceOBJ(count=12,{separator=' ',lineEnding='\n',prefix='',tail='',utf8Names=false}={}){
 const out=[];let first=1;
 for(let i=0;i<count;i++){
  const name=(i%5===1?'Fld_Inactive_':'Fld_')+(utf8Names?'床é':'floor')+i,n=3+i%3,points=[];
  out.push('o '+name,'usemtl '+(utf8Names?'コンクリート':'Concrete00'));
  for(let k=0;k<n;k++){const angle=k*Math.PI*2/n;points.push([Math.cos(angle)+i*8,(i%3)*.25,Math.sin(angle)]);}
  for(const p of points)out.push('v '+p.join(separator));
  for(let k=0;k<n;k++)out.push('vt '+[k/n,-0].join(separator));
  for(let k=0;k<n;k++)out.push('vn '+[0,1,0].join(separator));
  out.push('f '+Array.from({length:n},(_,k)=>[first+k,first+k,first+k].join('/')).join(separator));first+=n;
 }
 return prefix+out.map(s=>s+tail).join(lineEnding)+lineEnding;
}
const outcome=(run,...args)=>{try{return {value:run(...args)}}catch(e){return {error:{name:e.name,message:e.message}}}};
const compare=(text,opts,label='OBJ')=>assert.deepEqual(outcome(candidate.parseSourceOBJ,text,semantics,opts),outcome(baseline.parseSourceOBJ,text,semantics,opts),label);

test('direct OBJ writes retain complete bytes, ordinals and Unicode parsing across both display modes',()=>{
 const whitespace=[' ','\t','\v','\f','\r','\u00a0','\u1680','\u2000','\u2007','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff'];
 let comparisons=0;
 for(const separator of whitespace)for(const compactInactiveDisplay of [false,true])for(const lineEnding of ['\n','\r\n']){
  const text=sourceOBJ(13,{separator,lineEnding,tail:separator,utf8Names:true});
  for(const source of [text,Buffer.from(text),Buffer.concat([Buffer.from([239,187,191]),Buffer.from(text)])]){compare(source,{compactInactiveDisplay},'separator '+JSON.stringify(separator));comparisons++;}
 }
 for(const compactInactiveDisplay of [false,true])for(const variant of [sourceOBJ(2).replace('v 1 0 0','v -0 1e-45 1e+30'),sourceOBJ(1,{prefix:'\ufeff'}),sourceOBJ(1)+'# final comment',sourceOBJ(1).replaceAll('Concrete00','Materialé😀')])for(const input of [variant,Buffer.from(variant)]){compare(input,{compactInactiveDisplay});comparisons++;}
 assert.equal(comparisons,196);
});

test('malformed UTF8, separate indices, empty objects and numeric errors keep baseline rejection',()=>{
 const valid=sourceOBJ(2),variants=[valid.replace('1/1/1','0/1/1'),valid.replace('1/1/1','1/1/99'),valid.replace('1/1/1','1/1/1/extra'),valid.replace('v 1 0 0','v NaN 0 0'),valid.replace('v 1 0 0','v 1e100 0 0'),valid.replace('vn 0 1 0\n',''),valid.replace('vt 0 0\n',''),valid.replace('f 1/1/1 2/2/2 3/3/3','f 1/1/1'),valid.replace('o Fld_floor0','o '),'v 0 0 0\n'+valid,'o empty\n'+valid,valid.replace('o Fld_floor0','o \ud800'),valid.replace('v 1 0 0','v 1\0 0 0')];
 for(const text of variants)for(const compactInactiveDisplay of [false,true])for(const input of [text,Buffer.from(text)])compare(input,{compactInactiveDisplay});
 const invalid=Buffer.from(sourceOBJ(2,{utf8Names:true}));invalid[invalid.indexOf(Buffer.from('床'))]=255;
 compare(invalid,{compactInactiveDisplay:true});
 // Without compaction the invalid face precedes stage-rule classification.
 const malformed=valid.replace('1/1/1','0/1/1'),rules={inactiveObjectPatterns:['[']};
 assert.deepEqual(outcome(candidate.parseSourceOBJ,malformed,rules),outcome(baseline.parseSourceOBJ,malformed,rules));
});

test('ASCII capacity scan decodes names only and keeps the Unicode face fallback',()=>{
 function counted(source,text){let decodes=0;const Decoder=class extends TextDecoder{decode(...args){decodes++;return super.decode(...args)}};
  const run=new Function('TextDecoder',source.replace(/^import .*$/gm,'').replace(/^export /gm,'')+'\nreturn parseSourceOBJ;')(Decoder);
  const result=run(Buffer.from(text),semantics,{compactInactiveDisplay:true});return {decodes,result};}
 const text=sourceOBJ(60),before=counted(oldSource,text),after=counted(read('source-convert.mjs'),text);
 assert.deepEqual(after.result,before.result);assert(after.decodes<before.decodes*.65);
 const unicode=sourceOBJ(60,{separator:'\u2003',utf8Names:true}),a=counted(oldSource,unicode),b=counted(read('source-convert.mjs'),unicode);
 assert.deepEqual(b.result,a.result);assert(b.decodes>after.decodes,'non-ASCII face lines use the decoder');
});

test('memoized BVH sizing preserves every node and partition at split boundaries',()=>{
 let seed=0x12345;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const count of [0,1,2,11,12,13,23,24,25,31,32,63,64,127,255,1023,1024,8193]){
  const triangles=Float32Array.from({length:count*9},()=>random()*160-80);
  for(const compactCenters of [false,true])assert.deepEqual(candidate.buildSourceBVH(triangles,{compactCenters}),baseline.buildSourceBVH(triangles,{compactCenters}),'triangles '+count);
 }
});

test('full source conversion retains geometry, material inference, chart masks and metadata exactly',()=>{
 for(let i=0;i<32;i++){
  const obj=Buffer.from(sourceOBJ(3+i,{separator:i%2?'\t':' ',utf8Names:i%3===0}));
  const stage={id:'parity',sourceSha256:'a'.repeat(64),tree:'b'.repeat(40),sourceSemantics:semantics};
  for(const compactInactiveDisplay of [false,true])for(const compactBVHCenters of [false,true]){
   const options={compactInactiveDisplay,compactBVHCenters};
   assert.deepEqual(candidate.convertSource(stage,obj,'',{},()=>{},null,options),baseline.convertSource(stage,obj,'',{},()=>{},null,options));
  }
 }
});

const workerSource=read('source-worker.mjs');
const transport=new Function(workerSource.slice(workerSource.indexOf('function compactInactiveDisplay'),workerSource.indexOf('self.onmessage'))+'\nreturn {compactInactiveDisplay,prepareDisplayTransport};')();
function sphereFunction(source){return new Function('THREE',source.slice(source.indexOf('function objectBoundingSphere'),source.indexOf('function releaseArray'))+'\nreturn objectBoundingSphere;')(THREE);}
const oldSphere=sphereFunction(fixture.files['patches/native-stages/runtime/native-render.mjs'].source),newSphere=sphereFunction(read('native-render.mjs'));
function geometry(data,o){const g=new THREE.BufferGeometry(),vb=new Float32Array(data.vertices.buffer,data.vertices.byteOffset+o.vo*32,o.vc*8);g.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(vb,8),3,0));return g;}
test('worker spheres equal the actual Three.js renderer and avoid the main-thread vertex scan',()=>{
 for(let count=1;count<=25;count++){
  const parsed=candidate.parseSourceOBJ(Buffer.from(sourceOBJ(count)),semantics,{compactInactiveDisplay:true}),data={...parsed,manifest:{objects:parsed.objects,faces:[]}};
  transport.prepareDisplayTransport(data);
  for(const o of data.manifest.objects){if(!o.active)continue;
   const a=geometry(data,o),b=geometry(data,o);oldSphere(a,o.bounds);let scans=0;const original=b.getAttribute;b.getAttribute=function(...args){scans++;return original.apply(this,args)};
   newSphere(b,o.bounds,o.boundingSphere);assert.deepEqual(b.boundingSphere,a.boundingSphere);assert.deepEqual(b.boundingBox,a.boundingBox);assert.equal(scans,0);
   for(const invalid of [{center:[99,99,99],radius:1},{center:o.boundingSphere.center,radius:-1},{center:o.boundingSphere.center,radius:NaN}]){const g=geometry(data,o);newSphere(g,o.bounds,invalid);assert.deepEqual(g.boundingSphere,a.boundingSphere);}
  }
 }
});

test('packed chart memberships survive actual structured-clone transfer with shared views',()=>{
 const stage={id:'pack',sourceSha256:'a'.repeat(64),tree:'b'.repeat(40),sourceSemantics:semantics};
 const data=candidate.convertSource(stage,Buffer.from(sourceOBJ(40)),'',{},()=>{},null,{compactInactiveDisplay:true});
 const original=data.manifest.faces.map(f=>f.triangles.slice());transport.prepareDisplayTransport(data);
 const buffer=data.faceTriangles.buffer,clone=structuredClone(data,{transfer:[buffer]});assert.equal(buffer.byteLength,0);
 assert.deepEqual(clone.manifest.faces.map(f=>Array.from(f.triangles)),original);
 for(const face of clone.manifest.faces)assert.equal(face.triangles.buffer,clone.faceTriangles.buffer);
 const again=transport.prepareDisplayTransport(clone);assert.equal(again,clone);assert.equal(again.faceTriangles,clone.faceTriangles);
});

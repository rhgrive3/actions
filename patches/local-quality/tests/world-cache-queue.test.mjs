import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
import {loadNative} from './prop-retention-fixture.mjs';
const native=await loadNative(true),raw=await loadNative(false);
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
// An omitted all-zero UV stream has the same default shader coordinates as
// the retained all-zero attribute. Keep every nonzero UV and all other bytes.
// A custom shader or any bound texture may sample UVs. Pure vertex-colour
// materials do not: the optimized builder deliberately omits their unused UV
// arrays. Compare every shader-observable attribute, including mapped UVs.
const shaderReadsUV=m=>{
 const mat=m.material;
 return !mat||!(mat.isMeshBasicMaterial||mat.isMeshStandardMaterial)||
   mat.onBeforeCompile!==native.THREE.Material.prototype.onBeforeCompile||
   Object.values(mat).some(value=>value?.isTexture);
};
const state=kit=>[...kit._meshes,...kit._inst].map(m=>({name:m.name,count:m.count,attrs:Object.fromEntries(Object.entries(m.geometry.attributes).filter(([k,a])=>k!=='uv'||(shaderReadsUV(m)&&a.array.some(v=>v!==0))).map(([k,a])=>[k,hash(a.array)])),index:m.geometry.index&&hash(m.geometry.index.array)}));
function make(N){const k=new N.PropKit(new N.THREE.Scene(),{quality:'high'}),cols=N.dressingFor('halyard').flatMap(p=>k.add(p.type,p).colliders);return{k,cols,refs:[...k._buckets.values()].flat().map(p=>p.g)};}
test('Halyard final buffers and collisions survive last-owner eviction and exact re-entry',t=>{
 const a=make(raw);a.k.build();const expected=state(a.k);a.k.dispose();
 for(let cycle=0;cycle<3;cycle++){
  const b=make(native),c=make(native),shared=new Set(b.refs.filter(g=>c.refs.includes(g))),released=new Set();for(const g of shared)g.addEventListener('dispose',()=>released.add(g));
  b.k.build();c.k.build();assert.deepEqual(state(b.k),expected);assert.deepEqual(state(c.k),expected);assert.deepEqual(b.cols,a.cols);
  const live=new Set(c.k._inst.map(m=>m.geometry));b.k.dispose();assert.equal(released.size,0,'other pending/live pack user retains source templates');c.k.update(1/60,cycle);c.k.build();assert.deepEqual(state(c.k),expected);
  c.k.dispose();assert.ok(released.size>0,'private dock/vessel generation is released');t.diagnostic(JSON.stringify({cycle,releasedGeometries:released.size,releasedLogicalBytes:[...released].reduce((n,g)=>n+Object.values(g.attributes).reduce((m,a)=>m+a.array.byteLength,g.index?.array.byteLength||0),0)}));for(const g of live)assert.ok(!shared.has(g),'live instance sources have separate ownership');
  const n=released.size;c.k.dispose();assert.equal(released.size,n,'idempotent disposal');
 }
});
async function internal(){
 const THREE=native.THREE,{mergeVertices}=await import('three/addons/utils/BufferGeometryUtils.js');const context=vm.createContext({console,document:globalThis.document});const synth=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context});const imports={'three':synth(THREE),'three/addons/utils/BufferGeometryUtils.js':synth({mergeVertices}),'./render-bounds.js':synth({setPropInstanceEnvelope(){}}),'../core/ctx.js':synth({G:{}})};
 const url=new URL('../../../inkwave-public/src/world/props-core.js',import.meta.url);
 const source=fs.readFileSync(url,'utf8')+'\nexport {TPL,templateUsers,TEMPLATE_MAX_BYTES,TEMPLATE_MAX_ENTRIES,templateBytes,tpl,mergeParts,WHITE_UV};';
 const mod=new vm.SourceTextModule(source,{context,identifier:url.href}),modules=new Map([[url.href,mod]]);
 await mod.link((specifier,referrer)=>{
  if(imports[specifier])return imports[specifier];
  if(!specifier.startsWith('.'))throw Error('Unknown PropKit fixture dependency: '+specifier);
  const dependency=new URL(specifier,referrer.identifier);
  if(!modules.has(dependency.href))modules.set(dependency.href,new vm.SourceTextModule(fs.readFileSync(dependency,'utf8'),{context,identifier:dependency.href}));
  return modules.get(dependency.href);
 });
 await mod.evaluate();return mod.namespace;
}
test('global cache applies LRU entry and byte budgets only after every live/pending kit leaves',async()=>{
 const N=await internal();N.registerPropPack('cache-test',D=>{D.cache={name:'cache',build(B,o){B.box('paint','white',o.width,1,1,0,0,0);B.blink('white',0,0,0);}};});
 const a=new N.PropKit(new native.THREE.Scene()),b=new N.PropKit(new native.THREE.Scene());a.add('cache',{width:100});a.build();const live=a._inst.find(x=>x.name==='props:blink').geometry;let disposed=0;live.addEventListener('dispose',()=>disposed++);
 for(let i=0;i<350;i++)b.add('cache',{width:i+.1});const keys=[...N.TPL.keys()];assert.ok(keys.length>256);b.dispose();assert.ok(N.TPL.size>256,'live kit suspends eviction');assert.equal(disposed,0);
 const recent=keys.at(-1);a.dispose();assert.ok(N.TPL.size<=N.TEMPLATE_MAX_ENTRIES);assert.ok([...N.TPL.values()].reduce((n,g)=>n+N.templateBytes(g),0)<=N.TEMPLATE_MAX_BYTES);assert.ok(N.TPL.has(recent),'recent entry survives');
 // One oversized idle template cannot defeat the byte bound.
 const huge=new native.THREE.BufferGeometry();huge.setAttribute('position',new native.THREE.BufferAttribute(new Float32Array(3*1024*1024),3));N.tpl('huge',()=>huge);const c=new N.PropKit(null,{headless:true});c.add('cache',{width:2});c.dispose();assert.ok(!N.TPL.has('huge'));
});
test('missing zero UV inputs retain exact final white, atlas, repeat and nonzero UV buffers',async()=>{
 const N=await internal(),THREE=native.THREE,g=new THREE.PlaneGeometry(2,3),zero=g.clone();zero.attributes.uv.array.fill(0);const absent=zero.clone();absent.deleteAttribute('uv');
 for(const opts of [{},{uv:[.1,.2,.7,.9]},{uvs:[2,3]}]){const part=x=>({g:x,m:new THREE.Matrix4(),c:new THREE.Color('white'),ao:null,...opts});const a=N.mergeParts([part(zero)]),b=N.mergeParts([part(absent)]);for(const key of Object.keys(a.attributes))assert.deepEqual(b.attributes[key].array,a.attributes[key].array);assert.deepEqual(b.index.array,a.index.array);a.dispose();b.dispose();}
 const p={g,m:new THREE.Matrix4(),c:new THREE.Color('white'),ao:null,uvs:[2,3]},out=N.mergeParts([p]);for(let i=0;i<g.attributes.uv.count;i++){assert.equal(out.attributes.uv.getX(i),g.attributes.uv.getX(i)*2);assert.equal(out.attributes.uv.getY(i),g.attributes.uv.getY(i)*3);}
});

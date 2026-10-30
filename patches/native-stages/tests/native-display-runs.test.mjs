import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

async function load(url) {
 const context=vm.createContext({console});
 const external={
  three:new vm.SyntheticModule(Object.keys(THREE),function(){for(const[k,v]of Object.entries(THREE))this.setExport(k,v);},{context}),
  '../../../src/world/levelMaterial.js':new vm.SyntheticModule(['createLevelMaterial'],function(){this.setExport('createLevelMaterial',()=>{throw Error('unused');});},{context}),
  './native-paint-detail.mjs':new vm.SyntheticModule(['enableNativePaintDetail'],function(){this.setExport('enableNativePaintDetail',()=>{throw Error('unused');});},{context}),
 };
 const module=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});
 await module.link(name=>external[name]);await module.evaluate();
 return module.namespace.installNativeDisplayCulling;
}
const before=await load(new URL('./fixtures/native-display-culling-before-20261030.mjs.txt',import.meta.url));
const after=await load(new URL('../runtime/native-render.mjs',import.meta.url));

function mesh(fragmented,Type){
 const g=new THREE.BufferGeometry(),positions=[],indices=[];
 // Repeated indices deliberately exercise duplicate vertices. The changed
 // suffix may contain values equal to the previous view's stale tail.
 for(const x of [-96,0,96])positions.push(x-1,-1,-10,x+1,-1,-10,x,1,-10);
 for(let i=0;i<192;i++){
  const tile=fragmented?i%3:Math.floor(i/64),base=tile*3;
  indices.push(base,base+1,base+2);
 }
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.setIndex(new THREE.BufferAttribute(new Type(indices),1));g.computeBoundingSphere();
 return new THREE.Mesh(g,new THREE.MeshBasicMaterial());
}
function camera(x,depth=60){
 const c=new THREE.PerspectiveCamera(50,1,.1,depth);
 c.position.x=x;c.lookAt(x,0,-10);c.updateMatrixWorld();return c;
}
function snapshot(m){
 const g=m.geometry;
 return {range:{...g.drawRange},indices:Array.from(g.index.array),version:g.index.version,
  updates:g.index.updateRanges.map(r=>[r.start,r.count])};
}

for(const fragmented of [false,true])for(const Type of [Uint16Array,Uint32Array]){
 test(`native display ${fragmented?'fragmented':'contiguous'} tile runs preserve exact index writes (${Type.name})`,()=>{
  const original=mesh(fragmented,Type),candidate=mesh(fragmented,Type),a=before(original,16,1),b=after(candidate,16,1);
  assert.equal(a.tiles,b.tiles);
  const parentA=new THREE.Group(),parentB=new THREE.Group();parentA.add(original);parentB.add(candidate);
  const views=[camera(0),camera(96),camera(-96),camera(500),camera(0,500),camera(96)];
  for(let iteration=0;iteration<72;iteration++){
   if(iteration%9===0){
    const scale=iteration%18?.8:1.2,angle=iteration*.03;
    for(const p of [parentA,parentB]){p.position.set(1,2,-3);p.scale.setScalar(scale);p.rotation.y=angle;p.updateMatrixWorld();}
   }
   const c=views[iteration%views.length];
   // Both shadow and colour paths share the same index, including repeated
   // views and pending writes that have not yet been consumed by WebGL.
   if(iteration%3===0){original.onBeforeShadow(null,original,c,c);candidate.onBeforeShadow(null,candidate,c,c);}
   else{original.onBeforeRender(null,null,c);candidate.onBeforeRender(null,null,c);}
   assert.deepEqual(snapshot(candidate),snapshot(original));
   a.select(c);b.select(c);assert.deepEqual(snapshot(candidate),snapshot(original));
   if(iteration%4===0){original.geometry.index.clearUpdateRanges();candidate.geometry.index.clearUpdateRanges();}
  }
  a.dispose();b.dispose();
  for(const m of [original,candidate]){m.geometry.dispose();m.material.dispose();}
 });
}

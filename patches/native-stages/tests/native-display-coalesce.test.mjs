import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

async function load(url){
 const context=vm.createContext({console});
 const make=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const external={three:make(THREE),'../../../src/world/levelMaterial.js':make({createLevelMaterial(){throw Error('unused');}}),
  './native-paint-detail.mjs':make({enableNativePaintDetail(){throw Error('unused');}})};
 const m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});await m.link(name=>external[name]);await m.evaluate();
 return m.namespace.installNativeDisplayCulling;
}
const reference=new URL('./fixtures/native-display-before-coalesce-20261030.mjs.txt',import.meta.url);
assert.equal(createHash('sha256').update(fs.readFileSync(reference)).digest('hex'),
 '6ff0dac314d236f26d46ccd5e64bc2fa9781c4d5d8472fa55417bb3b8401f298','frozen pre-coalescing reference');
const before=await load(reference);
const after=await load(new URL('../runtime/native-render.mjs',import.meta.url));

function fixture(install){
 const positions=[],indices=[];
 for(const x of [0,20,100,120])positions.push(x-1,-1,-10,x+1,-1,-10,x,1,-10);
 for(let tile=0;tile<4;tile++)for(let i=0;i<64;i++)indices.push(tile*3,tile*3+1,tile*3+2);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const source=new Uint16Array(indices);let slices=0;
 source.subarray=function(...args){slices++;return Uint16Array.prototype.subarray.apply(this,args);};
 g.setIndex(new THREE.BufferAttribute(source,1));g.computeBoundingSphere();
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial()),culler=install(mesh,16,1);
 return{g,mesh,culler,slices:()=>slices};
}
function view(x,fov=90,z=10){const c=new THREE.PerspectiveCamera(fov,1,.1,500);c.position.set(x,0,z);c.lookAt(x,0,-10);c.updateMatrixWorld();return c;}
function state(f){return{indices:Array.from(f.g.index.array),draw:{...f.g.drawRange},version:f.g.index.version,
 ranges:f.g.index.updateRanges.map(r=>[r.start,r.count])};}

test('adjacent visible native tile runs share copies without changing indices or pending GPU writes',()=>{
 const a=fixture(before),b=fixture(after),views=[view(110),view(10),view(60,120,50),view(600),view(110),view(10)];
 try{
  for(let i=0;i<views.length;i++){
   a.culler.select(views[i]);b.culler.select(views[i]);assert.deepEqual(state(b),state(a));
   a.culler.select(views[i]);b.culler.select(views[i]);assert.deepEqual(state(b),state(a));
   if(i===2){a.g.index.clearUpdateRanges();b.g.index.clearUpdateRanges();}
  }
  assert.ok(a.slices()>0);assert.ok(b.slices()<a.slices(),'visible neighbours still made one typed-array view per tile');
 }finally{for(const f of [a,b]){f.culler.dispose();f.g.dispose();f.mesh.material.dispose();}}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {consumeNativeWork} from '../runtime/native-work.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const old=read('./fixtures/native-display-tile-ids-before-20261031.mjs.txt');
const current=read('../runtime/native-render.mjs');
const source=current.slice(current.indexOf('export function installNativeDisplayCulling('),current.indexOf('\nexport function compactNativeIndices('));
function factory(source,allocations){
 const proxy=Type=>new Proxy(Type,{construct(target,args){const a=Reflect.construct(target,args);allocations.push({type:Type.name,bytes:a.byteLength,copy:ArrayBuffer.isView(args[0])});return a;}});
 return new Function('THREE','Uint16Array','Uint32Array','consumeNativeWork',source.replace('export function','function')+'\nreturn installNativeDisplayCulling;')(THREE,proxy(Uint16Array),proxy(Uint32Array),consumeNativeWork);
}
function mesh(count,tiles){
 const p=new Float32Array(tiles*9),index=new Uint32Array(count*3);
 for(let i=0;i<tiles;i++){const x=(i%256)*24,z=Math.floor(i/256)*24;p.set([x,0,z,x+.2,0,z,x,.2,z+.2],i*9);}
 for(let i=0;i<count;i++){const base=(i%tiles)*3;index.set([base,base+1,base+2],i*3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(new THREE.BufferAttribute(index,1));g.computeBoundingSphere();
 return new THREE.Mesh(g,new THREE.MeshBasicMaterial());
}
for(const [count,tiles]of [[511,2],[512,2],[65535,128],[65536,65536],[65537,65536],[65537,65537]]){
 test(`native tile IDs retain exact camera/shadow writes at ${count} triangles and ${tiles} tiles`,()=>{
  const allocations=[[],[]],a=mesh(count,tiles),b=new THREE.Mesh(a.geometry.clone(),a.material),first=factory(old,allocations[0])(a),second=factory(source,allocations[1])(b);
  if(!first){assert.equal(second,null);return;}
  assert.equal(second.tiles,first.tiles);
  for(const x of [0,24,6000,100000,0]){
   const c=new THREE.OrthographicCamera(-30,30,40,-40,.1,10000);c.position.set(x,50,50);c.lookAt(x,0,0);c.updateMatrixWorld();
   a.updateMatrixWorld();b.updateMatrixWorld();a.onBeforeRender(null,null,c);b.onBeforeRender(null,null,c);
   assert.deepEqual(b.geometry.drawRange,a.geometry.drawRange);assert.deepEqual(b.geometry.index.array,a.geometry.index.array);assert.deepEqual(b.geometry.index.updateRanges,a.geometry.index.updateRanges);
   a.onBeforeShadow(null,null,c,c);b.onBeforeShadow(null,null,c,c);assert.deepEqual(b.geometry.index.array,a.geometry.index.array);
   a.geometry.index.clearUpdateRanges();b.geometry.index.clearUpdateRanges();
  }
  if(count<=65536){
   assert.equal(allocations[1][0].type,'Uint16Array');assert.equal(allocations[1][0].bytes,count*2);
   assert.equal(allocations[1].some(x=>x.copy),false,'no whole ID conversion allocation');
   assert.equal(allocations[0].filter(x=>x.bytes>=count*2).reduce((n,x)=>n+x.bytes,0)-allocations[1].filter(x=>x.bytes>=count*2).reduce((n,x)=>n+x.bytes,0),count*4);
  }else assert.equal(allocations[1][0].type,'Uint32Array');
  first.dispose();second.dispose();a.geometry.dispose();b.geometry.dispose();a.material.dispose();
 });
}
test('packed fixed hash cells are rejected by the actual ranked tower insertion contract',()=>{
 const s=read('../../splatoon3/runtime/ranked/world.mjs'),a=s.indexOf('  _indexTowerRoute() {'),b=s.indexOf('\n  _riderOnBlock(',a);
 assert(a>=0&&b>a);const index=new Function('return ({'+s.slice(a,b)+'})._indexTowerRoute;')();
 const object=cell=>({level:{hash:[cell],hw:1,_hxi:()=>0,_hzi:()=>0},towerBlock:{},towerBlockId:1,towerPoleBlockId:2,_towerHalfWidth:1,_towerHalfLength:1,stage:{tower:{path:[[0,0,0],[1,0,1]]}}});
 const ordinary=object([0]);index.call(ordinary);assert.deepEqual(ordinary.level.hash[0],[0,1,2]);index.call(ordinary);assert.deepEqual(ordinary.level.hash[0],[0,1,2]);
 assert.throws(()=>index.call(object(Uint32Array.of(0))),/push/);
 assert.match(s,/bucket\.splice\(at, 1\)/,'disposal also requires mutable cells');
});

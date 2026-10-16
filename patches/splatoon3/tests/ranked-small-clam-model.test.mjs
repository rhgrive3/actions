import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createSmallClamResources,createSmallClamInventory,updateSmallClamInventory} from '../runtime/ranked/small-clam-model.mjs';
const cost=g=>({triangles:(g.index?.count||g.attributes.position.count)/3,attributeBytes:Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0),indexBytes:g.index?.array.byteLength||0});
test('bounded closed shell with outward finite triangles',()=>{
 const {geometry:g,material:m}=createSmallClamResources(THREE);assert.equal(cost(g).triangles,128);assert.equal(m.vertexColors,true);assert.equal(m.transparent,false);assert.equal(g.groups.length,0);
 for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
 const p=g.attributes.position,edges=new Map();for(let i=0;i<g.index.count;i+=3){let ids=[0,1,2].map(j=>g.index.getX(i+j)),v=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));assert.ok(n.length()>1e-7);assert.ok(n.dot(v[0].clone().add(v[1]).add(v[2]))>0);for(let j=0;j<3;j++){let e=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(e,(edges.get(e)||0)+1);}}assert.ok([...edges.values()].every(v=>v===2));assert.ok(g.boundingBox.max.y<=.067);assert.ok(g.boundingBox.max.x<=.201);g.dispose();m.dispose();
});
test('carried count 0..7, disappearance and reappearance retain shared ownership',()=>{
 const r=createSmallClamResources(THREE),mesh=createSmallClamInventory(THREE,r);let gd=0,md=0;r.geometry.addEventListener('dispose',()=>gd++);r.material.addEventListener('dispose',()=>md++);
 for(const n of [1,7,0,3,0,7]){assert.equal(updateSmallClamInventory(THREE,mesh,n),n);assert.equal(mesh.count,n);assert.equal(mesh.visible,n>0);for(let i=0;i<n;i++){let mat=new THREE.Matrix4();mesh.getMatrixAt(i,mat);assert.ok(mat.elements.every(Number.isFinite));assert.equal(mat.elements[12],Math.fround((i-(n-1)/2)*.27));}}
 assert.equal(mesh.geometry,r.geometry);assert.equal(mesh.material,r.material);mesh.dispose();assert.equal(gd,0);assert.equal(md,0);r.geometry.dispose();r.material.dispose();assert.equal(gd,1);assert.equal(md,1);
});

test('old diamond and inventory ring are rejected by the flattened shell shape gate',()=>{
 const validate=g=>{g.computeBoundingBox();const s=g.boundingBox.getSize(new THREE.Vector3());assert.ok(s.x/s.y>2.5,'flattened broad shell');assert.ok(s.z/s.y>1.8,'bivalve depth');assert.equal(cost(g).triangles,128);assert.ok(g.attributes.color,'gold and lip divisions');};
 validate(createSmallClamResources(THREE).geometry);
 assert.throws(()=>validate(new THREE.OctahedronGeometry(.2,0)),/flattened broad shell/);
 assert.throws(()=>validate(new THREE.TorusGeometry(.32,.055,7,16)),/flattened broad shell/);
});
test('count changes rebuild bounding sphere, invalid counts cannot create extra instances',()=>{
 const r=createSmallClamResources(THREE),mesh=createSmallClamInventory(THREE,r);updateSmallClamInventory(THREE,mesh,7);const large=mesh.boundingSphere.radius;updateSmallClamInventory(THREE,mesh,1);assert.ok(mesh.boundingSphere.radius<large);for(const [input,expected] of [[99,7],[-1,0],[NaN,0],[Infinity,0],[2.9,2]])assert.equal(updateSmallClamInventory(THREE,mesh,input),expected);mesh.dispose();r.geometry.dispose();r.material.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {Float32Staging} from '../../../inkwave-public/src/world/attribute-staging.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const root=new URL('../../../',import.meta.url);
const read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8');
const raw=read('src/world/environment.js'),composed=adaptBuildSource('src/world/environment.js',raw),WATER_Y=-1.6;
function method(source,name,endName,bindings={}){
 const start=source.indexOf('  '+name+'('),end=source.indexOf('  '+endName+'(',start);
 assert(start>=0&&end>start);
 return new Function(...Object.keys(bindings),'return class {\n'+source.slice(start,end)+'\n}')( ...Object.values(bindings)).prototype[name];
}
const contour=source=>method(source,'_waterContours','_insideFootprint',{THREE,WATER_Y,_bb:new THREE.Box3(),_ident:new THREE.Matrix4()});
function contourFixture(){
 const scene=new THREE.Scene(),group=new THREE.Group();group.name='props';scene.add(group);
 for(let i=0;i<24;i++){
  const geometry=new THREE.BoxGeometry(2+i%3,6+i%5,3+i%2,4,5,4),mesh=new THREE.Mesh(geometry);
  mesh.position.set((i%8-4)*3,WATER_Y+(i%3-1)*1.4,(i%5-2)*3);
  mesh.rotation.set(i*.09,i*.17,i*.07);mesh.scale.set(i%2?-1.2:.8, .4+i%4, i%3?.75:-1);
  group.add(mesh);
 }
 const boundary=new THREE.BufferGeometry();boundary.setAttribute('position',new THREE.BufferAttribute(new Float64Array([
  0,WATER_Y,0,1,WATER_Y+Number.EPSILON,0,0,WATER_Y-Number.EPSILON,1,
  0,WATER_Y,0,1,WATER_Y,0,0,WATER_Y,1,
  -0,WATER_Y,0,1,WATER_Y+1,0,0,WATER_Y-1,1,
 ]),3));group.add(new THREE.Mesh(boundary));
 const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(3,8,2,3,6,3),new THREE.MeshBasicMaterial(),3);
 for(let i=0;i<3;i++)inst.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(i*2,WATER_Y,i*3),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.4,i*.2,-i*.1)),new THREE.Vector3(i%2?-1:1,1,.5)));
 group.add(inst);
 const projected=new THREE.Mesh(new THREE.BoxGeometry(2,5,2));projected.matrixAutoUpdate=false;projected.matrix.makeTranslation(2,WATER_Y,-2);projected.matrix.elements[3]=.013;group.add(projected);
 return {scene,root:new THREE.Group(),bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50}};
}
function countTransforms(fn,owner,wet){const old=THREE.Vector3.prototype.applyMatrix4;let count=0;THREE.Vector3.prototype.applyMatrix4=function(m){count++;return old.call(this,m);};try{return {value:fn.call(owner,wet),count};}finally{THREE.Vector3.prototype.applyMatrix4=old;}}
test('marina affine rejection preserves every contour and avoids actual full transforms',()=>{
 const owner=contourFixture(),wet=[{minX:-2,maxX:1,minZ:-4,maxZ:3}];
 const before=countTransforms(contour(raw),owner,wet),after=countTransforms(contour(composed),owner,wet);
 assert(before.value.length>100);assert.deepEqual(after.value,before.value);
 assert(after.count<before.count*.6,`${before.count} -> ${after.count} full transforms`);
 for(const o of owner.scene.children[0].children){o.geometry.dispose();o.material?.dispose?.();}
});
function strip(source,G){return method(source,'_buildMarinaFx','_buildFoamField',{THREE,WATER_Y,G,Float32Staging,STRIP_VERT:'',STRIP_FRAG:''});}
function stripsFixture(){
 const blocks=[],faces=[];
 for(let i=0;i<80;i++){
  blocks.push({aligned:true,solid:true,aabbMin:{y:i%3?-2:-1.4},aabbMax:{y:3}});
  const axis=i%4,u=new THREE.Vector3(axis===0?0:axis===1?-0:axis===2?1:1e-18,0,axis<2?(i%2?-1:1):0);
  faces.push({block:i,wall:true,n:new THREE.Vector3(axis<2?(i%2?-1:1):0,0,axis<2?0:1),u,origin:new THREE.Vector3((i%9-4)*2,0,(i%11-5)*2),su:2+i%18,color:new THREE.Color('#a29175')});
 }
 const decks=[],wet=[];for(let i=0;i<36;i++){const x=(i%6-3)*5,z=(Math.floor(i/6)-3)*5;(i%2?decks:wet).push({minX:x,maxX:x+3,minZ:z,maxZ:z+3,y0:-1.3});}
 decks.push({minX:-.3,maxX:.3,minZ:-3,maxZ:3,y0:-1.3});
 return {G:{level:{blocks,faces}},M:{decks,wet}};
}
function stripBuffers(fn,M){const owner={root:new THREE.Group(),_stripMat:new THREE.MeshBasicMaterial(),U:{}};fn.call(owner,M);const out=[];owner.marinaFx.traverse(o=>{if(!o.geometry)return;out.push([o.name,Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)]))]);o.geometry.dispose();});owner._stripMat.dispose();owner._underMat?.dispose();return out;}
test('marina axis candidates preserve complete waterline meshes at signed-zero and nonaxis boundaries',()=>{const {G,M}=stripsFixture();assert.deepEqual(stripBuffers(strip(composed,G),M),stripBuffers(strip(raw,G),M));});
const props=read('src/world/props-core.js'),newProps=adaptBuildSource('src/world/props-core.js',props);
function applyColors(source){const start=source.indexOf('  _applyColors() {'),end=source.indexOf('  // Time of day:',start);assert(start>=0&&end>start);return new Function('THREE','const _c1=new THREE.Color(),_white=new THREE.Color(1,1,1);return class{'+source.slice(start,end)+'}')(THREE).prototype._applyColors;}
function paletteFixture(){const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial(),4);mesh.userData={cloth:true,recs:[{team:0},{team:1,tint:.18},{color:new THREE.Color(.12,.45,.67)},{team:0,tint:.4}]};let writes=0;const native=mesh.setColorAt;mesh.setColorAt=function(...args){writes++;return native.apply(this,args);};return {_inst:[mesh],teamColors:[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')],get writes(){return writes;}};}
test('PropKit applies exact float colors, skips unchanged writes and repairs external storage changes',()=>{
 const baseline=fs.readFileSync(new URL('./fixtures/props-colors-before-20261027.js.txt',import.meta.url),'utf8');
 const a=paletteFixture(),b=paletteFixture(),old=applyColors(baseline),next=applyColors(newProps);
 const run=()=>{old.call(a);next.call(b);assert.deepEqual(b._inst[0].instanceColor.array,a._inst[0].instanceColor.array);};
 run();assert.equal(b.writes,4);const version=b._inst[0].instanceColor.version;run();assert.equal(b.writes,4);assert.equal(b._inst[0].instanceColor.version,version);
 for(const owner of [a,b])owner.teamColors[0].set('#6600aa');run();assert.equal(b.writes,6);
 for(const owner of [a,b])owner._inst[0].instanceColor.array[7]=.123;run();assert.equal(b.writes,7);
 for(const owner of [a,b]){owner._inst[0].geometry.dispose();owner._inst[0].material.dispose();}
});

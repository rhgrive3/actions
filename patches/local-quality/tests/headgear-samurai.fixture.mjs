// Builder regression against emitted production module.
import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const {createSamuraiHelmet,SAMURAI_HELMET_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/samurai-helmet.js')).href);
const result=[];
for(const lod of ['far','game','hero']){
 let calls=0;const headSurface=(a,e,o,q)=>{calls++;q.set((.178+o)*Math.sin(a)*Math.cos(e),1.214+(.176+o)*Math.sin(e),.012+(.165+o)*Math.cos(a)*Math.cos(e));};
 const g=createSamuraiHelmet({lod,headSurface,offIn:()=>.024,inkColor:0xff0066});
 assert(calls>0);assert.equal(g.children.length,4);
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('wing-concentric-gold-medallion-')).length,2);
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('wing-rolled-lower-edge-')).length,2);
 assert(!g.userData.parts.some(p=>p.name.startsWith('wing-gold-roundel-')),'plain dome replaced by concentric relief');
 const bowlBox=g.children.find(c=>c.name==='dark').geometry.boundingBox;assert(bowlBox.max.y>.42,'raised crown survives native-fit callback');
 assert(g.userData.parts.some(p=>p.name==='crest-diamond-backing'));
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('crest-squid-tentacle-')).length,4);
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('crest-upper-curl-')).length,2);
 let triangles=0,geodispose=0,matdispose=0;const box=new THREE.Box3().setFromObject(g);
 g.traverse(m=>{if(!m.isMesh)return;const geo=m.geometry;assert(geo.index);triangles+=geo.index.count/3;for(const a of Object.values(geo.attributes))assert(Array.from(a.array).every(Number.isFinite));assert(Math.max(...geo.index.array)<geo.attributes.position.count);geo.addEventListener('dispose',()=>geodispose++);m.material.addEventListener('dispose',()=>matdispose++);});
 assert(box.max.x>.32&&box.min.x<-.32);assert(box.max.y>.57&&box.max.y<.61);assert(box.min.z<-.31);
 g.userData.setInkColor(0x00ff77);assert.equal(g.children.find(c=>c.name==='ink').material.color.getHex(),0x00ff77);
 for(const c of g.children){const shader={uniforms:{},vertexShader:'',fragmentShader:'#include <color_fragment>'};c.material.onBeforeCompile(shader);assert(!shader.fragmentShader.includes('undefined'));}
 g.userData.dispose();g.userData.dispose();assert.equal(geodispose,4);assert.equal(matdispose,4);result.push({lod,draws:4,triangles,bounds:{min:box.min.toArray(),max:box.max.toArray()}});
}
const nativeContext={hat:SAMURAI_HELMET_FIT,offIn:()=>.028};
const native=createSamuraiHelmet({lod:'game',ctx:nativeContext,clearance:nativeContext.offIn,offIn:nativeContext.offIn});assert.equal(native.children.length,4);native.userData.dispose();
const legacyClearance=createSamuraiHelmet({lod:'far',clearance:()=>.028});assert.equal(legacyClearance.children.length,4);legacyClearance.userData.dispose();
assert(result[0].triangles<result[1].triangles&&result[1].triangles<result[2].triangles);
for(let i=0;i<40;i++){const g=createSamuraiHelmet({lod:'game',clearance:SAMURAI_HELMET_FIT});g.userData.dispose();}
// Inspect pre-batch wing pieces without changing the shipped factory contract.
const {readFile}=await import('node:fs/promises');
const source=await readFile(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/samurai-helmet.js'),'utf8');
const instrumented=source.replace("from 'three'",`from '${import.meta.resolve('three')}'`).replace('chunks[k].push(g);parts.push',"chunks[k].push(g);(root.userData.auditParts??=[]).push({name,g:g.clone()});parts.push");
assert.notEqual(instrumented,source);
const {createSamuraiHelmet:auditFactory}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
function closedSurface(geometries,label){const edges=new Map();let volume=0;
 for(const g of geometries){const p=g.attributes.position,ix=g.index.array;const at=i=>new THREE.Vector3().fromBufferAttribute(p,i);const key=i=>at(i).toArray().map(v=>Math.round(v*1e7)).join(',');
 for(let i=0;i<ix.length;i+=3){let a=at(ix[i]),b=at(ix[i+1]),c=at(ix[i+2]);assert(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-24,label+' zero-area triangle');volume+=a.dot(b.clone().cross(c))/6;
 for(let k=0;k<3;k++){let a=key(ix[i+k]),b=key(ix[i+(k+1)%3]),keyEdge=[a,b].sort().join('|'),e=edges.get(keyEdge)||{count:0,sign:0};e.count++;e.sign+=a<b?1:-1;edges.set(keyEdge,e);}}}
 for(const e of edges.values()){assert.equal(e.count,2,label+' open/nonmanifold edge');assert.equal(e.sign,0,label+' winding mismatch');}assert(volume>0,label+' inward winding');
}
for(const lod of ['far','game','hero']){const g=auditFactory({lod});for(const side of [-1,1]){
 const pieces=g.userData.auditParts;
 const plate=pieces.find(p=>p.name==='wing-black-outer-binding-'+side).g;
 const W={far:5,game:8,hero:12}[lod],corner=side>0?W:0,ru=Math.sqrt(.94)*.5,rv=-Math.sqrt(.94)*.5;
 const unrolledZ=.185-.045*ru+.030*rv+.025*ru*ru+.018-.001;
 const measuredRoll=unrolledZ-plate.attributes.position.getZ(corner);
 assert(measuredRoll>.020&&measuredRoll<.025,lod+' lower-outer curl must survive spatial mask');
 closedSurface([pieces.find(p=>p.name==='wing-concentric-gold-medallion-'+side).g],lod+' medallion '+side);
 const names=['wing-black-outer-binding-','wing-back-','wing-rolled-lower-edge-','wing-closed-top-edge-','wing-closed-outer-edge-','wing-closed-inner-edge-'];closedSurface(pieces.filter(p=>names.some(n=>p.name===n+side)).map(p=>p.g),lod+' plate '+side);
 }g.userData.dispose();g.userData.auditParts.forEach(p=>p.g.dispose());}

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

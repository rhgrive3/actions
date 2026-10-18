// Builder regression suite, executed against the emitted native production module.
import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const {createThiefHook,THIEF_HOOK_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/thief-hook.js')).href);
const counts=[];
for(const lod of ['hero','game','far']){
 let calls=0;const headSurface=(a,e,o,p)=>{calls++;return p.set((.178+o)*Math.cos(e)*Math.sin(a),1.214+(.176+o)*Math.sin(e),.012+(.165+o)*Math.cos(e)*Math.cos(a));};
 const g=createThiefHook({lod,inkColor:0x4455dd,headSurface,offIn:()=>.028});
 assert(calls>0);let triangles=0;const owned=new Set(),disposed=[];g.traverse(o=>{if(o.isMesh){owned.add(o.geometry);owned.add(o.material);triangles+=o.geometry.index.count/3;for(const v of o.geometry.attributes.position.array)assert(Number.isFinite(v));}});
 assert(g.children.length<=4);for(const o of owned)o.addEventListener('dispose',()=>disposed.push(o));
 const satin=g.children.find(o=>o.name==='satin').material;g.userData.setInkColor(0xff0000);assert(satin.color.r>.47&&satin.color.g===0&&satin.color.b===0);
 const box=new THREE.Box3().setFromObject(g);assert(box.max.y<.61);assert(box.min.y>.03);assert(box.max.x<.4);assert(THIEF_HOOK_FIT.rim(0)>.4);
 g.userData.dispose();g.userData.dispose();assert.equal(new Set(disposed).size,owned.size);assert.equal(disposed.length,owned.size);counts.push({lod,triangles,meshes:g.children.length,bounds:{min:box.min.toArray(),max:box.max.toArray()}});
}
assert(counts[0].triangles>counts[1].triangles&&counts[1].triangles>counts[2].triangles);
console.log(JSON.stringify({pass:true,counts},null,2));
// Semantic winding regression: roof faces up, exterior crown faces outward.
{
 const g=createThiefHook({lod:'hero'});g.updateMatrixWorld(true);
 const cloth=g.children.find(o=>o.name==='cloth'),p=cloth.geometry.attributes.position,idx=cloth.geometry.index;
 let start=0,roofN=0,minRoofDot=1,minCrownDot=1;
 const up=new THREE.Vector3(0,1,0).applyAxisAngle(new THREE.Vector3(1,0,0),.14);
 for(const part of g.userData.parts.filter(x=>x.material==='cloth')){
  if(['flat-crown-top','gently-flared-black-crown'].includes(part.name))for(let t=start;t<start+part.triangles*3;t+=3){
   const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t)),b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t+1)),c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t+2));
   const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   if(part.name==='flat-crown-top'){minRoofDot=Math.min(minRoofDot,normal.dot(up));roofN++;}
   else {const center=a.clone().add(b).add(c).multiplyScalar(1/3).sub(new THREE.Vector3(0,.267,.014)).applyAxisAngle(new THREE.Vector3(1,0,0),-.14);center.y=0;center.normalize().applyAxisAngle(new THREE.Vector3(1,0,0),.14);minCrownDot=Math.min(minCrownDot,normal.dot(center));}
  }
  start+=part.triangles*3;
 }
 assert(roofN>0&&minRoofDot>.9999);assert(minCrownDot>.90);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,1,.014),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(cloth);assert(hits.length&&hits[0].point.y>.49,'roof must occlude the center top ray');
 const lens=g.children.find(o=>o.name==='glass');assert(lens.material.forceSinglePass);assert.equal(lens.material.side,THREE.DoubleSide);
 console.log(JSON.stringify({semanticWindingPass:true,roofTriangles:roofN,minRoofDot,minCrownDot,roofHitY:hits[0].point.y,lensSinglePass:true}));g.userData.dispose();
}

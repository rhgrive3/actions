import * as THREE from 'three';
const dynamicViews=new WeakMap();
const catalogueViews=new WeakMap();
/** Catalogue projectiles use the same source triangles as legacy ink. Only
 * genuine moving game blocks enter the unchanged analytic OBB solver. */
export function sweepNativeCatalogueSphere(physics,from,to,r0,r1,out,skipGrates,sweepOBB){
 const level=physics.level;
 let state=catalogueViews.get(level);
 if(!state){
  const view={get blocks(){return level.blocks;},get faces(){return level.faces;},queryBlocks:(...args)=>level.queryDynamicBlocks(...args)};
  state={physics:{level:view},hit:{point:new THREE.Vector3(),normal:new THREE.Vector3()}};catalogueViews.set(level,state);
 }
 const source=level.triangleWorld.sweepSphere(from,to,r0,{ignoreGrates:skipGrates,endRadius:r1});
 const moving=sweepOBB(state.physics,from,to,r0,r1,state.hit,skipGrates);
 out.hit=false;out.dist=from.distanceTo(to);out.block=out.face=out.triangle=-1;out.u=out.v=0;
 if(moving.hit&&(!source||moving.dist<source.distance)){
  out.hit=true;out.dist=moving.dist;out.point.copy(moving.point);out.normal.copy(moving.normal);
  out.block=moving.block;out.face=moving.face;out.u=moving.u||0;out.v=moving.v||0;return out;
 }
 if(!source)return out;
 out.hit=true;out.dist=source.distance;out.point.copy(source.point);out.normal.copy(source.normal);out.triangle=source.triangle;
 out.block=level.blockForTriangle(source.triangle);out.face=level.data.triangleFace[source.triangle];
 if(out.face>=0){const face=level.faces[out.face],x=out.point.x-face.origin.x,y=out.point.y-face.origin.y,z=out.point.z-face.origin.z;
  out.u=x*face.u.x+y*face.u.y+z*face.u.z;out.v=x*face.v.x+y*face.v.y+z*face.v.z;}
 return out;
}
/** Keep the original analytic OBB sweep for actual moving game entities. Source
 * chart rectangles and merged object AABBs describe bookkeeping, not solids. */
export function sweepNativeLevelSphere(level,from,to,radius,out,skipGrates,sweepOBB){
 let state=dynamicViews.get(level);
 if(!state){
  const view={get blocks(){return level.blocks;},get faces(){return level.faces;},queryBlocks:(...args)=>level.queryDynamicBlocks(...args)};
  state={view,hit:{point:new THREE.Vector3(),normal:new THREE.Vector3()}};dynamicViews.set(level,state);
 }
 const source=level.triangleWorld.sweepSphere(from,to,radius,{ignoreGrates:skipGrates});
 const moving=sweepOBB(state.view,from,to,radius,state.hit,skipGrates);
 out.hit=false;out.dist=from.distanceTo(to);out.block=out.face=out.triangle=-1;out.u=out.v=0;
 if(moving.hit&&(!source||moving.dist<source.distance)){
  out.hit=true;out.dist=moving.dist;out.point.copy(moving.point);out.normal.copy(moving.normal);
  out.block=moving.block;out.face=moving.face;out.u=moving.u||0;out.v=moving.v||0;return out;
 }
 if(!source)return out;
 out.hit=true;out.dist=source.distance;out.point.copy(source.point);out.normal.copy(source.normal);out.triangle=source.triangle;
 out.block=level.blockForTriangle(source.triangle);out.face=level.data.triangleFace[source.triangle];
 if(out.face>=0){const face=level.faces[out.face],x=out.point.x-face.origin.x,y=out.point.y-face.origin.y,z=out.point.z-face.origin.z;
  out.u=x*face.u.x+y*face.u.y+z*face.u.z;out.v=x*face.v.x+y*face.v.y+z*face.v.z;}
 return out;
}

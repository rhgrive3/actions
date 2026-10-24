import * as THREE from 'three';
import { Level } from '../../../src/world/level.js';
import { nativeInkGeometry } from './native-render.mjs';
import { TriangleWorld } from './triangle-world.mjs';
import { assertSourceTerrainObjects } from './source-terrain-contract.mjs';
const DOWN = new THREE.Vector3(0,-1,0);
// Source face tints are immutable; dynamic object colors retain separate owners.
const SOURCE_NEUTRAL_COLOR = Object.freeze(new THREE.Color('#bfc3c6'));

/** Compatibility with the original Level's face/grid and dynamic box contracts.
 * Static collision remains exact triangles; chart rectangles are NEVER colliders. */
export class NativeLevel extends Level {
 constructor(data) {
  const m=data.manifest;
  assertSourceTerrainObjects(m);
  super({id:m.id,bounds:m.bounds,spawnPads:m.spawnPads,spawnBarrier:m.spawnBarrier,single:[],half:[],skipInitialSpatialHash:true});
  this.native=true;this.manifest=m;this.data=data;this.layout.nativeSource=true;
  this.homeSuperJumpPoints=this.spawnPads.map(p=>p.clone());
  this.triangleWorld=new TriangleWorld(data);this.hasRails=false;
  this.mask=data.mask;
  this.faces=m.faces.map((s,id)=>({...s,id,block:id,
   n:new THREE.Vector3(...s.n),u:new THREE.Vector3(...s.u),v:new THREE.Vector3(...s.v),origin:new THREE.Vector3(...s.origin),
   wall:Math.abs(s.n[1])<.3,turf:s.n[1]>.7,ceiling:s.n[1]<-.5,paintable:true,
   color:SOURCE_NEUTRAL_COLOR,pattern:0,groundedBottom:false,mural:-1,atlas:null,
  }));
  this.blocks=this.faces.map(f=>({
   id:f.id,nativeFace:f.id,center:f.origin.clone().addScaledVector(f.u,f.su*.5).addScaledVector(f.v,f.sv*.5),
   half:new THREE.Vector3(f.su*.5,0,f.sv*.5),axes:[f.u,f.n,f.v],
   aabbMin:new THREE.Vector3(...f.bounds[0]),aabbMax:new THREE.Vector3(...f.bounds[1]),
   solid:true,paint:true,grate:false,roof:false,rail:false,perch:false,noNav:false,hidden:false,aligned:false,
   color:f.color,faces:[f.id,-1,-1,-1,-1,-1],
  }));
  this.objectBlock=new Int32Array(m.objects.length).fill(-1);
  for(let i=0;i<m.objects.length;i++){
   const o=m.objects[i];if(!o.collidable)continue;
   const id=this.blocks.length;this.objectBlock[i]=id;
   this.blocks.push({id,nativeObject:i,center:new THREE.Vector3(...o.bounds[0]).add(new THREE.Vector3(...o.bounds[1])).multiplyScalar(.5),
    half:new THREE.Vector3(...o.bounds[1]).sub(new THREE.Vector3(...o.bounds[0])).multiplyScalar(.5),
    axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],
    aabbMin:new THREE.Vector3(...o.bounds[0]),aabbMax:new THREE.Vector3(...o.bounds[1]),
    solid:true,paint:false,grate:o.grate,roof:false,rail:false,perch:false,noNav:true,hidden:true,aligned:true,
    color:new THREE.Color('#8d9699'),faces:[-1,-1,-1,-1,-1,-1],
   });
  }
  this.staticBlockCount=this.blocks.length;
  this._buildHash();
  this._probe=new THREE.Vector3();
  this._groundHit={point:new THREE.Vector3(),normal:new THREE.Vector3()};
  this._groundOptions={minNormalY:.68};this._supportOptions={minNormalY:.68,anyHit:true,minHitY:-Infinity};
 }
 invalidateMinimapSupport(){this.minimapSupportRevision=(this.minimapSupportRevision||0)+1;}
 groundHeight(x,z,yMax=50){
  const yMin=this.triangleWorld.nodes[1]-1;
  if(yMax<yMin)return -Infinity;
  const hit=this.triangleWorld.ray(this._probe.set(x,yMax+.001,z),DOWN,yMax-yMin+1,this._groundOptions,this._groundHit);
  return hit?hit.point.y:-Infinity;
 }
 // Bot water guards need only one walkable support above the fall limit.
 // Keep groundHeight's exact origin/reach and triangle acceptance; ordinary
 // ground/spawn/controller callers continue to receive the nearest height.
 hasGroundAbove(x,z,yMax,minimumY){
  if(this.groundHeight!==NATIVE_GROUND_HEIGHT){
   const y=this.groundHeight(x,z,yMax);return y!==-Infinity&&!(y<minimumY);
  }
  const yMin=this.triangleWorld.nodes[1]-1;
  if(yMax<yMin)return false;
  this._supportOptions.minHitY=minimumY;
  return !!this.triangleWorld.ray(this._probe.set(x,yMax+.001,z),DOWN,yMax-yMin+1,this._supportOptions);
 }
 containsOnFace(face,p,tolerance=.002){
  const rel=this._relNative||(this._relNative=new THREE.Vector3());rel.copy(p).sub(face.origin);
  const a=rel.dot(face.u),b=rel.dot(face.v);
  if(a< -tolerance||b< -tolerance||a>face.su+tolerance||b>face.sv+tolerance)return false;
  // Project to the exact source triangle plane, avoiding a rectangular footprint.
  const projected=this._projNative||(this._projNative=new THREE.Vector3());
  projected.copy(p).addScaledVector(face.n,-rel.dot(face.n));
  for(const id of face.triangles)if(this.triangleWorld.triangle(id).containsPoint(projected))return true;
  return false;
 }
 containsFaceUV(face,u,v){
  if(u<0||v<0||u>face.su||v>face.sv)return false;
  // Ranked vehicles keep the existing rectangular dynamic-box contract.
  // Only original static source faces carry a source-triangle polygon.
  if(face.block>=this.staticBlockCount)return true;
  const p=this._sampleNative||(this._sampleNative=new THREE.Vector3());
  p.copy(face.origin).addScaledVector(face.u,u).addScaledVector(face.v,v);
  return this.containsOnFace(face,p,0);
 }
 pointInBlock(b,p,pad=0){return b.nativeFace!==undefined?this.containsOnFace(this.faces[b.nativeFace],p,pad):super.pointInBlock(b,p,pad);}
 pointInside(p,pad=0,exclude=-1){
  for(let i=this.staticBlockCount;i<this.blocks.length;i++){
   const b=this.blocks[i];if(b.id!==exclude&&b.solid&&super.pointInBlock(b,p,pad))return true;
  }
  return false;
 }
 /** queryBlocks() followed by the caller's own first y rejection, in the same
  * order. The xz hash stacks every level of a source stage in one 4 m column
  * (#1671: ~1100 splat and ~500 region candidates per query on Scorch). The
  * level keeps one typed copy of immutable y values per static block, so rejected
  * ids are skipped before any block object is read. The test is the caller's
  * exact expression on the same doubles: mode 0 is splat's AABB y test, mode 1
  * regionStats' face-origin test. Kept ids keep their first-cell order and
  * stamp. Rejected ids are not stamped; every query takes a new stamp, so no
  * later query can observe that. Dynamic blocks always pass to the caller. */
 queryBlocksBand(minX,minZ,maxX,maxZ,out,y,reach,mode){
  out.length=0;
  if(this._bandHash!==this.hash){this._bandHash=this.hash;this._bandLo=this._bandHi=this._bandOrigin=null;}
  if(mode===0&&!this._bandLo||mode!==0&&!this._bandOrigin)this._buildBandValues(mode);
  const st=this._nextQueryStamp(),stamps=this.blockStamp,limit=this.staticBlockCount;
  const lo=this._bandLo,hi=this._bandHi,origin=this._bandOrigin;
  const x0=this._hxi(minX),x1=this._hxi(maxX),z0=this._hzi(minZ),z1=this._hzi(maxZ);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const cell=this.hash[z*this.hw+x];
   for(let i=0;i<cell.length;i++){
    const id=cell[i];
    if(id<limit&&(mode===0?(y<lo[id]-reach||y>hi[id]+reach):Math.abs(origin[id]-y)>reach))continue;
    if(stamps[id]!==st){stamps[id]=st;out.push(id);}
   }
  }
  return out;
 }
 _buildBandValues(mode){
  // Immutable heights are owned once per static block, even when an object
  // overlaps many hash cells. Dynamic blocks retain the caller's live test.
  const n=this.staticBlockCount;
  if(mode===0){
   const lo=this._bandLo=new Float64Array(n),hi=this._bandHi=new Float64Array(n);
   for(let id=0;id<n;id++){const b=this.blocks[id];if(!b){lo[id]=-Infinity;hi[id]=Infinity;}else{lo[id]=b.aabbMin.y;hi[id]=b.aabbMax.y;}}
  }else{
   const origin=this._bandOrigin=new Float64Array(n);
   for(let id=0;id<n;id++){
    const b=this.blocks[id];if(!b){origin[id]=NaN;continue;}
    const f=b.faces,single=b.nativeFace!==undefined&&f[0]===b.nativeFace&&f[1]<0&&f[2]<0&&f[3]<0&&f[4]<0&&f[5]<0;
    origin[id]=single?this.faces[b.nativeFace].origin.y:f.every(face=>face<0)?Infinity:NaN;
   }
  }
 }
 queryDynamicBlocks(minX,minZ,maxX,maxZ,out){
  out.length=0;
  for(let i=this.staticBlockCount;i<this.blocks.length;i++){
   const b=this.blocks[i];if(b.aabbMin.x<=maxX&&b.aabbMax.x>=minX&&b.aabbMin.z<=maxZ&&b.aabbMax.z>=minZ)out.push(i);
  }
  return out;
 }
 buildGeometry(){if(!this.nativePaint)throw Error("Native paint is not initialized");return nativeInkGeometry(this,this.nativePaint);}
 blockForTriangle(id){const f=this.data.triangleFace[id];return f>=0?f:this.objectBlock[this.triangleWorld.objectIds[id]];}
}

// Preserve fallback for later instance, subclass or prototype ground overrides.
const NATIVE_GROUND_HEIGHT=NativeLevel.prototype.groundHeight;

export function initNativeGrid(paint){
 const lvl=paint.level;paint.grid=new Uint8Array(lvl.mask.length);
 paint.dead=Uint8Array.from(lvl.mask,v=>v?0:1);
 for(const f of paint.paintFaces){f.nativeEmpty=true;for(let k=f.grid;k<f.grid+f.nu*f.nv;k++)if(!paint.dead[k]){f.nativeEmpty=false;break;}}
 paint.counts=[0,0];paint.turfTotal=0;paint.turfArea=0;
 for(const f of paint.paintFaces)if(f.turf){
  const end=f.grid+f.nu*f.nv;
  for(let k=f.grid;k<end;k++)if(!paint.dead[k]){paint.turfTotal++;paint.turfArea+=f.cu*f.cv;}
 }
}

export function layoutNativePaint(paint,maxDensity){
 paint.pad=2;paint.paintFaces=paint.level.faces.filter(f=>f.paintable);
 const rects=paint.paintFaces.map((f,index)=>({f,index,w:0,h:0,x:0,y:0})),S=paint.size,pad=paint.pad;
 for(let ppm=maxDensity;ppm>.05;ppm*=.8){
  let area=0,valid=Number.isSafeInteger(S)&&S>0;
  for(const r of rects){r.w=Math.ceil(r.f.su*ppm)+pad*2;r.h=Math.ceil(r.f.sv*ppm)+pad*2;area+=r.w*r.h;if(!Number.isSafeInteger(r.w)||!Number.isSafeInteger(r.h)||r.w<0||r.h<0||!Number.isSafeInteger(area))valid=false;}
  if(!valid){if(paint._tryPack(paint.paintFaces,ppm,S)){paint.ppm=ppm;return;}continue;}
  if(area>S*S)continue;
  rects.sort((a,b)=>b.h-a.h||a.index-b.index);
  let x=0,y=0,rowH=0,fits=true;
  for(const r of rects){if(r.w>S){fits=false;break;}if(x+r.w>S){x=0;y+=rowH;rowH=0;}if(y+r.h>S){fits=false;break;}r.x=x;r.y=y;x+=r.w;rowH=Math.max(rowH,r.h);}
  if(!fits)continue;
  for(const r of rects)r.f.atlas={x:r.x,y:r.y,w:r.w,h:r.h,ppm,pad};
  paint.usedHeight=y+rowH;paint.ppm=ppm;return;
 }
 throw Error('Native ink atlas capacity exceeded');
}

import * as THREE from 'three';
import { Level } from '../../../src/world/level.js';
import { nativeInkGeometry } from './native-render.mjs';
import { TriangleWorld } from './triangle-world.mjs';
const DOWN = new THREE.Vector3(0,-1,0);

/** Compatibility with the original Level's face/grid and dynamic box contracts.
 * Static collision remains exact triangles; chart rectangles are NEVER colliders. */
export class NativeLevel extends Level {
 constructor(data) {
  const m=data.manifest;
  super({id:m.id,bounds:m.bounds,spawnPads:m.spawnPads,spawnBarrier:m.spawnBarrier,single:[],half:[]});
  this.native=true;this.manifest=m;this.data=data;this.layout.nativeSource=true;
  this.homeSuperJumpPoints=this.spawnPads.map(p=>p.clone());
  this.triangleWorld=new TriangleWorld(data);this.hasRails=false;
  this.mask=data.mask;
  this.faces=m.faces.map((s,id)=>({...s,id,block:id,
   n:new THREE.Vector3(...s.n),u:new THREE.Vector3(...s.u),v:new THREE.Vector3(...s.v),origin:new THREE.Vector3(...s.origin),
   wall:Math.abs(s.n[1])<.3,turf:s.n[1]>.7,ceiling:s.n[1]<-.5,paintable:true,
   color:new THREE.Color('#bfc3c6'),pattern:0,groundedBottom:false,mural:-1,atlas:null,
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
 }
 groundHeight(x,z,yMax=50){
  const yMin=this.triangleWorld.nodes[1]-1;
  if(yMax<yMin)return -Infinity;
  const hit=this.triangleWorld.ray(this._probe.set(x,yMax+.001,z),DOWN,yMax-yMin+1,{minNormalY:.68});
  return hit?hit.point.y:-Infinity;
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
 pointInBlock(b,p,pad=0){return b.nativeFace!==undefined?this.containsOnFace(this.faces[b.nativeFace],p,pad):super.pointInBlock(b,p,pad);}
 pointInside(p,pad=0,exclude=-1){
  for(let i=this.staticBlockCount;i<this.blocks.length;i++){
   const b=this.blocks[i];if(b.id!==exclude&&b.solid&&super.pointInBlock(b,p,pad))return true;
  }
  return false;
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
 for(let ppm=maxDensity;ppm>.05;ppm*=.8)if(paint._tryPack(paint.paintFaces,ppm,paint.size)){paint.ppm=ppm;return;}
 throw Error('Native ink atlas capacity exceeded');
}

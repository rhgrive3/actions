import fs from 'node:fs';
import {fixture} from '../../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../../scripts/inkwave-source-composition.mjs';
import {buildSourceBVH} from '../../runtime/source-convert.mjs';
export const oldWorld=fs.readFileSync(new URL('./triangle-world-ee06.mjs.txt',import.meta.url),'utf8');
export const oldPhysics=fs.readFileSync(new URL('./native-physics-ee06.mjs.txt',import.meta.url),'utf8');
export const unmodule=s=>s.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
export function geometry(){
 const verts=[],normals=[],flags=[];
 const tri=(p,n,flag=3)=>{verts.push(...p);normals.push(...n);flags.push(flag);};
 // Dense overlapping sheets exercise blocked fits; side walls and ramps cover
 // arbitrary shot directions, coplanar ties, grates and non-horizontal normals.
 for(let i=0;i<96;i++){
  const y=i*.025;
  tri([-4,y,-4,4,y,4,4,y,-4],[0,1,0],i%7===0?7:3);
  tri([-4,y,-4,-4,y,4,4,y,4],[0,1,0],i%7===0?7:3);
 }
 tri([-4,0,2,4,4,2,4,0,2],[0,0,-1]);tri([-4,0,2,-4,4,2,4,4,2],[0,0,-1]);
 tri([-4,0,-4,-4,2,4,0,2,4],[0,.89442719,-.4472136]);
 tri([0,0,0,0,0,0,0,0,0],[0,0,0]);
 const triangles=new Float32Array(verts),n=flags.length;
 return {triangles,normals:new Float32Array(normals),flags:new Uint32Array(flags),objectIds:new Uint32Array(n),...buildSourceBVH(triangles),triangleFace:new Int32Array(n).fill(-1),mask:new Uint8Array(),manifest:{id:'query-lifetime',bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},spawnPads:[[0,0,-7],[0,0,7]],spawnBarrier:0,objects:[{collidable:false}],faces:[]}};
}
export async function setup(){
 const f=await fixture({productionComposition:true,adaptRuntime:adaptBuildSource,extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';"});
 const OldWorld=new Function('THREE',unmodule(oldWorld)+'\nreturn TriangleWorld;')(f.THREE);
 const OldPhysics=new Function('THREE','Physics','Hit',unmodule(oldPhysics)+'\nreturn NativePhysics;')(f.THREE,f.Physics,f.Hit);
 const CurrentWorld=new f.NativeLevel(geometry()).triangleWorld.constructor;
 const make=(old=false)=>{const level=new f.NativeLevel(geometry());if(old)level.triangleWorld=new OldWorld(level.data);return {level,world:level.triangleWorld,physics:new (old?OldPhysics:f.NativePhysics)(level)};};
 return {...f,OldWorld,OldPhysics,CurrentWorld,make,V:(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z)};
}
export const flatten=h=>h&&typeof h==='object'?{...h,point:h.point.toArray(),normal:h.normal.toArray()}:h;

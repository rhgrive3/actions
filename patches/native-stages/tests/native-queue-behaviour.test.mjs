import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
const f=await nativeFixture(),{THREE}=f;
const levelSource=fs.readFileSync(new URL('../runtime/native-level.mjs',import.meta.url),'utf8');
const layout=new Function(levelSource.slice(levelSource.indexOf('export function layoutNativePaint')).replace('export ','')+'\nreturn layoutNativePaint;')();
const originalLayout=paint=>{paint.pad=2;paint.paintFaces=paint.level.faces.filter(f=>f.paintable);for(let ppm=paint.density;ppm>.05;ppm*=.8)if(paint._tryPack(paint.paintFaces,ppm,paint.size)){paint.ppm=ppm;return;}throw Error('Native ink atlas capacity exceeded');};
let state=219;const rnd=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);
test('native atlas record reuse retains every original rect, stable tie and ppm',()=>{
 for(let run=0;run<120;run++){
  const faces=Array.from({length:run%17===0?0:run*3},(_,i)=>({id:i,paintable:i%13!==0,su:rnd()*20,sv:i%3?rnd()*20:7})),make=()=>({level:{faces:structuredClone(faces)},density:run%2?8:4,size:run%3?128:256,_tryPack:f.PaintSystem.prototype._tryPack});
  const a=make(),b=make();originalLayout(a);layout(b,b.density);
  assert.deepEqual(structuredClone(b.level.faces),structuredClone(a.level.faces));assert.equal(b.ppm,a.ppm);assert.equal(b.usedHeight,a.usedHeight);
 }
});
const map={id:'query-queue',bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawnPads:[[0,1,-20],[0,1,20]],spawnBarrier:0,half:[],single:Array.from({length:25},(_,i)=>({kind:'box',min:[i%5*7-17,0,Math.floor(i/5)*7-17],max:[i%5*7-13,1,Math.floor(i/5)*7-13],color:'#777'}))};
test('Uint32 stamp rollover preserves unique canonical block order across repeated queries',()=>{
 const a=new f.Level(map),b=new f.Level(map),out=[];a._stamp=0xfffffffd;
 for(let i=0;i<9;i++){assert.deepEqual(Array.from(a.queryBlocks(-20,-20,20,20,out)),Array.from(b.queryBlocks(-20,-20,20,20,[])));assert.equal(new Set(out).size,out.length);}
 assert.ok(a._stamp<10);
});
test('face-restricted splats retain actual CPU claims, growth commands and grid after bypassing broadphase',()=>{
 const levels=[new f.Level(map),new f.Level(map)];levels[0].queryFaceBlock=()=>null;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.commands=[];} _pushQuad(face,...values){this.commands.push([face.id,...values]);}}
 const paints=levels.map(level=>new Cpu(null,level,{atlasSize:2048,maxDensity:4}));
 for(let i=0;i<180;i++){
  const face=levels[0].faces[i%levels[0].faces.length],point=face.origin.clone().addScaledVector(face.u,face.su*rnd()).addScaledVector(face.v,face.sv*rnd()).addScaledVector(face.n,.01),radius=.1+rnd()*1.6,opts={face:face.id,seed:rnd(),instant:i%2===0};
  const values=paints.map(paint=>paint.splat(point,radius,i%2,{...opts}));assert.equal(values[1],values[0]);assert.deepEqual(paints[1].grid,paints[0].grid);assert.deepEqual(paints[1].counts,paints[0].counts);assert.deepEqual(paints[1].commands,paints[0].commands);
 }
});
test('native object supplied AABB retains exact Three bounding sphere and tiny caster threshold',()=>{
 for(let run=0;run<80;run++){
  const count=3+run%20,vertices=new Float32Array(count*8),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++)for(let k=0;k<3;k++){vertices[i*8+k]=(rnd()-.5)*(run%4?30:.02);const x=vertices[i*8+k];min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);}
  const data={vertices,indices:new Uint32Array([0,1,2]),manifest:{sourceMode:'browser-direct',materials:{},objects:[{name:'Fld_Test',material:'Concrete',active:true,collidable:true,vo:0,vc:count,io:0,ic:3,bounds:[min,max]}]}},display=f.nativeDisplay(data,new Map(),'high'),mesh=display.group.children[0],sphere=mesh.geometry.boundingSphere.clone();mesh.geometry.computeBoundingSphere();
  assert.deepEqual(mesh.geometry.boundingSphere.center.toArray(),sphere.center.toArray());assert.equal(mesh.geometry.boundingSphere.radius,sphere.radius);assert.equal(mesh.castShadow,sphere.radius>=.025);display.dispose();
 }
});

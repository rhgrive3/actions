import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
import {buildSourceBVH} from '../runtime/source-convert.mjs';
const f=await nativeFixture(),{THREE}=f;
const source=fs.readFileSync(new URL('../runtime/native-minimap.mjs',import.meta.url),'utf8');
const build=new Function('THREE',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn buildNativeMinimap;')(THREE);
function makeLevel(withNav){
 const triangles=new Float32Array([-2,0,-2,2,0,2,2,0,-2,-2,0,-2,-2,0,2,2,0,2,-2,2,-2,2,4,2,2,4,-2,-2,2,-2,-2,2,2,2,4,2]);
 const normal=new THREE.Vector3(-.5,1,0).normalize(),normals=Float32Array.from([0,1,0,0,1,0,...normal.toArray(),...normal.toArray()]);
 const faces=[{origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:4,nv:4,cu:1,cv:1,grid:0,object:0,triangles:[0,1],bounds:[[-2,0,-2],[2,0,2]]},{origin:[-2,2,-2],u:[normal.y,-normal.x,0],v:[0,0,1],n:normal.toArray(),su:Math.sqrt(20),sv:4,nu:5,nv:4,cu:Math.sqrt(20)/5,cv:1,grid:16,object:1,triangles:[2,3],bounds:[[-2,2,-2],[2,4,2]]}];
 const data={triangles,normals,flags:new Uint32Array(4).fill(3),objectIds:new Uint32Array([0,0,1,1]),...buildSourceBVH(triangles),triangleFace:new Int32Array([0,0,1,1]),mask:new Uint8Array(36).fill(1),manifest:{id:'flip-test',bounds:{minX:-2,maxX:3,minZ:-2,maxZ:2},spawnPads:[[0,0,0],[.5,0,.5]],spawnBarrier:.1,faces,objects:faces.map(face=>({collidable:true,bounds:face.bounds}))}};
 const L=new f.NativeLevel(data);
 if(withNav)L.nativeNav={level:L,x0:0,z0:0,step:10,nx:1,nz:1,validIds:[0,1],valid:new Uint8Array([1,1]),cells:[[0,1]],nodes:[{x:0,y:0,z:0,nb:[]},{x:0,y:3,z:0,nb:[]}],nearest:()=>0};
 return L;
}
function makeMap(level,w,h){
 const map={level,paint:{dead:new Uint8Array(36),grid:new Uint8Array(36).fill(1)},w,h,s:1,flip:false,_built:false,draws:0,resets:0,_worldX(px){const B=this.level.bounds;return B.maxX-(this.flip?this.w-px:px)/this.s},_worldZ(py){const B=this.level.bounds;return B.maxZ-(this.flip?this.h-py:py)/this.s},_drawBase(){this.draws++;}};
 for(const [name,ctx]of [['canvas','ctx'],['base','bctx'],['inkC','ictx'],['flashC','fctx']]){map[name]={width:w,height:h};map[ctx]={reset(){map.resets++},createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}};}
 return map;
}
const snapshot=map=>Object.fromEntries(['hgt','topBlock','nrm','pixCell','pixFx','pixFy','pixSx','pixSy','owner'].map(key=>[key,map[key] ? Array.from(map[key]) : null]));
function pair(withNav,w,h){const L=makeLevel(withNav),cached=makeMap(L,w,h),control=makeMap(L,w,h);build(cached,true);build(control,false);return{L,cached,control};}
for(const withNav of [false,true])for(const [w,h]of [[4,4],[5,3],[1,1]])test(`team flips match fresh support bytes with signed zeros, holes and slopes: nav=${withNav} ${w}x${h}`,()=>{
 const {L,cached,control}=pair(withNav,w,h),world=L.triangleWorld;
 for(let i=0;i<6;i++){
  cached.flip=control.flip=!cached.flip;for(const m of [cached,control]){m.owner.fill(9);assert.equal(m.pixFx,null);m.inkImg.data.fill(99);m.flashImg.data.fill(77);}
  const before=world.queryCount;build(cached,true);assert.equal(world.queryCount,before,'flip-only cache must issue zero BVH queries');build(control,false);
  assert.deepEqual(snapshot(cached),snapshot(control));assert.deepEqual(cached.inkImg.data,control.inkImg.data);assert.deepEqual(cached.flashImg.data,control.flashImg.data);assert.equal(cached.resets,control.resets);assert.equal(cached.draws,control.draws);
 }
});
test('changed nav values/reachability, scale, mask owner and explicit source revision rebuild exactly',()=>{
 const {L,cached,control}=pair(true,5,4),world=L.triangleWorld;
 const changes=[()=>L.nativeNav.nodes[0].x=30,()=>L.nativeNav.nodes[0].nb.push({to:1}),()=>{cached.s=control.s=1.3;},()=>{cached.paint.dead=new Uint8Array(36).fill(1);control.paint.dead=new Uint8Array(36).fill(1);},()=>{for(let i=1;i<L.data.triangles.length;i+=3)L.data.triangles[i]+=.25;L.invalidateMinimapSupport();}];
 for(const change of changes){change();cached.flip=control.flip=!cached.flip;const before=world.queryCount;build(cached,true);assert(world.queryCount>before,'changed dependency must rebuild');build(control,false);assert.deepEqual(snapshot(cached),snapshot(control));}
});
test('custom projection caller keeps complete support rebuilds',()=>{
 const {L,cached}=pair(false,5,4);cached._worldX=()=>0;const before=L.triangleWorld.queryCount;cached.flip=true;build(cached,false);assert(L.triangleWorld.queryCount>before);assert.equal(cached._nativeSupportCache,null);
});

test('source faces share one immutable neutral color while dynamic/object colors keep independent owners',()=>{
 const a=makeLevel(false),b=makeLevel(false);assert.equal(a.faces[0].color,a.faces[1].color);assert.equal(a.faces[0].color,b.faces[0].color);assert(Object.isFrozen(a.faces[0].color));assert.equal(a.blocks[0].color,a.faces[0].color);assert.notEqual(a.blocks[a.faces.length].color,a.faces[0].color);assert.notEqual(a.blocks[a.faces.length].color,a.blocks[a.faces.length+1].color);assert.equal(a.faces[0].color.getHexString(),'bfc3c6');
});

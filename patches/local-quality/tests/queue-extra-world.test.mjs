import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {Float32Staging} from '../../../inkwave-public/src/world/attribute-staging.js';
import {adaptQueueExtraWorld} from '../queue-extra-world-adapter.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {setup,geometry,flatten} from '../../native-stages/tests/fixtures/bvh-query-fixture.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {sphereTriangleEntry} from '../../native-stages/runtime/sphere-triangle-entry.mjs';
import {parseSourceOBJ} from '../../native-stages/runtime/source-convert.mjs';
const source=fs.readFileSync(new URL('../../../inkwave-public/src/world/props-core.js',import.meta.url),'utf8');
function props(code){return new Function('THREE','Float32Staging',code.replace(/^import .*;$/gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url)).replace(/^export /gm,'')+'\nreturn {latheGeo,tubeGeo, tables:typeof radialTables===\'undefined\'?null:radialTables};')(THREE,Float32Staging);}
const digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function sameGeometry(a,b){assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));for(const k of Object.keys(a.attributes))assert.equal(digest(a.attributes[k].array),digest(b.attributes[k].array),k);assert.equal(digest(a.index.array),digest(b.index.array));a.dispose();b.dispose();}
test('real Lathe/Tube output stays byte-identical across closed/open and tessellation boundaries',()=>{
 const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-extra-world-radial-before.json',import.meta.url)));let before=source;
 for(const row of oracle){assert.equal(createHash('sha256').update(row.source).digest('hex'),row.sha256);const n=parse(before,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===row.name);before=before.slice(0,n.start)+row.source+before.slice(n.end);}
 const a=props(before),b=props(source);
 for(const n of [3,4,8,12,32,96,97,3.5])for(const closed of [false,true]){
  sameGeometry(a.latheGeo([[.2,-1],[1,0],[.5,2]],n,closed),b.latheGeo([[.2,-1],[1,0],[.5,2]],n,closed));
  sameGeometry(a.tubeGeo([[0,0,0],[0,1,1],[1,2,0]],.2,n,closed),b.tubeGeo([[0,0,0],[0,1,1],[1,2,0]],.2,n,closed));
 }
 b.tubeGeo([[0,0,0],[0,1,0]],.2,8);assert.ok(b.tables.size<=32);
 for(let n=3;n<=96;n++)b.latheGeo([[1,0],[1,1]],n);
 assert.equal(b.tables.size,32);assert.ok(!b.tables.has(97*2+1));
});
test('OBJ validates every Float32 write without a second full-array finite scan',()=>{
 const code=fs.readFileSync(new URL('../../native-stages/runtime/source-convert.mjs',import.meta.url),'utf8').replace('if(!objects.length||!allFinite)throw','if(!objects.length||!allFinite||!vertices.every(Number.isFinite))throw').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const before=new Function(code+'\nreturn parseSourceOBJ;')();
 const obj='o Fld_test\nusemtl grass\nv 0 0 0\nv 1 0 0\nv 0 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1/1 2/2/2 3/3/3\n';
 const outcome=(fn,s,compactInactiveDisplay)=>{try{const g=fn(s,undefined,{compactInactiveDisplay});return{vertices:[...g.vertices],indices:[...g.indices],objects:g.objects};}catch(e){return{error:e.message};}};
 for(const value of ['0','-0','1.1','3.4028234663852886e38','3.5e38','1e400','NaN','Infinity','-Infinity','1e-50'])for(const type of ['v ','vn ','vt '])for(let k=0;k<(type==='vt '?2:3);k++)for(const compact of [false,true]){
  const line=obj.split('\n').find(x=>x.startsWith(type)),parts=line.split(' ');parts[k+1]=value;const s=obj.replace(line,parts.join(' '));
  assert.deepEqual(outcome(parseSourceOBJ,s,compact),outcome(before,s,compact),type+value+' '+k);
 }
});
test('all five legacy layouts retain geometry bytes after static face-axis scalar selection',async()=>{
 const old=await geometryFixture({transform:(rel,s)=>rel==='src/world/level.js'?s.replace('const i = k === 0 ? 1 : 0, j = k === 2 ? 1 : 2;','const [i, j] = [0, 1, 2].filter((a) => a !== k);'):s}),now=await geometryFixture();
 for(const id of ['tidewater','kelpline','halyard','cargo','range'])for(const grate of [false,true]){
  const a=new old.Level(old.MAP_LAYOUTS[id]),b=new now.Level(now.MAP_LAYOUTS[id]);
  sameGeometry(a.buildGeometry(2048,x=>x.grate===grate),b.buildGeometry(2048,x=>x.grate===grate));
 }
});
test('TriangleWorld releases render aliases while retaining exact collision arrays and ray output',async()=>{
 const f=await setup(),data=geometry();data.vertices=new Float32Array(800);data.indices=new Uint32Array(300);
 const oldCode=fs.readFileSync(new URL('../../native-stages/runtime/triangle-world.mjs',import.meta.url),'utf8').replace('  delete this.vertices;delete this.indices;','').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const Before=new Function('THREE','sphereTriangleEntry',oldCode+'\nreturn TriangleWorld;')(f.THREE,sphereTriangleEntry);
 const w=new f.CurrentWorld(data),old=new Before(data);
 assert.equal(old.vertices,data.vertices);assert.equal(old.indices,data.indices);
 assert.equal(Object.hasOwn(w,'vertices'),false);assert.equal(Object.hasOwn(w,'indices'),false);
 for(const k of ['triangles','normals','nodes','flags','objectIds','order','triangleFace','mask'])assert.equal(w[k],data[k],k);
 data.vertices=null;data.indices=null;
 for(let i=0;i<100;i++)assert.deepEqual(flatten(w.ray(f.V(i/20-2,6,0),f.V(0,-1,0))),flatten(old.ray(f.V(i/20-2,6,0),f.V(0,-1,0))));
});
test('native object center and half retain Three.js operation order including signed zero',async()=>{
 const f=await setup();
 for(const [lo,hi] of [[[-0,0,-3],[0,-0,5]],[[-1.3,2.7,-9],[7.1,4.1,3]],[[1e20,-1e20,0],[1e20,-1e20,Number.MIN_VALUE]]]){
  const d=geometry();d.manifest.objects=[{collidable:true,bounds:[lo,hi]}];const level=new f.NativeLevel(d),b=level.blocks.at(-1);
  const center=new f.THREE.Vector3(...lo).add(new f.THREE.Vector3(...hi)).multiplyScalar(.5),half=new f.THREE.Vector3(...hi).sub(new f.THREE.Vector3(...lo)).multiplyScalar(.5);
  for(const k of ['x','y','z']){assert.ok(Object.is(b.center[k],center[k]),'center '+k);assert.ok(Object.is(b.half[k],half[k]),'half '+k);}
 }
});
test('real axis-aligned Level blocks preserve all six AABB values across finite and fallback inputs',async()=>{
 const f=await geometryFixture(),raw=fs.readFileSync(new URL('../../../inkwave-public/src/world/level.js',import.meta.url),'utf8');
 const ast=parse(raw,{ecmaVersion:'latest',sourceType:'module'}),klass=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='Level'),m=klass.body.body.find(n=>n.key.name==='_addBlock');
 const before=new Function('THREE','PATTERN','_v','return ('+raw.slice(m.start,m.end).replace(/^_addBlock/,'function')+');')(f.THREE,{plain:0},new f.THREE.Vector3());
 let seed=42;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32-.5)*1e5;
 const cases=[{min:[-0,-0,-0],max:[-0,0,0]},{min:[0,0,0],max:[Number.MIN_VALUE,1,2]},{min:[1,1,1],max:[-1,-1,-1]},{min:[NaN,0,0],max:[Infinity,1,2]}];
 for(let i=0;i<10000;i++){const min=[rand(),rand(),rand()];cases.push({min,max:min.map(v=>v+Math.abs(rand()))});}
 for(const d of cases){d.kind='box';const a={blocks:[],markCollisionChanged(){}},b={blocks:[],markCollisionChanged(){}};before.call(a,d);f.Level.prototype._addBlock.call(b,d);for(const bound of ['aabbMin','aabbMax'])for(const axis of ['x','y','z'])assert.ok(Object.is(a.blocks[0][bound][axis],b.blocks[0][bound][axis]),bound+axis);}
 const getterShape=()=>{let reads=0;return {get kind(){return ++reads<=2?'obox':'box';},get reads(){return reads;},center:[1,2,3],size:[4,5,6],rotY:37};};
 const a={blocks:[],markCollisionChanged(){}},b={blocks:[],markCollisionChanged(){}},x=getterShape(),y=getterShape();before.call(a,x);f.Level.prototype._addBlock.call(b,y);assert.equal(y.reads,x.reads);
 for(const bound of ['aabbMin','aabbMax'])for(const axis of ['x','y','z'])assert.ok(Object.is(a.blocks[0][bound][axis],b.blocks[0][bound][axis]));
});
test('Native minimap axis pruning preserves candidate selection and exact ray traces',()=>{
 const code=fs.readFileSync(new URL('../../native-stages/runtime/native-minimap.mjs',import.meta.url),'utf8');
 const make=source=>new Function('THREE',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn nativeMinimapSupport;')(THREE);
 const current=make(code),before=make(code.replace('const n=nav.nodes[id],dx=n.x-x,dz=n.z-z,reach=nav.step*1.1;\n   if(Math.abs(dx)>reach||Math.abs(dz)>reach)continue;\n   if(Math.hypot(dx,dz)<=reach)candidates.push(n);','const n=nav.nodes[id];if(Math.hypot(n.x-x,n.z-z)<=nav.step*1.1)candidates.push(n);'));
 const nodes=Array.from({length:9},(_,id)=>({x:id%3-1,z:Math.floor(id/3)-1,y:id%2})),nav={step:1,x0:-1,z0:-1,nx:3,nz:3,nodes,cells:nodes.map((_,id)=>[id])},layers={nav,reachable:new Uint8Array(9).fill(1)};
 for(let i=0;i<1200;i++){
  const x=(i%41-20)*.11,z=(i%37-18)*.13,outputs=[];
  for(const fn of [before,current]){const calls=[],level={triangleWorld:{nodes:new Float32Array([-2,0,-2,2,4,2]),ray(o,d,far,opt,out){calls.push([o.x,o.y,o.z,far]);if(o.y<.5)return null;out.point.set(o.x,0,o.z);out.normal.set(0,1,0);return out;}}};const hit=fn(level,x,z,layers);outputs.push({calls,point:hit?.point.toArray(),normal:hit?.normal.toArray()});}
  assert.deepEqual(outputs[1],outputs[0]);
 }
});

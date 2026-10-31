import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

// Source-owner regression only: real Physics/NativePhysics/TriangleWorld,
// synthetic geometry, no Character, Actor, assets or emitted-build claim.
const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const source=read('../runtime/native-physics.mjs');
const math=Object.create(Math);let hypotCalls=0;
math.hypot=(...args)=>{hypotCalls++;return Math.hypot(...args);};
const context=vm.createContext({Math:math,THREE});
const three=new vm.SyntheticModule(Object.keys(THREE),function(){
 for(const [key,value]of Object.entries(THREE))this.setExport(key,value);
},{context});
async function moduleOf(source,identifier,deps={}){
 const module=new vm.SourceTextModule(source,{context,identifier});
 await module.link(name=>name==='three'?three:deps[name]||Promise.reject(Error('Unexpected test dependency: '+name)));
 await module.evaluate();return module;
}
const physics=await moduleOf(read('../../../inkwave-public/src/game/physics.js'),'physics');
const kernel=await moduleOf(read('../runtime/sphere-triangle-entry.mjs'),'sphere-entry');
const worldModule=await moduleOf(read('../runtime/triangle-world.mjs'),'triangle-world',{'./sphere-triangle-entry.mjs':kernel});
const config=new vm.SyntheticModule(['PLAYER'],function(){this.setExport('PLAYER',{});},{context});
const native=await moduleOf(source,'native-physics',{'../../../src/game/physics.js':physics,'../../../src/config.js':config});
const {NativePhysics}=native.namespace,{TriangleWorld}=worldModule.namespace,{makeContacts}=physics.namespace;

// Frozen df8a4b8f preimage. Do not generate the oracle by undoing the candidate.
const beforeSource=String.raw`function beforeContacts(pos,radius,lift,height,c,horizontal,skipGrates,iterations){
  const w=this.world,s0=w._s0,s1=w._s1,dir=w._d,pad=radius+.002;
  for(let pass=0;pass<iterations;pass++){
   const sy0=pos.y+lift+radius,sy1=pos.y+Math.max(lift+radius,height-radius);
   s0.set(pos.x,sy0,pos.z);s1.set(pos.x,sy1,pos.z);
   let x0=pos.x-pad,y0=sy0-pad,z0=pos.z-pad,x1=pos.x+pad,y1=sy1+pad,z1=pos.z+pad,moved=false;
   min.set(x0,y0,z0);max.set(x1,y1,z1);
   // BVH builders partition equal-centre triangles differently. Collision
   // corrections are sequential, so broad-phase traversal must not choose the
   // controller result. Preserve canonical source triangle order in both the
   // worker conversion and the prepared conversion.
   const candidates=this._contactCandidates||(this._contactCandidates=[]);candidates.length=0;
   const pushCandidate=this._pushCandidate||(this._pushCandidate=id=>this._contactCandidates.push(id));
   w.queryBox(min,max,pushCandidate);if(candidates.length>1)candidates.sort(_sortAsc);
   for(const id of candidates){
    if(skipGrates&&(w.flags[id]&4))continue;
    // Earlier contacts move s0/s1: use the latest pushed capsule bounds.
    if(w.triangleOverlapsBounds?.(id,x0,y0,z0,x1,y1,z1)===false)continue;
    const t=w.triangle(id),dist=w._capsuleDistance(s0,s1,t);if(dist>=radius-SOURCE_CONTACT_EPSILON)continue;
    dir.subVectors(w._bests,w._bestp);
    if(dist<1e-8){dir.fromArray(w.normals,id*3);w._center.copy(s0).add(s1).multiplyScalar(.5).sub(t.a);if(dir.dot(w._center)<0)dir.negate();}else dir.multiplyScalar(1/dist);
    const depth=radius-dist+SOURCE_CONTACT_EPSILON,hl=Math.hypot(dir.x,dir.z),block=this.level.blockForTriangle(id);
    if(horizontal&&hl>.3&&dir.y>-.6){
     const push=depth/hl<.45?depth/hl:.45;dir.set(dir.x/hl,0,dir.z/hl);
     s0.addScaledVector(dir,push);s1.addScaledVector(dir,push);pos.addScaledVector(dir,push);
     c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;
    }else{
     s0.addScaledVector(dir,depth);s1.addScaledVector(dir,depth);pos.addScaledVector(dir,depth);
     if(dir.y>.6){c.ground=true;c.groundNormal.copy(dir);c.groundBlock=block;}
     else if(dir.y<-.6){c.ceiling=true;c.ceilingBlock=block;}
     else if(dir.y>-.6&&dir.y<.6){c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;}
    }
    x0=(s0.x<s1.x?s0.x:s1.x)-pad;y0=(s0.y<s1.y?s0.y:s1.y)-pad;z0=(s0.z<s1.z?s0.z:s1.z)-pad;
    x1=(s0.x>s1.x?s0.x:s1.x)+pad;y1=(s0.y>s1.y?s0.y:s1.y)+pad;z1=(s0.z>s1.z?s0.z:s1.z)+pad;
    moved=true;
   }
   if(!moved)break;
  }
  return c;
 }`;
const before=vm.runInContext(`const min=new THREE.Vector3(),max=new THREE.Vector3();
 const _sortAsc=(a,b)=>a-b,SOURCE_CONTACT_EPSILON=1e-4;(${beforeSource})`,context);
class Before extends NativePhysics{_nativeContacts(...args){return before.apply(this,args);}}

const triangles=[
 [-10,0,-10,10,0,-10,10,0,10],[-10,0,-10,10,0,10,-10,0,10],
 [1,-1,-10,1,4,10,1,4,-10],[1,-1,-10,1,-1,10,1,4,10],
 [-10,2,-10,10,2,10,10,2,-10],[-10,2,-10,-10,2,10,10,2,10],
 [-3,0,-2,0,1,-2,0,1,2],[-3,0,-2,0,1,2,-3,0,2],
 [-1,-1,-3,2,3,0,-1,3,3],[0,0,0,0,0,0,0,0,0],
];
function fixture(Type,{dynamic=false,override=false,throwAt=0}={}){
 const normals=[];
 for(const a of triangles){const t=new THREE.Triangle(new THREE.Vector3(...a.slice(0,3)),new THREE.Vector3(...a.slice(3,6)),new THREE.Vector3(...a.slice(6)));normals.push(...t.getNormal(new THREE.Vector3()).toArray());}
 const world=new TriangleWorld({triangles:new Float64Array(triangles.flat()),normals:new Float64Array(normals),
  nodes:new Float64Array([-10,-1,-10,10,4,10,-1,triangles.length]),order:new Uint32Array(triangles.map((_,i)=>i)),
  flags:new Uint8Array(triangles.map((_,i)=>i===8?4:0)),objectIds:new Int32Array(triangles.length)});
 const block={solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],aligned:true,
  center:new THREE.Vector3(0,.4,.7),half:new THREE.Vector3(.3,.4,.3),
  axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],
  aabbMin:new THREE.Vector3(-.3,0,.4),aabbMax:new THREE.Vector3(.3,.8,1)};
 const calls=[],failure=Error('controlled block mapping failure');
 const level={triangleWorld:world,blocks:dynamic?[{},block]:[{}],faces:[],staticBlockCount:1,
  blockForTriangle(id){calls.push(id);if(throwAt&&calls.length===throwAt)throw failure;return 0;},
  queryDynamicBlocks(_a,_b,_c,_d,out){out.length=0;if(dynamic)out.push(1);return out;}};
 const physics=new Type(level);
 if(override)physics.dynamic.collideBody=function(_p,_r,_l,_h,c){calls.push('dynamic-override');c.wall=true;c.wallBlock=9;return c;};
 return {physics,world,calls,failure};
}
function run(Type,c){
 const {physics:p,world:w,calls,failure}=fixture(Type,c.opts),a=c.args;
 const pos=new THREE.Vector3(...a.pos),contacts=makeContacts();hypotCalls=0;let error;
 try{
  if(c.entry==='body')p.collideBody(pos,a.radius,a.lift,a.height,contacts,a.horizontal,a.skip,a.iterations);
  else if(c.entry==='capsule')p.collideCapsule(pos,a.radius,a.height,contacts,a.iterations,a.skip);
  else p._nativeContacts(pos,a.radius,a.lift,a.height,contacts,a.horizontal,a.skip,a.iterations);
 }catch(e){error=e;}
 return {hypotCalls,error,failure,state:structuredClone({pos,contacts,calls,
  queryDepth:w._queryDepth,queryStacks:w._queryStacks,bestp:w._bestp,bests:w._bests,direction:w._d})};
}
function cases(){
 let seed=0x8675309;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const out=[];
 for(const entry of ['body','capsule','native'])for(const horizontal of [false,true,0,1,null,undefined,'','yes'])
  for(const skip of [false,true])for(const dynamic of [false,true])for(let i=0;i<10;i++)
   out.push({entry,opts:{dynamic},args:{pos:[random()*4-2,random()*2.3-.3,random()*4-2],radius:.15+random()*.45,lift:random()*.4,height:.7+random()*1.1,horizontal,skip,iterations:i%3+1}});
 for(const horizontal of [false,true])out.push({entry:'body',opts:{override:true},args:{pos:[.9,.1,.2],radius:.4,lift:0,height:1.4,horizontal,skip:false,iterations:3}});
 for(const horizontal of [false,true])for(const iterations of [0,1,3])out.push({entry:'native',opts:{},args:{pos:[20,20,20],radius:.38,lift:0,height:1.45,horizontal,skip:false,iterations}});
 return out;
}

test('968 native contact cases preserve exact collision/scratch/owner output while omitting unused hypot',()=>{
 let oldCalls=0,newCalls=0,reduced=0,truthy=0;
 for(const c of cases()){
  const a=run(Before,c),b=run(NativePhysics,c);
  assert.equal(a.error,undefined);assert.equal(b.error,undefined);
  assert.deepEqual(b.state,a.state);assert(b.hypotCalls<=a.hypotCalls);
  if(c.entry!=='capsule'&&c.args.horizontal){assert.equal(b.hypotCalls,a.hypotCalls);truthy++;}
  if(b.hypotCalls<a.hypotCalls)reduced++;
  oldCalls+=a.hypotCalls;newCalls+=b.hypotCalls;
 }
 assert.equal(cases().length,968);assert.equal(reduced,592);assert.equal(truthy,244);
 assert.deepEqual([oldCalls,newCalls],[1821,411]);
});
test('truthiness and horizontal branch mutations are rejected by contact outputs',()=>{
 const never=vm.runInContext('('+beforeSource.replace('hl=Math.hypot(dir.x,dir.z)','hl=0')+')',context);
 const booleanOnly=vm.runInContext('('+beforeSource.replace('hl=Math.hypot(dir.x,dir.z)','hl=horizontal===true?Math.hypot(dir.x,dir.z):0')+')',context);
 class Never extends NativePhysics{_nativeContacts(...args){return never.apply(this,args);}}
 class BooleanOnly extends NativePhysics{_nativeContacts(...args){return booleanOnly.apply(this,args);}}
 let neverCaught=0,booleanCaught=0;
 for(const c of cases())if(c.entry!=='capsule'&&c.args.horizontal){
  const reference=run(Before,c).state;
  if(!isEqual(run(Never,c).state,reference))neverCaught++;
  if(!isEqual(run(BooleanOnly,c).state,reference))booleanCaught++;
 }
 assert(neverCaught>0);assert(booleanCaught>0);
});
function isEqual(a,b){try{assert.deepEqual(a,b);return true;}catch{return false;}}
test('throwing block mapping keeps failure identity and the same partial state',()=>{
 for(const horizontal of [false,true,1,'yes']){
  const c={entry:'native',opts:{throwAt:1},args:{pos:[.9,.1,.2],radius:.4,lift:0,height:1.4,horizontal,skip:false,iterations:3}};
  const a=run(Before,c),b=run(NativePhysics,c);
  assert.equal(a.error,a.failure);assert.equal(b.error,b.failure);assert.deepEqual(b.state,a.state);
 }
});
test('signed zero, nonfinite and extreme capsule inputs retain numeric output semantics',()=>{
 for(const value of [NaN,Infinity,-Infinity,-0,0,1e-300,1e150])for(const horizontal of [false,true,1]){
  for(const field of ['radius','lift','height']){
   const c={entry:'native',opts:{},args:{pos:[.9,.1,.2],radius:.4,lift:0,height:1.4,horizontal,skip:false,iterations:3,[field]:value}};
   const a=run(Before,c),b=run(NativePhysics,c);assert.equal(a.error,undefined);assert.equal(b.error,undefined);assert.deepEqual(b.state,a.state);
  }
 }
});

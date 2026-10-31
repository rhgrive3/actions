import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,geometry,unmodule,flatten} from './fixtures/bvh-query-fixture.mjs';

const source=fs.readFileSync(new URL('../runtime/triangle-world.mjs',import.meta.url),'utf8');
const start=source.indexOf('   // Fixed axes retain the scalar read/calculation order');
const end=source.indexOf('\n   }\n   if(miss)continue;',start);
assert(start>=0&&end>start,'replace only the nonvertical fixed-axis slab block');
// Exact pre-change loop; keep its reads, short circuits and coercion fallback.
const oldLoop=`   for(let k=0;k<3;k++){
    const o=k===0?origin.x:k===1?origin.y:origin.z,d=k===0?dir.x:k===1?dir.y:dir.z;
    if(d>-1e-12&&d<1e-12){if(o<nodes[ni+k]||o>nodes[ni+3+k]){miss=true;break;}continue;}
    const a=(nodes[ni+k]-o)/d,b=(nodes[ni+3+k]-o)/d;
    if(a<=b&&typeof high==='number'&&high===high){if(a>low)low=a;if(b<high)high=b;if(high<low){miss=true;break;}}
    else if(b<=a&&typeof high==='number'&&high===high){if(b>low)low=b;if(a<high)high=a;if(high<low){miss=true;break;}}
    else{low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low){miss=true;break;}}
   }`;
const f=await setup();
const load=s=>new Function('THREE',unmodule(s)+'\nreturn TriangleWorld;')(f.THREE);
const Before=load(source.slice(0,start)+oldLoop+source.slice(end)),After=f.CurrentWorld;

test('fixed ray axes retain getter/coercion reads, early rejects and exceptions',()=>{
 const cases=[
  {origin:[0,4,0],direction:[.1,-1,.2],far:10},
  {origin:[20,4,0],direction:[0,-1,.2],far:10},
  {origin:[0,20,0],direction:[.1,0,.2],far:10},
  {origin:[0,4,20],direction:[.1,-1,0],far:10},
  {origin:[0,4,0],direction:[1e-13,-1,1e-12],far:10},
  {origin:[0,4,0],direction:[.1,-1,.2],far:NaN},
  {origin:[0,4,0],direction:[.1,-1,.2],far:'10'},
  {origin:[0,4,0],direction:[.1,-1,.2],far:'bad'},
 ];
 const run=(World,c,throwAt)=>{
  const world=new World(geometry()),reads=[];
  const track=(tag,values)=>new Proxy(values,{get(target,key){
   reads.push(tag+':'+String(key));if(reads.length===throwAt)throw Error('read failure');return target[key];
  }});
  world.nodes=track('node',world.nodes);
  const origin=track('origin',f.V(...c.origin)),direction=track('direction',f.V(...c.direction));
  let hit,error;
  try{hit=flatten(world.ray(origin,direction,c.far,{}, {point:f.V(),normal:f.V()}));}catch(e){error=[e.name,e.message];}
  return {hit,error,reads,queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 for(const c of cases){
  const expected=run(Before,c);assert.deepEqual(run(After,c),expected);
  for(const throwAt of [1,7,11,20,35,expected.reads.length])assert.deepEqual(run(After,c,throwAt),run(Before,c,throwAt));
 }
});

test('fixed ray axes preserve reentrant getter queries and mutable node observations',()=>{
 const run=World=>{
  const world=new World(geometry()),nodes=world.nodes,reads=[];let entered=false,nested;
  world.nodes=new Proxy(nodes,{get(target,key){
   reads.push(String(key));
   if(key==='0'&&!entered){
    entered=true;nested=flatten(world.ray(f.V(1,5,1),f.V(.2,-1,.3),9));
    // The outer x slab must see the mutation after the nested query returns.
    target[0]-=.25;
   }
   return target[key];
  }});
  const hit=flatten(world.ray(f.V(0,4,0),f.V(.1,-1,.2),10));
  return {hit,nested,reads,queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 assert.deepEqual(run(After),run(Before));
});

test('fixed ray axes retain non-number operand coercions for every axis',()=>{
 const run=(World,axis,mode)=>{
  const world=new World(geometry()),log=[],origin=f.V(0,4,0),direction=f.V(.1,-1,.2);
  const value=(tag,n)=>({valueOf(){log.push(tag);if(mode==='throw')throw Error('operand failure');return n;}});
  direction[axis]=value('direction.'+axis,direction[axis]);
  const far=mode==='far'?value('far',10):10;
  let hit,error;
  try{hit=flatten(world.ray(origin,direction,far));}catch(e){error=[e.name,e.message];}
  return {hit,error,log,queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 for(const axis of ['x','y','z'])for(const mode of ['number','throw','far'])assert.deepEqual(run(After,axis,mode),run(Before,axis,mode));
});

test('fixed ray axes retain exceptions from operand coercion inside the slab loop',()=>{
 const run=(World,axis,throwAt)=>{
  const world=new World(geometry()),log=[],direction=f.V(.1,-1,.2),numeric=direction[axis];let calls=0,error;
  direction[axis]={valueOf(){log.push({call:++calls,depth:world._queryDepth,queries:world.queryCount});if(calls===throwAt)throw Error('slab operand failure');return numeric;}};
  try{world.ray(f.V(0,4,0),direction,10);}catch(e){error=[e.name,e.message];}
  return {error,log,queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 for(const axis of ['x','y','z'])for(const throwAt of axis==='y'?[2,3,4]:[2,3,4,5]){
  const expected=run(Before,axis,throwAt);assert.deepEqual(run(After,axis,throwAt),expected);
  assert.deepEqual(expected.error,['Error','slab operand failure']);assert.equal(expected.queries,1);
  assert.equal(expected.log[0].queries,0,'first coercion validates the finite input');
  assert.equal(expected.log.at(-1).depth,1,'the injected exception occurs inside the acquired traversal');
  assert.equal(expected.depth,0);
 }
});

test('fixed ray axes retain far coercion exceptions, nested rays and mutations',()=>{
 const run=(World,mode,throwAt=1)=>{
  const world=new World(geometry()),log=[],origin=f.V(0,4,0),direction=f.V(.1,-1,.2);
  let calls=0,nested,hit,error;
  const far={valueOf(){
   log.push({call:++calls,depth:world._queryDepth,queries:world.queryCount});
   if(mode==='throw'&&calls===throwAt)throw Error('slab far failure');
   if(mode==='nested'&&calls===1)nested=flatten(world.ray(f.V(1,5,1),f.V(.2,-1,.3),9));
   if(mode==='mutate'&&calls===1){origin.y-=.125;direction.z=-.2;world.nodes[0]-=.25;}
   return mode==='changing'||mode==='mutate'?[10,NaN,2,8][(calls-1)%4]:10;
  }};
  try{hit=flatten(world.ray(origin,direction,far));}catch(e){error=[e.name,e.message];}
  return {hit,error,nested,log,origin:origin.toArray(),direction:direction.toArray(),rootMin:world.nodes[0],queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 for(const mode of ['throw','nested','changing','mutate'])for(const throwAt of mode==='throw'?[1,2]:[1]){
  const expected=run(Before,mode,throwAt);assert.deepEqual(run(After,mode,throwAt),expected);
  assert(expected.log.length>0);assert.equal(expected.log[0].depth,1,'far coercion first occurs in the slab traversal');
  assert.equal(expected.depth,0);
  if(mode==='throw')assert.deepEqual(expected.error,['Error','slab far failure']);
  if(mode==='nested'){assert(expected.nested);assert.equal(expected.queries,2);}
  if(mode==='changing'||mode==='mutate')assert(expected.log.length>1,'far must be coerced repeatedly');
 }
});

test('fixed ray axes retain left-associated upper indices with huge proxy stack values',()=>{
 const run=(World,nodeIndex,direction=[.1,-1,.2])=>{
  const world=new World(geometry()),reads=[];
  world._acquireStack=function(){
   this._queryDepth++;
   return new Proxy([],{get(_target,key){reads.push('stack:'+String(key));return nodeIndex;}});
  };
  let nodeReads=0;
  world.nodes=new Proxy([],{get(_target,key){
   reads.push('node:'+String(key));
   // NaN bounds admit all axes; stop at the first child read so arbitrary
   // node indices cannot start an unbounded synthetic traversal.
   if(++nodeReads===7)throw Error('after slab');return NaN;
  }});
  let error;
  try{world.ray(f.V(0,4,0),f.V(...direction),10);}catch(e){error=[e.name,e.message];}
  return {reads,error,queries:world.queryCount,triangles:world.triangleTests,depth:world._queryDepth};
 };
 for(const index of [2**50,2**51,2**52,2**53,-(2**50)])for(const direction of [[.1,-1,.2],[0,-1,.2],[.1,0,.2],[.1,-1,0]])assert.deepEqual(run(After,index,direction),run(Before,index,direction));
 const collapsed=source.replaceAll('(ni+3)+1','ni+4').replaceAll('(ni+3)+2','ni+5');
 const Collapsed=load(collapsed);
 assert.notDeepEqual(run(Collapsed,2**50),run(Before,2**50),'negative control observes changed floating-point index rounding');
});

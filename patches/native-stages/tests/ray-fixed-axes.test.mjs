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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const source=fs.readFileSync(new URL('../gyro.mjs',import.meta.url),'utf8');
const node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='consumeAttitude');
assert(node,'test executes the actual private consumeAttitude function');
const current=new Function('return ('+source.slice(node.start,node.end)+')')();
const before=new Function(fs.readFileSync(new URL('./fixtures/gyro-attitude-before-e67c636b.mjs.txt',import.meta.url),'utf8')+';return consumeAttitude;')();
let seed=276;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const quat=()=>{const a=Array.from({length:4},()=>random()*2-1),n=Math.hypot(...a);return a.map(x=>x/n);};
function exercise(fn,points,{nested=false,throws=false,replace=false}={}){
 const g={_down:[.1,.2,.3]},s={boundary:null},samples=[],snapshots=[];let depth=0;
 const failure=new Error('sample exception');
 function sample(...args){samples.push({args,down:[...this._down]});
  if(nested&&!depth){depth++;const q=Object.freeze([0,0,Math.sin(.01),Math.cos(.01)]);fn(g,{boundary:{time:0,q:[0,0,0,1]}},{time:16,q},sample);depth--;}
  if(replace)this._down=[8,9,10];
  if(throws)throw failure;
 }
 for(const point of points){const old=s.boundary;try{fn(g,s,point,sample);}catch(e){assert.equal(e,failure);assert.equal(s.boundary,old,'throw keeps prior boundary');}
  snapshots.push(s.boundary&&{ref:s.boundary,qref:s.boundary.q,value:structuredClone(s.boundary)});
 }
 for(const item of snapshots)if(item)assert.deepEqual(item.ref,item.value,'retained boundary is not mutated');
 return {samples,boundary:s.boundary,down:g._down};
}
test('scalar attitude matches frozen baseline for 12,000 normalized quaternion samples and timestamps',()=>{
 const points=Array.from({length:12000},(_,i)=>Object.freeze({time:i%53===0?i*16-32:i*16,q:Object.freeze(i%71===0?[0,0,0,i%2?-1:1]:quat())}));
 const frozen=JSON.stringify(points);assert.deepEqual(exercise(current,points),exercise(before,points));assert.equal(JSON.stringify(points),frozen);
});
test('first/duplicate/backward samples copy boundaries without calling sample',()=>{
 const points=[{time:10,q:[0,0,0,1]},{time:10,q:[1,0,0,0]},{time:5,q:[0,1,0,0]}];
 for(const fn of [before,current]){const result=exercise(fn,points);assert.equal(result.samples.length,0);assert.notEqual(result.boundary.q,points[0].q);assert.deepEqual(result.boundary,points[0]);}
});
test('nested samples, exception unwind and replaced down arrays retain baseline semantics',()=>{
 const points=[{time:0,q:[0,0,0,1]},{time:16,q:quat()},{time:33,q:quat()}];
 for(const options of [{nested:true},{throws:true},{nested:true,throws:true},{nested:true,replace:true},{replace:true,throws:true}])assert.deepEqual(exercise(current,points,options),exercise(before,points,options));
});

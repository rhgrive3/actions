import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {adaptBossGoalUpperBound} from '../bot-navigation-adapter.mjs';
// Exact extracted _bossGoal body at Git main 870872c8, not reconstructed from the candidate.
const before=fs.readFileSync(new URL('./fixtures/boss-goal-870872c8.mjs.txt',import.meta.url),'utf8');
const pin='e5cfc926da7a218b9154a73d5a307005ec18e5bd9393ac733e56a287e657578c';
assert.equal(crypto.createHash('sha256').update(before).digest('hex'),pin);
const once=(code,a,b)=>{assert.equal(code.split(a).length,2,'anchor must occur exactly once');return code.replace(a,b);};
const after=adaptBossGoalUpperBound(before,once);
class Vector{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}clone(){return new Vector(this.x,this.y,this.z);}}
function run(source,seed,{family='shooter',phase=1,stunned=false,mates=0,missing=false,blocked=false}={}){
 let randomState=seed>>>0,randomCalls=0,los=0,threats=0;const nodes=[],queries=[];
 const a={weapon:{kind:family},pos:new Vector(seed%5,0,seed%7),team:0};
 const allies=Array.from({length:mates},(_,i)=>{nodes.push({x:i*2-4,y:0,z:5});return{alive:true,bot:{goal:i}};});
 const math=Object.create(Math);math.random=()=>{randomCalls++;randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 const G={actors:[a,...allies],nav:{nodes,nearest(v){queries.push([v.x,v.y,v.z]);if(missing&&queries.length%3===0)return -1;const id=nodes.length;nodes.push({x:v.x,y:v.y,z:v.z});return id;}},
  physics:{los(from){los++;return !blocked&&Math.cos(from.x+from.z+seed)>.15;}},
  paint:{regionStats(x,y,z){return{n:1,enemy:Math.abs(Math.sin(x+z))};}}};
 const brain={a,path:['old'],_range:()=>10,_pathTo(v,maxUp){this.selected=[v.x,v.y,v.z,maxUp];}};
 const boss={pos:new Vector(0,0,0),yaw:.3,phase,stunned,hz:{threat(x,y,z){threats++;return{level:Math.sin(x*.2+z*.8+seed)>.2?1:0};}}};
 const context=vm.createContext({G,Math:math,botBehaviorKind:w=>w.kind,clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),_v:new Vector(),_v2:new Vector(),_v3:new Vector(),_stats:{}});
 const method=new vm.Script('({'+source+'})._bossGoal').runInContext(context);method.call(brain,boss);
 return {state:{selected:brain.selected||null,path:brain.path,goalTimer:brain.goalTimer,rushing:brain._rushing,randomState,randomCalls,queries,threats},los};
}
test('actual boss method retains decisions, RNG and candidate order across deterministic worlds',()=>{
 let oldRays=0,newRays=0,cases=0;
 for(const family of ['shooter','charger','roller'])for(const phase of [1,3])for(const stunned of [false,true])for(const mates of [0,3])for(let seed=1;seed<=30;seed++){
  const options={family,phase,stunned,mates,missing:seed%3===0,blocked:seed%11===0};
  const a=run(before,seed,options),b=run(after,seed,options);assert.deepEqual(b.state,a.state);assert.ok(b.los<=a.los);oldRays+=a.los;newRays+=b.los;cases++;
 }
 assert.ok(newRays<oldRays);console.log(JSON.stringify({scope:'actual extracted method; synthetic terrain, not device FPS',cases,oldRays,newRays}));
});
test('unreachable nodes and fully blocked sight lines preserve no-path behavior',()=>{
 for(let seed=31;seed<71;seed++){const a=run(before,seed,{missing:true,blocked:true}),b=run(after,seed,{missing:true,blocked:true});assert.deepEqual(b.state,a.state);}
});
test('adapter rejects missing and duplicate owner anchors',()=>{
 assert.throws(()=>adaptBossGoalUpperBound('no owner',once));assert.throws(()=>adaptBossGoalUpperBound(before+before,once));
});
test('upper bound retains candidates that can still win by the complete +3 visibility bonus',()=>{
 const mutant=after.replace('s + 3 <= bs','s <= bs');let rejected=0;
 for(let seed=1;seed<=50;seed++){const a=run(before,seed),b=run(mutant,seed);if(JSON.stringify(a.state)!==JSON.stringify(b.state))rejected++;}
 assert.ok(rejected>0,'negative control must expose an unsafe bound');
});

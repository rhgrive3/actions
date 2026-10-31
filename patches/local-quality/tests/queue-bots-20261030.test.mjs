import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const previous=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-bots-before-806a0f28.json',import.meta.url),'utf8'));
const f=await fixture({productionComposition:true,extraExports:`
export {BotBrain} from './inkwave-public/src/game/bots.js';
export {botGoalAllowed,rememberBotGoalFailure} from './patches/local-quality/bot-navigation.mjs';
export {nativePaintGoalIds} from './patches/native-stages/runtime/engine.mjs';`});
const {G,THREE}=f;
const before=new Function('G','THREE','botGoalAllowed','rememberBotGoalFailure','nativePaintGoalIds','Math',`const _v=new THREE.Vector3(),_v2=new THREE.Vector3(),_stats={};const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));return {${previous._perceive},${previous._pickPaintGoal}};`)(G,THREE,f.botGoalAllowed,f.rememberBotGoalFailure,f.nativePaintGoalIds,f.VM_MATH);
function paintScenario(fn,seed,throwing=false,nested=false){
 let value=seed;f.setRandom(()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/2**32));
 const a={pos:new THREE.Vector3(),team:0},tries=[];
 G.level={native:false,spawnPads:[new THREE.Vector3(0,0,-40),new THREE.Vector3(0,0,40)]};G.actors=[a];
 G.nav={nodes:Array.from({length:20},(_,id)=>({id,x:(id%4)*4+4,y:0,z:Math.floor(id/4)*5-10,zone:-1})),validIds:Array.from({length:20},(_,i)=>i)};
 G.paint={regionStats(_x,_y,_z,_r,_team,out){Object.assign(out,{n:5,empty:.3,enemy:.2});return out;}};
 const owner={a,t:0,_pathTo(_n,_up,id){tries.push(id);if(throwing)throw Error('path failure');if(nested&&!owner.didNested){owner.didNested=true;fn.call(owner);}return id%3===0;}};
 let error=null;try{fn.call(owner);}catch(e){error=e.message;}
 return{owner,tries,value,error,goalTimer:owner.goalTimer,path:owner.path,goal:owner.goal,failures:owner._failedGoals?.map(x=>({id:x.id,until:x.until}))};
}
test('actual composed paint shortlist preserves RNG, route attempts, tie ordering and failure memory',()=>{
 for(let seed=1;seed<=200;seed++){
  const a=paintScenario(before._pickPaintGoal,seed),b=paintScenario(f.BotBrain.prototype._pickPaintGoal,seed);
  for(const key of ['tries','value','error','goalTimer','path','goal','failures'])assert.deepEqual(b[key],a[key]);
  assert.equal(b.owner._paintChoices.length,0);assert.equal(b.owner._triedGoals.size,0);assert.equal(b.owner._mates.length,0);assert.equal(b.owner._paintChoicesBusy,false);
 }
});
test('actual composed shortlist releases ownership on throw and gives recursive calls isolated scratch',()=>{
 const failed=paintScenario(f.BotBrain.prototype._pickPaintGoal,1,true);assert.equal(failed.error,'path failure');assert.equal(failed.owner._paintChoicesBusy,false);assert.equal(failed.owner._paintChoices.length,0);assert.equal(failed.owner._triedGoals.size,0);
 const nested=paintScenario(f.BotBrain.prototype._pickPaintGoal,1,false,true);assert.equal(nested.owner.didNested,true);assert.equal(nested.error,null);assert.equal(nested.owner._paintChoicesBusy,false);assert.equal(nested.owner._paintChoices.length,0);assert.equal(nested.owner._triedGoals.size,0);
});
test('actual perception preserves target, random draws and combat scalars while avoiding losing swim-speed probes',()=>{
 function run(fn,seed){
  let state=seed,calls=0;f.setRandom(()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32));
  const a={pos:new THREE.Vector3(),team:0},enemies=Array.from({length:8},(_,i)=>({id:i,team:1,alive:true,anim:{form:'swim'},form:'squid',pos:new THREE.Vector3(2+i*.8,0,0),vel:{get x(){calls++;return i%2?10:0;},z:0}}));
  G.actors=[a,...enemies];G.physics={los:()=>true};
  const owner={a,target:enemies[seed%8],diff:{awareness:20,reaction:.5},_range:()=>10,_fatLos:()=>true,_dryLine:()=>true,react:.3,seeTimer:1,lostTimer:0};
  fn.call(owner);return{calls,state,target:owner.target?.id,direct:owner._combatDirectTarget?.id,react:owner.react,seeTimer:owner.seeTimer,acqT:owner.acqT,acqSignY:owner.acqSignY,acqSignP:owner.acqSignP};
 }
 let skipped=0;
 for(let seed=1;seed<=80;seed++){
  const a=run(before._perceive,seed),b=run(f.BotBrain.prototype._perceive,seed);skipped+=a.calls-b.calls;assert.ok(b.calls<=a.calls);delete a.calls;delete b.calls;assert.deepEqual(b,a);
 }
 assert.ok(skipped>0);
});

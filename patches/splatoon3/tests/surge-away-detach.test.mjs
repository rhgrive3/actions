import test from 'node:test';
import assert from 'node:assert/strict';
import { retireAwaySurge } from '../runtime/movement.mjs';
const P={climbDetachDot:0.1};
function scenario(){
 const surge={phase:'burst',time:16/60,armorTime:0.5,armorPending:true};
 const state={surge,armor:surge,roll:null};
 const actor={climbing:false,climbExit:0.3,vel:{x:3.2,y:3.2,z:0},
   wallN:{x:1,z:0},anim:{surgeCharge:0},s3:{surge,roll:null}};
 return {actor,state,surge};
}
test('#951 away-stick detach immediately retires active boost and its shield',()=>{
 const {actor,state,surge}=scenario();
 assert.equal(retireAwaySurge(actor,state,true,1,0,P),true);
 assert.equal(state.surge,null);assert.equal(actor.s3.surge,null);
 assert.equal(state.armor,null);assert.equal(surge.armorTime,0);
 assert.equal(surge.armorPending,false);
});
test('#951 ledge launches, ink-gap crosses, neutral wall and inward input do not retire Surge',()=>{
 for(const change of [
  ({actor})=>{actor.climbExit=0.3;actor.vel.y=8;},
  ({actor})=>{actor.climbExit=0;},
  ({actor})=>{actor.climbing=true;},
  ({state})=>{state.surge.phase='auto-climb';},
 ]){
  const f=scenario();change(f);
  assert.equal(retireAwaySurge(f.actor,f.state,true,1,0,P),false);
  assert.equal(f.state.surge,f.surge);
 }
 const f=scenario();
 assert.equal(retireAwaySurge(f.actor,f.state,true,-1,0,P),false);
 assert.equal(retireAwaySurge(f.actor,f.state,true,0,0,P),false);
 assert.equal(retireAwaySurge(f.actor,f.state,false,1,0,P),false);
});

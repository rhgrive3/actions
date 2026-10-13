import test from 'node:test';
import assert from 'node:assert/strict';
import {ClamsRule} from '../../splatoon3/runtime/ranked/clams.mjs';

function sevenSmall(){
 const engine={mode:'clams',events:[],event(kind,data){this.events.push({kind,data});}},rule=new ClamsRule(engine,{clams:{spawns:[],goals:[[5,0,0],[-5,0,0]]}}),actor={id:'source-bot',team:0,pos:[0,0,0],alive:true,grounded:true};
 rule.state.inventories[actor.id]={team:0,small:7,power:false};
 const clam={id:'eighth',kind:'small',team:null,pos:[.5,0,0],velocity:[0,0,0],grounded:true,age:0,expiresIn:null,persistent:true,thrower:null,bounces:0};rule.state.clams.push(clam);
 return {engine,rule,actor,clam};
}
test('a qualified native eighth-clam goal reaches the unchanged natural Power pickup rule',()=>{
 const {engine,rule,actor,clam}=sevenSmall();let blockedCalls=0;
 const frame={actors:[actor],inputs:{},blocked(){blockedCalls++;return true;},botGoalRoute:(row,target)=>row===actor&&target===clam.pos};
 const goal=rule.botGoal(actor,frame);assert.equal(goal.action,'collect');assert.deepEqual(goal.pos,clam.pos);assert(blockedCalls>0,'the original blocked callback remains active');
 rule.update(1/60,frame);assert.deepEqual(rule.state.inventories[actor.id],{team:0,small:0,power:true});assert(engine.events.some(e=>e.kind==='clam-power-create'));
});
for(const scope of ['legacy','ineligible native'])test(scope+' retains the original seven-small goal policy',()=>{
 const {rule,actor}=sevenSmall(),frame={actors:[actor],inputs:{},blocked:()=>false};if(scope==='ineligible native')frame.botGoalRoute=()=>false;
 assert.equal(rule.botGoal(actor,frame).action,'carry');assert.equal(rule.state.inventories[actor.id].small,7);
});
test('the native final-pickup policy cannot extend an invalid eight-small inventory',()=>{
 const {rule,actor}=sevenSmall();rule.state.inventories[actor.id].small=8;
 assert.equal(rule.botGoal(actor,{actors:[actor],blocked:()=>false,botGoalRoute:()=>true}).action,'carry');
});

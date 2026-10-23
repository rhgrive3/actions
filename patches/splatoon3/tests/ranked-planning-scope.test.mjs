import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {installRankedBots} from '../runtime/ranked/bots.mjs';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const loadNav=()=>new Function('THREE','PLAYER','buildNativeNav','buildNativeNavAsync',read('inkwave-public/src/game/nav.js').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return NavGraph;')(THREE,{},()=>{},()=>{});
const NavGraph=loadNav();
function nav(){const graph=Object.create(NavGraph.prototype);graph.nodes=Array.from({length:12},(_,id)=>({id,x:id,y:0,z:0,zone:-1,nb:[]}));for(const node of graph.nodes)for(const d of [-1,1])if(graph.nodes[node.id+d])node.nb.push({to:node.id+d,cost:1,type:'walk'});graph.validIds=graph.nodes.map(n=>n.id);graph.nearest=p=>Math.max(0,Math.min(11,Math.round(p.x)));return graph;}
test('planning memo preserves detached routes, null, limits, teams, callbacks and synchronous scope cleanup',()=>{
 const graph=nav();const calls=()=>graph._stamp||0;
 graph.withPathMemo(function(){
  const first=graph.path(0,8,0);first[1]=99;assert.deepEqual(graph.path(0,8,0),[0,1,2,3,4,5,6,7,8]);assert.equal(calls(),1);
  assert.equal(graph.path(-1,8,0),null);assert.equal(graph.path(-1,8,0),null);assert.equal(calls(),1);assert.equal(graph._pathMemo.length,2);
  graph.path(0,8,1);graph.path(0,8,0,1);assert.equal(calls(),3);
  let accepts=0;const accept=()=>{accepts++;return true};graph.path(0,8,0,6000,accept);const at=accepts;graph.path(0,8,0,6000,accept);assert.equal(accepts,at*2);assert.equal(calls(),5);
  const outer=graph._pathMemo;graph.withPathMemo(()=>{assert.notEqual(graph._pathMemo,outer);graph.path(0,8,0)});assert.equal(graph._pathMemo,outer);assert.equal(calls(),6);graph.path(0,8,0);assert.equal(calls(),6);
 });
 assert.equal(graph._pathMemo,undefined);graph.path(0,8,0);assert.equal(calls(),7);
 assert.throws(()=>graph.withPathMemo(()=>{throw Error('plan failed')}),/plan failed/);assert.equal(graph._pathMemo,undefined);assert(graph._pathMemoPool.every(rows=>rows.length===0));
 const custom=graph._pathUncached;graph._pathUncached=function(...args){return custom.apply(this,args)};graph.withPathMemo(()=>assert.equal(graph._pathMemo,undefined),'custom source fallback');
});
function brainClass(G,math){return new Function('THREE','G','clamp','angleDiff','PLAYER','DIFFICULTY','SUB','Math',read('inkwave-public/src/game/bots.js').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return BotBrain;')(THREE,G,(n,a,b)=>Math.max(a,Math.min(b,n)),(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a)),{inkMax:100,hp:100},{normal:{reaction:.2,fireDiscipline:.7,aimError:.1}}, {bomb:{inkCost:50}},math);}
function actor(){return{team:0,slot:0,nid:'bot',alive:true,grounded:true,pos:new THREE.Vector3(),vel:new THREE.Vector3(),yaw:0,aimPoint:new THREE.Vector3(),ink:100,hp:100,groundTeam:0,lastDamage:1,weapon:{kind:'roller',range:10},weaponRunner:{},intent:{move:new THREE.Vector3()},specialReady:()=>true};}
function environment(graph){const G={nav:graph,actors:[],level:{spawnPads:[new THREE.Vector3(-10,0,0),new THREE.Vector3(10,0,0)]},paint:{regionStats(x,y,z,r,t,out){return Object.assign(out,{n:1,own:x>2?1:0,enemy:0,empty:1})}},physics:{los:()=>true},match:{playing:()=>true}};return G;}
function prepare(brain){Object.assign(brain,{think:100,mode:'paint',goalTimer:10,repath:10,path:[0,1],pi:1,sweep:0});brain._fatLos=()=>true;brain._dryLine=()=>true;brain._edgeGuard=()=>{};brain._nearWater=()=>false;}
test('counterexample: discarding base steering changes retained special and random draw order',()=>{
 const result=[];
 for(const skip of [false,true]){const graph=nav();graph.nodes[1].x=5;const G=environment(graph),math=Object.create(Math);math.random=()=>.5;const Brain=brainClass(G,math),a=actor(),b=new Brain(a);G.actors=[a];prepare(b);let calls=0;math.random=()=>[.5,.001,.9][calls++%3];b._tail=()=>{};if(skip)b._steer=()=>new THREE.Vector3();b.update(1/60);result.push({special:a.intent.special,draws:calls});}
 assert.deepEqual(result,[{special:true,draws:2},{special:false,draws:1}]);
});
test('counterexample: base jump-edge steering owns a jump flag consumed by the retained tail',()=>{
 const result=[];for(const skip of [false,true]){const graph=nav();graph.nodes[1].y=.6;graph.edgeType=()=> 'jump';const G=environment(graph),math=Object.create(Math);math.random=()=>.5;const Brain=brainClass(G,math),a=actor();a.specialReady=()=>false;const b=new Brain(a);G.actors=[a];prepare(b);b.jumpCd=0;if(skip)b._steer=()=>new THREE.Vector3();b.update(1/60);result.push(a.intent.jump);}assert.deepEqual(result,[true,false]);
});
test('ranked same-tick path sharing preserves actual BotBrain route, random, action, spring and progress state',()=>{
 const runs=[];
 for(const memo of [false,true]){
  let seed=81,calls=0,searches=0;const math=Object.create(Math);math.random=()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)};
  const graph=nav(),G=environment(graph),Brain=brainClass(G,math),a=actor();graph.validIds=[8];a.weapon={kind:'shooter',range:12};a.specialReady=()=>true;G.actors=[a];const b=new Brain(a);prepare(b);b.path=null;b.goalTimer=0;
  G.match.ranked={mode:'zones',frame:{actors:[],inputs:{}},rule:{botGoal:()=>({pos:[8,0,0],action:'paint'})}};installRankedBots({G,BotBrain:Brain});
  if(!memo)graph.withPathMemo=undefined;
  const states=[];for(let tick=0;tick<300;tick++){b.update([1/30,1/60,1/120][tick%3]);states.push(JSON.parse(JSON.stringify({path:b.path,pi:b.pi,goal:b.goal,mode:b.mode,repath:b.repath,goalTimer:b.goalTimer,bestD:b.bestD,noProg:b.noProg,laT:b._laT,needJump:b._needJump,jumpCd:b.jumpCd,sweep:b.sweep,aimYaw:b.aimYaw,aimPitch:b.aimPitch,mvMag:b.mvMag,mvYaw:b.mvYaw,intent:a.intent,draws:calls})));}
  runs.push({states,searches:graph._stamp});
 }
 assert.deepEqual(runs[1].states,runs[0].states);assert(runs[1].searches<runs[0].searches,'duplicate ordinary/objective endpoint searches are shared');
});

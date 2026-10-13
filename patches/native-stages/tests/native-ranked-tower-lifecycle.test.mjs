import test from 'node:test';import assert from 'node:assert/strict';import {installRankedBots} from '../../splatoon3/runtime/ranked/bots.mjs';
class V{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x=0,y=0,z=0){Object.assign(this,{x,y,z});return this;}copy(v){return this.set(v.x,v.y,v.z);}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}length(){return Math.sqrt(this.lengthSq());}}
function setup(mode,action){const a={team:0,slot:0,alive:true,grounded:true,groundTeam:0,ink:100,pos:new V(),yaw:0,aimPoint:new V(),intent:{move:new V(),fire:false,jump:false,squid:false,sub:false,special:false}},engine={mode,stage:{tower:{halfSize:.8}},frame:{actors:[],blocked:()=>false},rule:{botGoal:()=>({pos:[5,0,0],action})}},G={level:{native:true},match:{ranked:engine,playing:()=>true}};class Brain{constructor(){this.a=a;this.path=null;this.pi=0;this.repath=0;this.jumpCd=0;}update(){this._tail(1/60,this._steer(),0,0,6,false);} _steer(){return new V();} _pathTo(){return false;} _tail(dt,move){a.intent.move.copy(move);}}installRankedBots({G,BotBrain:Brain});const b=new Brain();b._nativeTowerBoarding={phase:'hop',proof:{start:[-5,0,0]}};return{a,b,engine};}
for(const mode of ['zones','rainmaker','clams'])test('stale Tower state cannot steer '+mode,()=>{const{a,b}=setup(mode,'collect');b.update(1/60);assert.equal(b._nativeTowerBoarding,null);assert(a.intent.move.x>0);});
test('defend action does not use a retained ride approach',()=>{const{a,b}=setup('tower','defend');b.update(1/60);assert(a.intent.move.x>0);});
test('death clears a retained Tower boarding owner before base update',()=>{const{a,b}=setup('tower','ride');a.alive=false;b.update(1/60);assert.equal(b._nativeTowerBoarding,null);});

// Exercise the real installed helper, rather than only the late steering gate.
test('installed Tower boarding releases early input ownership on defend and null goals',async()=>{
 const {nativeFixture}=await import('./fixture.mjs'),f=await nativeFixture(),V=f.THREE.Vector3,G=f.G;
 const a={team:0,slot:0,alive:true,grounded:false,groundTeam:0,ink:100,pos:new V(),vel:new V(),yaw:0,aimPoint:new V(),intent:{move:new V(),fire:false,jump:false,squid:false,sub:false,special:false}};
 let action='ride';const engine={mode:'tower',stage:{tower:{halfSize:.8}},frame:{actors:[],blocked:()=>false},rule:{botGoal:()=>action?{pos:[5,1,0],action}:null}},world={towerBlock:{center:new V(0,0,0)},_towerDeckTop:1,towerBlockId:4};
 G.level={native:true};G.nav={nodes:[],validIds:[]};G.match={mode:'tower',ranked:engine,rankedWorld:world,playing:()=>true};
 class Brain{constructor(){this.a=a;this.path=null;this.pi=0;this.repath=0;this.jumpCd=0;}update(){a.intent.jump=false;this._tail(1/60,new V(),0,0,6,false);} _steer(){return new V();} _pathTo(){return false;} _tail(dt,move){a.intent.move.copy(move);}}
 f.installRankedBots({G,BotBrain:Brain,PLAYER:f.PLAYER});const b=new Brain(),state=()=>({phase:'hop',seconds:0,proof:{start:[-5,0,0],end:[-4,1,0],jumping:true},target:{x:0,y:1,z:0},level:G.level,nav:G.nav,world,engine});
 b._nativeTowerBoarding=state();b.update(1/60);assert(a.intent.move.x<0&&a.intent.jump,'the actual early helper supplies the original ride hop');
 action='defend';b.update(1/60);assert.equal(b._nativeTowerBoarding,null);assert(a.intent.move.x>0&&!a.intent.jump,'current defend selection owns ordinary inputs');
 action='ride';b._nativeTowerBoarding=state();b.update(1/60);assert(a.intent.jump);
 action=null;b.update(1/60);assert.equal(b._nativeTowerBoarding,null);assert.equal(a.intent.jump,false);assert.equal(a.intent.move.lengthSq(),0,'null goal resumes the ordinary base tail');
});

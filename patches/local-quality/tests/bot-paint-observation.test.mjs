import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptBotPaintObservation} from '../bot-paint-observation-adapter.mjs';

async function setup({old=false,boss=false}={}) {
  const f=await fixture({extraExports:"export * from './inkwave-public/src/game/bots.js';",adaptNative:(rel,s)=>old?adaptSource(rel,s):adaptBotPaintObservation(rel,adaptSource(rel,s))});
  f.setRandom(()=>.5);
  function newBrain() {
    const a=f.make('shooter'); a.specialReady=()=>false;
    const brain=new f.BotBrain(a); brain.think=0;
    brain._perceive=()=>{}; brain._bossPerceive=()=>{};
    brain._pickPaintGoal=brain._pickRefill=brain._bossGoal=()=>{brain.path=[0];brain.pi=0;brain.goalTimer=100;brain.repath=100;};
    brain._steer=()=>new f.THREE.Vector3(); brain._pathRemaining=()=>0;
    return brain;
  }
  const brain=newBrain(), a=brain.a;
  f.G.boss=boss?{hz:{threat:()=>({level:0,ringIn:-1,beam:false,cover:false})},stunned:false}:null;
  let calls=0,own=0,enemy=.5;
  f.G.paint={regionStats(_x,_y,_z,_r,_team,out){calls++;return Object.assign(out,{n:10,own,enemy,empty:0});}};
  return {f,a,brain,newBrain,calls:()=>calls,setPaint:(o,e)=>{own=o;enemy=e;},tick:(n=1)=>{for(let i=0;i<n;i++)brain.update(1/60);}};
}
for(const boss of [false,true]) test(`${boss?'Boss':'Turf'} tactical scans follow perception rather than 60Hz`,async()=>{
  const current=await setup({boss}),old=await setup({old:true,boss});
  current.tick(60);old.tick(60);
  assert.equal(old.calls(),60);assert(current.calls()<=7,`${current.calls()} scans`);
  assert.equal(current.a.intent.fire,old.a.intent.fire);
  // Same fixed ticks under 30/60/120Hz presentation grouping.
  const counts=[];
  for(const groups of [2,1,.5]) {const x=await setup({boss});let accumulated=0;for(let frame=0;frame<60/groups;frame++){accumulated+=groups;while(accumulated>=1){x.tick();accumulated--;}}counts.push(x.calls()*7);}
  assert.deepEqual(counts,[current.calls()*7,current.calls()*7,current.calls()*7]);
});
test('paint changes become visible on the next perception; immediate ground ink and refill remain live',async()=>{
  const x=await setup();x.tick();assert.equal(x.a.intent.fire,true);
  x.setPaint(1,0);x.tick();assert.equal(x.a.intent.fire,true);
  x.tick(14);assert.equal(x.a.intent.fire,false);
  x.a.ink=0;x.tick();assert.equal(x.brain.mode,'refill');assert.equal(x.a.intent.fire,false);
  const b=await setup({boss:true});b.setPaint(1,0);b.tick();assert.equal(b.a.intent.fire,false);
  b.a.groundTeam=2;b.tick();assert.equal(b.a.intent.fire,true);
});
test('cache copies shared output and invalidates team, context, large movement, reset and inactive intervals',async()=>{
  const x=await setup();x.tick();const b=x.brain;
  const query=()=>b._observePaintRegion('turf',0,0,4,3);
  const first=query();x.setPaint(1,0);
  new x.f.BotBrain(x.f.make('shooter'))._observePaintRegion('turf',0,0,4,3);
  assert.equal(first.own,0);
  let n=x.calls();x.a.team=1;query();assert.equal(x.calls(),n+1);
  n=x.calls();b._observePaintRegion('turf',3,0,4,3);assert.equal(x.calls(),n+1);
  n=x.calls();b._observePaintRegion('boss',3,0,4,2.5);assert.equal(x.calls(),n+1);
  x.a.alive=false;x.tick();assert.equal(b._paintObservation,null);
  x.a.alive=true;b._wasDead=false;query();b.reset();assert.equal(b._paintObservation,null);
  query();x.a.superJumpState={};x.tick();assert.equal(b._paintObservation,null);
  x.a.superJumpState=null;query();x.f.G.match.playing=()=>false;x.tick();assert.equal(b._paintObservation,null);
});
test('source anchors reject unknown and repeated application',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js',import.meta.url),'utf8');
 assert.throws(()=>adaptBotPaintObservation('src/game/bots.js',raw.replace('this._bossPerceive(boss);','unknown();')),/conflict/);
 assert.throws(()=>adaptBotPaintObservation('src/game/bots.js',adaptBotPaintObservation('src/game/bots.js',raw)),/conflict/);
});

test('seven independent brains reduce actual shared paint-query counts in Turf and Boss',async()=>{
 for(const boss of [false,true]) {
   const fixed=await setup({boss}),old=await setup({boss,old:true});
   for(const x of [fixed,old]) {
     const brains=[x.brain,...Array.from({length:6},()=>x.newBrain())];
     for(let t=0;t<60;t++)for(const brain of brains)brain.update(1/60);
     assert(brains.every(b=>b.a.intent.fire));
   }
   assert.equal(old.calls(),420); assert(fixed.calls()<=49);
 }
});
test('positive initial think still samples immediately, then actual perception can switch to combat',async()=>{
 const x=await setup();x.brain.think=.1;x.tick();assert.equal(x.calls(),1);
 const enemy=x.f.make('shooter');enemy.team=1;enemy.pos.set(0,0,8);x.f.G.actors=[x.a,enemy];
 x.brain._perceive=x.f.BotBrain.prototype._perceive;
 x.brain._pathTo=()=>{x.brain.repath=100;};x.brain._edgeGuard=()=>{};
 x.tick();assert.equal(x.brain.target,null);
 x.tick(7);assert.equal(x.brain.target,enemy);assert.equal(x.brain.mode,'fight');
 assert.equal(x.calls(),1,'combat perception does not force another paint observation');
});
test('Boss beam threat remains current while the paint observation is cached',async()=>{
 const x=await setup({boss:true});x.tick();const n=x.calls();
 x.a.groundTeam=1;x.brain.thSeen=-1;
 x.f.G.boss.hz.threat=()=>({level:0,ringIn:-1,beam:true,cover:false});
 x.tick();assert.equal(x.a.intent.squid,true);assert.equal(x.a.intent.fire,false);assert.equal(x.calls(),n);
});

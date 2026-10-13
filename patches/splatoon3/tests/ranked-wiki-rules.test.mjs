import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine, validRankedSnapshot } from '../runtime/ranked/engine.mjs';
import { CLAM_BARRIER_BREAK_SECONDS } from '../runtime/ranked/clams.mjs';
import { canCollectClam, canThrowClam, canCollectRainmaker } from '../runtime/ranked/clams.mjs';

// Expected transitions come from S3mix's S3-specific rule pages, not from a
// duplicate implementation. Fixtures establish prior game state; no browser
// or Nintendo hardware fidelity is claimed by these isolated regressions.
const clamStage = {id:'wiki-clams',clams:{spawns:[],goals:[[0,0,1.5],[0,0,-1.5]]}};
const rmStage = {id:'wiki-rm',rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[[0,0,5]],[[0,0,-5]]],retreatZ:[-5,5]}};
const actor = (team=0,extra={}) => ({id:`p${team}`,team,alive:true,grounded:true,pos:[0,0,0],...extra});
const frame = actors => ({actors,inputs:{},floorAt:()=>0});
function scoredClams() {const e=new RankedEngine('clams',clamStage);e.counts=[20,80];e.leader=0;e.rule.state.scoredPoints=[80,20];return e;}
function heldRainmaker() {const e=new RankedEngine('rainmaker',rmStage),a=actor();e.update(1/60,{...frame([a]),barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});assert.equal(e.rule.state.carrier,a.id);return {e,a};}
function flyingPower(e,team) {return e.rule._newClam('power',team,[0,.55,team===0?1.5:-1.5],{grounded:false,velocity:[0,0,0],ownerTeam:team});}

for (const dt of [1/60,.05,.2]) {
 test(`losing attack window starts overtime without another Power Clam (${dt}s)`,()=>{
  const e=scoredClams();e.rule._openBasket(1,[0,0,-1.5]);e.time=dt;e.update(dt,frame([]));
  assert.equal(e.overtime,true);assert.equal(e.winner,null);assert.equal(e.rule.state.overtime.opportunityTimer,null);
  e.update(10,frame([]));assert.equal(e.winner,0);assert.equal(e.reason,'clam-overtime-chance-ended');
 });
 test(`winning attack window alone is not a losing opportunity (${dt}s)`,()=>{
  const e=scoredClams();e.counts=[40,80];e.rule._openBasket(0,[0,0,1.5]);e.time=dt;e.update(dt,frame([]));
  assert.equal(e.overtime,false);assert.equal(e.winner,0);
 });
 test(`winning attack closure leaves a valid counterattack alive (${dt}s)`,()=>{
  const e=scoredClams();e.counts=[40,80];e.rule._openBasket(0,[0,0,1.5]);e.rule.state.inventories.p1={team:1,small:0,power:true};e.time=dt;e.update(dt,frame([]));
  assert.equal(e.overtime,true);e.update(10-dt,frame([]));assert.equal(e.winner,null);
  assert.equal(e.rule.state.baskets[0].barrierOpen,false);assert(e.rule.state.clams.some(c=>c.counterPower&&c.team===1));
 });
 test(`unbroken Rainmaker checkpoint blocks bypass counts (${dt}s)`,()=>{
  const {e,a}=heldRainmaker();a.pos=[3,0,9];e.update(dt,frame([a]));
  assert.equal(e.rule.state.checkpoint.passed[0],false);assert.equal(e.counts[0],50);
 });
 test(`ordinary airborne travel never improves Rainmaker count (${dt}s)`,()=>{
  const {e,a}=heldRainmaker();a.pos=[0,4,3];a.grounded=false;e.update(dt,frame([a]));assert.equal(e.counts[0],100);
  a.pos=[0,0,3];a.grounded=true;e.update(dt,frame([a]));assert.equal(e.counts[0],70);
 });
 test(`pickup-relative retreat accelerates before the prohibited boundary (${dt}s)`,()=>{
  const {e,a}=heldRainmaker();a.pos=[0,0,-1];const before=e.rule.state.holderTime;e.update(dt,frame([a]));
  assert.equal(e.rule.state.retreatRate,4);assert(Math.abs(e.rule.state.holderTime-before-4*dt)<1e-7);
  a.pos=[0,0,1];e.update(dt,frame([a]));assert.equal(e.rule.state.retreatRate,1);
 });
}
test('enemy-side timeout keeps last grounded position and has a three-second pickup lock',()=>{
 const {e,a}=heldRainmaker();a.pos=[0,0,3];e.update(.1,frame([a]));e.rule.state.holderTime=59.999;e.update(1/60,frame([a]));
 assert.deepEqual(e.rule.state.pos,[0,0,3]);assert.equal(e.rule.state.carrier,null);assert.equal(e.rule.state.barrier.active,false);
 const snap=e.snapshot();assert(validRankedSnapshot(snap));const restored=new RankedEngine('rainmaker',rmStage);assert(restored.restore(snap));
 restored.update(2.9,frame([a]));assert.equal(restored.rule.state.carrier,null);assert.equal(restored.rule.state.barrier.active,false);
 restored.update(.1,frame([]));assert.equal(restored.rule.state.barrier.active,true);
});
test('popped initial-center shield remains available; intact noncentral shield does not return',()=>{
 const e=new RankedEngine('rainmaker',rmStage);e.update(1/60,{actors:[],barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});e.update(20,frame([]));assert.equal(e.rule.state.barrier.active,false);
 const held=heldRainmaker();held.a.pos=[0,0,3];held.e.update(.1,frame([held.a]));held.a.alive=false;held.e.update(1/60,frame([held.a]));held.e.update(30,frame([]));
 assert.deepEqual(held.e.rule.state.pos,[0,0,3]);assert.equal(held.e.rule.state.barrier.active,true);
});
test('later equal Clam score rebounds one count at close without changing the penalty basis',()=>{
 const e=scoredClams();e.counts=[77,100];e.rule._openBasket(1,[0,0,-1.5]);e.rule._score(1,'small',[0,0,-1.5]);assert.deepEqual(e.counts,[77,77]);
 e.rule._closeBasket(1);assert.deepEqual(e.counts,[77,78]);assert.equal(e.penalties[1],11.5);
});
test('zone, tower and Rainmaker possession loss share the later-equal-count correction',()=>{
 for(const mode of ['zones','tower','rainmaker']) {
  const stage=mode==='zones'?{id:'z',zones:[{center:[0,0,0],size:[4,4]}]}:mode==='tower'?{id:'t',tower:{path:[[-10,0,0],[0,0,0],[10,0,0]],centerIndex:1,speed:1,checkpoints:[[],[]]}}:rmStage;
  const e=new RankedEngine(mode,stage);e.counts=[50,50];e.leader=0;
  if(mode==='zones'){e.rule.state.zones[0].team=1;e.rule.state.controllingTeam=1;e.update(1/60,{zoneCoverage:[[.5,.5]]});}
  else if(mode==='tower'){e.rule.state.controllingTeam=1;e.rule._setController(0);}
  else{e.rule.state.carrier='p1';e.rule.state.carrierTeam=1;e.rule._drop(null,'death');}
  assert.deepEqual(e.counts,[50,51],mode);
 }
});
test('checkpoint timer pauses at the marker and recovers gradually only after movement away',()=>{
 const stage={id:'t',tower:{path:[[-10,0,0],[0,0,0],[10,0,0]],centerIndex:1,speed:1,checkpoints:[[{progress:.5,count:6}],[]]}};
 const e=new RankedEngine('tower',stage),a=actor(0,{onTower:true});e.update(6,frame([a]));const initial=e.rule.state.checkpointProgress[0][0];assert(initial>0);
 e.update(3.1,frame([]));assert.equal(e.rule.state.pathDistance,15);assert.equal(e.rule.state.checkpointProgress[0][0],initial);
 e.update(.1,frame([actor(1,{onTower:true})]));assert(e.rule.state.checkpointProgress[0][0]>0);assert(e.rule.state.checkpointProgress[0][0]<initial);
 e.update(3,frame([]));assert.equal(e.rule.state.checkpointProgress[0][0],0);
});
test('occupied spawn locations do not receive overlapping groups',()=>{
 const e=new RankedEngine('clams',{...clamStage,clams:{...clamStage.clams,spawns:Array.from({length:30},(_,i)=>[i*3,0,0])}});e.update(24,frame([]));assert.equal(e.rule.state.clams.length,30);
 e.rule.state.clams=e.rule.state.clams.filter(c=>c.pos[0]!==0);e.update(12,frame([]));assert.equal(e.rule.state.clams.filter(c=>Math.abs(c.pos[0])<.5).length,3);
});
test('a Power Clam is consumed during drilling but scores only when the barrier actually breaks',()=>{
 const e=new RankedEngine('clams',clamStage);flyingPower(e,0);e.update(1/60,frame([]));assert.deepEqual(e.counts,[100,100]);assert.equal(e.rule.state.clams.length,0);
 const snapshot=e.snapshot();assert(validRankedSnapshot(snapshot));const restore=new RankedEngine('clams',clamStage);assert(restore.restore(snapshot));
 restore.update(CLAM_BARRIER_BREAK_SECONDS-.01,frame([]));assert.deepEqual(restore.counts,[100,100]);restore.update(.02,frame([]));assert.deepEqual(restore.counts,[80,100]);
});
test('last drilling Power Clam does not qualify at regulation end, but an admitted overtime throw can complete',()=>{
 const e=scoredClams();flyingPower(e,1);e.time=.1;e.update(.1,frame([]));assert.equal(e.overtime,false);assert.equal(e.winner,0);
 const o=scoredClams();o.rule.state.inventories.p1={team:1,small:0,power:true};o.time=1/60;o.update(1/60,frame([]));assert(o.overtime);
 o.rule.state.inventories.p1.power=false;flyingPower(o,1);o.update(.1,frame([]));assert.equal(o.winner,null);o.update(1.2,frame([]));assert.equal(o.rule.state.baskets[1].barrierOpen,true);assert.equal(o.winner,null);
});
test('a drill that cannot finish within the twenty-second opportunity still loses',()=>{
 const e=scoredClams();e.rule.state.inventories.p1={team:1,small:0,power:true};e.time=1/60;e.update(1/60,frame([]));e.update(19.5,frame([]));
 e.rule.state.inventories.p1.power=false;flyingPower(e,1);e.update(.5,frame([]));assert.equal(e.winner,0);
});
test('near-simultaneous drills admit only the first completed attack and return the other Power Clam',()=>{
 const e=new RankedEngine('clams',clamStage);flyingPower(e,0);flyingPower(e,1);e.update(1/60,frame([]));e.update(1.2,frame([]));
 assert.equal(e.rule.state.baskets.filter(b=>b.barrierOpen).length,1);assert.deepEqual(e.counts,[80,100]);assert(e.rule.state.clams.some(c=>c.kind==='power'&&c.team===1));
});
test('special tables admit pickups, forbid throws, and require deployment where documented',()=>{
 for(const special of ['zipcaster','crabTank','krakenRoyale','slam']){assert.equal(canCollectClam({special}),false);assert.equal(canThrowClam({special}),false);}
 for(const special of ['trizooka','booyahBomb','inkjet','reefslider','ultraStamp','inkVac','tripleInkstrike']){assert.equal(canCollectClam({special}),true);assert.equal(canThrowClam({special}),false);}
 for(const special of ['storm','tentaMissiles','waveBreaker','tacticooler','superChump','splattercolorScreen']){assert.equal(canThrowClam({special}),false);assert.equal(canThrowClam({special,specialDeployed:true}),true);}
 for(const special of ['reefslider','zipcaster','inkjet','booyahBomb'])assert.equal(canCollectRainmaker({special}),false);
});
test('actual collection and throw paths apply special restrictions and allow a physical airborne catch',()=>{
 const e=new RankedEngine('clams',clamStage),a=actor(0,{special:'crabTank'});e.rule._newClam('small',null,[0,0,0]);e.update(1/60,frame([a]));assert.equal(e.rule.state.inventories.p0.small,0);
 a.special='booyahBomb';a.grounded=false;e.update(1/60,frame([a]));assert.equal(e.rule.state.inventories.p0.small,1);
 e.update(1/60,{...frame([a]),inputs:{p0:{throw:true,aim:[0,0,1]}}});assert.equal(e.rule.state.inventories.p0.small,1);
});
test('special drop removes every held small clam and a Power Clam once per lifecycle event',()=>{
 const e=new RankedEngine('clams',clamStage),a=actor(0,{special:'krakenRoyale',clamDrop:1});e.rule.state.inventories.p0={team:0,small:7,power:false};e.update(1/60,frame([a]));assert.equal(e.rule.state.inventories.p0.small,0);assert.equal(e.rule.state.clams.length,7);
 e.update(1/60,frame([a]));assert.equal(e.rule.state.clams.length,7);
});
test('Power Clam terrain landing and counter creation emit ink without ordinary-clam ink',()=>{
 const e=new RankedEngine('clams',clamStage);e.rule._newClam('power',0,[4,.001,0],{grounded:false,velocity:[0,-1,0]});e.rule._newClam('small',null,[5,.001,0],{grounded:false,velocity:[0,-1,0]});e.update(.1,frame([]));
 assert.equal(e.events.filter(x=>x.kind==='clam-paint').length,1);e.rule._counterPower(1,[0,0,0],frame([]));assert.equal(e.events.filter(x=>x.kind==='clam-paint').length,2);
});
test('negative respawn and malformed pending-break snapshots cannot replace live rules',()=>{
 const {e}=heldRainmaker();const s=e.snapshot();s.rule.respawnRemaining=-1;assert.equal(e.restore(s),false);
 const c=new RankedEngine('clams',clamStage),p=c.snapshot();p.rule.baskets[0].pendingBreak={remaining:99,pos:[0,0,0],sequence:1};assert.equal(c.restore(p),false);
});

test('noncentral return starts a full reformation lock instead of consuming it in the return tick',()=>{
 const {e,a}=heldRainmaker();a.pos=[0,0,3];e.update(.1,frame([a]));a.alive=false;e.update(1/60,frame([a]));e.update(3,frame([]));
 e.update(1/60,{...frame([]),barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});e.rule.state.dropTimer=14.999;e.update(1/60,frame([]));
 assert.deepEqual(e.rule.state.pos,[0,0,0]);assert.equal(e.rule.state.respawnRemaining,3);
});
test('opening at the drilling boundary grants the complete ten-second chance',()=>{
 const e=new RankedEngine('clams',clamStage);flyingPower(e,0);e.update(1/60,frame([]));e.update(1.2,frame([]));
 assert(Math.abs(e.rule.state.baskets[0].openTimer-10)<1e-7);
});
test('a barrier opening on the last scoreless-overtime tick takes priority over the tiebreak',()=>{
 const e=new RankedEngine('clams',clamStage);e.time=1/60;e.update(1/60,frame([]));e.rule.state.generatedPower=[0,3];
 e.rule.state.overtime.elapsed=180-1/60;e.overtimeElapsed=180-1/60;e.rule.state.baskets[0].pendingBreak={remaining:1/60,pos:[0,0,1.5],sequence:0};e.update(1/60,frame([]));
 assert.equal(e.winner,0);assert.equal(e.reason,'clam-overtime-score');assert.deepEqual(e.counts,[80,100]);
});

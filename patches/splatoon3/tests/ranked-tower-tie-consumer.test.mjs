import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { fixture } from './source-fixture.mjs';

// S3mix Rainmaker, count progression (page last-modified 2026-08-21):
// https://wikiwiki.jp/splatoon3mix/ガチホコバトル#hcdd4134
// Its later-equal-score +1 rule explicitly also applies to other ranked modes.
// The existing shared resolveTie contract is exercised through a complete
// TowerRule.update, not only _setController; the subsequent scorer must not
// erase the correction. No retail frame/rail-distance fidelity is asserted.
const stage = {id:'tower-tie-consumer',tower:{path:[[-10,0,0],[0,0,0],[10,0,0]],centerIndex:1,speed:1,checkpoints:[[],[]]}};
const rider = team => ({id:String(team),team,alive:true,grounded:false,onTower:true,pos:[0,0,0]});
const frame = (...teams) => ({actors:teams.map(rider)});
function advance(e, seconds, dt, ...teams) {
  while(seconds>1e-9){const step=Math.min(seconds,dt);e.update(step,frame(...teams));seconds-=step;}
}
function tied(first, dt) {
  const e=new RankedEngine('tower',stage), later=1-first;
  // Both counts are earned through riders. The fractional .05 distance leaves
  // room inside the count bin, so a tiny return step cannot mask the bug.
  advance(e,5.05,dt,first);
  assert.equal(e.counts[first],50);assert.equal(e.leader,first);
  advance(e,5.05/1.2+5.05,dt,later);
  assert.deepEqual(e.counts,[50,50]);assert.equal(e.rule.state.controllingTeam,later);
  return {e,later};
}
for(const dt of [1/60,.05,.2])for(const first of [0,1]) {
  test(`tower later tie survives ordinary neutralization, repeats and snapshot restore (${dt}, first ${first})`,()=>{
    const {e,later}=tied(first,dt);
    advance(e,1,dt,first,later);assert.deepEqual(e.counts,[50,50]);
    assert.equal(e.rule.state.controllingTeam,later,'contest retains prior owner');
    advance(e,4.9,dt);assert.deepEqual(e.counts,[50,50],'empty but still owned');
    advance(e,.2,dt);assert.equal(e.rule.state.controllingTeam,-1);
    assert.equal(e.counts[first],50);assert.equal(e.counts[later],51);
    advance(e,.2,dt);assert.equal(e.counts[later],51,'later neutral updates cannot reaward count');
    const restored=new RankedEngine('tower',stage);assert.equal(restored.restore(e.snapshot()),true);
    advance(restored,.1,dt);assert.equal(restored.counts[later],51);
    // Reacquiring possession may earn the tied count again, once the rider
    // reaches that position; losing it again restores +1, never +2.
    for(let repeat=0;repeat<2;repeat++){
      for(let tick=0;tick<120&&restored.counts[later]===51;tick++)advance(restored,1/60,1/60,later);
      assert.deepEqual(restored.counts,[50,50]);assert.equal(restored.leader,first);
      advance(restored,5.05,dt);assert.equal(restored.counts[later],51);
    }
  });
  test(`tower opponent capture preserves later tie adjustment and overtime winner (${dt}, first ${first})`,()=>{
    const {e,later}=tied(first,dt);e.time=dt;
    e.update(dt,frame(first,later));assert.equal(e.overtime,true);assert.equal(e.overtimeTeam,later);
    e.update(dt,frame(first));
    assert.equal(e.counts[first],50);assert.equal(e.counts[later],51);
    assert.equal(e.winner,first);assert.equal(e.reason,'tower-retaken');
  });
  test(`tower overtime neutralization preserves corrected result (${dt}, first ${first})`,()=>{
    const {e,later}=tied(first,dt);e.time=dt;e.update(dt,frame(first,later));
    advance(e,5.1,dt);assert.equal(e.winner,first);assert.equal(e.reason,'tower-neutralized');
    assert.equal(e.counts[later],51);assert.equal(e.result().counts[first],50);
  });
}

async function production() {
  const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:`
    export { Match } from './inkwave-public/src/game/match.js';
    export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
    export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  `});
  f.context.structuredClone=structuredClone;f.installRanked(f.installedRuntime);
  const actors=[0,1].map(team=>{const a=f.make('shooter');Object.assign(a,{nid:team,team,slot:team,grounded:false,_rankedOnTower:false});return a;});
  const events=[],m=Object.assign(Object.create(f.Match.prototype),{mode:'tower',state:'playing',paused:false,follower:false,
    ranked:new f.RankedEngine('tower',stage),actors,local:actors[0],rankedBarrierHits:[],rankedGains:[0,0],
    rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){}},
    rankedEffects:{event(){},update(){}},setState(state){this.state=state;}});
  const play=m.playRankedEvents;m.playRankedEvents=function(list,...rest){events.push(...list);return play.call(this,list,...rest);};
  f.G.match=m;f.G.netm=null;
  const tick=(seconds,...teams)=>{for(const a of actors)a._rankedOnTower=teams.includes(a.team);while(seconds>1e-9){const dt=Math.min(seconds,1/60);f.G.time+=dt;m.advanceRanked(dt);seconds-=dt;}};
  return {...f,m,events,tick};
}
test('installed Match.advanceRanked/buildFrame preserves tie correction through scoring and host snapshot delivery',async()=>{
  const f=await production();
  // Real installed consumer and actor-to-frame mapping. Only display/effects
  // are inert; the platform contact signal is supplied by this rule fixture.
  f.tick(5.05,0);f.tick(5.05/1.2+5.05,1);assert.deepEqual(Array.from(f.m.ranked.counts),[50,50]);
  f.tick(5.1);assert.deepEqual(Array.from(f.m.ranked.counts),[50,51]);
  assert.equal(f.events.filter(e=>e.kind==='tie-adjust').length,1);
  const corrected=f.m.ranked.snapshot();
  const guestEngine=new f.RankedEngine('tower',stage),guest=Object.assign(Object.create(f.Match.prototype),{
    mode:'tower',state:'playing',paused:false,follower:true,ranked:guestEngine,actors:[],local:null,time:300,
    rankedBarrierHits:[],rankedGains:[0,0],rankedWorld:f.m.rankedWorld,rankedEffects:f.m.rankedEffects,
    setState(state){this.state=state;}});
  const session={myId:'guest',hostId:'host',isHost:false,_members:new Set(['host','guest']),tr:{broadcast(){},sendTo(){}}};
  const net=new f.NetMatch(session,{id:'tower-tie-wire',map:'tidewater'});net.bind(guest);f.G.netm=net;f.G.match=guest;
  const packet={k:'st',s:'playing',t:corrected.time,rk:{match:'tower-tie-wire',host:'host',state:corrected,gains:[0,0]}};
  net.onMessage('not-host',packet);assert.deepEqual(Array.from(guestEngine.counts),[100,100]);
  net.onMessage('host',packet);assert.deepEqual(Array.from(guestEngine.counts),[50,51]);
  const revision=guestEngine.revision;guest.advanceRanked(.2);
  assert.equal(guestEngine.revision,revision,'follower does not authoritatively rescore');
  assert.deepEqual(Array.from(guestEngine.counts),[50,51]);
});

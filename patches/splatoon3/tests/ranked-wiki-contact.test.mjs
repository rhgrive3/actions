import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Run unchanged against source and actual emitted/minified pure rule modules.
const root = process.env.INKWAVE_WIKI_AUDIT_SITE;
const { RankedEngine, validRankedSnapshot } = await import(root
  ? pathToFileURL(path.resolve(root, 'patches/splatoon3/runtime/ranked/engine.mjs'))
  : '../runtime/ranked/engine.mjs');
const stage = {
  id: 'wiki-contact',
  rainmaker: { center: [0,0,0], goals: [[0,0,10],[0,0,-10]], checkpoints: [[],[]] },
  tower: { path: [[0,0,-100],[0,0,0],[0,0,100]], centerIndex: 1, speed: 2, checkpoints: [[],[]] },
  clams: { spawns: [], goals: [[0,0,10],[0,0,-10]] },
  zones: [{ center: [0,0,0], size: [4,4] }],
};
const actor = (team, pos) => ({ id: 'carrier', team, pos, alive: true, grounded: true });
function held(team = 0) {
  const e = new RankedEngine('rainmaker', stage), a = actor(team, [0,0,0]);
  e.update(1/60, { actors: [a], barrierHits: [{ team, damage: 1000, kind: 'Shooter' }] });
  assert.equal(e.rule.state.carrier, a.id);
  a.pos = stage.rainmaker.goals[team].slice();
  return { e, a };
}
for (const team of [0,1]) for (const hz of [30,60,120]) {
  test(`Rainmaker grounded goal remains vulnerable for 30F: team ${team}, caller ${hz}Hz`, () => {
    const { e,a } = held(team);
    e.update(1/hz, { actors: [a] });
    assert.equal(e.winner, null, 'touching the goal is not an instant knockout');
    assert.equal(e.counts[team], 1);
    // The entry observation starts the hold; its elapsed interval preceded it.
    e.update(e.rule.state.goalHold.remaining - 1/60, { actors: [a] });
    assert.equal(e.winner, null);
    e.update(1/60, { actors: [a] });
    assert.equal(e.winner, team);
    assert.equal(e.knockout, true);
  });
}
test('death on the dunk completion tick cancels knockout; remaining carrier timer also stays lethal', () => {
  for (const loss of ['death','timeout']) {
    const {e,a} = held(); e.update(1/60, { actors: [a] });
    e.update(29/60, { actors: [a] });
    if (loss === 'death') a.alive = false;
    else e.rule.state.holderTime = 60 - 1/120;
    e.update(1/60, { actors: [a] });
    assert.equal(e.winner, null, loss);
    assert.equal(e.rule.state.carrier, null);
    assert.equal(e.rule.state.goalHold, null);
    assert.equal(e.counts[0], 1);
  }
});
test('leaving the goal or losing grounded support cancels the hold and requires a fresh 30F', () => {
  for (const loss of ['departure','airborne']) {
    const {e,a} = held(); e.update(1/60, { actors: [a] }); e.update(.3, { actors: [a] });
    if (loss === 'departure') a.pos = [5,0,10]; else a.grounded = false;
    e.update(1/60, { actors: [a] }); assert.equal(e.rule.state.goalHold, null);
    a.pos = [0,0,10]; a.grounded = true;
    e.update(1/60, { actors: [a] }); e.update(.49, { actors: [a] }); assert.equal(e.winner, null);
    e.update(.01, { actors: [a] }); assert.equal(e.winner, 0);
  }
});
test('goal entry clears a pending shot and the holding phase cannot charge or fire', () => {
  const {e,a} = held(); a.pos = [0,0,6];
  e.update(61/60, { actors: [a], inputs: { carrier: { fire: true, aim: [0,0,1] } } });
  // Release with zero elapsed time queues the pre-shot phase.
  e.rule.update(0, { actors: [a], inputs: { carrier: { fire: false } } });
  assert.ok(e.rule.state.charge.pending);
  a.pos = [0,0,10]; e.update(1/60, { actors: [a], inputs: { carrier: { fire: false } } });
  assert.equal(e.rule.state.charge.pending, null);
  assert.equal(e.events.filter(x => x.kind === 'rainmaker-shot').length, 0);
  e.update(.2, { actors: [a], inputs: { carrier: { fire: true } } });
  assert.equal(e.rule.state.charge.seconds, 0);
});
test('an unbroken checkpoint and an airborne arrival cannot enter the goal hold', () => {
  const s = structuredClone(stage); s.rainmaker.checkpoints = [[[0,0,5]],[[0,0,-5]]];
  const e = new RankedEngine('rainmaker', s), a = actor(0,[0,0,0]);
  e.update(1/60,{actors:[a],barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});
  a.pos=[0,0,10]; e.update(1,{actors:[a]}); assert.equal(e.rule.state.goalHold,null); assert.equal(e.winner,null);
  const h=held(); h.a.grounded=false; h.e.update(1,{actors:[h.a]}); assert.equal(h.e.rule.state.goalHold,null);
});
test('mid-dunk host handoff preserves remaining time; malformed holds reject atomically; old snapshots restore', () => {
  const {e,a}=held(); e.update(1/60,{actors:[a]}); e.update(.2,{actors:[a]});
  const snap=e.snapshot(), follower=new RankedEngine('rainmaker',stage);
  assert.ok(follower.restore(snap)); follower.update(.29,{actors:[a]}); assert.equal(follower.winner,null);
  follower.update(.01,{actors:[a]}); assert.equal(follower.winner,0);
  for(const remaining of [-.1,.501,NaN,'0.2']) {
    const bad=structuredClone(snap); bad.rule.goalHold.remaining=remaining;
    const clean=new RankedEngine('rainmaker',stage), before=clean.snapshot();
    assert.equal(validRankedSnapshot(bad),false); assert.equal(clean.restore(bad),false); assert.deepEqual(clean.snapshot(),before);
  }
  const old=structuredClone(snap); delete old.rule.goalHold;
  const clean=new RankedEngine('rainmaker',stage); assert.ok(clean.restore(old)); assert.equal(clean.rule.state.goalHold,null);
});
for (const owner of [0,1]) test(`empty Tower return counts the neutralization-crossing interval once, owner ${owner}`,()=>{
  const e=new RankedEngine('tower',stage), r=e.rule;
  r.state.pathDistance=owner===0?90:110; r.state.position=[0,0,owner===0?-10:10];
  r.state.controllingTeam=owner; r.state.emptySeconds=4.9;
  r.update(.2,{actors:[]});
  assert.ok(Math.abs(r.state.pathDistance-(owner===0?90.32:109.68))<1e-9);
  assert.equal(r.state.controllingTeam,-1);
});
test('empty attacking-side Tower waits until the 5s boundary and then uses only residual return time',()=>{
  const e=new RankedEngine('tower',stage),r=e.rule;
  r.state.pathDistance=110;r.state.controllingTeam=0;r.state.emptySeconds=4.9;
  r.update(.2,{actors:[]}); assert.ok(Math.abs(r.state.pathDistance-109.84)<1e-9);
});
test('Zones recent-loss overtime retains the same continuous 10s neutral clock across time-up',()=>{
  const e=new RankedEngine('zones',stage),r=e.rule;
  e.counts=[80,50];e.leader=1;
  r.update(0,{zoneCoverage:[[.7,.3]]});r.update(0,{zoneCoverage:[[.5,.5]]});
  r.update(9,{zoneCoverage:[[.5,.5]]});e.time=1/60;
  e.update(1/60,{zoneCoverage:[[.5,.5]]});assert.equal(e.overtime,true);
  e.update(.9,{zoneCoverage:[[.5,.5]]});assert.equal(e.winner,null);
  e.update(.1,{zoneCoverage:[[.5,.5]]});assert.equal(e.winner,1);
  assert.equal(e.reason,'zones-neutral-timeout');
});
for (const kind of ['small','power']) test(`swept airborne ${kind} pickup uses the actual contact point`,()=>{
  const e=new RankedEngine('clams',stage),r=e.rule;
  const a=actor(0,[0,0,0]);a.id='receiver';
  const c=r._newClam(kind,0,[-.104,.9,.715],{grounded:false,velocity:[12.48,0,0],thrower:'sender',ownerTeam:0});
  assert.ok(Math.hypot(c.pos[0],c.pos[2])>.72,'start is outside the body pickup sphere');
  e.update(1/60,{actors:[a],floorAt:()=>0});
  assert.equal(r.state.clams.length,0); assert.equal(kind==='power'?r.state.inventories.receiver.power:r.state.inventories.receiver.small,kind==='power'?true:1);
});
test('swept contact keeps enemy Power Clam, restricted-special, held-Power and wall exclusions',()=>{
  for(const negative of ['enemy','special','inventory','wall','miss']) {
    const e=new RankedEngine('clams',stage),r=e.rule,a=actor(0,[0,0,0]);a.id='receiver';
    if(negative==='special')a.special='crabTank';
    if(negative==='inventory')r.state.inventories.receiver={team:0,small:0,power:true};
    r._newClam('power',negative==='enemy'?1:0,[-.104,.9,negative==='miss'?.73:.715],{grounded:false,velocity:[12.48,0,0],thrower:'sender',ownerTeam:0});
    e.update(1/60,{actors:[a],floorAt:()=>0,blocked:()=>negative==='wall'});
    assert.equal(r.state.clams.length,1,negative);
  }
});

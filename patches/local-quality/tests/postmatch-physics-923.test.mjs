// #923: production-composed Turf TIME UP/JUDGE must not simulate live gameplay.
// Compile the actual patched Match.update body without mocking its patcher.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { simulateMatchInterval, terminalTurfGameplayParked } from '../../splatoon3/runtime/turf-finish.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const composed = rel => adaptBuildSource(rel, read(rel));
const match = composed('src/game/match.js');

function matchUpdate() {
  const start = match.indexOf('  update(dt) {');
  const end = match.indexOf('\n  updateController(dt) {', start);
  assert.ok(start >= 0 && end > start, 'extract complete production Match.update method');
  const method = match.slice(start, end);
  assert.match(method, /!this\.bossMode && !this\.ranked && !this\.attract/);
  // The original class method shorthand is also valid within an object literal.
  const G = { netm: null };
  return new Function('G', 'PLAYER', 'MATCH', 'emit',
    `return ({\n${method}\n}).update;`)(G, { radius: .4 }, { finalCountdown: 10 }, () => {});
}

test('#923 finish/judge advance state clocks without any Turf actor/physics work', () => {
  const update = matchUpdate();
  for (const state of ['finish', 'judge']) {
    let calls = 0;
    const actor = { bot: false, alive: true, update() { calls++; }, pos: {x:0,y:0,z:0} };
    const m = {
      paused: false, state, stateT: 0, result: {}, follower: false,
      actors: [actor, actor], ranked: null, attract: false, bossMode: null,
    };
    for (let n = 0; n < 462; n++) update.call(m, 1/60);
    assert.ok(Math.abs(m.stateT-462/60)<1e-7, state + ' presentation clock advances');
    assert.equal(calls, 0, state + ' skips both actor updates and soft push');
  }
});

test('#923 original gameplay and special modes keep their live update ownership', () => {
  const update = matchUpdate();
  const scenarios = [
    {state: 'intro'},
    {state: 'playing'},
    {state: 'finish', boss: true},
    {state: 'judge', ranked: true},
    {state: 'finish', attract: true},
  ];
  for (const s of scenarios) {
    let calls = 0, bossCalls = 0;
    const actor = { bot: false, alive: true, update() { calls++; }, pos: {x:0,y:0,z:0} };
    const m = {
      state: s.state, stateT: 0, result: {}, follower: false, time: 100,
      paused: false, actors: [actor], ranked: s.ranked ? {} : null,
      attract: !!s.attract, bossMode: s.boss ? {boss: {dead: false}, update(){ bossCalls++; }} : null,
      bossCfg: { finishWin: 2, finishLose: 2 },
    };
    update.call(m, 1/60);
    assert.equal(calls, 1, JSON.stringify(s));
    if (s.boss) assert.equal(bossCalls, 1, 'boss simulation stays active');
  }
});

function interval(state, { boss=false, ranked=false, attract=false, paused=false, mode='turf' } = {}) {
  const steps=[];
  const m={
    state, mode, paused, time:100, follower:false,
    bossMode:boss?{dead:false}:null,
    ranked:ranked?{time:100,overtime:false}:null,
    attract,
    controller:null,update(dt){steps.push(['actor',dt]);},
    updateController(dt){steps.push(['controller',dt]);},
    advanceRanked(dt){steps.push(['ranked',dt]);},
  };
  const G={time:100, projectiles:{update(dt){steps.push(['projectile',dt]);}}};
  simulateMatchInterval(m,1/60,G);
  return {m,G,steps,projectiles:steps.filter(([kind])=>kind==='projectile')};
}

test('#923 authoritative fixed-step Turf projectile owner parks after TIME UP but preserves live and special modes', () => {
  for(const state of ['finish','judge']){
    const {m,projectiles,steps}=interval(state);
    assert.equal(terminalTurfGameplayParked(m),true);
    assert.equal(projectiles.length,0,'no projectile advancement in Turf '+state);
    assert.ok(steps.some(([kind])=>kind==='actor'),'match clock/judge update still occurs');
  }
  for(const state of ['playing','intro']){
    const {m,projectiles}=interval(state);
    assert.equal(terminalTurfGameplayParked(m),false);
    assert.equal(projectiles.length,1,'live state '+state);
  }
  for(const flags of [{boss:true},{ranked:true},{attract:true},{mode:'clams'}]){
    const {m,projectiles}=interval('finish',flags);
    assert.equal(terminalTurfGameplayParked(m),false);
    assert.equal(projectiles.length,1,'non-Turf simulation remains unchanged: '+JSON.stringify(flags));
  }
  const paused=interval('finish',{paused:true});
  assert.equal(paused.projectiles.length,0,'pause always freezes projectiles');
});

test('#923 legal final fractional tick still updates projectiles exactly up to authoritative Turf deadline', () => {
  const emitted=[],states=[];
  const m={
    state:'playing', mode:'turf', time:0.5/60,paused:false,bossMode:null,
    ranked:null,attract:false,follower:false,controller:null,
    update(dt){states.push(['update',this.state,dt]);this.time=Math.max(0,this.time-dt);},
    updateController(dt){states.push(['controller',this.state,dt]);},
    setState(state){this.state=state;states.push(['setState',state]);},
    advanceRanked(){},
  };
  const G={time:1,projectiles:{update(dt){emitted.push([m.state,dt]);}}};
  simulateMatchInterval(m,1/60,G);
  assert.equal(m.state,'finish');
  assert.equal(emitted.length,1,'only the legal first half generates gameplay projectiles');
  assert.equal(emitted[0][0],'playing');
  assert.ok(Math.abs(emitted[0][1]-0.5/60)<1e-12);
  assert.equal(states.filter(([type])=>type==='update').length,2,'finish/judge clock advances in the remainder');
  assert.ok(Math.abs(G.time-1)<1e-12,'authoritative clock restored');
});

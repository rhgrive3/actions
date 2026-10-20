// #923: production-composed Turf TIME UP/JUDGE must not simulate live gameplay.
// Compile the actual patched Match.update body without mocking its patcher.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const composed = rel => adaptBuildSource(rel, read(rel));
const match = composed('src/game/match.js');
const main = composed('src/main.js');

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

test('#923 projectiles stop at Turf terminal boundary without parking presentation or other modes', () => {
  const sourceLine = main.split('\n').find(line => line.includes('G.projectiles.update(dt);'));
  assert.match(sourceLine, /if \(!m\.paused && \(m\.bossMode \|\| m\.ranked \|\| m\.attract/);
  const run = new Function('m', 'G', 'dt', sourceLine);
  let calls = 0;
  const G = {projectiles: {update(){calls++;}}};
  for (const state of ['playing', 'intro', 'finish', 'judge']) {
    const m = {state, paused: false, bossMode: null, ranked: null, attract: false};
    const before = calls; run(m, G, 1/60);
    assert.equal(calls-before, Number(state==='playing'||state==='intro'), state);
  }
  for (const mode of ['bossMode', 'ranked', 'attract']) {
    const m = {state:'finish', paused:false, bossMode:null, ranked:null, attract:false, [mode]: mode==='attract'?true:{}};
    const before = calls; run(m,G,1/60);
    assert.equal(calls, before+1, mode+' keeps its own simulation');
  }
  const m = {state:'playing', paused:true};
  run(m,G,1/60); assert.equal(calls, 5, 'pausing always wins');
});

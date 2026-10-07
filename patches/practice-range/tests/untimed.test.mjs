// Practice Range has no match clock: a range match built through the real Match (setup + update + the installer's
// wrappers) with the 90 s Turf War length that startMatch() passes must stay 'playing' past 90 s (and past 180 s),
// never emitting the turf-war last-minute / countdown / time's-up states. A normal Turf War built the same way still
// ends on its own clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

async function realm() {
  const R = await rangeRealm();
  class FakeGame { async boot() {} _buildWorld() {} _updateHud() {} }
  if (!R.__installed) { R.installPracticeRange(FakeGame); R.__installed = true; }
  return R;
}
const input = { mobile: null, mouse: { dx: 0, dy: 0 }, down: () => false, wasPressed: () => false, padButton: () => false, padValue: () => 0, padPressed: new Set(), padStick() {}, pad: null };
const rig = { yaw: 0, pitch: 0, mode: 'follow', follow() {} };

function build(R, opts) {
  const { G, Match, Character } = R;
  rangeWorld(R);
  G.paint.coverage = () => [0.4, 0.3];
  const m = new Match({ attract: false, difficulty: 'normal', mode: 'turf', weapon: 'shooter', playerName: 'tester', CharacterClass: Character, rig, input, noBots: true, ...opts });
  G.match = m;
  m.setup();
  return m;
}

test('a range match given the 90 s Turf War length stays playing past 90 s and 180 s', async () => {
  const R = await realm();
  const states = [], events = [];
  const offs = [R.on('match:state', ({ state, match }) => states.push([match.opts.range ? 'range' : 'turf', state])),
    R.on('match:oneminute', () => events.push('oneminute')), R.on('match:count', ({ n }) => events.push('count' + n))];
  try {
    const m = build(R, { duration: 90, range: true, rangeHeadless: true });
    assert.ok(m.range, 'range session created');
    assert.equal(m.duration, R.RANGE_MATCH_TIME); assert.equal(m.time, R.RANGE_MATCH_TIME);
    m.start();
    assert.equal(m.state, 'playing');
    for (let i = 0; i < 200 * 60; i++) { R.G.time += 1 / 60; m.update(1 / 60); }
    assert.equal(m.state, 'playing', 'still playing after 200 simulated seconds');
    assert.equal(m.result, null, 'never judged');
    assert.equal(m.time, R.RANGE_MATCH_TIME);
    assert.deepEqual(states, [['range', 'playing']], 'no finish / judge / results transition');
    assert.deepEqual(events, [], 'no turf-war last-minute or final countdown');
    m.dispose();
  } finally { offs.forEach((u) => u()); }
});

test('a Turf War with the same 90 s length still ends on its own clock', async () => {
  const R = await realm();
  const states = [];
  const off = R.on('match:state', ({ state, match }) => { if (!match.opts.range) states.push(state); });
  try {
    const m = build(R, { duration: 90 });
    assert.equal(m.range, undefined);
    assert.equal(m.duration, 90);
    m.setState('playing');
    for (let i = 0; i < 89 * 60; i++) m.update(1 / 60);
    assert.equal(m.state, 'playing');
    for (let i = 0; i < 2 * 60; i++) m.update(1 / 60);
    assert.equal(m.state, 'finish', 'TIME UP at 90 s');
    for (let i = 0; i < 3 * 60; i++) m.update(1 / 60);
    assert.equal(m.state, 'judge');
    assert.deepEqual(states, ['playing', 'finish', 'judge']);
    m.dispose();
  } finally { off(); }
});

test('the HUD never formats the unbounded range clock; finite clocks still render', async () => {
  const R = await realm();
  const { HUD } = R;
  assert.ok(HUD, 'HUD exported by the realm');
  const calls = [];
  const hud = Object.create(HUD.prototype);
  hud._L = {}; hud.timerTxt = { set textContent(v) { calls.push(v); } }; hud.timer = { animate() {}, classList: { toggle() {}, add() {}, remove() {} } };
  hud._updTimer(R.RANGE_MATCH_TIME);
  assert.deepEqual(calls, []);
  hud._updTimer(65);
  assert.deepEqual(calls, ['1:05']);
});

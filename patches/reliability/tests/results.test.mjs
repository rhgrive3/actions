import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { adaptResults } from '../results-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const ORIGINAL = fs.readFileSync(new URL('inkwave-public/src/main.js', ROOT), 'utf8');
const ADAPTED = adaptResults('src/main.js', ORIGINAL);
const CONFIG = fs.readFileSync(new URL('inkwave-public/src/config.js', ROOT), 'utf8');
const progressionStart = CONFIG.indexOf('export const PROGRESSION = {');
const progressionEnd = CONFIG.indexOf('\n};', progressionStart);
assert.ok(progressionStart >= 0 && progressionEnd > progressionStart, 'actual progression source anchors');
const progressionSource = CONFIG.slice(progressionStart, progressionEnd + 3).replace('export ', '');

function boot(source, { boss = false, online = false, won = true, hud = true } = {}) {
  const start = source.indexOf('  async _bossResults() {');
  const end = source.indexOf('\n  _fade(to, ms)', start);
  assert.ok(start >= 0 && end > start, 'actual result method source anchors');
  const returnStart = source.indexOf('  async netMatchEnd() {');
  const returnEnd = source.indexOf('\n  // the room went away mid-match', returnStart);
  assert.ok(returnStart >= 0 && returnEnd > returnStart, 'actual room return source anchors');
  const calls = [], timers = [];
  let resolveJudge;
  const judgePromise = new Promise(resolve => { resolveJudge = resolve; });
  const G = {
    teamHex: ['#f80', '#05f'], teamColors: ['orange', 'blue'], netm: null, net: null,
    audio: { play: sound => calls.push(['sound', sound]) }, paint: { coverage: () => [.6, .4] },
  };
  const context = vm.createContext({
    Math, Promise, G, TEAM_NAMES: ['A', 'B'],
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    saveJSON: (key, value) => calls.push(['save', key, { ...value }]),
  });
  const Game = vm.runInContext(`${progressionSource}\nclass Game {${source.slice(returnStart, returnEnd)}${source.slice(start, end)}}; Game`, context);
  const progression = vm.runInContext('PROGRESSION', context);
  const actor = {
    team: 0, name: 'A', weaponId: 'shooter', stats: { turf: 10.4, splats: 1, deaths: 2, bossDmg: 125, weakHits: 3 },
    character: { style: {} }, isLocal: true, slot: 0,
  };
  const match = {
    state: 'judge', local: actor, actors: [actor],
    result: {
      mode: boss ? 'boss' : 'turf', coverage: [.6, .4], winner: won ? 0 : 1,
      boss: { win: won, name: 'Boss', time: 90, hp: won ? 0 : 100, maxHp: 500, phase: 2 },
    },
    setState(state) { this.state = state; calls.push(['state', state]); },
  };
  if (online) {
    G.net = { tr: {}, code: 'ABCDE', isHost: true, state: 'match' };
    G.netm = { sendEnd: () => calls.push(['sendEnd']) };
  }
  const game = new Game();
  Object.assign(game, {
    match, palette: { names: ['A', 'B'] }, mapDef: { name: 'Map' },
    profile: { level: 1, xp: 1100, matches: 3, wins: 2, totalTurf: 45 },
    rig: { overview: () => calls.push(['overview']) },
    hud: hud ? { hideSplatted() {}, setVisible: visible => calls.push(['visible', visible]), judge: () => judgePromise } : null,
    showcase: { showResults: (...args) => calls.push(['podium', ...args]) },
    menus: {
      current: null,
      showResults: data => calls.push(['data', data]),
      show(screen) { this.current = screen; calls.push(['screen', screen]); },
    },
    _playMusic: track => calls.push(['music', track]),
    netMatchEnd: () => calls.push(['netMatchEnd']),
  });
  const initialProfile = { ...game.profile };
  return {
    game, match, G, calls, timers, progression, initialProfile, resolveJudge,
    count: name => calls.filter(call => call[0] === name).length,
    fire(ms) { const timer = timers.find(timer => timer.ms === ms); assert.ok(timer, `timer ${ms} exists`); timer.fn(); },
    async finish(value) {
      const pending = game._judge();
      if (boss) this.fire(400);
      else if (!hud) this.fire(4000);
      else resolveJudge(value);
      await pending;
    },
  };
}

function assertNoResults(h) {
  assert.deepEqual(h.game.profile, h.initialProfile, 'obsolete results do not award XP or stats');
  for (const kind of ['state', 'save', 'podium', 'data', 'screen', 'sound', 'music', 'sendEnd', 'netMatchEnd']) {
    assert.equal(h.count(kind), 0, `${kind} must not escape obsolete presentation`);
  }
  assert.equal(h.calls.some(call => call[0] === 'visible' && call[1] === false), false, 'must not hide newer HUD');
  assert.equal(h.timers.filter(timer => timer.ms === 2600 || timer.ms === 12000).length, 0, 'no obsolete result timers');
}

test('negative proof: upstream deferred turf judge mutates profile and UI after match replacement', async () => {
  const h = boot(ORIGINAL);
  const pending = h.game._judge();
  h.game.match = { attract: true };
  h.resolveJudge();
  await pending;
  assert.equal(h.count('save'), 1);
  assert.equal(h.count('data'), 1);
  assert.equal(h.game.profile.matches, h.initialProfile.matches + 1);
  assert.equal(h.timers.filter(timer => timer.ms === 2600).length, 1);
});

for (const replacement of ['attract', 'new match', 'null']) {
  test(`deferred turf judge stops after ${replacement} replaces the match`, async () => {
    const h = boot(ADAPTED);
    const pending = h.game._judge();
    h.game.match = replacement === 'null' ? null : { attract: replacement === 'attract', state: 'playing' };
    h.resolveJudge();
    await pending;
    assertNoResults(h);
  });
}

for (const boss of [false, true]) {
  for (const change of ['network match', 'session', 'room transport', 'disconnect']) {
    test(`${boss ? 'boss' : 'turf'} continuation stops when ${change} changes before completion`, async () => {
      const h = boot(ADAPTED, { boss, online: true });
      const pending = h.game._judge();
      if (change === 'network match') h.G.netm = { sendEnd() {} };
      if (change === 'session') h.G.net = { ...h.G.net };
      if (change === 'room transport') h.G.net.tr = {}; // same session, match and room code
      if (change === 'disconnect') h.G.net.tr = null;
      if (boss) h.fire(400); else h.resolveJudge();
      await pending;
      assertNoResults(h);
    });
  }
  test(`${boss ? 'boss' : 'turf'} result remains inert when match disappears during reveal`, async () => {
    const h = boot(ADAPTED, { boss });
    const pending = h.game._judge();
    h.game.match = null;
    if (boss) h.fire(400); else h.resolveJudge();
    await pending;
    assertNoResults(h);
  });
  for (const won of [false, true]) {
    test(`${boss ? 'boss' : 'turf'} ordinary ${won ? 'win' : 'loss'} preserves exact upstream scoring and delivery`, async () => {
      const before = boot(ORIGINAL, { boss, won, online: true });
      const after = boot(ADAPTED, { boss, won, online: true });
      await before.finish(); await after.finish();
      assert.deepEqual(after.game.profile, before.game.profile);
      assert.deepEqual(JSON.parse(JSON.stringify(after.calls)), JSON.parse(JSON.stringify(before.calls)));
      for (const kind of ['save', 'podium', 'data', 'screen', 'sound']) assert.equal(after.count(kind), 1, kind);
      const turf = Math.round(after.match.local.stats.turf);
      const gained = Math.round((won ? after.progression.xpWin : after.progression.xpLose) + turf * after.progression.xpPerTurfPoint + after.progression.xpPerSplat + (boss ? 5 : 0));
      assert.equal(after.calls.find(call => call[0] === 'data')[1].xp.gained, gained);
      assert.equal(after.game.profile.matches, after.initialProfile.matches + 1);
      assert.equal(after.game.profile.totalTurf, after.initialProfile.totalTurf + turf);
      assert.equal(after.game.profile.wins, after.initialProfile.wins + Number(won));
      after.fire(12000);
      assert.equal(after.count('sendEnd'), 1); assert.equal(after.count('netMatchEnd'), 1);
      if (!boss) { after.fire(2600); assert.equal(after.count('music'), 1); }
    });
  }
}

test('same-match judge resolution without a winner payload still delivers once', async () => {
  const h = boot(ADAPTED);
  await h.finish(undefined); // cancellation/resolution payload alone is not departure
  h.resolveJudge({ cancelled: true });
  await Promise.resolve();
  assert.equal(h.count('save'), 1);
  assert.equal(h.count('data'), 1);
  assert.equal(h.game.profile.matches, h.initialProfile.matches + 1);
});

test('fallback judge timer obeys the same match lifetime guard', async () => {
  const h = boot(ADAPTED, { hud: false });
  const pending = h.game._judge();
  h.game.match = null;
  h.fire(4000);
  await pending;
  assertNoResults(h);
  const normal = boot(ADAPTED, { hud: false });
  await normal.finish();
  assert.equal(normal.count('data'), 1);
});

for (const boss of [false, true]) {
  for (const change of ['match', 'network match', 'session', 'room transport', 'disconnect']) {
    test(`${boss ? 'boss' : 'turf'} delayed callbacks cannot cross ${change} ownership`, async () => {
      const h = boot(ADAPTED, { boss, online: true });
      await h.finish();
      if (change === 'match') h.game.match = { state: 'results' };
      if (change === 'network match') h.G.netm = { sendEnd: () => h.calls.push(['newSendEnd']) };
      if (change === 'session') h.G.net = { ...h.G.net };
      if (change === 'room transport') h.G.net.tr = {}; // even a same-code rejoin is a new connection
      if (change === 'disconnect') h.G.net.tr = null;
      h.fire(12000);
      if (!boss) h.fire(2600);
      for (const kind of ['sendEnd', 'newSendEnd', 'netMatchEnd', 'music']) assert.equal(h.count(kind), 0, kind);
    });
  }
  test(`${boss ? 'boss' : 'turf'} delayed room end rechecks current host authority`, async () => {
    const h = boot(ADAPTED, { boss, online: true });
    await h.finish();
    h.G.net.isHost = false;
    h.fire(12000);
    assert.equal(h.count('sendEnd'), 0); assert.equal(h.count('netMatchEnd'), 0);
  });
}

test('negative proof: original turf music and both room-end timers target later owners', async () => {
  for (const boss of [false, true]) {
    const h = boot(ORIGINAL, { boss, online: true });
    await h.finish();
    h.game.match = { state: 'playing' };
    h.G.netm = { sendEnd: () => h.calls.push(['newSendEnd']) };
    h.G.net.tr = {};
    h.fire(12000);
    assert.equal(h.count('newSendEnd'), 1);
    assert.equal(h.count('netMatchEnd'), 1);
    if (!boss) { h.fire(2600); assert.equal(h.count('music'), 1); }
  }
});

test('result music cannot replace menu music while the old match still exists during departure', async () => {
  const h = boot(ADAPTED);
  await h.finish();
  h.game.menus.show('main');
  h.fire(2600);
  assert.equal(h.count('music'), 0);
});

test('offline current results still play their own win/loss music', async () => {
  for (const won of [false, true]) {
    const h = boot(ADAPTED, { won });
    await h.finish(); h.fire(2600);
    assert.deepEqual(h.calls.find(call => call[0] === 'music'), ['music', won ? 'results_win' : 'results_lose']);
  }
});

function returning(source) {
  const h = boot(source, { online: true });
  let resolveFade, rejectFade;
  const fade = new Promise((resolve, reject) => { resolveFade = resolve; rejectFade = reject; });
  delete h.game.netMatchEnd; // use the actual extracted method, not the callback observation stub
  h.match.state = 'results';
  h.G.mode = 'match';
  h.G.net.endMatch = () => h.calls.push(['endMatch']);
  h.game.input = { exitLock: () => h.calls.push(['exitLock']) };
  h.game.showcase.hide = () => h.calls.push(['hidePodium']);
  h.game._fade = (to, ms) => { h.calls.push(['fade', to, ms]); return to === 1 ? fade : Promise.resolve(); };
  h.game._startAttract = () => { h.calls.push(['attract']); h.game.match = { attract: true }; };
  h.game._netEndT = { cleared: false };
  return { ...h, resolveFade, rejectFade };
}

test('negative proof: upstream room return ends a newer room after its fade', async () => {
  const h = returning(ORIGINAL);
  const pending = h.game.netMatchEnd();
  h.game.match = { state: 'playing' };
  h.G.net = { tr: {}, isHost: true, endMatch: () => h.calls.push(['newEndMatch']) };
  h.G.netm = { sendEnd() {} };
  h.resolveFade(); await pending;
  assert.equal(h.count('newEndMatch'), 1);
  assert.equal(h.count('attract'), 1);
  assert.equal(h.count('hidePodium'), 1);
  assert.equal(h.count('music'), 1);
  assert.equal(h.game._netEnding, false);
});

for (const change of ['match', 'null match', 'network match', 'session', 'room transport', 'disconnect']) {
  test(`room return stops after ${change} changes during fade and releases re-entrancy lock`, async () => {
    const h = returning(ADAPTED);
    const pending = h.game.netMatchEnd();
    assert.equal(h.game._netEnding, true);
    await h.game.netMatchEnd();
    assert.equal(h.count('exitLock'), 1, 're-entrant call is ignored');
    if (change === 'match') h.game.match = { state: 'playing' };
    if (change === 'null match') h.game.match = null;
    if (change === 'network match') h.G.netm = { sendEnd() {} };
    if (change === 'session') h.G.net = { ...h.G.net, endMatch: () => h.calls.push(['newEndMatch']) };
    if (change === 'room transport') h.G.net.tr = {};
    if (change === 'disconnect') h.G.net.tr = null;
    const newerMatch = h.game.match;
    h.resolveFade(); await pending;
    assert.equal(h.game.match, newerMatch);
    assert.equal(h.G.mode, 'match');
    assert.equal(h.game._netEnding, false);
    assert.equal(h.game._netEndT.cleared, true);
    for (const kind of ['endMatch', 'newEndMatch', 'attract', 'hidePodium', 'music']) assert.equal(h.count(kind), 0, kind);
    assert.equal(h.calls.some(call => call[0] === 'visible' && call[1] === false), false);
    assert.equal(h.calls.some(call => call[0] === 'screen' && call[1] === 'lobby'), false);
  });
}

test('normal room return preserves upstream lobby delivery and resets re-entrancy lock', async () => {
  const before = returning(ORIGINAL), after = returning(ADAPTED);
  const p1 = before.game.netMatchEnd(), p2 = after.game.netMatchEnd();
  before.resolveFade(); after.resolveFade();
  await Promise.all([p1, p2]);
  assert.deepEqual(JSON.parse(JSON.stringify(after.calls)), JSON.parse(JSON.stringify(before.calls)));
  assert.equal(after.game._netEnding, false);
  assert.equal(after.G.mode, 'menu');
  assert.equal(after.game.match.attract, true);
  assert.equal(after.game.menus.current, 'lobby');
  assert.equal(after.count('endMatch'), 1);
  assert.equal(after.count('attract'), 1);
  assert.deepEqual(after.calls.find(call => call[0] === 'music'), ['music', 'menu']);
});

test('failed room-return fade still releases re-entrancy lock', async () => {
  const h = returning(ADAPTED);
  const pending = h.game.netMatchEnd();
  h.rejectFade(new Error('fixture fade failed'));
  await assert.rejects(pending, /fixture fade failed/);
  assert.equal(h.game._netEnding, false);
  assert.equal(h.count('endMatch'), 0);
});

test('adapter changes only main.js and rejects missing/duplicate connections and repeat application', () => {
  for (const rel of ['src/net/session.js', 'src/core/input.js', 'src/ui/hud.js']) assert.equal(adaptResults(rel, ORIGINAL), ORIGINAL);
  assert.throws(() => adaptResults('src/main.js', ''), /results conflict/);
  assert.throws(() => adaptResults('src/main.js', ADAPTED), /results conflict/);
  const anchors = [
    '  async netMatchEnd() {\n    if (this._netEnding) return;\n    this._netEnding = true;',
    "      await this._fade(1, 350);\n      this.hud?.setVisible(false);\n      this.hud?.hideSplatted?.();\n      this.showcase.hide();\n      G.mode = 'menu';\n      G.net?.endMatch();",
    '  async _bossResults() {\n    const m = this.match, R = m.result, bo = R.boss || {};',
    '    await new Promise((r) => setTimeout(r, 400));\n    if (this.match !== m) return;',
    '  async _judge() {\n    const m = this.match;\n    if (m.result?.mode',
    '    await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    const myTeam',
    "    setTimeout(() => this._playMusic(won ? 'results_win' : 'results_lose'), 2600);",
    '    if (G.netm && G.net.isHost) this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);',
    '    if (G.netm) {\n      if (G.net.isHost) this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);\n    }',
  ];
  for (const anchor of anchors) {
    assert.throws(() => adaptResults('src/main.js', ORIGINAL.replace(anchor, 'changed upstream anchor')), /results conflict/);
    assert.throws(() => adaptResults('src/main.js', ORIGINAL + '\n' + anchor), /results conflict/);
  }
  assert.equal(ORIGINAL.slice(0, ORIGINAL.indexOf('  async netMatchEnd() {')), ADAPTED.slice(0, ADAPTED.indexOf('  async netMatchEnd() {')));
  const middleStart = '\n  // the room went away mid-match';
  assert.equal(ORIGINAL.slice(ORIGINAL.indexOf(middleStart), ORIGINAL.indexOf('  async _bossResults() {')), ADAPTED.slice(ADAPTED.indexOf(middleStart), ADAPTED.indexOf('  async _bossResults() {')));
  assert.equal(ORIGINAL.slice(ORIGINAL.indexOf('\n  _fade(to, ms)')), ADAPTED.slice(ADAPTED.indexOf('\n  _fade(to, ms)')));
});

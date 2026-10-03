// Focused reliability tests for the intro-timer lifetime overlay.
// They boot the ACTUAL Game._intro method extracted from the public main module in a node VM,
// once unmodified (upstream control) and once through adaptIntro(). The defect assertion is paired:
// the raw method must still let a stale READY/HUD timer change a newer intro while the overlay
// must not. Timings, the cinematic sweep, the look and the boss route are checked unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { adaptIntro } from '../intro-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const MAIN_REL = 'src/main.js';
const ORIGINAL = fs.readFileSync(path.join(UPSTREAM, MAIN_REL), 'utf8');
const ADAPTED = adaptIntro(MAIN_REL, ORIGINAL);

// The exact two timer callbacks the overlay rewires, mirrored here so the fail-closed cases are explicit.
const READY_TIMER = "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.banner('ready'); }, 1700);";
const HUD_TIMER = "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);";
const TIMERS_ANCHOR = [READY_TIMER, HUD_TIMER].join('\n');
const CONFLICT = /intro conflict \(intro ready\/hud timers\)/;

// Extract the real method text exactly as the browser runs it.
function introSource(source) {
  const start = source.indexOf('  _intro() {');
  const end = source.indexOf('\n  pause() {', start);
  assert.ok(start >= 0 && end > start, 'actual Game._intro source anchors');
  return source.slice(start, end);
}

// A VM instance of the extracted _intro with captured timers and calls for its rig/hud/audio.
function boot(source) {
  const timers = [], calls = [];
  const G = { level: { spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 6 }] }, audio: { play: sound => calls.push(['sound', sound]) } };
  const context = vm.createContext({
    G,
    THREE: { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } },
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.push(timer); return timer; },
  });
  const Game = vm.runInContext(`class Game {${introSource(source)}}; Game`, context);
  const game = new Game();
  Object.assign(game, {
    rig: { cinematic: (...args) => calls.push(['cinematic', ...args]) },
    hud: { banner: kind => calls.push(['banner', kind]), setVisible: on => calls.push(['visible', on]) },
    _playMusic: track => calls.push(['music', track]),
    _bossIntro: boss => calls.push(['bossIntro', boss]),
  });
  return {
    game, timers, calls,
    setMatch: match => { game.match = match; },
    count: name => calls.filter(call => call[0] === name).length,
    fire(ms) { const timer = timers.find(t => t.ms === ms); assert.ok(timer, `timer at ${ms} ms`); timer.fn(); },
  };
}

const team = (n) => ({ state: 'intro', local: { team: n } });
// Cinematic args contain VM-realm Vector3 values; project to plain data for cross-realm comparison.
const cinematicNumbers = (calls) => calls
  .filter(call => call[0] === 'cinematic')
  .map(call => call.slice(1).map(arg => (typeof arg === 'function' ? 'callback'
    : arg && typeof arg === 'object' ? [arg.x, arg.y, arg.z] : arg)));

test('raw upstream _intro: a stale timer changes a newer intro (reproduced defect)', () => {
  assert.ok(introSource(ORIGINAL).includes(TIMERS_ANCHOR), 'actual extracted _intro carries the unguarded timers');
  const h = boot(ORIGINAL);
  h.setMatch(team(0));
  h.game._intro();
  h.setMatch(team(1));            // a newer intro replaced the one that scheduled the timers
  h.fire(1700); h.fire(3000);     // the old READY/HUD timers still run
  assert.deepEqual(
    h.calls.filter(call => call[0] === 'banner' || call[0] === 'visible'),
    [['banner', 'ready'], ['visible', true]],
    'the stale timers flipped the newer intro HUD early',
  );
});

test('adapted _intro ignores its timers when a different match owns the intro', () => {
  const h = boot(ADAPTED);
  h.setMatch(team(0));
  h.game._intro();
  h.setMatch(team(1));
  h.fire(1700); h.fire(3000);
  assert.equal(h.count('banner'), 0);
  assert.equal(h.count('visible'), 0);
});

test('adapted _intro ignores its timers when the match is gone (null)', () => {
  const h = boot(ADAPTED);
  h.setMatch(team(0));
  h.game._intro();
  h.setMatch(null);
  h.fire(1700); h.fire(3000);
  assert.equal(h.count('banner'), 0);
  assert.equal(h.count('visible'), 0);
});

test('adapted _intro ignores its timers once the same match left the intro state', () => {
  for (const state of ['playing', 'results']) {
    const h = boot(ADAPTED);
    const m = team(0);
    h.setMatch(m);
    h.game._intro();
    m.state = state;             // same identity, no longer in the intro
    h.fire(1700); h.fire(3000);
    assert.equal(h.count('banner'), 0, `banner blocked in ${state}`);
    assert.equal(h.count('visible'), 0, `hud blocked in ${state}`);
  }
});

test('adapted _intro still delivers READY then the HUD on its own match at the existing delays', () => {
  const h = boot(ADAPTED);
  const m = team(0);
  h.setMatch(m);
  h.game._intro();
  assert.deepEqual(h.timers.map(t => t.ms), [1700, 3000], 'delays unchanged');
  assert.equal(h.count('banner'), 0, 'no READY before 1700 ms');
  assert.equal(h.count('visible'), 0, 'no HUD before 3000 ms');
  h.fire(1700);
  assert.deepEqual(h.calls.find(call => call[0] === 'banner'), ['banner', 'ready']);
  assert.equal(h.count('visible'), 0, 'HUD still hidden at the READY step');
  h.fire(3000);
  assert.deepEqual(h.calls.find(call => call[0] === 'visible'), ['visible', true]);
  assert.deepEqual(h.calls.filter(call => call[0] === 'music'), [['music', null]]);
  assert.deepEqual(h.calls.filter(call => call[0] === 'sound'), [['sound', 'ready']]);
});

test('adapted _intro leaves the cinematic, look and numeric behaviour equal to upstream', () => {
  const run = (source) => { const h = boot(source); h.setMatch(team(1)); h.game._intro(); return h; };
  const upstream = run(ORIGINAL), adapted = run(ADAPTED);
  assert.deepEqual(adapted.timers.map(t => t.ms), upstream.timers.map(t => t.ms));
  assert.deepEqual(cinematicNumbers(adapted.calls), cinematicNumbers(upstream.calls));
  assert.equal(adapted.game.rig.yaw, upstream.game.rig.yaw);
  assert.equal(adapted.game.rig.pitch, upstream.game.rig.pitch);
  assert.equal(adapted.game.rig.dioFlip, upstream.game.rig.dioFlip);
  assert.deepEqual(adapted.calls.filter(call => call[0] === 'sound'), upstream.calls.filter(call => call[0] === 'sound'));
});

test('adapted _intro keeps the boss route byte-identical and schedules no turf timers', () => {
  const bossStart = '  _bossIntro(b) {';
  const bossEnd = '\n  // round over:';
  const sourceOf = (source) => source.slice(source.indexOf(bossStart), source.indexOf(bossEnd));
  assert.ok(ORIGINAL.indexOf(bossStart) >= 0 && ORIGINAL.indexOf(bossEnd) > ORIGINAL.indexOf(bossStart), 'actual Game._bossIntro source anchors');
  assert.equal(sourceOf(ADAPTED), sourceOf(ORIGINAL), 'boss intro method unchanged');
  const h = boot(ADAPTED);
  const boss = { name: 'BOSS' };
  h.setMatch({ state: 'intro', boss });
  h.game._intro();
  assert.deepEqual(h.calls.filter(call => call[0] === 'bossIntro'), [['bossIntro', boss]]);
  assert.equal(h.timers.length, 0, 'no turf READY/HUD timers on the boss route');
  assert.equal(h.count('banner'), 0);
  assert.equal(h.count('visible'), 0);
});

test('adaptIntro changes only the two intro timer callbacks', () => {
  const anchorStart = ORIGINAL.indexOf(TIMERS_ANCHOR);
  assert.ok(anchorStart > 0, 'actual timer anchor present');
  assert.equal(ADAPTED.slice(0, anchorStart), ORIGINAL.slice(0, anchorStart), 'source before the timers unchanged');
  const tail = '    this._playMusic(null);';             // first occurrence is inside _intro
  assert.equal(ADAPTED.slice(ADAPTED.indexOf(tail)), ORIGINAL.slice(ORIGINAL.indexOf(tail)), 'source after the timers unchanged');
});

test('adaptIntro fails closed when the timer anchors are missing', () => {
  const without = ORIGINAL.replace(TIMERS_ANCHOR, READY_TIMER);   // setVisible timer dropped
  assert.equal(without.includes(TIMERS_ANCHOR), false);
  assert.throws(() => adaptIntro(MAIN_REL, without), CONFLICT);
});

test('adaptIntro fails closed when the timer anchors are duplicated', () => {
  const doubled = ORIGINAL.replace(TIMERS_ANCHOR, TIMERS_ANCHOR + '\n' + TIMERS_ANCHOR);
  assert.throws(() => adaptIntro(MAIN_REL, doubled), CONFLICT);
});

test('adaptIntro fails closed when applied twice to an already-adapted source', () => {
  assert.throws(() => adaptIntro(MAIN_REL, ADAPTED), CONFLICT);
});

test('adaptIntro leaves unrelated modules and markup unchanged', () => {
  for (const rel of ['src/core/input.js', 'src/game/player.js', 'src/ui/hud.js', 'index.html', 'styles/mobile.css']) {
    const code = `// ${rel}\nconst value = 1;\n`;
    assert.equal(adaptIntro(rel, code), code, `${rel} passed through`);
  }
});
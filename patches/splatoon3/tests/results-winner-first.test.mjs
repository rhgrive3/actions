// #941: the Turf War results scoreboard is winner-first (S3 WIN! block above LOSE...).
// Runs the actual composed Menus._scr_results; the DOM builder `h` and unrelated art/audio helpers are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
function method(code, start, end) { const a = code.indexOf(start), b = code.indexOf(end, a); assert(a >= 0 && b > a); return code.slice(a, b); }

// Any helper the results screen reaches for that this test does not model is a callable, chainable inert stub.
const inert = () => new Proxy(function () {}, {
  get: (_t, key) => key === Symbol.toPrimitive ? () => '' : inert(),
  apply: () => inert(),
});
class Node {
  constructor(tag, attrs, kids) {
    this.tag = tag; this.attrs = attrs || {}; this.children = []; this.names = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = { add: n => this.names.add(n), remove: n => this.names.delete(n), contains: n => this.names.has(n), toggle() {} };
    this.style = { setProperty() {} }; this.dataset = {}; this.isConnected = true;
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) this.children.push(kid);
  }
  has(name) { return this.names.has(name); }
  find(name) { return this.has(name) ? this : this.children.map(c => c instanceof Node ? c.find(name) : null).find(Boolean) || null; }
  all(name) { return [...(this.has(name) ? [this] : []), ...this.children.flatMap(c => c instanceof Node ? c.all(name) : [])]; }
  text() { return this.children.map(c => c instanceof Node ? c.text() : String(c)).join(''); }
  addEventListener() {} appendChild(n) { this.children.push(n); return n; } querySelector() { return inert(); }
  get firstElementChild() { return this.children[0]; }
}
function results(source, data) {
  const code = `(() => { class Menus {${method(source, "  _scr_results() {", "\n  _demoResults")}} return Menus; })()`;
  const globals = {
    h: (tag, attrs, ...kids) => new Node(tag, attrs, kids),
    pct: (a, b) => [a, b], toHex: c => c, clamp: (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)), fmtInt: v => String(v),
    prefersReducedMotion: () => true, easeOutCubic: v => v, TEAM_NAMES: ['Alpha', 'Bravo'], TEAM_PALETTES: [{ a: '#f80', b: '#25f' }],
    computeAwards: () => ({ byPlayer: [], match: [] }), PROGRESSION: { xpWin: 0, xpLose: 0, xpPerTurfPoint: 0, xpPerSplat: 0, xpForLevel: () => 1 },
    Math, String, Number, Array, Object, Promise, Set,
  };
  // Instantiate lazily, defining each unmodelled free identifier as an inert stub until the whole method builds.
  for (let guard = 0; guard < 200; guard++) {
    const Menus = vm.runInNewContext(code, globals);
    const menus = Object.assign(Object.create(Menus.prototype), {
      _results: data, _weapons: () => ({}), _panel: (_c, ...k) => new Node('div', {}, k), _btn: () => new Node('button', {}, []),
      _prompts: () => new Node('div', {}, []), _sfx() {}, _openModal() {}, _closeModal() {}, api: {},
    });
    try { return menus._scr_results().el; }
    catch (e) {
      const m = /^(\w+) is not defined/.exec(e.message);
      if (!m) throw e;
      globals[m[1]] = inert();
    }
  }
  throw new Error('results fixture did not converge');
}
const players = [
  { name: 'A1', team: 0, turf: 500, weapon: 'shooter', isSelf: true }, { name: 'A2', team: 0, turf: 900, weapon: 'roller' },
  { name: 'B1', team: 1, turf: 700, weapon: 'charger' }, { name: 'B2', team: 1, turf: 300, weapon: 'blaster' },
];
const order = screen => screen.find('iw-res__teams').children.map(t => ({
  win: t.has('is-win'), lose: t.has('is-lose'), side: t.has('iw-ttable--a') ? 0 : 1,
  rows: t.all('iw-prow__nm').map(n => n.text()),
}));

test('negative control: native results always render team 0 first, even when team 1 won', () => {
  const [first, second] = order(results(read('src/ui/menus.js'), { win: false, percents: [40, 60], players }));
  assert.deepEqual([first.side, first.lose], [0, true]);
  assert.deepEqual([second.side, second.win], [1, true]);
});

test('#941: the winning squad is the first table for every local side and outcome', () => {
  const source = compose('src/ui/menus.js');
  for (const [win, selfTeam] of [[true, 0], [false, 0], [true, 1], [false, 1]]) {
    const roster = players.map(p => ({ ...p, isSelf: p.name === (selfTeam ? 'B1' : 'A1') }));
    const winTeam = win ? selfTeam : 1 - selfTeam;
    const percents = winTeam ? [40, 60] : [60, 40];
    const [first, second] = order(results(source, { win, percents, players: roster }));
    assert.deepEqual([first.side, first.win, first.lose], [winTeam, true, false], `win=${win} self=${selfTeam}`);
    assert.deepEqual([second.side, second.win, second.lose], [1 - winTeam, false, true], `win=${win} self=${selfTeam}`);
  }
});

test('#941: team ids, per-team player order (turf descending) and coverage pairing are unchanged', () => {
  const screen = results(compose('src/ui/menus.js'), { win: false, percents: [40, 60], teamNames: ['Orange', 'Blue'], players });
  const [win, lose] = order(screen);
  assert.deepEqual(win.rows, ['B1', 'B2']);
  assert.deepEqual(lose.rows, ['A2', 'A1']);
  const names = screen.find('iw-cover__names').children;
  assert(names[0].has('ta') && names[0].text().startsWith('Orange'));
  assert(names[1].has('tb') && names[1].text().includes('Blue'));
});

test('#941: the connection fails closed on upstream drift and double application', () => {
  const raw = read('src/ui/menus.js');
  assert.throws(() => adaptSource('src/ui/menus.js', raw.replace('table(0), table(1)', 'table(0),table(1)')), /winner-first Turf results order|match HUD conflict/);
  assert.throws(() => adaptSource('src/ui/menus.js', adaptSource('src/ui/menus.js', raw)), /winner-first Turf results order/);
});

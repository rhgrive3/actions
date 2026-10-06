// Issue #631/#632: Splatoon 3 reveals a splatted teammate's position only when
// the splatted player sends the Ouch... signal. The generic `splatted` event
// must not create a named world-space ally-down marker on its own; the top
// roster, kill/assist cards and every other HUD state stay as they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REL = 'src/ui/hud.js';
const raw = fs.readFileSync(path.join(ROOT, 'inkwave-public', REL), 'utf8');
const AUTOMATIC_CALL = '    if (me && victim.team === me.team) this._allyDown(victim, attacker);';

function grab(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `anchor present: ${start.trim()}`);
  const b = source.indexOf(end, a);
  assert.ok(b > a, `end anchor present after: ${end.trim()}`);
  return source.slice(a, b);
}

// Runs the installed (adapter-transformed) HUD methods on a stub instance, so
// the assertion covers the code path the build actually ships.
function hudRig(source) {
  const methods = [
    grab(source, '  _onSplatted({ victim, attacker }) {', '  _killCard(victim, kind) {'),
    grab(source, '  _allyDown(victim, attacker) {', '  _updDowns(dt) {'),
  ].join('\n');
  const context = vm.createContext({
    console, Math,
    G: { teamHex: ['#ff8a14', '#2f5bff'] },
    tr: (value) => value,
    STREAKS: ['DOUBLE SPLAT!', 'TRIPLE SPLAT!', 'QUAD SPLAT!'],
    h: () => ({ style: {}, remove() {} }),
    colorVars: () => {},
    toHex: () => '#ff8a14',
    DEATH_ICON: '<svg/>',
  });
  const Hud = vm.runInContext(`class Hud { ${methods} }; Hud`, context);
  const downLayer = { children: [], appendChild(node) { this.children.push(node); } };
  const hud = Object.assign(new Hud(), {
    _live: () => true,
    _now: () => 100,
    _actors: () => [],
    _clearDamageDirs() { cleared++; },
    _killCard(victim, kind) { cards.push({ victim, kind }); },
    _callout(call) { callouts.push(call); },
    _kills: { first: true, streak: 0, times: [], dealt: new Map(), perActor: new Map() },
    _L: { ca: '#ff8a14', cb: '#2f5bff' },
    _downs: [],
    downLayer,
  });
  let cleared = 0;
  const cards = [], callouts = [];
  const state = { get cleared() { return cleared; }, cards, callouts, downLayer };
  return { hud, state };
}

test('#631 repro: upstream hud.js still creates the automatic ally-down marker', () => {
  assert.ok(raw.includes(AUTOMATIC_CALL), 'the raw public source has the divergence');
  assert.ok(raw.includes('_allyDown(victim, attacker) {'), 'raw helper exists');
});

test('#631 a teammate splat alone creates no named world-space marker', () => {
  const adapted = adaptSource(REL, raw);
  const me = { team: 0, name: 'me', alive: true };
  const victim = { team: 0, name: 'Ally', alive: false, pos: { x: 4, y: 1, z: -2 } };
  const enemy = { team: 1, name: 'Enemy', alive: true };
  const actors = [me, victim, enemy];
  const { hud, state } = hudRig(adapted);
  hud._local = () => me;
  hud._actors = () => actors;
  hud._onSplatted({ victim, attacker: enemy });
  assert.equal(state.downLayer.children.length, 0, 'no automatic world-space death-location marker');
  assert.equal(hud._downs.length, 0, 'no pending marker entry');
  assert.equal(state.cleared, 0, 'the local victim path is untouched');
});

test('#631 a local death still runs its own bookkeeping without a marker', () => {
  const adapted = adaptSource(REL, raw);
  const me = { team: 0, name: 'me', alive: false, pos: { x: 0, y: 0, z: 0 } };
  const enemy = { team: 1, name: 'Enemy', alive: true };
  const { hud, state } = hudRig(adapted);
  hud._local = () => me;
  hud._actors = () => [me, enemy];
  hud._onSplatted({ victim: me, attacker: enemy });
  assert.equal(state.cleared, 1, 'own splat still clears damage directions');
  assert.equal(state.downLayer.children.length, 0, 'own death never becomes an ally marker');
});

test('#631 the marker primitive and roster/kill presentation stay intact', () => {
  const adapted = adaptSource(REL, raw);
  assert.match(adapted, /_allyDown\(victim, attacker\) \{/, 'primitive kept for an explicit signal');
  assert.match(adapted, /_updDowns\(dt\)/, 'per-frame marker projection kept');
  assert.match(adapted, /_lineup\(/, 'top roster stays independent');
  assert.match(adapted, /_killCard\(victim, kind\)/, 'kill cards unchanged');

  const me = { team: 0, name: 'me', alive: true };
  const victim = { team: 1, name: 'Enemy', alive: false, pos: { x: 0, y: 0, z: 0 } };
  const enemyAlly = { team: 1, name: 'Enemy2', alive: true };
  const { hud, state } = hudRig(adapted);
  hud._local = () => me;
  hud._actors = () => [me, victim, enemyAlly];
  hud._onSplatted({ victim, attacker: me });
  assert.deepEqual(state.cards.map(c => c.kind), ['kill'], 'local kill card unchanged');
  assert.equal(state.downLayer.children.length, 0, 'kill cards never become world-space markers');
});

test('#631 the connection is fail-closed on upstream changes', () => {
  adaptSource(REL, raw);
  const broken = raw.replace(AUTOMATIC_CALL, '');
  assert.throws(() => adaptSource(REL, broken), /INKWAVE patch conflict/, 'missing anchor fails closed');
});

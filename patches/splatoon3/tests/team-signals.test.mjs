import test from 'node:test';
import assert from 'node:assert/strict';
import { installTeamSignals, signalKindForUp, SIGNAL_LIFE, BOT_OUCH_DELAY } from '../runtime/team-signals.mjs';

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return vec(this.x, this.y, this.z); } });
function rig({ alive = true } = {}) {
  const listeners = {}, emitted = [];
  class PlayerController { constructor(a) { this.a = a; this.enabled = true; this.mapHeld = false; this.input = { keys: new Set(), lastDevice: 'kbm', down(k) { return this.keys.has(k); }, padButton: () => false }; } update() {} }
  class HUD { constructor() { this._visible = true; } update() {} }
  const me = { name: 'Me', team: 0, alive, pos: vec(0, 0, 0), intent: {} };
  const mate = { name: 'Mate', team: 0, alive: true, pos: vec(5, 0, 0), intent: {} };
  const paths = [];
  const bot = { name: 'Bot', team: 0, alive: true, pos: vec(10, 0, 0), intent: {}, bot: { target: null, _pathTo(p) { paths.push(p); } } };
  const busyBot = { name: 'Busy', team: 0, alive: true, pos: vec(12, 0, 0), intent: {}, bot: { target: {}, _pathTo(p) { paths.push(p); } } };
  const foeBot = { name: 'Foe', team: 1, alive: true, pos: vec(3, 0, 0), intent: {}, bot: { target: null, _pathTo(p) { paths.push(p); } } };
  const G = { match: { state: 'playing', paused: false, local: me }, actors: [me, mate, bot, busyBot, foeBot] };
  installTeamSignals({ G, PlayerController, HUD, on: (n, f) => { listeners[n] = f; }, emit: (n, e) => emitted.push([n, e]) });
  const c = new PlayerController(me);
  return { G, c, me, mate, bot, busyBot, foeBot, paths, emitted, listeners, HUD };
}

test('up is This way while alive and Ouch while splatted (Splatoon 3 signal mapping)', () => {
  assert.equal(signalKindForUp({ alive: true }), 'thisWay');
  assert.equal(signalKindForUp({ alive: false }), 'ouch');
});

test('keyboard H sends This way once per press; allied Bots without a target come, others do not', () => {
  const h = rig();
  h.c.input.keys.add('KeyH'); h.c.update(1 / 60); h.c.update(1 / 60);
  const sent = h.emitted.filter(([n]) => n === 'team:signal');
  assert.equal(sent.length, 1, 'holding H is one signal');
  assert.equal(sent[0][1].kind, 'thisWay');
  assert.equal(h.paths.length, 1, 'only the free allied Bot answers');
  assert.deepEqual([h.paths[0].x, h.paths[0].z], [0, 0], 'it paths to the caller');
});

test('a splatted player sends Ouch at the splat position even though the controller is disabled', () => {
  const h = rig({ alive: false });
  h.c.enabled = false; h.me.pos = vec(7, 2, -3);
  h.c.input.keys.add('KeyH'); h.c.update(1 / 60);
  const [, rec] = h.emitted.find(([n]) => n === 'team:signal');
  assert.equal(rec.kind, 'ouch'); assert.deepEqual([rec.x, rec.z], [7, -3]);
  assert.equal(h.paths.length, 0, 'Ouch does not call Bots');
});

test('Nice follows the catalogue owner while alive and the raw edge while splatted; the open map owns the D-pad', () => {
  const h = rig();
  h.me.intent.booyah = true; h.c.update(1 / 60);
  assert.equal(h.emitted.at(-1)[1].kind, 'nice');
  const d = rig({ alive: false }); d.c.input.keys.add('KeyN'); d.c.update(1 / 60);
  assert.equal(d.emitted.at(-1)[1].kind, 'nice');
  const m = rig(); m.c.mapHeld = true; m.c.input.keys.add('KeyH'); m.c.update(1 / 60);
  assert.equal(m.emitted.length, 0);
});

for (const hz of [30, 60, 144]) test(`a splatted Bot sends Ouch ${BOT_OUCH_DELAY}s later at ${hz}Hz`, () => {
  const h = rig();
  h.bot.alive = false; h.listeners.splatted({ victim: h.bot });
  let t = 0, at = null;
  for (let i = 0; i < hz; i++) { h.c.update(1 / hz); t += 1 / hz; if (at === null && h.emitted.some(([, e]) => e.actor === h.bot)) at = t; }
  assert.ok(at >= BOT_OUCH_DELAY - 1e-9 && at <= BOT_OUCH_DELAY + 1 / hz + 1e-9, `sent at ${at}`);
  assert.equal(h.emitted.filter(([, e]) => e.actor === h.bot).length, 1);
  assert.equal(h.emitted.find(([, e]) => e.actor === h.bot)[1].kind, 'ouch');
});

test('teammates see the signal; the sender and the other team do not; it expires', () => {
  const h = rig();
  const node = () => ({ style: {}, className: '', innerHTML: '', removed: false, children: [], firstChild: { style: {}, textContent: '' },
    remove() { this.removed = true; }, appendChild(c) { this.children.push(c); }, append(c) { this.children.push(c); } });
  const prev = globalThis.document, prevW = globalThis.innerWidth, prevH = globalThis.innerHeight;
  globalThis.document = { createElement: node }; globalThis.innerWidth = 800; globalThis.innerHeight = 450;
  try {
    const hud = new h.HUD(); hud.downLayer = node(); hud._project = () => ({ x: 0, y: 0, z: 0.5 }); h.G.camera = {};
    h.G.teamSignals.send(h.mate, 'thisWay'); h.G.teamSignals.send(h.me, 'nice'); h.G.teamSignals.send(h.foeBot, 'thisWay');
    hud.update();
    const shown = hud.downLayer.children;
    assert.equal(shown.length, 1, 'only the teammate signal is drawn');
    assert.equal(shown[0].firstChild.textContent, 'Mate カモン！');
    assert.equal(shown[0].style.opacity, '1.00');
    for (let i = 0; i < Math.ceil((SIGNAL_LIFE + 0.1) * 60); i++) h.c.update(1 / 60);
    hud.update();
    assert.equal(shown[0].removed, true, 'the marker is removed after its lifetime');
  } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
    globalThis.innerWidth = prevW; globalThis.innerHeight = prevH;
  }
});

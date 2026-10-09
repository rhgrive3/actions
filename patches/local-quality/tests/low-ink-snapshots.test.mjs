import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptHudSnapshots } from '../hud-snapshots-adapter.mjs';
import { hudFrameSnapshot } from '../hud-snapshots.mjs';
import { adaptGearSub } from '../../splatoon3/gear-sub-adapter.mjs';
import { subInkSpec } from '../../splatoon3/runtime/sub-ready.mjs';
import { stormGaugeFraction } from '../../splatoon3/runtime/storm-effects.mjs';

// Actual native admission, Main update and HUD/Mobile methods; DOM drawing and
// projectile creation are bounded sinks. This does not exercise full S3 timing.
const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const rawMain = read('src/main.js');
const rawMobile = read('src/core/mobile.js');
const rawHud = read('src/ui/hud.js');
const rawWeapons = read('src/game/weapons.js');
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
function once(s, before, after, label) {
  const at = s.indexOf(before);
  assert.ok(at >= 0 && s.indexOf(before, at + before.length) < 0, label);
  return s.slice(0, at) + after + s.slice(at + before.length);
}
function section(s, begin, end) {
  const a = s.indexOf(begin), b = s.indexOf(end, a + begin.length);
  assert.ok(a >= 0 && b > a, begin);
  return s.slice(a, b);
}
const gear = (rel, s) => adaptGearSub(rel, s, once);
const snap = (rel, s) => adaptHudSnapshots(rel, s, once);
const compose = (rel, s, reverse = false) => reverse ? gear(rel, snap(rel, s)) : snap(rel, gear(rel, s));
function node() {
  return { classes: new Map(), values: new Map(), style: { setProperty(k, v) { this[k] = v; } },
    classList: { toggle(k, v) { this.owner.classes.set(k, !!v); } }, querySelector() { return { innerHTML: '' }; } };
}
function element() { const n = node(); n.classList.owner = n; return n; }

function fixture({ reverse = false, snapshot = hudFrameSnapshot, oldMobile = false } = {}) {
  const G = { camera: { fov: 60 }, projectiles: { fireShooter() {}, fireBlaster() {}, throwBomb() {} } };
  const PLAYER = { inkMax: 100, hp: 100 }, SUB = { bomb: { inkCost: 70 } };
  let scale = 1, costReads = 0, frame, mobile;
  const a = { isLocal: true, team: 0, alive: true, hp: 100, ink: 100, grounded: true,
    weaponId: 'shooter', weapon: { kind: 'shooter', special: 'storm', inkPerShot: 1.5, fireInterval: .1,
      spreadGround: 0, spreadAir: 0 }, form: 'kid', intent: { fire: false }, character: { trigger() {} },
    s3: { modifiers: { get inkSaverSub() { costReads++; return scale; } } },
    specialFrac: () => .2, specialReady: () => false, specialActive: null };
  const main = compose('src/main.js', rawMain, reverse);
  const Game = new Function('G', 'THREE', 'PLAYER', 'SUB', 't', 'subInkSpec', 'hudFrameSnapshot', 'innerWidth', 'innerHeight',
    'return class {' + section(main, '  _updateHud(dt) {', '  _onDevice(') + '}')
    (G, {}, PLAYER, SUB, x => x, subInkSpec, snapshot, 1280, 720);
  const game = new Game();
  let onLowInk;
  const listener = section(rawMain, "    on('lowink',", '\n');
  new Function('on', listener).call(game, (type, fn) => { assert.equal(type, 'lowink'); onLowInk = fn; });
  const emit = (type, detail) => { if (type === 'lowink') onLowInk(detail); };
  const weapons = gear('src/game/weapons.js', rawWeapons);
  const Runner = new Function('G', 'PLAYER', 'SUB', 'emit', 'rumble', 'subInkSpec', 'clamp', 'lerp',
    'return class {' + section(weapons, '  _spreadDeg(w) {', '  _charger(') + '}')
    (G, PLAYER, SUB, emit, () => {}, subInkSpec, clamp, lerp);
  const runner = a.weaponRunner = new Runner();
  Object.assign(runner, { a, cooldown: 0, emptyCd: 0, rumbleT: 0, firingT: 0, flickRecover: 0,
    bloom: 0, spread: 0, charge: 0, sinceHand: [0, 0], aimingSub: false });
  const hudCode = gear('src/ui/hud.js', rawHud);
  const HUD = new Function('G', 'clamp', 'return class {' + section(hudCode, '  _updTank(f, dt) {', '  _drawTank(') + '}')(G, clamp);
  const hud = new HUD();
  Object.assign(hud, { _L: {}, tank: element(), _local: () => a, _drawTank() {},
    _tank: { t: 0, prevYaw: null, prevVx: 0, prevVz: 0, slosh: 0, sloshV: 0, wobble: 0,
      empty: 0, prevInk: 1, bubbles: [], level: 1 } });
  const mobileCode = oldMobile ? gear('src/core/mobile.js', rawMobile) : compose('src/core/mobile.js', rawMobile, reverse);
  const Mobile = new Function('clamp', 'WEAPON_ICONS', 'specialIcon',
    'return class {' + section(mobileCode, '  setHud(', '  endFrame(') + '}')(clamp, { shooter: '' }, () => '');
  const touch = new Mobile();
  Object.assign(touch, { els: { fire: element(), special: element(), sub: element() }, _buzz() {} });
  game.match = { local: a, actors: [], state: 'playing', duration: 180, time: 100,
    controller: { enabled: true, a, onTarget: false, inRange: true, mapHeld: false }, teamSummary: () => [{}, {}] };
  Object.assign(game, { settings: { minimap: false }, minimap: {}, _mv: {}, _hints: {}, _hintT: 0, _lowInkFlash: 0,
    hud: { update(dt, f) { frame = f; hud._updTank(f, dt); } },
    input: { mobile: { setHud(f) { mobile = f; touch.setHud(f); } } } });
  return { a, runner, game, hud, touch, emit, SUB, setScale(value) { scale = value; },
    read() { costReads = 0; game._updateHud(1 / 60); return { frame, mobile, costReads }; },
    assertLow(value) { const out = this.read(); assert.equal(out.frame.inkLow, value);
      assert.equal(out.mobile.inkLow, value); assert.equal(hud.tank.classes.get('is-low'), value);
      assert.equal(touch.els.fire.classes.get('is-low'), value); return out; } };
}

test('#117 original threshold and touch-only fallback reproduce false shortage', () => {
  const fixed = fs.readFileSync(new URL('../hud-snapshots.mjs', import.meta.url), 'utf8');
  const old = once(fixed, 'frame.inkLow = game._lowInkFlash > 0;',
    'frame.inkLow = a.ink < 18 || game._lowInkFlash > 0;', 'published 2e81 fixed18 negative');
  // Link the actual Storm gauge source dependency in this historical fixture.
  // Keep only the legacy threshold mutation as the negative control.
  const legacyBody = once(old,
    "import { stormGaugeFraction } from '../splatoon3/runtime/storm-effects.mjs';\n",
    '', 'legacy HUD fixture Storm dependency');
  const legacy = new Function('stormGaugeFraction',
    legacyBody.replaceAll('export ', '') + '; return hudFrameSnapshot;')(stormGaugeFraction);
  const h = fixture({ snapshot: legacy }); h.a.ink = 17.99;
  assert.equal(h.read().frame.inkLow, true);
  const mobileOnly = fixture({ oldMobile: true }); mobileOnly.a.ink = 17.99;
  assert.equal(mobileOnly.read().frame.inkLow, false);
  assert.equal(mobileOnly.touch.els.fire.classes.get('is-low'), true);
});

test('#117 idle low tank has no warning on desktop or touch, in both adapter orders', () => {
  for (const reverse of [false, true]) {
    const h = fixture({ reverse });
    for (const ink of [0, 1.49, 17.99, 18, 18.01, 19.99, 20, 100]) { h.a.ink = ink; h.assertLow(false); }
  }
});

test('#117 actual native main failure flashes both consumers, success below18 does not', () => {
  const h = fixture(); h.a.ink = h.a.weapon.inkPerShot - .001;
  h.runner._auto(1 / 60, { fire: true }, h.a.weapon);
  assert.ok(h.game._lowInkFlash > 0); h.assertLow(true);
  h.game._lowInkFlash = 0; h.runner.cooldown = 0; h.runner.emptyCd = 0;
  h.a.ink = h.a.weapon.inkPerShot + .001;
  h.runner._auto(1 / 60, { fire: true }, h.a.weapon);
  assert.ok(h.a.ink > 0 && h.a.ink < .002); h.assertLow(false);
});

test('#117 equipped sub admission and exact readiness keep the current variable cost', () => {
  for (const scale of [1, .8, .65]) for (const delta of [-.000001, 0, .000001]) {
    const h = fixture(); h.setScale(scale); h.a.weapon.kind = 'sub-only-fixture';
    const cost = h.SUB.bomb.inkCost * scale; h.a.ink = cost + delta;
    h.runner.update(1 / 60, { fire: false, sub: true, subReleased: false });
    const out = h.assertLow(delta < 0);
    assert.equal(out.frame.subCost, cost / 100); assert.equal(out.mobile.subCost, cost / 100);
    assert.equal(out.frame.subReady, delta >= 0); assert.equal(out.mobile.subReady, delta >= 0);
    assert.equal(h.hud.tank.classes.get('is-nosub'), delta < 0);
    assert.equal(h.touch.els.sub.classes.get('is-dim'), delta < 0);
    assert.equal(out.costReads, 1); assert.equal(h.SUB.bomb.inkCost, 70);
  }
});

test('#117 unchanged ink still responds to flash expiry and rejects another actor', () => {
  const h = fixture(); h.a.ink = 17;
  h.assertLow(false); h.emit('lowink', { actor: { isLocal: false } }); h.assertLow(false);
  h.emit('lowink', { actor: h.a }); h.assertLow(true);
  for (let i = 0; i < 74; i++) h.read();
  h.assertLow(false);
  h.emit('lowink', { actor: h.a }); h.assertLow(true);
});

test('#117 synchronous pool reuse overwrites warning while preserving gear fields', () => {
  const h = fixture(); h.a.ink = 17; const first = h.assertLow(false);
  h.emit('lowink', { actor: h.a }); h.setScale(.65); const next = h.assertLow(true);
  assert.equal(first.frame, next.frame); assert.equal(first.mobile, next.mobile);
  assert.equal(next.mobile.subCost, .455); assert.equal(next.mobile.subReady, false);
  h.game._lowInkFlash = 0; h.a.ink = 45.5; const end = h.assertLow(false);
  assert.equal(end.mobile, first.mobile); assert.equal(end.mobile.subReady, true);
});

test('#117 Mobile patch is narrow, fail-closed, and keeps default unflashed state', () => {
  const fixed = snap('src/core/mobile.js', rawMobile);
  assert.throws(() => snap('src/core/mobile.js', fixed), /touch shortage feedback input/);
  assert.throws(() => snap('src/core/mobile.js', rawMobile.replace('ik < 0.2', 'ik < 0.25')), /touch shortage/);
  const h = fixture(); h.touch.setHud({ ink: .01 });
  assert.equal(h.touch.els.fire.classes.get('is-low'), false);
  assert.equal(snap('src/game/weapons.js', rawWeapons), rawWeapons);
});

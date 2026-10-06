import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';
import { applyShotGuide } from '../runtime/weapons-fidelity.mjs';
import { selectedSub, selectedSubCost } from '../runtime/kit-composition.mjs';

// Issue #572 — the standard Splat Charger charge reticle keeps Splatoon 3's 5F
// display delay: no ring and no gauge progress for frames 1–5, the first
// visible gauge at 6F = (6-5)/(60-5) ≈ 1.8%, and 100% at the unchanged 60F
// full-charge point. The delayed view must be derived from the fixed-tick
// WeaponRunner charge clock (chargeT), so 30/60/120 Hz render cadence cannot
// move the HUD timing, and releasing before the threshold must leave no stale
// ring state.
//
// The test executes the ACTUAL adapted `src/ui/hud.js` helper and
// `_updCrosshair` method produced by `adaptSource`, driven by a real public
// WeaponRunner from source-fixture. On unpatched main the helper anchor is
// missing (fails closed), and the raw HUD would light up on the first charging
// tick.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const read = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');

function slice(source, start, end) {
  const at = source.indexOf(start);
  assert.notEqual(at, -1, `missing anchor: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, `anchor not unique: ${start}`);
  const until = source.indexOf(end, at);
  assert.ok(until > at, `missing end anchor: ${end}`);
  return source.slice(at, until);
}

class Classes {
  constructor() { this.names = new Set(); }
  add(...names) { names.forEach(n => this.names.add(n)); }
  remove(...names) { names.forEach(n => this.names.delete(n)); }
  contains(n) { return this.names.has(n); }
  toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
}
class Node {
  constructor() {
    this.classList = new Classes();
    this.style = { setProperty: (k, v) => { this.style[k] = v; } }; this.parts = new Map();
  }
  querySelector(key) { if (!this.parts.has(key)) this.parts.set(key,new Node()); return this.parts.get(key); }
}

// Executes the adapted helper + method exactly as the build installs them.
function install(WEAPONS, G, SUB) {
  const source = adaptSource('src/ui/hud.js', read('src/ui/hud.js'));
  // slice() stops before its end anchor, so the closing brace is re-attached here:
  // the adapter emits the helper as a complete top-level function declaration.
  const helper = slice(source, 'function chargerReticleView(', '\n}') + '\n}';
  const method = slice(source, '  _updCrosshair(f, dt) {', '\n  // ---------------------------------------------------------------- ink tank (canvas, sloshing liquid)');
  const context = vm.createContext({
    clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
    WEAPONS, G, SUB, SUB_ICONS:{}, applyShotGuide, selectedSub, selectedSubCost, innerWidth:800, innerHeight:600,
    specialIcon: () => '',
  });
  const built = vm.runInContext(`${helper}\nclass Harness {\n${method}\n}\n({ Harness, chargerReticleView })`, context);
  const h = Object.create(built.Harness.prototype);
  Object.assign(h, {
    _L: { weapon: 'charger', kind: 'charger' },
    _bloom: 0, _kick: 0,
    ret: new Node(), xh: new Node(), shield: new Node(), subChip: new Node(),
    _chargeEl: new Node(), _chargeC: 100,
    restarts: [],
    _restart(el, cls) { this.restarts.push([el, cls]); },
    _snd() {},
    _local: () => h.actor || null,
  });
  const frame = () => ({ charge: h.actor?.weaponRunner?.charge ?? 0, weapon: 'charger', crosshair: { spread: 0 }, subAim: false, ink: 1, subCost: 0.7 });
  // _buildReticle assigns `iw-ret iw-ret--${kind}` on the real root; mirror that so
  // the shipped stylesheet's compound selector can be checked against this node.
  h.ret.classList.add('iw-ret', 'iw-ret--charger');
  return {
    h,
    view: built.chargerReticleView,
    update() { h._updCrosshair(frame(), 1 / 60); },
    gauge() { const off = h._chargeEl.style.strokeDashoffset; return off == null ? null : 1 - Number(off) / 100; },
    ringOn() { return h.ret.classList.contains('is-charging'); },
    fullOn() { return h.ret.classList.contains('is-full'); },
    delayOn() { return h.ret.classList.contains('is-charge-delay'); },
  };
}

// The shipped stylesheet, read from the patch the build actually links.
const css = () => fs.readFileSync(path.join(ROOT, 'patches/splatoon3/ui.css'), 'utf8');
// One rule block read from the real stylesheet text: its selector and its body.
function rule(source, want) {
  const at = source.indexOf(want);
  assert.notEqual(at, -1, `missing shipped rule: ${want}`);
  const open = source.indexOf('{', at);
  const close = source.indexOf('}', open);
  assert.ok(open > at && close > open, `malformed shipped rule: ${want}`);
  const found = source.slice(at, open).trim();
  assert.equal(found, want, `shipped rule selector must be exactly ${want}, got ${found}`);
  return { sel: found, body: source.slice(open + 1, close) };
}

async function chargingActor() {
  const f = await fixture();
  const a = f.make('charger');
  a.ink = 100; a.form = 'kid'; a.kidT = 1;
  a.intent.fire = true;
  // Current #726 owns one fresh-start tick before authoritative charge begins.
  f.tick(a); assert.equal(a.weaponRunner.chargeT,0);
  return { f, a };
}

test('#572: standard Splat Charger reticle holds the 5F display delay on the installed HUD path', async () => {
  const { f, a } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  hud.h.actor = a;
  assert.equal(f.WEAPONS.charger.reticleDelayF, 5, 'S3 profile owns the 5F gauge delay');
  for (let n = 1; n <= 5; n++) {
    f.tick(a);
    assert.ok(a.weaponRunner.charge > 0, `authoritative charge builds from tick 1 (frame ${n})`);
    hud.update();
    assert.equal(hud.ringOn(), false, `no charge ring during frame ${n}/5`);
    assert.equal(hud.gauge(), 0, `no gauge progress during frame ${n}/5`);
    assert.equal(hud.fullOn(), false, `no full flash during frame ${n}/5`);
  }
  f.tick(a);
  hud.update();
  assert.equal(hud.ringOn(), true, 'charge ring starts at frame 6');
  assert.ok(Math.abs(hud.gauge() - 1 / 55) < 1e-9, `6F gauge is (6-5)/(60-5)=1/55 ≈1.8%, got ${hud.gauge()}`);
  // The authoritative runner state is untouched by HUD reads.
  const before = JSON.stringify({ c: a.weaponRunner.charge, t: a.weaponRunner.chargeT });
  hud.update(); hud.update();
  assert.equal(JSON.stringify({ c: a.weaponRunner.charge, t: a.weaponRunner.chargeT }), before,
    'HUD presentation reads never mutate the authoritative charge');
  // Full charge still lands on the unchanged 60F point.
  let n = 6;
  while (a.weaponRunner.charge < 0.999 && n < 70) { f.tick(a); n++; }
  assert.ok(a.weaponRunner.charge >= 0.999, 'authoritative full charge');
  assert.equal(Math.round(a.weaponRunner.chargeT * 60), 60, 'full charge is reached at 60F');
  hud.update();
  assert.ok(Math.abs(hud.gauge() - 1) < 1e-9, `gauge reaches 100% at the full-charge point, got ${hud.gauge()}`);
  assert.equal(hud.fullOn(), true, 'full flash still fires at the full-charge point');
  assert.equal(hud.ringOn(), true, 'ring stays on at full charge');
});

test('#572: HUD timing is driven by the fixed-tick charge clock, not by render cadence', async () => {
  const snapshots = [];
  for (const updatesPerTick of [1, 2, 3]) {
    const { f, a } = await chargingActor();
    const hud = install(f.WEAPONS, f.G, f.SUB);
    hud.h.actor = a;
    const seen = {};
    for (let n = 1; n <= 60; n++) {
      f.tick(a);
      for (let u = 0; u < updatesPerTick; u++) hud.update();
      if ([1, 5, 6, 12, 30, 60].includes(n)) seen[n] = { ring: hud.ringOn(), gauge: hud.gauge(), full: hud.fullOn() };
    }
    snapshots.push(seen);
  }
  assert.deepEqual(snapshots[1], snapshots[0], '2× render cadence matches the per-tick HUD timing');
  assert.deepEqual(snapshots[2], snapshots[0], '3× render cadence matches the per-tick HUD timing');
  assert.equal(snapshots[0][5].ring, false, '5F still hidden at every cadence');
  assert.equal(snapshots[0][6].ring, true, '6F still visible at every cadence');
});

test('#572: releasing before the display threshold leaves no stale ring state', async () => {
  const { f, a } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  hud.h.actor = a;
  f.tick(a, 3);
  hud.update();
  assert.equal(hud.ringOn(), false, 'still inside the dead period');
  a.intent.fire = false;
  f.tick(a);
  hud.update();
  assert.equal(a.weaponRunner.charging, false, 'authoritative release');
  assert.equal(hud.ringOn(), false, 'no stale is-charging after release');
  assert.equal(hud.fullOn(), false, 'no stale is-full after release');
  assert.equal(hud.gauge(), 0, 'gauge reset after release');
});

test('#572: a weapon without a profile gauge delay keeps the immediate reticle', async () => {
  const { f } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  const view = hud.view({ charging: true, chargeT: 1 / 60 }, { chargeTime: 1 });
  assert.equal(view.visible, true, 'no reticleDelayF means no dead period');
  assert.ok(Math.abs(view.gauge - 1 / 60) < 1e-9, 'gauge maps onto the charge-frame fraction');
  const idle = hud.view({ charging: false, chargeT: 0 }, { chargeTime: 1, reticleDelayF: 5 });
  assert.equal(idle.visible, false, 'idle runner never shows the ring');
  assert.equal(idle.gauge, 0, 'idle runner gauge is 0');
});


test('#572: the whole charger reticle is hidden while a real charge is still inside the 5F delay', async () => {
  const { f, a } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  hud.h.actor = a;
  for (let n = 1; n <= 5; n++) {
    f.tick(a);
    hud.update();
    assert.equal(hud.delayOn(), true, `installed DOM carries is-charge-delay on frame ${n}/5`);
    assert.equal(hud.ringOn(), false, `frame ${n}/5 is still the dead period`);
  }
  f.tick(a);
  hud.update();
  assert.equal(hud.delayOn(), false, 'frame 6 drops the delay gate');
  assert.equal(hud.ringOn(), true, 'frame 6 shows the reticle');
  // Releasing inside the dead period must not leave the reticle latched off.
  const { f: f2, a: a2 } = await chargingActor();
  const hud2 = install(f2.WEAPONS, f2.G, f2.SUB);
  hud2.h.actor = a2;
  f2.tick(a2, 3);
  hud2.update();
  assert.equal(hud2.delayOn(), true, 'still inside the dead period');
  a2.intent.fire = false;
  f2.tick(a2);
  hud2.update();
  assert.equal(hud2.delayOn(), false, 'release clears the delay gate');
  assert.equal(hud2.ringOn(), false, 'idle Charger visibility is not gated here (#594 is a separate owner)');
});

test('#572: the shipped stylesheet hides the charger reticle on that class, and only the charger', async () => {
  const source = css();
  const found = rule(source, '.iw-ret--charger.is-charge-delay');
  const { sel, body } = found;
  assert.ok(sel.startsWith('.iw-ret--charger'), 'the rule targets the charger reticle root');
  assert.ok(sel.endsWith('.is-charge-delay'), 'the rule keys on the installed DOM class');
  assert.ok(/visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0/.test(body),
    `the rule must actually hide the reticle, got: ${body.trim()}`);
  assert.ok(!sel.includes('is-charging'), 'the rule must not depend on is-charging, which is off during the delay');
  assert.ok(!/splatling/i.test(sel), 'splatling/streaming visibility is a separate owner and stays unchanged');
  // The DOM class the HUD toggles is exactly the class the stylesheet keys on.
  const { f, a } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  hud.h.actor = a;
  f.tick(a);
  hud.update();
  assert.equal(hud.delayOn(), true, 'HUD sets the class the stylesheet consumes');
  assert.ok(hud.h.ret.classList.contains('iw-ret--charger'), 'the reticle root carries the reticle kind class');
  assert.ok(sel.split('.').filter(Boolean).every(cls => hud.h.ret.classList.contains(cls)),
    'every class in the selector is present on the live reticle root, so the rule matches it');
});

test('#572: the delay gate leaves full charge at 60F and never touches authoritative charge or damage', async () => {
  const { f, a } = await chargingActor();
  const hud = install(f.WEAPONS, f.G, f.SUB);
  hud.h.actor = a;
  let n = 5;
  while (a.weaponRunner.charge < 0.999 && n < 70) { f.tick(a); n++; }
  hud.update();
  assert.ok(a.weaponRunner.charge >= 0.999, 'authoritative full charge');
  assert.equal(Math.round(a.weaponRunner.chargeT * 60), 60, 'full charge is still reached at 60F');
  assert.equal(hud.delayOn(), false, 'no delay gate at full charge');
  assert.equal(hud.ringOn(), true, 'ring stays on at full charge');
  assert.equal(hud.fullOn(), true, 'full flash still fires at the full-charge point');
  assert.ok(Math.abs(hud.gauge() - 1) < 1e-9, 'gauge still reaches 100%');
  // Reading the gate is presentation only: the runner's own state is untouched.
  const before = JSON.stringify({ c: a.weaponRunner.charge, t: a.weaponRunner.chargeT, ch: a.weaponRunner.charging });
  for (let i = 0; i < 3; i++) hud.update();
  assert.equal(JSON.stringify({ c: a.weaponRunner.charge, t: a.weaponRunner.chargeT, ch: a.weaponRunner.charging }), before,
    'HUD reads never mutate the authoritative charge');
  a.intent.fire = false;
  const shots = f.shots.length;
  f.tick(a, 2); // Current #680 retains the already-paid release for one fixed tick.
  assert.equal(a.weaponRunner.charging, false, 'release is still the authoritative phase clock');
  assert.equal(f.shots.length, shots + 1, 'exactly one projectile is fired on release; damage path unchanged');
});

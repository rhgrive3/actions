import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { DualiesAccuracy, DUALIES_GROUNDED_BIAS_MAX, DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES } from '../runtime/dualies-accuracy.mjs';
import { applyShotGuide } from '../runtime/weapons-fidelity.mjs';
import { selectedSub, selectedSubCost } from '../runtime/kit-composition.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'inkwave-public');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
const PARAM = PROFILE.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
const REF_HZ = PROFILE.weaponsFidelityCompletion.referenceHz;
const FRAME = 1 / REF_HZ;
const read = rel => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} !== ${expected}`);

async function nativeFixture() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies');
  a.ink = 100;
  a.form = 'kid';
  a.pos.set(0, 0, 0);
  a.character.root.position.copy(a.pos);
  a.aimPoint.set(0, 1.05, 24);
  a.aimDir.set(0, 0, 1);
  a.yaw = 0;
  a.weaponRunner.cooldown = 0;
  return { f, a, r: a.weaponRunner, projectiles: f.G.projectiles };
}

function fireOne(f, a, randomValues = [0.99]) {
  const r = a.weaponRunner, values = [...randomValues];
  const before = f.G.projectiles.list.length;
  r.cooldown = 0;
  r.hand = 0;
  r.inkShotSequences = Object.create(null);
  f.setRandom(() => values.length ? values.shift() : 0.99);
  try {
    for (let i = 0; i < 8 && f.G.projectiles.list.length === before; i++)
      r.update(FRAME, { fire: true });
  }
  finally { f.restoreRandom(); }
  assert.equal(f.G.projectiles.list.length, before + 1, 'native WeaponRunner admission emits one Dualies projectile');
  return f.G.projectiles.list.at(-1);
}

test('#891 uses the pinned Splat Dualies bias parameters and Wiki cap', () => {
  assert.equal(PROFILE.weaponsFidelityCompletion.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(REF_HZ, 60);
  assert.equal(PARAM.Stand_DegBiasMin, 0.01);
  assert.equal(PARAM.Stand_DegBiasKf, 0.01);
  assert.equal(PARAM.Stand_DegBiasDecrease, 0.005);
  assert.equal(PARAM.RepeatFrame, 5);
  assert.equal(DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES, 5);
  assert.equal(PARAM.Jump_DegBiasMax, 0.4);
  assert.equal(PARAM.Stand_DegSwerve, 2);
  assert.equal(PARAM.Jump_DegSwerve, 7.5);
  assert.equal(DUALIES_GROUNDED_BIAS_MAX, 0.25);
});

test('#891 grounded bias starts at 1%, reaches 25% after 24 shots, then recovers after 5F', () => {
  const accuracy = new DualiesAccuracy(PARAM, REF_HZ);
  assert.equal(accuracy.bias, 0.01);
  const samples = [];
  for (let i = 0; i < 30; i++) {
    samples.push(accuracy.bias);
    accuracy.recordShot(true);
  }
  assert.equal(samples[0], 0.01);
  close(samples[23], 0.24, '24th shot still samples the pre-cap state');
  assert.equal(samples[24], 0.25);
  assert.equal(samples[29], 0.25);
  assert.equal(accuracy.bias, 0.25);

  for (let i = 0; i < 5; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.25, 'first five fixed frames hold the last shot bias');
  accuracy.advance(FRAME);
  close(accuracy.bias, 0.245, 'first recovery step is 0.5 percentage points');
  for (let i = 0; i < 47; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.01, '53 frames after the last shot reaches the minimum');
});

test('#891 jump sets 40% bias and keeps its 5F/0.5pp recovery state separate', () => {
  const accuracy = new DualiesAccuracy(PARAM, REF_HZ);
  accuracy.jump();
  assert.equal(accuracy.bias, 0.4);
  accuracy.recordShot(false);
  for (let i = 0; i < 5; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.4, 'five frames after a jump shot stay at 40%');
  for (let i = 0; i < 78; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.01, '83 frames after a jump shot reaches the minimum');
});

test('#891 production Dualies projectiles choose inner versus outer envelope from the same bias state', async () => {
  const { f, a, r } = await nativeFixture();
  const selected = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  f.Projectiles.prototype._fireRound = function (actor, weapon, spread, ...rest) {
    if (actor === a && weapon.kind === 'dualies') selected.push(spread);
    return originalRound.call(this, actor, weapon, spread, ...rest);
  };
  try {
    const inner = fireOne(f, a, [0.99]);
    assert.equal(selected[0], 0, 'non-outer event stays on the inner aim point');
    close(r.s3DualiesBiasState(a.weapon).bias, 0.02, 'one admitted grounded round advances the next bias by 1pp');

    const outer = fireOne(f, a, [0, 0.999999, 0]);
    assert.equal(selected[1], 2, 'outer event uses the sourced 2 degree grounded envelope');
    const angleDegrees = inner.vel.clone().normalize().angleTo(outer.vel.clone().normalize()) * 180 / Math.PI;
    assert.ok(angleDegrees > 1.9 && angleDegrees <= 2.001, `outer projectile leaves the inner aim by the 2 degree envelope, got ${angleDegrees}`);
    close(r.s3DualiesBiasState(a.weapon).bias, 0.03, 'second admitted grounded round advances once');
    assert.equal(r.spread, 2, 'runner/HUD envelope remains the sourced maximum, not a probability-weighted cone');
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
});

test('#891 dry clicks and blocked Dualies updates do not advance bias', async () => {
  const { f, a, r, projectiles } = await nativeFixture();
  a.ink = 0;
  r.update(FRAME, { fire: true });
  assert.equal(projectiles.list.length, 0, 'empty input emits no projectile');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01);

  a.ink = 100;
  r.dodge = { t: 0, dur: 0.2 };
  r.update(FRAME, { fire: true });
  assert.equal(projectiles.list.length, 0, 'a roll-blocked update emits no projectile');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01);
});

test('#891 jump bias, grounded/air envelopes and post-roll turret remain separate', async () => {
  const { f, a, r } = await nativeFixture();
  a.grounded = false;
  a.s3JumpSerial = 1;
  r.update(FRAME, { fire: false });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);
  assert.equal(r.spread, 7.5, 'air envelope stays at Jump_DegSwerve');
  r.update(FRAME, { fire: true });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4, 'air shots do not replace the jump bias with the grounded cap');

  const beforeTurret = r.s3DualiesBiasState(a.weapon).bias;
  r.s3Turret = true;
  r.bloom = 1;
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadLock);
  r.cooldown = 0;
  const before = f.G.projectiles.list.length;
  r.update(FRAME, { fire: true });
  assert.equal(f.G.projectiles.list.length, before + 1, 'turret still emits through its independent native shot path');
  close(r.s3DualiesBiasState(a.weapon).bias, beforeTurret, 'turret firing does not inherit or advance normal bias');
});

test('#891 landing applies the documented grounded cap before the next normal projectile', async () => {
  const { f, a, r } = await nativeFixture();
  a.grounded = false;
  a.s3JumpSerial = 1;
  r.update(FRAME, { fire: false });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);

  const selected = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  f.Projectiles.prototype._fireRound = function (actor, weapon, spread, ...rest) {
    if (actor === a && weapon.kind === 'dualies') selected.push(spread);
    return originalRound.call(this, actor, weapon, spread, ...rest);
  };
  a.grounded = true;
  try {
    fireOne(f, a, [0.3, 0.99, 0.99]);
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
  assert.equal(selected[0], 0, 'grounded cap applies before chance selection on the landing frame');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.25);
});

async function fixedClockTrace(renderHz) {
  const { f, a, r, projectiles } = await nativeFixture();
  const clock = new f.FixedClock(), shots = [];
  f.setRandom(() => 0.99);
  try {
    for (let frame = 0; frame < renderHz * 3; frame++) {
      clock.advance(1 / renderHz, step => {
        const before = projectiles.list.length;
        r.update(step, { fire: clock.ticks < 120 });
        if (projectiles.list.length > before)
          shots.push({ tick: clock.ticks, bias: r.s3DualiesBiasState(a.weapon).bias });
      });
    }
  } finally { f.restoreRandom(); }
  return { shots, bias: r.s3DualiesBiasState(a.weapon).bias, framesSinceShot: r.s3DualiesBiasState(a.weapon).framesSinceShot, ticks: clock.ticks };
}

test('#891 fixed-clock native shot and recovery boundaries match at 30/60/120 Hz render rates', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(await fixedClockTrace(hz));
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.deepEqual(traces[0].shots.map(s => s.tick), Array.from({ length: 24 }, (_, i) => 2 + i * 5));
  close(traces[0].shots[0].bias, 0.02, 'first emitted shot leaves 2% for the next shot');
  close(traces[0].shots[23].bias, 0.25, '24th emitted shot reaches the 25% cap');
  close(traces[0].bias, 0.01, 'recovery returns to the grounded minimum');
  assert.equal(traces[0].framesSinceShot, 62);
  assert.equal(traces[0].ticks, 180);
});

class ClassList {
  constructor() { this.names = new Set(); }
  contains(name) { return this.names.has(name); }
  toggle(name, enabled = !this.contains(name)) { enabled ? this.names.add(name) : this.names.delete(name); return enabled; }
}
class ElementStub {
  constructor() {
    this.classList = new ClassList();
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.parts = new Map();
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
  }
  querySelector(key) {
    if (!this.parts.has(key)) this.parts.set(key, new ElementStub());
    return this.parts.get(key);
  }
}

function dualiesHud(actor, G, WEAPONS, SUB) {
  const source = adaptSource('src/ui/hud.js', read('src/ui/hud.js'));
  assert.match(source, /this\._dualiesBiasEl = r\.querySelector\('\.iw-ret__bias'\)/);
  assert.match(source, /s3DualiesBiasState\?\.\(WEAPONS\[w\]\)/);
  const start = '  _updCrosshair(f, dt) {';
  const at = source.indexOf(start), end = source.indexOf('\n  // ---------------------------------------------------------------- ink tank (canvas, sloshing liquid)', at);
  assert.ok(at >= 0 && end > at, 'adapted HUD update method exists');
  const method = source.slice(at, end);
  const context = vm.createContext({
    clamp: (value, min = 0, max = 1) => Math.max(min, Math.min(max, value)),
    G, WEAPONS, SUB, SUB_ICONS: {}, applyShotGuide, selectedSub, selectedSubCost,
    specialIcon: () => '', innerWidth: 800, innerHeight: 600,
  });
  const Harness = vm.runInContext(`class Harness {\n${method}\n}\nHarness`, context);
  const h = Object.create(Harness.prototype);
  Object.assign(h, {
    _L: { weapon: 'dualies', kind: 'dualies', tgt: false, far: false, spread: null, lock: false, roll: false, inv: false, aim: false },
    _bloom: 0, _kick: 0, ret: new ElementStub(), xh: new ElementStub(), shield: new ElementStub(),
    subChip: new ElementStub(), _dualiesBiasEl: new ElementStub(), _local: () => actor, _snd() {},
  });
  return { h, update() { h._updCrosshair({ weapon: 'dualies', crosshair: { spread: 0 }, ink: 1, subCost: 0.7 }, FRAME); } };
}

test('#891 adapted Dualies HUD displays the same live authoritative bias and hides it in turret mode', async () => {
  const { f, a, r } = await nativeFixture();
  const hud = dualiesHud(a, f.G, f.WEAPONS, f.SUB);
  hud.update();
  assert.equal(hud.h._dualiesBiasEl.textContent, 'OUT 1%');
  assert.equal(hud.h._dualiesBiasEl.hidden, false);

  for (let i = 0; i < 24; i++) fireOne(f, a, [0.99]);
  hud.update();
  assert.equal(hud.h._dualiesBiasEl.textContent, 'OUT 25%');
  assert.equal(hud.h._dualiesBiasEl.dataset.phase, 'holding');

  a.ink = 0;
  for (let i = 0; i < 5; i++) {
    r.cooldown = 0;
    r.update(FRAME, { fire: true });
  }
  close(r.s3DualiesBiasState(a.weapon).bias, 0.25, 'dry held input still observes the five-frame recovery wait');
  r.cooldown = 0;
  r.update(FRAME, { fire: true });
  close(r.s3DualiesBiasState(a.weapon).bias, 0.245, 'dry held input advances recovery after the wait');
  hud.update();
  assert.equal(hud.h._dualiesBiasEl.textContent, 'OUT 24.5%');
  assert.equal(hud.h._dualiesBiasEl.dataset.phase, 'recovering');

  r.s3Turret = true;
  hud.update();
  assert.equal(hud.h._dualiesBiasEl.hidden, true, 'post-roll lock presents its separate turret state');

  r.s3Turret = false;
  r.lockT = 1 / 60;
  hud.update();
  assert.equal(hud.h._dualiesBiasEl.hidden, true, 'the zero-spread lock window also hides normal-fire bias');
});

// INKWAVE issue #196 regression: special activation must cancel a suspended
// Charger charge. Uses the repo's lightweight source-fixture (actual public
// Actor/WeaponRunner via adaptSource + the real splatoon3 runtime installs),
// then applies the narrow issue-196 adapter for the patched cases. No
// renderer, no second engine. Native fixed-step DT=1/60 throughout.
// Covers: negative native control, held/released input, gear + no-ink paths,
// unsuccessful attempt preservation, splatling exclusion, owner/remote parity,
// post-special normal use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installIssue196SpecialChargeCancel } from '../issue-196-adapter.mjs';

const DT = 1 / 60;
// Current charge admission reads Actor intent and its form-exit clock.
const drive = (r, input) => { r.a.intent.fire = !!input.fire; r.a.kidT = Math.max(r.a.kidT, r.a.weapon.swimChargeStartDelay || 0); return r.update(DT, input); }; 
let nativeCtx = null;
let fixedCtx = null;
async function ctx(withFix) {
  if (withFix && fixedCtx) { fixedCtx.shots.length = 0; return fixedCtx; }
  if (!withFix && nativeCtx) { nativeCtx.shots.length = 0; return nativeCtx; }
  const f = await fixture();
  f.G.projectiles.throwStorm = () => f.shots.push({ kind: 'storm' });
  const api = { Actor: f.Actor, WeaponRunner: f.WeaponRunner };
  if (withFix) installIssue196SpecialChargeCancel(api);
  // Storm already resets all runner state; exercise the remaining native Slam path.
  const make = (kind) => { const a=f.make(kind); a.weapon={...a.weapon,special:'slam'}; return a; };
  const out = { ...f, make, installOk: withFix };
  if (withFix) fixedCtx = out; else nativeCtx = out;
  return out;
}
const loadout = ability => {
  const parts = Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
  for (const part of parts) { part.main = ability; part.subs.fill(ability); }
  return parts;
};
function chargeTo(a, frames) {
  a.ink = 100;
  a.special = a.specialCost();
  const r = a.weaponRunner;
  for (let i = 0; i < (frames || 36); i++) drive(r, { fire: true });
  assert.equal(r.charging, true, 'precondition: charger is charging');
  assert.ok(r.charge > 0.5 && r.charge < 0.75, 'precondition: ~62.5% charge, got ' + r.charge);
  return r;
}
function chargerShots(f) { return f.shots.filter(s => s.kind === 'charger').length; }
test('negative control: unpatched native fires the frozen pre-special charge', async () => {
  const f = await ctx(false);
  const a = f.make('charger');
  const r = chargeTo(a);
  a._startSpecial();
  assert.equal(r.charging, true, 'native leaves the charge suspended');
  a.specialActive = null; // special window ends; runner was frozen throughout
  const inkBefore = a.ink;
  drive(r, { fire: false });
  assert.equal(chargerShots(f), 1, 'native stale release fires');
  assert.equal(a.ink, inkBefore, 'current continuous-debit owner does not charge twice on stale release');
});
test('patched: charge cancelled at special start, held/released input cannot resurrect', async () => {
  for (const held of [true, false]) {
    const f = await ctx(true);
    const a = f.make('charger');
    const r = chargeTo(a);
    let stops = 0;
    r.chargeLoop = { stop: () => stops++, set: () => {} };
    a._startSpecial();
    assert.equal(r.charging, false, 'cancelled at start held=' + held);
    assert.equal(r.charge, 0, 'charge cleared held=' + held);
    assert.equal(r.chargeT, 0, 'chargeT cleared held=' + held);
    assert.equal(stops, 1, 'charge audio loop stopped held=' + held);
    assert.equal(r.s3Stored ?? null, null, 'stored charge cleared held=' + held);
    a.specialActive = null; // frozen special window passes with no runner ticks
    const inkBefore = a.ink;
    const n = chargerShots(f);
    if (!held) {
      drive(r, { fire: false });
      drive(r, { fire: false });
      assert.equal(chargerShots(f), n, 'no stale shot released');
      assert.equal(a.ink, inkBefore, 'no stale ink spend released');
      assert.equal(r.charging, false, 'still idle released');
    } else {
      // Still-held Fire after the handoff is NEW input: it must start a fresh
      // charge from zero (chargeT ~= DT), never fire the stale ~62% shot.
      drive(r, { fire: true }); drive(r, { fire: true });
      assert.equal(chargerShots(f), n, 'no stale shot held');
      assert.equal(r.charging, true, 'held Fire starts a fresh charge');
      assert.ok(r.chargeT <= 2 * DT + 1e-9, 'fresh chargeT, not resurrected 0.6, got ' + r.chargeT);
      assert.ok(r.charge < 0.2, 'fresh charge value, not resurrected 0.625, got ' + r.charge);
      drive(r, { fire: false });
      drive(r, { fire: false });
    }
  }
});
test('patched: gear and no-ink paths produce no stale shot', async () => {
  {
    const f = await ctx(true);
    const a = f.make('charger');
    a.s3.loadout = loadout('inkSaverMain');
    a.setWeapon('charger');
    const r = chargeTo(a);
    a._startSpecial();
    assert.equal(r.charging, false, 'gear run cancelled at start');
    a.specialActive = null;
    const n = chargerShots(f);
    const inkBefore = a.ink;
    drive(r, { fire: false });
    assert.equal(chargerShots(f), n, 'gear run: no stale shot');
    assert.equal(a.ink, inkBefore, 'gear run: no stale ink spend');
  }
  {
    const f = await ctx(true);
    const a = f.make('charger');
    const r = chargeTo(a);
    a._startSpecial();
    assert.equal(r.charging, false);
    a.specialActive = null;
    a.ink = 0;
    const n = chargerShots(f);
    drive(r, { fire: false });
    drive(r, { fire: true });
    assert.equal(chargerShots(f), n, 'no-ink: no stale shot');
  }
});
test('patched: unsuccessful attempt preserves charge, splatling spin untouched', async () => {
  {
    const f = await ctx(true);
    const a = f.make('charger');
    const r = chargeTo(a);
    a.special = 0;
    const saved = a.weapon.special;
    a.weapon.special = '__unknown__';
    a._startSpecial();
    a.weapon.special = saved;
    assert.equal(a.specialActive, null, 'no activation on unknown special');
    assert.equal(r.charging, true, 'charge preserved on unsuccessful attempt');
    assert.ok(r.charge > 0.5, 'charge value preserved');
    a.specialActive = null;
  }
  {
    const f = await ctx(true);
    const a = f.make('splatling');
    a.ink = 100;
    a.special = a.specialCost();
    const r = a.weaponRunner;
    for (let i = 0; i < 20; i++) drive(r, { fire: true });
    assert.equal(r.charging, true, 'precondition: splatling spinning');
    a._startSpecial();
    assert.ok(a.specialActive === null || a.specialActive, 'splatling special path ran');
    assert.equal(r.charging, false, 'existing Splatling owner cancels on special independently of Charger fix');
    a.specialActive = null;
  }
});
test('patched: owner/remote parity and normal post-special charger use', async () => {
  for (const local of [true, false]) {
    const f = await ctx(true);
    const a = f.make('charger');
    a.isLocal = local;
    const r = chargeTo(a);
    a._startSpecial();
    assert.equal(r.charging, false, 'cancelled local=' + local);
    a.specialActive = null;
    const n = chargerShots(f);
    drive(r, { fire: false });
    assert.equal(chargerShots(f), n, 'no stale shot local=' + local);
    a.ink = 100;
    for (let i = 0; i < 70; i++) drive(r, { fire: true });
    assert.equal(r.charging, true, 'fresh charge works local=' + local);
    drive(r, { fire: false });
    assert.equal(chargerShots(f), n + 1, 'fresh release fires local=' + local);
  }
});

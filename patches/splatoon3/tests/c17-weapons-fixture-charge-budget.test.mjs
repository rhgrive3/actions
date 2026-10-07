// C17 CI repair regression (#732/#745 -> scripts/measure-weapons-fidelity.mjs).
//
// CI failed the built-weapons verifier with "39 !== 40" on the splatling-full
// 40-shot golden. The cause was in the fixture, not the game and not the golden:
// the runner held ZR for a fixed tick count, so the sourced 1F humanoid Heavy
// Splatling startup spent the first charge tick and the case released at charge
// 0.986 instead of 1. The case named "full" was therefore never full, and the
// shortened charge produced 39 shots and 22.03125 ink instead of 40 and 22.5.
//
// This regression pins the property that broke, so a future startup phase cannot
// silently under-charge a case again: the fixture must hold until the weapon
// reaches the case's named charge fraction, and the pinned goldens must hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { CASES, reset, round } from '../../../scripts/measure-weapons-fidelity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const site = path.resolve(root, '_site');
const close = (a, b, t = 1e-7, msg) => assert.ok(Math.abs(a - b) <= t, msg ? `${msg}: ${a} != ${b} ±${t}` : `${a} != ${b} ±${t}`);

// Mirrors the runner loop in scripts/measure-weapons-fidelity.mjs. Kept as a
// literal copy on purpose: if that loop ever goes back to counting raw ticks,
// the behaviour assertion below fails instead of the CI verifier failing.
function chargeAndRelease(f, c) {
  const a = reset(f, c);
  const r = a.weaponRunner;
  const chargeFrames = c.id === 'charger' || c.id === 'splatling'
    ? Math.round(c.charge * a.weapon.chargeTime * 60) : 0;
  const target = c.charge ?? 1;
  const budget = chargeFrames ? chargeFrames + 60 : 180;
  for (let frame = 0; frame < budget; frame++) {
    f.tick(a, { fire: true });
    if (chargeFrames && frame + 1 >= chargeFrames && r.charge >= target - 1e-9) break;
  }
  return { a, r, chargeFrames, chargeAtRelease: round(r.charge) };
}

test('the Heavy Splatling humanoid startup is budgeted, so a "full" case reaches full charge', async () => {
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  for (const key of ['splatling-partial', 'splatling-first', 'splatling-full']) {
    const c = CASES.find(x => x.key === key);
    const got = chargeAndRelease(f, c);
    close(got.chargeAtRelease, c.charge, 1e-8);
    assert.ok(got.chargeAtRelease >= c.charge - 1e-9, `${key} must reach its named charge fraction`);
  }
});

test('the pinned splatling-full 40-shot and 22.5 ink goldens hold on a freshly built site', async () => {
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  const c = CASES.find(x => x.key === 'splatling-full');
  const { a, chargeAtRelease } = chargeAndRelease(f, c);
  close(chargeAtRelease, 1, 1e-9);
  for (let frame = 0; frame < 240; frame++) f.tick(a, { fire: false });
  assert.equal(f.fires.length, 40, 'splatling-full must still land the pinned 40 shots');
  close(round(100 - a.ink), 22.5);
});

test('a case whose charge the product reaches within the nominal budget is not extended', async () => {
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  const c = CASES.find(x => x.key === 'charger-1');
  const { a, r, chargeFrames, chargeAtRelease } = chargeAndRelease(f, c);
  assert.ok(r.charge >= 1 - 1e-9, 'charger-1 reaches full charge');
  close(chargeAtRelease, 1, 1e-9, 'charger-1 reaches full charge at release');
  assert.ok(chargeFrames > 0, 'charger cases keep their nominal budget');
  for (let frame = 0; frame < 240; frame++) f.tick(a, { fire: false });
  close(round(100 - a.ink), 18, 1e-7, 'the charger-1 ink golden is unchanged');
});

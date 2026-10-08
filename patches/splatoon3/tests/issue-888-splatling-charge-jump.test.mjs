import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

function gear(a, ap, ability = 'inkResistance') {
  a.s3.loadout = emptyLoadout();
  if (ap === 57) for (const part of a.s3.loadout) { part.main = ability; part.subs.fill(ability); }
  if (ap === 10) a.s3.loadout[0].main = ability;
  if (ap === 3) a.s3.loadout[0].subs[0] = ability;
  a.setWeapon(a.weaponId);
}

// #888 Heavy Splatling (WeaponSpinnerStandard) charging jump keeps the normal
// impulse instead of S3 Ver. 11.3.0's reduced 0.7 DU/F charge-state value.
// The S3 0.7 DU/F velocity is identical to the already-calibrated charger
// full-charge value, so the cap reuses that established INKWAVE velocity
// (4.2) via shared normalization. No new DU/F->WU factor is invented; the
// pinned JumpGnd_Charge 0.08 field is existence evidence only (unit
// undocumented) and is not used as a conversion source.
test('#888 Heavy Splatling charging jump is capped while ordinary/streaming jumps are unchanged', async () => {
  const f = await fixture();
  f.G.paint.sample = () => 1;
  const ordinary = f.make('splatling');
  ordinary.intent.jump = true; f.tick(ordinary);
  close(ordinary.vel.y, f.PLAYER.jumpVel);

  for (const charge of [0.1, 0.5, 1]) {
    const a = f.make('splatling');
    a.weaponRunner.charging = true; a.weaponRunner.charge = charge;
    a.weaponRunner.streaming = false;
    a.intent.fire = true; a.intent.jump = true; f.tick(a);
    close(a.vel.y, 4.2);
    assert.notEqual(a.vel.y, f.PLAYER.jumpVel, `charge ${charge} must differ from ordinary`);
  }

  const stream = f.make('splatling');
  stream.weaponRunner.charging = false; stream.weaponRunner.streaming = true;
  stream.intent.fire = true; stream.intent.jump = true; f.tick(stream);
  close(stream.vel.y, f.PLAYER.jumpVel);

  const shooter = f.make('shooter');
  shooter.intent.jump = true; f.tick(shooter);
  close(shooter.vel.y, f.PLAYER.jumpVel);

  const charger = f.make('charger');
  charger.intent.fire = true; f.tick(charger, 80);
  charger.intent.jump = true; f.tick(charger);
  close(charger.vel.y, 4.2);
});

test('#888 charging Heavy Splatling stays capped on enemy ink and Ink Resistance cannot lift it', async () => {
  const f = await fixture();
  for (const ap of [0, 3, 10, 57]) {
    f.G.paint.sample = () => 2;
    const a = f.make('splatling');
    gear(a, ap, 'inkResistance');
    a.weaponRunner.charging = true; a.weaponRunner.charge = 1;
    a.weaponRunner.streaming = false;
    a.intent.fire = true; a.intent.jump = true; f.tick(a);
    close(a.vel.y, 4.2);
  }
  f.G.paint.sample = () => 1;
});

test('#888 charging Heavy Splatling takeoff is identical at 30/60/120Hz presentation cadence', async () => {
  const values = [];
  for (const hz of [30, 60, 120]) {
    void hz;
    const f = await fixture();
    f.G.paint.sample = () => 1;
    const a = f.make('splatling');
    a.weaponRunner.charging = true; a.weaponRunner.charge = 1;
    a.weaponRunner.streaming = false;
    a.intent.fire = true; a.intent.jump = true; f.tick(a);
    values.push(a.vel.y);
  }
  close(values[0], values[1]); close(values[1], values[2]);
  close(values[0], 4.2);
});

test('#888 full production composition keeps the same charging-jump cap', async () => {
  const f = await fixture({ productionComposition: true });
  f.G.paint.sample = () => 1;
  const a = f.make('splatling');
  a.weaponRunner.charging = true; a.weaponRunner.charge = 1;
  a.weaponRunner.streaming = false;
  a.intent.fire = true; a.intent.jump = true; f.tick(a);
  close(a.vel.y, 4.2);
  const b = f.make('splatling');
  b.intent.jump = true; f.tick(b);
  close(b.vel.y, f.PLAYER.jumpVel);
});

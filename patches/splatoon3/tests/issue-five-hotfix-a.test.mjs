import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { registerKitSubs } from '../runtime/kit-subs.mjs';
import { installIssueFiveHotfixA } from '../runtime/issue-five-hotfix-a.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-8, `${m}: ${a} != ${b}`);

test('#1064: verified Suction/Curling resolve the level-2 Ink Saver Sub curve', async () => {
  const f = await fixture();
  registerKitSubs(f.SUB, f.profile);
  installIssueFiveHotfixA(f, f.profile);
  assert.deepEqual([...f.SUB.suction.inkSaverCurve], [1, 0.825, 0.65]);
  assert.deepEqual([...f.SUB.curling.inkSaverCurve], [1, 0.825, 0.65]);
  near(f.gearCurve(57, ...f.SUB.suction.inkSaverCurve), 0.65, 'Suction 57AP');
  near(f.gearCurve(57, ...f.SUB.curling.inkSaverCurve), 0.65, 'Curling 57AP');
});

test('#1061: ordinary airborne acceleration matches the grounded S3 baseline', async () => {
  const f = await fixture();
  installIssueFiveHotfixA(f, f.profile);
  const a = f.make('shooter');
  a.grounded = false; a.ground.hit = false; a.form = 'kid';
  a.specialActive = null; a.superJumpState = null;
  a.intent.sub = false; a.intent.fire = false; a.intent.move.set(0, 0, 1);
  a.weaponRunner.firingT = 0; a.weaponRunner.aimingSub = false;
  a.vel.set(0, 0, 0);
  a._horizontal(DT, false, false);
  near(a.vel.z, f.PLAYER.s3GroundAccel * DT, 'ordinary air step');
  assert.equal(f.PLAYER.airAccel, 20, 'shared legacy coefficient is restored after the scoped call');
});

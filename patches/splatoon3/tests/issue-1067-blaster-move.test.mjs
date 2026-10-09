import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installIssueFiveHotfixB } from '../runtime/issue-five-hotfix-b.mjs';

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-8, `${m}: ${a} != ${b}`);

test('#1067: Blaster firing movement endpoint owns all 22 post-shot movement ticks', async () => {
  const f = await fixture();
  installIssueFiveHotfixB(f);
  const a = f.make('blaster'), r = a.weaponRunner;
  a.ink = 100; a.kidT = 99; a.intent.fire = true;
  for (let i = 0; i < 90 && !f.shots.some(s => s.kind === 'blaster'); i++) f.tick(a);
  assert.ok(f.shots.some(s => s.kind === 'blaster'), 'shot emitted');
  near(r.s3BlasterMoveRemaining, a.weapon.postShotDelay, 'starts at 22F');
  a.intent.fire = false;
  for (let i = 1; i <= 22; i++) {
    near(r.moveSpeed(), a.weapon.moveSpeedFiring, `restricted tick ${i}`);
    f.tick(a);
  }
  near(r.s3BlasterMoveRemaining, 0, 'expires after tick 22');
  near(r.moveSpeed(), f.PLAYER.runSpeed, 'normal run returns after 22F');
});

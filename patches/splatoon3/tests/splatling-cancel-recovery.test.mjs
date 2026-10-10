import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { splatlingSubInterrupt } from '../runtime/weapons.mjs';
const DT = 1 / 60;
async function charging() {
  const f = await fixture(), a = f.make('splatling');
  a.ink = 50; a.intent.fire = true; f.tick(a, 48);
  assert.equal(a.weaponRunner.charging, true);
  return { f, a, r: a.weaponRunner };
}
// Community 60fps verification table, heading v10.0.1. This is not the
// extracted 11.3.0 WeaponParam.InkRecoverStop=40F (fired stream recovery).
test('#679 charge-to-squid cancellation resumes refill at edge+29F, not edge+6F', async () => {
  const { f, a, r } = await charging(), before = a.ink;
  a.intent.squid = true;
  for (let frame = 0; frame < 29; frame++) {
    f.tick(a);
    assert.equal(a.ink, before, `refill blocked at cancel+${frame}F`);
    if (frame >= 6) assert.equal(a.form, 'squid', 'form window stays independent');
  }
  assert.equal(r.charging, false);
  assert.equal(f.shots.length, 0);
  f.tick(a);
  assert.ok(a.ink > before, 'refill reopens at cancel+29F');
});
test('#679 charge interruption publishes recovery once, and reset clears the pending event', async () => {
  const { f, a, r } = await charging();
  a.intent.squid = true; f.tick(a, 10);
  const remaining = a.s3.recoverStopRemaining;
  for (let i = 0; i < 20; i++) r.busy();
  assert.equal(a.s3.recoverStopRemaining, remaining, 'busy polling cannot restart recovery');
  r.s3SplatlingCancelRefillPending = true; r.reset();
  assert.equal(r.s3SplatlingCancelRefillPending, false);
});
test('#1021 sub charge cancellation arms its own 29F lock without shortening an existing lock', async () => {
  const { a, r } = await charging();
  a.s3.recoverStopRemaining = 0;
  assert.equal(splatlingSubInterrupt(r, a, DT, { sub: true }), 'wait');
  assert.equal(a.s3.recoverStopRemaining, 29 / 60);
  a.s3.recoverStopRemaining = 1;
  splatlingSubInterrupt(r, a, DT, { sub: true });
  assert.equal(a.s3.recoverStopRemaining, 1, 'pending polling leaves stronger lock unchanged');
});
test('#679 stream interruption does not create a charge-only 29F event', async () => {
  const { f, a, r } = await charging();
  a.intent.fire = false; f.tick(a, 6);
  assert.equal(r.streaming, true);
  const before = a.s3.recoverStopRemaining;
  a.intent.squid = true; f.tick(a);
  assert.equal(!!r.s3SplatlingCancelRefillPending, false);
  assert.ok(Math.abs(a.s3.recoverStopRemaining - (before - DT)) < 1e-9,
    'existing fired-stream recovery ages without replacement');
});

test('#1021 full installed sub-cancel path preserves 5F readiness and 29F refill boundaries', async () => {
  const { fixture: sourceFixture } = await import('./source-fixture.mjs');
  const f = await sourceFixture({ fullRuntime: true, productionComposition: true });
  const a = f.make('splatling'), r = a.weaponRunner;
  f.G.actors = [a]; f.tick(a, 600); a.ink = 50;
  a.intent.fire = true; f.tick(a, 48); const before = a.ink;
  a.intent.fire = false; a.intent.sub = true;
  for (let frame = 0; frame < 29; frame++) {
    f.tick(a);
    assert.equal(a.ink, before, `sub cancel+${frame}F blocks refill`);
    assert.equal(r.aimingSub, frame >= 4, 'existing 5F sub interruption is preserved');
  }
  f.tick(a); assert.ok(a.ink > before, 'sub cancel+29F resumes refill while aiming');
});

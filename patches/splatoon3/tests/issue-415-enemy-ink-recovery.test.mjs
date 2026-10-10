import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptIssue415 } from '../enemy-ink-recovery-adapter.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

// Issue #415: enemy-ink ground contact resets the health-recovery timer.
// Runs the real Actor/resources tick on the native path (source-fixture),
// with owner/actor isolation (fresh actors per case) rather than remote play.
function damageOnly(f, a) {
  f.G.paint.sample = () => 0;
  a.hp = 60; a.lastDamage = 99; a.invuln = 99;
  f.tick(a, 1);
  a.invuln = 0;
  return a.hp;
}

test('issue-415 adapter transform resets eligible enemy-ink recovery without touching other fields', () => {
  const source = `import x from './other.mjs';\nline\n    a.lastDamage = Math.min(a.lastDamage, r.enemyInkRegenSuppression);\nline\n`;
  const patched = adaptIssue415('patches/splatoon3/runtime/resources.mjs', source);
  assert.ok(patched.includes('resetEnemyInkRecovery(a);'));
  assert.ok(patched.includes(`from './issue-415-adapter.mjs'`));
  assert.ok(!patched.includes('enemyInkRegenSuppression'));
  assert.equal(adaptIssue415('src/game/actor.js', source), source);
  assert.throws(() => adaptIssue415('patches/splatoon3/runtime/resources.mjs', 'no anchor'), /anchor mismatch/);
});

test('issue-415 enemy-ink contact resets recovery timer; negative main control preserves 0.4s credit', async () => {
  const f = await fixture(), dt = 1 / 60;
  f.profile.resources.regenDelay = 1.0;
  const delay = f.profile.resources.regenDelay;

  // --- Negative main control: unpatched clamp carries 0.4s out of contact.
  const control = f.make();
  damageOnly(f, control);
  f.G.paint.sample = () => 2; control.invuln = 99;
  f.tick(control, 60); // 1.0 s in enemy ink: clamp converges lastDamage to 0.4
  close(control.lastDamage, f.profile.resources.enemyInkRegenSuppression);
  f.G.paint.sample = () => 0; control.invuln = 0;
  const hpBefore = control.hp;
  const creditFrames = Math.round((delay - f.profile.resources.enemyInkRegenSuppression) * 60) - 1;
  f.tick(control, creditFrames);
  assert.equal(control.hp, hpBefore, 'unpatched timer should still be waiting before the credited point');
  f.tick(control, 1);
  assert.ok(control.hp > hpBefore, 'unpatched timer recovers early from the preserved 0.4s credit');

  // --- Production transform runs inside the real native resources tick.
  const patched = await fixture({ adaptRuntime: adaptSource });
  patched.profile.resources.regenDelay = delay;
  const a = patched.make();
  damageOnly(patched, a);
  patched.G.paint.sample = () => 2; a.invuln = 99;
  patched.tick(a, 60);
  close(a.lastDamage, 0);
  patched.G.paint.sample = () => 0; a.invuln = 0;
  const patchedHp = a.hp;
  patched.tick(a, 60 - 1); // 59/60 s out: a full 1.0 s has NOT yet elapsed
  assert.equal(a.hp, patchedHp, 'recovery must wait a full delay after leaving enemy ink');
  patched.tick(a, 1); // 60th frame out: exactly 1.0 s elapsed
  assert.ok(a.hp > patchedHp, 'recovery resumes exactly after a full delay with no new contact');

  // --- Re-entry restarts the wait from zero again (60 Hz deterministic).
  patched.G.paint.sample = () => 2; a.invuln = 99;
  patched.tick(a, 1);
  close(a.lastDamage, 0);
  void dt;
});

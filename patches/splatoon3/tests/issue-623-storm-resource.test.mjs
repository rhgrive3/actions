import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

// Issue #623: the Ink Storm throw lock owns the actor through the special-owned
// early return in Actor.update(). The composed resource phase (updateResources,
// sole owner of s3.enemyInkTime and passive enemy-ink damage) must keep running
// exactly once per fixed tick across that window instead of freezing.
async function stormActor() {
  const f = await fixture(), a = f.make();
  f.G.paint.sample = () => 2;            // grounded in opposing ink for a team-0 actor
  let launches = 0;
  f.G.projectiles.throwStorm = () => { launches++; };
  a._resolve = () => { a.grounded = true; };
  a.weapon = { ...a.weapon, special: 'storm' };
  a.special = a.specialCost();
  return { f, a, launches: () => launches };
}

test('#623: enemy-ink resources flow exactly once per tick across the Storm throw lock', async () => {
  const { f, a, launches } = await stormActor();
  const dps = f.profile.resources.enemyInkDps;

  f.tick(a); // ordinary baseline tick on opposing ink
  const t0 = a.s3.enemyInkTime, hp0 = a.hp;
  close(t0, 1 / 60);
  close(hp0, 100 - dps / 60);

  a.intent.special = true;
  f.tick(a); // activation frame: the special already owns the actor
  a.intent.special = false;
  assert.equal(a.specialActive?.id, 'storm');
  assert.equal(launches(), 1, 'Storm launches exactly once');
  assert.ok(a.s3.enemyInkTime > t0, 'activation tick froze s3.enemyInkTime');
  assert.ok(a.hp < hp0, 'activation tick froze passive enemy-ink damage');

  let frames = 0;
  while (a.specialActive?.id === 'storm') {
    const t = a.s3.enemyInkTime, hp = a.hp;
    f.tick(a);
    frames++;
    assert.ok(a.s3.enemyInkTime > t, `s3.enemyInkTime froze on Storm lock frame ${frames}`);
    assert.ok(a.hp < hp, `passive enemy-ink damage froze on Storm lock frame ${frames}`);
    assert.ok(frames < 100, 'Storm lock never cleared');
  }
  assert.ok(frames >= 21 && frames <= 23, `expected the ~0.35s throw lock (~21 frames), observed ${frames}`);

  // Exactly once per tick: totals equal the ordinary 0 AP rate over every elapsed
  // frame (baseline + activation + lock). A skipped frame under-counts; a shared
  // double-run over-counts.
  const elapsed = 2 + frames;
  close(a.s3.enemyInkTime, elapsed / 60);
  close(a.damageFromInk, dps * elapsed / 60);
  close(a.hp, 100 - dps * elapsed / 60);
  assert.ok(a.damageFromInk < f.profile.resources.enemyInkDamageCap, 'cap not reached in this window');
});

test('#623: genuine invulnerability still blocks passive enemy-ink damage during the Storm lock', async () => {
  const { f, a } = await stormActor();
  a.invuln = 5; // a genuinely invulnerable state, not Storm's armor:false
  a.intent.special = true;
  f.tick(a);
  a.intent.special = false;
  assert.equal(a.specialActive?.id, 'storm');
  const hp = a.hp, dfi = a.damageFromInk;
  f.tick(a, 10);
  assert.ok(a.s3.enemyInkTime > 0, 'contact time still advances while invulnerable');
  close(a.hp, hp); // invuln gate preserved: no passive damage
  close(a.damageFromInk, dfi);
});

test('#623: ordinary frames keep running the resource phase once, unaffected by the special-owned phase', async () => {
  const { f, a } = await stormActor();
  const dps = f.profile.resources.enemyInkDps;
  f.tick(a, 5);
  close(a.s3.enemyInkTime, 5 / 60);
  close(a.hp, 100 - dps * 5 / 60);
});

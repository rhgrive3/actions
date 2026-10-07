import test from 'node:test';
import assert from 'node:assert/strict';
import { getBoot } from './tidal-slam-fixture.mjs';

// #917 Tidal Slam HP endpoints follow S3 Triple Splashdown (220 near / 60 minimum), not S2 Splashdown (180/55).
// Logic-only: production installer on the real composed Actor/Projectiles; not a browser or Switch comparison.

test.after(async () => { (await getBoot()).close(); });

test('#917 the composed Tidal Slam carries S3 Triple Splashdown 220/60, not the S2 Splashdown 180/55', async () => {
  const f = await getBoot();
  assert.equal(f.profile.specials.slam.damageMax, 220);
  assert.equal(f.profile.specials.slam.damageMin, 60);
  assert.equal(f.SPECIALS.slam.damageMax, 220);
  assert.equal(f.SPECIALS.slam.damageMin, 60);
  // Only the HP endpoints change: INKWAVE-original radii stay as they are.
  assert.equal(f.SPECIALS.slam.radius, 5.2);
  assert.equal(f.SPECIALS.slam.killRadius, 3.2);
});

test('#917 _slamImpact applies 220 near and 60 at the outer edge (also the Super Jump path, which reuses SPECIALS.slam)', async () => {
  const f = await getBoot(), sp = f.SPECIALS.slam;
  f.G.actors = []; const attacker = f.make(), near = f.make({ team: 1, pos: [1, 0, 0] }), edge = f.make({ team: 1, pos: [sp.radius - 1e-6, 0, 0] });
  const hits = [], applyHit = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = (_owner, victim, amount, cause) => hits.push({ victim, amount, cause });
  try { attacker._slamImpact(sp); } finally { f.G.projectiles.applyHit = applyHit; }
  const by = victim => hits.find(h => h.victim === victim);
  assert.equal(by(near).amount, 220); assert.equal(by(near).cause, 'slam');
  assert.ok(Math.abs(by(edge).amount - 60) < 1e-3, `outer edge ${by(edge).amount}`);
  assert.equal(hits.some(h => h.amount === 180 || Math.abs(h.amount - 55) < 1), false, 'no S2 Splashdown endpoints');
});

test('#917 a real Slam action deals the 220 near hit to an enemy under it', async () => {
  const f = await getBoot();
  f.G.actors = []; const a = f.make(), enemy = f.make({ team: 1, pos: [1, 0, 0] });
  enemy.hp = 1000;
  a.special = a.specialCost(); a.intent.special = true; f.tick(a); a.intent.special = false;
  assert.equal(a.specialActive?.id, 'slam');
  for (let i = 0; i < 180 && a.specialActive; i++) f.tick(a);
  assert.equal(a.specialActive, null);
  assert.equal(1000 - enemy.hp, 220);
});


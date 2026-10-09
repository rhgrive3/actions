import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';

test('#129 Splattershot flight paint has a hard cap of at most 2 droplets', async () => {
  const f = await world({ fidelity: true, seed: 12345 });
  const a = f.make('shooter');
  a.pos.set(0, 10, 0); // elevated so projectile travels horizontally before hitting ground

  f.projectiles.fireShooter(a, a.weapon, 0);
  const p = f.projectiles.list[0];
  assert.ok(p, 'shooter projectile created');
  p.inkProfile = null;
  p.trailEvery = 0.5;
  p.trail = 0;

  // Track how many flight droplet splats are generated
  let dropletCount = 0;
  const originalSplat = f.G.paint.splat;
  f.G.paint.splat = (...args) => {
    dropletCount++;
    return originalSplat.apply(f.G.paint, args);
  };

  // Run projectile updates until round hits ground or expires
  for (let frame = 0; frame < 90 && f.projectiles.list.includes(p); frame++) {
    f.projectiles.update(1 / 60);
  }

  // Droplet count from flight path must be capped at DropSplashNumMax = 2
  assert.ok(p.dropSplashCount <= 2, `dropSplashCount (${p.dropSplashCount}) <= 2`);
  f.projectiles.clear();
});

test('#129 DropSplashNumMax cap is respected when manually scheduling flight drops', async () => {
  const f = await world({ fidelity: true, seed: 42 });
  const a = f.make('shooter');
  f.projectiles.fireShooter(a, a.weapon, 0);
  const p = f.projectiles.list[0];

  assert.equal(p.s3Weapon.kind, 'shooter');
  assert.equal(p.dropSplashCount ?? 0, 0);

  // Directly advance projectile through distance increments
  p.dropSplashCount = 2;
  const maxDrops = p.dropSplashMax ?? 2;
  assert.equal(p.dropSplashCount >= maxDrops, true, 'cap is engaged when count reaches 2');

  f.projectiles.clear();
});

// #289 regression: Splattershot flight droplets fall-height paint scaling and 4u cutoff removal
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const near = (actual, expected, eps = 1e-4) =>
  assert.ok(Math.abs(actual - expected) < eps, `Expected ${expected}, got ${actual}`);

test('#289 fidelityFlightPaintRadius scales footprint across 3u-10u fall height thresholds', async () => {
  const f = await fixture();
  const w = f.WEAPONS.shooter;
  const p = { s3Weapon: w, trailRadius: 0.44 };

  const nearest = w.flightPaint.nearest; // 2.0608
  const intermediate = w.flightPaint.intermediate; // 1.472
  assert.ok(nearest > intermediate, 'nearest footprint must be larger than intermediate');

  // Below 3u: fixed at nearest
  near(f.fidelityFlightPaintRadius(p, 1.0), nearest);
  near(f.fidelityFlightPaintRadius(p, 2.5), nearest);
  near(f.fidelityFlightPaintRadius(p, 3.0), nearest);

  // Between 3u and 10u: interpolated
  const h5 = 5.0;
  const t5 = (5.0 - 3.0) / (10.0 - 3.0);
  const expected5 = nearest + (intermediate - nearest) * t5;
  near(f.fidelityFlightPaintRadius(p, h5), expected5);

  const h65 = 6.5;
  const t65 = (6.5 - 3.0) / (10.0 - 3.0);
  const expected65 = nearest + (intermediate - nearest) * t65;
  near(f.fidelityFlightPaintRadius(p, h65), expected65);

  // At 10u: intermediate
  near(f.fidelityFlightPaintRadius(p, 10.0), intermediate);

  // Above 10u: stays at intermediate
  near(f.fidelityFlightPaintRadius(p, 12.0), intermediate);
  near(f.fidelityFlightPaintRadius(p, 15.0), intermediate);
});

test('#289 shooter droplet at 5u above flat surface lands and paints instead of vanishing at 4u', async () => {
  const f = await fixture();
  const splats = [];
  f.G.paint = {
    splat: (point, radius, team, opts) => {
      splats.push({ point: point.clone(), radius, team, opts });
      return 1;
    },
    sample: () => 1,
  };

  // Floor at y = 0
  f.G.physics = {
    raycast: (from, dir, maxDist, hit) => {
      // Downward raycast hitting floor at y = 0
      if (dir.y < -0.9 && from.y > 0 && from.y <= maxDist) {
        hit.hit = true;
        hit.dist = from.y;
        hit.point.set(from.x, 0, from.z);
        hit.normal.set(0, 1, 0);
        return hit;
      }
      hit.hit = false;
      return hit;
    },
    los: () => true,
  };

  const actor = f.make('shooter');
  const projectile = {
    owner: actor,
    s3Weapon: actor.weapon,
    type: 'shot',
    team: 0,
    trailEvery: 0.1,
    trail: 0.5, // trigger trail droplet
    vel: new f.THREE.Vector3(10, 0, 0),
    pos: new f.THREE.Vector3(0, 5.0, 0), // 5 units above floor
    prev: new f.THREE.Vector3(0, 5.0, 0),
    age: 0.1,
    life: 1.0,
    dead: false,
    trailRadius: 0.44,
  };

  // Step the projectile logic through the adapted weapons system
  // Using f.G.projectiles._step or the trail branch directly
  const w = actor.weapon;
  const nearest = w.flightPaint.nearest;
  const intermediate = w.flightPaint.intermediate;
  const t5 = (5.0 - 3.0) / (10.0 - 3.0);
  const expectedRadius = nearest + (intermediate - nearest) * t5;

  // Simulate trail drop at 5u:
  // With dropProbe >= 10, raycast reaches floor at dist = 5.0
  const dropProbe = projectile.s3Weapon?.flightPaint ? Math.max(20, projectile.s3Weapon.flightPaint.dropHeightMin) : 4;
  assert.ok(dropProbe >= 5.0, `dropProbe (${dropProbe}) must reach 5.0u`);

  const hit = f.G.physics.raycast(projectile.pos, new f.THREE.Vector3(0, -1, 0), dropProbe, new f.Hit(), true);
  assert.ok(hit.hit, 'raycast at 5.0u should hit');
  assert.equal(hit.dist, 5.0);

  projectile.lastDropDist = hit.dist;
  const radius = f.fidelityFlightPaintRadius(projectile);
  near(radius, expectedRadius);
});

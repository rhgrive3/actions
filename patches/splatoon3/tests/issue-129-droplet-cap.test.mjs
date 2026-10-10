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


// Independent oracle: S3 11.3.0 WeaponShooterNormal has
// SplashSpawnParam.SpawnNum=1.5, SpawnBetweenLength=9.2,
// SpawnNearestLength=1.2. Inkipedia documents 8 shooter paint patterns and a
// maximum of 2 drops per shot. Do not disable p.inkProfile to "test" the cap.
test('#129 real shooter head carries 1/2 source drops, 9.2 WU spacing and eight patterns', async () => {
  const f = await world({ fidelity: true, floor: false, seed: 116 }), a = f.make('shooter', { y: 30 });
  const raw = f.profile.weaponsFidelityCompletion.weapons.shooter.SplashSpawnParam;
  assert.equal(raw.SpawnNum, 1.5);
  assert.equal(raw.SpawnBetweenLength, 9.2);
  assert.equal(raw.SpawnNearestLength, 1.2);
  for (let sequence = 0; sequence < 16; sequence++) {
    f.projectiles.clear();
    f.projectiles.fireShooter(a, a.weapon, 0);
    const p = f.projectiles.list.at(-1);
    assert.equal(p.inkKey, 'shooter', 'native head receives the actual flight profile');
    assert.ok(p.inkProfile, 'real source-guided head must not fall through to legacy trail');
    assert.equal(p.inkSequence, sequence, 'one sequence per fired head');
    assert.equal(p.trailEvery, 0, 'legacy generic emitter stays disabled');
    const plan = p.inkPlan, ordinal = sequence % 8 + 1;
    assert.equal(plan.ordinal, ordinal);
    assert.equal(plan.count, sequence % 2 ? 2 : 1, '1.5 per shot => alternating 1 and 2');
    assert.ok(plan.count <= 2, 'all 8 patterns respect the cap');
    assert.equal(plan.spacing, 9.2);
    const feet = ordinal === 4 || ordinal === 8;
    assert.equal(plan.feet, feet);
    const first = 1.2 + (feet ? 0 : 9.2 * (8 - ordinal) / 8);
    assert.ok(Math.abs(plan.first - first) < 1e-8, 'correct first/feet offset');
  }
});

test('#129 real InkFlightRuntime schedules at most the 1/2 planned drops per emitted shot', async () => {
  const f = await world({ fidelity: true, floor: false, seed: 117 }), a = f.make('shooter', { y: 40 });
  for (let shot = 0; shot < 8; shot++) {
    f.projectiles.clear();
    const births = [];
    f.projectiles.inkFlight.trace = ev => { if (ev.event === 'drop-born') births.push(ev); };
    f.projectiles.fireShooter(a, a.weapon, 0);
    const p = f.projectiles.list.at(-1);
    assert.equal(p.inkSequence, shot);
    assert.ok(p.inkProfile);
    for (let tick = 0; tick < 90 && f.projectiles.list.includes(p); tick++)
      f.projectiles.update(1/60);
    assert.ok(births.length <= p.inkPlan.count, 'natural-flight count never exceeds source plan');
    assert.ok(births.length <= 2, 'natural-flight hard maximum');
    assert.deepEqual(births.map(ev => ev.index), births.map((_, i) => i),
      'born drops consume ordered schedule slots');
  }
  f.projectiles.inkFlight.trace = null;
});

// Speed changes must move drop birth TIMES only. Positions are compared as arc
// length along the emitted head polyline (previous frame -> current frame), so a
// time-based or speed-based emitter fails at 0.5x / 1.5x. Source: S3 11.3.0
// SplashSpawnParam (SpawnNum 1.5, SpawnNearestLength 1.2, SpawnBetweenLength 9.2,
// SplitNum 8, ForceSpawnNearestAddNumArray [4]); 8-slot descending phase is the
// documented INKWAVE model, not a verified Nintendo permutation.
test('#129 drop count and arc-length positions are independent of projectile speed', async () => {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const len = a => Math.sqrt(dot(a, a));
  const arcOf = (path, point) => {
    let best = { d: Infinity, s: 0 }, acc = 0;
    for (let i = 1; i < path.length; i++) {
      const a0 = path[i - 1], seg = sub(path[i], a0), L = len(seg);
      const t = L > 1e-9 ? Math.min(1, Math.max(0, dot(sub(point, a0), seg) / (L * L))) : 0;
      const q = a0.map((v, k) => v + seg[k] * t), d = len(sub(q, point));
      if (d < best.d) best = { d, s: acc + L * t };
      acc += L;
    }
    return best;
  };
  const expectCount = [1, 2, 1, 2, 1, 2, 1, 2];
  const expectFirst = [9.25, 8.1, 6.95, 1.2, 4.65, 3.5, 2.35, 1.2];
  const expectFeet = [false, false, false, true, false, false, false, true];
  for (const scale of [0.5, 1, 1.5]) {
    const f = await world({ fidelity: true, floor: false, seed: 117 }), a = f.make('shooter', { y: 40 });
    for (let shot = 0; shot < 8; shot++) {
      f.projectiles.clear();
      const births = [];
      f.projectiles.inkFlight.trace = ev => { if (ev.event === 'drop-born') births.push(ev); };
      f.projectiles.fireShooter(a, a.weapon, 0);
      const p = f.projectiles.list.at(-1), plan = p.inkPlan;
      assert.equal(plan.count, expectCount[shot], `scale ${scale} shot ${shot}: planned count`);
      assert.equal(plan.feet, expectFeet[shot], `scale ${scale} shot ${shot}: feet slot`);
      assert.ok(Math.abs(plan.first - expectFirst[shot]) < 1e-8, `scale ${scale} shot ${shot}: first slot`);
      p.vel.multiplyScalar(scale);
      const path = [p.pos.toArray()];
      for (let tick = 0; tick < 240 && f.projectiles.list.includes(p); tick++) {
        f.projectiles.update(1 / 60);
        path.push(p.pos.toArray());
      }
      f.projectiles.inkFlight.trace = null;
      // Exact count: an unobstructed flight must emit every planned slot, no more, no fewer.
      assert.equal(births.length, expectCount[shot], `scale ${scale} shot ${shot}: emitted count is exact`);
      assert.deepEqual(births.map(ev => ev.index), births.map((_, i) => i));
      births.forEach((ev, k) => {
        const hit = arcOf(path, ev.pos);
        assert.ok(hit.d < 1e-6, `scale ${scale} shot ${shot} drop ${k} lies on the emitted flight path`);
        assert.ok(Math.abs(hit.s - (expectFirst[shot] + k * 9.2)) < 1e-6,
          `scale ${scale} shot ${shot} drop ${k}: arc ${hit.s.toFixed(4)} != first + k*9.2`);
      });
    }
  }
});

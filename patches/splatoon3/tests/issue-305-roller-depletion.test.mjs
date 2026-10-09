// Issue #305: a Roller flick requested with 0 < ink < swing cost must run the
// Splatoon 3 depletion attack (real remaining ink paid once, sourced
// DepletionBulletNum / DepletionSpeedRate / DepletionDamageRate volley) instead
// of an empty click. These run the actual composed source graph + installed
// roller runtime with real Projectiles; only a truly empty tank still rejects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ROOT } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { withRollerImpactPaint } from '../runtime/roller-impact-paint.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-8, msg ?? `${a} != ${b}`);
const SITE = () => process.env.INKWAVE_ISSUE305_SITE || `${ROOT}.issue-305-source`;
const COST = 8.5;          // profile weapons.roller.flickInk / verticalInk
const DEPLETION_COST = 4.25; // COST * sourced CollisionParam.DepletionRate (0.5)

async function setup(vertical, ink) {
  const f = await fixture({ site: SITE(), fidelity: true });
  const a = f.make('roller'); f.G.actors = [a];
  a.ink = ink; a.lastFire = 10;
  if (vertical) {
    // Use a real admitted jump so the composed selector chooses vertical.
    a.intent.jump = true; f.G.time += STEP; a.update(STEP);
    assert.equal(a.grounded, false, 'the native jump was admitted');
    a.intent.jump = false;
  }
  // Block the frame-1 kid refill so the admission gate sees exactly the set
  // tank; ink recover delay (0.9s) covers the whole windup.
  a.ink = ink; a.lastFire = 0;
  let tick = 0; const releases = [], rows = [];
  const fire = f.projectiles.fireFlick;
  f.projectiles.fireFlick = function (...args) {
    const before = this.list.length, result = fire.apply(this, args);
    releases.push({ tick, count: this.list.length - before, globs: this.list.slice(before), mode: args[1] });
    return result;
  };
  const step = (fireInput = tick === 0) => {
    tick++; a.intent.fire = fireInput; f.G.time += STEP; a.update(STEP);
    rows.push({ tick, ink: a.ink });
  };
  return { ...f, a, r: a.weaponRunner, releases, rows, step, get tick() { return tick; } };
}

async function runTo(vertical, ink, hz = 60) {
  const h = await setup(vertical, ink);
  const clock = new FixedClock();
  for (let frame = 0; frame < 3 * hz; frame++) clock.advance(1 / hz, () => h.step());
  return h;
}

function inkAfterRelease(h) { const rel = h.releases[0]; return h.rows[rel.tick - 1].ink; }

for (const hz of [30, 60, 120]) for (const vertical of [false, true]) {
  test(`#305 ${hz}Hz ${vertical ? 'vertical' : 'horizontal'} depleted tank pays the real ink once and releases the reduced volley`, async () => {
    const h = await runTo(vertical, 4.0, hz);      // 0 < 4.0 < 8.5
    const rel = h.releases[0];
    assert.ok(rel, 'a depleted swing is admitted');
    assert.equal(rel.tick, vertical ? 32 : 22, 'the swing keeps the full windup (21F/31F + 1)');
    assert.equal(rel.count, vertical ? 3 : 4, 'sourced DepletionBulletNum totals');
    assert.equal(rel.mode.s3Depletion, true);
    for (const p of rel.globs) {
      assert.equal(p.s3DepletionRound, true, 'every emitted unit preserves the depleted swing');
      assert.equal(p.s3DepletionPaintScale, p.fidelityRollerUnit.UnitParam.PaintParam.DepletionDepthWidthRate,
        `unit ${p.fidelityRollerUnitIndex} uses its own sourced depletion paint rate`);
    }
    if (!vertical) assert.equal(rel.globs.at(-1).fidelityRollerUnitIndex, 1, 'the appended nearest glob is covered');
    // 4.0 < 4.25, so the real remaining tank is spent exactly once.
    near(4.0 - inkAfterRelease(h), 4.0, 'paid the whole remaining tank');
    assert.equal(h.releases.length, 1, 'one press yields one depleted swing');
    // No fake ink: through the swing the tank never exceeds the starting amount.
    assert.ok(h.rows.slice(0, rel.tick).every(row => row.ink <= 4.0 + 1e-9), 'no injected ink');
  });
}

test('#305 tiny-positive, half-cost, exact-cost, zero and full tanks', async () => {
  for (const vertical of [false, true]) {
    const reduced = vertical ? 3 : 4, full = vertical ? 5 : 13;
    // Truly empty: still rejected, no swing, no ink spent.
    const zero = await runTo(vertical, 0);
    assert.equal(zero.releases.length, 0, 'empty tank rejects');
    assert.equal(zero.a.weaponRunner.flick, -1);
    assert.equal(zero.a.character.s3RollerFlick, null);
    // Still empty through the whole ink-recover delay (nothing was spent).
    assert.ok(zero.rows.slice(0, 10).every(row => row.ink === 0), 'empty tank stays empty');

    // Tiny positive: pays exactly what it holds.
    const tiny = await runTo(vertical, 0.5);
    assert.equal(tiny.releases[0].count, reduced);
    near(0.5 - inkAfterRelease(tiny), 0.5);

    // Exact half cost: pays the depleted cost, ends empty.
    const half = await runTo(vertical, DEPLETION_COST);
    assert.equal(half.releases[0].count, reduced);
    near(DEPLETION_COST - inkAfterRelease(half), DEPLETION_COST);

    // Above the depleted cost but below the full cost: pays only the depleted cost.
    const above = await runTo(vertical, 6.0);
    assert.equal(above.releases[0].count, reduced);
    near(6.0 - inkAfterRelease(above), DEPLETION_COST);
    near(inkAfterRelease(above), 1.75);

    // Exact full cost and a full tank keep the untouched full volley and cost.
    for (const ink of [COST, 48.5]) {
      const fullRun = await runTo(vertical, ink);
      assert.equal(fullRun.releases[0].count, full, 'full volley count unchanged');
      assert.equal(fullRun.releases[0].mode.s3Depletion, undefined, 'full swing is not a depletion round');
      near(ink - inkAfterRelease(fullRun), COST);
      for (const p of fullRun.releases[0].globs) {
        assert.equal(p.s3DepletionRound, false, 'every full-ink unit stays undepleted');
        assert.equal(p.s3DepletionPaintScale, 1, 'full-ink paint stays unscaled');
      }
    }
  }
});

test('#305 depleted rounds keep the sourced speed and damage rates', async () => {
  const forward = (f, p, distance) => new f.THREE.Vector3(
    p.start.x + Math.sin(p.fidelitySectorYaw) * distance, p.start.y, p.start.z + Math.cos(p.fidelitySectorYaw) * distance);

  // Horizontal: main unit 0.5 speed rate, 0.25 damage rate.
  const dep = await runTo(false, 4.0), full = await runTo(false, 48.5);
  const depMain = dep.releases[0].globs.filter(p => p.fidelityRollerUnitIndex === 0);
  const fullMain = full.releases[0].globs.filter(p => p.fidelityRollerUnitIndex === 0);
  const W = dep.WEAPONS.roller;
  for (const p of depMain) {
    assert.ok(p.vel.length() <= 60 * (1.05 + 0.36) * 0.5 + 1e-9, 'depleted horizontal speed uses DepletionSpeedRate 0.5');
    assert.ok(p.s3DepletionRound === true);
  }
  assert.ok(Math.max(...fullMain.map(p => p.vel.length())) > 60 * (1.05 + 0.36) * 0.5 + 1, 'full main speeds stay unscaled');
  const bands = dep.distanceDamage(W.flickDamageBands, 5.2);
  assert.equal(dep.fidelityDamage(depMain[0], forward(dep, depMain[0], 5.2)), bands * 0.25, 'DepletionDamageRate 0.25');
  assert.equal(full.fidelityDamage(fullMain[0], forward(full, fullMain[0], 5.2)), bands, 'full damage unchanged');

  // Vertical: unit 0.7 speed rate; the pinned vertical table has no
  // DepletionDamageRate, so damage is unchanged (recorded as unverified).
  const vdep = await runTo(true, 4.0);
  const speeds = vdep.releases[0].globs.map(p => p.vel.length());
  near(Math.max(...speeds), 60 * 1.8338 * 0.7, 'vertical unit0 speed uses DepletionSpeedRate 0.7');
  near(Math.min(...speeds), 60 * (1.6338 - 0.2) * 0.7, 'vertical unit1 tail speed uses 0.7');
  assert.ok(vdep.releases[0].globs.every(p => p.vel.length() < 110.028), 'vertical depleted speeds stay scaled');
  const vbands = vdep.distanceDamage(W.verticalDamageBands, 5.2);
  assert.equal(vdep.fidelityDamage(vdep.releases[0].globs[0], forward(vdep, vdep.releases[0].globs[0], 5.2)), vbands, 'no sourced vertical depletion damage rate is invented');
});


test('#305 depletion paint rate scales actual vertical flight and impact paint only', async () => {
  async function release(vertical, ink) {
    const h = await setup(vertical, ink);
    for (let i = 0; i < 40 && !h.releases.length; i++) h.step();
    assert.ok(h.releases[0], 'release fixture fired');
    return { h, p: h.releases[0].globs[0] };
  }
  const [depletedImpact, fullImpact] = await Promise.all([release(false, 4), release(false, 48.5)]);
  assert.equal(depletedImpact.p.s3DepletionPaintScale, .5);
  assert.equal(fullImpact.p.s3DepletionPaintScale, 1);
  const captureImpact = ({h,p}) => {
    const hit = { point: p.start.clone().add(new h.THREE.Vector3(0,0,5)), normal: new h.THREE.Vector3(0,1,0) };
    const native = h.G.paint.splat; let stamp;
    h.G.paint.splat = function(point,radius,team,opts) { stamp = {radius,stretchAmt:opts?.stretchAmt??0}; return 1; };
    try { withRollerImpactPaint(h.G,p,hit,1,() => h.G.paint.splat(hit.point,1,p.team,{})); }
    finally { h.G.paint.splat = native; }
    return stamp;
  };
  for (const p of depletedImpact.h.releases[0].globs) {
    const full = fullImpact.h.releases[0].globs.find(q => q.fidelityRollerUnitIndex === p.fidelityRollerUnitIndex);
    assert.ok(full, 'every depleted unit has a full-ink control');
    const rate = p.fidelityRollerUnit.UnitParam.PaintParam.DepletionDepthWidthRate;
    const depStamp = captureImpact({ h: depletedImpact.h, p });
    const fullStamp = captureImpact({ h: fullImpact.h, p: full });
    near(depStamp.radius, fullStamp.radius * rate, 'every depleted impact width uses its own PaintParam rate');
    near(depStamp.stretchAmt, fullStamp.stretchAmt * rate, 'every depleted impact depth uses its own PaintParam rate');
  }

  const [depletedFlight, fullFlight] = await Promise.all([release(true,4),release(true,48.5)]);
  const depSpec=depletedFlight.p.s3RollerFlightPaint?.spec, fullSpec=fullFlight.p.s3RollerFlightPaint?.spec;
  assert.ok(depSpec && fullSpec, 'the real vertical paint-flight owner is configured');
  near(depSpec.width,fullSpec.width*.5,'depleted flight width uses per-unit paint rate');
  near(depSpec.nearestWidth,fullSpec.nearestWidth*.5,'depleted nearest flight stamp uses per-unit paint rate');
  near(depSpec.depth-1,(fullSpec.depth-1)*.5,'depleted flight depth uses per-unit paint rate');
  assert.equal(depletedFlight.p.fidelityRollerUnit.UnitParam.CollisionParam.DepletionRate,.5,
    'the paint rate does not modify the separate collision record');
});


test('#305 pooled horizontal main and nearest units reset their depletion paint state', async () => {
  const h = await runTo(false, 4);
  const depleted = h.releases[0].mode;
  const first = Array.from(h.releases[0].globs);
  const assertPaint = (globs, isDepleted) => {
    for (const p of globs) {
      assert.equal(p.s3DepletionRound, isDepleted);
      assert.equal(p.s3DepletionPaintScale, isDepleted ? p.fidelityRollerUnit.UnitParam.PaintParam.DepletionDepthWidthRate : 1);
    }
    assert.equal(globs.at(-1).fidelityRollerUnitIndex, 1, 'the last glob keeps the nearest unit source');
  };
  assertPaint(first, true);
  h.projectiles.clear();
  h.projectiles.fireFlick(h.a, h.a.weapon);
  const full = Array.from(h.projectiles.list);
  assert.equal(full.length, 13);
  assert.ok(first.every(p => full.includes(p)), 'all depleted projectiles are recycled into the full swing');
  assert.equal(full[0], first.at(-1), 'the depleted near glob is reused as a full-ink main glob');
  assertPaint(full, false);
  h.projectiles.clear();
  h.projectiles.fireFlick(h.a, depleted);
  const next = Array.from(h.projectiles.list);
  assert.equal(next.length, 4);
  assert.ok(next.every(p => full.includes(p)), 'every depleted projectile comes from the full-ink pool');
  assert.equal(next[0], full.at(-1), 'the full-ink near glob is reused as a depleted main glob');
  assertPaint(next, true);
});

test('#305 nearest paint follows its own unit source, including absent and invalid rates', async () => {
  // Synthetic fixture values distinguish ownership; they are not retail tuning.
  for (const nearestRate of [.25, undefined, 0]) {
    const h = await setup(false, 4);
    const units = h.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit;
    units[0].UnitParam.PaintParam.DepletionDepthWidthRate = .75;
    units[1].UnitParam.PaintParam.DepletionDepthWidthRate = nearestRate;
    for (let i = 0; i < 40 && !h.releases.length; i++) h.step();
    const globs = h.releases[0]?.globs;
    assert.equal(globs?.length, 4);
    for (const p of globs) {
      const expected = p.fidelityRollerUnitIndex === 0 ? .75 : nearestRate > 0 ? nearestRate : 1;
      assert.equal(p.s3DepletionPaintScale, expected, 'the actual unit owns the paint rate or native fallback');
      assert.equal(p.fidelityRollerUnit.UnitParam.CollisionParam.DepletionRate, .5, 'paint scaling does not rewrite collision');
    }
    assert.equal(globs.at(-1).fidelityRollerUnitIndex, 1);
    h.projectiles.clear();
    h.projectiles.fireFlick(h.a, h.a.weapon);
    assert.ok(h.projectiles.list.every(p => p.s3DepletionPaintScale === 1), 'full-ink control ignores every depletion-only rate');
  }
});

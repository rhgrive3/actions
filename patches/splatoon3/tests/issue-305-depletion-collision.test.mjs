// Issue #305 residual: depleted Roller rounds must apply the pinned per-unit
// CollisionParam.DepletionRate (0.5 on every Splat Roller unit of the 11.3.0
// table) to their hit collision radius. Draft PR #1175 / PR #1168 implement
// the depletion admission, volley count, speed, damage and paint scale, but
// explicitly leave the collision-radius half unimplemented ("per-bullet
// depletion collision-radius chronology ... stay unverified"). This test owns
// only that residual: it runs the actual composed source graph with real
// Projectiles and asserts scaled player/field radius magnitudes for a
// depletion-marked volley, the untouched growth chronology, full volleys
// through the real windup at 30/60/120 Hz, and cadence-independent radii.
// Admission itself stays with #1175; no ink gate is re-implemented here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ROOT } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const SITE = () => process.env.INKWAVE_ISSUE305_COL_SITE || `${ROOT}.issue-305-depletion-collision`;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, msg ?? `${a} != ${b}`);
const RATE = 0.5; // pinned CollisionParam.DepletionRate (all 5 Splat Roller units, Ver. 11.3.0)
const COST = 8.5; // profile weapons.roller.flickInk / verticalInk (unchanged by this lane)
const DROPS = 3;  // pinned WideSwing Unit[0].DepletionBulletNum (+ vertical group total 1+2+0)

async function setup() {
  const f = await fixture({ site: SITE(), fidelity: true });
  const a = f.make('roller'); f.G.actors = [a];
  a.ink = 100; a.lastFire = 0;
  return { ...f, a };
}

// The depletion-marked mode object the composed splatoon3 roller wrapper
// passes to the public runner for an admitted depleted swing (#1175 owns the
// admission; this lane consumes the same `s3Depletion` contract). The counts
// mirror its sourced `flickDepletionDrops` / `verticalDepletionDrops`.
function depletionMode(w, vertical) {
  const mode = { ...w, s3Depletion: true, s3DepletionDrops: DROPS };
  if (vertical) {
    // Main's vertical fireFlick wrapper rebuilds flickDrops from
    // `verticalDrops`; #1175's wrapper reads `s3DepletionDrops ?? verticalDrops`.
    // Both are set so the same probe passes before and after #1175 composes.
    mode.verticalDrops = DROPS;
    mode.flickDrops = DROPS;
  } else {
    mode.flickDrops = DROPS;
  }
  return mode;
}

function spawnVolley(h, { vertical, depleted }) {
  const a = h.a;
  a.weaponRunner.s3FlickVertical = vertical;
  const mode = depleted ? depletionMode(a.weapon, vertical) : { ...a.weapon };
  const before = h.projectiles.list.length;
  h.projectiles.fireFlick(a, mode);
  return { globs: h.projectiles.list.slice(before), mode };
}

function sourceOf(g) {
  const c = g.fidelityRollerUnit?.UnitParam?.CollisionParam;
  assert.ok(c, 'the glob carries its pinned source unit');
  return c;
}

// Source-frame chronology: init -> end over ChangeFrameFor{Player,Field}/60
// seconds, then (for depleted rounds) both magnitudes scaled by DepletionRate.
function expectedPlayerRadius(c, age, depleted) {
  const rate = depleted ? RATE : 1;
  const change = Math.max(0, c.ChangeFrameForPlayer) / 60;
  const t = change > 0 ? Math.min(1, Math.max(0, age / change)) : 1;
  return (c.InitRadiusForPlayer + (c.EndRadiusForPlayer - c.InitRadiusForPlayer) * t) * rate;
}

function assertScaled(g, label) {
  const c = sourceOf(g);
  assert.ok(Math.abs(c.DepletionRate - RATE) < 1e-12, `${label}: pinned DepletionRate`);
  const p = g.fidelityPlayerCollision, fl = g.fidelityFieldCollision;
  near(p.initRadius, c.InitRadiusForPlayer * RATE, `${label}: player init`);
  near(p.endRadius, c.EndRadiusForPlayer * RATE, `${label}: player end`);
  near(fl.initRadius, c.InitRadiusForField * RATE, `${label}: field init`);
  near(fl.endRadius, c.EndRadiusForField * RATE, `${label}: field end`);
  // Chronology and teammate window are untouched by the residual fix.
  near(p.changeTime, Math.max(0, c.ChangeFrameForPlayer) / 60, `${label}: player changeTime`);
  near(fl.changeTime, Math.max(0, c.ChangeFrameForField) / 60, `${label}: field changeTime`);
  assert.equal(p.FriendThroughFrameForPlayer, c.FriendThroughFrameForPlayer, `${label}: friend-through window`);
  near(g.size, p.initRadius, `${label}: size follows scaled init radius`);
}

function assertUnscaled(g, label) {
  const c = sourceOf(g);
  const p = g.fidelityPlayerCollision, fl = g.fidelityFieldCollision;
  near(p.initRadius, c.InitRadiusForPlayer, `${label}: player init`);
  near(p.endRadius, c.EndRadiusForPlayer, `${label}: player end`);
  near(fl.initRadius, c.InitRadiusForField, `${label}: field init`);
  near(fl.endRadius, c.EndRadiusForField, `${label}: field end`);
}

test('#305 residual: horizontal and vertical depletion volleys scale hit collision radii by sourced DepletionRate', async () => {
  const h = await setup();
  for (const vertical of [false, true]) {
    const { globs } = spawnVolley(h, { vertical, depleted: true });
    // Horizontal: 3 sourced main drops + the INKWAVE appended near unit.
    // Vertical: the sourced group total 1+2+0 = 3 with no appended near unit.
    assert.equal(globs.length, vertical ? DROPS : DROPS + 1, 'depleted volley count');
    // The main volley is fully scaled. The near unit carries no birth-time
    // sourced record in the current composition; its own depletion mark is
    // owned by #1175's near-unit path (composition-proofed separately).
    // Note: the splatoon3 `_push` wrapper re-normalizes `p.s3Weapon` to the
    // profile weapon, so the mark is consumed at configureFidelityFlick time
    // and proven by the scaled records below rather than read back here.
    const main = vertical ? globs : globs.slice(0, DROPS);
    for (const g of main) assertScaled(g, `${vertical ? 'vertical' : 'horizontal'} depleted`);
    // Vertical groups use their own sourced DepletionRate record (0.5) —
    // no horizontal constant is reused blindly.
    assert.equal(main[0].fidelityRollerUnit.UnitParam.CollisionParam.DepletionRate, RATE);
  }
});

test('#305 residual: full volleys through the real windup stay unscaled at 30/60/120 Hz', async () => {
  for (const vertical of [false, true]) for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const h = await setup();
    const a = h.a;
    if (vertical) {
      // Real admitted jump selects the composed vertical mode.
      a.intent.jump = true; h.G.time += dt; a.update(dt);
      assert.equal(a.grounded, false, 'the native jump was admitted');
      a.intent.jump = false;
    }
    const releases = [];
    const native = h.projectiles.fireFlick;
    h.projectiles.fireFlick = function (...args) {
      const before = this.list.length;
      const r = native.apply(this, args);
      releases.push({ globs: this.list.slice(before), mode: args[1] });
      return r;
    };
    let tick = 0;
    const clock = new FixedClock();
    const step = () => { tick++; a.intent.fire = tick === 1; h.G.time += dt; a.update(dt); };
    for (let i = 0; i < Math.ceil(3 / dt) && !releases.length; i++) clock.advance(dt, step);
    assert.equal(releases.length, 1, `${dt}s: one release`);
    const { globs, mode } = releases[0];
    assert.equal(mode.s3Depletion, undefined, `${dt}s: a full swing is never depletion-marked`);
    const expected = vertical ? a.weapon.verticalDrops : a.weapon.flickDrops;
    assert.equal(globs.length, expected + (vertical ? 0 : 1), `${dt}s: full volley count unchanged`);
    for (const g of globs) assertUnscaled(g, `${dt}s full`);
    // Normal timing path retained: release within windup + a couple of
    // frames. Exact per-cadence windup frames are owned by roller.test.mjs;
    // the coarse-cadence jump can admit the vertical swing one tick later.
    const windup = vertical ? a.weapon.verticalWindup : a.weapon.flickWindup;
    const base = 1 + Math.ceil((windup - 1e-10) / dt);
    assert.ok(tick >= base && tick <= base + 2, `${dt}s: windup release frame ${tick} in [${base}, ${base + 2}]`);
    assert.ok(a.ink <= 100 - COST + 1e-9, `${dt}s: full swing still pays the full cost`);
    h.projectiles.fireFlick = native;
  }
});

test('#305 residual: scaled radius follows the sourced chronology identically at 30/60/120 Hz', async () => {
  const byHz = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const h = await setup();
    const { globs } = spawnVolley(h, { vertical: false, depleted: true });
    const main = globs.slice(0, DROPS);
    // Walk age on the real cadence; the source-frame chronology must hold at
    // every step, and equal ages must yield equal radii across cadences.
    const samples = new Map();
    for (let step = 0; step <= Math.ceil((1 / 3) / dt) + 1; step++) {
      for (const g of main) {
        const c = sourceOf(g);
        near(h.fidelityPlayerCollisionRadius(g), expectedPlayerRadius(c, g.age, true),
          `dt=${dt} age=${g.age}: scaled player radius follows source chronology`);
        const key = Math.round(g.age * 120);
        if (!samples.has(key)) samples.set(key, h.fidelityPlayerCollisionRadius(g));
        else near(samples.get(key), h.fidelityPlayerCollisionRadius(g), `dt=${dt} age grid ${key} stable`);
      }
      for (const g of main) g.age += dt;
    }
    byHz.push({ dt, at: samples });
  }
  // Common ages present on every cadence grid agree bit-for-bit.
  const common = [...byHz[0].at.keys()].filter(k => byHz.every(h => h.at.has(k)));
  assert.ok(common.length >= 4, 'cadence grids share the sampled ages');
  for (const key of common) {
    const [first, ...rest] = byHz.map(h => h.at.get(key));
    for (const v of rest) near(v, first, `age grid ${key}/120s identical across cadences`);
  }
});

test('#305 residual: an unmarked volley keeps native radii and the empty boundary is untouched', async () => {
  const h = await setup();
  // Without the depletion mark even a reduced drop count keeps source
  // magnitudes: the mark, not the count, selects scaling.
  const a = h.a;
  a.weaponRunner.s3FlickVertical = false;
  const before = h.projectiles.list.length;
  h.projectiles.fireFlick(a, { ...a.weapon, flickDrops: DROPS });
  const unmarked = h.projectiles.list.slice(before);
  // Horizontal always appends the INKWAVE near unit: 3 main + 1 near.
  assert.equal(unmarked.length, DROPS + 1);
  for (const g of unmarked) assertUnscaled(g, 'unmarked low-count volley');
  // The true empty/non-fire boundary stays owned by the public admission
  // gate (#1175 / the public runner): this lane never injects ink and never
  // starts a swing — a zero-ink press still produces no volley here.
  const inkBefore = a.ink;
  a.ink = 0;
  a.weaponRunner.reset?.();
  const zero = h.projectiles.list.length;
  a.intent.fire = true; h.G.time += 1 / 60; a.update(1 / 60);
  assert.equal(h.projectiles.list.length, zero, 'a zero-ink press spawns no volley');
  a.intent.fire = false;
  a.ink = inkBefore;
  assert.ok(COST > 0 && DROPS > 0);
});

// #649 Roller rolling paint must widen with actual roll speed.
//
// These drive the real adapted WeaponRunner._roller() against a real actor and
// record the paint calls it actually makes, so the numbers below are gameplay
// values taken from the simulation rather than a re-implementation. The reference
// data is bound from the pinned 11.3.0 completion table; nothing is invented
// here, and the unresolved parts (real-device widths, the native Roller reticle
// geometry) are recorded as unverified instead of asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

// Drives a real rolling actor at a fixed ground speed and returns every paint
// call the roll made, in order. yaw 0 => forward +z, right +x.
async function rollAt(f, speed, frames = 40, dt = 1 / 60) {
  const a = f.make('roller');
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  const calls = [];
  const native = f.G.paint.splat;
  f.G.paint.splat = (centre, radius, team, opts) => {
    calls.push({ x: centre.x, z: centre.z, y: centre.y, radius, team, kind: opts.kind, floorOnly: !!opts.floorOnly });
    return 0.5;
  };
  a.yaw = 0; a.grounded = true; a.ink = 100;
  const r = a.weaponRunner;
  r.update(dt, { fire: true, firePressed: false });
  for (let i = 0; i < frames; i++) {
    a.vel.set(0, 0, speed);
    a.pos.z += speed * dt;
    f.G.time += dt;
    r.update(dt, { fire: true, firePressed: false });
  }
  f.G.paint.splat = native;
  return { actor: a, calls, runner: r };
}
// Outermost lateral extent of a set of paint calls: band centre offset plus the
// native band radius. This is what a rolled-over wall or floor tile sees.
const reach = calls => Math.max(...calls.map(c => Math.abs(c.x))) + calls[0].radius;
const body = calls => calls.filter(c => !c.floorOnly);
const splash = calls => calls.filter(c => c.floorOnly);

test('#649 the pinned reference binding is the one installRollerPaint accepts', async () => {
  const f = await fixture();
  const ref = f.installRollerPaint(f.profile, f.WEAPONS.roller);
  assert.equal(ref.speedMax, 0.132, 'BodyParam.PaintParam.SpeedMax');
  assert.equal(ref.widthHalfMax, 2.8, 'BodyParam.PaintParam.WidthHalfMax');
  assert.equal(ref.speedNormal, 0.108, 'WeaponRollParam.SpeedNormal');
  assert.equal(ref.dashWorld, 0.132 * 60, 'rollSpeed is the world speed of SpeedMax under the *60 conversion');
  assert.equal(ref.maxWidth, 1.9, 'the maximum painted width stays the upstream rollWidth calibration');
  assert.equal(f.rollerPaintReference().dashWorld, f.WEAPONS.roller.rollSpeed);
});

test('#649 a profile that stops matching the pinned conversion refuses to install', async () => {
  const f = await fixture();
  const clone = () => JSON.parse(JSON.stringify(f.profile));
  const broken = clone();
  broken.weapons.roller.rollSpeed = 9.9;
  assert.throws(() => f.installRollerPaint(broken, { ...f.WEAPONS.roller, rollSpeed: 9.9 }),
    /pinned S3-to-world \*60 conversion/);
  const missing = clone();
  delete missing.weaponsFidelityCompletion.weapons.roller.BodyParam.PaintParam.WidthHalfMax;
  assert.throws(() => f.installRollerPaint(missing, f.WEAPONS.roller), /WidthHalfMax/);
  const desynced = clone();
  desynced.weaponsFidelityCompletion.weapons.roller.BodyParam.PaintParam.SpeedMax = 0.2;
  assert.throws(() => f.installRollerPaint(desynced, f.WEAPONS.roller),
    /SpeedMax differs from WeaponRollParam.SpeedDash/);
  assert.throws(() => f.installRollerPaint(clone(), { ...f.WEAPONS.roller, rollWidth: 0 }), /must be positive/);
});

test('#649 increasing roll speed widens the painted footprint deterministically', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const low = (await rollAt(f, w.rollSpeed * 0.25)).calls;
  const normal = (await rollAt(f, w.rollBaseSpeed)).calls;
  const preDash = (await rollAt(f, w.rollSpeed - 1e-3)).calls;
  const dash = (await rollAt(f, w.rollSpeed)).calls;
  assert.ok(low.length > 0 && dash.length > 0, 'rolling actually painted at both ends');
  assert.ok(reach(low) < reach(normal), `early roll must be narrower than settled roll (${reach(low)} < ${reach(normal)})`);
  assert.ok(reach(normal) < reach(preDash), `settled roll must be narrower than just before dash (${reach(normal)} < ${reach(preDash)})`);
  assert.ok(reach(preDash) <= reach(dash) + 1e-9, `pre-dash must not exceed dash width (${reach(preDash)} <= ${reach(dash)})`);
  // The maximum-speed sample reaches the documented maximum half width anchored
  // on the existing calibration; the body band alone would stop far short of it.
  const maxHalf = w.rollWidth * 0.5, bodyEdge = w.rollWidth * 0.33;
  assert.ok(Math.abs(reach(dash) - (maxHalf + 0.62)) < 1e-9, `dash reaches WidthHalfMax (${reach(dash)})`);
  assert.ok(reach(body(dash)) < reach(dash), 'the speed gain is not coming from the body band');
  assert.ok(bodyEdge < maxHalf, 'the side splash has somewhere to walk to');
  // Deterministic: identical inputs reproduce identical geometry.
  const again = await rollAt(f, w.rollSpeed);
  assert.deepEqual(again.calls, dash, 'the same actor, weapon and speed paint identically');
});

test('#649 the roller body keeps its upstream geometry and only the side splash is speed scaled', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const seen = [];
  for (const speed of [w.rollSpeed * 0.25, w.rollBaseSpeed, w.rollSpeed]) {
    const { calls } = await rollAt(f, speed);
    const bands = body(calls);
    assert.ok(bands.length >= 3 && bands.length % 3 === 0, 'body paint stays a whole number of three-band steps');
    for (let i = 0; i < bands.length; i += 3) {
      const step = bands[i + 1].x - bands[i].x;
      assert.ok(Math.abs(step - w.rollWidth * 0.33) < 1e-9, `body band step is unchanged at ${speed} (${step})`);
      for (const b of bands.slice(i, i + 3)) {
        assert.equal(b.radius, 0.62, 'native band radius is unchanged');
        assert.equal(b.floorOnly, false, 'only the body may paint a wall');
        assert.equal(b.kind, 'roll', 'rolled turf still reads as a straight-edged band');
        assert.ok(Math.abs(b.y - (bands[0].y)) < 1e-12, 'bands share the native roll height');
      }
    }
    const drops = splash(calls);
    assert.equal(drops.length % 2, 0, 'side splashes come in left/right pairs');
    assert.ok(Math.abs(drops[0].x + drops[1].x) < 1e-9, 'side splash pair is symmetric about the roll centre');
    for (const d of drops) { assert.equal(d.kind, 'roll'); assert.equal(d.radius, 0.62, 'splash reuses the native band radius'); }
    seen.push(Math.abs(drops[0].x));
  }
  assert.ok(seen[0] < seen[1] && seen[1] < seen[2], `side splash walks out with speed (${seen.join(' < ')})`);
});

test('#649 the speed-dependent side splash is floor-only and opt-in', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const { calls } = await rollAt(f, w.rollSpeed);
  const drops = splash(calls);
  assert.ok(drops.length > 0, 'dash speed paints side splashes');
  assert.ok(reach(drops) > reach(body(calls)), 'the extra reach comes from the splash, not the body');
  // The gate is a single guarded connection in the installed paint system and
  // is opt-in: any splat without floorOnly still walks wall faces.
  const installed = adaptSource('src/world/paint.js', fs.readFileSync(path.join(UPSTREAM, 'src/world/paint.js'), 'utf8'));
  assert.match(installed, /const floorOnly = !!opts\.floorOnly;/);
  assert.match(installed, /if \(floorOnly && f\.wall\) continue;/);
  assert.equal((installed.match(/floorOnly/g) || []).length, 3, 'the floor-only option stays one guarded connection');
  assert.equal(installed.split('floorOnly && f.wall').length - 1, 1, 'wall faces are skipped only when the option is set');
});

test('#649 zero roll speed adds no side splash, and the ratio is clamped to the pinned range', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  assert.equal(f.rollerPaintRatio(0, w), 0, 'a roller that is not moving has no splash ratio');
  assert.equal(f.rollerPaintRatio(-1, w), 0, 'ratio never goes negative');
  assert.equal(f.rollerPaintRatio(w.rollSpeed * 2, w), 1, 'ratio never exceeds the SpeedMax reference');
  assert.ok(Math.abs(f.rollerPaintRatio(w.rollBaseSpeed, w) - 0.108 / 0.132) < 1e-12,
    'settled roll sits exactly at SpeedNormal / SpeedMax');
  assert.equal(f.rollerSideSplashOffset(0, w), w.rollWidth * 0.33, 'a stopped splash stays on the outer body band');
  // Drive the real emitter at zero speed: body bands only.
  const calls = [];
  const actor = f.make('roller');
  actor.yaw = 0;
  const paint = { splat: (centre, radius, team, opts) => { calls.push({ x: centre.x, radius, floorOnly: !!opts.floorOnly }); return 0; } };
  f.rollerRollPaint(actor, w, 0, 0, 1, 1, 0, actor.pos, actor.pos.clone(), paint);
  assert.equal(calls.length, 3, 'zero speed emits the three native body bands and nothing else');
  assert.ok(calls.every(c => !c.floorOnly), 'and no side splash at all');
});

test('#649 roll speed, dash timing, contact width and ink consumption are untouched', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  assert.equal(w.rollSpeed, 7.92);
  assert.ok(Math.abs(w.rollBaseSpeed - 6.48) < 1e-12);
  assert.equal(w.rollDashTime, 1.5);
  assert.equal(w.rollInkPerMeter, 0.7575757575757576);
  assert.equal(w.rollDamage, 140);
  const a = f.make('roller');
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  a.grounded = true;
  const r = a.weaponRunner;
  r.rolling = true;
  r.rollT = 0;
  assert.equal(r.moveSpeed(), w.rollBaseSpeed, 'normal roll speed target is unchanged');
  r.rollT = w.rollDashTime - 1e-4;
  assert.equal(r.moveSpeed(), w.rollBaseSpeed, 'still normal roll just before the 90F dash');
  r.rollT = w.rollDashTime;
  assert.equal(r.moveSpeed(), w.rollSpeed, 'the 90F dash still switches to rollSpeed');
  r.rollT = 0;
  const before = a.ink;
  a.vel.set(0, 0, w.rollSpeed);
  a.pos.set(0, 0, 0);
  r.lastRollPos = a.pos.clone();
  a.pos.z += 1;
  const ink0 = a.ink;
  r.update(1 / 60, { fire: true, firePressed: false });
  assert.ok(a.ink < ink0, 'rolling still consumes ink per metre');
  r.reset();
  assert.equal(r.moveSpeed(), f.PLAYER.runSpeed, 'reset returns to run speed');
  assert.ok(Number.isFinite(before));
});

test('#649 an owner and a replayed remote roller produce identical paint geometry', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const owner = await rollAt(f, w.rollSpeed);
  const remote = await rollAt(f, w.rollSpeed);
  remote.actor.nid = 7; remote.actor.remote = true;
  const replay = await rollAt(f, w.rollSpeed);
  replay.actor.nid = 7; replay.actor.remote = true;
  assert.deepEqual(replay.calls, owner.calls, 'a remote roller paints the same deterministic bands');
  assert.ok(replay.calls.every(c => c.kind === 'roll'), 'replay keeps the roll band kind the network records');
  assert.ok(remote.calls.length > 0);
});
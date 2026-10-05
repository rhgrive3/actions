// Issue #498 — Roller flick globs must narrow their paint footprint with age.
// Splatoon 3 Ver. 11.3.0 pins an age window per swing group (H 20f->50f,
// V 30f->50f, mature 0.6x); INKWAVE never consulted p.age for paint sizing.
// These tests drive the actual public Projectiles._step / _impact with a fixed
// 1/60 step and a fixed RNG draw, so only projectile age can move the radius
// handed to G.paint.splat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import { adaptIssue498, ROLLER_PAINT_AGE, ISSUE_498_ANCHORS } from '../issue-498-adapter.mjs';

const DT = 1 / 60;
const EPS = 1e-9;
const count = (s, needle) => s.split(needle).length - 1;
const close = (a, b, e = EPS) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const startOf = vertical => (vertical ? ROLLER_PAINT_AGE.vertical : ROLLER_PAINT_AGE.horizontal).startFrame;

// Independent restatement of the pinned window: the runtime must agree with it.
function ageMultiplier(vertical, frames) {
  const w = vertical ? ROLLER_PAINT_AGE.vertical : ROLLER_PAINT_AGE.horizontal;
  if (frames <= w.startFrame) return 1;
  const k = frames >= w.endFrame ? 1 : (frames - w.startFrame) / (w.endFrame - w.startFrame);
  return 1 + (ROLLER_PAINT_AGE.matureRate - 1) * k;
}

async function rig(weapon = 'roller') {
  const f = await fixture();
  const a = f.make(weapon);
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.actors = [a];
  f.G.match.canRespawn = () => false;
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  f.setRandom(() => 0.5);
  const paints = [];
  // Mirrors world/paint.js: a muted (ghost) step may not record authoritative paint.
  f.G.paint = {
    sample: () => 1,
    splat: (at, radius, team, opts = {}) => {
      if (f.G.netm?.mute) return 0;
      paints.push({ radius, team, seed: opts.seed });
      return Math.PI * radius * radius;
    },
  };
  f.G.physics.raycast = (_o, _d, _dist, h) => { h.hit = true; h.point = _o.clone(); h.normal = new f.THREE.Vector3(0, 1, 0); return h; };
  f.G.physics.segment = () => ({ hit: false });
  return { f, a, ps, paints };
}

// One real volley, reduced to a single main glob on a neutral trajectory so the
// age -> width relation can be read without an impact or a water kill racing it.
function isolateGlob(ps, glob) {
  ps.list.length = 0;
  ps.list.push(glob);
  glob.pos.set(0, 1.3, 0); glob.prev.copy(glob.pos); glob.start.copy(glob.pos);
  glob.vel.set(0, 0, 1); glob.grav = 0; glob.drag = 0;
  glob.trail = 0; glob.trailEvery = 1e9;   // never drips until the test arms it
  return glob;
}

function fireRollerGlob(ps, a, vertical) {
  a.weaponRunner.s3FlickVertical = vertical;
  ps.fireFlick(a, a.weapon);
  const glob = ps.list.find(p => p.type === 'drop' && p.s3FlickUnit === 0);
  assert.ok(glob, 'roller volley produced a main glob');
  assert.equal(glob.s3Vertical, vertical, 'glob carries its swing mode');
  assert.equal(glob.s3Weapon?.kind, 'roller');
  return isolateGlob(ps, glob);
}

// Native trail drip exactly on the requested age: age is advanced first inside
// _step, so the paint event after N steps has flown for N/60 s.
function stepTrailAt(ps, glob, frames) {
  for (let i = 1; i < frames; i++) assert.equal(ps._step(glob, DT), false, `glob survives to ${frames}f`);
  glob.trail = glob.trailEvery;
  assert.equal(ps._step(glob, DT), false);
  close(glob.age * 60, frames, 1e-6);
}

function stepImpactAt(f, ps, glob, frames) {
  for (let i = 1; i < frames; i++) assert.equal(ps._step(glob, DT), false, `glob survives to ${frames}f`);
  const at = new f.THREE.Vector3(0, 1.3, 0);
  f.G.physics.segment = () => ({ hit: true, point: at.clone(), normal: new f.THREE.Vector3(0, 1, 0) });
  assert.equal(ps._step(glob, DT), true, 'world contact retires the glob');
  close(glob.age * 60, frames, 1e-6);
}

test('pinned reference, runtime constants and both native paint connections agree', async () => {
  const ref = JSON.parse(fs.readFileSync(new URL('../reference/roller-paint-age-reference.json', import.meta.url), 'utf8'));
  assert.equal(ref.referenceVersion, '11.3.0');
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(ref.groups.horizontal.ChangeFrameWidthRate, ROLLER_PAINT_AGE.matureRate);
  assert.equal(ref.groups.horizontal.ChangeWidthStartFrame, ROLLER_PAINT_AGE.horizontal.startFrame);
  assert.equal(ref.groups.horizontal.ChangeWidthEndFrame, ROLLER_PAINT_AGE.horizontal.endFrame);
  assert.equal(ref.groups.vertical.ChangeFrameWidthRate, ROLLER_PAINT_AGE.matureRate);
  assert.equal(ref.groups.vertical.ChangeWidthStartFrame, ROLLER_PAINT_AGE.vertical.startFrame);
  assert.equal(ref.groups.vertical.ChangeWidthEndFrame, ROLLER_PAINT_AGE.vertical.endFrame);

  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
  assert.ok(!raw.includes('rollerAgePaintWidth'), 'raw inkwave-public stays untouched');
  assert.equal(adaptIssue498('src/game/other.js', raw, replaceOnce), raw, 'other files are not transformed');
  const out = adaptSource('src/game/weapons.js', raw);
  assert.equal(count(out, 'rollerAgePaintWidth(p, p.trailRadius'), 1, 'one trail connection');
  assert.equal(count(out, 'rollerAgePaintWidth(p, rad)'), 1, 'one impact connection');
  assert.equal(count(out, 'issue-498-adapter.mjs'), 1, 'one import');
  assert.equal(count(out, 'radius: rad })'), count(raw, 'radius: rad })'), 'the visual impact event keeps its radius');
  for (const anchor of ISSUE_498_ANCHORS) {
    assert.throws(() => adaptSource('src/game/weapons.js', raw.replace(anchor, '')), /conflict/);
    assert.throws(() => adaptSource('src/game/weapons.js', raw + '\n' + anchor), /conflict/);
  }
});

test('horizontal Roller trail paint is unreduced through 20f and reaches 0.6x by 50f', async () => {
  for (const frames of [19, 20, 35, 49, 50]) {
    const { a, ps, paints } = await rig();
    const glob = fireRollerGlob(ps, a, false);
    const base = glob.trailRadius;
    stepTrailAt(ps, glob, frames);
    assert.equal(paints.length, 1, 'exactly one native drip');
    close(paints[0].radius, base * ageMultiplier(false, frames));
    if (frames < 20) assert.equal(paints[0].radius, base, 'no reduction before the 20f boundary');
    if (frames === 50) close(paints[0].radius, base * 0.6);
  }
});

test('vertical Roller trail paint is unreduced through 30f and reaches 0.6x by 50f', async () => {
  for (const frames of [29, 30, 40, 49, 50]) {
    const { a, ps, paints } = await rig();
    const glob = fireRollerGlob(ps, a, true);
    const base = glob.trailRadius;
    stepTrailAt(ps, glob, frames);
    assert.equal(paints.length, 1, 'exactly one native drip');
    close(paints[0].radius, base * ageMultiplier(true, frames));
    if (frames < 30) assert.equal(paints[0].radius, base, 'no reduction before the 30f boundary');
    if (frames === 50) close(paints[0].radius, base * 0.6);
  }
});

test('impact paint follows the same window and composes the age multiplier exactly once', async () => {
  for (const vertical of [false, true]) for (const frames of vertical ? [29, 30, 40, 49, 50] : [19, 20, 35, 49, 50]) {
    const { f, a, ps, paints } = await rig();
    const glob = fireRollerGlob(ps, a, vertical);
    const base = glob.radius;
    stepImpactAt(f, ps, glob, frames);
    assert.equal(paints.length, 1, 'exactly one native impact splat');
    close(paints[0].radius, base * ageMultiplier(vertical, frames));
    assert.equal(glob.radius, base, 'the stored width is never rewritten');
    if (frames > startOf(vertical)) {
      const once = base * ageMultiplier(vertical, frames);
      assert.ok(Math.abs(once - base * ageMultiplier(vertical, frames) ** 2) > 1e-6, 'applied once, not twice');
    }
  }
  // Trail and impact share one composition at the mature boundary.
  const { f, a, ps, paints } = await rig();
  const glob = fireRollerGlob(ps, a, true);
  const trailBase = glob.trailRadius;
  stepTrailAt(ps, glob, 50);
  close(paints[0].radius, trailBase * ROLLER_PAINT_AGE.matureRate);
  assert.ok(Math.abs(paints[0].radius - trailBase * ROLLER_PAINT_AGE.matureRate ** 2) > 1e-6, 'trail depletion composes once');
  void f;
});

test('the age multiplier composes with the stored group/distance width instead of replacing it', async () => {
  for (const width of [0.31, 0.9]) for (const frames of [19, 35, 50]) {
    const { a, ps, paints } = await rig();
    const glob = fireRollerGlob(ps, a, false);
    glob.trailRadius = width;
    stepTrailAt(ps, glob, frames);
    close(paints[0].radius, width * ageMultiplier(false, frames));
    close(paints[0].radius / width, ageMultiplier(false, frames), 1e-6, 'the stored width keeps its own scale');
  }
});

test('neighbouring weapons keep their exact native paint radius at the same ages', async () => {
  for (const frames of [20, 50]) {
    const { f, a, ps, paints } = await rig('shooter');
    ps.fireShooter(a, a.weapon, 0);
    const shot = ps.list[0];
    assert.ok(shot && shot.type === 'shot' && shot.s3Weapon?.kind === 'shooter');
    isolateGlob(ps, shot);
    const trailBase = shot.trailRadius, impactBase = shot.radius;
    stepTrailAt(ps, shot, frames);
    assert.equal(paints.length, 1);
    assert.equal(paints[0].radius, trailBase, 'shooter trail width is untouched');
    shot.age = 0; // restart the clock so the impact window is read at the same age
    stepImpactAt(f, ps, shot, frames);
    assert.equal(paints.length, 2);
    assert.equal(paints[1].radius, impactBase, 'shooter impact width is untouched');
  }
});

test('only the paint footprint moves: collision, visual size, damage and the impact event stay native', async () => {
  const { f, a, ps, paints } = await rig();
  const glob = fireRollerGlob(ps, a, true);
  const events = [];
  const off = f.on('weapon:impact', e => events.push(e));
  const before = { size: glob.size, radius: glob.radius, vis: glob.vis, damage: glob.damage, dmgFar: glob.dmgFar, seed: glob.seed };
  stepImpactAt(f, ps, glob, 50);
  off();
  close(paints[0].radius, before.radius * 0.6);
  assert.equal(glob.size, before.size, 'player collision radius is a separate dimension (#402)');
  assert.equal(glob.radius, before.radius, 'the stored impact width is unchanged');
  assert.equal(glob.vis, before.vis, 'visual draw size is unchanged');
  assert.equal(glob.damage, before.damage, 'damage is unchanged');
  assert.equal(glob.dmgFar, before.dmgFar, 'distance damage is unchanged');
  assert.equal(glob.seed, before.seed, 'native random seed is unchanged');
  assert.equal(events.length, 1, 'native impact event still fires once');
  assert.equal(events[0].radius, before.radius, 'the visual impact event keeps the unscaled radius');
});

test('owner paint stays authoritative and remote ghosts never paint', async () => {
  const { f, a, ps, paints } = await rig();
  a.isLocal = true; a.nid = 1;
  const nm = Object.create(f.NetMatch.prototype);
  nm.mute = 0; nm.out = []; nm.eventSeq = 0; nm.isMine = () => true;
  f.G.netm = nm;
  const glob = fireRollerGlob(ps, a, false);
  const packets = nm.out.filter(e => e[1] === 'p');
  assert.equal(packets.length, 13, 'the native volley is published once');
  stepTrailAt(ps, glob, 50);
  assert.equal(paints.length, 1, 'the owner paints');
  assert.ok(paints[0].radius < glob.trailRadius, 'owner paint carries the mature width');

  ps.list.length = 0;
  for (const packet of packets) ps.ghostProjectile(a, packet);
  assert.equal(ps.list.length, 13);
  for (const ghost of ps.list) {
    assert.ok(ghost.ghost);
    assert.equal(ghost.s3Weapon, null, 'a ghost carries no owner weapon tag');
    ghost.pos.set(0, 1.3, 0); ghost.prev.copy(ghost.pos); ghost.start.copy(ghost.pos);
    ghost.vel.set(0, 0, 1); ghost.grav = 0; ghost.drag = 0;
    ghost.trail = 0; ghost.trailEvery = 1e9;
  }
  for (let i = 1; i < 50; i++) ps.update(DT);
  ps.list[0].trail = ps.list[0].trailEvery;
  ps.update(DT);
  assert.equal(nm.mute, 0, 'the mute guard is released after every step');
  assert.equal(paints.length, 1, 'remote ghost stepping adds no authoritative paint');
});

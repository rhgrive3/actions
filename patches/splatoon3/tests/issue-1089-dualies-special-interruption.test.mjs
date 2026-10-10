import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';

async function setup({ negative = false } = {}) {
  const f = await fixture({ productionComposition: true, realProjectiles: true,
    extraExports: `export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
      export { installKitTrizooka } from './patches/splatoon3/runtime/kit-trizooka.mjs';`,
    adaptRuntime(rel, source) {
      if (!negative || rel !== 'patches/splatoon3/runtime/weapons.mjs') return source;
      const start = source.indexOf("  on?.('special:use', event => {");
      const end = source.indexOf('\n  });', start);
      assert.ok(start >= 0 && end > start, 'negative control removes only the new Special listener');
      return source.slice(0, start) + source.slice(end + '\n  });'.length);
    },
  });
  f.installWeaponsFidelity(f, f.profile);
  const a = f.make('dualies'), r = a.weaponRunner, shots = [], uses = [];
  a.isLocal = true; a.remote = false; a._nearCamera = () => false;
  a.grounded = true; a.ink = 100; a.invuln = 0;
  a.intent.fire = true; a.intent.move.set(0, 0, 0);
  // Preserve the real Special state machine. Bound floor contact so its real
  // falling phase can finish without requiring the fixture to render a level.
  a._resolve = function () { if (this.pos.y <= 0) { this.pos.y = 0; this.grounded = true; } };
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.netm = null;
  f.G.projectiles.slam = () => {};
  let tick = 0;
  const fire = f.G.projectiles.fireDualies;
  f.G.projectiles.fireDualies = function (actor, weapon, spread, hand) {
    shots.push({ tick, interval: weapon.fireInterval, spread, turret: r.s3Turret });
    return fire.call(this, actor, weapon, spread, hand);
  };
  f.on('special:use', event => uses.push(event));
  return { ...f, a, r, shots, uses, step() { tick++; f.tick(a); }, get frame() { return tick; } };
}

function roll(h, pending = false) {
  h.a.intent.move.set(0, 0, 1);
  assert.equal(h.r.tryDodge(h.a.intent.move), true);
  while (h.r.dodge) h.step();
  h.a.intent.move.set(0, 0, 0);
  assert.equal(h.r.s3Turret, true);
  assert.equal(h.r.s3DodgeShotPending, 4 * STEP);
  if (!pending) {
    while (h.r.lockT > 0 || !h.shots.length) h.step();
    assert.equal(h.shots.at(-1).interval, h.a.weapon.lockInterval);
    assert.equal(h.shots.at(-1).spread, 0);
  }
}

function start(h) {
  h.a.special = h.a.specialCost(); h.a.intent.special = true;
  h.step(); h.a.intent.special = false;
  assert.equal(h.uses.length, 1); assert.ok(h.a.specialActive);
}
function finish(h) {
  let frames = 0;
  while (h.a.specialActive && frames++ < 300) h.step();
  assert.equal(h.a.specialActive, null, 'native Special finishes before main-weapon control resumes');
}
function resume(h, count = 3) {
  h.shots.length = 0;
  let frames = 0;
  while (h.shots.length < count && frames++ < 120) h.step();
  assert.equal(h.shots.length, count);
  return h.shots;
}

test('#1089 same-composition negative control resumes pre-Special 4F/zero-spread turret', async () => {
  const h = await setup({ negative: true }); roll(h); start(h); finish(h);
  assert.equal(h.r.s3Turret, true);
  for (const shot of resume(h)) { assert.equal(shot.interval, 4 * STEP); assert.equal(shot.spread, 0); }
});

test('#1089 held and released ZR resume normal mode after the native Special completes', async () => {
  for (const held of [true, false]) {
    const h = await setup(); roll(h); start(h);
    assert.equal(h.r.s3Turret, false); assert.equal(h.r.s3DodgeShotPending, 0);
    assert.equal(h.r.s3GateDodgeShotPending, false); assert.equal(h.r.s3DodgeShotRemaining, 0);
    h.a.intent.fire = held; finish(h); h.a.intent.fire = true;
    for (const shot of resume(h)) {
      assert.equal(shot.turret, false); assert.equal(shot.interval, h.a.weapon.fireInterval);
      assert.ok(shot.spread > 0, 'normal deviation replaces the retained zero-spread stance');
    }
    assert.equal(h.shots[1].tick - h.shots[0].tick, 5);
    assert.equal(h.shots[2].tick - h.shots[1].tick, 5);
  }
});

test('#1089 a Special inside the post-roll 4F gate cancels both pending owners without resource reset', async () => {
  const h = await setup(); roll(h, true);
  const saved = { ink: h.a.ink, rolls: h.r.rollsLeft, lock: h.r.lockT,
    recovery: h.r.s3DodgeInkRemaining, cooldown: h.r.cooldown };
  h.a.special = h.a.specialCost(); h.a._startSpecial();
  assert.equal(h.r.s3Turret, false); assert.equal(h.r.s3DodgeShotPending, 0);
  assert.equal(h.r.s3GateDodgeShotPending, false); assert.equal(h.r.s3DodgeShotRemaining, 0);
  assert.deepEqual({ ink: h.a.ink, rolls: h.r.rollsLeft, lock: h.r.lockT,
    recovery: h.r.s3DodgeInkRemaining, cooldown: h.r.cooldown }, saved,
  'the listener changes only the retained firing state; native fixture does not install the separate Special ink refill');
  finish(h);
  for (const shot of resume(h)) assert.equal(shot.turret, false);
});

test('#1089 a fresh post-Special Dodge establishes ordinary turret state again', async () => {
  const h = await setup(); roll(h); start(h); finish(h); resume(h);
  h.shots.length = 0; roll(h);
  for (const shot of resume(h)) { assert.equal(shot.turret, true); assert.equal(shot.interval, 4 * STEP); assert.equal(shot.spread, 0); }
});

test('#1089 rejected Special input and guarded native kit activation preserve existing turret', async () => {
  const h = await setup(); roll(h);
  h.a.special = 0; h.a.intent.special = true; h.step();
  assert.equal(h.uses.length, 0); assert.equal(h.a.specialActive, null); assert.equal(h.r.s3Turret, true);
  h.installKitTrizooka(h, h.profile);
  h.a.weapon = { ...h.a.weapon, special: 'trizooka' }; h.a._startSpecial();
  assert.equal(h.uses.length, 0); assert.equal(h.r.s3Turret, true, 'uncharged kit call returns before a committed event');
});

test('#1089 successful guarded kit activation and unrelated/remote owner exclusions', async () => {
  const h = await setup(); roll(h);
  h.installKitTrizooka(h, h.profile);
  h.a.weapon = { ...h.a.weapon, special: 'trizooka' }; h.a.special = h.a.specialCost();
  h.G.match.state = 'playing'; h.a._startSpecial();
  assert.equal(h.uses.length, 1); assert.equal(h.a.specialActive.id, 'trizooka'); assert.equal(h.r.s3Turret, false);
  const other = h.make('shooter'); other.weaponRunner.s3Turret = true;
  h.emit('special:use', { actor: other }); assert.equal(other.weaponRunner.s3Turret, true);
  const remote = h.make('dualies'); remote.remote = true; remote.weaponRunner.s3Turret = true;
  h.emit('special:use', { actor: remote }); assert.equal(remote.weaponRunner.s3Turret, true);
});

test('#1089 fixed-authority post-Special shots agree across 30/60/120 Hz', async () => {
  const rows = [];
  for (const hz of [30, 60, 120]) {
    const h = await setup(); roll(h); start(h); const clock = new FixedClock(); h.shots.length = 0;
    for (let frame = 0; frame < hz * 3; frame++) clock.advance(1 / hz, () => h.step());
    assert.ok(h.shots.length > 0); assert.equal(h.r.s3Turret, false);
    rows.push(h.shots.map(s => [s.tick, s.interval, s.spread, s.turret]));
  }
  assert.deepEqual(rows[0], rows[1]); assert.deepEqual(rows[1], rows[2]);
});

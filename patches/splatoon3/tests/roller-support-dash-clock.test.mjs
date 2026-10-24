import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const DT = 1 / 60;
const held = { fire: true, firePressed: false, sub: false, subReleased: false };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} != ${expected}`);
let cached;
function production() {
  return cached ||= fixture({ fullRuntime: true, productionComposition: true,
    realProjectiles: true, vmMathRandom: () => .5,
    extraExports: `
      export { attackAirRateScale, airborneHumanTargetSpeed } from './patches/splatoon3/runtime/movement-physics.mjs';
      export { installIssueFiveHotfixA } from './patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
      export { installIssueEightFollowup } from './patches/splatoon3/runtime/issue-eight-followup.mjs';
    ` }).then(f => {
    // source-fixture installs install.mjs, not bootstrap.mjs. Preserve the real
    // bootstrap order for these two relevant, otherwise unchanged installers.
    f.installIssueFiveHotfixA(f.installedRuntime, f.profile);
    f.installIssueEightFollowup(f.installedRuntime);
    return f;
  });
}
function world(f, maxX = 0) {
  f.G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-40, -.5, -40], max: [maxX, 0, 40] }] });
  f.G.physics = new f.Physics(f.G.level);
}
function owner(f, id = 'roller') {
  const a = f.make(id);
  a.form = 'kid'; a.ink = 100; a.grounded = true;
  a.pos.set(-1.5, 0, 0); a.yaw = a.aimYaw = Math.PI / 2;
  a.intent.move.set(1, 0, 0); a.intent.fire = true;
  a.vel.set(a.weapon.rollBaseSpeed ?? a.weapon.rollSpeed ?? 4.8, 0, 0);
  return a;
}
function step(f, a, input = held) {
  f.G.time += DT;
  a.intent.fire = input.fire;
  a.weaponRunner.update(DT, input);
}
function close(f) { f.G.actors = []; f.G.projectiles.clear(); }

test('grounded drum-support loss earns no dash time on the discovery tick at 30/60/120 Hz', async () => {
  const f = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    world(f);
    const a = owner(f), r = a.weaponRunner, clock = new f.FixedClock();
    const paint = [], hits = [], rows = [];
    f.G.paint = { sample: () => 1, splat: p => { paint.push(p.clone()); return 0; } };
    const applyHit = f.G.projectiles.applyHit;
    f.G.projectiles.applyHit = (...args) => { hits.push(args); return 'accepted'; };
    let tick = 0, beforeLoss;
    try {
      while (tick < 16) clock.advance(1 / hz, () => {
        if (tick === 2) { beforeLoss = [a.ink, paint.length, hits.length]; a.pos.x = -.25; }
        if (tick === 4) a.pos.x = -1.5;
        if (tick === 6) { a.grounded = false; a.pos.y = 2; }
        if (tick === 9) { a.grounded = true; a.pos.y = 0; }
        if (tick === 10) a.intent.move.set(0, 0, 0);
        if (tick === 11) a.intent.move.set(.5, 0, 0);
        if (tick === 12) { a.intent.move.set(1, 0, 0); a.vel.x = a.weapon.rollBaseSpeed / 2; }
        if (tick === 13) a.vel.x = a.weapon.rollBaseSpeed;
        if (tick === 14) a.pos.x = -.25;
        step(f, a, tick === 7 ? { ...held, fire: false } : held);
        if (tick === 1 || tick === 5 || tick === 13) near(r.rollT, DT, 'eligible contact tick');
        if (tick === 2 || tick === 3) {
          assert.equal(a.grounded, true, 'feet remain grounded over the ledge');
          assert.equal(r.rolling, true, 'held state survives support loss');
          assert.equal(r.s3RollerSuspendedHold, true);
          assert.equal(r.rollT, 0, 'current unsupported tick cannot earn dash credit');
          assert.deepEqual([a.ink, paint.length, hits.length], beforeLoss, 'no contact cost/paint/hit');
        }
        if ([4, 6, 7, 8, 9, 10, 11, 12].includes(tick)) assert.equal(r.rollT, 0,
          `existing eligibility preserved on tick ${tick}`);
        if (tick === 4) assert.equal(r.s3RollerSuspendedHold, false, 'contact resumes');
        if (tick === 6) assert.equal(r.s3RollerSuspendedHold, true, 'jump suspends contact');
        if (tick === 7 || tick === 8) assert.equal(r.rolling, false, 'release and airborne cold start');
        if (tick === 14) {
          assert.equal(r.s3RollerSuspendedHold, true);
          r.cancelPendingInput();
          assert.equal(r.rolling, false); assert.equal(r.s3RollerSuspendedHold, false);
        }
        if (tick === 15) { r.reset(); assert.equal(r.rollT, 0); }
        rows.push([r.rollT, r.rolling, r.s3RollerSuspendedHold]);
        tick++;
      });
      traces.push(rows);
    } finally { f.G.projectiles.applyHit = applyHit; close(f); }
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
});

test('all existing airborne held movement values stay unchanged for five Rollers and three Brushes', async () => {
  const f = await production(); world(f, 40);
  const targets = { 's3-roller-compact': 7.68, roller: 5.76, 's3-roller-heavy': 5.28,
    's3-roller-hunter': 6.48, 's3-roller-wide': 7.08, 's3-brush-mini': 11.88,
    's3-brush-normal': 7.92, 's3-brush-heavy': 10.8 };
  const families = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'roller' || r.family === 'brush');
  assert.equal(families.length, 8);
  for (const hz of [30, 60, 120]) for (const rec of families) {
    const a = owner(f, rec.id), r = a.weaponRunner, clock = new f.FixedClock(); let tick = 0;
    a.pos.set(0, 0, 0); a.yaw = a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.vel.set(0, 0, 4.8);
    while (tick < 4) clock.advance(1 / hz, () => {
      if (tick === 1) { a.grounded = false; a.pos.y = 2; }
      step(f, a, tick >= 2 ? { ...held, fire: false } : held);
      if (tick === 1 || tick === 2) {
        const active = tick === 1;
        assert.equal(r.firingPose(), active);
        near(r.moveSpeed(), active ? targets[rec.id] : 5.76, rec.id + ' moveSpeed');
        near(f.airborneHumanTargetSpeed(a, f.PLAYER), active ? targets[rec.id] : 5.76, rec.id + ' target');
        assert.equal(f.attackAirRateScale(a, f.PLAYER), active ? 2 : 1);
        a.vel.set(0, 0, 0); a._horizontal(DT, false, false);
        near(a.vel.z, (active ? 40 : 36) / 60, rec.id + ' actual acceleration');
      }
      tick++;
    });
    close(f);
  }
});

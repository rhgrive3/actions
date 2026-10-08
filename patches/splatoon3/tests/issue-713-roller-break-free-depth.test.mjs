import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

function impact(f, system, q, point) {
  const hit = new f.Hit();
  hit.hit = true; hit.block = -1; hit.face = -1;
  hit.point.set(point.x, point.y, point.z); hit.normal.set(0, 1, 0);
  system._impact(q, hit);
  return hit;
}
async function rollerSystem(vertical = false) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const system = G.projectiles = new f.Projectiles(G.scene);
  const a = f.make('roller');
  a.weaponRunner.s3FlickVertical = vertical;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  f.setRandom(() => 0.5);
  return { f, G, THREE, system, a };
}
const unitPaint = (f, vertical, index = 0) =>
  f.profile.weaponsFidelityCompletion.weapons.roller[vertical ? 'VerticalSwingUnitGroupParam' : 'WideSwingUnitGroupParam'].Unit[index].UnitParam.PaintParam;

test('#713 pinned height endpoints resolve to their own break/free depth', async () => {
  const { f } = await rollerSystem();
  const paint = unitPaint(f, false);
  assert.equal(paint.HeightUseDepthScaleMaxBreakFree, 1.5);
  assert.equal(paint.HeightUseDepthScaleMinBreakFree, 10);
  assert.equal(paint.DepthScaleMaxBreakFree, 2.4);
  assert.equal(paint.DepthScaleMinBreakFree, 1.2);
  const probe = (record, fall) => f.rollerBreakFreeDepthScale(
    { ghost: false, fidelityPhase: 2, start: { y: fall }, fidelityRollerUnit: { UnitParam: { PaintParam: record } } },
    { y: 0 });
  assert.equal(probe(paint, 0), 2.4);
  assert.equal(probe(paint, 1.5), 2.4);
  assert.equal(probe(paint, 10), 1.2);
  assert.equal(probe(paint, 40), 1.2);
  assert.ok(Math.abs(probe(paint, 5.75) - 1.8) < 1e-9);
  const mirrored = { ...paint, HeightUseDepthScaleMaxBreakFree: 10, HeightUseDepthScaleMinBreakFree: 1.5 };
  assert.equal(probe(mirrored, 1.5), 1.2);
  assert.equal(probe(mirrored, 10), 2.4);
});

test('#713 vertical unit band stays distinct from the horizontal band', async () => {
  const { f } = await rollerSystem();
  const paint = unitPaint(f, true);
  assert.equal(paint.DepthScaleMaxBreakFree, 1.76);
  assert.equal(paint.DepthScaleMinBreakFree, 1.32);
  assert.equal(paint.HeightUseDepthScaleMaxBreakFree, 1.5);
  assert.equal(paint.HeightUseDepthScaleMinBreakFree, 10);
  const probe = fall => f.rollerBreakFreeDepthScale(
    { ghost: false, fidelityPhase: 2, start: { y: fall }, fidelityRollerUnit: { UnitParam: { PaintParam: paint } } },
    { y: 0 });
  assert.equal(probe(0), 1.76);
  assert.equal(probe(10), 1.32);
  assert.ok(Math.abs(probe(5.75) - 1.54) < 1e-9);
});

test('#713 straight-flight, ghost and non-Roller rounds keep the generic amount', async () => {
  const { f } = await rollerSystem();
  const paint = unitPaint(f, false);
  const unit = { UnitParam: { PaintParam: paint } };
  assert.equal(f.rollerBreakFreeDepthScale({ ghost: false, fidelityPhase: 0, start: { y: 9 }, fidelityRollerUnit: unit }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepthScale({ ghost: true, fidelityPhase: 2, start: { y: 9 }, fidelityRollerUnit: unit }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepthScale({ ghost: false, fidelityPhase: 2, start: { y: 9 } }, { y: 0 }), null);
  assert.equal(f.rollerBreakFreeDepthScale({ ghost: false, fidelityPhase: 2, start: { y: 9 }, fidelityRollerUnit: { UnitParam: { PaintParam: {} } } }, { y: 0 }), null);
});

test('#713 full production: low and high break/free arcs of one unit land different depths', async () => {
  const { f, G, THREE, system, a } = await rollerSystem();
  const paints = [];
  G.paint.splat = (...args) => { paints.push(args); return 0; };
  system.fireFlick(a, a.weapon);
  assert.ok(system.list.length > 0);
  const template = system.list[0];
  const paint = template.fidelityRollerUnit.UnitParam.PaintParam;
  const seen = [], falls = [];
  for (const startY of [1.0, 12]) {
    const q = { ...template, pos: new THREE.Vector3(0, startY, 0), prev: new THREE.Vector3(0, startY, 0), start: new THREE.Vector3(0, startY, 0), vel: template.vel.clone(), age: template.age, life: template.life, straight: template.straight, grav: template.grav, drag: template.drag, fidelityMove: template.fidelityMove, fidelityPhase: 0, fidelityPrevAge: 0 };
    for (let i = 0; i < 1200 && q.pos.y > 0; i++) f.advanceFidelityProjectile(q, 1 / 60);
    assert.ok(q.fidelityPhase > 0, 'break/free flight reached before landing');
    impact(f, system, q, { x: q.pos.x, y: 0, z: q.pos.z });
    seen.push(paints.at(-1)[3].stretchAmt);
    falls.push(startY);
  }
  assert.equal(seen[0], paint.DepthScaleMaxBreakFree - 1);
  assert.equal(seen[1], paint.DepthScaleMinBreakFree - 1);
  assert.notEqual(seen[0], seen[1]);
  // A mid-band fall interpolates strictly between the two endpoints.
  const mid = f.rollerBreakFreeDepthScale(
    { ghost: false, fidelityPhase: 2, start: { y: 5.75 }, fidelityRollerUnit: template.fidelityRollerUnit },
    { y: 0 });
  assert.ok(mid < paint.DepthScaleMaxBreakFree && mid > paint.DepthScaleMinBreakFree);
});

test('#713 full production: non-Roller and straight-flight Roller keep 0.7', async () => {
  const { f, G, THREE, system } = await rollerSystem();
  const paints = [];
  G.paint.splat = (...args) => { paints.push(args); return 0; };
  const shooter = f.make('shooter');
  shooter.aimDir.set(0, 0, 1); shooter.aimPoint.set(0, 1, 50);
  system.fireShooter(shooter, shooter.weapon);
  const shot = system.list[0];
  for (let i = 0; i < 600 && shot.pos.y > 0; i++) f.advanceFidelityProjectile(shot, 1 / 60);
  impact(f, system, shot, { x: shot.pos.x, y: 0, z: shot.pos.z });
  assert.equal(paints.at(-1)[3].stretchAmt, 0.7);
  const roller = f.make('roller');
  roller.aimDir.set(0, 0, 1); roller.aimPoint.set(0, 1, 50);
  system.fireFlick(roller, roller.weapon);
  const glob = system.list.at(-1);
  glob.fidelityPhase = 0;
  impact(f, system, glob, { x: 0, y: glob.start.y, z: 2 });
  assert.equal(paints.at(-1)[3].stretchAmt, 0.7);
  assert.ok(THREE);
});

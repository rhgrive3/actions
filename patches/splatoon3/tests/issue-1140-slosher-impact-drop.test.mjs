import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

// Real native Projectiles with the composed Slosher runtime; the paint stub
// records every G.paint.splat call made by the native _impact in order.
async function firedSlosher() {
  const f = await fixture({ productionComposition: true, realProjectiles: true, fullRuntime: true,
    extraExports: "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';" });
  const a = f.make('slosher');
  a.nid = 42; a.owner = 'local'; a.pos.set(0, 1, 0); a.aimPoint.set(0, 1, 10); a.aimDir.set(0, 0.1, 1).normalize();
  f.G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  f.G.physics = new f.Physics(f.G.level);
  // The native impact only reads the camera position for effect culling.
  if (!f.G.camera) f.G.camera = { position: new f.THREE.Vector3(0, 10, -10) };
  const ps = f.G.projectiles;
  ps.fireSlosh(a, a.weapon);
  const splats = [];
  f.G.paint.splat = (center, radius, team, opts) => { splats.push({ radius, stretchAmt: opts?.stretchAmt }); return 0; };
  const units = f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit.filter(u => u.BulletNum > 0);
  return { f, ps, splats, units };
}

function impactAt(f, ps, p, dy) {
  // The splash helper needs a victim/world fixture outside this paint contract.
  // It runs only after the impact stamp, which is what this test records.
  ps._sloshSplash = () => {};
  const { start } = p;
  const point = new f.THREE.Vector3(start.x + p.fidelitySloshUnit.PaintParam.DistanceXZNear, start.y + dy, start.z);
  ps._impact(p, { point, normal: new f.THREE.Vector3(0, 1, 0), block: 0 });
}

test('#1140 first Slosher impact stamp uses the sourced width at the configured world scale, not a legacy 0.2 override', async () => {
  const { f, ps, splats, units } = await firedSlosher();
  const p = ps.list[0];
  assert.equal(p.fidelitySloshUnit, units[0]);
  assert.equal(p.fidelitySloshIndex, 0);
  const src = p.fidelitySloshUnit.PaintParam;
  impactAt(f, ps, p, 0);
  assert.ok(splats.length > 0, 'the native impact paints through G.paint.splat');
  close(splats[0].radius, src.WidthHalfNear, 1e-9);
  close(splats[0].stretchAmt, src.DepthScaleNear, 1e-9);
});

test('#1140 high-drop Slosher impact stamp narrows by the sourced fall-distance scale on the live path', async () => {
  const { f, ps, splats, units } = await firedSlosher();
  const p = ps.list[0];
  const src = p.fidelitySloshUnit.PaintParam;
  assert.equal(p.fidelitySloshUnit, units[0]);
  const from = src.ScaleStartFallDistance, to = src.ScaleEndFallDistance, rate = src.WidthDepthScaleFall;
  assert.ok([from, to, rate].every(Number.isFinite) && to > from && rate > 0 && rate < 1, 'sourced fall-distance fields are present');
  const drop = (from + to) / 2;
  const expectedShrink = 1 - (1 - rate) * (drop - from) / (to - from);
  impactAt(f, ps, p, -drop);
  close(splats[0].radius, src.WidthHalfNear * expectedShrink, 1e-9);
  close(splats[0].stretchAmt, src.DepthScaleNear * expectedShrink, 1e-9);
});

test('#1140 high-drop shrink is a single live impact path and does not reach the foot-paint runtime', () => {
  const impact = fs.readFileSync(new URL('../runtime/weapons-fidelity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(impact, /paint\.splat=function\(center,radius,team,opts\)\{\s*if\(!first\)/,
    'the duplicate first-stamp G.paint.splat wrapper that discarded shrink and world scale is gone');
  const foot = fs.readFileSync(new URL('../runtime/slosher-nearest-paint.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(foot, /slosherDropScale|fidelitySlosherImpactPaint|fall/i,
    'dedicated NearestParam foot paint is exempt from the impact drop shrink');
});

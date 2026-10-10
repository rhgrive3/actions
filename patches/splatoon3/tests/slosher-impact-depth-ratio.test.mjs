import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

// DepthScale is dimensionless. The existing renderer applies 1 + stretchAmt
// forward and 1 + .25 * stretchAmt backward, so this verifies the adapter's
// unit conversion, not a claim that the asymmetric blob is Nintendo geometry.
for (const [unitIndex, bulletIndex, endpoint] of [[1, 0, 'Near'], [1, 1, 'Near'], [2, 0, 'Far']]) {
  test(`Slosher Unit[${unitIndex}] bullet ${bulletIndex} ${endpoint} converts depth ratio on the native CPU footprint`, async () => {
    const f = await fixture({ productionComposition: true, realProjectiles: true, fullRuntime: true });
    const { paint, V } = makePaintWorld(f);
    const owner = f.make('slosher');
    owner.nid = 42; owner.owner = 'local'; f.G.actors = [owner];
    const unit = f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[unitIndex];
    const source = bulletIndex === 0 ? unit.PaintParam : unit.AfterPaintParam;
    const scale = f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
    const p = f.G.projectiles._new();
    Object.assign(p, { owner, team: 0, type: 'slosh', wid: 'slosher', s3Weapon: owner.weapon,
      fidelitySloshUnit: unit, fidelitySloshIndex: bulletIndex, head: false, seed: .5 });
    p.start.set(0, 0, 0); p.pos.set(0, 0, source[`DistanceXZ${endpoint}`] * scale); p.vel.set(0, -1, 1);
    const center = p.pos.clone();
    f.G.projectiles._impact(p, { hit: true, point: center, normal: V(0, 1, 0), face: 0 });
    const actual = Array.from(paint.grid);
    assert.ok(paint.counts[0] > 0, 'native impact paints scoring cells');
    const expected = makePaintWorld(f).paint;
    expected.splat(center.clone().add(V(0, .14, 0)), source[`WidthHalf${endpoint}`] * scale, 0, {
      seed: .5, stretch: V(0, 0, 1), stretchAmt: source[`DepthScale${endpoint}`] - 1,
    });
    assert.deepEqual(actual, Array.from(expected.grid), 'source ratio reaches actual scoring footprint without adding a second base width');
  });
}

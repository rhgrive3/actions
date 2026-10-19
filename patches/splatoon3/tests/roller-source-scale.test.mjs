import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { realCharacter } from './real-character-fixture.mjs';
import { SOURCE_UNITS_PER_RANGE_LINE, WORLD_UNITS_PER_SOURCE_UNIT,
  WORLD_UNITS_PER_RANGE_LINE } from '../runtime/source-distance.mjs';

const reference = JSON.parse(fs.readFileSync(new URL('../reference/roller-source-scale-2026-10-19.json', import.meta.url)));
test('all five production Roller models use independently measured indexed source widths', async () => {
  const { Character } = await realCharacter();
  for (const rec of reference.records) {
    const ch = new Character({ weapon: rec.id });
    const d = ch.weapon.def;
    d.drum.computeBoundingBox();
    const b = d.drum.boundingBox;
    assert.ok(Math.abs(b.max.x-b.min.x-rec.width)<1e-5, rec.id+' source width');
    // Uniform scaling must carry both fold coordinate owners together.
    assert.ok(d.fold.pivot.distanceTo(d.parts.hinge.pivot)<1e-6, rec.id+' fold pivot');
    ch.dispose();
  }
});

test('range lines, paint endpoints and source model coordinates share one distance convention', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url)));
  assert.equal(SOURCE_UNITS_PER_RANGE_LINE, 5);
  assert.equal(WORLD_UNITS_PER_SOURCE_UNIT, profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit);
  assert.equal(WORLD_UNITS_PER_RANGE_LINE, 5);
  const p = profile.weaponsFidelityCompletion.weapons.roller.BodyParam.PaintParam;
  assert.ok(Math.abs(2*p.WidthHalfMax*WORLD_UNITS_PER_SOURCE_UNIT/WORLD_UNITS_PER_RANGE_LINE-1.12)<1e-12);
  // A line count is not a drum ratio: the two independently sourced lengths
  // differ even when expressed in the very same coordinate convention.
  assert.ok(Math.abs(2*p.WidthHalfMax/reference.records[0].width - 1.12)>1);
});

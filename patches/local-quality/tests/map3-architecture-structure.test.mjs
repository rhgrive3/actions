import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP3_STAGES } from '../../../inkwave-public/src/world/stages/map3-data.js';
import { MAP3_ARCHITECTURE } from '../../../inkwave-public/src/world/stages/map3-architecture.js';
import { createMap3Layout } from '../../../inkwave-public/src/world/stages/map3-layout.js';

const inside = (r, x, z) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[2], b[2]));

test('added ground replaces internal water, keeps real channels, and contains no duplicate coplanar floor', t => {
  for (const [id, architecture] of Object.entries(MAP3_ARCHITECTURE)) {
    const stage = MAP3_STAGES[id], base = [...stage.floors, ...stage.ramps];
    const additions = [...architecture.floors, ...architecture.ramps];
    const [x0, x1, z0, z1] = stage.bounds;
    let oldArea = 0, addedArea = 0;
    for (let x = x0 + .125; x < x1; x += .25) for (let z = z0 + .125; z < z1; z += .25) {
      const wasLand = base.some(f => inside(f.rect, x, z));
      if (wasLand) oldArea += .0625;
      else if (additions.some(f => inside(f.rect, x, z))) addedArea += .0625;
    }
    const boundsArea = (x1 - x0) * (z1 - z0), oldWater = boundsArea - oldArea;
    assert.ok(addedArea > (id === 'tidewater' ? 1200 : 550), `${id}: meaningful internal-water reduction`);
    assert.ok(oldWater - addedArea > 2000, `${id}: retains localized channels instead of one continuous base slab`);
    for (const [i, floor] of architecture.floors.entries()) {
      assert.ok(floor.rect[0] >= x0 && floor.rect[1] <= x1 && floor.rect[2] >= z0 && floor.rect[3] <= z1);
      for (const other of [...stage.floors, ...architecture.floors.slice(0, i)]) {
        if (floor.y === other.y) assert.equal(overlap(floor.rect, other.rect), 0,
          `${id}/${floor.id}/${other.id}: duplicate coplanar paint surface`);
      }
      // New ramps have their own clear footprints. A lower floor is not laid
      // underneath a short ramp merely to make the coverage number look larger.
      for (const ramp of architecture.ramps) assert.equal(overlap(floor.rect, ramp.rect), 0,
        `${id}/${floor.id}/${ramp.id}: hidden duplicate floor beneath new ramp`);
    }
    t.diagnostic(`${id}: projected land ${oldArea} -> ${oldArea + addedArea} WU²; internal-water footprint ${oldWater} -> ${oldWater - addedArea} WU² (not scoring/turf area).`);
  }
});

test('new collision is real, bounded, paintable and exactly balanced under a half turn', () => {
  for (const [id, a] of Object.entries(MAP3_ARCHITECTURE)) {
    const layout = createMap3Layout(id), stage = MAP3_STAGES[id];
    assert.equal(layout.map3, stage, 'the frozen source remains unchanged');
    assert.equal(layout.map3Playable.rules, stage.rules, 'ranked goals retain the original authored contract');
    for (const group of ['floors', 'ramps', 'walls']) for (const record of a[group].filter(r => r.id.startsWith('A_'))) {
      const other = a[group].find(r => r.id === record.id.replace(/^A_/, 'B_'));
      assert.ok(other, `${id}/${record.id}: mirrored counterpart`);
      assert.deepEqual(other.rect, [-record.rect[1], -record.rect[0], -record.rect[3], -record.rect[2]]);
      if (group === 'ramps') { assert.equal(other.y0, record.y1); assert.equal(other.y1, record.y0); }
      else if (group === 'walls') { assert.equal(other.y0, record.y0); assert.equal(other.y1, record.y1); }
      else { assert.equal(other.y, record.y); assert.equal(other.bottom, record.bottom); }
      for (const r of [record, other]) {
        const block = layout.single.find(b => b.tag === r.id);
        assert.ok(block && block.solid !== false && block.hidden !== true && block.paint !== false,
          `${id}/${r.id}: visible Level geometry must carry collision and ink`);
      }
    }
    assert.ok(a.walls.some(w => w.y1 - w.y0 >= 4), `${id}: actual tall walls, not only low cover`);
    assert.ok(a.walls.some(w => Math.max(w.rect[1] - w.rect[0], w.rect[3] - w.rect[2]) >= 12),
      `${id}: architecture has a continuous building silhouette`);
  }
});

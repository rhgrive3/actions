import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('expanded stages retain symmetric traversable flank and centre approaches', async () => {
  const f = await fixture({productionComposition:true, extraExports:`
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
    export { dressingFor } from './inkwave-public/src/world/dressing.js';
    export { PropKit } from './inkwave-public/src/world/props.js';
    export { NavGraph } from './inkwave-public/src/game/nav.js';
  `});
  // The removed expanded layouts used central heights 1.4/2.8 and lower
  // spawn pads. MAP3 probes select the real lower street and recovery ramp
  // before the upper approach, so a nearby node on another storey cannot pass.
  for (const [stage, width, points, spawn, flank] of [
    ['tidewater', 84, [[-25,0,-12],[-19,0,-21],[-16,4.8,-3]], [0,4.8,-68], [-32,2.4,-34]],
    ['kelpline', 88, [[-26,0,-26],[-38.5,0,-16],[-6,3.6,-4]], [0,6,-68], [-41,1.2,-38]],
  ]) {
    const kit = new f.PropKit(null, {headless:true});
    const art = f.map3ArtColliders(f.MAP_LAYOUTS[stage]);
    assert(art.length > 0, `${stage}: include actual cover and bridge colliders`);
    const cols = [...f.dressingFor(stage).flatMap(p => kit.add(p.type,p).colliders), ...art];
    const level = new f.Level(f.MAP_LAYOUTS[stage], cols), nav = new f.NavGraph(level, new f.Physics(level));
    assert.equal(level.bounds.maxX - level.bounds.minX, width);
    const lightmap = JSON.parse(fs.readFileSync(new URL(`../../../inkwave-public/assets/lightmaps/${stage}.json`, import.meta.url)));
    assert(level.layoutLightmap(lightmap.ppm, lightmap.size), `${stage}: lightmap atlas overflow`);
    assert.equal(level.layoutHash, lightmap.hash, `${stage}: stale lightmap`);
    const colliderHash = createHash('sha256').update(JSON.stringify(level.blocks.map(b => [b.center.toArray(), b.half.toArray(), b.axes.map(a => a.toArray()), b.solid, b.grate]))).digest('hex');
    assert.equal(colliderHash, lightmap.colliderHash, `${stage}: stale structural/cover occlusion`);
    assert.equal(art.length, lightmap.structuralColliders, `${stage}: AO omits an art collider`);
    for (const mirror of [1,-1]) {
      const ids=points.map(([x,y,z]) => {
        const p=new f.THREE.Vector3(x*mirror,y,z*mirror), id=nav.nearest(p,0.8);
        assert.notEqual(id,-1,`${stage}: no navigation node near ${p.toArray()}`);
        const n=nav.nodes[id];
        assert(Math.hypot(n.x-p.x,n.z-p.z)<2 && Math.abs(n.y-y)<0.9, `${stage}: incorrect support near ${p.toArray()} got ${[n.x,n.y,n.z]}`);
        return id;
      });
      assert(nav.path(ids[0],ids[1],0),`${stage}: flank cannot reach approach`);
      const nodeAt = ([x,y,z]) => nav.nearest(new f.THREE.Vector3(x*mirror,y,z*mirror),0.8);
      const home = nodeAt(spawn), outer = nodeAt(flank);
      assert.notEqual(home,-1,`${stage}: no spawn node`);
      assert.notEqual(outer,-1,`${stage}: no outer node`);
      assert(nav.path(home,outer,0,20000),`${stage}: spawn cannot reach outer route`);
      assert(nav.path(home,ids[2],0,20000),`${stage}: spawn cannot reach centre`);
      // Keep this path inside the new approach rather than accepting a detour around the arena.
      // MAP3's local low-to-high recovery ramps, bounded so the path cannot
      // escape via the distant spawn/cargo ramps instead.
      const corridor = stage === 'tidewater' ? {x0:-22,x1:-15,z0:-22.5,z1:-2} : {x0:-40,x1:-4,z0:-18,z1:-3};
      const local = edge => { const n=nav.nodes[edge.to], x=n.x*mirror, z=n.z*mirror;
        return x>=corridor.x0 && x<=corridor.x1 && z>=corridor.z0 && z<=corridor.z1; };
      assert(nav.path(ids[1],ids[2],0,6000,local),`${stage}: new approach cannot reach centre`);
      if (stage === 'kelpline') {
        const foot = nav.nearest(new f.THREE.Vector3(-40*mirror,0,-25*mirror),0.8);
        const sideCorridor = edge => { const n=nav.nodes[edge.to], x=n.x*mirror, z=n.z*mirror;
          return x>=-42 && x<=-36 && z>=-27 && z<=-12; };
        assert.notEqual(foot,-1,'service recovery court has no navigation support');
        assert(nav.path(foot,ids[1],0,6000,sideCorridor),'service recovery court does not connect locally to the boarding ramp');
      }
    }
    kit.dispose();
  }
});

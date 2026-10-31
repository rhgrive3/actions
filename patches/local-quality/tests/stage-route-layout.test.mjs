import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('expanded stages retain symmetric traversable flank and centre approaches', async () => {
  const f = await fixture({productionComposition:true, extraExports:`
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    export { dressingFor } from './inkwave-public/src/world/dressing.js';
    export { PropKit } from './inkwave-public/src/world/props.js';
    export { NavGraph } from './inkwave-public/src/game/nav.js';
  `});
  for (const [stage, width, points, spawn, flank] of [
    ['tidewater', 84, [[-27,0,-20],[-8,1.4,-3.5],[-3,2.8,-3.5]], [0,2.2,-67.2], [-38,0,-20]],
    ['kelpline', 88, [[-26,0,-1],[-10.5,2.4,-7.6],[-6,2.8,-5.5]], [0,3.2,-68], [-39,0,-1]],
  ]) {
    const kit = new f.PropKit(null, {headless:true});
    const cols = f.dressingFor(stage).flatMap(p => kit.add(p.type,p).colliders);
    const level = new f.Level(f.MAP_LAYOUTS[stage], cols), nav = new f.NavGraph(level, new f.Physics(level));
    assert.equal(level.bounds.maxX - level.bounds.minX, width);
    const lightmap = JSON.parse(fs.readFileSync(new URL(`../../../inkwave-public/assets/lightmaps/${stage}.json`, import.meta.url)));
    assert(level.layoutLightmap(lightmap.ppm, lightmap.size), `${stage}: lightmap atlas overflow`);
    assert.equal(level.layoutHash, lightmap.hash, `${stage}: stale lightmap`);
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
      const corridor = stage === 'tidewater' ? {x0:-11,x1:-2,z0:-5.5,z1:-1.5} : {x0:-15,x1:-5,z0:-9.5,z1:-5};
      const local = edge => { const n=nav.nodes[edge.to], x=n.x*mirror, z=n.z*mirror;
        return x>=corridor.x0 && x<=corridor.x1 && z>=corridor.z0 && z<=corridor.z1; };
      assert(nav.path(ids[1],ids[2],0,6000,local),`${stage}: new approach cannot reach centre`);
      if (stage === 'kelpline') {
        const foot = nav.nearest(new f.THREE.Vector3(-14.5*mirror,2,-9.5*mirror),0.8);
        const sideCorridor = edge => { const n=nav.nodes[edge.to], x=n.x*mirror, z=n.z*mirror;
          return x>=-16 && x<=-5 && z>=-11 && z<=-5; };
        assert.notEqual(foot,-1,'catwalk has no navigation support');
        assert(nav.path(foot,ids[1],0,6000,sideCorridor),'catwalk does not connect to the new ramp');
      }
    }
    kit.dispose();
  }
});

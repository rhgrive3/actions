import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Independent oracle: transformed displayed vertices, not the runtime contact
// proxy or its solver. Fixture starting poses are CPU diagnostics only.
function headDistance(f, a) {
  const point = new f.THREE.Vector3(); let min = Infinity;
  for (const part of [a.character.weapon.parts.head, a.character.weapon.parts.headInk]) part.traverse(o => {
    const positions = o.geometry?.attributes.position; if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld).sub(a.pos);
      // Exact collision height of this fixture, including the two ramp edges.
      // Extending the actor's standing plane past an edge hides penetration.
      point.add(a.pos);
      const floorY = point.z < 0 ? 1 : point.z < 4 ? 1-point.z/4 : 0;
      min = Math.min(min, point.y-floorY);
    }
  });
  return min;
}

test('all three flexed Brush heads follow actual ground vertices at slope entry and exit without draw-cadence lag', async () => {
  const f = await sourceLoadedActorFixture({random: () => .4});
  f.G.audio = {play(){}, playWeapon(){}, prepareWeapon(){}, loop(){return {set(){}, stop(){}};}};
  const run = async (id, batch) => {
    f.G.level = new f.Level({bounds: {minX:-100, maxX:100, minZ:-100, maxZ:100},
      spawnPads: [[-90,0,-90],[90,0,90]], spawnBarrier:0, half:[], single:[
        {kind:'box', min:[-100,-.5,-100], max:[100,0,100]},
        {kind:'box', min:[-20,0,-20], max:[20,1,0]},
        {kind:'ramp', high:[0,1,0], low:[0,0,4], width:20, thickness:.6},
      ]});
    f.G.physics = new f.Physics(f.G.level); f.G.time = 0;
    const a = await f.make(); a.setWeapon(id);
    a.pos.set(0,1,-3); a.character.root.position.copy(a.pos);
    a.intent.fire = true;
    const rows = [], authority = [];
    try {
      for (let tick = 0; tick < 230; tick++) {
        if (tick === 120) a.intent.move.set(0,0,1);
        f.G.time += 1/60; a.update(1/60);
        authority.push({position:a.pos.toArray(), velocity:a.vel.toArray(), ink:a.ink,
          rolling:a.weaponRunner.rolling, cooldown:a.weaponRunner.cooldown, shots:f.G.projectiles.list.length});
        if (tick % batch !== batch-1) continue;
        a.character.root.updateMatrixWorld(true); a.character.skeleton.update();
        if (tick < 89) continue;
        assert.equal(a.grounded, true); assert.equal(a.weaponRunner.rolling, true);
        assert.equal(a.character.sourceMotion.active, true);
        const distance = headDistance(f,a), target = .015;
        rows.push({tick, z:a.pos.z, normalY:a.groundN.y, distance, error:distance-target});
        assert.ok(distance >= 0 && distance < .03,
          `${id}, ${batch} ticks/draw, tick ${tick}: actual surface clearance ${distance}`);
      }
      assert.ok(rows.some(r=>r.z<0), 'holding on the upper floor is measured');
      assert.ok(rows.some(r=>r.normalY<.999), 'real ramp entry is measured');
      assert.ok(rows.some(r=>r.z>6&&r.normalY===1), 'return to the lower floor is measured');
      return {rows, authority};
    } finally { f.reset(); }
  };
  for (const id of ['s3-brush-mini','s3-brush-normal','s3-brush-heavy']) {
    const single = await run(id,1), batched = await run(id,15);
    assert.deepEqual(batched.authority,single.authority,
      'weapon contact presentation must not change movement, ink or shot admission');
    console.log('BRUSH_HEAD_CONTACT',JSON.stringify({id,
      singleMaxError:Math.max(...single.rows.map(r=>Math.abs(r.error))),
      batchedMaxError:Math.max(...batched.rows.map(r=>Math.abs(r.error))),
      singleMin:Math.min(...single.rows.map(r=>r.distance)),
      singleMax:Math.max(...single.rows.map(r=>r.distance)),
    }));
  }
});

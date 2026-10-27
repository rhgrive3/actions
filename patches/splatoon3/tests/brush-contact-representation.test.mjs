import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

// CPU geometry diagnostics with the real source bank and ordinary weapon LOD.
// Body tier is held constant to isolate the independent weapon representation.
function displayedClearance(f, a) {
  const w = a.character.weapon, point = new f.THREE.Vector3();
  const parts = w.near ? [w.parts.head, w.parts.headInk] : [w.bodyFar, w.inkFar];
  let min = Infinity;
  for (const part of parts) {
    assert.equal(part.visible, true, 'measure the displayed representation');
    part.traverse(o => {
      const positions = o.geometry?.attributes.position;
      if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        min = Math.min(min, point.y - a.pos.y);
      }
    });
  }
  return min;
}

test('held Brush contact follows near/far transitions for every Brush head', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4 }), { G, THREE } = f;
  G.audio = { play(){}, playWeapon(){}, prepareWeapon(){}, loop(){ return { set(){}, stop(){} }; } };
  G.camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
  const follow = new THREE.Vector3(0, 4, -3), far = new THREE.Vector3(100, 4, 0);
  for (const id of ['s3-brush-mini', 's3-brush-normal', 's3-brush-heavy']) {
    const a = new f.Actor({ team:0, name:'Brush representation contact', isLocal:false,
      weapon:id, CharacterClass:f.Character, style:{hair:0, skin:2, outfit:0, eyes:0} });
    a.nid = 601; a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.character.setLod('hero'); a.pos.set(0,0,0);
    a.grounded = a.ground.hit = true; a.ground.block = 0; a.groundN.set(0,1,0);
    a.aimDir.set(0,0,1); a.aimPoint.set(0,1,20);
    await a.character._sourceMotionLoader; await a.character.sourceMotion.ready;
    a.intent.fire = true; a.intent.move.set(0,0,1);
    const rows = [];
    try {
      for (let i = 0; i < 180; i++) { G.camera.position.copy(a.pos).add(follow); f.tick(a); }
      assert.ok(a.character.weapon.brushBend > .15, 'start with a flexed near head');
      for (const near of [false, true, false, true]) {
        for (let tick = 1; tick <= 12; tick++) {
          G.camera.position.copy(near ? a.pos : far);
          if (near) G.camera.position.add(follow);
          f.tick(a);
          assert.equal(a.character.weapon.near, near);
          assert.equal(a.grounded, true); assert.equal(a.weaponRunner.rolling, true);
          assert.equal(a.character.sourceMotion.status, 'ready');
          const clearance = displayedClearance(f, a);
          rows.push({ near, tick, clearance });
          assert.ok(clearance >= 0 && clearance < .03,
            `${id}, near=${near}, tick ${tick}: displayed clearance ${clearance}`);
        }
      }
      console.log('BRUSH_REPRESENTATION_CONTACT', JSON.stringify({ id, rows }));
    } finally { f.reset(); }
  }
});

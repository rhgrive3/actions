import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { createClamBasketModel, CLAM_BASKET } from '../runtime/ranked/clam-basket-model.mjs';

test('Clam goal is a raised netted basket inside the scoring volume and barrier', () => {
  const m = createClamBasketModel(THREE, 0xff8800);
  const box = new THREE.Box3().setFromObject(m.group);
  assert.ok(box.max.y > 1.5 && box.max.y < 0.55 + 1.55, 'rim raised but inside the goal volume');
  assert.ok(Math.max(box.max.x, box.max.z) <= 1.0, 'within the 1.3 barrier shell footprint');
  assert.equal(m.hoop.position.y, CLAM_BASKET.rimY, 'team-coloured rim is the raised basket lip');
  assert.ok(m.net.material.wireframe);
  m.update({ tucked: true }, 1);
  assert.ok(m.group.userData.basketDrop > .5, 'tucked basket lowers into its pedestal');
  m.update({}, 1); assert.ok(m.group.userData.basketDrop < .01);
});

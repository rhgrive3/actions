import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { SpecialVfxKit } from '../runtime/special-vfx-kit.mjs';

// The rendering probe exercises the actual WebGL programs. This inexpensive
// topology guard also checks every triangle between captures: a cylinder face
// may interpolate only its own angular span, never atan's almost-full-turn jump.
test('all production beam and band triangles interpolate one continuous angular span', () => {
  const kit = new SpecialVfxKit(THREE, new THREE.Scene());
  try {
    for (const name of ['beams', 'inkBeams', 'bands', 'inkBands']) {
      const { geometry, material } = kit[name].mesh;
      const expression = material.vertexShader.match(/vUv = vec2\(([^;\n]+), k\);/)?.[1];
      assert.ok(expression, name + ': production circumferential UV expression');
      const angularUv = new Function('uv', 'position', 'atan', 'return ' + expression);
      const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      const values = new Float64Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const position = { x: p.getX(i), y: p.getY(i), z: p.getZ(i) };
        const u = values[i] = angularUv({ x: uv.getX(i), y: uv.getY(i) }, position, Math.atan2);
        assert.ok(Number.isFinite(u), name + ': finite vertex UV');
        const authored = Math.atan2(position.z, position.x) / (2 * Math.PI) + .5;
        const distance = u - authored;
        assert.ok(Math.abs(distance - Math.round(distance)) < 1e-6, name + ': preserve original angular phase');
      }
      const index = geometry.index.array;
      for (let i = 0; i < index.length; i += 3) {
        const ids = [index[i], index[i + 1], index[i + 2]];
        const us = ids.map(j => values[j]), input = ids.map(j => uv.getX(j));
        assert.ok(Math.max(...us) - Math.min(...us) <= Math.max(...input) - Math.min(...input) + 1e-6,
          `${name}: triangle ${i / 3} cannot compress a whole circumferential pattern`);
      }
      assert.match(material.fragmentShader, /float u = fract\(vUv\.x\)/, name + ': wrap only after interpolation');
    }
  } finally { kit.dispose(); }
});

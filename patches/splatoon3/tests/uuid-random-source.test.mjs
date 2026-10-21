// Three.js object UUIDs are identity keys only; creating render objects must
// not advance the gameplay Math.random stream (runtime/clock.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const source = adaptBuildSource('vendor/three/build/three.core.js', fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.core.js', import.meta.url), 'utf8'));
const start = source.indexOf('const _uuidWords'), body = source.slice(start, source.indexOf('\n}\n', source.indexOf('function generateUUID', start)) + 3);
const lut = source.slice(source.indexOf('const _lut = '), source.indexOf(';', source.indexOf('const _lut = ')) + 1);

test('composed generateUUID keeps the v4 format without drawing Math.random', () => {
  assert.ok(start > 0 && body.includes('function generateUUID'), 'patched generator present');
  const generateUUID = new Function(lut + '\n' + body + '\nreturn generateUUID;')();
  const original = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return original(); };
  try {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) {
      const id = generateUUID();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      ids.add(id);
    }
    assert.equal(ids.size, 2000);
  } finally { Math.random = original; }
  assert.equal(draws, 0, 'no gameplay random draws');
});

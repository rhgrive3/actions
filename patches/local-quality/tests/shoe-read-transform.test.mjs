import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadNative } from './prop-retention-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const { THREE, G, SRC } = await loadNative(true);
const K = await import(pathToFileURL(SRC + 'src/game/character-geo.js'));
const { CS, MC, PART } = await import(pathToFileURL(SRC + 'src/game/character-mats.js'));
const geo = adaptBuildSource('src/game/character-geo.js', fs.readFileSync(SRC + 'src/game/character-geo.js', 'utf8'));
const builderStart = geo.indexOf('class BuilderAttribute {');
const builderClass = geo.indexOf('class Builder {');
const builderEnd = geo.indexOf('\n}\n\n', builderClass);
assert.ok(builderStart >= 0 && builderClass > builderStart && builderEnd > builderClass, 'extract the real Builder and its module-local typed attribute dependency');
const builderSource = geo.slice(builderStart, builderEnd + 2);
const Builder = new Function('THREE', 'V3', 'BONE_INDEX', 'const _c = new THREE.Color();\n' + builderSource + '\nreturn Builder;')(THREE, THREE.Vector3, K.BONE_INDEX);
const source = fs.readFileSync(SRC + 'src/game/character-outfit.js', 'utf8');
const fixture = fs.readFileSync(new URL('./fixtures/shoe-add-before-read-transform.js.txt', import.meta.url), 'utf8');
function outfit(legacy) {
  let code = source;
  if (legacy) {
    const start = code.indexOf('function addShoes(B, lv) {'), end = code.indexOf('\n// ---', start);
    code = code.slice(0, start) + fixture + code.slice(end);
  }
  return new Function('THREE', 'CS', 'MC', 'PART', 'K', 'G', code.replace(/^import .*;$/gm, '').replaceAll('export ', '') + '\nreturn {shoeParts,addShoes};')(THREE, CS, MC, PART, K, G);
}
const snapshot = g => Object.fromEntries([...Object.entries(g.attributes).map(([name, attr]) =>
  [name, Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength).toString('hex')]),
['index', Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength).toString('hex')]]);

test('all five shoe detail levels preserve every geometry byte and immutable source while removing 2P clones', t => {
  const baseline = outfit(true), candidate = outfit(false), counts = [];
  for (let level = 0; level <= 4; level++) {
    const parts = [baseline.shoeParts(level), candidate.shoeParts(level)];
    assert.equal(parts[0].length, parts[1].length);
    const before = parts.map(list => list.map(pt => snapshot(pt.geo))), clones = [0, 0];
    parts.forEach((list, k) => list.forEach(pt => {
      const clone = pt.geo.clone;
      pt.geo.clone = function (...args) { clones[k]++; return clone.apply(this, args); };
    }));
    const builders = [new Builder(), new Builder()];
    baseline.addShoes(builders[0], level); candidate.addShoes(builders[1], level);
    const outputs = builders.map(b => b.build('aCloth', 'aClothPart'));
    for (const output of outputs) {
      assert.ok(output instanceof THREE.BufferGeometry);
      for (const attr of [...Object.values(output.attributes), output.index]) {
        assert.ok(attr instanceof THREE.BufferAttribute, 'builder outputs retain genuine native THREE attributes');
        assert.equal(attr.count, attr.array.length / attr.itemSize);
      }
    }
    assert.deepEqual(snapshot(outputs[1]), snapshot(outputs[0]), 'positions, normals, UV, colors, callbacks, skin weights and winding: level ' + level);
    assert.deepEqual(parts.map(list => list.map(pt => snapshot(pt.geo))), before, 'shared templates stay byte immutable');
    assert.equal(clones[0], 2 * parts[0].length); assert.equal(clones[1], 0);
    counts.push({ level, parts: parts[0].length, before: clones[0], after: clones[1], vertices: outputs[0].attributes.position.count });
    outputs.forEach(g => g.dispose());
  }
  t.diagnostic(JSON.stringify(counts));
});

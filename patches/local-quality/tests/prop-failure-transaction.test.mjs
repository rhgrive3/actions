import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadNative } from './prop-retention-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const { THREE, PropKit } = await loadNative(true);
const placements = [{ type: 'bench', pos: [0, 0, 0] }, { type: 'bench', pos: [4, 0, 0] }];
// Run the actual production transaction before Level construction. The full
// async world ownership/cancellation path has its own reliability suite.
const source = adaptBuildSource('src/main.js', fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8'));
const start = source.indexOf('    const colliders = [];');
const end = source.indexOf('    let level, lightmap;', start);
assert.ok(start >= 0 && end > start);
const prepare = new Function('scene', 'dressingFor', 'layoutId', source.slice(start, end) + '\nreturn { props, colliders };');
function transaction(K) { return prepare.call({ PropKit: K, settings: { quality: 'high' } }, new THREE.Scene(), () => placements, 'test'); }

test('constructor failure at each real canvas draw rolls back already owned textures and never publishes a group', async () => {
  const create = document.createElement;
  const dispatch = THREE.Texture.prototype.dispatchEvent;
  const log = [];
  THREE.Texture.prototype.dispatchEvent = function (event) { if (event.type === 'dispose') log.push(this); return dispatch.call(this, event); };
  try {
    for (const failedCanvas of [1, 2, 3]) {
      let canvases = 0;
      document.createElement = function (tag) {
        const canvas = create.call(this, tag);
        if (tag === 'canvas' && ++canvases === failedCanvas) {
          const get = canvas.getContext;
          canvas.getContext = function (...args) {
            const context = get.apply(this, args);
            // An actual operation used by each atlas/chain/blob drawing path.
            return new Proxy(context, { get(target, key) {
              if (['fillRect', 'clearRect', 'createRadialGradient'].includes(key)) return () => { throw Error('canvas fault'); };
              return target[key];
            } });
          };
        }
        return canvas;
      };
      const scene = new THREE.Scene(), before = log.length;
      assert.throws(() => new PropKit(scene), /canvas fault/);
      assert.equal(scene.children.length, 0);
      assert.equal(log.length - before, failedCanvas === 1 ? 1 : failedCanvas - 1);
      await Promise.resolve(); // the font-ready redraw must not revive disposed work
      assert.equal(log.length - before, failedCanvas === 1 ? 1 : failedCanvas - 1);
    }
  } finally { document.createElement = create; THREE.Texture.prototype.dispatchEvent = dispatch; }
});

test('partially initialized material ownership and idempotent disposal survive constructor failure', () => {
  const owned = [], scene = new THREE.Scene();
  class Failed extends PropKit {
    _makeMaterials() {
      super._makeMaterials();
      for (const resource of [this.atlas, this.chain, this.blobTex, ...Object.values(this.mat)]) {
        const count = { resource, n: 0 }; resource.addEventListener('dispose', () => count.n++); owned.push(count);
      }
      throw Error('after materials');
    }
  }
  assert.throws(() => new Failed(scene), /after materials/);
  assert.equal(scene.children.length, 0);
  assert.equal(owned.length, 15);
  assert.ok(owned.every(row => row.n === 1));
  const normal = new PropKit(scene); let released = 0;
  normal.atlas.addEventListener('dispose', () => released++);
  normal.dispose(); normal.dispose(); assert.equal(released, 1); assert.equal(scene.children.length, 0);
});

test('composed add/build failures discard all partial props and colliders; success preserves ordering', () => {
  const errors = [], oldError = console.error; console.error = (...args) => errors.push(args);
  const candidates = [];
  try {
    for (const failure of ['add', 'build']) {
      class Failed extends PropKit {
        constructor(...args) { super(...args); candidates.push(this); }
        add(...args) { if (failure === 'add' && this.count === 1) throw Error('add fault'); return super.add(...args); }
        build() { super.build(); if (failure === 'build') throw Error('build fault'); return this; }
      }
      const result = transaction(Failed), candidate = candidates.at(-1);
      assert.equal(result.props, null); assert.deepEqual(result.colliders, []);
      assert.equal(candidate._disposed, true); assert.equal(candidate.group.parent, null);
      assert.equal(candidate.group.children.length, 0); assert.equal(candidate._meshes.length, 0);
      assert.equal(candidate._propAtlasRedraw, null);
    }
    const result = transaction(PropKit), expected = new PropKit(null);
    const colliders = placements.flatMap(it => expected.add(it.type, it).colliders); expected.build();
    assert.deepEqual(result.colliders, colliders); assert.ok(colliders.length > 0);
    assert.deepEqual(result.props.stats(), expected.stats());
    assert.equal(result.props.group.parent, null, 'reliability layer commits the detached group only after lightmap');
    result.props.dispose(); expected.dispose();
    assert.equal(errors.length, 2);
  } finally { console.error = oldError; }
});

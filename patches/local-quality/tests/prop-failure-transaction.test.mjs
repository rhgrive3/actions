import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadNative } from './prop-retention-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const { THREE, PropKit } = await loadNative(true);
const placements = [{ type: 'bench', pos: [0, 0, 0] }, { type: 'bench', pos: [4, 0, 0] }];
// Run the actual async production transaction through its pre-Level cancellation
// guard. Full world commit/lightmap ownership has its own reliability suite.
const source = adaptBuildSource('src/main.js', fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8'));
const start = source.indexOf('    const colliders = [];');
const end = source.indexOf('    let level, lightmap, physics, nav, pendingLightmap;', start);
assert.ok(start >= 0 && end > start, 'composed async prop transaction anchors');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const prepare = new AsyncFunction('scene', 'dressingFor', 'layoutId', 'worldCurrent', source.slice(start, end) + '\nreturn { props, colliders };');
function transaction(K, { current = () => true, scene = new THREE.Scene(), owner = {} } = {}) {
  return prepare.call(Object.assign(owner, { PropKit: K, settings: { quality: 'high' } }), scene, () => placements, 'test', current);
}

// Watch only resources owned by this kit (not shared template geometries).
function watchOwned(kit) {
  const counts = new Map();
  const watch = resource => {
    if (!resource || counts.has(resource)) return;
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  };
  for (const resource of [kit.atlas, kit.chain, kit.blobTex, ...Object.values(kit.mat)]) watch(resource);
  return { counts, meshes() { for (const mesh of kit._meshes) watch(mesh.geometry); } };
}
async function assertReleased(candidate, ownership) {
  assert.equal(candidate._disposed, true); assert.equal(candidate.group.parent, null);
  assert.equal(candidate.group.children.length, 0); assert.equal(candidate._meshes.length, 0);
  assert.equal(candidate._inst.length, 0); assert.equal(candidate._buckets.size, 0);
  assert.equal(candidate._placements.length, 0); assert.equal(candidate._propAtlasRedraw, null);
  assert.ok(ownership.counts.size >= 15, 'real kit textures and materials are owned');
  candidate.dispose();
  await Promise.resolve(); // neither repeated disposal nor font-ready redraw revives work
  assert.ok([...ownership.counts.values()].every(n => n === 1), 'each owned resource disposed exactly once');
}

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

test('composed async add/build failures discard owned resources and all partial colliders', async () => {
  const errors = [], oldError = console.error; console.error = (...args) => errors.push(args);
  try {
    for (const failure of ['add', 'build']) {
      let candidate, ownership;
      const calls = [], scene = new THREE.Scene(), previous = {}, owner = { props: previous };
      class Failed extends PropKit {
        constructor(...args) { super(...args); candidate = this; ownership = watchOwned(this); }
        add(...args) { if (failure === 'add' && this.count === 1) throw Error('add fault'); return super.add(...args); }
        async addAll(...args) { calls.push('addAll'); return super.addAll(...args); }
        async buildAsync(...args) {
          calls.push('buildAsync'); await super.buildAsync(...args); ownership.meshes();
          if (failure === 'build') throw Error('build fault');
          return this;
        }
      }
      const result = await transaction(Failed, { scene, owner });
      assert.equal(result.props, null); assert.deepEqual(result.colliders, []);
      assert.deepEqual(calls, failure === 'add' ? ['addAll'] : ['addAll', 'buildAsync']);
      assert.equal(owner.props, previous, 'detached preparation never replaces the live kit');
      assert.equal(scene.children.length, 0);
      if (failure === 'build') assert.ok(ownership.counts.size > 15, 'real merged geometries were built before failure');
      await assertReleased(candidate, ownership);
    }
    assert.equal(errors.length, 2);
    assert.match(String(errors[0][1]), /add fault/); assert.match(String(errors[1][1]), /build fault/);
  } finally { console.error = oldError; }
});

test('composed async success and synchronous compatibility preserve collider ordering and detached ownership', async () => {
  class Synchronous extends PropKit {}
  Synchronous.prototype.addAll = null; Synchronous.prototype.buildAsync = null;
  for (const K of [PropKit, Synchronous]) {
    const scene = new THREE.Scene(), previous = {}, owner = { props: previous };
    let result, expected;
    try {
      result = await transaction(K, { scene, owner }); expected = new PropKit(null);
      const colliders = placements.flatMap(it => expected.add(it.type, it).colliders); expected.build();
      assert.deepEqual(result.colliders, colliders); assert.ok(colliders.length > 0);
      assert.deepEqual(result.props.stats(), expected.stats());
      assert.equal(result.props._disposed, undefined);
      assert.equal(result.props.group.parent, null, 'reliability layer commits the detached group only after lightmap');
      assert.equal(scene.children.length, 0); assert.equal(owner.props, previous);
    } finally { result?.props?.dispose(); expected?.dispose(); }
  }
});

test('composed async cancellation during add, during build and after build releases detached ownership', async () => {
  const errors = [], oldError = console.error; console.error = (...args) => errors.push(args);
  try {
    for (const phase of ['add', 'build', 'after-build']) {
      let current = true, candidate, ownership, additions = 0, builtMeshes = 0;
      const scene = new THREE.Scene(), previous = {}, owner = { props: previous };
      class Cancelled extends PropKit {
        constructor(...args) { super(...args); candidate = this; ownership = watchOwned(this); }
        add(...args) {
          const result = super.add(...args); additions++;
          if (phase === 'add') current = false;
          return result;
        }
        *_buildSteps() {
          for (const step of super._buildSteps()) {
            ownership.meshes(); builtMeshes = this._meshes.length;
            if (phase === 'build' && builtMeshes) current = false;
            yield step;
          }
        }
        async buildAsync(...args) {
          await super.buildAsync(...args);
          if (phase === 'after-build') current = false;
          return this;
        }
      }
      const result = await transaction(Cancelled, { current: () => current, scene, owner });
      assert.equal(result, undefined, 'obsolete preparation exits before Level construction');
      assert.equal(additions, phase === 'add' ? 1 : placements.length);
      assert.equal(scene.children.length, 0); assert.equal(owner.props, previous);
      if (phase !== 'add') {
        assert.ok(builtMeshes > 0, 'cancellation follows allocation of real merged geometry');
        assert.ok(ownership.counts.size > 15);
      }
      await assertReleased(candidate, ownership);
    }
    assert.equal(errors.length, 2, 'only in-flight scheduler aborts enter the transaction catch');
    assert.ok(errors.every(args => args[1]?.name === 'AbortError'));
  } finally { console.error = oldError; }
});

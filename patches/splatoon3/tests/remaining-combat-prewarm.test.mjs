import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { createCharacterShadowBatch } from '../../local-quality/character-shadow-batch.mjs';

// Real composed Character/FX/materials; the renderer records compile inputs.
// This verifies shader variants and lifecycle, not device GPU latency or FPS.
const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true,
  extraExports: "export { FX } from './src/fx/fx.js'; export { flowMotionSnapshot } from './patches/splatoon3/runtime/flow-motion.mjs';" });
const { G, THREE } = f;

function rig() {
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(); G.settings = { quality: 'high' };
  G.post = { composer: { readBuffer: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) } };
  G.fx = new f.FX(G.scene);
  const a = new f.Actor({ team: 0, name: 'remaining shader warm', weapon: 'shooter', CharacterClass: f.Character });
  const ch = a.character; ch.actor = a; ch.onEvent = null; G.actors = [a]; G.scene.add(ch.root);
  const previous = new THREE.WebGLRenderTarget(8, 8), calls = [];
  let current = previous, face = 3, mip = 2;
  const renderer = { calls, shadowMap: { enabled: false }, info: { render: { frame: 17 } },
    getRenderTarget: () => current, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(target, nextFace = 0, nextMip = 0) { current = target; face = nextFace; mip = nextMip; },
    compileAsync(object, camera, target) {
      const meshes = []; object.traverse(o => { if (o.isMesh) meshes.push(o); });
      calls.push({ object, meshes, camera, target, renderTarget: current });
      return Promise.resolve();
    } };
  const activate = on => {
    a.specialActive = on ? { id: 'zipcaster', phase: 'active' } : null;
    a._s3AllSpecialState = on ? { id: 'zipcaster', phase: 'active', t: 0 } : null;
    ch.update(0, { form: 'kid', hp: 100, grounded: true });
  };
  return { a, ch, renderer, previous, activate, close() {
    ch.dispose(); G.fx.dispose(); G.fx = null; G.actors = [];
    G.post.composer.readBuffer.dispose(); previous.dispose();
  } };
}

test('warmAll compiles real Flow, skinned Zipcaster and pooled film variants against match HDR', async () => {
  const r = rig(), { ch, renderer } = r;
  try {
    const visibility = new Map(); ch.root.traverse(o => visibility.set(o, o.visible));
    await ch.warmAll(renderer, G.camera, G.scene);
    const character = renderer.calls.find(c => c.object === ch.root);
    assert(character, 'native Character compile remains the owner');
    assert.equal(character.renderTarget, G.post.composer.readBuffer);
    const glints = character.meshes.find(o => o.name === 's3-flow-glints');
    assert(glints?.isInstancedMesh && glints.geometry.attributes.aFlowAlpha, 'actual instanced Flow shader inputs');
    const skin = character.meshes.filter(o => o.name.startsWith('s3-flow-edge:'));
    assert(skin.length > 0 && skin.every(o => o.isSkinnedMesh && o.skeleton === ch.skeleton));
    assert(character.meshes.some(o => o.name === 's3-flow-squid-edge'), 'squid deformation variant is present');
    const coat = character.meshes.find(o => o.parent?.name === 'zipcaster-ink-coat')?.parent;
    assert(coat && coat.children.every(o => o.isSkinnedMesh && o.skeleton === ch.skeleton));
    assert.equal(coat.parent, null, 'inactive coat is retained outside the scene');
    assert.equal(coat.visible, false);
    for (const [object, visible] of visibility) assert.equal(object.visible, visible, object.name + ' visibility restored');
    const flow = f.flowMotionSnapshot(ch);
    assert.equal(flow.phase, 'off'); assert.equal(flow.level, 0); assert.equal(flow.activationCount, 0);
    assert.equal(flow.visible, false); assert.equal(r.a.specialActive, null);

    const film = renderer.calls.find(c => c.object.name === 'InkSwimFilm');
    assert(film && film.object.geometry.attributes.filmData && film.object.material.isMeshPhysicalMaterial);
    assert.equal(film.renderTarget, G.post.composer.readBuffer);
    assert.equal(film.object, G.fx.swimSurface.slots[0].mesh);
    assert.equal(film.object.visible, false); assert.equal(G.fx.swimSurface.slots[0].actor, null);
    G.fx.wake(r.a.pos, r.a.vel, r.a.color, 8, r.a.groundN, r.a);
    assert.equal(G.fx.swimSurface.slots.length, 1, 'first live touch reuses the compiled pool slot');
    assert.equal(G.fx.swimSurface.slots[0].mesh, film.object);
    assert.equal(renderer.getRenderTarget(), r.previous);
  } finally { r.close(); }
});

test('Zipcaster reuses its warmed skinned coat across activations and releases it with the Character', async () => {
  const r = rig();
  let disposed = 0;
  try {
    await r.ch.warmAll(r.renderer, G.camera, G.scene);
    const coat = r.renderer.calls.find(c => c.object === r.ch.root).meshes.find(o => o.parent?.name === 'zipcaster-ink-coat').parent;
    const material = coat.children[0].material;
    const geometries = new Set(coat.children.map(o => o.geometry));
    const borrowedDisposals = new Map([...geometries].map(g => [g, 0]));
    for (const geometry of geometries) geometry.addEventListener('dispose', () => borrowedDisposals.set(geometry, borrowedDisposals.get(geometry) + 1));
    material.addEventListener('dispose', () => {
      disposed++;
      assert([...borrowedDisposals.values()].every(n => n === 0), 'coat retirement leaves borrowed native geometry intact');
    });
    for (let i = 0; i < 2; i++) {
      r.activate(true);
      assert.equal(r.ch.kid.getObjectByName('zipcaster-ink-coat'), coat);
      assert.equal(coat.children[0].material, material); assert.equal(coat.visible, true);
      r.activate(false);
      assert.equal(coat.parent, null); assert.equal(coat.visible, false); assert.equal(disposed, 0);
    }
    r.ch.dispose();
    assert.equal(disposed, 1);
    assert([...borrowedDisposals.values()].every(n => n <= 1), 'native geometry is released only by its original owner');
    assert.equal(await r.ch.warmAll(r.renderer, G.camera, G.scene), false, 'disposed characters cannot allocate warm resources');
  } finally { r.close(); }
});

test('film warmup restores cube/mip target state on failure and retries using the same live pool', async () => {
  const r = rig();
  try {
    const original = r.renderer.compileAsync;
    r.renderer.compileAsync = () => { throw new Error('test compile failure'); };
    assert.throws(() => G.fx.warmSwimSurface(r.renderer, G.camera, G.scene), /test compile failure/);
    assert.equal(r.renderer.getRenderTarget(), r.previous);
    assert.equal(r.renderer.getActiveCubeFace(), 3); assert.equal(r.renderer.getActiveMipmapLevel(), 2);
    const mesh = G.fx.swimSurface.slots[0].mesh;
    assert.equal(mesh.visible, false); assert.equal(G.fx.swimSurface.slots[0].actor, null);
    r.renderer.compileAsync = original;
    await G.fx.warmSwimSurface(r.renderer, G.camera, G.scene);
    assert.equal(r.renderer.calls[0].object, mesh);
    let geometryDisposed = 0, materialDisposed = 0;
    mesh.geometry.addEventListener('dispose', () => geometryDisposed++);
    mesh.material.addEventListener('dispose', () => materialDisposed++);
    G.fx.dispose();
    assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1);
    assert.equal(G.fx.swimSurface, null);
  } finally { r.close(); }
});

test('one film compile is shared by actor renderer facades until match reset or context restore', async () => {
  const r = rig(), listeners = new Map();
  const canvas = {
    addEventListener(event, fn) { listeners.set(event, fn); },
    removeEventListener(event, fn) { if (listeners.get(event) === fn) listeners.delete(event); },
  };
  const gl = { canvas }; r.renderer.getContext = () => gl;
  try {
    const batch = createCharacterShadowBatch(r.renderer, () => new THREE.Group());
    const first = batch.rendererFor(r.ch), second = batch.rendererFor({});
    assert.notEqual(first, second);
    let resolve, compiles = 0;
    r.renderer.compileAsync = () => { compiles++; return new Promise(r => { resolve = r; }); };
    const a = G.fx.warmSwimSurface(first, G.camera, G.scene);
    assert.equal(G.fx.warmSwimSurface(second, G.camera, G.scene), a, 'pending context work is shared');
    assert.equal(compiles, 1); resolve(); await a;
    assert.equal(G.fx.warmSwimSurface(second, G.camera, G.scene), a, 'settled program is retained by the live pool');
    assert.equal(compiles, 1);
    listeners.get('webglcontextrestored')();
    const b = G.fx.warmSwimSurface(second, G.camera, G.scene);
    assert.notEqual(b, a); assert.equal(compiles, 2); resolve(); await b;
    G.fx.clear();
    const c = G.fx.warmSwimSurface(first, G.camera, G.scene);
    assert.notEqual(c, b); assert.equal(compiles, 3); resolve(); await c;
    G.fx.dispose(); assert.equal(listeners.size, 0, 'FX disposal releases context listeners');
  } finally { r.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const sourceOnly = !process.env.INKWAVE_BUILT_SITE;
const sourceSkip = sourceOnly ? false : 'Source-only lowerFill export injection is unavailable for emitted builds; the unmodified production integration test below still runs.';
const modelExports = `export { VARIANT_MODELS } from './patches/splatoon3/runtime/weapon-models/variants-melee.mjs';`;
// Only these unit/regression tests expose the actual private helper. This
// adaptation appends an export; it does not rewrite lowerFill or its callers.
const source = sourceOnly ? await fixture({
  adaptRuntime: (p, s) => p.endsWith('/weapon-detail-motion.mjs') ? s + '\nexport { lowerFill as testLowerFill };' : s,
  extraExports: modelExports + `export { testLowerFill, bucketDrain, WEAPON_DETAIL_CALIBRATION } from './patches/splatoon3/runtime/weapon-detail-motion.mjs';`,
}) : null;
function make(f) {
  const d = f.VARIANT_MODELS.Slosher_Double_02.build({ kind: 'slosher', parts: {} });
  return { d, near: new f.THREE.Mesh(d.ink), far: new f.THREE.Mesh(d.ink.clone()) };
}
function extent(mesh) {
  const g = mesh.geometry, p = g.attributes.position, ix = g.index;
  const count = ix ? ix.count : p.count, start = Math.max(0, g.drawRange.start || 0);
  const end = Math.min(count, start + g.drawRange.count), ys = [];
  for (let i = start; i < end; i++) ys.push(p.getY(ix ? ix.getX(i) : i) * mesh.scale.y + mesh.position.y);
  assert.ok(ys.length); return { top: Math.max(...ys), bottom: Math.min(...ys) };
}
test('Hornz thin rear surface follows actual lowerFill through 30/60/120Hz drain, peak and reset', { skip: sourceSkip }, () => {
  const f = source;
  for (const hz of [30, 60, 120]) {
    const { d, near, far } = make(f), rest = extent(near); let peak = 0;
    assert.equal(d.slosherInkSurfaceOnly, true);
    for (let i = 0; i <= Math.ceil(hz * .5); i++) {
      const depth = f.WEAPON_DETAIL_CALIBRATION.bucketDepth * f.bucketDrain(i / hz, 17 / 60); peak = Math.max(peak, depth);
      for (const m of [near, far]) {
        f.testLowerFill(m, depth, d.slosherInkSurfaceOnly === true); const h = extent(m);
        assert.ok(Math.abs(h.top - (rest.top - depth)) < 1e-8);
        assert.ok(Math.abs(h.bottom - (rest.bottom - depth)) < 1e-8); assert.equal(m.scale.y, 1);
      }
    }
    assert.ok(peak > .010);
    for (const m of [near, far]) {
      f.testLowerFill(m, .012, true); assert.ok(Math.abs(extent(m).top - rest.top + .012) < 1e-8);
      f.testLowerFill(m, 0, true); assert.deepEqual(extent(m), rest);
    }
  }
});
test('Unflagged fills retain original half-height-clamped, bottom-anchored compression', { skip: sourceSkip }, () => {
  const f = source, { near } = make(f), r = extent(near); f.testLowerFill(near, .012); const h = extent(near);
  assert.ok(Math.abs(h.top - r.top + (r.top - r.bottom) / 2) < 1e-8); assert.ok(Math.abs(h.bottom - r.bottom) < 1e-8);
  const m = new f.THREE.Mesh(new f.THREE.BoxGeometry(.1, .08, .1)), b = extent(m); f.testLowerFill(m, .012);
  assert.ok(Math.abs(extent(m).top - b.top + .012) < 1e-8); assert.ok(Math.abs(extent(m).bottom - b.bottom) < 1e-8);
  f.testLowerFill(m, 0); assert.deepEqual(extent(m), b);
});
test('Full Hornz peak drain keeps every rear-sheet vertex footprint above the hopper floor', { skip: sourceSkip }, () => {
  const f = source, T = f.THREE, { d, near } = make(f); f.testLowerFill(near, .012, true);
  const low = extent(near).bottom, m = new T.Mesh(d.body, new T.MeshBasicMaterial({ side: T.DoubleSide })); m.updateMatrixWorld(true);
  const p = d.ink.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const hit = new T.Raycaster(new T.Vector3(x, .075, z), new T.Vector3(0, -1, 0)).intersectObject(m)[0];
    assert.ok(hit); assert.ok(low > hit.point.y + .0004, `${x},${z}: rear sheet ${low}, floor ${hit.point.y}`);
  }
});
// No test-only exports, source replacement or geometry substitution here.
// Runs the real catalog Hornz Actor through installer -> WeaponRunner ->
// Character._animWeapon, including normal near/far geometry and native reset.
test('Production catalog Hornz drains near/far rear ink by native depth and resets', async () => {
  const f = await fixture({ includeCharacter: true, fullRuntime: true, extraExports: `
    export { weaponDetailMotionSnapshot } from './patches/splatoon3/runtime/weapon-detail-motion.mjs';
    export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';` });
  const api = f.installedRuntime, { G, Actor, Character, THREE } = api;
  f.installMainWeaponCatalogRuntime(api, f.profile);
  G.scene = new THREE.Scene(); G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
  G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
  G.physics = new api.Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0; G.actors = [];
  const projectiles = new api.Projectiles(G.scene); G.projectiles = projectiles;
  const a = new Actor({ team: 0, weapon: 's3-slosher-double-02', isLocal: false, name: 'Hornz liquid regression', CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = true; a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
  const w = ch.weapon;
  assert.equal(w.def.modelVariantId, 'Slosher_Double_02'); assert.equal(w.def.slosherInkSurfaceOnly, true);
  assert.ok(w.ink && w.inkFar); const rest = extent(w.ink), surfaceRest = w.parts.surface.userData.rest.y; let peak = 0;
  try {
    for (let i = 0; i < 170; i++) {
      const input = { fire: i === 90 }; a.ink = 100; a.intent.fire = input.fire; G.time += 1 / 60;
      a.weaponRunner.update(1 / 60, input); a._finishFrame(1 / 60);
      const drain = f.weaponDetailMotionSnapshot(ch).bucketDrain; peak = Math.max(peak, drain);
      if (!projectiles.list.length) assert.equal(drain, 0, 'no drain during unadmitted reservation');
      assert.ok(Math.abs(w.parts.surface.position.y - surfaceRest + .012 * drain) < 1e-7);
      for (const m of [w.ink, w.inkFar]) assert.ok(Math.abs(extent(m).top - rest.top + .012 * drain) < 1e-7);
    }
    assert.ok(projectiles.list.length > 0); assert.ok(peak > .95, `catalog emitted ${projectiles.list.length} projectiles but peak drain was ${peak}`);
    a.weaponRunner.reset(); a._finishFrame(0);
    for (const m of [w.ink, w.inkFar]) assert.ok(Math.abs(extent(m).top - rest.top) < 1e-8);
  } finally { G.scene.remove(ch.root); ch.dispose(); projectiles.clear(); G.scene.remove(projectiles.blobs, projectiles.arcLine, projectiles.arcRing); }
});

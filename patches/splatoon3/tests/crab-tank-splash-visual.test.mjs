import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const builtSite = process.env.INKWAVE_BUILT_SITE && resolve(process.env.INKWAVE_BUILT_SITE);
// Fail on missing emitted files instead of silently exercising source modules.
const vendorUrl = pathToFileURL(resolve(builtSite || resolve(root, 'inkwave-public'), 'vendor/three/build/three.module.js'));
const helperUrl = pathToFileURL(resolve(builtSite || root, 'patches/splatoon3/runtime/crab-tank-splash-visual.mjs'));
const [THREE, { updateCrabSplashVisuals, clearCrabSplashVisuals }] = await Promise.all([
  import(vendorUrl.href), import(helperUrl.href),
]);

function drop(mode, team = 0, x = 1) {
  return { spec: { crabMode: mode, noSpecial: true }, team,
    owner: { color: new THREE.Color(0x00ff00) },
    pos: new THREE.Vector3(x, 2, 3), vel: new THREE.Vector3(4, -5, 6),
    frames: 7, radius: 12 };
}
function setup(drops) {
  return { system: { _s3SplashDrops: drops }, game: { scene: new THREE.Scene(),
    teamColors: [new THREE.Color(0xff3300), new THREE.Color(0x2244ff)] } };
}
function meshOf(game) { return game.scene.getObjectByName('s3-crab-detached-splashes'); }
function transform(mesh, index) {
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = pos.clone(), rotation = new THREE.Quaternion();
  mesh.getMatrixAt(index, matrix); matrix.decompose(pos, rotation, scale);
  return { pos, scale };
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`); }

test('missing scene and unrelated splash queues allocate no visual resources', () => {
  const { system, game } = setup([drop('shooter')]);
  const unavailable = { InstancedMesh() { throw new Error('must not allocate'); } };
  assert.equal(updateCrabSplashVisuals(system, {}, unavailable), 0);
  assert.equal(updateCrabSplashVisuals(null, game, THREE), 0);
  assert.equal(clearCrabSplashVisuals(null, game), false);
  system._s3SplashDrops = [{ spec: { noSpecial: true }, pos: new THREE.Vector3() }, drop('other')];
  assert.equal(updateCrabSplashVisuals(system, game, THREE), 0);
  assert.equal(game.scene.children.length, 0);
  assert.equal(clearCrabSplashVisuals(system, game), false);
});

test('real THREE batches only marked finite Crab drops, with independent source/fallback radii and team colors', () => {
  const bad = drop('cannon'); bad.pos.x = NaN;
  const shooter = drop('shooter'), cannon = drop('cannon', 1, 9);
  // Identification is crabMode, not the paint-accounting noSpecial marker.
  shooter.spec.noSpecial = false;
  const { system, game } = setup([drop('other'), shooter, bad, null, cannon]);
  try {
    assert.equal(updateCrabSplashVisuals(system, game, THREE), 2);
    const mesh = meshOf(game);
    assert.ok(mesh instanceof THREE.InstancedMesh);
    assert.ok(mesh.material instanceof THREE.MeshPhysicalMaterial);
    assert.equal(game.scene.children.length, 1);
    assert.equal(mesh.geometry.groups.length, 0, 'one geometry/material batch');
    assert.equal(mesh.count, 2); assert.equal(mesh.visible, true);
    assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
    assert.equal(mesh.material.transparent, false); assert.equal(mesh.material.transmission, 0);
    assert.equal(mesh.frustumCulled, false);
    assert.equal(mesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
    assert.equal(mesh.instanceColor.usage, THREE.DynamicDrawUsage);
    assert.deepEqual(transform(mesh, 0).pos.toArray(), shooter.pos.toArray());
    assert.deepEqual(transform(mesh, 1).pos.toArray(), cannon.pos.toArray());
    for (const value of transform(mesh, 0).scale.toArray()) close(value, .055);
    for (const value of transform(mesh, 1).scale.toArray()) close(value, .1);
    const color = new THREE.Color();
    for (let i = 0; i < 2; i++) {
      mesh.getColorAt(i, color);
      color.toArray().forEach((v, channel) => close(v, game.teamColors[i].toArray()[channel]));
    }
    assert.match(mesh.userData.crabSplashVisual.shooterDrawRadiusStatus, /local visual fallback/);
  } finally { clearCrabSplashVisuals(system, game); }
});

test('steady updates reuse GPU/CPU resources without random calls or gameplay mutation', () => {
  const d = drop('shooter'), { system, game } = setup([d]);
  const before = JSON.stringify(d);
  Object.freeze(d.pos); Object.freeze(d.vel); Object.freeze(d.spec); Object.freeze(d.owner);
  Object.freeze(d); Object.freeze(system._s3SplashDrops);
  game.physics = { segment() { throw new Error('visual must not query physics'); } };
  game.paint = { splat() { throw new Error('visual must not paint'); } };
  Object.defineProperty(game, 'fx', { get() { throw new Error('visual must not depend on optional FX'); } });
  updateCrabSplashVisuals(system, game, THREE);
  const mesh = meshOf(game), geometry = mesh.geometry, material = mesh.material;
  const matrix = mesh.instanceMatrix, colors = mesh.instanceColor;
  const matrixBuffer = matrix.array, colorBuffer = colors.array, version = matrix.version;
  const random = Math.random;
  try {
    // THREE generates UUIDs once during resource construction. No random state
    // is consumed by any subsequent visual update or visual scheduling.
    Math.random = () => { throw new Error('unexpected per-frame randomness'); };
    for (let i = 0; i < 180; i++) assert.equal(updateCrabSplashVisuals(system, game, THREE), 1);
    assert.equal(meshOf(game), mesh); assert.equal(game.scene.children.length, 1);
    assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
    assert.equal(mesh.instanceMatrix, matrix); assert.equal(mesh.instanceColor, colors);
    assert.equal(matrix.array, matrixBuffer); assert.equal(colors.array, colorBuffer);
    assert.equal(matrix.version, version + 180);
    assert.equal(JSON.stringify(d), before);
  } finally { Math.random = random; clearCrabSplashVisuals(system, game); }
});

test('queue removal hides landed drops and empty frames retain the pool for reuse', () => {
  const a = drop('shooter'), b = drop('cannon', 1, 6), { system, game } = setup([a, b]);
  try {
    updateCrabSplashVisuals(system, game, THREE); const mesh = meshOf(game);
    system._s3SplashDrops.splice(0, 1); b.pos.set(8, 9, 10);
    assert.equal(updateCrabSplashVisuals(system, game, THREE), 1);
    assert.deepEqual(transform(mesh, 0).pos.toArray(), [8, 9, 10]);
    system._s3SplashDrops.length = 0;
    assert.equal(updateCrabSplashVisuals(system, game, THREE), 0);
    assert.equal(mesh.count, 0); assert.equal(mesh.visible, false);
    delete system._s3SplashDrops;
    updateCrabSplashVisuals(system, game, THREE);
    system._s3SplashDrops = [a]; updateCrabSplashVisuals(system, game, THREE);
    assert.equal(meshOf(game), mesh); assert.equal(mesh.visible, true);
    assert.equal(mesh.count, 1);
  } finally { clearCrabSplashVisuals(system, game); }
});

test('instance storage and scan work stay bounded at the shared 512-drop capacity', () => {
  const items = Array.from({ length: 600 }, (_, i) => drop(i % 2 ? 'shooter' : 'cannon', i % 2, i));
  Object.defineProperty(items, 512, { get() { throw new Error('scan exceeded bounded queue'); } });
  const { system, game } = setup(items);
  try {
    assert.equal(updateCrabSplashVisuals(system, game, THREE), 512);
    const mesh = meshOf(game);
    assert.equal(mesh.instanceMatrix.count, 512); assert.equal(mesh.instanceColor.count, 512);
    assert.equal(mesh.count, 512); assert.equal(game.scene.children.length, 1);
    assert.deepEqual(transform(mesh, 511).pos.toArray(), [511, 2, 3]);
  } finally { clearCrabSplashVisuals(system, game); }
});

test('scene loss and replacement detach the old mesh and reuse the same pool', () => {
  const { system, game } = setup([drop('cannon')]), oldScene = game.scene;
  try {
    updateCrabSplashVisuals(system, game, THREE); const mesh = meshOf(game);
    game.scene = null;
    assert.equal(updateCrabSplashVisuals(system, game, THREE), 0);
    assert.equal(oldScene.children.length, 0); assert.equal(mesh.parent, null);
    assert.equal(mesh.count, 0);
    game.scene = new THREE.Scene(); updateCrabSplashVisuals(system, game, THREE);
    assert.equal(meshOf(game), mesh); assert.equal(oldScene.children.length, 0);
    const replaced = game.scene; game.scene = new THREE.Scene();
    updateCrabSplashVisuals(system, game, THREE);
    assert.equal(meshOf(game), mesh); assert.equal(replaced.children.length, 0);
  } finally { clearCrabSplashVisuals(system, game); }
});

test('clear disposes mesh instance attributes, geometry and material exactly once and permits a fresh pool', () => {
  const { system, game } = setup([drop('shooter')]);
  updateCrabSplashVisuals(system, game, THREE); const mesh = meshOf(game);
  const disposed = { mesh: 0, geometry: 0, material: 0 };
  mesh.addEventListener('dispose', () => disposed.mesh++);
  mesh.geometry.addEventListener('dispose', () => disposed.geometry++);
  mesh.material.addEventListener('dispose', () => disposed.material++);
  const queue = system._s3SplashDrops;
  assert.equal(clearCrabSplashVisuals(system, {}), true);
  assert.equal(clearCrabSplashVisuals(system, game), false);
  assert.deepEqual(disposed, { mesh: 1, geometry: 1, material: 1 });
  assert.equal(mesh.parent, null); assert.equal(game.scene.children.length, 0);
  assert.equal(system._s3SplashDrops, queue); assert.equal(queue.length, 1);
  try {
    updateCrabSplashVisuals(system, game, THREE);
    assert.notEqual(meshOf(game), mesh); assert.notEqual(meshOf(game).geometry, mesh.geometry);
  } finally { clearCrabSplashVisuals(system, game); }
});

test('systems have separate lifetimes and owner colors support missing team palettes', () => {
  const a = drop('shooter'), b = drop('cannon'), { system, game } = setup([a]);
  const other = { _s3SplashDrops: [b] }; delete game.teamColors;
  a.owner.color = 0; b.owner.color = new THREE.Color(0x7733ff);
  try {
    updateCrabSplashVisuals(system, game, THREE); const first = meshOf(game);
    updateCrabSplashVisuals(other, game, THREE);
    assert.equal(game.scene.children.length, 2);
    const second = game.scene.children.find(mesh => mesh !== first), color = new THREE.Color();
    first.getColorAt(0, color); assert.equal(color.getHex(), 0, 'black is not a missing color');
    second.getColorAt(0, color);
    color.toArray().forEach((v, i) => close(v, b.owner.color.toArray()[i]));
    clearCrabSplashVisuals(system, game);
    assert.equal(game.scene.children.length, 1); assert.equal(second.parent, game.scene);
  } finally { clearCrabSplashVisuals(system, game); clearCrabSplashVisuals(other, game); }
});

test('production update and clear own splash mesh lifetime with optional FX absent', async () => {
  // The source fixture routes runtime/vendor imports through INKWAVE_BUILT_SITE
  // too, so this verifies the emitted integration as well as the direct helper.
  const { fixture } = await import('./source-fixture.mjs');
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export {spawnSplashDrop} from './patches/splatoon3/runtime/blaster-flight-paint.mjs';" });
  const { G } = f;
  G.scene = new f.THREE.Scene(); G.fx = undefined;
  G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  const system = G.projectiles;
  try {
    for (let cycle = 0; cycle < 2; cycle++) {
      const d = f.spawnSplashDrop(G, { owner: { remote: false, color: G.teamColors[0] }, team: 0, seed: 1,
        from: new f.THREE.Vector3(1, 6, 2), radius: 1,
        spec: { crabMode: 'shooter', noSpecial: true, gravity: .016 * 3600, drag: .02 } });
      assert.ok(d); const birthY = d.pos.y;
      system.update(1 / 60);
      const mesh = meshOf(G);
      assert.ok(mesh?.isInstancedMesh, 'installed update invokes the helper without FX');
      assert.equal(mesh.count, 1); assert.ok(d.pos.y < birthY, 'shared queue advanced before presentation');
      const matrix = new f.THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
      close(matrix.elements[13], d.pos.y);
      const disposed = { mesh: 0, geometry: 0, material: 0 };
      mesh.addEventListener('dispose', () => disposed.mesh++);
      mesh.geometry.addEventListener('dispose', () => disposed.geometry++);
      mesh.material.addEventListener('dispose', () => disposed.material++);
      system.clear(); system.clear();
      assert.equal(mesh.parent, null); assert.equal(meshOf(G), undefined);
      assert.equal(system._s3SplashDrops.length, 0, 'installed clear also retires the shared queue');
      assert.deepEqual(disposed, { mesh: 1, geometry: 1, material: 1 });
      system.update(1 / 60);
      assert.equal(meshOf(G), undefined, 'empty update after clear does not resurrect resources');
    }
  } finally { system.clear(); }
});

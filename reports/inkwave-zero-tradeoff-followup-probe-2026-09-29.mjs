// Post-fix verification for Q04/Q05/Q06. Run from repository root with Node >= 22.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const files = [
  'src/world/decor.js',
  'src/game/lobbySet.js',
  'src/game/showcase.js',
  'src/world/environment.js',
];
const src = Object.fromEntries(files.map(p => [p, fs.readFileSync('inkwave-public/' + p, 'utf8')]));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function between(s, start, end) {
  const a = s.indexOf(start), b = s.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'source boundary missing: ' + start);
  return s.slice(a, b);
}
function method(s, start, end) {
  const name = start.trim().split('(')[0];
  return vm.runInNewContext('({' + between(s, start, end) + '})[' + JSON.stringify(name) + ']');
}
const mesh = (n = 4) => new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), n);

// Q04: final teardown must emit InstancedMesh dispose without prematurely disposing shared contact resources.
const decorDispose = method(src['src/world/decor.js'], '  dispose() {', '\n}');
let decorObjectDisposes = 0;
{
  const scene = new THREE.Scene(), group = new THREE.Group(), m = mesh();
  m.addEventListener('dispose', () => decorObjectDisposes++);
  group.add(m); scene.add(group);
  decorDispose.call({ _disposed: false, group, scene, pads: [], flags: [], barriers: [] });
}
assert.equal(decorObjectDisposes, 1);

const lobbyDispose = method(src['src/game/lobbySet.js'], '  dispose() {', '\n}\n\n// ------------------------------------------------------------------------------------------------ data');
let lobbyObjectDisposes = 0, shadowMapDisposes = 0;
{
  const root = new THREE.Group(), m = mesh(), key = new THREE.SpotLight();
  m.addEventListener('dispose', () => lobbyObjectDisposes++);
  root.add(m);
  key.shadow.map = new THREE.WebGLRenderTarget(8, 8);
  key.shadow.map.addEventListener('dispose', () => shadowMapDisposes++);
  lobbyDispose.call({ root, tex: {}, lights: { key, spill: {} } });
}
assert.equal(lobbyObjectDisposes, 1);
assert.equal(shadowMapDisposes, 1);

const lobbyRelease = method(src['src/game/showcase.js'], '  _lobRelease() {', '\n  _enterSetMode(');
let fxObjectDisposes = 0, sparkObjectDisposes = 0, trailDisposes = 0, contactObjectDisposes = 0;
let sharedContactGeometryDisposes = 0, sharedContactMaterialDisposes = 0;
{
  const make = () => { const m = mesh(); m.addEventListener('dispose', () => fxObjectDisposes++); return m; };
  const fx = [{ mesh: make(), splats: make(), rings: make() }];
  const spark = mesh(); spark.addEventListener('dispose', () => sparkObjectDisposes++);
  const contact = mesh();
  contact.addEventListener('dispose', () => contactObjectDisposes++);
  contact.geometry.addEventListener('dispose', () => sharedContactGeometryDisposes++);
  contact.material.addEventListener('dispose', () => sharedContactMaterialDisposes++);
  const scene = new THREE.Scene();
  for (const m of [...fx.flatMap(x => [x.mesh, x.splats, x.rings]), spark, contact]) scene.add(m);
  const holder = { lob: {
    members: new Map(), set: null, fx, ink: [{ dispose() {} }],
    sparks: { mesh: spark }, trail: { dispose() { trailDisposes++; } }, contact, scene,
  } };
  lobbyRelease.call(holder);
}
assert.equal(fxObjectDisposes, 3);
assert.equal(sparkObjectDisposes, 1);
assert.equal(trailDisposes, 1);
assert.equal(contactObjectDisposes, 1);
assert.equal(sharedContactGeometryDisposes, 0);
assert.equal(sharedContactMaterialDisposes, 0);

// Q05: discarded dock generation releases each unique material once, plus the pilings InstancedMesh object.
const rebuildDock = method(src['src/world/environment.js'], '  _rebuildDock() {', '\n  // Replace the deck');
let geometryDisposes = 0, materialDisposes = 0, pilingObjectDisposes = 0, rebuilds = 0, foams = 0;
{
  const root = new THREE.Group();
  const pMat = new THREE.MeshStandardMaterial(), dMat = new THREE.MeshStandardMaterial(), boatMat = new THREE.MeshStandardMaterial();
  for (const m of [pMat, dMat, boatMat]) m.addEventListener('dispose', () => materialDisposes++);
  const pilings = new THREE.InstancedMesh(new THREE.PlaneGeometry(), pMat, 2);
  pilings.addEventListener('dispose', () => pilingObjectDisposes++);
  const dockProps = new THREE.Mesh(new THREE.BoxGeometry(), dMat);
  const moored = [0, 1].map(() => ({ mesh: new THREE.Mesh(new THREE.BoxGeometry(), boatMat) }));
  for (const o of [pilings, dockProps, ...moored.map(x => x.mesh)]) {
    o.geometry.addEventListener('dispose', () => geometryDisposes++);
    root.add(o);
  }
  rebuildDock.call({
    root, pilings, dockProps, moored, buoys: [], _marina: false,
    _buildDock() { rebuilds++; this._foamShapes = []; },
    _buildFoamField() { foams++; },
  });
}
assert.equal(geometryDisposes, 4);
assert.equal(materialDisposes, 3);
assert.equal(pilingObjectDisposes, 1);
assert.equal(rebuilds, 1);
assert.equal(foams, 1);

// Q06: only the final upload request is conditional. Simulation/slot clearing remains in place.
const show = src['src/game/showcase.js'];
const ink = between(show, 'class InkFX {', '// Paper + foil confetti');
const confetti = between(show, 'class Confetti {', '// Twinkling star glints');
const sparkles = between(show, 'class Sparkles {', '// Wet ink trail');
const trail = between(show, 'class InkTrail {', '// Swim paths');
for (const [name, body] of [['InkFX', ink], ['Confetti', confetti], ['Sparkles', sparkles], ['InkTrail', trail]]) {
  assert(body.includes('count = 0'), name + ' clear/count reset missing');
}
assert(ink.includes('if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;'));
assert(ink.includes('if (this.splats.count > 0) this.splats.instanceMatrix.needsUpdate = true;'));
assert(ink.includes('if (this.rings.count > 0) this.rings.instanceMatrix.needsUpdate = true;'));
assert(confetti.includes('if (this.paper.count > 0) this.paper.instanceMatrix.needsUpdate = true;'));
assert(confetti.includes('if (this.foil.count > 0) this.foil.instanceMatrix.needsUpdate = true;'));
assert(sparkles.includes('if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;'));
assert(trail.includes('if (this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;'));
assert(trail.includes('dispose() { this.mesh.dispose?.();'));

// Preserve the original audit evidence and append/refresh post-fix verification.
const output = 'reports/inkwave-zero-tradeoff-followup-evidence-2026-09-29.json';
const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
evidence.postFixProbe = {
  result: 'PASS',
  sourceSha256: Object.fromEntries(files.map(p => [p, hash(src[p])])),
  Q04: { decorObjectDisposes, lobbyObjectDisposes, shadowMapDisposes, fxObjectDisposes, sparkObjectDisposes, trailDisposes, contactObjectDisposes, sharedContactGeometryDisposes, sharedContactMaterialDisposes },
  Q05: { geometryDisposes, uniqueMaterialDisposes: materialDisposes, pilingObjectDisposes, rebuilds, foams },
  Q06: { emptyUploadGuardsPresent: true, clearStillZerosCpuMatrices: true, trailObjectDisposePresent: true },
};
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence.postFixProbe, null, 2));

// Run from repository root with Node 24:
// node reports/inkwave-no-quality-loss-probe-2026-09-29.mjs
// Post-fix verification against the current production method bodies.
// No browser/WebGL context: resource lifetime and data identity are checked with controlled fixtures.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import { SUB } from '../inkwave-public/src/config.js';

const root = 'inkwave-public/';
const files = ['src/game/weapons.js', 'src/game/lobbySet.js', 'src/game/lobbySet-mats.js', 'src/game/showcase.js', 'src/config.js', 'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js'];
const sources = Object.fromEntries(files.map(p => [p, fs.readFileSync(root + p, 'utf8')]));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const weapons = sources[files[0]], lobby = sources[files[1]];
assert(weapons.includes('const SIM_DT = 1 / 60;'));
const SIM_DT = 1 / 60;

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Source boundaries changed: ' + start);
  return source.slice(a, b);
}
function method(source, start, end, context = {}) {
  const name = start.trim().split('(')[0];
  return vm.runInNewContext('({' + between(source, start, end) + '})[' + JSON.stringify(name) + ']', context);
}

// Q01: actual LobbySet.dispose() must close the LightShadow-owned render targets.
const disposeSet = method(lobby, '  dispose() {', '\n}\n\n// ------------------------------------------------------------------------------------------------ data');
function shadowRelease() {
  let mapDisposes = 0, mapPassDisposes = 0, cookieDisposes = 0;
  for (let i = 0; i < 20; i++) {
    const key = new THREE.SpotLight(), spill = new THREE.SpotLight();
    key.shadow.map = new THREE.WebGLRenderTarget(2048, 2048);
    key.shadow.mapPass = new THREE.WebGLRenderTarget(2048, 2048);
    key.shadow.map.addEventListener('dispose', () => mapDisposes++);
    key.shadow.mapPass.addEventListener('dispose', () => mapPassDisposes++);
    spill.map = new THREE.Texture();
    spill.map.addEventListener('dispose', () => cookieDisposes++);
    const fixture = { root: new THREE.Group(), tex: {}, lights: { key, spill } };
    fixture.root.add(key, spill);
    const scene = new THREE.Scene(); scene.add(fixture.root);
    disposeSet.call(fixture);
    assert.equal(scene.children.length, 0);
  }
  return { releases: 20, mapDisposes, optionalMapPassDisposes: mapPassDisposes, cookieDisposes };
}
const shadow = shadowRelease();
assert.deepEqual(shadow, { releases: 20, mapDisposes: 20, optionalMapPassDisposes: 20, cookieDisposes: 20 });

// Q02: actual updateArc() keeps one lineDistance BufferAttribute and must produce the exact
// bytes THREE.Line.computeLineDistances() produced before the fix.
function referenceDistances(pos) {
  const out = new Float32Array(pos.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let total = 0;
  out[0] = 0;
  for (let i = 1; i < pos.count; i++) {
    a.fromBufferAttribute(pos, i - 1); b.fromBufferAttribute(pos, i);
    total += a.distanceTo(b);
    out[i] = total;
  }
  return out;
}
function runArc() {
  let queries = 0, ground = false;
  const G = { time: 0, physics: { segment(a, b) {
    queries++;
    if (ground && a.y >= 0 && b.y <= 0) return { hit: true, point: a.clone().lerp(b, a.y / (a.y - b.y)), normal: new THREE.Vector3(0, 1, 0) };
    return { hit: false };
  } } };
  const arc = method(weapons, '  updateArc(a, show) {', '\n  // Every projectile', {
    THREE, SUB, SIM_DT, G,
    _v: new THREE.Vector3(), _v2: new THREE.Vector3(), _v3: new THREE.Vector3(),
    _hit: {}, UP: new THREE.Vector3(0, 1, 0),
  });
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  arcGeo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(64), 1));
  const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial());
  const arcRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const fixture = { arcGeo, arcLine, arcRing, arcN: 64, throwVelocity(a, speed, out) { return out.set(a.launchX, 8, -speed); } };
  const actor = { pos: new THREE.Vector3(), launchX: 0, alive: true, ink: 100, color: new THREE.Color('#ff8a14') };
  const identities = new Set(), ranges = new Set(), frames = [];
  for (let i = 0; i < 180; i++) {
    ground = i >= 60 && i < 120;
    const k = i < 120 ? i : 120;
    actor.pos.set(k * .017, .2 + .05 * Math.sin(k), .1 * Math.cos(k));
    actor.launchX = Math.sin(k * .13); actor.ink = i % 2 ? 0 : 100; G.time = i / 60;
    arc.call(fixture, actor, true);
    const actual = arcGeo.attributes.lineDistance.array;
    const expected = referenceDistances(arcGeo.attributes.position);
    assert.equal(Buffer.compare(Buffer.from(actual.buffer), Buffer.from(expected.buffer)), 0, 'lineDistance bytes differ at frame ' + i);
    identities.add(arcGeo.attributes.lineDistance); ranges.add(arcGeo.drawRange.count);
    frames.push({
      positions: Buffer.from(arcGeo.attributes.position.array.buffer).toString('hex'),
      distances: Buffer.from(actual.buffer).toString('hex'),
      range: { ...arcGeo.drawRange }, lineColor: arcLine.material.color.toArray(), lineVisible: arcLine.visible,
      ringVisible: arcRing.visible, ringPosition: arcRing.position.toArray(), ringQuaternion: arcRing.quaternion.toArray(),
      ringScale: arcRing.scale.toArray(), ringColor: arcRing.material.color.toArray(),
    });
  }
  return {
    frames: 180,
    physicsSegmentCalls: queries,
    distinctDrawCounts: [...ranges].sort((a,b) => a-b),
    uniqueLineDistanceAttributes: identities.size,
    frameDataSha256: hash(JSON.stringify(frames)),
    allDistanceBytesMatchLegacy: true,
  };
}
assert(weapons.includes("this.arcGeo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(arcN), 1));"));
const arc = runArc();
assert.equal(arc.uniqueLineDistanceAttributes, 1);
assert.equal(arc.physicsSegmentCalls, 10626);
assert.deepEqual(arc.distinctDrawCounts, [26, 64]);
assert.equal(arc.frameDataSha256, '8ced3f569fb511f7f921fd87e2ef1c0da970009aa09205ae0be30f41ccd9f44e');

// Q03: actual constructor now performs one initial PMREM bake, while a real team-colour change still re-bakes.
const makeUniforms = vm.runInNewContext('(' + between(sources[files[2]], 'function makeUniforms()', '\n\n// ------------------------------------------------------------------------------------------------ GLSL') + ')', { THREE });
function envSnapshot(scene, sigma, near, far, options) {
  const objects = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    objects.push({ position: o.position.toArray(), rotation: o.quaternion.toArray(), scale: o.scale.toArray(),
      color: o.material.color.toArray(), side: o.material.side,
      attributes: Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a]) => [k, Array.from(a.array)])),
      index: o.geometry.index ? Array.from(o.geometry.index.array) : null });
  });
  return hash(JSON.stringify({ objects, sigma, near, far, size: options.size, position: options.position.toArray() }));
}
async function runEnv() {
  const bakes = [], updates = [];
  class PMREMFixture {
    fromScene(...args) {
      const rt = new THREE.WebGLRenderTarget(4, 4);
      rt.texture.userData.inputDigest = envSnapshot(...args); bakes.push(rt.texture.userData.inputDigest);
      return rt;
    }
    dispose() {}
  }
  const texture = () => { const t = new THREE.Texture(); t.userData.ready = Promise.resolve(); return t; };
  const context = { THREE: { ...THREE, PMREMGenerator: PMREMFixture }, makeUniforms,
    createDecalAtlas: texture, createLitAtlas: texture, createSkyline: texture, createGroundMask: texture,
    loadSetFonts: () => Promise.resolve(), PUDDLES: [], SPLATS: [] };
  const declarations = between(lobby, 'const V =', '\nexport class LobbySet').replace('export const ALLEY', 'const ALLEY');
  vm.createContext(context); vm.runInContext(declarations, context);
  const compile = (start, end) => vm.runInContext('({' + between(lobby, start, end) + '})[' + JSON.stringify(start.trim().split('(')[0]) + ']', context);
  const ctor = vm.runInContext('({' + between(lobby, '  constructor(renderer,', '\n\n  // ---------------------------------------------------------------------------------------------- paths') + '}).constructor', context);
  const fixture = {
    _buildLanes() { return []; },
    _bakeEnv: compile('  _bakeEnv() {', '\n  _rebakeEnv()'),
    _rebakeEnv: compile('  _rebakeEnv() {', '\n\n  // ---------------------------------------------------------------------------------------------- build'),
    setTeamColors: compile('  setTeamColors(a, b) {', '\n\n  setQuality('),
    _build() { this._envMats = Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ envMap: this.environment })); },
    _lights() {}, _reflection() {}, setQuality(q) { this.lastQuality = q; },
    update(dt, t) { updates.push([dt, t]); },
  };
  ctor.call(fixture, {}, { quality: 'high' }); await fixture.ready;
  const constructorBakes = bakes.length, initialInput = bakes[0];
  const initialMaterialInputs = fixture._envMats.map(m => m.envMap.userData.inputDigest);
  fixture.setTeamColors('#23c8ff', '#ff2861');
  const changedInput = bakes.at(-1), changedMaterialInputs = fixture._envMats.map(m => m.envMap.userData.inputDigest);
  assert.equal(constructorBakes, 1);
  assert.equal(bakes.length, 2);
  assert(initialMaterialInputs.every(h => h === initialInput));
  assert(changedMaterialInputs.every(h => h === changedInput));
  assert.notEqual(changedInput, initialInput);
  assert.deepEqual(updates, [[0, 0], [0, 0]]);
  return { constructorBakes, initialInput, initialMaterialInputs, additionalBakesAfterRealColorChange: 1, changedInput, changedMaterialInputs, updateCalls: updates };
}
const env = await runEnv();

console.log(JSON.stringify({
  basis: 'post-fix branch source',
  scope: 'Current method-body fixtures with real THREE data objects. No real GPU allocation, pixel comparison, device FPS or power measurement.',
  sourceSha256: Object.fromEntries(files.map(p => [p, hash(sources[p])])),
  lobbyShadowRelease: shadow,
  arcDistanceReuse: {
    ...arc,
    previousAuditUniqueLineDistanceAttributes: 121,
    scenarios: ['60 changing-aim frames without collision', '60 changing-aim frames with ground collision', '60 fixed-aim frames without collision'],
  },
  duplicateEnvironmentBake: env,
}, null, 2));

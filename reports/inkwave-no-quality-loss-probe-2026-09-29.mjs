// Run from repository root with Node 24:
// node reports/inkwave-no-quality-loss-probe-2026-09-29.mjs
// Production code is not patched. Actual method bodies + controlled fixtures.
// No browser/WebGL context: GL calls are counted, not executed on a GPU.
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
const weapons = sources[files[0]], lobby = sources[files[1]], moduleSource = sources[files[5]];
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

// Q01: invoke the actual LobbySet.dispose with real LightShadow/RenderTargets.
const disposeSet = method(lobby, '  dispose() {', '\n}\n\n// ------------------------------------------------------------------------------------------------ data');
function shadowRelease(addFix) {
  let mapDisposes = 0, mapPassDisposes = 0, cookieDisposes = 0;
  for (let i = 0; i < 20; i++) {
    const key = new THREE.SpotLight(), spill = new THREE.SpotLight();
    key.shadow.map = new THREE.WebGLRenderTarget(2048, 2048);
    // mapPass is optional in actual rendering; include it to check full shadow cleanup.
    key.shadow.mapPass = new THREE.WebGLRenderTarget(2048, 2048);
    key.shadow.map.addEventListener('dispose', () => mapDisposes++);
    key.shadow.mapPass.addEventListener('dispose', () => mapPassDisposes++);
    spill.map = new THREE.Texture();
    spill.map.addEventListener('dispose', () => cookieDisposes++);
    const fixture = { root: new THREE.Group(), tex: {}, lights: { key, spill } };
    fixture.root.add(key, spill);
    const scene = new THREE.Scene(); scene.add(fixture.root);
    if (addFix) fixture.lights.key.shadow.dispose();
    disposeSet.call(fixture);
    assert.equal(scene.children.length, 0);
  }
  return { releases: 20, mapDisposes, optionalMapPassDisposes: mapPassDisposes, cookieDisposes };
}
const shadowBefore = shadowRelease(false), shadowAfter = shadowRelease(true);
assert.equal(shadowBefore.mapDisposes, 0); assert.equal(shadowAfter.mapDisposes, 20);
assert.equal(shadowBefore.optionalMapPassDisposes, 0); assert.equal(shadowAfter.optionalMapPassDisposes, 20);
assert.equal(shadowBefore.cookieDisposes, 20); assert.equal(shadowAfter.cookieDisposes, 20);

// Q02: actual changing-aim trajectory; proposed distance computation keeps double
// precision accumulation until the final Float32 store (matching THREE.Line).
function reusableLineDistances() {
  const geometry = this.geometry, pos = geometry.attributes.position;
  let attr = geometry.attributes.lineDistance;
  if (!attr) {
    attr = new THREE.BufferAttribute(new Float32Array(pos.count), 1);
    geometry.setAttribute('lineDistance', attr);
  }
  const start = this._distanceStart || (this._distanceStart = new THREE.Vector3());
  const end = this._distanceEnd || (this._distanceEnd = new THREE.Vector3());
  let total = 0; attr.array[0] = 0;
  for (let i = 1; i < pos.count; i++) {
    start.fromBufferAttribute(pos, i - 1); end.fromBufferAttribute(pos, i);
    total += start.distanceTo(end); attr.array[i] = total;
  }
  attr.needsUpdate = true;
  return this;
}
const WebGLAttributes = vm.runInNewContext('(' + between(moduleSource, 'function WebGLAttributes( gl ) {', '\nvar alphahash_fragment') + ')', { Float32Array });
const WebGLGeometries = vm.runInNewContext('(' + between(moduleSource, 'function WebGLGeometries( gl, attributes, info, bindingStates ) {', '\nfunction WebGLIndexedBufferRenderer') + ')');
function runArc(reuse) {
  let queries = 0, ground = false;
  const G = { time: 0, physics: { segment(a, b) {
    queries++;
    if (ground && a.y >= 0 && b.y <= 0) return { hit: true, point: a.clone().lerp(b, a.y / (a.y - b.y)), normal: new THREE.Vector3(0, 1, 0) };
    return { hit: false };
  } } };
  const arc = method(weapons, '  updateArc(a, show) {', '\n  // Every projectile', { THREE, SUB, SIM_DT, G, _v: new THREE.Vector3(), _hit: {}, UP: new THREE.Vector3(0, 1, 0) });
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial());
  if (reuse) arcLine.computeLineDistances = reusableLineDistances;
  const arcRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const fixture = { arcGeo, arcLine, arcRing, arcN: 64, throwVelocity(a, speed, out) { return out.set(a.launchX, 8, -speed); } };
  const actor = { pos: new THREE.Vector3(), launchX: 0, alive: true, ink: 100, color: new THREE.Color('#ff8a14') };
  const counts = { createBuffer: 0, deleteBuffer: 0, bufferData: 0, bufferSubData: 0 };
  const gl = { FLOAT: 5126, ARRAY_BUFFER: 34962,
    createBuffer() { return { id: ++counts.createBuffer }; }, deleteBuffer() { counts.deleteBuffer++; },
    bindBuffer() {}, bufferData() { counts.bufferData++; }, bufferSubData() { counts.bufferSubData++; } };
  const attributes = WebGLAttributes(gl);
  const geometries = WebGLGeometries(gl, attributes, { memory: { geometries: 0 } }, { releaseStatesOfGeometry() {} });
  geometries.get(arcLine, arcGeo);
  const identities = new Set(), frames = [], ranges = new Set();
  for (let i = 0; i < 180; i++) {
    ground = i >= 60 && i < 120;
    const k = i < 120 ? i : 120;
    actor.pos.set(k * .017, .2 + .05 * Math.sin(k), .1 * Math.cos(k));
    actor.launchX = Math.sin(k * .13); actor.ink = i % 2 ? 0 : 100; G.time = i / 60;
    arc.call(fixture, actor, true);
    identities.add(arcGeo.attributes.lineDistance); ranges.add(arcGeo.drawRange.count);
    geometries.update(arcGeo);
    frames.push({
      positions: Buffer.from(arcGeo.attributes.position.array.buffer).toString('hex'),
      distances: Buffer.from(arcGeo.attributes.lineDistance.array.buffer).toString('hex'),
      range: { ...arcGeo.drawRange }, lineColor: arcLine.material.color.toArray(), lineVisible: arcLine.visible,
      ringVisible: arcRing.visible, ringPosition: arcRing.position.toArray(), ringQuaternion: arcRing.quaternion.toArray(),
      ringScale: arcRing.scale.toArray(), ringColor: arcRing.material.color.toArray(),
    });
  }
  arcGeo.dispose(); arcLine.material.dispose(); arcRing.geometry.dispose(); arcRing.material.dispose();
  return { frames, summary: { frames: 180, physicsSegmentCalls: queries, distinctDrawCounts: [...ranges].sort((a,b) => a-b), uniqueLineDistanceAttributes: identities.size, mockedGL: counts, frameDataSha256: hash(JSON.stringify(frames)) } };
}
const arcBefore = runArc(false), arcAfter = runArc(true);
assert.deepEqual(arcAfter.frames, arcBefore.frames);
assert.equal(arcBefore.summary.uniqueLineDistanceAttributes, 121);
assert.equal(arcAfter.summary.uniqueLineDistanceAttributes, 1);
assert.equal(arcBefore.summary.mockedGL.createBuffer, 122);
assert.equal(arcAfter.summary.mockedGL.createBuffer, 2);
assert.equal(arcBefore.summary.mockedGL.deleteBuffer, 2);
assert.equal(arcAfter.summary.mockedGL.deleteBuffer, 2);

// Q03: real constructor ordering, _bakeEnv, _rebakeEnv and setTeamColors.
// Textures/fonts and unrelated scene-building methods are controlled stubs.
// fromScene records exact proxy geometry/material/transform + parameters, with no GPU.
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
async function runEnv(skipDuplicate) {
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
  let ctorSource = between(lobby, '  constructor(renderer,', '\n\n  // ---------------------------------------------------------------------------------------------- paths');
  if (skipDuplicate) {
    const original = 'this.setTeamColors(this.U.uTeamA.value, this.U.uTeamB.value);';
    assert.equal(ctorSource.split(original).length, 2);
    ctorSource = ctorSource.replace(original, 'this.update(0, this._t);');
  }
  const ctor = vm.runInContext('({' + ctorSource + '}).constructor', context);
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
  const initCount = bakes.length;
  const initialInputs = [...bakes];
  const initialMaterialInputs = fixture._envMats.map(m => m.envMap.userData.inputDigest);
  assert(initialMaterialInputs.every(h => h === bakes[0]));
  fixture.setTeamColors('#23c8ff', '#ff2861');
  assert.equal(bakes.length, initCount + 1); assert.notEqual(bakes.at(-1), bakes[0]);
  const changedMaterialInputs = fixture._envMats.map(m => m.envMap.userData.inputDigest);
  assert(changedMaterialInputs.every(h => h === bakes.at(-1)));
  assert.equal(fixture.lastQuality, 'high');
  fixture.tex && Object.values(fixture.tex).forEach(t => t.dispose());
  fixture._envMats.forEach(m => m.dispose());
  fixture._envRT.dispose(); fixture._envOld?.dispose();
  fixture._envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return { constructorBakes: initCount, initialInputs, initialMaterialInputs,
    additionalBakesAfterRealColorChange: bakes.length - initCount,
    changedInput: bakes.at(-1), changedMaterialInputs, updateCalls: updates };
}
const envBefore = await runEnv(false), envAfter = await runEnv(true);
assert.equal(envBefore.constructorBakes, 2); assert.equal(envAfter.constructorBakes, 1);
assert.equal(envBefore.initialInputs[0], envBefore.initialInputs[1]);
assert.deepEqual(envBefore.initialMaterialInputs, envAfter.initialMaterialInputs);
assert.deepEqual(envBefore.changedMaterialInputs, envAfter.changedMaterialInputs);
assert.deepEqual(envBefore.updateCalls, envAfter.updateCalls);

console.log(JSON.stringify({
  basis: '2075e6468b99c901ff0817b5858c7bae2d1a6095',
  scope: 'Pinned source method fixtures, real THREE data objects, mocked GL and PMREM. No real GPU allocations, pixel comparisons, device FPS or power measurements.',
  sourceSha256: Object.fromEntries(files.map(p => [p, hash(sources[p])])),
  lobbyShadowRelease: { before: shadowBefore, proposed: shadowAfter },
  arcDistanceReuse: { before: arcBefore.summary, proposed: arcAfter.summary, allFrameDataBitIdentical: true,
    scenarios: ['60 changing-aim frames without collision', '60 changing-aim frames with ground collision', '60 fixed-aim frames without collision'],
    note: 'Attribute identities are retained to count them. Missing deleteBuffer calls do not establish permanent browser GPU memory retention; GC/driver behavior is not modeled.' },
  duplicateEnvironmentBake: { before: envBefore, proposed: envAfter,
    note: 'Real constructor and environment methods; _build, _lights, _reflection, texture/font generation and update body are stubbed. Static inspection confirms intervening methods do not change the proxy environment scene.' },
}, null, 2));

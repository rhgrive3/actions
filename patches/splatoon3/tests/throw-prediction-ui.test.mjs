import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { installThrowPrediction, drawThrowPrediction, confirmedThrowEndpoint, THROW_PREVIEW_INTERVAL } from '../runtime/throw-prediction.mjs';

function setup() {
  const scene = new THREE.Scene();
  const G = { time: 0, physics: {}, level: {}, match: { state: 'playing', paused: false } };
  class Projectiles {
    constructor() {
      this.scene = scene; this.arcN = 4;
      this.arcGeo = new THREE.BufferGeometry();
      this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      this.arcGeo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(4), 1));
      this.arcLine = new THREE.Line(this.arcGeo, new THREE.LineDashedMaterial());
      this.arcRing = new THREE.Mesh(new THREE.RingGeometry(.55, .75, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
      scene.add(this.arcLine, this.arcRing);
      this.subCalls = this.specialCalls = this.legacyCalls = this.clears = 0;
    }
    updateArc() { this.legacyCalls++; }
    clear() { this.clears++; }
    s3PredictSubTrajectory() { this.subCalls++; return this.prediction; }
    s3PredictSpecialTrajectory() { this.specialCalls++; return this.specialPrediction; }
  }
  const api = { THREE, G, Projectiles, SUB: { bomb: { inkCost: 70 } } };
  installThrowPrediction(api);
  const p = new Projectiles();
  const actor = { alive: true, remote: false, netLife: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    color: new THREE.Color('#ee7711'), ink: 100, weapon: { sub: 'bomb' }, weaponRunner: { s3SubHold: 0 },
    s3: { abilityPoints: { subPower: 0, specialPower: 0 } } };
  const prediction = (x = 3, y = 7) => ({ kind: 'bomb', points: [new THREE.Vector3(0, 1.35, 0), new THREE.Vector3(x, y, 2)],
    endpoint: new THREE.Vector3(x, y, 2), normal: new THREE.Vector3(-1, 0, 0), complete: true, outcome: 'explosion' });
  p.prediction = prediction();
  return { scene, api, G, actor, p, prediction };
}

test('wall/air endpoint keeps its height, fixed buffers end exactly at the predicted center', () => {
  const { p, actor, api } = setup();
  const points = Array.from({ length: 100 }, (_, i) => new THREE.Vector3(i / 10, 7, 3));
  const result = { points, endpoint: new THREE.Vector3(9.9, 7, 3), normal: new THREE.Vector3(-1, 0, 0), complete: true, outcome: 'explosion' };
  drawThrowPrediction(p, actor, result, api);
  assert.equal(p.arcGeo.drawRange.count, 4);
  assert.equal(p.arcRing.position.y, 7);
  assert.ok(Math.abs(p.arcRing.position.x - 9.885) < 1e-9);
  assert.ok(Math.abs(p.arcGeo.attributes.position.getX(3) - 9.9) < 1e-6);
  assert.deepEqual(new THREE.Vector3().fromBufferAttribute(p.arcGeo.attributes.position, 0).toArray(), [0, 7, 3]);
  assert.equal(p.arcRing.visible, true);
  assert.deepEqual(p.arcGeo.attributes.position.updateRanges, [{ start: 0, count: 12 }]);
});

test('target-dependent and incomplete flights never display a confirmed explosion marker', () => {
  const { p, actor, api, prediction } = setup();
  const result = { ...prediction(), targetDependent: true, complete: false, outcome: 'target-dependent',
    explosions: [{ point: new THREE.Vector3(4, 0, 2) }] };
  drawThrowPrediction(p, actor, result, api);
  assert.equal(p.arcLine.visible, true); assert.equal(p.arcRing.visible, false);
  assert.equal(p.arcLine.material.opacity, .55); assert.equal(p._s3ThrowExtraMarkers.length, 0);
  for (const outcome of ['unsupported', 'timeout', 'out-of-bounds', 'not-applicable', 'horizon'])
    assert.equal(confirmedThrowEndpoint({ ...prediction(), outcome }), false);
});

test('stationary aiming refreshes against moving world contacts at 30 Hz', () => {
  const { p, actor, G, prediction } = setup();
  p.updateArc(actor, true); assert.equal(p.subCalls, 1);
  const version = p.arcGeo.attributes.position.version;
  G.time = THROW_PREVIEW_INTERVAL / 2; p.prediction = prediction(8); p.updateArc(actor, true);
  assert.equal(p.subCalls, 1); assert.ok(p.arcRing.position.x < 4);
  assert.equal(p.arcGeo.attributes.position.version, version, 'a cached prediction must not re-upload geometry');
  G.time = THROW_PREVIEW_INTERVAL; p.updateArc(actor, true);
  assert.equal(p.subCalls, 2); assert.ok(p.arcRing.position.x > 7);
  assert.ok(p.arcGeo.attributes.position.version > version);
  assert.equal(p.legacyCalls, 0);
});

test('an active special receives its own guide even when the native sub-only show flag is false', () => {
  const { p, actor, prediction } = setup();
  p.updateArc(actor, true);
  actor.specialActive = { id: 'booyahBomb', phase: 'ready' };
  p.specialPrediction = { ...prediction(12), kind: 'booyahBomb' };
  p.updateArc(actor, false);
  assert.equal(p.specialCalls, 1); assert.equal(p.subCalls, 1);
  assert.equal(p._s3ThrowPrediction.kind, 'booyahBomb'); assert.equal(p.arcRing.visible, true);
  actor.specialActive.phase = 'recovery'; p.specialPrediction = null; p.updateArc(actor, false);
  assert.equal(p.arcRing.visible, false); assert.equal(p.arcLine.visible, false);
  assert.equal(p.subCalls, 1, 'special recovery cannot fall back to the equipped bomb');
});

test('pause, death and hide remove a formerly valid prediction without invoking flight', () => {
  const { p, actor, G } = setup();
  p.updateArc(actor, true); G.match.paused = true; p.updateArc(actor, true);
  assert.equal(p.subCalls, 1); assert.equal(p.arcRing.visible, false);
  assert.equal(p._s3ThrowPrediction, null);
  G.match.paused = false; p.updateArc(actor, true); actor.alive = false; p.updateArc(actor, true);
  assert.equal(p.subCalls, 2); assert.equal(p.arcLine.visible, false);
  actor.alive = true; p.updateArc(actor, true); p.updateArc(actor, false);
  assert.equal(p.subCalls, 3); assert.equal(p._s3ThrowPrediction, null);
});

test('weapon, gear, actor life, world and backward-clock transitions invalidate immediately', () => {
  const { p, actor, G } = setup();
  p.updateArc(actor, true);
  actor.s3.abilityPoints.subPower = 57; p.updateArc(actor, true);
  actor.netLife++; p.updateArc(actor, true);
  actor.weapon = { sub: 'pointSensor' }; p.updateArc(actor, true);
  G.level = {}; p.updateArc(actor, true);
  G.time = -1; p.updateArc(actor, true);
  assert.equal(p.subCalls, 6);
});

test('sequential explosion markers reuse shared resources and clear retires their scene nodes', () => {
  const { p, actor, api, scene, prediction } = setup();
  const result = { ...prediction(), explosions: [new THREE.Vector3(1, 2, 0), new THREE.Vector3(2, 4, 0)] };
  drawThrowPrediction(p, actor, result, api);
  const markers = [...p._s3ThrowExtraMarkers];
  assert.equal(markers.length, 2); assert.equal(scene.children.length, 4);
  assert.equal(markers[0].geometry, p.arcRing.geometry); assert.equal(markers[0].material, p.arcRing.material);
  drawThrowPrediction(p, actor, result, api); assert.equal(p._s3ThrowExtraMarkers[0], markers[0]);
  p.clear(); assert.equal(scene.children.length, 2); assert.equal(p.clears, 1);
  assert.equal(markers[0].parent, null); assert.equal(p._s3ThrowExtraMarkers.length, 0);
});

test('placed objects can show a single exact endpoint and invalid coordinates hide old geometry', () => {
  const { p, actor, api, prediction } = setup();
  const result = { ...prediction(), points: [new THREE.Vector3(0, 0, 0)], endpoint: new THREE.Vector3(0, 0, 0), outcome: 'deploy' };
  drawThrowPrediction(p, actor, result, api);
  assert.equal(p.arcLine.visible, false); assert.equal(p.arcRing.visible, true);
  drawThrowPrediction(p, actor, { ...result, points: [new THREE.Vector3(NaN, 0, 0)] }, api);
  assert.equal(p.arcRing.visible, false); assert.equal(p.arcLine.visible, false);
});

test('polyline reduction keeps an abrupt contact instead of cutting across it', () => {
  const { p, actor, api, prediction } = setup();
  const points = Array.from({ length: 100 }, (_, i) => new THREE.Vector3(i, i === 11 ? 10 : 0, 0));
  drawThrowPrediction(p, actor, { ...prediction(), points, endpoint: points.at(-1), normal: new THREE.Vector3(0, 1, 0) }, api);
  const attribute = p.arcGeo.attributes.position;
  assert.ok(Array.from({ length: p.arcGeo.drawRange.count }, (_, i) => attribute.getY(i)).includes(10));
  assert.equal(attribute.getX(0), 0); assert.equal(attribute.getX(3), 99);
});

test('a placement pattern without an artificial flight arc displays all confirmed destinations', () => {
  const { p, actor, api, prediction } = setup();
  const explosions = Array.from({ length: 12 }, (_, i) => ({ point: new THREE.Vector3(i, 0, 5), complete: true }));
  drawThrowPrediction(p, actor, { ...prediction(), points: [], outcome: 'landing-pattern', explosions }, api);
  assert.equal(p.arcLine.visible, false); assert.equal(p.arcRing.visible, false, 'the aim centre is not a thirteenth landing point');
  assert.equal(p._s3ThrowExtraMarkers.filter(m => m.visible).length, 12);
});

test('the special VFX can own a landing pattern without duplicate native arc markers', () => {
  const { p, actor, api, prediction } = setup();
  drawThrowPrediction(p, actor, prediction(), api); assert.equal(p.arcRing.visible, true);
  drawThrowPrediction(p, actor, { ...prediction(), presentationOwner: 'special-vfx', points: [],
    explosions: Array.from({ length: 12 }, (_, i) => ({ point: new THREE.Vector3(i, 0, 5), complete: true })) }, api);
  assert.equal(p.arcRing.visible, false); assert.equal(p.arcLine.visible, false);
  assert.equal(p._s3ThrowExtraMarkers.filter(m => m.visible).length, 0);
});

test('a committed special or rolling input invalidates a cached guide on the next rendered frame', () => {
  const { p, actor, G, prediction } = setup();
  actor.specialActive = { id: 'booyahBomb', phase: 'ready' };
  actor._s3AllSpecialState = { phase: 'ready' }; actor.intent = { sub: false, squid: false };
  p.specialPrediction = prediction();
  p.s3CanPredictSpecialTrajectory = a => a._s3AllSpecialState.throwAt === undefined && !a.intent.squid;
  p.updateArc(actor, false); assert.equal(p.specialCalls, 1);
  G.time = 1 / 60; actor._s3AllSpecialState.throwAt = 1;
  p.updateArc(actor, false); assert.equal(p.arcRing.visible, false); assert.equal(p.specialCalls, 1);
  delete actor._s3AllSpecialState.throwAt; p.updateArc(actor, false); assert.equal(p.arcRing.visible, true);
  actor.intent.squid = true; p.updateArc(actor, false); assert.equal(p.arcRing.visible, false);
});

test('the forecast charge key refreshes an explosion-count transition before the periodic timer', () => {
  const { p, actor, G, prediction } = setup();
  actor.weapon = { sub: 'fizzy' }; actor.weaponRunner.s3SubHold = 38 / 60;
  let chargeKey = 1;
  p.s3SubPredictionChargeKey = (_actor, options) => { assert.equal(options.anticipateRelease, true); return chargeKey; };
  p.updateArc(actor, true); assert.equal(p.subCalls, 1);
  G.time = 1 / 60; actor.weaponRunner.s3SubHold = 39 / 60; chargeKey = 2;
  p.prediction = { ...prediction(), explosions: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)] };
  p.updateArc(actor, true); assert.equal(p.subCalls, 2);
  assert.equal(p._s3ThrowExtraMarkers.filter(m => m.visible).length, 2);
});

test('ink color uses the admitted fallback cost and Ink Saver Sub modifier', () => {
  const { p, actor, api, prediction } = setup();
  api.SUB.suction = { inkCost: null, inkCostFallback: 70 }; actor.weapon = { sub: 'suction' };
  actor.ink = 0; drawThrowPrediction(p, actor, prediction(), api);
  assert.ok(Math.abs(p.arcLine.material.color.r - .84) < 1e-9);
  assert.ok(Math.abs(p.arcLine.material.color.g - .84) < 1e-9);
  actor.s3.modifiers = { inkSaverSub: .5 }; actor.ink = 35;
  drawThrowPrediction(p, actor, prediction(), api);
  assert.ok(p.arcLine.material.color.equals(actor.color.clone().multiplyScalar(1.4)));
});

test('known parts of a conditional special get markers while unresolved parts do not', () => {
  const { p, actor, api, prediction } = setup();
  drawThrowPrediction(p, actor, { ...prediction(), points: [], complete: false, targetDependent: true, outcome: 'action-dependent',
    explosions: [
      { point: new THREE.Vector3(0, 0, 0), complete: false },
      { point: new THREE.Vector3(-3, 0, 0), complete: true },
      { point: new THREE.Vector3(3, 0, 0), complete: true },
    ] }, api);
  assert.equal(p.arcRing.visible, false); assert.equal(p.arcLine.visible, false);
  assert.equal(p._s3ThrowExtraMarkers.filter(m => m.visible).length, 2);
});

test('all three trizooka trajectories are drawn and only owned buffers are disposed on clear', () => {
  const { p, actor, api, scene, prediction } = setup();
  const trajectories = [prediction(3), prediction(6), prediction(9)];
  const result = { ...trajectories[0], trajectories };
  drawThrowPrediction(p, actor, result, api);
  const lines = [...p._s3ThrowExtraLines];
  assert.equal(lines.length, 2); assert.equal(scene.children.length, 4);
  assert.equal(lines[0].geometry.attributes.position.getX(1), 6);
  assert.equal(lines[1].geometry.attributes.position.getX(1), 9);
  assert.equal(lines[0].material, p.arcLine.material); assert.notEqual(lines[0].geometry, p.arcGeo);
  let secondaryDisposed = 0, nativeDisposed = 0;
  lines.forEach(line => line.geometry.addEventListener('dispose', () => secondaryDisposed++));
  p.arcGeo.addEventListener('dispose', () => nativeDisposed++);
  p.clear();
  assert.equal(secondaryDisposed, 2); assert.equal(nativeDisposed, 0); assert.equal(scene.children.length, 2);
});

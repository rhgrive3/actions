#!/usr/bin/env node
// Analyze captured native matrices; this does not rerender or modify a pose.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
assert(!fs.existsSync(output), 'Preserve previous analysis');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tags = ['main7e', '702', '708'];
const receipts = Object.fromEntries(tags.map(tag => [tag, JSON.parse(fs.readFileSync(path.join(root, tag, 'receipt.json')))]));
const rows = Object.fromEntries(tags.map(tag => [tag, Object.fromEntries(receipts[tag].rows.map(row => [row.label, row]))]));
const nativeKeys = ['tick', 'position', 'velocity', 'alive', 'grounded', 'groundHit', 'phase', 'spawnTime', 'spawnPose', 'ink', 'turf', 'rolling', 'flick', 'fire', 'physical', 'previous', 'shotCount', 'paintCalls', 'projectiles'];
const sameFields = (a, b, keys, label) => {
  for (const key of keys) assert.deepEqual(a[key], b[key], `${label}.${key}`);
};
// These bounds round-trip vertices through different world/inverse matrices.
// Native state and equal-pose output retain exact comparisons below.
let maxIntrinsicBoundsRoundtripDifference = 0;
const sameIntrinsicBounds = (a, b, label) => {
  for (const field of ['min', 'max', 'size']) for (let i = 0; i < 3; i++) {
    const difference = Math.abs(a[field][i] - b[field][i]);
    maxIntrinsicBoundsRoundtripDifference = Math.max(maxIntrinsicBoundsRoundtripDifference, difference);
    assert(difference < 1e-12, `${label}.${field}[${i}] round-trip difference ${difference}`);
  }
};
const builds = tags.map(tag => {
  const r = receipts[tag];
  assert.equal(r.status, 'captured');
  assert.deepEqual(r.errors, []);
  const archived = path.join(root, tag, 'build-manifest.json.gz');
  const manifest = JSON.parse(fs.existsSync(archived) ? gunzipSync(fs.readFileSync(archived)) : fs.readFileSync(path.join(r.site, 'inkwave-build.json')));
  assert.equal(r.build, manifest.contentHash);
  assert.equal(r.runtimeResponses.length, 4);
  for (const response of r.runtimeResponses) {
    assert.equal(response.status, 200);
    assert.equal(response.sha256, manifest.artifacts[response.path.slice(1)]);
  }
  return {tag, contentHash: r.build, inputHash: manifest.inputHash, optimization: manifest.build.optimization, version: manifest.build.revision, inputCount: Object.keys(manifest.files).length, artifactCount: Object.keys(manifest.artifacts).length, servedRuntimeResponses: r.runtimeResponses};
});
const normalLabels = Object.keys(rows['708']).filter(label => label === 'settled' || label.startsWith('normal-'));
for (const label of normalLabels) {
  assert.deepEqual(rows['702'][label], rows['708'][label], `702/708 ${label}`);
  sameFields(rows.main7e[label], rows['708'][label], [...nativeKeys, 'camera', 'seed', 'palette', 'geometry'], `main7e/708 ${label}`);
  sameIntrinsicBounds(rows.main7e[label].localDrumBounds, rows['708'][label].localDrumBounds, `main7e/708 ${label}`);
}
assert.deepEqual(rows.main7e['normal-145'], rows['708']['normal-145'], 'Original main and candidate settled post-land output');
assert.deepEqual(rows.main7e.settled, rows['708'].settled, 'Original main and candidate initial settled output');
const oldTrace = receipts['702'].missTrace, newTrace = receipts['708'].missTrace;
assert.equal(oldTrace.length, newTrace.length);
oldTrace.forEach((row, i) => sameFields(row, newTrace[i], nativeKeys, `missTrace[${i}]`));
for (const label of ['miss-air', 'miss-touchdown', 'miss-post']) sameFields(rows['702'][label], rows['708'][label], [...nativeKeys, 'camera'], label);
assert.equal(rows['702']['miss-air'].eligible, true);
assert.equal(rows['708']['miss-air'].eligible, false);
assert.equal(rows['708']['miss-post'].eligible, true);
assert.equal(rows['708']['miss-post'].phase, null);
assert.deepEqual(rows['708']['miss-post'].channels.ANCR, [-2.5, Math.fround(.04), 1]);
assert.deepEqual(rows['702']['miss-post'], rows['708']['miss-post'], 'Both candidates converge to the same actual supported ready');
for (const r of Object.values(receipts).flatMap(r => [...r.rows, ...(r.missTrace || [])])) {
  for (const key of ['shotCount', 'paintCalls', 'projectiles', 'turf']) assert.equal(r[key], 0, `${r.label || r.tick}.${key}`);
  assert.equal(r.ink, 100);
  assert.equal(r.rolling, false);
  assert.equal(r.flick, -1);
}
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, x, i) => sum + x * b[i], 0)))) * 180 / Math.PI;
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const transition = (tag, from, to) => ({tag, from, to, ticks: rows[tag][to].tick - rows[tag][from].tick, pivotWorldRotationDegrees: angle(rows[tag][from].pivot.quaternion, rows[tag][to].pivot.quaternion), pivotWorldTranslation: distance(rows[tag][from].pivot.position, rows[tag][to].pivot.position)});
const detailed = ['settled', 'normal-60', 'normal-61', 'normal-133', 'normal-134', 'normal-145'].map(label => {
  const r = rows['708'][label];
  for (const object of ['root', 'kid', 'pivot', 'off', 'drum']) for (const value of r[object].scale) assert(Math.abs(value - 1) < 1e-12, `${label}.${object}.scale`);
  sameIntrinsicBounds(r.localDrumBounds, rows['708'].settled.localDrumBounds, label);
  assert.deepEqual(r.pivot.localPosition, rows['708'].settled.pivot.localPosition);
  assert.deepEqual(r.pivot.localQuaternion, rows['708'].settled.pivot.localQuaternion);
  const layer = r.layers._poseSpawn;
  const spawnChannelL1 = layer ? layer.before.reduce((sum, x, i) => sum + Math.abs(x - layer.after[i]), 0) : 0;
  if (label === 'normal-61') assert.equal(spawnChannelL1, 0);
  return {label, pivotWorldPosition: r.pivot.position, pivotWorldQuaternion: r.pivot.quaternion, pivotLocalPosition: r.pivot.localPosition, pivotLocalQuaternion: r.pivot.localQuaternion, offLocalPosition: r.off.localPosition, offLocalQuaternion: r.off.localQuaternion, worldDrumSize: r.worldDrumBounds.size, intrinsicDrumSize: r.localDrumBounds.size, projectedPixels: [r.projectedDrum.pixelWidth, r.projectedDrum.pixelHeight], cameraWorldPosition: r.camera.position, cameraRelativeMatrix: r.camera.relativeMatrix, fov: r.camera.fov, body: r.body, ANC: r.channels.ANC, ANCR: r.channels.ANCR, AFOLT: r.channels.AFOLT, AFOLR: r.channels.AFOLR, spawnChannelL1};
});
const getProjection = (pose, camera) => receipts['708'].cameraCross.find(row => row.pose === pose && row.camera === camera).projected;
const p61 = getProjection('normal-61', 'normal-61'), p145 = getProjection('normal-145', 'normal-145'), fixedCamera = getProjection('normal-61', 'normal-145');
const ratio = (a, b) => [a.pixelWidth / b.pixelWidth, a.pixelHeight / b.pixelHeight];
const premature = trace => trace.filter(r => r.phase === 'landing' && !r.grounded && r.spawnPose.phase === 'off' && r.eligible).length;
const result = {
  scope: 'Native offline Game, fixed 60Hz input; normal versioned emitted builds. Missed support uses a genuine native lower dry collision floor while retaining the stage visual. No transport, FPS, retail equivalence or visual acceptance claim.',
  builds,
  matchedNormalRows702To708: normalLabels,
  originalMainInitialAndPost145Exact: true,
  normalNativeFieldsAndCameraAllThreeExact: true,
  matchedMissNativeRows: newTrace.length,
  nativeFieldsCompared: nativeKeys,
  intrinsicBoundsRoundtrip: {maxDifference: maxIntrinsicBoundsRoundtripDifference, tolerance: 1e-12, units: 'world units'},
  prematureAirborneReady: {old702: premature(oldTrace), new708: premature(newTrace)},
  missedSupport: Object.fromEntries(['miss-air', 'miss-touchdown', 'miss-post'].map(label => {
    const r = rows['708'][label];
    return [label, {tick: r.tick, position: r.position, grounded: r.grounded, groundHit: r.groundHit, lifecycle: r.phase, spawnTime: r.spawnTime, eligible: r.eligible, ANCR: r.channels.ANCR, projectedPixels: [r.projectedDrum.pixelWidth, r.projectedDrum.pixelHeight]}];
  })),
  noInput: {shots: 0, paintSplatCalls: 0, projectiles: 0, turf: 0, ink: 100, rolling: false, flick: -1},
  dimensionsAndTransforms: detailed,
  transitions: [transition('708', 'normal-60', 'normal-61'), transition('708', 'normal-61', 'normal-62'), transition('main7e', 'normal-60', 'normal-61'), transition('main7e', 'normal-133', 'normal-134')],
  crossProjection: receipts['708'].cameraCross,
  ratios: {actual61To145: ratio(p61, p145), frozen61PoseCamera61To145: ratio(p61, fixedCamera), frozen145CameraPose61To145: ratio(fixedCamera, p145)},
  receiptSHA256: Object.fromEntries(tags.map(tag => [tag, hash(fs.readFileSync(path.join(root, tag, 'receipt.json')))])),
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({status: 'pass', matchedNormalRows: normalLabels.length, matchedMissRows: newTrace.length, premature: result.prematureAirborneReady, transitions: result.transitions, ratios: result.ratios}, null, 2));

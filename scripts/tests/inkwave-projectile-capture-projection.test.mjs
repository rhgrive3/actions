import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { installProjectileCaptureProjection } from '../lib/inkwave-projectile-capture-projection.mjs';
function fixture(fov = 60) {
  const camera = { fov, aspect: 16 / 9, zoom: 1, projectionMatrix: { elements: Array(16).fill(0) },
    updateProjectionMatrix() {
      const y = this.zoom / Math.tan(this.fov * Math.PI / 360);
      this.projectionMatrix.elements[0] = y / this.aspect;
      this.projectionMatrix.elements[5] = y;
    } };
  camera.updateProjectionMatrix();
  const context = { window: { __G: { camera } }, innerWidth: 1280, innerHeight: 720 };
  vm.runInNewContext('(' + installProjectileCaptureProjection.toString() + ')()', context);
  return { camera, context, set: context.window.__iwSetProjectileCaptureProjection,
    check: context.window.__iwAssertProjectileCaptureProjection };
}
test('inherited 60 and 55 degree cameras become the same actual humanoid capture projection', () => {
  const before = fixture(60), after = fixture(55);
  assert.throws(() => before.check('inherited'), /actual vertical FOV 60/);
  before.set(); after.set();
  assert.equal(before.camera.fov, 55);
  assert.deepEqual(before.camera.projectionMatrix, after.camera.projectionMatrix);
  assert.deepEqual(JSON.parse(JSON.stringify(before.check('render'))), { verticalFov: 55, aspect: 16 / 9, zoom: 1 });
});
test('assertion rejects actual camera divergence without repairing it or trusting a receipt', () => {
  const f = fixture(); f.set();
  const priorReceipt = { fov: 55 };
  f.camera.fov = 60; f.camera.updateProjectionMatrix();
  assert.throws(() => f.check('after-render'), /diverged at after-render/);
  assert.equal(f.camera.fov, 60); assert.equal(priorReceipt.fov, 55);
});
test('stale projection matrix fails even when actual fov property still says 55', () => {
  const f = fixture(); f.set(); f.camera.projectionMatrix.elements[5] = 1;
  assert.throws(() => f.check('before-screenshot'), /diverged/);
});
for (const [field, value] of [['fov', NaN], ['aspect', 1], ['zoom', 2]]) {
  test('rejects invalid actual ' + field, () => { const f = fixture(); f.set(); f.camera[field] = value; assert.throws(() => f.check('guard'), /diverged/); });
}
test('rejects off-center and unsupported viewport projections', () => {
  const f = fixture(); f.set(); f.camera.projectionMatrix.elements[8] = 0.1;
  assert.throws(() => f.check('offset'), /diverged/);
  const narrow = fixture(); narrow.context.innerWidth = 720;
  assert.throws(() => narrow.set(), /diverged/);
});
test('driver sets camera fixture and brackets real render and image boundaries without changing receipts', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs', import.meta.url), 'utf8');
  assert.match(source, /page\.addInitScript\(installProjectileCaptureProjection\)/);
  assert.match(source, /__iwSetProjectileCaptureProjection\(\);\s*cam\.aspect/);
  assert.match(source, /__iwAssertProjectileCaptureProjection\('before-render'\);\s*G\.game\.R\.render\(\);\s*window\.__iwAssertProjectileCaptureProjection\('after-render'\)/);
  for (const phase of ['before-screenshot', 'after-screenshot', 'before-crop', 'after-crop']) assert.ok(source.includes(`__iwAssertProjectileCaptureProjection('${phase}')`));
  assert.match(source, /aim: sample\.aim, fov: cam\.fov/);
  assert.match(source, /fov: camera\.fov, actorInkHex/);
});
test('CI compares the same canonical projection with complete evidence and no historical FOV normalization', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml', import.meta.url), 'utf8');
  const begin = workflow.indexOf('      - name: Verify exact paired native physical states, firing workloads and image hashes');
  assert(begin >= 0);
  const end = workflow.indexOf('      - name:', begin + 10);
  const step = workflow.slice(begin, end);
  assert.match(step, /compare-inkwave-projectile-captures\.py --before \.ci-scratch\/projectile-visuals\/before --after \.ci-scratch\/projectile-visuals\/after/);
  assert.match(step, /--require-complete\s*$/);
  assert.doesNotMatch(step, /--admit-camera-epoch|CAMERA_EPOCH|continue-on-error|if:/);
});

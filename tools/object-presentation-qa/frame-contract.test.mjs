import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFrameComparisons } from './frame-contract.mjs';
const fixture = () => ['before','after'].map(side => ({ name: side + '-front', lighting: { exposure: .94, pmrem: true, post: ['Render','AO','Bloom','Grade','Output'] }, camera: { position: [0,0,3.5], quaternion: [0,0,0,1], fov: 25 } }));
const shots = [{ name: 'before-front' }, { name: 'after-front' }];
test('same-condition before/after frames are paired and complete', () => {
  assert.deepEqual(verifyFrameComparisons(fixture(), shots), { pairs: 1, sameLighting: true, sameCameras: true });
});
test('camera, lighting, omitted output or duplicate frame mismatch fails closed', () => {
  let rows = fixture(); rows[1].camera.position[1] = .01; assert.throws(() => verifyFrameComparisons(rows, shots), /camera/);
  rows = fixture(); rows[1].lighting.exposure = 1; assert.throws(() => verifyFrameComparisons(rows, shots), /lighting/);
  assert.throws(() => verifyFrameComparisons(fixture().slice(0,1), shots), /receipt/);
  rows = fixture(); rows[1].name = rows[0].name; assert.throws(() => verifyFrameComparisons(rows, shots), /exactly one/);
});

test('source-loaded owner and foot pose match exactly while model bounds may differ', () => {
  const rows = fixture();
  for (const [i, row] of rows.entries()) row.sourceOwner = { status: 'ready', active: true, sourceUpper: false, seed: 123, footBones: { footL: [-.1, 0, 0], footR: [.1, 0, 0] }, podBounds: { min: [-i, -1, -1], max: [i, 1, 1] } };
  verifyFrameComparisons(rows, shots);
  for (const [key, value] of [['status', 'loading'], ['active', false], ['sourceUpper', true], ['seed', 124], ['footBones', { footL: [-.1, .001, 0], footR: [.1, 0, 0] }]]) {
    const changed = structuredClone(rows); changed[1].sourceOwner[key] = value;
    assert.throws(() => verifyFrameComparisons(changed, shots), /source-owner|Player00/);
  }
  delete rows[1].sourceOwner;
  assert.throws(() => verifyFrameComparisons(rows, shots), /source-owner/);
});

test('source-loaded frame names require both complete finite owner receipts', () => {
  const rows = fixture().map(row => ({ ...row, name: row.name.replace('-front', '-source-loaded-actor-front') }));
  const saved = rows.map(({ name }) => ({ name }));
  assert.throws(() => verifyFrameComparisons(rows, saved), /source-owner/);
  const owner = { variant: 'Player00', status: 'ready', active: true, sourceUpper: null, seed: 123, footBones: { footL: [0, 0, 0], footR: [0, 0, 0] } };
  for (const row of rows) row.sourceOwner = structuredClone(owner);
  verifyFrameComparisons(rows, saved);
  for (const [key, value] of [['active', false], ['variant', 'Player01']]) {
    const changed = structuredClone(rows); for (const row of changed) row.sourceOwner[key] = value;
    assert.throws(() => verifyFrameComparisons(changed, saved), /source-loaded/);
  }
  for (const key of ['active', 'sourceUpper', 'seed']) {
    const changed = structuredClone(rows); for (const row of changed) delete row.sourceOwner[key];
    assert.throws(() => verifyFrameComparisons(changed, saved), /source-owner/);
  }
  for (const value of [null, NaN, Infinity, '0']) {
    const changed = structuredClone(rows); for (const row of changed) row.sourceOwner.footBones.footL[0] = value;
    assert.throws(() => verifyFrameComparisons(changed, saved), /source-owner/);
  }
  for (const value of [null, NaN, Infinity]) {
    const changed = structuredClone(rows); for (const row of changed) row.sourceOwner.seed = value;
    assert.throws(() => verifyFrameComparisons(changed, saved), /source-owner/);
  }
});

test('ordered contact sheets retain original hashes and exact simulation times', async () => {
  const { verifyContactSheetPlan } = await import('./frame-contract.mjs');
  const names = ['before-release-before', 'before-release-0ms', 'before-release-17ms', 'before-release-33ms'];
  const rows = names.map((name, i) => ({ name, t: i ? (i - 1) / 60 : 'pre-event' }));
  const screenshots = names.map(name => ({ name, file: name + '.png', sha256: 'abc-' + name }));
  const plans = [{ name: 'before-clam-release-sequence', frames: names.map(name => ({ name })) }];
  const [sheet] = verifyContactSheetPlan(rows, screenshots, plans);
  assert.equal(sheet.width, 1800); assert.equal(sheet.height, 492);
  assert.deepEqual(sheet.frames.map(frame => frame.label), ['before', '0.0 ms', '16.7 ms', '33.3 ms']);
  assert.equal(sheet.frames[2].sourceSha256, screenshots[2].sha256);
  assert.deepEqual(verifyContactSheetPlan(rows, screenshots), []);
  const wrongTime = structuredClone(rows); wrongTime[2].t = .016;
  assert.throws(() => verifyContactSheetPlan(wrongTime, screenshots, plans), /60 Hz/);
  const wrongLabel = structuredClone(plans); wrongLabel[0].frames[2].label = '16.0 ms';
  assert.throws(() => verifyContactSheetPlan(rows, screenshots, wrongLabel), /time receipt/);
  const mixed = structuredClone(plans); mixed[0].frames[3].name = 'after-release-33ms';
  assert.throws(() => verifyContactSheetPlan(rows, screenshots, mixed), /same-version/);
  assert.throws(() => verifyContactSheetPlan(rows, screenshots.slice(1), plans), /existing frame/);
  assert.throws(() => verifyContactSheetPlan(rows, screenshots, [...plans, ...plans]), /unique contact/);
});

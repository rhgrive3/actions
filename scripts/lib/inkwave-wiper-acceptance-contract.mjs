import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const WIPER_CAPTURE_FRAMES = Object.freeze({charged:Object.freeze([1, 3, 8]),tap:Object.freeze([1, 2, 3])});
export const WIPER_CAPTURE_CASES = Object.freeze(['normal', 'lite', 'heavy'].flatMap(kind => ['charged', 'tap'].map(action => Object.freeze({
  key: `${kind}-${action}`, id: `s3-saber-${kind}`, sourceActor: `WeaponSaber${kind[0].toUpperCase()}${kind.slice(1)}`,
  action, hold: action === 'charged' ? 80 : 2,
  descriptor: action === 'charged' ? 'saber-vertical' : 'saber-horizontal',
  mesh: action === 'tap' ? 'slashH' : kind === 'heavy' ? 'slashV' : 'wetSlashV',
}))));

export function wiperBuildReceiptBinding(manifestBytes) {
  const manifest=JSON.parse(manifestBytes),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.contentHash,sha(JSON.stringify(manifest.artifacts)),'Expected immutable artifact manifest');
  assert.equal(manifest.inputHash,sha(JSON.stringify(manifest.files)),'Expected immutable input manifest');
  assert.equal(manifest.build.esbuild,'0.28.2');assert.equal(manifest.build.optimization,'esbuild-minify');
  assert.match(manifest.build.revision,/^[a-f0-9]{64}$/);
  const modules={};
  for(const name of ['s3-projectile-shapes.mjs','s3-ink-sheets.mjs']){
    const key=`_versions/${manifest.build.revision}/patches/splatoon3/runtime/${name}`;
    assert.match(manifest.artifacts[key]||'',/^[a-f0-9]{64}$/);modules[key]=manifest.artifacts[key];
  }
  return {contentHash:manifest.contentHash,inputHash:manifest.inputHash,manifestSha256:sha(manifestBytes),modules};
}

export function assertWiperCaptureReceipt(receipt, {sourceSha, contentHash, inputHash, manifestSha256, modules}) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.match(contentHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.kind, 'controlled-native-wiper-visual-acceptance');
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.sourceIdentity.checkoutSha, sourceSha);
  assert.equal(receipt.sourceIdentity.checkoutIdentityStatus, 'verified-git-head');
  assert.equal(receipt.contentHash, contentHash);
  assert.equal(receipt.inputHash,inputHash);assert.equal(receipt.manifestSha256,manifestSha256);
  assert.equal(Object.keys(modules).length,2,'Both expected native modules are mandatory');
  assert.deepEqual(receipt.modules,modules,'Exact actual immutable build modules, not self-claimed maps');
  for (const key of ['manifestSha256', 'harnessSha256', 'contractSha256', 'launcherSha256', 'inputHash']) assert.match(receipt[key], /^[a-f0-9]{64}$/);
  assert.equal(receipt.sandbox, true);
  assert.deepEqual(receipt.errors, []);
  assert.equal(receipt.cleanup.browserClosed, true);
  assert.equal(receipt.cleanup.serverClosed, true);
  assert.deepEqual(receipt.cases.map(c => c.key), WIPER_CAPTURE_CASES.map(c => c.key));
  for (const [i, c] of receipt.cases.entries()) {
    const expected = WIPER_CAPTURE_CASES[i];
    for (const key of ['id', 'sourceActor', 'action', 'hold', 'descriptor', 'mesh']) assert.equal(c[key], expected[key]);
    assert.equal(c.entry.gestures.length, 2);
    assert.ok(c.entry.gestures.every(g => g.trusted === true));
    assert.equal(c.contextClosed, true);
    assert.equal(c.retired, true);
    assert.equal(c.resources.disposed, true);
    assert.equal(c.resources.wetAllocated, expected.mesh === 'wetSlashV');
    assert.equal(c.initial.pipeline.ao, true); assert.equal(c.initial.pipeline.shadows, true);
    assert.deepEqual(c.frames.map(f => f.frame), WIPER_CAPTURE_FRAMES[expected.action]);
    for (const f of c.frames) {
      assert.equal(f.frame, f.tick - c.firstBirth.tick + 1, 'frame 1 is the first active birth itself');
      assert.equal(f.state.projectiles.length, 1, 'one native paid slash, not two physical shots');
      const p = f.state.projectiles[0];
      assert.equal(p.id, expected.id); assert.equal(p.sourceActor, expected.sourceActor); assert.equal(p.descriptor, expected.descriptor);
      assert.equal(p.birthPending, false); assert.ok(p.delay <= 0); assert.ok(Number.isFinite(p.age));
      assert.equal(f.mesh.name, expected.mesh); assert.equal(f.mesh.instances, 2);
      assert.ok(f.mesh.trianglesPerInstance > 0 && f.mesh.trianglesPerInstance <= 12000);
      assert.ok(f.mesh.attributeBytes > 0 && f.mesh.attributeBytes <= 1024 * 1024);
      assert.equal(f.drawPure, true); assert.equal(f.screenshotStateStable, true);
      assert.deepEqual(f.images.map(im => im.view), ['native-postprocessed', 'fixed-side-raw']);
      for (const im of f.images) {
        assert.match(im.file, /^[\w-]+\.png$/); assert.match(im.sha256, /^[a-f0-9]{64}$/); assert.ok(im.bytes > 1000);
        assert.ok(im.render.calls > 0 && im.render.triangles > 0);
        assert.ok(im.drawReceipts.some(d => !d.override && d.inspection === (im.view === 'fixed-side-raw')), 'Actual source mesh must draw through the declared camera/pipeline');
        assert.ok(Number.isFinite(im.luminanceRange) && im.luminanceRange >= 8, 'actual non-flat pixels required');
      }
      assert.ok(f.mesh.projectedVertices > 0 && f.mesh.visibleProjectedVertices > 0, 'some actual geometry must project into the fixed inspection frame');
    }
  }
  assert.deepEqual(Object.keys(receipt.consumed).sort(), Object.keys(receipt.modules).sort());
  for (const [file, digest] of Object.entries(receipt.modules)) assert.equal(receipt.consumed[file], digest);
  return receipt;
}

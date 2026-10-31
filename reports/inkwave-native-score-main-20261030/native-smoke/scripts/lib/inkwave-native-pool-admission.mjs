import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {hash, indexPrebuiltRuntimeAssets} from './inkwave-runtime-evidence.mjs';

export function assertFiniteNumbers(value, location = 'result', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'Non-finite number at ' + location + ': ' + String(value));
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) assertFiniteNumbers(child, location + '.' + key, seen);
}

export function assertNativeInitial(initial) {
  assertFiniteNumbers(initial, 'initial');
  assert.equal(initial.native, true, 'actual native stage required before timing');
  assert.equal(initial.actors, 8, 'full eight-actor native battle before timing');
  assert.equal(initial.bots, 7, 'seven actual native bots before timing');
  assert.equal(initial.sourceCharacters, 8, 'eight ready native source characters before timing');
  for (const key of ['triangles', 'paintFaces', 'atlas'])
    assert.ok(Number.isSafeInteger(initial[key]) && initial[key] > 0, 'positive native ' + key);
  assert.ok(Number.isFinite(initial.ppm) && initial.ppm > 0, 'positive native paint scale');
}

export function parseLfsPointer(bytes, file) {
  const match = /^version https:\/\/git-lfs.github.com\/spec\/v1\noid sha256:([a-f0-9]{64})\nsize (\d+)\n?$/.exec(bytes.toString('utf8'));
  assert.ok(match, 'Committed Git LFS pointer required: ' + file);
  const size = Number(match[2]);
  assert.ok(Number.isSafeInteger(size) && size >= 0, 'Valid committed LFS size: ' + file);
  return {sha256: match[1], bytes: size};
}

export function verifyNativePoolSourceBinding(site, root, sourceSha, manifest, stage) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/, 'full source SHA');
  assert.match(stage, /^[-a-z0-9]+$/, 'safe native stage');
  assert.ok(manifest.build?.nativeStages?.prebuilt?.stages?.[stage], 'requested native prebuilt stage admitted');
  const privateArtifacts = indexPrebuiltRuntimeAssets(site, manifest), receipts = {}, privateRecords = [];
  const siteRoot = fs.realpathSync(site);
  const read = file => {
    const resolved = fs.realpathSync(path.join(site, file));
    assert.ok(resolved.startsWith(siteRoot + path.sep), 'asset remains within site: ' + file);
    return fs.readFileSync(resolved);
  };
  // Public bodies have already been verified by verifyRuntimeBuild. Seal their
  // admitted byte lengths too, so each subsequent HTTP response checks both.
  for (const [file, expectedHash] of Object.entries(manifest.artifacts)) {
    const bytes = read(file);
    assert.equal(hash(bytes), expectedHash, 'public admission hash: ' + file);
    receipts[file] = {sha256: expectedHash, bytes: bytes.length};
  }
  for (const [file, expectedHash] of Object.entries(privateArtifacts).sort()) {
    const pointer = execFileSync('git', ['show', sourceSha + ':' + file], {cwd: root, maxBuffer: 4096});
    const committed = parseLfsPointer(pointer, file), bytes = read(file), actualHash = hash(bytes);
    assert.equal(expectedHash, committed.sha256, 'sealed receipt matches committed LFS oid: ' + file);
    assert.equal(actualHash, committed.sha256, 'private body matches committed LFS oid: ' + file);
    assert.equal(bytes.length, committed.bytes, 'private body matches committed LFS size: ' + file);
    receipts[file] = committed;
    privateRecords.push({file, ...committed, actualSha256: actualHash, actualBytes: bytes.length, status: 'verified'});
  }
  assert.ok(privateRecords.some(record => record.file === 'native-prebuilt/' + stage + '/stage.json'), 'requested stage source binding retained');
  return {receipts, privateArtifacts, evidence: {sourceSha, stage, status: 'verified', publicFiles: Object.keys(manifest.artifacts).length, privateFiles: privateRecords.length, privateRecords}};
}

export function verifyServedBody(file, bytes, receipt) {
  assert.ok(receipt, 'HTTP asset admitted: ' + file);
  assert.equal(bytes.length, receipt.bytes, 'HTTP asset byte size unchanged: ' + file);
  const actualHash = hash(bytes);
  assert.equal(actualHash, receipt.sha256, 'HTTP asset SHA unchanged: ' + file);
  return {sha256: actualHash, bytes: bytes.length};
}

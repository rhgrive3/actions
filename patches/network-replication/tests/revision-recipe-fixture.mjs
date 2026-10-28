// Exercise the actual production revision expression, including prepared asset hashes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function emittedRevision(rel, bytes, {cached = false, inputHash = 'identity-only'} = {}) {
  const build = fs.readFileSync(new URL('../../../scripts/build-inkwave.mjs', import.meta.url), 'utf8');
  const recipes = build.split('\n').filter(line => line.startsWith('const revision = '));
  assert.equal(recipes.length, 1, 'One actual production revision expression');
  const BUILD = '/virtual-build', file = path.join(BUILD, rel);
  return vm.runInNewContext(recipes[0] + '\nrevision;', {
    BUILD, path, sha256: hash, versionFiles: [file],
    loadingPlan: {inputHash, assets: cached ? {[rel]: [bytes.length, hash(bytes)]} : {}},
    fs: {readFileSync(name) { assert.equal(name, file); assert.equal(cached, false, 'Cached digest avoids rereading'); return bytes; }},
  }, {timeout: 1000, contextCodeGeneration: {strings: false, wasm: false}});
}

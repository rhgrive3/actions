import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBuildIdentity, sha256 } from '../../patches/splatoon3/adapter.mjs';
import { SUITES, sourceKey } from './config.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const [suite, config] of Object.entries(SUITES)) test(suite + ' actual runtime sources affect official build identity, including added modules', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'object-identity-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const src = path.join(temp, 'src'), patch = path.join(temp, 'patch'), out = path.join(temp, 'out');
  for (const dir of [src, patch, out]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(src, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(out, 'artifact.js'), '// fixed emitted fixture\n');
  const sources = config.before.concat(config.added).map(file => {
    const bytes = fs.readFileSync(path.join(root, file)), local = path.join(patch, file.replace(/^patches\/splatoon3\//, ''));
    fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, bytes);
    return { file, local, bytes };
  });
  const initial = writeBuildIdentity(src, out, patch);
  assert.equal(initial.inputHash, sha256(JSON.stringify(initial.files)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'inkwave-build.json'))), initial, 'official serialized manifest');
  for (const { file, local, bytes } of sources) {
    assert.equal(initial.files[sourceKey(file)], sha256(bytes), 'source is included in official writer: ' + file);
    fs.appendFileSync(local, '\n');
    const changed = writeBuildIdentity(src, out, patch);
    assert.notEqual(changed.files[sourceKey(file)], initial.files[sourceKey(file)], 'one-byte change is represented');
    assert.notEqual(changed.inputHash, initial.inputHash, 'official inputHash follows one-byte change');
    assert.equal(changed.contentHash, initial.contentHash, 'negative isolates input identity from fixed output');
    fs.writeFileSync(local, bytes);
    assert.equal(writeBuildIdentity(src, out, patch).inputHash, initial.inputHash, 'exact restore returns same identity');
  }
});

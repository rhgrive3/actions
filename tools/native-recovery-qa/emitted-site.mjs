// QA-only immutable production namespace. Never fall back to authored modules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function emittedEntry(build, relative) {
  assert.match(build?.build?.revision || '', /^[a-f0-9]{64}$/, 'exact build revision');
  assert.equal(build.build.optimization, 'esbuild-minify', 'production optimization');
  assert(relative && !relative.startsWith('/') && !relative.includes('\\') && !relative.split('/').some(x => !x || x === '.' || x === '..'), 'safe emitted relative path');
  assert(!relative.startsWith('_versions/'), 'caller supplies logical module path');
  const entry = '_versions/' + build.build.revision + '/' + relative;
  assert.match(build.artifacts?.[entry] || '', /^[a-f0-9]{64}$/, 'missing exact emitted module: ' + entry);
  return entry;
}
export function loadEmittedSite(site) {
  site = path.resolve(site);
  const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
  assert.equal(hash(JSON.stringify(build.artifacts)), build.contentHash, 'emitted manifest content hash');
  assert.equal(hash(JSON.stringify(build.files)), build.inputHash, 'emitted manifest input hash');
  const read = relative => {
    const entry = emittedEntry(build, relative), file = path.join(site, entry), bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), build.artifacts[entry], 'emitted byte hash: ' + entry);
    return { entry, file, bytes };
  };
  const html = fs.readFileSync(path.join(site, 'index.html'));
  assert.equal(hash(html), build.artifacts['index.html'], 'emitted index hash');
  const bases = [...html.toString().matchAll(/<base\s+href=["']([^"']+)["']\s*>/g)].map(m => m[1]);
  assert.deepEqual(bases, ['./_versions/' + build.build.revision + '/'], 'index and manifest revision must agree');
  return { site, build, read };
}

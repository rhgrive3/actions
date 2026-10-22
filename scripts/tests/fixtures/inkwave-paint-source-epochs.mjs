import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const blob = bytes => createHash('sha1').update('blob ' + Buffer.byteLength(bytes) + '\0').update(bytes).digest('hex');
// Additive immutable fixtures. The original historical archives are unchanged.
const raw = fs.readFileSync(new URL('../../fixtures/inkwave-open-pr-af66-sources.json', import.meta.url), 'utf8');
assert.equal(blob(raw), '13661ec34f512985267156c48ec1178ee2008655');
const prior = JSON.parse(raw);
for (const row of Object.values(prior.paths)) assert.equal(blob(row.content), row.gitBlob);
const bytes = fs.readFileSync(new URL('../../fixtures/inkwave-paint-catalogue-epochs.json.gz', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f107be67fc3112852bde20111cdafd268ff4170fcae23a354c0f69cfc18b406c');
const catalogue = JSON.parse(gunzipSync(bytes));
assert.equal(catalogue.schema, 1);
assert.equal(catalogue.path, 'patches/splatoon3/runtime/main-weapon-catalog.mjs');
for (const [name, commit, gitBlob] of [
  ['pr1746', 'f31238a48b9d1a4af2d4f5f5f9182af777a79c83', 'b63b0bc1ebf9380967c11e77cc934319057ec410'],
  ['main9fe', '9fe6f215c17523c2c59dc786a3a5ca90724b4e42', '0c91c526896da0f2f8cb53f10eda0918d568949c'],
]) {
  assert.equal(catalogue.epochs[name].commit, commit);
  assert.equal(catalogue.epochs[name].gitBlob, gitBlob);
  assert.equal(blob(catalogue.epochs[name].content), gitBlob);
}
export function paintEpochSource(epoch, path) {
  assert.ok(Object.hasOwn(catalogue.epochs, epoch), 'known immutable paint epoch required');
  const source = path === catalogue.path ? catalogue.epochs[epoch].content : prior.paths[path]?.content;
  assert.equal(typeof source, 'string', 'historical source exists: ' + path);
  return source;
}

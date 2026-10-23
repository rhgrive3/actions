import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {specialInventory} from '../../lib/inkwave-special-production-epoch.mjs';

// Only the original reviewed presentation/VFX bytes are archived. Historical
// pins remain owned by the unchanged production validator, not this fixture.
const paths = ['patches/splatoon3/runtime/special-presentation.mjs','patches/splatoon3/runtime/special-vfx.mjs'];
const packed=fs.readFileSync(new URL('../../fixtures/inkwave-special-original-sources.json.gz',import.meta.url));
assert.equal(packed.length,44936);
assert.equal(createHash('sha256').update(packed).digest('hex'),'d3728a4328e879ca9ac8a82bd3074ccb9c7cec7b6615156486c5c2a5f3a8a13b','authenticated original special source fixture');
const decoded=gunzipSync(packed,{maxOutputLength:256*1024});
assert.equal(decoded.length,158484);
const archive=JSON.parse(decoded);
assert.deepEqual(Object.keys(archive).sort(),['files','schema']);assert.equal(archive.schema,1);
assert.ok(Array.isArray(archive.files));assert.deepEqual(archive.files.map(row=>row.path),paths);
const original=new Map(specialInventory().map(row=>[row.path,row])), sources=new Map();
for(const row of archive.files) {
  assert.deepEqual(Object.keys(row).sort(),['content','gitBlob','path','sha256']);
  assert.equal(typeof row.content,'string');
  const bytes=Buffer.from(row.content),pin=original.get(row.path);
  assert.ok(bytes.length>0 && bytes.length<150000,'bounded original source length');
  assert.equal(row.gitBlob,pin.sha);assert.equal(row.sha256,pin.sha256);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),pin.sha);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
  sources.set(row.path,bytes);
}
export function originalSpecialEpochSource(relative) {
  const bytes=sources.get(relative);
  return bytes ? Buffer.from(bytes) : null;
}

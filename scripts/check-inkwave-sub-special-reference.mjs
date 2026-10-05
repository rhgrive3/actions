#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/check-inkwave-sub-special-reference.mjs <raw-primary-data-directory>'); process.exit(2); }
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/reference/sub-special-fidelity-reference.json')));
const raw = new Map();
const gitBlob = bytes => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
for (const source of ref.sources) {
  const file = path.join(dir, path.basename(new URL(source.url).pathname));
  const bytes = fs.readFileSync(file);
  assert.equal(gitBlob(bytes), source.gitBlobSha1, `Raw source Git blob ${source.id}`);
  raw.set(source.id, JSON.parse(bytes));
}
for (const field of ref.explicitFields) {
  let value = raw.get(field.sourceId);
  for (const part of field.pointer.split('/').slice(1)) value = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  assert.deepEqual(value, field.value, field.sourceId + field.pointer);
}
console.log(JSON.stringify({status:'passed', files:raw.size, explicitFields:ref.explicitFields.length}));

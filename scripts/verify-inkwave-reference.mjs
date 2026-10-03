#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sha256, PATCH_ROOT } from '../patches/splatoon3/adapter.mjs';
// Primary files are kept outside this repository. Verify their complete bytes,
// then every selected field; do not trust a copied table as its own evidence.
const directory = process.argv[2];
if (!directory) { console.error('Usage: node scripts/verify-inkwave-reference.mjs <downloaded-primary-data-root>'); process.exit(2); }
const reference = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'reference/curated-numbers.json'), 'utf8'));
const files = new Map();
for (const source of reference.sources) {
  const data = fs.readFileSync(path.join(directory, source.id));
  if (sha256(data) !== source.sha256) throw new Error(`Primary source hash mismatch: ${source.id}`);
  files.set(source.id, JSON.parse(data));
}
let extracted = 0, unknown = 0;
for (const [key, entry] of Object.entries(reference.parameters)) {
  if (entry.status === 'unknown') { if (entry.value !== null) throw new Error(`Unknown value inferred: ${key}`); unknown++; continue; }
  let value = files.get(entry.sourceId);
  for (const part of entry.pointer.split('/').slice(1)) value = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  if (JSON.stringify(value) !== JSON.stringify(entry.value)) throw new Error(`Primary field mismatch: ${key}`);
  extracted++;
}
console.log(JSON.stringify({status:'passed', referenceVersion:reference.referenceVersion, sourceCommit:reference.sourceCommit, files:files.size, extracted, unknown}));

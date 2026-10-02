#!/usr/bin/env node
// Read-only candidate report. Never bless a changed implementation automatically.
import fs from 'node:fs';
import path from 'node:path';
import { PATCH_ROOT, sha256, adaptSource } from '../patches/splatoon3/adapter.mjs';
const source = process.argv[2];
if (!source) { console.error('Usage: node scripts/review-inkwave-upstream.mjs <candidate-source-directory>'); process.exit(2); }
const lock = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'upstream-lock.json'), 'utf8'));
const files = {};
for (const [file, expected] of Object.entries(lock.files)) {
  const target = path.join(path.resolve(source), file);
  if (!fs.existsSync(target)) { files[file] = { status:'missing' }; continue; }
  const value = fs.readFileSync(target), hash = sha256(value);
  let connection = 'compatible';
  try { adaptSource(file, value.toString('utf8')); } catch (error) { connection = error.message; }
  files[file] = { status: hash === expected ? 'unchanged' : 'review-required', expected, candidate:hash, connection };
}
console.log(JSON.stringify({schema:1, source:path.resolve(source), files}, null, 2));
if (Object.values(files).some(f => f.status !== 'unchanged' || f.connection !== 'compatible')) process.exitCode = 1;

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAIN_INK_BASELINE_PATHS, MAIN_INK_BASELINE_MANIFEST_BLOB, planMainInkBaseline,
} from './lib/inkwave-main-ink-baseline.mjs';

const argument = name => {
  const index = process.argv.indexOf(name);
  assert.ok(index >= 0 && process.argv[index + 1], 'Missing ' + name);
  return path.resolve(process.argv[index + 1]);
};
const baseline = argument('--baseline');
const candidate = argument('--candidate');
const receipt = argument('--receipt');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate),
  'The reference must be a separate main checkout');

const read = (root, rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const before = new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, read(baseline, rel)]));
const after = new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, read(candidate, rel)]));
// This pure pass validates all pinned paint hunks and whole-file shader blobs
// before writing anything. Unknown or partially applied changes fail closed.
const plan = planMainInkBaseline(before, after);
const writes = [...plan.sources].filter(([rel, text]) => text !== before.get(rel));
const evidence = {
  schema: 1,
  scope: 'Replay only reviewed #1525 paint/footprint hunks and two whole-file source-only modules into isolated main reference',
  limitation: 'Not a Nintendo retail oracle. Native projectile physics, candidate RNG, spawn/actor states, paint coverage and rendered pixels still require the independent paired comparator.',
  manifestGitBlob: MAIN_INK_BASELINE_MANIFEST_BLOB,
  writtenPaths: writes.map(([rel]) => rel),
  paint: plan.evidence,
};
for (const [rel, text] of writes) {
  const absolute = path.join(baseline, rel);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
fs.mkdirSync(path.dirname(receipt), { recursive: true });
fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ manifest: evidence.manifestGitBlob, writtenPaths: evidence.writtenPaths }));

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAIN_INK_BASELINE_MANIFEST, MAIN_INK_BASELINE_PATHS, MAIN_INK_BASELINE_MANIFEST_BLOB,
  gitBlobSha1, planMainInkBaseline, parseMainInkBaselineManifest,
} from '../lib/inkwave-main-ink-baseline.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const m = MAIN_INK_BASELINE_MANIFEST;
test('pin only the reviewed thirteen paint owners and 32 isolated changes', () => {
  assert.equal(m.files.length, 13);
  assert.equal(m.files.reduce((sum, x) => sum + (x.hunks?.length || 0), 0), 32);
  assert.deepEqual(m.files.map(x => x.path), MAIN_INK_BASELINE_PATHS);
  const raw = fs.readFileSync(new URL('../fixtures/inkwave-main-ink-pr1525-baseline.json', import.meta.url), 'utf8');
  assert.equal(gitBlobSha1(raw), MAIN_INK_BASELINE_MANIFEST_BLOB);
  assert.throws(() => parseMainInkBaselineManifest(raw.replace('reviewed main-ink paint', 'UNKNOWN')), /manifest differs/);
});
test('all current candidate paint owners match reviewed hunks and exact shader module', () => {
  const originals = new Map();
  const candidate = new Map();
  for (const row of m.files) {
    originals.set(row.path, row.mode === 'file' ? null : row.hunks.map(h => h.before).join('\n// non-paint source stays unchanged\n'));
    candidate.set(row.path, fs.readFileSync(path.join(root, row.path), 'utf8'));
  }
  const plan = planMainInkBaseline(originals, candidate);
  assert.equal(plan.evidence.paths.length, MAIN_INK_BASELINE_PATHS.length);
  assert.ok(plan.changes.length > 0);
  for (const row of m.files) {
    const aligned = plan.sources.get(row.path);
    if (row.mode === 'file') assert.equal(gitBlobSha1(aligned), row.afterBlob);
    else for (const hunk of row.hunks) assert.ok(aligned.includes(hunk.after), row.path + '/' + hunk.id);
  }
});
test('unreviewed candidate paint code cannot silently pass reference alignment', () => {
  const before = new Map();
  const after = new Map();
  for (const row of m.files) {
    before.set(row.path, row.mode === 'file' ? null : row.hunks.map(h => h.before).join('\n'));
    after.set(row.path, row.mode === 'file' ? row.content : row.hunks.map(h => h.after).join('\n'));
  }
  const subject = m.files.find(row => row.mode === 'hunks');
  after.set(subject.path, after.get(subject.path).replace(subject.hunks[0].after, 'UNREVIEWED-CANDIDATE'));
  assert.throws(() => planMainInkBaseline(before, after), /unknown, duplicate or incomplete/);
});

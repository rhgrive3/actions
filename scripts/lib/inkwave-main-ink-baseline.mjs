import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Review pin: 378dcf78 -> 8c8c26d, plus the reviewed highp/packed-edge GPU
// module. These are INKWAVE changes, not recovered Nintendo stencil code.
export const MAIN_INK_BASELINE_MANIFEST_BLOB = '999dded5493e029610a3654aca2428376c6d88f9';
const fixtureUrl = new URL('../fixtures/inkwave-main-ink-pr1525-baseline.json', import.meta.url);
export const MAIN_INK_BASELINE_PATHS = Object.freeze([
  "patches/network-replication/adapter.mjs",
  "patches/network-replication/slosher-paint-admission.mjs",
  "patches/splatoon3/main-ink-footprint-adapter.mjs",
  "patches/splatoon3/runtime/blaster-flight-paint.mjs",
  "patches/splatoon3/runtime/main-ink-footprints.mjs",
  "patches/splatoon3/runtime/main-weapon-catalog.mjs",
  "patches/splatoon3/runtime/paint-packet-codec.mjs",
  "patches/splatoon3/runtime/slosher-intermediate-paint.mjs",
  "patches/splatoon3/runtime/slosher-nearest-paint.mjs",
  "patches/splatoon3/runtime/weapon-edgecases.mjs",
  "patches/splatoon3/runtime/weapons-fidelity.mjs",
  "scripts/inkwave-source-composition.mjs",
  "scripts/lib/inkwave-build-only-modules.mjs"
]);
const sha256 = source => createHash('sha256').update(source).digest('hex');
export const gitBlobSha1 = source => createHash('sha1')
  .update('blob ' + Buffer.byteLength(source, 'utf8') + '\0').update(source).digest('hex');
const count = (source, text) => source.split(text).length - 1;
const fail = message => { throw Error('INKWAVE paint baseline: ' + message); };

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function parseMainInkBaselineManifest(raw) {
  if (gitBlobSha1(raw) !== MAIN_INK_BASELINE_MANIFEST_BLOB) fail('manifest differs from its reviewed blob pin');
  const data = JSON.parse(raw);
  if (data.schema !== 1 || data.sourceBase !== '378dcf78d09714cb3f89c39a46e36a52ad997869'
      || data.sourceHead !== '8c8c26d4486ddc95c03fcd5e0201c6c1c95c6654') fail('unexpected immutable source identity');
  if (JSON.stringify(data.files.map(row => row.path)) !== JSON.stringify(MAIN_INK_BASELINE_PATHS)) fail('path allowlist differs');
  let hunks = 0;
  for (const row of data.files) {
    if (row.mode === 'file') {
      if (gitBlobSha1(row.originalContent) !== row.originalBlob || gitBlobSha1(row.content) !== row.afterBlob)
        fail(row.path + ': full module hash differs');
    } else if (row.mode === 'hunks') {
      for (const hunk of row.hunks) {
        if (!hunk.before || !hunk.after || hunk.before === hunk.after) fail(row.path + ': invalid hunk');
        hunks++;
      }
    } else fail(row.path + ': unknown alignment mode');
  }
  if (hunks !== 32) fail('expected exactly 32 reviewed paint hunks');
  return freeze(data);
}

export const MAIN_INK_BASELINE_MANIFEST = parseMainInkBaselineManifest(readFileSync(fixtureUrl, 'utf8'));

// A new block can contain the old block (an inserted import, for example).
// Count legacy blocks outside the unique reviewed block; duplicate/partial
// code must not be mistaken for a valid already-aligned file.
function state(source, hunk, label, candidate = false) {
  const afterCount = count(source, hunk.after);
  if (afterCount === 1 && count(source.replace(hunk.after, ''), hunk.before) === 0) return 'aligned';
  if (!candidate && afterCount === 0 && count(source, hunk.before) === 1) return 'legacy';
  fail(label + ': unknown, duplicate or incomplete ' + (candidate ? 'candidate' : 'baseline') + ' hunk');
}

function background(source, row) {
  let text = source;
  for (const hunk of row.hunks) {
    const which = state(text, hunk, row.path + '/' + hunk.id);
    text = text.replace(which === 'aligned' ? hunk.after : hunk.before, '\n[reviewed-paint:' + hunk.id + ']\n');
  }
  return text;
}

// This function is pure: it creates a new map and returns only after every
// candidate and baseline path has passed. The caller performs no filesystem
// mutation until this plan and the separate birth/pool plan both succeed.
export function planMainInkBaseline(baseline, candidate) {
  if (!(baseline instanceof Map) || !(candidate instanceof Map)) fail('source maps are required');
  const sources = new Map(baseline), changes = [], paths = [];
  for (const row of MAIN_INK_BASELINE_MANIFEST.files) {
    const original = baseline.get(row.path) ?? null;
    const subject = candidate.get(row.path);
    if (typeof subject !== 'string') fail(row.path + ': candidate source is missing');
    let result = original, replayed = [];
    if (row.mode === 'file') {
      if (gitBlobSha1(subject) !== row.afterBlob) fail(row.path + ': candidate module is not the pinned final blob');
      if (original !== null && (typeof original !== 'string' || !row.acceptedBaselineBlobs.includes(gitBlobSha1(original))))
        fail(row.path + ': baseline module is neither absent nor a reviewed full blob');
      result = row.content;
      if (result !== original) replayed = ['pinned-module'];
    } else {
      if (typeof original !== 'string') fail(row.path + ': baseline source is missing');
      for (const hunk of row.hunks) state(subject, hunk, row.path + '/' + hunk.id, true);
      for (const hunk of row.hunks) {
        if (state(result, hunk, row.path + '/' + hunk.id) === 'legacy') {
          result = result.replace(hunk.before, hunk.after);
          replayed.push(hunk.id);
        }
      }
      for (const hunk of row.hunks) state(result, hunk, row.path + '/' + hunk.id, true);
      if (background(original, row) !== background(result, row)) fail(row.path + ': non-paint source changed');
    }
    sources.set(row.path, result);
    const entry = {
      path: row.path, mode: row.mode, sourceBaseBlob: row.beforeBlob,
      reviewedOriginalBlob: row.mode === 'file' ? row.originalBlob : row.afterBlob,
      originalGitBlob: original === null ? null : gitBlobSha1(original),
      referenceGitBlob: gitBlobSha1(result), candidateGitBlob: gitBlobSha1(subject),
      originalSha256: original === null ? null : sha256(original),
      referenceSha256: sha256(result), candidateSha256: sha256(subject),
      replayed,
    };
    if (row.mode === 'hunks') {
      entry.nonPaintSha256 = sha256(background(original, row));
      entry.hunks = row.hunks.map(hunk => ({
        id: hunk.id, sourceLine: hunk.line,
        beforeGitBlob: gitBlobSha1(hunk.before), afterGitBlob: gitBlobSha1(hunk.after),
      }));
    }
    paths.push(entry);
    if (result !== original) changes.push({ path: row.path, source: result });
  }
  return {
    sources, changes,
    evidence: {
      schema: 1, manifestGitBlob: MAIN_INK_BASELINE_MANIFEST_BLOB,
      sourceBase: MAIN_INK_BASELINE_MANIFEST.sourceBase,
      sourceHead: MAIN_INK_BASELINE_MANIFEST.sourceHead,
      precision: MAIN_INK_BASELINE_MANIFEST.precision, paths,
    },
  };
}

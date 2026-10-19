import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Review pin: 378dcf78 -> 8c8c26d, plus the reviewed highp/packed-edge GPU
// module. Later independent splash catch-up/added-family source changes are
// retained in four rebased context windows without expanding 32 paint hunks.
// Integration narrows three context windows around independent Crab imports,
// no-special paint claims and opponent-palette composition. All32 paint edits,
// exact occurrence checks and non-paint preservation remain required.
// These are INKWAVE changes, not recovered Nintendo stencil code.
export const MAIN_INK_BASELINE_MANIFEST_BLOB = '07b37df481d288206fbb4178bc8d716dc22192ae';
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
// Exact owner-added event-kind suffixes: Charger merge 57de1208,
// blast 54b39a21, rectified blast d3da29fe (integrated dab5f3d6).
// These are context only, never replayed/removed by the original 32 hunks.
const ownerKindSuffixes = [
  ", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c'",
  ", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast'",
  ", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast', 'ink-blast-rectified'",
];
function effectiveHunk(source, hunk) {
  if (hunk.id !== 'paint-1' || !hunk.after.includes('const PAINT_EVENT_KINDS')) return hunk;
  for (const suffix of ownerKindSuffixes) {
    const after = hunk.after.replace(']);', suffix + ']);');
    const before = hunk.before.replace(']);', suffix + ']);');
    if (source.includes(after) || source.includes(before)) return { ...hunk, before, after };
  }
  return hunk;
}
function state(source, hunk, label, candidate = false) {
  hunk = effectiveHunk(source, hunk);
  const afterCount = count(source, hunk.after);
  if (afterCount === 1 && count(source.replace(hunk.after, ''), hunk.before) === 0) return 'aligned';
  if (!candidate && afterCount === 0 && count(source, hunk.before) === 1) return 'legacy';
  fail(label + ': unknown, duplicate or incomplete ' + (candidate ? 'candidate' : 'baseline') + ' hunk');
}

function background(source, row) {
  let text = source;
  for (const hunk of row.hunks) {
    const which = state(text, hunk, row.path + '/' + hunk.id);
    const effective = effectiveHunk(text, hunk);
    // Keep independent owner context in the background digest.
    const suffix = effective.after === hunk.after ? '' : ownerKindSuffixes.find(value => effective.after === hunk.after.replace(']);', value + ']);'));
    text = text.replace(which === 'aligned' ? effective.after : effective.before, '\n[reviewed-paint:' + hunk.id + ']' + suffix + '\n');
  }
  return text;
}

// This function is pure: it creates a new map and returns only after every
// candidate and baseline path has passed. The caller performs no filesystem
// mutation until this plan and the separate birth/pool plan both succeed.
// Reviewed owner code has changed actual paint/physics. This is an identity
// branch, not replay permission: both inputs must be the same pinned current
// module. Historical32-hunk replay and all its negative controls stay intact.
const CURRENT_IDENTICAL_PAINT = Object.freeze({
  "patches/splatoon3/main-ink-footprint-adapter.mjs": {
    "sha256": "7c3b89ca6aae22cfcf145c4154195641a5577b8e2e08f9648eea3820a4cc507b",
    "ownerCommit": "d3da29feb05338bea2e8ecf19ff837700183061e"
  },
  "patches/splatoon3/runtime/main-ink-footprints.mjs": {
    "sha256": "9ae70d2f991f85e622f55a83df1a0f3253b3319ee00bea9c40ac57c0bee6780d",
    "ownerCommit": "b1c550c54e53f20e0c924c50b44c8d1b7e0beeb1"
  },
  "patches/splatoon3/runtime/main-weapon-catalog.mjs": {
    "sha256": "ab630eee3ee262b18b28fc9f9634e32c66b2783069731afd48d5f950439f895b",
    "ownerCommit": "d4fd040b66ca7e3236eb800ebf405d87b33dc1c2"
  },
  "patches/splatoon3/runtime/weapons-fidelity.mjs": {
    "sha256": "a602d93cffa3715d2a997685c8f4db26bc9e4161950053d31ada3e574f984771",
    "ownerCommit": "82c8fe571891003cf9b939967e3e4c455fbe12d7"
  }
});
export function planMainInkBaseline(baseline, candidate) {
  if (!(baseline instanceof Map) || !(candidate instanceof Map)) fail('source maps are required');
  const sources = new Map(baseline), changes = [], paths = [];
  for (const row of MAIN_INK_BASELINE_MANIFEST.files) {
    const original = baseline.get(row.path) ?? null;
    const subject = candidate.get(row.path);
    if (typeof subject !== 'string') fail(row.path + ': candidate source is missing');
    const current = CURRENT_IDENTICAL_PAINT[row.path];
    if (current && (sha256(subject) === current.sha256 ||
        (typeof original === 'string' && sha256(original) === current.sha256))) {
      if (sha256(subject) !== current.sha256) fail(row.path + ': unreviewed candidate current source');
      if (original !== subject) fail(row.path + ': unreviewed baseline current source; mixed physics/paint epochs cannot be replayed');
      sources.set(row.path, original);
      paths.push({ path: row.path, mode: 'identical-current-owner', ownerCommit: current.ownerCommit,
        originalGitBlob: gitBlobSha1(original), referenceGitBlob: gitBlobSha1(original), candidateGitBlob: gitBlobSha1(subject),
        originalSha256: current.sha256, referenceSha256: current.sha256, candidateSha256: current.sha256, replayed: [] });
      continue;
    }

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
          const effective = effectiveHunk(result, hunk);
          result = result.replace(effective.before, effective.after);
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

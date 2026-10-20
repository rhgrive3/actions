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
// Exact reviewed current source pair. Preserve both sides verbatim; this is
// source admission only, not physics equality or historical paint replay.
// Gameplay differences (charge keep, Splatana recovery, audio) remain visible
// to the independent native-state and image comparison gates.
const REVIEWED_CURRENT_PAIR = Object.freeze({
  "patches/network-replication/adapter.mjs": {
    "baseline": "e28849b6f8e02ef8e58aecc3ddb847dec1ac300477144a01e9aa891734e15687",
    "candidate": "8c3a467bf22ec0e247e89bf0b5820f8aa8840cb5c7e03d25a51f878a1f3ff54e"
  },
  "patches/network-replication/slosher-paint-admission.mjs": {
    "baseline": "dbb5ff41bcc8262596d8a55538879a60c3f46f6114235a4434586d3aa21c0838",
    "candidate": "dbb5ff41bcc8262596d8a55538879a60c3f46f6114235a4434586d3aa21c0838"
  },
  "patches/splatoon3/main-ink-footprint-adapter.mjs": {
    "baseline": "7c3b89ca6aae22cfcf145c4154195641a5577b8e2e08f9648eea3820a4cc507b",
    "candidate": "7c3b89ca6aae22cfcf145c4154195641a5577b8e2e08f9648eea3820a4cc507b"
  },
  "patches/splatoon3/runtime/blaster-flight-paint.mjs": {
    "baseline": "a7153bbfa3b8098c41805e14874d33a3a1f4bfe630185a44d37e15cc2ae8e124",
    "candidate": "a7153bbfa3b8098c41805e14874d33a3a1f4bfe630185a44d37e15cc2ae8e124"
  },
  "patches/splatoon3/runtime/main-ink-footprints.mjs": {
    "baseline": "9ae70d2f991f85e622f55a83df1a0f3253b3319ee00bea9c40ac57c0bee6780d",
    "candidate": "9ae70d2f991f85e622f55a83df1a0f3253b3319ee00bea9c40ac57c0bee6780d"
  },
  "patches/splatoon3/runtime/main-weapon-catalog.mjs": {
    "baseline": "e4693a56c1370ebc3d11b5c6fedbc841a58e5366d5f37b1135f02c916b8e8c11",
    "candidate": "2dc9447804bcf89225e534bd456337e84c1e8f483a78322dee059fb8433895e2"
  },
  "patches/splatoon3/runtime/paint-packet-codec.mjs": {
    "baseline": "a13a89da7a03a145203f9215c85a609d31d78b0f7647579960e17c7b03fcfb9e",
    "candidate": "a13a89da7a03a145203f9215c85a609d31d78b0f7647579960e17c7b03fcfb9e"
  },
  "patches/splatoon3/runtime/slosher-intermediate-paint.mjs": {
    "baseline": "b333ed4b6e373b833a1b01c806658f9af7b09338f5c0b8afec74aad436ca6d13",
    "candidate": "b333ed4b6e373b833a1b01c806658f9af7b09338f5c0b8afec74aad436ca6d13"
  },
  "patches/splatoon3/runtime/slosher-nearest-paint.mjs": {
    "baseline": "6f51c2f47e1749d625e117942e2e25000df64c860923ec33b44b228410d7ba5c",
    "candidate": "6f51c2f47e1749d625e117942e2e25000df64c860923ec33b44b228410d7ba5c"
  },
  "patches/splatoon3/runtime/weapon-edgecases.mjs": {
    "baseline": "6b7079ef9a8c8d2402544721f2f973bb9e8787cbb91d545506e12a9f2273ca05",
    "candidate": "6b7079ef9a8c8d2402544721f2f973bb9e8787cbb91d545506e12a9f2273ca05"
  },
  "patches/splatoon3/runtime/weapons-fidelity.mjs": {
    "baseline": "431c9a08c3eccde411a13c400cb8e9efb886287c77a04d737a93eee10fa2faab",
    "candidate": "431c9a08c3eccde411a13c400cb8e9efb886287c77a04d737a93eee10fa2faab"
  },
  "scripts/inkwave-source-composition.mjs": {
    "baseline": "57233aae5170cbe96a6d668fee11e986331c52f4807b4fd360146293c0382233",
    "candidate": "4c0b69e5544add050b0c2b54dd19adc50885a0123e96d54e15a7d854dd049d7b"
  },
  "scripts/lib/inkwave-build-only-modules.mjs": {
    "baseline": "2e23fb0f906e1945e45e813b26057122d66991c091b64b0835a91dfbf6b2997c",
    "candidate": "8378411518a3e1197475eee15aad6afb60ecf6a25894c45c774a95cab8a2dc50"
  }
});
// Source identities at the current mega-PR boundary. Admission alone is not
// visual equivalence: the native 48-capture comparison must still run and
// must expose all intended or unintended gameplay/pixel differences.
const INTEGRATION_SOURCE_PAIR = Object.freeze({
  baseCommit: 'b77b51df6a4e6683ca23a213c8ba4b0bc2f0c8ae',
  candidateCommit: 'a863c3b338de1c2fcbc12e9be78cd720bc810b04',
  blobs: Object.freeze({
    "patches/network-replication/adapter.mjs": {base: '0e92045cd74352a38260876c9d9dddc197c74fb2', candidate: '2cf5e9acff410f1fbbc471efa2c36aa0431ee30c'},
    "patches/network-replication/slosher-paint-admission.mjs": {base: '835ec49ce61f4d623a97f0cdb38fdcb8c592b916', candidate: '835ec49ce61f4d623a97f0cdb38fdcb8c592b916'},
    "patches/splatoon3/main-ink-footprint-adapter.mjs": {base: '312de3ac2633a494dc1e783780e5c7a5e35d87ac', candidate: '312de3ac2633a494dc1e783780e5c7a5e35d87ac'},
    "patches/splatoon3/runtime/blaster-flight-paint.mjs": {base: '629e9a0eb0f7ea67bf27d756bf3f46273396791c', candidate: '629e9a0eb0f7ea67bf27d756bf3f46273396791c'},
    "patches/splatoon3/runtime/main-ink-footprints.mjs": {base: '546c48ae0c1b30d669de3756350f20c7e82dfe4e', candidate: '546c48ae0c1b30d669de3756350f20c7e82dfe4e'},
    "patches/splatoon3/runtime/main-weapon-catalog.mjs": {base: '6b0f6f96fc94fc6e93dff99288e0d55e3cd01512', candidate: 'f97b9198893502fa2d36cdd1f99e3fc07369eacd'},
    "patches/splatoon3/runtime/paint-packet-codec.mjs": {base: 'c5e6f71cddc6d9caba22f687a77869604fced80e', candidate: 'c5e6f71cddc6d9caba22f687a77869604fced80e'},
    "patches/splatoon3/runtime/slosher-intermediate-paint.mjs": {base: '9914ddcef5472e6314dd9a02ba6f0996ccfd3f05', candidate: '9914ddcef5472e6314dd9a02ba6f0996ccfd3f05'},
    "patches/splatoon3/runtime/slosher-nearest-paint.mjs": {base: '948517797c8a2de11278e2f96bf324ab80a22aa6', candidate: '948517797c8a2de11278e2f96bf324ab80a22aa6'},
    "patches/splatoon3/runtime/weapon-edgecases.mjs": {base: 'ebb85e51fab03258a35b84cb0f2aa9ec8bdd5110', candidate: 'ebb85e51fab03258a35b84cb0f2aa9ec8bdd5110'},
    "patches/splatoon3/runtime/weapons-fidelity.mjs": {base: '7faa1e707a73d649b16c77e253eb81c003eecb7f', candidate: '7faa1e707a73d649b16c77e253eb81c003eecb7f'},
    "scripts/inkwave-source-composition.mjs": {base: 'f406d535a63356124c7c0415cb8a41d9ef8e77dd', candidate: '62d5ce2e1c729bd57dfc2372f668a76fe1c7c38a'},
    "scripts/lib/inkwave-build-only-modules.mjs": {base: '1d8e49ac806e7b9cfcbc058131607b57699fe613', candidate: '6509f9e33afa28b82a4e65c1249c9c34179a8074'},
  })
});
// Exact ada/dec source admission after reviewed receiver-private sub birth hooks.
// This does not assert paint, HP or physics equality, and never rewrites inputs.
// Keep the previous integration epoch independently admissible.
const SUB_BIRTH_SOURCE_PAIR = Object.freeze({
  baseCommit: 'ada098a8fe5f2b9f2990f10812c01acb70bde190',
  candidateCommit: 'dec9dfc1d6cacc8023f72834c32891b2f121a0bf',
  blobs: Object.freeze({
    ...INTEGRATION_SOURCE_PAIR.blobs,
    'patches/network-replication/adapter.mjs': Object.freeze({
      base: '0e92045cd74352a38260876c9d9dddc197c74fb2',
      candidate: 'df640991c36dbacc3b0c7b9bb4ac5b57e59a4a9e'
    })
  })
});
function reviewedCurrentPair(baseline, candidate) {
  const present = path => typeof baseline.get(path) === 'string' && typeof candidate.get(path) === 'string';
  const old = MAIN_INK_BASELINE_PATHS.every(path => present(path) &&
    sha256(baseline.get(path)) === REVIEWED_CURRENT_PAIR[path].baseline &&
    sha256(candidate.get(path)) === REVIEWED_CURRENT_PAIR[path].candidate);
  const integratedPair = [INTEGRATION_SOURCE_PAIR, SUB_BIRTH_SOURCE_PAIR].find(pair =>
    MAIN_INK_BASELINE_PATHS.every(path => present(path) &&
      gitBlobSha1(baseline.get(path)) === pair.blobs[path].base &&
      gitBlobSha1(candidate.get(path)) === pair.blobs[path].candidate));
  const integrated = Boolean(integratedPair);
  if (!old && !integrated) {
    const path = 'patches/splatoon3/runtime/main-weapon-catalog.mjs';
    const known = (typeof baseline.get(path) === 'string' &&
      (sha256(baseline.get(path)) === REVIEWED_CURRENT_PAIR[path].baseline ||
       gitBlobSha1(baseline.get(path)) === INTEGRATION_SOURCE_PAIR.blobs[path].base)) ||
      (typeof candidate.get(path) === 'string' &&
      (sha256(candidate.get(path)) === REVIEWED_CURRENT_PAIR[path].candidate ||
       gitBlobSha1(candidate.get(path)) === INTEGRATION_SOURCE_PAIR.blobs[path].candidate));
    if (known) fail('current source pair differs; mixed, missing or modified source cannot be replayed');
    return null;
  }
  const sourceBase = integrated ? integratedPair.baseCommit : '9b0e402313686d8f8ad0f70585b01915e904e641';
  const sourceHead = integrated ? integratedPair.candidateCommit : '67db773cf2d2ef49bea7a6187cc412c3c5590ef9';
  return { sources: new Map(baseline), changes: [], evidence: {
    schema: 1, mode: 'current-pair-with-gameplay-differences',
    sourceBase, sourceHead,
    validationLimit: 'Source identity only; full native browser/image comparisons remain mandatory',
    manifestGitBlob: MAIN_INK_BASELINE_MANIFEST_BLOB,
    paths: MAIN_INK_BASELINE_PATHS.map(path => ({path,
      mode: 'reviewed-current-pair', originalGitBlob: gitBlobSha1(baseline.get(path)),
      referenceGitBlob: gitBlobSha1(baseline.get(path)), candidateGitBlob: gitBlobSha1(candidate.get(path)),
      originalSha256: sha256(baseline.get(path)), referenceSha256: sha256(baseline.get(path)),
      candidateSha256: sha256(candidate.get(path)), replayed: []}))
  }};
}

export function planMainInkBaseline(baseline, candidate) {
  if (!(baseline instanceof Map) || !(candidate instanceof Map)) fail('source maps are required');
  const reviewedPair = reviewedCurrentPair(baseline, candidate);
  if (reviewedPair) return reviewedPair;
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

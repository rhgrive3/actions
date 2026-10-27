// Receipt-only replacement for historical browser-probe.mjs:33.
// This is not wired into CI and does not validate motion, invocation or PNGs.
// Callers must pin the manifest bytes and source head from a trusted capture;
// do not retrofit these missing fields onto the archived 907 receipts.
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateCatalogInputReceipts, validateCatalogReceipts } from '../../scripts/check-inkwave-motion-catalog.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error('Same-head catalog receipt union: ' + message); };

export function safeSameHeadReceiptUnion({ manifestBytes, expected, original, fresh }) {
  if (!/^[a-f0-9]{64}$/.test(expected?.manifestSha256 || '') ||
      !/^[a-f0-9]{40}$/.test(expected?.sourceHead || '')) fail('explicit manifest/source pins required');
  if (!(typeof manifestBytes === 'string' || Buffer.isBuffer(manifestBytes)) ||
      hash(manifestBytes) !== expected.manifestSha256) fail('raw manifest identity');
  const manifest = JSON.parse(manifestBytes.toString());
  if (manifest.schema !== 1 || !manifest.artifacts || !Object.keys(manifest.artifacts).length ||
      hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash ||
      !manifest.build || !/^[a-f0-9]{64}$/.test(manifest.build.script || '')) fail('manifest/build identity');

  // Validate every row in each original array before any Map can discard it.
  // A valid later observation must never repair/erase an invalid earlier one.
  const validateSet = (capture, label) => {
    if (capture?.manifestSha256 !== expected.manifestSha256 || capture.sourceHead !== expected.sourceHead ||
        capture.contentHash !== manifest.contentHash || capture.inputHash !== manifest.inputHash ||
        !isDeepStrictEqual(capture.build, manifest.build) || !isDeepStrictEqual(capture.artifacts, manifest.artifacts))
      fail(label + ' manifest/build/source identity');
    // The real builder records its own digest in build.script, separately
    // from manifest.files. Canonical source-input receipts retain this as
    // builderSHA256 after checking both working-tree and committed bytes.
    if (capture.builderSHA256 !== manifest.build.script) fail(label + ' source builder identity');
    validateCatalogInputReceipts(manifest, capture.sourceInputs);
    if (!Array.isArray(capture.errors) || capture.errors.length) fail(label + ' retained capture errors');
    if (!Array.isArray(capture.loaded) || !capture.loaded.length) fail(label + ' loaded denominator');
    const seen = new Map();
    for (const row of capture.loaded) {
      if (!row || !Object.hasOwn(manifest.artifacts, row.file) || row.sha256 !== manifest.artifacts[row.file] ||
          !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || (Object.hasOwn(row, 'status') && row.status !== 200))
        fail(label + ' loaded-byte identity ' + row?.file);
      if (seen.has(row.file) && !isDeepStrictEqual(seen.get(row.file), row)) fail(label + ' conflicting duplicate ' + row.file);
      if (!seen.has(row.file)) seen.set(row.file, row);
    }
    return seen;
  };
  const oldRows = validateSet(original, 'original');
  const newRows = validateSet(fresh, 'fresh');
  const union = new Map(oldRows);
  for (const [file, row] of newRows) {
    if (union.has(file) && !isDeepStrictEqual(union.get(file), row)) fail('cross-capture conflicting duplicate ' + file);
    if (!union.has(file)) union.set(file, row);
  }
  const loaded = [...union.values()].map(row => structuredClone(row));
  // Keep the canonical required-module denominator and exclusions unchanged.
  validateCatalogReceipts(manifest, loaded);
  return loaded; // Not a passed replay, graph-invocation or screenshot result.
}

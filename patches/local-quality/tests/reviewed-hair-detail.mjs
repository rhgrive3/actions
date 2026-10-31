import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { replaceOnce } from '../adapter.mjs';

const bytes = fs.readFileSync(new URL('./fixtures/reviewed-hair-detail-fdb74165.json', import.meta.url));
function reviewed(input = bytes) {
  assert.equal(createHash('sha256').update(input).digest('hex'),
    'b303a2cb7e10aa0a9c703547bf24e15dc8a57193831f58495f695d564504698f',
    'sealed fdb74165 hair detail successor');
  return JSON.parse(input);
}

// Test-only bridge between the immutable historical arithmetic kernels and the
// separately reviewed fdb74165 resolution policy. No geometry kernel is changed,
// and the original fixtures remain the independent numerical oracles.
export function adoptReviewedHairDetail(source, input = bytes) {
  const { before, after, label } = reviewed(input);
  return replaceOnce(source, before, after, label);
}

export function restoreReviewedHairDetail(source, input = bytes) {
  const { before, after, label } = reviewed(input);
  return replaceOnce(source, after, before, 'reverse ' + label);
}

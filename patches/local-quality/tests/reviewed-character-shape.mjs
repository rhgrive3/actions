import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { replaceOnce } from '../adapter.mjs';

const bytes = fs.readFileSync(new URL('./fixtures/reviewed-character-shape-fdb74165.json', import.meta.url));
const hash = source => createHash('sha256').update(source).digest('hex');
function reviewed(input) {
  assert.equal(hash(input), 'e42b0c2edebab11b0b18aa4fe848abd755b8fc72b456e0da6411d8037a1e1891',
    'sealed fdb74165 character shape successor');
  return JSON.parse(input);
}

// Test-only replay of the fifteen exact shape hunks already committed at
// fdb74165. The historical optimization fixture stays immutable. Its addTube
// mapping cache predates that shape commit, so preserve those three old calls
// when translating the overlapping hunk into the fixture's source epoch.
function project(source, layer, reverse, input) {
  assert.ok(layer === 'raw' || layer === 'fixture', 'known character shape source layer');
  const descriptor = reviewed(input), identity = descriptor[layer];
  assert.equal(hash(source), identity[reverse ? 'afterSha256' : 'beforeSha256'],
    'complete ' + layer + ' character shape input epoch');
  let hunks = descriptor.hunks.map(({ before, after }, index) => {
    if (layer === 'fixture') for (const mapping of descriptor.fixtureMappings) {
      if (mapping.hunkIndex !== index) continue;
      assert.equal(before.split(mapping.before).length - 1, mapping.occurrences);
      assert.equal(after.split(mapping.before).length - 1, mapping.occurrences);
      before = before.replaceAll(mapping.before, mapping.after);
      after = after.replaceAll(mapping.before, mapping.after);
    }
    return { before, after, index };
  });
  if (reverse) hunks = hunks.reverse();
  for (const { before, after, index } of hunks) source = replaceOnce(source,
    reverse ? after : before, reverse ? before : after,
    (reverse ? 'reverse ' : '') + 'reviewed fdb74165 character shape hunk ' + index);
  assert.equal(hash(source), identity[reverse ? 'beforeSha256' : 'afterSha256'],
    'complete ' + layer + ' character shape output epoch');
  return source;
}

export function adoptReviewedCharacterShape(source, layer = 'fixture', input = bytes) {
  return project(source, layer, false, input);
}

export function restoreReviewedCharacterShape(source, layer = 'fixture', input = bytes) {
  return project(source, layer, true, input);
}

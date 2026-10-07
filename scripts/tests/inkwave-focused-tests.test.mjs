import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFocusedInputs, focusedSummary } from '../run-inkwave-focused-tests.mjs';

test('focused runner admits INKWAVE files and immutable baseline objects', () => {
  const files = ['patches/splatoon3/tests/issue-648-native-physics-gauge.test.mjs',
    'patches/practice-range/tests/isolation.test.mjs'];
  const sha = '7ab20b44bbc00d497a50cbbbdb43b4da823b0a82';
  assert.deepEqual(parseFocusedInputs(JSON.stringify(files), JSON.stringify([sha, sha])), { files, refs: [sha] });
});

test('focused acceptance rejects empty, skipped-only, incomplete and failed summaries', () => {
  assert.equal(focusedSummary('ℹ tests 2\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n').accepted, true);
  for (const log of ['', 'ℹ tests 0\nℹ pass 0\nℹ fail 0\nℹ cancelled 0\n',
    'ℹ tests 2\nℹ pass 0\nℹ fail 0\nℹ cancelled 0\nℹ skipped 2\n',
    'ℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ cancelled 0\n', 'ℹ tests 2\nℹ pass 2\n',
    'ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\n',
    'ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 1\n',
    'ℹ tests 3\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n',
    'ℹ tests 2\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n'])
    assert.equal(focusedSummary(log).accepted, false);
});

test('focused runner rejects shell fragments, foreign scopes, duplicates and unbounded fanout', () => {
  for (const files of [[], ['../tests/a.test.mjs'], ['patches/splatoon3/tests/../a.test.mjs'],
    ['patches/splatoon3/tests/a.test.mjs;true'], ['Game/tests/a.test.mjs'],
    Array(37).fill('patches/splatoon3/tests/a.test.mjs'), Array(2).fill('patches/splatoon3/tests/a.test.mjs')])
    assert.throws(() => parseFocusedInputs(JSON.stringify(files)));
  for (const refs of [['main'], ['7ab20b44'], ['$(id)'], Array(9).fill('a'.repeat(40))])
    assert.throws(() => parseFocusedInputs('["patches/splatoon3/tests/a.test.mjs"]', JSON.stringify(refs)));
});

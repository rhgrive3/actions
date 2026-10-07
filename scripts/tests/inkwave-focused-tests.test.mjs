import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFocusedInputs } from '../run-inkwave-focused-tests.mjs';

test('focused runner admits INKWAVE files and immutable baseline objects', () => {
  const files = ['patches/splatoon3/tests/issue-648-native-physics-gauge.test.mjs',
    'patches/practice-range/tests/isolation.test.mjs'];
  const sha = '7ab20b44bbc00d497a50cbbbdb43b4da823b0a82';
  assert.deepEqual(parseFocusedInputs(JSON.stringify(files), JSON.stringify([sha, sha])), { files, refs: [sha] });
});

test('focused runner rejects shell fragments, foreign scopes, duplicates and unbounded fanout', () => {
  for (const files of [[], ['../tests/a.test.mjs'], ['patches/splatoon3/tests/../a.test.mjs'],
    ['patches/splatoon3/tests/a.test.mjs;true'], ['Game/tests/a.test.mjs'],
    Array(37).fill('patches/splatoon3/tests/a.test.mjs'), Array(2).fill('patches/splatoon3/tests/a.test.mjs')])
    assert.throws(() => parseFocusedInputs(JSON.stringify(files)));
  for (const refs of [['main'], ['7ab20b44'], ['$(id)'], Array(9).fill('a'.repeat(40))])
    assert.throws(() => parseFocusedInputs('["patches/splatoon3/tests/a.test.mjs"]', JSON.stringify(refs)));
});

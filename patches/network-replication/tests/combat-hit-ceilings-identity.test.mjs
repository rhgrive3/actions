import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { networkIdentity } from '../adapter.mjs';

test('network identity binds the equipped hit-ceiling runtime sources', () => {
  const identity = networkIdentity();
  for (const file of ['combat-hit-ceilings-data.mjs', 'damage-leaves.mjs']) {
    const bytes = fs.readFileSync(new URL('../' + file, import.meta.url));
    const expected = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(identity[file], expected, file + ' must be bound to its exact source bytes');
  }
});

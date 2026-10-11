import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measurementBaseline } from '../measure-weapons-fidelity.mjs';

test('measurement baseline is read from the supplied archive receipt, never a historical literal', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iw-measure-source-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(measurementBaseline(dir), null, 'missing provenance must stay unknown');
  const receipt = path.join(dir, 'SOURCE_IDENTITY.json');
  for (const sha of ['5d0be6b7fdebfd07e696e75497aaa97aa5ff5648', 'a'.repeat(40)]) {
    fs.writeFileSync(receipt, JSON.stringify({ sha }));
    assert.equal(measurementBaseline(dir), sha);
  }
  fs.writeFileSync(receipt, JSON.stringify({ sha: 'not-a-commit' }));
  assert.throws(() => measurementBaseline(dir), /Invalid SHA/);
});

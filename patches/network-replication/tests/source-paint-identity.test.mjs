import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {networkIdentity} from '../adapter.mjs';
test('network identity hashes result and source-specific paint admission modules',()=>{
 const identity=networkIdentity();
 for(const name of ['result-admission.mjs','slosher-paint-admission.mjs','kit-paint-admission.mjs','kit-paint-adapter.mjs'])
  assert.equal(identity[name],crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+name,import.meta.url))).digest('hex'));
});

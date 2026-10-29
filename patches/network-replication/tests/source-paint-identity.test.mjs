import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {networkIdentity} from '../adapter.mjs';
test('network identity hashes result and source-specific paint admission modules',()=>{
 const identity=networkIdentity();
 for(const name of ['result-admission.mjs','slosher-paint-admission.mjs','kit-paint-admission.mjs','kit-paint-adapter.mjs','paint-authority.mjs','paint-authority-adapter.mjs','owner-tick-receipt.mjs','queue-network-20261027-adapter.mjs'])
  assert.equal(identity[name],crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+name,import.meta.url))).digest('hex'));
});
test('every network runtime and adapter file has a canonical input identity',()=>{
 const identity=networkIdentity();
 const files=fs.readdirSync(new URL('../',import.meta.url),{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.mjs')).map(entry=>entry.name);
 for(const name of files)
  assert.equal(identity[name],crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+name,import.meta.url))).digest('hex'),name);
});

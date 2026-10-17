#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { alignRollerBirthBaseline, assertUnchangedRollerSource } from './lib/inkwave-roller-birth-baseline.mjs';

const arg = name => {
  const at = process.argv.indexOf(name);
  assert.ok(at >= 0 && process.argv[at + 1], `required ${name}`);
  return path.resolve(process.argv[at + 1]);
};
const baseline = arg('--baseline'), candidate = arg('--candidate'), receipt = arg('--receipt');
assert.notEqual(baseline, candidate, 'the reference must be a separate checkout');
const file = 'patches/splatoon3/runtime/weapons-fidelity.mjs';
const profile = 'patches/splatoon3/profile.json';
assertUnchangedRollerSource(JSON.parse(fs.readFileSync(path.join(baseline, profile))), JSON.parse(fs.readFileSync(path.join(candidate, profile))));
const original = fs.readFileSync(path.join(baseline, file), 'utf8');
const subject = fs.readFileSync(path.join(candidate, file), 'utf8');
const { source, changes } = alignRollerBirthBaseline(original, subject);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const evidence = {
  schema: 1,
  scope: 'Only the two reviewed Roller birth expressions are replayed in the main reference; all other baseline gameplay and rendering code is retained.',
  limitation: 'An INKWAVE regression comparison. The vertical field interpretation and Nintendo coordinate mapping remain unverified.',
  file, originalSha256: sha256(original), referenceSha256: sha256(source), candidateSha256: sha256(subject), changes,
};
fs.mkdirSync(path.dirname(receipt), { recursive: true });
fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
if (changes.length) fs.writeFileSync(path.join(baseline, file), source);
console.log(JSON.stringify({ receipt, changes: changes.map(row => row.name), originalSha256: evidence.originalSha256, referenceSha256: evidence.referenceSha256 }));

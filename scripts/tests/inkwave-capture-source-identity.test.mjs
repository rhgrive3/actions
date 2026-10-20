import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureSourceIdentity } from '../lib/inkwave-capture-source-identity.mjs';
const head = '9140cd22694d66b7a70c3b7cb650fddf0c46ceb4';
const merge = '3a56d4d1ea7504adc78f8cd4214ae5c4daabdff8';
test('actual checkout and event merge remain distinct, read once', () => {
  let reads = 0;
  const receipt = captureSourceIdentity({env: {GITHUB_SHA: merge}, readHead: () => { reads++; return head + '\n'; }});
  assert.deepEqual(receipt, {checkoutSha: head, eventSha: merge, checkoutIdentityStatus: 'verified-git-head'});
  assert.equal(reads, 1);
});
test('local checkout has no fabricated event identity', () => {
  assert.deepEqual(captureSourceIdentity({env: {}, readHead: () => head}), {
    checkoutSha: head, eventSha: null, checkoutIdentityStatus: 'verified-git-head'});
});
test('unreadable checkout never falls back to event SHA', () => {
  assert.deepEqual(captureSourceIdentity({env: {GITHUB_SHA: merge}, readHead: () => {throw new Error('no git');}}), {
    checkoutSha: null, eventSha: merge, checkoutIdentityStatus: 'unavailable'});
});
test('malformed HEAD does not become verified identity', () => {
  for (const value of ['', 'HEAD', head + '\n' + merge, 'g'.repeat(40), 'a'.repeat(41)]) {
    assert.equal(captureSourceIdentity({env: {GITHUB_SHA: merge}, readHead: () => value}).checkoutIdentityStatus, 'invalid-head');
  }
});
test('full SHA-256 repository identity is supported', () => {
  assert.equal(captureSourceIdentity({env: {}, readHead: () => 'A'.repeat(64)}).checkoutSha, 'a'.repeat(64));
});
test('harness resolves identity once and forwards distinct metadata', () => {
  const text = fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs', import.meta.url), 'utf8');
  assert.equal((text.match(/captureSourceIdentity\(\{ cwd: ROOT \}\)/g) || []).length, 1);
  assert.ok(text.indexOf('const sourceIdentity = captureSourceIdentity({ cwd: ROOT });') < text.indexOf('const report ='));
  assert.match(text, /const audioReceipt = \{ \.\.\.sourceIdentity,/);
  assert.doesNotMatch(text, /checkoutSha:\s*process\.env\.GITHUB_SHA/);
});

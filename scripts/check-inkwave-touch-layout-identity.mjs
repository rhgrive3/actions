#!/usr/bin/env node
// A forged input hash must not let uncommitted editor source attest a clean Git SHA.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const option = name => { const i = process.argv.indexOf(name); assert(i >= 0 && process.argv[i + 1], 'Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = option('--site'), source = option('--source'), checkout = option('--checkout-dir'), evidence = option('--evidence-dir');
const reliability = process.argv.includes('--reliability');
const input = reliability ? 'reliability/input-adapter.mjs' : 'touch-layout/mobile.js';
const relativeInput = reliability ? 'patches/reliability/input-adapter.mjs' : 'patches/touch-layout/mobile.js';
const repo = fileURLToPath(new URL('../', import.meta.url));
const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const dir of [checkout, evidence]) assert(physical(dir).startsWith('/mnt/workspace/'), 'Persistent workspace required');
assert(!fs.existsSync(checkout), 'Use a new isolated checkout; existing work is retained');
fs.mkdirSync(checkout, { recursive: true }); fs.mkdirSync(evidence, { recursive: true });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
const sourcePath = key => {
  if (key.startsWith('upstream/')) return ['inkwave-public/' + key.slice(9), path.join(source, key.slice(9))];
  if (key.startsWith('patch/')) return ['patches/splatoon3/' + key.slice(6), path.join(repo, 'patches/splatoon3', key.slice(6))];
  if (key.startsWith('touch-layout/')) return ['patches/touch-layout/' + key.slice(13), path.join(repo, 'patches/touch-layout', key.slice(13))];
  if (key.startsWith('reliability/')) return ['patches/reliability/' + key.slice(12), path.join(repo, 'patches/reliability', key.slice(12))];
  if (key.startsWith('local-quality/')) return ['patches/local-quality/' + key.slice(14), path.join(repo, 'patches/local-quality', key.slice(14))];
  if (key.startsWith('loading-cache/')) return ['patches/loading-cache/' + key.slice(14), path.join(repo, 'patches/loading-cache', key.slice(14))];
  throw new Error('Unknown input ' + key);
};
for (const [key, expected] of Object.entries(identity.files)) {
  const [relative, from] = sourcePath(key), target = path.join(checkout, relative);
  const data = fs.readFileSync(from); assert.equal(hash(data), expected, 'Fixture input matches build: ' + key);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data);
}
for (const file of ['scripts/build-inkwave.mjs', 'scripts/check-inkwave-browser.mjs']) {
  const target = path.join(checkout, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(repo, file), target);
}
assert(identity.files[input], 'Overlay source is bound to the build');
execFileSync('git', ['init', '-q'], { cwd: checkout });
execFileSync('git', ['add', '.'], { cwd: checkout });
execFileSync('git', ['-c', 'user.name=INKWAVE Test', '-c', 'user.email=inkwave-test@example.invalid', 'commit', '-qm', 'Identity regression fixture'], { cwd: checkout });
// Alter editor source and forge its manifest input hash. Artifact hashes remain
// valid; only the comparison against the actual commit can reject this state.
const changed = path.join(checkout, relativeInput);
fs.appendFileSync(changed, '\n// Deliberately uncommitted identity-test input.\n');
identity.files[input] = hash(fs.readFileSync(changed));
if (reliability) identity.build.reliability['input-adapter.mjs'] = identity.files[input];
else identity.build.touchLayout['mobile.js'] = identity.files[input];
identity.inputHash = hash(JSON.stringify(identity.files));
const candidate = path.join(checkout, 'candidate-site'); fs.mkdirSync(candidate);
for (const item of fs.readdirSync(site)) if (item !== 'inkwave-build.json') fs.symlinkSync(path.join(site, item), path.join(candidate, item));
fs.writeFileSync(path.join(candidate, 'inkwave-build.json'), JSON.stringify(identity));
const check = spawnSync(process.execPath, [path.join(checkout, 'scripts/check-inkwave-browser.mjs'), '--site', candidate,
  '--evidence-dir', evidence, '--profile-dir', path.join(checkout, 'browser-profile'), '--exact-source'], { encoding: 'utf8', timeout: 30000 });
assert.notEqual(check.status, 0, 'Dirty editor must fail exact-source verification');
assert(check.stderr.includes('Build input differs from commit: ' + relativeInput), 'Reject the dirty overlay specifically');
const result = { status: 'passed', regression: 'uncommitted-' + (reliability ? 'reliability-overlay' : 'touch-editor') + '-rejected-despite-forged-input-hash', fixtureCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(), productCommitAttested: false };
const file = path.join(evidence, (reliability ? 'reliability' : 'touch-layout') + '-identity-result.json');
fs.writeFileSync(file + '.writing', JSON.stringify(result, null, 2)); fs.renameSync(file + '.writing', file);
console.log(JSON.stringify(result));

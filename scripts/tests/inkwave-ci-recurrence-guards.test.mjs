import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {preflightComposition} from '../ci/check-composition-preflight.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const checker = path.join(ROOT, 'scripts/ci/check-workflow-yaml.rb');

function fixture(body, callback) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-ci-recurrence-'));
  const filename = path.join(folder, 'test.yml');
  fs.writeFileSync(filename, body);
  try { return callback(filename); }
  finally { fs.rmSync(folder, {recursive:true, force:true}); }
}

function rubyCheck(yaml) {
  return fixture(yaml, file => spawnSync('ruby', [checker, file], {encoding: 'utf8'}));
}

test('rejects duplicate action checkout with.filter and sparse-checkout keys before jobs start', () => {
  const result = rubyCheck('name: proof\njobs:\n  check:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n          sparse-checkout: |\n            /*\n          ref: abc\n          filter: blob:none\n          sparse-checkout: |\n            /*\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate YAML key "filter"/);
  assert.match(result.stderr, /duplicate YAML key "sparse-checkout"/);
});

test('accepts same YAML key under independent maps and does not parse run block as keys', () => {
  const result = rubyCheck('name: proof\non:\n  pull_request:\njobs:\n  one:\n    steps:\n      - run: |\n          filter: repeated text\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n  two:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects invalid syntax and multi-document workflows', () => {
  assert.equal(rubyCheck('jobs:\n  check: [unterminated\n').status, 1);
  assert.equal(rubyCheck('name: one\n---\nname: two\n').status, 1);
});

test('production preflight validates every source module read-only and exposes failing path', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-compose-preflight-'));
  try {
    fs.mkdirSync(path.join(folder, 'src/ui'), {recursive:true});
    fs.writeFileSync(path.join(folder, 'src/ui/menus.js'), 'normal anchor');
    fs.writeFileSync(path.join(folder, 'index.html'), '<title>safe</title>');
    const before = fs.readFileSync(path.join(folder, 'src/ui/menus.js'), 'utf8');
    assert.deepEqual(preflightComposition(folder, {adapt:(rel, code) => rel.endsWith('menus.js') ? code + ';safe' : code}), {files:2, changed:1});
    assert.equal(fs.readFileSync(path.join(folder, 'src/ui/menus.js'), 'utf8'), before);
    assert.throws(() => preflightComposition(folder, {adapt:(rel, code) => {
      if (rel === 'src/ui/menus.js') throw Error('expected exactly one connection (GPU-22)');
      return code;
    }}), /src\/ui\/menus\.js: expected exactly one connection \(GPU-22\)/);
  } finally {fs.rmSync(folder, {recursive:true, force:true});}
});

test('missing production source fails rather than producing a false green', () => {
  assert.throws(() => preflightComposition(path.join(os.tmpdir(), 'nonexistent-inkwave-source-does-not-exist'), {adapt:code => code}), /Missing production source directory/);
});

test('heavy full-CI lanes require successful admission preflight and final gate refuses failure', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/validate-inkwave-update.yml'), 'utf8');
  assert.match(yaml, /^  admission_preflight:\n/m);
  for (const name of ['build_site', 'patch_tests', 'seven_claims', 'resource_paint_continuation']) {
    assert.match(yaml, new RegExp('^  ' + name + ':\\n    needs: admission_preflight\\n', 'm'), name);
  }
  assert.match(yaml, /needs: \[admission_preflight, validate_core, patch_tests, circleci_offload_gate\]/);
  assert.match(yaml, /test "\$PREFLIGHT_RESULT" = success/);
});

test('external Charger waveform research cannot auto-trigger from pull requests or pushes', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/inkwave-charger-video-waveform.yml'), 'utf8');
  const triggers = yaml.slice(0, yaml.indexOf('\npermissions:'));
  assert.match(triggers, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(triggers, /^\s{2}(?:pull_request|push|schedule):/m);
  assert.match(yaml, /cancel-in-progress: true/);
});

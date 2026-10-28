import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseBrowserLane, SUITES } from '../ci/run-circleci-browser-lane.mjs';

const workflow = fs.readFileSync('.github/workflows/validate-inkwave-update.yml', 'utf8');

test('core sparse checkout materializes every CircleCI parity gate input', () => {
  const core = workflow.split('  validate_core:\n')[1]?.split('\n  patch_tests:')[0];
  const patterns = core?.match(/          sparse-checkout: \|\n((?:            [^\n]+\n)+)/)?.[1].trim().split('\n').map(line => line.trim());
  assert.ok(patterns?.length, 'core must retain its explicit sparse input selection');
  const required = ['.github/workflows/validate-inkwave-update.yml', '.circleci/config.yml',
    'scripts/tests/inkwave-circleci-browser-lane.test.mjs', 'scripts/tests/inkwave-circleci-offload-gate.test.mjs',
    'scripts/ci/run-circleci-browser-lane.mjs', 'scripts/ci/check-circleci-offload.mjs'];
  const excluded = ['.circleci/unused.yml', 'account/tests/example.test.mjs'];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-core-sparse-'));
  const git = args => execFileSync('git', args, {cwd:root, stdio:['pipe','pipe','pipe']});
  try {
    git(['init', '-q']);
    for (const file of [...required, ...excluded]) {
      fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true});
      fs.writeFileSync(path.join(root,file), file);
    }
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
    const select = selection => execFileSync('git', ['sparse-checkout','set','--no-cone','--stdin'],
      {cwd:root, input:selection.join('\n')+'\n', stdio:['pipe','pipe','pipe']});
    // Exact prior allowlist: the imported gate code remains, but its config is absent.
    select(patterns.filter(line => line !== '/.circleci/config.yml'));
    assert.equal(fs.existsSync(path.join(root,'.circleci/config.yml')), false);
    assert.ok(fs.existsSync(path.join(root,'scripts/ci/run-circleci-browser-lane.mjs')));
    select(patterns);
    for (const file of required) assert.ok(fs.existsSync(path.join(root,file)), 'required gate input: '+file);
    for (const file of excluded) assert.equal(fs.existsSync(path.join(root,file)), false, 'unrelated input: '+file);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('CircleCI consumes all seven native browser suites without omitting native acceptance steps', () => {
  const result = new Map(SUITES.map(suite => [suite, parseBrowserLane(workflow, suite)]));
  assert.equal(result.size, 7);
  for (const [suite, parsed] of result) {
    assert.match(parsed.sourceHash, /^[0-9a-f]{64}$/);
    assert(parsed.commands.length >= 2, 'suite ' + suite + ' must run real native checks and receipt');
    assert.equal(parsed.commands.at(-1).name, 'Bind passing browser evidence to the tested commit');
    assert.equal(new Set(parsed.commands.map(s => s.name)).size, parsed.commands.length);
    assert(parsed.commands.every(s => s.command && !s.command.includes('!unsafe')));
    assert.equal(Object.keys(parsed.coverage).length, 7);
  }
  assert(result.get('active').commands.length > 20, 'active suite cannot silently shrink');
  assert(result.get('network').commands.length > 8, 'network suite cannot silently shrink');
  assert(result.get('ui').commands.length > 8, 'UI suite cannot silently shrink');
  assert(result.get('startup').commands.some(s => s.command.includes('check-inkwave-startup-browser.mjs')));
  assert(result.get('range').commands.some(s => s.command.includes('check-inkwave-range.mjs')));
  assert(result.get('responsive').commands.some(s => s.command.includes('check-inkwave-responsive-isolated.mjs')));
  assert(result.get('catalog').commands.some(s => s.command.includes('check-inkwave-motion-catalog.mjs')));
});

test('CircleCI refuses unknown conditions instead of silently skipping added required checks', () => {
  const mutated = workflow.replace("if: matrix.suite == 'range'", "if: matrix.suite == 'range' && false");
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'range'), /Unrecognized native browser conditional/);
});

test('only the reviewed failure evidence command may run outside native acceptance on CircleCI', () => {
  const command = 'node scripts/ci/package-inkwave-evidence.mjs --browser-failure';
  assert(workflow.includes(command));
  for (const mutated of [
    workflow.replace(command, 'node scripts/another-command.mjs --browser-failure'),
    workflow.replace('if: always() && (failure() || cancelled())\n        id: browser_failure_evidence',
      'if: success()\n        id: browser_failure_evidence'),
  ]) {
    assert.notEqual(mutated, workflow);
    assert.throws(() => parseBrowserLane(mutated, 'responsive'), /Unreviewed evidence-only step/);
  }
  const lane = parseBrowserLane(workflow, 'responsive');
  assert(lane.commands.every(step => !step.command.includes(command)));
  assert(lane.commands.some(step => step.command.includes('check-inkwave-responsive-isolated.mjs')));
});

test('CircleCI refuses an omitted acceptance receipt', () => {
  const mutated = workflow.replace('Bind passing browser evidence to the tested commit',
                                    'Remove native acceptance receipt');
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'ui'), /unconditional native step/);
});

test('CircleCI rejects an unverified performance baseline migration', () => {
  assert.throws(() => parseBrowserLane(workflow, 'active', true), /Runtime-performance baseline/);
});

test('Native command edits update the browser acceptance source hash', () => {
  const before = parseBrowserLane(workflow, 'range');
  const after = parseBrowserLane(workflow.replace('node scripts/check-inkwave-range.mjs',
    'node scripts/check-inkwave-range-altered.mjs'), 'range');
  assert.notEqual(before.sourceHash, after.sourceHash);
  assert(after.commands.some(s => s.command.includes('range-altered')));
});

test('CircleCI covers native gameplay inputs without waking heavy lanes for unrelated workflow edits', () => {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf('  pull_request:');
  const end = lines.indexOf('  workflow_dispatch:');
  assert(start >= 0 && end > start, 'Expected stable native PR trigger definition');
  const paths = lines.slice(start, end)
    .filter(x => /^\s{6}- /.test(x))
    .map(x => x.trim().slice(2).replace(/^['"]|['"]$/g, ''));
  assert(paths.length >= 30, 'Native GitHub path coverage unexpectedly shrunk');
  const setup = fs.readFileSync('.circleci/config.yml', 'utf8');
  const mappings = setup.split(/\r?\n/)
    .filter(x => /^\s{12}\S+ run-inkwave true$/.test(x))
    .map(x => new RegExp('^' + x.trim().split(' ')[0] + '$'));
  assert(mappings.length >= 10, 'Missing native CircleCI file-change selectors');
  const witness = p => p.replace(/\*\*/g, 'example/feature').replace(/\*/g, 'example').replace(/\?/g, 'x');
  // GitHub owns the complete workflow-only CI contract gate itself. CircleCI
  // must cover gameplay/build inputs, not every unrelated workflow edit.
  assert(paths.includes('.github/workflows/*.yml'),'GitHub must cover every workflow-only PR');
  assert(mappings.some(x=>x.test('.github/workflows/validate-inkwave-update.yml')),
    'CircleCI must include changes to its own native acceptance workflow');
  for (const source of paths) {
    if(source==='.github/workflows/*.yml') continue;
    assert(mappings.some(x => x.test(witness(source))), 'CircleCI ignores a mandatory game trigger: ' + source);
  }
  for (const irrelevant of ['README.md', 'docs/unrelated-note.md', '.github/workflows/hex-lane-quality.yml', '.github/workflows/inkwave-main-weapons.yml'])
    assert(!mappings.some(x => x.test(irrelevant)), 'Unrelated change launches heavy INKWAVE CI: ' + irrelevant);
  assert(setup.includes('same-base-run: false'), 'Do not repeat heavy CI on same-main revision');
});

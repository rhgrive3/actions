import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Configuration contracts, not a simulation of GitHub's hosted scheduler.
// A fresh PR may retire its obsolete run; non-PR diagnostics retain evidence.
// Both permitted policies replace only pending members of their own group.
const workflows = [
  'validate-inkwave-native-stage5.yml',
  'validate-inkwave-ranked.yml',
  'inkwave-reopened-six.yml',
  'inkwave-gameplay-resources.yml',
];
const expression = "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || format('run-{0}', github.run_id) }}";
const read = name => expandTestSuiteSteps(fs.readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8'));
function policy(source) {
  const blocks = [...source.matchAll(/^concurrency:\n((?:[ \t].*(?:\n|$))*)/gm)];
  assert.equal(blocks.length, 1, 'one workflow-level concurrency policy');
  const group = /^  group: (.+)$/m.exec(blocks[0][1])?.[1];
  const cancel = /^  cancel-in-progress: (.+)$/m.exec(blocks[0][1])?.[1];
  assert.equal(group, expression, 'workflow + PR identity, unique non-PR fallback');
  assert.ok(['false', "${{ github.event_name == 'pull_request' }}"].includes(cancel), 'only same-PR supersession can cancel a running job');
  return { group, cancel };
}
// This resolver expresses the exact bounded expression checked above. It
// tests identity partitions; it does not claim a real hosted cancellation.
function groupFor(source, { workflow, event, pr, run }) {
  policy(source);
  return `${workflow}-${event === 'pull_request' ? `pr-${pr}` : `run-${run}`}`;
}
for (const name of workflows) {
  const source = read(name);
  test(`${name}: keeps only the latest pending slot of the same PR`, () => {
    const context = { workflow: name, event: 'pull_request', pr: 1324, run: 1 };
    assert.equal(groupFor(source, context), groupFor(source, { ...context, run: 2 }));
  });
  test(`${name}: distinct PRs and workflows cannot supersede each other`, () => {
    const context = { workflow: name, event: 'pull_request', pr: 1324, run: 1 };
    assert.notEqual(groupFor(source, context), groupFor(source, { ...context, pr: 1335 }));
    assert.notEqual(groupFor(source, context), groupFor(source, { ...context, workflow: 'another-workflow' }));
  });
  test(`${name}: main and manual diagnostics retain unique run groups`, () => {
    for (const event of ['push', 'workflow_dispatch']) {
      const context = { workflow: name, event, pr: null, run: 1 };
      assert.notEqual(groupFor(source, context), groupFor(source, { ...context, run: 2 }));
    }
  });
  test(`${name}: rejects missing, global, head-specific or running-cancel policies`, () => {
    for (const mutant of [
      source.replace(/^concurrency:\n(?:[ \t].*(?:\n|$))*/m, ''),
      source.replace(expression, 'all-inkwave'),
      source.replace(expression, '${{ github.sha }}'),
      source.replace(/^  cancel-in-progress: .+$/m, '  cancel-in-progress: true'),
    ]) assert.throws(() => policy(mutant));
  });
}
test('the policy contracts are wired into the existing General source gate', () => {
  const source = read('validate-inkwave-update.yml');
  assert.match(source, /run: node --test[^\n]*scripts\/tests\/inkwave-motion-gates\.test\.mjs[^\n]*scripts\/tests\/inkwave-integration-workflow\.test\.mjs[^\n]*scripts\/tests\/inkwave-runtime-evidence\.test\.mjs[^\n]*scripts\/tests\/inkwave-queued-workflow-policy\.test\.mjs/);
});

test('actual conditional policies retain push/manual evidence and supersede only the same PR',()=>{
 for(const name of workflows){const {cancel}=policy(read(name));
  assert.equal(cancel==='false'?false:'push'==='pull_request',false);
  assert.equal(cancel==='false'?false:'workflow_dispatch'==='pull_request',false);
  assert.equal(cancel==='false'?false:'pull_request'==='pull_request',name!=='validate-inkwave-ranked.yml');
 }
});

test('normal-RAF lifecycle CI uses the source-bound game and preserves leak rejection', () => {
  const source = read('inkwave-gameplay-resources.yml');
  const begin = source.indexOf('      - name: Verify normal RAF gameplay and Crab retirement across two Turf stages\n');
  assert.notEqual(begin, -1, 'the native gameplay harness must run in CI');
  const step = source.slice(begin, source.indexOf('      - name:', begin + 1));
  assert.match(step, /node scripts\/check-inkwave-gameplay-resources\.mjs/);
  for (const argument of ['--site .built-site/_site', '--source-sha "$SOURCE_SHA"',
    '--evidence-dir "$CI_STORAGE/evidence/gameplay"', '--maps tidewater,kelpline --cycles 2 --seconds 5',
    '--crab-lifecycle --expect-lifecycle released']) assert.ok(step.includes(argument), argument);
  assert.doesNotMatch(step, /continue-on-error|leak-observed|\|\| true/);
  const upload = source.slice(source.indexOf('      - name: Upload normal RAF gameplay lifecycle evidence\n'));
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /path: \$\{\{ env\.CI_STORAGE \}\}\/evidence\/gameplay\//);
  assert.match(upload, /if-no-files-found: error/);
});

test('actual lifecycle shell stops on failed, empty or non-executable browser lookup', () => {
  const source = read('inkwave-gameplay-resources.yml');
  const match = /      - name: Verify normal RAF gameplay and Crab retirement across two Turf stages\n        run: \|\n((?:          .*\n)+)/.exec(source);
  assert.ok(match, 'actual workflow shell is extracted');
  const shell = match[1].split('\n').filter(Boolean).map(line => line.slice(10)).join('\n');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-raf-ci-'));
  try {
    const bin = path.join(scratch, 'bin'); fs.mkdirSync(bin);
    const capture = path.join(scratch, 'harness-args');
    const notExecutable = path.join(scratch, 'not-executable'); fs.writeFileSync(notExecutable, '');
    fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh
if [ "$1" = "--input-type=module" ]; then
  case "$LOOKUP_MODE" in
    failed) exit 19;;
    empty) exit 0;;
    invalid) printf '%s' "$NON_EXECUTABLE"; exit 0;;
    valid) printf '%s' '/bin/true'; exit 0;;
  esac
fi
printf '%s\\n' "$@" > "$HARNESS_ARGS"
`, {mode: 0o755});
    for (const mode of ['failed', 'empty', 'invalid', 'valid']) {
      fs.rmSync(capture, {force: true});
      const result = spawnSync('bash', ['-e', '-c', shell], {encoding: 'utf8', env: {
        ...process.env, PATH: bin + path.delimiter + process.env.PATH, LOOKUP_MODE: mode,
        NON_EXECUTABLE: notExecutable, HARNESS_ARGS: capture,
        CI_STORAGE: path.join(scratch, 'evidence'), SOURCE_SHA: 'a'.repeat(40),
      }});
      assert.ifError(result.error);
      if (mode !== 'valid') {
        assert.notEqual(result.status, 0, mode + ' must stop before launching the harness');
        assert.equal(fs.existsSync(capture), false, mode + ' must not reach fallback Chromium');
      } else {
        assert.equal(result.status, 0, result.stderr);
        const args = fs.readFileSync(capture, 'utf8').trimEnd().split('\n');
        assert.equal(args[0], 'scripts/check-inkwave-gameplay-resources.mjs');
        assert.equal(args[args.indexOf('--source-sha') + 1], 'a'.repeat(40));
        assert.equal(args[args.indexOf('--expect-lifecycle') + 1], 'released');
      }
    }
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
});

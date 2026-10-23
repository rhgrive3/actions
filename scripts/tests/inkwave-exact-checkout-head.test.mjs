import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['inkwave-paint-hotpath', 'inkwave-runtime-frame-parity', 'inkwave-touch-frame-pacing'];
const repo = mkdtempSync(join(tmpdir(), 'inkwave-head-proof-'));
function git(...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
git('init', '-q');
git('config', 'user.email', 'test@example.invalid');
git('config', 'user.name', 'Local regression fixture');
writeFileSync(join(repo, 'fixture'), 'base\n');
git('add', 'fixture'); git('commit', '-qm', 'base');
const base = git('rev-parse', 'HEAD');
writeFileSync(join(repo, 'fixture'), 'head\n');
git('commit', '-qam', 'head');
const head = git('rev-parse', 'HEAD');
process.on('exit', () => rmSync(repo, { recursive: true, force: true }));

for (const name of names) {
  const yaml = readFileSync(join(root, '.github/workflows', `${name}.yml`), 'utf8');
  const match = yaml.match(/      - name: Verify exact checkout head\n([\s\S]*?)      - uses: actions\/setup-node@v4/);
  assert.ok(match, `${name}: assertion must immediately follow checkout and precede setup`);
  assert.match(yaml, /- uses: actions\/checkout@v4\n        with:\n          ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}\n      - name: Verify exact checkout head/);
  assert.match(match[1], /EXPECTED_SHA: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.match(match[1], /PR_HEAD_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(match[1], /EVENT_SHA: \$\{\{ github.sha \}\}/);
  assert.match(match[1], /EVENT_NAME: \$\{\{ github.event_name \}\}/);
  const script = match[1].split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  function run(overrides = {}, actual = head) {
    git('checkout', '-q', '--detach', actual);
    return spawnSync('bash', ['-c', script], {
      cwd: repo, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, EXPECTED_SHA: head, PR_HEAD_SHA: head, EVENT_SHA: base, EVENT_NAME: 'pull_request', ...overrides },
    });
  }
  const cases = [
    ['same-repository PR uses head, not merge SHA', {}, head, true],
    ['fork PR uses immutable head, not base ref', { GITHUB_HEAD_REF: 'fork-contributor-branch', GITHUB_REPOSITORY: 'rhgrive3/actions' }, head, true],
    ['manual dispatch uses event SHA', { EVENT_NAME: 'workflow_dispatch', PR_HEAD_SHA: '', EVENT_SHA: head }, head, true],
    ['push identity uses event SHA without enabling push trigger', { EVENT_NAME: 'push', PR_HEAD_SHA: '', EVENT_SHA: head }, head, true],
    ['merge or wrong HEAD is rejected', {}, base, false],
    ['missing PR head cannot fall back to event SHA', { PR_HEAD_SHA: '', EVENT_SHA: head }, head, false],
    ['short SHA is rejected', { PR_HEAD_SHA: head.slice(0, 7), EXPECTED_SHA: head.slice(0, 7) }, head, false],
    ['nonhex SHA is rejected', { PR_HEAD_SHA: 'z'.repeat(40), EXPECTED_SHA: 'z'.repeat(40) }, head, false],
    ['newline payload is rejected', { PR_HEAD_SHA: `${head}\necho injected`, EXPECTED_SHA: `${head}\necho injected` }, head, false],
    ['mismatched checkout input is rejected', { EXPECTED_SHA: base }, head, false],
    ['manual stale HEAD is rejected', { EVENT_NAME: 'workflow_dispatch', PR_HEAD_SHA: '', EVENT_SHA: base, EXPECTED_SHA: base }, head, false],
    ['unsupported event is rejected', { EVENT_NAME: 'pull_request_target' }, head, false],
    ['malformed manual event SHA is rejected', { EVENT_NAME: 'workflow_dispatch', EVENT_SHA: '', EXPECTED_SHA: '' }, head, false],
  ];
  for (const [label, env, actual, success] of cases) {
    test(`${name}: ${label}`, () => {
      const result = run(env, actual);
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, success, result.stderr);
    });
  }
}

// Verify actual test arguments in the existing core QA invocation, not mere
// filename presence elsewhere in the workflow or patch-only shard discovery.
const coreWorkflow = readFileSync(join(root, '.github/workflows/validate-inkwave-update.yml'), 'utf8');
const requiredCoreTests = ["scripts/tests/inkwave-exact-checkout-head.test.mjs", "scripts/tests/inkwave-responsive-progress-summary.test.mjs"];
function assertCoreTestSelection(source) {
  const commands = [...source.matchAll(/^      - name: Verify motion verifier regressions\n        run: (.+)$/gm)];
  assert.equal(commands.length, 1, 'one existing core QA test invocation');
  const tokens = commands[0][1].trim().split(/\s+/);
  assert.deepEqual(tokens.slice(0, 2), ['node', '--test']);
  for (const file of requiredCoreTests) {
    assert.equal(tokens.filter(token => token === file).length, 1, 'selected once: ' + file);
    assert.ok(readFileSync(join(root, file)).length > 0, 'selected test exists');
  }
}
test('core QA command selects exact checkout and future progress regressions', () => {
  assertCoreTestSelection(coreWorkflow);
});
test('core QA selection rejects filenames merely mentioned outside the invocation', () => {
  for (const file of requiredCoreTests) {
    const mutant = coreWorkflow.replace(' ' + file, '') + '\n# ' + file + '\n';
    assert.throws(() => assertCoreTestSelection(mutant));
  }
});
test('core QA selection rejects duplicate, disabled and wrong commands', () => {
  const file = requiredCoreTests[0];
  for (const mutant of [
    coreWorkflow.replace(' ' + file, ' ' + file + ' ' + file),
    coreWorkflow.replace('name: Verify motion verifier regressions', 'name: Disabled core test invocation'),
    coreWorkflow.replace(/(name: Verify motion verifier regressions\n        run:) node --test/, '$1 echo --test'),
  ]) assert.throws(() => assertCoreTestSelection(mutant));
});

import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['inkwave-paint-hotpath', 'inkwave-runtime-frame-parity', 'inkwave-touch-frame-pacing', 'inkwave-pause-gpu'];
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

// Pin each reviewed sparse profile exactly; no action or executable step may
// be inserted between immutable checkout and the mandatory identity assertion.
const reviewedCheckoutOptionHashes = {
  "inkwave-paint-hotpath": "568beeb11b18b04b4991b7db25dd0f61dba7fbe26929b4de89df77414e82e7f1",
  "inkwave-runtime-frame-parity": "f43c4f896621cf82ef9d09967456375d5ae463ed98486df17c6823c388caef62",
  "inkwave-touch-frame-pacing": "568beeb11b18b04b4991b7db25dd0f61dba7fbe26929b4de89df77414e82e7f1",
  "inkwave-pause-gpu": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
};
const checkoutPrefix="      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha || github.sha }}\n";
function assertCheckoutSequence(yaml,name) {
 assert.equal(yaml.split(checkoutPrefix).length,2,name+': one exact immutable checkout');
 const rest=yaml.split(checkoutPrefix)[1],marker='      - name: Verify exact checkout head\n';
 assert(rest.includes(marker),name+': immediate mandatory head assertion');
 const options=rest.slice(0,rest.indexOf(marker));
 assert.equal(createHash('sha256').update(options).digest('hex'),reviewedCheckoutOptionHashes[name],name+': exact reviewed checkout options before head assertion');
 return options;
}

for (const name of names) {
  const yaml = readFileSync(join(root, '.github/workflows', `${name}.yml`), 'utf8');
  const match = yaml.match(/      - name: Verify exact checkout head\n([\s\S]*?)      - uses: actions\/setup-node@v4/);
  assert.ok(match, `${name}: assertion must immediately follow checkout and precede setup`);
  const reviewedOptions=assertCheckoutSequence(yaml,name);
  test(`${name}: checkout pin, sparse options and immediate head assertion cannot be omitted or altered`,()=>{
    for(const changed of [
      yaml.replace('ref: ${{ github.event.pull_request.head.sha || github.sha }}','ref: main'),
      yaml.replace('      - name: Verify exact checkout head','      - run: echo unverified checkout\n      - name: Verify exact checkout head'),
      yaml.replace('      - uses: actions/checkout@v4','      - uses: actions/checkout@v3'),
      ...(reviewedOptions?[yaml.replace(reviewedOptions,''),yaml.replace(reviewedOptions,reviewedOptions+'          persist-credentials: true\n')]:[]),
    ])assert.throws(()=>assertCheckoutSequence(changed,name));
  });
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
const coreWorkflow = expandTestSuiteSteps(readFileSync(join(root, '.github/workflows/validate-inkwave-update.yml'), 'utf8'));
const requiredCoreTests = ["scripts/tests/inkwave-exact-checkout-head.test.mjs", "scripts/tests/inkwave-responsive-progress-summary.test.mjs", "scripts/tests/inkwave-frozen-hud-capture.test.mjs", "scripts/tests/inkwave-ui-visual-probe-errors.test.mjs"];
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

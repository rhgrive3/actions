import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TEST_SUITES, planTestSuite, runTestSuite, expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = 'scripts/ci/run-inkwave-test-suite.mjs';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-suite-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('every named suite preflights real inputs and npm selects the canonical suite', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const name of Object.keys(TEST_SUITES)) assert.ok(planTestSuite(name).length, name);
  for (const name of ['direct-source', 'relay', 'account', 'quality', 'backup', 'queue-recovery', 'memory'])
    assert.equal(scripts['test:' + name], `node ${runner} ${name}`);
  assert.equal(scripts['test:ci-config'], `node ${runner} runner-contracts`);
  assert.ok(scripts.test.includes('npm run test:ci-config'));
  const quality = read('.github/workflows/ci-quality-gate.yml');
  for (const name of ['ci-config', 'direct-source', 'quality', 'relay', 'backup'])
    assert.ok(quality.includes('run: npm run test:' + name + '\n'), name);
  assert.ok(planTestSuite('quality').flatMap(x => x.args).includes('patches/local-quality/tests/squid-rapid-idle-regression.test.mjs'));
  assert.ok(planTestSuite('relay').flatMap(x => x.args).includes('server/tests/relay-clock-receipts.test.mjs'));
  for(const file of ['inkwave-circleci-browser-lane.test.mjs','inkwave-sandbox-runner-route.test.mjs'])
    assert.ok(planTestSuite('verifier').flatMap(x=>x.args).includes('scripts/tests/'+file),'canonical verifier must retain required browser CI contracts');
});

test('workflow suite changes route through each consumer on both push and PR', () => {
  const validate=read('.github/workflows/validate-inkwave-update.yml');
  assert.equal(validate.split('      - "scripts/ci/**"\n').length-1,2);
  // Specialized account/relay workflows only consume the runner and suite manifest.
  // All other scripts/ci edits retain the full Validate gate without redundant jobs.
  for(const name of ['zevant-account','inkwave-relay-security']) {
    const consumer=read('.github/workflows/'+name+'.yml');
    assert(!consumer.includes('scripts/ci/**'));
    for(const path of ['scripts/ci/run-inkwave-test-suite.mjs','scripts/ci/inkwave-test-suites.json'])
      assert.equal(consumer.split('      - "'+path+'"\n').length-1,2,name+': '+path);
  }
  const workflow = read('.github/workflows/validate-inkwave-update.yml');
  for (const name of ['verifier', 'acceptance'])
    assert.equal(workflow.split(`        run: node ${runner} ${name}\n`).length - 1, 1);
  assert.match(read('.circleci/config.yml'), /scripts\/ci\/\.\* run-inkwave true/);
});

test('discovery is sorted, includes newly added tests, and rejects empty suites', t => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, 'tests'));
  const suites = {fixture: {steps: [{program: 'node', args: ['--test', 'tests/*.test.mjs']}]}};
  const plan = () => planTestSuite('fixture', {root: directory, suites});
  assert.throws(plan, /Empty test glob/);
  for (const file of ['z.test.mjs', 'a.test.mjs', 'helper.mjs']) fs.writeFileSync(path.join(directory, 'tests', file), '');
  assert.deepEqual(plan()[0].args, ['--test', 'tests/a.test.mjs', 'tests/z.test.mjs']);
  fs.writeFileSync(path.join(directory, 'tests/new.test.mjs'), '');
  assert.ok(plan()[0].args.includes('tests/new.test.mjs'));
});

test('unknown, duplicate, missing and malformed inputs fail before any child starts', t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'a.test.mjs'), '');
  for (const steps of [[], [{program: 'node', args: ['--test']}], [{program: 'node', args: ['missing-script.mjs']}], [{program: 'python3', args: ['-m', 'unittest', 'discover', '-s', '.', '-p', 'missing_*.py']}], [{program: 'bash', args: ['-c', 'true']}],
    [{program: 'node', args: ['--test', 'a.test.mjs', 'a.test.mjs']}],
    [{program: 'node', args: ['--test', '../a.test.mjs']}],
    [{program: 'node', args: ['--test', 'tests/**/*.test.mjs']}],
    [{program: 'node', args: ['--test', 'a.test.mjs']}, {program: 'node', args: ['--test', 'missing.test.mjs']}],
    [{program: 'node', args: ['--test', 'a.test.mjs\n']}],
  ]) {
    let calls = 0;
    assert.throws(() => runTestSuite('fixture', {root: directory, suites: {fixture: {steps}}, spawn() { calls++; }, log() {}}));
    assert.equal(calls, 0);
  }
  for (const name of ['unknown', 'toString', '__proto__']) assert.throws(() => planTestSuite(name), /Unknown/);
});

test('execution retains exact flags, cwd and environment and stops on every failure form', () => {
  const suites = {fixture: {steps: [
    {program: 'node', args: ['--max-old-space-size=128', '--test', '--test-concurrency=1', 'scripts/tests/inkwave-test-suites.test.mjs']},
    {program: 'python3', args: ['-m', 'unittest', 'discover', '-s', 'tools/backup/tests', '-p', 'test_*.py']},
  ]}};
  for (const failure of [{status: 7}, {status: null, signal: 'SIGTERM'}, {status: null, error: Error('spawn failed')}]) {
    let calls = 0;
    const status = runTestSuite('fixture', {suites, spawn(program, args, options) {
      calls++;
      assert.equal(program, process.execPath);
      assert.deepEqual(args, suites.fixture.steps[0].args);
      assert.equal(options.cwd, root);
      assert.equal(options.env, process.env);
      assert.equal(options.stdio, 'inherit');
      return failure;
    }, log() {}});
    assert.equal(status, failure.status || 1);
    assert.equal(calls, 1);
  }
  const programs = [];
  assert.equal(runTestSuite('fixture', {suites, spawn(program) { programs.push(program); return {status: 0}; }, log() {}}), 0);
  assert.deepEqual(programs, [process.execPath, 'python3']);
});

test('a real failing Node test remains a failure through the suite runner', t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'fail.test.mjs'), "import test from 'node:test'; test('failure propagation', () => { throw Error('deliberate failure'); });\n");
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const suites = {fixture: {steps: [{program: 'node', args: ['--test', 'fail.test.mjs']}]}};
  const status = runTestSuite('fixture', {root: directory, suites, log() {},
    spawn(program, args, options) { return spawnSync(program, args, {...options, env, stdio: 'pipe'}); }});
  assert.equal(status, 1);
});

test('effective workflow expansion preserves exact flags and rejects altered invocations', () => {
  for (const name of ['verifier', 'acceptance']) {
    const invocation = `        run: node ${runner} ${name}`;
    const expanded = expandTestSuiteSteps(invocation);
    for (const step of TEST_SUITES[name].steps) assert.ok(expanded.includes(`${step.program} ${step.args.join(' ')}`));
    for (const mutant of [invocation.replace('run: node ', 'run: echo '), invocation + ' --skip', invocation.replace('run: node ', 'run: node --test ')])
      assert.equal(expandTestSuiteSteps(mutant), mutant);
  }
  assert.throws(() => expandTestSuiteSteps(`        run: node ${runner} unknown`), /Unknown/);
});

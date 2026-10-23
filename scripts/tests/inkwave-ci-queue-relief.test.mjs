import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the actual workflow body against changing API snapshots. Never make
// a network request or supply a real credential in these cancellation tests.
const workflow = fs.readFileSync(new URL('../../.github/workflows/inkwave-ci-queue-relief.yml', import.meta.url), 'utf8');
const source = workflow.split("<<'NODE'\n")[1].split('\n          NODE')[0]
  .split('\n').map(line => line.slice(10)).join('\n')
  .replace("import process from 'node:process';", '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const repo = 'rhgrive3/actions';
const pr = (state = 'open', sha = 'new', full_name = repo) => ({state, head: {sha, repo: {full_name}}});
const run = {id: 7, event: 'pull_request', status: 'queued', head_sha: 'old', name: 'check', pull_requests: [{number: 12}]};

async function execute({firstPr = pr(), currentPr = pr(), latest = run, initial = run, dryRun = false} = {}) {
  const calls = [], logs = [];
  let reads = 0;
  const process = {env: {GITHUB_REPOSITORY: repo, GITHUB_TOKEN: 'fixture-only', DRY_RUN: String(dryRun)}};
  const fetch = async (url, options = {}) => {
    const route = new URL(url).pathname + new URL(url).search;
    calls.push([options.method || 'GET', route]);
    let body;
    if (route.includes('/actions/runs?status=queued')) body = {workflow_runs: [initial]};
    else if (route.includes('/actions/runs?status=pending')) body = {workflow_runs: []};
    else if (route.endsWith('/pulls/12')) body = reads++ ? currentPr : firstPr;
    else if (route.endsWith('/actions/runs/7/cancel')) return {ok: true, status: 202};
    else if (route.endsWith('/actions/runs/7')) body = latest;
    else throw Error('Unexpected fixture request: ' + route);
    return {ok: true, status: 200, json: async () => structuredClone(body)};
  };
  await new AsyncFunction('fetch', 'process', 'console', source)(fetch, process, {log: text => logs.push(text), error: text => logs.push(text)});
  const report = JSON.parse(logs.find(line => line.startsWith('CI_QUEUE_RELIEF_RESULT ')).slice('CI_QUEUE_RELIEF_RESULT '.length));
  assert.deepEqual(report.errors, []);
  return {calls, report};
}

for (const [name, options] of [
  ['head rolled back to the queued commit', {currentPr: pr('open', 'old')}],
  ['PR reopened on the queued commit', {firstPr: pr('closed', 'old'), currentPr: pr('open', 'old')}],
  ['PR head moved to a foreign repository', {currentPr: pr('open', 'new', 'foreign/repo')}],
  ['run association changed', {latest: {...run, pull_requests: [{number: 13}]}}],
  ['run association became ambiguous', {latest: {...run, pull_requests: [{number: 12}, {number: 13}]}}],
  ['run started executing', {latest: {...run, status: 'in_progress'}}],
  ['run changed to a push', {latest: {...run, event: 'push'}}],
]) test('queue cleanup preserves a run when ' + name, async () => {
  const {calls, report} = await execute(options);
  assert.equal(report.cancelled, 0);
  assert.equal(report.untouched, 1);
  assert.equal(calls.some(([method]) => method === 'POST'), false);
});

test('obsolete queued run is cancelled only after run and fresh PR revalidation', async () => {
  const {calls, report} = await execute();
  assert.equal(report.cancelled, 1);
  assert.deepEqual(calls.slice(-3), [
    ['GET', '/repos/rhgrive3/actions/actions/runs/7'],
    ['GET', '/repos/rhgrive3/actions/pulls/12'],
    ['POST', '/repos/rhgrive3/actions/actions/runs/7/cancel'],
  ]);
});

test('dry run reports obsolete work without cancellation', async () => {
  const {calls, report} = await execute({dryRun: true});
  assert.equal(report.obsolete, 1);
  assert.equal(report.cancelled, 0);
  assert.equal(calls.some(([method]) => method === 'POST'), false);
});

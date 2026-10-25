import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_LANES, statusLaneName, summarizeCircleCI, evaluateOffloadEvidence, bindCommitStatusesToSource } from '../ci/check-circleci-offload.mjs';

const sha = 'a'.repeat(40);

test('all nine native lanes are required, including each independently rendered browser suite', () => {
  assert.equal(REQUIRED_LANES.length, 9);
  assert.equal(new Set(REQUIRED_LANES).size, 9);
  const statuses = REQUIRED_LANES.map((name,i) => ({
    context: 'ci/circleci: ' + name, state:'success',sha,
    updated_at:'2026-10-25T03:' + String(i).padStart(2,'0') + ':00Z'
  }));
  assert(Object.values(summarizeCircleCI([], statuses, sha)).every(x => x === 'success'));
  for (let i=0; i<REQUIRED_LANES.length; i++) {
    const removed = statuses.filter((_,j) => j !== i);
    assert.equal(summarizeCircleCI([], removed, sha)[REQUIRED_LANES[i]], 'missing');
  }
});

test('different source SHAs and lookalike provider checks are never accepted', () => {
  const otherSha = 'b'.repeat(40);
  const checks = [{ app: {slug:'circleci'}, name:'browser-active',status:'completed',conclusion:'success',head_sha:otherSha }];
  const spoof = [{context:'ci/other: browser-active',state:'success',sha}];
  assert.equal(summarizeCircleCI(checks, spoof, sha)['browser-active'], 'missing');
  assert.equal(statusLaneName('ci/other: browser-active'), null);
});

test('verified GitHub App job names need not repeat CircleCI slug', () => {
  const checks = [{app:{slug:'circleci'},name:'ink-wave-ci-offload/browser-active',
    head_sha:sha,status:'completed',conclusion:'success',completed_at:'2026-10-25T04:00:00Z'}];
  assert.equal(summarizeCircleCI(checks,[],sha)['browser-active'], 'success');
});

test('latest failure replaces older success for a lane on the same SHA', () => {
  const statuses = [
    { context:'ci/circleci: browser-ui',state:'success',sha,updated_at:'2026-10-25T01:00:00Z' },
    { context:'ci/circleci: browser-ui',state:'failure',sha,updated_at:'2026-10-25T03:00:00Z' }
  ];
  assert.equal(summarizeCircleCI([], statuses, sha)['browser-ui'], 'failure');
});

test('a merely queued CircleCI check never marks the offload complete', () => {
  const checks = [{app:{slug:'circleci'},name:'browser-network',head_sha:sha,status:'in_progress',conclusion:null}];
  assert.equal(summarizeCircleCI(checks,[],sha)['browser-network'], 'pending');
});

test('Nine independent green job statuses alone do not prove the eight-way patch fan-in', () => {
  const statuses = REQUIRED_LANES.map(name => ({context:'ci/circleci: '+name, sha, state:'success'}));
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'pending');
});

test('Final CircleCI DAG receipt proves all required upstream patch and browser jobs passed', () => {
  const statuses = [{context:'ci/circleci: offload-complete',sha,state:'success',
    updated_at:'2026-10-25T05:40:00Z'}];
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'success');
  assert.match(evaluateOffloadEvidence([],statuses,sha).via,/final DAG/);
});

test('Only exact source SHA can admit the final DAG receipt', () => {
  const statuses = [{context:'ci/circleci: offload-complete',sha:'b'.repeat(40),state:'success'}];
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'pending');
  assert.equal(evaluateOffloadEvidence([],[{context:'ci/other: offload-complete',sha,state:'success'}],sha).state,'pending');
});

test('CircleCI workflow-level GitHub Checks can replace job-level statuses', () => {
  const checks = [{app:{slug:'circleci-checks'},head_sha:sha,
    name:'ink-wave-ci-offload-a1234567',status:'completed',conclusion:'success',
    completed_at:'2026-10-25T05:45:00Z'}];
  assert.equal(evaluateOffloadEvidence(checks,[],sha).state,'success');
});

test('Green setup workflow and spoofed GitHub Actions checks do not admit offload', () => {
  const checks = [
    {app:{slug:'circleci-checks'},head_sha:sha,name:'detect-inkwave-changes',
      status:'completed',conclusion:'success'},
    {app:{slug:'github-actions'},head_sha:sha,name:'ink-wave-ci-offload',
      status:'completed',conclusion:'success'}
  ];
  assert.equal(evaluateOffloadEvidence(checks,[],sha).state,'pending');
});

test('Failed and pending full-workflow results are never green', () => {
  const check = {app:{slug:'circleci-checks'},head_sha:sha,name:'ink-wave-ci-offload',
    status:'completed',conclusion:'failure',completed_at:'2026-10-25T05:42:00Z'};
  assert.equal(evaluateOffloadEvidence([check],[],sha).state,'failure');
  assert.equal(evaluateOffloadEvidence([{...check,status:'in_progress',conclusion:null}],[],sha).state,'pending');
});

test('Successful rerun fan-in supersedes older failed patch status on same SHA', () => {
  const statuses = [
    {context:'ci/circleci: patch-regressions',sha,state:'failure',updated_at:'2026-10-25T04:00:00Z'},
    {context:'ci/circleci: offload-complete',sha,state:'success',updated_at:'2026-10-25T05:00:00Z'}
  ];
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'success');
});


test('an older full-suite success cannot certify a later canceled same-SHA run', () => {
  const statuses=[
    {context:'ci/circleci: offload-complete',sha,state:'success',updated_at:'2026-10-25T04:00:00Z'},
    {context:'ci/circleci: patch-regressions',sha,state:'error',updated_at:'2026-10-25T05:00:00Z'}
  ];
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'failure');
});

test('a newer same-SHA setup rerun invalidates the previous full-suite receipt', () => {
  const statuses=[
    {context:'ci/circleci: offload-complete',sha,state:'success',updated_at:'2026-10-25T04:00:00Z'},
    {context:'ci/circleci: detect-native-changes',sha,state:'pending',updated_at:'2026-10-25T05:00:00Z'}
  ];
  assert.equal(evaluateOffloadEvidence([],statuses,sha).state,'pending');
});

test('a newer trusted workflow check cannot inherit an older successful workflow status', () => {
  const checks=[
    {app:{slug:'circleci-checks'},head_sha:sha,name:'ink-wave-ci-offload old',
      status:'completed',conclusion:'success',completed_at:'2026-10-25T04:00:00Z'},
    {app:{slug:'circleci-checks'},head_sha:sha,name:'detect-inkwave-changes',
      status:'in_progress',conclusion:null,started_at:'2026-10-25T05:00:00Z'}
  ];
  assert.equal(evaluateOffloadEvidence(checks,[],sha).state,'pending');
});


// Matches GitHub REST's actual commit-status shape: identity is in the URL,
// not a synthetic sha property. No CircleCI network access is used here.
const statusEndpoint = `https://api.github.com/repos/rhgrive3/actions/commits/${sha}/statuses`;
function restStatus(context = 'ci/circleci: offload-complete', state = 'success', time = '2026-10-25T05:00:00Z') {
  return {
    url: `https://api.github.com/repos/rhgrive3/actions/statuses/${sha}`,
    id: 57194658856,
    node_id: 'SC_fixture',
    state, context,
    description: 'CircleCI status fixture',
    target_url: 'https://app.circleci.com/pipelines/github/rhgrive3/actions/fixture',
    created_at: time, updated_at: time,
    creator: { login: 'circleci[bot]' }
  };
}
const bindStatuses = rows => bindCommitStatusesToSource(rows, statusEndpoint, sha);

test('actual REST status shape gains exact source identity only at the API boundary', () => {
  const raw = restStatus();
  assert.equal(Object.hasOwn(raw, 'sha'), false);
  assert.equal(evaluateOffloadEvidence([], [raw], sha).state, 'pending');
  const [bound] = bindStatuses([raw]);
  assert.equal(bound.sha, sha);
  assert.equal(Object.hasOwn(raw, 'sha'), false, 'normalization must not mutate raw evidence');
  assert.equal(evaluateOffloadEvidence([], [bound], sha).state, 'success');
  assert.equal(bindStatuses([{ ...raw, sha }])[0].sha, sha);
});

test('status binding rejects mutable, wrong-source, wrong-repository and foreign endpoints', () => {
  const endpoints = [
    statusEndpoint.replace(sha, 'main'),
    statusEndpoint.replace(sha, 'b'.repeat(40)),
    statusEndpoint.replace('/actions/', '/other/'),
    statusEndpoint.replace('api.github.com', 'api.github.com.example.org'),
    statusEndpoint + '?ref=' + sha,
    statusEndpoint.replace('/statuses', '/check-runs')
  ];
  for (const endpoint of endpoints)
    assert.throws(() => bindCommitStatusesToSource([restStatus()], endpoint, sha), /Unexpected commit-status endpoint/);
  assert.throws(() => bindCommitStatusesToSource([], statusEndpoint, 'main'));
});

test('status binding rejects conflicting explicit SHA and missing or mismatched row URLs', () => {
  for (const explicit of ['b'.repeat(40), undefined, null, 'main'])
    assert.throws(() => bindStatuses([{ ...restStatus(), sha: explicit }]), /Explicit commit-status SHA conflicts/);
  for (const url of [undefined, '', restStatus().url.replace(sha, 'b'.repeat(40)),
    restStatus().url.replace('/actions/', '/other/'), restStatus().url + '?source=' + sha,
    restStatus().url.replace('api.github.com', 'api.github.com.example.org')])
    assert.throws(() => bindStatuses([{ ...restStatus(), url }]), /Commit-status URL does not match/);
  assert.throws(() => bindStatuses({}), /Invalid GitHub commit-status response/);
  assert.throws(() => bindStatuses([null]), /Invalid GitHub commit-status row/);
});

test('REST normalization does not waive provider or full-DAG acceptance', () => {
  const partial = REQUIRED_LANES.map(lane => restStatus('ci/circleci: ' + lane));
  assert.equal(evaluateOffloadEvidence([], bindStatuses(partial), sha).state, 'pending');
  assert.equal(evaluateOffloadEvidence([], bindStatuses([restStatus('ci/other: offload-complete')]), sha).state, 'pending');
  assert.equal(evaluateOffloadEvidence([], bindStatuses([restStatus('ci/circleci: detect-native-changes')]), sha).state, 'pending');
});

test('REST-bound evidence preserves recovery, newer failed runs and pending setup controls', () => {
  const receipt = restStatus();
  const earlierFailure = restStatus('ci/circleci: patch-regressions', 'failure', '2026-10-25T04:00:00Z');
  assert.equal(evaluateOffloadEvidence([], bindStatuses([receipt, earlierFailure]), sha).state, 'success');
  for (const state of ['failure', 'error']) {
    const failedRerun = restStatus('ci/circleci: browser-network', state, '2026-10-25T06:00:00Z');
    assert.equal(evaluateOffloadEvidence([], bindStatuses([receipt, failedRerun]), sha).state, 'failure');
    const recovered = restStatus('ci/circleci: offload-complete', 'success', '2026-10-25T07:00:00Z');
    assert.equal(evaluateOffloadEvidence([], bindStatuses([receipt, failedRerun, recovered]), sha).state, 'success');
  }
  const setup = restStatus('ci/circleci: detect-native-changes', 'pending', '2026-10-25T06:00:00Z');
  assert.equal(evaluateOffloadEvidence([], bindStatuses([receipt, setup]), sha).state, 'pending');
  assert.equal(evaluateOffloadEvidence([], bindStatuses([restStatus('ci/circleci: offload-complete', 'error')]), sha).state, 'failure');
});

test('gate main binds the real REST-shaped fixture at its fetch boundary', () => {
  const fixture = restStatus();
  const preload = `globalThis.fetch = async url => {
    const requested = new URL(url);
    let body;
    if (requested.origin + requested.pathname === ${JSON.stringify(statusEndpoint)}) body = [${JSON.stringify(fixture)}];
    else if (requested.origin + requested.pathname === ${JSON.stringify(statusEndpoint.replace('/statuses', '/check-runs'))}) body = {check_runs: []};
    else throw Error('Unexpected network request: ' + url);
    return {ok: true, json: async () => body};
  };`;
  const entry = fileURLToPath(new URL('../ci/check-circleci-offload.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload), entry], {
    env: {GITHUB_REPOSITORY: 'rhgrive3/actions', SOURCE_SHA: sha, GITHUB_TOKEN: 'fixture-not-a-real-token'},
    encoding: 'utf8', timeout: 10_000
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /CircleCI offloaded acceptance complete for exact SHA: CircleCI final DAG job/);
});

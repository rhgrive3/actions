import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_LANES, statusLaneName, summarizeCircleCI, evaluateOffloadEvidence } from '../ci/check-circleci-offload.mjs';

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

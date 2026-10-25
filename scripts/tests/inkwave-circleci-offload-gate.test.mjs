import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_LANES, statusLaneName, summarizeCircleCI } from '../ci/check-circleci-offload.mjs';

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

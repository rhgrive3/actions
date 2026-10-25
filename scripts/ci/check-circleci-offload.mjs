#!/usr/bin/env node
/**
 * Fail-closed cross-provider CI receipt gate.
 * Called only when explicit repo variable INKWAVE_CIRCLECI_OFFLOAD=enabled.
 * A completed CircleCI job for the EXACT source SHA must exist for every
 * native offloaded lane; otherwise GitHub Validate INKWAVE cannot go green.
 */
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

export const REQUIRED_LANES = [
  'patch-regressions',
  'build-native-site',
  'browser-active',
  'browser-catalog',
  'browser-ui',
  'browser-responsive',
  'browser-network',
  'browser-range',
  'browser-startup'
];

export function statusLaneName(context, providerTrusted = false) {
  const name = String(context || '');
  if (!providerTrusted && !/circleci/i.test(name)) return null;
  for (const lane of REQUIRED_LANES) {
    // Accept both GitHub OAuth-style 'ci/circleci: browser-active' and
    // CircleCI GitHub-App checks with a job/workflow prefix.
    const at = name.lastIndexOf(lane);
    if (at < 0) continue;
    const left = name[at - 1] || '';
    const right = name[at + lane.length] || '';
    if ((!left || /[\s:>/]/.test(left)) && (!right || /[\s:>/]/.test(right))) return lane;
  }
  return null;
}

export function summarizeCircleCI(checkRuns, statuses, sha) {
  const observed = [];
  for (const check of checkRuns) {
    if (check.head_sha && check.head_sha !== sha) continue;
    if (!/circleci/i.test(check.app?.slug || '') && !/circleci/i.test(check.name || '')) continue;
    const lane = statusLaneName(check.name, /circleci/i.test(check.app?.slug || '')) || (
      /circleci/i.test(check.app?.slug || '') ?
        REQUIRED_LANES.find(x => String(check.name || '').trim() === x) : null
    );
    if (!lane) continue;
    observed.push({ lane, state: check.status === 'completed' ? check.conclusion : 'pending',
      recorded: check.completed_at || check.started_at || check.created_at || '',
      source: 'check-run' });
  }
  for (const status of statuses) {
    if (status.sha && status.sha !== sha) continue;
    if (!/circleci/i.test(status.context || '')) continue;
    const lane = statusLaneName(status.context);
    if (!lane) continue;
    observed.push({ lane, state: status.state === 'success' ? 'success' :
      status.state === 'pending' ? 'pending' : 'failure',
      recorded: status.updated_at || status.created_at || '', source: 'commit-status' });
  }
  const chosen = {};
  for (const row of observed.sort((a,b) => String(a.recorded).localeCompare(String(b.recorded))))
    chosen[row.lane] = row;
  return Object.fromEntries(REQUIRED_LANES.map(lane => [lane, chosen[lane]?.state || 'missing']));
}


/**
 * CircleCI's regular commit statuses are JOB-level. GitHub Checks from the
 * CircleCI Checks app are WORKFLOW-level, and may be the only published signal.
 * The authoritative fan-in job is a small native CircleCI job that cannot
 * succeed until all eight patch shards, the shared build and all seven
 * browser jobs have succeeded. A trusted workflow check is equivalent.
 *
 * Neither a lone green patch shard nor a green path-filtering setup is proof.
 */
export const OFFLOAD_COMPLETE_JOB = 'offload-complete';
export const OFFLOAD_WORKFLOW = 'ink-wave-ci-offload';

const trustedApp = value => /^(?:circleci|circleci-checks)$/i.test(String(value || ''));
const level = x => x === 'success' ? 'success' : (['failure','cancelled','timed_out','action_required','neutral','skipped'].includes(x) ? 'failure' : 'pending');
const timestamp = x => Date.parse(x || '') || 0;

export function evaluateOffloadEvidence(checkRuns, statuses, sha) {
  const lanes = summarizeCircleCI(checkRuns, statuses, sha);
  const proofs = [];
  for (const status of statuses) {
    if (status.sha !== sha) continue; // Source identity is mandatory.
    if (!/^ci\/circleci:\s*(?:ink-wave-ci-offload\/)?offload-complete$/.test(status.context || '')) continue;
    proofs.push({ state:level(status.state), via:'CircleCI final DAG job', recorded:timestamp(status.updated_at || status.created_at) });
  }
  for (const check of checkRuns) {
    if (check.head_sha !== sha || !trustedApp(check.app?.slug)) continue;
    // GitHub Checks reports workflow success rather than individual jobs.
    // New CircleCI GitHub App project integrations append a pipeline ID.
    const name = String(check.name || '').replace(/^CircleCI\s*\/\s*/i,'');
    if (!/^ink-wave-ci-offload(?:$|[ /(-])/.test(name)) continue;
    proofs.push({ state:level(check.status === 'completed' ? check.conclusion : 'pending'),
      via:'CircleCI complete workflow check', recorded:timestamp(check.completed_at || check.started_at || check.created_at) });
  }
  proofs.sort((a,b)=>a.recorded-b.recorded);
  const proof=proofs.at(-1);
  const latestLaneFailure=Object.entries(lanes).filter(([,x])=>level(x)==='failure').map(([lane])=>lane);
  // An earlier all-green fan-in cannot certify a later rerun on the SAME SHA.
  // This also catches a new path-filter setup/pending job whose CircleCI final
  // DAG completion has not arrived. Treat any newer failure as failure, other
  // newer activity as pending. Do not silently reuse an older success.
  const laterActivity = [
    ...statuses.filter(x => x.sha === sha && /^ci\/circleci:/i.test(x.context || ''))
      .map(x => ({ recorded:timestamp(x.updated_at || x.created_at), state:level(x.state), source:x.context })),
    ...checkRuns.filter(x => x.head_sha === sha && trustedApp(x.app?.slug))
      .map(x => ({ recorded:timestamp(x.completed_at || x.started_at || x.created_at),
        state:level(x.status === 'completed' ? x.conclusion : 'pending'), source:x.name }))
  ].filter(x => proof && x.recorded > proof.recorded);
  if (proof?.state === 'success' && laterActivity.length) {
    if (laterActivity.some(x => x.state === 'failure'))
      return {state:'failure',via:'newer CircleCI result after previous full-suite pass',lanes};
    return {state:'pending',via:'new CircleCI run superseded previous full-suite pass',lanes};
  }
  // Earlier failed shard receipts can legitimately remain on the SHA after a
  // successful rerun, so a NEW authoritative green fan-in proves recovery.
  if (proof?.state === 'success') return {state:'success',via:proof.via,lanes};
  if (proof?.state === 'failure') return {state:'failure',via:proof.via,lanes};
  if (latestLaneFailure.length) return {state:'failure',via:'failed lanes: '+latestLaneFailure.join(','),lanes};
  return {state:'pending',via:proof?.via || 'awaiting CircleCI final DAG receipt',lanes};
}

async function githubList(base, token) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const url = base + (base.includes('?') ? '&' : '?') + 'per_page=100&page=' + page;
    const response = await fetch(url, { headers: {
      'Accept':'application/vnd.github+json',
      'Authorization':'Bearer ' + token,
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'INKWAVE-CircleCI-receipt-gate'
    } });
    if (!response.ok) throw Error('GitHub check lookup error ' + response.status + ': ' + (await response.text()).slice(0,300));
    const payload = await response.json();
    const chunk = Array.isArray(payload) ? payload : payload.check_runs;
    if (!Array.isArray(chunk)) throw Error('Invalid GitHub check response');
    result.push(...chunk);
    if (chunk.length < 100) return result;
  }
  throw Error('More than 1000 checks: refusing incomplete CircleCI evidence');
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY, sha = process.env.SOURCE_SHA;
  const token = process.env.GITHUB_TOKEN;
  assert.equal(repo, 'rhgrive3/actions');
  assert.match(sha || '', /^[0-9a-f]{40}$/);
  assert(token, 'Read-only GitHub token with checks/statuses permissions required');
  const base = 'https://api.github.com/repos/' + repo + '/commits/' + sha;
  const deadline = Date.now() + 75 * 60_000;
  let previous = '';
  while (Date.now() < deadline) {
    const [checks, statuses] = await Promise.all([
      githubList(base + '/check-runs', token),
      githubList(base + '/statuses', token)
    ]);
    const receipt = evaluateOffloadEvidence(checks, statuses, sha);
    const state = JSON.stringify(receipt);
    if (state !== previous) {
      console.log('INKWAVE CircleCI exact-source audit', sha, state);
      previous = state;
    }
    if (receipt.state === 'success') {
      console.log('CircleCI offloaded acceptance complete for exact SHA:', receipt.via);
      return;
    }
    if (receipt.state === 'failure') throw Error('CircleCI failed on exact source SHA: ' + state);
    await sleep(40_000);
  }
  throw Error('CircleCI exact-source evidence was not complete inside the 75-minute gate');
}

if (process.argv[1] && process.argv[1].endsWith('check-circleci-offload.mjs')) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

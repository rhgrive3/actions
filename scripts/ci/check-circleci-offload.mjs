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

export function statusLaneName(context) {
  const name = String(context || '');
  if (!/circleci/i.test(name)) return null;
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
    const lane = statusLaneName(check.name) || (
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
    const summary = summarizeCircleCI(checks, statuses, sha);
    const state = JSON.stringify(summary);
    if (state !== previous) {
      console.log('INKWAVE CircleCI exact-source audit', sha, state);
      previous = state;
    }
    if (Object.values(summary).every(s => s === 'success')) {
      console.log('CircleCI offloaded acceptance complete for exact SHA');
      return;
    }
    if (Object.values(summary).some(s => !['missing', 'pending', 'success'].includes(s)))
      throw Error('CircleCI failed/cancelled on exact source SHA: ' + state);
    await sleep(40_000);
  }
  throw Error('CircleCI exact-source evidence was not complete inside the 75-minute gate');
}

if (process.argv[1] && process.argv[1].endsWith('check-circleci-offload.mjs')) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

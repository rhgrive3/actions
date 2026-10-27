#!/usr/bin/env node
/**
 * Executes the immutable GitHub Actions browser-validation RUN STEPS without
 * copying, trimming, or reinterpreting the native INKWAVE acceptance commands.
 *
 * GitHub Actions remains the source of truth for the seven browser suites.
 * This deliberately fails closed on new/unknown conditional expressions.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const SUITES = ['active', 'catalog', 'ui', 'responsive', 'network', 'range', 'startup'];
const WORKFLOW = '.github/workflows/validate-inkwave-update.yml';
const EXTERNAL_STEPS = new Set([
  'Verify immutable site for this browser shard',
  'Prepare workspace storage and browser',
]);
const STEP_HEADER = /^      - (?:name|uses):/;
const RUN_STEP = /^        run: (.*)$/;
const INDENTED_RUN = /^          /;
const MATCH_SUITE = /^matrix\.suite == '([a-z]+)'(?: && env\.RUNTIME_PERFORMANCE == 'true')?$/;

function parseCommand(attrs, label) {
  const i = attrs.findIndex(x => RUN_STEP.test(x));
  if (i === -1) return null;
  const match = attrs[i].match(RUN_STEP);
  if (match[1] !== '|') {
    if (!match[1] || match[1].includes('!unsafe')) throw Error('Unsupported run scalar in ' + label);
    return match[1];
  }
  const result = [];
  for (let j = i + 1; j < attrs.length; j++) {
    const x = attrs[j];
    if (x.trim() && !INDENTED_RUN.test(x)) throw Error('Unrecognized multiline run indentation in ' + label);
    result.push(x.trim() ? x.slice(10) : '');
  }
  if (!result.some(x => x.trim())) throw Error('Empty run block: ' + label);
  return result.join('\n');
}

export function parseBrowserLane(workflowText, suite, runtimePerformance = false) {
  if (!SUITES.includes(suite)) throw Error('Unknown browser suite: ' + suite);
  const lines = workflowText.split(/\r?\n/);
  const start = lines.indexOf('  browser:');
  if (start === -1) throw Error('Native browser job missing');
  let end = lines.findIndex((x, i) => i > start && /^  [a-zA-Z][a-zA-Z0-9_-]*:$/.test(x));
  if (end === -1) end = lines.length;
  const block = lines.slice(start, end);
  const sourceHash = createHash('sha256').update(block.join('\n')).digest('hex');
  const commands = [];
  const coverage = {};
  for (let i = 0; i < block.length; i++) {
    if (!STEP_HEADER.test(block[i])) continue;
    const title = block[i].replace(/^      - (?:name|uses): /, '');
    let j = i + 1;
    while (j < block.length && !STEP_HEADER.test(block[j])) j++;
    const attrs = block.slice(i + 1, j);
    i = j - 1;
    const command = parseCommand(attrs, title);
    if (command === null) continue; // GitHub-only actions: checkout/cache/upload artifacts.
    if (title === 'Package bounded browser failure evidence') {
      if (command !== 'node scripts/ci/package-inkwave-evidence.mjs --browser-failure "$CI_STORAGE/evidence" "$CI_STORAGE/failure-evidence" .built-site/_site/inkwave-build.json'
          || !attrs.includes('        if: always() && (failure() || cancelled())'))
        throw Error('Unreviewed evidence-only step: ' + title);
      continue; // CircleCI packages failures in its always-run artifact step.
    }
    if (EXTERNAL_STEPS.has(title)) continue; // CircleCI handles these in its own immutable setup.
    const whenLine = attrs.find(x => /^        if: /.test(x));
    const condition = whenLine ? whenLine.slice(12).trim() : null;
    if (condition === null && title !== 'Bind passing browser evidence to the tested commit')
      throw Error('New unconditional native step requires CircleCI audit: ' + title);
    if (condition !== null && !MATCH_SUITE.test(condition))
      throw Error('Unrecognized native browser conditional: ' + title + ': ' + condition);
    if (condition !== null) {
      const m = condition.match(MATCH_SUITE);
      if (!SUITES.includes(m[1])) throw Error('Unknown source suite ' + m[1] + ': ' + title);
      coverage[m[1]] = (coverage[m[1]] || 0) + 1;
      if (m[1] !== suite) continue;
      if (condition.includes('RUNTIME_PERFORMANCE') && !runtimePerformance) continue;
    }
    commands.push({ name: title, command });
  }
  if (!commands.length || !commands.some(x => x.name === 'Bind passing browser evidence to the tested commit'))
    throw Error('Browser lane lacks full immutable acceptance receipt');
  for (const s of SUITES) if (!coverage[s]) throw Error('Missing required native browser suite: ' + s);
  if (runtimePerformance) throw Error('Runtime-performance baseline lane stays on GitHub until a dedicated parity review');
  return { sourceHash, commands, coverage };
}

function verifySite(sha, siteRoot) {
  assert.match(sha, /^[0-9a-f]{40}$/, 'Expected immutable full Git SHA');
  assert.equal(fs.readFileSync('.built-site/_site-source-sha.txt', 'utf8').trim(), sha);
  const file = path.join(siteRoot, 'inkwave-build.json');
  const build = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(build.contentHash, /^[0-9a-f]+$/i);
  return build.contentHash;
}

function run() {
  const suite = process.argv[2];
  if (!SUITES.includes(suite)) throw Error('Usage: node scripts/ci/run-circleci-browser-lane.mjs <active|catalog|ui|responsive|network|range|startup>');
  const sha = process.env.CIRCLE_SHA1;
  const exactHead = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (exactHead.status !== 0) throw Error('Unable to verify checkout HEAD');
  assert.equal(exactHead.stdout.trim(), sha, 'Refuse mismatched CircleCI source checkout');
  const expectedHash = verifySite(sha, '.built-site/_site');
  const runtimePerformance = process.env.RUNTIME_PERFORMANCE === 'true';
  const { sourceHash, commands, coverage } = parseBrowserLane(fs.readFileSync(WORKFLOW, 'utf8'), suite, runtimePerformance);
  const root = process.env.CI_STORAGE || path.join(process.cwd(), '.ci-scratch', 'circleci-browser', suite);
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(root, 'cache'), { recursive: true });
  const env = {
    ...process.env,
    SOURCE_SHA: sha,
    BROWSER_SUITE: suite,
    CI_STORAGE: root,
    GITHUB_WORKSPACE: process.cwd(),
    GITHUB_RUN_ID: process.env.CIRCLE_WORKFLOW_ID || 'circleci',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: process.env.CIRCLE_PULL_REQUEST ? 'pull_request' : 'push',
    REMATCH_CYCLES: process.env.REMATCH_CYCLES || '3',
    RUNTIME_PERFORMANCE: 'false',
  };
  const record = {
    sourceSha: sha, contentHash: expectedHash, suite, nativeWorkflowSourceHash: sourceHash,
    selectedSteps: commands.map(x => x.name), nativeSuiteStepCounts: coverage,
    platform: os.platform(), node: process.version, status: 'running'
  };
  const resultFile = path.join(root, 'circleci-lane-receipt.json');
  const recordWrite = () => fs.writeFileSync(resultFile, JSON.stringify(record, null, 2) + '\n');
  recordWrite();
  for (const step of commands) {
    console.log('[INKWAVE/CircleCI] Native browser acceptance: ' + step.name);
    const x = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.command], { cwd: process.cwd(), env, stdio: 'inherit' });
    if (x.status !== 0) {
      record.status = 'failed';
      record.failedStep = step.name;
      record.exitCode = x.status;
      record.signal = x.signal || null;
      recordWrite();
      throw Error('Native browser lane failed: ' + step.name + ' (status=' + x.status + ')');
    }
  }
  const native = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'ci-result.json'), 'utf8'));
  assert.equal(native.status, 'passed');
  assert.equal(native.sourceSha, sha);
  assert.equal(native.suite, suite);
  assert.equal(native.contentHash, expectedHash);
  assert(native.checks && native.checks.length, 'Empty native acceptance checklist');
  record.status = 'passed';
  record.nativeChecks = native.checks;
  recordWrite();
  console.log(JSON.stringify(record, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { run(); } catch (e) { console.error(e); process.exitCode = 1; }
}

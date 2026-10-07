import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const TEST = /^(?:patches\/(?:splatoon3|touch-layout|reliability|local-quality|movement-physics|network-replication|loading-cache|practice-range)\/tests\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.test\.mjs|scripts\/tests\/inkwave-[a-zA-Z0-9_.-]+\.test\.mjs)$/;

export function parseFocusedInputs(tests, baselines = '[]') {
  const files = JSON.parse(tests), refs = JSON.parse(baselines);
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= 36, '1–36 focused test files required');
  assert.ok(files.every(file => typeof file === 'string' && TEST.test(file)), 'Only INKWAVE test paths are accepted');
  assert.equal(new Set(files).size, files.length, 'Duplicate test paths are rejected');
  assert.ok(Array.isArray(refs) && refs.length <= 8 && refs.every(ref => typeof ref === 'string' && SHA.test(ref)), 'Baselines must be full immutable SHAs');
  return { files, refs: [...new Set(refs)] };
}

export function focusedSummary(log) {
  const result = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
    const match = log.match(new RegExp(`(?:^|\\n)ℹ ${field} (\\d+)(?:\\r?\\n|$)`));
    if (match) result[field] = Number(match[1]);
  }
  return { ...result, accepted: result.tests > 0 && result.pass > 0 && result.fail === 0 && result.cancelled === 0 };
}

function run() {
  const { files, refs } = parseFocusedInputs(process.env.FOCUSED_TESTS, process.env.FOCUSED_BASELINES || '[]');
  const source = process.env.SOURCE_SHA;
  assert.ok(SHA.test(source || ''), 'SOURCE_SHA must be immutable');
  const root = fs.realpathSync(process.cwd());
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  assert.equal(git('rev-parse', 'HEAD'), source);
  assert.equal(git('status', '--porcelain'), '', 'Source checkout must be clean');
  for (const file of files) {
    const resolved = fs.realpathSync(path.join(root, file));
    assert.ok(resolved.startsWith(root + path.sep) && fs.statSync(resolved).isFile(), 'Test must resolve inside the source checkout');
  }
  for (const ref of refs) {
    if (spawnSync('git', ['-C', root, 'cat-file', '-e', `${ref}^{commit}`]).status !== 0)
      git('fetch', '--quiet', '--no-write-fetch-head', '--depth=1', 'origin', ref);
    git('cat-file', '-e', `${ref}^{commit}`);
  }
  const requested = process.env.FOCUSED_EVIDENCE_DIR;
  assert.ok(requested && path.isAbsolute(requested));
  const evidence = fs.realpathSync(requested);
  assert.equal(evidence, path.resolve(requested), 'Evidence storage must not redirect');
  assert.ok(evidence.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'), 'Evidence requires persistent workspace storage');
  assert.ok(!evidence.startsWith(root + path.sep), 'Evidence must stay outside the product checkout');
  const command = ['--experimental-vm-modules', '--test', '--test-concurrency=2', '--test-reporter=spec', ...files];
  const pending = path.join(evidence, 'focused-tests.log.writing');
  const log = fs.openSync(pending, 'wx');
  const started = new Date().toISOString();
  let result;
  try { result = spawnSync(process.execPath, command, { cwd: root, stdio: ['ignore', log, log] }); }
  finally { fs.closeSync(log); }
  fs.renameSync(pending, path.join(evidence, 'focused-tests.log'));
  assert.equal(git('rev-parse', 'HEAD'), source);
  assert.equal(git('status', '--porcelain'), '', 'Tests must preserve clean source');
  const text = fs.readFileSync(path.join(evidence, 'focused-tests.log'), 'utf8');
  const summary = focusedSummary(text);
  const accepted = result.status === 0 && summary.accepted;
  const receipt = { source, sourceTree: git('rev-parse', 'HEAD^{tree}'), baselines: refs, tests: files,
    command: [process.execPath, ...command], started, finished: new Date().toISOString(),
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null,
    logPath: path.join(evidence, 'focused-tests.log'), summary,
    cleanBeforeAfter: true, accepted };
  const receiptPending = path.join(evidence, 'receipt.json.writing');
  fs.writeFileSync(receiptPending, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  fs.renameSync(receiptPending, path.join(evidence, 'receipt.json'));
  const lines = text.trim().split('\n');
  console.log(`Focused INKWAVE tests: ${files.length} files, source ${source}, exit ${result.status}`);
  console.log(lines.slice(result.status === 0 ? -8 : -50).join('\n'));
  process.exitCode = accepted ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();

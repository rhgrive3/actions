import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.env.TARGET_DIR || 'target');
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || 'evidence');
const shardIndex = Number(process.env.SHARD_INDEX);
const shardCount = Number(process.env.SHARD_COUNT || '16');
const caseTimeoutMs = Number(process.env.CASE_TIMEOUT_MS || '120000');
const softDeadlineMs = Number(process.env.SHARD_SOFT_DEADLINE_MS || '660000');
const targetSha = String(process.env.TARGET_SHA || '');

if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) throw new Error('invalid-shard-index');
if (!Number.isSafeInteger(caseTimeoutMs) || caseTimeoutMs < 1000 || caseTimeoutMs > 900000) throw new Error('invalid-case-timeout');
if (!Number.isSafeInteger(softDeadlineMs) || softDeadlineMs < caseTimeoutMs) throw new Error('invalid-soft-deadline');

const manifestFile = path.join(repo, 'benchmarks/public/codefuse-arm64/manifest.json');
const suiteRoot = path.dirname(manifestFile);
const caseRunner = path.join(repo, 'tools/validation/public-benchmark/run-case.mjs');
const { loadManifest, verifyInputs } = await import(pathToFileURL(path.join(repo, 'tools/validation/public-benchmark/manifest.mjs')));
const { classifySubjectResult, SUBJECT_RESULT_SCHEMA, SUBJECT_RESULT_STATES } = await import(pathToFileURL(path.join(repo, 'tools/validation/public-benchmark/outcome.mjs')));

const actualSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd:repo, encoding:'utf8', timeout:10000 }).stdout.trim();
if (actualSha !== targetSha) throw new Error(`head-mismatch:${actualSha}`);

const manifestBytes = fs.readFileSync(manifestFile);
const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
const manifest = loadManifest(manifestFile);
const inputs = verifyInputs(manifest, suiteRoot);
if (inputs.length !== 160 || manifest.cases.length !== 160 || manifest.denominatorFrozen !== true) {
  throw new Error(`manifest-integrity:${inputs.length}/${manifest.cases.length}/${manifest.denominatorFrozen}`);
}

const start = Math.floor(inputs.length * shardIndex / shardCount);
const end = Math.floor(inputs.length * (shardIndex + 1) / shardCount);
const selected = inputs.slice(start, end);
const caseDir = path.join(evidenceDir, 'cases');
fs.mkdirSync(caseDir, { recursive:true });

function readSubject(file) {
  if (!fs.existsSync(file)) return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-missing', functions:[] };
  try {
    const row = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!row || row.schema !== SUBJECT_RESULT_SCHEMA || !SUBJECT_RESULT_STATES.has(row.state) || !Array.isArray(row.functions)) {
      return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-invalid', functions:[] };
    }
    return classifySubjectResult(row);
  } catch {
    return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-invalid-json', functions:[] };
  }
}

function pctl(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1))];
}

const runStarted = Date.now();
const startedAt = new Date(runStarted).toISOString();
const results = [];
const states = {};
const functionStates = {};
let launched = 0;

for (let i = 0; i < selected.length; i++) {
  const entry = selected[i];
  const elapsedBefore = Date.now() - runStarted;
  if (elapsedBefore >= softDeadlineMs) {
    results.push({ id:entry.id, state:'NOT_RUN', reason:'shard-soft-deadline', elapsedMs:0, functionCount:0, functionStates:{} });
    states.NOT_RUN = (states.NOT_RUN || 0) + 1;
    continue;
  }
  if (entry.state !== 'READY') {
    results.push({ id:entry.id, state:entry.state, reason:null, elapsedMs:0, functionCount:0, functionStates:{} });
    states[entry.state] = (states[entry.state] || 0) + 1;
    continue;
  }

  launched++;
  const out = path.join(caseDir, `${Buffer.from(entry.id).toString('hex')}.json`);
  fs.rmSync(out, { force:true });
  const t0 = Date.now();
  const child = spawnSync(process.execPath, [caseRunner, entry.path, out, String(caseTimeoutMs)], {
    cwd:repo,
    encoding:'utf8',
    timeout:caseTimeoutMs + 10000,
    env:{ ...process.env, HEX_PUBLIC_BENCH_OFFLINE:'1' },
    maxBuffer:8 * 1024 * 1024,
  });
  const elapsedMs = Date.now() - t0;
  let subject = readSubject(out);
  if (child.error?.code === 'ETIMEDOUT') subject = { schema:SUBJECT_RESULT_SCHEMA, state:'TIMEOUT', reason:'outer-runner-timeout', functions:[] };
  else if (child.error) subject = { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:`outer-runner-error:${child.error.code || child.error.name || 'unknown'}`, functions:[] };
  else if (child.signal) subject = { schema:SUBJECT_RESULT_SCHEMA, state:'CRASH', reason:`case-runner-signal:${child.signal}`, functions:[] };

  const fstates = subject.functionStateCounts || {};
  states[subject.state] = (states[subject.state] || 0) + 1;
  for (const [key, value] of Object.entries(fstates)) functionStates[key] = (functionStates[key] || 0) + Number(value || 0);
  const artifactDigest = fs.existsSync(out) ? crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex') : null;
  results.push({
    id:entry.id,
    state:subject.state,
    reason:subject.reason ?? null,
    elapsedMs,
    functionCount:subject.functions?.length ?? 0,
    functionStates:fstates,
    runnerExitCode:child.status ?? null,
    runnerSignal:child.signal ?? null,
    artifactDigest,
  });
  console.log(`[${shardIndex}] ${entry.id}: ${subject.state} functions=${subject.functions?.length ?? 0} elapsed=${elapsedMs}ms`);
}

const finished = Date.now();
const caseTimes = results.filter(r=>r.elapsedMs > 0).map(r=>r.elapsedMs);
const functionCount = results.reduce((n,r)=>n + Number(r.functionCount || 0), 0);
const payload = {
  schema:'hex-pr9263-fresh-benchmark-shard/v1',
  targetSha,
  actualSha,
  manifestSha256,
  manifestCases:manifest.cases.length,
  denominatorFrozen:manifest.denominatorFrozen === true,
  shardIndex,
  shardCount,
  start,
  end,
  selected: selected.length,
  launched,
  caseTimeoutMs,
  softDeadlineMs,
  startedAt,
  finishedAt:new Date(finished).toISOString(),
  wallMs:finished - runStarted,
  states,
  functionStates,
  functionCount,
  caseTiming:{
    p50Ms:pctl(caseTimes, 50),
    p90Ms:pctl(caseTimes, 90),
    maxMs:caseTimes.length ? Math.max(...caseTimes) : null,
    sumMs:caseTimes.reduce((a,b)=>a+b,0),
  },
  results,
};
fs.mkdirSync(evidenceDir, { recursive:true });
fs.writeFileSync(path.join(evidenceDir, `shard-${String(shardIndex).padStart(2,'0')}.json`), JSON.stringify(payload, null, 2) + '\n');

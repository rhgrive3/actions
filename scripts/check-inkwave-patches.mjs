#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { checkCompatibility, adaptSource, PATCH_ROOT } from '../patches/splatoon3/adapter.mjs';
import { numericStatus } from './sync-inkwave-numeric-status.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability, RELIABILITY_ROOT } from '../patches/reliability/adapter.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceArg = process.argv.indexOf('--source');
const SRC = path.resolve(sourceArg >= 0 ? process.argv[sourceArg + 1] : path.join(ROOT, 'inkwave-public'));
try {
  checkCompatibility(SRC);
  const profile = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'profile.json'), 'utf8'));
  if (profile.schema !== 1 || !profile.referenceVersion || !profile.calibration) throw new Error('Gameplay profile is missing provenance/calibration status');
  const numbers = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'reference/curated-numbers.json'), 'utf8'));
  if (profile.referenceVersion !== numbers.referenceVersion) throw new Error('Profile and numeric reference versions disagree');
  const status = JSON.parse(fs.readFileSync(path.join(PATCH_ROOT, 'reference/numeric-status.json'), 'utf8'));
  if (JSON.stringify(status) !== JSON.stringify(numericStatus(profile))) throw new Error('Numeric status is stale. Review changed values and run scripts/sync-inkwave-numeric-status.mjs --write');
  for (const [key, value] of Object.entries(profile.bindings || {})) {
    const parameter = numbers.parameters[value.parameter];
    if (!parameter || parameter.status === 'unknown') throw new Error(`Unsourced numeric binding ${key}`);
    const raw = value.index == null ? parameter.value : parameter.value[value.index];
    const actual = key.split('.').reduce((obj, name) => obj?.[name], profile);
    if (raw !== value.rawValue || !Number.isFinite(actual) || Math.abs(actual - raw * value.factor) > 1e-9) throw new Error(`Numeric conversion drift: ${key}`);
  }
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(directory, d.name)) : [path.join(directory, d.name)]);
  if (vm.SourceTextModule) {
    for (const file of [...walk(path.join(SRC, 'src')), ...walk(PATCH_ROOT)]) {
      if (!/\.m?js$/.test(file)) continue;
      const rel = path.relative(SRC, file);
      new vm.SourceTextModule(adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(file, 'utf8')))), { identifier: file });
    }
  }
  const files = [...walk(path.join(PATCH_ROOT, 'tests')), ...walk(path.join(RELIABILITY_ROOT, 'tests'))].filter(f => f.endsWith('.test.mjs')).sort();
  if (!files.length) throw new Error('No patch tests discovered');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', ...files], { cwd: ROOT, env: { ...process.env, INKWAVE_UPSTREAM_SOURCE: SRC }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const logDir = path.resolve(process.env.INKWAVE_TEST_LOG_DIR || path.join(ROOT, '.ci-scratch/inkwave-patches'));
  const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
  if (['/tmp', '/var/tmp', '/dev/shm'].some(p => physical(logDir) === p || physical(logDir).startsWith(p + '/'))) throw Error('Persistent test log storage required');
  fs.mkdirSync(logDir, { recursive: true });
  const log = path.join(logDir, 'patch-tests.log');
  fs.writeFileSync(log + '.writing', (result.stdout || '') + (result.stderr || ''));
  fs.renameSync(log + '.writing', log);
  if (result.status !== 0) {
    const lines = (result.stdout || '').split('\n'), failures = [];
    for (let i = 0; i < lines.length; i++) if (/^\s*not ok\b/.test(lines[i])) {
      let end = i + 1;
      while (end < lines.length && !/^\s*(?:# Subtest:|(?:not )?ok \d|1\.\.)/.test(lines[end])) end++;
      failures.push(lines.slice(i, end).join('\n').slice(0, 2400));
    }
    process.stderr.write(failures.length ? failures.join('\n').slice(0, 26000) + '\n' : (result.stdout + result.stderr).slice(-18000));
    process.stderr.write(lines.filter(line => /^# (?:tests|pass|fail|skipped|duration_ms) /.test(line)).join('\n') + '\n');
    throw new Error(`Patch tests failed (exit ${result.status}); full diagnostic log: ${log}`);
  }
  const summary = result.stdout.split('\n').filter(line => /tests |pass |fail |skipped |duration_ms /.test(line));
  console.log(`INKWAVE patches OK: ${files.length} test files; upstream compatible; reference ${profile.referenceVersion}`);
  console.log(summary.join('\n'));
} catch (error) { console.error(error.message); process.exitCode = 1; }

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { checkCompatibility, adaptSource, PATCH_ROOT } from '../patches/splatoon3/adapter.mjs';
import { numericStatus } from './sync-inkwave-numeric-status.mjs';
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
      new vm.SourceTextModule(adaptSource(rel, fs.readFileSync(file, 'utf8')), { identifier: file });
    }
  }
  const files = walk(path.join(PATCH_ROOT, 'tests')).filter(f => f.endsWith('.test.mjs')).sort();
  if (!files.length) throw new Error('No patch tests discovered');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', ...files], { cwd: ROOT, env: { ...process.env, INKWAVE_UPSTREAM_SOURCE: SRC }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write((result.stdout + result.stderr).slice(-18000));
    throw new Error(`Patch tests failed (exit ${result.status})`);
  }
  const summary = result.stdout.split('\n').filter(line => /tests |pass |fail |skipped |duration_ms /.test(line));
  console.log(`INKWAVE patches OK: ${files.length} test files; upstream compatible; reference ${profile.referenceVersion}`);
  console.log(summary.join('\n'));
} catch (error) { console.error(error.message); process.exitCode = 1; }

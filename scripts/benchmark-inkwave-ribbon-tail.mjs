#!/usr/bin/env node
// Complete production RibbonPool CPU microbenchmark, no renderer or gameplay.
// Run serially: competing tests invalidate interpretation of timing deltas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { makeRibbonPool, ribbonBaselineSource, ribbonCandidateSource, ribbonAttributes, ribbonBytes } from '../patches/splatoon3/tests/ribbon-tail-fixture.mjs';

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const repeats = Number(opt('--repeats', '11')), frames = Number(opt('--frames', '3000'));
assert.ok(Number.isInteger(repeats) && repeats >= 3 && repeats <= 31);
assert.ok(Number.isInteger(frames) && frames > 0 && frames <= 100000);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = values => { const s = [...values].sort((a, b) => a - b); return { n: s.length, median: s[Math.floor(s.length / 2)], mean: s.reduce((a, b) => a + b, 0) / s.length, min: s[0], max: s.at(-1) }; };
const result = { scope: 'Actual production RibbonPool CPU, fixed live points and moving update time within a 100000-second lease; complete Float32 equality. No GPU, device FPS or retail acceptance.',
  environment: { node: process.version, cpu: os.cpus()[0].model, frames, repeats },
  sources: { baseCommit: '6dacd47095352cfd600f9c83012c71a2f298a460', beforeSHA256: digest(ribbonBaselineSource), afterSHA256: digest(ribbonCandidateSource) }, scenarios: [] };
const cam = { x: 4, y: 8, z: 12 };
function fixture(body, trails, points) {
  const p = makeRibbonPool(body, 40, 48);
  for (let t = 0; t < trails; t++) {
    const r = p.start({ life: 100000, spacing: 0, flat: t % 2 === 0, style: t % 3 });
    for (let i = 0; i < points; i++) p.push(r, i / 4, 1 + Math.sin(i) / 2, t / 3, 0);
  }
  for (let i = 0; i < 200; i++) p.update(i / 120, cam);
  return p;
}
for (const trails of [4, 40]) for (const points of [2, 12, 48]) {
  const p = { before: fixture(ribbonBaselineSource, trails, points), after: fixture(ribbonCandidateSource, trails, points) }, times = { before: [], after: [] };
  for (let repeat = 0; repeat < repeats; repeat++) for (const name of (repeat % 2 ? ['after', 'before'] : ['before', 'after'])) {
    const start = performance.now();
    for (let frame = 0; frame < frames; frame++) p[name].update(2 + (repeat * frames + frame) / 120, cam);
    times[name].push(performance.now() - start);
  }
  for (const key of ribbonAttributes) assert.deepEqual(ribbonBytes(p.before, key), ribbonBytes(p.after, key), 'final ' + key);
  result.scenarios.push({ trails, livePointsPerTrail: points, capacityPointsPerTrail: 48, timingMs: times, stats: { before: stats(times.before), after: stats(times.after) },
    outputSHA256: Object.fromEntries(ribbonAttributes.map(key => [key, digest(ribbonBytes(p.after, key))])) });
}
if (opt('--output')) { const dest = path.resolve(opt('--output')); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(result, null, 2) + '\n'); }
console.log(JSON.stringify(result, null, 2));

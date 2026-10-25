#!/usr/bin/env node
// Local numerical-owner benchmark. Does not measure display FPS or GPU time.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import assert from 'node:assert/strict';
import { before, current, currentSHA256, createFitRunner, createSpeakerRunner, valuesWithoutCounts } from '../patches/splatoon3/tests/special-presentation-hotpath-fixture.mjs';

export function runPresentationBenchmark({ repeats = 9, iterations = 10_000 } = {}) {
  const out = { baseCommit: before.baseCommit, sourceSHA256: { before: before.sourceSHA256, after: currentSHA256 }, environment: { node: process.version, cpu: os.cpus()[0].model }, repeats, iterations, scope: 'Production extracted fit/pose functions, real THREE transforms, native callback sinks; CPU owner only, no device FPS claim', workloads: {} };
  for (const workload of ['fit', 'speakers']) {
    const runners = Object.fromEntries(['before', 'after'].map(name => [name, workload === 'fit' ? createFitRunner(name === 'before' ? before.fit : current.fit, { instrument: false }) : createSpeakerRunner(name === 'before' ? before.pose : current.pose, { instrument: false })]));
    const counters = Object.fromEntries(['before', 'after'].map(name => [name, workload === 'fit' ? createFitRunner(name === 'before' ? before.fit : current.fit) : createSpeakerRunner(name === 'before' ? before.pose : current.pose)]));
    const position = [.2, .93, .45], quaternion = [.1, .2, .1, Math.sqrt(.94)];
    const step = (r, capture = false) => workload === 'fit' ? r.step(position, quaternion, capture) : r.step(.2, 1 / 60, .3, capture);
    const control = {}, timing = { before: [], after: [] };
    for (const name of ['before', 'after']) { for (let i = 0; i < 1000; i++) step(runners[name]); control[name] = step(counters[name], true); }
    assert.deepEqual(valuesWithoutCounts(control.before), valuesWithoutCounts(control.after));
    for (let repetition = 0; repetition < repeats; repetition++) for (const name of repetition % 2 ? ['after', 'before'] : ['before', 'after']) {
      const start = performance.now(); for (let i = 0; i < iterations; i++) step(runners[name]); timing[name].push(performance.now() - start);
    }
    out.workloads[workload] = { timing, counters: Object.fromEntries(Object.entries(control).map(([name, row]) => [name, row.counts || { rotations: row.rotations, matrixRefreshes: row.refreshes }])) };
  }
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(runPresentationBenchmark(), null, 2));

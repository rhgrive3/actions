#!/usr/bin/env node
// Native-only repeated eight-actor CPU workload. Does not measure presented FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {verifyRuntimeBuild, hash, persistentDirectory, persistentBrowserTemp, sampleStats} from './lib/inkwave-runtime-evidence.mjs';
import {installCpuGameplayDigest} from './lib/inkwave-cpu-gameplay-digest.mjs';
import {installCpuCounters} from './lib/inkwave-cpu-counters.mjs';
import {launchSandboxBrowser} from './lib/inkwave-sandbox-browser.mjs';
import {prepareCpuBattle, runCpuBattle} from './lib/inkwave-composed-cpu-replay.mjs';
import {assertFiniteNumbers, assertNativeInitial, verifyNativePoolSourceBinding, verifyServedBody} from './lib/inkwave-native-pool-admission.mjs';
import {configureHarnessAffinity, configureBrowserAffinity, inspectBrowserAffinity, interleavedWarmupOrder} from './lib/inkwave-cpu-affinity-pool.mjs';

export const abbaOrder = rounds => Array.from({length: rounds}, (_, round) =>
  ['a', 'b', 'b', 'a'].map((side, slot) => ({round, slot, side}))).flat();

export function assertReplayParity(base, row) {
  assertNativeInitial(row.initial);
  assertFiniteNumbers(row, 'window');
  assert.equal(row.contextLost, false, 'retains WebGL context');
  assert.deepEqual(row.errors, [], 'no page errors');
  assert.equal(row.initial.actors, 8, 'full eight-actor battle');
  assert.equal(row.initial.bots, 7, 'seven actual bots');
  assert.equal(row.initial.sourceCharacters, 8, 'all source characters ready');
  assert.equal(row.minActors, 8, 'actors retained throughout window');
  assert.equal(row.state, 'playing', 'window remains in active battle');
  assert.ok(Number.isInteger(row.frames) && row.frames >= 30 && row.frames <= 6000, 'valid frame count');
  assert.ok([30, 60, 120].includes(row.hz), 'valid fixed cadence');
  assert.equal(row.ticks, Math.round(row.frames * 60 / row.hz), 'fixed simulation cadence');
  assert.equal(row.times.length, row.frames, 'every requested frame is measured');
  assert.ok(row.times.every(value => Number.isFinite(value) && value >= 0), 'valid per-frame times');
  assert.equal(row.digests.length, row.frames, 'every requested gameplay sample is retained');
  assert.ok(Number.isFinite(row.threadCpuMs.ThreadTime) && row.threadCpuMs.ThreadTime > 0, 'renderer thread timing available');
  assert.equal(row.sceneRenderCalls, row.renderRequested ? row.frames : 0, 'requested number of actual scene submissions');
  if (row.renderRequested) assert.ok(row.drawnActorFrames.reduce((sum,value)=>sum+value,0)>0, 'render parity observes actual drawn actor bones');
  if (row.requireOobBudget) assert.ok(row.budgetWork.some(actor=>actor._oobBudgetTicks>0), 'requested offscreen-budget path actually exercised');
  if (row.postWindow) {
    assert.equal(row.postWindow.ticks, row.postWindow.afterTicks, 'GPU drain did not advance simulation');
    assert.equal(row.postWindow.hidden, false, 'page remained visible through measured window');
    assert.equal(row.postWindow.afterTicks, row.initial.clockTicks + row.ticks, 'only requested ticks advanced');
  }
  assert.equal(row.affinity.before.status, 'verified', 'pre-window affinity verified');
  assert.equal(row.affinity.after.status, 'verified', 'post-window affinity verified');
  if (!base) return;
  for (const key of ['initial', 'frames', 'hz', 'ticks', 'minActors', 'minLiving', 'digest', 'digests', 'counts', 'state', 'draw', 'resources', 'scene', 'sceneRenderCalls', 'drawnActorFrames', 'poseDigests', 'poseDigest', 'budgetWork'])
    assert.deepEqual(row[key], base[key], 'exact recorded parity: ' + key);
  assert.deepEqual(row.bvh, base.bvh, 'same BVH work');
}

// A quartet is the replication unit. Its two A and two B observations have
// equal mean positions in time, cancelling linear drift in additive timings.
// Preserve all quartets; frame samples from one replay are not independent runs.
export function summarizeQuartets(rows) {
  assert.equal(rows.length % 4, 0, 'complete ABBA quartets');
  const quartets = [];
  for (let index = 0; index < rows.length; index += 4) {
    const group = rows.slice(index, index + 4);
    assert.deepEqual(group.map(row => row.side), ['a', 'b', 'b', 'a']);
    assert.deepEqual(group.map(row => row.slot), [0, 1, 2, 3]);
    const ratios = {};
    for (const metric of ['frameMeanMs', 'rendererThreadMsPerTick']) {
      const a = (group[0][metric] + group[3][metric]) / 2;
      const b = (group[1][metric] + group[2][metric]) / 2;
      assert.ok(a > 0 && b > 0 && Number.isFinite(a + b), 'finite timing metrics');
      ratios[metric] = {a, b, ratio: b / a, changePercent: 100 * (b / a - 1)};
    }
    quartets.push({round: group[0].round, replayOrdinals: group.map(row=>row.replayOrdinal??null), ratios});
  }
  return {quartets, frameRatio: ratioStats(quartets.map(row => row.ratios.frameMeanMs.ratio)),
    threadRatio: ratioStats(quartets.map(row => row.ratios.rendererThreadMsPerTick.ratio))};
}

function ratioStats(values) {
  const summary = sampleStats(values);
  if (values.length < 2) return {...summary, logRatioTInterval95: null};
  const logs = values.map(Math.log), mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1));
  const t = [null, 12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.3060, 2.2622, 2.2281, 2.2010, 2.1788, 2.1604, 2.1448, 2.1314][logs.length - 1];
  const margin = t * sd / Math.sqrt(logs.length);
  return {...summary, geometricMean: Math.exp(mean), logRatioTInterval95: [Math.exp(mean - margin), Math.exp(mean + margin)],
    inference: 'Descriptive Student-t interval over independent ABBA quartets assuming approximately normal log-ratios; not over individual frame samples. Persistent host interference or drift can invalidate this assumption.'};
}

async function main() {
  const get = (name, fallback) => {const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1];};
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = persistentDirectory(get('--evidence-dir', '.b/abba'));
  const config = {stage: get('--stage', 'tidewater'), quality: get('--quality', 'high'), weapon: get('--weapon', 'shooter'),
    frames: Number(get('--frames', '900')), hz: Number(get('--hz', '60')), rounds: Number(get('--rounds', '4')),
    aaRounds: Number(get('--aa-rounds', '2')), warmupRuns: Number(get('--warmup-runs', '2')),
    width: Number(get('--width', '960')), height: Number(get('--height', '640')),
    warmupFrames: Number(get('--warmup-frames', '900')), render: process.argv.includes('--render'),
    preflightOnly: process.argv.includes('--preflight-only'),
    affinityCheckOnly: process.argv.includes('--affinity-check-only'),
    requireOobBudget: process.argv.includes('--require-oob-budget'),
    seeds: {boot: 987654321, matchSetup: 11223, fixtureAndFirstStep: 24680, audio: 456, stepMultiplier: 2654435761},
    allowBvhWorkReduction: false};
  assert.ok(!process.argv.includes('--allow-bvh-work-reduction'), 'native comparison requires exact BVH work');
  for (const key of ['frames', 'warmupFrames']) assert.ok(Number.isInteger(config[key]) && config[key] >= 30 && config[key] <= 6000, 'valid ' + key);
  for (const key of ['rounds', 'aaRounds', 'warmupRuns']) assert.ok(Number.isInteger(config[key]) && config[key] >= 1 && config[key] <= 16, 'valid ' + key);
  assert.ok([30, 60, 120].includes(config.hz));
  for (const key of ['width', 'height']) assert.ok(Number.isInteger(config[key]) && config[key] >= 240 && config[key] <= 1920, 'valid ' + key);
  config.gpuCpus = get('--gpu-cpus', '');
  config.workerCpus = get('--worker-cpus', '');
  config.warmupSchedule = interleavedWarmupOrder(config.warmupRuns);
  assert.ok(config.gpuCpus && config.workerCpus, 'Explicit --gpu-cpus and --worker-cpus are required');
  const affinitySetup = configureHarnessAffinity(config.gpuCpus, config.workerCpus);
  const builds = {};
  for (const side of ['a', 'b']) {
    const site = fs.realpathSync(get('--site-' + side, side === 'b' ? builds.a.site : '_site'));
    const sourceSha = get('--sha-' + side, side === 'b' ? builds.a.sourceSha : '');
    const manifest = verifyRuntimeBuild(site, root, sourceSha);
    const binding = verifyNativePoolSourceBinding(site, root, sourceSha, manifest, config.stage);
    builds[side] = {site, sourceSha, manifest, artifactReceipts: binding.receipts, sourceBinding: binding.evidence, served: new Set(), servedReceipts: new Map()};

  }
  const mime = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2'};
  const servers = [];
  const report = {schema: 1, config, startedAt: new Date().toISOString(),
    harness: Object.fromEntries(['benchmark-inkwave-composed-native-gpu-pool.mjs', 'lib/inkwave-native-pool-admission.mjs', 'lib/inkwave-cpu-affinity-pool.mjs', 'lib/inkwave-composed-cpu-replay.mjs', 'lib/inkwave-cpu-gameplay-digest.mjs', 'lib/inkwave-cpu-counters.mjs', 'lib/inkwave-runtime-evidence.mjs', 'lib/inkwave-sandbox-browser.mjs'].map(file => [file, hash(fs.readFileSync(new URL(file, import.meta.url)))])),
    builds: Object.fromEntries(Object.entries(builds).map(([side, build]) => [side, {sourceSha: build.sourceSha, contentHash: build.manifest.contentHash, revision: build.manifest.build.revision, sourceBinding: build.sourceBinding}])),
    environment: {node: process.version, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, cpuQuota: readText('/sys/fs/cgroup/cpu.max'), viewport: [config.width, config.height], countOnlySceneRenderWrapper: true, affinity: affinitySetup},
    limits: ['Fixed-step eight-actor native emitted runtime; native geometry, paint and all source characters are required before timing. No presented/device FPS evidence.',
      'Private assets match the exact source commit Git LFS oid and size. Public and private response bodies are checked against admitted SHA and byte length on every HTTP request; successful response receipts are retained.',
      'All numeric window results must be finite before JSON serialization. A non-finite value fails the run and is retained as an explicit tagged rejection, never silently serialized as null.',
      'Before game page creation, all harness/browser non-GPU threads are assigned to worker CPUs, and all GPU process threads to a disjoint dedicated CPU pool whose combined capacity with the worker pool fits the cgroup quota. Two startup assignment passes are fixed in advance. No assignment occurs after game page creation. Every window checks all observed browser process/thread affinities before and after timing; a changed GPU PID or an unexpected CPU fails the run. CPU quota and game quality are unchanged. GPU CPU restrictions change this host experiment and may increase wall time; no device FPS or natural scheduler claim.',
      'One Chromium process; independent contexts/pages may use separate renderer processes. Only one page is active; all other benchmark pages are lifecycle-frozen. No profiling, timing wrappers, sampling or forced GC. One count-only wrapper records actual scene render calls.',
      'Every window reconstructs a real match on its retained page. This preserves JIT state and exercises real teardown/startup before the window; it is not the natural heap history of one continuous match. Ordinary rematch retains cumulative clock ticks, paint versions and module-private presentation RNG. Only corresponding rematch ordinals are compared: ABBA slots 0/1 share ordinal n and slots 2/3 share n+1. Both versions execute both histories; cross-ordinal outputs are not claimed identical.',
      'Preparation and GPU finish are outside timing. Per-frame wall excludes observer work; renderer thread CPU includes gameplay digest, counters and CDP evaluation work. After each window the active GL queue is drained outside timing before another page runs. No GPU finish is added to the measured workload.',
      'Scene submission is excluded unless --render is set. Paint atlas draws remain active. SwiftShader rendering is a separate software workload, not hardware GPU performance.',
      'Parity covers recorded gameplay/state, visible bone world matrices and workload counters within each matched-ordinal pair, not all pixels, audio samples, every private field or external-device behavior. CPU-only windows may observe no drawn bones and are not visible-pose evidence. Audio raw voice/play/drop counters are recorded without invoking the mutating stats method; real-time voice/minGap outcomes are not required equal.',
      'A/A passed means recorded-state parity only; timing-noise acceptance remains a separate analysis. Renderer ThreadTime includes observers and is not game-only CPU time.',
      'Both pages boot before warmup. The preset warmup side order is an initial AB pair for an odd count, followed by ABBA blocks. Each side executes the same number of full warmup replays, with every corresponding ordinal compared. This avoids training one page and leaving it frozen while the other page boots and completes all warmup.',
      'All warmup and measured windows are retained. Warmup quantity, seeds, frames and order are fixed before execution; a failed or divergent window fails the whole run.'],
    warmups: [], preflight: [], measurements: [], parityPairs: [], rejectedWindowAttempts: []};
  assert.ok(!fs.existsSync(path.join(evidence, 'result.json')), 'use a new evidence directory; previous windows must be retained');
  for (const file of Object.keys(report.harness)) {
    const target = path.join(evidence, 'harness', file); fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, fs.readFileSync(new URL(file, import.meta.url)));
  }
  const save = () => fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const temp = persistentBrowserTemp(path.join(evidence, 'tmp'));
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = temp;
  let browser, affinityController;
  let owners = [];
  try {
    for (const side of ['a', 'b']) {
      const build = builds[side];
      const server = http.createServer((req, res) => {try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
        const file = path.resolve(build.site, '.' + (pathname === '/' ? '/index.html' : pathname));
        assert.ok(file.startsWith(build.site + path.sep));
        const bytes = fs.readFileSync(file), rel = path.relative(build.site, file);
        const receipt = verifyServedBody(rel, bytes, build.artifactReceipts[rel]);
        build.served.add(rel);
        build.servedReceipts.set(rel, {...receipt, requests: (build.servedReceipts.get(rel)?.requests || 0) + 1});
        res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'}); res.end(bytes);
      } catch {res.writeHead(404); res.end();}});
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      servers.push(server); build.url = 'http://127.0.0.1:' + server.address().port + '/';
    }
    browser = await launchSandboxBrowser(chromium, {CHROMIUM_EXECUTABLE_PATH: process.env.CHROMIUM_PATH});
    report.environment.browser = browser.version();
    const affinity = await configureBrowserAffinity(browser, affinitySetup); affinityController = affinity.controller;
    report.environment.affinity = affinity.evidence; save();
    if (config.affinityCheckOnly) {report.status = 'affinity-setup-passed'; report.completedAt = new Date().toISOString(); return;}
    for (const phase of (config.preflightOnly ? ['preflight'] : ['preflight', 'measurements'])) {
      const bySide = {};
      for (const side of ['a', 'b']) {
        const buildSide = phase === 'preflight' ? 'a' : side;
        const context = await browser.newContext({viewport: {width: config.width, height: config.height}}), page = await context.newPage();
        const owner = {side, buildSide, context, page, errors: [], lastTicks: null, replayOrdinal: 0};
        owners.push(owner); bySide[side] = owner;
        page.on('pageerror', error => owner.errors.push(error.message));
        await page.addInitScript(installCpuGameplayDigest); await page.addInitScript(installCpuCounters);
        await page.addInitScript(quality => {
          localStorage.setItem('inkwave.settings', JSON.stringify({quality, musicVolume: 0, audioVolume: 0}));
          let seed = 987654321; Math.random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
        }, config.quality);
        console.log(JSON.stringify({phase, side, step: 'boot'}));
        await page.goto(builds[buildSide].url, {waitUntil: 'domcontentloaded', timeout: 60000});
        await page.waitForFunction(() => window.__G?.mode === 'menu', null, {timeout: 300000});
        await page.evaluate(() => {window.__inkwave.debug.freeze(); window.__inkwave._skipRender = true;});
        owner.cdp = await context.newCDPSession(page);
        await owner.cdp.send('Performance.enable', {timeDomain: 'threadTicks'});
        await owner.cdp.send('Page.setWebLifecycleState', {state: 'frozen'});
      }
      for (const [slot, side] of config.warmupSchedule.entries()) {
        const owner = bySide[side];
        const row = await capture(owner, config.warmupFrames, {phase, kind: 'warmup', round: owner.replayOrdinal, slot});
        report.warmups.push(row); save();
        assertReplayParity(null, row);
        const partner = report.warmups.find(other => other.phase === phase && other.side !== row.side && other.replayOrdinal === row.replayOrdinal);
        if (partner) comparePair(partner, row);
        console.log(JSON.stringify({phase, kind: 'warmup', slot, side, replayOrdinal: row.replayOrdinal, frameMeanMs: row.frameMeanMs,
          threadMsPerTick: row.rendererThreadMsPerTick, digest: row.digest, budgetTicks: row.budgetWork.reduce((sum, actor) => sum + actor._oobBudgetTicks, 0)}));
        await owner.cdp.send('Page.setWebLifecycleState', {state: 'frozen'});
      }
      const rows = report[phase], schedule = abbaOrder(phase === 'preflight' ? config.aaRounds : config.rounds);
      for (const step of schedule) {
        const row = await capture(bySide[step.side], config.frames, {phase, kind: 'measurement', ...step});
        rows.push(row); save();
        assertReplayParity(null, row);
        assert.equal(row.replayOrdinal, config.warmupRuns + row.round * 2 + (row.slot < 2 ? 1 : 2), 'balanced ordinary-rematch ordinal');
        const partner = rows.find(other => other.side !== row.side && other.replayOrdinal === row.replayOrdinal);
        if (partner) comparePair(partner, row);
        console.log(JSON.stringify({phase, round: row.round, slot: row.slot, side: row.side, frameMeanMs: row.frameMeanMs, threadMsPerTick: row.rendererThreadMsPerTick, digest: row.digest}));
        await bySide[step.side].cdp.send('Page.setWebLifecycleState', {state: 'frozen'});
      }
      report[phase + 'Summary'] = summarizeQuartets(rows); save();
      assert.equal(report.parityPairs.filter(pair => pair.phase === phase && pair.kind === 'measurement').length, rows.length / 2, 'every measured window has its exact-state partner');
      for (const owner of owners) await owner.context.close(); owners = [];
    }
    report.status = 'passed'; report.completedAt = new Date().toISOString();
  } catch (error) {report.status = 'failed'; report.error = error.stack; throw error;}
  finally {
    report.servedArtifacts = Object.fromEntries(Object.entries(builds).map(([side, build]) => [side, [...build.served].sort()]));
    report.servedByteReceipts = Object.fromEntries(Object.entries(builds).map(([side, build]) => [side, Object.fromEntries([...build.servedReceipts].sort(([a], [b]) => a.localeCompare(b)))])); save();
    for (const owner of owners) await owner.context.close().catch(() => {});
    await browser?.close();
    for (const server of servers) await new Promise(resolve => server.close(resolve));
  }

  async function capture(owner, frames, meta) {
    const {page, cdp} = owner;
    await cdp.send('Page.setWebLifecycleState', {state: 'active'});
    await page.bringToFront();
    const visibility = await page.evaluate(() => ({hidden: document.hidden, state: document.visibilityState, ticks: window.__inkwave.s3Clock.ticks, frozen: window.__inkwave.frozen}));
    assert.equal(visibility.hidden, false, 'active measured page is visible');
    assert.equal(visibility.state, 'visible');
    assert.equal(visibility.frozen, true, 'natural frame loop remains frozen');
    if (owner.lastTicks !== null) assert.equal(visibility.ticks, owner.lastTicks, 'inactive page did not advance simulation');
    const initial = await page.evaluate(prepareCpuBattle, config), replayOrdinal = ++owner.replayOrdinal;
    try { assertNativeInitial(initial); } catch (error) {
      report.rejectedWindowAttempts.push({...meta, side: owner.side, replayOrdinal, timingExecuted: false, initial, error: String(error)}); save(); throw error;
    }
    const affinityBefore = await inspectBrowserAffinity(affinityController);
    if (affinityBefore.status !== 'verified') {
      report.rejectedWindowAttempts.push({...meta, side: owner.side, replayOrdinal, initial, affinityBefore}); save();
      throw Error('Pre-window affinity verification failed; no timing window executed');
    }
    const before = await cdp.send('Performance.getMetrics'), cgroupBefore = readCpuStat(), startedAt = new Date().toISOString(), wallStart = performance.now();
    const result = await page.evaluate(runCpuBattle, {frames, hz: config.hz});
    const evaluationWallMs = performance.now() - wallStart, cgroupAfter = readCpuStat(), after = await cdp.send('Performance.getMetrics');
    const metric = (snapshot, name) => snapshot.metrics.find(row => row.name === name)?.value;
    const threadCpuMs = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'ThreadTime'].map(name => [name, 1000 * (metric(after, name) - metric(before, name))]));
    // Drain the previous owner's queued software-GPU work before activating
    // another context. This wait is excluded from both timing measurements.
    const postWindow = await page.evaluate(() => {const G=window.__G,g=window.__inkwave,ticks=g.s3Clock.ticks;G.renderer.getContext().finish();return {ticks,afterTicks:g.s3Clock.ticks,hidden:document.hidden};});
    const affinityAfter = await inspectBrowserAffinity(affinityController);
    owner.lastTicks = postWindow.afterTicks;
    const row = {...meta, side: owner.side, buildSide: owner.buildSide, replayOrdinal, startedAt, completedAt: new Date().toISOString(), initial, ...result,
      renderRequested: config.render, requireOobBudget: config.requireOobBudget, affinity: {before: affinityBefore, after: affinityAfter},
      frameMeanMs: result.times.reduce((sum, value) => sum + value, 0) / frames, frameStats: sampleStats(result.times),
      frameBlocks100: Array.from({length: Math.ceil(frames / 100)}, (_, index) => sampleStats(result.times.slice(index * 100, (index + 1) * 100))),
      rendererThreadMsPerTick: threadCpuMs.ThreadTime / result.ticks, threadCpuMs, evaluationWallMs, cgroup: {before: cgroupBefore, after: cgroupAfter},
      heap: {before: Object.fromEntries(before.metrics.filter(row => /JSHeap|Nodes|Documents/.test(row.name)).map(row => [row.name, row.value])),
        after: Object.fromEntries(after.metrics.filter(row => /JSHeap|Nodes|Documents/.test(row.name)).map(row => [row.name, row.value]))}, visibility, postWindow, errors: [...owner.errors]};
    try { assertFiniteNumbers(row, 'window'); } catch (error) {
      const taggedRow = JSON.parse(JSON.stringify(row, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? {nonFiniteNumber: String(value)} : value));
      report.rejectedWindowAttempts.push({...meta, side: owner.side, replayOrdinal, timingExecuted: true, error: String(error), taggedRow}); save(); throw error;
    }
    return row;
  }

  function comparePair(first, second) {
    const a = first.side === 'a' ? first : second, b = first.side === 'b' ? first : second;
    assert.equal(a.replayOrdinal, b.replayOrdinal, 'same ordinary-rematch history');
    assertReplayParity(a, b);
    report.parityPairs.push({phase: a.phase, kind: a.kind, replayOrdinal: a.replayOrdinal,
      a: {round: a.round, slot: a.slot, digest: a.digest, poseDigest: a.poseDigest},
      b: {round: b.round, slot: b.slot, digest: b.digest, poseDigest: b.poseDigest}, status: 'exact-recorded-pair-parity'});
  }
}

function readText(file) {return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;}
function readCpuStat() {return Object.fromEntries((readText('/sys/fs/cgroup/cpu.stat') || '').split('\n').filter(Boolean).map(line => {const [key, value] = line.split(' '); return [key, Number(value)];}));}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await main();

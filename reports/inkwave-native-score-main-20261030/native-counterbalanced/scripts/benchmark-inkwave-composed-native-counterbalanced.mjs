#!/usr/bin/env node
// Native-only repeated eight-actor CPU workload with alternating ABBA/BAAB.
// Independent entrypoint: the original GPU-pool benchmark and evidence stay intact.
// Does not measure presented FPS. Review and freeze the schedule before execution.
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

export function quartetOrder(rounds, firstSide = 'a') {
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 16, 'valid quartet count');
  assert.ok(firstSide === 'a' || firstSide === 'b', 'valid quartet start side');
  return Array.from({length: rounds}, (_, round) => {
    const outer = round % 2 ? (firstSide === 'a' ? 'b' : 'a') : firstSide;
    const inner = outer === 'a' ? 'b' : 'a', sides = [outer, inner, inner, outer];
    const order = sides.join('').toUpperCase();
    return sides.map((side, slot) => ({round, slot, side, order}));
  }).flat();
}

// Self-contained for page.evaluate. Copy values already produced by the live
// HUD; never call coverage(), teamSummary(), a getter or a simulation method.
// The admitted runtime uses ordinary own data properties for these owners.
export function readExistingScoreSnapshot() {
  const own = (owner, key) => {
    if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) throw Error('Missing owner for ' + key);
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('Missing own data property: ' + key);
    return descriptor.value;
  };
  const pair = (value, name) => {
    if (!Array.isArray(value) || own(value, 'length') !== 2) throw Error('Missing two-value ' + name);
    const copy = [own(value, '0'), own(value, '1')];
    if (!copy.every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1) ||
        copy[0] + copy[1] > 1 + Number.EPSILON * 4) throw Error('Invalid ' + name);
    return copy;
  };
  const bits = values => {
    const buffer = new ArrayBuffer(16), view = new DataView(buffer);
    view.setFloat64(0, values[0], false); view.setFloat64(8, values[1], false);
    return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  try {
    const G = own(globalThis, '__G'), game = own(globalThis, '__inkwave');
    const paint = own(G, 'paint'), match = own(G, 'match'), clock = own(game, 's3Clock');
    const stamp = () => ({ticks: own(clock, 'ticks'), paintVersion: own(paint, 'version'),
      turfVersion: own(paint, '_s3TurfVersion'), coverageVersion: own(paint, '_s3CoverageVersion'),
      observedPaintVersion: own(paint, '_s3ObservedPaintVersion'), state: own(match, 'state'),
      matchTime: own(match, 'time'), gameMode: own(G, 'mode'), mode: own(match, 'mode'),
      attract: own(match, 'attract'), paused: own(match, 'paused'), frozen: own(game, 'frozen')});
    const before = stamp();
    if (own(game, 'match') !== match || before.gameMode !== 'match' || before.mode !== 'turf' ||
        before.state !== 'playing' || before.attract !== false || before.paused !== false || before.frozen !== true || !own(game, 'hud'))
      throw Error('Not the active frozen live-Turf HUD scenario');
    if (!Number.isSafeInteger(before.ticks) || !Number.isFinite(before.matchTime) ||
        !['paintVersion', 'turfVersion', 'coverageVersion', 'observedPaintVersion'].every(key => Number.isSafeInteger(before[key])))
      throw Error('Invalid score observation stamp');
    const coverageOwner = own(paint, '_s3Coverage'), coverage = pair(coverageOwner, 'coverage cache');
    const hudOwner = own(match, '_teamHudSnapshot'), hudCoverageOwner = own(hudOwner, 'coverage');
    const hudCoverage = pair(hudCoverageOwner, 'HUD coverage transport');
    const frame = own(own(game, '_hudTransport'), 'frame'), frameTeams = own(frame, 'teams');
    if (own(frame, 'time') !== before.matchTime ||
        (frameTeams !== own(hudOwner, 'forward') && frameTeams !== own(hudOwner, 'reverse')))
      throw Error('HUD transport does not describe the current match time/teams');
    const teams = own(hudOwner, 'teams');
    if (!Array.isArray(teams) || own(teams, 'length') !== 2) throw Error('Missing HUD team flags');
    const hudFlags = ['0', '1'].map(key => {
      const team = own(teams, key), leading = own(team, 'leading'), danger = own(team, 'danger');
      if (typeof leading !== 'boolean' || typeof danger !== 'boolean') throw Error('Invalid HUD team flags');
      return {leading, danger};
    });
    const cacheCurrent = before.coverageVersion === before.turfVersion && before.observedPaintVersion === before.paintVersion &&
      own(paint, '_s3CoverageGrid') === own(paint, 'grid') && own(paint, '_s3CoverageDead') === own(paint, 'dead') &&
      own(paint, '_s3CoverageFaces') === own(paint, 'paintFaces');
    if (!cacheCurrent || !coverage.every((value, index) => Object.is(value, hudCoverage[index])))
      throw Error('Coverage cache is stale or differs from the existing HUD transport');
    const after = stamp();
    const unchanged = Object.keys(before).every(key => Object.is(before[key], after[key])) &&
      own(G, 'paint') === paint && own(G, 'match') === match && own(game, 'match') === match &&
      own(paint, '_s3Coverage') === coverageOwner && own(match, '_teamHudSnapshot') === hudOwner &&
      own(hudOwner, 'coverage') === hudCoverageOwner && own(game, 's3Clock') === clock;
    if (!unchanged) throw Error('Score observation changed its state or owner');
    return {status: 'observed-existing-live-hud-cache', before, after, unchanged, cacheCurrent,
      coverage, coverageBits: bits(coverage), hudCoverage, hudCoverageBits: bits(hudCoverage), hudFlags};
  } catch (error) {
    return {status: 'unavailable', reason: String(error?.message || error)};
  }
}

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
  assert.equal(row.scoreSnapshot.status, 'observed-existing-live-hud-cache', 'existing live HUD coverage observed without evaluation');
  assert.equal(row.scoreSnapshot.unchanged, true, 'score observation did not change state');
  assert.equal(row.scoreSnapshot.cacheCurrent, true, 'score and HUD caches describe current paint');
  assert.equal(row.scoreSnapshot.before.ticks, row.postWindow.afterTicks, 'score observer did not advance simulation after drain');
  assert.deepEqual(row.scoreSnapshot.before, row.scoreSnapshot.after, 'score observation retains all recorded state');
  assert.equal(row.affinity.before.status, 'verified', 'pre-window affinity verified');
  assert.equal(row.affinity.after.status, 'verified', 'post-window affinity verified');
  if (!base) return;
  for (const key of ['initial', 'frames', 'hz', 'ticks', 'minActors', 'minLiving', 'digest', 'digests', 'counts', 'state', 'draw', 'resources', 'scene', 'sceneRenderCalls', 'drawnActorFrames', 'poseDigests', 'poseDigest', 'budgetWork', 'scoreSnapshot'])
    assert.deepEqual(row[key], base[key], 'exact recorded parity: ' + key);
  assert.deepEqual(row.bvh, base.bvh, 'same BVH work');
}

// A quartet is the reporting unit. Its two A and two B observations have
// equal mean slot positions. Alternating ABBA/BAAB balances outer/inner positions.
// Slot balancing does not guarantee equal wall-clock spacing or remove a
// persistent page/renderer difference: use independent, reversed page-order runs.
// Preserve all quartets; frame samples from one replay are not independent runs.
export function summarizeQuartets(rows) {
  assert.equal(rows.length % 4, 0, 'complete ABBA/BAAB quartets');
  const quartets = [];
  for (let index = 0; index < rows.length; index += 4) {
    const group = rows.slice(index, index + 4);
    const firstSide = group[0].side;
    assert.ok(firstSide === 'a' || firstSide === 'b', 'valid quartet first side');
    const otherSide = firstSide === 'a' ? 'b' : 'a';
    const sides = [firstSide, otherSide, otherSide, firstSide];
    assert.deepEqual(group.map(row => row.side), sides);
    assert.deepEqual(group.map(row => row.slot), [0, 1, 2, 3]);
    assert.ok(group.every(row => row.round === group[0].round), 'single round per quartet');
    const order = sides.join('').toUpperCase();
    assert.ok(group.every(row => row.order === order), 'recorded quartet order matches sides');
    if (quartets.length) assert.notEqual(order, quartets.at(-1).order, 'alternating quartet order');
    const ratios = {};
    for (const metric of ['frameMeanMs', 'rendererThreadMsPerTick']) {
      const sideMean = side => group.filter(row => row.side === side).reduce((sum, row) => sum + row[metric], 0) / 2;
      const a = sideMean('a'), b = sideMean('b');
      assert.ok(a > 0 && b > 0 && Number.isFinite(a + b), 'finite timing metrics');
      ratios[metric] = {a, b, ratio: b / a, changePercent: 100 * (b / a - 1)};
    }
    quartets.push({round: group[0].round, order, replayOrdinals: group.map(row=>row.replayOrdinal??null), ratios});
  }
  const summarize = groups => ({frameRatio: ratioStats(groups.map(row => row.ratios.frameMeanMs.ratio)),
    threadRatio: ratioStats(groups.map(row => row.ratios.rendererThreadMsPerTick.ratio))});
  return {quartets, ...summarize(quartets),
    byOrder: Object.fromEntries(['ABBA', 'BAAB'].map(order => [order, summarize(quartets.filter(row => row.order === order))]))};
}

function ratioStats(values) {
  const summary = sampleStats(values);
  if (values.length < 2) return {...summary, logRatioTInterval95: null};
  const logs = values.map(Math.log), mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1));
  const t = [null, 12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.3060, 2.2622, 2.2281, 2.2010, 2.1788, 2.1604, 2.1448, 2.1314][logs.length - 1];
  const margin = t * sd / Math.sqrt(logs.length);
  return {...summary, geometricMean: Math.exp(mean), logRatioTInterval95: [Math.exp(mean - margin), Math.exp(mean + margin)],
    inference: 'Descriptive Student-t interval over quartet log-ratios, conditional on independence and approximate normality; retained pages and a shared browser do not establish independence. Not an interval over individual frame samples. Persistent page effects, host interference or drift can invalidate this assumption.'};
}

async function main() {
  const get = (name, fallback) => {const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1];};
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = persistentDirectory(get('--evidence-dir', '.b/counterbalanced'));
  const config = {stage: get('--stage', 'tidewater'), quality: get('--quality', 'high'), weapon: get('--weapon', 'shooter'),
    frames: Number(get('--frames', '900')), hz: Number(get('--hz', '60')), rounds: Number(get('--rounds', '4')),
    aaRounds: Number(get('--aa-rounds', '2')), warmupRuns: Number(get('--warmup-runs', '2')),
    width: Number(get('--width', '960')), height: Number(get('--height', '640')),
    warmupFrames: Number(get('--warmup-frames', '900')), render: process.argv.includes('--render'),
    preflightOnly: process.argv.includes('--preflight-only'),
    affinityCheckOnly: process.argv.includes('--affinity-check-only'),
    requireOobBudget: process.argv.includes('--require-oob-budget'),
    pageOrder: get('--page-order', 'ab'), quartetStart: get('--quartet-start', 'a'),
    seeds: {boot: 987654321, matchSetup: 11223, fixtureAndFirstStep: 24680, audio: 456, stepMultiplier: 2654435761},
    allowBvhWorkReduction: false};
  assert.ok(!process.argv.includes('--allow-bvh-work-reduction'), 'native comparison requires exact BVH work');
  for (const key of ['frames', 'warmupFrames']) assert.ok(Number.isInteger(config[key]) && config[key] >= 30 && config[key] <= 6000, 'valid ' + key);
  for (const key of ['rounds', 'aaRounds', 'warmupRuns']) assert.ok(Number.isInteger(config[key]) && config[key] >= 1 && config[key] <= 16, 'valid ' + key);
  assert.ok([30, 60, 120].includes(config.hz));
  for (const key of ['width', 'height']) assert.ok(Number.isInteger(config[key]) && config[key] >= 240 && config[key] <= 1920, 'valid ' + key);
  config.gpuCpus = get('--gpu-cpus', '');
  config.workerCpus = get('--worker-cpus', '');
  assert.ok(['ab', 'ba'].includes(config.pageOrder), '--page-order must be ab or ba');
  assert.ok(['a', 'b'].includes(config.quartetStart), '--quartet-start must be a or b');
  config.pageCreationOrder = [...config.pageOrder];
  config.warmupSchedule = interleavedWarmupOrder(config.warmupRuns).map(side =>
    config.quartetStart === 'a' ? side : (side === 'a' ? 'b' : 'a'));
  config.quartetSchedules = {preflight: quartetOrder(config.aaRounds, config.quartetStart),
    measurements: quartetOrder(config.rounds, config.quartetStart)};
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
    harness: Object.fromEntries(['benchmark-inkwave-composed-native-counterbalanced.mjs', 'lib/inkwave-native-pool-admission.mjs', 'lib/inkwave-cpu-affinity-pool.mjs', 'lib/inkwave-composed-cpu-replay.mjs', 'lib/inkwave-cpu-gameplay-digest.mjs', 'lib/inkwave-cpu-counters.mjs', 'lib/inkwave-runtime-evidence.mjs', 'lib/inkwave-network-source-coverage.mjs', 'lib/inkwave-sandbox-browser.mjs'].map(file => [file, hash(fs.readFileSync(new URL(file, import.meta.url)))])),
    builds: Object.fromEntries(Object.entries(builds).map(([side, build]) => [side, {sourceSha: build.sourceSha, contentHash: build.manifest.contentHash, revision: build.manifest.build.revision, sourceBinding: build.sourceBinding}])),
    environment: {node: process.version, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, cpuQuota: readText('/sys/fs/cgroup/cpu.max'), viewport: [config.width, config.height], countOnlySceneRenderWrapper: true, affinity: affinitySetup},
    limits: ['Fixed-step eight-actor native emitted runtime; native geometry, paint and all source characters are required before timing. No presented/device FPS evidence.',
      'Private assets match the exact source commit Git LFS oid and size. Public and private response bodies are checked against admitted SHA and byte length on every HTTP request; successful response receipts are retained.',
      'All numeric window results must be finite before JSON serialization. A non-finite value fails the run and is retained as an explicit tagged rejection, never silently serialized as null.',
      'Before game page creation, all harness/browser non-GPU threads are assigned to worker CPUs, and all GPU process threads to a disjoint dedicated CPU pool whose combined capacity with the worker pool fits the cgroup quota. Two startup assignment passes are fixed in advance. No assignment occurs after game page creation. Every window checks all observed browser process/thread affinities before and after timing; a changed GPU PID or an unexpected CPU fails the run. CPU quota and game quality are unchanged. GPU CPU restrictions change this host experiment and may increase wall time; no device FPS or natural scheduler claim.',
      'One Chromium process; independent contexts/pages may use separate renderer processes. Only one page is active; all other benchmark pages are lifecycle-frozen. No profiling, timing wrappers, sampling or forced GC. One count-only wrapper records actual scene render calls.',
      'Every window reconstructs a real match on its retained page. This preserves JIT state and exercises real teardown/startup before the window; it is not the natural heap history of one continuous match. Ordinary rematch retains cumulative clock ticks, paint versions and module-private presentation RNG. Only corresponding rematch ordinals are compared: in both ABBA and BAAB, slots 0/1 share ordinal n and slots 2/3 share n+1. Both versions execute both histories; cross-ordinal outputs are not claimed identical.',
      'Preparation and GPU finish are outside timing. Per-frame wall excludes observer work; renderer thread CPU includes gameplay digest, counters and CDP evaluation work. After each window the active GL queue is drained outside timing before another page runs. No GPU finish is added to the measured workload.',
      'Scene submission is excluded unless --render is set. Paint atlas draws remain active. SwiftShader rendering is a separate software workload, not hardware GPU performance.',
      'Parity covers recorded gameplay/state, visible bone world matrices and workload counters within each matched-ordinal pair, not all pixels, audio samples, every private field or external-device behavior. CPU-only windows may observe no drawn bones and are not visible-pose evidence. Audio raw voice/play/drop counters are recorded without invoking the mutating stats method; real-time voice/minGap outcomes are not required equal.',
      'A/A passed means recorded-state parity only; timing-noise acceptance remains a separate analysis. Renderer ThreadTime includes observers and is not game-only CPU time.',
      'Both pages boot before warmup in the configured page creation order. The warmup order is an initial AB pair for an odd count, followed by ABBA blocks; every side label is reversed when quartetStart is b. Each side executes the same number of full warmup replays, with every corresponding ordinal compared.',
      'Measured quartets alternate ABBA and BAAB from the configured quartetStart. Each quartet reports the mean of its actual A observations and actual B observations, always as B/A. Slot balancing addresses order effects only under stable conditions; it does not remove persistent page/renderer effects. Independent sessions with reversed pageOrder and quartetStart must be assessed separately. A/A parity does not certify timing equivalence.',
      'After both timing measurements and GPU drain, the observer copies existing current score/HUD caches through own data descriptors. It does not call coverage, teamSummary, getters, simulation or state transitions. Missing, stale, non-finite or mismatched caches reject the window. Binary64 encodings preserve signed zero in saved parity evidence. This observes only the endpoint live-HUD transport, not every intermediate frame, DOM/pixels, deadline finish coverage or judge/winner behavior. Tiny observer allocations can still affect later heap history.',
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
      for (const side of config.pageCreationOrder) {
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
      const rows = report[phase], schedule = config.quartetSchedules[phase];
      for (const step of schedule) {
        const row = await capture(bySide[step.side], config.frames, {phase, kind: 'measurement', ...step});
        rows.push(row); save();
        assertReplayParity(null, row);
        assert.equal(row.replayOrdinal, config.warmupRuns + row.round * 2 + (row.slot < 2 ? 1 : 2), 'balanced ordinary-rematch ordinal');
        const partner = rows.find(other => other.side !== row.side && other.replayOrdinal === row.replayOrdinal);
        if (partner) comparePair(partner, row);
        console.log(JSON.stringify({phase, round: row.round, order: row.order, slot: row.slot, side: row.side, frameMeanMs: row.frameMeanMs, threadMsPerTick: row.rendererThreadMsPerTick, digest: row.digest}));
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
    const scoreSnapshot = await page.evaluate(readExistingScoreSnapshot);
    const affinityAfter = await inspectBrowserAffinity(affinityController);
    owner.lastTicks = postWindow.afterTicks;
    const row = {...meta, side: owner.side, buildSide: owner.buildSide, replayOrdinal, startedAt, completedAt: new Date().toISOString(), initial, ...result,
      renderRequested: config.render, requireOobBudget: config.requireOobBudget, affinity: {before: affinityBefore, after: affinityAfter},
      frameMeanMs: result.times.reduce((sum, value) => sum + value, 0) / frames, frameStats: sampleStats(result.times),
      frameBlocks100: Array.from({length: Math.ceil(frames / 100)}, (_, index) => sampleStats(result.times.slice(index * 100, (index + 1) * 100))),
      rendererThreadMsPerTick: threadCpuMs.ThreadTime / result.ticks, threadCpuMs, evaluationWallMs, cgroup: {before: cgroupBefore, after: cgroupAfter},
      heap: {before: Object.fromEntries(before.metrics.filter(row => /JSHeap|Nodes|Documents/.test(row.name)).map(row => [row.name, row.value])),
        after: Object.fromEntries(after.metrics.filter(row => /JSHeap|Nodes|Documents/.test(row.name)).map(row => [row.name, row.value]))}, visibility, postWindow, scoreSnapshot, errors: [...owner.errors]};
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
      a: {round: a.round, slot: a.slot, digest: a.digest, poseDigest: a.poseDigest, coverageBits: a.scoreSnapshot.coverageBits},
      b: {round: b.round, slot: b.slot, digest: b.digest, poseDigest: b.poseDigest, coverageBits: b.scoreSnapshot.coverageBits}, status: 'exact-recorded-pair-parity'});
  }
}

function readText(file) {return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;}
function readCpuStat() {return Object.fromEntries((readText('/sys/fs/cgroup/cpu.stat') || '').split('\n').filter(Boolean).map(line => {const [key, value] = line.split(' '); return [key, Number(value)];}));}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await main();

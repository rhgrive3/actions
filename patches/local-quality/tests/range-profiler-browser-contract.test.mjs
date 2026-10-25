import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  PROFILER_BROWSER_MODULES, profilerLifecycleExpectedHashes,
  collectProfilerLifecycleBrowserEvidence, assertProfilerLifecycleBrowserEvidence,
  runProfilerLifecycleBrowserChecks,
} from '../../../scripts/lib/inkwave-profiler-lifecycle-browser.mjs';

const artifacts = Object.fromEntries(PROFILER_BROWSER_MODULES.map((path, i) => [path, String(i + 1).repeat(64)]));
function acceptedReceipt() {
  const base = name => ({
    name, domBefore: { labels: 1, buttons: 1 }, domAfter: { labels: 0, buttons: 0 },
    frameRestored: true, returnsIntact: true, globalCleared: true,
    postDisposalFrames: 3, postDisposalTimingReads: 0,
  });
  return {
    schema: 'inkwave-emitted-profiler-browser-lifecycle-v1',
    moduleBindings: PROFILER_BROWSER_MODULES.map(path => ({ path, url: 'http://127.0.0.1/' + path, sha256: artifacts[path], bytes: 42 })),
    cases: [
      { ...base('dispose-before-import'), domBeforeReady: { labels: 0, buttons: 0 }, readyResolvedToNull: true },
      { ...base('normal-ready-dispose'), readyInstalled: true, capturedFrames: 3 },
      { ...base('obsolete-probe-replacement'), obsoleteReadyResolvedToNull: true,
        replacementReadyInstalled: true, replacementRetained: true },
    ],
    liveProbePreserved: true, iframeCountBefore: 0, iframeCountAfter: 0,
  };
}

test('requires both emitted-module hashes from the existing build artifact manifest', () => {
  assert.deepEqual(profilerLifecycleExpectedHashes(artifacts), artifacts);
  for (const path of PROFILER_BROWSER_MODULES) {
    for (const bad of [undefined, '', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)]) {
      assert.throws(() => profilerLifecycleExpectedHashes({ ...artifacts, [path]: bad }), /missing emitted profiler artifact hash/);
    }
  }
  assert.throws(() => profilerLifecycleExpectedHashes(null));
});

test('complete real-browser receipt contract is accepted without rewriting observations', () => {
  const receipt = acceptedReceipt();
  assert.strictEqual(assertProfilerLifecycleBrowserEvidence(receipt, artifacts), receipt);
});

test('rejects unbound, missing, duplicated or reordered emitted module evidence', () => {
  for (const mutate of [
    r => { r.moduleBindings[0].sha256 = '0'.repeat(64); },
    r => { r.moduleBindings[1].sha256 = '0'.repeat(64); },
    r => { r.moduleBindings[0].bytes = 0; },
    r => { r.moduleBindings[0].bytes = 1.5; },
    r => { r.moduleBindings.pop(); },
    r => { r.moduleBindings[1] = r.moduleBindings[0]; },
    r => { r.moduleBindings.reverse(); },
  ]) {
    const receipt = acceptedReceipt(); mutate(receipt);
    assert.throws(() => assertProfilerLifecycleBrowserEvidence(receipt, artifacts));
  }
});

test('every lifecycle case rejects DOM, return, binding, frame-count and timing regressions', () => {
  const badValues = {
    domBefore: { labels: 0, buttons: 0 }, domAfter: { labels: 1, buttons: 1 },
    frameRestored: false, returnsIntact: false, globalCleared: false,
    postDisposalFrames: 2, postDisposalTimingReads: 1,
  };
  for (let i = 0; i < 3; i++) {
    for (const [key, value] of Object.entries(badValues)) {
      const receipt = acceptedReceipt(); receipt.cases[i][key] = value;
      assert.throws(() => assertProfilerLifecycleBrowserEvidence(receipt, artifacts), i + ':' + key);
    }
  }
});

test('late initialization and obsolete replacement failures cannot be reported as accepted', () => {
  for (const [index, key, value] of [
    [0, 'readyResolvedToNull', false], [0, 'domBeforeReady', { labels: 1, buttons: 1 }],
    [1, 'readyInstalled', false], [1, 'capturedFrames', 0],
    [2, 'obsoleteReadyResolvedToNull', false], [2, 'replacementReadyInstalled', false],
    [2, 'replacementRetained', false],
  ]) {
    const receipt = acceptedReceipt(); receipt.cases[index][key] = value;
    assert.throws(() => assertProfilerLifecycleBrowserEvidence(receipt, artifacts), key);
  }
});

test('a changed live page owner, leaked iframe or omitted case fails the gate', () => {
  for (const mutate of [
    r => { r.liveProbePreserved = false; },
    r => { r.iframeCountBefore = 1; },
    r => { r.iframeCountAfter = 1; },
    r => { r.cases.pop(); },
    r => { r.cases.reverse(); },
    r => { r.schema = 'unknown'; },
  ]) {
    const receipt = acceptedReceipt(); mutate(receipt);
    assert.throws(() => assertProfilerLifecycleBrowserEvidence(receipt, artifacts));
  }
});

test('wrapper uses exactly one evaluation on the supplied page and no new browser lifecycle', async () => {
  let calls = 0;
  const receipt = acceptedReceipt();
  const page = { async evaluate(callback, input) {
    calls++;
    assert.strictEqual(callback, collectProfilerLifecycleBrowserEvidence);
    assert.deepEqual(input, { expected: artifacts });
    return receipt;
  } };
  assert.strictEqual(await runProfilerLifecycleBrowserChecks(page, artifacts), receipt);
  assert.equal(calls, 1);
});

test('wrapper fails before evaluation on absent identity and propagates actual browser failures', async () => {
  let calls = 0;
  await assert.rejects(runProfilerLifecycleBrowserChecks({ evaluate() { calls++; } }, {}));
  assert.equal(calls, 0);
  const fault = new Error('actual browser import failed');
  await assert.rejects(runProfilerLifecycleBrowserChecks({ async evaluate() { throw fault; } }, artifacts), e => e === fault);
  const invalid = acceptedReceipt(); invalid.cases[0].readyResolvedToNull = false;
  await assert.rejects(runProfilerLifecycleBrowserChecks({ async evaluate() { return invalid; } }, artifacts));
});

test('browser callback is standalone serializable JavaScript with same-origin real-DOM cleanup', () => {
  const source = collectProfilerLifecycleBrowserEvidence.toString();
  assert.doesNotThrow(() => new vm.Script('(' + source + ')'));
  assert.match(source, /await import\(moduleBindings\[0\]\.url\)/);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256', bytes\)/);
  assert.match(source, /url\.origin === location\.origin/);
  assert.match(source, /document\.createElement\('iframe'\)/);
  assert.match(source, /await loaded/);
  assert.match(source, /env = frame\.contentWindow; doc = frame\.contentDocument/);
  assert.match(source, /frame\.remove\(\)/);
  assert.match(source, /finally\s*\{\s*frame\.remove\(\);/);
  assert.match(source, /for \(const probe of probes\.reverse\(\)\) probe\.dispose\(\)/);
  assert.doesNotMatch(source, /__inkwaveRangePerf\s*=(?!=|>)|__inkwave\._frame\s*=(?!=|>)/);
});

test('existing Chromium Range gate invokes lifecycle QA only after unchanged real-frame acceptance', () => {
  const source = fs.readFileSync(new URL('../../../scripts/check-inkwave-range.mjs', import.meta.url), 'utf8');
  const call = 'out.checks.profilerLifecycle = await runProfilerLifecycleBrowserChecks(page, manifest.artifacts);';
  const admission = "throw new Error('Practice Range opt-in performance diagnostic: ' + JSON.stringify(perf));";
  assert.equal(source.split(call).length - 1, 1);
  assert.ok(source.indexOf(call) > source.indexOf(admission));
  assert.ok(source.indexOf(call) < source.indexOf("if (out.errors.length) throw new Error('page errors:"));
  assert.ok(source.includes("if (run.name === 'chromium-desktop' && !signageOnly)"));
  assert.ok(source.includes('page.waitForFunction(profileRangeAcceptanceSnapshot, null, { timeout: 90000 })'));
  assert.ok(source.includes("perf.mode !== 'practice' || perf.collected < 12"));
  assert.ok(source.includes("!perf.stageNames.includes('paint') || !perf.stageNames.includes('render')"));
  assert.ok(source.includes("if (out.missing.length) throw new Error('missing assets:"));
});

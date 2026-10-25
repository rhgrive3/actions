import assert from 'node:assert/strict';

export const PROFILER_BROWSER_MODULES = Object.freeze([
  'patches/local-quality/range-frame-profiler.mjs',
  'patches/local-quality/range-hitch-tracer.mjs',
]);

export function profilerLifecycleExpectedHashes(artifacts) {
  return Object.fromEntries(PROFILER_BROWSER_MODULES.map(path => {
    const hash = artifacts?.[path];
    assert.match(hash || '', /^[a-f0-9]{64}$/, 'missing emitted profiler artifact hash: ' + path);
    return [path, hash];
  }));
}

// Serialized by Playwright into the already-loaded Range page. All probe
// state belongs to temporary same-origin iframe Windows, never the live game.
export async function collectProfilerLifecycleBrowserEvidence({ expected }) {
  const check = (ok, message) => { if (!ok) throw new Error('Profiler lifecycle: ' + message); };
  const liveProbe = window.__inkwaveRangePerf;
  const liveGameProbe = window.__inkwave?._rangeFrameProbe;
  const liveFrame = window.__inkwave?._frame;
  check(!!liveProbe && liveGameProbe === liveProbe && typeof liveFrame === 'function', 'live Range frame probe is not the current owner');
  const modulePaths = [
    'patches/local-quality/range-frame-profiler.mjs',
    'patches/local-quality/range-hitch-tracer.mjs',
  ];
  const moduleBindings = [];
  for (const path of modulePaths) {
    const url = new URL(path, document.baseURI);
    check(url.origin === location.origin, 'module is not on the existing Range origin');
    const response = await fetch(url.href, { cache: 'no-store' });
    check(response.ok, 'emitted module request failed: ' + path);
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    check(sha256 === expected[path], 'emitted module differs from build manifest: ' + path);
    moduleBindings.push({ path, url: url.href, sha256, bytes: bytes.byteLength });
  }
  const { createFrameTimingProbe } = await import(moduleBindings[0].url);
  check(typeof createFrameTimingProbe === 'function', 'missing actual emitted probe factory');
  const frameSelector = 'iframe[data-inkwave-profiler-lifecycle]';
  const iframeCountBefore = document.querySelectorAll(frameSelector).length;
  check(iframeCountBefore === 0, 'an earlier lifecycle fixture was not cleaned up');
  const cases = [];
  const liveUnchanged = () => window.__inkwaveRangePerf === liveProbe &&
    window.__inkwave?._rangeFrameProbe === liveGameProbe && window.__inkwave?._frame === liveFrame;
  const runCase = async (name, exercise) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('data-inkwave-profiler-lifecycle', name);
    frame.setAttribute('title', 'Isolated profiler lifecycle verification');
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.src = 'about:blank';
    document.body.appendChild(frame);
    let env, doc;
    let timingReads = 0, calls = 0;
    const token = { name };
    const original = function () { calls++; return token; };
    const game = { _frame: original };
    const probes = [];
    const dom = () => ({
      labels: doc.querySelectorAll('#inkwave-range-frame-diagnostic').length,
      buttons: doc.querySelectorAll('#inkwave-copy-frame-trace').length,
    });
    const create = () => {
      const probe = createFrameTimingProbe({ env, game, now: () => { timingReads++; return performance.now(); } });
      probes.push(probe);
      return probe;
    };
    const framesAfterDisposal = () => {
      const beforeReads = timingReads, beforeCalls = calls;
      const returnsIntact = [1 / 30, 1 / 60, 1 / 120].every(dt => game._frame(dt) === token);
      return { returnsIntact, postDisposalFrames: calls - beforeCalls,
        postDisposalTimingReads: timingReads - beforeReads, frameRestored: game._frame === original };
    };
    try {
      await loaded;
      env = frame.contentWindow; doc = frame.contentDocument;
      check(frame.isConnected && !!doc?.body, name + ': iframe document is not connected');
      const result = await exercise({ env, game, original, create, dom, token, framesAfterDisposal });
      check(frame.isConnected && doc === frame.contentDocument, name + ': iframe document changed during verification');
      check(liveUnchanged(), name + ': live Range probe or frame owner changed');
      cases.push({ name, ...result });
    } finally {
      // Await in-flight imports before final cleanup, including the failing
      // old-source control. This is cleanup, not a retry or a second test run.
      try {
        await Promise.all(probes.map(probe => probe.ready));
      } finally {
        try {
          for (const probe of probes.reverse()) probe.dispose();
        } finally {
          frame.remove();
        }
      }
    }
  };
  try {
    await runCase('dispose-before-import', async f => {
      const probe = f.create(), domBefore = f.dom();
      check(domBefore.labels === 1 && domBefore.buttons === 1, 'pending probe DOM was not created');
      probe.dispose();
      const domBeforeReady = f.dom();
      check(domBeforeReady.labels === 0 && domBeforeReady.buttons === 0, 'pending disposal did not remove real DOM');
      const ready = await probe.ready;
      const domAfter = f.dom(), frames = f.framesAfterDisposal();
      check(ready === null && probe.snapshot().trace === null, 'disposed pending probe installed a late tracer');
      check(f.env.__inkwaveRangePerf === undefined, 'pending disposal retained its iframe global');
      return { domBefore, domBeforeReady, domAfter, readyResolvedToNull: ready === null,
        globalCleared: f.env.__inkwaveRangePerf === undefined, ...frames };
    });
    await runCase('normal-ready-dispose', async f => {
      const probe = f.create(), ready = await probe.ready, domBefore = f.dom();
      check(!!ready && f.game._frame !== f.original, 'normal ready did not install the tracer');
      for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
        check(f.game._frame(dt) === f.token, 'normal tracing changed a frame return value');
        probe.record(performance.now(), 1, { phase: 'isolated-fixture', frameRateHz: 60 });
      }
      const capturedFrames = probe.snapshot().trace.capturedFrames;
      probe.dispose(); probe.dispose();
      return { domBefore, domAfter: f.dom(), readyInstalled: !!ready, capturedFrames,
        globalCleared: f.env.__inkwaveRangePerf === undefined, ...f.framesAfterDisposal() };
    });
    await runCase('obsolete-probe-replacement', async f => {
      const obsolete = f.create();
      obsolete.dispose();
      const current = f.create(), domBefore = f.dom();
      const [oldReady, ready] = await Promise.all([obsolete.ready, current.ready]);
      check(oldReady === null && !!ready, 'obsolete probe installed underneath its replacement');
      obsolete.dispose();
      const replacementRetained = f.env.__inkwaveRangePerf === current;
      check(replacementRetained, 'obsolete disposal cleared the replacement global');
      current.dispose();
      return { domBefore, domAfter: f.dom(), obsoleteReadyResolvedToNull: oldReady === null,
        replacementReadyInstalled: !!ready, replacementRetained,
        globalCleared: f.env.__inkwaveRangePerf === undefined, ...f.framesAfterDisposal() };
    });
  } finally {
    check(liveUnchanged(), 'lifecycle verification changed the live Range probe/frame owner');
    check(document.querySelectorAll(frameSelector).length === iframeCountBefore, 'isolated iframe leaked');
  }
  return {
    schema: 'inkwave-emitted-profiler-browser-lifecycle-v1',
    scope: 'Actual emitted modules and real iframe DOM; fixture frame calls, not full-game parity or device FPS.',
    moduleBindings, cases, liveProbePreserved: liveUnchanged(),
    iframeCountBefore, iframeCountAfter: document.querySelectorAll(frameSelector).length,
  };
}

export function assertProfilerLifecycleBrowserEvidence(result, expected) {
  assert.equal(result?.schema, 'inkwave-emitted-profiler-browser-lifecycle-v1');
  assert.equal(result.liveProbePreserved, true, 'live Range probe/frame must remain unchanged');
  assert.equal(result.iframeCountBefore, 0);
  assert.equal(result.iframeCountAfter, 0, 'test iframes must be removed');
  assert.deepEqual(result.moduleBindings?.map(row => row.path), [...PROFILER_BROWSER_MODULES]);
  for (const row of result.moduleBindings) {
    assert.equal(row.sha256, expected[row.path], 'browser module hash must match the final build');
    assert.ok(Number.isInteger(row.bytes) && row.bytes > 0);
  }
  assert.deepEqual(result.cases?.map(row => row.name),
    ['dispose-before-import', 'normal-ready-dispose', 'obsolete-probe-replacement']);
  for (const row of result.cases) {
    assert.deepEqual(row.domBefore, { labels: 1, buttons: 1 }, row.name + ': real probe DOM');
    assert.deepEqual(row.domAfter, { labels: 0, buttons: 0 }, row.name + ': real DOM removal');
    assert.equal(row.frameRestored, true, row.name + ': original frame binding');
    assert.equal(row.returnsIntact, true, row.name + ': original frame return values');
    assert.equal(row.globalCleared, true, row.name + ': iframe probe global removal');
    assert.equal(row.postDisposalFrames, 3, row.name + ': all three frame calls must run');
    assert.equal(row.postDisposalTimingReads, 0, row.name + ': no stale timing wrapper');
  }
  const [pending, normal, replacement] = result.cases;
  assert.deepEqual(pending.domBeforeReady, { labels: 0, buttons: 0 });
  assert.equal(pending.readyResolvedToNull, true);
  assert.equal(normal.readyInstalled, true);
  assert.equal(normal.capturedFrames, 3);
  assert.equal(replacement.obsoleteReadyResolvedToNull, true);
  assert.equal(replacement.replacementReadyInstalled, true);
  assert.equal(replacement.replacementRetained, true);
  return result;
}

export async function runProfilerLifecycleBrowserChecks(page, artifacts) {
  const expected = profilerLifecycleExpectedHashes(artifacts);
  const result = await page.evaluate(collectProfilerLifecycleBrowserEvidence, { expected });
  return assertProfilerLifecycleBrowserEvidence(result, expected);
}

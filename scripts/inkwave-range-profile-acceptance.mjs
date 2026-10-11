// Browser-gate predicate: must be SYNCHRONOUS for Playwright waitForFunction.
// An async predicate is treated as a truthy Promise before it resolves and
// can cause a false-positive wakeup with a JSHandle whose value is `false`.
// Keep self-contained: Playwright serializes this function into page context.
export function profileRangeAcceptanceSnapshot(env = globalThis) {
  env ??= globalThis; // Playwright explicitly passes null as waitForFunction's argument.
  const p = env.__inkwaveRangePerf, match = env.__G?.match;
  if (!p || !match?.range || match.state !== 'playing') return false;
  const s = p.snapshot();
  if (s.traceError) return { traceError: String(s.traceError) };
  const trace = s.trace;
  if (!trace || trace.capturedFrames < 12) return false;
  return {
    mode: s.mode, collected: trace.capturedFrames,
    gpuStatus: trace.gpu, gpuSamples: trace.gpuSamples,
    stageNames: Object.keys(trace.latest?.stages || {}),
    reportSchema: JSON.parse(p.report()).schema,
    profileButton: !!env.document?.querySelector('#inkwave-copy-frame-trace'),
    // A ResourceTiming URL is not proof of import: cached/dynamic ESM loads
    // may leave no matching entry. Require the real tracer's serialized frame.
    tracerRuntimeInstalled: Number.isInteger(trace.latest?.id) && trace.latest.id > 0 &&
      trace.latest?.stages != null && typeof p.report === 'function',
  };
}

// Browser-gate predicate: must be SYNCHRONOUS for Playwright waitForFunction.
// An async predicate is treated as a truthy Promise before it resolves and
// can cause a false-positive wakeup with a JSHandle whose value is `false`.
// Keep self-contained: Playwright serializes this function into page context.
export function profileRangeAcceptanceSnapshot(env = globalThis) {
  env ??= globalThis; // Playwright explicitly passes null as waitForFunction's argument.
  const p = env.__inkwaveRangePerf, match = env.__G?.match;
  // A timeout snapshot runs later than the last predicate. Preserve that
  // boundary instead of claiming that frames never existed during the wait.
  const recordPoll = (reason, snapshot = null) => {
    const previous = env.__inkwaveRangeAcceptancePoll;
    env.__inkwaveRangeAcceptancePoll = {
      count: (previous?.count || 0) + 1,
      observedAt: env.performance?.now?.() ?? null,
      reason, matchState: match?.state ?? null, range: !!match?.range,
      probeInstalled: !!p, probeMatchesFrameOwner: !!p && env.__inkwave?._rangeFrameProbe === p,
      mode: snapshot?.mode ?? null, capturedFrames: snapshot?.trace?.capturedFrames ?? null,
      latestFrameId: snapshot?.trace?.latest?.id ?? null,
    };
  };
  if (!p || !match?.range || match.state !== 'playing') { recordPoll('waiting-for-playing-range'); return false; }
  const s = p.snapshot();
  if (s.traceError) { recordPoll('trace-error', s); return { traceError: String(s.traceError) }; }
  const trace = s.trace;
  if (!trace || trace.capturedFrames < 12) { recordPoll('waiting-for-native-frames', s); return false; }
  recordPoll('snapshot-ready', s);
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

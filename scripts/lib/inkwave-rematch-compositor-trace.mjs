// Opt-in diagnostic only. CDP tracing observes scheduler/paint work; it does not
// seek animations, force compositing, throttle the CPU, or render extra frames.
// Start before native HOME input and stop only after the original focus gates.
export const REMATCH_TRACE_CONFIG = Object.freeze({
  recordMode: 'recordUntilFull', traceBufferSizeInKb: 16384,
  includedCategories: ['toplevel', 'blink', 'cc', 'gpu', 'viz', 'devtools.timeline',
    'disabled-by-default-devtools.timeline.frame'],
});

export function createRematchCompositorTrace(session, write, { timeoutMs = 10000, maxBytes = 64 * 1024 * 1024 } = {}) {
  const entries = [];
  let active = null, disabled = false;
  const bounded = async (action) => {
    let timer, expired = false;
    const check = () => { if (expired) throw new Error('Trace collection budget expired'); };
    try {
      return await Promise.race([
        Promise.resolve().then(() => action(check)),
        new Promise((_, reject) => { timer = setTimeout(() => {
          expired = true; reject(new Error(`Trace collection exceeded ${timeoutMs} ms`));
        }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const unavailable = (entry, error) => {
    entry.status = 'unavailable'; entry.error = String(error?.message || error);
    disabled = true;
  };
  return {
    entries,
    async start(round) {
      if (active) throw new Error('A rematch trace is already active');
      const entry = { round, status: 'starting', startedAt: new Date().toISOString(),
        config: REMATCH_TRACE_CONFIG, timeoutMs, maxBytes,
        observerEffect: 'Tracing and extra snapshot reads may change timing; this is diagnostic evidence only.' };
      entries.push(entry);
      if (disabled) { unavailable(entry, 'A prior trace failed; no overlapping trace is started'); return; }
      let complete;
      const ready = new Promise(resolve => { complete = resolve; });
      const listener = value => complete(value);
      session.on('Tracing.tracingComplete', listener);
      active = { entry, ready, listener };
      try {
        await bounded(async check => {
          await session.send('Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json',
            streamCompression: 'none', traceConfig: REMATCH_TRACE_CONFIG });
          check();
        });
        entry.status = 'recording';
      } catch (error) {
        unavailable(entry, error);
        session.off('Tracing.tracingComplete', listener); active = null;
      }
    },
    async stop() {
      if (!active) return;
      const { entry, ready, listener } = active;
      active = null;
      entry.stoppedAt = new Date().toISOString();
      try {
        const result = await bounded(async check => {
          await session.send('Tracing.end'); check();
          const complete = await ready; check();
          entry.dataLossOccurred = !!complete.dataLossOccurred;
          if (!complete.stream) throw new Error('Tracing completed without a stream');
          let bytes = 0; const chunks = [];
          try {
            for (;;) {
              const part = await session.send('IO.read', { handle: complete.stream, size: 1024 * 1024 }); check();
              const chunk = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
              bytes += chunk.length;
              if (bytes > maxBytes) throw new Error(`Trace exceeds ${maxBytes} bytes`);
              chunks.push(chunk);
              if (part.eof) break;
            }
          } finally {
            // The outer deadline also bounds a stalled IO.close. Context close
            // ultimately owns cleanup if the CDP endpoint stops responding.
            await session.send('IO.close', { handle: complete.stream });
          }
          check();
          const body = Buffer.concat(chunks), parsed = JSON.parse(body.toString('utf8'));
          if (!Array.isArray(parsed.traceEvents)) throw new Error('Trace has no traceEvents array');
          check();
          return { ...write(entry.round, body), bytes, eventCount: parsed.traceEvents.length };
        });
        Object.assign(entry, result, { status: 'captured' });
      } catch (error) { unavailable(entry, error); }
      finally { session.off('Tracing.tracingComplete', listener); }
    },
  };
}

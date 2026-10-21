// Bounded evidence only. No browser retry, deadline, or acceptance changes.
export const boundedText = (value, limit = 4096) => String(value ?? '').slice(0, limit);
const errorRecord = error => ({ name: boundedText(error?.name || 'Error', 80),
  message: boundedText(error?.message ?? error), stack: boundedText(error?.stack || '', 8192) });

export function createResponsiveDiagnostics({ now = () => Date.now(), maxEvents = 32 } = {}) {
  const started = now(), events = [];
  let firstError = null, lastCompletedStage = null, pageUnavailable = false, droppedEvents = 0;
  const record = (type, detail = '') => {
    if (events.length === maxEvents) { events.shift(); droppedEvents++; }
    events.push({ ms: Math.max(0, now() - started), type: boundedText(type, 80), detail: boundedText(detail, 1024) });
  };
  const fail = error => { if (!firstError) { firstError = errorRecord(error); record('first-error', firstError.message); } };
  const snapshot = () => ({ firstError, lastCompletedStage, pageUnavailable,
    droppedEvents, events: events.map(row => ({ ...row })) });
  return {
    record, fail, snapshot,
    stage(name) { lastCompletedStage = boundedText(name, 160); record('stage-complete', name); },
    unavailable(type) { pageUnavailable = true; record(type); },
    async optional(label, action, isClosed = () => false) {
      try {
        if (pageUnavailable || isClosed()) { record('diagnostic-skipped', label + ': page unavailable'); return { ok: false }; }
        return { ok: true, value: await action() };
      }
      catch (error) { record('diagnostic-error', label + ': ' + errorRecord(error).message); return { ok: false }; }
    },
    async close(action) {
      try { await action(); record('context-close-complete'); }
      catch (error) {
        record('context-close-error', errorRecord(error).message);
        if (!firstError) { fail(error); throw error; }
      }
    },
  };
}

export async function collectResponsiveFailure({ entry, error, diagnostics, page, readInteraction, captureFailure }) {
  entry.status = 'failed'; entry.error = error?.message ?? String(error);
  diagnostics.fail(error);
  const detail = await diagnostics.optional('interaction', readInteraction, () => page.isClosed());
  if (detail.ok) entry.interactionFailure = detail.value;
  await diagnostics.optional('failure screenshot', captureFailure, () => page.isClosed());
  entry.diagnostics = diagnostics.snapshot();
}

// This is the already captured child Node stderr. WebKit OS stderr may be absent.
export function boundedChildStderr(value, limit = 65536) {
  const text = String(value ?? '');
  return { text: text.slice(-limit), totalChars: text.length,
    retainedChars: Math.min(text.length, limit), truncated: text.length > limit };
}

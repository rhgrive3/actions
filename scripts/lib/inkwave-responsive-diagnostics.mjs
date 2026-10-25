import fs from 'node:fs';
import { parseResponsiveAnimations } from './inkwave-responsive-animation-diagnostics.mjs';

// Fixed harness IDs only; never persist selector, weapon ID, page text or errors here.
const operationIds = new Set(['setup-stage-count', 'setup-stage-read-id', 'setup-stage-scroll', 'setup-stage-tap', 'setup-stage-verify-id', 'setup-stage-settle', 'setup-stage-name', 'setup-stage-caption', 'setup-repeat-read-id', 'setup-repeat-scroll', 'setup-repeat-tap', 'setup-repeat-verify-id', 'setup-dusk-tap', 'setup-dusk-verify', 'setup-loadout-tap', 'setup-loadout-wait', 'setup-loadout-show', 'setup-loadout-capture', 'continuation-read-callback', 'continuation-tap-change', 'continuation-wait-loadout', 'continuation-settle-loadout', 'continuation-ready-loadout', 'continuation-read-weapon', 'continuation-list-weapons', 'continuation-select-weapon', 'continuation-verify-weapon', 'continuation-scroll-action', 'continuation-settle-action', 'continuation-visible-action', 'continuation-label-action', 'continuation-capture-action']);
export const responsiveOperationId = value => operationIds.has(value) ? value : null;

// Bounded evidence only. No browser retry, deadline, or acceptance changes.
export const boundedText = (value, limit = 4096) => String(value ?? '').slice(0, limit);
const errorRecord = error => ({ name: boundedText(error?.name || 'Error', 80),
  message: boundedText(error?.message ?? error), stack: boundedText(error?.stack || '', 8192) });

export function createResponsiveDiagnostics({ now = () => Date.now(), maxEvents = 32, onChange = () => {} } = {}) {
  const started = now(), events = [];
  let firstError = null, lastCompletedStage = null, pageUnavailable = false, droppedEvents = 0;
  let pendingOperation = null, animationSnapshots = [];
  const record = (type, detail = '') => {
    if (events.length === maxEvents) { events.shift(); droppedEvents++; }
    events.push({ ms: Math.max(0, now() - started), type: boundedText(type, 80), detail: boundedText(detail, 1024) });
    try { onChange(snapshot()); }
    catch (error) { console.error(JSON.stringify({ event: 'responsive-progress-write-error', error: boundedText(error?.message ?? error) })); }
  };
  const fail = error => { if (!firstError) { firstError = errorRecord(error); record('first-error', firstError.message); } };
  const snapshot = () => ({ firstError, lastCompletedStage, pendingOperation, pageUnavailable,
    ...(animationSnapshots.length ? { animationSnapshots } : {}), droppedEvents, events: events.map(row => ({ ...row })) });
  return {
    record, fail, snapshot,
    animations(text) {
      if (pendingOperation !== 'continuation-settle-action') return;
      const value = parseResponsiveAnimations(text);
      if (!value) return;
      animationSnapshots = [...animationSnapshots.filter(row => row.phase !== value.phase), value].slice(-2);
      record('animation-snapshot', value.phase);
    },
    operation(id, boundary) {
      id = responsiveOperationId(id);
      if (!id || !['before', 'after'].includes(boundary)) return;
      if (boundary === 'before') pendingOperation = id;
      else if (pendingOperation === id) pendingOperation = null;
      record('operation-' + boundary, id);
    },
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

// Separate progress evidence, never an acceptance receipt. Persist before any
// subsequent browser await so a stalled diagnostic or cleanup retains the cause.
export function createResponsiveProgressWriter(file, identity) {
  return diagnostics => {
    const receipt = { kind: 'responsive-diagnostic-progress', ...identity, diagnostics };
    fs.writeFileSync(file + '.pending', JSON.stringify(receipt, null, 2) + '\n');
    fs.renameSync(file + '.pending', file);
  };
}

// Every uncaught page error already fails acceptance. Close only that case's
// context to interrupt pending Playwright waits; do not throw from an event
// callback or change the outer child deadline. Earlier captures remain on disk.
export function createResponsiveFatalPageError({ diagnostics, closeContext, recordError }) {
  let firstError = null, closing = null;
  const close = () => {
    if (!closing) {
      closing = Promise.resolve().then(closeContext);
      // Event callbacks cannot await cleanup. Observe rejection immediately;
      // the existing finally block still awaits this same rejecting promise.
      closing.catch(() => {});
    }
    return closing;
  };
  return {
    get error() { return firstError; }, close,
    handle(error) {
      recordError(error);
      if (firstError) return;
      firstError = error;
      diagnostics.fail(error);
      diagnostics.unavailable('fatal-pageerror-context-closing');
      close();
    },
  };
}

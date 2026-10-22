import { responsiveOperationId } from './inkwave-responsive-diagnostics.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_PROGRESS_BYTES = 65536;
const engines = new Set(['chromium', 'webkit']);
const cases = new Set(['phone-portrait', 'phone-landscape', 'small-phone', 'tablet-portrait',
  'tablet-landscape', 'tablet-split', 'desktop']);
const phases = new Set(['loading', 'title', 'main', 'settings', 'setup', 'loadout', 'locker',
  'howto', 'credits', 'pause', 'results', 'boss-results', 'results-change-gear', 'loadout-continue', 'online', 'lobby', 'drawer', 'boss-lobby', 'mode', 'news']);
const types = new Set(['case-start', 'stage-complete', 'first-error', 'page-crash', 'page-close',
  'context-close', 'browser-disconnected', 'console-error', 'console-warning',
  'diagnostic-skipped', 'diagnostic-error', 'context-close-start', 'context-close-complete',
  'context-close-error', 'fatal-pageerror-context-closing', 'operation-before', 'operation-after']);
const errorNames = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
  'AssertionError', 'TimeoutError']);
const phase = value => phases.has(value) ? value
  : typeof value === 'string' && value.startsWith('setup-stage:') ? 'setup-stage' : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 2147483647) : null;

// Future local child evidence only. Never log free-form messages, stack, details,
// paths or browser data. This summary does not alter acceptance or diagnose a cause.
export function responsiveProgressSummary({ shardDir, engine, name, startedAt }) {
  const result = { event: 'responsive-child-progress', engine: engines.has(engine) ? engine : null,
    name: cases.has(name) ? name : null, status: 'unavailable' };
  if (!result.engine || !result.name || !Number.isFinite(startedAt)) return { ...result, status: 'invalid-identity' };
  let fd;
  try {
    fd = fs.openSync(path.join(shardDir, `${engine}-${name}-diagnostic-progress.json`),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { ...result, status: 'not-regular' };
    if (stat.mtimeMs < startedAt) return { ...result, status: 'stale' };
    if (stat.size > MAX_PROGRESS_BYTES) return { ...result, status: 'oversized' };
    const buffer = Buffer.alloc(MAX_PROGRESS_BYTES + 1);
    let used = 0, n;
    while (used < buffer.length && (n = fs.readSync(fd, buffer, used, buffer.length - used, null))) used += n;
    if (used > MAX_PROGRESS_BYTES) return { ...result, status: 'oversized' };
    let receipt;
    try { receipt = JSON.parse(buffer.subarray(0, used).toString('utf8')); }
    catch { return { ...result, status: 'malformed' }; }
    const d = receipt?.diagnostics;
    if (receipt?.kind !== 'responsive-diagnostic-progress' || receipt.engine !== engine || receipt.name !== name
      || !d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.events)) {
      return { ...result, status: 'invalid-schema' };
    }
    const events = d.events.slice(-32).filter(row => row && types.has(row.type))
      .map(row => ({ type: row.type, ms: count(row.ms),
        ...(row.type === 'stage-complete' ? { phase: phase(row.detail) } : {}),
        ...(['operation-before', 'operation-after'].includes(row.type) ? { operation: responsiveOperationId(row.detail) } : {}) }));
    return { ...result, status: 'available', lastCompletedStage: phase(d.lastCompletedStage),
      pendingOperation: responsiveOperationId(d.pendingOperation),
      pageUnavailable: d.pageUnavailable === true, droppedEvents: count(d.droppedEvents),
      errorSummary: d.firstError == null ? null : {
        present: true, name: errorNames.has(d.firstError?.name) ? d.firstError.name : 'OtherError',
        messageOmitted: true, stackOmitted: true }, events };
  } catch (error) {
    return { ...result, status: error?.code === 'ENOENT' ? 'missing' : 'unreadable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function emitFailedResponsiveProgress(ok, identity, write = text => process.stdout.write(text)) {
  if (ok) return;
  // Observability failure must not replace the original child or assertion error.
  try { write(JSON.stringify(responsiveProgressSummary(identity)) + '\n'); } catch {}
}

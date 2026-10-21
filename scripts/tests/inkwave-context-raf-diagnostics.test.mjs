import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs', import.meta.url), 'utf8');
// Execute only the harness observation block with controlled browser primitives.
// This is not native-browser, GPU or gameplay acceptance.
const start = source.indexOf('  // Exercise the final installed platform driver');
const end = source.indexOf('  check(Object.values(receipt.identities)', start);
assert(start > 0 && end > start);
const block = source.slice(start, end);
function fixture({ snapshotThrows = false, platformThrows = false } = {}) {
  let now = 0, nextId = 0, timeout, timeoutMs, cleared = false;
  const pending = new Map(), cancelled = [], receipt = {};
  const grid = new Uint8Array([0, 1]), counts = [1, 1], match = {};
  const paint = { grid, counts };
  const overlay = { getAttribute: () => 'alertdialog', isConnected: true, querySelectorAll: () => [1], textContent: 'Reload' };
  const platform = { frame: { pendingRAF: true, running: true } };
  const g = { R: { _contextRecoveryOverlay: overlay, _contextLost: true }, frozen: false,
    platform: { snapshot: () => { if (platformThrows) throw Error('diagnostic unavailable'); return platform; } } };
  const context = { receipt, g, G: { match, paint }, paint, matchIdentity: match, paintIdentity: paint,
    grid, savedGrid: grid.slice(), counts, overlay, gl: { isContextLost: () => false }, startResult: false, attractResult: false,
    snapshot: () => { if (snapshotThrows) throw Error('snapshot unavailable'); return { time: 42, paused: true }; },
    performance: { now: () => now }, document: { hidden: false, visibilityState: 'visible', hasFocus: () => true, querySelectorAll: () => [overlay] },
    setTimeout: (fn, ms) => { timeout = fn; timeoutMs = ms; return 1; }, clearTimeout: () => { cleared = true; },
    requestAnimationFrame: fn => { pending.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: id => { cancelled.push(id); pending.delete(id); } };
  const promise = vm.runInNewContext(`(async () => {${block}})()`, context);
  return { receipt, pending, cancelled, promise, platform,
    tick() { const [id, fn] = pending.entries().next().value; pending.delete(id); now += 16; fn(now); },
    expire() { now = 45000; timeout(); }, get timeoutMs() { return timeoutMs; }, get cleared() { return cleared; } };
}
for (const callbacks of [0, 17]) test(`timeout preserves ${callbacks} callbacks and post-attempt evidence, but rejects`, async () => {
  const f = fixture(); assert.equal(f.timeoutMs, 45000);
  for (let i = 0; i < callbacks; i++) f.tick();
  const rejection = assert.rejects(f.promise, /Native RAF observation did not complete/);
  f.expire(); await rejection;
  const r = f.receipt, o = r.rafObservation;
  assert.equal(o.status, 'timed-out'); assert.equal(o.callbacks, callbacks); assert.equal(o.timestamps.length, callbacks);
  assert.equal(o.startedAt, 0); assert.equal(o.elapsed, 45000); assert.equal(o.after.at, 45000);
  assert.equal(o.before.visibilityState, 'visible'); assert.equal(o.after.hidden, false); assert.equal(o.after.hasFocus, true);
  assert.equal(o.before.platform, f.platform); assert.equal(o.after.platform, f.platform);
  assert.equal(r.afterResumeAttempts.time, 42); assert(Object.values(r.identities).every(Boolean));
  assert.equal(r.terminal.observedRAF, callbacks); assert.equal(r.terminal.directFrames, 60);
  assert.equal(r.dialog.count, 1); assert.equal(f.cancelled.length, 1); assert.equal(f.pending.size, 0);
});
test('success still requires exactly 120 callbacks and clears timeout', async () => {
  const f = fixture();
  for (let i = 0; i < 119; i++) f.tick();
  assert.equal(f.receipt.rafObservation.status, 'pending'); assert.equal(f.cleared, false);
  f.tick(); await f.promise;
  assert.equal(f.receipt.rafObservation.status, 'complete'); assert.equal(f.receipt.terminal.observedRAF, 120);
  assert.equal(f.receipt.rafObservation.timestamps.length, 120); assert.equal(f.cleared, true); assert.equal(f.pending.size, 0);
});
test('diagnostic snapshot failures cannot hide the timeout', async () => {
  const f = fixture({ snapshotThrows: true, platformThrows: true });
  const rejection = assert.rejects(f.promise, /Native RAF observation did not complete/);
  f.expire(); await rejection;
  assert.match(f.receipt.postAttemptDiagnosticError, /snapshot unavailable/);
  assert.match(f.receipt.rafObservation.after.platformError, /diagnostic unavailable/);
});
test('successful observation cannot hide post-attempt snapshot failure', async () => {
  const f = fixture({ snapshotThrows: true });
  const rejection = assert.rejects(f.promise, /snapshot unavailable/);
  for (let i = 0; i < 120; i++) f.tick();
  await rejection;
});
test('terminal successful-path assertions and receipt validator remain strict', () => {
  assert.match(source, /assert\.equal\(receipt\.terminal\.observedRAF, 120\)/);
  assert.match(source, /check\(Object\.values\(receipt\.identities\)\.every\(Boolean\)/);
  assert.match(source, /check\(receipt\.afterResumeAttempts\[key\] === receipt\.lost\[key\]/);
  assert.match(source, /mark\('terminal-restart-rejected'\)/);
});

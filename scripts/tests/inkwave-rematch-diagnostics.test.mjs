import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boundedDiagnostic, captureRecordedFocusFailure, createFocusHistory, createOperationTrace } from '../lib/inkwave-rematch-diagnostics.mjs';

test('operation trace preserves returned values and the exact original input error without retry', async () => {
  let now = 0, calls = 0;
  const trace = createOperationTrace(2, () => now);
  const value = {};
  assert.equal(await trace.run('success', () => { now = 7; return value; }), value);
  assert.equal(trace.entries[0].elapsedMs, 7);
  const error = new Error('original touch dispatch timeout');
  await assert.rejects(trace.run('tap', () => { calls++; now = 37; throw error; }), e => e === error);
  assert.equal(calls, 1);
  assert.equal(trace.entries[1].status, 'failed');
  assert.equal(trace.entries[1].elapsedMs, 30);
  assert.equal(trace.entries[1].error, error.message);
  await trace.run('last', () => null);
  assert.deepEqual(trace.entries.map(e => e.name), ['tap', 'last']);
});

test('read-only failure probes report success, rejection and a hung browser within their own budget', async () => {
  assert.deepEqual(await boundedDiagnostic(() => ({ menu: 'main' })), { status: 'captured', value: { menu: 'main' } });
  assert.deepEqual(await boundedDiagnostic(() => { throw new Error('closed'); }), { status: 'unavailable', error: 'closed' });
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  assert.deepEqual(await boundedDiagnostic(() => pending, 5), { status: 'timed-out', timeoutMs: 5 });
  reject(new Error('late browser failure'));
  await new Promise(resolve => setImmediate(resolve));
});

test('lifecycle diagnostics keep real tap timeout and original assertions and save failure before probing', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs', import.meta.url), 'utf8');
  const tapBody = source.slice(source.indexOf('const tap = async'), source.indexOf('const menuIs ='));
  assert.match(tapBody, /operationTrace\.run\('touch: ' \+ id/);
  assert.match(tapBody, /page\.locator\(sel\)\.tap\(\{ timeout: 120000 \}\)/);
  assert.equal((tapBody.match(/\.tap\(/g) || []).length, 1, 'dispatch one real gesture');
  assert.doesNotMatch(tapBody, /force:|\.click\(/, 'native actionability and stable positioning remain required');
  assert.match(source, /rangeRound\.simulated\.state === 'playing' && !rangeRound\.simulated\.result && rangeRound\.simulated\.menu === null/);
  assert.match(source, /after\.range === false && after\.hudRange === false && \(after\.timer === '3:00' \|\| after\.timer === '2:59'\) && Number\.isFinite\(after\.time\)/);
  const catchBlock = source.slice(source.lastIndexOf('} catch (e) {'));
  assert.ok(catchBlock.indexOf('writeResult();') < catchBlock.indexOf('boundedDiagnostic(snap)'));
  assert.match(catchBlock, /failures\.push\(\{ round: 'fatal', message: String\(e\?\.stack \|\| e\)\.slice\(0, 2000\) \}\)/);
  assert.match(source, /activeRound = rangeRound;[\s\S]+rangeRound\.start = await snap/);
  assert.doesNotMatch(catchBlock, /page\.tap|\.click\(/);
});


test('focus history bounds existing observations and retains animation and frame evidence', () => {
  const trace = createFocusHistory(2);
  const ring = { opacity: '0', animations: [{ pending: true, startTime: null, currentTime: 0 }] };
  const document = { timelineTime: 100, visibilityState: 'visible' };
  const frameDriver = { main: { frameN: 7 } };
  const snapshot = { ringOn: true, ringVisible: false, ringOnFocus: true, focusConnected: true,
    uiDiagnostics: { focus: { menuId: 'play' }, menuInputOwner: 'touch', ring, document, frameDriver } };
  for (let i = 1; i <= 3; i++) trace.record(snapshot, i * 1000, i === 3 ? 'timeout' : 'frame');
  assert.equal(trace.history.sampleCount, 3);
  assert.deepEqual(trace.history.samples.map(s => s.elapsedMs), [2000, 3000]);
  assert.deepEqual(trace.history.samples.at(-1), { elapsedMs: 3000, frameWait: 'timeout',
    ringOn: true, ringVisible: false, ringOnFocus: true, focusConnected: true, focus: 'play',
    menuInputOwner: 'touch', ring, document, frameDriver, compositorState: null });
  assert.equal(snapshot.focusHistory, undefined, 'recording does not mutate the input snapshot');
});

test('post-assertion screenshot recovery never replaces or clears the persisted original failure', async () => {
  const failure = Object.freeze({ round: 3, message: 'strict visibility failed', detail: Object.freeze({ ringVisible: false }) });
  const failures = [failure], diagnostic = { originalFailure: failure }, saved = [];
  let reads = 0;
  await captureRecordedFocusFailure(diagnostic, {
    persist: () => saved.push(JSON.parse(JSON.stringify({ failures, diagnostic }))),
    screenshot: () => { assert.equal(saved.length, 1); assert.equal(saved[0].failures[0].detail.ringVisible, false); return 'failure.png'; },
    snapshot: () => { reads++; return { ringVisible: true }; },
  });
  assert.equal(reads, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0], failure);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].failures[0].detail.ringVisible, false);
  assert.equal(diagnostic.afterReadback.value.ringVisible, true, 'recovery is labeled separately');
  assert.deepEqual(diagnostic.screenshot, { status: 'captured', value: 'failure.png' });
});

test('failed or stalled post-assertion diagnostics remain bounded and preserve failure', async () => {
  const failure = Object.freeze({ message: 'original' }), diagnostic = { originalFailure: failure };
  let saved = 0;
  await captureRecordedFocusFailure(diagnostic, {
    persist: () => { saved++; }, screenshot: () => new Promise(() => {}),
    snapshot: () => { throw new Error('renderer closed'); }, timeoutMs: 5,
  });
  assert.equal(saved, 2);
  assert.equal(diagnostic.originalFailure, failure);
  assert.deepEqual(diagnostic.screenshot, { status: 'timed-out', timeoutMs: 5 });
  assert.deepEqual(diagnostic.afterReadback, { status: 'unavailable', error: 'renderer closed' });
});

test('readback is called only after the unchanged failed touch or keyboard assertion is recorded', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs', import.meta.url), 'utf8');
  assert.match(source, /menu\.focusConnected === true && menu\.ringOn && menu\.ringVisible && menu\.ringOnFocus === true/);
  assert.match(source, /keyboardMenu\.ringOn && keyboardMenu\.ringVisible && keyboardMenu\.ringOnFocus === true/);
  assert.match(source, /'touch-owned main-menu button has its native visible focus-aligned selection ring', menu\);\s+if \(failures\.length > beforeTouchFocusCheck\) await diagnoseFocusFailure\(failures\.at\(-1\), 'touch'\)/);
  assert.match(source, /'keyboard handoff restores the selection ring on the focused item \(no pixel readback\)', keyboardMenu\);\s+if \(failures\.length > beforeKeyboardFocusCheck\) await diagnoseFocusFailure\(failures\.at\(-1\), 'keyboard'\)/);
  const poll = source.slice(source.indexOf('const waitForFocusFrame ='), source.indexOf('const check ='));
  assert.doesNotMatch(poll, /screenshot|diagnoseFocusFailure|\.style|cancel\(|finish\(/);
  assert.match(source, /status = failures\.length \|\| errors\.length \? 'failed' : 'passed'/);
});

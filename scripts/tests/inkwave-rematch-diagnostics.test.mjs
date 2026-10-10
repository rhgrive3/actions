import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boundedDiagnostic, createOperationTrace } from '../lib/inkwave-rematch-diagnostics.mjs';

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
  assert.match(source, /operationTrace\.run\('tap: ' \+ id, \(\) => page\.tap\(sel, \{ timeout: 30000 \}\)\)/);
  assert.match(source, /rangeRound\.simulated\.state === 'playing' && !rangeRound\.simulated\.result && rangeRound\.simulated\.menu === null/);
  assert.match(source, /after\.range === false && after\.hudRange === false && \(after\.timer === '3:00' \|\| after\.timer === '2:59'\) && Number\.isFinite\(after\.time\)/);
  const catchBlock = source.slice(source.lastIndexOf('} catch (e) {'));
  assert.ok(catchBlock.indexOf('writeResult();') < catchBlock.indexOf('boundedDiagnostic(snap)'));
  assert.match(catchBlock, /failures\.push\(\{ round: 'fatal', message: String\(e\?\.stack \|\| e\)\.slice\(0, 2000\) \}\)/);
  assert.match(source, /activeRound = rangeRound;[\s\S]+rangeRound\.start = await snap/);
  assert.doesNotMatch(catchBlock, /page\.tap|\.click\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRematchCompositorTrace, REMATCH_TRACE_CONFIG } from '../lib/inkwave-rematch-compositor-trace.mjs';

class Session extends EventEmitter {
  calls = [];
  chunks = [{ data: JSON.stringify({ traceEvents: [{ name: 'BeginMainFrame' }] }), eof: true }];
  async send(name, args) {
    this.calls.push([name, args]);
    if (name === 'Tracing.end') this.emit('Tracing.tracingComplete', { stream: 'trace-1', dataLossOccurred: false });
    if (name === 'IO.read') return this.chunks.shift();
    return {};
  }
}
const rig = (session = new Session(), options = {}) => {
  const writes = [];
  const trace = createRematchCompositorTrace(session, (round, body) => {
    writes.push({ round, body }); return { filename: `${round}.json` };
  }, options);
  return { trace, writes, session };
};

test('bounded trace is opt-in observation and stores complete JSON only after stop', async () => {
  const { trace, writes, session } = rig();
  await trace.start(1);
  assert.equal(writes.length, 0);
  assert.equal(trace.entries[0].status, 'recording');
  assert.deepEqual(session.calls[0], ['Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json',
    streamCompression: 'none', traceConfig: REMATCH_TRACE_CONFIG }]);
  assert.equal(REMATCH_TRACE_CONFIG.recordMode, 'recordUntilFull');
  assert.equal(REMATCH_TRACE_CONFIG.traceBufferSizeInKb, 16384);
  assert.equal(REMATCH_TRACE_CONFIG.syntheticDelays, undefined);
  await trace.stop();
  assert.equal(writes.length, 1);
  assert.equal(trace.entries[0].status, 'captured');
  assert.equal(trace.entries[0].eventCount, 1);
  assert.equal(trace.entries[0].bytes, writes[0].body.length);
  assert.deepEqual(session.calls.map(c => c[0]), ['Tracing.start', 'Tracing.end', 'IO.read', 'IO.close']);
  assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
});

test('mixed base64/plain stream chunks and known trace loss remain explicit', async () => {
  const { trace, session, writes } = rig();
  const send = session.send.bind(session);
  session.send = async (name, args) => {
    if (name === 'Tracing.end') { session.emit('Tracing.tracingComplete', { stream: 'trace', dataLossOccurred: true }); return {}; }
    return send(name, args);
  };
  session.chunks = [{ data: Buffer.from('{"traceEvents":').toString('base64'), base64Encoded: true }, { data: '[]}', eof: true }];
  await trace.start(2); await trace.stop();
  assert.equal(trace.entries[0].dataLossOccurred, true);
  assert.equal(trace.entries[0].eventCount, 0);
  assert.equal(writes[0].body.toString(), '{"traceEvents":[]}');
});

test('oversize and malformed streams fail without writing misleading artifacts', async () => {
  for (const [chunks, options, expected] of [
    [[{ data: '{"traceEvents":[]}', eof: true }], { maxBytes: 4 }, /exceeds 4/],
    [[{ data: 'invalid', eof: true }], {}, /JSON|Unexpected/],
    [[{ data: '{}', eof: true }], {}, /no traceEvents/],
  ]) {
    const { trace, session, writes } = rig(new Session(), options); session.chunks = chunks;
    await trace.start(1); await trace.stop();
    assert.equal(trace.entries[0].status, 'unavailable'); assert.match(trace.entries[0].error, expected);
    assert.equal(writes.length, 0); assert.ok(session.calls.some(c => c[0] === 'IO.close'));
  }
});

test('a stalled trace completion is bounded and cannot start an overlapping second trace', async () => {
  const { trace, session, writes } = rig(new Session(), { timeoutMs: 5 });
  const send = session.send.bind(session);
  session.send = async (name, args) => name === 'Tracing.end' ? {} : send(name, args);
  await trace.start(1); await trace.stop(); await trace.start(2);
  assert.equal(trace.entries[0].status, 'unavailable'); assert.match(trace.entries[0].error, /exceeded 5 ms/);
  assert.match(trace.entries[1].error, /prior trace failed/);
  assert.equal(session.calls.filter(c => c[0] === 'Tracing.start').length, 1);
  assert.equal(writes.length, 0); assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
});

test('late stream resolution after the deadline cannot write or mutate a captured result', async () => {
  const { trace, session, writes } = rig(new Session(), { timeoutMs: 5 });
  const send = session.send.bind(session); let resolve;
  session.send = async (name, args) => name === 'IO.read' ? new Promise(r => { resolve = r; }) : send(name, args);
  await trace.start(1); await trace.stop();
  const receipt = JSON.stringify(trace.entries);
  resolve({ data: '{"traceEvents":[]}', eof: true });
  await new Promise(r => setImmediate(r));
  assert.equal(writes.length, 0); assert.equal(JSON.stringify(trace.entries), receipt);
  assert.ok(session.calls.some(c => c[0] === 'IO.close'));
});

test('start rejection and stalled IO close remain unavailable rather than hanging the verifier', async () => {
  for (const blocked of ['Tracing.start', 'IO.close']) {
    const { trace, session, writes } = rig(new Session(), { timeoutMs: 5 }); const send = session.send.bind(session);
    session.send = async (name, args) => name === blocked ? new Promise(() => {}) : send(name, args);
    await trace.start(1); await trace.stop();
    assert.equal(trace.entries[0].status, 'unavailable'); assert.match(trace.entries[0].error, /exceeded 5 ms/);
    assert.equal(writes.length, 0);
  }
});

test('stream read failure, missing stream and artifact write failure retain concrete errors', async () => {
  for (const mode of ['read', 'missing', 'write']) {
    const session = new Session(), send = session.send.bind(session);
    session.send = async (name, args) => {
      if (mode === 'read' && name === 'IO.read') throw new Error('read failed');
      if (mode === 'missing' && name === 'Tracing.end') { session.emit('Tracing.tracingComplete', {}); return {}; }
      return send(name, args);
    };
    const trace = createRematchCompositorTrace(session, () => { throw new Error('write failed'); });
    await trace.start(1); await trace.stop();
    assert.equal(trace.entries[0].status, 'unavailable');
    assert.match(trace.entries[0].error, mode === 'missing' ? /without a stream/ : new RegExp(`${mode} failed`));
  }
});

test('diagnostic source preserves strict gates and records them before trace readback', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs', import.meta.url), 'utf8');
  const poll = source.slice(source.indexOf('const waitForFocusFrame ='), source.indexOf('const check ='));
  assert.doesNotMatch(poll, /compositorTrace|CDP|screenshot|\.finish\(|\.cancel\(/);
  assert.match(source, /const traceFocus = process\.argv\.includes\('--trace-focus'\)/);
  assert.match(source, /if \(compositorTrace\) await compositorTrace\.start\(i \+ 1\);\s+await tap\('home'\)/);
  const end = source.indexOf('// Both strict results are stored');
  assert.ok(source.indexOf("'touch-owned main-menu button has its native visible focus-aligned selection ring'") < end);
  assert.ok(source.indexOf("'keyboard handoff restores the selection ring") < end);
  assert.match(source.slice(end), /writeResult\(\); await compositorTrace\.stop\(\); writeResult\(\)/);
  assert.match(source, /if \(traceEnabled\) \{[\s\S]+hasFocus: document\.hasFocus\(\)/);
  assert.doesNotMatch(source, /setCPUThrottlingRate|\.finish\(|\.currentTime\s*=/);
  const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('  render-diagnostic:'), workflow.indexOf('  seven_claims:'));
  assert.match(job, /if: inputs\.diagnostic_only == true/);
  assert.match(job, /if: inputs\.diagnostic_target == 'rematch'/);
  // The second diagnostic uses bounded native-call records instead of the
  // first run's high-volume CDP trace, which overflowed in every window.
  assert.match(job, /--cycles 3 --profile-render-calls/);
  assert.doesNotMatch(job, /--trace-focus/);
});

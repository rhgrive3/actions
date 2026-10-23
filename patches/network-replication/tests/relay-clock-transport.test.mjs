import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture as networkFixture } from '../../reliability/tests/net-fixture.mjs';

async function fixture() {
  const f = await networkFixture(), tr = new f.Transport();
  const connect = async modern => {
    const pending = tr.connect('BCEFG', 'test', true), ws = f.sockets.at(-1);
    assert.equal(new URL(ws.url).searchParams.get('relayClock'), '1');
    ws.receive = data => f.message(ws, data);
    ws.receive(JSON.stringify({ t: 'welcome', proto: f.PROTO, compat: f.COMPAT,
      id: 'B', host: 'B', members: [{id: 'B', name: 'test'}], ...(modern ? { relayClock: 1 } : {}) }));
    await pending; return ws;
  };
  return { tr, connect };
}

test('only negotiated relay envelopes expose a sender-scoped receipt during dispatch', async () => {
  const { tr, connect } = await fixture(), ws = await connect(true), got = [];
  tr.onMessage = (from, data) => {
    got.push([from, data.ts, tr.relayReceipt(from), tr.relayReceipt('someone-else')]);
    if (data.ts === 1) {
      ws.receive('m|nested|@1700000000001|{"ts":2}');
      assert.equal(tr.relayReceipt(from), 1700000000000, 'nested dispatch restores the outer receipt');
    }
  };
  ws.receive('m|A|@1700000000000|{"ts":1,"relayAt":9999}');
  assert.deepEqual(got, [['A', 1, 1700000000000, null], ['nested', 2, 1700000000001, null]]);
  assert.equal(tr.relayReceipt('A'), null);
  for (const token of ['', '-1', 'NaN', '1.2', '9007199254740992', '17000000000000000']) ws.receive(`m|A|@${token}|{"ts":3}`);
  ws.receive('m|A|@1700000000000');
  assert.equal(got.length, 2, 'malformed relay timestamps cannot reach gameplay');
  ws.receive('m|A|{"ts":4,"relayAt":1700000000000}');
  assert.deepEqual(got.at(-1), ['A', 4, null, null], 'JSON cannot impersonate transport metadata');
  tr.onMessage = () => { throw new Error('dispatch failed'); };
  assert.throws(() => ws.receive('m|A|@1700000000000|{}'), /dispatch failed/);
  assert.equal(tr.relayReceipt('A'), null, 'exceptions cannot leak the receipt to subsequent messages');
  tr.close();
});

test('legacy relays and retired connections cannot inject stamped receipts', async () => {
  const { tr, connect } = await fixture(), old = await connect(true), retired = old.onmessage, got = [];
  tr.onMessage = (from, data) => got.push([from, data.ts, tr.relayReceipt(from)]);
  tr.close();
  const legacy = await connect(false);
  retired({ data: 'm|A|@1700000000000|{"ts":1}' });
  legacy.receive('m|A|@1700000000000|{"ts":2}');
  assert.deepEqual(got, []);
  legacy.receive('m|A|{"ts":3}');
  assert.deepEqual(got, [['A', 3, null]]);
  tr.close();
});

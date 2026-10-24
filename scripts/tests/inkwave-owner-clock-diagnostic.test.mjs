import {assertSourceRemainderCoverage} from '../run-inkwave-source-remainder.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installOwnerClockDiagnostic, readOwnerClockDiagnostic } from '../lib/inkwave-owner-clock-diagnostic.mjs';

async function fixture({ throwEmit = false } = {}) {
  let at = 92.3055;
  const rows = [];
  class Native {
    constructor() { this.match = {}; this.peers = new Map(); this.byNid = new Map(); this.calls = 0; }
    _tick(from, d) {
      this.calls++;
      if (d.fail) throw Error('native failure');
      const previous = this.peers.get(from);
      if (this.match && (!previous || d.ts > previous.lastTs && d.ts - previous.lastTs <= at - previous.lastReceiveAt + 5))
        this.peers.set(from, { lastTs: d.ts, lastReceiveAt: at });
      return d.returnValue;
    }
    onMessage(from, d) { return d.k === 't' ? this._tick(from, d) : d.returnValue; }
  }
  assert.equal(await installOwnerClockDiagnostic(Native, { now: () => at, emit: row => { if (throwEmit) throw Error('output failure'); rows.push(row); } }), true);
  assert.equal(await installOwnerClockDiagnostic(Native), false, 'observer cannot double-wrap');
  return { n: new Native(), rows, set(t) { at = t; } };
}

test('receiver diagnostic retains exact before/after clock pair and does not repair known #1767 rejection', async () => {
  const f = await fixture(), result = {};
  const initial = { k: 't', ts: 124.04, u: 1400, returnValue: result, secret: 'never record' };
  assert.equal(f.n.onMessage('private-owner', initial), result);
  assert.equal(f.rows[0].accepted, true);
  f.set(129.6118);
  assert.equal(f.n.onMessage('private-owner', { k: 't', ts: 175.665, u: 1688, returnValue: result }), result);
  assert.equal(f.n.peers.get('private-owner').lastTs, 124.04);
  const last = f.rows.at(-1);
  assert.equal(last.previousTs, 124.04); assert.equal(last.previousReceivedAt, 92.3055);
  assert.equal(last.senderTs, 175.665); assert.equal(last.receivedAt, 129.6118);
  assert.equal(last.tickEntered, true); assert.equal(last.accepted, false);
  assert.equal(f.n.calls, 2); assert.equal(initial.secret, 'never record');
  assert(!JSON.stringify(f.rows).includes('private-owner')); assert(!JSON.stringify(f.rows).includes('never record'));
});

test('observer preserves native exceptions/returns and cannot change result if console output fails', async () => {
  for (const throwEmit of [false, true]) {
    const f = await fixture({ throwEmit });
    assert.equal(f.n.onMessage('p', { k: 't', ts: 1, returnValue: 42 }), 42);
    assert.throws(() => f.n.onMessage('p', { k: 't', ts: 2, fail: true }), /native failure/);
    assert.equal(f.n.calls, 2);
    assert.equal(f.n.onMessage('p', { k: 'unobserved', returnValue: 99 }), 99);
  }
});

test('diagnostic bounds output and never logs nonce or arbitrary message fields', async () => {
  const f = await fixture();
  for (let i = 0; i < 4096; i++) {
    f.set(92.3055 + i / 60);
    f.n.onMessage('owner', { k: 't', ts: i / 60, u: i });
    f.n.onMessage('owner', { k: i % 2 ? 'ocq' : 'oca', ts: i, n: 'secret nonce', m: 'private match' });
  }
  assert(f.rows.length <= 96); assert.equal(f.n.calls, 4096);
  assert(!JSON.stringify(f.rows).includes('secret nonce')); assert(!JSON.stringify(f.rows).includes('private match'));
  assert(f.rows.some(row => row.kind === 'ocq'));
  assert(f.rows.some(row => row.kind === 'oca'));
});

test('host parser discards extra payload, nonfinite values and unknown labels', () => {
  const parse = row => readOwnerClockDiagnostic('IW_OWNER_CLOCK_DIAGNOSTIC:' + JSON.stringify(row));
  assert.equal(parse({ schema: 1, kind: 'secret' }), null);
  assert.equal(readOwnerClockDiagnostic('IW_OWNER_CLOCK_DIAGNOSTIC:invalid'), null);
  assert.equal(readOwnerClockDiagnostic('IW_OWNER_CLOCK_DIAGNOSTIC:' + 'x'.repeat(4096)), null);
  const parsed = parse({ schema: 1, kind: 't', senderTs: 'secret', previousTs: Infinity, owner: 'private',
    actors: [{ sequence: 7, tick: 1400, spawn: 'secret', owner: 'private' }] });
  assert.equal(parsed.senderTs, null); assert.equal(parsed.previousTs, null);
  assert.equal(parsed.actors[0].sequence, 7); assert.equal(parsed.actors[0].spawn, null);
  assert(!JSON.stringify(parsed).includes('private')); assert(!JSON.stringify(parsed).includes('secret'));
});

test('browser installs observation before room startup and never changes existing readiness gates', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs', import.meta.url), 'utf8');
  assert(source.indexOf('page.evaluate(installOwnerClockDiagnostic,netmatchURL)') < source.indexOf("report.phase='native-room-start'"));
  assert(source.includes('report.clockReceipts[i].length<96'));
  assert(source.includes("if(__G.time-start>10)throw Error('Native opening spawn did not settle within 10 game seconds: '+JSON.stringify("));
  assert(source.includes('if(__ceilingPlacement.spawnReady())return true;'));
});

test('source and both network CI routes discover the new clock and diagnostic regressions', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
  assertSourceRemainderCoverage(workflow,'network');
  for (const file of ['owner-clock-origin', 'owner-clock-platform', 'owner-clock-opening-adoption', 'issue-1767-startup-clock', 'issue-1767-session-clock'])
    assert.equal(workflow.split('patches/network-replication/tests/' + file + '.test.mjs').length - 1, 2, file + ' must run in matrix-network and focused-network routes');
  assert.equal(workflow.split('scripts/tests/inkwave-owner-clock-diagnostic.test.mjs').length - 1, 3, 'source, matrix-network and focused-network diagnostic routes');
});

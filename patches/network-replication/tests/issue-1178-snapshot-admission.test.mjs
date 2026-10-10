// #1178: authenticated owner identity is not enough for interpolation safety.
// Execute the real composed NetMatch receive/interpolation path, not a hand-coded
// copy of Hermite. Invalid rows must not reserve the next legal owner sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('#1178 malformed owner rows never enter the remote path and a valid next row recovers', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [remote]);
  const emit = (ts, row) => f.tick(nm, 'p2', ts, { a: [row] });
  emit(1000.05, f.packActor(remote, { x: 4, vx: 1 }));
  assert.equal(remote.net.buf.length, 1);
  const corrupt = [
    s => { s[4] = 'bad'; },      // string Hermite tangent
    s => { s[1] = null; },       // coercive null coordinate
    s => { s[1] = 1e308; },      // finite JS number, unsafe squares/product
    s => { s[8] = Infinity; },   // nonfinite aim
    s => { s[10] = 2 ** 50; },   // impossible flags
    s => { s[13] = NaN; },      // nonfinite Special
    s => { s.length = 9; },     // truncated numeric actor array
  ];
  corrupt.forEach((change, i) => {
    const row = f.packActor(remote, { x: 4.5 + i / 10, vx: 2 });
    change(row);
    emit(1000.10 + i * .05, row);
    assert.equal(remote.net.buf.length, 1, 'malformed row entered buffer case ' + i);
  });
  emit(1000.55, f.packActor(remote, { x: 6, vx: 2 }));
  assert.equal(remote.net.buf.length, 2, 'next valid owner snapshot was not accepted');
  for (let i = 0; i < 12; i++) {
    f.clock.advance(1 / 60);
    nm.update(1 / 60);
    nm.applyRemote(remote, 1 / 60);
    assert.ok([remote.pos.x,remote.pos.y,remote.pos.z,remote.vel.x,remote.vel.y,remote.vel.z]
      .every(Number.isFinite), 'nonfinite coordinates escaped into actor transform');
  }
});

test('#1178 one invalid actor row cannot starve a different legal owner in the same tick', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const a = f.makeActor({ nid: 3, owner: 'p2', remote: true });
  const b = f.makeActor({ nid: 4, owner: 'p2', remote: true });
  f.bind(nm, [a,b]);
  const bad = f.packActor(a); bad[5] = 'oops';
  f.tick(nm, 'p2', 1000.05, { a: [bad, f.packActor(b, { x: 8 })] });
  assert.equal(a.net.buf.length, 0);
  assert.equal(b.net.buf.length, 1);
});

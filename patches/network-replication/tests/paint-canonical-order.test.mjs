// #365 / #369 — one canonical room-wide order for paint ownership.
//
// Paint writes are not commutative ("newest applied splat wins"), so with one
// client applying its own splat immediately and replaying remote splats later,
// two overlapping opposing splats used to end on opposite teams. These checks
// drive the shipped PaintSystem through the real build-time adapter chain and
// the real NetMatch receive path; only the GL device and the clock are stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const CENTER = [0, 0, 0];
const RADIUS = 1.2;

// The wire shape `_rec()` produces: [ts,'s',x,y,z,radius,team,seed,kind,stx,sty,stz,stAmt,tick,seq]
function splatPacket({ tick, seq, team, radius = RADIUS, x = 0, y = 0, z = 0, seed = 0.42, sentAt }) {
  return [sentAt ?? tick - 0.25, 's', x, y, z, radius, team, seed, 0, 0, 0, 0, 0, tick, seq];
}

async function receiver(f, myId, peers) {
  const paint = f.makePaint();
  const nm = f.makeNetMatch(f.makeSession(myId, peers[0][0], [[myId, 'Me'], ...peers]));
  f.bind(nm, []);
  return { paint, nm };
}

// An event is replayed only once the peer's owner-simulation clock has reached
// its tick, which needs the sender's stream to have moved on a little. Each
// delivery therefore hands over the event and then keeps the peer clock ticking,
// the same thing a live connection does.
async function deliver(nm, from, tick, events) {
  nm.onMessage(from, { k: 't', ts: tick, r: 2, u: tick, e: events });
  for (let n = 1; n <= 4; n++) {
    nm.update(1 / 60);
    const ts = tick + n / 60;
    nm.onMessage(from, { k: 't', ts, r: 2, u: Math.round(ts) });
  }
  for (let n = 0; n < 10; n++) nm.update(1 / 60);
}

// Replayed splats always spread through the growth list, so let the growth pass
// finish before reading what actually reached the atlas.
function settle(paint, frames = 40) {
  for (let n = 0; n < frames; n++) paint.flush(1 / 60);
}

function cellAt(paint, u, v) {
  const f = paint.paintFaces[0];
  const i = Math.min(f.nu - 1, Math.max(0, Math.floor(u / f.cu)));
  const j = Math.min(f.nv - 1, Math.max(0, Math.floor(v / f.cv)));
  return f.grid + j * f.nu + i;
}

function hash(paint) {
  let h = 0x811c9dc5;
  for (let k = 0; k < paint.grid.length; k++) {
    h = (Math.imul(h ^ paint.grid[k], 0x01000193) >>> 0);
    h = (Math.imul(h ^ (paint.gridOrder[k] | 0), 0x01000193) >>> 0);
  }
  return h >>> 0;
}

function centreOwner(paint) {
  return paint.grid[cellAt(paint, 0, 0)];
}

test('negative baseline control: without canonical order the same two splats diverge by arrival order', async () => {
  const f = await fixture({ network: false });
  assert.equal(f.network, false, 'baseline runs the unpatched paint source');

  const a = f.makePaint();
  const grid = Array.from(a.grid);
  a.splat(new f.THREE.Vector3(...CENTER), RADIUS, 0, { instant: true });
  const forward = Array.from(a.grid);
  a.clear();
  a.splat(new f.THREE.Vector3(...CENTER), RADIUS, 1, { instant: true });
  a.splat(new f.THREE.Vector3(...CENTER), RADIUS, 0, { instant: true });
  const reversed = Array.from(a.grid);

  assert.notDeepEqual(forward, reversed, 'baseline control confirms order-dependent ownership');
  assert.deepEqual(grid, new Array(grid.length).fill(0), 'baseline starts from an empty grid');
});

test('two clients with simultaneous opposing splats converge on the same ownership and coverage (#365, #369)', async () => {
  const peers = [['p1', 'P1'], ['p2', 'P2']];

  const fa = await fixture();
  fa.clock.set(100);
  const A = await receiver(fa, 'p1', peers);
  fa.G.time = 100 / 60;
  A.paint.splat(new fa.THREE.Vector3(...CENTER), RADIUS, 0, { instant: true, seed: 0.42 });
  const fromA = A.nm.out.filter((e) => e[1] === 's').map((e) => e.slice());

  const fb = await fixture();
  fb.clock.set(100);
  const B = await receiver(fb, 'p2', peers);
  fb.G.time = 100 / 60;
  B.paint.splat(new fb.THREE.Vector3(...CENTER), RADIUS, 1, { instant: true, seed: 0.42 });
  const fromB = B.nm.out.filter((e) => e[1] === 's').map((e) => e.slice());

  assert.equal(fromA.length, 1, 'origin A recorded exactly one paint packet (no double apply on echo)');
  assert.equal(fromB.length, 1, 'origin B recorded exactly one paint packet');
  assert.equal(fromA[0][fromA[0].length - 2], 100, 'origin stamped its own 60 Hz simulation tick');

  await deliver(A.nm, 'p2', 101, fromB);
  await deliver(B.nm, 'p1', 101, fromA);

  assert.equal(A.paint.grid.length, B.paint.grid.length);
  assert.deepEqual(Array.from(A.paint.grid), Array.from(B.paint.grid), 'CPU grid must be identical on both owners');
  assert.deepEqual(Array.from(A.paint.gridOrder), Array.from(B.paint.gridOrder), 'per-cell canonical order must match');
  assert.deepEqual([...A.paint.coverage()], [...B.paint.coverage()], 'coverage must match on both owners');
  assert.ok(A.paint.coverage()[0] + A.paint.coverage()[1] > 0, 'the contested cells were actually painted');

  // The GPU atlas is written by the last quad that survives; the CPU grid is the
  // authority, so the newest quad on each client must be the team the grid says
  // owns the overlap. Same rule, both clients.
  const quadTeam = (p) => p._netQuads[p._netQuads.length - 1].team + 1; // grid stores team + 1
  settle(A.paint);
  settle(B.paint);
  assert.equal(quadTeam(A.paint), centreOwner(A.paint), 'client A final GPU write matches the CPU owner');
  assert.equal(quadTeam(B.paint), centreOwner(B.paint), 'client B final GPU write matches the CPU owner');
  assert.equal(quadTeam(A.paint), quadTeam(B.paint), 'both clients end on the same GPU team');
});

test('reversed one-way lag and a third observer converge on the same grid (#365, #369)', async () => {
  const packets = [
    splatPacket({ tick: 200, seq: 1, team: 0, x: -0.4 }),
    splatPacket({ tick: 200, seq: 1, team: 1, x: 0.4 }),
  ];
  const forwardPeers = [['p1', 'P1'], ['p2', 'P2'], ['obs', 'Obs']];

  const run = async (order) => {
    const f = await fixture();
    const { paint, nm } = await receiver(f, 'obs', forwardPeers);
    let ts = 201;
    for (const id of order) {
      await deliver(nm, id, ts, [packets[id === 'p1' ? 0 : 1]]);
      ts += 1;
    }
    return { hash: hash(paint), grid: Array.from(paint.grid), coverage: [...paint.coverage()] };
  };

  const forward = await run(['p1', 'p2']);
  const reversed = await run(['p2', 'p1']);
  assert.equal(reversed.hash, forward.hash, 'an observer converges regardless of arrival order');
  assert.deepEqual(reversed.grid, forward.grid);
  assert.deepEqual(reversed.coverage, forward.coverage);
});

test('duplicate, replayed and late packets cannot rewrite canonically newer paint (#365, #369)', async () => {
  const f = await fixture();
  const { paint, nm } = await receiver(f, 'obs', [['p1', 'P1'], ['p2', 'P2']]);

  const fresh = splatPacket({ tick: 300, seq: 1, team: 0 });
  await deliver(nm, 'p1', 301, [fresh]);
  settle(paint);
  const owned = Array.from(paint.grid);
  const coverage = [...paint.coverage()];
  const order = Array.from(paint.gridOrder);
  const quads = paint._netQuads.length;
  assert.equal(centreOwner(paint), 1, 'team 0 owns the overlap after the fresh packet');

  // exact duplicate
  await deliver(nm, 'p1', 302, [fresh.slice()]);
  // replayed older sequence number
  await deliver(nm, 'p1', 303, [splatPacket({ tick: 299, seq: 1, team: 1 })]);
  // genuinely late packet from another sender, carrying an older canonical tick
  await deliver(nm, 'p2', 304, [splatPacket({ tick: 120, seq: 7, team: 1 })]);

  settle(paint);
  assert.deepEqual(Array.from(paint.grid), owned, 'no duplicate or late packet changed ownership');
  assert.deepEqual(Array.from(paint.gridOrder), order, 'no duplicate or late packet changed the canonical order');
  assert.deepEqual([...paint.coverage()], coverage, 'coverage is untouched');
  assert.equal(paint._netQuads.length, quads, 'a stale packet emitted no atlas quad, so GPU ink cannot contradict the grid');
});

test('a late packet stays suppressed after more than fifty intervening splats (#365, #369)', async () => {
  const f = await fixture();
  const { paint, nm } = await receiver(f, 'obs', [['p1', 'P1'], ['p2', 'P2']]);

  // 64 ordered splats from p1, far more than any bounded splat history could keep.
  let ts = 401;
  for (let n = 0; n < 64; n++) {
    await deliver(nm, 'p1', ts, [splatPacket({ tick: 400 + n, seq: n + 1, team: 0, x: (n % 8) * 0.2 - 0.7 })]);
    ts += 1;
  }
  const owned = Array.from(paint.grid);
  const order = Array.from(paint.gridOrder);
  const coverage = [...paint.coverage()];
  settle(paint);
  const quads = paint._netQuads.length;
  assert.ok(quads > 0, 'the 64 newer splats really did reach the atlas');

  // The old team-1 packet finally lands, long after its canonical position.
  await deliver(nm, 'p2', ts, [splatPacket({ tick: 150, seq: 3, team: 1 })]);
  ts += 1;
  settle(paint);

  assert.deepEqual(Array.from(paint.grid), owned, 'the very late packet changed no cell');
  assert.deepEqual(Array.from(paint.gridOrder), order, 'the very late packet changed no canonical order');
  assert.deepEqual([...paint.coverage()], coverage, 'the very late packet changed no coverage');
  assert.equal(paint._netQuads.length, quads, 'the very late packet emitted no atlas quad after 64 newer splats');
  assert.equal(centreOwner(paint), 1, 'team 0 still owns the overlap');
});

test('reconnect clear drops the canonical order with the grid (#365, #369)', async () => {
  const f = await fixture();
  const { paint, nm } = await receiver(f, 'obs', [['p1', 'P1'], ['p2', 'P2']]);

  await deliver(nm, 'p1', 501, [splatPacket({ tick: 500, seq: 1, team: 0 })]);
  assert.equal(centreOwner(paint), 1);
  assert.ok(paint.gridOrder.some((k) => k > 0), 'the canonical order was recorded');

  paint.clear();
  assert.ok(paint.grid.every((v) => v === 0), 'the grid is empty after a reconnect clear');
  assert.ok(paint.gridOrder.every((k) => k === 0), 'the canonical order is empty after a reconnect clear');

  const quads = paint._netQuads.length;
  await deliver(nm, 'p2', 502, [splatPacket({ tick: 100, seq: 1, team: 1 })]);
  settle(paint);
  assert.equal(centreOwner(paint), 2, 'a previously suppressed old packet paints again once the match state is cleared');
  assert.ok(paint._netQuads.length > quads, 'and it emits GPU ink again');
});

test('an unorderable paint packet is dropped by every client instead of applied in arrival order (#365, #369)', async () => {
  const f = await fixture();
  const { paint, nm } = await receiver(f, 'obs', [['p1', 'P1']]);

  const legacy = [300, 's', 0, 0, 0, RADIUS, 1, 0.42, 0, 0, 0, 0, 0];
  await deliver(nm, 'p1', 601, [legacy]);
  assert.ok(paint.grid.every((v) => v === 0), 'a splat with no order identity never reaches the grid');

  const badTeam = splatPacket({ tick: 300, seq: 1, team: 7 });
  await deliver(nm, 'p1', 602, [badTeam]);
  assert.ok(paint.grid.every((v) => v === 0), 'an out-of-range team is refused');
  assert.equal(paint._netQuads.length, 0, 'and neither one reached the atlas');
});
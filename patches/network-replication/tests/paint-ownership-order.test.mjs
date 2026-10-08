import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../scripts/weapons-fixture.mjs';

const MATCH = 'issue-365-order-test';
const CENTER = [0, 0.01, 0];
const RADIUS = 0.9;

function makeRenderer(THREE) {
  let target = null, clearColor = new THREE.Color(0), clearAlpha = 0;
  return {
    autoClear: true,
    capabilities: { getMaxAnisotropy: () => 1 },
    renders: 0,
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; },
    getClearColor(out) { return out.copy(clearColor); },
    getClearAlpha() { return clearAlpha; },
    setClearColor(value, alpha) {
      if (typeof value === 'number') clearColor.set(value); else clearColor.copy(value);
      clearAlpha = alpha;
    },
    clear() {},
    render() { this.renders++; },
  };
}

async function makePeer(id, memberOrder, matchId = MATCH) {
  const f = await fixture({ network: true, floor: true, cell: 0.25 });
  const renderer = makeRenderer(f.THREE);
  const paint = new f.PaintSystem(renderer, f.G.level, { atlasSize: 1024, maxDensity: 8, cell: 0.25 });
  f.G.paint = paint;
  const sent = [];
  const session = {
    myId: id,
    isHost: id === 'a',
    hostId: 'a',
    _members: new Map(memberOrder.map(owner => [owner, owner])),
    tr: { broadcast: packet => sent.push(packet), sendTo() {} },
  };
  const nm = new f.NetMatch(session, { id: matchId, map: 'paint-order-test' });
  f.G.netm = nm;
  f.G.time = 1;
  const quads = [];
  const pushQuad = paint._pushQuad;
  paint._pushQuad = function (face, u0, u1, v0, v1, ...draw) {
    quads.push({ grid: face.grid, nu: face.nu, nv: face.nv, cu: face.cu, cv: face.cv, u0, u1, v0, v1, team: draw[4] });
    return pushQuad.call(this, face, u0, u1, v0, v1, ...draw);
  };
  return { f, renderer, paint, nm, session, sent, quads, lastTs: new Map() };
}

function makeActor(f, name, team) {
  const actor = f.make('shooter', { name, team });
  actor.addTurf = f.Actor.prototype.addTurf;
  return actor;
}

function localSplat(peer, team, actor) {
  const area = peer.paint.splat(new peer.f.THREE.Vector3(...CENTER), RADIUS, team, { seed: 0.42, instant: true });
  actor?.addTurf(area);
  return { area, event: peer.nm.out.findLast(e => e[1] === 's') };
}

function deliver(peer, from, event, { matchId = MATCH, version = 2, ownerTick, forge = false } = {}) {
  const wire = JSON.parse(JSON.stringify(event));
  if (forge) {
    wire._netPaintOrder = Number.MAX_SAFE_INTEGER;
    wire._netPaintMatch = 'wrong-match';
    wire._netPaintOwner = 'spoofed-owner';
  }
  const tick = wire[wire.length - 2];
  const previousTs = peer.lastTs.get(from) ?? -Infinity;
  const ts = Math.max(wire[0] + 0.01, previousTs + 0.01);
  peer.lastTs.set(from, ts);
  const packet = { k: 't', m: matchId, ts, u: ownerTick ?? tick, e: [wire] };
  if (Number.isSafeInteger(version) && version > 0) packet.r = version;
  peer.nm.onMessage(from, packet);
  const playback = peer.nm.peers.get(from);
  if (playback) playback.tr = Infinity;
  peer.nm._playEvents();
  return playback?.events.length ?? 0;
}

function hashPaint(paint) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < paint.grid.length; i++) {
    hash = Math.imul(hash ^ paint.grid[i], 0x01000193) >>> 0;
    hash = Math.imul(hash ^ Math.floor(paint.gridOrder[i] / 0x4000000), 0x01000193) >>> 0;
    hash = Math.imul(hash ^ paint.gridOrderOwner[i], 0x01000193) >>> 0;
    hash = Math.imul(hash ^ (paint.gridOrder[i] >>> 0), 0x01000193) >>> 0;
  }
  return hash;
}

function centerCell(peer) {
  const f = peer.paint.paintFaces[0];
  const rel = new peer.f.THREE.Vector3(...CENTER).sub(f.origin);
  const i = Math.floor(rel.dot(f.u) / f.cu), j = Math.floor(rel.dot(f.v) / f.cv);
  return f.grid + j * f.nu + i;
}

function rasterizedQuadOwners(peer) {
  const owners = new Uint8Array(peer.paint.grid.length);
  for (const q of peer.quads) {
    for (let j = 0; j < q.nv; j++) {
      if (q.v1 <= j * q.cv + 1e-9 || q.v0 >= (j + 1) * q.cv - 1e-9) continue;
      for (let i = 0; i < q.nu; i++) {
        if (q.u1 <= i * q.cu + 1e-9 || q.u0 >= (i + 1) * q.cu - 1e-9) continue;
        owners[q.grid + j * q.nu + i] = q.team + 1;
      }
    }
  }
  return owners;
}

function assertCpuAndSubmittedGpuOwnersMatch(peer) {
  peer.paint.flush(1 / 60);
  assert.ok(peer.renderer.renders > 0, 'the production PaintSystem submitted generated atlas geometry');
  const gpuOwners = rasterizedQuadOwners(peer);
  for (let i = 0; i < peer.paint.grid.length; i++) {
    if (peer.paint.grid[i]) assert.equal(gpuOwners[i], peer.paint.grid[i], `submitted GPU quads disagree at cell ${i}`);
  }
}

async function runPermutation(observerOrder) {
  const a = await makePeer('a', ['observer', 'b', 'a']);
  const b = await makePeer('b', ['b', 'a', 'observer']);
  const observer = await makePeer('observer', ['a', 'observer', 'b']);
  const actorA = makeActor(a.f, 'A', 0), actorB = makeActor(b.f, 'B', 1);
  const aLocal = localSplat(a, 0, actorA), bLocal = localSplat(b, 1, actorB);
  assert.ok(aLocal.event && bLocal.event);
  assert.deepEqual([aLocal.event.at(-2), aLocal.event.at(-1)], [60, 1]);
  assert.deepEqual([bLocal.event.at(-2), bLocal.event.at(-1)], [60, 1]);
  a.nm._sendTick(); b.nm._sendTick();
  assert.equal(a.sent[0].m, MATCH); assert.equal(b.sent[0].m, MATCH);
  assert.equal(a.sent[0].r, 2); assert.equal(b.sent[0].r, 2);
  assert.deepEqual([a.sent[0].e[0].at(-2), a.sent[0].e[0].at(-1)], [60, 1]);
  assert.ok(b.nm._lastPaintOrder.ownerRank > a.nm._lastPaintOrder.ownerRank, 'stable roster rank breaks same-tick, same-sequence ties');

  const localCreditA = actorA.stats.turf, localCreditB = actorB.stats.turf;
  const localSpecialA = actorA.special, localSpecialB = actorB.special;
  for (const owner of observerOrder) deliver(observer, owner, owner === 'a' ? aLocal.event : bLocal.event, { forge: true });
  deliver(a, 'b', bLocal.event);
  deliver(b, 'a', aLocal.event);
  const predictedGrid = Array.from(a.paint.grid);
  deliver(a, 'a', aLocal.event); // The relay normally excludes the sender; a returned echo must still be harmless.

  assert.deepEqual(Array.from(a.paint.grid), predictedGrid, 'an owner echo must not apply local prediction twice');
  assert.equal(actorA.stats.turf, localCreditA, 'remote replay and a returned echo do not add turf credit again');
  assert.equal(actorB.stats.turf, localCreditB, 'remote replay does not add turf credit to the local owner');
  assert.equal(actorA.special, localSpecialA, 'remote replay and owner echo do not charge the special gauge again');
  assert.equal(actorB.special, localSpecialB, 'remote replay does not charge another owner special gauge');
  assert.deepEqual(Array.from(a.paint.grid), Array.from(b.paint.grid));
  assert.deepEqual(Array.from(a.paint.grid), Array.from(observer.paint.grid));
  assert.deepEqual([...a.paint.coverage()], [...b.paint.coverage()]);
  assert.deepEqual([...a.paint.coverage()], [...observer.paint.coverage()]);
  assert.equal(a.paint.grid[centerCell(a)], 2);
  assert.equal(b.paint.grid[centerCell(b)], 2);
  assert.equal(observer.paint.grid[centerCell(observer)], 2);
  assertCpuAndSubmittedGpuOwnersMatch(a);
  assertCpuAndSubmittedGpuOwnersMatch(b);
  assertCpuAndSubmittedGpuOwnersMatch(observer);
  assert.equal(observer.nm._paintOwnerRanks.size, 3);
  assert.equal(observer.paint.gridOrder.length, observer.paint.grid.length);
  assert.equal(observer.paint.gridOrderOwner.length, observer.paint.grid.length);
  assert.ok([...observer.nm.peers.values()].every(p => p.events.length === 0), 'drained event queues retain no paint history');

  return {
    hashA: hashPaint(a.paint), hashB: hashPaint(b.paint), hashObserver: hashPaint(observer.paint),
    coverage: [...observer.paint.coverage()], cells: observer.paint.grid.length,
    credits: [actorA.stats.turf, actorB.stats.turf], submittedQuads: [a.quads.length, b.quads.length, observer.quads.length],
  };
}

test('three production-composed clients converge on CPU and submitted GPU ownership for both receive permutations', async () => {
  const forward = await runPermutation(['a', 'b']);
  const reverse = await runPermutation(['b', 'a']);
  assert.equal(forward.hashA, forward.hashB);
  assert.equal(forward.hashA, forward.hashObserver);
  assert.equal(reverse.hashA, reverse.hashB);
  assert.equal(reverse.hashA, reverse.hashObserver);
  assert.equal(forward.hashA, reverse.hashA);
  assert.deepEqual(forward.coverage, reverse.coverage);
  assert.deepEqual(forward.credits, reverse.credits);
  assert.equal(forward.cells, 134400);
  assert.ok(forward.submittedQuads.every(n => n > 0));
});

test('stale, duplicate, late, departed-owner and unknown-reconnect records keep the accepted per-cell order', async () => {
  const a = await makePeer('a', ['a', 'b', 'observer']);
  const b = await makePeer('b', ['b', 'observer', 'a']);
  const observer = await makePeer('observer', ['observer', 'a', 'b']);
  const aFirst = localSplat(a, 0, null).event;
  const bFirst = localSplat(b, 1, null).event;
  b.f.G.time = 61 / 60;
  const bLater = localSplat(b, 1, null).event;
  assert.deepEqual([bLater.at(-2), bLater.at(-1)], [61, 2]);

  assert.equal(observer.paint.grid[centerCell(observer)], 0, 'new match starts without hidden paint history');
  assert.equal(deliver(observer, 'b', bFirst), 0);
  assert.equal(deliver(observer, 'b', bLater), 0);
  const afterNewerB = Array.from(observer.paint.grid);
  observer.session._members.delete('a');
  deliver(observer, 'a', aFirst, { forge: true }); // Cached match ranks keep a previously accepted owner identifiable after leave.
  assert.deepEqual(Array.from(observer.paint.grid), afterNewerB, 'a late lower-order splat cannot replace newer turf');
  deliver(observer, 'b', bLater, { forge: true });
  assert.deepEqual(Array.from(observer.paint.grid), afterNewerB, 'the duplicate event sequence is idempotent');
  deliver(observer, 'reconnected-a', aFirst);
  assert.deepEqual(Array.from(observer.paint.grid), afterNewerB, 'a new connection ID absent from the locked roster is rejected');
  deliver(observer, 'a', aFirst, { matchId: 'old-match' });
  assert.deepEqual(Array.from(observer.paint.grid), afterNewerB, 'an old match epoch cannot enter the active paint grid');
  assert.equal(observer.paint.grid[centerCell(observer)], 2);
  assert.equal(observer.nm._paintOwnerRanks.size, 3, 'rank storage remains bounded to the match roster after a leave');
});

test('Range clear resets the bounded order grid and the next match rejects old-epoch paint', async () => {
  const a = await makePeer('a', ['a', 'b']);
  const oldEvent = localSplat(a, 0, null).event;
  assert.ok(a.paint.gridOrder.some(order => order > 0));

  // PracticeRangeSession.reset calls this production PaintSystem.clear() method.
  a.paint.clear();
  assert.ok(a.paint.grid.every(owner => owner === 0));
  assert.ok(a.paint.gridOrder.every(order => order === 0));
  assert.ok(a.paint.gridOrderOwner.every(rank => rank === 0));
  assert.equal(a.paint.growing.length, 0);

  const next = new a.f.NetMatch(a.session, { id: 'issue-365-next-match', map: 'paint-order-test' });
  a.f.G.netm = next;
  a.nm = next;
  const nextEvent = localSplat(a, 1, null).event;
  const afterNewLocal = Array.from(a.paint.grid);
  deliver(a, 'b', oldEvent, { matchId: MATCH });
  assert.deepEqual(Array.from(a.paint.grid), afterNewLocal, 'a delayed previous-match splat is rejected after reset');
  deliver(a, 'a', nextEvent); // The relay excludes the sender; a returned echo must remain harmless.
  assert.deepEqual(Array.from(a.paint.grid), afterNewLocal);
  assert.ok(a.paint.grid.some(owner => owner === 2), 'the first new-match event paints without prior ordering history');
  assert.ok(a.paint.gridOrder.some(order => order > 0));
  assert.equal(next.cfg.id, 'issue-365-next-match');
});

test('mixed r:1 and unversioned legacy paint packets still paint without duplicate owner credit', async () => {
  const sender = await makePeer('a', ['a', 'b']);
  const owner = makeActor(sender.f, 'A', 0);
  const local = localSplat(sender, 0, owner);
  assert.ok(local.area > 0);
  const credited = [owner.stats.turf, owner.special];

  // The pre-r:2 wire event retains the original paint payload and is delivered
  // in both supported legacy tick envelopes.
  const legacy = local.event.slice(0, -2);
  for (const version of [1, 0]) {
    const receiver = await makePeer('b', ['b', 'a']);
    deliver(receiver, 'a', legacy, { version });

    assert.ok(receiver.paint.grid.some(value => value === 1), `legacy r:${version || 'absent'} paint must reach the gameplay grid`);
    assert.deepEqual([owner.stats.turf, owner.special], credited, 'remote replay must not charge turf or special gauge again');
  }
  const unsupported = await makePeer('b', ['b', 'a']);
  deliver(unsupported, 'a', legacy, { version: 3 });
  assert.ok(unsupported.paint.grid.every(value => value === 0), 'unknown wire revisions are not guessed as legacy');
});

test('legacy growth stays behind cells that already have a canonical paint owner', async () => {
  const sender = await makePeer('a', ['a', 'b']);
  const receiver = await makePeer('b', ['b', 'a']);
  const owner = makeActor(receiver.f, 'B', 1);
  const ordered = localSplat(receiver, 1, owner);
  const beforeGrid = Array.from(receiver.paint.grid), beforeOrder = Array.from(receiver.paint.gridOrder);
  const legacy = localSplat(sender, 0, null).event.slice(0, -2);

  deliver(receiver, 'a', legacy, { version: 1 });

  assert.deepEqual(Array.from(receiver.paint.grid), beforeGrid, 'legacy replay cannot replace ordered CPU ownership');
  assert.deepEqual(Array.from(receiver.paint.gridOrder), beforeOrder);
  assert.ok(ordered.area > 0);
  assertCpuAndSubmittedGpuOwnersMatch(receiver);
});

test('eight players plus a spectator retain distinct bounded paint ranks and converge', async () => {
  const players = Array.from({ length: 8 }, (_, i) => `player-${String(i).padStart(2, '0')}`);
  const roster = [...players, 'spectator'];
  const a = await makePeer(players[0], roster);
  const h = await makePeer(players[7], roster);
  const observer = await makePeer('spectator', roster);
  const actorA = makeActor(a.f, 'A', 0), actorH = makeActor(h.f, 'H', 1);
  const aLocal = localSplat(a, 0, actorA), hLocal = localSplat(h, 1, actorH);
  assert.ok(aLocal.area > 0 && hLocal.area > 0, 'the ninth roster entry must not suppress local paint');
  assert.equal(a.nm._paintOwnerRanks.size, 9);
  assert.equal(observer.nm._paintOwnerRanks.size, 9);
  assert.deepEqual([...observer.nm._paintOwnerRanks.values()].sort((x, y) => x - y), Array.from({ length: 9 }, (_, i) => i));

  const localCredits = [actorA.stats.turf, actorH.stats.turf, actorA.special, actorH.special];
  deliver(a, players[7], hLocal.event);
  deliver(h, players[0], aLocal.event);
  deliver(observer, players[7], hLocal.event);
  deliver(observer, players[0], aLocal.event);

  assert.deepEqual(Array.from(a.paint.grid), Array.from(h.paint.grid));
  assert.deepEqual(Array.from(a.paint.grid), Array.from(observer.paint.grid));
  assert.equal(a.paint.grid[centerCell(a)], 2, 'stable member ranks select the same same-tick paint owner');
  assert.deepEqual([actorA.stats.turf, actorH.stats.turf, actorA.special, actorH.special], localCredits);
  for (const peer of [a, h, observer]) {
    assert.equal(peer.paint.size, 1024, 'roster size does not enlarge the supported paint atlas');
    assert.equal(peer.paint.gridOrder.length, peer.paint.grid.length);
    assert.equal(peer.paint.gridOrder.byteLength, peer.paint.grid.length * Float64Array.BYTES_PER_ELEMENT);
    assert.equal(peer.paint.gridOrderOwner.byteLength, peer.paint.grid.length * Uint32Array.BYTES_PER_ELEMENT);
    assert.equal(peer.paint.aPos.byteLength, a.paint.aPos.byteLength, 'GPU quad buffers stay fixed-size across roster sizes');
    const gpuBytes = [peer.paint.aPos, peer.paint.aLocal, peer.paint.aSplat, peer.paint.aStretch,
      peer.paint.aGrow, peer.paint.geo.getAttribute('position').array, peer.paint.geo.index.array]
      .reduce((total, array) => total + array.byteLength, 0);
    assert.ok(gpuBytes <= 2_100_000, 'submitted atlas geometry stays within the fixed 6000-quad design');
    assert.ok(peer.paint.usedHeight <= peer.paint.size, 'the atlas packing remains inside its configured size');
    assertCpuAndSubmittedGpuOwnersMatch(peer);
  }
});

test('a sender absent from a larger supported roster cannot mint a paint owner rank', async () => {
  const roster = Array.from({ length: 65 }, (_, i) => `player-${String(i).padStart(2, '0')}`);
  const sender = await makePeer(roster[0], roster);
  const receiver = await makePeer(roster[1], roster);
  const event = localSplat(sender, 1, null).event;
  const before = Array.from(receiver.paint.grid);

  deliver(receiver, 'unlisted-sender', event);
  deliver(receiver, 'unlisted-sender', event.slice(0, -2), { version: 0 });

  assert.deepEqual(Array.from(receiver.paint.grid), before, 'unknown ids must not receive ordered or legacy fallback authority');
  assert.equal(receiver.nm._paintOwnerRanks.size, roster.length);
});

test('a newer non-paint event does not advance the paint duplicate watermark', async () => {
  const sender = await makePeer('a', ['a', 'b']);
  const receiver = await makePeer('b', ['a', 'b']);
  const paint = localSplat(sender, 1, null).event;
  const laterNonPaint = [paint[0] + 0.001, 'noop', paint.at(-2), paint.at(-1) + 1];

  deliver(receiver, 'a', laterNonPaint);
  const peer = receiver.nm.peers.get('a');
  assert.equal(peer._lastEventSeq, 2);
  deliver(receiver, 'a', paint);

  assert.ok(receiver.paint.grid.some(value => value === 2), 'the valid earlier paint survives an unrelated event sequence gap');
  assert.equal(peer._lastPaintSeq, 1);
  assert.equal(peer._lastEventSeq, 2);
});

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
  if (version === 2) packet.r = 2;
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
    hash = Math.imul(hash ^ Math.floor(paint.gridOrder[i] / 0x100000000), 0x01000193) >>> 0;
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
  assert.ok(b.nm._lastPaintOrder > a.nm._lastPaintOrder, 'stable roster rank breaks same-tick, same-sequence ties');

  const localCreditA = actorA.stats.turf, localCreditB = actorB.stats.turf;
  for (const owner of observerOrder) deliver(observer, owner, owner === 'a' ? aLocal.event : bLocal.event, { forge: true });
  deliver(a, 'b', bLocal.event);
  deliver(b, 'a', aLocal.event);
  const predictedGrid = Array.from(a.paint.grid);
  deliver(a, 'a', aLocal.event); // The relay normally excludes the sender; a returned echo must still be harmless.

  assert.deepEqual(Array.from(a.paint.grid), predictedGrid, 'an owner echo must not apply local prediction twice');
  assert.equal(actorA.stats.turf, localCreditA, 'remote replay and a returned echo do not add turf credit again');
  assert.equal(actorB.stats.turf, localCreditB, 'remote replay does not add turf credit to the local owner');
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

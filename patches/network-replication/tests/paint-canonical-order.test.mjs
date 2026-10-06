// #365 / #369: exercise paint requests and authoritative receipts through the
// installed NetMatch/PaintSystem adapters. Only WebGL and wall-clock time are stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const MATCH = 'paint-order-fixture';
const MEMBERS = [['host', 'Host'], ['guestA', 'Guest A'], ['guestB', 'Guest B'], ['observer', 'Observer']];
const ROSTER = [
  { owner:'host', bot:false, team:0 },
  { owner:'host', bot:true, team:1 },
  { owner:'guestA', bot:false, team:0 },
  { owner:'guestB', bot:false, team:1 },
  { owner:'observer', bot:false, team:1 },
];
const CENTER = [4, 0, 4];
const RADIUS = 1.2;

function wire(value) { return JSON.parse(JSON.stringify(value)); }

function peer(f, id, hostId = 'host', { mode = 'turf', roster = ROSTER } = {}) {
  const session = f.makeSession(id, hostId, MEMBERS);
  const nm = f.makeNetMatch(session, { id:MATCH, mode, roster });
  const actors = new Map(MEMBERS.map(([owner]) => [owner, f.makeActor({
    nid:owner, owner, remote:owner !== id, team:owner === 'guestB' || owner === 'observer' ? 1 : 0,
  })]));
  const hostBot = f.makeActor({ nid:'host-bot', owner:'host', remote:id !== 'host', team:1 });
  hostBot.isBot = true;
  actors.set('hostBot', hostBot);
  f.bind(nm, [...actors.values()]);
  const paint = f.makePaint({ su:8, sv:8, atlasSize:512, maxDensity:30 });
  f.clock.set(10);
  f.G.time = 2;
  return { f, session, nm, actors, paint };
}

function flushTick(p) {
  p.f.clock.advance(0.01);
  p.f.G.time = 2;
  p.nm._sendTick();
  return wire(p.session.sent.at(-1).packet);
}

function ownerSplat(p, ownerId, team, center = CENTER, radius = RADIUS) {
  const area = p.paint.splat(new p.f.THREE.Vector3(...center), radius, team, { seed:0.42 });
  p.actors.get(ownerId).addTurf(area); // the same caller-side credit used by weapons and actors
  return area;
}

function playThroughNetMatch(p, from, packet) {
  p.nm.onMessage(from, wire(packet));
  const timeline = p.nm._peer(from);
  timeline.tr = Infinity;
  p.nm._playEvents();
}

function playOneCanonical(p, event, outerTs) {
  const tick = event[event.length - 2];
  playThroughNetMatch(p, 'host', { k:'t', ts:outerTs, r:2, u:tick, e:[event] });
}

function settle(p, frames = 40) {
  for (let i = 0; i < frames; i++) p.paint.flush(1 / 60);
}

function cellAt(paint, u, v) {
  const f = paint.paintFaces[0];
  const i = Math.min(f.nu - 1, Math.max(0, Math.floor(u / f.cu)));
  const j = Math.min(f.nv - 1, Math.max(0, Math.floor(v / f.cv)));
  return f.grid + j * f.nu + i;
}

function assertAtlasMatchesGrid(paint) {
  const f = paint.paintFaces[0], eps = 1e-9;
  for (const q of paint._netQuads) {
    for (let row = 0; row < f.nv; row++) for (let col = 0; col < f.nu; col++) {
      const u0 = col * f.cu, u1 = (col + 1) * f.cu;
      const v0 = row * f.cv, v1 = (row + 1) * f.cv;
      if (q.u1 <= u0 + eps || q.u0 >= u1 - eps || q.v1 <= v0 + eps || q.v0 >= v1 - eps) continue;
      const owner = paint.grid[f.grid + row * f.nu + col];
      assert.equal(q.team + 1, owner, `team ${q.team} growth crossed cell (${col},${row}) owned by ${owner}`);
    }
  }
}

async function ownerGeneratedPair() {
  const hf = await fixture(), host = peer(hf, 'host');
  const guestAF = await fixture(), guestBF = await fixture();
  const guestA = peer(guestAF, 'guestA'), guestB = peer(guestBF, 'guestB');
  ownerSplat(guestA, 'guestA', 0, [3.45, 0, 4]);
  const requestA = flushTick(guestA);
  ownerSplat(guestB, 'guestB', 1, [4.55, 0, 4]);
  const requestB = flushTick(guestB);
  host.nm.onMessage('guestA', requestA);
  hf.clock.advance(0.01);
  host.nm.onMessage('guestB', requestB);
  const canonical = Array.from(host.nm.out.filter((e) => e[1] === 's'), wire);
  return { host, canonical, guestA, guestB };
}

test('guest predictions are accepted once, host ordered, relayed, and credited once', async () => {
  const hf = await fixture(), host = peer(hf, 'host');
  const af = await fixture(), guestA = peer(af, 'guestA');
  const bf = await fixture(), guestB = peer(bf, 'guestB');
  const areaA = ownerSplat(guestA, 'guestA', 0);
  const reqA = flushTick(guestA);
  const areaB = ownerSplat(guestB, 'guestB', 1);
  const reqB = flushTick(guestB);

  host.nm.onMessage('guestA', reqA);
  hf.clock.advance(0.01);
  host.nm.onMessage('guestB', reqB);
  assert.deepEqual(Array.from(host.nm.out.filter((e) => e[1] === 's'), (e) => e[16]), [1, 2], 'host assigns order by accepted request arrival');

  const duplicate = { ...reqA, ts:reqA.ts + 0.2 };
  host.nm.onMessage('guestA', duplicate);
  assert.equal(host.nm.out.filter((e) => e[1] === 's').length, 2, 'replayed owner request adds no second authoritative splat');
  assert.equal(host.actors.get('guestA').creditCalls, 0, 'authority applies guest paint without granting owner credit again');

  const relay = flushTick(host);
  assert.equal(relay.r, 2, 'canonical receipts use the existing event packet marker');
  assert.equal(relay.e.filter((e) => e[1] === 's').length, 2);
  playThroughNetMatch(guestA, 'host', relay);
  playThroughNetMatch(guestB, 'host', relay);
  settle(host); settle(guestA); settle(guestB);

  assert.equal(host.paint.grid[cellAt(host.paint, CENTER[0], CENTER[2])], 2);
  assert.deepEqual(Array.from(guestA.paint.grid), Array.from(host.paint.grid));
  assert.deepEqual(Array.from(guestB.paint.grid), Array.from(host.paint.grid));
  assert.deepEqual(Array.from(guestA.paint.gridOrderSeq), Array.from(host.paint.gridOrderSeq));
  assert.deepEqual([...guestA.paint.coverage()], [...host.paint.coverage()]);
  assert.ok(areaA > 0 && areaB > 0);
  assert.equal(guestA.actors.get('guestA').creditCalls, 1);
  assert.equal(guestA.actors.get('guestA').stats.turf, areaA, 'host echo does not double the predicted owner credit');
  assert.equal(guestB.actors.get('guestB').creditCalls, 1);
  assert.equal(guestB.actors.get('guestB').stats.turf, areaB);
});

test('out-of-order canonical events converge per cell and stale growth cannot repaint newer cells', async () => {
  const { canonical } = await ownerGeneratedPair();
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0][16], 1);
  assert.equal(canonical[1][16], 2);
  const forwardF = await fixture(), reverseF = await fixture();
  const forward = peer(forwardF, 'observer'), reverse = peer(reverseF, 'observer');
  playOneCanonical(forward, canonical[0], 20);
  playOneCanonical(forward, canonical[1], 20.1);
  playOneCanonical(reverse, canonical[1], 20);
  playOneCanonical(reverse, canonical[0], 20.1);
  settle(forward); settle(reverse);

  assert.deepEqual(Array.from(reverse.paint.grid), Array.from(forward.paint.grid));
  assert.deepEqual(Array.from(reverse.paint.gridOrderEpoch), Array.from(forward.paint.gridOrderEpoch));
  assert.deepEqual(Array.from(reverse.paint.gridOrderSeq), Array.from(forward.paint.gridOrderSeq));
  assert.deepEqual([...reverse.paint.coverage()], [...forward.paint.coverage()]);
  assertAtlasMatchesGrid(forward.paint);
  assertAtlasMatchesGrid(reverse.paint);
  assert.equal(reverse.paint.grid[cellAt(reverse.paint, CENTER[0], CENTER[2])], 2, 'order 1 cannot take the contested cells back from order 2');

  const quads = reverse.paint._netQuads.length;
  playOneCanonical(reverse, canonical[1], 20.2);
  settle(reverse);
  assert.equal(reverse.paint._netQuads.length, quads, 'a duplicate canonical receipt is neither replayed nor redrawn');
});

test('host rejects unauthenticated, wrong-team, wrong-match, malformed, and future paint requests', async () => {
  const hf = await fixture(), host = peer(hf, 'host');
  const gf = await fixture(), guest = peer(gf, 'guestA');
  ownerSplat(guest, 'guestA', 1); // guestA is rostered on team 0
  const wrongTeam = flushTick(guest);
  host.nm.onMessage('guestA', wrongTeam);

  ownerSplat(guest, 'guestA', 0);
  const validShape = flushTick(guest);
  const wrongMatch = wire(validShape); wrongMatch.ts += 0.1; wrongMatch.e[0][14] = 'another-match';
  host.nm.onMessage('guestA', wrongMatch);
  const malformed = wire(validShape); malformed.ts += 0.2; malformed.e[0][16] = null;
  host.nm.onMessage('guestA', malformed);
  const future = wire(validShape); future.ts += 0.3; future.u = future.e[0][26] - 1;
  host.nm.onMessage('guestA', future);
  const outsider = wire(validShape); outsider.ts += 0.4;
  host.nm.onMessage('intruder', outsider);

  assert.equal(host.paint.grid.some((cell) => cell !== 0), false, 'rejected requests do not mutate host gameplay paint');
  assert.equal(host.nm.out.filter((e) => e[1] === 's').length, 0, 'rejected requests produce no canonical relay');
});

test('host authority includes Boss paint while guests remain bound to their roster team', async () => {
  const bossRoster = MEMBERS.map(([owner], index) => ({ owner, bot:false, team:index === 3 ? 1 : 0 }));
  const hf = await fixture(), host = peer(hf, 'host', 'host', { mode:'boss', roster:bossRoster });
  const gf = await fixture(), guest = peer(gf, 'guestA', 'host', { mode:'boss', roster:bossRoster });
  host.paint.splat(new host.f.THREE.Vector3(...CENTER), RADIUS, 1, { seed:0.42 });
  const canonical = flushTick(host);
  playThroughNetMatch(guest, 'host', canonical);
  assert.equal(guest.paint.grid[cellAt(guest.paint, CENTER[0], CENTER[2])], 2, 'host-owned Boss team ink reaches guests');

  const malicious = peer(gf, 'guestA', 'host', { mode:'boss', roster:bossRoster });
  ownerSplat(malicious, 'guestA', 1);
  const request = flushTick(malicious);
  const authority = peer(hf, 'host', 'host', { mode:'boss', roster:bossRoster });
  authority.nm.onMessage('guestA', request);
  assert.equal(authority.paint.grid.some((cell) => cell !== 0), false, 'Boss mode does not let a guest claim the boss team');
});

test('host migration advances paint epoch, cancels old predictions, and admits only the new host timeline', async () => {
  const oldHostF = await fixture(), oldHost = peer(oldHostF, 'host');
  ownerSplat(oldHost, 'host', 0);
  const oldHostPacket = flushTick(oldHost);
  const oldCanonical = oldHostPacket.e.find((e) => e[1] === 's');

  const observerF = await fixture(), observer = peer(observerF, 'observer');
  playThroughNetMatch(observer, 'host', oldHostPacket);
  const pendingArea = ownerSplat(observer, 'observer', 1);
  const pendingRequest = flushTick(observer);
  assert.ok(pendingArea > 0 && observer.paint.gridPrediction.some((request) => request >= 0));

  const newHostF = await fixture(), newHost = peer(newHostF, 'guestA');
  for (const p of [observer, newHost]) {
    p.session.hostId = 'guestA';
    p.session.isHost = p.session.myId === 'guestA';
    p.session._members.delete('host');
    p.nm.onLeave('host', true);
  }
  assert.equal(observer.nm._paintState.epoch, 1);
  assert.equal(newHost.nm._paintState.epoch, 1);
  assert.equal(newHost.actors.get('hostBot').owner, 'guestA', 'the new host adopts paint ownership of the departed host bot');
  assert.equal(observer.paint.gridPrediction.some((request) => request >= 0), false);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(observer.paint.gridCanonical), 'host change rolls back only unconfirmed local paint');

  newHost.nm.onMessage('observer', pendingRequest);
  assert.equal(newHost.paint.grid.some((cell) => cell !== 0), false, 'a pre-migration request carries the old epoch and is refused');
  playOneCanonical(observer, oldCanonical, 30);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(observer.paint.gridCanonical), 'a late packet from the departed host cannot paint');

  ownerSplat(newHost, 'hostBot', 1);
  const newHostPacket = flushTick(newHost);
  const newEvent = newHostPacket.e.find((e) => e[1] === 's');
  assert.equal(newEvent[15], 1);
  assert.equal(newEvent[6], 1, 'the new host can relay paint from a transferred opposite-team bot');
  playThroughNetMatch(observer, 'guestA', newHostPacket);
  settle(observer); settle(newHost);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(newHost.paint.grid));

  observer.paint.clear();
  const emptyAfterReconnect = Array.from(observer.paint.grid);
  const receiptState = observer.nm._paintState;
  observer.nm.dispose();
  const reconnected = observer.f.makeNetMatch(observer.session, { id:MATCH, roster:ROSTER });
  observer.f.bind(reconnected, [...observer.actors.values()]);
  observer.nm = reconnected;
  assert.strictEqual(reconnected._paintState, receiptState, 'same room state survives NetMatch reconstruction');
  playThroughNetMatch(observer, 'guestA', { ...newHostPacket, ts:newHostPacket.ts + 0.2 });
  assert.deepEqual(Array.from(observer.paint.grid), emptyAfterReconnect, 'a duplicate pre-clear receipt stays deduplicated after grid clear');
});

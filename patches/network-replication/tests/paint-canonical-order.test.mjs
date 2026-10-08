import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

function paintLevel(THREE) {
  const face = {
    paintable: true, su: 2, sv: 2, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(0, 0, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(0, -0.1, 0), aabbMax: new THREE.Vector3(2, 0.1, 2),
    faces: [0, -1, -1, -1, -1, -1],
  };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}

function paintRenderer(THREE) {
  let target = null, clear = new THREE.Color(), alpha = 1;
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getClearColor: out => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value, opacity) => { if (value?.isColor) clear.copy(value); alpha = opacity; },
    clear() {}, render() {},
  };
}

async function client(id, memberIds = ['a', 'b', 'c'], host = 'a') {
  const f = await fixture();
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'canonical-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE), { atlasSize: 128, maxDensity: 8, cell: 0.25 });
  const paint = f.G.paint, pushQuad = paint._pushQuad.bind(paint), emitGrowth = paint._emitGrowth.bind(paint);
  paint._testQuadRecords = [];
  paint._emitGrowth = (growth, ...args) => {
    paint._testCurrentOrder = growth.netOrderId;
    try { return emitGrowth(growth, ...args); } finally { paint._testCurrentOrder = 0; }
  };
  paint._pushQuad = (face, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) => {
    paint._testQuadRecords.push([paint._testCurrentOrder, face.atlas.x, face.atlas.y, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly]);
    return pushQuad(face, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly);
  };
  return { f, nm, session, actors, paint: f.G.paint };
}

function received(event) {
  const copy = JSON.parse(JSON.stringify(event));
  if (Number.isSafeInteger(event._netTick) && Number.isSafeInteger(event._netSeq)) {
    copy._netTick = event._netTick;
    copy._netSeq = event._netSeq;
  } else if (copy.length >= 15) {
    copy._netTick = copy[copy.length - 2];
    copy._netSeq = copy[copy.length - 1];
  }
  return copy;
}

function applyRemote(clientState, from, event) {
  clientState.nm._peer(from);
  clientState.nm._play(from, received(event));
}

function visibleQuads(paint) {
  for (const growth of paint.growing) paint._emitGrowth(growth, 3, 1, false);
  const face = paint.paintFaces[0], owners = new Uint8Array(face.nu * face.nv);
  for (const record of paint._testQuadRecords) {
    const u0 = record[3], u1 = record[4], v0 = record[5], v1 = record[6], team = record[11];
    for (let j = 0; j < face.nv; j++) {
      const v = (j + 0.5) * face.cv;
      if (v < v0 || v > v1) continue;
      for (let i = 0; i < face.nu; i++) {
        const u = (i + 0.5) * face.cu;
        if (u >= u0 && u <= u1) owners[j * face.nu + i] = team + 1;
      }
    }
  }
  return Array.from(owners);
}

test('full production composition converges opposing owner predictions and a reverse-order observer', async () => {
  const a = await client('a'), b = await client('b'), c = await client('c');
  const center = new a.f.THREE.Vector3(1, 0, 1);
  a.paint.splat(center, 0.42, 0, { seed: 0.31 });
  b.paint.splat(center, 0.42, 1, { seed: 0.73 });
  const eventA = a.nm.out[0], eventB = b.nm.out[0];

  applyRemote(a, 'b', eventB);
  applyRemote(b, 'a', eventA);
  applyRemote(c, 'b', eventB);
  applyRemote(c, 'a', eventA);

  assert.deepEqual(Array.from(a.paint.grid), Array.from(b.paint.grid));
  assert.deepEqual(Array.from(a.paint.grid), Array.from(c.paint.grid));
  assert.deepEqual(Array.from(a.paint.counts), Array.from(b.paint.counts));
  assert.deepEqual(Array.from(a.paint.counts), Array.from(c.paint.counts));
  assert.deepEqual(Array.from(a.paint.coverage()), Array.from(b.paint.coverage()));
  assert.deepEqual(Array.from(a.paint.coverage()), Array.from(c.paint.coverage()));
  assert.ok(Array.from(a.paint.grid).some(value => value === 2), 'the lexically later peer owns the tie');
  const qa = visibleQuads(a.paint), qb = visibleQuads(b.paint), qc = visibleQuads(c.paint);
  assert.deepEqual(qa, qb);
  assert.deepEqual(qa, qc);
});

test('r2 replay accepts delayed prediction paint and rejects future owner ticks', async () => {
  const sender = await client('a'), observer = await client('c');
  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1), 0.42, 0, { seed: 0.27 });
  const paint = sender.nm.out.at(-1), tick = paint.at(-2), seq = paint.at(-1);

  observer.nm._tick('a', { ts: paint[0] + 0.01, u: tick + 10 });
  const delayedTs = paint[0] + 0.02;
  observer.nm._tick('a', { ts: delayedTs, u: tick + 20, r: 2, e: [paint] });
  const peer = observer.nm.peers.get('a');
  assert.equal(peer.events.length, 1, 'delayed paint remains admissible behind a newer owner snapshot');
  peer.tr = delayedTs;
  peer.sim = tick + 20;
  observer.nm._playEvents();
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid), 'stale owner prediction replays through per-cell order');

  const future = [...paint];
  future[1] = 'pe';
  future[future.length - 2] = tick + 21;
  future[future.length - 1] = seq + 1;
  observer.nm._tick('a', { ts: delayedTs + 0.01, u: tick + 20, r: 2, e: [future] });
  assert.equal(peer.events.length, 0, 'an event beyond its packet owner tick is rejected');

  const invalidBound = [...future];
  invalidBound[invalidBound.length - 2] = tick + 19;
  invalidBound[invalidBound.length - 1] = seq + 2;
  observer.nm._tick('a', { ts: delayedTs + 0.02, u: NaN, r: 2, e: [invalidBound] });
  assert.equal(peer.events.length, 0, 'a non-finite packet owner tick cannot admit r2 events');
});

test('r2 rejects unsupported event tags without queuing them', async () => {
  const observer = await client('c');
  const invalid = [1000, 'not-an-event', 0, 740, 2];
  observer.nm._tick('a', { ts: 1000.01, u: 750, r: 2, e: [invalid] });
  assert.equal(observer.nm.peers.get('a').events.length, 0);
});

test('an unsupported event schema tag is not downgraded to legacy paint', async () => {
  const sender = await client('a'), observer = await client('c');
  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1), 0.42, 0, { seed: 0.27 });
  const row = [...sender.nm.out.at(-1)];
  observer.nm._tick('a', { ts: row[0] + 0.01, u: row.at(-2) + 10, r: 3, e: [row] });
  assert.equal(observer.nm.peers.get('a').events.length, 0);
});

test('late, duplicate, and legacy-width paint records preserve order and ownership checks', async () => {
  const c = await client('c'), a = await client('a'), b = await client('b');
  const center = new c.f.THREE.Vector3(1, 0, 1);
  a.paint.splat(center, 0.42, 0, { seed: 0.31 });
  b.paint.splat(center, 0.42, 1, { seed: 0.73 });
  const eventA = a.nm.out[0], eventB = b.nm.out[0];

  applyRemote(c, 'b', eventB);
  const afterNew = Array.from(c.paint.grid);
  applyRemote(c, 'a', eventA);
  const afterOlder = Array.from(c.paint.grid);
  assert.ok(afterNew.some((value, index) => value !== afterOlder[index]), 'the older event still paints cells outside the newer splat');
  for (let i = 0; i < afterNew.length; i++) if (afterNew[i] === 2) assert.equal(afterOlder[i], 2, 'the newer cell owner remains canonical');
  applyRemote(c, 'a', eventA);
  assert.deepEqual(Array.from(c.paint.grid), afterOlder, 'duplicate packets do not change ownership');

  const legacy = [1000, 's', 1, 0, 1, 0.42, 0, 0.31, 0, 0, 0, 0, 0];
  c.nm._peer('a');
  c.nm._play('a', legacy);
  assert.deepEqual(Array.from(c.paint.grid), afterOlder, 'legacy row width remains accepted without overriding ordered ownership');

  const forged = received(eventA);
  forged[6] = 1;
  const beforeForged = Array.from(c.paint.grid);
  c.nm._play('a', forged);
  assert.deepEqual(Array.from(c.paint.grid), beforeForged, 'team does not match the authenticated owner');
});

test('mixed paint and non-paint records keep the sender sequence and reject half metadata before advancing it', async () => {
  const sender = await client('a'), observer = await client('c');
  const p0 = new sender.f.THREE.Vector3(0.5, 0, 0.5), p1 = new sender.f.THREE.Vector3(1.5, 0, 1.5);
  sender.paint.splat(p0, 0.3, 0, { seed: 0.2 });
  const first = sender.nm.out.at(-1);
  const nonPaint = sender.nm._rec(['bm', 2]);
  sender.paint.splat(p1, 0.3, 0, { seed: 0.4 });
  const second = sender.nm.out.at(-1);
  assert.deepEqual([first._netSeq, nonPaint._netSeq, second._netSeq], [1, 2, 3]);

  observer.nm._tick('a', { ts: second[0], u: 720, r: 2, e: [first, nonPaint, second] });
  const peer = observer.nm.peers.get('a');
  peer.tr = second[0];
  observer.nm._playEvents();
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid), 'r2 accepts each event row width');

  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1.5), 0.2, 0, { seed: 0.7 });
  const third = sender.nm.out.at(-1);
  const malformed = received(third);
  delete malformed._netTick;
  observer.nm._play('a', malformed);
  assert.equal(peer._lastEventSeq, 3, 'half metadata must not advance the peer sequence');
  applyRemote(observer, 'a', third);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid));

  sender.f.clock.advance(0.05);
  sender.paint.splat(new sender.f.THREE.Vector3(1.5, 0, 0.5), 0.2, 0, { seed: 0.33 });
  const olderR2 = sender.nm.out.at(-1);
  const beforeOlderR2 = Array.from(observer.paint.grid);
  observer.nm._tick('a', { ts: olderR2[0], r: 2, e: [olderR2] });
  peer.tr = olderR2[0];
  observer.nm._playEvents();
  assert.equal(peer._lastEventSeq, olderR2._netSeq, 'r2 without owner tick remains paint-compatible');
  assert.notDeepEqual(Array.from(observer.paint.grid), beforeOlderR2);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid));
});

test('recreated NetMatch keeps owner event sequence and a tenth player can replicate paint', async () => {
  const sender = await client('p9', Array.from({ length: 10 }, (_, i) => `p${i}`), 'p0');
  const observer = await client('p0', Array.from({ length: 10 }, (_, i) => `p${i}`), 'p0');
  const center = new sender.f.THREE.Vector3(1, 0, 1);
  sender.paint.splat(center, 0.42, 1, { seed: 0.61 });
  const first = sender.nm.out.at(-1);
  applyRemote(observer, 'p9', first);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid));

  const restarted = sender.f.makeNetMatch(sender.session, { id: 'canonical-paint-reconnect' });
  sender.paint.splat(new sender.f.THREE.Vector3(1.5, 0, 1), 0.2, 1, { seed: 0.19 });
  const afterReconnect = restarted.out.at(-1);
  assert.equal(afterReconnect._netSeq, first._netSeq + 1, 'owner sequence survives NetMatch recreation');
});

test('host ownership handoff rejects late former-owner paint and accepts the new host paint', async () => {
  const departed = await client('b'), host = await client('a'), observer = await client('c');
  const center = new departed.f.THREE.Vector3(1, 0, 1);
  departed.paint.splat(center, 0.42, 1, { seed: 0.52 });
  const stale = departed.nm.out.at(-1);
  host.nm.onLeave('b', false);
  observer.nm.onLeave('b', false);
  const before = Array.from(observer.paint.grid);
  applyRemote(observer, 'b', stale);
  assert.deepEqual(Array.from(observer.paint.grid), before, 'paint from the departed owner is rejected');

  host.paint.splat(center, 0.42, 1, { seed: 0.37 });
  const current = host.nm.out.at(-1);
  applyRemote(observer, 'a', current);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(host.paint.grid));
});

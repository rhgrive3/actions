import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

function paintLevel(THREE, size = 2, origin = 0) {
  const face = {
    paintable: true, su: size, sv: size, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(origin, 0, origin),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(origin, -0.1, origin), aabbMax: new THREE.Vector3(origin + size, 0.1, origin + size),
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

async function client(id, memberIds = ['a', 'b', 'c'], host = 'a', large = false) {
  const f = await fixture();
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'canonical-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, large ? 20 : 2, large ? -10 : 0), { atlasSize: large ? 1024 : 128, maxDensity: large ? 30 : 8, cell: 0.25 });
  const paint = f.G.paint, pushQuad = paint._pushQuad.bind(paint), emitGrowth = paint._emitGrowth.bind(paint);
  paint._testQuadRecords = [];
  paint._emitGrowth = (growth, ...args) => {
    paint._testCurrentOrder = growth.netOrderId;
    try { return emitGrowth(growth, ...args); } finally { paint._testCurrentOrder = 0; }
  };
  paint._pushQuad = (face, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) => {
    if (!large) paint._testQuadRecords.push([paint._testCurrentOrder, face.atlas.x, face.atlas.y, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly]);
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
  assert.equal(observer.nm._paintClockState.clock, 0, 'departed owner cannot affect causal time');
  assert.deepEqual(Array.from(observer.paint.grid), before, 'paint from the departed owner is rejected');

  host.paint.splat(center, 0.42, 1, { seed: 0.37 });
  const current = host.nm.out.at(-1);
  applyRemote(observer, 'a', current);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(host.paint.grid));
});


function settle(state, hz = 60) {
  for (let frame = 0; frame < hz * 3.5; frame++) {
    state.paint.advanceSimulation(1 / hz);
    state.paint.flush(1 / hz);
  }
  assert.equal(state.paint.growing.length, 0);
}

function samePaint(a, b, message) {
  assert.deepEqual(Array.from(a.paint.grid), Array.from(b.paint.grid), message);
  assert.deepEqual(Array.from(a.paint.counts), Array.from(b.paint.counts), message);
  assert.deepEqual(Array.from(a.paint.coverage()), Array.from(b.paint.coverage()), message);
}

test('received paint can be repainted causally despite radically different application uptimes', async () => {
  for (const [uptimeA, uptimeB] of [[120, 10], [0.5, 1e6], [1e9, 0]]) {
    const a = await client('a'), b = await client('b');
    a.f.G.time = uptimeA; b.f.G.time = uptimeB;
    const center = new a.f.THREE.Vector3(1, 0, 1);
    a.paint.splat(center, 0.42, 0, { seed: 0.31 });
    const first = a.nm.out.at(-1);
    applyRemote(b, 'a', first);
    b.f.G.time += 1;
    assert.ok(b.paint.splat(center, 0.42, 1, { seed: 0.31 }) > 0, 'observed older ink is repaintable');
    const second = b.nm.out.at(-1);
    assert.equal(second[14][2], first[14][2] + 1, 'causal clock advances independently of uptime');
    assert.equal(first._netTick, Math.round(uptimeA * 60), 'physics retains owner simulation ticks');
    applyRemote(a, 'b', second);
    a.paint.splat(center, 0.42, 0, { seed: 0.31 });
    const third = a.nm.out.at(-1);
    assert.equal(third[14][2], second[14][2] + 1, 'lexically earlier peer can causally repaint too');
    applyRemote(b, 'a', third);
    settle(a); settle(b);
    samePaint(a, b);
    assert.ok(a.paint.counts[0] > 0);
    assert.equal(a.paint.counts[1], 0);
  }
});

test('admitted queued paint advances causality before delayed presentation replays it', async () => {
  const a = await client('a'), b = await client('b');
  a.f.G.time = 120; b.f.G.time = 10;
  const center = new a.f.THREE.Vector3(1, 0, 1);
  a.paint.splat(center, 0.42, 0, { seed: 0.31 });
  const first = a.nm.out.at(-1);
  b.nm._tick('a', { ts: first[0], u: first._netTick, r: 2, e: JSON.parse(JSON.stringify([first])) });
  assert.equal(b.paint.counts[0], 0, 'remote paint is still waiting for its presentation clock');
  b.paint.splat(center, 0.42, 1, { seed: 0.31 });
  const second = b.nm.out.at(-1);
  assert.equal(second[14][2], first[14][2] + 1);
  b.nm.peers.get('a').tr = first[0];
  b.nm._playEvents();
  applyRemote(a, 'b', second);
  settle(a); settle(b);
  samePaint(a, b);
  assert.equal(b.paint.counts[0], 0, 'delayed presentation cannot overwrite the causal local repaint');
});

test('opposing temporal paint converges after reverse concurrent delivery at 30/60/120 Hz', async () => {
  let reference;
  for (const hz of [30, 60, 120]) {
    const a = await client('a', undefined, 'a', true);
    const b = await client('b', undefined, 'a', true);
    const c = await client('c', undefined, 'a', true);
    a.f.G.time = 120; b.f.G.time = 10; c.f.G.time = 10000;
    const center = new a.f.THREE.Vector3(0, 0, 0);
    a.paint.splat(center, 2, 0, { seed: 1 / 26 });
    b.paint.splat(center, 2.5, 1, { seed: 0.47 });
    const first = a.nm.out.at(-1), second = b.nm.out.at(-1);
    applyRemote(a, 'b', second);
    applyRemote(b, 'a', first);
    applyRemote(c, 'b', second);
    applyRemote(c, 'a', first);
    assert.equal(a.paint.growing.length, 2, 'newer arrival cannot truncate the older canonical growth history');
    assert.equal(b.paint.growing.length, 2, 'late older arrival cannot finish the newer growth');
    settle(a, hz); settle(b, hz); settle(c, hz);
    samePaint(a, b); samePaint(a, c);
    const grid = Array.from(a.paint.grid);
    if (reference) assert.deepEqual(grid, reference, 'render cadence cannot change final ownership');
    else reference = grid;
  }
});

test('fully shadowed older body retains its distinct ancillary footprint without reclaiming newer cells', async () => {
  const a = await client('a', undefined, 'a', true), b = await client('b', undefined, 'a', true);
  const c = await client('c', undefined, 'a', true), d = await client('c', undefined, 'a', true);
  const center = new a.f.THREE.Vector3(0, 0, 0);
  a.paint.splat(center, 2, 0, { seed: 1 / 26 });
  b.paint.splat(center, 3, 1, { seed: 0.47 });
  const first = a.nm.out.at(-1), second = b.nm.out.at(-1);
  applyRemote(c, 'a', first); applyRemote(c, 'b', second);
  applyRemote(d, 'b', second); settle(d);
  const newer = Array.from(d.paint.grid);
  applyRemote(d, 'a', first);
  assert.deepEqual(Array.from(d.paint.grid), newer, 'the newer stamp completely covers the old immediate body');
  assert.equal(d.paint.growing.length, 1, 'older stamp can finish still-unowned ancillary cells');
  settle(c); settle(d);
  samePaint(c, d, 'delivery after the newer stamp completely finishes also converges');
  assert.ok(d.paint.counts[0] > 0, 'the old stamp still has uncovered peripheral ink');
  for (let i = 0; i < newer.length; i++) if (newer[i] === 2) assert.equal(d.paint.grid[i], 2);
});

test('match epochs reject stale and malformed clocks before sequence or causality advances', async () => {
  const a = await client('a'), b = await client('b');
  a.paint.splat(new a.f.THREE.Vector3(1, 0, 1), 0.42, 0, { seed: 0.31 });
  const first = a.nm.out.at(-1);
  const malformed = [
    e => { e[14][1] = 'previous-match'; },
    e => { e[14][0] = 'unknown-paint-order'; },
    e => { e[14][2] = 0; },
    e => { e[14][2] = Number.MAX_SAFE_INTEGER + 1; },
    ...['', '01', '-1', '1.0', '1e30', String(Number.MAX_SAFE_INTEGER)].map(clock => e => { e[14][2] = clock; }),
    e => { e[14][3] = 2; },
    e => { e[6] = 3; e[14][2] = 100000; },
    e => { e[14] = {}; },
  ];
  for (const corrupt of malformed) {
    const e = received(first); corrupt(e);
    b.nm._peer('a'); b.nm._play('a', e);
    assert.equal(b.nm.peers.get('a')._lastEventSeq, undefined);
    assert.equal(b.nm._paintClockState.clock, 0);
    assert.equal(b.paint.counts[0] + b.paint.counts[1], 0);
  }
  applyRemote(b, 'a', first);
  const duplicate = received(first); duplicate[14][2] = 100000;
  b.nm._play('a', duplicate);
  assert.equal(b.nm._paintClockState.clock, first[14][2], 'stale sequence cannot raise the clock');
  const recreated = b.f.makeNetMatch(b.session, { id: 'canonical-paint' });
  b.f.bind(recreated, b.actors);
  b.paint.splat(new b.f.THREE.Vector3(1, 0, 1), 0.42, 1, { seed: 0.31 });
  assert.equal(recreated.out.at(-1)[14][2], first[14][2] + 1, 'same match recreation retains observed causality');
  b.paint.clear();
  const next = b.f.makeNetMatch(b.session, { id: 'next-match' });
  b.f.bind(next, b.actors);
  next._peer('a'); next._play('a', received(first));
  assert.equal(next._paintClockState.clock, 0, 'old match does not contaminate the new clock');
  assert.equal(b.paint.counts[0] + b.paint.counts[1], 0);
  b.paint.splat(new b.f.THREE.Vector3(1, 0, 1), 0.42, 1, { seed: 0.31 });
  assert.equal(next.out.at(-1)[14][2], 1, 'new match has its own causal epoch');
});

test('instant paint carries the same growth policy and causal clock to receivers', async () => {
  const a = await client('a', undefined, 'a', true), b = await client('b', undefined, 'a', true);
  a.paint.splat(new a.f.THREE.Vector3(0, 0, 0), 2, 0, { seed: 1 / 26, instant: true });
  const e = a.nm.out.at(-1);
  applyRemote(b, 'a', e);
  assert.equal(a.paint.growing.length, 0);
  assert.equal(b.paint.growing.length, 0);
  samePaint(a, b);
});


test('deadline commit and same-match recreation never grow duplicate paint events twice', async () => {
  const sender = await client('b'), host = await client('a');
  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1), 0.42, 1, { seed: 0.31 });
  const e = sender.nm.out.at(-1);
  host.nm._tick('b', { ts: e[0], u: e._netTick, r: 2, e: JSON.parse(JSON.stringify([e, e])) });
  assert.equal(host.nm.peers.get('b').events.length, 1, 'duplicate queued record is discarded');
  assert.equal(host.nm.commitDeadlinePaint(), 1);
  assert.equal(host.paint.growing.length, 1);
  assert.equal(host.nm.commitDeadlinePaint(), 0);
  host.nm.peers.get('b').tr = e[0];
  host.nm._playEvents();
  assert.equal(host.paint.growing.length, 1, 'presentation never duplicates committed growth');
  const restarted = host.f.makeNetMatch(host.session, { id: 'canonical-paint' });
  host.f.bind(restarted, host.actors);
  restarted._peer('b'); restarted._play('b', received(e));
  assert.equal(host.paint.growing.length, 1, 'same-match recreation retains the applied sequence watermark');
  settle(sender); settle(host);
  samePaint(sender, host);
});

test('opposing wall drips converge after older paint arrives past the newer growth lifetime', async () => {
  const a = await client('a', undefined, 'a', true), b = await client('b', undefined, 'a', true);
  const c = await client('c', undefined, 'a', true), d = await client('c', undefined, 'a', true);
  for (const state of [a, b, c, d]) {
    state.paint.dispose();
    const level = paintLevel(state.f.THREE, 20, -10), face = level.faces[0], block = level.blocks[0];
    face.wall = true; face.turf = false;
    face.origin.set(-10, -10, 0); face.v.set(0, 1, 0); face.n.set(0, 0, 1);
    block.aabbMin.set(-10, -10, -0.1); block.aabbMax.set(10, 10, 0.1);
    state.paint = state.f.G.paint = new state.f.PaintSystem(paintRenderer(state.f.THREE), level,
      { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
  }
  const center = new a.f.THREE.Vector3(0, 0, 0);
  a.paint.splat(center, 2, 0, { seed: 1 / 26 });
  b.paint.splat(center, 2.5, 1, { seed: 0.47 });
  const first = a.nm.out.at(-1), second = b.nm.out.at(-1);
  applyRemote(c, 'a', first); applyRemote(c, 'b', second);
  applyRemote(d, 'b', second); settle(d); applyRemote(d, 'a', first);
  settle(c); settle(d);
  assert.deepEqual(Array.from(c.paint.grid), Array.from(d.paint.grid));
  assert.ok(c.paint.grid.some(value => value === 1));
  assert.ok(c.paint.grid.some(value => value === 2));
});


test('remote paint clock near numeric exhaustion keeps every subsequent local repaint exact and replicable', async () => {
  const a = await client('a'), b = await client('b');
  const center = new a.f.THREE.Vector3(1, 0, 1);
  // Reproduce a legitimate-shaped received packet at the original exhaustion
  // boundary, then cross it through real recording, JSON transport and paint.
  a.nm._paintClockState.clock = Number.MAX_SAFE_INTEGER - 2;
  a.paint.splat(center, 0.42, 0, { seed: 0.31 });
  const remote = a.nm.out.at(-1);
  assert.equal(remote[14][2], Number.MAX_SAFE_INTEGER - 1);
  applyRemote(b, 'a', remote);
  for (const expected of [Number.MAX_SAFE_INTEGER, '9007199254740992', '9007199254740993']) {
    assert.ok(b.paint.splat(center, 0.42, 1, { seed: 0.31 }) >= 0);
    const event = b.nm.out.at(-1);
    assert.equal(event[14][2], expected);
    applyRemote(a, 'b', event);
    assert.equal(a.nm._paintClockState.clock, expected, 'the receiver accepts the precise successor');
    samePaint(a, b);
  }
  assert.ok(a.paint.splat(center, 0.42, 0, { seed: 0.31 }) > 0, 'the earlier peer can causally repaint beyond numeric range');
  const final = a.nm.out.at(-1);
  assert.equal(final[14][2], '9007199254740994');
  applyRemote(b, 'a', final);
  settle(a); settle(b);
  samePaint(a, b);
  assert.equal(a.paint.counts[1], 0);
});

test('large exact causal jumps and decimal carry never require clipping or change concurrent tie breaks', async () => {
  const a = await client('a'), b = await client('b'), c = await client('c');
  const center = new a.f.THREE.Vector3(1, 0, 1);
  const large = '99999999999999999999999999999999999999999999999999';
  a.nm._paintClockState.clock = large;
  b.nm._paintClockState.clock = large;
  a.paint.splat(center, 0.42, 0, { seed: 0.31 });
  b.paint.splat(center, 0.42, 1, { seed: 0.31 });
  const first = a.nm.out.at(-1), second = b.nm.out.at(-1);
  assert.equal(first[14][2], '100000000000000000000000000000000000000000000000000');
  assert.equal(first[14][2], second[14][2]);
  applyRemote(a, 'b', second); applyRemote(b, 'a', first);
  applyRemote(c, 'b', second); applyRemote(c, 'a', first);
  samePaint(a, b); samePaint(a, c);
  assert.equal(a.paint.counts[0], 0, 'peer tie break is unchanged after decimal carry');
  assert.ok(c.paint.splat(center, 0.42, 0, { seed: 0.31 }) > 0, 'any accepted large jump can be followed locally');
  const third = c.nm.out.at(-1);
  assert.equal(third[14][2], '100000000000000000000000000000000000000000000000001');
  applyRemote(a, 'c', third); applyRemote(b, 'c', third);
  settle(a); settle(b); settle(c);
  samePaint(a, b); samePaint(a, c);
});

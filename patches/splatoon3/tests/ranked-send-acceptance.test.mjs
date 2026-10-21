import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';

// Socket-free, actual production composition: controller -> Actor/buildFrame ->
// NetMatch -> Transport -> JSON -> host ranked command admission -> ClamsRule.
// Only the socket, render/collision fixtures and clock are controlled here.
const stage = { id: 'ranked-send-acceptance', zones: [{ center: [0,0,0], size: [8,8] }],
  clams: { spawns: [], goals: [[0,0,20],[0,0,-20]] } };
async function world(hz = 60) {
  let clock = 10;
  const f = await fixture({ ranked: true, network: true, session: true, production: true, clock: { now: () => clock * 1000 } });
  f.context.document.createElement = () => ({ dataset: {} });
  f.context.document.head = { appendChild() {} }; f.context.structuredClone = structuredClone;
  f.installRanked(f); f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  const owner = f.make(), proxy = f.make(), hostActor = f.make();
  Object.assign(owner, { nid: 1, team: 0, slot: 0, owner: 'guest', isLocal: true, netLife: 1, invuln: 0 });
  Object.assign(proxy, { nid: 1, team: 0, slot: 0, owner: 'guest', remote: true, netLife: 1, invuln: 0 });
  Object.assign(hostActor, { nid: 2, team: 1, slot: 0, owner: 'host', isLocal: true, netLife: 1, invuln: 0 });
  const match = (local, actors) => ({ mode: 'clams', state: 'playing', time: 300, actors, local,
    ranked: new f.RankedEngine('clams', stage), rankedGains: [0,0], rankedBarrierHits: [],
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false, update() {} },
    playing() { return this.state === 'playing'; }, canRespawn: () => false, setState(s) { this.state = s; } });
  const guestMatch = match(owner, [owner]), hostMatch = match(hostActor, [proxy, hostActor]);
  const sent = [], tr = new f.Transport(); tr.ws = { readyState: 1, bufferedAmount: 0, send: s => sent.push(s) };
  const makeNet = (isHost, m) => {
    const s = { myId: isHost ? 'host' : 'guest', hostId: 'host', isHost,
      _members: new Set(['host','guest']), tr: isHost ? { broadcast() { return true; }, sendTo() { return true; } } : tr };
    const nm = new f.NetMatch(s, { id: stage.id, mode: 'clams', map: 'tidewater' }); nm.bind(m); return nm;
  };
  const guest = makeNet(false, guestMatch), host = makeNet(true, hostMatch); host.byNid.set(1, proxy);
  const select = (nm, m) => Object.assign(f.G, { netm: nm, match: m, actors: m.actors, mode: 'match', settings: { aimAssist: 0 }, time: clock });
  select(guest, guestMatch);
  const input = new f.Input({}), rig = { yaw: 0, pitch: 0, mode: 'follow', target: owner };
  const controller = new f.PlayerController(owner, rig, input); controller.computeAim = () => {}; controller.enabled = true;
  guestMatch.controller = controller; f.G.rig = rig;
  const frame = () => { select(guest, guestMatch); controller.update(1/hz); owner.update(0); f.buildFrame(guestMatch, { G: f.G }); };
  const tap = (kind = 'power', device = 'keyboard') => {
    for (const m of [guestMatch, hostMatch]) m.ranked.rule.state.inventories['1'] = { team: 0, small: kind === 'small' ? 2 : 0, power: kind === 'power' };
    if (device === 'keyboard') input.pressed.add('KeyC');
    if (device === 'pad') input.padPressed.add(1);
    if (device === 'touch') { input.lastDevice = 'touch'; input.mobile = { active: true, root: {}, lookDX: 0, lookDY: 0, moveX: 0, moveY: 0,
      gyro: { enabled: false, discard() {} }, down: () => false, wasPressed: id => id === 'sub' }; }
    frame(); assert.equal(owner._rankedThrowPending, true, 'actual throw edge must reach the network latch');
    input.pressed.clear(); input.padPressed.clear(); if (input.mobile) input.mobile.wasPressed = () => false;
    frame(); assert.equal(owner._rankedThrowPending, true, 'release before the 20Hz tick must retain the edge');
  };
  const deliver = p => { select(host, hostMatch); host.onMessage('guest', p); hostMatch.ranked.update(1/60, f.buildFrame(hostMatch, { G: f.G })); };
  const send = () => { select(guest, guestMatch); clock += .05; f.G.time = clock;
    const start = sent.length, broadcast = tr.broadcast; guest._sendTick(); assert.equal(tr.broadcast, broadcast, 'temporary sidecar wrapper restored');
    const packets = sent.slice(start).filter(s => s.startsWith('b|')).map(s => JSON.parse(s.slice(2))).filter(p => p.k === 't');
    for (const p of packets) deliver(p); return packets;
  };
  return { ...f, owner, proxy, hostActor, guest, host, guestMatch, hostMatch, input, controller, tr, sent, select, frame, tap, send, deliver,
    close() { guest.dispose(); host.dispose(); f.G.projectiles.clear(); } };
}
const throws = f => f.hostMatch.ranked.events.filter(e => e.kind === 'clam-throw').length;
for (const device of ['keyboard','pad','touch']) for (const kind of ['small','power'])
  test(`${device} ${kind} throw survives refused ticks and reaches the host exactly once`, async () => {
    const f = await world(); try {
      f.tap(kind, device); f.tr.ws.bufferedAmount = 512 * 1024 + 1;
      for (let i = 0; i < 3; i++) { assert.equal(f.send().length, 0); assert.equal(f.owner._rankedThrowPending, true, 'refusal cannot consume throw'); assert.equal(throws(f), 0); }
      f.tr.ws.bufferedAmount = 0; const [p] = f.send();
      assert.equal(p.rki.throw, true); assert.equal(p.rki.seq, 4); assert.equal(f.owner._rankedThrowPending, false);
      assert.equal(throws(f), 1); assert.equal(f.hostMatch.ranked.rule.state.clams.length, 1);
      const inv = f.hostMatch.ranked.rule.state.inventories['1']; assert.equal(inv.power, false); assert.equal(inv.small, kind === 'small' ? 1 : 0);
      f.deliver(p); assert.equal(throws(f), 1, 'duplicate accepted command must not create another throw');
      assert.equal(f.send()[0].rki.throw, false); assert.equal(throws(f), 1, 'later ordinary tick has no old edge');
    } finally { f.close(); }
  });

test('30 and 120Hz input edges retain the same 20Hz send acceptance boundary', async () => {
  for (const hz of [30,120]) {
    const f = await world(hz); try {
      f.tap(); f.tr.ws.bufferedAmount = 512 * 1024 + 1;
      assert.equal(f.send().length, 0); assert.equal(f.owner._rankedThrowPending, true);
      f.tr.ws.bufferedAmount = 0; assert.equal(f.send()[0].rki.throw, true);
      assert.equal(f.send()[0].rki.throw, false); assert.equal(throws(f), 1);
    } finally { f.close(); }
  }
});

test('temporarily unavailable socket retains the edge until transport recovers', async () => {
  const f = await world(); try {
    f.tap(); f.tr.ws.readyState = 0;
    for (let i = 0; i < 3; i++) {
      assert.equal(f.send().length, 0); assert.equal(f.owner._rankedThrowPending, true);
      assert.equal(throws(f), 0);
    }
    f.tr.ws.readyState = 1;
    assert.equal(f.send()[0].rki.throw, true); assert.equal(f.owner._rankedThrowPending, false);
    assert.equal(f.send()[0].rki.throw, false); assert.equal(throws(f), 1);
  } finally { f.close(); }
});

test('only explicit boolean acceptance consumes a throw; exceptions restore the wrapper', async () => {
  const f = await world(); try {
    f.tap(); const native = f.tr.broadcast;
    for (const result of [false, undefined, null, 1, 'true']) {
      f.tr.broadcast = () => result; assert.equal(f.send().length, 0); assert.equal(f.owner._rankedThrowPending, true, String(result));
    }
    let attempts = 0;
    const fail = () => { attempts++; throw new Error('socket diagnostic'); }; f.tr.broadcast = fail;
    // The sender owns whether this socket exception propagates or is recorded.
    // The ranked sidecar must restore its wrapper and retain the edge either way.
    try { f.send(); } catch (error) { assert.match(error.message, /socket diagnostic/); }
    assert.equal(attempts, 1, 'one real broadcast attempt, no hidden retry');
    assert.equal(f.tr.broadcast, fail); assert.equal(f.owner._rankedThrowPending, true);
    f.tr.broadcast = native; assert.equal(f.send()[0].rki.throw, true); assert.equal(throws(f), 1);
    assert.equal(f.owner._rankedThrowPending, false, 'boolean true consumes the accepted edge');
  } finally { f.close(); }
});

test('existing disabled, menu, death and map cancellation still remove a refused edge', async () => {
  for (const state of ['disabled','menu','dead','map']) {
    const f = await world(); try {
      f.tap(); f.tr.ws.bufferedAmount = 512 * 1024 + 1; f.send(); assert.equal(f.owner._rankedThrowPending, true);
      if (state === 'disabled') f.controller.enabled = false;
      if (state === 'menu') f.controller.menuBlocked = true;
      if (state === 'dead') f.owner.alive = false;
      if (state === 'map') f.controller.setTurfMap(true);
      f.frame(); assert.equal(f.owner._rankedThrowPending, false, state);
      f.tr.ws.bufferedAmount = 0; assert.equal(f.send()[0].rki.throw, false); assert.equal(throws(f), 0);
    } finally { f.close(); }
  }
});

test('disposed network cannot attach its old ranked edge; host snapshot cadence remains four ticks', async () => {
  const f = await world(); try {
    f.tap(); f.tr.ws.bufferedAmount = 512 * 1024 + 1; f.send(); f.guest.dispose(); f.tr.ws.bufferedAmount = 0;
    const packets = f.send(); assert.ok(packets.every(p => !p.rki)); assert.equal(throws(f), 0);
    const hostPackets = []; f.host.s.tr.broadcast = p => { hostPackets.push(p); return true; };
    f.select(f.host, f.hostMatch); for (let i = 0; i < 8; i++) f.host._sendTick();
    assert.equal(hostPackets.length, 8); assert.deepEqual(hostPackets.map((p, i) => p.rk ? i + 1 : null).filter(Boolean), [4,8]);
    assert.ok(hostPackets.every(p => !p.rki));
  } finally { f.close(); }
});

// Combined sender/sidecar ownership boundaries.
test('joint: one sidecar call per tick, final oversize failure retains prefix and throw',async()=>{
 const f=await world();try{
 f.tap();for(let i=0;i<200;i++)f.guest._rec(['tr',1,'jump',{payload:'x'.repeat(260)}]);
 const native=f.tr.broadcast;let calls=0;f.tr.broadcast=function(d){calls++;d.extra='x'.repeat(18000);return native.call(this,d)};
 assert.equal(f.send().length,0);assert.equal(calls,1);assert.equal(f.guest.rankedInputSeq,1);assert.equal(f.owner._rankedThrowPending,true);assert.equal(f.guest.out.length,200);
 const second=f.send();assert.equal(second.length,1);assert.equal(calls,2);assert.equal(f.guest.rankedInputSeq,2);assert.equal(second[0].rki.throw,true);assert.equal(f.owner._rankedThrowPending,false);assert.equal(f.guest.out.length,100);assert.equal(throws(f),1);
 const third=f.send();assert.equal(third.length,1);assert.equal(calls,3);assert.equal(third[0].rki.throw,false);assert.equal(f.guest.out.length,0);assert.equal(throws(f),1);
 }finally{f.close()}
});
test('joint: final throw is captured once, pending and wrapper survive recovery',async()=>{
 const f=await world();try{f.tap();const native=f.tr.broadcast;let calls=0;const fail=()=>{calls++;throw Error('independent final wire failure')};f.tr.broadcast=fail;
 assert.equal(f.send().length,0);assert.equal(calls,1);assert.equal(f.tr.broadcast,fail);assert.equal(f.owner._rankedThrowPending,true);
 f.tr.broadcast=native;assert.equal(f.send()[0].rki.throw,true);assert.equal(throws(f),1);assert.equal(f.owner._rankedThrowPending,false);assert.equal(f.send()[0].rki.throw,false);assert.equal(throws(f),1);
 }finally{f.close()}
});
test('joint: accepted send only consumes captured actor and restores captured transport',async()=>{
 const f=await world();try{f.tap();const native=f.tr.broadcast;const replacementActor={_rankedThrowPending:true}, replacementMatch={replacement:true};const replacementBroadcast=()=>true,replacementTransport={broadcast:replacementBroadcast};let calls=0;
 f.tr.broadcast=function(d){calls++;const accepted=native.call(this,d);f.guestMatch.local=replacementActor;f.guest.s.match=replacementMatch;f.guest.s.tr=replacementTransport;return accepted};const wrapper=f.tr.broadcast;
 const packets=f.send();assert.equal(packets.length,1);assert.equal(calls,1);assert.equal(f.owner._rankedThrowPending,false);assert.equal(replacementActor._rankedThrowPending,true);assert.equal(f.guest.s.match,replacementMatch);assert.equal(f.guest.s.tr,replacementTransport);assert.equal(replacementTransport.broadcast,replacementBroadcast);assert.equal(f.tr.broadcast,wrapper);assert.equal(throws(f),1);
 }finally{f.close()}
});

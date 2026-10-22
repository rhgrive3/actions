import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Real NetSession._begin/_message, NetMatch, codec, actors and replay owners in
// two isolated production-composed VM graphs. Only the socket and stage/mesh
// allocation boundary are replaced. Clocks have independent arbitrary offsets.
async function sessions(fixtures, id) {
  const clients = new Map(), wire = [];
  for (const [index, name] of ['A', 'B'].entries()) {
    const f = fixtures[index];
    f.clock.set(name === 'A' ? 92.3055 : 138.3587);
    f.G.game = { settings: {}, netMatchGo() {} };
    const s = new f.NetSession();
    assert.equal(s.ownerClockVersion, 1, 'real public session enables the current protocol');
    s.myId = name; s.hostId = 'A'; s.state = 'lobby';
    s._members = new Map([['A', 'A'], ['B', 'B']]);
    s.lobby.players = [{ id: 'A', ready: false }, { id: 'B', ready: false }];
    f.G.net = s;
    const send = (to, data) => { wire.push({ from: name, to, data: clone(data) }); return true; };
    s.tr = { sendTo: send, broadcast(data) { send(name === 'A' ? 'B' : 'A', data); return true; }, lock() {}, close() {} };
    clients.set(name, { name, f, s, net: null, actors: [], triggers: 0 });
  }
  const cfg = { id, proto: fixtures[0].PROTO, compat: fixtures[0].COMPAT,
    mode: 'turf', map: 'reef', difficulty: 'normal', roster: [
    { owner: 'A', nid: 1, bot: false, weapon: 'shooter', team: 0, slot: 0 },
    { owner: 'B', nid: 2, bot: false, weapon: 'shooter', team: 1, slot: 0 },
  ] };
  async function begin(name, hold = false) {
    const c = clients.get(name), entered = deferred(), release = deferred();
    c.f.G.game.startNetMatch = async (_cfg, net) => {
      c.net = net; entered.resolve();
      if (hold) await release.promise;
      class Display {
        constructor() { this.root = new c.f.THREE.Group(); }
        trigger() {} setVisible(v) { this.root.visible = v; }
        setHurt() {} setWeapon() {} _owner() { return null; }
      }
      c.actors = ['A', 'B'].map((owner, i) => {
        const actor = new c.f.Actor({ team: i, name: owner, weapon: 'shooter', CharacterClass: Display });
        actor.nid = i + 1; actor.owner = owner; actor.isLocal = owner === name;
        // Stage/mesh allocation is this fixture's boundary. Keep the real
        // Actor/WeaponRunner defaults, without starting a rendered spawn clip.
        actor.pos.set(i * 2, 0, 0); actor.invuln = 0;
        actor._nearCamera = () => false; actor._finishFrame = () => {};
        return actor;
      });
      c.remote = c.actors.find(a => a.owner !== name); c.local = c.actors.find(a => a.owner === name);
      c.remote.character._netTrig = () => { c.triggers++; };
      const match = { actors: c.actors, state: 'intro', time: 180, playing: () => true, follower: false };
      c.f.G.match = match; c.f.G.actors = c.actors; net.bind(match);
    };
    const pending = c.s._begin(cfg);
    await Promise.race([entered.promise, pending.then(() => {
      if (!c.net) throw new Error('Real session rejected the integration START');
    })]);
    if (!hold) { await pending; assert.notEqual(c.s.state, 'error', c.s.error); }
    return { async release() { release.resolve(); await pending; assert.ok(c.net.match); } };
  }
  function flush(select = () => true) {
    let count = 0;
    for (;;) {
      const index = wire.findIndex(select);
      if (index < 0) return;
      assert.ok(count++ < 200, 'protocol/codec negotiation must converge');
      const message = wire.splice(index, 1)[0];
      clients.get(message.to).s._message(message.from, clone(message.data));
    }
  }
  function takeTick(name, position) {
    const c = clients.get(name); c.local.pos.x = position;
    c.net._sendTick();
    const index = wire.findIndex(x => x.from === name && x.data.k === 't');
    assert.ok(index >= 0); return wire.splice(index, 1)[0];
  }
  return { clients, wire, begin, flush, takeTick,
    advance(dt) { for (const c of clients.values()) { c.f.clock.advance(dt); c.f.G.time += dt; } },
    pause(dt) { for (const c of clients.values()) c.f.clock.advance(dt); },
    restart(id) {
      for (const c of clients.values()) { clearTimeout(c.s._goT); c.s._goT = null; c.s.endMatch(); }
      wire.length = 0; cfg.id = id;
    },
    dispose() { for (const c of clients.values()) { clearTimeout(c.s._goT); c.s.match?.dispose(); c.s.match = null; c.f.G.net = null; } },
  };
}

test('#1767 real Sessions: asynchronous startup, catch-up, reconnect, paused simulation and expired ACK at 30/60/120 Hz', async () => {
  const fixtures = [await fixture({ productionComposition: true, includeSession: true }),
    await fixture({ productionComposition: true, includeSession: true })];
  for (const hz of [30, 60, 120]) {
    const p = await sessions(fixtures, 'session-clock-' + hz);
    try {
      const a = p.clients.get('A'), b = p.clients.get('B');
      const held = await p.begin('A', true); await p.begin('B');
      b.f.clock.set(124.04); b.local.character.trigger('spawn', {});
      const old = p.takeTick('B', 2); b.f.clock.set(138.3587);
      assert.equal(old.data.oc, 1);
      assert.equal(old.data.ocm, 'session-clock-' + hz);
      a.s._message('B', clone(old.data));
      assert.equal(a.net.match, null, 'startNetMatch await has not resolved');
      assert.equal(a.net.peers.size, 0, 'unbound packet cannot reserve a clock');
      await held.release();
      a.s._message('B', clone(old.data));
      assert.equal(a.net.peers.size, 0, 'bound old packet is staged pending a fresh response');
      p.flush();
      const peer = a.net.peers.get('B');
      assert.equal(peer.lastTs, 124.04);
      assert.equal(a.remote.net.buf.at(-1).x, 2);
      assert.equal(peer.physicsPoints.at(-1), old.data.u);
      peer.tr = 124.1; peer.sim = old.data.u; a.net._playEvents();
      assert.equal(a.triggers, 1, 'staged source event passed the real replay owners once');
      p.advance(37.3063);
      const fresh = p.takeTick('B', 7);
      assert.equal(fresh.data.ts, 175.665);
      a.s._message('B', clone(fresh.data));
      assert.equal(peer.lastTs, 175.665, 'recorded false-future pair recovered without resetting peer');
      assert.equal(a.remote.net.buf.at(-1).x, 7);
      assert.equal(peer.physicsPoints.at(-1), fresh.data.u);
      a.s._message('B', clone(old.data));
      peer.tr = 176; peer.sim = fresh.data.u; a.net._playEvents();
      assert.equal(a.triggers, 1);
      for (let i = 0; i < hz; i++) {
        p.advance(1 / hz);
        a.net.update(1 / hz); b.net.update(1 / hz); p.flush();
      }
      assert.ok(Math.abs(peer.lastTs - b.f.clock.now()) <= .051, 'ordinary 20 Hz production ticks remain live');
      const before = JSON.stringify(peer), buffer = JSON.stringify(a.remote.net.buf);
      const bad = p.takeTick('B', 90); bad.data.ts += 14;
      a.s._message('B', clone(bad.data));
      assert.equal(JSON.stringify(peer), before, 'future reject must not mutate the accepted peer');
      assert.equal(JSON.stringify(a.remote.net.buf), buffer);
      a.s._message('B', { ...bad.data, ts: 1e12 });
      a.s._message('B', { ...bad.data, ts: peer.lastTs });
      a.s._message('B', { ...bad.data, ts: peer.lastTs + .01, oc: undefined });
      a.s._message('intruder', { ...bad.data, ts: peer.lastTs + .01 });
      assert.equal(JSON.stringify(a.remote.net.buf), buffer);
      p.advance(.1);
      const next = p.takeTick('B', 8); a.s._message('B', next.data);
      assert.equal(a.remote.net.buf.at(-1).x, 8, 'valid packet after all rejection controls still recovers');

      // Reuse the actual connected Sessions, ending and recreating their
      // NetMatches. Keep simulation frozen while the visibility/wall clock
      // advances: d.u is a simulation cursor, not a second wall-clock proof.
      p.restart('session-clock-reconnect-' + hz);
      await p.begin('A'); await p.begin('B');
      a.s._message('B', next.data);
      assert.equal(a.net.peers.size, 0, 'previous match cannot initialize the recreated Session match');
      const paused = p.takeTick('B', 9);
      a.s._message('B', paused.data);
      p.flush(message => message.data.k !== 'oca');
      const late = p.wire.splice(0);
      assert.ok(late.some(message => message.data.k === 'oca'));
      p.pause(14);
      for (const message of late) p.clients.get(message.to).s._message(message.from, message.data);
      assert.equal(a.net.peers.size, 0, 'a 14-second queued ACK cannot prove a fresh clock');
      a.net.update(1 / hz); b.net.update(1 / hz);
      p.flush();
      const recovered = a.net.peers.get('B');
      assert.ok(recovered, 'expired proof retries through the real Session transport');
      assert.equal(recovered.physicsPoints.at(-1), paused.data.u, 'paused simulation remains admissible after wall-time recovery');
      p.pause(.05);
      const resumed = p.takeTick('B', 10); a.s._message('B', resumed.data);
      assert.equal(a.remote.net.buf.at(-1).x, 10);
      const resumedWatermark = recovered.lastTs;
      for (const message of late) p.clients.get(message.to).s._message(message.from, message.data);
      a.s._message('B', next.data);
      assert.equal(recovered.lastTs, resumedWatermark, 'late ACK/previous epoch cannot reset the recovered watermark');
    } finally { p.dispose(); }
  }
});

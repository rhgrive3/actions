// Shared two-peer ranked rig (host NetMatch + a real guest NetMatch producing
// real owner `t` packets). Used by the host-authority regressions (#1648,
// #1669). It exercises the installed composed NetMatch/Actor runtime, the real
// ranked network wrapper and the real buildFrame; only the world collision and
// the clock are controlled fixtures. This is logic-level evidence, not a
// two-browser or Switch measurement.
import { fixture } from '../../reliability/tests/controls-fixture.mjs';

export const RIG_STAGE = { id: 'ranked-host-rig', zones: [{ center: [0, 0, 0], size: [8, 8] }],
  clams: { spawns: [], goals: [[0, 0, 40], [0, 0, -40]] },
  rainmaker: { center: [0, 0, 0], checkpoints: [[], []], goals: [[0, 0, 40], [0, 0, -40]] } };

export async function rankedRig({ mode = 'rainmaker', world = {}, guestCount = 1 } = {}) {
  const clock = { ms: 100000, now() { return this.ms; } };
  const f = await fixture({ ranked: true, network: true, clock });
  f.context.document.createElement = () => ({ dataset: {} });
  f.context.document.head = { appendChild() {} };
  f.context.structuredClone = structuredClone;
  f.installRanked(f);
  f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  const rankedWorld = { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false, update() {}, ...world };
  const stage = RIG_STAGE;
  // host-side match: a host-owned actor plus one remote proxy per guest
  const hostActor = f.make();
  Object.assign(hostActor, { nid: 1, slot: 0, team: 1, owner: 'host', isLocal: true, invuln: 0, netLife: 1 });
  hostActor.pos.set(0, 0, -30);
  const proxies = [];
  for (let i = 0; i < guestCount; i++) {
    const p = f.make();
    Object.assign(p, { nid: 2 + i, slot: i, team: 0, owner: 'guest' + i, invuln: 0, netLife: 1 });
    p.pos.set(0, 0, 30);
    proxies.push(p);
  }
  const engine = new f.RankedEngine(mode, stage);
  const hostMatch = { mode, state: 'playing', time: 300, actors: [hostActor, ...proxies], local: hostActor,
    ranked: engine, rankedGains: [0, 0], rankedBarrierHits: [], rankedWorld,
    playing() { return this.state === 'playing'; }, canRespawn: () => false,
    setState(state) { this.state = state; } };
  const hostSession = { myId: 'host', hostId: 'host', isHost: true,
    _members: new Set(['host', ...proxies.map(p => p.owner)]), tr: { broadcast() {}, sendTo() {} } };
  Object.assign(f.G, { match: hostMatch, actors: hostMatch.actors, mode: 'match', settings: { aimAssist: 0 }, time: 10 });
  const nm = new f.NetMatch(hostSession, { id: 'rig-match', mode, map: 'tidewater' });
  nm.bind(hostMatch);
  f.G.netm = nm;
  // one real guest per proxy: its own NetMatch builds the owner packets
  const guests = proxies.map(proxy => {
    const sent = [];
    const actor = f.make();
    Object.assign(actor, { nid: proxy.nid, slot: proxy.slot, team: proxy.team, owner: proxy.owner, isLocal: true, invuln: 0, netLife: 1 });
    actor.pos.copy(proxy.pos);
    const gEngine = new f.RankedEngine(mode, stage);
    const gMatch = { mode, state: 'playing', time: 300, actors: [actor], local: actor, ranked: gEngine, rankedGains: [0, 0],
      rankedBarrierHits: [], rankedWorld, playing() { return true; }, setState() {} };
    const session = { myId: proxy.owner, hostId: 'host', isHost: false, _members: new Set(['host', proxy.owner]),
      tr: { broadcast: d => sent.push(d), sendTo() {} } };
    const gnm = new f.NetMatch(session, { id: 'rig-match', mode, map: 'tidewater' });
    f.G.netm = gnm; gnm.bind(gMatch); f.G.netm = nm;
    return { actor, nm: gnm, sent, proxy };
  });
  const rig = {
    ...f, clock, nm, engine, hostMatch, hostActor, proxies, guests, stage,
    // host game time and the owner/host wall clock advance together
    advance(seconds) { clock.ms += seconds * 1000; f.G.time += seconds; },
    // a real owner tick for guest i (optionally mutated before it is "sent")
    tick(i = 0, mutate = null) {
      const g = guests[i];
      f.G.netm = g.nm; g.sent.length = 0; g.nm._sendTick(); f.G.netm = nm;
      const packet = g.sent.at(-1);
      if (mutate) mutate(packet, packet.a.find(row => row[0] === g.actor.nid));
      return packet;
    },
    deliver(i, packet) { f.G.netm = nm; nm.onMessage(guests[i].proxy.owner, packet); },
    frame() { return f.buildFrame(hostMatch, { G: f.G }); },
    frameActor(i = 0) { return rig.frame().actors.find(a => a.id === String(proxies[i].nid)); },
  };
  return rig;
}

export const FLAG = { alive: 1, squid: 2, grounded: 16, special: 8192, sjCharge: 16384, sjFlight: 32768 };

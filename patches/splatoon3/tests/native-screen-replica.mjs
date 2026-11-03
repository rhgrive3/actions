import assert from 'node:assert/strict';

const json = value => JSON.parse(JSON.stringify(value));
const SCREEN = 'splattercolorScreen';

// #1975 seals a remote Splattercolor Screen birth to the paid native use that
// the receiver observed in the owner's own tick. Forged catalogue rows (even
// with a recorded use) therefore cannot create a Screen replica. This helper
// drives an actual owner-side activation on a separate sender NetMatch and
// delivers its real ticks to an existing receiver and remote proxy.
// `advance(seconds)` must move the fixture's VM performance clock: native
// event timestamps come from it, and a Screen birth follows its use by frames.
export function nativeScreenReplica(f, receiver, proxy, { from = proxy.owner, frames = 16, advance } = {}) {
  assert.equal(typeof advance, 'function', 'a controllable VM performance clock is required');
  const { G } = f, sent = [];
  const receiverMatch = G.match, receiverNetm = G.netm;
  const owner = f.make();
  // The source actor belongs only to the sender roster.
  const index = G.actors.indexOf(owner); if (index >= 0) G.actors.splice(index, 1);
  Object.assign(owner, { nid: proxy.nid, owner: from, netLife: proxy.netLife ?? 0, team: proxy.team });
  owner.pos.copy(proxy.pos); owner.aimYaw = proxy.aimYaw || 0;
  owner.aimDir.set(Math.sin(owner.aimYaw), 0, Math.cos(owner.aimYaw));
  owner.weapon = { ...owner.weapon, special: SCREEN, specialCost: 100 };
  proxy.weapon = { ...proxy.weapon, special: SCREEN, specialCost: 100 };
  const senderMatch = { id: receiver.cfg?.id, state: 'playing', mode: receiver.cfg?.mode || 'turf', time: 180,
    actors: [owner], playing: () => true, canRespawn: () => false };
  const members = new Set([...(receiver.s?._members?.keys?.() || []), from]);
  const sender = new f.NetMatch({ myId: from, hostId: receiver.s?.hostId, isHost: false, _members: members,
    tr: { broadcast: p => { sent.push(json(p)); return true; }, sendTo: () => true } },
    { id: receiver.cfg?.id, mode: receiver.cfg?.mode, map: receiver.cfg?.map });
  sender.bind(senderMatch);
  const select = nm => { G.netm = nm; G.match = nm === sender ? senderMatch : receiverMatch; };
  const receive = packet => {
    select(receiver); receiver.onMessage(from, packet);
    const peer = receiver.peers.get(from); if (peer) { peer.tr = packet.ts; receiver._playEvents(); }
  };
  const step = () => { advance(1 / 60); G.time += 1 / 60; owner._updateSpecial(1 / 60); };
  try {
    // A same-life owner snapshot with a full gauge precedes the native use.
    select(sender); owner.special = 100; advance(1 / 60); G.time += 1 / 60; sender._sendTick();
    const baseline = json(sent.at(-1)); baseline.e = []; receive(baseline);
    select(sender); owner._startSpecial(); assert.ok(owner.specialActive, 'real Screen activation');
    owner.intent.sub = true; step(); owner.intent.sub = false; step();
    for (let i = 0; i < frames && owner.specialActive; i++) step();
    select(sender); assert.equal(sender._sendTick(), true); receive(json(sent.at(-1)));
  } finally {
    select(sender);
    // Retire the sender's own local Screen in place; the receiver keeps its replica.
    const list = G.projectiles._s3AllSpecialObjects || [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].owner === owner) { list[i].dead = true; list[i].mesh?.removeFromParent?.(); list.splice(i, 1); }
    sender.dispose();
    G.netm = receiverNetm; G.match = receiverMatch;
  }
  return G.projectiles._s3AllSpecialObjects.find(o => o.owner === proxy && o.id === SCREEN) || null;
}

// Two-peer rig for the #1665/#1666 hit-claim evidence gate. The attacker peer
// runs the real production-composed NetMatch/Projectiles to produce real owner
// events and real `hit`/`bhit` wire messages; the receiving peer is a second real
// NetMatch (victim owner, or Boss host). Collision, the clock and damage
// application are bounded fixtures: `applyHit` / `remoteHit` only record.
// Logic-level evidence; not a relay, browser or Switch comparison.
import { fixture } from './robustness-fixture.mjs';

export async function claimsRig({ weapon = 'shooter', victimWeapon = 'shooter', boss = false, members = [['host', 'H'], ['A', 'A'], ['B', 'B']] } = {}) {
  const f = await fixture({ productionComposition: true, network: true, includeMatch: false });
  const { THREE, G } = f;
  const cfg = { id: 'claims-match' };
  const rig = { f, sentByA: [], sentByB: [], hits: [], bossHits: [] };
  // ---- attacker peer A (a guest) -----------------------------------------------------------------------
  const sessA = f.makeSession('A', 'host', members);
  sessA.tr.sendTo = (to, msg) => { rig.sentByA.push({ to, msg }); return true; };
  sessA.tr.broadcast = d => { rig.lastBroadcastA = d; };
  const nmA = f.makeNetMatch(sessA, cfg);
  const attackerA = f.makeActor({ nid: 1, owner: 'A', remote: false, team: 0, roller: false });
  attackerA.weapon = f.WEAPONS[weapon]; attackerA.netLife = 1; attackerA.alive = true;
  attackerA.character.getMuzzle = out => out.copy(attackerA.pos).add(new THREE.Vector3(0, 1.05, .3));
  attackerA.aimPoint.copy(attackerA.pos).add(new THREE.Vector3(0, 1.05, 100));
  const victimOnA = f.makeActor({ nid: 2, owner: 'B', remote: true, team: 1, roller: false });
  victimOnA.netLife = 1;
  f.bind(nmA, [attackerA, victimOnA]);
  // The fixture's bind() skips NetMatch.bind's local-event forwarding, so the owner stream would lack the
  // `ev` rows (Charger beam, Special use) that a real owner records. Forward the production list.
  for (const name of ['weapon:fire', 'special:use', 'special:slam']) f.on(name, e => nmA._onLocalEvent(name, e));
  // ---- receiving peer: victim owner B (or Boss host) -----------------------------------------------------
  const receiverId = boss ? 'host' : 'B';
  const sessR = f.makeSession(receiverId, 'host', members);
  sessR.tr.sendTo = (to, msg) => { rig.sentByB.push({ to, msg }); return true; };
  sessR.tr.broadcast = d => { rig.sentByB.push({ to: '*', msg: d }); };
  const nmR = f.makeNetMatch(sessR, cfg);
  const attackerOnR = f.makeActor({ nid: 1, owner: 'A', remote: true, team: 0, roller: false });
  attackerOnR.weapon = f.WEAPONS[weapon]; attackerOnR.netLife = 1;
  const victim = f.makeActor({ nid: 2, owner: 'B', remote: boss, team: 1, roller: false });
  victim.weapon = f.WEAPONS[victimWeapon]; victim.netLife = 1; victim.pos.set(0, 0, 10);
  const matchR = f.bind(nmR, [attackerOnR, victim]);
  if (boss) {
    const crabs = new Map([[7, { id: 7, x: 0, y: 0, z: 10, hp: 500, dead: false }]]);
    matchR.boss = { sim: true, dead: false, invuln: false, visible: true, stunned: false, hp: 18000, crabs,
      pos: new THREE.Vector3(0, 0, 10),
      model: { hitShapes: [{ active: true, weak: false, pos: new THREE.Vector3(0, 1, 10), r: 3 }, { active: true, weak: true, pos: new THREE.Vector3(0, 3, 10), r: 1 }] },
      log: { sent: 0, sentDmg: 0, recv: 0, recvDmg: 0 }, match: matchR,
      remoteHit: d => rig.bossHits.push(d) };
  } else {
    f.G.projectiles.applyHit = (atk, v, dmg, wid, group) => { rig.hits.push({ atk: atk.nid, v: v.nid, dmg, wid, group }); return 'accepted'; };
  }
  Object.assign(rig, {
    nmA, nmR, attackerA, attackerOnR, victim, matchR, victimOnA,
    clock: f.clock,
    asA(fn) { G.netm = nmA; try { return fn(); } finally { G.netm = nmR; } },
    // flush the attacker's recorded events into a real tick packet and deliver it to the receiver
    tick({ flags = 0, extra = null, advance = 0.05, rowPos = null } = {}) {
      f.clock.advance(advance);
      G.netm = nmA;
      const events = nmA.out.splice(0);
      const pos = rowPos || attackerA.pos;
      const row = f.packActor(attackerA, { x: pos.x, y: pos.y, z: pos.z, f: 17 | flags });
      const packet = { k: 't', ts: Math.round(f.clock.now() * 1000) / 1000, a: [row], l: { 1: 1 }, ...(events.length ? { u: events.at(-1)[events.at(-1).length - 2], r: 2, e: events } : {}), ...(extra || {}) };
      G.netm = nmR;
      nmR.onMessage('A', JSON.parse(JSON.stringify(packet)));
      return packet;
    },
    // a real hit claim built by the attacker's own sendHit
    claim(damage, cause) {
      rig.sentByA.length = 0;
      G.netm = nmA;
      nmA.sendHit(attackerA, victimOnA, damage, cause);
      G.netm = nmR;
      return rig.sentByA.at(-1).msg;
    },
    deliver(msg, from = 'A') { G.netm = nmR; nmR.onMessage(from, JSON.parse(JSON.stringify(msg))); },
    bossClaim(damage, { weak = false, cause = 'shooter', crab = -1 } = {}) {
      rig.sentByA.length = 0;
      G.netm = nmA;
      nmA.sendBossHit(attackerA, damage, weak, cause, crab);
      G.netm = nmR;
      return rig.sentByA.at(-1).msg;
    },
    ledger() { return nmR._combatClaims; },
  });
  G.netm = nmR;
  return rig;
}

// For unit tests that inject a hit packet directly: the receiver has already accepted the attacker's
// owner stream, i.e. holds one broad piece of attack evidence for `nid`. A real match always delivers
// the projectile / beam event before the hit; the #1665/#1666 gate refuses a hit that has none.
export function grantAttackEvidence(nm, nid, { kinds = ['main', 'sub', 'special', 'contact'], credits = 64 } = {}) {
  const ledger = nm._combatClaims ||= { actors: new Map(), pending: new Map(), stats: { ok: 0, wait: 0, reject: 0, reasons: Object.create(null) } };
  let actor = ledger.actors.get(nid);
  if (!actor) ledger.actors.set(nid, actor = { receipts: [], standing: Object.create(null), window: [] });
  for (const kind of kinds) actor.receipts.push({ hits: new Map(), used: 0, kind, origin: null, reach: Infinity, expires: Infinity, credits });
  return nm;
}

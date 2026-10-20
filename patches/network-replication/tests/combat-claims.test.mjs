// #1665 (PvP `hit`) and #1666 (Boss `bhit`): an authenticated actor owner must not
// be able to invent lethal hit claims without a matching attack. Real
// production-composed NetMatch/Projectiles produce the attacker's events and
// wire claims (combat-claims-rig.mjs); the receiver is a second real NetMatch.
// Evidence level: logic-only. No relay, two-browser, occlusion or Switch Ver.
// 11.3.0 comparison; LOS and exact trajectories are not verified by the gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimsRig } from './combat-claims-rig.mjs';
import { admitClaim, weaponDamageCeiling, classifyCause } from '../combat-claims.mjs';

const fire = rig => rig.asA(() => rig.f.projectiles.fireShooter(rig.attackerA, rig.attackerA.weapon, 0));
const hitCount = rig => rig.hits.length;
const watermark = rig => rig.nmR._peer('A').lastHit ?? 0;

test('#1665 a forged hit with no attack is refused and does not advance the hit watermark', async () => {
  const r = await claimsRig();
  r.tick();
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 0);
  assert.equal(watermark(r), 0, 'rejected/waiting claims reach no original handler');
  r.tick({ advance: 0.5 }); // still no attack: the waiting claim expires, it is never applied
  assert.equal(hitCount(r), 0);
  r.tick(); fire(r); r.tick();
  assert.equal(hitCount(r), 0, 'an expired waiting claim is not revived by a later shot');
});

test('#1665 positive control: a real shot supports its hit, within the receipt budget', async () => {
  const r = await claimsRig();
  r.tick(); fire(r); r.tick();
  r.deliver(r.claim(36, 'shooter'));
  assert.deepEqual(r.hits.map(h => [h.v, h.dmg, h.wid]), [[2, 36, 'shooter']]);
  r.deliver(r.claim(36, 'shooter')); r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 3, 'direct + splash style hits on the same victim, up to the per-receipt limit');
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 3, 'a single shot cannot support unlimited hits');
});

test('#1665 hitscan ordering: a Charger hit that outruns its beam event is held for the next tick, then applied once', async () => {
  const r = await claimsRig({ weapon: 'charger' });
  r.tick();
  r.asA(() => r.f.projectiles.fireCharger(r.attackerA, r.attackerA.weapon, 1)); // beam fire event is queued, not yet sent
  r.deliver(r.claim(150, 'charger'));
  assert.equal(hitCount(r), 0, 'the claim reached the victim before the attacker tick carrying the fire event');
  r.tick();
  assert.equal(hitCount(r), 1, 'applied exactly once when its evidence arrives');
  assert.equal(r.hits[0].dmg, 150);
  r.tick();
  assert.equal(hitCount(r), 1);
});

test('#1665 wrong equipped weapon: another weapon, a catalogue id or an unequipped special cannot be claimed', async () => {
  const r = await claimsRig({ weapon: 'shooter' });
  r.tick(); fire(r); r.tick();
  const catalogId = Object.keys(r.f.WEAPONS).find(id => r.f.WEAPONS[id].kind === 'catalog' && id.includes('charger'));
  r.deliver(r.claim(36, catalogId));
  r.deliver(r.claim(36, 'zipcaster')); // not this kit's Special
  r.deliver(r.claim(36, 'inkMine')); // not this kit's sub
  assert.equal(hitCount(r), 0);
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 1, 'control: the equipped weapon still lands');
});

test('#1665 damage beyond the equipped weapon\'s own implemented maximum is refused (a Shooter cannot send Charger damage)', async () => {
  const r = await claimsRig({ weapon: 'shooter' });
  r.tick(); fire(r); r.tick();
  r.deliver(r.claim(160, 'charger')); r.deliver(r.claim(200, 'shooter')); r.deliver(r.claim(100, 'shot'));
  assert.equal(hitCount(r), 0);
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 1, 'refused claims did not consume the shot\'s budget');
  assert.ok(weaponDamageCeiling(r.f.WEAPONS.shooter, 220) < 100 && weaponDamageCeiling(r.f.WEAPONS.charger, 220) >= 160);
});

test('#1665 impossible distance: a shot far from the victim cannot support the hit; stale evidence expires', async () => {
  const r = await claimsRig();
  r.victim.pos.set(0, 0, 450); // the reach envelope is capped at 400 u (+ the claim slack)
  r.tick(); fire(r); r.tick();
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 0, 'victim 450 u beyond the projectile envelope');
  r.victim.pos.set(0, 0, 10);
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 1, 'control: in range');
  r.clock.advance(10);
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 1, 'evidence older than the projectile lifetime no longer counts');
});

test('#1665 hits from a rolling Roller need the owner\'s rolling flag and contact distance', async () => {
  const r = await claimsRig({ weapon: 'roller' });
  r.victim.pos.set(0, 0, 4);
  r.tick({ flags: 0 }); r.deliver(r.claim(100, 'roller'));
  assert.equal(hitCount(r), 0, 'not rolling');
  r.tick({ flags: 256 }); r.deliver(r.claim(100, 'roller'));
  assert.equal(hitCount(r), 1, 'rolling flag in the accepted owner snapshot');
  r.victim.pos.set(0, 0, 60); r.tick({ flags: 256 }); r.deliver(r.claim(100, 'roller'));
  assert.equal(hitCount(r), 1, 'body contact from 60 u away is not contact');
});

test('#1665 a Special claim needs the Special to be active in the owner snapshot', async () => {
  const r = await claimsRig({ weapon: 'shooter' });
  const special = r.attackerOnR.weapon.special;
  r.tick(); r.deliver(r.claim(100, special));
  assert.equal(hitCount(r), 0);
  r.tick({ advance: 0.5 }); // the waiting claim expires without a Special in the snapshot
  assert.equal(hitCount(r), 0);
  r.tick({ flags: 8192 }); r.deliver(r.claim(100, special));
  assert.equal(hitCount(r), 1, 'only the claim made while the Special is active lands');
});

test('#1665 forged evidence for another kit is not evidence: other weapons\' projectile births create no receipt', async () => {
  const r = await claimsRig({ weapon: 'shooter' });
  r.tick(); fire(r);
  const catalogId = Object.keys(r.f.WEAPONS).find(id => r.f.WEAPONS[id].kind === 'catalog' && id.includes('charger'));
  for (const e of r.nmA.out) if (e[1] === 'p') e[4] = catalogId; // owner stream claims a different weapon's projectile
  r.tick();
  assert.equal(r.ledger().actors.get(1)?.receipts.length ?? 0, 0);
  r.deliver(r.claim(36, 'shooter'));
  assert.equal(hitCount(r), 0);
});

test('#1665 locally retried hits (handoff) keep their existing path; the gate is for remote senders only', async () => {
  const r = await claimsRig();
  const message = r.claim(36, 'shooter');
  // _retryNackedHit re-routes a hit to this client only when the attacker is local (owner === myId).
  r.attackerOnR.owner = 'B'; r.attackerOnR.remote = false;
  r.nmR._hit(JSON.parse(JSON.stringify(message)), 'B');
  assert.equal(hitCount(r), 1);
  assert.equal(r.ledger()?.stats.wait ?? 0, 0, 'the retry never enters the evidence queue');
});

test('#1665 the evidence ledger is bounded and cleared with the NetMatch', async () => {
  const r = await claimsRig();
  r.tick();
  for (let n = 0; n < 60; n++) { fire(r); r.tick({ advance: 0.01 }); }
  const A = r.ledger().actors.get(1);
  assert.ok(A.receipts.length <= 96);
  r.nmR.dispose();
  assert.equal(r.nmR._combatClaims, null);
});

// ---- #1666 Boss Battle ---------------------------------------------------------------------------------------------
test('#1666 a guest cannot invent Boss body damage without attacking; the q watermark is not consumed', async () => {
  const r = await claimsRig({ boss: true });
  r.tick();
  r.deliver(r.bossClaim(120));
  assert.equal(r.bossHits.length, 0);
  assert.equal(r.nmR._peer('A').lastBossHit ?? 0, 0, 'a refused claim keeps its sequence number available');
  r.tick({ advance: 0.5 });
  assert.equal(r.bossHits.length, 0);
});

test('#1666 positive control: a real shot supports a Boss hit once, with damage under the weapon-and-multiplier ceiling', async () => {
  const r = await claimsRig({ boss: true });
  r.tick(); fire(r); r.tick();
  r.deliver(r.bossClaim(36));
  assert.equal(r.bossHits.length, 1);
  assert.equal(r.bossHits[0].d, 36);
  r.deliver(r.bossClaim(36)); r.deliver(r.bossClaim(36)); r.deliver(r.bossClaim(36));
  assert.ok(r.bossHits.length <= 3, 'one shot supports at most its per-receipt hits');
});

test('#1666 boss damage is capped by the equipped weapon (and weak-point / stun multipliers), not by 2000', async () => {
  const r = await claimsRig({ boss: true });
  r.tick(); fire(r); r.tick();
  r.deliver(r.bossClaim(2000)); r.deliver(r.bossClaim(900, { weak: true }));
  assert.equal(r.bossHits.length, 0);
  r.deliver(r.bossClaim(36 * 2.5, { weak: true })); // a weak-point Shooter hit: 36 * BOSS.weak
  assert.equal(r.bossHits.length, 1);
});

test('#1666 a weak-point claim needs an exposed weak point on the host boss', async () => {
  const r = await claimsRig({ boss: true });
  r.matchR.boss.model.hitShapes[1].active = false;
  r.tick(); fire(r); r.tick();
  r.deliver(r.bossClaim(90, { weak: true }));
  assert.equal(r.bossHits.length, 0);
  r.matchR.boss.model.hitShapes[1].active = true;
  r.deliver(r.bossClaim(90, { weak: true }));
  assert.equal(r.bossHits.length, 1);
});

test('#1666 wrong weapon, an impossible distance and crablet claims without an attack are refused', async () => {
  const r = await claimsRig({ boss: true });
  r.tick(); fire(r); r.tick();
  r.deliver(r.bossClaim(36, { cause: 'zipcaster' }));
  assert.equal(r.bossHits.length, 0, 'not this kit\'s Special');
  r.matchR.boss.pos.set(0, 0, 700);
  r.deliver(r.bossClaim(36));
  assert.equal(r.bossHits.length, 0, 'boss 700 u away from every projectile envelope');
  r.matchR.boss.pos.set(0, 0, 10);
  const c = await claimsRig({ boss: true });
  c.tick(); c.deliver(c.bossClaim(40, { cause: 'crab', crab: 7 }));
  assert.equal(c.bossHits.length, 0, 'a crablet hit with no attack at all');
  c.tick({ advance: 0.5 }); // the waiting claim expires; a later shot does not revive it
  assert.equal(c.bossHits.length, 0);
  c.tick(); fire(c); c.tick();
  c.deliver(c.bossClaim(40, { cause: 'crab', crab: 7 }));
  assert.equal(c.bossHits.length, 1, 'control: crablet hit with a real shot');
});

test('#1666 a Boss claim that outruns its evidence is applied once when the tick arrives; replayed q is still refused', async () => {
  const r = await claimsRig({ weapon: 'charger', boss: true });
  r.tick();
  r.asA(() => r.f.projectiles.fireCharger(r.attackerA, r.attackerA.weapon, 1));
  const claim = r.bossClaim(150, { cause: 'charger' });
  r.deliver(claim);
  assert.equal(r.bossHits.length, 0);
  r.tick();
  assert.equal(r.bossHits.length, 1);
  r.deliver(claim); r.tick();
  assert.equal(r.bossHits.length, 1, 'the sequence number was consumed only by the admitted claim');
});

// ---- pure core -------------------------------------------------------------------------------------------------------
test('admitClaim: budgets, victims and kinds are enforced per receipt', () => {
  const nm = { byNid: new Map(), _combatClaims: null };
  const actor = { nid: 9, weapon: { id: 'w1', sub: 'burst', special: 'inkjet' } };
  const tables = { mains: id => id === 'w1', catalog: () => false, subs: new Set(['burst']), specials: new Set(['inkjet']) };
  const hooks = { ceiling: () => 100 };
  const claim = (extra = {}) => ({ kind: 'pvp', actor, cause: 'w1', damage: 30, victimKey: 2, target: [0, 0, 10], slack: 8, ...extra });
  assert.equal(admitClaim(nm, 'A', claim(), 1, tables, hooks).verdict, 'wait', 'no evidence yet');
  nm._combatClaims.actors.set(9, { receipts: [{ kind: 'sub', origin: [0, 0, 0], reach: 50, expires: 5, credits: 2, used: 0, hits: new Map() }], standing: Object.create(null), window: [] });
  assert.equal(admitClaim(nm, 'A', claim(), 1, tables, hooks).verdict, 'wait', 'a sub receipt is not main evidence: the claim waits for matching evidence, then times out');
  assert.equal(admitClaim(nm, 'A', claim({ cause: 'burst' }), 1, tables, hooks).verdict, 'ok');
  assert.equal(admitClaim(nm, 'A', claim({ cause: 'burst' }), 1, tables, hooks).verdict, 'ok');
  assert.equal(admitClaim(nm, 'A', claim({ cause: 'burst' }), 1, tables, hooks).verdict, 'reject', 'credits exhausted');
  assert.equal(admitClaim(nm, 'A', claim({ cause: 'w1', damage: 500 }), 1, tables, hooks).reason, 'damage-over-equipped-ceiling');
  assert.equal(classifyCause(actor, 'inkjet', tables), 'special');
  assert.equal(classifyCause(actor, 'unknown-cause', tables), 'any');
  assert.equal(classifyCause(actor, 'unknown-cause', tables, { strict: true }), null);
});

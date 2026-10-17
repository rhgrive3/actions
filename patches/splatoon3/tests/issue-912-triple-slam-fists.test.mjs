import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tripleSlamFistCenters, tripleSlamFistDamage, tickTripleSlamFists,
  installTripleSlamFists, FIST_TRAVEL, FIST_FLAT_RISE, FIST_FLAT_IMPACT, FIST_ORPHAN_DEADLINE, FIST_STAMP_RADIUS, tripleSlamFistStamps,
} from '../runtime/triple-slam-fists.mjs';
import { getBoot } from './tidal-slam-fixture.mjs';

// #912 ground Triple Splashdown fists. Logic-only: no browser, GPU or Switch comparison.
// Synthetic world: fixed 60 Hz ticks through the production fist module.
// Composed world: the production installer on the real Actor/Physics/Projectiles.

test.after(async () => { (await getBoot()).close(); });

function world({ wall = false, victim = [0, 0, 5.6] } = {}) {
  const blasts = [], hits = [], paint = [], emits = [];
  class Vec {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Actor {
    constructor() {
      this.alive = true; this.remote = false; this.team = 0; this.weapon = { special: 'slam' };
      this.pos = new Vec(); this.yaw = 0; this.superJumpState = null; this.specialActive = null;
      this.color = 'orange'; this.turf = 0; this.mainImpacts = 0; this.ticks = 0;
    }
    _startSpecial() { this.specialActive = { id: 'slam', phase: 'rise' }; }
    _slamImpact() { this.mainImpacts++; }
    update(dt) { this.ticks++; return dt; }
    reset() { this.specialActive = null; }
    addTurfNoSpecial(amount) { this.turf += amount; }
  }
  const target = new Actor();
  target.team = 1; target.pos = new Vec(...victim);
  const G = {
    level: { groundHeight() { return 0; } },
    paint: { splat(pos, radius, team, opts) { paint.push({ x: pos.x, z: pos.z, radius, team, opts }); return 2; } },
    physics: { los(from, to) { return !wall || !(from.z < 3 && to.x < 0); } },
    actors: [target],
    projectiles: { applyHit(attacker, victimActor, damage, cause) { hits.push({ victim: victimActor, damage, cause }); } },
    fx: { explosion(pos, color, scale) { blasts.push([pos.x, pos.z, scale]); } },
  };
  const THREE = { Vector3: Vec };
  installTripleSlamFists({ Actor, G, THREE, emit: (type, payload) => emits.push({ type, payload }) },
    { weaponsFidelityCompletion: { worldUnitsPerSourceUnit: 1 } });
  return { Actor, G, THREE, target, blasts, hits, paint, emits };
}

test('#912 pinned 11.3.0 symmetric fist centers and discrete near/far damage bands', () => {
  const c = tripleSlamFistCenters({ x: 0, y: 0, z: 0 }, 0, 1);
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].x + 3.27) < 1e-8);
  assert.ok(Math.abs(c[1].x - 3.27) < 1e-8);
  assert.ok(Math.abs(c[0].z - c[1].z) < 1e-8);
  assert.ok(Math.abs(Math.hypot(c[0].x, c[0].z) - 6.54) < 1e-8);
  assert.equal(tripleSlamFistDamage(0), 220);
  assert.equal(tripleSlamFistDamage(6.4), 220);
  assert.equal(tripleSlamFistDamage(6.400001), 60);
  assert.equal(tripleSlamFistDamage(8), 60,'one outer explosion must leave a full-health target alive');
  assert.equal(tripleSlamFistDamage(9.6), 60);
  assert.equal(tripleSlamFistDamage(9.600001), 0);
  assert.equal(tripleSlamFistDamage(7.04,1.1),220);
  assert.equal(tripleSlamFistDamage(7.040001,1.1),60);
  assert.equal(tripleSlamFistDamage(10.56,1.1),60);
  assert.equal(tripleSlamFistDamage(10.560001,1.1),0);
  assert.equal(FIST_TRAVEL, 15 / 60, 'raw Pogo MoveFrame remains 15F');
  assert.equal(FIST_FLAT_RISE, 60 / 60, 'Pogo Rise_Frame');
  assert.equal(FIST_FLAT_IMPACT, 87 / 60, 'community activation-relative flat-ground fist contact');
});

test('#912 fist stamps are inside the 10-radius cluster and each stays under the remote admission ceiling', () => {
  const stamps = tripleSlamFistStamps(10);
  assert.ok(stamps.length >= 2 && stamps.length <= 40, `stamp count ${stamps.length}`);
  assert.ok(stamps.every(s => Math.hypot(s.dx, s.dz) <= 10));
  assert.ok(stamps.some(s => s.dx === 0 && s.dz === 0), 'the splat centre is always stamped');
  assert.ok(FIST_STAMP_RADIUS <= 3.744, 'stamp radius is admitted by PAINT_RADIUS_MAX (#522)');
  assert.deepEqual(tripleSlamFistStamps(0), []);
});

test('#912 flat-ground fists use independent activation-relative 87F even if player lands at 70F', () => {
  const w = world(), a = new w.Actor();
  a._startSpecial(); assert.equal(a.mainImpacts, 0); assert.equal(w.hits.length, 0);
  for (let i = 0; i < 70; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0, 'fists must not damage before the owner lands');
  a._slamImpact(); assert.equal(a.mainImpacts, 1);
  for (let i = 0; i < 16; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0);
  a.update(1 / 60);
  assert.equal(w.hits.length, 2, 'both fist contact zones independently damage');
  assert.ok(w.hits.every(h => h.damage === 220 && h.cause === 'slam'));
  const stamps = tripleSlamFistStamps(10).length;
  assert.equal(w.paint.length, 2 * stamps, 'each fist is a cluster of admissible stamps');
  assert.ok(w.paint.every(p => p.radius === FIST_STAMP_RADIUS && p.radius <= 3.744 && p.opts.claimMode === 'no-special' && p.opts.kind === undefined));
  assert.equal(a.turf, 2 * w.paint.length, 'fist paint accrues personal turf but never refills special');
  assert.equal(w.blasts.length, 2);
  assert.equal(w.emits.length, 0, 'special:slam would also trigger the boss 180/55 splash');
  assert.equal(a._s3TripleSlamFists, null);
  a.update(1 / 60); assert.equal(w.hits.length, 2, 'no second impact on later ticks');
});

test('#912 wall cover suppresses the blocked fist while the other fist remains active', () => {
  const w = world({ wall: true }), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 87; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 1);
  assert.equal(w.paint.length, tripleSlamFistStamps(10).length, 'only the uncovered fist paints');
});

test('#912 Super Jump Slam and remotely presented actors never instantiate fists', () => {
  const w = world(), a = new w.Actor(); a.superJumpState = { phase: 'flight' };
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 100; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0);
  assert.equal(w.paint.length, 0);
  const proxy = new w.Actor(); proxy.remote = true; proxy._startSpecial(); proxy._slamImpact();
  for (let i = 0; i < 100; i++) proxy.update(1 / 60);
  assert.equal(w.hits.length, 0);
});

test('#912 surviving fists still detonate after the owner is splatted before landing', () => {
  const w = world(), a = new w.Actor(); a._startSpecial(); a.alive = false;
  assert.equal(FIST_ORPHAN_DEADLINE, 87 / 60, 'community activation-to-fist deadline');
  for (let i = 0; i < 86; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0, 'never invent early fist damage before the independent deadline');
  a.update(1 / 60);
  assert.equal(w.hits.length, 2, 'both surviving fists independently hit despite player death');
  assert.ok(w.hits.every(h => h.cause === 'slam'));
  assert.equal(w.paint.length, 2 * tripleSlamFistStamps(10).length);
  assert.equal(a._s3TripleSlamFists, null);
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 2, 'the owner-death fallback cannot duplicate fist damage');
});

test('#912 splatting the player after a 70F landing cannot cancel either independently scheduled fist', () => {
  const w = world(), a = new w.Actor(); a._startSpecial();
  for (let i = 0; i < 70; i++) a.update(1 / 60);
  a._slamImpact();
  a.alive = false;
  for (let i = 0; i < 16; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0);
  a.update(1 / 60);
  assert.equal(w.hits.length, 2, 'the independent 17F post-landing timing persists through death');
});

test('#912 independently started fist reaches 87F regardless of 60Hz/120Hz subdivisions', () => {
  const w = world(), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 173; i++) a.update(1 / 120);
  assert.equal(w.hits.length, 0, 'before 87F absolute activation time');
  a.update(1 / 120);
  assert.equal(w.hits.length, 2, 'fires at 87F absolute activation time');
});

test('#912 overlapping fist explosions stack: a victim between both fists takes 440 (above the 100+ overlap threshold)', () => {
  const w = world({ victim: [0, 0, 5.664] }), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 87; i++) a.update(1 / 60);
  const total = w.hits.reduce((sum, h) => sum + h.damage, 0);
  assert.equal(w.hits.length, 2);
  assert.ok(total >= 100, `stacked overlap ${total}`);
  assert.equal(total, 440);
});

test('#912 composed production Tidal Slam: fists complete their own 87F clock independently of player impact', async () => {
  const f = await getBoot();
  f.G.actors = [];
  const a = f.make();
  const fistVictim = f.make({ team: 1, pos: [3.27, 0, 5.664] });
  const playerVictim = f.make({ team: 1, pos: [0, 0, -4] });
  fistVictim.hp = 1000; playerVictim.hp = 1000;
  const hits = [], applyHit = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = (owner, victim, amount, cause) => hits.push({ victim, amount, cause });
  try {
    a.special = a.specialCost(); a.intent.special = true; f.tick(a); a.intent.special = false;
    assert.equal(a.specialActive?.id, 'slam');
    for (let i = 0; i < 180 && a.specialActive; i++) f.tick(a);
    assert.equal(a.specialActive, null, 'player landed');
    const playerHits = hits.filter(h => h.victim === playerVictim);
    assert.equal(playerHits.length, 1, 'player blast hits the behind-victim once, at landing');
    const landingHits = hits.filter(h => h.victim === fistVictim).length;
    assert.equal(landingHits, 1, 'the 9.6u main blast already reaches this victim at landing');
    const already = a._s3TripleSlamFists?.age ?? 0;
    const till87 = Math.ceil((FIST_FLAT_IMPACT - already) * 60 - 1e-9);
    assert.ok(till87 > 0 && till87 < 87, 'player ground impact is distinct from the later 87F fist clock');
    f.tick(a, till87 - 1);
    assert.equal(hits.filter(h => h.victim === fistVictim).length, landingHits, 'no fists before absolute 87F');
    f.tick(a, 1);
    const fistHits = hits.filter(h => h.victim === fistVictim).slice(landingHits);
    assert.equal(fistHits.length, 2, 'both fists damage the victim when their independent 87F clock ends');
    assert.ok(fistHits.every(h => h.cause === 'slam' && [60,220].includes(h.amount)));
    assert.ok(fistHits.reduce((s, h) => s + h.amount, 0) >= 100);
    assert.equal(hits.filter(h => h.victim === playerVictim).length, 1, 'player blast is not duplicated');
  } finally {
    f.G.projectiles.applyHit = applyHit;
  }
});

test('#912 composed main/Super Jump Slam uses source damage endpoints independently of paint width', async () => {
  const f = await getBoot();
  const { G, SPECIALS } = f;
  const prev = G.actors;
  G.actors = [];
  const owner = f.make();
  const near = f.make({ team: 1, pos: [6.4, 0, 0] });
  const mid = f.make({ team: 1, pos: [8, 0, 0] });
  const far = f.make({ team: 1, pos: [9.6, 0, 0] });
  const outside = f.make({ team: 1, pos: [9.61, 0, 0] });
  const hits = [], originalHit = G.projectiles.applyHit, originalLOS = G.physics.los;
  G.projectiles.applyHit = (attacker, victim, damage, cause) => hits.push({ attacker, victim, damage, cause });
  G.physics.los = () => true;
  try {
    assert.equal(SPECIALS.slam.damageNearRadius, 6.4);
    assert.equal(SPECIALS.slam.damageRadius, 9.6);
    assert.equal(SPECIALS.slam.radius, 5.2, 'paint radius is unchanged; network admission must not change implicitly');
    owner._slamImpact(SPECIALS.slam);
    const damage = victim => hits.find(h => h.victim === victim)?.damage;
    assert.equal(damage(near), 220);
    assert.ok(Math.abs(damage(mid) - 140) < 1e-8, 'between 6.4 and 9.6 damage interpolates linearly');
    assert.ok(Math.abs(damage(far) - 60) < 1e-8);
    assert.equal(damage(outside), undefined);
    assert.ok(hits.every(h => h.attacker === owner && h.cause === 'slam'));
  } finally {
    G.projectiles.applyHit = originalHit; G.physics.los = originalLOS;
    // This shared VM fixture otherwise leaves detached meshes in G.scene.
    for (const a of G.actors) {
      G.scene.remove(a.character.root);
      a.character.dispose?.();
    }
    G.actors = prev;
  }
});

test('#912 actual composed Actor.splat before landing preserves two damaging fists', async () => {
  const f = await getBoot();
  f.G.actors = [];
  const owner = f.make();
  const attacker = f.make({ team: 1, pos: [20, 0, 0] });
  const victim = f.make({ team: 1, pos: [0, 0, 5.664] });
  const hits = [], previousHit = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = (source, target, amount, cause) => {
    if (source === owner && target === victim) hits.push([amount, cause]);
  };
  try {
    owner.special = owner.specialCost();
    owner.intent.special = true;
    f.tick(owner);
    owner.intent.special = false;
    assert.ok(owner._s3TripleSlamFists, 'normal special creates independent fist state');
    owner.splat(attacker, 'shooter');
    assert.equal(owner.alive, false);
    assert.equal(owner.specialActive, null, 'native death cancels only the user action');
    f.tick(owner, 86);
    assert.equal(hits.length, 0, 'no early after-death fist hit');
    f.tick(owner);
    assert.equal(hits.length, 2, 'both live fists finish despite native death');
    assert.ok(hits.every(([dmg, cause]) => dmg === 220 && cause === 'slam'));
    assert.equal(owner._s3TripleSlamFists, null);
  } finally {
    f.G.projectiles.applyHit = previousHit;
  }
});

test('#912 S3 production bootstrap installs the fist owner after the ordinary special phases', () => {
  const file = fileURLToPath(new URL('../runtime/install.mjs', import.meta.url));
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /installTripleSlamFists\(api, profile\)/);
});

test('#912 player who never lands does not freeze independently moving fists at the documented 87F', () => {
  const w = world(), a = new w.Actor(); a._startSpecial();
  for (let i=0;i<86;i++) a.update(1/60);
  assert.equal(w.hits.length,0);
  assert.equal(a.mainImpacts,0);
  a.update(1/60);
  assert.equal(w.hits.length,2);
  assert.equal(a.mainImpacts,0,'no synthetic human impact is fabricated');
});

test('#912 actual late body collision cannot duplicate or postpone fist hit', () => {
  const w = world(), a = new w.Actor(); a._startSpecial();
  for (let i=0;i<87;i++) a.update(1/60);
  assert.equal(w.hits.length,2);
  a._slamImpact();
  assert.equal(a.mainImpacts,1);
  for (let i=0;i<40;i++) a.update(1/60);
  assert.equal(w.hits.length,2,'late body landing cannot schedule another pair');
});

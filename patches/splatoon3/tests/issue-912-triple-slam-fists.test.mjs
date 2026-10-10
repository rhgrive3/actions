import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tripleSlamFistCenters, tripleSlamFistDamage, tickTripleSlamFists,
  installTripleSlamFists, FIST_TRAVEL,
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

test('#912 pinned 11.3.0 symmetric fist centers and near/far damage endpoints', () => {
  const c = tripleSlamFistCenters({ x: 0, y: 0, z: 0 }, 0, 1);
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].x + 3.27) < 1e-8);
  assert.ok(Math.abs(c[1].x - 3.27) < 1e-8);
  assert.ok(Math.abs(c[0].z - c[1].z) < 1e-8);
  assert.ok(Math.abs(Math.hypot(c[0].x, c[0].z) - 6.54) < 1e-8);
  assert.equal(tripleSlamFistDamage(0), 220);
  assert.equal(tripleSlamFistDamage(6.4), 220);
  assert.equal(tripleSlamFistDamage(9.6), 60);
  assert.equal(tripleSlamFistDamage(9.600001), 0);
  assert.equal(FIST_TRAVEL, 15 / 60);
});

test('#912 native impact is separate from the two fists, delayed by exactly 15F, and emits no boss-visible special:slam', () => {
  const w = world(), a = new w.Actor();
  a._startSpecial(); assert.equal(a.mainImpacts, 0); assert.equal(w.hits.length, 0);
  for (let i = 0; i < 70; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0, 'fists must not damage before the owner lands');
  a._slamImpact(); assert.equal(a.mainImpacts, 1);
  for (let i = 0; i < 14; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0);
  a.update(1 / 60);
  assert.equal(w.hits.length, 2, 'both fist contact zones independently damage');
  assert.ok(w.hits.every(h => h.damage === 220 && h.cause === 'slam'));
  assert.equal(w.paint.length, 2);
  assert.ok(w.paint.every(p => p.radius === 10 && p.opts.claimMode === 'no-special' && p.opts.kind === undefined));
  assert.equal(a.turf, 4, 'fist paint accrues personal turf but never refills special');
  assert.equal(w.blasts.length, 2);
  assert.equal(w.emits.length, 0, 'special:slam would also trigger the boss 180/55 splash');
  assert.equal(a._s3TripleSlamFists, null);
  a.update(1 / 60); assert.equal(w.hits.length, 2, 'no second impact on later ticks');
});

test('#912 wall cover suppresses the blocked fist while the other fist remains active', () => {
  const w = world({ wall: true }), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 15; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 1);
  assert.equal(w.paint.length, 1);
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

test('#912 owner splatted before landing cancels the pending fists (no fist-only blast is invented)', () => {
  const w = world(), a = new w.Actor(); a._startSpecial(); a.alive = false;
  for (let i = 0; i < 200; i++) a.update(1 / 60);
  assert.equal(w.hits.length, 0);
  assert.equal(a._s3TripleSlamFists, null);
});

test('#912 fist delay is time-based: 30 sub-steps of 1/120 s fire at the same 0.25 s as 15 ticks of 1/60 s', () => {
  const w = world(), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 29; i++) a.update(1 / 120);
  assert.equal(w.hits.length, 0, 'not before 0.25 s');
  a.update(1 / 120);
  assert.equal(w.hits.length, 2, 'fires at 0.25 s');
});

test('#912 overlapping fist explosions stack: a victim between both fists takes 440 (above the 100+ overlap threshold)', () => {
  const w = world({ victim: [0, 0, 5.664] }), a = new w.Actor();
  a._startSpecial(); a._slamImpact();
  for (let i = 0; i < 15; i++) a.update(1 / 60);
  const total = w.hits.reduce((sum, h) => sum + h.damage, 0);
  assert.equal(w.hits.length, 2);
  assert.ok(total >= 100, `stacked overlap ${total}`);
  assert.equal(total, 440);
});

test('#912 composed production Tidal Slam: fists explode 15F after landing, separate from the player blast', async () => {
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
    assert.equal(hits.filter(h => h.victim === fistVictim).length, 0, 'no fist damage before 15F');
    f.tick(a, 14);
    assert.equal(hits.filter(h => h.victim === fistVictim).length, 0, 'still no fist damage at 14F');
    f.tick(a, 1);
    const fistHits = hits.filter(h => h.victim === fistVictim);
    assert.equal(fistHits.length, 2, 'both fists damage the victim independently');
    assert.ok(fistHits.every(h => h.cause === 'slam' && h.amount > 60 && h.amount <= 220));
    assert.ok(fistHits.reduce((s, h) => s + h.amount, 0) >= 100);
    assert.equal(hits.filter(h => h.victim === playerVictim).length, 1, 'player blast is not duplicated');
  } finally {
    f.G.projectiles.applyHit = applyHit;
  }
});

test('#912 S3 production bootstrap installs the fist owner after the ordinary special phases', () => {
  const file = fileURLToPath(new URL('../runtime/install.mjs', import.meta.url));
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /installTripleSlamFists\(api, profile\)/);
});

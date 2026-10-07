// #729 — Splatoon 3 Ver.11.3.0 resolves an impact-triggered Blaster blast one fixed frame
// after the contact (tick N impact -> tick N+1 burst), so a target can move between the two
// frames. This drives the authentic Projectiles system (fixture-built native classes,
// adapter-patched source, installed runtime wrappers) against a thin-wall / ground world and
// records the fixed tick of every event: contact must apply no radial damage, the burst and
// its damage resolve exactly at R+1, direct victim hits and the natural timed air burst keep
// their own tick, and render cadence cannot change the fixed-tick order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const WALL = 1.9;

// axis 'y' = ground plane (falls into the floor), axis 'z' = thin vertical wall at z = WALL.
async function scene({ axis, victim, shot }) {
  const f = await fixture();
  const shooter = f.make('blaster');
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.actors = [shooter];
  f.G.match.canRespawn = () => false;
  const e = f.make();
  e.team = 1; e.invuln = 0; e.hp = 100; e.pos.set(victim.x, victim.y, victim.z);
  f.G.actors.push(e);
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  const ev = { contact: -1, boom: [], hp: [] };
  let tick = 0;
  // The thin-wall/ground world: one plane, reached through the swept query fallback
  // (physics.segment) exactly like the shipped level query would report it.
  f.G.physics.segment = (from, to, out = new f.Hit()) => {
    out.hit = false;
    if (axis === 'z' && from.z < WALL && to.z >= WALL) { out.hit = true; out.point.set(0, from.y, WALL); out.normal.set(0, 0, -1); }
    if (axis === 'y' && from.y > 0 && to.y <= 0) { out.hit = true; out.point.set(to.x, 0, to.z); out.normal.set(0, 1, 0); }
    out.block = -1; out.face = -1;
    if (out.hit && ev.contact < 0) ev.contact = tick;
    return out;
  };
  f.G.fx = { burst() {}, explosion: () => ev.boom.push(tick) };
  const p = ps._new();
  Object.assign(p, { type: 'blast', owner: shooter, team: 0, radius: 1, seed: .5, wid: 'blaster',
    damage: 40, size: .35, age: 0, life: 5, straight: 999, grav: 0, drag: 0, trailEvery: 0, delay: 0 });
  shot(p);
  p.prev.copy(p.pos); p.start.copy(p.pos);
  ps.list.push(p);
  const step = after => { tick++; ps.update(1 / 60); if (after) after(); ev.hp.push(e.hp); };
  return { f, e, p, ps, ev, step, tick: () => tick };
}

const fall = p => { p.pos.set(0, 1.5, 0.6); p.vel.set(0, -60, 0); };
const wallShot = p => { p.pos.set(0, 1.0, 1.2); p.vel.set(0, 0, 18); };
const GROUND_VICTIM = { x: 1, y: 0, z: .6 };
const AIR_VICTIM = { x: 1, y: 1, z: 2.2 };

test('#729 ground contact: no radial damage in the contact tick; burst and damage at R+1', async () => {
  const s = await scene({ axis: 'y', victim: GROUND_VICTIM, shot: fall });
  while (s.ev.contact < 0 && s.tick() < 30) s.step();
  assert.ok(s.ev.contact > 0, 'the projectile reached the ground');
  assert.equal(s.e.hp, 100, 'no radial damage in the contact tick');
  assert.equal(s.ev.boom.length, 0, 'no burst FX in the contact tick');
  s.step();
  assert.equal(s.tick(), s.ev.contact + 1, 'the burst resolves exactly one fixed frame later');
  assert.ok(s.e.hp < 100, 'terrain burst damage lands at R+1');
  assert.equal(s.ev.boom.length, 1, 'exactly one burst');
  s.step(); s.step();
  assert.equal(s.ev.boom.length, 1, 'the burst is never repeated');
  assert.ok(!s.ps.s3BlastQueue?.length, 'the pending queue is drained');
});

test('#729 thin-wall contact with an airborne victim keeps the same one-frame order', async () => {
  const s = await scene({ axis: 'z', victim: AIR_VICTIM, shot: wallShot });
  while (s.ev.contact < 0 && s.tick() < 30) s.step();
  assert.ok(s.ev.contact > 0, 'the projectile reached the wall');
  assert.equal(s.e.hp, 100, 'no radial damage in the contact tick');
  assert.equal(s.ev.boom.length, 0, 'no burst FX in the contact tick');
  s.step();
  assert.equal(s.tick(), s.ev.contact + 1);
  assert.ok(s.e.hp < 100, 'airborne victim takes the burst at R+1');
  assert.equal(s.ev.boom.length, 1);
});

test('#729 a victim crossing the blast boundary between R and R+1 is sampled at R+1', async () => {
  // Inside at contact, moved clear between R and R+1: never damaged.
  const leaving = await scene({ axis: 'y', victim: GROUND_VICTIM, shot: fall });
  while (leaving.ev.contact < 0 && leaving.tick() < 30) leaving.step();
  assert.equal(leaving.e.hp, 100, 'still nothing in the contact tick');
  leaving.e.pos.set(6, 0, 6);            // the target clears the radius between the two frames
  leaving.step();
  assert.equal(leaving.e.hp, 100, 'the R+1 evaluation sees the victim outside the radius');
  // Outside at contact, moved inside between R and R+1: damaged at R+1.
  const entering = await scene({ axis: 'y', victim: { x: 6, y: 0, z: 6 }, shot: fall });
  while (entering.ev.contact < 0 && entering.tick() < 30) entering.step();
  assert.equal(entering.e.hp, 100, 'nothing in the contact tick either');
  entering.e.pos.set(1, 0, .6);          // the target enters the radius between the two frames
  entering.step();
  assert.ok(entering.e.hp < 100, 'the R+1 evaluation sees the victim inside the radius');
  assert.equal(entering.ev.boom.length, 1, 'still exactly one burst');
});

test('#729 direct victim hits and the natural timed air burst keep their own tick', async () => {
  // Direct hit: the enemy stands in the flight path, so the burst stays part of the contact.
  const direct = await scene({ axis: 'y', victim: { x: 0, y: 0, z: .6 }, shot: fall });
  direct.step();
  assert.ok(direct.e.hp < 100, 'direct hit damage is applied in its own tick');
  assert.equal(direct.ev.boom.length, 1, 'the direct burst fires immediately');
  assert.ok(!direct.ps.s3BlastQueue?.length, 'a direct hit queues nothing');
  // Natural timed mid-air explosion: no contact, so nothing may be deferred.
  const timed = await scene({ axis: 'y', victim: { x: 1, y: 0, z: .6 }, shot: p => { p.pos.set(0, 1.5, .6); p.vel.set(0, 60, 0); p.life = 0.0005; } });
  timed.step();
  assert.ok(timed.e.hp < 100, 'the lifetime explosion resolves in its own tick');
  assert.equal(timed.ev.boom.length, 1, 'the lifetime burst is immediate');
  assert.ok(!timed.ps.s3BlastQueue?.length, 'the lifetime burst queues nothing');
});

test('#729 30/60/120 Hz render cadence keeps the one-fixed-tick ordering', async () => {
  const deltas = [];
  for (const hz of [30, 60, 120]) {
    const s = await scene({ axis: 'y', victim: GROUND_VICTIM, shot: fall });
    const clock = new FixedClock();
    let contact = -1, damage = -1;
    for (let i = 0; i < hz * 2 && damage < 0; i++) {
      clock.advance(1 / hz, () => {
        s.step();
        if (s.ev.contact >= 0 && contact < 0) contact = s.tick();
        if (s.e.hp < 100 && damage < 0) damage = s.tick();
      });
    }
    assert.ok(contact > 0 && damage > 0, `hz ${hz}: contact ${contact} damage ${damage}`);
    deltas.push(damage - contact);
  }
  assert.deepEqual(deltas, [1, 1, 1], 'the blast is exactly one fixed frame after contact at every render cadence');
});

test('#729 Projectiles.clear() drops pending terrain blast without resolving; rematch/next tick applies no stale damage or paint and fresh shot bursts at N+1', async () => {
  const s = await scene({ axis: 'z', victim: AIR_VICTIM, shot: wallShot });
  const splats = [];
  s.f.G.paint.splat = (...args) => { splats.push(args); return 1.5; };
  s.f.G.physics.raycast = (_from, _dir, _dist, out = new s.f.Hit()) => {
    out.hit = true;
    out.point.set(0, 0, WALL);
    out.normal.set(0, 1, 0);
    return out;
  };

  while (s.ev.contact < 0 && s.tick() < 30) s.step();
  assert.ok(s.ev.contact > 0, 'the initial projectile reached the wall');
  assert.equal(s.ps.s3BlastQueue?.length, 1, 'terrain contact queues 1 pending blast');
  assert.equal(s.ev.boom.length, 0, 'no radial explosion in contact tick');
  assert.equal(s.e.hp, 100, 'no radial damage in contact tick');
  assert.deepEqual(splats.map(s => s[1]), [2.2, 1.3], 'separate wall impact and drop shock; no burst paint yet');

  // Rematch / round reset clears projectiles
  s.ps.clear();
  assert.equal(s.ps.s3BlastQueue, null, 'clear drops s3BlastQueue without resolving');
  assert.equal(s.ps.list.length, 0, 'projectile list is cleared');

  // Next tick (the old N+1 tick) must NOT execute the old blast
  s.step();
  assert.equal(s.ev.boom.length, 0, 'no stale explosion FX after clear');
  assert.equal(s.e.hp, 100, 'no stale blast damage after clear');
  assert.equal(splats.length, 2, 'no stale burst paint splat after clear');
  assert.equal(s.ps.s3BlastQueue, null, 'queue remains empty and retains no actor references');

  // Fresh re-entry / new launch in the new match
  const freshShooter = s.f.make('blaster');
  freshShooter.team = 0;
  const freshP = s.ps._new();
  Object.assign(freshP, { type: 'blast', owner: freshShooter, team: 0, radius: 1, seed: .5, wid: 'blaster',
    damage: 40, size: .35, age: 0, life: 5, straight: 999, grav: 0, drag: 0, trailEvery: 0, delay: 0 });
  wallShot(freshP);
  freshP.prev.copy(freshP.pos); freshP.start.copy(freshP.pos);
  s.ps.list.push(freshP);

  let freshContact = -1;
  const origSegment = s.f.G.physics.segment;
  s.f.G.physics.segment = (from, to, out) => {
    const res = origSegment(from, to, out);
    if (res.hit && freshContact < 0) freshContact = s.tick();
    return res;
  };

  while (freshContact < 0 && s.tick() < 60) s.step();
  assert.ok(freshContact > 0, 'fresh projectile reached the wall');
  assert.equal(s.ps.s3BlastQueue?.length, 1, 'fresh terrain contact queues 1 blast');
  assert.equal(s.ev.boom.length, 0, 'no explosion at fresh contact tick N');
  assert.equal(s.e.hp, 100, 'no damage at fresh contact tick N');
  assert.deepEqual(splats.map(s => s[1]), [2.2, 1.3, 2.2, 1.3], 'fresh wall impact and shock only');

  // Next fixed frame (tick N+1 for fresh shot)
  s.step();
  assert.equal(s.tick(), freshContact + 1, 'fresh burst resolves at N+1');
  assert.equal(s.ev.boom.length, 1, 'fresh burst explosion FX fired at N+1');
  assert.ok(s.e.hp < 100, 'fresh burst damage applied at N+1');
  assert.equal(splats.length, 5, 'fresh burst paint splat applied at N+1');
  assert.ok(!s.ps.s3BlastQueue?.length, 'queue is drained after resolution');
});

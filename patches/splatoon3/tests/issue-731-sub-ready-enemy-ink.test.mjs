// #731: a held sub weapon is an attack/ready state, so enemy-ink movement must
// follow OpInk_MoveVel_Shot and not the ordinary OpInk_MoveVel walk curve.
// Real public modules plus the build adapter; no fake game model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { enemyInkAttackReady, gearCurve } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}${m ? ` (${m})` : ''}`);

const loadout = (ability, points) => {
  const parts = Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
  if (points === 57) for (const part of parts) { part.main = ability; part.subs.fill(ability); }
  else if (points === 10) parts[0].main = ability;
  return parts;
};

// The cap the grounded movement model actually reads, observed on the real
// PLAYER object during Actor._horizontal instead of inferred from velocity.
// The scoped writer emits a fixed access pattern per tick — read the shared
// base, write the selected curve, read it back for the movement model, apply
// the Flow multiplier, restore the base. The movement model owns access 3.
function spyCap(f) {
  const log = [];
  let store = f.PLAYER.enemyInkSpeed;
  Object.defineProperty(f.PLAYER, 'enemyInkSpeed', {
    configurable: true, get() { log.push(['get', store]); return store; }, set(v) { log.push(['set', v]); store = v; },
  });
  return log;
}

// Drives the real Actor.update, so intent.fire/sub, form and onEnemy all come
// from production code. Returns the per-tick cap the movement model applied.
async function trace({ points = 0, mode, ticks = 90, hz = 60, weapon = 'shooter', hold = Infinity, isLocal = false, resetAt = -1 }) {
  const f = await fixture();
  f.G.paint.sample = () => 2;                      // enemy ink under the feet
  f.G.projectiles.throwBomb = () => 0;
  const a = f.make(weapon);
  a.isLocal = isLocal;
  if (points !== 0) { a.s3.loadout = loadout('inkResistance', points); a.setWeapon(weapon); }
  a.intent.move.set(0, 0, 1); a.vel.set(0, 0, 0);
  const log = spyCap(f);
  const step = dt => {
    if (mode === 'fire') a.intent.fire = true;
    if (mode === 'sub' || mode === 'squidSub') a.intent.sub = a.ticks < hold;
    if (mode === 'squidSub') a.intent.squid = a.ticks < hold;
    // a.ticks is the 0-based update index, so caps[i] is the selection made by
    // update i and a reset at resetAt lands on caps[resetAt].
    if (a.ticks === resetAt) a.reset();
    a.ticks++;
    a.update(dt);
    log.onTick();
  };
  a.ticks = 0;
  const perTick = [];
  log.onTick = () => perTick.push(log.splice(0));
  if (hz === 60) for (let i = 0; i < ticks; i++) step(DT);
  else {
    const clock = new FixedClock();
    for (let frame = 0; frame < Math.ceil(ticks / 60 * hz); frame++) clock.advance(1 / hz, step);
  }
  // Access 2 of each tick is the scoped write: the curve the runtime selected.
  // Access 3 is the read the grounded movement model performs, which only
  // happens while the actor actually stands in enemy ink.
  const caps = perTick.filter(entries => entries.length).map(entries => {
    assert.ok(entries.length === 6 || entries.length === 5, 'unexpected scoped enemy-ink access pattern');
    assert.equal(entries[1][0], 'set', 'the runtime must select a curve');
    if (entries.length === 6) assert.equal(entries[2][0], 'get', 'the movement model must read the scoped cap');
    return entries[1][1];
  });
  return { f, a, caps, ticks: a.ticks, settled: a.vel.length() };
}

// Sourced expectations straight from the pinned 11.3.0 profile curves, so the
// test never needs to assume an INKWAVE world scale of its own.
const walkCap = (f, ap) => gearCurve(ap, ...f.profile.gear.inkResistance) * 60;
const shotCap = (f, ap) => gearCurve(ap, ...f.profile.gearExtra.enemyShotSpeed) * 60;

test('#731 the two enemy-ink curves stay sourced to the pinned 11.3.0 parameters', async () => {
  const f = await fixture();
  for (const key of ['gear.inkResistance.2', 'gearExtra.enemyShotSpeed.2']) {
    const binding = f.profile.bindings[key];
    assert.ok(binding, `missing binding ${key}`);
    assert.equal(f.profile.references ? undefined : undefined, undefined);
  }
  assert.match(f.profile.bindings['gear.inkResistance.2'].parameter, /OpInk_MoveVel$/);
  assert.match(f.profile.bindings['gearExtra.enemyShotSpeed.2'].parameter, /OpInk_MoveVel_Shot$/);
  // At 0 AP the attack/ready curve is exactly half the ordinary curve.
  near(shotCap(f, 0) / walkCap(f, 0), 0.5, '0 AP ratio');
  assert.ok(shotCap(f, 57) < walkCap(f, 57), 'attack/ready never exceeds ordinary');
});

test('#731 a held sub selects the attack/ready curve while walking and firing keep theirs', async () => {
  const f = await fixture();
  for (const ap of [0, 10, 57]) {
    const walk = await trace({ points: ap, mode: 'walk' });
    near(walk.caps.at(-1), walkCap(f, ap), `AP ${ap} walk`);
    const fire = await trace({ points: ap, mode: 'fire' });
    near(fire.caps.at(-1), shotCap(f, ap), `AP ${ap} fire`);
    const sub = await trace({ points: ap, mode: 'sub' });
    near(sub.caps.at(-1), shotCap(f, ap), `AP ${ap} held sub`);
    assert.equal(sub.a.weaponRunner.aimingSub, true);
    // The walk curve must not survive the ready state.
    assert.ok(!sub.caps.slice(1).some(c => Math.abs(c - walkCap(f, ap)) < 1e-9),
      `AP ${ap} leaked the ordinary curve while the sub was held`);
  }
});

test('#731 the settled speed in enemy ink matches the selected curve at 0 and 57 AP', async () => {
  const f = await fixture();
  for (const ap of [0, 57]) {
    near((await trace({ points: ap, mode: 'walk' })).settled, walkCap(f, ap), `AP ${ap} walk speed`);
    near((await trace({ points: ap, mode: 'sub' })).settled, shotCap(f, ap), `AP ${ap} sub speed`);
  }
});

test('#731 releasing the sub leaves the attack/ready curve exactly once with no leak', async () => {
  const run = await trace({ mode: 'sub', ticks: 90, hold: 40 });
  // One entry when the weapon becomes ready, one exit when it is released.
  const changes = run.caps.filter((c, i) => i && c !== run.caps[i - 1]);
  assert.deepEqual(changes, [0.72, 1.44], 'entered once, left once');
  assert.equal(run.a.weaponRunner.aimingSub, false);
  near(run.settled, 1.44, 'ordinary curve after release');
  // Every tick of the ready state stays on the attack/ready curve: once the
  // weapon is ready, the ordinary curve must never reappear before release.
  const firstReady = run.caps.findIndex(c => Math.abs(c - 0.72) < 1e-9);
  const released = run.caps.findIndex((c, i) => i && Math.abs(c - 1.44) < 1e-9);
  assert.ok(firstReady >= 0 && released > firstReady, 'release must follow the ready state');
  assert.ok(run.caps.slice(firstReady, released).every(c => Math.abs(c - 0.72) < 1e-9),
    'the ready state must not leak the ordinary curve');
  assert.ok(run.caps.slice(released).every(c => Math.abs(c - 1.44) < 1e-9),
    'the ordinary curve must not reappear after the release');
});

test('#731 squid form holding sub does not inherit the grounded attack/ready branch', async () => {
  const f = await fixture();
  const run = await trace({ mode: 'squidSub', ticks: 60 });
  assert.equal(run.a.form, 'squid');
  assert.equal(run.a.weaponRunner.aimingSub, false);
  near(run.caps.at(-1), walkCap(f, 0), 'squid keeps the ordinary curve');
});

test('#731 readiness is read from weapon state, not the raw button', () => {
  assert.equal(enemyInkAttackReady({ intent: { fire: false }, weaponRunner: { aimingSub: false } }), false);
  assert.equal(enemyInkAttackReady({ intent: { fire: true }, weaponRunner: { aimingSub: false } }), true);
  assert.equal(enemyInkAttackReady({ intent: { fire: false }, weaponRunner: { aimingSub: true } }), true);
  // Held button without a ready weapon must not select the attack/ready curve.
  assert.equal(enemyInkAttackReady({ intent: { fire: false, sub: true }, weaponRunner: { aimingSub: false } }), false);
  assert.equal(enemyInkAttackReady(undefined), false);
  assert.equal(enemyInkAttackReady({}), false);
});

test('#731 30/60/120 Hz render schedules make the same fixed-tick state selection', async () => {
  const f = await fixture();
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const run = await trace({ points: 57, mode: 'sub', ticks: 120, hz });
    assert.equal(run.ticks, 120, `${hz} Hz tick count`);
    traces.push(run.caps.slice(0, 120));
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
  assert.equal(traces[0].at(-1), shotCap(f, 57));
});

test('#731 a reset clears the sub ready state before the weapon re-arms', async () => {
  const f = await fixture();
  const RESET = 40;
  const run = await trace({ points: 57, mode: 'sub', ticks: 60, resetAt: RESET });
  // The sub is held for the whole run, so only the reset can end the ready state.
  near(run.caps[RESET - 1], shotCap(f, 57), 'attack/ready curve before the reset');
  near(run.caps[RESET], walkCap(f, 57), 'the reset tick must fall back to the ordinary curve');
  assert.equal(run.a.weaponRunner.aimingSub, true, 'the still-held sub re-arms after the reset');
  near(run.caps[RESET + 1], shotCap(f, 57), 'attack/ready curve after re-arming');
  // The equipment survived the reset, so the ordinary curve is the equipped one.
  near(walkCap(f, 57), 4.608);
});

test('#731 a remote opponent gets the same curve and visual-only state cannot own it', async () => {
  const local = await trace({ mode: 'sub', ticks: 60, isLocal: true });
  const remote = await trace({ mode: 'sub', ticks: 60, isLocal: false });
  assert.equal(remote.a.isLocal, false);
  // Remote actors really move, so the ready state must select the same curve.
  assert.deepEqual(remote.caps.slice(1), local.caps.slice(1), 'remote and local selection must agree');
  assert.notEqual(remote.caps.at(-1), remote.a.s3.modifiers.enemyMoveSpeed);
  // Presentation-only channels must never select the gameplay curve.
  assert.equal(enemyInkAttackReady({
    intent: { fire: false }, weaponRunner: { aimingSub: false },
    character: { wSub: 1, bombHeld: 999 }, s3: { subAim: true },
  }), false, 'visual-only sub state must not own enemy-ink movement');
});

test('#731 the scoped enemy-ink cap never leaks into shared state or another actor', async () => {
  const f = await fixture();
  const shared = f.PLAYER.enemyInkSpeed;
  const a = f.make('shooter'), b = f.make('shooter');
  b.team = 1;
  a.s3.loadout = loadout('inkResistance', 57); a.setWeapon('shooter');
  a.intent.fire = true;
  a.vel.set(0, 0, 0); a.intent.move.set(0, 0, 1);
  a._horizontal(DT, false, true);
  near(f.PLAYER.enemyInkSpeed, shared, 'restored after the scoped write');
  // The unequipped actor is unaffected by the other's equipment.
  b.vel.set(0, 0, 0);
  b._horizontal(DT, false, true);
  near(f.PLAYER.enemyInkSpeed, shared);
  assert.notEqual(a.s3.modifiers.enemyShotSpeed, b.s3.modifiers.enemyShotSpeed);
});

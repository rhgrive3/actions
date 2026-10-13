import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Runs the production adapter/installer composition, or the exact emitted
// modules when INKWAVE_BUILT_SITE is set. No replacement movement/special logic.
async function world() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: `
      export { installRanked, buildFrame } from './patches/splatoon3/runtime/ranked/install.mjs';
      export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
      export { Match } from './inkwave-public/src/game/match.js';
      export { toxicMistScale } from './patches/splatoon3/runtime/toxic-mist.mjs';
      export { inkVacState, inkVacAbsorbCandidate, replayInkVac, INK_VAC_EVENTS } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
    ` });
  f.context.structuredClone = structuredClone;
  f.installRanked(f.installedRuntime);
  f.G.scene = new f.THREE.Scene();
  f.G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-90, 0, 0], [90, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }] });
  f.G.physics = new f.Physics(f.G.level);
  return f;
}

function pickup(f, a) {
  const e = new f.RankedEngine('rainmaker', { id: 'carrier-boundaries', rainmaker: {
    center: a.pos.toArray(), goals: [[0, 0, 40], [0, 0, -40]], checkpoints: [[], []],
  } });
  const m = f.G.match = { mode: 'rainmaker', state: 'playing', playing: () => true,
    ranked: e, actors: [a], rankedBarrierHits: [], rankedGains: [0, 0],
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false },
    rankedEffects: { event() {} } };
  e.rule.state.barrier.active = false;
  e.update(1 / 60, f.buildFrame(m, { G: f.G }));
  assert.equal(e.rule.state.carrier, String(a.nid));
  f.Match.prototype.playRankedEvents.call(m, e.events);
  return m;
}

function equipResistance(f, a, ap) {
  a.s3.loadout = f.emptyLoadout();
  for (const piece of a.s3.loadout) if (ap >= 10) { piece.main = 'subResistance'; ap -= 10; }
  for (const piece of a.s3.loadout) for (let i = 0; i < 3 && ap >= 3; i++) { piece.subs[i] = 'subResistance'; ap -= 3; }
  a.s3RefreshGear();
}
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
function horizontal(a, dt) {
  a.vel.set(0, 0, 0); a.form = 'kid'; a.grounded = true; a.intent.move.set(0, 0, 1);
  for (let i = 0; i < Math.round(2 / dt); i++) a._horizontal(dt, false, false);
  return a.vel.z;
}

for (const ap of [0, 57]) test(`carrier charge/pending/recovery applies live Mist once at ${ap}AP and 30/60/120Hz`, async () => {
  const f = await world(), owner = f.make('shooter'), a = f.make('shooter');
  owner.team = 0; a.team = 1; a.nid = 231; equipResistance(f, a, ap);
  owner.weapon = { ...owner.weapon, sub: 'toxicMist' }; owner.aimDir.set(0, -1, .1).normalize();
  const cloud = f.G.projectiles.throwBomb(owner);
  assert.equal(cloud.subId, 'toxicMist', 'real catalogue throw supplies the live volume');
  for (let i = 0; i < 120 && cloud.phase !== 'deployed'; i++) { f.G.time += 1 / 60; f.G.projectiles.update(1 / 60); }
  assert.equal(cloud.phase, 'deployed'); a.pos.copy(cloud.pos);
  const m = pickup(f, a), c = m.ranked.rule.state.charge, scale = ap === 0 ? .5 : .75;
  for (const phase of ['idle', 'input', 'charging', 'pending', 'recovery']) {
    a.intent.fire = phase === 'input'; c.firing = phase === 'charging';
    c.pending = phase === 'pending' ? {} : null; c.recovery = phase === 'recovery' ? 20 / 60 : 0;
    const base = phase === 'idle' ? 5.76 * .8 : .6 * 60 * .02;
    for (const hz of [30, 60, 120]) {
      a.pos.copy(cloud.pos); near(f.toxicMistScale(a), scale, `${phase} membership`);
      near(a.weaponRunner.moveSpeed(), base * scale, `${phase} runner`);
      near(horizontal(a, 1 / hz), base * scale, `${phase} ${hz}Hz inside`);
      a.pos.x += 20; near(f.toxicMistScale(a), 1, `${phase} current exit`);
      near(horizontal(a, 1 / hz), base, `${phase} ${hz}Hz outside`);
    }
  }
  a.pos.copy(cloud.pos); cloud.dead = true;
  near(a.weaponRunner.moveSpeed(), .72, 'recovery immediately releases a dead cloud');
});

function activate(f, a, special) {
  a.weapon = { ...a.weapon, special }; a.special = a.specialCost(); a._startSpecial();
  assert.equal(a.specialActive?.id, special, 'real native activation');
}
function incoming(f) {
  return { prev: new f.THREE.Vector3(0, 1, 5.1), pos: new f.THREE.Vector3(0, 1, 5),
    vel: new f.THREE.Vector3(0, 0, -3), team: 1, damage: 30 };
}

for (const phase of ['inhale', 'exhale']) test(`pickup disposes native Ink Vac ${phase}, notifies its replica once, and permits reactivation`, async () => {
  const f = await world(), a = f.make('shooter'), replica = f.make('shooter');
  a.nid = 231; a.team = 0; a.aimDir.set(0, 0, 1); replica.remote = true; replica.nid = 232;
  const activations = [], disposals = [], E = f.INK_VAC_EVENTS;
  f.on(E.activation, event => activations.push(event)); f.on(E.dispose, event => disposals.push(event));
  activate(f, a, 'inkVac');
  const activation = activations.at(-1), cone = f.inkVacState(a).mesh;
  assert.equal(f.replayInkVac(E.activation, replica, { ...activation, actor: replica }).applied, true);
  // Current native Vac requires startup, a held intake and cone expansion.
  a.intent.fire = true; f.tick(a, 75);
  assert.equal(f.inkVacState(a).sucking, true); assert.equal(f.inkVacState(a).length, 15);
  const shot = incoming(f); assert.ok(f.inkVacAbsorbCandidate(a, shot.prev, shot.pos, shot));
  if (phase === 'exhale') {
    for (let i = 0; i < 400 && f.inkVacState(a)?.phase === 'inhale'; i++) f.tick(a);
    assert.equal(f.inkVacState(a)?.phase, 'exhale');
  }
  const m = pickup(f, a);
  assert.equal(a.specialActive, null); assert.equal(a.special, 0); assert.equal(!!f.inkVacState(a), false);
  assert.equal(cone.parent, null, 'held cone is removed from the scene');
  assert.equal(f.inkVacAbsorbCandidate(a, shot.prev, shot.pos, shot), null);
  assert.equal(shot.damage, 30, 'pickup cannot keep absorbing invisible hits');
  assert.equal(disposals.length, 1); assert.equal(disposals[0].serial, activation.serial);
  const end = { ...disposals[0], actor: replica };
  assert.equal(f.replayInkVac(E.dispose, replica, end).applied, true);
  assert.equal(f.inkVacState(replica), null); assert.equal(disposals.length, 1, 'replica disposal never echoes');
  assert.equal(f.replayInkVac(E.activation, replica, { ...activation, actor: replica }).applied, false, 'late activation cannot resurrect the ended cone');
  f.tick(a, 600); assert.equal(f.inkVacState(a), null); assert.equal(disposals.length, 1);
  m.ranked.rule.state.carrier = null; f.tick(a);
  const count = a.stats.specials; activate(f, a, 'inkVac'); assert.equal(a.stats.specials, count + 1);
  assert.notEqual(f.inkVacState(a).serial, activation.serial);
});

test('pickup ends native Trizooka control and keeps its already-fired volley alive', async () => {
  const f = await world(), a = f.make('shooter'); a.nid = 231; a.team = 0; a.aimDir.set(0, 0, 1);
  activate(f, a, 'trizooka'); a.intent.fire = true;
  for (let i = 0; i < 120 && f.G.projectiles.list.length === 0; i++) f.tick(a);
  const rounds = [...f.G.projectiles.list]; assert.ok(rounds.length > 0, 'native Trizooka emitted a volley');
  assert.equal(a.s3Trizooka?.active, true); a.intent.fire = false;
  const m = pickup(f, a);
  assert.equal(a.specialActive, null); assert.equal(!!a.s3Trizooka, false); assert.equal(a.special, 0);
  assert.equal(f.G.projectiles.list.length, rounds.length);
  for (const p of rounds) { assert.ok(f.G.projectiles.list.includes(p)); assert.ok(p.damage > 0); assert.notEqual(p._netEnded, true); }
  m.ranked.rule.state.carrier = null; f.tick(a);
  const count = a.stats.specials; activate(f, a, 'trizooka'); assert.equal(a.stats.specials, count + 1);
});

test('pickup preserves a deployed Ink Vac countershot and Storm object', async () => {
  const f = await world(), a = f.make('shooter'); a.nid = 231; a.team = 0; a.aimDir.set(0, 0, 1);
  activate(f, a, 'inkVac'); a.intent.fire = true;
  for (let i = 0; i < 400 && f.inkVacState(a)?.phase === 'inhale'; i++) f.tick(a);
  assert.equal(f.inkVacState(a)?.phase, 'exhale'); a.intent.fire = false; f.tick(a, 19);
  assert.equal(f.inkVacState(a)?.phase, 'exhale'); assert.equal(f.G.projectiles.list.length, 0, 'native20F transition retains the return shot');
  f.tick(a); assert.equal(f.inkVacState(a), null);
  const rounds = [...f.G.projectiles.list]; assert.equal(rounds.length, 1, 'native return shot was released');
  activate(f, a, 'storm');
  a.intent.sub = true; f.tick(a); a.intent.sub = false; f.tick(a);
  const storm = f.G.projectiles.bombs.find(b => b.owner === a && b.kind === 'storm');
  assert.ok(storm, 'native Storm throw deployed its independent object');
  pickup(f, a);
  assert.equal(a.specialActive, null); assert.ok(f.G.projectiles.bombs.includes(storm));
  assert.ok(f.G.projectiles.list.includes(rounds[0])); assert.ok(rounds[0].damage > 0);
});

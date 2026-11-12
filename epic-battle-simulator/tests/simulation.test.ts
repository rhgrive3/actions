import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { BattleSimulation, FIXED_STEP } from "../src/game/simulation";
import { DEFS, DEPLOY, MAX_PER_TEAM, type UnitKind } from "../src/game/units";
import { STAGES } from "../src/game/campaign";

function empty() {
  const sim = new BattleSimulation();
  sim.reset(false);
  return sim;
}
function run(sim: BattleSimulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP / sim.speed); i++) sim.advance(FIXED_STEP);
}
function dummy(sim: BattleSimulation, x: number, z = 0, hp = 1e6) {
  const d = sim.spawn(1, "spear", x, z);
  d.hp = d.maxHp = hp;
  d.order = "hold";
  d.cooldown = 1e9;
  return d;
}

test("targeting excludes self and allies, even when they are closer", () => {
  const s = empty();
  const blue = s.spawn(0, "spear", -20, 0);
  const ally = s.spawn(0, "spear", -18, 0);
  const red = s.spawn(1, "spear", 30, 0);
  assert.equal(s.nearestEnemy(blue)?.id, red.id);
  assert.equal(s.nearestEnemy(blue, 5), undefined);
  for (const u of s.units) u.order = "hold";
  s.begin();
  run(s, 6);
  assert.equal(blue.hp, blue.maxHp);
  assert.equal(ally.hp, ally.maxHp);
  assert.deepEqual(s.kills, [0, 0]);
});

test("friendly fire is rejected; kills count deaths, not hits", () => {
  const s = empty();
  const u = s.spawn(1, "spear", 0, 0);
  s.damage(u, 10000, 1);
  assert.equal(u.hp, DEFS.spear.hp);
  s.damage(u, 10, 0);
  assert.deepEqual(s.kills, [0, 0]);
  s.damage(u, 10000, 0);
  s.damage(u, 10000, 0);
  assert.equal(u.hp, 0);
  assert.deepEqual(s.kills, [1, 0]);
  assert.deepEqual(s.losses, [0, 1]);
});

test("setup is frozen until both armies exist", () => {
  const s = empty();
  assert.equal(s.begin(), false);
  s.setupStage(STAGES[0], 0);
  assert.equal(s.begin(), false, "an empty player side cannot start");
  s.deploy("spear", -20, 0, 1);
  assert.equal(s.begin(), true);
  const other = empty();
  other.setupStage(STAGES[0], 0);
  other.deploy("spear", -20, 0, 1);
  const positions = other.units.map(u => u.position.toArray());
  run(other, 10);
  assert.equal(other.time, 0);
  assert.deepEqual(other.units.map(u => u.position.toArray()), positions);
});

test("idle troops pursue distant enemies and finish a battle", () => {
  const s = empty();
  const blue = s.spawn(0, "spear", -40, 0);
  const red = s.spawn(1, "zombie", 40, 0);
  s.begin();
  run(s, 2);
  assert.ok(blue.position.x > -36);
  assert.ok(red.position.x < 37);
  run(s, 90);
  assert.equal(s.phase, "over");
  assert.equal(s.result?.winner, 0);
  assert.equal(s.kills[0], s.losses[1]);
  assert.equal(s.kills[1], s.losses[0]);
});

test("projectiles own independent position and velocity vectors", () => {
  const s = empty();
  const archer = s.spawn(0, "archer", -15, 0);
  const first = dummy(s, 0, 0);
  const second = dummy(s, 0, 10);
  s.begin();
  s.fire(archer, first);
  const original = s.projectiles[0].velocity.clone();
  s.fire(archer, second);
  assert.equal(s.projectiles.length, 2);
  assert.deepEqual(s.projectiles[0].velocity, original);
  s.projectiles[1].velocity.set(0, 0, 0);
  assert.deepEqual(s.projectiles[0].velocity, original);
});

for (const kind of DEPLOY) {
  test(`${kind} reaches and damages an enemy`, () => {
    const s = empty();
    s.spawn(0, kind, -15, 0);
    const target = dummy(s, 15, 0, 5000);
    s.begin();
    s.speed = 4;
    run(s, 30);
    assert.ok(target.hp < 5000, `${kind} never hit its target`);
    // The keg runner's whole job is to not survive its one attack.
    if (!DEFS[kind].detonate) assert.ok(s.units.filter(u => u.team === 0 && !u.dead).length > 0, `${kind} died without a fight`);
  });
}

test("area attacks hurt enemies only, and only within the blast", () => {
  const s = empty();
  const mage = s.spawn(0, "mage", -12, 0);
  const target = dummy(s, 0, 0);
  const nearby = dummy(s, 1.8, 1.8);
  const far = dummy(s, 5.5, 0);
  const ally = s.spawn(0, "spear", 0, -2);
  ally.order = "hold";
  s.begin();
  s.fire(mage, target);
  run(s, 1.4);
  assert.ok(target.hp < target.maxHp);
  assert.ok(nearby.hp < nearby.maxHp);
  assert.equal(far.hp, far.maxHp);
  assert.equal(ally.hp, ally.maxHp);
});

test("batch deployment never overspends and can be undone exactly", () => {
  const s = empty();
  s.setupSandbox();
  s.gold[0] = 160;
  assert.equal(s.deploy("archer", -10, 0, 5).count, 2);
  assert.equal(s.gold[0], 160 - 2 * DEFS.archer.cost);
  assert.equal(s.deploy("archer", -10, 0, 1).reason, "funds");
  assert.equal(s.undoDeploy(), true);
  assert.equal(s.gold[0], 160);
  assert.equal(s.count(0), 16);
  assert.equal(s.spawned[0], 16);
  assert.equal(s.canUndo, false);
});

test("deployment rejects bad zones and non-finite coordinates", () => {
  const s = empty();
  s.setupSandbox();
  for (const [x, z] of [[5, 0], [-200, 0], [-10, 100], [NaN, 0], [-10, Infinity]]) {
    assert.equal(s.deploy("spear", x, z).reason, "zone");
  }
  assert.equal(s.deploy("spear", -10, 0, NaN).count, 0);
  assert.equal(s.count(0), 16);
  const edge = s.deploy("spear", -3, 46, 5);
  assert.equal(edge.count, 5);
  assert.ok(s.units.every(u => u.dead || u.team !== 0 || s.isDeployPosition(u.position.x, u.position.z)));
});

test("the team cap counts living units, not fading corpses", () => {
  const s = empty();
  s.setupSandbox();
  for (let i = 0; i < MAX_PER_TEAM - 17; i++) s.spawn(0, "spear", -70 + (i % 10) * 5, -35 + Math.floor(i / 10) * 5);
  assert.equal(s.count(0), MAX_PER_TEAM - 1);
  assert.equal(s.deploy("spear", -20, 30, 5).count, 1);
  assert.equal(s.count(0), MAX_PER_TEAM);
  assert.equal(s.deploy("spear", -20, 30, 5).reason, "limit");
  s.damage(s.units[0], 1e6, 1);
  assert.equal(s.deploy("spear", -20, 30, 5).count, 1);
  assert.equal(s.count(0), MAX_PER_TEAM);
});

test("repeated placement separates units instead of stacking them", () => {
  const s = empty();
  s.setupSandbox();
  s.gold[0] = 4000;
  for (let i = 0; i < 4; i++) assert.equal(s.deploy("zombie", -15, 5, 5).count, 5);
  for (const a of s.units) for (const b of s.units) {
    if (a !== b && a.team === 0 && b.team === 0) assert.ok(a.position.distanceTo(b.position) > 1.3);
  }
});

test("movement orders take priority over auto targeting, then hold position", () => {
  const s = empty();
  const blue = s.spawn(0, "spear", -4, 0);
  const red = s.spawn(1, "spear", 0, 0);
  red.order = "hold";
  red.cooldown = 1e9;
  s.begin();
  s.command([blue.id], "move", new Vector3(-22, 0, 0));
  run(s, 2);
  assert.ok(blue.position.x < -10);
  assert.equal(blue.targetId, null);
  assert.equal(red.hp, red.maxHp);
  run(s, 5);
  assert.equal(blue.order, "hold");
  assert.ok(blue.position.distanceTo(new Vector3(-22, 0, 0)) < 0.8);
  const before = blue.position.clone();
  run(s, 2);
  assert.ok(blue.position.distanceTo(before) < 0.1);
  s.command([blue.id], "auto");
  run(s, 1);
  assert.ok(blue.position.x > before.x + 2);
});

test("formation destinations stay distinct at the battlefield boundary", () => {
  const s = empty();
  for (let i = 0; i < 49; i++) s.spawn(0, "spear", -40 + i % 7 * 3, -10 + Math.floor(i / 7) * 3);
  s.command(s.units.map(u => u.id), "move", new Vector3(78, 0, 52));
  const destinations = s.units.map(u => u.destination!);
  assert.equal(new Set(destinations.map(p => p.toArray().join(":"))).size, 49);
  assert.ok(destinations.every(p => p.x <= 76 && p.z <= 50));
});

test("pausing freezes time, budget, units and projectiles", () => {
  const s = empty();
  s.setupSandbox();
  s.begin();
  run(s, 2);
  s.togglePause();
  const snapshot = JSON.stringify({ time: s.time, units: s.units, shots: s.projectiles, gold: s.gold });
  run(s, 10);
  assert.equal(JSON.stringify({ time: s.time, units: s.units, shots: s.projectiles, gold: s.gold }), snapshot);
  s.togglePause();
  s.advance(FIXED_STEP);
  assert.equal(s.phase, "playing");
  assert.ok(s.time > 2);
});

test("fixed timestep is identical at 1x/2x/4x and different frame rates", () => {
  const baseline = empty();
  baseline.setupSandbox();
  baseline.begin();
  run(baseline, 24);
  for (const [speed, fps] of [[2, 30], [4, 20]]) {
    const s = empty();
    s.setupSandbox();
    s.begin();
    s.speed = speed;
    for (let i = 0; i < 24 * fps / speed; i++) s.advance(1 / fps);
    assert.equal(s.time, baseline.time);
    assert.deepEqual(s.kills, baseline.kills);
    assert.deepEqual(s.units, baseline.units);
    assert.deepEqual(s.projectiles, baseline.projectiles);
  }
});

test("a preset battle always reaches a result with valid accounting", () => {
  for (const stage of [STAGES[0], STAGES[9], STAGES[19]]) {
    const s = new BattleSimulation(2026);
    s.setupStage(stage, 19);
    s.deploy("spear", -20, 0, 5);
    s.begin();
    s.speed = 4;
    for (let t = 0; t < 12000 && s.phase === "playing"; t++) s.advance(FIXED_STEP);
    assert.equal(s.phase, "over", `${stage.id} must end`);
    assert.equal(s.kills[0], s.losses[1]);
    assert.equal(s.kills[1], s.losses[0]);
    for (const team of [0, 1] as const) assert.equal(s.spawned[team] - s.losses[team], s.count(team));
    assert.ok(s.units.every(u => u.position.toArray().every(Number.isFinite)));
    assert.ok(s.units.every(u => u.position.y >= 0 && u.position.y < 40));
  }
});

test("restarting a stage resets time, counters, shots, speed and orders", () => {
  const s = empty();
  s.setupStage(STAGES[4], 4);
  s.deploy("mage", -12, 20, 2);
  s.begin();
  s.speed = 4;
  run(s, 30);
  s.setupStage(STAGES[4], 4);
  assert.equal(s.phase, "setup");
  assert.equal(s.time, 0);
  assert.equal(s.speed, 1);
  assert.deepEqual(s.kills, [0, 0]);
  assert.deepEqual(s.losses, [0, 0]);
  assert.equal(s.result, null);
  assert.equal(s.projectiles.length, 0);
  assert.equal(s.canUndo, false);
  assert.equal(s.gold[0], STAGES[4].budget);
  assert.ok(s.units.every(u => u.hp === u.maxHp && u.targetId === null && u.order === "auto" && !s.isDown(u)));
});

test("every unit kind stays inside the field and never goes invalid during a mixed battle", () => {
  const s = empty();
  s.setupSandbox();
  for (const kind of DEPLOY) s.deploy(kind, -30 + DEPLOY.indexOf(kind) * 1.2, 30, 1);
  s.begin();
  s.speed = 4;
  run(s, 40);
  for (const u of s.units) {
    assert.ok(Number.isFinite(u.position.x) && Number.isFinite(u.position.z));
    assert.ok(Math.abs(u.position.x) <= 78 && Math.abs(u.position.z) <= 52);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { ARMOR_FLOOR, BattleSimulation, FIXED_STEP, FLANK_MULT } from "../src/game/simulation";
import { DEFS, FIELD, MAX_PER_TEAM, SANDBOX_BUDGET, type UnitKind } from "../src/game/units";
import { STAGES, loadCleared, saveCleared, unlockedThrough } from "../src/game/campaign";
import { terrainObstacles, terrainClear } from "../src/game/terrain";

function run(s: BattleSimulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) s.advance(FIXED_STEP);
}
function inert(s: BattleSimulation, kind: UnitKind, x: number, z = 0) {
  const u = s.spawn(1, kind, x, z);
  u.hp = u.maxHp = 1e6;
  u.cooldown = 1e9;
  u.order = "hold";
  u.facing = -Math.PI / 2;
  return u;
}

test("paladin heals multiple allies while advancing; it never follows the cleric AI", () => {
  const s = new BattleSimulation(); s.reset(false);
  const paladin = s.spawn(0, "paladin", -20, 0);
  const a = s.spawn(0, "spear", -22, -3), b = s.spawn(0, "spear", -22, 3);
  a.hp = b.hp = 25; a.order = b.order = "hold";
  inert(s, "giant", 30);
  s.begin(); run(s, 3);
  assert.ok(a.hp > 25 && b.hp > 25, "aura heals every wounded ally in range");
  assert.ok(paladin.position.x > -12, "paladin advances even with wounded allies behind");
  assert.equal(paladin.supportId, null);
  assert.ok(s.drainEvents().some(e => e.type === "heal"));
});

test("paladin heals while obeying a move order; aura does not reset its melee animation", () => {
  const s = new BattleSimulation(); s.reset(false);
  const p = s.spawn(0, "paladin", -10, 0);
  const ally = s.spawn(0, "spear", -12, 0); ally.hp = 25; ally.order = "hold";
  inert(s, "giant", 40);
  s.begin(); s.command([p.id], "move", new Vector3(-2, 0, 0)); run(s, 0.25);
  assert.ok(p.position.x > -10);
  assert.equal(ally.hp, 25 + DEFS.paladin.heal!);
  assert.equal(p.animation, -1);
});

test("cleric stays near the army when no ally needs healing", () => {
  const s = new BattleSimulation(); s.reset(false);
  const c = s.spawn(0, "cleric", -20, 0);
  const ally = s.spawn(0, "guardian", -16, 0); ally.order = "hold";
  inert(s, "giant", 40);
  s.begin(); run(s, 2);
  assert.ok(c.position.x < -19, "cleric does not independently charge a distant enemy");
});

test("shaman applies its curse to nearby enemies, not allies", () => {
  assert.ok(DEFS.shaman.slow! >= 2.5);
  const s = new BattleSimulation(); s.reset(false);
  const shaman = s.spawn(0, "shaman", -13, 0); shaman.cooldown = 1e9; shaman.order = "hold";
  const target = inert(s, "giant", 0), nearby = inert(s, "giant", 0.5, 2), far = inert(s, "giant", 8);
  const ally = s.spawn(0, "spear", 0, -2); ally.order = "hold"; ally.cooldown = 1e9;
  s.begin(); s.fire(shaman, target); run(s, 0.8);
  assert.ok(target.slowT > 2 && nearby.slowT > 2);
  assert.equal(far.slowT, 0); assert.equal(ally.slowT, 0);
});

test("slow reduces movement, wind-up, cooldown recovery and animation together", () => {
  const scenario = (slow: boolean, walking: boolean) => {
    const s = new BattleSimulation(); s.reset(false);
    const u = s.spawn(0, "spear", -15, 0);
    inert(s, "giant", walking ? 40 : -12.5);
    if (slow) u.slowT = 20;
    if (!walking) { u.windup = 0.6; u.animation = 0; u.cooldown = 1; u.targetId = s.units[1].id; }
    s.begin(); run(s, walking ? 1 : 0.25);
    return u;
  };
  const normal = scenario(false, false), cursed = scenario(true, false);
  assert.ok(cursed.windup! > normal.windup!);
  assert.ok(cursed.cooldown > normal.cooldown);
  assert.ok(cursed.animation < normal.animation);
  assert.ok(scenario(true, true).position.x < scenario(false, true).position.x - 1);
});

for (const kind of ["guardian", "swordsman", "paladin", "spear"] as const) {
  test(`${kind}: flanks do 1.3x damage; only shield units gain frontal defense and emit block`, () => {
    const s = new BattleSimulation(); s.reset(false);
    const front = s.spawn(0, kind, 0, 0), side = s.spawn(0, kind, 0, 10), back = s.spawn(0, kind, 0, 20);
    front.facing = side.facing = back.facing = 0;
    const shieldBonus = DEFS[kind].shield ?? 0;
    s.drainEvents();
    const a = s.damage(front, 50, 1, new Vector3(0, 0, 5));
    const eventsAfterFront = s.drainEvents();
    const b = s.damage(side, 50, 1, new Vector3(5, 0, 10));
    const c = s.damage(back, 50, 1, new Vector3(0, 0, 15));
    const after = (raw: number) => Math.max(raw * ARMOR_FLOOR, raw - DEFS[kind].armor);
    assert.ok(Math.abs(a - after(50 * (1 - shieldBonus))) < 1e-7);
    assert.ok(Math.abs(b - after(50 * FLANK_MULT)) < 1e-7);
    assert.equal(b, c);
    assert.equal(eventsAfterFront.some(e => e.type === "block"), shieldBonus > 0);
  });
}

test("vampire lifesteal is capped by actual post-armor damage and remaining target HP", () => {
  const s = new BattleSimulation(7); s.reset(false);
  const vamp = s.spawn(0, "vampire", 0, 0);
  vamp.hp = 100;
  const dying = s.spawn(1, "zombie", 2, 0);
  dying.hp = 4; // only 4 HP left!
  dying.order = "hold";
  s.begin();
  run(s, 0.7);
  // Lifesteal on 4 actual damage at 45% is 1.8 HP, not 45% of full 38 base damage (~17.1 HP)
  assert.ok(vamp.hp > 100 && vamp.hp <= 100 + 4 * DEFS.vampire.lifesteal! + 1e-5, `expected capped heal, got ${vamp.hp}`);
});

test("lance snapshots approach speed and boosts the first hit only, up to 1.5x", () => {
  const scenario = (speed: number) => {
    const s = new BattleSimulation(7); s.reset(false);
    const horse = s.spawn(0, "knight", 0, 0); horse.cooldown = 0; horse.velocity.x = speed;
    const target = inert(s, "orc", 2.4);
    s.begin(); s.advance(FIXED_STEP);
    const bonus = horse.charge;
    run(s, 1);
    return { s, horse, target, bonus, damage: target.maxHp - target.hp, impulse: target.lastHit.length() };
  };
  const stopped = scenario(0), fast = scenario(DEFS.knight.speed);
  assert.equal(stopped.bonus, 1); assert.equal(fast.bonus, 1.5);
  assert.ok(Math.abs(fast.damage / stopped.damage - 1.5) < 1e-6, "braking during wind-up must not lose the bonus");
  assert.equal(fast.horse.chargeReady, false); assert.equal(fast.horse.charge, 1);
  assert.equal(scenario(DEFS.knight.speed * 2).bonus, 1.5);
});

test("custom setup edits either army, uses separate budgets, and undo refunds the correct side", () => {
  const s = new BattleSimulation(); s.setupSandbox(); s.clearArmies();
  assert.equal(s.deploy("knight", 25, 0, 1, 1).count, 1);
  assert.deepEqual(s.gold, [SANDBOX_BUDGET, SANDBOX_BUDGET - DEFS.knight.cost]);
  assert.equal(s.deploy("spear", -25, 0, 1, 0).count, 1);
  s.undoDeploy();
  assert.deepEqual([s.count(0), s.count(1)], [0, 1]);
  s.undoDeploy(); assert.deepEqual(s.gold, [SANDBOX_BUDGET, SANDBOX_BUDGET]);
  assert.equal(s.deploy("spear", -25, 0, 1, 1).reason, "zone");
});

test("clear armies resets both budgets, unit counters, effects and undo history; story cannot clear enemies", () => {
  const s = new BattleSimulation(); s.setupSandbox();
  s.deploy("spear", 40, 20, 5, 1);
  assert.equal(s.clearArmies(), true);
  assert.deepEqual([s.count(0), s.count(1)], [0, 0]);
  assert.deepEqual(s.spawned, [0, 0]); assert.deepEqual(s.gold, [SANDBOX_BUDGET, SANDBOX_BUDGET]);
  assert.equal(s.canUndo, false); assert.equal(s.drainEvents().length, 0);
  assert.equal(s.begin(), false);
  s.setupStage(STAGES[0], 0);
  assert.equal(s.clearArmies(), false);
  assert.equal(s.deploy("spear", 25, 0, 1, 1).reason, "inactive");
});

test("50 living units per side remains the cap for custom armies", () => {
  const s = new BattleSimulation(); s.setupSandbox(); s.clearArmies();
  for (const team of [0, 1] as const) {
    for (let i = 0; i < 10; i++) assert.equal(s.deploy("zombie", team === 0 ? -40 : 40, -25 + i * 5, 5, team).count, 5);
    assert.equal(s.count(team), MAX_PER_TEAM);
    assert.equal(s.deploy("zombie", team === 0 ? -30 : 30, 20, 1, team).reason, "limit");
  }
});

test("story chapters have different terrain footprints and prohibit placement inside rocks", () => {
  assert.deepEqual(terrainObstacles(0), []);
  assert.equal(new Set([1, 2, 3, 4].map(i => JSON.stringify(terrainObstacles(i)))).size, 4);
  for (const chapter of [1, 2, 3, 4]) {
    const s = new BattleSimulation(); s.setupStage(STAGES[(chapter - 1) * 5], 19);
    assert.equal(s.sceneIndex, chapter);
    for (const o of terrainObstacles(chapter)) assert.equal(terrainClear(chapter, o.x, o.z), false);
    assert.ok(s.units.every(u => terrainClear(chapter, u.position.x, u.position.z, DEFS[u.kind].radius)));
  }
});

test("automatic troops navigate a boulder rather than staying stuck inside it", () => {
  const s = new BattleSimulation(); s.reset(false); s.sceneIndex = 2;
  const blue = s.spawn(0, "spear", -20, -18);
  const red = inert(s, "giant", 22, -18);
  s.begin(); run(s, 24);
  assert.ok(blue.position.x > 10, `unit stuck at ${blue.position.toArray()}`);
  assert.ok(red.hp < red.maxHp);
  assert.ok(terrainClear(2, blue.position.x, blue.position.z, DEFS.spear.radius));
});

test("high-power knockback never tunnels through obstacles or FIELD boundaries and lands cleanly", () => {
  const s = new BattleSimulation(); s.reset(false); s.sceneIndex = 4;
  // Place unit right in front of a Scene 4 stone pillar (x: 0, z: -12, radius: 3.4, height: 7)
  const victim = s.spawn(0, "skeleton", -4.2, -12);
  const edgeVictim = s.spawn(0, "skeleton", FIELD.x - 1.5, FIELD.z - 1.5);
  inert(s, "giant", 30, 0);
  s.begin();
  s.damage(victim, 10, 1, new Vector3(-8, 0, -12), DEFS.giant.impact * 1.5);
  s.damage(edgeVictim, 10, 1, new Vector3(FIELD.x - 5, 0, FIELD.z - 5), DEFS.giant.impact * 1.5);
  for (let i = 0; i < 240; i++) {
    s.advance(FIXED_STEP);
    assert.ok(terrainClear(4, victim.position.x, victim.position.z, DEFS.skeleton.radius), "never embeds inside obstacle");
    assert.ok(Math.abs(edgeVictim.position.x) <= FIELD.x - 1 && Math.abs(edgeVictim.position.z) <= FIELD.z - 1, "stays within FIELD boundary");
    assert.ok(victim.position.y >= 0 && victim.position.y <= 16, "never floats into orbit");
  }
  assert.equal(victim.airborne, false, "lands back on ground");
  assert.equal(edgeVictim.airborne, false, "edge unit lands back on ground");
});

test("storage fallback preserves cleared stage progress in memory when localStorage is blocked", () => {
  saveCleared(7);
  assert.equal(loadCleared(), 7);
  saveCleared(3);
  assert.equal(loadCleared(), 7, "progress does not regress");
});

test("king aura boosts actual melee and ranged damage dealt by 30%", () => {
  const meleeTrial = (kingX: number) => {
    const s = new BattleSimulation(42); s.reset(false);
    const spear = s.spawn(0, "spear", 0, 0); spear.cooldown = 0;
    const k = s.spawn(0, "king", kingX, 0);
    k.order = "hold"; k.cooldown = 1e9;
    const target = inert(s, "orc", 2.5, 0);
    s.begin(); run(s, 1.0);
    return target.maxHp - target.hp;
  };
  const dBase = meleeTrial(-40), dBuffed = meleeTrial(-4);
  assert.ok(Math.abs(dBuffed / dBase - 1.3) < 1e-6, `expected 1.3x melee damage with king, got ${dBuffed / dBase}`);

  const rangedTrial = (kingX: number) => {
    const s = new BattleSimulation(42); s.reset(false);
    const archer = s.spawn(0, "archer", -10, 0); archer.order = "hold"; archer.cooldown = 1e9;
    const k = s.spawn(0, "king", kingX, 0);
    k.order = "hold"; k.cooldown = 1e9;
    const target = inert(s, "giant", 0, 0);
    s.begin(); s.fire(archer, target);
    return s.projectiles[0].damage;
  };
  assert.ok(Math.abs(rangedTrial(-12) / rangedTrial(-50) - 1.3) < 1e-6, "ranged projectile damage boosted by 30%");
});

test("autoDeploy builds a balanced tactical formation, spends leftover budget down to cheapest unit, and undoes in a single step", () => {
  const s = new BattleSimulation();
  s.setupStage(STAGES[4], 4);
  const startGold = s.gold[0];
  const added = s.autoDeploy(0);
  assert.ok(added >= 4, `autoDeploy should place multiple units (placed ${added})`);
  assert.ok(s.gold[0] < startGold && s.gold[0] < Math.min(...unlockedThrough(4).map(k => DEFS[k].cost)), `autoDeploy spends leftover gold down below cheapest unit (left ${s.gold[0]})`);
  assert.equal(s.undoDeploy(), true, "entire autoDeploy batch can be undone at once");
  assert.equal(s.count(0), 0);
  assert.equal(s.gold[0], startGold);

  // With pocket change it still buys what it can, down to less than the cheapest unlocked unit.
  s.gold[0] = 60;
  assert.equal(s.autoDeploy(0), 1);
  const cheapest = Math.min(...unlockedThrough(4).map(k => DEFS[k].cost));
  assert.ok(s.gold[0] < cheapest, `left ${s.gold[0]}`);
});

test("tactical formations (box, line, wedge, scatter) assign valid distinct obstacle-clear destinations and MVP is tracked", () => {
  for (const form of ["box", "line", "wedge", "scatter"] as const) {
    const s = new BattleSimulation(); s.reset(false); s.sceneIndex = 4;
    for (let i = 0; i < 16; i++) s.spawn(0, "spear", -30, -15 + i * 2);
    // Order move directly onto a Scene 4 stone pillar at (0, -12)
    s.command(s.units.map(u => u.id), "move", new Vector3(0, 0, -12), undefined, form);
    const dests = s.units.map(u => u.destination!);
    assert.equal(new Set(dests.map(d => `${d.x.toFixed(2)}:${d.z.toFixed(2)}`)).size, 16, `${form} destinations distinct`);
    for (const u of s.units) {
      assert.ok(
        terrainClear(4, u.destination!.x, u.destination!.z, DEFS[u.kind].radius),
        `${form} destination ${u.destination!.toArray()} must not be inside an obstacle`,
      );
    }
  }

  const s = new BattleSimulation(2026); s.reset(false);
  const hero = s.spawn(0, "paladin", -6, 0);
  s.spawn(1, "zombie", 4, 0);
  s.begin();
  s.speed = 4;
  run(s, 30);
  assert.equal(s.phase, "over");
  assert.ok(hero.kills >= 1 && hero.damageDealt > 0);
  assert.equal(s.result?.mvp?.id, hero.id);
});

test("zeus chain lightning arcs across distinct nearby enemies without immediately re-hitting the primary target", () => {
  const s = new BattleSimulation(99); s.reset(false);
  const zeus = s.spawn(0, "zeus", -18, 0);
  zeus.order = "hold";
  zeus.cooldown = 1e9;
  const e1 = inert(s, "giant", 0, 0);
  const e2 = inert(s, "giant", 5.2, 0);
  const e3 = inert(s, "giant", 10.4, 0);
  const e4 = inert(s, "giant", 15.6, 0);
  s.begin();
  s.drainEvents();
  s.fire(zeus, e1);
  run(s, 1.0);
  const events = s.drainEvents().filter(e => e.type === "lightning");
  assert.ok(events.length >= 3, `expected at least 3 chain lightning arcs, got ${events.length}`);
  for (const ev of events) {
    assert.ok(ev.target instanceof Vector3, "each lightning event records its arc source target");
  }
  assert.ok(e1.hp < e1.maxHp && e2.hp < e2.maxHp && e3.hp < e3.maxHp && e4.hp < e4.maxHp, "chain lightning damages all 4 lined-up enemies");
});

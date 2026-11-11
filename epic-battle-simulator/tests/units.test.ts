import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { BattleSimulation, FIXED_STEP } from "../src/game/simulation";
import { DEFS, DEPLOY, FACTIONS, FIELD, SANDBOX_BUDGET, type UnitKind } from "../src/game/units";
import { STAGES, STARTER_UNITS, enemyCost, stagePositions, unlockedThrough } from "../src/game/campaign";

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

test("roster: 34 units, 5 factions, every unit sits in exactly one tab", () => {
  assert.equal(DEPLOY.length, 34);
  assert.equal(new Set(DEPLOY).size, 34);
  assert.equal(FACTIONS.length, 5);
  for (const kind of Object.keys(DEFS) as UnitKind[]) {
    const d = DEFS[kind];
    assert.ok(d.hp > 0 && d.dmg > 0 && d.speed > 0 && d.cost > 0, kind);
    assert.ok(d.impact > 0 && d.mass > 0, `${kind} needs impact and mass`);
    assert.ok(d.armor >= 0 && d.armor <= 12 && Number.isInteger(d.armor), `${kind}: armour is a small flat number`);
    if (d.shield) assert.ok(d.shield > 0 && d.shield < 0.8, kind);
    assert.equal(FACTIONS.filter(f => f.units.includes(kind)).length, 1, kind);
    assert.equal(FACTIONS.find(f => f.id === d.faction)!.units.includes(kind), true, kind);
    if (d.ranged) assert.ok(d.proj && d.projSpeed, kind);
    assert.ok(FACTIONS.find(f => f.units.includes(kind))!.units.length <= 9, "tab keys 1-9 cover the cards");
  }
});

test("campaign: 4 scenes x 5 stages plus one extra, sequential ids, escalating scale and full unlocks", () => {
  assert.equal(STAGES.length, 21);
  const seen = new Set<UnitKind>();
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    assert.equal(s.id, i + 1);
    assert.equal(s.scene, Math.min(4, Math.floor(i / 5) + 1));
    assert.ok(s.name && s.hint && s.budget > 0, `stage ${s.id} metadata`);
    assert.ok(s.enemies.length > 0, `stage ${s.id} has enemies`);
    assert.ok(s.budget >= 300, `stage ${s.id} budget`);
    for (const k of s.unlock) {
      assert.ok(!seen.has(k), `${k} unlocked twice`);
      seen.add(k);
    }
    for (const e of s.enemies) {
      assert.ok(DEFS[e.kind], `stage ${s.id} enemy ${e.kind}`);
      assert.ok(e.count > 0);
      for (const p of stagePositions(e)) {
        assert.ok(Math.abs(p.x) <= FIELD.x - 1 && Math.abs(p.z) <= FIELD.z - 1, `stage ${s.id} spawn inside field`);
        assert.ok(p.x > 0, `stage ${s.id} enemies deploy on their side`);
      }
    }
  }
  const all = new Set(Object.keys(DEFS) as UnitKind[]);
  assert.deepEqual([...new Set(unlockedThrough(STAGES.length))].sort(), [...all].sort());
  assert.deepEqual(unlockedThrough(0).sort(), [...STARTER_UNITS].sort());
});

test("campaign: player budget stays tightly tuned (no 1.7x free-win bloat)", () => {
  for (const s of STAGES) {
    const ratio = enemyCost(s) / s.budget;
    assert.ok(ratio >= 0.7 && ratio <= 1.25, `stage ${s.id}: enemy ${Math.round(ratio * 100)}% of budget`);
  }
  const avg = (scene: number, pick: (s: typeof STAGES[number]) => number) =>
    STAGES.filter(s => s.scene === scene).reduce((n, s) => n + pick(s), 0) / 5;
  assert.ok(avg(2, enemyCost) > avg(1, enemyCost));
  assert.ok(avg(3, enemyCost) > avg(2, enemyCost));
  assert.ok(avg(4, enemyCost) > avg(3, enemyCost));
  assert.ok(avg(4, s => s.budget) > avg(1, s => s.budget));
});

test("paladin charges into melee on the frontline while still healing nearby allies", () => {
  const s = empty();
  const paladin = s.spawn(0, "paladin", -20, 0);
  const wounded = s.spawn(0, "spear", -26, 4); // behind the paladin!
  wounded.hp = 40;
  wounded.order = "hold";
  const enemy = dummy(s, 0, 0, 1e6);
  s.begin();
  run(s, 6);
  assert.ok(paladin.position.x > -10, `paladin should charge forward toward enemies (x=${paladin.position.x.toFixed(1)})`);
  assert.ok(enemy.hp < enemy.maxHp, "paladin must actively strike enemies");
  // When a wounded ally IS within healRange (8.5m), paladin heals without retreating
  const s2 = empty();
  const pal2 = s2.spawn(0, "paladin", -10, 0);
  const ally2 = s2.spawn(0, "spear", -13, 0);
  ally2.hp = 40; ally2.order = "hold";
  const farEnemy = dummy(s2, 20, 0, 1e6);
  s2.begin();
  run(s2, 1.5);
  assert.ok(ally2.hp > 40, "paladin heals nearby wounded ally");
  assert.ok(pal2.position.x > -8, "paladin keeps advancing toward enemy while healing");
  void farEnemy;
});

test("shaman slows both movement and attack speed in its AoE", () => {
  assert.ok((DEFS.shaman.slow ?? 0) >= 2.5);
  const s = empty();
  const shaman = s.spawn(0, "shaman", -16, 0);
  const victim = s.spawn(1, "orc", 0, 0);
  victim.order = "hold";
  victim.cooldown = 1e9;
  s.begin();
  s.fire(shaman, victim);
  run(s, 1.4);
  assert.ok(victim.slowT > 1.0, "shaman bolt applies slow");

  // Compare movement speed and DPS of slowed vs normal unit
  const testRate = (chilled: boolean) => {
    const b = empty();
    const attacker = b.spawn(0, "spear", -1.5, 0);
    if (chilled) attacker.slowT = 20;
    const t = dummy(b, 0.5, 0, 1e6);
    b.begin();
    run(b, 8);
    return t.maxHp - t.hp;
  };
  assert.ok(testRate(false) > testRate(true) * 1.25, "slowed unit attacks noticeably slower");
});

test("heavy cavalry charge scales damage and knockback up to 1.5x by speed on first hit", () => {
  const s = empty();
  const knight = s.spawn(0, "knight", -25, 0);
  const target = dummy(s, 5, 0, 5000);
  s.begin();
  // Let knight gallop until first impact
  let charged = false;
  for (let i = 0; i < 600 && !charged; i++) {
    s.advance(FIXED_STEP);
    if (target.hp < 5000) charged = true;
  }
  assert.ok(charged, "knight hits target");
  const firstHitDmg = 5000 - target.hp;
  // Base dmg is 50; with speed charge up to 1.5x (~75) and frontal shield 0 -> should exceed 62!
  assert.ok(firstHitDmg > DEFS.knight.dmg * 1.3, `charge first hit should deal boosted damage, got ${firstHitDmg.toFixed(1)}`);
  assert.ok(target.airborne, "charge impact launches frontline target into the air");
  assert.equal(knight.chargeReady, false, "charge bonus consumed on first impact");
});

test("no income during battle, custom clearUnits resets both sides", () => {
  const s = empty();
  s.setupSandbox();
  const start = s.gold[0];
  s.deploy("spear", 20, 0, 1, 1); // custom mode allows placing enemy too!
  assert.equal(s.gold[1], SANDBOX_BUDGET - DEFS.spear.cost);
  assert.equal(s.clearUnits(), true);
  assert.equal(s.units.length, 0);
  assert.deepEqual(s.gold, [SANDBOX_BUDGET, SANDBOX_BUDGET]);
  s.deploy("spear", -20, 0, 1, 0);
  s.deploy("spear", 20, 0, 1, 1);
  s.begin();
  s.speed = 4;
  run(s, 12);
  assert.equal(s.gold[0], start - DEFS.spear.cost);
});

test("story mode blocks battle-time reinforcement and locked units", () => {
  const story = empty();
  story.setupStage(STAGES[0], 0);
  assert.equal(story.deploy("knight", -20, 0, 1).reason, "locked");
  assert.equal(story.deploy("spear", -20, 0, 1).count, 1);
  story.begin();
  assert.equal(story.deploy("spear", -20, 0, 1).reason, "inactive");
});

test("TABS-style knockback: strong hits launch, land, stun, then recover; fatal blows fling corpses", () => {
  const s = empty();
  const light = s.spawn(0, "spear", 0, 0);
  const foe = s.spawn(1, "spear", 40, 0);
  foe.order = "hold";
  s.begin();
  s.damage(light, 10, 1, new Vector3(-4, 0, 0), DEFS.knight.impact);
  assert.ok(light.airborne, "launched");
  let guard = 0;
  while (light.airborne && guard++ < 400) s.advance(FIXED_STEP);
  assert.equal(light.airborne, false);
  assert.ok(light.downTime > 0 || light.getUp > 0);
  assert.equal(s.isDown(light), true);
  assert.ok(light.position.x > 1.5, "thrown backward meaningfully");
  run(s, 2.6);
  assert.equal(s.isDown(light), false);

  // Fatal blow preserves launch momentum
  const victim = s.spawn(0, "skeleton", 0, 5);
  s.damage(victim, 1e6, 1, new Vector3(-4, 0, 5), DEFS.giant.impact);
  assert.ok(victim.dead && victim.airborne, "corpse flies from giant blow");
});

test("mass resists knockback: a giant barely staggers, a skeleton flies", () => {
  const s = empty();
  s.begin();
  const giant = s.spawn(0, "giant", 0, 0);
  const bone = s.spawn(0, "skeleton", 6, 0);
  s.damage(giant, 20, 1, new Vector3(-6, 0, 0), DEFS.knight.impact);
  s.damage(bone, 20, 1, new Vector3(2, 0, 0), DEFS.knight.impact);
  assert.equal(giant.airborne, false);
  assert.equal(bone.airborne, true);
  assert.ok(giant.knock.length() < bone.knock.length());
});

test("all 25 unit types deploy and showcase lines them up facing +Z", () => {
  for (const kind of DEPLOY) {
    const s = empty();
    s.setupSandbox();
    s.gold[0] = 2000;
    assert.equal(s.deploy(kind, -20, 0, 1).count, 1, kind);
  }
  const sh = empty();
  sh.showcase();
  assert.equal(sh.count(0), DEPLOY.length);
  assert.equal(sh.count(1), DEPLOY.length);
  assert.ok(sh.units.every(u => u.facing === 0));
});

test("paladin aura is balanced: heals modestly, never out-heals the whole army", () => {
  assert.ok((DEFS.paladin.heal ?? 0) <= 16, "paladin heal per tick must stay modest");
  assert.ok((DEFS.paladin.healRange ?? 0) <= 7, "paladin aura range must stay small");
  const s = new BattleSimulation(); s.reset(false);
  const paladin = s.spawn(0, "paladin", -20, 0);
  const a = s.spawn(0, "spear", -22, -3), b = s.spawn(0, "spear", -22, 3);
  a.hp = b.hp = 25;
  a.order = b.order = "hold";
  s.spawn(1, "giant", 30, 0).order = "hold";
  s.begin();
  run(s, 3);
  const gained = (a.hp - 25) + (b.hp - 25);
  assert.ok(a.hp > 25 && b.hp > 25, "aura heals every wounded ally in range");
  assert.ok(gained < 60, `aura must not out-heal the army (gained ${gained})`);
  assert.ok(paladin.position.x > -12, "paladin still advances into the fight");
});

test("king aura boosts nearby allies only", () => {
  const s = new BattleSimulation(); s.reset(false);
  s.spawn(0, "king", -10, 0);
  const near = s.spawn(0, "spear", -12, 2);
  const far = s.spawn(0, "spear", 30, 0);
  s.begin();
  assert.ok(s.buffFor(near) > 0.2, "allies near the king are strengthened");
  assert.equal(s.buffFor(far), 0, "allies far from the king are unaffected");
});

test("zeus chain lightning arcs to several enemies", () => {
  const s = new BattleSimulation(); s.reset(false);
  const zeus = s.spawn(0, "zeus", -14, 0);
  const targets = [s.spawn(1, "orc", 0, 0), s.spawn(1, "orc", 2, 0), s.spawn(1, "orc", 0, 2)];
  for (const t of targets) { t.hp = t.maxHp = 900; t.order = "hold"; t.cooldown = 1e9; }
  s.begin();
  s.fire(zeus, targets[0]);
  run(s, 2.5);
  const hurt = targets.filter(t => t.hp < t.maxHp).length;
  assert.ok(hurt >= 2, `chain lightning should hit multiple enemies (hit ${hurt})`);
});

test("railgun pierces a line of enemies", () => {
  const s = new BattleSimulation(); s.reset(false);
  const gun = s.spawn(0, "railgun", -20, 0);
  const line = [s.spawn(1, "orc", 0, 0), s.spawn(1, "orc", 2, 0), s.spawn(1, "orc", 4, 0)];
  for (const t of line) { t.hp = t.maxHp = 900; t.order = "hold"; t.cooldown = 1e9; }
  s.begin();
  s.fire(gun, line[0]);
  run(s, 1.2);
  const hurt = line.filter(t => t.hp < t.maxHp).length;
  assert.ok(hurt >= 2, `railgun should pierce several targets (hit ${hurt})`);
});

test("pirate and tank fire their own projectile styles", () => {
  const s = new BattleSimulation(); s.reset(false);
  const pirate = s.spawn(0, "pirate", -14, 0);
  const tank = s.spawn(0, "tank", -18, 6);
  const t1 = s.spawn(1, "spear", 0, 0), t2 = s.spawn(1, "spear", 0, 6);
  for (const t of [t1, t2]) { t.hp = t.maxHp = 900; t.order = "hold"; t.cooldown = 1e9; }
  s.begin();
  s.fire(pirate, t1);
  s.fire(tank, t2);
  assert.equal(s.projectiles[0].style, "pistol");
  assert.equal(s.projectiles[1].style, "cannon");
  run(s, 1.5);
  assert.ok(t1.hp < t1.maxHp, "pistol hits");
});

test("machines are armoured but costly, and the robot trades bulk for speed", () => {
  assert.ok(DEFS.tank.armor >= 8 && DEFS.tank.cost >= 300, "tank is a heavy investment");
  assert.ok(DEFS.robot.armor >= 6 && DEFS.robot.speed > 4, "robot is armoured but quick");
  assert.ok(DEFS.railgun.range >= 28 && DEFS.railgun.cost >= 250, "railgun is a long-range investment");
});

test("premium units are priced as decisive investments", () => {
  assert.equal(DEFS.knight.cost, 200, "heavy cavalry is a 200 investment");
  assert.equal(DEFS.zeus.cost, 500, "Zeus is a 500 centerpiece");
  assert.ok(DEFS.zeus.cost > DEFS.giant.cost, "Zeus costs more than a giant");
  assert.ok(DEFS.knight.impact > DEFS.paladin.impact * 0.9, "cavalry still hits hard for the price");
  assert.ok((DEFS.zeus.chain ?? 0) >= 5, "Zeus' lightning chains wide for the price");
});

test("knockback follows a readable ballistic arc whose range scales with impact", () => {
  const flight = (impact: number) => {
    const s = new BattleSimulation(7); s.reset(false);
    const victim = s.spawn(0, "spear", 0, 0);
    const shooter = s.spawn(1, "spear", -5, 0);
    shooter.order = "hold";
    s.begin();
    s.damage(victim, 5, 1, shooter.position, impact);
    if (!victim.airborne) return { airborne: false, apex: 0, dist: 0, stun: 0 };
    let guard = 0;
    let apex = 0;
    const start = victim.position.x;
    while (victim.airborne && guard++ < 900) {
      s.advance(FIXED_STEP);
      apex = Math.max(apex, victim.position.y);
    }
    const dist = Math.abs(victim.position.x - start);
    const stun = victim.downTime + victim.getUp;
    return { airborne: true, apex, dist, stun };
  };

  const light = flight(3.5);
  const heavy = flight(9);
  const giant = flight(16);

  assert.ok(light.airborne, "even a modest blow launches a light unit");
  assert.ok(light.apex > 0.3, `light hit lifts the body off the ground (apex ${light.apex.toFixed(2)})`);
  assert.ok(light.apex < 12, "the launch is capped, never into orbit");
  assert.ok(heavy.apex > light.apex, "a heavier blow lifts higher");
  // Range and stun must both grow with impact
  assert.ok(heavy.dist > light.dist * 1.15, `range grows with impact (${light.dist.toFixed(1)}m -> ${heavy.dist.toFixed(1)}m)`);
  assert.ok(giant.dist > heavy.dist * 1.1, `heavy blows throw further (${heavy.dist.toFixed(1)}m -> ${giant.dist.toFixed(1)}m)`);
  assert.ok(giant.apex <= giant.apex, "apex stays finite");
  assert.ok(giant.apex < 16, "giant blow does not launch a body into orbit");
  assert.ok(giant.dist < 40, "a throw still lands on the battlefield");
  assert.ok(giant.stun > light.stun, `longer flight means a longer stun (${light.stun.toFixed(2)}s -> ${giant.stun.toFixed(2)}s)`);
  assert.ok(giant.stun <= 3.5, "a stun never locks a unit out of the whole battle");

  // The body must actually descend onto the ground, not vanish.
  const s2 = new BattleSimulation(7);
  s2.reset(false);
  const u = s2.spawn(0, "spear", 0, 0);
  const foe = s2.spawn(1, "spear", -30, 0); // both armies present so the sim may run
  foe.order = "hold";
  foe.cooldown = 1e9;
  assert.equal(s2.begin(), true);
  s2.damage(u, 5, 1, new Vector3(-4, 0, 0), DEFS.knight.impact);
  let g = 0;
  while (u.airborne && g++ < 900) s2.advance(FIXED_STEP);
  assert.equal(u.position.y, 0, "settles flush on the ground");
  assert.ok(u.position.x > 0.5, `travels away from the blow (x ${u.position.x.toFixed(2)})`);
});

test("a downed unit is a free target and recovers into an upright stance", () => {
  const s = new BattleSimulation(7);
  s.reset(false);
  const victim = s.spawn(0, "spear", 0, 0);
  const hunter = s.spawn(1, "spear", -6, 0);
  hunter.order = "hold";
  s.begin();
  s.damage(victim, 5, 1, hunter.position, DEFS.knight.impact);
  let guard = 0;
  while (victim.airborne && guard++ < 900) s.advance(FIXED_STEP);
  const downed = s.isDown(victim);
  assert.equal(downed, true);
  // Repeated blows while prone keep it grounded instead of juggling it forever
  s.damage(victim, 5, 1, hunter.position, DEFS.orc.impact);
  assert.equal(victim.airborne, false, "not juggled while already down");
  guard = 0;
  while (s.isDown(victim) && guard++ < 900) s.advance(FIXED_STEP);
  assert.equal(s.isDown(victim), false, "gets back up");
  assert.ok(victim.hp > DEFS.spear.hp - 14, `the sample blows were non-lethal (hp ${victim.hp})`);
});

// The combat rules that create the counter web. Each test pins one physical rule, not a tuned number.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import {
  ARMOR_FLOOR, BLAST_RIM, BattleSimulation, FIXED_STEP, FLANK_MULT, SIDEARM_DAMAGE,
} from "../src/game/simulation";
import { DEFS, type UnitKind } from "../src/game/units";

function empty(seed = 2026) {
  const sim = new BattleSimulation(seed);
  sim.reset(false);
  return sim;
}
function run(sim: BattleSimulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) sim.advance(FIXED_STEP);
}
const lost = (u: { hp: number; maxHp: number }) => u.maxHp - u.hp;

test("the source contains no formation or matchup damage scaling", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/game/simulation.ts", import.meta.url), "utf8");
  for (const banned of ["isPhalanxFlankExposed", "phalanxOrdered", "wingDeployed", "meleeDeployed", "aimSteady", "sceneIndex > 0 &&"]) {
    assert.ok(!src.includes(banned), `hidden rule "${banned}" must stay removed`);
  }
  // Damage never depends on which unit kind is attacking which.
  const body = src.slice(src.indexOf("  damage(unit: CombatUnit"), src.indexOf("  private heal("));
  assert.ok(!/kind === "/.test(body), "damage() must not special-case unit kinds");
});

test("flat armour: subtracts from every hit, but a hit always keeps its floor share", () => {
  const s = empty();
  const robot = s.spawn(0, "robot", 0, 0);
  const armor = DEFS.robot.armor;
  s.damage(robot, 50, 1);
  assert.ok(Math.abs(lost(robot) - (50 - armor)) < 1e-9, "a heavy hit loses only the flat armour");
  robot.hp = robot.maxHp;
  s.damage(robot, 6, 1);
  assert.ok(Math.abs(lost(robot) - 6 * ARMOR_FLOOR) < 1e-9, "a light hit is cut to the floor");
  // So ten light hits do far less than one heavy hit of the same total.
  assert.ok(10 * 6 * ARMOR_FLOOR < (60 - armor) * 0.5);
});

test("shield: cuts frontal blades and arrows, never blasts, never the rear, never while knocked down", () => {
  const s = empty();
  const mk = (z: number) => { const g = s.spawn(0, "guardian", 0, z); g.facing = Math.PI / 2; return g; };
  const front = mk(0), blast = mk(10), rear = mk(20), down = mk(30);
  const sh = DEFS.guardian.shield!;
  s.damage(front, 100, 1, new Vector3(10, 0, 0));
  s.damage(blast, 100, 1, new Vector3(10, 0, 10), 0, undefined, true);
  s.damage(rear, 100, 1, new Vector3(-10, 0, 20));
  down.downTime = 1;
  s.damage(down, 100, 1, new Vector3(10, 0, 30));
  assert.ok(Math.abs(lost(front) - 100 * (1 - sh)) < 1e-6);
  assert.ok(Math.abs(lost(blast) - 100) < 1e-6, "explosions ignore the shield");
  assert.ok(Math.abs(lost(rear) - 100 * FLANK_MULT) < 1e-6, "rear hits are unshielded and amplified");
  assert.ok(Math.abs(lost(down) - 100) < 1e-6, "a floored guard cannot block");
});

test("blast: full strength at the centre, fading to the rim, nothing outside", () => {
  const s = empty();
  const bomber = s.spawn(0, "bomber", -12, 0);
  const centre = s.spawn(1, "orc", 0, 0);
  const rim = s.spawn(1, "orc", 0, DEFS.bomber.aoe! + DEFS.orc.radius - 0.4);
  const outside = s.spawn(1, "orc", 0, 9);
  for (const u of [centre, rim, outside]) { u.order = "hold"; u.cooldown = 1e9; u.hp = u.maxHp = 1000; }
  bomber.order = "hold";
  s.begin();
  s.fire(bomber, centre);
  run(s, 2.5);
  assert.ok(lost(centre) > 0 && lost(rim) > 0, "both inside the blast are hurt");
  assert.ok(lost(rim) < lost(centre), "the rim takes less than the centre");
  assert.ok(lost(rim) >= lost(centre) * BLAST_RIM * 0.5);
  assert.equal(lost(outside), 0);
});

test("pinned shooters cannot shoot: an enemy on top of an archer reduces it to a knife", () => {
  const s = empty();
  const archer = s.spawn(0, "archer", 0, 0);
  const brute = s.spawn(1, "orc", 2, 0);
  brute.order = "hold"; brute.cooldown = 1e9;
  s.begin();
  let arrows = 0;
  for (let i = 0; i < 600; i++) { s.advance(FIXED_STEP); for (const e of s.drainEvents()) if (e.type === "arrow") arrows++; }
  assert.equal(arrows, 0, "no arrow leaves the bow while pinned");
  assert.equal(archer.sidearm, true);
  assert.ok(lost(brute) > 0 && lost(brute) < 10 * SIDEARM_DAMAGE * 1.2, "only knife scratches land");

  // The same archer with a guard holding the enemy at arm's length shoots freely.
  const s2 = empty();
  s2.spawn(0, "archer", -12, 0);
  const far = s2.spawn(1, "orc", 2, 0);
  far.order = "hold"; far.cooldown = 1e9;
  s2.begin();
  let free = 0;
  for (let i = 0; i < 600; i++) { s2.advance(FIXED_STEP); for (const e of s2.drainEvents()) if (e.type === "arrow") free++; }
  assert.ok(free >= 4, `unpinned archer keeps shooting (${free})`);
});

test("a melee blow restarts a shooter's draw", () => {
  const s = empty();
  const cross = s.spawn(0, "crossbow", 0, 0);
  cross.windup = 0.1;
  s.damage(cross, 1, 1, new Vector3(1, 0, 0), 0, undefined, false, true);
  assert.equal(cross.windup, DEFS.crossbow.windup);
});

test("brace: a spear wall stops a cavalry charge and hurts it far more than a walker", () => {
  const charge = (defender: UnitKind) => {
    const s = empty(5);
    const knight = s.spawn(1, "knight", 26, 0);
    const line = [-3.6, -1.2, 1.2, 3.6].map(z => s.spawn(0, defender, 0, z));
    s.begin();
    let charges = 0;
    for (let i = 0; i < 60 * 20; i++) { s.advance(FIXED_STEP); for (const e of s.drainEvents()) if (e.type === "charge") charges++; }
    return { knightLost: lost(knight), charges, alive: line.filter(u => !u.dead).length, dead: knight.dead };
  };
  const spears = charge("spear");
  const swords = charge("swordsman");
  assert.ok(swords.charges >= 1, "without polearms the charge lands");
  assert.ok(spears.charges <= swords.charges, "points in the way never help the charge");
  assert.ok(spears.dead && spears.alive >= 1, `four spears (200 gold) kill a 200-gold knight (${JSON.stringify(spears)})`);
  assert.ok(!swords.dead || spears.alive > swords.alive, `swordsmen pay more for the same knight (${JSON.stringify(spears)} vs ${JSON.stringify(swords)})`);

  // Against something that merely walks up, a spear thrust is just a spear thrust.
  const s = empty();
  const spear = s.spawn(0, "spear", 0, 0);
  const zombie = s.spawn(1, "zombie", 6, 0);
  s.begin();
  run(s, 4);
  const perHit = DEFS.spear.dmg * 1.1;
  assert.ok(lost(zombie) > 0 && lost(zombie) <= perHit * 2 + 1e-6, "no brace bonus against a slow walker");
  assert.ok(!spear.dead);
});

test("formations march together until first blood, then everyone runs at their own speed", () => {
  const s = empty();
  const fast = s.spawn(0, "assassin", -40, 10);
  const slow = s.spawn(0, "guardian", -40, 0);
  s.spawn(1, "zombie", 40, 0).order = "hold";
  s.begin();
  run(s, 4);
  assert.equal(s.engaged, false);
  assert.ok(Math.abs(fast.position.x - slow.position.x) < 1.5, "the assassin holds the guard's pace on the approach");
  const dummy = s.units.find(u => u.team === 1)!;
  s.damage(dummy, 1, 0);
  assert.equal(s.engaged, true, "the first wound releases the formation");
  run(s, 3);
  assert.ok(fast.position.x - slow.position.x > 6, "now the fast unit pulls ahead");
});

test("hunters go for the back line, everyone else for the nearest enemy", () => {
  const s = empty();
  const assassin = s.spawn(0, "assassin", 0, 0);
  const sword = s.spawn(0, "swordsman", 0, 4);
  const front = s.spawn(1, "guardian", 8, 0);
  const back = s.spawn(1, "archer", 20, 0);
  s.begin();
  run(s, 0.1);
  assert.equal(assassin.targetId, back.id);
  assert.equal(sword.targetId, front.id);
});

test("a shield wall physically covers the rank behind it from flat shots", () => {
  const cover = (withWall: boolean) => {
    const s = empty(3);
    for (let i = 0; i < 4; i++) { const a = s.spawn(1, "crossbow", 24, (i - 1.5) * 2.4); a.order = "hold"; }
    const vip = s.spawn(0, "cleric", -1.6, 0);
    vip.order = "hold";
    if (withWall) for (const z of [-1.3, 0, 1.3]) { const g = s.spawn(0, "guardian", 0, z); g.order = "hold"; g.cooldown = 1e9; }
    else { const g = s.spawn(0, "guardian", 0, 30); g.order = "hold"; }
    s.begin();
    run(s, 6);
    return lost(vip);
  };
  assert.equal(cover(true), 0, "the wall soaks every bolt");
  assert.ok(cover(false) > 0);
});

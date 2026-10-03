// Range session rules against the REAL Actor with the production gameplay patches installed (one vm realm).
// What is pinned here: targets are ordinary Actors (team Bravo) damaged by Actor.damage; the session only reads events;
// the training-only rules (re-inflate in place, endurance, rail speed = live run speed, travel, resupply) are exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

async function world() {
  const R = await rangeRealm();
  const { G, Actor, Character, RangeSession, THREE } = R;
  const { splats } = rangeWorld(R);
  const local = new Actor({ team: 0, name: 'tester', weapon: 'shooter', isLocal: true, CharacterClass: Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  local.character.actor = local;
  const m = { actors: [local], local, state: 'playing', paused: false, canRespawn: () => true, opts: { range: true } };
  G.actors = m.actors; G.match = m; G.local = local;
  local.spawnAt(new THREE.Vector3(...R.ZONES.SPAWN), 0);
  const s = new RangeSession(m, { headless: true });
  m.range = s;
  // install.mjs routes the game's events to the session; the harness does the same
  const offs = [R.on('damage', (e) => G.match?.range?.onDamage(e)), R.on('splatted', (e) => G.match?.range?.onSplatted(e))];
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { G.time += 1 / 60; for (const a of m.actors) a.update(1 / 60); s.update(1 / 60); } };
  return { R, G, s, m, local, tick, splats, done: () => offs.forEach((u) => u()) };
}

test('targets are real Bravo actors on their plinths, facing their stand marks', async () => {
  const w = await world();
  try {
    const { s, R, tick } = w;
    tick(30);
    assert.equal(s.targets.length, R.ZONES.GALLERY_TARGETS.length + 2 + R.ZONES.SPECIAL_TARGETS.length);
    for (const a of s.targets) {
      assert.ok(a instanceof R.Actor);
      assert.equal(a.team, 1); assert.equal(a.isBot, false); assert.equal(a.bot, undefined);
      assert.ok(w.m.actors.includes(a));
    }
    const g = s.targets.filter((a) => a.rangeTarget.zone === 'gallery');
    for (const a of g) {
      assert.ok(Math.abs(a.pos.x - a.rangeTarget.x) < 1e-9 && Math.abs(a.pos.z - a.rangeTarget.z) < 1e-9);
      assert.ok(Math.abs(a.pos.y - 0.02) < 1e-6, 'standing on the plinth');
      assert.ok(Math.abs(a.yaw - Math.PI) < 1e-9 || Math.abs(a.yaw + Math.PI) < 1e-9, 'facing the firing line (−Z)');
    }
  } finally { w.done(); }
});

test('damage comes from Actor.damage untouched: shots to splat, combo, time-to-splat, re-inflate in place', async () => {
  const w = await world();
  try {
    const { s, local, tick, R } = w;
    tick(10);
    const t = s.targets.find((a) => a.rangeTarget.zone === 'gallery' && a.rangeTarget.z === 15);
    local.pos.set(t.pos.x, 0, 3);
    const hp0 = t.hp;
    assert.equal(hp0, R.PLAYER.hp);
    let hits = 0;
    while (t.alive && hits < 20) { t.damage(R.WEAPONS.shooter.damage, local, 'shooter'); hits++; tick(6); }
    assert.equal(hits, Math.ceil(R.PLAYER.hp / R.WEAPONS.shooter.damage), 'hits to splat = ceil(hp / damage)');
    assert.equal(t.rangeTarget.combo.hits, hits);
    assert.ok(Math.abs(t.rangeTarget.combo.total - hits * R.WEAPONS.shooter.damage) < 1e-9);
    assert.ok(t.rangeTarget.combo.done);
    assert.ok(Math.abs(t.rangeTarget.combo.splatT - (hits - 1) * 6 / 60) < 1e-6, 'time from first hit to splat');
    assert.ok(Math.abs(s.last.dist - 12) < 1e-9, 'horizontal distance shooter → target');
    tick(Math.round(60 * 2.0) - 6 - 2);   // (the loop already ran 6 ticks after the splat)
    assert.equal(t.alive, false, 'still popped just before the re-inflate time');
    tick(4);
    assert.equal(t.alive, true);
    assert.equal(t.hp, R.PLAYER.hp);
    assert.equal(t.invuln, 0, 'no spawn shield on a target');
    assert.ok(Math.abs(t.pos.x - t.rangeTarget.x) < 1e-9 && Math.abs(t.pos.z - t.rangeTarget.z) < 1e-9, 're-inflated where it stood');
  } finally { w.done(); }
});

test('endurance targets report damage and never pop', async () => {
  const w = await world();
  try {
    const { s, local, tick } = w;
    const e = s.targets.find((a) => a.rangeTarget.kind === 'endurance');
    for (let i = 0; i < 10; i++) { e.damage(180, local, 'slam'); tick(1); }
    assert.equal(e.alive, true);
    assert.ok(e.rangeTarget.combo.total >= 1800 - 1e-9);
  } finally { w.done(); }
});

test('rail target: peak speed is the live PLAYER.runSpeed (patched profile), stops when moving targets are off', async () => {
  const w = await world();
  try {
    const { s, tick, R } = w;
    const r = s.targets.find((a) => a.rangeTarget.kind === 'rail');
    let peak = 0, minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 600; i++) { tick(1); peak = Math.max(peak, Math.abs(r.vel.x)); minX = Math.min(minX, r.pos.x); maxX = Math.max(maxX, r.pos.x); }
    assert.equal(R.PLAYER.runSpeed, R.profile.player.runSpeed, 'patched run speed in effect');
    assert.ok(Math.abs(peak - R.PLAYER.runSpeed) < 0.02, `peak ${peak} vs run ${R.PLAYER.runSpeed}`);
    assert.ok(minX >= R.ZONES.DODGE_RAIL.x[0] - 1e-6 && maxX <= R.ZONES.DODGE_RAIL.x[1] + 1e-6, 'stays on its rail');
    s.setMovingTargets(false);
    const x0 = r.pos.x; tick(60);
    assert.equal(r.pos.x, x0); assert.equal(r.vel.x, 0);
  } finally { w.done(); }
});

test('travel, resupply, weapon switch, reset targets', async () => {
  const w = await world();
  try {
    const { s, local, tick, R } = w;
    for (const tp of R.ZONES.TRAVEL) {
      s.travel(tp.id);
      assert.ok(Math.abs(local.pos.x - tp.pos[0]) < 1e-9 && Math.abs(local.pos.z - tp.pos[2]) < 1e-9, tp.id);
      assert.equal(local.yaw, tp.yaw);
      tick(20);
      assert.ok(Math.abs(local.pos.y - tp.pos[1]) < 0.06, `${tp.id} lands on its floor (${local.pos.y})`);
    }
    local.ink = 3; local.special = 0;
    s.resupply();
    assert.equal(local.ink, R.PLAYER.inkMax); assert.equal(local.special, local.specialCost());
    s.setWeapon('charger');
    assert.equal(local.weaponId, 'charger'); assert.equal(local.weapon.kind, 'charger');
    const t = s.targets[0]; t.damage(500, local, 'x'); assert.equal(t.alive, false);
    s.resetTargets();
    assert.ok(s.targets.every((a) => a.alive && a.hp >= R.PLAYER.hp));
  } finally { w.done(); }
});

test('ink course paints only the swim course floor (and never the island)', async () => {
  const w = await world();
  try {
    const { s, splats, R } = w;
    splats.length = 0;
    s.inkCourse();
    assert.ok(splats.length > 200);
    const [x0, x1, z0, z1] = R.ZONES.ZONES.squid.rect, I = R.ZONES.SWIM.island;
    for (const [x, , z, , team] of splats) {
      assert.ok(x >= x0 && x <= x1 && z >= z0 && z <= z1);
      assert.ok(!(x > I.x[0] + 0.01 && x < I.x[1] - 0.01 && z > I.z[0] + 0.01 && z < I.z[1] - 0.01), 'not on the island');
      assert.equal(team, 0);
    }
  } finally { w.done(); }
});

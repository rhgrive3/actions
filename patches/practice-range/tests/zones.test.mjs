// Zone checks with the real gameplay code (patched Actor, WeaponRunner, Projectiles, Physics) on the real range level.
// These are LOGIC-ONLY checks (60 Hz ticks, no rendering): they show each zone does its job with the game's own rules.
// They are not browser behaviour and not a Splatoon 3 comparison (reports/practice-range-report.md keeps those apart).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

async function setup(weapon = 'shooter', inked = () => false) {
  const R = await rangeRealm();
  const { G, Actor, Character, THREE, Projectiles, RangeSession } = R;
  const W = rangeWorld(R);
  G.paint.sample = (face) => (inked(G.level.faces[face]) ? 1 : 0);   // team 0 ink where `inked` says so
  G.projectiles = new Projectiles(G.scene);
  G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0, 60, -300);
  const a = new Actor({ team: 0, name: 'tester', weapon, isLocal: true, CharacterClass: Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  a.character.actor = a;
  const m = { actors: [a], local: a, state: 'playing', paused: false, canRespawn: () => true, playing: () => true, opts: { range: true } };
  G.actors = m.actors; G.match = m; G.local = a;
  const s = new RangeSession(m, { headless: true }); m.range = s;
  const offs = [R.on('damage', (e) => G.match?.range?.onDamage(e)), R.on('splatted', (e) => G.match?.range?.onSplatted(e))];
  const tick = (n, f) => { for (let i = 0; i < n; i++) { G.time += 1 / 60; f?.(i); for (const x of m.actors) x.update(1 / 60); G.projectiles.update(1 / 60); s.update(1 / 60); } };
  const put = (x, z, yaw = 0) => { a.spawnAt(new THREE.Vector3(x, 0.05, z), yaw); a.invuln = 0; tick(20); };
  return { R, G, a, s, W, tick, put, done: () => offs.forEach((u) => u()) };
}

test('bomb pit: a Splat Bomb thrown from the pit stand lands and explodes inside the pit', async () => {
  const w = await setup();
  try {
    const { a, G, W, R, tick, put } = w;
    put(R.ZONES.BOMB_STAND[0], R.ZONES.BOMB_STAND[1]);
    a.aimYaw = 0; a.aimPitch = -1.2; W.splats.length = 0;
    G.projectiles.throwBomb(a);
    tick(300);
    assert.equal(G.projectiles.bombs.length, 0, 'exploded');
    const [x0, x1, z0, z1] = R.ZONES.ZONES.bomb.rect;
    const [x, , z] = W.splats[0];
    assert.ok(x > x0 && x < x1 && z > z0 && z < z1, `explosion at ${x.toFixed(2)}, ${z.toFixed(2)}`);
  } finally { w.done(); }
});

test('wall lab: shots from the 5 m stand reach the test wall face (z = 50)', async () => {
  const w = await setup();
  try {
    const { a, W, R, tick, put } = w;
    const [x, z] = R.ZONES.WALL_STANDS[1];
    put(x, z);
    a.aimYaw = 0; a.aimPitch = 0.15; W.splats.length = 0;
    tick(60, () => { a.intent.fire = true; }); a.intent.fire = false; tick(60);
    const onWall = W.splats.filter((sp) => sp[2] > R.ZONES.WALL_FACE_Z - 0.6);
    assert.ok(onWall.length >= 5, `${onWall.length} splats on the wall`);
  } finally { w.done(); }
});

test('swim course: swimming in your own ink on the straight reaches the game swim speed', async () => {
  const w = await setup('shooter', (f) => f && f.turf);
  try {
    const { a, R, tick, put } = w;
    const S = R.ZONES.SWIM.straight;
    put((S.x[0] + S.x[1]) / 2, S.z[1] - 2, Math.PI);
    let peak = 0;
    tick(90, () => { a.intent.squid = true; a.intent.move.set(0, 0, -1); a.aimYaw = Math.PI; peak = Math.max(peak, Math.hypot(a.vel.x, a.vel.z)); });
    assert.ok(a.submerged, 'submerged in own ink');
    assert.ok(peak > R.PLAYER.swimSpeed * 0.9 && peak < R.PLAYER.swimSpeed * 1.2, `peak ${peak.toFixed(2)} vs swim ${R.PLAYER.swimSpeed}`);
    assert.ok(a.pos.z > S.z[0] && a.pos.z < S.z[1] - 2, `travelled down the straight (z ${a.pos.z.toFixed(2)})`);
  } finally { w.done(); }
});

function assertRollStripe(events, sx0, sx1) {
  const stripe = events.filter(e => e.kind === 'roll').map(e => e.point);
  assert.ok(stripe.length > 10, `${stripe.length} actual rolling splats`);
  assert.ok(new Set(stripe.map(sp => sp[2])).size > 10, 'rolling stripe advances along the strip');
  assert.ok(stripe.every(sp => sp[0] > sx0 - 2 && sp[0] < sx1 + 2), 'stripe stays on the strip');
}

test('roller court: rolling along the strip lays a stripe on the court floor', async () => {
  const w = await setup('roller');
  try {
    const { a, W, R, tick, put } = w;
    const [sx0, sx1] = R.ZONES.ROLL_STRIP.x;
    put(R.ZONES.ROLL_STAND[0], R.ZONES.ROLL_STAND[1]);
    W.splats.length = 0; W.paintEvents.length = 0;
    tick(150, () => { a.intent.fire = true; a.intent.move.set(0, 0, 1); a.aimYaw = 0; });
    a.intent.fire = false; a.intent.move.set(0, 0, 0);
    // First press necessarily flicks. Its stochastic projectile impacts are not drum stripes.
    assert.ok(W.paintEvents.some(e => e.kind !== 'roll'), 'initial flick paint remains exercised');
    assertRollStripe(W.paintEvents, sx0, sx1);
    assert.ok(a.pos.z > R.ZONES.ROLL_STAND[1] + 5, 'rolled forward');
  } finally { w.done(); }
});

test('roller stripe boundary still rejects real rolling outside the permitted strip', async () => {
  const w = await setup('roller');
  try {
    const { a, W, R, tick, put } = w;
    const [sx0, sx1] = R.ZONES.ROLL_STRIP.x;
    put(sx0 - 2.1, R.ZONES.ROLL_STAND[1]);
    W.splats.length = 0; W.paintEvents.length = 0;
    tick(150, () => { a.intent.fire = true; a.intent.move.set(0, 0, 1); a.aimYaw = 0; });
    a.intent.fire = false; a.intent.move.set(0, 0, 0);
    assert.throws(() => assertRollStripe(W.paintEvents, sx0, sx1), /stripe stays on the strip/);
  } finally { w.done(); }
});

test('dodge pad: a dualies dodge roll from the stand moves the player and stays on the pad', async () => {
  const w = await setup('dualies');
  try {
    const { a, R, tick, put } = w;
    const [cx, cz] = R.ZONES.DODGE_STAND;
    put(cx, cz);
    tick(5, () => { a.intent.fire = true; });
    const from = a.pos.clone();
    a.intent.move.set(1, 0, 0);
    const rolled = a.weaponRunner.tryDodge(a.intent.move);
    tick(40, () => { a.intent.fire = true; a.intent.move.set(0, 0, 0); });
    assert.ok(rolled, 'dodge started');
    const d = Math.hypot(a.pos.x - from.x, a.pos.z - from.z);
    assert.ok(d > 1, `moved ${d.toFixed(2)} m`);
    const [x0, x1, z0, z1] = R.ZONES.ZONES.dualies.rect;
    assert.ok(a.pos.x > x0 && a.pos.x < x1 && a.pos.z > z0 && a.pos.z < z1);
  } finally { w.done(); }
});

test('special arena: a Tidal Slam at the centre hits the endurance targets, falling off with radius', async () => {
  const w = await setup('shooter');
  try {
    const { a, s, R, tick, put } = w;
    put(R.ZONES.SPECIAL_CENTER[0], R.ZONES.SPECIAL_CENTER[1]);
    // This named native-Slam zone probe is independent of Shooter's current Kit default.
    a.weapon = { ...a.weapon, special: 'slam' };
    a.special = a.specialCost();
    tick(3, () => { a.intent.special = true; }); a.intent.special = false;
    assert.equal(a.specialActive?.id, 'slam', 'the actual activation owns a native Slam');
    tick(180);
    const end = s.targets.filter((t) => t.rangeTarget.kind === 'endurance').map((t) => [t.rangeTarget.label, t.rangeTarget.combo?.total || 0, Math.hypot(t.pos.x - R.ZONES.SPECIAL_CENTER[0], t.pos.z - R.ZONES.SPECIAL_CENTER[1])]);
    assert.equal(a.specialActive, null, 'native Slam completes its real physics lifecycle');
    assert.ok(end.length > 0, 'the arena has endurance targets');
    const r = R.SPECIALS.slam.radius;
    for (const [label, dmg, dist] of end) {
      if (dist < r) assert.ok(dmg > 0, `${label} inside the slam radius took damage`);
      else assert.equal(dmg, 0, `${label} outside the radius untouched`);
    }
    assert.ok(end.every((t) => s.targets.find((x) => x.rangeTarget.label === t[0]).alive), 'endurance targets never pop');
  } finally { w.done(); }
});

test('perimeter: walking into the parapets never leaves the pier', async () => {
  const w = await setup();
  try {
    const { a, R, tick, put } = w;
    for (const [x, z, dir] of [[-34, 10, [-1, 0, 0]], [31, -5, [1, 0, 0]], [20, -18, [0, 0, -1]]]) {
      put(x, z);
      tick(240, (i) => { a.intent.move.set(...dir); a.intent.jump = i % 30 < 3; });
      a.intent.move.set(0, 0, 0); a.intent.jump = false; tick(30);
      assert.ok(a.alive && a.pos.x > R.ZONES.X.west && a.pos.x < R.ZONES.X.east && a.pos.z > R.ZONES.Z.south, `held at ${a.pos.x.toFixed(2)}, ${a.pos.z.toFixed(2)}`);
    }
  } finally { w.done(); }
});

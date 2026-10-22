// #1431: Quad Hopper (WeaponManeuverStepper) and Explosher (WeaponSlosherWashtub)
// rounds taken from the raw rig socket are born during WeaponRunner.update,
// BEFORE Actor._finishFrame poses the Character for that tick. The physical
// birth must stay exactly as before; only the muzzle FX request and the drawn
// history's birth sample move to the same tick's posed (drawn) muzzle.
// Direct-Actor 30/120 Hz runs are stress inputs; production gameplay uses the
// fixed 60 Hz clock. This is logic-level evidence, not a native image check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { POSE_BIRTH_MAX_CONNECT, poseBirthOffset } from '../runtime/catalog-pose-birth.mjs';

const IDS = ['s3-maneuver-stepper', 's3-slosher-washtub'];
const EXTRA = "export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';";
const CONTROL = 'const poseBirth = installCatalogPoseBirth(api);';
async function world({ control = false } = {}) {
  const f = await fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true, realProjectiles: true, extraExports: EXTRA,
    // Test-only control: the same production composition without the connection.
    adaptRuntime: (rel, code) => control && rel === 'patches/splatoon3/runtime/main-weapon-catalog.mjs'
      ? (assert.ok(code.includes(CONTROL)), code.replace(CONTROL, 'const poseBirth = {begin(){},attach(){},commit(){return false;},close(){},resolve(){}};')) : code });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.physics = new f.Physics(G.level);
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  const fx = [];
  const sink = { muzzle(pos, dir, color, kind) { fx.push({ pos: pos.toArray(), dir: dir.toArray(), kind }); } };
  G.fx = new Proxy(sink, { get: (t, k) => k in t ? t[k] : () => {} });
  return { f, fx };
}
function actor(w, id, { yaw = 0, pitch = 0 } = {}) {
  const { f } = w, { G } = f;
  const a = new f.Actor({ team: 0, weapon: id, CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; a.isLocal = true;
  a.yaw = yaw; a.aimPitch = pitch;
  a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0)).addScaledVector(a.aimDir, 12);
  G.actors = [a]; G.scene.add(ch.root);
  return a;
}
// Real WeaponRunner emission then the real pose update, as Actor.update does.
function run(w, a, hz, { seconds = 2, stepProjectiles = false, before = null, onStep = null } = {}) {
  const { f, fx } = w, { G, THREE } = f, ps = G.projectiles, ch = a.character, seen = new Set(ps.list), births = [];
  const raw = (hand, out) => hand === 1 ? ch.getMuzzleHand(out, 1) : ch.getMuzzle(out);
  for (let n = 0; n < seconds * hz; n++) {
    const fire = n >= hz / 2 && n < hz * 1.7; a.intent.fire = fire; a.ink = 100; G.time += 1 / hz;
    before?.(n, a);
    const pre = [raw(0, new THREE.Vector3()), raw(1, new THREE.Vector3())], fxBefore = fx.length;
    a.weaponRunner.update(1 / hz, { fire, firePressed: n === hz / 2 });
    const born = ps.list.filter(p => !seen.has(p)); born.forEach(p => seen.add(p));
    const fxDuring = fx.length - fxBefore;
    a._finishFrame(1 / hz); ch.root.updateMatrixWorld(true);
    const post = [raw(0, new THREE.Vector3()), raw(1, new THREE.Vector3())];
    const tick = births.length;
    for (const p of born) {
      const hand = pre[1].distanceTo(p.start) < 1e-9 ? 1 : pre[0].distanceTo(p.start) < 1e-9 ? 0 : null;
      births.push({ n, p, hand, start: p.start.toArray(), vel: p.vel.toArray(), damage: p.damage, seed: p.seed, fxDuring,
        fx: fx.slice(fxBefore).map(r => r.pos), pre: hand === null ? null : pre[hand].toArray(),
        post: hand === null ? null : post[hand].toArray(), offset: p._s3PoseBirthOffset ? { ...p._s3PoseBirthOffset } : null });
    }
    if (stepProjectiles) { ps.update(1 / hz); onStep?.(births.slice(tick)); }
  }
  return births;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// JSON drops the separate VM realm prototypes; values stay full precision.
const plain = births => JSON.parse(JSON.stringify(births.map(b => ({ n: b.n, start: b.start, vel: b.vel, damage: b.damage, seed: b.seed }))));

test('#1431 raw-socket Quad/Explosher births keep physics but draw FX at the same tick posed muzzle (30/60/120 Hz)', async () => {
  const w = await world(), control = await world({ control: true });
  for (const id of IDS) for (const hz of [30, 60, 120]) {
    w.fx.length = 0; control.fx.length = 0;
    const a = actor(w, id), b = actor(control, id);
    w.f.setRandom(() => .37); control.f.setRandom(() => .37);
    const got = run(w, a, hz), ref = run(control, b, hz);
    assert.ok(got.length >= 2, id + ' fires at ' + hz);
    // Physical birth, launch velocity, damage and RNG are unchanged by presentation.
    assert.equal(got.length, ref.length, id + ' birth count at ' + hz);
    plain(got).forEach((g, i) => assert.deepEqual(g, plain(ref)[i], id + ' physical birth ' + i + ' at ' + hz));
    assert.equal(a.ink, b.ink, id + ' ink at ' + hz);
    let connected = 0;
    for (const g of got) {
      if (g.hand === null) continue; // predicted aim / fallback births are not raw sockets
      // Old order: the FX was issued during runner.update at the physical birth.
      assert.equal(g.fxDuring, 0, 'raw-socket FX request waits for the pose');
      assert.equal(g.fx.length, 1);
      const expected = g.start.map((v, i) => v + g.post[i] - g.pre[i]);
      assert.ok(dist(g.fx[0], expected) < 1e-9, id + ' FX at posed muzzle');
      assert.ok(dist(g.fx[0], g.post) < 1e-9, id + ' raw birth: FX equals drawn socket');
      assert.ok(dist([g.offset.x, g.offset.y, g.offset.z], g.post.map((v, i) => v - g.pre[i])) < 1e-12, 'offset = post - emission socket');
      if (dist(g.post, g.pre) > 1e-6) connected++;
    }
    assert.ok(connected > 0, id + ' has a measurable same-tick pose move at ' + hz);
    for (const r of ref) if (r.hand !== null) assert.ok(dist(r.fx[0] ?? r.start, r.start) < 1e-12, 'control FX stays at physical birth');
    a.weaponRunner.reset(); b.weaponRunner.reset();
    for (const x of [a, b]) { x.character.root.parent?.remove(x.character.root); x.character.dispose(); }
    w.f.G.projectiles.clear(); control.f.G.projectiles.clear();
  }
});

test('#1431 Quad first left-hand birth is the raw carry socket; its gap is reported, not hidden', async () => {
  const w = await world();
  const a = actor(w, IDS[0]);
  const births = run(w, a, 60, { seconds: 1.2 });
  const first = births[0];
  assert.equal(first.hand, 1, 'first Quad round leaves from the left pistol');
  // Same-tick pose move of the left socket during the burst start (60 Hz).
  const gap = dist(first.post, first.pre);
  assert.ok(gap > .05 && gap < POSE_BIRTH_MAX_CONNECT, 'measured ' + gap);
  assert.ok(dist(first.fx[0], first.post) < 1e-9);
  assert.ok(dist(first.start, first.pre) < 1e-12, 'physical birth stays at the emission-time socket');
});

test('#1431 predicted right-hand and obstructed births are not connected', async () => {
  const w = await world();
  // Predicted aim: make the right pistol fire first from the carry pose.
  const a = actor(w, IDS[0]);
  a.weaponRunner.hand = 1;
  const births = run(w, a, 60, { seconds: 1.2 });
  const first = births[0];
  assert.equal(first.hand, null, 'aim-predicted birth is not a raw socket');
  assert.equal(first.offset, null);
  assert.equal(first.fxDuring, 1, 'its FX is issued immediately at the physical birth');
  assert.ok(dist(w.fx[0].pos, first.start) < 1e-12);
  a.weaponRunner.reset(); w.f.G.projectiles.clear(); a.character.dispose();
  // Obstruction fallback: every segment from the chest is blocked.
  w.fx.length = 0;
  const b = actor(w, IDS[0]), G = w.f.G, raycast = G.physics.raycast;
  G.physics.raycast = function (o, d, max, h) { h.hit = true; h.dist = Math.min(max, .01); h.point.copy(o); h.normal.set(0, 0, -1); return h; };
  try {
    const blocked = run(w, b, 60, { seconds: 1.2 });
    assert.ok(blocked.length > 0);
    for (const g of blocked) { assert.equal(g.hand, null); assert.equal(g.offset, null); assert.equal(g.fxDuring, 1); }
    assert.ok(w.fx.every((r, i) => dist(r.pos, blocked[i].start) < 1e-12), 'fallback FX stays at the physical fallback birth');
  } finally { G.physics.raycast = raycast; }
});

test('#1431 drawn history starts at the posed muzzle; later samples and pooled reuse stay physical', async () => {
  const w = await world();
  const a = actor(w, IDS[0]), ps = w.f.G.projectiles, sample = new Float64Array(6);
  let checked = 0;
  // Inspect each newborn right after its first real fixed projectile step.
  const births = run(w, a, 60, { seconds: 1.2, stepProjectiles: true, onStep(born) {
    for (const g of born) {
      const p = g.p, h = p._iwVisualHistory;
      if (g.hand === null || !g.offset) continue;
      assert.ok(h && h.count >= 2, 'history has birth and first step');
      assert.equal(h.oldestAge, 0);
      h.sample(0, sample);
      assert.ok(dist(Array.from(sample.subarray(0, 3)), g.post) < 1e-9, 'birth sample at the drawn socket');
      h.sample(h.latestAge, sample);
      assert.ok(dist(Array.from(sample.subarray(0, 3)), p.pos.toArray()) < 1e-9, 'latest sample is the physical round');
      assert.ok(dist(p.start.toArray(), g.start) < 1e-12, 'physical start unchanged');
      assert.equal(poseBirthOffset(p, h.latestAge), null, 'only the age-zero sample is connected');
      checked++;
    }
  } });
  assert.ok(checked > 0);
  // A pooled reuse must not inherit an older birth offset.
  const used = births.find(g => g.offset)?.p;
  assert.ok(used);
  ps.clear();
  const fresh = ps._new();
  assert.equal(fresh._s3PoseBirthOffset ?? null, null);
  assert.equal(poseBirthOffset({ ...used, seed: used.seed + 1 }, 0), null, 'seed-mismatched offset is ignored');
});

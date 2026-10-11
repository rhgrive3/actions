// Issue #750 — the Splat Roller flick head is a *visual* size, and Splatoon 3
// 11.3.0 declares it per swing unit in UnitParam.DrawSizeParam:
//
//   WideSwingUnitGroupParam     unit 0 (BulletNum 12) Init 0.30 / End 0.30
//                                unit 1 (BulletNum  1) Init 0.30 / End 0.30
//   VerticalSwingUnitGroupParam unit 0/1/2          Init 0.36 / End 0.36
//
// so every horizontal glob draws at the same radius regardless of fan position,
// every vertical glob draws at the same radius, and vertical is 0.36/0.30 = 1.2x
// horizontal before any independent shape/effect scaling. The generic emitter
// instead used `0.1 + 0.085 * mid + Math.random() * 0.03`, which made centre
// globs visibly larger than edge globs and randomised every glob.
//
// These tests drive the ACTUAL adapted `src/game/weapons.js` through the real
// `Projectiles.fireFlick` + `configureFidelityFlick` pair, and evaluate the
// shipped `_draw` head expression taken from that same adapted source, so the
// asserted scale is the installed renderer's, not a restatement of it.
//
// Gameplay retains baseline spawn positions, launch speeds, seeds, collision
// radii, satellite counts, `size` and exact Math.random() draw count. Only
// #771's documented horizontal yaw deviation may change projectile velocity. Only the rendered head radius is allowed to change.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { fixture as composedFixture } from '../../../scripts/weapons-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const read = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');

// Pinned DrawSizeParam for the pinned Splat Roller Ver. 11.3.0 table.
const S3_HORIZONTAL_RADIUS = 0.30;
const S3_VERTICAL_RADIUS = 0.36;
const S3_VERTICAL_RATIO = 1.2;

// Deterministic stream, so every assertion below is a function of the source
// tree rather than of Math.random().
function stream() {
  let n = 0;
  const fn = () => { const v = (n / 97) % 1; n++; return v; };
  fn.count = () => n;
  return fn;
}

async function flick(vertical) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  const rng = stream();
  f.setRandom(rng);
  a.weaponRunner.s3FlickVertical = vertical;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  p.fireFlick(a, a.weapon);
  return { f, p, a, draws: rng.count(), raw: f.profile.weaponsFidelityCompletion.weapons.roller };
}

// Pre-fix fingerprints captured on the unmodified baseline. Only `vis` is
// allowed to differ afterwards.
const FINGERPRINT = {
  horizontal: {
    count: 13, draws: 124,
    pos: [[-0.885567, 1.218557, 0.516495], [-0.719494, 1.239175, 0.537113], [-0.553421, 1.259794, 0.557732]],
    vel: [[-13.619048, 0, 41.91512], [-12.336141, 0, 46.931549], [-10.5212, 0, 51.924168]],
    seed: [0.030928, 0.134021, 0.237113],
    radius: [0.856186, 0.887113, 0.918041],
    sats: [1, 1, 1], size: 0.12,
  },
  vertical: {
    count: 5, draws: 30,
    pos: [[0, 1.8, 0.6], [0, 1.3, 0.6], [0, 1.3, 0.6]],
    vel: [[0, 14.361536, 109.086695], [0, 8.543703, 97.654974], [0, 3.752489, 85.94612]],
    seed: [0.030928, 0.092784, 0.154639],
    radius: [0.856186, 0.874742, 0.893299],
    sats: [1, 2, 2], size: 0.116,
  },
};
// The fixture runs its modules in a separate realm, so its arrays carry a
// foreign Array.prototype and would fail deepStrictEqual. Round into this
// realm's arrays so the comparison is value-based.
const round = v => Number(v.toFixed(6));
const roundArray = a => Array.from(a, round);

test('#750: horizontal globs all draw at the pinned 0.30 DrawSizeParam, not a centre-biased random radius', async () => {
  const { p, raw } = await flick(false);
  assert.equal(p.list.length, FINGERPRINT.horizontal.count, '13-glob horizontal volley');
  const main = p.list.filter(q => q.s3FlickUnit === 0), near = p.list.filter(q => q.s3FlickUnit === 1);
  assert.equal(main.length, 12, 'BulletNum 12 main unit');
  assert.equal(near.length, 1, 'nearest 1-glob unit');
  for (const q of p.list) {
    assert.equal(q.vis, S3_HORIZONTAL_RADIUS, `horizontal glob draws at ${S3_HORIZONTAL_RADIUS}`);
  }
  // The three positions the acceptance calls out: edge, centre, nearest.
  const edge = main[0], centre = main[6], nearest = near[0];
  assert.ok(edge && centre && nearest, 'edge, centre and nearest units exist');
  assert.equal(edge.vis, centre.vis, 'edge and centre draw identically');
  assert.equal(nearest.vis, centre.vis, 'nearest 1-glob unit draws identically');
  assert.notEqual(edge.fidelityMode, 'vertical', 'horizontal sweep');
  // The pinned table itself is what we assert against.
  const wide = raw.WideSwingUnitGroupParam.Unit;
  for (const u of wide) {
    assert.equal(u.UnitParam.DrawSizeParam.InitRadius, S3_HORIZONTAL_RADIUS, 'pinned InitRadius');
    assert.equal(u.UnitParam.DrawSizeParam.EndRadius, S3_HORIZONTAL_RADIUS, 'pinned EndRadius');
  }
});

test('#750: all five vertical globs draw at the pinned 0.36 DrawSizeParam', async () => {
  const { p, raw } = await flick(true);
  assert.equal(p.list.length, FINGERPRINT.vertical.count, '5-glob vertical volley');
  for (const q of p.list) {
    assert.equal(q.vis, S3_VERTICAL_RADIUS, `vertical glob draws at ${S3_VERTICAL_RADIUS}`);
  }
  const vertical = raw.VerticalSwingUnitGroupParam.Unit;
  for (const u of vertical) {
    assert.equal(u.UnitParam.DrawSizeParam.InitRadius, S3_VERTICAL_RADIUS, 'pinned InitRadius');
    assert.equal(u.UnitParam.DrawSizeParam.EndRadius, S3_VERTICAL_RADIUS, 'pinned EndRadius');
  }
});

test('#750: vertical draw radius is exactly 1.2x horizontal before any shape or effect scaling', async () => {
  const h = await flick(false), v = await flick(true);
  const hr = h.p.list[0].vis, vr = v.p.list[0].vis;
  assert.ok(Math.abs(vr / hr - S3_VERTICAL_RATIO) < 1e-12, `ratio ${vr / hr} === 1.2`);
  assert.ok(Math.abs(hr - 0.30) < 1e-12 && Math.abs(vr - 0.36) < 1e-12, 'absolute pinned radii');
});

test('#750: the draw radius no longer moves with the RNG stream', async () => {
  // The old formula mixed `mid` and a fresh Math.random() draw into the radius,
  // so two different streams produced two different head sizes. S3 declares one
  // radius per unit, so the radius must be identical across streams.
  for (const vertical of [false, true]) {
    const expected = vertical ? S3_VERTICAL_RADIUS : S3_HORIZONTAL_RADIUS;
    for (const constant of [0, 0.5, 1 - 1e-12]) {
      const f = await fixture(), { G, THREE } = f;
      G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
      G.actors = []; G.boss = null; G.netm = null;
      G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
      G.physics = new f.Physics(G.level);
      const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
      f.setRandom(() => constant);
      a.weaponRunner.s3FlickVertical = vertical;
      a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
      p.fireFlick(a, a.weapon);
      for (const q of p.list) {
        assert.equal(q.vis, expected, `rng=${constant} vertical=${vertical}`);
      }
    }
  }
});

test('#750: the shipped _draw head scale resolves to the sourced radius', async () => {
  // Evaluate the installed renderer's own head expression so this cannot drift
  // from what actually paints the blob.
  const source = adaptSource('src/game/weapons.js', read('src/game/weapons.js'));
  const from = source.indexOf('const g = Math.min(1, p.age * 20);');
  assert.notEqual(from, -1, 'installed _draw head anchor');
  const until = source.indexOf('_s.setScalar(vis);', from);
  assert.ok(until > from, 'installed _draw head end anchor');
  const head = source.slice(from, until);
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const scale = vm.runInContext(
    `(() => { const _s = { v: 0, setScalar(v) { this.v = v; } };` +
    `return (p, sp) => { ${head}\n_s.setScalar(vis); return _s.v; }; })()`,
    vm.createContext({ smoothstep, Math, sin: Math.sin, min: Math.min, max: Math.max, PI: Math.PI }),
  );
  const h = await flick(false), v = await flick(true);
  for (const [q, expected] of [[h.p.list[0], S3_HORIZONTAL_RADIUS], [h.p.list[6], S3_HORIZONTAL_RADIUS], [v.p.list[0], S3_VERTICAL_RADIUS]]) {
    const p = { vis: q.vis, size: q.size, age: 1, life: q.life, type: q.type, tail0: q.tail0, tailK: q.tailK, wob: q.wob, wobF: q.wobF, seed: q.seed };
    const drawn = scale(p, q.vel.length());
    // At age >= 3/60 the spawn-pop factor is exactly 1, so the rendered head
    // scale is the sourced radius with nothing else multiplied in.
    assert.ok(Math.abs(drawn - expected) < 1e-12, `rendered head ${drawn} === ${expected}`);
  }
  // The short spawn pop still applies, so this is not a flat overwrite.
  const popping = scale({ vis: S3_HORIZONTAL_RADIUS, size: 0.12, age: 0, life: 1.4, type: 'drop', tail0: 0.4, tailK: 1, wob: 0.1, wobF: 19, seed: 0.5 }, 40);
  assert.ok(popping < S3_HORIZONTAL_RADIUS, 'birth pop still scales the head up from zero');
});

test('#750: CollisionParam gameplay radii, spawn, speed, RNG order and draw count are untouched', async () => {
  for (const [vertical, key] of [[false, 'horizontal'], [true, 'vertical']]) {
    const fp = FINGERPRINT[key];
    const { p } = await flick(vertical);
    const { draws, a } = await flick(vertical);
    assert.equal(draws, fp.draws, `${key}: Math.random() draw count is unchanged`);
    assert.equal(p.list.length, fp.count, `${key}: glob count`);
    assert.deepEqual(Array.from(p.list.slice(0, 3), q => roundArray(q.pos.toArray())), fp.pos, `${key}: spawn positions`);
    const actualVel = Array.from(p.list.slice(0, 3), q => roundArray(q.vel.toArray()));
    if (vertical) {
      assert.deepEqual(actualVel, fp.vel, `${key}: original vertical launch velocities`);
    } else {
      // #771 intentionally changes horizontal yaw using the already-drawn
      // SpawnSpeedRandom. Preserve speed, elevation and RNG consumption.
      for (let i = 0; i < actualVel.length; i++) {
        const got = actualVel[i], before = fp.vel[i];
        assert.ok(Math.abs(got[1] - before[1]) <= 1e-6, `glob ${i}: elevation unchanged`);
        const speed = v => Math.hypot(v[0], v[2]);
        assert.ok(Math.abs(speed(got) - speed(before)) <= 3e-6, `glob ${i}: launch speed unchanged`);
        const angle = Math.atan2(got[0], got[2]) - Math.atan2(before[0], before[2]);
        assert.ok(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= 0.02,
          `glob ${i}: source-speed yaw deviation remains bounded`);
      }
    }
    assert.deepEqual(Array.from(p.list.slice(0, 3), q => round(q.seed)), fp.seed, `${key}: seeds`);
    assert.deepEqual(Array.from(p.list.slice(0, 3), q => round(q.radius)), fp.radius, `${key}: generic hit radius`);
    assert.deepEqual(Array.from(p.list.slice(0, 3), q => q.sats), fp.sats, `${key}: satellite count`);
    // p.size still carries CollisionParam.InitRadiusForPlayer, never DrawSizeParam.
    for (const q of p.list) assert.equal(round(q.size), fp.size, `${key}: collision size stays CollisionParam-derived`);
    const unit = p.list[0].fidelityRollerUnit;
    assert.ok(unit?.UnitParam?.CollisionParam, `${key}: pinned CollisionParam still selected`);
    assert.notEqual(round(p.list[0].fidelityPlayerCollision.initRadius), S3_HORIZONTAL_RADIUS,
      `${key}: player collision radius is not the draw radius`);
    assert.notEqual(round(p.list[0].fidelityFieldCollision.initRadius), S3_HORIZONTAL_RADIUS,
      `${key}: field collision radius is not the draw radius`);
    assert.ok(a.weapon, 'actor weapon retained');
  }
});

test('#750: a recycled projectile never leaks a previous swing draw radius', async () => {
  const { p, a } = await flick(false);
  assert.equal(p.list.every(q => q.vis === S3_HORIZONTAL_RADIUS), true, 'first swing sourced');
  const spent = p.list.splice(0, p.list.length);
  for (const q of spent) p.pool.push(q);
  p.fireFlick(a, a.weapon);
  assert.equal(p.list.length, FINGERPRINT.horizontal.count, 'recycled pool still yields a full volley');
  assert.equal(p.list.every(q => q.vis === S3_HORIZONTAL_RADIUS), true, 'recycled projectile re-sourced');
});

test('#750: the sourced draw radius survives the owner-to-remote projectile packet', async () => {
  for (const [vertical, expected] of [[false, S3_HORIZONTAL_RADIUS], [true, S3_VERTICAL_RADIUS]]) {
    // Full production adapter order is required for the current36-field
    // recorder, immutable Roller unit validation and owner tick/sequence footer.
    const f = await composedFixture({site:process.env.INKWAVE_ROLL_DRAW_SITE || ROOT + '.roller-draw-source',fidelity:true,network:true}), { G, THREE } = f;
    G.actors = []; G.boss = null;
    const p = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
    // The real recorder: recProj is the only place the drawn head reaches a peer.
    const nm = G.netm = new f.NetMatch({ myId: 7 }, {});
    a.nid = 7;
    f.context.Math.random = stream();
    a.weaponRunner.s3FlickVertical = vertical;
    a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
    p.fireFlick(a, a.weapon);
    assert.equal(p.list.every(q => q.vis === expected), true, `owner vertical=${vertical}`);
    const events = nm.out.filter(e => e[1] === 'p');
    assert.equal(events.length, p.list.length, `vertical=${vertical}: every glob is recorded`);
    for (const e of events) {
      assert.equal(e.length,36,'complete installed recorder envelope');
      assert.equal(e[20],expected,`vertical=${vertical}: packet carries the sourced radius`);
    }
    // Replay the recorded packets into a peer's projectile list.
    const peer = f.make('roller'); peer.remote = true; peer.nid = 99; peer.team = 1;
    p.list.length = 0;
    for (const e of events) p.ghostProjectile(peer, e);
    assert.equal(p.list.length, events.length, `vertical=${vertical}: ghost count`);
    for (const q of p.list) {
      assert.equal(q.vis, expected, `vertical=${vertical}: remote head uses the sourced radius, not a peer-side guess`);
      assert.equal(q.ghost, true, 'ghost projectiles stay non-authoritative');
    }
  }
});

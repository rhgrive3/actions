import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { s3ShapeKind, bodyParams, crescentGeometry, S3_SHAPE, BODY_KIND } from '../runtime/s3-projectile-shapes.mjs';

const snapshot = p => JSON.stringify([p.wid, p.type, p.age, p.delay, p.damage, p.life, p.radius, p.size, p.grav, p.drag,
  p.pos.toArray(), p.vel.toArray(), p.seed, p.catalog?.travel ?? null, p.catalog?.bounces ?? null]);

async function api() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export {s3ShapeKind as vmShapeKind} from './patches/splatoon3/runtime/s3-projectile-shapes.mjs';" });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  return f;
}

// Fire through real Actor -> WeaponRunner -> Projectiles admission, holding
// for `hold` ticks (charge) and then waiting for the delayed release.
function fire(f, id, hold = 3) {
  const system = f.G.projectiles;
  system.clear(); f.G.actors.length = 0;
  const a = f.make(id); a.form = 'kid'; a.ink = 100; a.intent.fire = true;
  f.tick(a, hold); a.intent.fire = false;
  let n = 0;
  while (!system.list.some(p => p.delay <= 0) && n++ < 90) { system.update(1 / 60); f.tick(a); }
  assert(system.list.length, id + ' emits');
  return a;
}

const CASES = [
  ['shooter', 'shot', 3], ['s3-shooter-first', 'shot', 3], ['s3-shooter-heavy', 'shot', 3],
  ['s3-shelter-normal', 'pellet', 3], ['s3-stringer-normal', 'arrow', 80], ['s3-stringer-short', 'arrow', 80],
  ['s3-saber-normal', 'slash-h', 2], ['s3-saber-normal', 'slash-v', 40],
  ['s3-slosher-launcher', 'machine', 3], ['s3-slosher-washtub', 'explosher', 3], ['s3-slosher-bathtub', 'bubble', 3],
  // alternate kits share their base weapon's rounds
  ['shooter-01', 'shot', 3], ['s3-shelter-wide-01', 'pellet', 3], ['s3-stringer-explosion-01', 'arrow', 80],
  ['s3-saber-lite-01', 'slash-h', 2], ['s3-slosher-bathtub-01', 'bubble', 3],
];

test('real births of the seven owned families draw S3 silhouettes, skip the generic teardrop and stay read-only', async () => {
  const f = await api(), system = f.G.projectiles;
  for (const [id, kind, hold] of CASES) {
    fire(f, id, hold);
    system._s3Shapes?.sheets.clear();
    for (const p of system.list) p.s3SpiralSeed = undefined;
    for (let i = 0; i < 2; i++) system.update(1 / 60);
    const live = system.list.filter(p => p.delay <= 0);
    assert(live.length, id + ' live round');
    assert(live.every(p => f.vmShapeKind(p) === kind && s3ShapeKind(p) === kind), `${id} classifies as ${kind}: ${live.map(f.vmShapeKind)}`);
    const before = system.list.map(snapshot);
    system._draw();
    assert.deepEqual(system.list.map(snapshot), before, id + ' drawing never changes gameplay state');
    // Falling drops may use the blob mesh; the round itself must not.
    const m = new f.THREE.Matrix4(), at = new f.THREE.Vector3();
    const ownBlobs = kind === 'explosher';
    if (!ownBlobs) for (let i = 0; i < system.blobs.count; i++) {
      system.blobs.getMatrixAt(i, m); at.setFromMatrixPosition(m);
      if ((system._s3SplashDrops || []).some(d => at.distanceTo(d.pos) < 1e-6)) continue; // a real falling splash
      assert(live.every(p => at.distanceTo(p.pos) > 1e-6), id + ' generic teardrop skipped');
    }
    const c = system.s3ShapeCounts;
    if (kind === 'shot' || kind === 'pellet' || kind === 'arrow') assert.equal(c.body, live.length, id + ' body per round');
    // leading slab plus the thinner layer peeling off behind it
    if (kind === 'slash-h') assert.equal(c.slashH, 2 * live.length);
    if (kind === 'slash-v') assert.equal(c.slashV, 2 * live.length);
    // one firing-ink burst per shot or volley, drawn as torn sheets
    const firing = ['shot', 'pellet', 'arrow', 'slash-h', 'slash-v'].includes(kind);
    assert.equal(system._s3Shapes.sheets.bursts.length, firing ? 1 : 0, id + ' firing ink burst');
    if (firing) assert(c.sheets > 0, id + ' firing ink sheets drawn');
    if (kind === 'bubble') { assert(c.shell >= live.length, 'clear shell per bubble'); assert.equal(c.core, live.length, 'round ink core per bubble'); }
    if (kind === 'machine') {
      // SWEPs spiral splash: one group of three ribbons as the round leaves
      // SWEPs RenderSloshingMachine: an ink box and a beam per visible round, no glob
      assert.equal(c.machine, live.filter(p => p.vis > 0).length, 'box and beam per visible round');
      // its falling drops are SWEPs RenderGeneral beams, not blob beads
      for (let i = 0; i < 20; i++) system.update(1 / 60);
      system._draw();
      const drops = (system._s3SplashDrops || []).filter(d => d.sourceActor === 'WeaponSlosherLauncher');
      assert(drops.length > 0, 'machine drops fall');
      const m = new f.THREE.Matrix4(), at = new f.THREE.Vector3();
      for (let i = 0; i < system.blobs.count; i++) {
        system.blobs.getMatrixAt(i, m); at.setFromMatrixPosition(m);
        assert(drops.every(d => at.distanceTo(d.pos) > 1e-6), 'no blob bead on a machine drop');
      }
      assert.equal(system.s3ShapeCounts.beams, system.s3ShapeCounts.machine + drops.length, 'beam per round and per drop');
      assert.equal(c.spirals, 3, 'one spiral group at the start of flight');
      assert(system._s3Shapes.sheets.spirals.every(s => s.color.equals(live[0].owner.color)), 'spirals take the ink colour');
    } else assert.equal(c.spirals, 0, id + ' no spiral splash');
    if (kind === 'explosher') { assert(system.blobs.count >= live.length, 'glob (+ falling splashes)'); assert(c.sparkles > 0, 'glitter'); }
  }
});

test('unowned families keep their existing renderer and pooled reuse never inherits a shape', async () => {
  const f = await api(), system = f.G.projectiles;
  for (const id of ['dualies', 'splatling', 'slosher', 's3-slosher-diffusion', 'roller', 'blaster']) {
    fire(f, id, id === 'splatling' ? 70 : 3);
    for (let i = 0; i < 2; i++) system.update(1 / 60);
    system._draw();
    assert(system.list.filter(p => p.delay <= 0).every(p => !p.s3Shape), id + ' not claimed');
    assert.equal(system.s3ShapeCounts.body + system.s3ShapeCounts.slashH + system.s3ShapeCounts.slashV + system.s3ShapeCounts.shell + system.s3ShapeCounts.core, 0);
  }
  fire(f, 's3-slosher-bathtub'); system._draw(); assert(system.s3ShapeCounts.shell > 0);
  system.clear(); assert.equal(system._s3Shapes.shell.count, 0, 'clear empties dedicated meshes');
  fire(f, 'dualies'); system.update(1 / 60); system._draw();
  assert(system.list.every(p => p.s3Shape === null), 'pooled object re-classified');
});

test('Shooter rod: blunt head, sourced tail length, torn tail only while joined to the muzzle', () => {
  const V = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } });
  const p = { type: 'shot', wid: 'shooter', vis: 0.1, age: 2 / 60, seed: .4, start: V(0, 0, 0), pos: V(0, 0, 4.4) };
  const young = bodyParams(p, 'shot', 132);
  assert.equal(young.kind, BODY_KIND.shot);
  assert(young.rag > 0.7, 'freshly fired round tears at the back');
  // 2-frame tail at 132 u/s = 4.4 units, measured from the head
  assert(Math.abs(young.L * young.R + young.R - 4.4) < 1e-9);
  p.age = 8 / 60;
  assert.equal(bodyParams(p, 'shot', 60).rag, 0, 'released rod is smooth');
  p.pos = V(0, 0, 0.5);
  const near = bodyParams(p, 'shot', 132);
  assert(near.L * near.R <= 0.5, 'never drawn behind its launch point');
});

test('Splatana crescents use the sourced collider span and lead with the convex edge', async () => {
  const f = await api(), g = crescentGeometry(f.THREE, S3_SHAPE.slashH);
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert(Math.abs(b.max.x - S3_SHAPE.slashH.halfSpan) < 1e-6 && Math.abs(b.min.x + S3_SHAPE.slashH.halfSpan) < 1e-6);
  assert(b.max.y - b.min.y < 0.25, 'thin slab');
  const pos = g.attributes.position, tipZ = [], midZ = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(Math.abs(pos.getX(i)) - S3_SHAPE.slashH.halfSpan) < 1e-6) tipZ.push(pos.getZ(i));
    if (Math.abs(pos.getX(i)) < 0.05) midZ.push(pos.getZ(i));
  }
  assert(Math.max(...midZ) > Math.max(...tipZ) + 0.15, 'middle leads, tips trail');
});

test('charged Splatana slash is born at ShotBulletOffset_Vertical and clears a flat floor', async () => {
  const f = await api(), system = f.G.projectiles;
  // Flat floor at y = 0: any lobe segment reaching below 0.2 strikes it.
  f.G.physics.segment = (a, b, h) => {
    h.hit = Math.min(a.y, b.y) < 0.2; h.dist = 0; h.point = a.clone(); h.normal = new f.THREE.Vector3(0, 1, 0); h.face = -1;
    return h;
  };
  system.clear(); f.G.actors.length = 0;
  const a = f.make('s3-saber-normal'); a.form = 'kid'; a.ink = 100; a.pos.set(0, 0, 0); a.intent.fire = true;
  f.tick(a, 40); a.intent.fire = false;
  let n = 0;
  while (!system.list.length && n++ < 60) { f.tick(a); system.update(1 / 60); }
  assert.equal(system.list.length, 1, 'vertical slash emitted');
  const p = system.list[0];
  assert.equal(p.catalog.descriptor.key, 'saber-vertical');
  assert(Math.abs(p.start.y - 2.2) < 1e-6, 'sourced 2.2 birth height above the feet: ' + p.start.y);
  for (let i = 0; i < 4; i++) system.update(1 / 60);
  assert(system.list.includes(p), 'slash survives its first ticks instead of dying in the floor');
});

test('SWEPs muzzle splash cones and shipped SWEPs assets', async () => {
  const { splashCone, FIRE_INK, SPIRAL_SPLASH } = await import('../runtime/s3-ink-sheets.mjs');
  const { MUZZLE_SPLASH, INK_RING, SLOSHING_SPIRAL } = await import('../runtime/s3-sweps-assets.mjs');
  const cfg = FIRE_INK.shot, close = (a, b) => Math.abs(a - b) < 1e-9;
  // MuzzleSplash.lua: t = Lerp(f, 3, rad*scale), r = Lerp(4f(1-f), rad/5, rad); 2nd cone at 2f, t = Lerp(1.4f)
  assert(close(cfg.length / cfg.radius, 2) && close(cfg.radius / cfg.minLength, 25 / 3), 'shooter a, s, r = 7, 2, 25');
  assert.equal(cfg.life, 7);
  // SWEPs' own scale: ss.ToHammerUnits HU per DU, 10 DU per INKWAVE metre
  assert(Math.abs(cfg.radius - 25 * 0.1 / (0.1 * 3.28084 * 16 * (1.00965 / 1.5))) < 1e-9, 'radius 25 HU');
  let c = splashCone(cfg, 0, 0); assert(close(c.length, cfg.minLength) && close(c.radius, cfg.radius / 5));
  c = splashCone(cfg, 0.5, 0); assert(close(c.radius, cfg.radius));
  c = splashCone(cfg, 1, 0); assert(close(c.length, cfg.length) && close(c.radius, cfg.radius / 5));
  c = splashCone(cfg, 0.25, 1); assert(close(c.radius, cfg.radius), 'second cone peaks at a quarter life');
  c = splashCone(cfg, 0.8, 1); assert(close(c.radius, cfg.radius / 5), 'GMod Lerp clamps');
  assert(close(c.length, cfg.length), '1.4f clamps to the full length');
  assert.deepEqual([SPIRAL_SPLASH.spanFrames, SPIRAL_SPLASH.sameTime, SPIRAL_SPLASH.roundSplit, SPIRAL_SPLASH.lifeFrames, SPIRAL_SPLASH.roll],
    [5, 3, 4, 11, 120], 'weapon_sloshingmachine.lua mSpiralSplash*');
  const b64 = s => Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
  assert.equal(b64(MUZZLE_SPLASH.alpha), 128 * 128); assert.equal(b64(INK_RING.alpha), 128 * 256);
  assert.equal(SLOSHING_SPIRAL.position.length, 78 * 3); assert.equal(SLOSHING_SPIRAL.index.length, 120 * 3);
  assert(SLOSHING_SPIRAL.index.every(i => i >= 0 && i < 78));
});

test('the Sloshing Machine leaves a SWEPs spiral group every 5 frames, at any draw rate', async () => {
  const f = await api(), system = f.G.projectiles;
  for (const hz of [60, 144, 30]) {
    fire(f, 's3-slosher-launcher');
    const p = system.list.find(q => q.delay <= 0 && q.vis > 0);
    assert(p, 'visible machine round');
    const sheets = () => system._s3Shapes.sheets;
    system._draw(); sheets().clear(); p.s3SpiralSeed = undefined;
    const t0 = f.G.time = 100, born = p.age, spawned = [];
    const add = sheets().addSpiral;
    sheets().addSpiral = function (...a) { spawned.push(a[3]); return add.apply(this, a); };
    for (let i = 0; i <= Math.round(hz * 20 / 60); i++) {
      p.age = born + i / hz; f.G.time = t0 + i / hz; system._draw();
    }
    sheets().addSpiral = add;
    const groups = Math.floor((p.age + 1e-9) / (5 / 60)) - Math.floor(born / (5 / 60)) + 1;
    assert.equal(spawned.length, groups * 3, hz + ' Hz: three ribbons per group');
    // 120 deg apart, the group itself stepping 90 deg
    assert.deepEqual(spawned.slice(0, 3).map(d => d % 360), [0, 120, 240].map(d => (d + spawned[0]) % 360));
    if (groups > 1) assert.equal((spawned[3] - spawned[0] + 360) % 360, 90);
    assert(system.s3ShapeCounts.spirals > 0 && system.s3ShapeCounts.spirals <= 9, 'at most three live groups');
  }
});

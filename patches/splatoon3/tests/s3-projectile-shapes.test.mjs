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
    for (let i = 0; i < 2; i++) system.update(1 / 60);
    const live = system.list.filter(p => p.delay <= 0);
    assert(live.length, id + ' live round');
    assert(live.every(p => f.vmShapeKind(p) === kind && s3ShapeKind(p) === kind), `${id} classifies as ${kind}: ${live.map(f.vmShapeKind)}`);
    const before = system.list.map(snapshot);
    system._draw();
    assert.deepEqual(system.list.map(snapshot), before, id + ' drawing never changes gameplay state');
    // Falling drops may use the blob mesh; the round itself must not.
    const m = new f.THREE.Matrix4(), at = new f.THREE.Vector3();
    const ownBlobs = kind === 'machine' || kind === 'explosher';
    if (!ownBlobs) for (let i = 0; i < system.blobs.count; i++) {
      system.blobs.getMatrixAt(i, m); at.setFromMatrixPosition(m);
      if ((system._s3SplashDrops || []).some(d => at.distanceTo(d.pos) < 1e-6)) continue; // a real falling splash
      assert(live.every(p => at.distanceTo(p.pos) > 1e-6), id + ' generic teardrop skipped');
    }
    const c = system.s3ShapeCounts;
    if (kind === 'shot' || kind === 'pellet' || kind === 'arrow') assert.equal(c.body, live.length, id + ' body per round');
    if (kind === 'slash-h') assert.equal(c.slashH, live.length);
    if (kind === 'slash-v') assert.equal(c.slashV, live.length);
    if (kind === 'bubble') { assert(c.shell >= live.length, 'clear shell per bubble'); assert.equal(c.core, live.length, 'round ink core per bubble'); }
    if (kind === 'machine') assert(system.blobs.count > live.length, 'glob plus corkscrew beads');
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

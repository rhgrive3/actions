import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitMainShot } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const rows = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'blaster' && !r.legacy);
async function setup() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  return f;
}
function actorAt(f, id, pitch = 0) {
  const a = f.make(id);
  a.form = 'kid'; a.grounded = true; a.ink = 100; a.invuln = 0;
  a.pos.set(0, 5, 0); a.character.root.position.copy(a.pos);
  a.vel.set(0, 0, 0); a.aimYaw = a.yaw = 0; a.aimPitch = pitch;
  a.aimDir.set(0, Math.sin(pitch), Math.cos(pitch));
  a.aimPoint.copy(a.pos).addScaledVector(a.aimDir, 100); a.aimPoint.y += 1.05;
  return a;
}
function guide(f, a, camera = null, width = 1280, height = 720) {
  return f.G.projectiles.s3WeaponGuide(a, a.weapon, camera, width, height);
}
function close(actual, expected, reason) {
  assert.ok(actual && expected && actual.distanceTo(expected) < 1e-9,
    `${reason}: ${actual?.toArray()} vs ${expected?.toArray()}`);
}
function finishRound(f, p) {
  for (let i = 0; i < 40; i++) if (f.G.projectiles._step(p, 1 / 60)) return p.pos.clone();
  assert.fail('source Blaster round must finish within its burst lifetime');
}

test('six actual catalogue Blaster owners expose guides matching their zero-spread emitted motion', async () => {
  const f = await setup();
  assert.equal(rows.length, 6);
  for (const row of rows) for (const pitch of [0, .4, -.7]) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = actorAt(f, row.id, pitch);
    assert.equal(a.weapon.kind, 'catalog');
    assert.equal(a.weapon.catalogRecord.family, 'blaster');
    emitMainShot(f, a);
    const p = f.G.projectiles.list.find(p => p.owner === a && p.catalog);
    assert.ok(p, `${row.id} uses the real catalogue emitter`);
    assert.equal(a.weaponRunner.spread, 0, 'standing source sample has no random cone');
    const point = guide(f, a)?.clone();
    assert.ok(point, `${row.id} public s3WeaponGuide no longer rejects kind=catalog`);
    close(point, finishRound(f, p), `${row.id} pitch ${pitch}: same source motion and burst frame`);
  }
});

test('S-BLAST guide selects the exact normal/blaster-jump mode used by its emitter', async () => {
  const f = await setup(), ends = [];
  for (const grounded of [true, false]) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = actorAt(f, 's3-blaster-precision');
    a.grounded = grounded; // a ledge-like airborne state; no fabricated jump-accuracy clock
    emitMainShot(f, a);
    const p = f.G.projectiles.list.find(p => p.owner === a && p.catalog);
    assert.equal(p.catalog.descriptor.key, grounded ? 'normal' : 'blaster-jump');
    assert.equal(a.weaponRunner.spread, 0);
    const point = guide(f, a)?.clone();
    close(point, finishRound(f, p), 'S-BLAST selected source mode');
    ends.push(point);
  }
  assert.ok(ends[0].z > ends[1].z + 5, 'the actual air mode has shorter flight');
});

test('preview stops at the same sourced sphere contact on a solid wall and skips grates', async () => {
  const f = await setup(), V = f.THREE.Vector3;
  const block = { solid: true, grate: false, center: new V(0, 6, 3), half: new V(8, 8, .05),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)] };
  f.G.physics.level = { blocks: [block], faces: [], geometryGeneration: 1,
    queryBlocks(_a, _b, _c, _d, out) { out.length = 1; out[0] = 0; return out; } };
  const a = actorAt(f, 's3-blaster-lightlong');
  emitMainShot(f, a);
  const p = f.G.projectiles.list.find(p => p.owner === a && p.catalog);
  const blocked = guide(f, a).clone();
  assert.ok(Math.abs(blocked.z - 2.95) < 1e-9, 'surface contact uses actual wall geometry');
  close(blocked, finishRound(f, p), 'guide and actual contact resolve to the same surface');
  block.grate = true; f.G.physics.level.geometryGeneration++;
  const through = guide(f, a);
  assert.ok(through.z > 12, 'source skipGrates policy is shared');
});

test('guide never emits a round, paints, consumes RNG, or changes actor/runner gameplay state', async () => {
  const f = await setup(), a = actorAt(f, 's3-blaster-long');
  const system = f.G.projectiles;
  const before = { ink: a.ink, special: a.special, hand: a.weaponRunner.hand,
    cooldown: a.weaponRunner.cooldown, spread: a.weaponRunner.spread,
    catalogState: a.weaponRunner.catalogState, aimDir: a.aimDir.toArray(), aimPoint: a.aimPoint.toArray(),
    listLength: system.list.length, poolLength: system.pool?.length, poseBirths: a._s3PoseBirths };
  f.setRandom(() => { throw new Error('guide consumed random'); });
  const forbidden = () => { throw new Error('guide called gameplay mutation'); };
  system._new = system._push = system.applyHit = forbidden; f.G.paint.splat = forbidden;
  const result = guide(f, a);
  assert.ok(result && result.z > 5);
  assert.deepEqual({ ink: a.ink, special: a.special, hand: a.weaponRunner.hand,
    cooldown: a.weaponRunner.cooldown, spread: a.weaponRunner.spread,
    catalogState: a.weaponRunner.catalogState, aimDir: a.aimDir.toArray(), aimPoint: a.aimPoint.toArray(),
    listLength: system.list.length, poolLength: system.pool?.length, poseBirths: a._s3PoseBirths }, before);
  f.restoreRandom();
});

test('same-frame HUD/self reads reuse prediction while live motion, mode, source and world changes invalidate it', async () => {
  const f = await setup(), a = actorAt(f, 's3-blaster-precision');
  const V = f.THREE.Vector3, camera = new f.THREE.PerspectiveCamera(60, 16 / 9, .1, 100);
  camera.updateMatrixWorld(true);
  let queries = 0, muzzleLos = 0;
  f.G.physics.segment = (_a, _b, hit) => { queries++; hit.hit = false; return hit; };
  f.G.physics.los = () => { muzzleLos++; return true; };
  f.G.physics.level = { blocks: [], faces: [], geometryGeneration: 1 };
  const first = guide(f, a, camera), initialQueries = queries, initialLos = muzzleLos;
  assert.ok(initialQueries >= 11 && initialLos > 0);
  assert.equal(guide(f, a, camera), first);
  assert.equal(queries, initialQueries, 'second consumer performs no field queries');
  assert.equal(muzzleLos, initialLos, 'second consumer performs no muzzle LOS');
  function changes(label, mutate, width = 1280, height = 720) {
    const previous = queries;
    mutate();
    const point = guide(f, a, camera, width, height);
    assert.ok(queries > previous, label + ' invalidates cache');
    return point.clone();
  }
  const ground = first.clone();
  const air = changes('ground/air mode', () => { a.grounded = false; });
  assert.ok(ground.z > air.z + 5);
  changes('aim point', () => { a.aimPoint.x += 1; });
  changes('aim direction', () => { a.aimDir.copy(new V(.1, 0, 1).normalize()); });
  changes('actor velocity', () => { a.vel.z += 1; });
  changes('muzzle pose', () => { a.character.root.position.y += .01; });
  changes('collision revision', () => { f.G.physics.level.geometryGeneration++; });
  changes('simulation step', () => { f.G.time += 1 / 60; });
  changes('viewport', () => {}, 1920, 1080);
  changes('camera projection', () => { camera.fov = 65; camera.updateProjectionMatrix(); }, 1920, 1080);
  changes('live source move value', () => { a.weapon.catalogRecord.parameters.MoveJumpParam.SpawnSpeed += .1; }, 1920, 1080);
  changes('live collision radius', () => { a.weapon.catalogRecord.parameters.CollisionParam.InitRadiusForField += .01; }, 1920, 1080);
});

test('live custom weapon records and independent owners do not share or retain stale points', async () => {
  const f = await setup(), a = actorAt(f, 's3-blaster-light'), b = actorAt(f, 's3-blaster-lightlong');
  const original = guide(f, a).clone(), other = guide(f, b);
  assert.ok(other.z > original.z);
  a.weapon = { ...a.weapon, catalogRecord: structuredClone(a.weapon.catalogRecord) };
  a.weapon.catalogRecord.parameters.MoveParam.SpawnSpeed *= .8;
  const custom = guide(f, a);
  assert.ok(custom.z < original.z, 'actual custom record drives motion, not WEAPONS[id]');
  assert.notEqual(custom, other, 'other actor cannot overwrite the borrowed point');
  const correct = custom.clone(); custom.set(1000, 1000, 1000);
  close(guide(f, a), correct, 'externally changed scratch point is recomputed');
  a.weapon.catalogRecord.parameters.WeaponParam.ShotGuideFrame = 0;
  assert.equal(guide(f, a), null, 'invalid source frame cannot use the previous weapon cache');
});

test('legacy Hot keeps its existing guide and unsupported families do not enter catalogue prediction', async () => {
  const f = await setup(), hot = actorAt(f, 'blaster'), shooter = actorAt(f, 'shooter');
  assert.equal(hot.weapon.kind, 'blaster');
  assert.ok(guide(f, hot), 'legacy Hot path remains available');
  assert.equal(f.G.projectiles.s3CatalogBlasterGuide(hot, hot.weapon), null);
  assert.equal(f.G.projectiles.s3CatalogBlasterGuide(shooter, shooter.weapon), null);
});

test('paired sights keep the unobstructed endpoint while their impact stops on terrain, for all seven families', async () => {
  const f = await setup(), V = f.THREE.Vector3;
  for (const id of ['blaster', ...rows.map(r => r.id)]) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    delete f.G.physics.level;
    const a = actorAt(f, id);
    const clear = f.G.projectiles.s3BlasterReticleGuides(a, a.weapon, null, 1280, 720);
    assert.ok(clear, id + ' paired endpoint API');
    const nominal = clear.aim.clone();
    close(clear.impact, nominal, id + ' unobstructed pair coincides');
    const block = { solid: true, center: new V(0, 6, 3), half: new V(8, 8, .05),
      axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)] };
    f.G.physics.level = { blocks: [block], faces: [], geometryGeneration: 1,
      queryBlocks(_a, _b, _c, _d, out) { out.length = 1; out[0] = 0; return out; } };
    const pair = f.G.projectiles.s3BlasterReticleGuides(a, a.weapon, null, 1280, 720);
    close(pair.aim, nominal, id + ' aim is not shifted onto the wall');
    assert.ok(Math.abs(pair.impact.z - 2.95) < 1e-9, id + ' first source field contact');
    assert.ok(pair.aim.distanceTo(pair.impact) > 3, id + ' separate world endpoints');
    const legacy = guide(f, a);
    close(legacy, id === 'blaster' ? nominal : pair.impact,
      id + ' previous single-guide return contract is preserved');
  }
});

test('Hot paired guide caches the real collision inputs, shares exact reads, and does not consume RNG', async () => {
  const f = await setup(), a = actorAt(f, 'blaster'), system = f.G.projectiles;
  const camera = new f.THREE.PerspectiveCamera(60, 16 / 9, .1, 100);
  camera.updateMatrixWorld(true);
  let queries = 0, los = 0;
  f.G.physics.los = () => { los++; return true; };
  f.G.physics.segment = (_a, _b, hit) => { queries++; hit.hit = false; return hit; };
  f.G.physics.level = { blocks: [], faces: [], geometryGeneration: 1 };
  f.setRandom(() => { throw new Error('paired guide consumed random'); });
  const read = () => system.s3BlasterReticleGuides(a, a.weapon, camera, 1280, 720);
  const first = read(), q0 = queries, l0 = los;
  assert.ok(q0 > 0 && l0 > 0);
  close(read().aim, first.aim, 'same exact query');
  assert.equal(queries, q0); assert.equal(los, l0);
  // An old nominal-only consumer can reuse the same trajectory as well.
  guide(f, a, camera);
  assert.equal(queries, q0); assert.equal(los, l0);
  f.G.physics.segment = (from, to, hit) => {
    queries++; hit.hit = true; hit.dist = from.distanceTo(to) * .5;
    hit.point.copy(from).lerp(to, .5); hit.normal.set(0, 0, -1); return hit;
  };
  const changed = read();
  assert.ok(queries > q0, 'field query replacement invalidates cached pair');
  assert.ok(changed.aim.distanceTo(changed.impact) > 3);
  const q1 = queries;
  f.G.time += 1 / 60; read();
  assert.ok(queries > q1, 'next physics step rechecks contact');
  const q2 = queries;
  a.character.root.position.x += .001; read();
  assert.ok(queries > q2, 'pair cannot use the nominal-only nearby-pose approximation');
  f.restoreRandom();
});

test('paired catalogue output observes live mode and rejects mutated borrowed nominal points', async () => {
  const f = await setup(), a = actorAt(f, 's3-blaster-precision'), system = f.G.projectiles;
  const read = () => system.s3BlasterReticleGuides(a, a.weapon, null, 1280, 720);
  const grounded = read().aim.clone();
  a.grounded = false;
  const air = read(), correct = air.aim.clone();
  assert.ok(grounded.z > correct.z + 5);
  air.aim.set(1000, 1000, 1000);
  close(read().aim, correct, 'mutated nominal scratch cannot poison the next frame');
});

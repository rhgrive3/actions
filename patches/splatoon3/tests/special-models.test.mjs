import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { buildSubModel, poseSubModel, isSharedGeometry } from '../runtime/sub-models.mjs';
import { SPECIAL_MODEL_IDS, buildScreenSheet } from '../runtime/special-models.mjs';
import { SPECIAL_DEVICES, SPECIAL_PROJECTILE_MODELS } from '../runtime/special-presentation.mjs';
import { ALL_SPECIALS } from '../runtime/all-specials.mjs';

// Presentation-only checks for the special models read off the S3 references
// (patches/splatoon3/reference/special-models.md). Logic/geometry and
// in-runtime attachment checks; no Splatoon 3 hardware comparison is claimed.
const meshes = (obj) => { const out = []; obj.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
const sizeOf = (T, obj) => { obj.updateMatrixWorld(true); return new T.Box3().setFromObject(obj).getSize(new T.Vector3()); };

test('every special model builds from shared geometry with team-ink parts, within budget', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const T = f.THREE, ink = new T.MeshStandardMaterial({ color: 0x33cc66 });
  for (const id of SPECIAL_MODEL_IDS) {
    const m = buildSubModel(T, id, ink);
    assert.ok(m?.root, `${id} builds`);
    const list = meshes(m.root), tris = list.reduce((n, x) => n + x.geometry.index.count / 3, 0);
    assert.ok(tris > 100 && tris < 12000, `${id}: ${tris} triangles`);
    assert.ok(list.every(x => isSharedGeometry(x.geometry)), `${id}: shared geometry`);
    if (id !== 'spInkjetCannon') assert.ok(m.inkMeshes.length || [...m.materials.values()].some(x => x.userData.s3InkDerived), `${id}: has team-ink parts`);
  }
  const sheet = buildScreenSheet(T, 0xff3399, 15, 9);
  const s = sizeOf(T, sheet);
  assert.ok(Math.abs(s.x - 15.15) < 0.3 && Math.abs(s.y - 9.09) < 0.3, 'Splattercolor sheet spans the gameplay screen');
});

test('proportions follow the references: kid-scale devices, a two-kid-tall Kraken, a rideable shark and tank', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const T = f.THREE, ink = new T.MeshStandardMaterial();
  const size = (id) => sizeOf(T, buildSubModel(T, id, ink).root);
  assert.ok(size('spKraken').y > 2.4 && size('spKraken').y < 2.9, 'Kraken about twice the 1.32 m kid');
  const shark = size('spReefShark');
  assert.ok(shark.z > 1.5 && shark.z > shark.x, 'shark is long nose-to-tail');
  const tank = size('spCrabTank');
  assert.ok(tank.x > 1.6 && tank.y > 1, 'Crab Tank is wider than the kid with its claws');
  const wave = size('spWaveBreaker');
  assert.ok(wave.y > 0.9 && wave.y < 1.1, 'Wave Breaker about knee-to-waist high');
  const stamp = size('spUltraStamp');
  assert.ok(stamp.z > 1.4 && stamp.x > 0.85, 'stamp head and long handle');
  const decoy = size('spChumpDecoy');
  assert.ok(decoy.y > 1 && Math.abs(decoy.x - decoy.z) < 0.1, 'Chump balloon on a suction-cup base');
});

test('every all-specials action has a device or effect mapping and the projectiles take models', () => {
  for (const id of Object.keys(ALL_SPECIALS)) assert.ok(SPECIAL_DEVICES[id]?.length, `${id} mapped`);
  for (const [id, spec] of Object.entries(SPECIAL_PROJECTILE_MODELS)) {
    assert.ok(ALL_SPECIALS[id], `${id} is an all-specials action`);
    assert.ok(SPECIAL_MODEL_IDS.includes(spec.model), `${id} round model exists`);
  }
});

test('deployed objects and rounds are drawn with models in the real runtime; primitives are hidden', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const { G, THREE: T } = f;
  G.scene = new T.Scene();
  const p = G.projectiles;
  const owner = f.make('shooter'); owner.team = 0;
  const kinds = ['decoy', 'marker', 'wave', 'screen'];
  const objects = kinds.map((kind, i) => ({
    kind, owner, team: 0, pos: new T.Vector3(i * 3, 0, 0), age: 0.5, dead: false, target: new T.Vector3(i * 3, 0, 4),
    origin: new T.Vector3(i * 3, 1, 0), normal: new T.Vector3(0, 0, 1), width: 15, height: 9, index: i,
    waves: kind === 'wave' ? [{ started: 0, radius: 20 }] : [], maxWaveFrame: 3,
    mesh: new T.Mesh(new T.SphereGeometry(0.5), new T.MeshBasicMaterial()),
  }));
  p._s3AllSpecialObjects = [...objects];
  p.update(1 / 60);
  for (const o of objects) assert.equal(o.mesh.visible, false, `${o.kind}: runtime primitive hidden`);
  const drawn = G.scene.children.filter(c => c.userData?.s3SpecialObject);
  assert.equal(JSON.stringify(drawn.map(c => c.userData.s3SpecialObject).sort()), JSON.stringify([...kinds].sort()));
  const wave = drawn.find(c => c.userData.s3SpecialObject === 'wave');
  assert.ok(wave.children.length >= 2, 'device plus an expanding wave band');
  // Removing an object retires its model.
  p._s3AllSpecialObjects = objects.slice(1);
  p.update(1 / 60);
  assert.equal(G.scene.children.filter(c => c.userData?.s3SpecialObject === 'decoy').length, 0);
  // Rounds: a Tenta missile record gets a model aligned to its velocity.
  G.physics.segment = (a, b, o) => { o.hit = false; return o; };
  G.physics.raycast = (o, d, len, out) => { out.hit = false; return out; };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.camera = { position: new T.Vector3(0, 50, 0) };
  const round = p._new(); Object.assign(round, { wid: 'tentaMissiles', owner, team: 0, age: 0, life: 2, s3AllSpecialSeed: 7 });
  round.pos.set(0, 20, 0); round.prev.copy(round.pos); round.start?.copy?.(round.pos); round.vel.set(0, 3, 4);
  p.list.push(round);
  p.update(1 / 60);
  const model = G.scene.children.find(c => c.userData?.s3SpecialRound === 'tentaMissiles');
  if (p.list.includes(round)) {
    assert.ok(model, 'round model drawn while the record flies');
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(model.quaternion), v = round.vel.clone().normalize();
    assert.ok(fwd.dot(v) > 0.999, 'nose along the velocity');
  }
});

test('devices attach to the real Character while a special is active and retire after', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true });
  const actor = new f.Actor({ team: 0, name: 'sp', weapon: 'shooter', CharacterClass: f.Character });
  actor.character.actor = actor; f.G.actors.push(actor);
  const ch = actor.character, view = { form: 'kid', hp: 100, grounded: true };
  const count = () => { let n = 0; ch.root.traverse(o => { if (o.userData?.s3SubModel?.startsWith?.('sp')) n++; }); return n; };
  for (const [id, expect] of [['reefslider', 1], ['killerWail', 6], ['inkjet', 2]]) {
    actor.specialActive = { id, phase: 'active' };
    ch.update(1 / 60, view);
    assert.equal(count(), expect, `${id}: device models on the kid`);
    if (SPECIAL_DEVICES[id].some(d => d.hideWeapon)) assert.equal(ch.weapon.pivot.visible, false, `${id}: main weapon hidden while held`);
    actor.specialActive = null;
    ch.update(1 / 60, view);
    assert.equal(count(), 0, `${id}: retired`);
    assert.equal(ch.weapon.pivot.visible, true, `${id}: main weapon restored`);
  }
  actor.specialActive = { id: 'krakenRoyale', phase: 'active' };
  ch.update(1 / 60, view);
  assert.equal(ch.kid.visible, false, 'the kid becomes the Kraken');
  assert.equal(count(), 1);
  actor.specialActive = { id: 'zipcaster', phase: 'active' };
  ch.update(1 / 60, view);
  let coat = 0; ch.kid.traverse(o => { if (o.name === 'zipcaster-ink-coat') coat++; });
  assert.equal(coat, 1, 'Zipcaster ink coat over the kid');
  actor.specialActive = null; ch.update(1 / 60, view);
  coat = 0; ch.kid.traverse(o => { if (o.name === 'zipcaster-ink-coat') coat++; });
  assert.equal(coat, 0, 'coat removed after');
  const ball = buildSubModel(f.THREE, 'spBooyahBall', null);
  poseSubModel(ball, { dt: 0.1 });
  assert.ok(ball.groups.ribbons, 'Booyah ribbons are an animated group');
});

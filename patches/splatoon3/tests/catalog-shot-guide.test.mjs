// Catalogue Shooter / Splatling HUD guide (ShotGuideFrame). Logic only: the
// real catalogue emitter and motion owners in the production composition; no
// browser, no retail capture. The guide must be where the emitted nominal round
// is after ShotGuideFrame 60 Hz steps, or its first wall contact before that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitMainShot } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogGuideCharge, CATALOG_SHOT_GUIDE_FAMILIES } from '../runtime/catalog-blaster-guide.mjs';

const shooters = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'shooter' && !r.legacy);
const splatlings = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'splatling' && !r.legacy);
async function setup() {
  // A centred uniform draw: every angular kernel returns its median offset.
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, vmMathRandom: () => .5 });
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

test('every non-legacy catalogue Shooter / Splatling has a pinned ShotGuideFrame', () => {
  assert.equal(shooters.length, 13); assert.equal(splatlings.length, 5);
  for (const r of [...shooters, ...splatlings]) {
    assert.ok(CATALOG_SHOT_GUIDE_FAMILIES.has(r.family));
    assert.ok(Number.isInteger(r.parameters.WeaponParam.ShotGuideFrame) && r.parameters.WeaponParam.ShotGuideFrame > 0, r.id);
  }
});

test('catalogue Shooter guide is the emitted nominal round at ShotGuideFrame', async () => {
  const f = await setup();
  for (const row of shooters) for (const pitch of [0, .35, -.5]) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = actorAt(f, row.id, pitch);
    assert.equal(a.weapon.kind, 'catalog');
    const guide = f.G.projectiles.s3CatalogShotGuide(a, a.weapon)?.clone();
    assert.ok(guide, `${row.id}: guide exists`);
    emitMainShot(f, a);
    const p = f.G.projectiles.list.find(q => q.owner === a && q.catalog);
    assert.ok(p, `${row.id}: real catalogue round`);
    const frames = row.parameters.WeaponParam.ShotGuideFrame;
    let guard = 0;
    while (p.age * 60 < frames - 1e-6 && guard++ < 200) if (f.G.projectiles._step(p, 1 / 60)) break;
    // Same muzzle, launch speed, motion owner and frame count: height and
    // distance agree. The emitted round still carries the weapon's horizontal
    // cone draw (the guide is the no-spread line), so only a small lateral
    // offset is allowed.
    const msg = `${row.id} pitch ${pitch}: guide ${guide.toArray().map(v => v.toFixed(3))} vs round ${p.pos.toArray().map(v => v.toFixed(3))}`;
    assert.ok(Math.abs(guide.y - p.pos.y) < 2e-3 && Math.abs(guide.z - p.pos.z) < 2e-2, msg);
    assert.ok(Math.abs(guide.x - p.pos.x) < .2, msg);
  }
});

test('the guide stops at the first wall contact', async () => {
  const f = await setup(), V = f.THREE.Vector3;
  const block = { solid: true, grate: false, center: new V(0, 6, 2.2), half: new V(8, 8, .05),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)] };
  f.G.physics.level = { blocks: [block], faces: [], geometryGeneration: 1,
    queryBlocks(_a, _b, _c, _d, out) { out.length = 1; out[0] = 0; return out; } };
  const a = actorAt(f, 's3-shooter-long');
  const point = f.G.projectiles.s3CatalogShotGuide(a, a.weapon);
  assert.ok(point.z < 2.2 && point.z > 1.5, `guide stops on the wall, z=${point.z}`);
  f.G.physics.level = { blocks: [], faces: [], geometryGeneration: 2, queryBlocks(_a, _b, _c, _d, out) { out.length = 0; return out; } };
  const open = f.G.projectiles.s3CatalogShotGuide(a, a.weapon);
  assert.ok(open.z > 5, `no wall: full ShotGuideFrame flight, z=${open.z}`);
});

test('Splatling guide follows charge, and the released stage while streaming', async () => {
  const f = await setup();
  let risers = 0;
  for (const row of splatlings) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = actorAt(f, row.id);
    const r = a.weaponRunner, ends = [];
    for (const c of [0, .5, 1]) { r.charge = c; r.streaming = false; ends.push(f.G.projectiles.s3CatalogShotGuide(a, a.weapon).z); }
    // Source speed rises with charge unless the record gives one speed for all
    // stages (the guide then cannot move either).
    const m = row.parameters.MoveParam || {};
    const rises = Number.isFinite(m.SpawnSpeedFirstLastAndSecond) && m.SpawnSpeedFirstLastAndSecond > m.SpawnSpeed;
    if (rises) assert.ok(ends[0] < ends[1] && ends[1] <= ends[2] + 1e-9, `${row.id}: more charge, faster round, farther guide (${ends.map(v => v.toFixed(2))})`);
    else assert.ok(Math.abs(ends[0] - ends[2]) < 1e-9, `${row.id}: one source speed (${ends.map(v => v.toFixed(2))})`);
    risers += rises;
    f.tick(a);
    assert.ok(r.catalogState, 'real catalogue state');
    const saved = r.catalogState.streamCharge;
    r.charge = 0; r.streaming = true; r.catalogState.streamCharge = 1;
    assert.equal(catalogGuideCharge(r), 1);
    assert.ok(Math.abs(f.G.projectiles.s3CatalogShotGuide(a, a.weapon).z - ends[2]) < 1e-9, `${row.id}: stream keeps the released charge`);
    r.streaming = false; r.catalogState.streamCharge = saved;
  }
  assert.ok(risers >= 3, `charge-dependent speed in ${risers} of 5 records`);
  assert.equal(catalogGuideCharge(null), 0);
  assert.equal(catalogGuideCharge({ charge: 4 }), 1);
});

test('legacy weapons, Brellas and other families have no catalogue shot guide', async () => {
  const f = await setup();
  for (const id of ['shooter', 'splatling', 's3-shelter-normal', 's3-roller-compact', 's3-charger-quick', 's3-slosher-diffusion']) {
    const a = actorAt(f, id);
    assert.equal(f.G.projectiles.s3CatalogShotGuide(a, a.weapon), null, id);
  }
});

test('catalogue Dualies: one guide per hand, matching the emitted hand round', async () => {
  const f = await setup();
  const dualies = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'dualies' && !r.legacy);
  assert.equal(dualies.length, 5);
  for (const row of dualies) {
    f.G.projectiles.clear(); f.G.actors.length = 0;
    const a = actorAt(f, row.id);
    // The fixture has no hand rig (both sockets coincide): give the two hands
    // distinct sockets, used by both the emitter and the guide.
    const native = f.G.projectiles._muzzleHand;
    f.G.projectiles._muzzleHand = (actor, hand, out) => out.set(hand ? -.32 : .32, actor.pos.y + 1.05, actor.pos.z + .3);
    const pair = f.G.projectiles.s3DualiesGuides(a, a.weapon)?.map(v => v.clone());
    assert.ok(pair && pair.length === 2, `${row.id}: two guides`);
    assert.ok(pair[0].distanceTo(pair[1]) > .05, `${row.id}: the hands are apart`);
    const hand = a.weaponRunner.hand ^ 1;
    emitMainShot(f, a);
    const p = f.G.projectiles.list.find(q => q.owner === a && q.catalog);
    const frames = row.parameters.WeaponParam.ShotGuideFrame;
    let guard = 0;
    while (p.age * 60 < frames - 1e-6 && guard++ < 200) if (f.G.projectiles._step(p, 1 / 60)) break;
    const g = pair[hand], msg = `${row.id} hand ${hand}: guide ${g.toArray().map(v => v.toFixed(3))} vs round ${p.pos.toArray().map(v => v.toFixed(3))}`;
    assert.ok(Math.abs(g.y - p.pos.y) < 2e-3 && Math.abs(g.z - p.pos.z) < 2e-2 && Math.abs(g.x - p.pos.x) < .2, msg);
    assert.ok(g.distanceTo(p.pos) < pair[hand ^ 1].distanceTo(p.pos), `${row.id}: the round is on its own hand's guide`);
    f.G.projectiles._muzzleHand = native;
  }
});

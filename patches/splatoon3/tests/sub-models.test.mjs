import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';
import { SPRINKLER } from '../runtime/kit-sprinkler.mjs';
import {
  SUB_MODEL_IDS, SPLASH_WALL_FOLDED_SCALE, SPLASH_WALL_UNFOLD_SECONDS, buildSubModel, poseSubModel,
  buildHeldSubModel, isSharedGeometry, tintSubModel, HELD_SCALE,
} from '../runtime/sub-models.mjs';
import { buildThrownBombModel, NATIVE_SUB_MODEL_IDS, heldBombModelId } from '../runtime/bomb-models.mjs';

// Presentation-only checks for the sub models read off the S3 references
// (see patches/splatoon3/reference/sub-models.md). These are logic/geometry
// measurements; no Splatoon 3 hardware comparison is claimed.
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} != ${b}`);

async function three() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  return f;
}
const boxOf = (T, obj) => { obj.updateMatrixWorld(true); return new T.Box3().setFromObject(obj); };
const meshes = (obj) => { const out = []; obj.traverse(o => { if (o.isMesh) out.push(o); }); return out; };

test('every sub model builds from shared geometry within the triangle budget, with team-ink parts', async () => {
  const { THREE: T } = await three();
  const ink = new T.MeshStandardMaterial({ color: 0xff7a1a });
  assert.equal(SUB_MODEL_IDS.length, 11);
  for (const id of [...SUB_MODEL_IDS, 'toxicMistCloud']) {
    const m = buildSubModel(T, id, ink);
    assert.ok(m?.root?.isGroup, `${id} builds`);
    const list = meshes(m.root);
    const tris = list.reduce((n, x) => n + x.geometry.index.count / 3, 0);
    assert.ok(tris > 300 && tris < 8000, `${id}: ${tris} triangles`);
    assert.ok(list.every(x => isSharedGeometry(x.geometry)), `${id}: geometry shared across instances`);
    assert.ok(m.inkMeshes.every(x => x.material === ink), `${id}: the team ink material is used as given`);
    assert.ok(m.inkMeshes.length || [...m.materials.values()].some(x => x.userData.s3InkDerived), `${id}: has team-ink parts`);
    const again = buildSubModel(T, id, ink);
    assert.equal(meshes(again.root)[0].geometry, list[0].geometry, `${id}: second instance reuses the geometry`);
    assert.notEqual(meshes(again.root).find(x => x.material !== ink)?.material, list.find(x => x.material !== ink)?.material, `${id}: non-ink materials are per instance`);
  }
});

test('ground models stand on their base, flying models point +Z, proportions follow the references', async () => {
  const { THREE: T } = await three();
  const ink = new T.MeshStandardMaterial();
  const b = (id, opts) => boxOf(T, buildSubModel(T, id, ink, opts).root);
  for (const id of ['autobomb', 'inkMine', 'sprinkler', 'beakon', 'splashWall']) near(b(id).min.y, 0, 0.004, `${id} base on y=0`);
  const auto = b('autobomb');
  assert.ok(auto.max.z - auto.min.z > auto.max.x - auto.min.x, 'Autobomb bell is longer front-to-back (side render)');
  const torp = b('torpedo');
  assert.ok(torp.max.z - torp.min.z > 1.6 * (torp.max.x - torp.min.x), 'Torpedo is a long fish along +Z');
  const ang = b('angleShooter');
  assert.ok(ang.max.z - ang.min.z > 2 * (ang.max.x - ang.min.x), 'Angle Shooter marker lies along Z');
  const mine = b('inkMine');
  near((mine.max.y - mine.min.y) / (mine.max.x - mine.min.x), 0.35, 0.06, 'Ink Mine dot ring ~ a third of the plate diameter tall');
  const wall = b('splashWall', { dims: { width: ALL_SUB_SPECS.splashWall.wallWidth, height: ALL_SUB_SPECS.splashWall.wallHeight } });
  near(wall.max.x - wall.min.x, ALL_SUB_SPECS.splashWall.wallWidth, 0.2, 'Splash Wall arms span the gameplay wall width');
  assert.ok(wall.max.y <= ALL_SUB_SPECS.splashWall.wallHeight + 0.01, 'within the gameplay wall height');
  const spr = b('sprinkler');
  assert.ok(spr.max.x - spr.min.x > 1.6 * 0.35, 'Sprinkler head spans well beyond the base (promo render)');
});

test('animation channels: legs walk, heads and props spin, Splash Wall unfolds before its curtain shows', async () => {
  const { THREE: T } = await three();
  const ink = new T.MeshStandardMaterial();
  const auto = buildSubModel(T, 'autobomb', ink);
  for (let i = 0; i < 10; i++) poseSubModel(auto, { dt: 1 / 60, speed: 5.4 });
  assert.notEqual(auto.groups.legL.rotation.x, 0);
  near(auto.groups.legL.rotation.x, -auto.groups.legR.rotation.x, 1e-12, 'alternating stride');
  const idle = buildSubModel(T, 'autobomb', ink);
  poseSubModel(idle, { dt: 1 / 60, speed: 0 });
  assert.equal(idle.groups.legL.rotation.x, 0, 'no stride while standing');
  const spr = buildSubModel(T, 'sprinkler', ink);
  poseSubModel(spr, { dt: 1 / 60, spin: 1.25 });
  assert.equal(spr.groups.head.rotation.y, 1.25);
  const torp = buildSubModel(T, 'torpedo', ink);
  poseSubModel(torp, { dt: 0.1 });
  assert.ok(torp.groups.prop.rotation.z > 0, 'propeller turns');
  const wall = buildSubModel(T, 'splashWall', ink, { unfold: 0 });
  near(wall.root.scale.x, SPLASH_WALL_FOLDED_SCALE, 1e-12, 'thrown folded');
  assert.equal(wall.groups.curtain.visible, false);
  assert.ok(wall.groups.armR.rotation.z > 1, 'arms folded up');
  poseSubModel(wall, { dt: 0, unfold: 0.5 });
  assert.equal(wall.groups.curtain.visible, false, 'no curtain mid-unfold');
  poseSubModel(wall, { dt: 0, unfold: 1 });
  near(wall.root.scale.x, 1, 1e-12, 'standing size');
  near(wall.groups.armR.rotation.z, 0, 1e-12, 'arms open');
  assert.equal(wall.groups.curtain.visible, true);
  const mine = buildSubModel(T, 'inkMine', ink, { armed: false });
  assert.equal(mine.groups.holo.visible, false, 'dot ring hidden until armed');
  poseSubModel(mine, { dt: 0, armed: true });
  assert.equal(mine.groups.holo.visible, true);
  const glow = buildSubModel(T, 'pointSensor', ink);
  const red = new T.Color(0xff0000);
  tintSubModel(glow, red);
  assert.equal(glow.materials.get('inkGlow').color.getHex(), 0xff0000, 'ink-derived parts follow a team colour change');
});

test('all-subs runtime objects carry their own models, oriented and posed from the record only', async () => {
  const f = await three();
  const { G, THREE: T } = f;
  const actor = f.make('shooter');
  actor.pos.set(0, 0, 0); actor.aimYaw = 0; actor.aimPitch = 0.2; actor.vel.set(0, 0, 0);
  const ids = ['burst', 'fizzy', 'torpedo', 'inkMine', 'toxicMist', 'angleShooter', 'splashWall', 'beakon'];
  for (const id of ids) {
    actor.weapon = { ...actor.weapon, sub: id };
    const o = G.projectiles.throwBomb(actor);
    assert.ok(o?.mesh, `${id} object has a visual`);
    assert.equal(o.s3Model?.id, id, `${id} uses its own model`);
    assert.equal(o.mesh.userData.s3SubId, id);
    const before = { pos: o.pos.clone(), vel: o.vel.clone(), age: o.age };
    if (id === 'torpedo' || id === 'angleShooter') {
      o.vel.set(3, 1, 4);
      G.time += 1 / 60; G.projectiles.update(1 / 60);
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(o.mesh.quaternion), v = o.vel.clone().normalize();
      near(fwd.dot(v), 1, 1e-6, `${id} nose along the travel`);
    }
    assert.ok(Number.isFinite(before.pos.x) && before.age >= 0);
  }
});

test('deployed visuals: Splash Wall unfolds over its window, Toxic Mist becomes the cloud, disposal keeps shared geometry', async () => {
  const f = await three();
  const { G, THREE: T } = f;
  const actor = f.make('shooter');
  actor.pos.set(0, 0, 0);
  const deploy = (id) => {
    actor.weapon = { ...actor.weapon, sub: id };
    const o = G.projectiles.throwBomb(actor);
    if(id==='splashWall'){
      near(o.s3Model.root.scale.x,SPLASH_WALL_FOLDED_SCALE,1e-12,'released device starts folded');
      assert.equal(o.s3Model.groups.curtain.visible,false,'flight has no active curtain');
    }
    G.physics.segment = (a, b, out) => { out.hit = true; out.point = new T.Vector3(b.x, 0, b.z); out.normal = new T.Vector3(0, 1, 0); return out; };
    let foldedPending=false,unfoldingPending=false;
    for (let i = 0; i < 120 && o.phase !== 'deployed' && !o.dead; i++) {
      G.time += 1 / 60; G.projectiles.update(1 / 60);
      if(id==='splashWall'&&o.phase==='wallPending'){
        assert.equal(o.s3Model.groups.curtain.visible,false,'landed preparation has no active curtain');
        if(o.age<=o.wallReadyAge-SPLASH_WALL_UNFOLD_SECONDS+1e-10){
          foldedPending=true;
          near(o.s3Model.root.scale.x,SPLASH_WALL_FOLDED_SCALE,1e-12,'early contact keeps the device folded');
        }else{
          const scale=o.s3Model.root.scale.x;
          if(scale>SPLASH_WALL_FOLDED_SCALE&&scale<1)unfoldingPending=true;
          assert.ok(scale>SPLASH_WALL_FOLDED_SCALE&&scale<=1,'device grows before operation');
          assert.ok(o.s3Model.groups.armR.rotation.z>0,'the arms are still opening while the curtain is absent');
        }
      }
    }
    if(id==='splashWall'){
      assert.equal(foldedPending,true);assert.equal(unfoldingPending,true);
      assert.ok(o.age+1e-10>=o.wallReadyAge,'operation follows the record release clock');
    }
    return o;
  };
  const wall = deploy('splashWall');
  assert.equal(wall.phase, 'deployed');
  near(wall.s3Model.root.scale.x,1,1e-9,'operation starts with the arms fully unfolded');
  assert.equal(wall.s3Model.groups.curtain.visible,true,'the curtain begins with actual deployment');
  for (let t = 0; t < SPLASH_WALL_UNFOLD_SECONDS + 0.05; t += 1 / 60) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
  near(wall.s3Model.root.scale.x, 1, 1e-9, 'stands at full height after the unfold window');
  assert.equal(wall.s3Model.groups.curtain.visible, true);
  const mist = deploy('toxicMist');
  for (let i = 0; i < 90 && mist.phase !== 'deployed'; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); }
  assert.equal(mist.phase, 'deployed');
  assert.equal(mist.s3Model.id, 'toxicMistCloud');
  near(mist.s3Model.root.scale.x, ALL_SUB_SPECS.toxicMist.radius, 1e-12, 'cloud spans the gameplay radius');
  const geo = meshes(wall.mesh)[0].geometry;
  let disposed = 0; const orig = geo.dispose; geo.dispose = function () { disposed++; return orig.call(this); };
  G.projectiles.clear?.();
  assert.equal(disposed, 0, 'shared model geometry survives per-object disposal');
  geo.dispose = orig;
});

async function nativeWorld() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const V = f.THREE.Vector3;
  f.G.camera = { position: new V(0, 100, 0) };
  f.G.physics.segment = (a, b, out) => {
    out.hit = false;
    if (a.y >= 0 && b.y < 0) { const t = a.y / (a.y - b.y); out.hit = true; out.point = new V(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); out.normal = new V(0, 1, 0); }
    return out;
  };
  f.G.physics.raycast = (o, d, len, out) => {
    out.hit=d.y<0&&o.y>=0&&o.y+d.y*len<=0;
    if(out.hit){out.point.set(o.x,0,o.z);out.normal.set(0,1,0);out.dist=o.y/-d.y;}
    return out;
  };
  f.G.paint = { sample: () => 1, splat: () => 1 };
  return f;
}
function releaseNative(f, a, sub) {
  const p = f.G.projectiles;
  for (const x of [...p.bombs]) p._releaseBomb(x);
  p.bombs.length = 0;
  a.weapon = { ...a.weapon, sub }; a.pos.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = 0.2;
  a.weaponRunner.reset(); a.ink = 100;
  for (let i = 0; i < 4; i++) { f.G.time += 1 / 60; a.weaponRunner.update(1 / 60, { sub: true }); }
  a.weaponRunner.update(1 / 60, { subReleased: true });
  for (let i = 0; i < 20 && !p.bombs.length; i++) a.weaponRunner.update(1 / 60, {});
  return p.bombs.at(-1);
}

test('native Autobomb and Sprinkler records take their own models instead of the Splat Bomb pyramid', async () => {
  const { THREE: T } = await three();
  const ink = new T.MeshStandardMaterial();
  assert.deepEqual([...NATIVE_SUB_MODEL_IDS], ['autobomb', 'sprinkler']);
  for (const id of NATIVE_SUB_MODEL_IDS) {
    const m = buildThrownBombModel(T, id, ink);
    assert.equal(m.id, id);
    assert.equal(m.sub.id, id);
    assert.equal(m.body.material, ink, 'the native fuse pulse drives an ink part');
  }
  assert.deepEqual(SPRINKLER.spinDegreesPerFrame, [33, 11, 1]);
});

test('real native records: Sprinkler head spins by phase on its surface, Autobomb walks upright toward its target', async () => {
  const f = await nativeWorld();
  const p = f.G.projectiles, a = f.make('shooter');
  const s = releaseNative(f, a, 'sprinkler');
  assert.equal(s.s3Resolved?.spec?.id, 'sprinkler');
  for (let i = 0; i < 400 && s.s3Mode !== 'sprinkling'; i++) { f.G.time += 1 / 60; p._updateBombs(1 / 60); }
  assert.equal(s.s3Mode, 'sprinkling');
  assert.equal(s.s3Model?.id, 'sprinkler');
  near(s.s3Model.root.position.y, -0.21, 1e-12, 'base on the contact surface');
  p._updateBombs(1 / 60);
  const still = s.s3Model.sub.groups.head.rotation.y;
  assert.equal(still, 0, 'head holds during the 30F deploy window');
  for (let i = 0; i < 40; i++) { f.G.time += 1 / 60; p._updateBombs(1 / 60); }
  const a0 = s.s3SpinAngle;
  f.G.time += 1 / 60; p._updateBombs(1 / 60);
  near(((s.s3SpinAngle - a0) + Math.PI * 2) % (Math.PI * 2), 33 * Math.PI / 180, 1e-9, 'first phase 33 deg per frame');
  assert.equal(s.s3Model.sub.groups.head.rotation.y, s.s3SpinAngle);

  const b = releaseNative(f, a, 'autobomb');
  for (let i = 0; i < 400 && b.s3Mode !== 'chasing'; i++) { f.G.time += 1 / 60; p._updateBombs(1 / 60); }
  assert.equal(b.s3Model?.id, 'autobomb');
  assert.equal(b.s3Mode, 'chasing');
  const e = f.make('shooter'); e.team = 1; e.remote = false; e.alive = true;
  e.pos.set(b.pos.x + 2, b.pos.y - 0.21, b.pos.z);
  if (!f.G.actors.includes(e)) f.G.actors.push(e);
  let strode = false;
  for (let i = 0; i < 60 && p.bombs.includes(b); i++) {
    f.G.time += 1 / 60; p._updateBombs(1 / 60);
    if (Math.abs(b.s3Model.sub.groups.legL.rotation.x) > 0.05) strode = true;
    assert.equal(b.mesh.rotation.x, 0, 'upright: no tumble');
  }
  assert.ok(strode, 'legs stride while it walks');
  near(Math.sin(b.s3ModelYaw), 1, 0.05, 'faces the target (+X)');
});

test('held prop: every sub kit holds its own model in the real Character, team recolour reaches it', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true });
  const actor = new f.Actor({ team: 0, name: 'held', weapon: 'shooter', CharacterClass: f.Character });
  actor.character.actor = actor; f.G.actors.push(actor);
  const ch = actor.character, view = { form: 'kid', hp: 100, grounded: true };
  const native = ch.bomb.group.children.slice();
  for (const id of SUB_MODEL_IDS) {
    actor.weapon = { ...actor.weapon, sub: id };
    assert.equal(heldBombModelId(ch), id);
    ch.bombHeld = true; actor.weaponRunner.aimingSub = true; ch.update(1 / 60, view);
    assert.ok(native.every(c => !c.visible), `${id}: generic bulb hidden`);
    const custom = ch.bomb.group.children.filter(c => !native.includes(c));
    assert.equal(custom.length, 1, `${id}: one held prop`);
    assert.equal(custom[0].userData.s3HeldSubModel?.id, id);
    const ink = new f.THREE.MeshStandardMaterial({ color: 0x00ff00 });
    ch.bomb.ink.material = ink;
    assert.ok(custom[0].userData.s3HeldSubModel.inkMeshes.every(m => m.material === ink), `${id}: recolour reaches the ink parts`);
  }
  const probe = buildHeldSubModel(f.THREE, 'burst', null);
  near(probe.holder.scale.x, HELD_SCALE, 1e-12, 'held at the shared sub prop scale');
  assert.ok(HELD_SCALE > 0.4 && HELD_SCALE < 0.8, 'held at roughly head size, not the former 0.2 dot');
});

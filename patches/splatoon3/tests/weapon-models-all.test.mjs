// Every main weapon: its own (or shared family) model obeys the grip, muzzle,
// part-channel and LOD contracts, and the real Actor/WeaponRunner/Character
// holds it through idle, carry and attack with finite poses and closed hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const IDS = MAIN_WEAPON_CATALOG.records.map(r => r.id);
let loaded;
const production = () => loaded ??= fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true,
  extraExports: "export { getWeaponDef, WEAPON_KINDS } from './inkwave-public/src/game/character-weapons.js';\nexport * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';" });
// Native part channels each family's runtime animates (character-weapons.js + patches).
const CHANNELS = { shooter: ['trigger', 'bolt', 'can', 'led'], blaster: ['trigger', 'pump', 'needle', 'bulb', 'front', 'lever'],
  charger: ['trigger', 'bolt', 'lens', 'eyepiece', 'ports'], roller: ['led', 'hinge', 'hingeInk'], slosher: ['surface', 'lever'],
  splatling: ['trigger', 'barrels'], dualies: ['slide', 'slideInk', 'led'] };
const TRI_BUDGET = 16000;

function finiteGeometry(g, label) {
  assert.ok(g?.index?.count > 0, label + ' indexed');
  for (const k of ['position', 'normal', 'color', 'aMat']) assert.ok(g.attributes[k], label + ' ' + k);
  for (const a of Object.values(g.attributes)) for (let i = 0; i < a.array.length; i++) assert.ok(Number.isFinite(a.array[i]), label + ' finite');
  const n = g.attributes.position.count;
  for (let i = 0; i < g.index.array.length; i++) assert.ok(g.index.array[i] < n, label + ' valid index');
}

test('registry: 65 catalogue weapons, each model keyed by its own ID and family', async () => {
  const { registeredWeaponModels, weaponModelKey, weaponModelFamily, weaponBehaviorFamily, weaponHold } = (await production()).REG;
  assert.equal(IDS.length, 65);
  for (const id of registeredWeaponModels()) {
    assert.ok(IDS.includes(id), id + ' is a catalogue weapon');
    assert.equal(weaponModelKey(id), id);
  }
  for (const id of IDS) {
    assert.ok(['shooter', 'blaster', 'charger', 'roller', 'slosher', 'splatling', 'dualies'].includes(weaponModelFamily(id)));
    assert.equal(typeof weaponBehaviorFamily(id), 'string');
  }
  const base = { carry: { p: [1, 2, 3], r: [0, 0, 0] }, rc: { kick: 1 } };
  for (const id of registeredWeaponModels()) assert.equal(weaponHold(id, base), weaponHold(id, base), id + ' stable hold identity');
});

test('every main weapon model keeps finite geometry, grips, muzzle socket and native channels', async () => {
  const f = await production(), { THREE } = f, V = new THREE.Vector3(1, 1, 1);
  const { registeredWeaponModels, weaponModelFamily } = f.REG;
  for (const id of IDS) {
    const d = f.getWeaponDef(id), fam = weaponModelFamily(id);
    assert.equal(d.kind, fam, id + ' family kind');
    assert.equal(f.getWeaponDef(id), d, id + ' cached');
    if (registeredWeaponModels().includes(id)) assert.equal(d.modelId, id);
    for (const k of ['body', 'ink', 'bodyStatic', 'inkStatic']) finiteGeometry(d[k], id + '.' + k);
    for (const [name, p] of Object.entries(d.parts)) { finiteGeometry(p.geo, id + '.' + name); assert.ok(p.pivot.toArray().every(Number.isFinite)); }
    for (const name of CHANNELS[fam] || []) assert.ok(d.parts[name], `${id} keeps native ${name} channel`);
    let tris = 0; for (const g of [d.body, d.ink, d.drum, d.drumCaps, d.glow]) if (g) tris += g.index.count / 3;
    assert.ok(tris <= TRI_BUDGET, `${id} ${tris} triangles within ${TRI_BUDGET}`);
    for (const k of ['handR', 'handL']) { assert.ok(d[k].pos.toArray().every(Number.isFinite)); assert.ok(Math.abs(d[k].quat.length() - 1) < 1e-6); }
    const m = new THREE.Matrix4().compose(d.handR.pos, d.handR.quat, V).multiply(new THREE.Matrix4().compose(d.inHand.pos, d.inHand.quat, V));
    assert.ok(m.elements.every((n, i) => Math.abs(n - (i % 5 === 0 ? 1 : 0)) < 1e-6), id + ' attachment roundtrip');
    d.body.computeBoundingBox(); const box = d.body.boundingBox.clone();
    if (d.drum) { d.drum.computeBoundingBox(); box.union(d.drum.boundingBox.clone().translate(d.drumAt)); }
    for (const p of Object.values(d.parts)) { p.geo.computeBoundingBox(); if (!p.geo.boundingBox.isEmpty()) box.union(p.geo.boundingBox.clone().translate(p.pivot)); }
    assert.ok(box.expandByScalar(0.06).containsPoint(d.muzzle), id + ' muzzle socket on the model');
  }
});

test('the real Actor/Runner/Character holds every main weapon through carry and attack', async () => {
  const f = await production(), { G, THREE } = f, { weaponModelKey, weaponModelFamily } = f.REG;
  G.scene = new THREE.Scene(); G.physics = new f.Physics(G.level); G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.projectiles = new Proxy({}, { get: (t, k) => t[k] ?? (typeof k === 'string' && /^(fire|throw)/.test(k) ? () => {} : undefined) });
  const C = f.CHARACTER_CHANNELS, hand = new THREE.Vector3();
  for (const id of IDS) {
    const a = new f.Actor({ team: 0, weapon: id, CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
    assert.equal(ch.weaponKind, weaponModelFamily(id), id + ' family hold');
    assert.equal(ch.weaponModel, weaponModelKey(id), id + ' own model');
    assert.equal(ch.weapon.def, f.getWeaponDef(id));
    let maxGrip = 0;
    for (let n = 0; n < 150; n++) {
      const fire = n >= 40 && n < 120; a.intent.fire = fire; a.ink = 100;
      G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
      assert.ok([...ch.P].every(Number.isFinite), id + ' finite pose');
      assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite), id + ' finite muzzle');
      if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001)
        maxGrip = Math.max(maxGrip, ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(hand)));
    }
    assert.ok(maxGrip < 0.008, `${id} support hand stays on its grip (${maxGrip.toFixed(4)} m)`);
    a.weaponRunner.reset(); ch.setWeapon('shooter'); assert.equal(ch.weaponModel, weaponModelKey('shooter'));
    ch.dispose(); G.scene.remove(ch.root);
  }
});

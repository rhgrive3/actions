// Family-wide acceptance: source 11.3.0 mains plus every registered alternate kit.
// One production-composed fixture, actual Actor -> WeaponRunner -> Projectiles.
// This is not physical-console, online peer, GPU or retail mask validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
import { mainAudioSourceId, WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';

const bases = MAIN_WEAPON_CATALOG.records;
const byId = new Map(bases.map(r => [r.id, r]));
const variants = ALTERNATE_WEAPON_KITS;
const families = [...new Set(bases.map(r => r.family))];
let scene;
const production = () => scene ||= fixture({
  fullRuntime: true, productionComposition: true, realProjectiles: true,
  vmMathRandom: () => .5,
}).then(f => {
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  return f;
});

test('all 65 main and 95 alternate source IDs form one complete, unique family roster', () => {
  assert.equal(bases.length, 65);
  assert.equal(variants.length, 95);
  assert.equal(new Set([...bases.map(r => r.id), ...variants.map(v => v.id)]).size, 160);
  assert.equal(variants.filter(v => v.main.endsWith('_01')).length, 65);
  assert.equal(variants.filter(v => v.main.endsWith('_02')).length, 30);
  for (const v of variants) {
    const base = byId.get(v.baseId);
    assert.ok(base, v.id + ' canonical base exists');
    assert.equal(v.main.replace(/_0[12]$/, '_00'), base.sourceRow, v.id + ' shares sourced main');
  }
});

for (const family of families) {
  const mains = bases.filter(r => r.family === family);
  const kits = variants.filter(v => mains.some(r => r.id === v.baseId));
  test(family + ': all base/alternate kits preserve main-family mechanics and audio provenance', async () => {
    const f = await production();
    for (const r of mains) {
      const w = f.WEAPONS[r.id];
      assert.ok(w, r.id + ' playable base');
      assert.equal(mainAudioSourceId(r.id), r.id);
      assert.equal(WEAPON_AUDIO[r.id]?.family, family, r.id + ' unique family audio owner');
      if (!r.legacy) assert.equal(w.catalogRecord?.id, r.id, r.id + ' source catalog record');
    }
    for (const kit of kits) {
      const b = f.WEAPONS[kit.baseId], w = f.WEAPONS[kit.id];
      assert.ok(w && b, kit.id + ' is registered');
      assert.equal(w.variantOf, kit.baseId);
      assert.equal(w.behaviorKind, b.behaviorKind, kit.id + ' family behavior');
      assert.equal(w.modelKind, b.modelKind, kit.id + ' common main model family');
      assert.equal(w.catalogRecord, b.catalogRecord, kit.id + ' same main source data');
      assert.equal(w.inkPerShot, b.inkPerShot, kit.id + ' same main ink cost');
      assert.equal(w.specialCost, kit.specialCost, kit.id + ' own sourced special cost');
      assert.equal(w.sub, kit.sub, kit.id + ' own sub slot');
      assert.equal(w.special, kit.special, kit.id + ' own special slot');
      assert.equal(mainAudioSourceId(kit.id), kit.baseId, kit.id + ' same main sound identity');
    }
  });

  test(family + ': actual production-composed main fire and all alternate-main shots', async () => {
    const f = await production();
    for (const id of [...mains.map(r => r.id), ...kits.map(v => v.id)]) {
      f.G.projectiles.clear();
      f.G.actors.length = 0;
      const actor = f.make(id);
      actor.form = 'kid';
      actor.ink = 100;
      actor.intent.fire = true;
      f.tick(actor, 150);
      actor.intent.fire = false;
      f.tick(actor, 20);
      const base = f.WEAPONS[f.WEAPONS[id].variantOf || id];
      const rounds = f.G.projectiles.list.filter(p => p.owner === actor);
      assert.ok(rounds.length > 0, id + ' must emit through actual Actor and WeaponRunner');
      assert.ok(rounds.some(p => base.catalogRecord
        ? p.catalog?.r?.id === base.catalogRecord.id
        : !p.catalog), id + ' main round retains the base family projectile owner');
      assert.ok(Number.isFinite(actor.ink) && actor.ink >= 0 && actor.ink <= 100,
        id + ' main firing keeps a valid tank');
    }
  });
}

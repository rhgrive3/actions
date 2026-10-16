// Data-only _01/_02 weapon kits. No new 3D assets or attack algorithms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS, VARIANT_BASE_WEAPON } from '../runtime/alternate-weapon-kits-data.mjs';
import { registerAlternateWeaponKits } from '../runtime/alternate-weapon-kits.mjs';
import { fixture } from './source-fixture.mjs';
import { WEIGHT_SPEED_CURVES, weaponWeight, weaponAccelerationClass, weightSpeedCurve } from '../runtime/weapon-weight.mjs';

const BASE = new Map(MAIN_WEAPON_CATALOG.records.map(r => [r.id, r]));
const records = ALTERNATE_WEAPON_KITS;

function stub(LANG = 'ja') {
  const WEAPONS = {}, WEAPON_ORDER = [];
  for (const r of MAIN_WEAPON_CATALOG.records) {
    WEAPONS[r.id] = { id:r.id, kind:r.legacy ? r.modelKind : 'catalog',
      modelKind:r.modelKind, behaviorKind:r.family, sourceMainActor:r.sourceActor,
      catalogRecord:r.legacy ? undefined : r, inkPerShot:4.5,
      stats:Object.freeze({ damage:0.4 }), blurb:'Base model' };
    WEAPON_ORDER.push(r.id);
  }
  const SUB=Object.fromEntries(records.map(r => [r.sub, { id:r.sub, inkCost:35 }]));
  const SPECIALS=Object.fromEntries(records.map(r => [r.special, { id:r.special }]));
  return { LANG, WEAPONS, WEAPON_ORDER, SUB, SPECIALS };
}

test('S3 11.3.0 alternate manifest has precisely 65 second / 30 third kits, excluding replicas', () => {
  assert.equal(MAIN_WEAPON_CATALOG.records.length,65);
  assert.equal(records.length,95);
  assert.equal(new Set(records.map(r=>r.id)).size,95);
  assert.equal(records.filter(r=>r.main.endsWith('_01')).length,65);
  assert.equal(records.filter(r=>r.main.endsWith('_02')).length,30);
  const counts=new Map();
  for (const kit of records) {
    assert.ok(BASE.has(kit.baseId), kit.main + ' base exists');
    assert.equal(VARIANT_BASE_WEAPON[kit.id], kit.baseId);
    assert.equal(kit.id, kit.baseId + '-' + kit.main.slice(-2));
    assert.equal(kit.main.replace(/_0[12]$/, '_00'),
      BASE.get(kit.baseId).sourceRow, kit.main + ' source lineage');
    assert.ok(kit.names.ja && kit.names.en && kit.sub && kit.special);
    assert.ok(Number.isInteger(kit.specialCost) && kit.specialCost >= 150);
    counts.set(kit.baseId, (counts.get(kit.baseId) || 0) + 1);
  }
  assert.equal(counts.size,65);
  assert.ok([...counts.values()].every(n=>n===1||n===2));
  assert.equal(records.some(r=>/replica/i.test(r.names.en)),false);
});

test('registered variants keep base weapon mechanics but own sourced kits and localization', () => {
  for (const lang of ['ja','en']) {
    const a=stub(lang), original=a.WEAPON_ORDER.slice();
    assert.equal(registerAlternateWeaponKits(a),95);
    assert.equal(Object.keys(a.WEAPONS).length,160);
    assert.equal(a.WEAPON_ORDER.length,160);
    assert.deepEqual(a.WEAPON_ORDER.filter(id=>!VARIANT_BASE_WEAPON[id]),original);
    for (const kit of records) {
      const w=a.WEAPONS[kit.id], base=a.WEAPONS[kit.baseId];
      assert.equal(w.name,kit.names[lang], kit.id);
      assert.equal(w.variantOf,kit.baseId);
      assert.equal(w.variantVisualStatus,'shared-base-model');
      assert.equal(w.modelKind,base.modelKind);
      assert.equal(weaponWeight(kit.id),weaponWeight(kit.baseId),kit.main+' weight');
      assert.equal(weaponAccelerationClass(kit.id),weaponAccelerationClass(kit.baseId),kit.main+' acceleration');
      assert.deepEqual(weightSpeedCurve(kit.id,'run'),WEIGHT_SPEED_CURVES[weaponWeight(kit.baseId)].run);
      assert.deepEqual(weightSpeedCurve(kit.id,'swim'),WEIGHT_SPEED_CURVES[weaponWeight(kit.baseId)].swim);
      assert.equal(w.kind,base.kind);
      assert.equal(w.catalogRecord,base.catalogRecord);
      assert.equal(w.sourceMainActor,base.sourceMainActor);
      assert.equal(w.inkPerShot,base.inkPerShot);
      assert.equal(w.stats,base.stats);
      assert.equal(w.sub,kit.sub);
      assert.equal(w.special,kit.special);
      assert.equal(w.specialCost,kit.specialCost);
      assert.equal(w.kitReference,kit.main);
      assert.equal(w.kitStatus,'verified-variant-kit');
      assert.deepEqual(w.kitVerifiedSlots,['sub','special']);
      assert.equal(a.WEAPON_ORDER.indexOf(kit.id)>a.WEAPON_ORDER.indexOf(kit.baseId),true);
    }
  }
});

test('alternate registration fails atomically on incomplete sub/special support', () => {
  const a=stub();
  const before=a.WEAPON_ORDER.slice();
  delete a.SPECIALS[records[0].special];
  assert.throws(()=>registerAlternateWeaponKits(a), /Unresolved alternate kit slots/);
  assert.deepEqual(a.WEAPON_ORDER,before);
  assert.equal(Object.keys(a.WEAPONS).length,65);
});

test('representative Japanese names and 11.3.0 SP adjustments are pinned', () => {
  const byRow=Object.fromEntries(records.map(k=>[k.main,k]));
  assert.deepEqual(
    [byRow.Shooter_Normal_01.names.ja,byRow.Shooter_Normal_01.sub,byRow.Shooter_Normal_01.special,byRow.Shooter_Normal_01.specialCost],
    ['スプラシューターコラボ','bomb','tripleInkstrike',190]);
  assert.deepEqual(
    [byRow.Shooter_Expert_02.names.ja,byRow.Shooter_Expert_02.special,byRow.Shooter_Expert_02.specialCost],
    ['プライムシューターFRZN','tentaMissiles',180]);
  assert.equal(byRow.Spinner_Hyper_01.specialCost,190);
  assert.equal(byRow.Stringer_Normal_01.specialCost,200);
});

test('pinned alternate rows match raw Leanny 11.3.0 source when provided', t => {
  const root=process.env.INKWAVE_MAIN_WEAPON_REFERENCE;
  if(!root) { t.skip('Set INKWAVE_MAIN_WEAPON_REFERENCE for independent raw source cross-check'); return; }
  const read=rel=>JSON.parse(fs.readFileSync(path.join(path.resolve(root),rel),'utf8'));
  const info=new Map(read('data/mush/1130/WeaponInfoMain.json').map(r=>[r.__RowId,r]));
  const ja=read('data/language/JPja.json')['CommonMsg/Weapon/WeaponName_Main'];
  const en=read('data/language/USen.json')['CommonMsg/Weapon/WeaponName_Main'];
  const canonical=JSON.parse(fs.readFileSync(new URL('../reference/canonical-kits-1130.json',import.meta.url),'utf8'));
  const subs=new Map(canonical.records.map(r=>[r.SubWeapon,r.sub]));
  const specials=new Map(canonical.records.map(r=>[r.SpecialWeapon,r.special]));
  for(const [source,key] of Object.entries({
    SpFirework:'superChump', SpCastle:'krakenRoyale',
    SpPogo:'tripleSplashdown', SpChimney:'splattercolorScreen',
  })) specials.set('Work/Gyml/'+source+'.spl__WeaponInfoSpecial.gyml',key);
  const baseRows=new Map(canonical.records.map(r=>[r.sourceRow,r.id]));
  assert.equal(baseRows.size,65);
  for(const k of records) {
    const r=info.get(k.main);
    assert.ok(r,k.main);
    assert.equal(k.baseId,baseRows.get(k.main.replace(/_0[12]$/,'_00')));
    assert.equal(k.names.ja,ja[k.main]);
    assert.equal(k.names.en,en[k.main]);
    assert.equal(k.sub,subs.get(r.SubWeapon),k.main+' sub Gyml');
    assert.equal(k.special,specials.get(r.SpecialWeapon),k.main+' special Gyml');
    assert.equal(k.specialCost,r.SpecialPoint);
  }
});

test('production: 95 variants select the original model, and both legacy/catalog variants fire', async () => {
  const f = await fixture({ fullRuntime:true, productionComposition:true, realProjectiles:true,
    extraExports:"export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js'; export * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';" });
  // Additional kit owner must be activated by installS3 in production.
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  assert.equal(f.WEAPON_ORDER.length,160);
  assert.equal(f.REG.registeredWeaponModels().length,65);
  // Only explicitly registered variant source rows can own an independent
  // appearance. Every other kit must still route to its original base model.
  const reviewed=new Set(f.REG.registeredWeaponVariantModels());
  for(const kit of records) {
    const w=f.WEAPONS[kit.id], b=f.WEAPONS[kit.baseId];
    assert.ok(w,'playable '+kit.main);
    assert.equal(w.sub,kit.sub); assert.equal(w.special,kit.special);
    assert.equal(w.specialCost,kit.specialCost);
    assert.equal(w.modelKind,b.modelKind);
    const modelKey=f.REG.weaponModelKey(kit.id);
    assert.equal(modelKey,reviewed.has(kit.main)?kit.main:kit.baseId,
      kit.main+' must select only its explicit reviewed visual owner');
    if(reviewed.has(kit.main)) {
      const spec=f.REG.weaponModelSpec(kit.id);
      assert.equal(spec?.sourceRow,kit.main,'registered visual must preserve official source row');
      assert.equal(spec?.baseId,kit.baseId,'variant visual must preserve base gameplay owner');
      assert.equal(spec?.family,f.REG.weaponBehaviorFamily(kit.baseId));
    }
    assert.equal(f.REG.weaponBehaviorFamily(kit.id),f.REG.weaponBehaviorFamily(kit.baseId));
    assert.equal(f.REG.weaponModelFamily(kit.id),f.REG.weaponModelFamily(kit.baseId));
  }
  for(const kit of [records.find(x=>x.main==='Shooter_Normal_01'),
                    records.find(x=>x.main==='Shooter_Precision_02'),
                    records.find(x=>x.main==='Roller_Compact_02')]) {
    const modelKey=f.REG.weaponModelKey(kit.id),selected=f.getWeaponDef(modelKey),base=f.getWeaponDef(kit.baseId);
    if(reviewed.has(kit.main)){
      assert.notStrictEqual(selected,base,'approved visual finish owns its independent def');
      assert.equal(selected.modelId,kit.baseId,'variant visual keeps original native model/animation family');
      assert.equal(selected.modelVariantId,kit.main,'variant visual identity stays source-row bound');
    } else assert.strictEqual(selected,base,'unmodified kit shares canonical base geometry');
    f.G.projectiles.clear();f.G.actors.length=0;
    const actor=f.make(kit.id);
    assert.equal(actor.weaponId,kit.id);
    assert.equal(actor.weapon.special,kit.special);
    assert.equal(actor.weapon.sub,kit.sub);
    actor.form='kid';actor.ink=100;actor.intent.fire=true;
    f.tick(actor,140);
    assert.ok(Number.isFinite(actor.ink) && actor.ink>=0 && actor.ink<=100,kit.main+' finite ink');
    assert.ok(f.G.projectiles.list.some(p=>p.owner===actor&&
      (b.catalogRecord ? p.catalog?.r===b.catalogRecord : !p.catalog)),
      kit.main+' must inherit the base weapon projectile owner');
  }
});

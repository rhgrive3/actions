import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { sampleSplatlingSpeed, splatlingChargeDownRate } from '../runtime/splatling.mjs';
import { fixture } from './source-fixture.mjs';

// Independently fetched Leanny 11.3.0 files, with original-byte SHA256 and Git
// blob IDs. These are input evidence; the test never generates them from code.
const source = JSON.parse(fs.readFileSync(new URL('../reference/spinner-kinematics-1130.json', import.meta.url), 'utf8'));
const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));
const records = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'splatling');
const close = (a, b, label) => assert.ok(Math.abs(a-b)<1e-9, `${label}: ${a} != ${b}`);

test('all six Spinner records and the Heavy adapter agree with the pinned source kinematics', () => {
  assert.equal(source.referenceVersion, '11.3.0');
  assert.equal(source.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(records.length, 6);
  for (const raw of source.records) {
    const r = records.find(r => r.sourceActor === raw.sourceActor);
    assert.ok(r, raw.sourceActor);
    assert.equal(r.sourceSha256, raw.sourceSha256, raw.sourceActor+' source bytes');
    for (const [group, fields] of Object.entries(raw.parameters))
      for (const [key, value] of Object.entries(fields))
        if (key !== '$type') assert.equal(r.parameters[group][key], value, raw.sourceActor+'/'+group+'/'+key);
    assert.equal(raw.parameters.WeaponParam.VelGnd_Bias_Charge, .9);
    assert.equal(splatlingChargeDownRate(profile, { catalogRecord:r }), .05);
  }
  const p = profile.weapons.splatling;
  assert.equal(p.speedRandomRate, .12);
  assert.equal(p.speedRandomBias, .2);
  assert.equal(p.speedRandomHalfWidth, undefined, 'a dimensionless rate must not be scaled into an absolute width');
  assert.equal(profile.bindings['weapons.splatling.speedRandomRate'].factor, 1);
  assert.equal(profile.bindings['weapons.splatling.speedRandomRate'].rawValue, .12);
});

test('each source mode has independent ratio endpoints and median-speed quartiles', async () => {
  const f = await fixture({ productionComposition:true,
    extraExports:"export { catalogSpinnerLaunchSpeed } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" });
  // WU/s values derived separately from the original v0, rate and median.
  // Columns: base, 0%, 25%, 50%, 75%, 100% CDF. They reject an absolute
  // amplitude, a uniform draw, and a second speed randomization layer.
  const expected = [
    ['WeaponSpinnerStandard','MoveParam',126,110.88,122.976,126,129.024,141.12],
    ['WeaponSpinnerQuick','MoveParam',90,81,88.2,90,91.8,99],
    ['WeaponSpinnerHyper','MoveParam',144,123.84,139.968,144,148.032,164.16],
    ['WeaponSpinnerDownpour','MoveParam',66,58.08,64.416,66,67.584,73.92],
    ['WeaponSpinnerDownpour','VariableMoveParam',133.149,129.15453,132.350106,133.149,133.947894,137.14347],
    ['WeaponSpinnerSerein','MoveParam',265.998,236.73822,260.146044,265.998,271.849956,295.25778],
    ['WeaponSpinnerHyperShort','MoveParam',108,102.6,106.92,108,109.08,113.4],
  ];
  for (const [actor, group, base, ...quantiles] of expected) {
    const m = source.records.find(r => r.sourceActor === actor).parameters[group];
    close(base, m.SpawnSpeedFirstLastAndSecond*60, actor+' source charge endpoint');
    for (let i=0; i<quantiles.length; i++) {
      let draws=0;
      close(f.catalogSpinnerLaunchSpeed(base,m,()=>{draws++;return i/4;}),quantiles[i],actor+' '+group+' quantile '+i);
      assert.equal(draws,1,'catalog speed has exactly one draw');
      close(sampleSplatlingSpeed(base,m.SpawnSpeedRandomRate,m.SpawnSpeedRandomBias,i/4),quantiles[i],actor+' shared kernel');
    }
  }
  let missingDraws=0;
  assert.equal(f.catalogSpinnerLaunchSpeed(90,{},()=>{missingDraws++;return 1;}),90);
  assert.equal(missingDraws,0,'an omitted source rate must not invent a random layer');
});

test('the installed all-family projectile owners apply the same source-relative birth speed', async () => {
  const f = await fixture({ fullRuntime:true, productionComposition:true, realProjectiles:true });
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.setRandom(()=>.75);
  for (const r of records) {
    f.G.projectiles.clear(); f.G.actors.length=0;
    const a=f.make(r.id); a.form='kid'; a.ink=100; a.intent.fire=true;
    // Pass the largest pinned full-charge time, including initial admission.
    f.tick(a,170); a.intent.fire=false; f.tick(a,3);
    const p=f.G.projectiles.list.find(p=>p.wid===r.id);
    assert.ok(p,r.id+' admitted stream emits');
    const raw=source.records.find(s=>s.sourceActor===r.sourceActor).parameters.MoveParam;
    const base=raw.SpawnSpeedFirstLastAndSecond*60;
    close(p.vel.length(),base*(1+raw.SpawnSpeedRandomRate*.2),r.id+' actual birth norm');
  }
});

test('charge deceleration resolves each weapon record without a Heavy fallback', () => {
  const record = { family:'splatling',parameters:{WeaponParam:{VelGnd_DownRt_Charge:.17}} };
  assert.equal(splatlingChargeDownRate(profile,{catalogRecord:record}),.17);
  assert.equal(splatlingChargeDownRate({}, {catalogRecord:record}),.17,'catalog does not require the legacy row');
  assert.equal(splatlingChargeDownRate(profile,{catalogRecord:{family:'splatling',parameters:{}}}),0);
  assert.equal(splatlingChargeDownRate(profile,{catalogRecord:{...record,family:'charger'}}),0);
  assert.equal(splatlingChargeDownRate(profile,{kind:'shooter'}),0);
});

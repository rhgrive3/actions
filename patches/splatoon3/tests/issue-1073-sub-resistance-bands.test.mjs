// #1073 — Sub Resistance eligibility follows the resolved bomb damage class,
// not the stale Splat Bomb 3.6-unit source-tag boundary left by kit composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { installSubResistance, subResistanceEligible, subEffectScale, objectDamageScale, catalogueAttackRow } from '../runtime/sub-resistance.mjs';

test('#1073 resolved bomb damage decides Sub Resistance eligibility across stale source tags', () => {
  for (const source of ['bomb', 'splat-bomb-far']) {
    assert.equal(subResistanceEligible(180, source), false, `${source}: lethal 180 band is never reduced`);
    assert.equal(subResistanceEligible(100, source), false, `${source}: 100 damage boundary is excluded`);
    assert.equal(subResistanceEligible(99.9, source), true, `${source}: sub-100 blast remains eligible`);
    assert.equal(subResistanceEligible(30, source), true, `${source}: far 30 band is eligible`);
  }
  assert.equal(subResistanceEligible(30, 'weapon'), false, 'non-bomb damage is never admitted');
});

test('#1073 victim-side wrapper fixes both Suction/Curling stale-boundary directions', () => {
  class Actor {
    constructor() { this.s3 = { modifiers: { subResistance: .5 } }; this.received = []; }
    damage(amount, _attacker, source) { this.received.push([amount, source]); return amount; }
  }
  installSubResistance({ Actor });
  const a = new Actor();

  // Suction/max-Curling 180 inside their 4.6 near radius can arrive with the
  // stale far tag (> Splat Bomb 3.6). It must stay lethal/unreduced.
  a.damage(180, null, 'splat-bomb-far');
  assert.deepEqual(a.received.at(-1), [180, 'bomb']);

  // Min-Curling 30 outside its 1.6 near radius can arrive with the stale near
  // tag (<= Splat Bomb 3.6). Resolved 30 damage must still receive resistance.
  a.damage(30, null, 'bomb');
  assert.deepEqual(a.received.at(-1), [15, 'bomb']);

  // Native Splat Bomb behavior remains the same at its own two bands.
  a.damage(180, null, 'bomb');
  assert.deepEqual(a.received.at(-1), [180, 'bomb']);
  a.damage(30, null, 'splat-bomb-far');
  assert.deepEqual(a.received.at(-1), [15, 'bomb']);
  assert.equal(a.s3SubResistanceHit, undefined, 'temporary victim classification is restored');
});
test('S3 Burst and Fizzy use BombL while Torpedo and Angle Shooter use BombH',()=>{
  class Actor{constructor(ap){this.s3={abilityPoints:{subResistance:ap},modifiers:{subResistance:.5}};}damage(n){return n;}}
  installSubResistance({Actor});
  const max=new Actor(57);
  assert.equal(max.damage(20,null,'curling'),20,'Wiki: rolling contact is not reduced by Sub Resistance');
  assert.equal(max.damage(60,null,'torpedo'),30);
  assert.equal(max.damage(35,null,'torpedo'),17.5);
  assert.equal(max.damage(12,null,'torpedo-splash'),6);
  assert.equal(max.damage(60,null,'burst'),36);
  assert.equal(max.damage(50,null,'fizzy'),30);
  assert.equal(max.damage(40,null,'angleShooter'),20);
  const ap6=new Actor(6);
  // Wiki Burst table GP6 =52.2, matching the pinned BombL Mid=.75.
  assert.equal(Math.floor(ap6.damage(60,null,'burst')*10)/10,52.2);
  assert.equal(subEffectScale(max,'mist'),.5);
});

test('1130 object interaction matrix applies per-attack factors and Object Shredder exactly once',()=>{
  const actor={pos:{x:0,y:0,z:0},owner:'peer',weapon:{kind:'shooter'},s3:{modifiers:{}}};
  assert.equal(objectDamageScale(actor,'booyahBomb'),.7);
  for(const cause of ['shooter','shot','weapon'])assert.equal(objectDamageScale(actor,'booyahBomb',cause),.7,'native label retains source Shooter row');
  assert.equal(objectDamageScale({owner:actor,pos:{},s3Sub:{id:'bomb'}},'splashWall'),2);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3Sub:{id:'fizzy'}},'splashWall'),3.6);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3Sub:{id:'torpedo'}},'splashWall'),4);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3AllSpecial:'crabTank',type:'blast'},'splashWall'),1);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3AllSpecial:'crabTank',s3AllSpecialMode:'blast'},'splashWall'),3);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3SpecialWeapon:{id:'trizooka'}},'splashWall'),6);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3SpecialWeapon:{id:'inkVac'}},'splashWall'),0);
  assert.equal(objectDamageScale({owner:actor,pos:{},wid:'inkjet'},'booyahBomb'),1.3334);
  assert.equal(objectDamageScale({owner:actor,pos:{},wid:'inkjet'},'booyahBomb','Jetpack_BombCore'),2);
  actor.s3.loadout=[{},{},{main:'objectShredder'}];
  assert.equal(objectDamageScale(actor,'booyahBomb'),.7*1.1);
  assert.equal(objectDamageScale({owner:actor,pos:{},s3Sub:{id:'bomb'}},'splashWall'),3);
  assert.equal(objectDamageScale(actor,'sprinkler'),10);
  assert.equal(objectDamageScale(actor,'beakon'),10);
  assert.equal(objectDamageScale(actor,'superChump'),2);
});
test('all 115 source attack rows and nine object columns survive the runtime mapping',()=>{
  const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-object-rates-1130.json',import.meta.url)));
  const targets=['splashWall','sprinkler','beakon','torpedo','waveBreaker','superChump','booyahBomb','crabTank','tripleSplashdown'];
  const actor={weapon:{},s3:{modifiers:{objectShredder:false}}};
  assert.equal(Object.keys(receipt.rows).length,115);
  for(const [row,rates] of Object.entries(receipt.rows))for(let col=0;col<targets.length;col++){
    assert.equal(objectDamageScale(actor,targets[col],row),rates[col],`${row} -> ${receipt.columns[col]}`);
    actor.s3.loadout=[{},{},{main:'objectShredder'}];
    assert.equal(objectDamageScale(actor,targets[col],row),rates[col]*receipt.rows.ObjectEffect_Up[col]);
    actor.s3.loadout[2].main='none';
  }
});
test('catalogue projectile families use the source attack variant instead of a generic family multiplier',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-object-rates-1130.json',import.meta.url))).rows;
  const targets=['splashWall','sprinkler','beakon','torpedo','waveBreaker','superChump','booyahBomb','crabTank','tripleSplashdown'];
  for(const [actor,row,key,charge] of [
    ['WeaponRollerHeavy','RollerSplash_Heavy','vertical',0],
    ['WeaponRollerWide','RollerSplash_Wide','horizontal',0],
    ['WeaponBrushHeavy','BrushSplash_Heavy','brush',0],
    ['WeaponBlasterShort','Blaster_BlasterShort','normal',0],
    ['WeaponShelterCompact','ShelterShot_Compact','pellet',0],
    ['WeaponChargerLight','ChargerFull_Light','normal',1],
    ['WeaponChargerLong','Charger_Long','normal',.5],
    ['WeaponSaberNormal','Saber_ChargeShot','saber-vertical',1],
    ['WeaponShooterFlash','Shooter_FlashRepeat','variable',0],
  ]){
    const record=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor===actor);assert.ok(record,actor);
    const owner={pos:{},weapon:{catalogRecord:record},s3:{modifiers:{objectShredder:false}}};
    const p={owner,pos:{},damage:20,catalog:{r:record,descriptor:{key,charge}}};
    for(let i=0;i<targets.length;i++)assert.equal(objectDamageScale(p,targets[i]),source[row][i],actor+' -> '+targets[i]);
  }
});

test('all 115 authored Bubbler canopy and weak-point cells apply source and gear once',()=>{
  const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/bubbler-object-rates-1130.json',import.meta.url)));
  const actor={weapon:{},s3:{modifiers:{objectShredder:false}}};
  assert.equal(Object.keys(receipt.rows).length,115);
  for(const [row,rates] of Object.entries(receipt.rows))for(const [i,target] of ['bubblerCanopy','bubblerField'].entries()){
    assert.equal(objectDamageScale(actor,target,row),rates[i],row+' -> '+target);
    actor.s3.loadout=[{},{},{main:'objectShredder'}];
    assert.equal(objectDamageScale(actor,target,row),rates[i]*receipt.rows.ObjectEffect_Up[i]);
    actor.s3.loadout[2].main='none';
  }
});
test('all 65 authored main selectors retain their exact default and ExtraInfo rows',()=>{
  const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-attack-selectors-1130.json',import.meta.url)));
  assert.equal(Object.keys(receipt.selectors).length,65);
  for(const r of MAIN_WEAPON_CATALOG.records){
    const [fallback,extra]=receipt.selectors[r.sourceRow];
    for(const [phase,type,key,charge] of [
      ['Normal','shot','normal',0],['ExtraBombCore','area','normal',0],
      ['FullCharge','shot','normal',1],['RollerCore',r.family==='brush'?'brush-body':'roller','normal',0],
      ['ShelterCanopy','canopy','normal',0],['ShooterVariableRepeat','shot','variable',0],
      ['SaberShot','shot','normal',0],['SaberChargeShot','shot','saber-vertical',1],
      ['SaberSlash','saber-melee','normal',0],['SaberChargeSlash','saber-melee','saber-vertical',1]]){
      if(!extra[phase])continue;
      assert.equal(catalogueAttackRow({type,catalog:{r,descriptor:{key,charge}}}),extra[phase],r.sourceRow+' '+phase);
    }
    assert.equal(catalogueAttackRow({type:'shot',catalog:{r,descriptor:{key:'normal',charge:0}}}),extra.Normal||extra.SaberShot||fallback,r.sourceRow+' normal/default');
  }
});

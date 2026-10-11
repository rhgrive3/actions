import { objectShredderEquipped } from './object-gear.mjs';
import { MAIN_WEAPON_CATALOG } from './main-weapon-catalog-data.mjs';
// The bomb band is classified before networking/armor, but only the victim's
// authoritative Actor applies equipment. A near hit is never inferred from
// its already armor-reduced amount. Native damage events retain cause 'bomb'.
// Pinned 1130 misc/params.json: these are separate curves, not one universal
// bomb reduction. Keep marking and mist effects separate from HP damage.
const curves = Object.freeze({ bombL:[1,.75,.6], lineMarker:[1,.75,.5], shield:[1,.75,.5], sprinkler:[1,.75,.5], mist:[1,.75,.5], trap:[1,.55,.1], marking:[1,.43,.1] });
export function subEffectScale(victim, kind) {
  const [lo,mid,hi]=curves[kind]||[1,.75,.5];
  const ap=Math.max(0,Math.min(57,Number(victim?.s3?.abilityPoints?.subResistance)||0));
  const p=Math.min(100,3.3*ap-.027*ap*ap)/100;
  const slope=(mid-lo)/(hi-lo);
  return lo+(hi-lo)*(p===0?0:p===1?1:Math.pow(p,Math.log(slope)/Math.log(.5)));
}
export function subMarkScale(victim, kind) { return subEffectScale(victim,kind==='trap'?'trap':'marking'); }
const objectTargets={splashWall:0,sprinkler:1,beakon:2,torpedo:3,waveBreaker:4,superChump:5,booyahBomb:6,crabTank:7,tripleSplashdown:8,bubblerCanopy:9,bubblerField:10};
const attackRows={bomb:'Bomb',suction:'Bomb_Suction',curling:'Bomb_CurlingBullet',burst:'Bomb_DirectHit',autobomb:'Bomb',fizzy:'Bomb_Fizzy',torpedo:'Bomb_TorpedoBullet','torpedo-splash':'Bomb_TorpedoSplashBurst',inkMine:'Bomb_Trap',angleShooter:'MovePainter_Direct',splashWall:'Shield',sprinkler:'Sprinkler',trizooka:'UltraShot',inkjet:'Jetpack_Bullet',storm:'InkStorm',booyahBomb:'NiceBall',ultraStamp:'UltraStamp_Swing',zipcaster:'SuperHook',tentaMissiles:'MultiMissile_Bullet',killerWail:'MicroLaser',inkVac:'BlowerExhale',crabTank:'Default',reefslider:'Skewer',tripleInkstrike:'TripleTornado',superChump:'Bomb',krakenRoyale:'Castle',splattercolorScreen:'Chimney',waveBreaker:'ShockSonar_Wave',tripleSplashdown:'Pogo'};
// Authored selectors from the pinned WeaponInfoMain receipt; Normal is an
// ExtraInfo selector and is not necessarily the weapon's default row.
const mainAttackSelectors = {"Shooter_Short_00":["Shooter_Short",{}],"Shooter_First_00":["Shooter_First",{}],"Shooter_Precision_00":["Shooter_Precision",{}],"Shooter_Blaze_00":["Shooter_Blaze",{}],"Shooter_Normal_00":["Shooter",{}],"Shooter_Gravity_00":["Shooter_Gravity",{}],"Shooter_QuickMiddle_00":["Shooter",{}],"Shooter_Expert_00":["Shooter_Expert",{}],"Shooter_Heavy_00":["Shooter_Heavy",{}],"Shooter_Long_00":["Shooter_Long",{}],"Shooter_QuickLong_00":["Shooter",{}],"Blaster_Short_00":["Blaster_BlasterShort",{}],"Blaster_Middle_00":["Default",{"Normal":"Blaster_KillOneShot","ExtraBombCore":"Blaster_BlasterMiddle","BlasterWeakBlast":"Blaster_BlasterMiddle"}],"Blaster_Long_00":["Default",{"Normal":"Blaster_KillOneShot","ExtraBombCore":"Blaster","BlasterWeakBlast":"Blaster"}],"Blaster_LightShort_00":["Blaster_BlasterLightShort",{}],"Blaster_Light_00":["Blaster",{}],"Blaster_LightLong_00":["Blaster",{}],"Blaster_Precision_00":["Default",{"Normal":"Blaster_KillOneShot","ExtraBombCore":"Blaster_BlasterMiddle","BlasterWeakBlast":"Blaster_BlasterMiddle"}],"Shooter_TripleQuick_00":["Shooter_TripleQuick",{}],"Shooter_TripleMiddle_00":["Shooter_TripleMiddle",{}],"Shooter_Flash_00":["Shooter",{"Normal":"Shooter_Flash","ShooterVariableRepeat":"Shooter_FlashRepeat"}],"Roller_Compact_00":["Default",{"Normal":"RollerSplash_Compact","RollerCore":"RollerCore"}],"Roller_Normal_00":["Default",{"Normal":"RollerSplash","RollerCore":"RollerCore"}],"Roller_Heavy_00":["Default",{"Normal":"RollerSplash_Heavy","RollerCore":"RollerCore"}],"Roller_Hunter_00":["Default",{"Normal":"RollerSplash_Hunter","RollerCore":"RollerCore"}],"Roller_Wide_00":["Default",{"Normal":"RollerSplash_Wide","RollerCore":"RollerCore"}],"Brush_Mini_00":["Default",{"Normal":"BrushSplash","RollerCore":"BrushCore"}],"Brush_Normal_00":["Default",{"Normal":"BrushSplash","RollerCore":"BrushCore"}],"Brush_Heavy_00":["Default",{"Normal":"BrushSplash_Heavy","RollerCore":"BrushCore"}],"Charger_Quick_00":["Default",{"Normal":"Charger","FullCharge":"ChargerFull"}],"Charger_Normal_00":["Default",{"Normal":"Charger","FullCharge":"ChargerFull"}],"Charger_NormalScope_00":["Default",{"Normal":"Charger","FullCharge":"ChargerFull"}],"Charger_Long_00":["Default",{"Normal":"Charger_Long","FullCharge":"ChargerFull_Long"}],"Charger_LongScope_00":["Default",{"Normal":"Charger_Long","FullCharge":"ChargerFull_Long"}],"Charger_Light_00":["Default",{"Normal":"Charger_Light","FullCharge":"ChargerFull_Light"}],"Charger_Keeper_00":["Default",{"Normal":"Charger","FullCharge":"ChargerFull"}],"Charger_Pencil_00":["Default",{"Normal":"Charger_Light","FullCharge":"ChargerFull_Light"}],"Slosher_Strong_00":["Slosher",{}],"Slosher_Diffusion_00":["Slosher",{}],"Slosher_Launcher_00":["Slosher",{}],"Slosher_Bathtub_00":["Slosher_Bathtub",{}],"Slosher_Washtub_00":["Slosher_Washtub",{"ExtraBombCore":"Slosher_WashtubBombCore"}],"Slosher_Double_00":["Slosher",{}],"Spinner_Quick_00":["Spinner",{}],"Spinner_Standard_00":["Spinner",{}],"Spinner_Hyper_00":["Spinner",{}],"Spinner_Downpour_00":["Spinner",{}],"Spinner_Serein_00":["Spinner",{}],"Spinner_HyperShort_00":["Spinner",{}],"Maneuver_Short_00":["Maneuver_Short",{}],"Maneuver_Normal_00":["Maneuver",{}],"Maneuver_Gallon_00":["Maneuver",{}],"Maneuver_Dual_00":["Maneuver",{}],"Maneuver_Stepper_00":["Maneuver",{}],"Maneuver_Long_00":["Maneuver",{}],"Shelter_Normal_00":["Default",{"Normal":"ShelterShot","ShelterCanopy":"ShelterCanopy"}],"Shelter_Wide_00":["Default",{"Normal":"ShelterShot_Wide","ShelterCanopy":"ShelterCanopy_Wide"}],"Shelter_Compact_00":["Default",{"Normal":"ShelterShot_Compact","ShelterCanopy":"ShelterCanopy_Compact"}],"Shelter_Focus_00":["Default",{"Normal":"ShelterShot","ShelterCanopy":"ShelterCanopy"}],"Stringer_Normal_00":["Stringer",{}],"Stringer_Short_00":["Stringer_Short",{}],"Stringer_Explosion_00":["Stringer",{}],"Saber_Normal_00":["Saber",{"SaberShot":"Saber_Shot","SaberChargeShot":"Saber_ChargeShot","SaberSlash":"Saber_Slash","SaberChargeSlash":"Saber_ChargeSlash"}],"Saber_Lite_00":["Saber",{"SaberShot":"Saber_Shot","SaberChargeShot":"Saber_ChargeShot","SaberSlash":"Saber_Slash","SaberChargeSlash":"Saber_ChargeSlash"}],"Saber_Heavy_00":["Saber",{"SaberShot":"Saber_Shot","SaberChargeShot":"Saber_ChargeShot","SaberSlash":"Saber_Slash","SaberChargeSlash":"Saber_ChargeSlash"}]};
export function catalogueAttackRow(subject,weapon=subject?.s3Weapon||subject?.owner?.weapon||subject?.weapon) {
  const record=subject?.catalog?.r||weapon?.catalogRecord;if(!record)return null;
  const selected=mainAttackSelectors[record.sourceRow];if(!selected)return null;
  const [fallback,extra]=selected,mode=subject?.catalog?.descriptor||{};
  let phase='Normal';
  if(subject?.type==='area')phase='ExtraBombCore';
  else if(subject?.type==='roller'||subject?.type==='brush-body')phase='RollerCore';
  else if(record.family==='charger'&&mode.charge>=1)phase='FullCharge';
  else if(subject?.type==='canopy')phase='ShelterCanopy';
  else if(record.family==='splatana')phase=subject?.type==='saber-melee'?(mode.key==='saber-vertical'?'SaberChargeSlash':'SaberSlash'):(mode.key==='saber-vertical'?'SaberChargeShot':'SaberShot');
  else if(mode.key==='variable')phase='ShooterVariableRepeat';
  return extra[phase]||fallback;
}
export function objectDamageRow(subject,cause=null) {
  const owner=subject?.owner&&typeof subject.owner==='object'&&subject?.pos?subject.owner:subject;
  const weapon=subject?.s3Weapon||owner?.weapon||{};
  const id=cause||subject?.s3Sub?.id||subject?.subId||subject?.s3AllSpecial||subject?.s3SpecialWeapon?.id||(attackRows[subject?.wid]?subject.wid:null);
  if(id){
    if(id==='crabTank')return subject?.s3AllSpecialMode==='blast'?'Chariot_Cannon':subject?.s3AllSpecialMode==='roll'?'Chariot_Body':'Default';
    if(id==='ultraStamp'&&subject?.s3AllSpecial)return 'UltraStamp_Throw';
    if(attackRows[id])return attackRows[id];
    // Native weapon IDs and generic hit labels select the equipped main row.
    // Explicit authored rows (including inherited defaults absent from CellList)
    // keep their source identity rather than masquerading as a weapon ID.
    if(objectRates.has(id)||typeof id==='string'&&/^[A-Z]/.test(id))return id;
  }
  return catalogueAttackRow(subject,weapon)||({shooter:'Shooter',dualies:'Maneuver',splatling:'Spinner',charger:'Charger',blaster:'Blaster',roller:'RollerSplash',slosher:'Slosher',brush:'BrushSplash',brella:'ShelterShot',stringer:'Stringer',splatana:'Saber_Shot'})[weapon.behaviorKind||weapon.kind]||'Default';
}
export function objectDamageScale(subject,target,cause=null) {
  const col=objectTargets[target];if(col===undefined)return 1;
  const owner=subject?.owner&&typeof subject.owner==='object'&&subject?.pos?subject.owner:subject;
  return (objectRates.get(objectDamageRow(subject,cause))?.[col]??1)*(objectShredderEquipped(owner)?objectRates.get('ObjectEffect_Up')[col]:1);
}
// Preserve attack phase across victim-owned native HP delivery and retries.
// This is an enum, never a sender-supplied multiplier; victim equipment still
// owns the final armor calculation. The ordinary weapon/group fields stay intact.
const wireObjectCauses={inkjet:['Jetpack_Bullet','Jetpack_BombCore','Jetpack_Jet'],inkVac:['BlowerExhale','BlowerExhale_BombCore'],tentaMissiles:['MultiMissile_Bullet','MultiMissile_BombCore'],ultraStamp:['UltraStamp_Swing','UltraStamp_Throw','UltraStamp_Throw_BombCore'],crabTank:['Default','Chariot_Cannon','Chariot_Body']};
const mainCauseCache=new Map();
function validWireCause(weapon,cause){
  if(Array.isArray(wireObjectCauses[weapon]))return wireObjectCauses[weapon].includes(cause);
  if(!mainCauseCache.has(weapon)){
    const r=MAIN_WEAPON_CATALOG.records.find(r=>r.id===weapon),rows=new Set();
    if(r)for(const type of ['shot','roller','brush-body','canopy','saber-melee','area'])for(const charge of [0,1])for(const key of ['variable','saber-vertical','other']){
      const row=catalogueAttackRow({type,catalog:{r,descriptor:{charge,key}}},{});if(row)rows.add(row);
    }
    mainCauseCache.set(weapon,rows);
  }
  return mainCauseCache.get(weapon).has(cause);
}
export function withObjectDamageCause(attack,callback,cause=catalogueAttackRow(attack)){
  const owner=attack?.owner&&typeof attack.owner==='object'?attack.owner:attack;
  if(!owner||!cause)return callback();
  const previous=owner._s3AllSpecialDamageCause;owner._s3AllSpecialDamageCause=cause;
  try{return callback();}finally{if(previous===undefined)delete owner._s3AllSpecialDamageCause;else owner._s3AllSpecialDamageCause=previous;}
}
export function installObjectDamageCause({NetMatch,Projectiles}) {
  const proto=NetMatch?.prototype,tag=Symbol.for('inkwave.s3.object-hit-cause.v1');
  if(!proto||proto[tag]||typeof proto.sendHit!=='function'||typeof proto._hit!=='function')return;
  Object.defineProperty(proto,tag,{value:true});
  const step=Projectiles?.prototype?._step,apply=Projectiles?.prototype?.applyHit;
  if(step)Projectiles.prototype._step=function(p,...args){
    if(p?.s3SpecialWeapon||p?.s3AllSpecial||p?.s3Sub||p?.wid!==p?.owner?.weapon?.id)return step.call(this,p,...args);
    return withObjectDamageCause(p,()=>step.call(this,p,...args));
  };
  if(apply)Projectiles.prototype.applyHit=function(attacker,victim,amount,weapon,...args){
    if(weapon==='roller'&&attacker?.weaponRunner?.rolling&&!attacker._s3AllSpecialDamageCause)
      return withObjectDamageCause(attacker,()=>apply.call(this,attacker,victim,amount,weapon,...args),'RollerCore');
    return apply.call(this,attacker,victim,amount,weapon,...args);
  };
  const send=proto.sendHit,receive=proto._hit;
  proto.sendHit=function(attacker,victim,amount,weapon,...args){
    const cause=attacker?._s3AllSpecialDamageCause,transport=this.s?.tr,original=transport?.sendTo;
    if(!validWireCause(weapon,cause)||typeof original!=='function')return send.call(this,attacker,victim,amount,weapon,...args);
    transport.sendTo=function(peer,message,...rest){
      if(message?.k==='hit'&&message.a===attacker.nid&&message.w===weapon)message.oc=cause;
      return original.call(this,peer,message,...rest);
    };
    try{return send.call(this,attacker,victim,amount,weapon,...args);}
    finally{transport.sendTo=original;}
  };
  proto._hit=function(packet,from,...args){
    if(packet?.oc===undefined)return receive.call(this,packet,from,...args);
    const attacker=this.byNid?.get(packet.a);
    if(!validWireCause(packet.w,packet.oc)||!attacker||attacker.owner!==from||
      attacker.weapon?.special!==packet.w&&attacker.specialActive?.id!==packet.w&&attacker.weapon?.id!==packet.w)return;
    const previous=attacker._s3AllSpecialDamageCause;
    attacker._s3AllSpecialDamageCause=packet.oc;
    try{return receive.call(this,packet,from,...args);}
    finally{attacker._s3AllSpecialDamageCause=previous;}
  };
}
export function finalSubResistanceDamage(victim, amount) {
  if (!victim.s3SubResistanceHit || victim[Symbol.for('inkwave.s3.final-damage.v1')]) return amount;
  // PR321 owns this final boundary when present. Standalone main only rounds
  // this newly modified sub hit, after all defensive multipliers/armor.
  return Math.floor(Math.max(0, amount) * 10 + 1e-9) / 10;
}
export function subResistanceEligible(amount, source) {
  const bomb = ['bomb','splat-bomb-far','burst','autobomb','fizzy','torpedo','torpedo-splash','inkMine','angleShooter','splashWall','sprinkler'].includes(source);
  return bomb && amount < 100;
}
export function installSubResistance({ Actor }) {
  const damage = Actor.prototype.damage;
  Actor.prototype.damage = function (amount, attacker, source = 'weapon') {
    // #1073: kit composition can resolve Suction/Curling damage from their own
    // bands while an older source tag still reflects Splat Bomb's 3.6 radius.
    // Classify at the victim-authoritative pre-armor damage boundary instead:
    // S3 Sub Resistance applies to eligible sub blasts below 100 damage only.
    const bomb = source === 'bomb' || source === 'splat-bomb-far';
    const weak = subResistanceEligible(amount, source), previous = this.s3SubResistanceHit;
    this.s3SubResistanceHit = weak;
    if (weak) amount *= ['burst','fizzy'].includes(source) ? subEffectScale(this,'bombL') :
      source==='angleShooter' ? subEffectScale(this,'lineMarker') :
      source==='splashWall'||source==='sprinkler' ? subEffectScale(this,source==='splashWall'?'shield':'sprinkler') :
      this.s3?.modifiers?.subResistance ?? 1;
    try { return damage.call(this, amount, attacker, bomb ? 'bomb' : source); }
    finally { this.s3SubResistanceHit = previous; }
  };
}

// Generated 1130 damage-rate cells for the catalogue object targets.
// SHA256 eb536e1c2cf4bb280c2898fdd9882fe3eb6c8f7a47c5302f0ff7fe755b6ef64a
const objectRates=new Map();
const rateAlphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const rateValues=[0.0,0.25,0.455,0.5,0.545,0.6,0.65,0.7,0.8,0.9,0.91,1,1.1,1.2,1.25,1.3,1.3334,1.35,1.364,1.4,1.43,1.5,1.5556,1.56,1.6,1.636,1.8,1.82,1.98,2.0,2.0835,2.182,2.2,2.4,2.5,2.6,2.64,2.8,2.86,2.88,3.0,3.2,3.273,3.5,3.6,3.64,3.75,4.0,4.5,4.8,5.0,5.6,5.76,6.0,7.28,7.5,10.0,20.0,100.0];
const rateVectors="WXXBTBBBBTXXBTBBBBpppBpBlbB0BBB0BB0BBBBBBBBBBBww3BBBBBTTT5BBLBBiff5QBXOBleeBTBYTBBwwBBBBBBQQQBQBJJBSQQBQBJJBtwwBlBolBOTTBOB98BWTTBWBHFBTTTBTBFFBwww0BBBBBeeeBeBTLBewwBBBBBBTTTBTBBBB00000B00BeBB1eBTYBbbb3bBThBbbbBbBGUBbbb3bBBYBCBBBBB5BBBBBBBB5BBXBBBXBBLBTTT3TBLLBeBBBeBLlBLuuFETCFCYoo3YBkjBaddBDBKJBXddBDBOOBXddBDBJJBnqqTXBcbBnnnnXBRZBDDDDDB26BXXXXXBAFB0000BB0YBBwwooBBBBXXXXXBNFBXXXXXBFFB0BBBBBkBBwwwBTBBTBCBBBBB7BBCBBBCB7BBCBBBCB5BBBBBBBB7BBBDDBBB7BBBDDBBB6BBoooBoBtsBTYYBBBBBBYYYBEBBBBTllBBBBBBYooBEBBBBBBB3BBBBBMMMBMBBBBTTTTTBTeBrBBBBBTQBveeBvBQmBVPP4VBIgB";
const rateNames="0Blaster|17_BlasterLightShort|0FMiddle|1FShort|08KillOneShot|12owerExhale|3C_BombCore|26Inhale|41omb|64Flower|44_CurlingBullet|55DirectHit|65Fizzy|75Suction|65TorpedoBullet|8CSplashBurst|46rap|61rushCore|95Splash|BB_Heavy|A0CannonMissile|42stle|C1harger|F7Full|FB_Light|DDong|E7_Light|D9ong|E4iot_Body|G8Cannon|H2imney|I1oopEnemyRush|49SakeJaw|4DRopeBlast|4DSaucerFall|4DTamaireBombDamage|4DlienBomberBlast|4DrocketBlast|40Default|40EnemyFlyingHohei_BombCore|40GachihokoTimeUpBurst|49_BombCore|JBullet|41eyser|46Online|41oldenIkuraAttack|40InkStorm|L8Rain|K0Jetpack_BombCore|M9ullet|N8Coop|48Jet|O0Maneuver|Q8_Short|PAideStep_BombCore|61icroLaser|R2ssionSalmonBuddy|41ovePainter_Burst|4CDirect|41ultiMissile_BombCore|SEullet|S0NiceBall|T0ObjectEffect_Up|U0Pogo|V0RollerCore|96Splash|WC_Compact|WDHeavy|XEunter|YDWide|Z0Saber_ChargeShot|aDlash|bH_Penetrate|b6Shot|a7lash|c2kerocketBullet|d1helterCanopy|eD_Compact|eEWide|e7Shot|gB_Compact|fCWide|g2ield|h2ockSonar_Wave|i3oter|m7_Blaze|j8Expert|Q8First|j9lash|kDRepeat|k8Gravity|k8Heavy|l8Long|Q8Precision|m8Short|j8TripleMiddle|nEQuick|o1kewer|p6_Body|p1losher|r7_Bathtub|q9ear|r8Washtub|tFBombCore|s1pinner|Q2rinkler|u1tringer|F8_Short|v1uperHook|65Landing|60TripleTornado|w0UltraShot|x6tamp_Swing|yBThrow|zG_BombCore|z";
const bubblerRateCells=[2.1,2.1,2.1,2.1,1.9,1.9,2.1,2.1,1.9,1.9,0.0,0.0,4.2,2.1,1.0,1.0,2.0,0.5,1.0,1.0,1.0,1.0,2.0,1.5,3.6,0.9,2.0,0.5,4.0,1.0,1.0,1.0,2.0,2.0,1.0,1.0,1.8,1.8,1.8,1.8,1.0,1.0,2.5,2.5,2.0,2.0,2.0,1.5,2.0,2.0,2.3,1.725,2.0,2.0,2.0,2.0,0.0,1.0,3.0,1.5,1,1,1,1,1,1,1.0,1.0,1,1,1,1,1,1,1,1,1.0,1.0,1.0,1.0,1.0,1.0,2.0,1.5,1.0,0.75,1.0,1.0,1,1,1.0,1.0,5.0,5.0,0.0,0.0,1.82,1.365,1.82,1.365,1.0,1.0,2.8,2.8,1.0,1.0,1.0,1.0,2.0,0.5,2.4,2.4,1.0,1.0,1.0,1.0,1.0,1.0,0.5,0.375,0.5,0.375,2.0,2.0,1.1,1.1,2.5,2.5,1.0,1.0,1.8,1.8,1.8,1.8,1.8,1.35,1.8,1.35,3.6,3.6,4.8,2.4,1.2,0.9,1.2,0.9,4.8,3.6,2.4,1.8,0.0,0.0,2.4,2.4,2.4,2.4,2.4,2.4,2.4,2.4,2.4,2.4,2.4,2.4,0.2,0.2,8.0,8.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.1,1.1,1.1,1.1,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.1,1.1,1.2,1.2,1.15,1.15,5.0,5.0,5.0,5.0,2.4,2.4,2.0,2.0,2.4,2.4,3.6,0.9,3.2,0.8,1.0,1.0,0.6,0.6,2.0,2.0,1.5556,1.5556,2.0,2.0,2.0,2.0,1.0,1.0,1.3,0.975,1.5,1.5,1.909,1.4318,1.909,1.4318];
let previousRateName="",bubblerRateIndex=0;
for(let i=0;i<rateNames.length;){
  const prefix=rateAlphabet.indexOf(rateNames[i++]), end=rateNames.indexOf("|",i);
  const name=previousRateName.slice(0,prefix)+rateNames.slice(i,end);
  const start=rateAlphabet.indexOf(rateNames[end+1])*9;
  objectRates.set(name,[...Array.from(rateVectors.slice(start,start+9),c=>rateValues[rateAlphabet.indexOf(c)]),bubblerRateCells[bubblerRateIndex++],bubblerRateCells[bubblerRateIndex++]]);
  previousRateName=name;i=end+2;
}

// Original INKWAVE sound-design coefficients, NOT extracted Nintendo samples or SLINK values.
// Only IDs, names, family and gameplay timing come from the pinned 11.3.0 catalog.
import { MAIN_WEAPON_CATALOG } from '../main-weapon-catalog-data.mjs';
import { VARIANT_BASE_WEAPON } from '../alternate-weapon-kits-data.mjs';
// Only MAIN sound identity is shared. Never collapse sub/special kit IDs or
// mutate the actor's registered alternate weapon, network ID, or gameplay data.
export const mainAudioSourceId = id => typeof id === 'string' && Object.hasOwn(VARIANT_BASE_WEAPON,id)
  ? VARIANT_BASE_WEAPON[id] : id;
export const AUDIO_PROVENANCE = Object.freeze({ schema: 1, target: '11.3.0',
  soundDesign: 'original-parametric-with-S1-community-feature-guidance-and-S3-gameplay-structured-original', retailComparison: 'unverified-no-isolated-reference',
  sourceCommit: MAIN_WEAPON_CATALOG.sourceCommit, sampleLicense: 'generated-from-measured-metadata-no-third-party-samples-embedded' });
// f0, decay seconds, noise cutoff, noise mix, liquid formant, liquid grains,
// mechanism Hz, mechanism delay ms, mechanism mix, modal ratio, modal mix, saturation.
// Every row changes envelope, excitation and resonances, not just playback pitch.
const rows = {
  WeaponShooterShort:       [190,.055,3400,.62,720,5,2200,9,.18,2.61,.17,1.8],
  WeaponShooterFirst:       [310,.045,5200,.71,1150,7,3200,4,.10,3.21,.10,1.3],
  WeaponShooterPrecision:   [460,.035,6700,.49,1400,3,3900,7,.25,2.07,.16,1.5],
  WeaponShooterBlaze:       [620,.029,8100,.82,1700,9,5100,3,.12,4.13,.06,1.2],
  WeaponShooterNormal:      [255,.061,4100,.57,930,5,2650,12,.22,2.43,.20,1.8],
  WeaponShooterGravity:     [145,.085,2900,.47,600,4,1780,21,.28,3.08,.24,2.2],
  WeaponShooterQuickMiddle: [410,.040,5900,.53,1300,4,4100,6,.26,2.81,.13,1.4],
  WeaponShooterExpert:      [210,.074,3800,.40,780,3,2900,18,.32,1.73,.23,2.0],
  WeaponShooterHeavy:       [110,.111,2450,.48,490,6,1300,29,.34,2.32,.28,2.4],
  WeaponShooterLong:        [176,.092,3200,.42,810,4,2100,24,.25,3.73,.17,1.9],
  WeaponShooterQuickLong:   [370,.056,6100,.63,1520,7,4300,10,.14,2.18,.12,1.3],
  WeaponBlasterShort:       [90,.136,2400,.78,420,9,1350,50,.24,1.63,.23,2.5],
  WeaponBlasterMiddle:      [105,.145,2800,.71,510,7,1680,63,.31,2.41,.20,2.4],
  WeaponBlasterLong:        [75,.179,2200,.68,350,5,1110,78,.39,2.73,.30,2.8],
  WeaponBlasterLightShort:  [240,.067,5700,.78,1070,6,3700,14,.28,3.31,.18,1.9],
  WeaponBlasterLight:       [194,.094,4600,.57,920,5,3100,31,.33,2.86,.21,2.1],
  WeaponBlasterLightLong:   [165,.110,4000,.61,740,4,2520,38,.38,3.17,.22,2.0],
  WeaponBlasterPrecision:   [120,.128,3500,.52,640,8,2300,45,.43,1.89,.27,2.6],
  WeaponShooterTripleQuick: [390,.041,4900,.43,1100,3,3800,8,.30,2.22,.23,1.5],
  WeaponShooterTripleMiddle:[230,.068,3500,.40,670,4,2180,16,.35,3.61,.26,2.1],
  WeaponShooterFlash:       [330,.064,5100,.35,1280,3,4700,19,.35,1.47,.29,1.9],
  WeaponRollerCompact:     [275,.116,6400,.71,1080,12,3200,22,.13,2.11,.12,1.2],
  WeaponRollerNormal:      [160,.165,4200,.68,650,14,1700,36,.19,2.92,.15,1.5],
  WeaponRollerHeavy:       [76,.250,2650,.81,330,18,920,80,.34,1.69,.28,2.0],
  WeaponRollerHunter:      [122,.194,3600,.58,570,13,1940,52,.28,3.42,.23,1.7],
  WeaponRollerWide:        [135,.200,5100,.88,750,22,1400,42,.16,2.17,.12,1.4],
  WeaponBrushMini:         [500,.065,8800,.84,1850,9,5300,4,.09,3.81,.06,1.1],
  WeaponBrushNormal:       [310,.098,6700,.76,1270,12,3150,9,.14,2.71,.11,1.4],
  WeaponBrushHeavy:        [170,.148,4600,.85,780,16,1820,21,.24,3.13,.16,1.7],
  WeaponChargerQuick:      [650,.103,5100,.26,1800,3,3600,10,.37,1.51,.38,1.5],
  WeaponChargerNormal:     [480,.162,3800,.31,1390,4,2800,20,.40,2.01,.44,1.7],
  WeaponChargerNormalScope:[480,.163,3900,.31,1390,4,3900,31,.18,2.03,.44,1.7],
  WeaponChargerLong:       [245,.225,2900,.36,820,6,1890,37,.49,1.77,.51,2.1],
  WeaponChargerLongScope:  [245,.227,3050,.35,820,6,3250,43,.22,1.79,.51,2.1],
  WeaponChargerLight:      [960,.052,7400,.20,2200,2,4100,6,.44,2.67,.33,1.2],
  WeaponChargerKeeper:     [360,.196,3250,.51,1050,9,2350,44,.27,3.17,.34,1.6],
  WeaponChargerPencil:     [1250,.074,6500,.21,2350,2,6200,13,.51,1.39,.40,1.3],
  WeaponSlosherStrong:     [155,.170,3300,.59,580,16,1550,36,.13,2.36,.18,1.5],
  WeaponSlosherDiffusion:  [240,.114,5900,.71,1090,21,2450,18,.15,3.14,.12,1.3],
  WeaponSlosherLauncher:   [190,.214,3800,.55,740,11,2050,50,.35,1.63,.31,2.0],
  WeaponSlosherBathtub:    [480,.230,2200,.28,1200,4,1700,30,.12,2.13,.47,1.2],
  WeaponSlosherWashtub:    [70,.241,2900,.79,380,12,1250,73,.39,2.86,.33,2.7],
  WeaponSlosherDouble:     [122,.199,4200,.64,670,19,1870,41,.28,3.63,.22,1.8],
  WeaponSpinnerQuick:     [485,.030,6100,.58,1420,3,4150,4,.28,2.76,.16,1.4],
  WeaponSpinnerStandard:  [320,.044,4650,.56,1050,4,3100,7,.31,3.27,.18,1.6],
  WeaponSpinnerHyper:     [153,.063,3500,.64,690,5,2080,11,.41,1.93,.24,2.1],
  WeaponSpinnerDownpour:  [530,.033,6800,.42,1690,3,5300,5,.37,1.67,.27,1.5],
  WeaponSpinnerSerein:    [420,.051,4200,.47,1280,5,2890,12,.33,2.19,.29,1.7],
  WeaponSpinnerHyperShort:[380,.038,5600,.50,1530,4,4570,6,.43,3.07,.19,1.9],
  WeaponManeuverShort:    [690,.027,7600,.59,1920,4,5900,3,.19,2.37,.12,1.3],
  WeaponManeuverNormal:   [445,.042,5500,.51,1310,4,3830,8,.24,2.93,.20,1.5],
  WeaponManeuverGallon:   [205,.079,3200,.40,720,5,1970,18,.38,1.81,.28,2.1],
  WeaponManeuverDual:     [395,.060,4400,.46,1110,3,3280,14,.29,3.73,.17,1.6],
  WeaponManeuverStepper:  [530,.036,6300,.64,1520,6,4670,5,.27,2.49,.15,1.7],
  WeaponManeuverLong:     [270,.073,3750,.37,920,4,2410,23,.39,1.57,.31,2.0],
  WeaponShelterNormal:   [140,.134,5700,.78,870,11,3150,32,.31,2.64,.23,2.0],
  WeaponShelterWide:     [65,.226,3750,.83,440,17,1370,71,.49,1.71,.30,2.5],
  WeaponShelterCompact:  [300,.096,6300,.68,1240,7,4370,19,.24,3.23,.16,1.5],
  WeaponShelterFocus:    [210,.119,4700,.59,1000,8,2760,28,.38,2.17,.27,1.8],
  WeaponStringerNormal:  [390,.153,4100,.32,1190,5,2870,12,.45,1.498,.53,1.4],
  WeaponStringerShort:   [740,.096,6600,.28,1930,4,4780,6,.39,2.002,.39,1.2],
  WeaponStringerExplosion:[210,.221,3300,.44,810,8,1960,25,.53,1.334,.59,1.8],
  WeaponSaberNormal:     [140,.180,5900,.74,820,10,3480,27,.43,2.57,.29,2.0],
  WeaponSaberLite:       [370,.110,8700,.63,1620,6,5700,9,.28,3.91,.19,1.4],
  WeaponSaberHeavy:      [90,.230,4500,.69,570,14,2320,44,.51,1.43,.34,2.4],
};
const extraEvents = {
  shooter:['fire','fire_alt','impact'], blaster:['fire','fire_alt','explosion','impact'],
  roller:['fire','fire_vertical','windup','roll','impact'], brush:['fire','windup','roll','impact'],
  charger:['fire','fire_full','charge','ready','release','impact','scope'],
  splatling:['fire','fire_full','fire_alt','charge','ready','release','windup','spin','impact'],
  dualies:['fire','fire_left','fire_alt','dodge','impact'],
  slosher:['fire','windup','impact','explosion'],
  brella:['fire','open','close','purge','shield_hit','break','impact'],
  stringer:['fire','fire_full','charge','ready','release','impact','explosion'],
  splatana:['fire','fire_full','charge','ready','release','windup','impact'],
};
export const WEAPON_AUDIO = Object.freeze(Object.fromEntries(MAIN_WEAPON_CATALOG.records.map((r,index)=>{
  const row=rows[r.sourceActor]; if(!row) throw new Error('Missing sound recipe '+r.sourceActor);
  return [r.id,Object.freeze({id:r.id,sourceActor:r.sourceActor,names:r.names,family:r.family,
    coefficients:Object.freeze(row),seed:0x51a7+index*7919,events:Object.freeze(r.sourceActor==='WeaponBlasterPrecision'?[...extraEvents[r.family],'mode_change'] : extraEvents[r.family]),
    reference:AUDIO_PROVENANCE, scope:!!r.sourceActor.endsWith('Scope')})];
})));
export const LOOP_EVENTS = new Set(['charge','roll','spin']);
export function fireArticulation(recipe,event={}) {
  const q=Number.isFinite(event.charge)?event.charge:0;
  // The 2022 Dualie Squelchers have a distinct Union (post-dodge) sample.
  // Other dualies have no verified turret MP3: keep their normal recorded shot.
  if(['WeaponManeuverDual','WeaponManeuverLong'].includes(recipe.sourceActor)&&event.mode==='turret')return 'fire_alt';
  if(recipe.family==='dualies'&&event.hand===1)return 'fire_left';
  if(recipe.family==='roller'&&event.vertical)return 'fire_vertical';
  if(recipe.events.includes('fire_full')&&q>=1-1e-6)return 'fire_full';
  if(recipe.events.includes('fire_alt')&&['variable','turret','blaster-jump'].includes(event.mode))return 'fire_alt';
  return 'fire';
}

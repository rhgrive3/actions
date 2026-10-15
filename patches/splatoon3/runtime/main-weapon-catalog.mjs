import { showDetachedCanopy, retireDetachedCanopy } from './brella-canopy-visual.mjs';
import { catalogSplashDropSpec, catalogPaintEllipse, catalogFractionalSplashCount } from './catalog-splash-paint.mjs';
import { spawnSplashDrop, SPLASH_DROP_AIR_RESIST } from './blaster-flight-paint.mjs';
import { resolveWeaponGearCurve, weaponWeight } from './weapon-weight.mjs';
import { validateCanonicalKits } from './canonical-kits.mjs';
import { CANONICAL_KITS } from './canonical-kits-data.mjs';

import { catalogueAttackRow, withObjectDamageCause } from './sub-resistance.mjs';
import { MAIN_WEAPON_CATALOG } from './main-weapon-catalog-data.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { hurtboxRadius, hurtboxHeight } from './player-hurtbox.mjs';
import { ShooterAccuracy } from './shooter-accuracy.mjs';
import { withShotBias } from './weapon-accuracy.mjs';
import { spreadWeaponRound, signedBiasSample } from './weapon-edgecases.mjs';
import { advanceShooterNearestSlot } from './shooter-nearest-paint.mjs';
import { rollerSpeedSwerveDegrees } from './weapons-fidelity.mjs';
import { selectRollerFlickVertical, installActorFreefallHooks } from './roller-freefall.mjs';
import { dashTurnBreakActive } from './movement-physics.mjs';
import { catalogVisualSpec, updateCatalogVisual, catalogReboundSeparation, catalogBubbleCanBounce, catalogBubbleRadiusScale } from './projectile-presentation.mjs';
import { installS3ProjectileShapes } from './s3-projectile-shapes.mjs';

// This interpreter owns added MAIN weapons only. Existing seven implementations
// retain their mature owners. Canonical kit identities use the pinned table.
// Models remain separate work. Extracted numbers do not certify Nintendo engine equivalence.
const EPS = 1e-9, HZ = 60, DT = 1 / HZ, RAD = Math.PI / 180;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
function interpolateFields(a,b,q){
  const out={...a,...b};
  for(const key of Object.keys(out))if(Number.isFinite(a?.[key])&&Number.isFinite(b?.[key]))out[key]=lerp(a[key],b[key],q);
  return out;
}
const INSTALLED = Symbol.for('inkwave.main-weapon-catalog.v1');
const RECORDS = new Map(MAIN_WEAPON_CATALOG.records.map(r => [r.id, r]));

// Community 60fps measurements, explicitly v10.0.1, not extracted defaults:
// wikiwiki.jp/splatoon3mix/検証/メインウェポン (Brella table).
const BRELLA_MEASURED = Object.freeze({
  WeaponShelterNormal: { repeat: 29, startup: 10, open: 13, launch: 107, hp: 500, radius: .7 },
  WeaponShelterWide: { repeat: 51, startup: 12, open: 46, launch: 57, hp: 700, radius: 1 },
  WeaponShelterCompact: { repeat: 26, startup: 10, open: 11, launch: Infinity, hp: 200, radius: .7 },
  WeaponShelterFocus: { repeat: 34, startup: 10, open: 11, launch: 27, hp: 150, radius: .7 },
});
// Paint rasterization, omitted simple-bullet defaults and lifetime use the
// established INKWAVE model. These are not relabeled extracted source fields.
export const CATALOG_MODEL_LIMITS = Object.freeze([
  'Sparse defaults: interpreted 60Hz model.',
  'Switch scale/paint parity: unverified.',
  'Brella geometry/damage rates: incomplete.',
  'Wall drips/Slosher spiral: incomplete.',
  'Scope: capability and explicit FOV applied; sparse defaults/transition timing unverified.',
  'Stringer: continuous shot tilt applied; retail tilt-keep/reset and presentation timing unverified.',
  'Model/animation: placeholders.'
]);

function weaponParam(r) {
  const p = r.parameters;
  return p.WeaponParam || p.WeaponSwingParam || p.spl__WeaponShelterShotgunParam ||
    p.spl__WeaponStringerParam?.ChargeParam || p.spl__WeaponSaberParam?.ChargeParam || {};
}
function chargeParam(r) { return weaponParam(r); }
function chargeFrames(r) {
  const p = chargeParam(r);
  return finite(p.ChargeFrameFullCharge, finite(p.ChargeFrame_Second, 60));
}
function inkAt(r, frames) {
  const p = chargeParam(r), q = clamp(frames / chargeFrames(r));
  if (r.family === 'splatling') {
    if(r.sourceActor==='WeaponSpinnerDownpour')return finite(p.InkConsume,.25)*100*q;
    const base=finite(p.RepeatFrame,4),fullRate=finite(r.parameters.WeaponFullChargeParam?.RepeatFrame,base);
    const rounds=Math.floor((shootingFrames(r,frames)+EPS)/(q+EPS>=1?fullRate:base))+1;
    const fullRounds=Math.floor((shootingFrames(r,chargeFrames(r))+EPS)/fullRate)+1;
    return finite(p.InkConsume,.225)*100*Math.min(1,rounds/fullRounds);
  }
  const minF = finite(p.ChargeFrameMinCharge, 8), midF = p.ChargeFrameMidCharge;
  const min = finite(p.InkConsumeMinCharge, .0225), max = finite(p.InkConsumeFullCharge, .18);
  if (midF != null && p.InkConsumeMidCharge != null)
    return 100 * (frames <= midF ? lerp(min, p.InkConsumeMidCharge, clamp((frames-minF)/(midF-minF)))
      : lerp(p.InkConsumeMidCharge, max, clamp((frames-midF)/(chargeFrames(r)-midF))));
  return 100 * lerp(min, max, clamp((frames-minF)/(chargeFrames(r)-minF)));
}
function fundedChargeFrames(r, budget, modifier) {
  const full=chargeFrames(r);
  if(budget+EPS>=inkAt(r,full)*modifier)return full;
  if(budget+EPS<inkAt(r,0)*modifier)return 0;
  let lo=0,hi=full;
  for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(inkAt(r,mid)*modifier<=budget+EPS)lo=mid;else hi=mid;}
  return lo;
}
function stageValue(r, object, stem, frames, fallback = 0) {
  const p = chargeParam(r), minF = finite(p.ChargeFrameMinCharge, 8), fullF = chargeFrames(r);
  const a = finite(object[stem+'Min'], fallback), b = finite(object[stem+'Mid'], a), c = finite(object[stem+'Max'], b);
  const midF = finite(p.ChargeFrameMidCharge, fullF);
  if (object[stem+'Mid'] == null) return lerp(a,c,clamp((frames-minF)/(fullF-minF)));
  return frames <= midF ? lerp(a,b,clamp((frames-minF)/(midF-minF))) : lerp(b,c,clamp((frames-midF)/(fullF-midF)));
}
function shootingFrames(r, frames) {
  const t=chargeParam(r),full=chargeFrames(r),first=finite(t.ChargeFrame_First,48);
  const a=finite(t.MaxShootingFrame_First,80),b=frames+EPS>=full?
    finite(r.parameters.WeaponFullChargeParam?.MaxShootingFrame_Second,finite(t.MaxShootingFrame_Second,160)):finite(t.MaxShootingFrame_Second,160);
  if(r.sourceActor==='WeaponSpinnerDownpour')return b*clamp((frames-8)/(full-8));
  if(r.sourceActor==='WeaponSpinnerSerein'&&frames<=first)return a*clamp((frames-8)/(first-8));
  return frames<=first?a*frames/first:lerp(a,b,(frames-first)/(full-first));
}
function remainingCharge(r,s) {
  const remaining=Math.max(0,(s.streamTime-Math.max(0,s.streamElapsed))*HZ);
  let lo=0,hi=chargeFrames(r);
  for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(shootingFrames(r,mid)<remaining)lo=mid;else hi=mid;}
  return hi;
}
function recordMove(r) {
  return r.parameters.MoveParam || r.parameters.spl__BulletStringerParam?.MoveParam ||
    r.parameters.BulletSaberHorizontalParam?.MoveParam ||
    r.parameters.UnitGroupParam?.Unit?.[0]?.MoveParam || {};
}
function damageMax(r) {
  const p = r.parameters;
  const values = [p.DamageParam?.ValueFullCharge,p.DamageParam?.ValueMax,
    p.spl__BulletShelterShotgunParam?.DamageEffectiveTotalMax,
    p.spl__BulletStringerParam?.DamageParam?.DirectHitDamageMax,
    p.BulletSaberVerticalParam?.DamageParam?.HitDamage,
    p.UnitGroupParam?.Unit?.[0]?.DamageParam?.ValueMax,
    p.SwingUnitGroupParam?.DamageParam?.Inside?.DamageMaxValue,
    p.WideSwingUnitGroupParam?.DamageParam?.Inside?.DamageMaxValue];
  return (values.find(Number.isFinite) ?? 0) / 10;
}
function definition(r, api) {
  const p = r.parameters, t = weaponParam(r), move = recordMove(r), b = BRELLA_MEASURED[r.sourceActor];
  const existing = api.WEAPONS[r.modelKind];
  const charge = ['charger','stringer','splatana','splatling'].includes(r.family);
  const speed = finite(move.SpawnSpeedFullCharge, finite(move.SpawnSpeedMax, finite(move.SpawnSpeed, 1))) * HZ;
  const rate = b?.repeat || finite(t.RepeatFrame, finite(t.SwingFrame, 6));
  const actualRange = finite(move.DistanceFullCharge, finite(p.MainEffectiveRangeUpParam?.BaseDistance, r.matchmakingRange));
  const u = Object.fromEntries((r.ui || []).map(x => [x.Type, clamp(x.Value / 100)]));
  const setting=p.MainWeaponSetting||{};
  const curve=(stem,defaults)=>resolveWeaponGearCurve(setting,stem,defaults);
  const action=p.spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate;
  const inkTankScale=r.sourceActor==='WeaponShooterFirst'?1.1:1;
  return { id:r.id, name:r.names[api.LANG==='ja'?'ja':'en'], referenceNames:r.names, kind:'catalog', behaviorKind:r.family,
    modelKind:r.modelKind, class:{brush:'Brush',brella:'Brella',stringer:'Stringer',splatana:'Splatana'}[r.family] || existing.class,
    scopedCharge:r.family==='charger' && r.parameters.WeaponScopeParam != null,
    catalogRecord:r, weaponWeight:weaponWeight(r.id), sourceMainActor:r.sourceActor, ...CANONICAL_KITS[r.id],
    kitReference:CANONICAL_KITS[r.id].main, kitStatus:'verified-base-kit',
    kitVerifiedSlots:['sub','special'], kitMissingSlots:{},
    blurb:'Main-weapon numerical reference: Splatoon 3 11.3.0. Shared temporary model.',
    range:Math.max(1, actualRange), rangeMax:Math.max(1,actualRange), rangeMin:finite(move.DistanceMinCharge,1),
    matchmakingRange:r.matchmakingRange, damage:damageMax(r), damageMin:finite(p.DamageParam?.ValueMin,0)/10,
    damageMax:damageMax(r), projSpeed:speed, straightTime:finite(move.GoStraightToBrakeStateFrame,4)/HZ,
    fireInterval:Math.max(1,rate)/HZ, chargeTime:charge?chargeFrames(r)/HZ:0,
    moveSpeedFiring:(r.family==='splatana'?finite(p.spl__WeaponSaberParam.SwingParam.WeakSwingMoveVelLimit,.06):finite(t.MoveSpeed, finite(t.SwingMoveSpeed, finite(t.MoveSpeedFullCharge,.072))))*HZ,
    // Saber charge uses DU/frame while simple-family speed fields use source
    // world-units/frame (10 DU/world-unit), hence its separate conversion.
    moveSpeedCharging:finite(t.MoveSpeed_Charge,finite(t.MoveSpeedFullCharge,.04))*(r.family==='splatana'?HZ/10:HZ),
    inkTankScale, inkPerShot:finite(t.InkConsume,.0092)*100/inkTankScale, inkFull:inkAt(r,chargeFrames(r)),
    inkMin:inkAt(r,finite(t.ChargeFrameMinCharge,8)), inkRecoverStop:finite(t.InkRecoverStop,20)/HZ,
    spreadGround:finite(t.Stand_DegSwerve,0), spreadAir:finite(t.Jump_DegSwerve,0),
    runSpeedFiringCurve:curve('Overwrite_MoveVelRt_Shot_',[1,1.125,1.25]), inkSaverMainCurve:curve('Overwrite_ConsumeRt_Main_',[1,.775,.55]),
    actionAirSpreadCurve:action?[finite(action.Low,0),finite(action.Mid,.5),finite(action.High,1)]:undefined,
    impactRadius:finite(p.PaintParam?.WidthHalfNear, .8),
    stats:{range:u.Range??clamp(actualRange/32),damage:u.Power??clamp(damageMax(r)/160),
      rate:u.Blaze??clamp(6/Math.max(1,rate)),mobility:clamp(finite(t.MoveSpeed,.072)/.1),paint:clamp(actualRange/25)},
  };
}

export function registerMainWeaponCatalog(api) {
  const { WEAPONS, WEAPON_ORDER } = api;
  for (const r of MAIN_WEAPON_CATALOG.records) {
    if (r.legacy) {
      Object.assign(WEAPONS[r.id], { referenceNames:r.names, name:r.names[api.LANG==='ja'?'ja':'en'], sourceMainActor:r.sourceActor });
    } else {
      if (WEAPONS[r.id]) throw new Error('Duplicate catalog weapon '+r.id);
      WEAPONS[r.id] = definition(r, api);
      WEAPON_ORDER.push(r.id);
    }
  }
  return MAIN_WEAPON_CATALOG;
}

// The 2024 S3 shot-accuracy study models DegBias as the median angular
// fraction, not as a probability of choosing between two arbitrary cones.
// Reuse the same horizontal / independent Spinner pitch kernel as the seven
// legacy main weapons. Source parameters are read per added main weapon.
const ANGULAR_FAMILIES = new Set(['shooter', 'dualies', 'blaster', 'splatling']);
export function catalogAngularLaunch(projectiles, direction, actor, family, param, accuracy, maximumDegrees, jumpAgeSeconds = actor.weaponRunner?.s3JumpSpreadAge) {
  if (!ANGULAR_FAMILIES.has(family)) {
    // Other source families have no verified common angular law here.
    const chance = accuracy.shot(!!actor.grounded, jumpAgeSeconds);
    return projectiles._spread(direction, Math.random() < chance ? maximumDegrees : maximumDegrees * .45);
  }
  const spinner = family === 'splatling';
  // Splatlings have no Shooter-style first-shot buildup: each round reads
  // the fixed standing/jumping median and independent vertical median.
  // Sparse unextracted defaults remain neutral (0.5), not invented values.
  const median = spinner
    ? actor.grounded ? finite(param.Stand_DegBiasMax, .5) : finite(param.Jump_DegBiasMax, .5)
    : accuracy.shot(!!actor.grounded, jumpAgeSeconds);
  return withShotBias(actor, median, spinner ? finite(param.PitchDegBias, .5) : null,
    () => spreadWeaponRound(projectiles, direction, actor,
      {kind:family, spreadPitchGround:spinner ? finite(param.PitchDegSwerve, 0) : null},
      maximumDegrees));
}

// A ledge fall is not a newly admitted jump: source recovery begins only
// after the Actor's native jump serial advances. Recovery keeps running
// across landing, and rendered frame rate does not affect the fixed clock.
export function advanceCatalogJumpClock(state, actor, family, dt) {
  const serial = actor.s3JumpSerial || 0;
  if (state.jumpSerial !== serial) {
    state.jumpSerial = serial;
    state.jumpAge = 0;
  } else if (state.jumpAge != null && Number.isFinite(dt) && dt > 0) state.jumpAge += dt;
  if (state.jumpAge != null && state.jumpAge * HZ + EPS >= state.accuracy.jumpEnd &&
    (actor.grounded || family === 'dualies')) state.jumpAge = null;
  return state.jumpAge;
}

// #10 S3 Spinner studies: an independent signed biased draw also changes
// launch speed. The extracted 11.3.0 fields are relative amplitude and bias,
// not an extra fixed world-units-per-frame acceleration.
export function catalogSpinnerLaunchSpeed(baseSpeed, move, random = Math.random) {
  const rate = move?.SpawnSpeedRandomRate;
  if (!Number.isFinite(rate) || rate <= 0) return baseSpeed;
  const bias = finite(move.SpawnSpeedRandomBias, .5);
  return baseSpeed * (1 + rate * signedBiasSample(random(), bias));
}

// Source-grounded launch envelope through an admitted jump. Shooter and
// Spinner maximum angles recover after 25F and reach ground by 70F. The
// established Splatling jump clock is owned by splatling-jump-spread.mjs;
// this catalog only reads it, not advancing a duplicate clock.
export function catalogAngularEnvelope(family, grounded, ground, jump, jumpAge, actionReduction = 0, param = {}) {
  const airborne = lerp(ground, jump, 1 - clamp(actionReduction));
  if (Number.isFinite(jumpAge)) {
    if (family === 'shooter' || family === 'splatling') {
      const frames = jumpAge * HZ;
      const hold = finite(param.Jump_DegBiasDecreaseStartFrame, 25);
      const end = Math.max(hold + EPS, finite(param.Jump_DegBiasEndFrame, 70));
      return frames <= hold ? airborne
        : frames >= end ? ground : lerp(airborne, ground, (frames - hold) / (end - hold));
    }
    if (family === 'dualies' || family === 'blaster') return airborne;
  }
  // The native Blaster's jump-serial owner rejects edge falls, whereas
  // Shooter and Dualies retain their ordinary airborne envelope.
  if (family === 'blaster') return ground;
  return grounded ? ground : airborne;
}

function initialState(r,actor) {
  return { id:r.id, pressed:false, frame:0, pending:null, chargeF:0, paid:0, reserved:0,
    stream:0, streamF:0, streamCharge:0, streamTime:0, rounds:0, burst:0, burstWait:0,
    turret:0, rolls:0, roll:null, lunge:null, melee:null, stored:null, swingCount:0, canopy:null, naked:0,
    accuracy:new ShooterAccuracy(weaponParam(r)), shotSerial:0, stop:0,
    rollingFrames:0, rollingDash:false, bowTilt:0,
    jumpSerial:actor?.s3JumpSerial || 0, jumpAge:null };
}

export function installMainWeaponCatalogRuntime(api, profile) {
  validateCanonicalKits(api);
  const { WeaponRunner, Projectiles, Actor, THREE, G, PLAYER, Hit, emit, on, WEAPONS } = api;
  const R = WeaponRunner.prototype, P = Projectiles.prototype;
  if (Object.hasOwn(R, INSTALLED)) return;
  Object.defineProperty(R, INSTALLED, { value:true });
  installActorFreefallHooks(api);
  installS3ProjectileShapes(api);
  const legacyUpdate = R.update, legacyReset = R.reset, legacyBusy = R.busy, legacyMove = R.moveSpeed;
  const step = P._step, fresh = P._new, ghost = P.ghostProjectile, clear = P.clear;
  const defaults = profile.weaponsFidelity;
  const down = new THREE.Vector3(0,-1,0), floorHit = new Hit(), hit = new Hit();
  const muzzle = new THREE.Vector3(), dir = new THREE.Vector3(), base = new THREE.Vector3();

  function state(runner) {
    const r = runner.a.weapon.catalogRecord;
    if (!runner.catalogState || runner.catalogState.id !== r.id) runner.catalogState = initialState(r,runner.a);
    return runner.catalogState;
  }
  function cancel(runner, keep = false) {
    const s = runner.catalogState;
    if (!s) return;
    const r = RECORDS.get(s.id), kp = r.parameters.WeaponKeepChargeParam || r.parameters.spl__WeaponStringerParam?.ChargeKeepParam;
    if(keep&&s.stream>0&&kp?.EnableKeepChargeAnytime){s.chargeF=remainingCharge(r,s);s.paid=inkAt(r,s.chargeF)*inkMod(runner.a);}
    if (keep && s.chargeF > 0 && kp && (kp.EnableKeepChargeAnytime || s.chargeF+EPS >= chargeFrames(r)) &&
      (r.family !== 'stringer' || r.parameters.spl__WeaponStringerParam.IsEnableChargeKeep))
      s.stored = { frames:s.chargeF, paid:s.paid, remaining:finite(kp.KeepChargeFullFrame,75)/HZ };
    else if (!keep) s.stored = null;
    s.pending = null; s.chargeF = 0; s.paid = 0; s.stream = 0; s.burst = 0; s.rounds = 0;
    s.roll = null; s.rollPaint = null; s.lunge=null; s.melee=null; s.turret = 0;
    s.rollingFrames=0;s.rollingDash=false;
    if (s.canopy && !s.canopy.launched) s.canopy.open = false;
    runner.charging = false; runner.streaming = false; runner.rolling = false; runner.charge = 0;
  }
  R.reset = function(...args) { this.catalogState = null; return legacyReset.apply(this,args); };
  R.busy = function() {
    if (!this.a.weapon.catalogRecord) return legacyBusy.call(this);
    const s = this.catalogState;
    if (this.a.intent?.squid && !this.a.intent.fire && !s?.roll && !s?.lunge && !s?.pending && !s?.melee) return false;
    return !!(s && (s.pending || s.melee || s.chargeF>0 || s.stream>0 || s.roll || s.lunge || s.stop>EPS));
  };
  R.moveSpeed = function() {
    const w = this.a.weapon;
    if (!w.catalogRecord) return legacyMove.call(this);
    const s = this.catalogState, r = w.catalogRecord, p = r.parameters, t = weaponParam(r);
    // The catalogue replaces the legacy movement wrapper, so preserve the
    // existing sub-ready owner before selecting main-weapon movement.
    const throwingStorm = this.a.specialActive?.id === 'storm' && this.a.specialActive.phase === 'hold' && this.a.specialActive.subArmed && this.a.intent.sub;
    if (this.a.grounded && (this.aimingSub || throwingStorm)) return profile.bomb.holdMoveSpeed;
    const mod = ['roller','brush','splatana'].includes(r.family)?1:this.a.s3?.modifiers?.runSpeedFiring ?? 1;
    if (s?.roll || s?.lunge || s?.turret>EPS && r.sourceActor !== 'WeaponManeuverDual') return 0;
    if (this.rolling) {
      const roll=p.WeaponRollParam||{},normal=finite(roll.SpeedNormal,.132);
      return finite(s?.rollingDash?(dashTurnBreakActive(this.a)?roll.SpeedDashTurnBreak:roll.SpeedDash):normal,normal)*HZ;
    }
    if (s?.canopy?.open && !s.canopy.launched) return finite(t.MoveSpeedCharge,.055)*HZ*mod;
    if (this.charging) return w.moveSpeedCharging*mod;
    if (r.sourceActor==='WeaponSpinnerDownpour'&&s?.streamElapsed+EPS>=.5)
      return lerp(finite(t.MoveSpeed,.086),finite(p.VariableShotParam?.MoveSpeed,.05),
        clamp((s.streamElapsed*HZ-30)/finite(p.VariableShotParam?.VariableInterpolatedFrame,10)))*HZ*mod;
    return this.firingT>0 || s?.pending || s?.stream>0 ? w.moveSpeedFiring*mod : PLAYER.runSpeed*(this.a.grounded?(this.a.s3?.modifiers?.runSpeed??1):1);
  };
  function pay(runner, amount, recover = runner.a.weapon.inkRecoverStop) {
    const a = runner.a;
    if (!Number.isFinite(amount) || amount<0) throw new Error('Non-finite catalog ink cost');
    if (a.ink+EPS < amount) { runner._empty(); return false; }
    a.ink = Math.max(0,a.ink-amount); a.lastFire=0;
    a.s3 ||= {}; a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining||0,recover);
    return true;
  }
  const inkMod = a => (a.s3?.modifiers?.inkSaverMain ?? 1)/(a.weapon.inkTankScale||1);
  function notify(a, r, origin, direction, charge = 0) {
    a.character.trigger(r.family==='charger'||r.family==='stringer'?'charge_release':'shoot');
    emit('weapon:fire',{actor:a,weapon:r.id,muzzle:origin.clone(),dir:direction.clone(),charge});
    if (a.isLocal || a._nearCamera?.()) {
      G.audio?.play(r.family==='charger'?'shoot_charger':r.family==='blaster'?'shoot_blaster':'shoot_shooter',
        {pos:a.isLocal?undefined:origin,volume:.45});
      G.fx?.muzzle(origin,direction,a.color,r.family==='blaster'?'blaster':'shooter');
    }
  }
  function origin(a) { G.projectiles._muzzle(a,muzzle); G.projectiles._aimFrom(a,muzzle,dir); return muzzle; }
  function angle(direction,yaw=0,pitch=0) {
    const y = Math.atan2(direction.x,direction.z)+yaw*RAD;
    const p = Math.atan2(direction.y,Math.hypot(direction.x,direction.z))+pitch*RAD;
    return new THREE.Vector3(Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p));
  }
  function paint(owner, at, radius, depth=1, direction=null, face=-1) {
    if (!(radius>0) || !owner || owner.remote) return;
    // The recorded paint packet carries this seed; receivers never reroll it.
    const options = {seed:Math.random(),claimOwner:owner,kind:'shot',face};
    let centre=at,paintRadius=radius;
    if (direction) {
      const normal=G.level?.faces?.[face]?.n||down.clone().negate();
      const tangent=direction.clone().addScaledVector(normal,-direction.dot(normal));
      // This source depth envelope is interpreted on floor-like contacts only.
      // Wall projection remains unchanged until its separate source law is verified.
      if(Math.abs(normal.y)<.4){options.stretch=direction;options.stretchAmt=Math.max(0,depth-1);}
      else if(tangent.lengthSq()>EPS){
        tangent.normalize();const shape=catalogPaintEllipse(radius,depth);
        if(shape.rotate)tangent.crossVectors(normal,tangent.clone()).normalize();
        paintRadius=shape.radius;centre=at.clone().addScaledVector(tangent,-shape.centreBack);
        options.stretch=tangent;options.stretchAmt=shape.stretchAmt;
      }
    }
    owner.addTurf(G.paint.splat(centre,paintRadius,owner.team,options));
  }
  function floorPaint(owner, at, radius, depth=1, direction=null) {
    base.copy(at); base.y += .15;
    const h = G.physics.raycast(base,down,Math.max(4,at.y-owner.pos.y+2),floorHit,true);
    if (h.hit) paint(owner,h.point,radius,depth,direction,h.face);
  }

  // Trace the centre path on actual collision polygons, never paint-chart
  // rectangles. Coalesced intervals and streamed plane crossings follow
  // continuous upper support without a geometry-density cut-off.
  function rollingPaint(owner, at, radius, depth, direction, contact) {
    const level=G.level, from=owner.pos, tol=1e-9;
    if(!owner.ground?.hit || !level || !Number.isFinite(from.x+from.y+from.z+at.x+at.z))return;
    // Partial/test levels without collision queries cannot prove floor contact.
    if(typeof (level.triangleWorld?level.queryDynamicBlocks:level.queryBlocks)!=='function')return;
    const surfaces=[], dx=at.x-from.x,dz=at.z-from.z;
    function polygon(points,normal,faceId){
      const face=level.faces[faceId];
      if(!face?.paintable || !(normal.y>0))return;
      // Collision vertices define the plane. Stored float32 shading/contact
      // normals can disagree across an exact shared edge after rounding.
      const o=points[0],ex=points[1].x-o.x,ey=points[1].y-o.y,ez=points[1].z-o.z;
      const fx=points[2].x-o.x,fy=points[2].y-o.y,fz=points[2].z-o.z;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      if(ny===0)return;
      const y0=o.y-((from.x-o.x)*nx+(from.z-o.z)*nz)/ny;
      const dy=-(dx*nx+dz*nz)/ny;
      if(!Number.isFinite(y0+dy))return;
      let area=0,lo=0,hi=1;
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.z-b.x*a.z;}
      if(Math.abs(area)<1e-12)return;
      const sign=Math.sign(area);
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],ex=b.x-a.x,ez=b.z-a.z;
        const q=sign*(ex*(from.z-a.z)-ez*(from.x-a.x)),d=sign*(ex*dz-ez*dx);
        if(Math.abs(d)<1e-12){if(q < -tol)return;}
        else if(d>0)lo=Math.max(lo,-q/d);else hi=Math.min(hi,-q/d);
      }
      if(lo>hi+tol || hi<0 || lo>1)return;
      surfaces.push({lo:Math.max(0,lo),hi:Math.min(1,hi),y0,dy,normal:normal.clone(),face:faceId,start:faceId===owner.ground.face&&lo<=tol,endFaces:hi>=1-tol?[faceId]:[]});
    }
    const min=contact.origin.set(Math.min(from.x,at.x),-Infinity,Math.min(from.z,at.z));
    const max=contact.down.set(Math.max(from.x,at.x),Infinity,Math.max(from.z,at.z));
    const world=level.triangleWorld;
    if(world)world.queryBox(min,max,id=>{
      if(world.flags[id]&4)return;
      const normal=contact.point.fromArray(world.normals,id*3);
      const tri=world.triangle(id);
      polygon([tri.a,tri.b,tri.c],normal,level.data.triangleFace[id]);
    });
    const ids=[];
    if(world)level.queryDynamicBlocks(min.x,min.z,max.x,max.z,ids);
    else level.queryBlocks(min.x,min.z,max.x,max.z,ids);
    for(const id of ids){
      const block=level.blocks[id];if(!block?.solid||block.grate)continue;
      for(const faceId of block.faces){
        const face=level.faces[faceId];if(!face || !(face.n.y>0))continue;
        const o=face.origin,u=face.u,v=face.v;
        polygon([o,o.clone().addScaledVector(u,face.su),o.clone().addScaledVector(u,face.su).addScaledVector(v,face.sv),o.clone().addScaledVector(v,face.sv)],face.n,faceId);
      }
    }
    if(!surfaces.length)return;
    // Merge actual overlapping/touching intervals on the exact same path
    // plane across chart IDs; retain accepted support membership explicitly.
    // Missing collision intervals remain gaps regardless of chart identity.
    surfaces.sort((a,b)=>a.y0-b.y0||a.dy-b.dy||a.lo-b.lo);
    let count=0;
    for(const s of surfaces){
      const prior=surfaces[count-1];
      if(prior&&prior.y0===s.y0&&prior.dy===s.dy&&s.lo<=prior.hi+tol)
        {prior.hi=Math.max(prior.hi,s.hi);prior.start ||= s.start;for(const face of s.endFaces)if(!prior.endFaces.includes(face))prior.endFaces.push(face);}
      else surfaces[count++]=s;
    }
    surfaces.length=count;
    let current=surfaces.find(s=>s.start&&s.lo<=tol);
    if(!current)return;
    // Stream the next endpoint/upper-plane crossing instead of constructing
    // all pairwise events. Storage is linear in intersecting collision pieces;
    // mesh density never silently disables a valid contact.
    let t=0;
    while(t<1-tol){
      const y=current.y0+current.dy*t;
      let next=null;
      for(const s of surfaces){
        if(s.lo>t+tol||s.hi<=t+tol||Math.abs(s.y0+s.dy*t-y)>1e-8)continue;
        if(!next||s.dy>next.dy||(s.dy===next.dy&&s.hi>next.hi))next=s;
      }
      if(!next)return;current=next;
      let end=current.hi;
      for(const s of surfaces){
        if(s.dy<=current.dy)continue;
        const cross=(current.y0-s.y0)/(s.dy-current.dy);
        if(cross>t+tol&&cross<end&&cross>=s.lo-tol&&cross<=s.hi+tol)end=cross;
      }
      if(!(end>t))return;
      t=end;
    }
    contact.point.set(at.x,current.y0+current.dy,at.z);
    contact.origin.copy(contact.point).addScaledVector(current.normal,.15);
    contact.down.copy(current.normal).negate();
    const h=G.physics.raycast(contact.origin,contact.down,.3,contact.hit,true);
    if(h.hit&&current.endFaces.includes(h.face)&&h.point.distanceToSquared(contact.point)<1e-12)
      paint(owner,h.point,radius,depth,direction,h.face);
  }

  function mode(r, key='normal', unit=0, charge=0) {
    const p = r.parameters;
    let b=p, packet=null, index=0;
    if (key==='blaster-jump') b = {...p, MoveParam:p.MoveJumpParam||p.MoveParam,
      DamageParam:p.DamageJumpParam||p.DamageParam, BlastParam:p.BlastJumpParam||p.BlastParam,
      BlasterBurstParam:p.BlasterBurstJumpParam||p.BlasterBurstParam};
    if (key==='variable') b = { ...p, MoveParam:p.VariableMoveParam||p.MoveParam,
      DamageParam:p.VariableDamageParam||p.DamageParam, CollisionParam:p.VariableCollisionParam||p.CollisionParam,
      PaintParam:p.VariablePaintParam||p.PaintParam, SplashPaintParam:p.VariableSplashPaintParam||p.SplashPaintParam,
      SplashSpawnParam:p.VariableSplashSpawnParam||p.SplashSpawnParam };
    if(key==='variable'&&r.sourceActor==='WeaponSpinnerDownpour'){
      for(const group of ['MoveParam','DamageParam','CollisionParam','PaintParam','SplashPaintParam','SplashSpawnParam'])
        b[group]=interpolateFields(p[group],b[group],charge);
    }
    if (key==='turret') b = { ...p, MoveParam:p.MoveLapOverParam||p.MoveParam,
      DamageParam:p.DamageLapOverParam||p.DamageParam, CollisionParam:p.CollisionLapOverParam||p.CollisionParam,
      SplashSpawnParam:p.SplashSpawnLapOverParam||p.SplashSpawnParam };
    if (['horizontal','vertical','brush'].includes(key)) {
      const group = key==='vertical'?p.VerticalSwingUnitGroupParam:key==='brush'?p.SwingUnitGroupParam:p.WideSwingUnitGroupParam;
      packet = group.Unit[unit]; b = {...packet.UnitParam, DamageParam:group.DamageParam};
    }
    if (key==='slosh') { packet=p.UnitGroupParam.Unit[unit]; b=packet; }
    if (key==='pellet') { packet=p.spl__BulletShelterShotgunParam.GroupParams[unit]; b=packet; }
    if (key==='arrow') b=p.spl__BulletStringerParam;
    if (key==='saber-horizontal'||key==='saber-vertical') b=key.endsWith('vertical')?p.BulletSaberVerticalParam:p.BulletSaberHorizontalParam;
    const m=b.MoveParam||{}, d=b.DamageParam||{}, c=b.CollisionParam||{};
    const frames=charge*chargeFrames(r), full=charge+EPS>=1;
    let speed=finite(m.SpawnSpeed,1)*HZ, damage=finite(d.ValueMax,finite(d.HitDamage,0))/10;
    let life=1.2, range=Infinity;
    if (r.family==='charger') {
      speed=finite(full?m.SpawnSpeedFullCharge:m.SpawnSpeedMaxCharge,finite(m.SpawnSpeedMinCharge,2.4))*HZ;
      const q=clamp((frames-finite(weaponParam(r).ChargeFrameMinCharge,8))/(chargeFrames(r)-finite(weaponParam(r).ChargeFrameMinCharge,8)));
      if (!full) speed=lerp(finite(m.SpawnSpeedMinCharge,2.4),finite(m.SpawnSpeedMaxCharge,4.8),q)*HZ;
      range=full?m.DistanceFullCharge:lerp(m.DistanceMinCharge,m.DistanceMaxCharge,q);
      damage=(full?d.ValueFullCharge:lerp(d.ValueMinCharge,d.ValueMaxCharge,q))/10;
      life=range/speed;
    }
    if (r.family==='splatling') {
      const t=weaponParam(r), first=finite(t.ChargeFrame_First,48);
      speed=lerp(finite(m.SpawnSpeed,1.05),finite(m.SpawnSpeedFirstLastAndSecond,2.1),clamp(frames/first))*HZ;
      if (full && d.ValueFullChargeMax != null) damage=d.ValueFullChargeMax/10;
    }
    if (key==='arrow') { speed=stageValue(r,m,'SpawnSpeed',frames,2.1)*HZ; damage=stageValue(r,d,'DirectHitDamage',frames,300)/10; }
    if (key==='slosh') { speed=finite(packet.SpawnSpeedGround,1)*HZ; }
    if (packet?.SpawnSpeedBase != null) speed=packet.SpawnSpeedBase*HZ;
    if (r.family==='blaster') life=finite(b.BlasterBurstParam?.BurstFrame,13)/HZ;
    if (key.startsWith('saber-')) life=finite(b.BurstParam?.BurstFrame,6)/HZ;
    const paintParam=b.PaintParam||{}, sloshSplash=b.SplashAndSplashWallHitSpawnPrm?.SplashParam?.[0];
    const splash=b.SplashSpawnParam||sloshSplash?.SpawnParam||{};
    let radius=finite(paintParam.WidthHalfNear,finite(paintParam.WidthHalf,finite(paintParam.WidthHalfMin,.8)));
    if (key==='arrow') radius=stageValue(r,paintParam,'WidthHalf',frames,2.5);
    if (r.family==='charger') radius=full?finite(paintParam.RadiusFullCharge,1):lerp(finite(paintParam.RadiusMinCharge,.9),finite(paintParam.RadiusMaxCharge,2.7),charge);
    return {key,unit,index,charge,packet,b,m,d,c,speed,damage,life,range,radius,
      depth:finite(paintParam.DepthScaleMax,finite(paintParam.DepthScaleNear,1)),
      splashDropSpec:catalogSplashDropSpec(b),
      splashFirst:Math.max(0,finite(splash.SpawnNearestLength,1)),
      splashRadius:finite(b.SplashPaintParam?.WidthHalf,finite(sloshSplash?.DrawSizeCollisionPaintParam?.PaintWidthHalf,.4)),
      splashSpacing:finite(splash.DropInterval,finite(splash.SpawnBetweenLength,3)),
      splashCount:Math.max(0,Math.ceil(finite(splash.SplashNumMax,finite(splash.SpawnNum,0)))),
      sloshFall:key==='slosh'?sloshFallSpec(sloshSplash):null};
  }
  // Slosher in-flight splashes fall through the shared fixed-60Hz drop queue
  // (as PR1188 does for the native Sloshers) instead of stamping the floor
  // instantly under the glob. Same schedule/footprint; the drop is visible.
  function sloshFallSpec(splash) {
    const draw=splash?.DrawSizeCollisionPaintParam,depth=finite(draw?.PaintDepthScale,0);
    if(!(depth>0))return null;
    return Object.freeze({drawRadius:finite(draw.DrawRadius,.1),spec:Object.freeze({gravity:.016*3600,drag:SPLASH_DROP_AIR_RESIST,
      depthScaleMax:depth,depthScaleMin:depth,dropHeightMax:0,dropHeightMin:0,surfaceOnly:true,randomVelocity:null})});
  }
  function spawn(a,r,descriptor,direction,at,options={}) {
    const system=G.projectiles, p=system._new();
    p.catalogVisual=catalogVisualSpec(r,descriptor,options.index||0);
    Object.assign(p,{type:'shot',wid:r.id,owner:a,team:a.team,age:0,life:descriptor.life,straight:finite(descriptor.m.GoStraightToBrakeStateFrame,4)/HZ,
      radius:descriptor.radius,damage:descriptor.damage,size:finite(descriptor.c.InitRadiusForPlayer,.2),
      trail:0,trailEvery:0,trailRadius:0,grav:0,drag:0,seed:Math.random(),ghost:!!options.ghost,
      delay:finite(options.delay,0),vis:.1,tail0:.8,tailK:1.3,wob:.02,wobF:26,nose:.3,sats:0,
      inkMeta:{s3Catalog:[1,descriptor.key,descriptor.unit,descriptor.charge,options.index||0]},
      catalog:{r,descriptor,travel:0,nextSplash:descriptor.splashDropSpec?descriptor.splashFirst:1,dropCount:0,hit:new Hit(),seen:new Set(),volley:options.volley,
        index:options.index||0,phase:0,stuck:false,fuse:0,carry:0,range:descriptor.range,bounces:0,groundBounces:0}});
    p.pos.copy(at);p.prev.copy(at);p.start.copy(at);p.vel.copy(direction).multiplyScalar(options.speed??descriptor.speed);
    p.vel.y += finite(options.lift,0);updateCatalogVisual(p);
    system._push(p);
    return p;
  }
  function emitSingle(runner,r,key='normal',charge=0,volley=null) {
    const a=runner.a, s=state(runner), desc=mode(r,key,0,charge);
    // INKWAVE's cumulative-floor policy distributes fractional SpawnNum over
    // accepted shots. The pinned value does not establish retail ordering.
    // Shooter budgets also apply to the existing projected-paint fallback;
    // missing physics still yields no detached splash spec or invented gravity.
    const sourceNum=desc.b.SplashSpawnParam?.SpawnNum;
    if ((desc.splashDropSpec || r.family==='shooter') && (r.family==='shooter'||r.family==='splatling'||r.family==='dualies') &&
        Number.isFinite(sourceNum) && sourceNum >= 0) {
      const ordinal=s.paintShotOrdinal||0;
      desc.splashCount=catalogFractionalSplashCount(sourceNum,ordinal);
      s.paintShotOrdinal=ordinal+1;
    }
    let t=key==='variable'?r.parameters.VariableWeaponParam||r.parameters.VariableShotParam||weaponParam(r):weaponParam(r);
    if(key==='variable'&&r.sourceActor==='WeaponSpinnerDownpour')t=interpolateFields(weaponParam(r),t,charge);
    origin(a);
    const ground=finite(t.Stand_DegSwerve,0),jump=finite(t.Jump_DegSwerve,ground);
    const jumpAge=r.family==='splatling' && Number.isFinite(a.s3SplatlingJumpAgeFrames)
      ? a.s3SplatlingJumpAgeFrames/HZ : s.jumpAge;
    const spread=key==='turret'&&r.family==='dualies'
      ? finite(t.LapOver_DegSwerve,0)
      : catalogAngularEnvelope(r.family,!!a.grounded,ground,jump,jumpAge,
        a.s3?.modifiers?.actionAirSpread??0,{...weaponParam(r),...t});
    const aim=dir.clone();
    if (key==='turret'&&r.family==='dualies') {
      // Post-roll turret has its own sourced cone and must not advance normal
      // Dualies bias; the common S3 Splat Dualies turret cone is exactly zero.
      G.projectiles._spread(aim,spread);
    } else {
      // Variable-charge modes may omit fields present in the base WeaponParam.
      catalogAngularLaunch(G.projectiles,aim,a,r.family,{...weaponParam(r),...t},s.accuracy,spread,s.jumpAge);
    }
    runner.spread=spread;
    // The charged Splatana slash is born at the sourced ShotBulletOffset_Vertical
    // (player-local, feet origin), not at the gun muzzle: its collider chain
    // spans Y -1.6..+1.6, so a muzzle-height birth buried the lower lobes in
    // the floor and the round died on its first tick.
    let at=muzzle;
    const vertical=key==='saber-vertical'?r.parameters.spl__WeaponSaberParam?.SwingParam?.ShotBulletOffset_Vertical:null;
    if(vertical){
      const yaw=Math.atan2(aim.x,aim.z),cy=Math.cos(yaw),sy=Math.sin(yaw),x=finite(vertical.X,0),z=finite(vertical.Z,0);
      at=a.pos.clone().add(new THREE.Vector3(x*cy+z*sy,finite(vertical.Y,0),-x*sy+z*cy));
    }
    spawn(a,r,desc,aim,at,{volley,
      speed:r.family==='splatling'?catalogSpinnerLaunchSpeed(desc.speed,desc.m):undefined});
    notify(a,r,muzzle,aim,charge);
    const splash=desc.b.SplashSpawnParam,nearest=desc.b.SplashPaintParam;
    if(Number.isInteger(splash?.SplitNum)&&splash.SplitNum>0&&nearest?.WidthHalfNearest>0&&
       advanceShooterNearestSlot(s,{...splash,ForceSpawnNearestAddNumArray:splash.ForceSpawnNearestAddNumArray||[]})){
      const at=a.pos.clone().addScaledVector(a.aimDir.clone().setY(0).normalize(),finite(splash.SpawnNearestLength,0));
      floorPaint(a,at,nearest.WidthHalfNearest);
    }
  }
  function emitUnits(runner,r,key,charge=0) {
    const a=runner.a,p=r.parameters,s=state(runner),group=key==='slosh'?p.UnitGroupParam:
      key==='vertical'?p.VerticalSwingUnitGroupParam:key==='brush'?p.SwingUnitGroupParam:p.WideSwingUnitGroupParam;
    origin(a);const at=muzzle.clone(), direction=dir.clone(), volleys=new Map();
    group.Unit.forEach((u,j)=> {
      const desc=mode(r,key,j,charge), count=finite(u.BulletNum,1);
      for(let i=0;i<count;i++) {
        const groupKey=r.sourceActor==='WeaponSlosherBathtub'?j+':'+i:String(u.DamageParam?.GroupNum??0);
        if(!volleys.has(groupKey))volleys.set(groupKey,{hits:new Map(),id:++s.shotSerial});
        const volley=volleys.get(groupKey);
        const velocity=key==='slosh'?finite(a.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir,1):finite(u.SpawnSpeedBase,1);
        const sampledSpeed=velocity+(Math.random()*2-1)*finite(u.SpawnSpeedRandom,0);
        const speed=(sampledSpeed+finite(u.AfterOffsetSpawnSpeed,0)*i)*HZ;
        // Added horizontal Rollers share the mature owner's sourced fan width
        // and reuse this same speed sample for its calibrated scatter term.
        const fan=r.family==='roller'&&key==='horizontal'
          ? rollerSpeedSwerveDegrees(u,i,count,sampledSpeed)
          : (count===1?0:lerp(-finite(u.SpawnWideDegree,0)/2,finite(u.SpawnWideDegree,0)/2,i/(count-1)));
        const yaw=finite(u.BaseRotateYDegree,0)+fan;
        const aim=angle(direction,yaw,finite(u.SpawnRotateXDegree,finite(u.SpawnRotateXDegreeBase,0)));
        const d={...desc,index:i};
        spawn(a,r,d,aim,at,{speed,delay:(finite(u.UnitDelayFrame,0)+i*finite(u.AfterOffsetDelayFrame,0))/HZ,
          index:i,volley,lift:speed*finite(u.AddSpawnSpeedYRateByXZ,finite(u.AddSpawnSpeedYRateBySpeed,0))});
      }
    });
    notify(a,r,at,direction,charge);
  }
  function emitArrow(runner,r,charge) {
    const a=runner.a,p=r.parameters.spl__WeaponStringerParam,t=p.ShotParam||{}, frames=charge*chargeFrames(r), count=finite(t.ArrowNum,3);
    const degrees=stageValue(r,t,'ArrowAngle',frames,8),desc=mode(r,'arrow',0,charge);
    origin(a);const at=muzzle.clone(), direction=dir.clone();
    const tilt=state(runner).bowTilt*RAD;
    const right=new THREE.Vector3(direction.z,0,-direction.x);
    if(right.lengthSq()<EPS)right.set(1,0,0);else right.normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const spreadAxis=right.multiplyScalar(Math.cos(tilt)).addScaledVector(up,Math.sin(tilt));
    for(let i=0;i<count;i++) {
      const off=(i-(count-1)/2)*degrees;
      const aim=direction.clone().multiplyScalar(Math.cos(off*RAD)).addScaledVector(spreadAxis,Math.sin(off*RAD));
      spawn(a,r,desc,aim,at,{index:i});
    }
    notify(a,r,at,direction,charge);
  }
  function emitPellets(runner,r) {
    const a=runner.a,s=state(runner),p=r.parameters.spl__BulletShelterShotgunParam;
    origin(a);const at=muzzle.clone(),direction=dir.clone(),volley={hits:new Map(),id:++s.shotSerial,cap:p.DamageEffectiveTotalMax/10};
    p.GroupParams.forEach((g,j)=> {
      const count=finite(g.TotalNum,1),d=mode(r,'pellet',j);
      for(let i=0;i<count;i++) {
        const az=2*Math.PI*i/count;
        spawn(a,r,d,angle(direction,Math.cos(az)*finite(g.HorizontalDegree,0),Math.sin(az)*finite(g.VerticalDegree,0)),at,{index:i,volley});
      }
    });notify(a,r,at,direction);
  }
  function damageBands(bands,distance) {
    if (!bands?.length) return 0;
    if (distance<=bands[0].Distance) return bands[0].Damage/10;
    for(let i=1;i<bands.length;i++)if(distance<=bands[i].Distance) {
      const a=bands[i-1],b=bands[i];return lerp(a.Damage,b.Damage,clamp((distance-a.Distance)/(b.Distance-a.Distance)))/10;
    }return 0;
  }
  function explosion(system,p,descriptor,skip=null) {
    if (p.ghost) return;
    const bands=descriptor?.DistanceDamage||[],radius=Math.max(...bands.map(b=>b.Distance),0);
    const paintRadius=finite(descriptor?.PaintRadius,0)||finite(p.catalog.descriptor.b.BlasterBurstParam?.SplashDropPaintRadius,0);
    floorPaint(p.owner,p.pos,paintRadius);
    for(const a of G.actors||[])if(a.alive&&a.team!==p.team){
      if(a===skip)continue;
      base.copy(a.pos);base.y+=.7;const distance=base.distanceTo(p.pos);
      if(distance>radius||!G.physics.los(p.pos,base))continue;
      const damage=damageBands(bands,distance);if(damage>0)withObjectDamageCause({...p,type:'area'},()=>system.applyHit(p.owner,a,damage,p.wid));
    }
    const area={...p,type:'area'},cause=catalogueAttackRow(area);
    system.s3DamageSubObjects?.(area,p.pos,radius,d=>damageBands(bands,d),cause);
    system.s3DamageSpecialObjects?.(area,p.pos,radius,d=>damageBands(bands,d),cause);
    G.boss?.splash(p.owner,p.pos,radius,bands[0]?.Damage/10||0,0,p.wid);
    G.fx?.explosion(p.pos,p.owner.color,radius);
    emit('weapon:impact',{pos:p.pos.clone(),normal:down.clone().negate(),team:p.team,kind:'burst',radius});
  }

  function impactDamage(p,a) {
    const {r,descriptor:d,volley}=p.catalog;
    let amount=d.damage,damage=d.d,frames=Math.floor(p.age*HZ+EPS);
    if(damage.ReduceStartFrame!=null)amount=lerp(amount*10,finite(damage.ValueMin,amount*10),
      clamp((frames-damage.ReduceStartFrame)/(finite(damage.ReduceEndFrame,40)-damage.ReduceStartFrame)))/10;
    if(damage.ReduceStartFallDistance!=null)amount=lerp(damage.ValueMax,damage.ValueMin,
      clamp((Math.max(0,p.start.y-p.pos.y)-damage.ReduceStartFallDistance)/(damage.ReduceEndFallDistance-damage.ReduceStartFallDistance)))/10;
    if(damage.Inside){
      const b=damage.Inside,dist=p.start.distanceTo(p.pos);
      amount=damageBands([{Distance:b.DamageMaxDistance,Damage:b.DamageMaxValue},
        {Distance:b.DamageHighDistance,Damage:b.DamageHighValue},{Distance:b.DamageLowDistance,Damage:b.DamageLowValue},
        {Distance:b.DamageMinDistance,Damage:b.DamageMinValue}],dist);
    }
    if (volley) {
      const used=volley.hits.get(a)||0;
      const cap=volley.cap??amount;
      amount=volley.cap!=null?Math.min(amount,Math.max(0,cap-used)):Math.max(0,amount-used);
      volley.hits.set(a,used+amount);
    }
    return Math.max(0,amount);
  }
  function impactPaint(p) {
    const d=p.catalog.descriptor,q=d.b.PaintParam||{},distance=Math.hypot(p.pos.x-p.start.x,p.pos.z-p.start.z);
    const near=finite(q.WidthHalfNear,d.radius),far=finite(q.WidthHalfFar,near);
    const middle=finite(q.WidthHalfMiddle,near),nearDistance=finite(q.DistanceXZNear,finite(q.DistanceMiddle,1.1));
    const farDistance=finite(q.DistanceXZFar,20),t=clamp((distance-nearDistance)/Math.max(EPS,farDistance-nearDistance));
    let width=q.WidthHalfNear!=null?lerp(distance<=nearDistance?near:middle,far,t):d.radius;
    const fall=clamp((Math.max(0,p.start.y-p.pos.y)-finite(q.ScaleStartFallDistance,1.5))/Math.max(EPS,finite(q.ScaleEndFallDistance,12)-finite(q.ScaleStartFallDistance,1.5)));
    const factor=lerp(1,finite(q.WidthDepthScaleFall,1),fall);
    width*=factor;
    const depth=lerp(finite(q.DepthScaleNear,d.depth),finite(q.DepthScaleFar,d.depth),t)*factor;
    return {width,depth};
  }
  function collisionRadius(c,what,frames,index=0,bounces=0) {
    const init=finite(c['InitRadiusFor'+what],.2)+finite(c['AfterOffsetInitRadiusFor'+what],0)*index;
    const end=finite(c['EndRadiusFor'+what],init)+finite(c['AfterOffsetEndRadiusFor'+what],0)*index;
    return Math.max(0,lerp(init,end,clamp(frames/Math.max(1,finite(c['ChangeFrameFor'+what],0))))) * catalogBubbleRadiusScale(bounces);
  }
  function lobes(p){
    const s=p.catalog,c=s.descriptor.c,params=c.ParamArray||[c],offsets=c.OffsetArray||[];
    s.lobes ||= params.map(()=>({from:new THREE.Vector3(),to:new THREE.Vector3(),hit:new Hit()}));
    const yaw=Math.atan2(p.vel.x,p.vel.z),cy=Math.cos(yaw),sy=Math.sin(yaw);
    for(let i=0;i<params.length;i++){
      const q=s.lobes[i],v=offsets[i]||{},x=finite(v.X,0),y=finite(v.Y,0),z=finite(v.Z,0);
      q.from.copy(p.prev).add(new THREE.Vector3(x*cy+z*sy,y,-x*sy+z*cy));
      q.to.copy(p.pos).add(new THREE.Vector3(x*cy+z*sy,y,-x*sy+z*cy));q.param=params[i];
    }return s.lobes;
  }
  function advance(p) {
    const s=p.catalog,d=s.descriptor,m=d.m;
    p.prev.copy(p.pos);p.age+=DT;
    if (s.stuck) return;
    if (p.age*HZ>finite(m.GoStraightToBrakeStateFrame,4)+EPS && s.r.family!=='charger') {
      if(s.phase===0) {
        const cap=m.GoStraightStateEndMaxSpeed;
        if(cap!=null&&p.vel.length()>cap*HZ)p.vel.setLength(cap*HZ);
        s.phase=1;
      }
      const free=s.phase===2;
      const drag=free?finite(m.FreeAirResist,defaults.freeDragPerFrame):finite(m.BrakeAirResist,defaults.brakeDragPerFrame);
      const grav=free?finite(m.FreeGravity,defaults.freeGravity/(HZ*HZ)):finite(m.BrakeGravity,defaults.brakeGravity/(HZ*HZ));
      p.vel.multiplyScalar(1-drag);p.vel.y-=grav*HZ;
      if(m.BrakeToFreeStateFrame!=null && p.age*HZ-finite(m.GoStraightToBrakeStateFrame,4)>=m.BrakeToFreeStateFrame ||
        Math.hypot(p.vel.x,p.vel.z)<=finite(m.BrakeToFreeVelocityXZ,defaults.brakeToFreeVelocityXZ/HZ)*HZ &&
        p.vel.y<=finite(m.BrakeToFreeVelocityY,defaults.brakeToFreeVelocityY/HZ)*HZ)s.phase=2;
    }
    const before=s.travel;
    p.pos.addScaledVector(p.vel,DT);
    updateCatalogVisual(p);
    s.travel+=p.prev.distanceTo(p.pos);
    if(s.travel>s.range) { const f=clamp((s.range-before)/(s.travel-before));p.pos.lerpVectors(p.prev,p.pos,f);s.travel=s.range; }
  }
  function finishContact(system,p,h) {
    const s=p.catalog,d=s.descriptor,r=s.r;
    if(p.ghost&&r.sourceActor!=='WeaponSlosherBathtub')return true;
    const at=h.point||p.pos;
    if(r.family==='blaster'){p.pos.copy(at);explosion(system,p,d.b.BlastParam);return true;}
    if(d.key==='arrow') {
      const det=d.b.DetonationParam,frames=d.charge*chargeFrames(r);
      if(det&&(d.charge+EPS>=1||det.IsExplosiveBoltMidCharge&&frames>=finite(chargeParam(r).ChargeFrameMidCharge,30))) {
        s.stuck=true;s.fuse=finite(det.DetonationFrame,45)/HZ;p.pos.copy(at);p.vel.set(0,0,0);p.life=p.age+s.fuse+DT;return false;
      }
    }
    if(r.parameters.BlastParam?.BlastParam){p.pos.copy(at);explosion(system,p,r.parameters.BlastParam.BlastParam);return true;}
    if(r.sourceActor==='WeaponSlosherBathtub'&&h.normal&&catalogBubbleCanBounce(s.groundBounces,h.normal.y)) {
      const ground=h.normal.y>.35;
      const bp=r.parameters.BounceGroupParam.BounceParam.find(b=>(b.UnitOrderNum??0)===d.unit)||{};
      // Keep the established paint owner and footprint untouched (lane ③).
      // The source's first-bounce footprint decays by 15% on each later contact.
      // Retain the existing single paint owner and do not duplicate paint events.
      const bounceRadius=(finite(bp.PaintRadiusFirstBounce,d.radius)+finite(bp.AfterOffsetPaintRadiusFirstBnce,0)*s.index)*Math.pow(.85,s.bounces);
      if(!p.ghost)paint(p.owner,at,bounceRadius);
      const clearance=catalogReboundSeparation(collisionRadius(d.c,'Field',p.age*HZ,s.index,s.bounces+1));
      p.pos.copy(at).addScaledVector(h.normal,clearance);
      p.vel.reflect(h.normal);
      if(!ground)p.vel.multiplyScalar(.8); // sourced wall reflection, no wall-bounce cap
      if(!p.ghost&&(p.owner?.isLocal||!G.camera?.position||G.camera.position.distanceToSquared(at)<625))
        G.fx?.burst(at,h.normal,p.owner.color,{count:5,speed:1.8,size:.09,spread:.8,paint:false});
      // BounceAfterMaxSpeed is explicit only for the smaller bubble group.
      if(bp.BounceAfterMaxSpeed!=null&&p.vel.length()>bp.BounceAfterMaxSpeed*HZ)p.vel.setLength(bp.BounceAfterMaxSpeed*HZ);
      s.bounces++;if(ground)s.groundBounces++;
      updateCatalogVisual(p);return false;
    }
    if(p.ghost)return true;
    const footprint=impactPaint(p);
    paint(p.owner,at,footprint.width,footprint.depth,p.vel.clone().setY(0).normalize(),h.face);
    if((r.family==='roller'||r.family==='brush'||r.family==='slosher')&&
       (p.owner?.isLocal||!G.camera?.position||G.camera.position.distanceToSquared(at)<625))
      G.fx?.burst(at,h.normal||down,p.owner.color,{count:r.family==='roller'?12:9,speed:2.5,
        size:r.family==='roller'?.14:.11,spread:1.2,paint:false});
    return true;
  }
  P._new=function(...args){const p=fresh.apply(this,args);p.catalog=null;p.catalogVisual=null;return p;};
  P._step=function(p,dt){
    if(!p.catalog)return step.call(this,p,dt);
    const s=p.catalog,d=s.descriptor;
    s.carry+=dt;
    while(s.carry+EPS>=DT){
      s.carry=Math.max(0,s.carry-DT);
      if(s.stuck){s.fuse-=DT;if(s.fuse<=EPS){explosion(this,p,d.b.DetonationParam.BlastParam);return true;}continue;}
      const travelBefore=s.travel;
      advance(p);
      const shapes=lobes(p),len=p.prev.distanceTo(p.pos);
      const bounceScale=s.r.sourceActor==='WeaponSlosherBathtub'?s.bounces:0;
      let world=s.hit;world.hit=false;
      for(const q of shapes){
        const f0=collisionRadius(q.param,'Field',(p.age-DT)*HZ,s.index,bounceScale),f1=collisionRadius(q.param,'Field',p.age*HZ,s.index,bounceScale);
        const candidate=sweptWorldHit(G.physics,q.from,q.to,f0,f1,q.hit,true);
        if(candidate.hit&&(!world.hit||candidate.dist<world.dist))world=candidate;
      }
      let stop=world.hit?world.dist/Math.max(EPS,len):Infinity,target=null,boss=null,defense=this.kitDefenseCandidate?.(p);
      if(defense&&defense.distance/Math.max(EPS,len)<stop)stop=defense.distance/Math.max(EPS,len);
      else defense=null;
      const pr1=Math.max(...shapes.map(q=>collisionRadius(q.param,'Player',p.age*HZ,s.index,bounceScale)));
      for(const a of G.actors||[]){
        const friendly=a.team===p.team;
        if(!a.alive||a===p.owner||s.seen.has(a)||friendly&&(a.submerged||d.c.FriendThroughFrameForPlayer==null))continue;
        let entry=null;
        for(const q of shapes){
          const pr0=collisionRadius(q.param,'Player',(p.age-DT)*HZ,s.index,bounceScale),radius=collisionRadius(q.param,'Player',p.age*HZ,s.index,bounceScale);
          const contact=capsuleEntry(q.from,q.to,a.pos,hurtboxRadius(a,PLAYER),hurtboxHeight(a,PLAYER),pr0,radius);
          if(contact!=null&&(entry==null||contact<entry))entry=contact;
        }
        if(friendly&&entry!=null&&((p.age-DT)+DT*entry)*HZ<d.c.FriendThroughFrameForPlayer)continue;
        if(entry!=null&&entry<stop-EPS){stop=entry;target=a;defense=null;}
      }
      if(G.boss){const b=G.boss.segHit(p.prev,p.pos,pr1);const t=b?p.prev.distanceTo(b.point)/Math.max(EPS,len):Infinity;
        if(t<stop-EPS){stop=t;boss=b;target=null;defense=null;}}
      if(!p.ghost&&s.r.family==='charger') {
        const end=p.prev.clone().lerp(p.pos,Math.min(1,stop)),spacing=Math.max(.2,d.radius*.5);
        const count=Math.ceil(p.prev.distanceTo(end)/spacing);
        for(let i=0;i<count;i++)floorPaint(p.owner,p.prev.clone().lerp(end,(i+1)/count),d.radius);
      }
      // Admit every crossed release distance on the unobstructed part of this
      // fixed simulation step, including the final segment before a collision.
      // Restrict this to records with explicit falling-splash physics; other
      // families keep their existing unverified projection path.
      if(!p.ghost&&d.splashDropSpec&&len>EPS){
        const lifeTravel=travelBefore+p.vel.length()*clamp(p.life-(p.age-DT),0,DT);
        const endTravel=Math.min(s.travel,lifeTravel,travelBefore+len*clamp(Math.min(1,stop)));
        const direction=p.vel.clone().setY(0).normalize();
        while(s.dropCount<d.splashCount&&s.nextSplash<=endTravel+EPS){
          const from=p.prev.clone().lerp(p.pos,clamp((s.nextSplash-travelBefore)/len));
          spawnSplashDrop(G,{owner:p.owner,team:p.team,seed:p.seed,salt:s.dropCount,
            from,direction,radius:d.splashRadius,spec:d.splashDropSpec,depth:true});
          s.nextSplash+=Math.max(.1,d.splashSpacing);s.dropCount++;
        }
      }
      if(stop<=1){
        p.pos.lerpVectors(p.prev,p.pos,stop);
        if(defense){defense.onHit(p);return true;}
        if(target){
          if(!p.ghost&&target.team!==p.team){const amount=impactDamage(p,target);if(amount>0)withObjectDamageCause(p,()=>this.applyHit(p.owner,target,amount,p.wid));}
          if(s.r.family==='charger'&&d.charge+EPS>=1&&d.m.ThroughFullCharge!==false){s.seen.add(target);continue;}
          if(s.r.family==='blaster'&&!p.ghost)explosion(this,p,d.b.BlastParam,target);
          if(s.r.parameters.BlastParam?.BlastParam&&!p.ghost)explosion(this,p,s.r.parameters.BlastParam.BlastParam);
          return true;
        }
        if(boss){if(!p.ghost)G.boss.hit(p.owner,impactDamage(p,boss.target||G.boss),boss.target,p.wid,p.pos.clone());return true;}
        // A rebound consumed only the travelled portion of this tick. Counting
        // its unused tail shortened the Bloblobber's remaining sourced reach.
        if(s.r.sourceActor==='WeaponSlosherBathtub'&&world.hit)
          s.travel=travelBefore+len*Math.max(0,Math.min(1,stop));
        if(finishContact(this,p,world))return true;
      }
      if(!p.ghost&&!d.splashDropSpec&&d.splashCount>0&&s.dropCount<d.splashCount&&s.travel>=s.nextSplash){
        const direction=p.vel.clone().setY(0).normalize();
        if(d.sloshFall){
          const drop=spawnSplashDrop(G,{owner:p.owner,team:p.team,seed:p.seed,salt:s.dropCount,from:p.pos.clone(),
            direction,radius:d.splashRadius,spec:d.sloshFall.spec,depth:true,kind:'drop'});
          if(drop)drop.drawRadius=d.sloshFall.drawRadius;
        }else floorPaint(p.owner,p.pos,d.splashRadius,d.depth,direction);
        s.nextSplash+=Math.max(.1,d.splashSpacing);s.dropCount++;
      }
      if(p.age+EPS>=p.life||s.travel+EPS>=s.range){
        if(s.r.family==='blaster')explosion(this,p,d.b.BlastParam);
        return true;
      }
      if(p.pos.y<PLAYER.waterY-1.8)return true;
    }return false;
  };
  P.ghostProjectile=function(a,e){
    const before=this.list.length,result=ghost.call(this,a,e);
    const p=this.list.length>before?this.list[this.list.length-1]:result;
    const r=RECORDS.get(e[4]),meta=e[27]?.s3Catalog;
    const allowed=['normal','blaster-jump','variable','turret','horizontal','vertical','brush','slosh','pellet','arrow','saber-horizontal','saber-vertical'];
    if(p&&r&&!r.legacy&&Array.isArray(meta)&&meta.length===5&&meta[0]===1&&allowed.includes(meta[1])&&
      Number.isSafeInteger(meta[2])&&meta[2]>=0&&meta[2]<30&&Number.isFinite(meta[3])&&meta[3]>=0&&meta[3]<=1){
      try {const d=mode(r,meta[1],meta[2],meta[3]);p.catalog={r,descriptor:d,travel:0,nextSplash:d.splashDropSpec?d.splashFirst:1,dropCount:0,
        hit:new Hit(),seen:new Set(),index:Math.max(0,finite(meta[4],0)),phase:0,stuck:false,fuse:0,carry:0,range:d.range,bounces:0,groundBounces:0};
        p.catalogVisual=catalogVisualSpec(r,d,p.catalog.index);updateCatalogVisual(p);}
      catch { /* malformed visual packet cannot create a gameplay object */ }
    }return result;
  };

  function rolling(runner,r,dt) {
    const a=runner.a,p=r.parameters,roll=p.WeaponRollParam||{},body=p.BodyParam||{};
    const s=state(runner),speed=Math.hypot(a.vel.x,a.vel.z),stick=Math.hypot(a.intent.move?.x||0,a.intent.move?.z||0);
    // Held ZR alone is not an attack: rolling needs stick input, ground
    // contact and movement. Do not paint, hit or drain ink while stationary.
    if(!a.grounded||stick<=EPS||speed<=EPS){s.rollingFrames=0;s.rollingDash=false;s.rollPaint=null;return;}
    const normal=finite(roll.SpeedNormal,.132)*HZ;
    if(s.rollingDash&&speed+EPS<finite(roll.SpeedDashTurnBreak,normal/HZ)*HZ)s.rollingDash=false;
    if(stick>=1-EPS&&speed+EPS>=normal&&!dashTurnBreakActive(a))s.rollingFrames+=dt*HZ;
    else s.rollingFrames=0;
    if(Number.isFinite(roll.DashFrame)&&s.rollingFrames+EPS>=roll.DashFrame)s.rollingDash=true;
    const min=finite(roll.SpeedInkConsumeMin,0)*HZ,max=finite(roll.SpeedInkConsumeMax,.132)*HZ;
    const fraction=max>min?clamp((speed-min)/(max-min)):1;
    const cost=lerp(finite(roll.InkConsumeMinPerFrame,.0001),finite(roll.InkConsumeMaxPerFrame,.001),fraction)*100*HZ*dt*inkMod(a);
    if(!pay(runner,cost,finite(roll.InkRecoverStop,20)/HZ)){runner.rolling=false;s.rollPaint=null;s.rollingFrames=0;s.rollingDash=false;return;}
    const paintParam=body.PaintParam||{},paintMax=finite(paintParam.WidthHalfMax,.9);
    const paintSpeedMin=finite(paintParam.SpeedMin,0)*HZ,paintSpeedMax=finite(paintParam.SpeedMax,max/HZ)*HZ;
    // Missing sparse width defaults stay calibrated; interpolate only an
    // explicit pair, instead of declaring an invented minimum sourced.
    const radius=lerp(finite(paintParam.WidthHalfMin,paintMax),paintMax,
      paintSpeedMax>paintSpeedMin?clamp((speed-paintSpeedMin)/(paintSpeedMax-paintSpeedMin)):1);
    const at=a.pos.clone().addScaledVector(a.aimDir,.6);
    // Drum/brush floor contact follows body yaw, not reticle pitch. An aimed-down
    // camera formerly pushed the ray origin below the floor and lost every mark.
    // Keep the existing 'at' for damage contact; only paint is floor-anchored.
    const stroke=s.rollPaint||(s.rollPaint={
      from:a.pos.clone(),to:a.pos.clone(),point:a.pos.clone(),heading:a.pos.clone(),active:false,
      contact:{point:a.pos.clone(),origin:a.pos.clone(),down:a.pos.clone(),hit:new Hit()},face:-1,
    });
    const heading=stroke.heading.set(Math.sin(a.yaw),0,Math.cos(a.yaw));
    const to=stroke.to.set(a.pos.x+heading.x*.6,a.pos.y+.35,a.pos.z+heading.z*.6);
    const from=stroke.from;
    if (stroke.face!==a.ground?.face) stroke.active=false;
    const distance=stroke.active?Math.hypot(to.x-from.x,to.z-from.z):0;
    // On a normal 60Hz frame there is one native source-width stamp; only a
    // discontinuous long frame is subdivided, with a strict six-splat cap.
    const stamps=Math.min(6,Math.max(1,Math.ceil(distance/Math.max(.28,radius*.52))));
    const depth=1+speed*dt/Math.max(.1,radius);
    for(let i=1;i<=stamps;i++){
      const t=i/stamps;
      stroke.point.set(from.x+(to.x-from.x)*t,to.y,from.z+(to.z-from.z)*t);
      rollingPaint(a,stroke.point,radius,depth,heading,stroke.contact);
    }
    from.copy(to);stroke.active=true;stroke.face=a.ground?.face;
    s.contactTimes ||= new Map();
    for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==a.team&&enemy.pos.distanceTo(at)<radius+PLAYER.radius&&
      G.time-(s.contactTimes.get(enemy)??-Infinity)>=.4&&G.physics.los(at,enemy.pos)){
      withObjectDamageCause({owner:a,type:r.family==='brush'?'brush-body':'roller',catalog:{r}},()=>G.projectiles.applyHit(a,enemy,finite(body.Damage,250)/10,r.id));s.contactTimes.set(enemy,G.time);
    }
  }
  function beginPending(s,frames,fire){s.pending={remaining:frames/HZ,fire};}
  function auto(runner,r,input,s,dt) {
    const a=runner.a,p=r.parameters,t=weaponParam(r);
    if(!input.fire&&!s.burst)return;
    if(s.burst>0){s.burstWait-=dt;if(s.burstWait>EPS)return;}
    else if(runner.cooldown>EPS||s.pending)return;
    const variable=r.sourceActor==='WeaponShooterFlash'&&!input.firePressed&&s.pressed&&s.frame>=finite(t.VariableShotRepeatStartFrame,10);
    const param=variable?p.VariableWeaponParam||t:t;
    const burst=param.TripleShotSpanFrame!=null;
    const fire=()=> {
      if(!pay(runner,finite(param.InkConsume,.0092)*100*inkMod(a))){s.burst=0;runner.cooldown=finite(param.RepeatFrame,6)/HZ;return;}
      const key = r.sourceActor==='WeaponBlasterPrecision'&&!a.grounded?'blaster-jump':s.turret>0?'turret':variable?'variable':'normal';
      emitSingle(runner,r,key);runner.firingT=.35;
      if(burst){if(!s.burst)s.burst=3;s.burst--;s.burstWait=finite(param.RepeatFrame,4)/HZ;
        if(!s.burst)runner.cooldown=(finite(param.TripleShotSpanFrame,8)+finite(param.PostDelayFrame,2))/HZ;}
      else if(r.family!=='blaster') runner.cooldown=finite(param.RepeatFrame,6)/HZ;
    };
    if(r.family==='blaster'){
      runner.cooldown=finite(param.RepeatFrame,50)/HZ;
      beginPending(s,finite(param.PreDelayFrame_HumanShot,10),fire);
    }else fire();
  }
  function charge(runner,r,input,s,dt) {
    const a=runner.a,p=r.parameters,t=chargeParam(r),full=chargeFrames(r);
    if(s.stream>0 && !(input.fire&&t.EnableRecharge)) {
      s.streamElapsed+=dt;
      s.streamF-=dt;
      if(s.streamElapsed>s.streamTime+EPS){s.stream=0;runner.streaming=false;runner.cooldown=finite(t.PostDelayFrame,4)/HZ;return;}
      if(s.streamF<=EPS){
        if(s.streamUsed>=s.streamLimit){s.stream=0;runner.streaming=false;runner.cooldown=finite(t.PostDelayFrame,4)/HZ;return;}
        const variable=r.sourceActor==='WeaponSpinnerDownpour'&&s.streamElapsed*HZ+EPS>=30;
        const transition=variable?clamp((s.streamElapsed*HZ-30)/finite(p.VariableShotParam?.VariableInterpolatedFrame,10)):s.streamCharge;
        emitSingle(runner,r,variable?'variable':'normal',transition);
        const fullRate=p.WeaponFullChargeParam?.RepeatFrame??t.RepeatFrame;
        s.streamUsed++;s.streamF+=finite(variable?p.VariableShotParam?.RepeatFrame:s.streamCharge+EPS>=1?fullRate:t.RepeatFrame,4)/HZ;
        runner.firingT=.35; a.lastFire=0;
      }return;
    }
    if(input.fire && !s.pending && runner.cooldown<=EPS) {
      if(s.rounds>0){
        if(input.firePressed){emitSingle(runner,r,'normal',1);s.rounds--;runner.cooldown=finite(t.PostDelayFrame,15)/HZ;}
        return;
      }
      if(s.stored){s.chargeF=s.stored.frames;s.paid=s.stored.paid;s.stored=null;}
      if(s.stream>0){
        s.chargeF=remainingCharge(r,s);s.paid=inkAt(r,s.chargeF)*inkMod(a);
        s.stream=0;runner.streaming=false;
      }
      const emptyRate=1/finite(t.InkEmptyChargeTimes,3),mod=inkMod(a);
      const airRate=a.grounded?1:Math.min(1,emptyRate*finite(t.AirChargeRateByInkEmpty,1));
      // Chargers retain their minimum-charge window before the airborne
      // slowdown, as the mature Charger owner does. Squiffer/LACT/Sabers
      // override the airborne multiplier and keep normal air charging.
      const minF=r.family==='charger'?finite(t.ChargeFrameMinCharge,8):0;
      const earlyTime=Math.min(dt,Math.max(0,minF-s.chargeF)/HZ);
      const advance=time=>Math.min(full,s.chargeF+Math.min(time,earlyTime)*HZ+
        Math.max(0,time-earlyTime)*HZ*airRate);
      let target=advance(dt),cost=Math.max(0,inkAt(r,target)*mod-s.paid);
      if(a.ink<=EPS)target=Math.min(full,s.chargeF+dt*HZ*Math.min(airRate,emptyRate));
      else if(cost>a.ink+EPS){
        const limit=fundedChargeFrames(r,s.paid+a.ink,mod);
        const earlyFrames=Math.min(Math.max(0,limit-s.chargeF),earlyTime*HZ);
        const fundedTime=Math.min(dt,earlyFrames/HZ+Math.max(0,limit-s.chargeF-earlyFrames)/(HZ*airRate));
        target=Math.min(full,Math.max(s.chargeF,limit)+(dt-fundedTime)*HZ*Math.min(airRate,emptyRate));
      }
      cost=Math.min(Math.max(0,a.ink),Math.max(0,inkAt(r,target)*mod-s.paid));
      if(cost>0){if(!pay(runner,cost))return;s.paid+=cost;}
      s.chargeF=target;
      runner.charging=true;runner.charge=s.chargeF/full;runner.chargeT=runner.charge;a.lastFire=0;
      return;
    }
    if(s.chargeF>0 && !input.fire && !s.pending) {
      // Empty-ink charge animation may continue; emitted power/ammunition
      // must still be funded. Match the existing owners' no-free-shot policy.
      if(s.paid<=EPS||s.paid+EPS<inkAt(r,0)*inkMod(a)){cancel(runner);runner._empty();return;}
      const frames=Math.min(s.chargeF,fundedChargeFrames(r,s.paid,inkMod(a))),c=clamp(frames/full),min=finite(t.ChargeFrameMinCharge,r.family==='splatana'?1:8);
      if(frames+1e-6<min && r.family!=='splatling'&&r.family!=='splatana') {
        // A physical tap still completes the source minimum charge, rather than
        // silently discarding a legitimate short click.
        const cost=Math.max(0,inkAt(r,min)*inkMod(a)-s.paid);
        if(cost>0&&!pay(runner,cost)){cancel(runner);return;}
        s.paid+=cost;
        beginPending(s,min-frames,()=>{s.chargeF=min;charge(runner,r,{fire:false,firePressed:false},s,0);});return;
      }
      if(r.family==='splatling'){
        const shooting=shootingFrames(r,frames);
        // MaxShootingFrame is the last eligible emission time, not an ammo
        // count. Include the initial round at t=0 and advance the actual
        // current-mode cadence (Ballpoint switches from 3F to 5F).
        const fullRate=finite(p.WeaponFullChargeParam?.RepeatFrame,finite(t.RepeatFrame,4));
        const fullShooting=shootingFrames(r,full);
        const firstRounds=Math.ceil(30/finite(t.RepeatFrame,3));
        const fullRounds=r.sourceActor==='WeaponSpinnerDownpour'
          ?firstRounds+Math.floor((fullShooting-firstRounds*finite(t.RepeatFrame,3)+EPS)/finite(p.VariableShotParam?.RepeatFrame,5))+1
          :Math.floor((fullShooting+EPS)/fullRate)+1;
        const roundCost=finite(t.InkConsume,.225)*100*inkMod(a)/fullRounds;
        s.streamLimit=Math.max(0,Math.floor(s.paid/roundCost+EPS));
        if(!s.streamLimit){cancel(runner);runner._empty();return;}
        s.stream=1;s.streamTime=shooting/HZ;s.streamCharge=c;s.streamF=DT;s.streamUsed=0;s.streamElapsed=-DT;
        runner.streaming=true;
      }else if(r.family==='stringer')emitArrow(runner,r,c);
      else if(r.family==='splatana') {
        const swing=p.spl__WeaponSaberParam.SwingParam,key=c+EPS>=1?'saber-vertical':'saber-horizontal';
        if(c<1){
          const amount=finite(swing.InkConsume,.035)*100*inkMod(a),extra=amount-s.paid;
          if(extra>0&&!pay(runner,extra)){cancel(runner);return;}
          if(extra<0)a.ink=Math.min(100,a.ink-extra);
        }
        const forward=a.intent.move?.clone().normalize().dot(a.aimDir)||0;
        const stepped=c+EPS>=1&&a.grounded&&forward>=finite(swing.StepStartStickThresholdY,.9);
        if(stepped){const step=swing.SideStepParam,duration=step.MoveFrame/HZ;
          s.lunge={remaining:duration,direction:a.aimDir.clone().setY(0).normalize(),speed:step.MoveDist/duration};}
        const delay=c+EPS>=1?(stepped?swing.ChargeSwingStepShotBulletFrame:swing.ChargeSwingShotBulletFrame):swing.WeakSwingShotBulletFrame;
        const meleeDelay=c+EPS>=1?(stepped?swing.ChargeSwingStepShotSlashFrame:swing.ChargeSwingShotSlashFrame):swing.WeakSwingShotSlashFrame;
        s.melee={remaining:finite(meleeDelay,3)/HZ,fire:()=>saberMelee(runner,r,key)};
        beginPending(s,finite(delay,6),()=>{emitSingle(runner,r,key,c);runner.firingT=.35;});
        runner.cooldown=(finite(c+EPS>=1?swing.ChargeSwingFrame:swing.WeakSwingFrame,26)+(stepped?finite(swing.ChargeSwingFrameStepAdd,10):0))/HZ;
      }else {
        emitSingle(runner,r,'normal',c);runner.cooldown=finite(t.PostDelayFrame,6)/HZ;
        const n=p.WeaponDivideChargerParam?.FullChargeDivideNum;
        if(c+EPS>=1&&n>1)s.rounds=n-1;
      }
      s.chargeF=0;s.paid=0;runner.charging=false;runner.charge=0;
      if(r.family==='stringer')runner.cooldown=finite(c+EPS>=1?t.FreezeFrameFullCharge:t.FreezeFrameMinCharge,15)/HZ;
    }
  }
  function saberMelee(runner,r,key) {
    const a=runner.a,b=key==='saber-vertical'?r.parameters.BulletSaberSlashVerticalParam:r.parameters.BulletSaberSlashHorizontalParam;
    const sh=b.ShapeParam,ext=sh.BoxHalfExtents,center=sh.BoxCenter,cy=Math.cos(a.yaw),sy=Math.sin(a.yaw);
    for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==a.team){
      const dx=enemy.pos.x-a.pos.x,dz=enemy.pos.z-a.pos.z;
      const x=dx*cy-dz*sy-center.X,z=dx*sy+dz*cy-center.Z;
      if(Math.abs(x)<ext.X+PLAYER.radius&&Math.abs(z)<ext.Z+PLAYER.radius&&
        Math.abs(enemy.pos.y-a.pos.y)<ext.Y+PLAYER.height&&G.physics.los(a.pos,enemy.pos))
        withObjectDamageCause({owner:a,type:'saber-melee',catalog:{r,descriptor:{key}}},()=>G.projectiles.applyHit(a,enemy,b.DamageParam.DamageValue/10,r.id));
    }
  }
  function swing(runner,r,input,s,dt) {
    const p=r.parameters,a=runner.a,brush=r.family==='brush';
    if(input.firePressed&&runner.cooldown<=EPS&&!s.pending){
      const vertical=!brush&&selectRollerFlickVertical(a,runner),key=brush?'brush':vertical?'vertical':'horizontal';
      const t=brush?p.WeaponSwingParam:vertical?p.WeaponVerticalSwingParam:p.WeaponWideSwingParam;
      if(pay(runner,finite(t.InkConsume,.085)*100*inkMod(a),finite(t.InkRecoverStop,43)/HZ)){
        // Individual Wiki tables v11.0/v11.1: sustained cadence is 7/11/14F,
        // with the first interval one frame shorter. These defaults are sparse.
        const communityRepeat=brush?({WeaponBrushMini:7,WeaponBrushNormal:11,WeaponBrushHeavy:14}[r.sourceActor]):null;
        const windup=brush&&s.swingCount>0?1:finite(t.SwingFrame,vertical?31:21);
        beginPending(s,windup,()=>{emitUnits(runner,r,key);runner.firingT=.35;});
        // Account for the different first windup: a 23F first Vincent swing
        // must not unlock a 1F follow-up immediately when that first shot emits.
        runner.cooldown=(brush?windup+communityRepeat-(s.swingCount===0?1:0)-1:windup+finite(t.PostDelayFrame,21))/HZ;
        runner.rolling=false;s.rollPaint=null;s.rollingFrames=0;s.rollingDash=false;s.swingCount++;
      }
    }else if(input.fire&&a.grounded&&!s.pending&&runner.cooldown<=EPS){runner.rolling=true;rolling(runner,r,dt);}
    else {runner.rolling=false;s.rollPaint=null;s.rollingFrames=0;s.rollingDash=false;}
  }
  function slosh(runner,r,input,s) {
    if(!input.fire||runner.cooldown>EPS||s.pending)return;
    const t=weaponParam(r);
    if(pay(runner,finite(t.InkConsume,.076)*100*inkMod(runner.a))) {
      beginPending(s,finite(t.SwingLiftFrame,12),()=>{emitUnits(runner,r,'slosh');runner.firingT=.35;});
      runner.cooldown=finite(t.RepeatFrame,29)/HZ;
    }
  }
  function dualies(runner,r,input,s,dt) {
    const a=runner.a,t=r.parameters.SideStepParam||{};
    if(s.roll){
      const roll=s.roll;roll.remaining-=dt;
      a.vel.x=roll.direction.x*roll.speed;a.vel.z=roll.direction.z*roll.speed;
      if(roll.remaining<=EPS)s.roll=null;
      if(!t.IsShootableInMove)return;
    }
    if(s.turret>0){s.turret=Math.max(0,s.turret-dt);if(s.turret<=EPS)s.rolls=0;}
    const old=runner.cooldown;auto(runner,r,input,s,dt);
    if(runner.cooldown>old+EPS&&s.turret>0)runner.cooldown=finite(weaponParam(r).LapOver_RepeatFrame,4)/HZ;
  }
  const nativeDodge=R.tryDodge,nativeHorizontal=Actor.prototype._horizontal;
  R.tryDodge=function(move){
    const a=this.a,r=a.weapon.catalogRecord;
    if(!r)return nativeDodge?.call(this,move);
    if(r.family!=='dualies'||!a.intent.fire||!move||move.lengthSq()<=EPS)return false;
    const s=state(this),t=r.parameters.SideStepParam||{};
    if(s.roll||s.rolls>=finite(t.RepeatCnt,2)||!pay(this,finite(t.InkConsume,.07)*100*inkMod(a)))return false;
    const duration=finite(t.MoveFrame,12)/HZ,direction=move.clone().setY(0).normalize();
    s.roll={remaining:duration,speed:finite(t.MoveDist,5)/duration,direction};s.rolls++;
    s.turret=finite(s.rolls===finite(t.RepeatCnt,2)?t.UnrelaxFrameMove_Last:t.UnrelaxFrameMove,32)/HZ;
    s.stop=finite(s.rolls===finite(t.RepeatCnt,2)?t.UnrelaxFrameNoSquid_Last:t.UnrelaxFrameNoSquid,32)/HZ+duration;
    a.vel.x=direction.x*s.roll.speed;a.vel.z=direction.z*s.roll.speed;
    this.cooldown=finite(t.UnrelaxFrameNoWeapon,0)/HZ;
    a.character.trigger('dodge');emit('weapon:dodge',{actor:a,dir:direction.clone()});return true;
  };
  Actor.prototype._horizontal=function(dt,...args){
    const s=this.weaponRunner?.catalogState,motion=s?.roll||s?.lunge;
    if(this.weapon.catalogRecord&&motion){this.vel.x=motion.direction.x*motion.speed;this.vel.z=motion.direction.z*motion.speed;return;}
    return nativeHorizontal.call(this,dt,...args);
  };
  const launchedCanopies = new Set();
  const worldUpdate = P.update;
  P.update = function(dt,...args){
    if(Number.isFinite(dt)&&dt>0)for(const c of launchedCanopies){
      c.pos.addScaledVector(c.dir,c.speed*dt);c.remaining-=dt;
      if(c.remaining<=EPS||c.hp<=0){retireDetachedCanopy(c);launchedCanopies.delete(c);continue;}
      floorPaint(c.owner,c.pos,c.paintRadius);showDetachedCanopy(api,c.owner,c,c.weaponId);
      c.contacts ||= new Map();
      for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==c.owner.team&&enemy.pos.distanceTo(c.pos)<c.radius+PLAYER.radius&&G.time-(c.contacts.get(enemy)??-Infinity)>=30/HZ&&G.physics.los(c.pos,enemy.pos)){
        withObjectDamageCause({owner:c.owner,type:'canopy',catalog:{r:c.record}},()=>G.projectiles.applyHit(c.owner,enemy,finite(c.record.parameters.spl__BulletShelterCanopyParam.CanopyDamage,300)/10,c.weaponId));c.contacts.set(enemy,G.time);
      }
    }
    return worldUpdate.call(this,dt,...args);
  };
  function brella(runner,r,input,s,dt) {
    const a=runner.a,p=r.parameters,measure=BRELLA_MEASURED[r.sourceActor],t=weaponParam(r),c=p.spl__BulletShelterCanopyParam||{};
    s.naked=Math.max(0,s.naked-dt);
    const canopy=s.canopy;
    if(canopy){
      canopy.age+=dt;
      {canopy.pos.copy(a.pos).addScaledVector(a.aimDir,measure.radius);canopy.pos.y+=.8;canopy.dir.copy(a.aimDir);
        canopy.open=!!input.fire&&canopy.age*HZ>=measure.open;
        if(canopy.open){
          const total=p.spl__WeaponShelterCanopyParam.InkConsumeUmbrella||0;
          if(!pay(runner,Number.isFinite(measure.launch)?total*100/measure.launch*HZ*dt*inkMod(a):0,finite(t.InkRecoverStopCharge,20)/HZ))canopy.open=false;
        }else if(a.submerged||a.climbing) canopy.hp=Math.min(finite(c.CanopyHP,measure.hp*10)/10,canopy.hp+finite(c.CanopyCureHPPerFrame,25)/10*HZ*dt);
        if(canopy.open&&canopy.age*HZ>=measure.open+measure.launch&&p.spl__WeaponShelterCanopyParam.IsCanopyShot!==false){
          canopy.launched=true;canopy.remaining=finite(c.CanopyFrame,300)/HZ;
          s.naked=finite(c.CanopyNakedFrame,330)/HZ;
          canopy.owner=a;canopy.weaponId=r.id;canopy.speed=finite(c.CanopyInitSpeed,7.92);canopy.paintRadius=finite(c.CanopyPaintRadius,1);
          canopy.record=r;canopy.visualSource=a.character?.weapon?.def;launchedCanopies.add(canopy);showDetachedCanopy(api,a,canopy,r.id);s.canopy=null;
        }}
      if(canopy.open||canopy.launched){
        canopy.contacts ||= new Map();
        for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==a.team&&enemy.pos.distanceTo(canopy.pos)<canopy.radius+PLAYER.radius&&
          G.time-(canopy.contacts.get(enemy)??-Infinity)>=30/HZ&&G.physics.los(canopy.pos,enemy.pos)){
          withObjectDamageCause({owner:a,type:'canopy',catalog:{r}},()=>G.projectiles.applyHit(a,enemy,finite(c.CanopyDamage,300)/10,r.id));canopy.contacts.set(enemy,G.time);
        }
      }
    }
    const continuous=r.sourceActor==='WeaponShelterCompact';
    if(input.fire&&(input.firePressed||continuous)&&runner.cooldown<=EPS&&!s.pending){
      if(!pay(runner,finite(t.InkConsume,.05)*100*inkMod(a)))return;
      if(s.naked<=EPS&&!s.canopy)s.canopy={hp:finite(c.CanopyHP,measure.hp*10)/10,age:0,open:false,launched:false,
        pos:a.pos.clone(),dir:a.aimDir.clone(),radius:finite(c.CanopyColRadius,measure.radius)};
      if(s.canopy&&!s.canopy.launched&&!continuous)s.canopy.age=-measure.startup/HZ;
      beginPending(s,measure.startup,()=>{emitPellets(runner,r);runner.firingT=.35;});
      runner.cooldown=measure.repeat/HZ;
    }
  }
  const nativeDefense=P.kitDefenseCandidate;
  function hurtCanopy(a,s,c,damage){
    const raw=(c.record||a.weapon.catalogRecord).parameters.spl__BulletShelterCanopyParam;
    c.hp=Math.max(0,c.hp-damage*(c.launched?finite(raw.CanopyAttackedDamageRate,.5):1));
    if(c.hp<=0){if(c.launched){retireDetachedCanopy(c);launchedCanopies.delete(c);}else{s.canopy=null;s.naked=finite(raw.CanopyNakedFrame,330)/HZ;}}
  }
  P.kitDefenseCandidate=function(p){
    let best=nativeDefense?.call(this,p)||null;
    const len=p.prev.distanceTo(p.pos);
    const guards=[...(G.actors||[]).map(a=>({a,s:a.weaponRunner?.catalogState,c:a.weaponRunner?.catalogState?.canopy})),...Array.from(launchedCanopies,c=>({a:c.owner,s:c.owner.weaponRunner?.catalogState,c}))];
    for(const {a,s,c} of guards){
      if(!a.alive||a.team===p.team||!c||!c.open&&!c.launched||c.hp<=0)continue;
      const t=capsuleEntry(p.prev,p.pos,c.pos,c.radius,c.radius*2,.1);
      if(t==null||t*len>=(best?.distance??Infinity))continue;
      best={distance:t*len,point:p.prev.clone().lerp(p.pos,t),onHit:shot=>{
        if(shot.ghost)return;
        hurtCanopy(a,s,c,finite(shot.catalog?.descriptor.damage,finite(shot.damage,0)));
      }};
    }return best;
  };
  // Incoming online damage is adjudicated by the victim owner. Remote canopy
  // meshes are deferred with modeling; its front-facing body guard still owns
  // HP here. Arrival-position approximation is documented, not retail parity.
  const nativeApplyHit=P.applyHit;
  P.applyHit=function(attacker,victim,damage,wid,...args){
    const s=victim?.weaponRunner?.catalogState,c=s?.canopy;
    if(G.netm?._applyingHit&&victim&&!victim.remote&&attacker?.remote&&WEAPONS[wid]&&c?.open&&!c.launched&&c.hp>0){
      const incoming=attacker.pos.clone().sub(victim.pos).setY(0).normalize();
      if(victim.aimDir.clone().setY(0).normalize().dot(incoming)>0){hurtCanopy(victim,s,c,Math.max(0,damage));return 'accepted';}
    }
    return nativeApplyHit.call(this,attacker,victim,damage,wid,...args);
  };
  P.clear=function(...args){for(const c of launchedCanopies)retireDetachedCanopy(c);launchedCanopies.clear();for(const a of G.actors||[])if(a.weaponRunner?.catalogState)cancel(a.weaponRunner);return clear.apply(this,args);};
  const startSpecial=Actor.prototype._startSpecial;
  Actor.prototype._startSpecial=function(...args){const before=this.stats?.specials;const result=startSpecial.apply(this,args);
    if(this.stats?.specials>before&&this.weapon.catalogRecord)cancel(this.weaponRunner);return result;};
  on?.('special:use',({actor})=>{if(actor?.weapon?.catalogRecord)cancel(actor.weaponRunner);});
  const repairCanopy=actor=>{
    const r=actor?.weapon?.catalogRecord;
    if(!actor?.alive||actor.remote||!r?.parameters.spl__WeaponShelterCanopyParam?.IsRecoverCanopyByKill)return;
    const s=state(actor.weaponRunner),c=s.canopy;
    s.naked=0;
    if(c&&!c.launched)c.hp=finite(r.parameters.spl__BulletShelterCanopyParam.CanopyHP,2000)/10;
  };
  on?.('splatted',({victim,attacker})=>{if(attacker&&attacker!==victim&&attacker.team!==victim.team)repairCanopy(attacker);});
  on?.('actor:assist',({actor})=>repairCanopy(actor));

  R.update=function(dt,input){
    const a=this.a,r=a.weapon.catalogRecord;
    if(!r)return legacyUpdate.call(this,dt,input);
    const s=state(this);
    // Cancel BEFORE the installed sub preparation owner checks main busy state.
    if(input.sub||a.specialActive||!a.alive)cancel(this);
    if(a.form==='squid'){
      if(s.chargeF>0||s.stream>0)cancel(this,true);
      if(s.stored){s.stored.remaining-=dt;if(s.stored.remaining<=EPS)s.stored=null;}
    }
    legacyUpdate.call(this,dt,{...input,fire:false,firePressed:false});
    if(!Number.isFinite(dt)||dt<=0||a.remote||!a.alive||a.specialActive||a.superJumpState)return;
    // Wiki: orientation changes continuously even while swimming/unarmed.
    // Use explicit per-weapon forward/reverse rates; omitted tilt keep/reset
    // semantics remain unverified, rather than inventing a 45F freeze.
    if(r.family==='stringer'){
      const shot=r.parameters.spl__WeaponStringerParam.ShotParam;
      s.bowTilt=clamp(s.bowTilt+finite(a.grounded?shot.BowJumpTiltSpeedReverse:shot.BowJumpTiltSpeedForward,a.grounded?-12:9)*dt*HZ,
        0,finite(shot.BowTiltDegreeMax,90));
    }
    s.stop=Math.max(0,s.stop-dt);
    if(r.family!=='splatling') {
      s.accuracy.advance(dt);
      if(ANGULAR_FAMILIES.has(r.family))advanceCatalogJumpClock(s,a,r.family,dt);
    }
    if(s.lunge){s.lunge.remaining-=dt;if(s.lunge.remaining<=EPS)s.lunge=null;}
    if(s.melee){s.melee.remaining-=dt;if(s.melee.remaining<=EPS){const melee=s.melee;s.melee=null;melee.fire();}}
    if(s.pending){s.pending.remaining-=dt;if(s.pending.remaining<=EPS){const pending=s.pending;s.pending=null;pending.fire();}}
    if(a.form!=='kid'||input.sub||this.aimingSub){
      this.rolling=false;s.rollPaint=null;s.rollingFrames=0;s.rollingDash=false;
      s.pressed=!!input.fire;return;
    }
    if(r.family==='shooter'||r.family==='blaster')auto(this,r,input,s,dt);
    else if(r.family==='dualies')dualies(this,r,input,s,dt);
    else if(r.family==='roller'||r.family==='brush')swing(this,r,input,s,dt);
    else if(r.family==='slosher')slosh(this,r,input,s);
    else if(r.family==='brella')brella(this,r,input,s,dt);
    else charge(this,r,input,s,dt);
    s.frame=input.fire?s.frame+dt*HZ:0;s.pressed=!!input.fire;
  };
  return {records:RECORDS.size,limits:CATALOG_MODEL_LIMITS};
}

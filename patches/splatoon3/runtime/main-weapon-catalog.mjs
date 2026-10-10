import { MAIN_WEAPON_CATALOG } from './main-weapon-catalog-data.mjs';
import { capsuleEntry, sweptWorldHit } from './weapons-collision.mjs';
import { hurtboxRadius, hurtboxHeight } from './player-hurtbox.mjs';
import { ShooterAccuracy } from './shooter-accuracy.mjs';

// This interpreter owns added MAIN weapons only. Existing seven implementations
// retain their mature owners. Models and retail sub/special-kit expansion are
// separate work. Extracted numbers do not certify Nintendo engine equivalence.
const EPS = 1e-9, HZ = 60, DT = 1 / HZ, RAD = Math.PI / 180;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
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
  'Omitted bullet defaults inherit the existing source-guided 60Hz model.',
  'Source-unit/world calibration and paint ellipse rasterization remain unverified on Switch.',
  'Brella collider dimensions, angular pellet kernel and canopy damage multipliers require hardware comparison.',
  'Wall-drip scheduling, Slosher spiral/spray particles and collision-shape chronology require hardware comparison.',
  'Scoped zoom and held model/animation are existing family placeholders; numerical scope range is independent.',
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
  if (r.family === 'splatling') return finite(p.InkConsume, .225) * 100 * q;
  const minF = finite(p.ChargeFrameMinCharge, 8), midF = p.ChargeFrameMidCharge;
  const min = finite(p.InkConsumeMinCharge, .0225), max = finite(p.InkConsumeFullCharge, .18);
  if (midF != null && p.InkConsumeMidCharge != null)
    return 100 * (frames <= midF ? lerp(min, p.InkConsumeMidCharge, clamp((frames-minF)/(midF-minF)))
      : lerp(p.InkConsumeMidCharge, max, clamp((frames-midF)/(chargeFrames(r)-midF))));
  return 100 * lerp(min, max, clamp((frames-minF)/(chargeFrames(r)-minF)));
}
function stageValue(r, object, stem, frames, fallback = 0) {
  const p = chargeParam(r), minF = finite(p.ChargeFrameMinCharge, 8), fullF = chargeFrames(r);
  const a = finite(object[stem+'Min'], fallback), b = finite(object[stem+'Mid'], a), c = finite(object[stem+'Max'], b);
  const midF = finite(p.ChargeFrameMidCharge, fullF);
  if (object[stem+'Mid'] == null) return lerp(a,c,clamp((frames-minF)/(fullF-minF)));
  return frames <= midF ? lerp(a,b,clamp((frames-minF)/(midF-minF))) : lerp(b,c,clamp((frames-midF)/(fullF-midF)));
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
  return { id:r.id, name:r.names.en, referenceNames:r.names, kind:'catalog', behaviorKind:r.family,
    modelKind:r.modelKind, class:{brush:'Brush',brella:'Brella',stringer:'Stringer',splatana:'Splatana'}[r.family] || existing.class,
    catalogRecord:r, sourceMainActor:r.sourceActor, sub:'bomb', special:'slam', specialCost:190, kitStatus:'original-inkwave-kit',
    blurb:'Main-weapon numerical reference: Splatoon 3 11.3.0. Shared temporary model.',
    range:Math.max(1, actualRange), rangeMax:Math.max(1,actualRange), rangeMin:finite(move.DistanceMinCharge,1),
    matchmakingRange:r.matchmakingRange, damage:damageMax(r), damageMin:finite(p.DamageParam?.ValueMin,0)/10,
    damageMax:damageMax(r), projSpeed:speed, straightTime:finite(move.GoStraightToBrakeStateFrame,4)/HZ,
    fireInterval:Math.max(1,rate)/HZ, chargeTime:charge?chargeFrames(r)/HZ:0,
    moveSpeedFiring:(r.family==='splatana'?finite(p.spl__WeaponSaberParam.SwingParam.WeakSwingMoveVelLimit,.06):finite(t.MoveSpeed, finite(t.SwingMoveSpeed, finite(t.MoveSpeedFullCharge,.072))))*HZ,
    // Saber charge uses DU/frame while simple-family speed fields use source
    // world-units/frame (10 DU/world-unit), hence its separate conversion.
    moveSpeedCharging:finite(t.MoveSpeed_Charge,finite(t.MoveSpeedFullCharge,.04))*(r.family==='splatana'?HZ/10:HZ),
    inkPerShot:finite(t.InkConsume,.0092)*100, inkFull:inkAt(r,chargeFrames(r)),
    inkMin:inkAt(r,finite(t.ChargeFrameMinCharge,8)), inkRecoverStop:finite(t.InkRecoverStop,20)/HZ,
    spreadGround:finite(t.Stand_DegSwerve,0), spreadAir:finite(t.Jump_DegSwerve,0),
    impactRadius:finite(p.PaintParam?.WidthHalfNear, .8),
    stats:{range:u.Range??clamp(actualRange/32),damage:u.Power??clamp(damageMax(r)/160),
      rate:u.Blaze??clamp(6/Math.max(1,rate)),mobility:clamp(finite(t.MoveSpeed,.072)/.1),paint:clamp(actualRange/25)},
  };
}

export function registerMainWeaponCatalog(api) {
  const { WEAPONS, WEAPON_ORDER } = api;
  for (const r of MAIN_WEAPON_CATALOG.records) {
    if (r.legacy) {
      Object.assign(WEAPONS[r.id], { referenceNames:r.names, name:r.names.en, sourceMainActor:r.sourceActor });
    } else {
      if (WEAPONS[r.id]) throw new Error('Duplicate catalog weapon '+r.id);
      WEAPONS[r.id] = definition(r, api);
      WEAPON_ORDER.push(r.id);
    }
  }
  return MAIN_WEAPON_CATALOG;
}

function initialState(r) {
  return { id:r.id, pressed:false, frame:0, pending:null, chargeF:0, paid:0, reserved:0,
    stream:0, streamF:0, streamCharge:0, rounds:0, burst:0, burstWait:0,
    turret:0, rolls:0, roll:null, lunge:null, melee:null, stored:null, swingCount:0, canopy:null, naked:0,
    accuracy:new ShooterAccuracy(weaponParam(r)), shotSerial:0, stop:0 };
}

export function installMainWeaponCatalogRuntime(api, profile) {
  const { WeaponRunner, Projectiles, Actor, THREE, G, PLAYER, Hit, emit, on, WEAPONS } = api;
  const R = WeaponRunner.prototype, P = Projectiles.prototype;
  if (Object.hasOwn(R, INSTALLED)) return;
  Object.defineProperty(R, INSTALLED, { value:true });
  const legacyUpdate = R.update, legacyReset = R.reset, legacyBusy = R.busy, legacyMove = R.moveSpeed;
  const step = P._step, fresh = P._new, ghost = P.ghostProjectile, clear = P.clear;
  const defaults = profile.weaponsFidelity;
  const down = new THREE.Vector3(0,-1,0), floorHit = new Hit(), hit = new Hit();
  const muzzle = new THREE.Vector3(), dir = new THREE.Vector3(), base = new THREE.Vector3();

  function state(runner) {
    const r = runner.a.weapon.catalogRecord;
    if (!runner.catalogState || runner.catalogState.id !== r.id) runner.catalogState = initialState(r);
    return runner.catalogState;
  }
  function cancel(runner, keep = false) {
    const s = runner.catalogState;
    if (!s) return;
    const r = RECORDS.get(s.id), kp = r.parameters.WeaponKeepChargeParam || r.parameters.spl__WeaponStringerParam?.ChargeKeepParam;
    if (keep && s.chargeF > 0 && kp && (kp.EnableKeepChargeAnytime || s.chargeF+EPS >= chargeFrames(r)) &&
      (r.family !== 'stringer' || r.parameters.spl__WeaponStringerParam.IsEnableChargeKeep))
      s.stored = { frames:s.chargeF, paid:s.paid, remaining:finite(kp.KeepChargeFullFrame,75)/HZ };
    else if (!keep) s.stored = null;
    s.pending = null; s.chargeF = 0; s.paid = 0; s.stream = 0; s.burst = 0; s.rounds = 0;
    s.roll = null; s.lunge=null; s.melee=null; s.turret = 0;
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
    const mod = ['roller','brush','splatana'].includes(r.family)?1:this.a.s3?.modifiers?.runSpeedFiring ?? 1;
    if (s?.roll || s?.lunge || s?.turret>EPS && r.sourceActor !== 'WeaponManeuverDual') return 0;
    if (this.rolling) return finite(p.WeaponRollParam?.SpeedDash,finite(p.WeaponRollParam?.SpeedNormal,.132))*HZ;
    if (s?.canopy?.open && !s.canopy.launched) return finite(t.MoveSpeedCharge,.055)*HZ*mod;
    if (this.charging) return w.moveSpeedCharging*mod;
    if (r.sourceActor==='WeaponSpinnerDownpour'&&s?.streamElapsed>=.5)
      return finite(p.VariableShotParam?.MoveSpeed,.05)*HZ*mod;
    return this.firingT>0 || s?.pending || s?.stream>0 ? w.moveSpeedFiring*mod : PLAYER.runSpeed;
  };
  function pay(runner, amount, recover = runner.a.weapon.inkRecoverStop) {
    const a = runner.a;
    if (!Number.isFinite(amount) || amount<0) throw new Error('Non-finite catalog ink cost');
    if (a.ink+EPS < amount) { runner._empty(); return false; }
    a.ink = Math.max(0,a.ink-amount); a.lastFire=0;
    a.s3 ||= {}; a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining||0,recover);
    return true;
  }
  const inkMod = a => a.s3?.modifiers?.inkSaverMain ?? 1;
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
    const options = {seed:0,claimOwner:owner,kind:'shot',face};
    if (direction) { options.stretch=direction; options.stretchAmt=Math.max(0,depth-1); }
    owner.addTurf(G.paint.splat(at,radius,owner.team,options));
  }
  function floorPaint(owner, at, radius, depth=1, direction=null) {
    base.copy(at); base.y += .15;
    const h = G.physics.raycast(base,down,Math.max(4,at.y-owner.pos.y+2),floorHit,true);
    if (h.hit) paint(owner,h.point,radius,depth,direction,h.face);
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
      splashRadius:finite(b.SplashPaintParam?.WidthHalf,finite(sloshSplash?.DrawSizeCollisionPaintParam?.PaintWidthHalf,.4)),
      splashSpacing:finite(splash.DropInterval,finite(splash.SpawnBetweenLength,3)),
      splashCount:Math.max(0,Math.ceil(finite(splash.SplashNumMax,finite(splash.SpawnNum,0))))};
  }
  function spawn(a,r,descriptor,direction,at,options={}) {
    const system=G.projectiles, p=system._new();
    Object.assign(p,{type:'shot',wid:r.id,owner:a,team:a.team,age:0,life:descriptor.life,straight:finite(descriptor.m.GoStraightToBrakeStateFrame,4)/HZ,
      radius:descriptor.radius,damage:descriptor.damage,size:finite(descriptor.c.InitRadiusForPlayer,.2),
      trail:0,trailEvery:0,trailRadius:0,grav:0,drag:0,seed:Math.random(),ghost:!!options.ghost,
      delay:finite(options.delay,0),vis:.1,tail0:.8,tailK:1.3,wob:.02,wobF:26,nose:.3,sats:0,
      inkMeta:{s3Catalog:[1,descriptor.key,descriptor.unit,descriptor.charge,options.index||0]},
      catalog:{r,descriptor,travel:0,nextSplash:1,dropCount:0,hit:new Hit(),seen:new Set(),volley:options.volley,
        index:options.index||0,phase:0,stuck:false,fuse:0,carry:0,range:descriptor.range,bounces:0}});
    p.pos.copy(at);p.prev.copy(at);p.start.copy(at);p.vel.copy(direction).multiplyScalar(options.speed??descriptor.speed);
    p.vel.y += finite(options.lift,0);
    system._push(p);
    return p;
  }
  function emitSingle(runner,r,key='normal',charge=0,volley=null) {
    const a=runner.a, s=state(runner), desc=mode(r,key,0,charge), t=key==='variable'?r.parameters.VariableWeaponParam||r.parameters.VariableShotParam||weaponParam(r):weaponParam(r);
    origin(a);
    const spread=finite(a.grounded?t.Stand_DegSwerve:t.Jump_DegSwerve,0);
    const aim=dir.clone();
    const chance=s.accuracy.shot(a.grounded,runner.s3JumpSpreadAge);
    G.projectiles._spread(aim, Math.random()<chance?spread:spread*.45);
    runner.spread=spread;
    spawn(a,r,desc,aim,muzzle,{volley});notify(a,r,muzzle,aim,charge);
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
        const yaw=finite(u.BaseRotateYDegree,0)+(count===1?0:lerp(-finite(u.SpawnWideDegree,0)/2,finite(u.SpawnWideDegree,0)/2,i/(count-1)));
        const aim=angle(direction,yaw,finite(u.SpawnRotateXDegree,finite(u.SpawnRotateXDegreeBase,0)));
        const velocity=key==='slosh'?finite(a.grounded?u.SpawnSpeedGround:u.SpawnSpeedAir,1):finite(u.SpawnSpeedBase,1);
        const speed=(velocity+finite(u.AfterOffsetSpawnSpeed,0)*i+(Math.random()*2-1)*finite(u.SpawnSpeedRandom,0))*HZ;
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
    for(let i=0;i<count;i++) {
      const off=(i-(count-1)/2)*degrees;
      const aim=angle(direction,a.grounded?off:0,a.grounded?0:off);
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
      const damage=damageBands(bands,distance);if(damage>0)system.applyHit(p.owner,a,damage,p.wid);
    }
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
  function collisionRadius(c,what,frames,index=0) {
    const init=finite(c['InitRadiusFor'+what],.2)+finite(c['AfterOffsetInitRadiusFor'+what],0)*index;
    const end=finite(c['EndRadiusFor'+what],init)+finite(c['AfterOffsetEndRadiusFor'+what],0)*index;
    return Math.max(0,lerp(init,end,clamp(frames/Math.max(1,finite(c['ChangeFrameFor'+what],0)))));
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
    s.travel+=p.prev.distanceTo(p.pos);
    if(s.travel>s.range) { const f=clamp((s.range-before)/(s.travel-before));p.pos.lerpVectors(p.prev,p.pos,f);s.travel=s.range; }
  }
  function finishContact(system,p,h) {
    const s=p.catalog,d=s.descriptor,r=s.r;
    if(p.ghost)return true;
    const at=h.point||p.pos;
    if(r.family==='blaster'){p.pos.copy(at);explosion(system,p,d.b.BlastParam);return true;}
    if(d.key==='arrow') {
      const det=d.b.DetonationParam,frames=d.charge*chargeFrames(r);
      if(det&&(d.charge+EPS>=1||det.IsExplosiveBoltMidCharge&&frames>=finite(chargeParam(r).ChargeFrameMidCharge,30))) {
        s.stuck=true;s.fuse=finite(det.DetonationFrame,45)/HZ;p.pos.copy(at);p.vel.set(0,0,0);p.life=p.age+s.fuse+DT;return false;
      }
    }
    if(r.parameters.BlastParam?.BlastParam){p.pos.copy(at);explosion(system,p,r.parameters.BlastParam.BlastParam);return true;}
    if(r.sourceActor==='WeaponSlosherBathtub'&&s.bounces<3&&h.normal) {
      const bp=r.parameters.BounceGroupParam.BounceParam.find(b=>(b.UnitOrderNum??0)===d.unit)||{};
      paint(p.owner,at,finite(bp.PaintRadiusFirstBounce,d.radius)+finite(bp.AfterOffsetPaintRadiusFirstBnce,0)*s.index);
      p.pos.copy(at);p.pos.addScaledVector(h.normal,.05);
      p.vel.reflect(h.normal);
      // The omitted restitution remains the INKWAVE elastic-bounce model.
      if(bp.BounceAfterMaxSpeed!=null&&p.vel.length()>bp.BounceAfterMaxSpeed*HZ)p.vel.setLength(bp.BounceAfterMaxSpeed*HZ);
      s.bounces++;return false;
    }
    const footprint=impactPaint(p);
    paint(p.owner,at,footprint.width,footprint.depth,p.vel.clone().setY(0).normalize(),h.face);
    return true;
  }
  P._new=function(...args){const p=fresh.apply(this,args);p.catalog=null;return p;};
  P._step=function(p,dt){
    if(!p.catalog)return step.call(this,p,dt);
    const s=p.catalog,d=s.descriptor;
    s.carry+=dt;
    while(s.carry+EPS>=DT){
      s.carry=Math.max(0,s.carry-DT);
      if(s.stuck){s.fuse-=DT;if(s.fuse<=EPS){explosion(this,p,d.b.DetonationParam.BlastParam);return true;}continue;}
      advance(p);
      const shapes=lobes(p),len=p.prev.distanceTo(p.pos);
      let world=s.hit;world.hit=false;
      for(const q of shapes){
        const f0=collisionRadius(q.param,'Field',(p.age-DT)*HZ,s.index),f1=collisionRadius(q.param,'Field',p.age*HZ,s.index);
        const candidate=sweptWorldHit(G.physics,q.from,q.to,f0,f1,q.hit,true);
        if(candidate.hit&&(!world.hit||candidate.dist<world.dist))world=candidate;
      }
      let stop=world.hit?world.dist/Math.max(EPS,len):Infinity,target=null,boss=null,defense=this.kitDefenseCandidate?.(p);
      if(defense&&defense.distance/Math.max(EPS,len)<stop)stop=defense.distance/Math.max(EPS,len);
      else defense=null;
      const pr1=Math.max(...shapes.map(q=>collisionRadius(q.param,'Player',p.age*HZ,s.index)));
      for(const a of G.actors||[]){
        const friendly=a.team===p.team;
        if(!a.alive||a===p.owner||s.seen.has(a)||friendly&&(a.submerged||d.c.FriendThroughFrameForPlayer==null))continue;
        let entry=null;
        for(const q of shapes){
          const pr0=collisionRadius(q.param,'Player',(p.age-DT)*HZ,s.index),radius=collisionRadius(q.param,'Player',p.age*HZ,s.index);
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
      if(stop<=1){
        p.pos.lerpVectors(p.prev,p.pos,stop);
        if(defense){defense.onHit(p);return true;}
        if(target){
          if(!p.ghost&&target.team!==p.team){const amount=impactDamage(p,target);if(amount>0)this.applyHit(p.owner,target,amount,p.wid);}
          if(s.r.family==='charger'&&d.charge+EPS>=1&&d.m.ThroughFullCharge!==false){s.seen.add(target);continue;}
          if(s.r.family==='blaster'&&!p.ghost)explosion(this,p,d.b.BlastParam,target);
          if(s.r.parameters.BlastParam?.BlastParam&&!p.ghost)explosion(this,p,s.r.parameters.BlastParam.BlastParam);
          return true;
        }
        if(boss){if(!p.ghost)G.boss.hit(p.owner,impactDamage(p,boss.target||G.boss),boss.target,p.wid,p.pos.clone());return true;}
        if(finishContact(this,p,world))return true;
      }
      if(!p.ghost&&d.splashCount>0&&s.dropCount<d.splashCount&&s.travel>=s.nextSplash){
        floorPaint(p.owner,p.pos,d.splashRadius,d.depth,p.vel.clone().setY(0).normalize());
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
      try {const d=mode(r,meta[1],meta[2],meta[3]);p.catalog={r,descriptor:d,travel:0,nextSplash:1,dropCount:0,
        hit:new Hit(),seen:new Set(),index:Math.max(0,finite(meta[4],0)),phase:0,stuck:false,fuse:0,carry:0,range:d.range,bounces:0};}
      catch { /* malformed visual packet cannot create a gameplay object */ }
    }return result;
  };

  function rolling(runner,r,dt) {
    const a=runner.a,p=r.parameters,roll=p.WeaponRollParam||{},body=p.BodyParam||{};
    const speed=Math.hypot(a.vel.x,a.vel.z),max=finite(roll.SpeedInkConsumeMax,.132)*HZ;
    const cost=lerp(finite(roll.InkConsumeMinPerFrame,.0001),finite(roll.InkConsumeMaxPerFrame,.001),clamp(speed/max))*100*HZ*dt*inkMod(a);
    if(!pay(runner,cost,finite(roll.InkRecoverStop,20)/HZ)){runner.rolling=false;return;}
    const at=a.pos.clone().addScaledVector(a.aimDir,.6),radius=finite(body.PaintParam?.WidthHalfMax,.9);
    floorPaint(a,at,radius,1+speed*dt/Math.max(.1,radius),a.aimDir);
    const s=state(runner);s.contactTimes ||= new Map();
    for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==a.team&&enemy.pos.distanceTo(at)<radius+PLAYER.radius&&
      G.time-(s.contactTimes.get(enemy)??-Infinity)>=.4&&G.physics.los(at,enemy.pos)){
      G.projectiles.applyHit(a,enemy,finite(body.Damage,250)/10,r.id);s.contactTimes.set(enemy,G.time);
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
      else runner.cooldown=finite(param.RepeatFrame,6)/HZ;
    };
    if(r.family==='blaster')beginPending(s,finite(param.PreDelayFrame_HumanShot,10),fire);else fire();
  }
  function charge(runner,r,input,s,dt) {
    const a=runner.a,p=r.parameters,t=chargeParam(r),full=chargeFrames(r);
    if(s.stream>0 && !(input.fire&&t.EnableRecharge)) {
      s.streamElapsed+=dt;
      s.streamF-=dt;
      if(s.streamF<=EPS){
        const variable=r.sourceActor==='WeaponSpinnerDownpour'&&s.streamElapsed*HZ>=30;
        emitSingle(runner,r,variable?'variable':'normal',s.streamCharge);s.stream--;
        const fullRate=p.WeaponFullChargeParam?.RepeatFrame??t.RepeatFrame;
        s.streamUsed++;s.streamF+=finite(variable?p.VariableShotParam?.RepeatFrame:s.streamCharge+EPS>=1?fullRate:t.RepeatFrame,4)/HZ;
        runner.firingT=.35; a.lastFire=0;
        if(s.stream===0){runner.streaming=false;runner.cooldown=finite(t.PostDelayFrame,4)/HZ;}
      }return;
    }
    if(input.fire && !s.pending && runner.cooldown<=EPS) {
      if(s.rounds>0){
        if(input.firePressed){emitSingle(runner,r,'normal',1);s.rounds--;runner.cooldown=finite(t.PostDelayFrame,15)/HZ;}
        return;
      }
      if(s.stored){s.chargeF=s.stored.frames;s.paid=s.stored.paid;s.stored=null;}
      if(s.stream>0){s.stream=0;runner.streaming=false;}
      const rate=a.ink<=EPS?1/finite(t.InkEmptyChargeTimes,3):1;
      const target=Math.min(full,s.chargeF+dt*HZ*rate),cost=Math.max(0,inkAt(r,target)*inkMod(a)-s.paid);
      if(a.ink+EPS>=cost){if(cost>0&&!pay(runner,cost))return;s.paid+=cost;s.chargeF=target;}
      runner.charging=true;runner.charge=s.chargeF/full;runner.chargeT=runner.charge;a.lastFire=0;
      return;
    }
    if(s.chargeF>0 && !input.fire && !s.pending) {
      const frames=s.chargeF,c=clamp(frames/full),min=finite(t.ChargeFrameMinCharge,r.family==='splatana'?1:8);
      if(frames+EPS<min && r.family!=='splatling'&&r.family!=='splatana') {
        // A physical tap still completes the source minimum charge, rather than
        // silently discarding a legitimate short click.
        const cost=Math.max(0,inkAt(r,min)*inkMod(a)-s.paid);
        if(cost>0&&!pay(runner,cost)){cancel(runner);return;}
        s.paid+=cost;
        beginPending(s,min-frames,()=>{s.chargeF=min;charge(runner,r,{fire:false,firePressed:false},s,0);});return;
      }
      if(r.family==='splatling'){
        const first=finite(t.ChargeFrame_First,48),maxFirst=finite(t.MaxShootingFrame_First,80);
        const maxSecond=c+EPS>=1?finite(p.WeaponFullChargeParam?.MaxShootingFrame_Second,finite(t.MaxShootingFrame_Second,160)):finite(t.MaxShootingFrame_Second,160);
        const shooting=frames<=first?maxFirst*frames/first:lerp(maxFirst,maxSecond,(frames-first)/(full-first));
        const rate=c+EPS>=1?finite(p.WeaponFullChargeParam?.RepeatFrame,finite(t.RepeatFrame,4)):finite(t.RepeatFrame,4);
        s.stream=Math.max(1,Math.ceil(shooting/rate));s.streamCharge=c;s.streamF=0;s.streamUsed=0;s.streamElapsed=0;
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
        G.projectiles.applyHit(a,enemy,b.DamageParam.DamageValue/10,r.id);
    }
  }
  function swing(runner,r,input,s,dt) {
    const p=r.parameters,a=runner.a,brush=r.family==='brush';
    if(input.firePressed&&runner.cooldown<=EPS&&!s.pending){
      const vertical=!brush&&!a.grounded,key=brush?'brush':vertical?'vertical':'horizontal';
      const t=brush?p.WeaponSwingParam:vertical?p.WeaponVerticalSwingParam:p.WeaponWideSwingParam;
      if(pay(runner,finite(t.InkConsume,.085)*100*inkMod(a),finite(t.InkRecoverStop,43)/HZ)){
        // v10.0.x community measurements: defaults are not in the sparse table.
        const communityRepeat=brush?({WeaponBrushMini:6,WeaponBrushNormal:10,WeaponBrushHeavy:13}[r.sourceActor]):null;
        const windup=brush&&s.swingCount>0?1:finite(t.SwingFrame,vertical?31:21);
        beginPending(s,windup,()=>{emitUnits(runner,r,key);runner.firingT=.35;});
        runner.cooldown=(brush?Math.max(windup,communityRepeat):windup+finite(t.PostDelayFrame,21))/HZ;
        runner.rolling=false;s.swingCount++;
      }
    }else if(input.fire&&a.grounded&&!s.pending&&runner.cooldown<=EPS){runner.rolling=true;rolling(runner,r,dt);}
    else runner.rolling=false;
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
  function brella(runner,r,input,s,dt) {
    const a=runner.a,p=r.parameters,measure=BRELLA_MEASURED[r.sourceActor],t=weaponParam(r),c=p.spl__BulletShelterCanopyParam||{};
    s.naked=Math.max(0,s.naked-dt);
    const canopy=s.canopy;
    if(canopy){
      canopy.age+=dt;
      if(canopy.launched){canopy.pos.addScaledVector(canopy.dir,finite(c.CanopyInitSpeed,7.92)*dt);floorPaint(a,canopy.pos,finite(c.CanopyPaintRadius,1));
        canopy.remaining-=dt;if(canopy.remaining<=EPS||canopy.hp<=0)s.canopy=null;}
      else {canopy.pos.copy(a.pos).addScaledVector(a.aimDir,measure.radius);canopy.pos.y+=.8;canopy.dir.copy(a.aimDir);
        canopy.open=!!input.fire&&canopy.age*HZ>=measure.open;
        if(canopy.open){
          const total=p.spl__WeaponShelterCanopyParam.InkConsumeUmbrella||0;
          if(!pay(runner,Number.isFinite(measure.launch)?total*100/measure.launch*HZ*dt*inkMod(a):0,finite(t.InkRecoverStopCharge,20)/HZ))canopy.open=false;
        }else canopy.hp=Math.min(finite(c.CanopyHP,measure.hp*10)/10,canopy.hp+finite(c.CanopyCureHPPerFrame,25)/10*HZ*dt);
        if(canopy.open&&canopy.age*HZ>=measure.open+measure.launch&&p.spl__WeaponShelterCanopyParam.IsCanopyShot!==false){
          canopy.launched=true;canopy.remaining=finite(c.CanopyFrame,300)/HZ;
          s.naked=finite(c.CanopyNakedFrame,330)/HZ;
        }}
      if(canopy.open||canopy.launched){
        canopy.contacts ||= new Map();
        for(const enemy of G.actors||[])if(enemy.alive&&enemy.team!==a.team&&enemy.pos.distanceTo(canopy.pos)<canopy.radius+PLAYER.radius&&
          G.time-(canopy.contacts.get(enemy)??-Infinity)>=30/HZ&&G.physics.los(canopy.pos,enemy.pos)){
          G.projectiles.applyHit(a,enemy,finite(c.CanopyDamage,300)/10,r.id);canopy.contacts.set(enemy,G.time);
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
    const raw=a.weapon.catalogRecord.parameters.spl__BulletShelterCanopyParam;
    c.hp=Math.max(0,c.hp-damage*(c.launched?finite(raw.CanopyAttackedDamageRate,.5):1));
    if(c.hp<=0){s.canopy=null;s.naked=finite(raw.CanopyNakedFrame,330)/HZ;}
  }
  P.kitDefenseCandidate=function(p){
    let best=nativeDefense?.call(this,p)||null;
    const len=p.prev.distanceTo(p.pos);
    for(const a of G.actors||[]){const s=a.weaponRunner?.catalogState,c=s?.canopy;
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
  P.clear=function(...args){for(const a of G.actors||[])if(a.weaponRunner?.catalogState)cancel(a.weaponRunner);return clear.apply(this,args);};
  const startSpecial=Actor.prototype._startSpecial;
  Actor.prototype._startSpecial=function(...args){const before=this.stats?.specials;const result=startSpecial.apply(this,args);
    if(this.stats?.specials>before&&this.weapon.catalogRecord)cancel(this.weaponRunner);return result;};
  on?.('special:use',({actor})=>{if(actor?.weapon?.catalogRecord)cancel(actor.weaponRunner);});

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
    s.stop=Math.max(0,s.stop-dt);s.accuracy.advance(dt);
    if(s.lunge){s.lunge.remaining-=dt;if(s.lunge.remaining<=EPS)s.lunge=null;}
    if(s.melee){s.melee.remaining-=dt;if(s.melee.remaining<=EPS){const melee=s.melee;s.melee=null;melee.fire();}}
    if(s.pending){s.pending.remaining-=dt;if(s.pending.remaining<=EPS){const pending=s.pending;s.pending=null;pending.fire();}}
    if(a.form!=='kid'||input.sub||this.aimingSub){s.pressed=!!input.fire;return;}
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

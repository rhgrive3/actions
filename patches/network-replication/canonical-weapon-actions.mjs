// Input contract for a separate trusted native simulation. This module does
// not install into the live client, simulate a copied weapon formula, or mint
// hit proof from owner-authored births. The native Actor/WeaponRunner remains
// the only owner of charge, cadence, ink, gauge, pellets and delayed devices.
import { MAIN_WEAPON_CATALOG } from '../splatoon3/runtime/main-weapon-catalog-data.mjs';

export const CANONICAL_WEAPON_ACTION_VERSION = 1;
export const CANONICAL_WEAPON_STEP = 1 / 60;
const MAX_TICK = 1e9, MAX_COORD = 2000;
const BUTTONS = Object.freeze(['fire','sub','jump','squid','special']);
const OPTIONAL_BUTTONS = Object.freeze(['booyah','throw']);
const COMMAND_KEYS = new Set(['nid','owner','life','input','aim','aimPoint']);
const INPUT_KEYS = new Set([...BUTTONS,...OPTIONAL_BUTTONS,'move']);
const RESULT_KEYS = new Set(['ink','specialGauge','charge','chargeF','cooldown','damage',
  'births','pellets','projectiles','velocity','vel','position','pos','weapon','weaponId',
  'gear','modifiers','recoverStop','resources']);
const own = (o,k) => Object.hasOwn(o,k);
const record = o => !!o && typeof o === 'object' && !Array.isArray(o);
const id = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_TICK;
const principal = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const epochId = value => principal(value) || id(value);
const freeze = Object.freeze;
const vector = (v,n,bound) => Array.isArray(v) && v.length === n &&
  Array.from({length:n},(_,i)=>i).every(i=>own(v,i)&&Number.isFinite(v[i])&&Math.abs(v[i])<=bound);
const rejected = reason => freeze({ok:false,reason});
const records = new Map(MAIN_WEAPON_CATALOG.records.map(r=>[r.id,r]));

export const CANONICAL_WEAPON_ACTION_SCHEMA = freeze({
  version:CANONICAL_WEAPON_ACTION_VERSION,
  step:CANONICAL_WEAPON_STEP,
  requiredInput:BUTTONS,
  optionalInput:OPTIONAL_BUTTONS,
  requiredCommand:freeze(['nid','owner','life','input','aim']),
  optionalCommand:freeze(['aimPoint']),
  outcomeOwner:'native Actor.update -> WeaponRunner -> Projectiles',
  resourceOwner:'trusted initial spawn/gear + native resource clocks',
  legacyWire:'birth/fire/snapshot rows are observations, not complete input history',
});

const INPUT_MODEL = freeze({
  shooter:'held native cadence/burst',blaster:'held native windup/cadence',
  roller:'native press/windup/flick + held rolling contact',
  brush:'native press/swing + held dash contact',
  charger:'native hold/release + stored/divided charge',
  slosher:'held native windup/multi-unit release',
  splatling:'native hold/release + funded stream/recharge',
  dualies:'held native cadence + move/jump roll/turret',
  brella:'held native pellet/canopy/deployment',
  stringer:'native hold/release + mid/full charge/keep',
  splatana:'native press/hold/release + slash/step/pellet groups',
});
const NATIVE_BUDGET_KEYS = freeze(['inkPerShot','inkFull','inkMin','inkRecoverStop',
  'inkTankScale','fireInterval','chargeTime','firstChargeTime','windup',
  'flickInk','verticalInk','flickWindup','verticalWindup','rollInk','rollTime',
  'rollInkPerMeter','rollInkMinPerFrame','rollInkMaxPerFrame','lockTime']);
const SOURCE_BUDGET = /^(?:InkConsume.*|InkRecoverStop.*|ChargeFrame.*|KeepCharge.*Frame.*|RepeatFrame|RepeatCnt|PreDelayFrame.*|PostDelayFrame|SwingFrame|SwingRepeatFrame|SwingLiftFrame|WideSwingFrame|VerticalSwingFrame|UnitDelayFrame|AfterOffsetDelayFrame|BulletNum|DepletionBulletNum|GroupNum|ArrowNum|SpawnNum|SplitNum|LoopNum|FullChargeDivideNum|ShotRepeatStartFrame|MaxShootingFrame.*|TripleShotSpanFrame|MoveFrame|UnrelaxFrame.*|Canopy.*Frame|PostNo.*Frame.*|ReserveAcceptFrame|InputReqAcceptFrame)$/;

function sourceBudgetFields(value,path='',out=[]) {
  if (!record(value) && !Array.isArray(value)) return out;
  for (const key of Object.keys(value)) {
    const next=path+'/'+key,item=value[key];
    if (Number.isFinite(item) && SOURCE_BUDGET.test(key)) out.push(freeze({path:next,value:item}));
    else if (record(item) || Array.isArray(item)) sourceBudgetFields(item,next,out);
  }
  return out;
}
function numbers(value,keys) {
  const out={};for(const key of keys)if(Number.isFinite(value?.[key]))out[key]=value[key];
  return freeze(out);
}
function scalars(value) {
  const out={};for(const [key,v]of Object.entries(value||{}))
    if(Number.isFinite(v)||typeof v==='boolean'||typeof v==='string'||v===null)out[key]=v;
  return freeze(out);
}
function weaponRecord(weapon,registry) {
  if(weapon?.catalogRecord && records.has(weapon.catalogRecord.id))return records.get(weapon.catalogRecord.id);
  if(records.has(weapon?.id))return records.get(weapon.id);
  let key=weapon?.id,seen=new Set();
  while(typeof key==='string'&&!seen.has(key)){
    seen.add(key);if(records.has(key))return records.get(key);
    key=registry[key]?.variantOf;
  }
  return null;
}
function describeWeapon(weapon,registry,subRegistry,specialRegistry) {
  const r=weaponRecord(weapon,registry);
  if(!r)return null;
  const sub=own(subRegistry,weapon.sub)?subRegistry[weapon.sub]:null;
  const special=own(specialRegistry,weapon.special)?specialRegistry[weapon.special]:null;
  if(!sub||!special)return null;
  return freeze({
    weaponId:weapon.id,baseId:r.id,family:r.family,legacy:r.legacy===true,
    inputModel:INPUT_MODEL[r.family],
    source:freeze({version:MAIN_WEAPON_CATALOG.referenceVersion,commit:MAIN_WEAPON_CATALOG.sourceCommit,
      actor:r.sourceActor,path:r.sourcePath,sha256:r.sourceSha256}),
    sourceBudgetFields:freeze(sourceBudgetFields(r.parameters)),
    // These are the actual installed/equipped definitions, including native
    // gear copies and selected kits. They are inspection data, not a second
    // affordability algorithm or a source of owner-supplied state.
    nativeMainBudget:numbers(weapon,NATIVE_BUDGET_KEYS),
    sub:freeze({id:weapon.sub,request:'intent.sub',native:scalars(sub)}),
    special:freeze({id:weapon.special,request:'intent.special + native follow-up inputs',
      cost:weapon.specialCost,native:scalars(special)}),
    births:'native actual list/device/contact emission; never one proof per requested fire',
  });
}

/** Diagnostic inspection of trusted native state. Never accepts wire state. */
export function inspectCanonicalWeaponState(actor) {
  const r=actor?.weaponRunner,s=r?.catalogState,sp=actor?._s3AllSpecialState;
  return freeze({
    weaponId:actor?.weaponId,alive:actor?.alive,form:actor?.form,grounded:actor?.grounded,
    submerged:actor?.submerged,ink:actor?.ink,special:actor?.special,
    specialCost:typeof actor?.specialCost==='function'?actor.specialCost():actor?.weapon?.specialCost,
    lastFire:actor?.lastFire,recoverStopRemaining:actor?.s3?.recoverStopRemaining,
    spawn:actor?.s3?.squidSpawn?scalars(actor.s3.squidSpawn):null,
    superJump:actor?.superJumpState?scalars(actor.superJumpState):null,
    runner:scalars(r),catalog:s?scalars(s):null,
    stored:s?.stored?scalars(s.stored):null,
    specialState:sp?scalars(sp):actor?.specialActive?scalars(actor.specialActive):null,
    modifiers:scalars(actor?.s3?.modifiers),
  });
}

/**
 * One controller for one isolated native realm. register() receives a trusted
 * Actor produced by native spawn/gear setup. It does not hydrate resources
 * from a snapshot. prepare() is pure; the scheduler may validate every actor
 * before apply-all and the native Actor/Projectiles phases. A native exception
 * must poison the caller's session rather than roll back a partial game tick.
 */
export function createCanonicalWeaponActions(nativeApi) {
  const {Actor,WEAPONS,SUB,SPECIALS}=nativeApi||{};
  if(typeof Actor!=='function'||!record(WEAPONS)||!record(SUB)||!record(SPECIALS))
    throw new TypeError('Canonical actions require the installed native API');
  for(const r of records.values())if(!describeWeapon(WEAPONS[r.id],WEAPONS,SUB,SPECIALS))
    throw new Error('Unresolved canonical main/kit: '+r.id);
  const byNid=new Map(),byActor=new WeakMap(),tickets=new WeakMap();
  const resolved = actor => !!weaponRecord(actor.weapon,WEAPONS) &&
    own(SUB,actor.weapon.sub) && !!SUB[actor.weapon.sub] &&
    own(SPECIALS,actor.weapon.special) && !!SPECIALS[actor.weapon.special];

  function register(actor,{owner,life,epoch,firstTick=0}={}) {
    if(!(actor instanceof Actor)||!id(actor.nid)||!principal(owner)||!id(life)||!epochId(epoch)||!id(firstTick))
      throw new TypeError('Trusted native actor, owner, life, epoch and first tick are required');
    if(!resolved(actor))throw new Error('Unresolved equipped native weapon/kit');
    const prior=byNid.get(actor.nid),old=byActor.get(actor);
    if(prior)prior.active=false;if(old)old.active=false;
    const entry={actor,nid:actor.nid,owner,life,epoch,lastTick:firstTick-1,active:true};
    byNid.set(entry.nid,entry);byActor.set(actor,entry);
    return freeze({nid:entry.nid,owner,life,epoch,nextTick:firstTick});
  }
  function prepare(raw,{tick,from}={}) {
    if(!record(raw))return rejected('invalid-command');
    const keys=Object.keys(raw);
    if(keys.some(k=>RESULT_KEYS.has(k)))return rejected('owner-result-field');
    if(keys.some(k=>!COMMAND_KEYS.has(k)))return rejected('unknown-command-field');
    if(!id(tick)||!principal(from)||!id(raw.nid)||!id(raw.life)||!principal(raw.owner))return rejected('invalid-envelope');
    const entry=byNid.get(raw.nid);
    if(!entry?.active)return rejected('unregistered-actor');
    if(entry.owner!==from||raw.owner!==from)return rejected('owner-mismatch');
    if(entry.life!==raw.life)return rejected('life-mismatch');
    if(tick!==entry.lastTick+1)return rejected('nonconsecutive-tick');
    if(!resolved(entry.actor))return rejected('unresolved-native-weapon');
    const input=raw.input;
    if(!record(input)||BUTTONS.some(k=>!own(input,k)||typeof input[k]!=='boolean')||!own(input,'move'))
      return rejected('incomplete-input');
    const inputKeys=Object.keys(input);
    if(inputKeys.some(k=>RESULT_KEYS.has(k)))return rejected('owner-result-field');
    if(inputKeys.some(k=>!INPUT_KEYS.has(k)))return rejected('unknown-input-field');
    if(OPTIONAL_BUTTONS.some(k=>own(input,k)&&typeof input[k]!=='boolean'))return rejected('invalid-button');
    if(!vector(input.move,2,1)||Math.hypot(...input.move)>1+1e-9)return rejected('invalid-move');
    if(!vector(raw.aim,2,MAX_TICK))return rejected('invalid-aim');
    if(own(raw,'aimPoint')&&!vector(raw.aimPoint,3,MAX_COORD))return rejected('invalid-aim-point');
    const normalized={};
    for(const key of BUTTONS)normalized[key]=input[key];
    for(const key of OPTIONAL_BUTTONS)normalized[key]=input[key]??false;
    normalized.move=freeze(input.move.slice());
    const request=freeze({nid:raw.nid,owner:from,life:raw.life,input:freeze(normalized),
      aim:freeze(raw.aim.slice()),...(own(raw,'aimPoint')?{aimPoint:freeze(raw.aimPoint.slice())}:{})});
    const token=freeze({});tickets.set(token,{entry,tick,request,used:false});
    return freeze({ok:true,token,request});
  }
  function apply(token) {
    const ticket=tickets.get(token);
    if(!ticket||ticket.used)return rejected('invalid-or-used-token');
    const {entry,tick,request}=ticket;
    if(!entry.active||byNid.get(entry.nid)!==entry||byActor.get(entry.actor)!==entry)
      return rejected('retired-epoch');
    if(tick!==entry.lastTick+1)return rejected('nonconsecutive-tick');
    const actor=entry.actor;
    // Resource/charge/cooldown fields are deliberately absent. Even empty-ink
    // fire is a legal input request: native dry/depleted/charge admission owns
    // whether it produces zero, one, many or delayed births/contact work.
    ticket.used=true;entry.lastTick=tick;
    for(const key of [...BUTTONS,...OPTIONAL_BUTTONS])actor.intent[key]=request.input[key];
    actor.intent.move.set(request.input.move[0],0,request.input.move[1]);
    actor.aimYaw=request.aim[0];actor.aimPitch=request.aim[1];
    if(request.aimPoint)actor.aimPoint.set(...request.aimPoint);
    return freeze({ok:true,nid:entry.nid,owner:entry.owner,life:entry.life,epoch:entry.epoch,tick,
      weaponId:actor.weaponId,outcome:'input-applied; native action not yet evaluated'});
  }
  function forget(actor) {
    const entry=byActor.get(actor);if(!entry)return false;
    entry.active=false;byActor.delete(actor);
    if(byNid.get(entry.nid)===entry)byNid.delete(entry.nid);
    return true;
  }
  return freeze({register,prepare,apply,forget,
    describe:weaponId=>describeWeapon(WEAPONS[weaponId],WEAPONS,SUB,SPECIALS),
    describeActor:actor=>describeWeapon(actor?.weapon,WEAPONS,SUB,SPECIALS),
    inspect:inspectCanonicalWeaponState,
    baseIds:freeze([...records.keys()]),
    subIds:freeze(Object.keys(SUB)),specialIds:freeze(Object.keys(SPECIALS)),
    describeSlot:(slot,key)=>{
      const registry=slot==='sub'?SUB:slot==='special'?SPECIALS:null;
      return registry&&own(registry,key)?freeze({slot,id:key,native:scalars(registry[key]),
        owner:'native Actor/WeaponRunner and surviving projectile/device clocks'}):null;
    },
  });
}

/** A legacy result row cannot be promoted to a complete command history. */
export function legacyWeaponActionRequirement(row) {
  if(!Array.isArray(row))return rejected('invalid-legacy-row');
  const type=row[1];
  if(type==='p'||type==='b'||type==='ev'||type==='ac'||type==='tr')return freeze({
    ok:false,reason:'legacy-result-is-not-input',kind:type,
    required:freeze(['trusted initial spawn/gear/resources','consecutive authenticated 60Hz input commands',
      'native charge/keep/stream/hold clocks','trusted world and native projectile/device phases']),
  });
  return rejected('unsupported-legacy-row');
}

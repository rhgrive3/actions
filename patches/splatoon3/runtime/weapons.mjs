import { installWeaponAccuracy, withShotBias } from './weapon-accuracy.mjs';
import { applyMainDirectHit, withMainDirectDamage } from './private-tracking.mjs';
import { ShooterAccuracy } from './shooter-accuracy.mjs';
import { DualiesAccuracy } from './dualies-accuracy.mjs';
import { shooterMovementRemaining, shooterMovementSpeed } from './shooter-movement.mjs';
import { blasterStartupWindup } from './issue-465-blaster-startup.mjs';
import { installContactRecovery } from './contact-recovery.mjs';
import { installFinalDamage, damageGroupId, withFinalDamageGroup } from './final-damage.mjs';
import { installSplatlingRadiusCharge } from './splatling-radius-charge.mjs';
import { installWeaponEdgecases } from './weapon-edgecases.mjs';
import { installSplatling } from './splatling.mjs';
import { installSplatlingStartupCompat } from './splatling-startup-compat.mjs';
import { installWeaponGates } from './weapon-gates.mjs';
import { installAgent3WeaponPhysics } from './agent3-weapon-physics.mjs';
import { installRollerLogic } from './roller.mjs';
import { installSplatlingJumpSpread } from './splatling-jump-spread.mjs';
import { advanceShooterNearestSlot } from './shooter-nearest-paint.mjs';
let api;
const dualiesLockConfigs = new WeakMap();
const splatlingStreamConfigs = new WeakMap();

function enumerableWeaponKeys(source) {
  const keys = [], seen = new Set();
  for (let current = source; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    for (const key of Reflect.ownKeys(current)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (Object.getOwnPropertyDescriptor(current, key)?.enumerable) keys.push(key);
    }
  }
  return keys;
}

export function cachedWeaponOverrideConfig(cache, source, key, value) {
  let variants = cache.get(source);
  if (!variants) cache.set(source, variants = new Map());
  let values = variants.get(key);
  if (!values) variants.set(key, values = new Map());
  if (!values.has(value)) {
    const config = {};
    for (const field of enumerableWeaponKeys(source)) {
      Object.defineProperty(config, field, { value: source[field], enumerable: true, writable: true, configurable: true });
    }
    Object.defineProperty(config, key, { value, enumerable: true, writable: true, configurable: true });
    values.set(value, Object.freeze(config));
  }
  return values.get(value);
}

export function withWeaponScalarOverride(cache, source, key, value, run) {
  let variants = cache.get(source);
  if (!variants) cache.set(source, variants = new Map());
  let entry = variants.get(key);
  if (!entry) {
    const values = [], view = {};
    for (const field of enumerableWeaponKeys(source)) {
      Object.defineProperty(view, field, {
        enumerable: true,
        get() { return field === key && values.length ? values[values.length - 1] : source[field]; },
      });
    }
    if (!Object.prototype.hasOwnProperty.call(view, key)) {
      Object.defineProperty(view, key, {
        enumerable: true,
        get() { return values.length ? values[values.length - 1] : source[key]; },
      });
    }
    entry = { view: Object.freeze(view), values };
    variants.set(key, entry);
  }
  entry.values.push(value);
  try { return run(entry.view); }
  finally { entry.values.pop(); }
}

function suppressDualiesGateInput(runner, input) {
  let view = runner.s3DualiesGateInput;
  if (!view) {
    view = Object.create(null);
    Object.defineProperties(view, {
      fire: { value: false, writable: true, enumerable: true },
      firePressed: { value: false, writable: true, enumerable: true },
    });
    runner.s3DualiesGateInput = view;
  }
  view.fire = false; view.firePressed = false;
  Object.setPrototypeOf(view, input);
  return view;
}

export function splatlingBurst(w, charge) {
  const boundary = w.firstChargeTime / w.chargeTime, c = Math.max(0, Math.min(1, charge));
  return c <= boundary ? w.burstFirst * c / boundary : w.burstFirst + (w.burstMax - w.burstFirst) * (c - boundary) / (1 - boundary);
}
// Reserve complete emitted rounds, not fractional duration-equivalents (#543).
// Ceil the requested count, cap it by paid whole rounds, and run whole cadence
// slots. Partial duration changes by less than one fire interval; full stays 40.
export function splatlingReservation(w, charge, availableInk) {
  if (![w.fireInterval, w.inkPerShot, charge, availableInk].every(Number.isFinite) || !(w.fireInterval > 0) || !(w.inkPerShot > 0)) throw new Error('Invalid Splatling reservation');
  const requested = Math.max(0, Math.ceil(splatlingBurst(w, charge) / w.fireInterval - 1e-10));
  const affordable = Math.max(0, Math.floor(Math.max(0, availableInk) / w.inkPerShot + 1e-10));
  const shots = Math.min(requested, affordable);
  return { shots, cost: shots * w.inkPerShot, duration: shots * w.fireInterval };
}
export function splatlingChargeCap(ink, w) {
  const fraction = Math.max(0, Math.min(1, ink / w.inkFull)), first = w.burstFirst / w.burstMax, boundary = w.firstChargeTime / w.chargeTime;
  return fraction <= first ? fraction / first * boundary : boundary + (fraction - first) / (1 - first) * (1 - boundary);
}
// Single authoritative full-charge predicate (#840). The base Charger ding
// fires only at `charge >= 1` (inkwave-public/src/game/weapons.js:157), so
// every discrete full-only effect (160 damage, opponent piercing, squid
// charge-keep storage, exact full range/speed/paint endpoints) must key off
// the same state. A near-full partial (e.g. q=0.999, reachable via the
// low-ink progress cap) stays partial. Match the native ding without an
// epsilon: every finite value below 1 remains a partial charge.
export function isChargerFullCharge(charge) {
  return Number.isFinite(charge) && charge >= 1;
}
/** #539: partial-charge movement runs from the S3 normal-side endpoint
 * (partialChargeMoveStart) to the maximum-partial endpoint
 * (partialChargeMoveEnd); true full charge uses moveSpeedFiring. Progress is
 * the time-normalized chargeT that owns the 8F minimum gate, not the
 * non-linear damage curve in `charge`. The interior is a linear
 * approximation: its Nintendo easing is unverified (未確認).
 */
export function chargerPartialMoveSpeed(w, chargeT, runSpeed) {
  const full = Number.isFinite(w.moveSpeedFiring) ? w.moveSpeedFiring : Math.max(0, runSpeed);
  const start = Number.isFinite(w.partialChargeMoveStart) ? w.partialChargeMoveStart : runSpeed;
  const end = Number.isFinite(w.partialChargeMoveEnd) ? w.partialChargeMoveEnd : full;
  const t = Number.isFinite(chargeT) ? Math.max(0, Math.min(1, chargeT)) : 0;
  if (t >= 1) return full;
  const chargeTime = Number.isFinite(w.chargeTime) && w.chargeTime > 0 ? w.chargeTime : 1;
  const minimum = Number.isFinite(w.minimumChargeTime) ? w.minimumChargeTime : 8 / 60;
  const minT = Math.max(0, Math.min(0.9, minimum / chargeTime));
  if (t <= minT) return start;
  return start + (end - start) * ((t - minT) / (1 - minT));
}
export function chargerDamage(actor, weapon, charge) {
  const legacy = weapon.damageMin + (weapon.damagePartialMax - weapon.damageMin) * charge;
  const minimum = weapon.damageMinChargeTime, rate = weapon.partialDamagePerSecond;
  if (!Number.isFinite(minimum) || !Number.isFinite(rate) || rate <= 0) return legacy;
  const progress = Number.isFinite(actor.weaponRunner?.chargeT) ? actor.weaponRunner.chargeT : charge;
  const elapsed = progress * weapon.chargeTime;
  // The minimum-charge fire gate is tracked separately. Preserve its existing
  // sub-8F output until that independent action-admission fix is composed.
  if (elapsed + 1e-10 < minimum) return legacy;
  return Math.min(weapon.damagePartialMax, weapon.damageMin + (elapsed - minimum) * rate);
}
// #675 ink debit for a Splat Charger release. The 8F first-legal endpoint
// (2.25%) and full charge (18%, 60F) come from the pinned 11.3.0
// WeaponChargerNormal values (InkConsumeMinCharge .0225, InkConsumeFullCharge
// .18; Leanny/splat3 7280ff9c). Nothing sourced gives the curve between them:
// the linear interpolation over charge time below is an INKWAVE choice and is
// UNVERIFIED against Splatoon 3. Do not present the middle shape as
// source-backed; only the endpoints and monotonic order are pinned.
export function chargerInkCost(w, c, chargeT) {
  const inkMin = w.inkMin ?? 2.25;
  const inkFull = w.inkFull ?? 18;
  const minTime = 8 / 60;
  const fullTime = w.chargeTime || 1;
  const progress = Number.isFinite(chargeT) ? chargeT : (c || 0);
  const elapsed = progress * fullTime;
  if (elapsed <= minTime + 1e-6) return inkMin;
  if (elapsed >= fullTime - 1e-6) return inkFull;
  const frac = Math.min(1, Math.max(0, (elapsed - minTime) / (fullTime - minTime)));
  return inkMin + (inkFull - inkMin) * frac;
}
export const SPLATLING_INTERRUPT = 6 / 60;
// Splatling R cancellation is a separate destination from its 6F squid
// interruption window. The sub-ready owner consumes this delay before aiming.
export const SPLATLING_SUB_INTERRUPT = 5 / 60;
const INTERRUPT_EPS = 1e-10;
const INTERRUPT_SLOTS = {
  charge: { time: 's3ChargeInterruptT', press: 's3ChargeInterruptPressT', live: r => r.charging },
  stream: { time: 's3StreamInterrupt', press: 's3StreamInterruptPressT', live: r => r.streaming },
};
export function clearSplatlingSubInterrupt(runner) {
  runner.s3SplatlingSubInterruptPending = false;
  runner.s3SplatlingSubInterruptRemaining = 0;
  runner.s3SplatlingSubInterruptReleased = false;
  runner.s3SplatlingSubInterruptReady = false;
}
export function splatlingSubInterrupt(runner, actor, dt, input) {
  if (actor?.weapon?.kind !== 'splatling') {
    clearSplatlingSubInterrupt(runner);
    return null;
  }
  if (runner.s3SplatlingSubInterruptPending) {
    if (actor.form === 'squid') {
      clearSplatlingSubInterrupt(runner);
      return 'cancelled';
    }
    if (!input?.sub) {
      if (input?.subReleased || actor.intent?.sub) runner.s3SplatlingSubInterruptReleased = true;
      else if (!runner.s3SplatlingSubInterruptReleased) {
        clearSplatlingSubInterrupt(runner);
        return 'cancelled';
      }
    }
    runner.s3SplatlingSubInterruptRemaining = Math.max(0,
      runner.s3SplatlingSubInterruptRemaining - Math.max(0, dt));
    if (runner.s3SplatlingSubInterruptRemaining > INTERRUPT_EPS) return 'wait';
    runner.s3SplatlingSubInterruptPending = false;
    runner.s3SplatlingSubInterruptReady = true;
    return 'ready';
  }
  if (!input?.sub || !(runner.charging || runner.streaming)) return null;
  runner.s3SplatlingSubInterruptPending = true;
  // The input update is the first fixed frame of the interruption window.
  // Consume its dt here so the native sub-ready handoff lands on frame five,
  // rather than waiting five more updates after the R edge.
  runner.s3SplatlingSubInterruptRemaining = Math.max(0,
    SPLATLING_SUB_INTERRUPT - Math.max(0, dt));
  if (runner.s3SplatlingSubInterruptRemaining > INTERRUPT_EPS) return 'wait';
  runner.s3SplatlingSubInterruptPending = false;
  runner.s3SplatlingSubInterruptReady = true;
  return 'ready';
}
export function splatlingInterrupt(runner, actor, slot) {
  const x = INTERRUPT_SLOTS[slot];
  if (actor.weapon.kind !== 'splatling') return false;
  const cancel = !!actor.intent.squid && actor._squidPressT > actor._firePressT;
  if ((runner[x.press] ?? -1) !== actor._squidPressT) {
    runner[x.press] = actor._squidPressT;
    runner[x.time] = cancel && x.live(runner) ? SPLATLING_INTERRUPT : 0;
  }
  return (runner[x.time] ?? 0) > INTERRUPT_EPS;
}
export function tickSplatlingInterrupt(runner, dt) {
  if (runner.s3StreamInterrupt > 0) {
    runner.s3StreamInterrupt = Math.max(0, runner.s3StreamInterrupt - dt);
    return 'stream';
  }
  if (runner.s3ChargeInterruptT > 0) {
    runner.s3ChargeInterruptT = Math.max(0, runner.s3ChargeInterruptT - dt);
    return 'charge';
  }
  return null;
}
export function releaseSplatlingInterrupt(runner, press) {
  for (const x of Object.values(INTERRUPT_SLOTS)) { runner[x.time] = 0; runner[x.press] = press; }
}
export function ageDamage(weapon, age, baseDamage) {
  if (!(weapon.damageReduceEnd > weapon.damageReduceStart) || weapon.damageReduceStart < 0) return baseDamage;
  const k = Math.max(0, Math.min(1, (age - weapon.damageReduceStart) / (weapon.damageReduceEnd - weapon.damageReduceStart)));
  return weapon.damage + (weapon.damageMin - weapon.damage) * k;
}
export function groupDamage(group, victim, amount) {
  if (!group) return amount;
  const previous = group.get(victim) || 0;
  group.set(victim, Math.max(previous, amount));
  return Math.max(0, amount - previous);
}
function acceptedHit(result, victim, hpBefore, aliveBefore) {
  if (result === 'rejected' || result === 'rejected-invulnerable' || result === 'pending') return false;
  if (result === 'accepted' || result === 'killed') return true;
  return Number.isFinite(hpBefore) && (victim.hp < hpBefore || aliveBefore && !victim.alive);
}
export function applySlosherVolleyHit(system, owner, victim, group, groupId, amount, weaponId = 'slosher') {
  if (!(amount > 0)) return;
  const route = api?.G?.netm?.shouldApplyHit?.(owner, victim);
  if (route === 'drop') return;
  // The victim owner commits this budget online; do not spend it while a hit is pending.
  if (route === 'send' && groupId != null) return system.applyHit(owner, victim, amount, weaponId, groupId);
  const previous = group?.get(victim) || 0, next = Math.max(previous, amount), delta = next - previous;
  if (!(delta > 0)) return;
  if (!group) return system.applyHit(owner, victim, delta, weaponId);
  const hpBefore = victim.hp, aliveBefore = victim.alive;
  const result = withFinalDamageGroup(victim, groupId ?? damageGroupId(group),
    () => system.applyHit(owner, victim, delta, weaponId));
  if (acceptedHit(result, victim, hpBefore, aliveBefore)) group.set(victim, next);
  return result;
}
// Preserve in-flight volley dedupe without retaining every historical wire id
// for an entire match. Reject malformed wire identities before key creation.
const SLOSHER_LEDGER_LIMIT = 512;
const SLOSHER_LEDGER_TTL = 8; // seconds of simulation time; exceeds projectile lifetime
const SLOSHER_ID_LIMIT = 128;
export function volleyOwnerKey(owner, groupId) {
  const validPart = v => v == null || (typeof v === 'string' && v.length <= SLOSHER_ID_LIMIT)
    || (typeof v === 'number' && Number.isSafeInteger(v));
  const peer = owner?.owner ?? null, actorId = owner?.nid ?? owner?.name ?? 'actor';
  if (!owner || !validPart(peer) || !validPart(actorId) || !validPart(groupId)) return null;
  const id = String(groupId);
  if (!id.length || id.length > SLOSHER_ID_LIMIT) return null;
  return JSON.stringify([peer, actorId, id]);
}
// Map insertion order is the birth order: pruning is amortized O(1) per
// admitted volley, and over-capacity traffic fails closed rather than evicting
// a still-live group's duplicate-damage protection.
export function trackedSlosherVolley(groups, key, now) {
  if (!(groups instanceof Map) || typeof key !== 'string' || key.length > 420 || !Number.isFinite(now)) return null;
  const existing = groups.get(key);
  if (existing) return existing.hits;
  for (let first = groups.keys().next(); !first.done; first = groups.keys().next()) {
    const created = groups.get(first.value).at;
    if (now >= created && now - created <= SLOSHER_LEDGER_TTL) break;
    groups.delete(first.value);
  }
  if (groups.size >= SLOSHER_LEDGER_LIMIT) return null;
  const hits = new WeakMap();
  groups.set(key, { at: now, hits });
  return hits;
}
// Retain enough concurrent/delayed volleys for a full match, but never let
// peer-provided group IDs grow the victim-owner ledger without bound. Evicted
// numeric sequences are tombstoned by authenticated owner+actor identity so
// replay cannot re-open the damage budget after eviction.
export const SLOSHER_OWNER_GROUP_LIMIT = 2048;
const SLOSHER_GROUP_ID_LIMIT = 96;
function slosherSequence(groupId) {
  if (typeof groupId !== 'string' || groupId.length === 0 || groupId.length > SLOSHER_GROUP_ID_LIMIT) return null;
  const match = /:([1-9][0-9]{0,14})$/.exec(groupId);
  return match ? Number(match[1]) : null;
}
function volleySourceKey(owner) {
  return JSON.stringify([owner.owner ?? null, owner.nid ?? owner.name ?? 'actor']);
}

export function distanceDamage(bands, distance, linear = true) {
  if (!bands?.length) return 0;
  if (distance <= bands[0][0]) return bands[0][1];
  for (let i = 1; i < bands.length; i++) if (distance <= bands[i][0]) {
    if (!linear) return bands[i][1];
    const [previous, damage] = bands[i - 1], [end, next] = bands[i];
    if (end === previous) return next;
    return damage + (next - damage) * (distance - previous) / (end - previous);
  }
  return bands[bands.length - 1][1];
}
export function applyProjectileHit(system, projectile, victim, amount, point) {
  if (!api) throw new Error('INKWAVE weapon patch not installed');
  const weapon = projectile.s3Weapon || projectile.owner.weapon;
  if (['shooter', 'dualies', 'splatling'].includes(weapon.kind)) amount = ageDamage(weapon, projectile.age, amount);
  if (weapon.kind === 'roller' && point) amount = distanceDamage(projectile.s3Vertical ? weapon.verticalDamageBands : weapon.flickDamageBands, projectile.start.distanceTo(point));
  if (weapon.kind === 'slosher' && projectile.s3DamageGroup) {
    return withMainDirectDamage(projectile.owner, victim, () => applySlosherVolleyHit(system, projectile.owner, victim, projectile.s3DamageGroup,
      projectile.s3DamageGroupId, amount, projectile.wid || projectile.type || 'slosher'));
  }
  return applyGroupedProjectileHit(system, projectile, victim, amount);
}
// Both legacy and source-guided collision solvers route their already-resolved
// damage through this owner; neither solver may reserve an invulnerable hit.
export function applyGroupedProjectileHit(system, projectile, victim, amount) {
  const weapon = projectile.s3Weapon || projectile.owner.weapon;
  const group = projectile.s3DamageGroup, previous = group?.get(victim);
  amount = groupDamage(group, victim, amount);
  if (amount > 0) {
    const result = applyMainDirectHit(system, projectile.owner, victim, amount, projectile.wid || projectile.type, damageGroupId(group));
    // #999: a spawn-flight/invulnerable contact never reached the armor
    // resolver. Keep the last admitted Roller maximum so a later legal
    // contact still carries the whole swing into its penetration ledger.
    // Ordinary armor absorption can return 'rejected' without HP loss and
    // MUST retain its contribution. Pending sends retain their existing
    // sender-side deduplication; this is not an asynchronous ACK redesign.
    if (weapon.kind === 'roller' && group && result === 'rejected-invulnerable') {
      if (previous === undefined) group.delete(victim);
      else group.set(victim, previous);
    }
    return result;
  }
}
export function installWeapons(context, profile) {
  api = context;
  const { Actor, WeaponRunner, Projectiles, G, THREE, Physics, Hit, PLAYER, on } = api;
  // #1089: use the committed activation event, not the physical Special input.
  // Some kit owners bypass native _startSpecial; all successful starts publish
  // this boundary. A rejected activation never interrupts the retained stance.
  on?.('special:use', event => {
    const actor = event?.actor, runner = actor?.weaponRunner;
    if (!runner || actor.remote || actor.weapon?.kind !== 'dualies') return;
    runner.s3Turret = false;
    runner.s3DodgeShotPending = 0;
    runner.s3GateDodgeShotPending = false;
    runner.s3DodgeShotRemaining = 0;
    // Keep paid ink, roll count, movement/recovery clocks and shot cooldown.
  });
  WeaponRunner.prototype.s3StepSplatlingSubInterrupt = function (dt, input) {
    return splatlingSubInterrupt(this, this.a, dt, input);
  };
  WeaponRunner.prototype.s3ClearSplatlingSubInterrupt = function () {
    clearSplatlingSubInterrupt(this);
  };
  const newProjectile = Projectiles.prototype._new, pushProjectile = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = newProjectile.apply(this, args); p.s3DamageGroup = null; p.s3DamageGroupId = null; p.s3Weapon = null; p.s3SpecialWeapon = null; p.s3Vertical = false; return p;
  };
  Projectiles.prototype._push = function (p) {
    p.s3Weapon = p.s3SpecialWeapon || (p.owner ? p.owner.weapon : null);
    if (['shooter', 'dualies', 'splatling'].includes(p.s3Weapon?.kind) && Number.isFinite(p.s3Weapon.referenceGravity)) p.grav = p.s3Weapon.referenceGravity;
    return pushProjectile.call(this, p);
  };
  // The public shooter raises the launch ray to compensate for drop at the
  // camera target. Use the launch ray as aimed; gravity acts on the bullet.
  Projectiles.prototype._ballistic = function (_from, direction) { return direction; };
  const reset = WeaponRunner.prototype.reset, busy = WeaponRunner.prototype.busy;
  const nativeMoveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    if (this.a?.weapon?.kind === 'shooter')
      return shooterMovementSpeed(this.s3ShooterMoveRemaining, PLAYER.runSpeed, this.a.weapon.moveSpeedFiring);
    return nativeMoveSpeed.call(this);
  };
  WeaponRunner.prototype.reset = function (...args) {
    const result = reset.apply(this, args);
    clearSplatlingSubInterrupt(this);
    this.s3Stored = null; this.s3KeepMuzzlePending = false; this.s3KeepMuzzleFiring = false; this.s3Turret = false; this.s3FlickVertical = false; this.s3BlasterWindup = 0; this.s3BlasterFromSwim = false;
    this.s3BlasterJumpT = null; this.s3BlasterWasGrounded = false; this.s3BlasterMoveRemaining = 0;
    this.s3BlasterJumpSeen = this.a?.s3JumpSerial || 0;
    this.s3DualiesJumpT = null; this.s3DualiesJumpSeen = this.a?.s3JumpSerial || 0;
    this.s3SloshRecovery = false; this.s3SloshPrevYaw = null; this.s3SloshTurnDelta = 0;
    this.s3SplatlingStartup = 0; this.s3SplatlingEmerging = false; this.s3SplatlingEmergeT = 0;
    this.s3SplatlingHeld = false;
    // #726 fresh-start state: pending humanoid startup seconds, the
    // held-through-forwarding-gate (squid-origin) marker, and the repeat-cycle
    // marker that suppresses the pre-gap after a shot.
    this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false; this.s3ChargerRepeat = false;
    this.s3ChargerSpent = 0; this.s3ChargerProgressiveSpend = false; this.s3ChargerHeldTime = 0;
    this.s3ChargerElapsed = null; this.s3ChargerElapsedCompensation = 0;
    this.s3ReleaseHold = false; this.s3HeldCharge = 0; this.s3HeldChargeT = 0; this.s3ReleaseAt = 0;
    releaseSplatlingInterrupt(this, -1);
    this.s3ChargerPostShot = 0; this.s3DualiesPostShot = 0; this.s3SloshPostShot = 0; this.s3DodgeShotPending = 0;
    this.s3ChargerCancelSwimRemaining = 0; // #416 partial-charge squid cancel recovery
    this.s3ChargerCancelRefillPending = false;
    this.s3ShooterHeld = false; this.s3ShooterPendingFirst = false; this.s3ShooterFirstRemaining = 0;
    this.s3ShooterNearestSlot = 0; // #507: reset only for a new actor life/weapon
    this.s3Accuracy = new ShooterAccuracy(profile.weaponsFidelityCompletion?.weapons?.shooter?.WeaponParam);
    this.s3DualiesAccuracy = new DualiesAccuracy(profile.weaponsFidelityCompletion?.weapons?.dualies?.WeaponParam);
    this.s3ShooterMoveRemaining = 0;
    this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0; this.s3PostFireLockActive = false;
    this.s3WasSquid = this.a?.form === 'squid'; this.s3WasGrounded = !!this.a?.grounded; this.s3JumpSpreadAge = null;
    return result;
  };
  const shooterActorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    const r = this.weaponRunner;
    if (r && this.weapon?.kind === 'charger') {
      // #416: the partial-charge -> squid edge cancels the paid charge
      // immediately, but cannot enter swim movement until six fixed frames.
      const interrupted = !this.alive || this.specialActive || this.superJumpState ||
        (this.intent?.special && this.specialReady?.());
      const cancelEdge = this.intent?.squid && !this._prevIntent?.squid &&
        !this.intent?.sub && (!this.intent?.fire || this._prevIntent?.fire) &&
        r.charging && !r.s3Stored && r.charge > 0 && !isChargerFullCharge(r.charge);
      // Match native form admission against the current ground paint. A denied
      // enemy-ground dive or a same-tick newer Fire press must keep the charge.
      if (cancelEdge && !interrupted) this._surface?.();
      const enemyGrounded = this.grounded && this.groundTeam === 2 && !this.climbing;
      if (interrupted) { r.s3ChargerCancelSwimRemaining = 0; r.s3ChargerCancelRefillPending = false; }
      else if (cancelEdge && !enemyGrounded) {
        cancelStored(r); // already committed ink is not refunded
        r.s3ChargerStartupT = 0; r.s3ChargerHeldGate = false; r.s3ChargerRepeat = false;
        r.s3ReleaseHold = false; r.s3HeldCharge = r.s3HeldChargeT = r.s3ReleaseAt = 0;
        r.s3ChargerProgressiveSpend = false;
        r.s3ChargerCancelSwimRemaining = 6 / 60;
        // #737 must observe this cancellation even though the 6F form gate
        // clears charging before the native resource pass can see squid form.
        r.s3ChargerCancelRefillPending = true;
      } else if (r.s3ChargerCancelSwimRemaining > 0) {
        const remaining = r.s3ChargerCancelSwimRemaining - dt;
        r.s3ChargerCancelSwimRemaining = remaining > 1e-10 ? remaining : 0;
      }
    }
    if (r && this.weapon?.kind === 'shooter') {
      if (r.s3ShooterInterruptSub > 0) r.s3ShooterInterruptSub = Math.max(0, r.s3ShooterInterruptSub - dt);
      if (r.s3ShooterInterruptSquid > 0) r.s3ShooterInterruptSquid = Math.max(0, r.s3ShooterInterruptSquid - dt);
      const hardCancel = !this.alive || this.specialActive || this.superJumpState ||
        (this.intent?.special && this.specialReady?.());
      if (hardCancel) {
        r.s3ShooterInterruptSub = r.s3ShooterInterruptSquid = 0;
        r.s3ShooterInterruptJustArmed = false; r.s3ShooterCancelMain = false;
        r.s3ShooterStreamActive = false; r.s3ShooterHeld = false;
      } else {
        const cancelEdge = r.s3ShooterHeld && r.s3ShooterStreamActive &&
          (!this.intent?.fire || !!this.intent?.sub || !!this.intent?.squid);
        if (cancelEdge && !r.s3ShooterInterruptJustArmed && !r.s3ShooterCancelMain) {
          r.s3ShooterInterruptSub = 3 / 60;
          r.s3ShooterInterruptSquid = 4 / 60;
          r.s3ShooterInterruptJustArmed = true;
        }
        if (r.s3ShooterCancelMain && !this.intent?.fire) r.s3ShooterCancelMain = false;
      }
    }
    return shooterActorUpdate.call(this, dt, ...args);
  };
  WeaponRunner.prototype.busy = function () {
    const kind = this.a.weapon.kind;
    if (kind === 'roller' && this.s3FlickPostSquid > 0) return true;
    if (kind === 'shooter') {
      if (this.s3ShooterPendingFirst || this.s3ShooterInterruptSquid > 1e-10) return true;
      if (this.s3PostFireLockActive) {
        if (this.a.lastFire + 1e-10 < (this.a.weapon.postFireSwimLock || 0)) return true;
        this.s3PostFireLockActive = false;
      }
    }
    if (kind === 'charger' && (this.s3ChargerCancelSwimRemaining > 1e-10 || this.s3ChargerPostShot > 1e-10)) return true;
    if (kind === 'dualies' && this.s3DualiesPostShot > 1e-10) return true;
    if (kind === 'slosher' && this.s3SloshPostShot > 1e-10) return true;
    if (['charger','splatling'].includes(kind) && this.a.intent.squid && this.a._squidPressT > this.a._firePressT) return false;
    return this.s3BlasterWindup > 0 || busy.call(this);
  };
  const blasterParam = profile.weaponsFidelityCompletion?.weapons?.blaster?.WeaponParam;
  const BLASTER_REF_HZ = Number.isFinite(profile.referenceHz) ? profile.referenceHz : 60;
  const BLASTER_START = Number.isFinite(blasterParam?.Jump_DegBiasDecreaseStartFrame) ? blasterParam.Jump_DegBiasDecreaseStartFrame / BLASTER_REF_HZ : null;
  const BLASTER_END = Number.isFinite(blasterParam?.Jump_DegBiasEndFrame) ? blasterParam.Jump_DegBiasEndFrame / BLASTER_REF_HZ : null;
  const BLASTER_BIAS_MAX = Number.isFinite(blasterParam?.Jump_DegBiasMax) ? blasterParam.Jump_DegBiasMax : null;
  const blasterJumpSupported = () => Number.isFinite(BLASTER_START) && Number.isFinite(BLASTER_END) && BLASTER_END > BLASTER_START && BLASTER_BIAS_MAX > 0;
  const blasterJumpBias = age => age <= BLASTER_START ? BLASTER_BIAS_MAX
    : age >= BLASTER_END ? 0 : BLASTER_BIAS_MAX * (BLASTER_END - age) / (BLASTER_END - BLASTER_START);
  WeaponRunner.prototype.s3BlasterJumpState = function (w) {
    if (!w || w.kind !== 'blaster' || !blasterJumpSupported())
      return { supported: false, active: false, age: null, frames: null, bias: 0, envelope: 0, ground: 0, phase: 'idle', recovering: false };
    const active = this.s3BlasterJumpT != null, bias = active ? blasterJumpBias(this.s3BlasterJumpT) : 0;
    const envelope = w.spreadAir, ground = w.spreadGround;
    const frames = active ? this.s3BlasterJumpT * BLASTER_REF_HZ : null;
    const phase = !active ? 'idle' : frames <= BLASTER_START * BLASTER_REF_HZ ? 'held'
      : frames < BLASTER_END * BLASTER_REF_HZ ? 'recovering' : 'recovered';
    return { supported: true, active, age: active ? this.s3BlasterJumpT : null,
      frames, bias, envelope, ground, phase, recovering: phase === 'recovering' };
  };
  // #887: pinned WeaponManeuverNormal names Jump_DegBiasDecreaseStartFrame=25 /
  // Jump_DegBiasEndFrame=70 / Jump_DegBiasMax=0.4. Per Inkipedia's data
  // explanation these DegBias fields describe the hidden OUTER-RETICLE
  // PROBABILITY ("bias"), while Stand/Jump_DegSwerve=2/7.5 are the deviation
  // angles. The same 25F/70F window therefore drives a per-shot selection, not
  // an angle lerp. Mirror the already-sourced Blaster jump-bias owner: publish
  // the outer envelope, sample the probability bias at fire time, and keep the
  // LapOver post-roll cone independent. The exact 25F->70F curve shape is not
  // published; this uses the same monotone linear recovery as the Blaster owner.
  const dualiesParam = profile.weaponsFidelityCompletion?.weapons?.dualies?.WeaponParam;
  const DUALIES_START = Number.isFinite(dualiesParam?.Jump_DegBiasDecreaseStartFrame) ? dualiesParam.Jump_DegBiasDecreaseStartFrame / BLASTER_REF_HZ : null;
  const DUALIES_END = Number.isFinite(dualiesParam?.Jump_DegBiasEndFrame) ? dualiesParam.Jump_DegBiasEndFrame / BLASTER_REF_HZ : null;
  const DUALIES_BIAS_MAX = Number.isFinite(dualiesParam?.Jump_DegBiasMax) ? dualiesParam.Jump_DegBiasMax : null;
  const dualiesJumpSupported = () => Number.isFinite(DUALIES_START) && Number.isFinite(DUALIES_END) && DUALIES_END > DUALIES_START && DUALIES_BIAS_MAX > 0;
  const dualiesJumpBias = age => age <= DUALIES_START ? DUALIES_BIAS_MAX
    : age >= DUALIES_END ? 0 : DUALIES_BIAS_MAX * (DUALIES_END - age) / (DUALIES_END - DUALIES_START);
  WeaponRunner.prototype.s3DualiesJumpState = function (w) {
    if (!w || w.kind !== 'dualies' || !dualiesJumpSupported())
      return { supported: false, active: false, age: null, frames: null, bias: 0, envelope: 0, ground: 0, phase: 'idle', recovering: false };
    const active = this.s3DualiesJumpT != null, bias = active ? dualiesJumpBias(this.s3DualiesJumpT) : 0;
    const envelope = w.spreadAir, ground = w.spreadGround;
    const frames = active ? this.s3DualiesJumpT * BLASTER_REF_HZ : null;
    const phase = !active ? 'idle' : frames <= DUALIES_START * BLASTER_REF_HZ ? 'held'
      : frames < DUALIES_END * BLASTER_REF_HZ ? 'recovering' : 'recovered';
    return { supported: true, active, age: active ? this.s3DualiesJumpT : null,
      frames, bias, envelope, ground, phase, recovering: phase === 'recovering' };
  };
  const runnerUpdate = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    const weapon = this.a.weapon;
    if (weapon.kind === 'shooter') this.s3ShooterMoveRemaining = shooterMovementRemaining(this.s3ShooterMoveRemaining, dt);
    if (weapon?.kind === 'blaster') this.s3BlasterMoveRemaining = Math.max(0, (this.s3BlasterMoveRemaining || 0) - dt);
    else this.s3BlasterMoveRemaining = 0;
    if (blasterJumpSupported() && weapon?.kind === 'blaster') {
      const grounded = !!this.a.grounded;
      const jumpSerial = this.a.s3JumpSerial || 0;
      if (jumpSerial !== this.s3BlasterJumpSeen) this.s3BlasterJumpT = 0;
      else if (this.s3BlasterJumpT != null) this.s3BlasterJumpT += dt;
      this.s3BlasterJumpSeen = jumpSerial;
      this.s3BlasterWasGrounded = grounded;
      if (this.s3BlasterJumpT != null && grounded && this.s3BlasterJumpT >= BLASTER_END) this.s3BlasterJumpT = null;
    } else {
      this.s3BlasterJumpT = null;
      this.s3BlasterWasGrounded = false;
      this.s3BlasterJumpSeen = this.a?.s3JumpSerial || 0;
    }
    if (dualiesJumpSupported() && weapon?.kind === 'dualies') {
      const jumpSerial = this.a.s3JumpSerial || 0;
      if (jumpSerial !== this.s3DualiesJumpSeen) this.s3DualiesJumpT = 0;
      else if (this.s3DualiesJumpT != null) this.s3DualiesJumpT += dt;
      this.s3DualiesJumpSeen = jumpSerial;
      // The sourced clock ends at 70F whether or not the actor has landed. An
      // airborne actor past 70F returns to the normal airborne 7.5 endpoint;
      // keeping the clock would select the 0-bias 2 endpoint in the air.
      if (this.s3DualiesJumpT != null && this.s3DualiesJumpT >= DUALIES_END) this.s3DualiesJumpT = null;
    } else {
      this.s3DualiesJumpT = null;
      this.s3DualiesJumpSeen = this.a?.s3JumpSerial || 0;
    }
    if (weapon.kind === 'shooter') {
      if (this.s3WasGrounded && !this.a.grounded) this.s3JumpSpreadAge = 0;
      else if (this.s3JumpSpreadAge != null) this.s3JumpSpreadAge += dt;
      this.s3WasGrounded = !!this.a.grounded;
      let next = input;
      const isSquid = this.a.form === 'squid';
      if (this.s3WasSquid && !isSquid && this.a.intent?.fire) {
        this.s3SwimFireQueued = true;
        this.s3SwimFireRemaining = weapon.swimFirstShotDelay || 0;
      }
      this.s3WasSquid = isSquid;
      if (this.s3SwimFireQueued) {
        this.s3SwimFireRemaining = Math.max(0, this.s3SwimFireRemaining - dt);
        if (this.s3SwimFireRemaining > 1e-10) next = { ...next, fire: false, firePressed: false };
        else {
          next = { ...next, fire: true, firePressed: true };
          this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0;
        }
      }
      const locked = this.s3PostFireLockActive && this.a.lastFire + 1e-10 < (weapon.postFireSwimLock || 0);
      if (!locked && this.s3PostFireLockActive) this.s3PostFireLockActive = false;
      // A stream cancellation owns its separate 3F sub gate. A due shot on
      // that edge must not replace it with the 4F squid/post-shot form gate.
      if ((locked && !this.s3ShooterCancelMain) || this.s3ShooterPendingFirst || this.s3ShooterInterruptSub > 1e-10)
        next = { ...next, sub: false, subReleased: false };
      if (this.s3ShooterCancelMain && !this.s3ShooterInterruptJustArmed)
        next = { ...next, fire: false, firePressed: false };
      input = next;
    }
    if (weapon.kind === 'shooter') this.s3Accuracy?.advance(dt);
    // #891: Dualies bias recovery counts time since the last admitted shot, so it runs with or without fire held.
    if (weapon.kind === 'dualies') this.s3DualiesAccuracy?.advance(dt);
    const result = runnerUpdate.call(this, dt, input);
    if (weapon.kind === 'shooter' && this.s3ShooterInterruptJustArmed) {
      // R/ZL cancellation may coincide with a due repeat; the native owner above
      // gets that cancellation-frame shot once, then the stream is retired.
      this.s3ShooterInterruptJustArmed = false;
      this.s3ShooterCancelMain = true;
      this.s3ShooterHeld = false;
      this.s3ShooterPendingFirst = false;
      this.s3ShooterFirstRemaining = 0;
      this.s3ShooterStreamActive = false;
    }
    return result;
  };
  const busyBeforeSplatlingInterrupt = WeaponRunner.prototype.busy;
  WeaponRunner.prototype.busy = function () {
    if (splatlingInterrupt(this, this.a, 'stream') || splatlingInterrupt(this, this.a, 'charge')) return true;
    return busyBeforeSplatlingInterrupt.call(this);
  };
  const charger = WeaponRunner.prototype._charger;
  const chargerInkAt = (w, progress) => {
    const p = Math.max(0, Math.min(1, progress)), minT = w.minimumChargeTime ?? (8 / 60);
    if (p <= minT) return w.inkMin * p / Math.max(1e-10, minT);
    return w.inkMin + (w.inkFull - w.inkMin) * (p - minT) / Math.max(1e-10, 1 - minT);
  };
  const chargerProgressForInk = (w, ink) => {
    const value = Math.max(0, ink), minT = w.minimumChargeTime ?? (8 / 60);
    if (value <= w.inkMin) return minT * value / Math.max(1e-10, w.inkMin);
    return Math.min(1, minT + (1 - minT) * (value - w.inkMin) / Math.max(1e-10, w.inkFull - w.inkMin));
  };
  const accumulateChargerElapsed = (r, seconds) => {
    const elapsed = Number.isFinite(r.s3ChargerElapsed) ? r.s3ChargerElapsed : 0;
    if (!(seconds > 0)) return elapsed;
    const compensation = Number.isFinite(r.s3ChargerElapsedCompensation) ? r.s3ChargerElapsedCompensation : 0;
    const adjusted = seconds - compensation;
    const total = elapsed + adjusted;
    r.s3ChargerElapsedCompensation = (total - elapsed) - adjusted;
    r.s3ChargerElapsed = total;
    return total;
  };
  // Stored-charge lifetime/startup ownership from C22 is composed with #775's
  // progressive ink commitment. Paid ink is never refunded by cancel/keep.
  const cancelStored = r => {
    r.s3Stored = null; r.s3KeepMuzzlePending = false; r.s3KeepMuzzleFiring = false; r.charging = false; r.charge = 0; r.chargeT = 0; r.chargeDinged = false;
    r.s3ChargerSpent = 0;
    r.s3ChargerElapsed = null; r.s3ChargerElapsedCompensation = 0;
    r.chargeLoop?.stop(.05); r.chargeLoop = null;
  };
  // Input suppression is not a life/weapon reset: recovery, Dodge and hit history continue.
  WeaponRunner.prototype.cancelPendingInput = function () {
    if (this.a.weapon.kind === 'charger') {
      cancelStored(this);
      this.s3ChargerCancelSwimRemaining = 0; this.s3ChargerCancelRefillPending = false;
      this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false; this.s3ChargerRepeat = false;
      this.s3ChargerProgressiveSpend = false; this.s3ChargerHeldTime = 0;
      this.s3ReleaseHold = false; this.s3HeldCharge = this.s3HeldChargeT = this.s3ReleaseAt = 0;
    }
    this.s3ShooterHeld = false; this.s3ShooterPendingFirst = false; this.s3ShooterFirstRemaining = 0;
    this.s3ShooterStreamActive = false; this.s3ShooterInterruptSub = 0; this.s3ShooterInterruptSquid = 0;
    this.s3ShooterInterruptJustArmed = false; this.s3ShooterCancelMain = false;
    this.s3SwimFireQueued = false; this.s3SwimFireRemaining = 0;
    this.s3BlasterWindup = 0; this.s3BlasterFromSwim = false;
    this.s3SplatlingStartup = 0; this.s3SplatlingEmerging = false; this.s3SplatlingEmergeT = 0; this.s3SplatlingHeld = false;
    if (!this.s3SloshRecovery) this.slosh = -1;
    this.s3DodgeShotPending = 0;
  };
  WeaponRunner.prototype._charger = function (dt, inp, w) {
    const a = this.a, held = !!a.intent.fire, epsilon = 1e-10;
    // A held ZR must not reopen a new charge during the 6F ZL-cancel recovery.
    if (this.s3ChargerCancelSwimRemaining > epsilon) return;
    // #680: retain the already-paid charge across the one fixed release frame.
    // The current progressive-payment and finite-flight owners still perform release.
    let releaseDue = false;
    if (this.s3ReleaseHold) {
      this.s3ReleaseHold = false;
      if (a.form === 'squid' || G.time - this.s3ReleaseAt > dt + epsilon) {
        this.s3HeldCharge = this.s3HeldChargeT = 0; cancelStored(this); return;
      }
      releaseDue = true;
      this.charging = true; this.charge = this.s3HeldCharge; this.chargeT = this.s3HeldChargeT;
      this.s3HeldCharge = this.s3HeldChargeT = 0;
      inp = { ...inp, fire: false };
    }

    // #291: the keep pre-delay belongs to resurfacing, not time spent hidden.
    // A release before readiness cancels (#390). At the ready boundary it may
    // enter the ordinary one-fixed-frame release owner (#680), never bypass it.
    const storedReleaseReady = this.s3Stored && a.form !== 'squid' && !this.s3WasSquid &&
      (this.s3Stored.fireDelay || 0) <= dt + epsilon;
    if (this.s3Stored && !held && !storedReleaseReady) {
      // #1070: cancelling a live charge keep owns S3's separate 3F ink-recovery delay.
      a.s3 ||= {};
      a.s3.chargerKeepRecover = 3 / 60;
      cancelStored(this); this.s3WasSquid = a.form === 'squid';
      this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false;
      return;
    }

    // #726 fresh-start bookkeeping. A held trigger masked by squid/emerge keeps
    // its origin marker; a physical release abandons pending startup.
    if (!inp.fire) { this.s3ChargerStartupT = 0; this.s3ChargerHeldGate = false; }
    if (held && !inp.fire) this.s3ChargerHeldGate = true;

    if (a.form === 'squid') {
      this.s3WasSquid = true;
      if (this.charging) {
        if (isChargerFullCharge(this.charge) && held && a.submerged === true) this.s3Stored = {
          charge: 1, remaining: w.keepChargeTime,
          fireDelay: w.storedFireDelay || 0, laserDelay: w.storedLaserDelay || 0,
          resurfaced: false,
          paid: Math.max(this.s3ChargerSpent || 0, w.inkFull)
        };
        this.charging = false; this.charge = 0; this.chargeT = 0; this.s3ChargerHeldTime = 0;
        if (!this.s3Stored) this.s3ChargerSpent = 0;
        this.chargeLoop?.stop(.05); this.chargeLoop = null;
      }
      if (this.s3Stored) {
        this.s3Stored.remaining -= dt;
        this.s3Stored.resurfaced = false;
        if (this.s3Stored.remaining <= epsilon) { this.s3Stored = null; this.s3KeepMuzzlePending = false; this.s3ChargerSpent = 0; }
      }
      return;
    }
    // Fresh charge observes the native form-exit clock, including manual
    // emergence before ZR. Existing stored-charge readiness is a separate owner.
    if (!this.charging && !this.s3Stored && a.kidT + 1e-10 < (w.swimChargeStartDelay || 0)) return;

    // #810: a held squid→humanoid edge refreshes only an existing keep record.
    if (this.s3Stored && this.s3WasSquid) {
      this.s3Stored.remaining = w.keepChargeTime;
      this.s3Stored.fireDelay = w.storedFireDelay || 0;
      this.s3Stored.laserDelay = w.storedLaserDelay || 0;
      this.s3Stored.resurfaced = true;
    }
    this.s3WasSquid = false;
    if (this.s3Stored) {
      this.charge = this.s3Stored.charge;
      this.s3Stored.fireDelay = Math.max(0, (this.s3Stored.fireDelay || 0) - dt);
      this.s3Stored.laserDelay = Math.max(0, (this.s3Stored.laserDelay || 0) - dt);
      if (this.s3Stored.fireDelay > epsilon || (held && !inp.fire)) return;
      if (!held) inp = { ...inp, fire: false };
      this.chargeT = 1; this.charging = true;
      this.s3ChargerElapsed = w.chargeTime; this.s3ChargerElapsedCompensation = 0;
      this.s3ChargerSpent = this.s3Stored.paid ?? w.inkFull;
      this.s3ChargerHeldTime = w.minReleaseTime || 0;
      // Keep-shot identity survives the ordinary 1F deferred release.
      this.s3KeepMuzzlePending = true;
      this.s3Stored = null;
    }

    // A release before the sourced minimum release time cancels without firing.
    if (this.charging && !held && this.s3ChargerHeldTime + epsilon < (w.minReleaseTime || 0)) {
      cancelStored(this); this.s3ChargerHeldTime = 0; return;
    }
    if (!this.charging && !this.s3Stored) this.s3ChargerHeldTime = 0;

    // #823 follow-up: zero/underfunded low-ink charge can be armed with a
    // temporary full native tank, but must never enter native release. Native
    // release clamps progress to a minimum 0.12 projectile even when no ink was
    // committed. Wait for the *paid* sourced minimum, not just held elapsed time.
    if (this.charging && !inp.fire && (this.s3ChargerSpent || 0) + epsilon < w.inkMin) {
      cancelStored(this);
      this.s3ChargerHeldTime = 0;
      this.s3ChargerRepeat = false;
      this.s3ReleaseHold = false;
      this.s3HeldCharge = this.s3HeldChargeT = 0;
      return;
    }

    // A release from a live charge enters the repeat cycle. Release handling
    // below neutralizes only the legacy debit, not the shot/recovery clocks.
    if (this.charging && !inp.fire) this.s3ChargerRepeat = true;

    // #726: stable humanoid fresh start consumes exactly 1F before charge.
    // Low/empty ink is allowed to enter the charge state; #775 then advances it
    // at the sourced 1/3 rate while recovery funds the minimum.
    if (!this.charging && inp.fire && this.cooldown <= 0) {
      if (this.s3ChargerStartupT > epsilon) {
        this.s3ChargerStartupT = Math.max(0, this.s3ChargerStartupT - dt);
        if (this.s3ChargerStartupT > epsilon) return;
      } else if (!this.s3ChargerRepeat && !this.s3ChargerHeldGate) {
        this.s3ChargerStartupT = 1 / 60;
        return;
      }
    }

    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) {
        this.s3ChargerSpent = 0;
        this.s3KeepMuzzlePending = false; // fresh charge must not inherit an old keep origin
        this.s3ChargerElapsed = 0; this.s3ChargerElapsedCompensation = 0;
      }
      const beforeT = this.chargeT || 0, realInk = a.ink;
      const fundedInk = (this.s3ChargerSpent || 0) + realInk;
      const low = fundedInk + epsilon < w.inkMin;
      const chargeDuration = Math.max(epsilon, w.chargeTime);
      // #971: air slowdown starts only beyond the minimum charge. Split a
      // crossing step; low-ink slowdown is independent and still applies first.
      const fundedRate = low ? (w.emptyChargeRate ?? 1 / 3) : 1;
      const airRate = a.grounded ? 1 : (w.airChargeRate ?? 1 / 3);
      const minimum = w.minimumChargeTime ?? 8 / 60;
      const earlyDt = Math.min(dt, Math.max(0, minimum - beforeT * chargeDuration) / fundedRate);
      const progressDt = earlyDt * fundedRate + (dt - earlyDt) * Math.min(fundedRate, airRate);
      if (!Number.isFinite(this.s3ChargerElapsed)) {
        this.s3ChargerElapsed = beforeT * chargeDuration;
        this.s3ChargerElapsedCompensation = 0;
      }
      const requestedT = Math.min(1, beforeT + progressDt / chargeDuration);
      const inkLimitT = chargerProgressForInk(w, fundedInk);
      const targetT = Math.min(requestedT, inkLimitT);
      const inkLimited = inkLimitT < requestedT;
      const elapsedStep = inkLimited
        ? Math.max(0, targetT - beforeT) * chargeDuration
        : Math.min(progressDt, Math.max(0, (1 - beforeT) * chargeDuration));
      const elapsed = accumulateChargerElapsed(this, elapsedStep);
      const scaledDt = Math.max(0, targetT - beforeT) * w.chargeTime;
      // Normalized progress can land one ULP below 1 after repeated fractional
      // frame durations (30 × 1/30). The compensated elapsed clock reaches the
      // native full endpoint on its completion tick. It does not soften
      // isChargerFullCharge: q<1 presentation/packets remain partial, and
      // ink-limited progress cannot complete the clock.
      // The 1/3 airborne rate can finish one representable double below 1s.
      // Only normalize clock roundoff, never partial packet/ink-limited charge.
      if (!inkLimited && elapsed + Number.EPSILON * Math.max(1, w.chargeTime) >= w.chargeTime) this.chargeT = 1;

      // Advance the native charge owner with a temporary admissible tank, then
      // debit the real tank from the sourced min/full endpoints.
      a.ink = Math.max(realInk, w.inkFull);
      const result = charger.call(this, scaledDt, inp, w);
      a.ink = realInk;

      const targetPaid = chargerInkAt(w, this.chargeT || 0);
      const delta = Math.max(0, targetPaid - (this.s3ChargerSpent || 0));
      const spent = Math.min(a.ink, delta);
      if (spent > epsilon) {
        a.ink -= spent;
        this.s3ChargerSpent = (this.s3ChargerSpent || 0) + spent;
        this.s3ChargerProgressiveSpend = true;
      }
      if (held && this.charging) this.s3ChargerHeldTime += dt;
      return result;
    }

    if (!inp.fire && this.charging) {
      if (!releaseDue && !held) {
        this.s3ReleaseHold = true; this.s3ReleaseAt = G.time;
        this.s3HeldCharge = this.charge; this.s3HeldChargeT = this.chargeT;
        this.charging = false; this.firingT = Math.max(this.firingT, .35);
        this.chargeLoop?.stop(.05); this.chargeLoop = null;
        return;
      }
      // Native release still owns projectile/recovery state, but its old
      // release-only ink debit is neutralized because charge progress paid it.
      const realInk = a.ink, c = Math.max(0, this.charge || 0);
      const legacyDebit = Math.max(w.inkMin, w.inkFull * c);
      a.ink = realInk + legacyDebit;
      // The projectile engine reads this ONLY within the synchronous native shot.
      this.s3KeepMuzzleFiring = !!this.s3KeepMuzzlePending;
      try { return charger.call(this, dt, inp, w); }
      finally {
        a.ink = realInk;
        this.s3ChargerSpent = 0;
        this.s3KeepMuzzlePending = false;
        this.s3KeepMuzzleFiring = false;
      }
    }
    return charger.call(this, dt, inp, w);
  };
  WeaponRunner.prototype._slosher = function (dt, inp, w) {
    const a = this.a, epsilon = 1e-10;
    // #258: sample consecutive fixed-simulation aim headings during the
    // committed windup. A stationary aim or first sample must have zero sweep.
    if (this.slosh >= 0) {
      const aim = a.aimDir;
      const yaw = aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)
        ? Math.atan2(aim.x, aim.z) : Number.isFinite(a.aimYaw) ? a.aimYaw : null;
      if (yaw !== null) {
        const prior = this.s3SloshPrevYaw;
        const delta = Number.isFinite(prior)
          ? Math.atan2(Math.sin(yaw - prior), Math.cos(yaw - prior)) : 0;
        // Current S3 verification: a maximum ten degrees of sweep per 60 Hz step.
        this.s3SloshTurnDelta = Math.max(-Math.PI / 18, Math.min(Math.PI / 18, delta));
      } else this.s3SloshTurnDelta = 0;
      this.s3SloshPrevYaw = yaw;
    } else {
      this.s3SloshPrevYaw = null;
      this.s3SloshTurnDelta = 0;
    }
    const release = () => {
      // Preserve fractional seconds at both boundaries. Without the epsilon,
      // 12 * (1/60) misses .2 and the 17F recovery also gains an extra tick.
      const carry = Math.max(0, this.slosh - w.windup);
      this.slosh = -1; G.projectiles.fireSlosh(a, w);
      this.s3SloshTurnDelta = 0; this.s3SloshPrevYaw = null;
      this.s3SloshPostShot = w.postShotLock ?? 0;
      a.lastFire = 0;
      this.s3PostShotRemaining = w.postShotDelay;
      this.cooldown = w.fireInterval - w.windup - carry;
      this.s3SloshRecovery = !!inp.fire;
    };
    if (!inp.fire) this.s3SloshRecovery = false;
    if (this.slosh >= 0) {
      this.slosh += dt; a.fireFacing = .5; this.firingT = .35;
      if (this.slosh + epsilon >= w.windup) release();
      return;
    }
    if (!inp.fire || this.cooldown > epsilon) return;
    if (a.ink < w.inkPerShot) { this._empty(); this.cooldown = .2; this.s3SloshRecovery = false; return; }
    // update() already subtracted dt from cooldown. Carry only a continuously
    // held attack's late deadline, never an arbitrarily overdue idle clock.
    const carry = this.s3SloshRecovery ? Math.max(0, -this.cooldown) : 0;
    this.s3SloshRecovery = false;
    a.ink -= w.inkPerShot; a.lastFire = 0;
    this.slosh = carry <= epsilon ? 0 : carry; this.firingT = .35; a.fireFacing = .5;
    a.character.trigger('slosh');
    if (a.isLocal || a._nearCamera()) G.audio?.play('slosh_throw', {
      pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? .75 : .55,
    });
    if (this.slosh + epsilon >= w.windup) release();
  };
  installRollerLogic(api, profile);
  for (const method of ['fireFlick', 'fireSlosh']) {
    const original = Projectiles.prototype[method];
    Projectiles.prototype[method] = function (a, weapon) {
      let w = weapon;
      if (method === 'fireFlick' && a.weaponRunner.s3FlickVertical) w = { ...weapon,
        // #305: a depleted vertical swing keeps its sourced per-unit count from
        // the depletion plan; a full swing keeps the pinned vertical total.
        flickDrops: weapon.s3DepletionDrops ?? weapon.verticalDrops, flickSpreadDeg: weapon.verticalSpreadDeg, flickSpeed: weapon.verticalSpeed,
        flickDamageNear: weapon.verticalDamageNear, flickDamageFar: weapon.verticalDamageFar,
      };
      const before = new Set(this.list); const result = original.call(this, a, w); const group = new Map();
      for (const p of this.list) if (!before.has(p)) {
        p.s3DamageGroup = group;
        p.s3Vertical = !!a.weaponRunner.s3FlickVertical;
        if (method === 'fireFlick') { p.grav = w.flickGravity ?? p.grav; p.drag = w.flickDrag ?? p.drag; }
      }
      return result;
    };
  }
  const fireDualies = Projectiles.prototype.fireDualies;
  Projectiles.prototype.fireDualies = function (a, w, spreadDeg, hand) {
    // #887: while the Dualies jump-accuracy bias clock is active, sample the
    // published outer-reticle probability and fire at the chosen sourced
    // endpoint (Jump_DegSwerve vs Stand_DegSwerve). Same model as the Blaster
    // jump bias; the LapOver turret cone is already handled by _spreadDeg.
    // #891: otherwise normal Dualies fire samples the outer-reticle bias once
    // per admitted shot against the grounded/air envelope. Locked turret shots
    // (spreadLock) are a separate owner for both and do not advance the bias.
    const runner = a?.weaponRunner;
    const locked = !!(runner?.s3Turret || runner?.lockT > 0);
    const state = runner?.s3DualiesJumpState?.(w);
    const accuracy = runner?.s3DualiesAccuracy;
    let effective = spreadDeg;
    if (state?.active && !locked) {
      const first = w.spreadFirst ?? .45;
      const bloom = first + (1 - first) * (runner.bloom || 0);
      effective = (Math.random() < state.bias ? state.envelope : state.ground) * bloom;
    } else if (accuracy && runner.s3DualiesAdmitting && !locked) {
      const envelope = a.grounded ? w.spreadGround : w.spreadAir;
      const outerChance = accuracy.shot(!!a.grounded);
      effective = Math.random() < outerChance ? envelope : envelope * (w.spreadFirst ?? 0.45);
    }
    const result = fireDualies.call(this, a, w, effective, hand);
    if (a.weaponRunner) a.weaponRunner.s3DualiesPostShot = 4 / 60;
    return result;
  };
  const dualiesBase = WeaponRunner.prototype._dualies, spread = WeaponRunner.prototype._spreadDeg;
  // #891: only shots admitted by the runner's own fire loop sample the Dualies bias. Direct
  // Projectiles.fireDualies calls keep the cone they are given.
  const dualies = function (dt, inp, w) {
    this.s3DualiesAdmitting = true;
    try { return dualiesBase.call(this, dt, inp, w); } finally { this.s3DualiesAdmitting = false; }
  };
  WeaponRunner.prototype._dualies = function (dt, inp, w) {
    const dodging = !!this.dodge;
    if (this.s3DodgeShotPending > 1e-10 && (!inp.fire || inp.sub || this.a.form === 'squid')) this.s3DodgeShotPending = 0;
    // #1020: an empty click cannot preserve post-roll turret accuracy/cadence.
    // Exactly enough ink remains legal; the state drops only when the next
    // requested shot is unaffordable.
    if (this.s3Turret && (!inp.fire || Math.hypot(this.a.intent.move.x, this.a.intent.move.z) > .01 && this.lockT <= 0 || this.a.form === 'squid' || inp.sub || this.a.ink + 1e-10 < w.inkPerShot)) this.s3Turret = false;
    if (this.s3DodgeShotPending > 1e-10) {
      this.s3DodgeShotPending = Math.max(0, this.s3DodgeShotPending - dt);
      if (this.s3DodgeShotPending > 1e-10) {
        const gatedInput = suppressDualiesGateInput(this, inp);
        try {
          return dualies.call(this, dt, gatedInput,
            this.s3Turret ? cachedWeaponOverrideConfig(dualiesLockConfigs, w, 'fireInterval', w.lockInterval) : w);
        } finally {
          Object.setPrototypeOf(gatedInput, null);
        }
      }
    }
    const result = dualies.call(this, dt, inp,
      this.s3Turret ? cachedWeaponOverrideConfig(dualiesLockConfigs, w, 'fireInterval', w.lockInterval) : w);
    if (dodging && !this.dodge) {
      this.s3Turret = true;
      this.s3DodgeShotPending = 4 / 60;
    }
    // Movement recovery releases roll resources without changing firing gates.
    if (!this.dodge && this.lockT <= 0) this.rollsLeft = w.rolls;
    return result;
  };
  WeaponRunner.prototype._spreadDeg = function (w) {
    // The upstream blaster reads `spread`, while the pinned profile supplies
    // Stand_DegSwerve as spreadGround. During the sourced jump-recovery state
    // publish the outer envelope; the angular bias is applied at fire time.
    if (w.kind === 'blaster') {
      const state = this.s3BlasterJumpState(w);
      // #1102: an admitted jump owns this penalty. The serial gate above
      // already distinguishes a jump from a ledge fall; do not reintroduce
      // the airborne penalty through the inactive-state scalar fallback.
      if (state.supported) return state.active ? state.envelope : state.ground;
      return this.a.grounded ? w.spreadGround : w.spreadAir;
    }
    if (w.kind === 'shooter' && this.s3JumpSpreadAge != null) {
      const age = this.s3JumpSpreadAge, hold = w.jumpSpreadHold ?? 0, end = Math.max(hold + 1e-10, w.jumpSpreadRecoverEnd ?? hold);
      let base;
      if (age <= hold + 1e-10) base = w.spreadAir;
      else if (age < end - 1e-10) base = w.spreadAir + (w.spreadGround - w.spreadAir) * ((age - hold) / (end - hold));
      else { base = w.spreadGround; if (this.a.grounded) this.s3JumpSpreadAge = null; }
      return base; // S3 maximum outer envelope; bias is applied on each admitted shot
    }
    if (w.kind === 'dualies') {
      // #887: publish the jump-derived outer envelope while the biased recovery
      // clock is active; the per-shot probability is sampled at fire time. The
      // LapOver post-roll turret cone stays a separate owner.
      if (this.s3Turret || this.lockT > 0) return w.spreadLock;
      const state = this.s3DualiesJumpState(w);
      const base = state.active ? state.envelope : (this.a.grounded ? w.spreadGround : w.spreadAir);
      const first = w.spreadFirst ?? .45;
      return base * (first + (1 - first) * this.bloom);
    }
    if (w.kind === 'shooter') return this.a.grounded ? w.spreadGround : w.spreadAir;
    return spread.call(this, w);
  };
  const fireBlaster = Projectiles.prototype.fireBlaster;
  Projectiles.prototype.fireBlaster = function (a, w, spreadDeg) {
    const state = a?.weaponRunner?.s3BlasterJumpState?.(w);
    const bias = state?.active ? state.bias : (a.grounded ? 0 : BLASTER_BIAS_MAX);
    const full = state?.active ? state.envelope : spreadDeg;
    return withShotBias(a, bias, bias, () => fireBlaster.call(this, a, w, full));
  };
  const fireShooter = Projectiles.prototype.fireShooter;
  const shooterSource = profile.weaponsFidelityCompletion?.weapons?.shooter;
  const shooterSpawn = shooterSource?.SplashSpawnParam;
  const shooterPaint = shooterSource?.SplashPaintParam;
  const shooterScale = profile.weaponsFidelityCompletion?.worldUnitsPerSourceUnit;
  const nearDown = new THREE.Vector3(0, -1, 0), nearOrigin = new THREE.Vector3(), nearHit = new Hit();
  Projectiles.prototype.fireShooter = function (a, weapon, spreadDeg) {
    const accuracy = a.weaponRunner?.s3Accuracy;
    const bias = accuracy?.shot(!!a.grounded, a.weaponRunner?.s3JumpSpreadAge);
    const maxDeviation = Number.isFinite(spreadDeg) ? spreadDeg : (a.grounded ? weapon.spreadGround : weapon.spreadAir);
    const result = withShotBias(a, bias, bias,
      () => fireShooter.call(this, a, weapon, maxDeviation));
    if (a.weaponRunner && weapon.kind === 'shooter') {
      const runner = a.weaponRunner;
      runner.s3PostFireLockActive = true;
      runner.s3ShooterStreamActive = true;
      // #507: count only accepted, emitted main rounds. Remote visual ghosts
      // must not claim turf or move the authoritative nearest-splash cadence.
      if (!a.remote && shooterSpawn && shooterPaint &&
          Number.isFinite(shooterScale) && shooterScale > 0 &&
          Number.isFinite(shooterSpawn.SpawnNearestLength) &&
          Number.isFinite(shooterPaint.WidthHalfNearest) &&
          advanceShooterNearestSlot(runner, shooterSpawn) &&
          G.physics?.raycast && G.paint?.splat) {
        const heading = Number.isFinite(a.aimYaw) ? a.aimYaw : a.yaw;
        const dist = shooterSpawn.SpawnNearestLength * shooterScale;
        nearOrigin.copy(a.pos);
        nearOrigin.x += Math.sin(heading) * dist;
        nearOrigin.z += Math.cos(heading) * dist;
        nearOrigin.y += 0.4;
        const contact = G.physics.raycast(nearOrigin, nearDown, 10 * shooterScale, nearHit, true);
        if (contact.hit && contact.normal.y >= 0.4) {
          const radius = shooterPaint.WidthHalfNearest * shooterScale;
          const seed = ((runner.s3ShooterNearestSlot * 2654435761) >>> 0) / 4294967296;
          a.addTurf(G.paint.splat(nearOrigin.copy(contact.point).addScaledVector(contact.normal, 0.05), radius, a.team, { seed, claimOwner: a }));
        }
      }
      // An emitted round, not cosmetic firing pose, opens the sourced 4F movement window.
      a.weaponRunner.s3ShooterMoveRemaining = weapon.postFireSwimLock ?? 4 / 60;
    }
    return result;
  };
  const fireCharger = Projectiles.prototype.fireCharger;
  Projectiles.prototype.fireCharger = function (a, w, charge) {
    if (!isChargerFullCharge(charge)) return fireCharger.call(this, a, w, charge);
    const muzzle = this._muzzle(a, new THREE.Vector3()).clone(), dir = this._aimFrom(a, muzzle, new THREE.Vector3()).clone();
    const fieldRadius = Math.max(0, +w.fieldCollisionRadius || 0);
    const hit = fieldRadius && this.inkFlight?.world && G.physics.level
      ? this.inkFlight.world(muzzle, muzzle.clone().addScaledVector(dir, w.rangeMax), fieldRadius, new Hit())
      : G.physics.raycast(muzzle, dir, w.rangeMax, new Hit(), true);
    let length = hit.hit ? hit.dist : w.rangeMax;
    if (G.boss) { const bh = G.boss.segHit(muzzle, muzzle.clone().addScaledVector(dir, length), .1); if (bh) length = Math.min(length, bh.dist); }
    const end = muzzle.clone().addScaledVector(dir, length), result = { t: 0, dist: 0 }, victims = [];
    for (const e of G.actors) {
      if (!e.alive || e.team === a.team) continue;
      const base = e.pos.clone(); base.y += e.smoothY || 0;
      Physics.segmentCapsuleDist(muzzle, end, base, PLAYER.radius + .12, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, result);
      if (result.dist < PLAYER.radius + .14) victims.push({ actor: e, distance: result.t * length });
    }
    const actors = G.actors;
    try { G.actors = []; fireCharger.call(this, a, w, charge); }
    finally { G.actors = actors; }
    for (const { actor } of victims.sort((x, y) => x.distance - y.distance)) this.applyHit(a, actor, w.damageMax, 'charger');
  };
  const auto = WeaponRunner.prototype._auto;
  WeaponRunner.prototype._auto = function (dt, input, w) {
    if (w.kind === 'shooter') {
      if (this.cooldown <= 1e-10) this.cooldown = 0;
      if (input.fire && this.cooldown <= 1e-10 && this.a.ink + 1e-10 < w.inkPerShot)
        this.s3ShooterStreamActive = false;
      const pressed = !!input.fire && !this.s3ShooterHeld && !this.s3ShooterCancelMain;
      if (!input.fire) this.s3ShooterHeld = false;
      else if (pressed && !this.s3ShooterPendingFirst) {
        this.s3ShooterHeld = true;
        const emerged = this.a.kidT <= (w.swimFirstShotDelay || 0) + 1e-10;
        this.s3ShooterPendingFirst = true;
        this.s3ShooterFirstRemaining = emerged ? 0 : (w.firstShotDelay || 0);
      }
      if (this.s3ShooterPendingFirst) {
        this.s3ShooterFirstRemaining = Math.max(0, this.s3ShooterFirstRemaining - dt);
        this.firingT = .35; this.a.fireFacing = .5;
        this.cooldown = Math.max(0, this.cooldown);
        if (this.s3ShooterFirstRemaining > 1e-10) return;
        this.s3ShooterFirstRemaining = 0;
        this.s3ShooterPendingFirst = false;
        const inkBefore = this.a.ink;
        const result = auto.call(this, dt, { ...input, fire: true }, w);
        if (this.a.ink < inkBefore - 1e-10) this.s3PostFireLockActive = true;
        return result;
      }
      if (!input.fire) {
        this.s3ShooterFirstRemaining = 0;
        return auto.call(this, dt, input, w);
      }
      const inkBefore = this.a.ink;
      const result = auto.call(this, dt, input, w);
      if (this.a.ink < inkBefore - 1e-10) this.s3PostFireLockActive = true;
      return result;
    }
    if (w.kind !== 'blaster') return auto.call(this, dt, input, w);
    if (this.s3BlasterWindup > 0) {
      this.s3BlasterWindup -= dt; this.firingT = .35;
      if (this.s3BlasterWindup > 1e-10) return;
      this.s3BlasterWindup = 0;
      const beforeInk = this.a.ink;
      const result = auto.call(this, dt, { ...input, fire: true }, { ...w, fireInterval: w.fireInterval - w.preDelay });
      if (this.a.ink < beforeInk) {
        this.s3PostShotRemaining = w.postShotDelay;
        this.s3BlasterMoveRemaining = w.postShotDelay;
        this.s3InkRecoverRemaining = w.inkRecoverStop;
        this.s3BlasterHeldRepeat = !!input.fire;
      }
      return result;
    }
    if (input.fire && this.cooldown <= 0 && this.a.ink >= w.inkPerShot) { this.s3BlasterWindup = blasterStartupWindup(this.a, input.firePressed, dt, PLAYER.emergeDelay, w.preDelay); this.s3BlasterFromSwim = false; this.firingT = .35; return; }
    if (!input.fire) this.cooldown = Math.max(0, this.cooldown);
  };
  installSplatling(api, profile, { splatlingChargeCap, splatlingReservation, tickSplatlingInterrupt, releaseSplatlingInterrupt });
  installSplatlingStartupCompat(api);
  // Movement Physics owns roller rolling speed/recovery. Add only the latest
  // Charger charging-speed rule here, then delegate every other movement state.
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    const w = this.a.weapon;
    if (this.lockT > 0) return moveSpeed.call(this);
    if (w.kind === 'blaster' && this.s3BlasterMoveRemaining > 1e-10 && Number.isFinite(w.moveSpeedFiring)) return w.moveSpeedFiring;
    if (this.charging && w.kind === 'charger' && Number.isFinite(w.moveSpeedFiring)) return chargerPartialMoveSpeed(w, this.chargeT, PLAYER.runSpeed);
    return moveSpeed.call(this);
  };
  installSplatlingRadiusCharge(api, profile);
  installWeaponGates(api);
  installAgent3WeaponPhysics(api, profile);
  installFinalDamage(api);
  installContactRecovery(api);
  installWeaponEdgecases(api);
  installSplatlingJumpSpread(api);
  installWeaponAccuracy(api, profile);
  const applyHit = Projectiles.prototype.applyHit;
  Projectiles.prototype.applyHit = function (attacker, victim, damage, weaponId, groupId) {
    // Only Slosher wire hits carry a cumulative volley maximum. Other families
    // already supply incremental damage; preserve their group for final rounding.
    if (groupId == null || api.WEAPONS?.[weaponId]?.kind !== 'slosher')
      return applyHit.call(this, attacker, victim, damage, weaponId, groupId);
    const route = G.netm?.shouldApplyHit?.(attacker, victim);
    if (route === 'send' || route === 'drop') return applyHit.call(this, attacker, victim, damage, weaponId, groupId);
    // Reject unbounded/malformed remote IDs before allocating a wire ledger.
    const sequence = slosherSequence(groupId);
    if (sequence === null) return 'rejected';
    const groups = this._s3SlosherOwnerGroups || (this._s3SlosherOwnerGroups = new Map());
    const floors = this._s3SlosherOwnerFloors || (this._s3SlosherOwnerFloors = new Map());
    const source = volleySourceKey(attacker);
    const key = volleyOwnerKey(attacker, groupId);
    let group = groups.get(key);
    // Already-admitted groups retain their own committed damage maximum even
    // when an out-of-order newer volley advances the eviction watermark.
    if (!group) {
      if (sequence <= (floors.get(source) || 0)) return 'rejected';
      if (groups.size >= SLOSHER_OWNER_GROUP_LIMIT) {
        const retired = groups.keys().next().value;
        const [owner, actorId, retiredId] = JSON.parse(retired);
        const retiredSequence = slosherSequence(retiredId);
        if (retiredSequence === null) return 'rejected'; // preserve fail-closed replay safety
        const retiredSource = JSON.stringify([owner, actorId]);
        const nextFloor = Math.max(floors.get(retiredSource) || 0, retiredSequence);
        // A rejected late/alias packet must not evict a healthy live ledger.
        if (retiredSource === source && sequence <= nextFloor) return 'rejected';
        floors.set(retiredSource, nextFloor);
        groups.delete(retired);
      }
      group = new WeakMap(); groups.set(key, group);
    }
    const previous = group.get(victim) || 0, next = Math.max(previous, damage), delta = next - previous;
    if (!(delta > 0)) return 'accepted';
    const hpBefore = victim.hp, aliveBefore = victim.alive;
    const result = applyHit.call(this, attacker, victim, delta, weaponId, groupId);
    if (acceptedHit(result, victim, hpBefore, aliveBefore)) group.set(victim, next);
    return result;
  };
  const clearProjectiles = Projectiles.prototype.clear;
  Projectiles.prototype.clear = function (...args) {
    this._s3SlosherOwnerGroups?.clear();
    this._s3SlosherOwnerFloors?.clear();
    return clearProjectiles.apply(this, args);
  };
  installContactRecovery(api);
}

// Trajectory-preview presentation budget for Issue #798.
//
// The native bomb/special arc preview (`Projectiles.updateArc` in
// `inkwave-public/src/game/weapons.js`) recomputes its full ballistic +
// collision path whenever the actor's exact position or throw velocity
// changes. While aiming/moving, that is every render frame: up to
// (arcN - 1) * 2 = 126 `Physics.segment()` queries per frame (about 7.5k/s
// at 60 FPS). The guide is pure presentation: the actual bomb uses
// `throwBomb()` + `_updateBombs()` and never reads the preview buffers.
//
// This wrapper keeps every native trajectory semantic (same integrator,
// same collision call, same drawn buffers, same landing marker) and only
// decouples the collision-query cadence from the render cadence:
//   - throttle native recomputation to ARC_PREVIEW_MIN_INTERVAL_S (30 Hz);
//   - within an interval, reuse the cached line and still refresh the
//     per-frame presentation state (colors, visibility, ring pulse);
//   - let continuous position/aim changes share that bounded refresh cadence;
//   - always recompute on hide/show, actor change, physics change, cache loss,
//     a per-frame teleport/aim snap, or a throw-speed change above epsilon;
//   - never skip when the cached native result is stale or absent.
//
// Actual bomb gameplay physics, damage, paint, networking and lifecycle
// are untouched. The wrapper delegates to the original `updateArc` for
// every recomputation and every guard evaluation.
export const ARC_PREVIEW_MIN_INTERVAL_S = 1 / 30;
// These are local discontinuity detectors for presentation scheduling, not
// Splatoon 3 movement or aim values. Smooth changes are refreshed on cadence.
export const ARC_PREVIEW_POSITION_JUMP_M = 0.5;
// 30 Hz normal 1.2 rad/s aim can move throw velocity by more than 2 m/s.
// Keep that continuous input on cadence; larger steps still refresh at once.
export const ARC_PREVIEW_VELOCITY_JUMP_MPS = 4;
export const ARC_PREVIEW_SPEED_EPSILON = 0.05;

const ARC_PREVIEW_INSTALL = Symbol.for('inkwave.s3.arc-preview-performance.install.v1');
const ARC_PREVIEW_STATE = Symbol('inkwave.s3.arc-preview-performance.state');

function previewInputs(system, api, actor) {
  const speed = system.s3PreviewSubSpeed ?? api.SUB?.bomb?.throwSpeed;
  if (typeof system.throwVelocity !== 'function' || !Number.isFinite(speed)) return null;
  const scratch = system._arcPreviewPerfScratch
    || (system._arcPreviewPerfScratch = new api.THREE.Vector3());
  try {
    system.throwVelocity.call(system, actor, speed, scratch);
  } catch {
    return null;
  }
  return {
    px: actor.pos.x, py: actor.pos.y + 1.35, pz: actor.pos.z,
    vx: scratch.x, vy: scratch.y, vz: scratch.z,
    speed,
  };
}

function hasLargeInputStep(previous, current) {
  if (!previous || !current) return false;
  const dx = current.px - previous.px, dy = current.py - previous.py, dz = current.pz - previous.pz;
  const dvx = current.vx - previous.vx, dvy = current.vy - previous.vy, dvz = current.vz - previous.vz;
  return Math.hypot(dx, dy, dz) > ARC_PREVIEW_POSITION_JUMP_M
    || Math.hypot(dvx, dvy, dvz) > ARC_PREVIEW_VELOCITY_JUMP_MPS;
}

function throwSpeedChanged(previous, current) {
  return !!(previous && current
    && Math.abs((previous.speed ?? 0) - (current.speed ?? 0)) > ARC_PREVIEW_SPEED_EPSILON);
}

function nativeCacheReady(system, physics) {
  const cache = system._arcCache;
  return !!(cache && Number.isFinite(cache.px) && Number.isFinite(cache.vx)
    && Number.isFinite(cache.py) && Number.isFinite(cache.pz)
    && Number.isFinite(cache.vy) && Number.isFinite(cache.vz)
    && cache.physics === physics);
}

function refreshPresentationOnly(system, api, actor) {
  const cache = system._arcCache;
  const inkCost = api.SUB?.bomb?.inkCost;
  const hasInk = !(Number.isFinite(inkCost) && actor.ink < inkCost);
  const color = hasInk ? actor.color : system._arcPreviewPerfGrey
    || (system._arcPreviewPerfGrey = new api.THREE.Color(0.6, 0.6, 0.6));
  system.arcLine.material.color.copy(color).multiplyScalar(1.4);
  system.arcRing.material.color.copy(color).multiplyScalar(1.4);
  system.arcLine.visible = true;
  system.arcRing.visible = !!cache.landed;
  const now = api.G?.time;
  system.arcRing.scale.setScalar(1 + Math.sin((Number.isFinite(now) ? now : 0) * 8) * 0.06);
}

export function installArcPreviewPerformance(api) {
  const { G, Projectiles } = api;
  if (!Projectiles?.prototype?.updateArc || Projectiles.prototype[ARC_PREVIEW_INSTALL]) return;
  const nativeUpdateArc = Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc = function (actor, show) {
    if (!show || !actor || !actor.alive) {
      delete this[ARC_PREVIEW_STATE];
      return nativeUpdateArc.call(this, actor, show);
    }
    const now = Number.isFinite(G?.time) ? G.time : 0;
    const inputs = previewInputs(this, api, actor);
    const state = this[ARC_PREVIEW_STATE];
    const actorChanged = !state || state.actor !== actor;
    const physicsChanged = !state || state.physics !== G.physics;
    const inputsUnknown = !inputs;
    const largeInputStep = !inputsUnknown && hasLargeInputStep(state?.lastInputs, inputs);
    const speedChanged = !inputsUnknown && throwSpeedChanged(state?.inputs, inputs);
    const cacheStale = !nativeCacheReady(this, G.physics);
    const intervalElapsed = !state || !Number.isFinite(state.time)
      || (now - state.time) >= ARC_PREVIEW_MIN_INTERVAL_S - 1e-9
      || now < state.time;
    // Keep at least one cached draw between ordinary refreshes, including at
    // 30 Hz. A long scheduling gap or reversed clock still refreshes at once.
    const cadenceReady = intervalElapsed && (!state || state.hits > 0
      || now < state.time || now - state.time > 2 * ARC_PREVIEW_MIN_INTERVAL_S + 1e-9);
    const mustRecompute = actorChanged || physicsChanged || inputsUnknown
      || !state?.inputs || cacheStale || cadenceReady || largeInputStep || speedChanged;
    if (!mustRecompute && state && state.inputs) {
      refreshPresentationOnly(this, api, actor);
      // Compare discontinuities to the immediately previous render sample.
      // Incremental walking/aiming therefore cannot evade the time budget by
      // accumulating just beyond an epsilon from the last native refresh.
      state.lastInputs = inputs;
      state.hits = (state.hits || 0) + 1;
      return;
    }
    const result = nativeUpdateArc.call(this, actor, show);
    this[ARC_PREVIEW_STATE] = {
      actor, physics: G.physics, time: now,
      inputs: inputsUnknown ? null : { ...inputs },
      lastInputs: inputsUnknown ? null : inputs,
      hits: 0,
    };
    return result;
  };
  Object.defineProperty(Projectiles.prototype, ARC_PREVIEW_INSTALL, { value: true, configurable: false });
  Object.defineProperty(Projectiles.prototype, Symbol.for('inkwave.s3.arc-preview-performance.originals.v1'), {
    value: Object.freeze({ updateArc: nativeUpdateArc }), configurable: false,
  });
}

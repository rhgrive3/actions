// Pure Rainmaker rule state. The host owns actor identity, movement modifiers,
// weapon admission, networking and presentation; this module emits only rule
// events and reads the small frame contract documented next to the ranked rules.
//
// Version reference: Splatoon 3 Ver. 11.3.0, Leanny's pinned data dump:
//   data/parameter/1130/misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json
//   data/parameter/1130/weapon/WeaponSpGachihoko.game__GameParameterTable.json
//   https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6
// Cross-checks: https://splatoonwiki.org/wiki/Rainmaker
// https://splatoonwiki.org/wiki/Rainmaker_Shield
// https://splatoonwiki.org/wiki/Rainmaker_(weapon)
// https://splatoonwiki.org/wiki/Overtime
// https://wikiwiki.jp/splatoon3mix/%E3%82%AC%E3%83%81%E3%83%9B%E3%82%B3%E3%83%90%E3%83%88%E3%83%AB
//
// The 11.3.0 Gachihoko table exposes native projectile parameters but not the
// firing charge thresholds. The Splatoon3mix shot table gives 60F full charge,
// a 20F minimum partial charge, and the damage/range values used below. The
// host must convert native DU/F projectile speeds into its world units/second.
// Stage-provided retreatZ boundaries remain stage data, not game-wide values.

import { canCollectRainmaker } from './clams.mjs';
export const RAINMAKER_BARRIER_MAX = 1000;
export const RAINMAKER_RESPAWN_SECONDS = 3;
export const RAINMAKER_CARRY_SECONDS = 60;
export const RAINMAKER_RETREAT_MULTIPLIER = 4;
export const RAINMAKER_DROP_RETURN_SECONDS = 15;
export const RAINMAKER_OVERTIME_GRACE_SECONDS = 15;
export const RAINMAKER_FULL_CHARGE_SECONDS = 1;
export const RAINMAKER_MIN_CHARGE_SECONDS = 20 / 60;
export const RAINMAKER_SHOT_RECOVERY_SECONDS = 20 / 60;
// S3mix lists 30F for direct goal entry. Authored flat goals use this case;
// retail side-climb/Surge entry classification and its 37F/60F are unverified.
export const RAINMAKER_GOAL_HOLD_SECONDS = 30 / 60;
const emptyCharge = () => ({ seconds: 0, value: 0, firing: false, delay: 0, recovery: 0, pending: null, wasSwimming: false });

// Leanny 11.3.0 DamageRateInfo rows for `Gachihoko_Barrier`. `damage` in a
// barrier hit is ordinary weapon damage before this object multiplier; callers
// may pass `multiplier` explicitly when their weapon row is already resolved.
export const RAINMAKER_BARRIER_MULTIPLIERS = Object.freeze({
  Blaster: 2.1, Blaster_BlasterLightShort: 2.1, Blaster_BlasterMiddle: 1.9,
  Blaster_BlasterShort: 2.1, Blaster_KillOneShot: 1.9,
  BlowerExhale: 0, BlowerExhale_BombCore: 5.6,
  Bomb: 2, Bomb_CurlingBullet: 0, Bomb_DirectHit: 2, Bomb_Fizzy: 3.6,
  Bomb_Suction: 2, Bomb_TorpedoBullet: 4, Bomb_Trap: 2,
  BrushCore: 0, BrushSplash: 1.8, BrushSplash_Heavy: 1.8,
  Castle: 5, Charger: 2, ChargerFull: 2, ChargerFull_Light: 2,
  ChargerFull_Long: 2.3, Charger_Light: 2, Charger_Long: 2,
  Chariot_Cannon: 3, Chimney: 3, Gachihoko_BombCore: 2,
  GachihokoTimeUpBurst: 0, InkStorm: 5, InkStormRain: 0,
  Jetpack_BombCore: 2.8, Jetpack_Bullet: 2.8, Jetpack_Coop: 1,
  Jetpack_Jet: 2.8, Maneuver_SideStep_BombCore: 2,
  MicroLaser: 2.4, NiceBall: 3, ObjectEffect_Up: 1.1, Pogo: 2.5,
  RollerCore: 0, RollerSplash: 1.8, RollerSplash_Compact: 1.8,
  RollerSplash_Heavy: 1.8, RollerSplash_Hunter: 1.8, RollerSplash_Wide: 3.6,
  Saber_ChargeShot: 3.2, Saber_ChargeSlash: 0.8,
  Saber_ChargeSlash_Penetrate: 0.8, Saber_Shot: 3.2, Saber_Slash: 1.6,
  SakerocketBullet: 0, ShelterCanopy: 2.4, ShelterCanopy_Compact: 2.4,
  ShelterCanopy_Wide: 2.4, ShelterShot: 2.4, ShelterShot_Compact: 2.4,
  ShelterShot_Wide: 2.4, Shield: 0.2, ShockSonar_Wave: 8,
  Shooter_Flash: 1.1, Shooter_FlashRepeat: 1.1, Shooter_Short: 1.1,
  Shooter_TripleMiddle: 1.2, Shooter_TripleQuick: 1.15,
  Skewer: 5, Skewer_Body: 0, Slosher: 2.4, Slosher_Bathtub: 2,
  Slosher_Bear: 2.4, Slosher_Washtub: 3.6, Slosher_WashtubBombCore: 3.2,
  Sprinkler: 0.6, Stringer: 2, Stringer_Short: 1.5556,
  SuperHook: 2, SuperLanding: 2, TripleTornado: 2, UltraShot: 2,
  UltraStamp_Swing: 3, UltraStamp_Throw: 1.909,
  UltraStamp_Throw_BombCore: 1.909,
});

// Coarse aliases are for callers that classify a hit by weapon family instead
// of forwarding the native DamageRateInfo row. Ambiguous actions should use a
// row (for example RollerCore versus RollerSplash) or pass `multiplier`.
const BARRIER_KIND_ALIASES = Object.freeze({
  shooter: 1, splatling: 1, spinner: 1, dualie: 1, dualies: 1,
  roller: 1.8, rollerswing: 1.8, rollerflick: 1.8, rollerroll: 0,
  brush: 1.8, brushswing: 1.8, brushroll: 0,
  charger: 2, chargerfull: 2, longchargerfull: 2.3,
  blaster: 2.1, slosher: 2.4, brella: 2.4, umbrella: 2.4,
  stringer: 2, splatana: 1.6, splatanaswing: 1.6, splatanacharge: 0.8,
  splatanabeam: 3.2, bomb: 2,
});

const POP_DAMAGE = 900;
// The shield pop is described as a lethal, large spherical blast. The exact
// radius is not exposed by the cited source data, so this is an adapter-facing
// presentation/collision default and remains a calibration item.
const POP_RADIUS = 7;
const PICKUP_RADIUS = 1.5;
const CHECKPOINT_RADIUS = 1.6;
const GOAL_RADIUS = 1.8;
// Fallback death detection for hosts that expose floorAt but have not already
// marked a falling actor dead. The exact vertical rescue boundary is not part
// of the pure ranked-rule data and is intentionally not claimed as source data.
const FALL_BELOW_FLOOR = 2;
const FULL_SHOT_DAMAGE = 60;
const PARTIAL_SHOT_MIN_DAMAGE = 30;
const PARTIAL_SHOT_MAX_DAMAGE = 45;
const FULL_SHOT_DIRECT_RANGE = 4.4;
const FULL_SHOT_NEAR_RANGE = 5.3;
const FULL_SHOT_EFFECTIVE_RANGE = 5.8;
const FULL_SHOT_NEAR_RADIUS = 0.92;
const FULL_SHOT_FAR_RADIUS = 1.4;
const PARTIAL_SHOT_MIN_RANGE = 2;
const PARTIAL_SHOT_MAX_RANGE = 3.4;
const PARTIAL_SHOT_MIN_PAINT_RADIUS = 1.8;
const PARTIAL_SHOT_MAX_PAINT_RADIUS = 2.4;
// WeaponSpGachihoko stores SpawnSpeed in native DU/F. Match the host's
// established 0.02 world-unit/DU scale and its 60Hz seconds-based physics.
const GAME_FRAMES_PER_SECOND = 60;
const WORLD_UNITS_PER_DU = 0.02;
const nativeSpeedToWorldPerSecond = speed => speed * 10 * GAME_FRAMES_PER_SECOND * WORLD_UNITS_PER_DU;
const FULL_SHOT_SPEED = nativeSpeedToWorldPerSecond(1.5);
const PARTIAL_SHOT_SPEED = nativeSpeedToWorldPerSecond(1.2);

const validTeam = team => team === 0 || team === 1;
const finite = value => Number.isFinite(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const copyPos = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finite)
  ? value.slice(0, 3) : [0, 0, 0];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const positionOf = actor => copyPos(actor?.pos);
const validId = id => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
const ageBy = (value, dt) => value === null ? null : value + dt;

function validPoints(points) {
  return Array.isArray(points) ? points.map(point => copyPos(point)) : [];
}

function initialState(stage) {
  const config = stage?.rainmaker ?? {};
  const center = copyPos(config.center);
  const checkpoints = [0, 1].map(team => validPoints(config.checkpoints?.[team]));
  return {
    pos: center,
    carrier: null,
    carrierTeam: null,
    barrier: { active: true, max: RAINMAKER_BARRIER_MAX, health: RAINMAKER_BARRIER_MAX, balance: 0, team: null },
    charge: emptyCharge(),
    goalHold: null,
    checkpoint: {
      passed: [false, false],
      choice: [null, null],
      goalOpen: checkpoints.map(points => points.length === 0),
      lastPassTeam: null,
      sincePass: null,
    },
    holderTime: 0,
    holderRemaining: RAINMAKER_CARRY_SECONDS,
    retreatRate: 1,
    dropped: false,
    dropTimer: 0,
    lastDropTeam: null,
    lastDropReason: null,
    lastDropAge: null,
    lastCarrierTeam: null,
    shotSequence: 0,
    respawnRemaining: 0,
    pickupZ: null,
    lastGroundedPos: center.slice(),
    tickSerial: 0,
    overtime: {
      active: false,
      losingTeam: null,
      winningTeam: null,
      graceRemaining: null,
      graceReason: null,
      graceStartTick: null,
    },
    terminal: false,
  };
}

function normalizedKind(kind) {
  if (typeof kind !== 'string') return '';
  return kind.trim().replace(/[^a-zA-Z0-9_]/g, '');
}

function barrierMultiplier(hit) {
  if (finite(hit?.multiplier) && hit.multiplier >= 0) return hit.multiplier;
  const kind = normalizedKind(hit?.kind);
  if (Object.hasOwn(RAINMAKER_BARRIER_MULTIPLIERS, kind)) return RAINMAKER_BARRIER_MULTIPLIERS[kind];
  const alias = kind.toLowerCase();
  return Object.hasOwn(BARRIER_KIND_ALIASES, alias) ? BARRIER_KIND_ALIASES[alias] : 1;
}

/** Authoritative game-mode state for a Splatoon-style Rainmaker match. */
export class RainmakerRule {
  constructor(engine, stage) {
    this.engine = engine;
    this.stage = stage ?? {};
    this.config = this.stage.rainmaker ?? {};
    this.center = copyPos(this.config.center);
    this.goals = [0, 1].map(team => {
      const goal = this.config.goals?.[team];
      return Array.isArray(goal) && goal.length >= 3 && goal.slice(0, 3).every(finite)
        ? goal.slice(0, 3) : null;
    });
    this.checkpoints = [0, 1].map(team => validPoints(this.config.checkpoints?.[team]));
    this.retreatZ = [0, 1].map(team => finite(this.config.retreatZ?.[team]) ? this.config.retreatZ[team] : null);
    this.state = initialState(this.stage);
  }

  update(dt, frame = {}) {
    if (this.state.terminal || (this.engine?.winner !== null && this.engine?.winner !== undefined)) return;
    dt = finite(dt) && dt > 0 ? dt : 0;
    this.state.tickSerial++;
    if (this.state.respawnRemaining > 0) {
      this.state.respawnRemaining = Math.max(0, this.state.respawnRemaining - dt);
      if (this.state.respawnRemaining <= 1e-9) {
        this.state.respawnRemaining = 0;
        this.state.barrier = { active: true, max: RAINMAKER_BARRIER_MAX, health: RAINMAKER_BARRIER_MAX, balance: 0, team: null };
      }
    }
    this._ageUnclaimed(dt);
    this.state.lastDropAge = ageBy(this.state.lastDropAge, dt);
    this.state.checkpoint.sincePass = ageBy(this.state.checkpoint.sincePass, dt);

    const actors = Array.isArray(frame.actors) ? frame.actors : [];
    const carrier = this._findActor(actors, this.state.carrier);
    if (this.state.carrier !== null && (!carrier || carrier.alive === false)) {
      this._drop(carrier, carrier ? 'death' : 'death');
    } else if (carrier && this._isFallen(carrier, frame)) {
      this._drop(carrier, 'fall');
    }

    this._applyBarrierHits(frame.barrierHits);
    this._tryPickup(actors);
    this._updateCarrier(dt, frame, actors);
    this._awardPassiveSpecial(dt);
    this._checkOvertimeLead();
  }

  beginOvertime() {
    if (this.engine?.winner !== null && this.engine?.winner !== undefined) return false;
    if (this.state.overtime.active) return true;
    const teams = this._teamsAtDeadline();
    if (!teams) return false;
    const { losingTeam, winningTeam } = teams;
    const holdingLosing = this.state.carrier !== null && this.state.carrierTeam === losingTeam;
    const recentWinningDrop = this.state.carrier === null
      && this.state.lastDropTeam === winningTeam
      && this.state.lastDropReason !== 'checkpoint'
      && this.state.lastDropAge !== null
      && this.state.lastDropAge < RAINMAKER_OVERTIME_GRACE_SECONDS;
    const recentLosingCheckpoint = this.state.carrier === null
      && this.state.checkpoint.lastPassTeam === losingTeam
      && this.state.checkpoint.sincePass !== null
      && this.state.checkpoint.sincePass < RAINMAKER_OVERTIME_GRACE_SECONDS;
    if (!holdingLosing && !recentWinningDrop && !recentLosingCheckpoint) return false;

    let graceRemaining = null;
    let graceReason = null;
    if (!holdingLosing && recentWinningDrop) {
      graceRemaining = Math.max(0, RAINMAKER_OVERTIME_GRACE_SECONDS - this.state.lastDropAge);
      graceReason = 'winning-team-drop';
    } else if (!holdingLosing && recentLosingCheckpoint) {
      graceRemaining = Math.max(0, RAINMAKER_OVERTIME_GRACE_SECONDS - this.state.checkpoint.sincePass);
      graceReason = 'losing-team-checkpoint';
    }
    this.state.overtime = {
      active: true,
      losingTeam,
      winningTeam,
      graceRemaining,
      graceReason,
      graceStartTick: this.state.tickSerial,
    };
    this._event('overtime', { team: losingTeam, mode: 'rainmaker' });
    return true;
  }

  updateOvertime(dt, frame = {}) {
    const overtime = this.state.overtime;
    if (!overtime.active || this.state.terminal || this.engine?.winner !== null && this.engine?.winner !== undefined) return;
    dt = finite(dt) && dt > 0 ? dt : 0;
    this._checkOvertimeLead();
    if (this.state.terminal) return;

    if (this.state.carrier !== null) {
      if (this.state.carrierTeam === overtime.winningTeam) {
        this._finish(overtime.winningTeam, 'rainmaker-overtime-control');
        return;
      }
      if (this.state.carrierTeam === overtime.losingTeam) {
        overtime.graceRemaining = null;
        overtime.graceReason = null;
        return;
      }
    }

    if (this.state.lastDropTeam === overtime.losingTeam
      && this.state.lastDropAge === 0
      && this.state.lastDropReason !== 'checkpoint') {
      this._finish(overtime.winningTeam, 'rainmaker-overtime-carrier-lost');
      return;
    }

    if (overtime.graceRemaining === null) {
      if (this.state.lastDropTeam === overtime.winningTeam && this.state.lastDropAge !== null) {
        overtime.graceRemaining = Math.max(0, RAINMAKER_OVERTIME_GRACE_SECONDS - this.state.lastDropAge);
        overtime.graceReason = 'winning-team-drop';
        overtime.graceStartTick = this.state.tickSerial;
      } else if (this.state.checkpoint.lastPassTeam === overtime.losingTeam && this.state.checkpoint.sincePass !== null) {
        overtime.graceRemaining = Math.max(0, RAINMAKER_OVERTIME_GRACE_SECONDS - this.state.checkpoint.sincePass);
        overtime.graceReason = 'losing-team-checkpoint';
        overtime.graceStartTick = this.state.tickSerial;
      }
    }

    if (overtime.graceRemaining !== null) {
      if (overtime.graceStartTick !== this.state.tickSerial) overtime.graceRemaining = Math.max(0, overtime.graceRemaining - dt);
      if (overtime.graceRemaining <= 0) this._finish(overtime.winningTeam, 'rainmaker-overtime-no-recapture');
    }
  }

  snapshot() {
    return structuredClone(this.state);
  }

  restore(state) {
    const cloned = structuredClone(state ?? {});
    const base = initialState(this.stage);
    this.state = { ...base, ...cloned };
    this.state.barrier = { ...base.barrier, ...(cloned.barrier ?? {}) };
    this.state.charge = { ...base.charge, ...(cloned.charge ?? {}) };
    this.state.checkpoint = { ...base.checkpoint, ...(cloned.checkpoint ?? {}) };
    this.state.overtime = { ...base.overtime, ...(cloned.overtime ?? {}) };
    for (const key of ['passed', 'choice', 'goalOpen']) {
      if (!Array.isArray(this.state.checkpoint[key]) || this.state.checkpoint[key].length !== 2) {
        this.state.checkpoint[key] = base.checkpoint[key].slice();
      }
    }
    this.state.pos = copyPos(this.state.pos);
    if (!validId(this.state.carrier)) this.state.carrier = null;
    if (!validTeam(this.state.carrierTeam)) this.state.carrierTeam = null;
    return this;
  }

  removeActor(id) {
    if (id === this.state.carrier) this._drop(null, 'death');
  }

  botGoal(actor, frame = {}) {
    if (!actor || !validTeam(actor.team)) return null;
    const actors = Array.isArray(frame.actors) ? frame.actors : [];
    const carrierActor = this._findActor(actors, this.state.carrier);
    if (this.state.carrier !== null && this.state.carrierTeam !== actor.team) {
      const target = carrierActor ? positionOf(carrierActor) : this.state.pos.slice();
      return { pos: target, action: 'defend', aim: target.slice() };
    }
    if (this.state.carrier !== null && this.state.carrierTeam === actor.team && this.state.carrier !== actor.id) {
      const target = carrierActor ? positionOf(carrierActor) : this.state.pos.slice();
      return { pos: target, action: 'defend', aim: target.slice() };
    }
    if (this.state.carrier === actor.id && this.state.carrierTeam === actor.team) {
      const pos = this._nextObjective(actor.team, actor.pos);
      return { pos, action: 'carry', aim: pos.slice() };
    }
    if (this.state.barrier.active) return { pos: this.state.pos.slice(), action: 'barrier', aim: this.state.pos.slice() };
    return { pos: this.state.pos.slice(), action: 'carry', aim: this.state.pos.slice() };
  }

  _applyBarrierHits(hits) {
    if (!this.state.barrier.active || !Array.isArray(hits)) return;
    const teamDamage = [0, 0];
    let lastHitByTeam = [null, null];
    for (const hit of hits) {
      if (!validTeam(hit?.team) || !finite(hit?.damage) || hit.damage <= 0) continue;
      const applied = hit.damage * barrierMultiplier(hit);
      if (!finite(applied) || applied <= 0) continue;
      teamDamage[hit.team] += applied;
      lastHitByTeam[hit.team] = hit;
    }
    const balance = this.state.barrier.balance + teamDamage[0] - teamDamage[1];
    this.state.barrier.balance = clamp(balance, -RAINMAKER_BARRIER_MAX, RAINMAKER_BARRIER_MAX);
    this.state.barrier.team = this.state.barrier.balance === 0 ? null : this.state.barrier.balance > 0 ? 0 : 1;
    this.state.barrier.health = Math.max(0, this.state.barrier.max - Math.abs(this.state.barrier.balance));
    if (Math.abs(balance) >= RAINMAKER_BARRIER_MAX) {
      const team = balance > 0 ? 0 : 1;
      this._popBarrier(team, lastHitByTeam[team]);
    }
  }

  _popBarrier(team, hit) {
    if (!this.state.barrier.active) return;
    this.state.barrier.active = false;
    this.state.barrier.team = team;
    this.state.barrier.balance = team === 0 ? RAINMAKER_BARRIER_MAX : -RAINMAKER_BARRIER_MAX;
    this.state.barrier.health = 0;
    this.state.dropped = true;
    this.state.dropTimer = 0;
    this._event('rainmaker-pop', {
      pos: this.state.pos.slice(), team, radius: POP_RADIUS, damage: POP_DAMAGE,
      ...(validId(hit?.id) ? { id: String(hit.id) } : {}),
    });
  }

  _tryPickup(actors) {
    if (this.state.carrier !== null || this.state.barrier.active || this.state.respawnRemaining > 0 || !Array.isArray(actors)) return;
    const candidates = actors.filter(actor => actor?.alive !== false && validTeam(actor?.team)
      && canCollectRainmaker(actor) && validId(actor?.id) && distance(positionOf(actor), this.state.pos) <= PICKUP_RADIUS);
    candidates.sort((a, b) => distance(positionOf(a), this.state.pos) - distance(positionOf(b), this.state.pos)
      || String(a.id).localeCompare(String(b.id)));
    const actor = candidates[0];
    if (!actor) return;
    this.state.carrier = actor.id;
    this.state.carrierTeam = actor.team;
    this.state.lastCarrierTeam = actor.team;
    const pickupPosition = this.state.pos.slice();
    this.state.pos = positionOf(actor);
    this.state.pickupZ = this.state.pos[2];
    this.state.lastGroundedPos = actor.grounded === true ? this.state.pos.slice() : pickupPosition;
    this.state.holderTime = 0;
    this.state.holderRemaining = RAINMAKER_CARRY_SECONDS;
    this.state.retreatRate = 1;
    this.state.charge = emptyCharge();
    this.state.charge.wasSwimming = !!actor.swimming;
    this.state.goalHold = null;
    this.state.dropped = false;
    this.state.dropTimer = 0;
    this.state.barrier = { active: false, max: RAINMAKER_BARRIER_MAX, health: 0, balance: 0, team: null };
    this._event('rainmaker-pickup', { id: actor.id, team: actor.team, pos: this.state.pos.slice() });
  }

  _updateCarrier(dt, frame, actors) {
    if (this.state.carrier === null) return;
    const actor = this._findActor(actors, this.state.carrier);
    if (!actor || actor.alive === false) return;
    const team = this.state.carrierTeam;
    const pos = positionOf(actor);
    this.state.pos = pos;
    if (actor.grounded === true) this.state.lastGroundedPos = pos.slice();

    const retreat = this._isRetreating(team, pos[2]);
    const rate = retreat ? RAINMAKER_RETREAT_MULTIPLIER : 1;
    this.state.retreatRate = rate;
    this.state.holderTime += dt * rate;
    this.state.holderRemaining = Math.max(0, RAINMAKER_CARRY_SECONDS - this.state.holderTime);
    if (this.state.holderRemaining <= 0) {
      this._timeout(actor, team);
      return;
    }

    if (actor.grounded === true || frame.countAllowed?.(actor) === true) this._updateCount(team, pos);
    if (this.state.carrier === null) return;
    if (actor.grounded === true) this._checkCheckpoint(actor);
    if (this.state.carrier === null) return;
    if (actor.grounded === true && this.state.checkpoint.goalOpen[team] && this._touchesGoal(team, pos)) {
      if (!this.state.goalHold) {
        this.state.goalHold = { remaining: RAINMAKER_GOAL_HOLD_SECONDS };
        this.state.charge = emptyCharge();
        this._event('rainmaker-goal-hold', { id: actor.id, team, pos: pos.slice() });
      } else {
        this.state.goalHold.remaining = Math.max(0, this.state.goalHold.remaining - dt);
        if (this.state.goalHold.remaining <= 1e-9) {
          this.state.pos = this.goals[team].slice();
          this._setCount(team, 0);
          this._finish(team, 'rainmaker-goal');
        }
      }
      return;
    }
    this.state.goalHold = null;
    this._updateShot(dt, actor, frame.inputs?.[actor.id]);
  }

  _updateShot(dt, actor, input) {
    const c = this.state.charge;
    c.wasSwimming ||= !!actor.swimming;
    let remaining = dt;
    // Recovery and both one-frame windups consume elapsed time, including
    // overshoot at low frame rates. A release is latched, never fired twice.
    if (c.pending) {
      const used = Math.min(remaining, c.delay); c.delay -= used; remaining -= used;
      if (c.delay > 1e-9) return;
      this._event('rainmaker-shot', c.pending); c.pending = null;
      c.recovery = RAINMAKER_SHOT_RECOVERY_SECONDS;
    }
    if (c.recovery > 0) {
      const used = Math.min(remaining, c.recovery); c.recovery -= used; remaining -= used;
      if (c.recovery > 1e-9) return;
      c.recovery = 0;
    }
    const firing = input?.fire === true && !(actor.swimming && c.firing);
    if (firing) {
      if (!c.firing) c.delay = (c.wasSwimming || actor.swimming ? 6 : 1) / 60;
      c.wasSwimming = false; c.firing = true;
      const used = Math.min(remaining, c.delay); c.delay -= used; remaining -= used;
      const previousCharge = c.value;
      this.state.charge.seconds = Math.min(RAINMAKER_FULL_CHARGE_SECONDS, this.state.charge.seconds + remaining);
      if (c.seconds >= RAINMAKER_FULL_CHARGE_SECONDS - 1e-9) c.seconds = RAINMAKER_FULL_CHARGE_SECONDS;
      this.state.charge.value = RAINMAKER_FULL_CHARGE_SECONDS > 0
        ? clamp(this.state.charge.seconds / RAINMAKER_FULL_CHARGE_SECONDS, 0, 1) : 1;
      this.state.charge.firing = true;
      if (previousCharge < 1 && c.value >= 1) this._event('rainmaker-charged', { id: actor.id, team: actor.team, pos: positionOf(actor) });
      return;
    }
    if (!actor.swimming && this.state.charge.firing && this.state.charge.seconds > 0) {
      const charge = clamp(this.state.charge.value, 0, 1);
      if (this.state.charge.seconds < RAINMAKER_MIN_CHARGE_SECONDS - 1e-9) {
        this.state.charge = emptyCharge();
        return;
      }
      const fullCharge = charge >= 1;
      const partialCharge = clamp(
        (charge - RAINMAKER_MIN_CHARGE_SECONDS / RAINMAKER_FULL_CHARGE_SECONDS)
          / (1 - RAINMAKER_MIN_CHARGE_SECONDS / RAINMAKER_FULL_CHARGE_SECONDS),
        0, 1,
      );
      const damage = fullCharge ? FULL_SHOT_DAMAGE
        : PARTIAL_SHOT_MIN_DAMAGE + (PARTIAL_SHOT_MAX_DAMAGE - PARTIAL_SHOT_MIN_DAMAGE) * partialCharge;
      const blastDamage = fullCharge ? 180 : 0;
      const outerDamage = fullCharge ? 40 : 0;
      const radius = fullCharge ? FULL_SHOT_FAR_RADIUS : 0;
      const nearRadius = fullCharge ? FULL_SHOT_NEAR_RADIUS : 0;
      const directRange = fullCharge ? FULL_SHOT_DIRECT_RANGE : PARTIAL_SHOT_MIN_RANGE
        + (PARTIAL_SHOT_MAX_RANGE - PARTIAL_SHOT_MIN_RANGE) * partialCharge;
      const nearRange = fullCharge ? FULL_SHOT_NEAR_RANGE : null;
      const effectiveRange = fullCharge ? FULL_SHOT_EFFECTIVE_RANGE : directRange;
      const paintRadius = (fullCharge ? 5
        : PARTIAL_SHOT_MIN_PAINT_RADIUS + (PARTIAL_SHOT_MAX_PAINT_RADIUS - PARTIAL_SHOT_MIN_PAINT_RADIUS) * partialCharge) * 10 * WORLD_UNITS_PER_DU;
      const speed = fullCharge ? FULL_SHOT_SPEED : PARTIAL_SHOT_SPEED;
      const inputAim = input?.aim;
      let aim = Array.isArray(inputAim) && inputAim.length >= 3 && inputAim.slice(0, 3).every(finite)
        ? inputAim.slice(0, 3) : [0, 0, actor.team === 0 ? 1 : -1];
      const length = Math.hypot(...aim);
      aim = length > 0 ? aim.map(value => value / length) : [0, 0, actor.team === 0 ? 1 : -1];
      const id = this.state.shotSequence++;
      c.pending = {
        id, actorId: String(actor.id), team: actor.team, pos: positionOf(actor), aim, charge,
        damage, blastDamage, outerDamage, radius, nearRadius,
        directRange, nearRange, effectiveRange, paintRadius, speed,
        launchY: nativeSpeedToWorldPerSecond(fullCharge ? .28 : .14 + .07 * partialCharge),
        recoil: nativeSpeedToWorldPerSecond(fullCharge ? .12 : .06 + .03 * partialCharge),
        trailRadius: fullCharge ? .48 : paintRadius,
      };
      c.seconds = c.value = 0; c.firing = false; c.delay = 1 / 60;
      this._updateShot(remaining, actor, input);
      return;
    }
    this.state.charge = emptyCharge();
    this.state.charge.wasSwimming = !!actor.swimming;
  }

  _checkCheckpoint(actor) {
    const team = this.state.carrierTeam;
    if (!validTeam(team) || this.state.checkpoint.passed[team]) return;
    const choices = this.checkpoints[team];
    if (!choices.length) return;
    const pos = positionOf(actor);
    const index = choices.findIndex(point => distance(pos, point) <= CHECKPOINT_RADIUS);
    if (index < 0) return;

    const checkpointPos = choices[index].slice();
    this._updateCount(team, checkpointPos);
    this.state.checkpoint.passed[team] = true;
    this.state.checkpoint.choice[team] = index;
    this.state.checkpoint.goalOpen[team] = true;
    this.state.checkpoint.lastPassTeam = team;
    this.state.checkpoint.sincePass = 0;
    this.state.pos = checkpointPos;
    this._dropAtCheckpoint(team, checkpointPos);
    this._event('checkpoint', { mode: 'rainmaker', team, checkpoint: index, pos: checkpointPos.slice() });
  }

  _dropAtCheckpoint(team, pos) {
    this.engine.resolveTie?.(team);
    this.state.lastDropTeam = team;
    this.state.lastDropReason = 'checkpoint';
    this.state.lastDropAge = 0;
    this.state.carrier = null;
    this.state.carrierTeam = null;
    this.state.holderTime = 0;
    this.state.holderRemaining = RAINMAKER_CARRY_SECONDS;
    this.state.retreatRate = 1;
    this.state.charge = emptyCharge();
    this.state.goalHold = null;
    this.state.pos = pos.slice();
    this.state.barrier = { active: true, max: RAINMAKER_BARRIER_MAX, health: RAINMAKER_BARRIER_MAX, balance: 0, team: null };
    this.state.dropped = true;
    this.state.dropTimer = 0;
    if (this.state.overtime.active && team === this.state.overtime.losingTeam) {
      this.state.overtime.graceRemaining = RAINMAKER_OVERTIME_GRACE_SECONDS;
      this.state.overtime.graceReason = 'losing-team-checkpoint';
      this.state.overtime.graceStartTick = this.state.tickSerial;
    }
  }

  _updateCount(team, pos) {
    const goal = this.goals[team];
    if (!goal) return;
    const baseline = distance(this.center, goal);
    if (!(baseline > 0)) return;
    const remaining = distance(pos, goal);
    let count = clamp(Math.ceil(100 * remaining / baseline), 1, 100);
    if (!this.state.checkpoint.passed[team] && this.checkpoints[team].length) {
      // Authored stage geometry supplies the local count scale. A checkpoint
      // is a hard gate even when the holder physically walks around it.
      const floor = Math.min(...this.checkpoints[team].map(p => clamp(Math.ceil(100 * distance(p, goal) / baseline), 1, 100)));
      count = Math.max(floor, count);
    }
    this._setCount(team, count);
  }

  _setCount(team, count) {
    if (typeof this.engine?.setCount === 'function') this.engine.setCount(team, count);
  }

  _touchesGoal(team, pos) {
    const goal = this.goals[team];
    return !!goal && distance(pos, goal) <= GOAL_RADIUS;
  }

  _nextObjective(team, from) {
    if (!this.state.checkpoint.passed[team] && this.checkpoints[team].length) {
      const start = positionOf({ pos: from });
      return this.checkpoints[team]
        .map((point, index) => ({ point, index, distance: distance(start, point) }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)[0].point.slice();
    }
    return this.goals[team]?.slice() ?? this.state.pos.slice();
  }

  _isRetreating(team, z) {
    const line = this.retreatZ[team];
    const pickup = this.state.pickupZ;
    const behindPickup = finite(pickup) && (team === 0 ? z < pickup - 1e-9 : z > pickup + 1e-9);
    const prohibited = finite(line) && (team === 0 ? z < line : z > line);
    return behindPickup || prohibited;
  }

  _isFallen(actor, frame) {
    if (typeof frame.floorAt !== 'function') return false;
    const pos = positionOf(actor);
    const floor = frame.floorAt(pos[0], pos[2]);
    if (floor === null) return true;
    return finite(floor) && pos[1] < floor - FALL_BELOW_FLOOR;
  }

  _drop(actor, reason) {
    if (this.state.carrier === null) return;
    const team = this.state.carrierTeam;
    const id = this.state.carrier;
    const pos = actor?.grounded === true && reason !== 'fall' ? positionOf(actor) : copyPos(this.state.lastGroundedPos ?? this.state.pos);
    this.engine.resolveTie?.(team);
    this.state.lastDropTeam = team;
    this.state.lastDropReason = reason;
    this.state.lastDropAge = 0;
    this.state.carrier = null;
    this.state.carrierTeam = null;
    this.state.holderTime = 0;
    this.state.holderRemaining = RAINMAKER_CARRY_SECONDS;
    this.state.retreatRate = 1;
    this.state.charge = emptyCharge();
    this.state.goalHold = null;
    this.state.pos = pos;

    const lostPos = actor ? positionOf(actor) : pos;
    const resetToCenter = ['fall', 'timeout'].includes(reason) && this._isOwnHalf(team, lostPos[2]);
    if (resetToCenter) {
      this._resetToCenter(reason);
    } else {
      this.state.barrier = { active: false, max: RAINMAKER_BARRIER_MAX, health: RAINMAKER_BARRIER_MAX, balance: 0, team: null };
      this.state.respawnRemaining = RAINMAKER_RESPAWN_SECONDS;
      this.state.dropped = true;
      this.state.dropTimer = 0;
      this._event('rainmaker-drop', { id, pos: pos.slice(), team, reason });
    }
  }

  _timeout(actor, team) {
    const id = this.state.carrier;
    const pos = positionOf(actor);
    this._event('rainmaker-timeout', { id, pos: pos.slice(), team });
    this._drop(actor, 'timeout');
  }

  _isOwnHalf(team, z) {
    const centerZ = this.center[2];
    return team === 0 ? z < centerZ : z > centerZ;
  }

  _ageUnclaimed(dt) {
    if (this.state.carrier !== null || !this.state.dropped || this.state.barrier.active || this.state.respawnRemaining > 0
      || distance(this.state.pos, this.center) < 1e-8) return;
    this.state.dropTimer += dt;
    if (this.state.dropTimer >= RAINMAKER_DROP_RETURN_SECONDS) this._resetToCenter('unclaimed');
  }

  _resetToCenter(reason) {
    this.state.pos = this.center.slice();
    this.state.carrier = null;
    this.state.carrierTeam = null;
    this.state.barrier = { active: false, max: RAINMAKER_BARRIER_MAX, health: RAINMAKER_BARRIER_MAX, balance: 0, team: null };
    this.state.respawnRemaining = RAINMAKER_RESPAWN_SECONDS;
    this.state.charge = emptyCharge();
    this.state.goalHold = null;
    this.state.holderTime = 0;
    this.state.holderRemaining = RAINMAKER_CARRY_SECONDS;
    this.state.retreatRate = 1;
    this.state.dropped = false;
    this.state.dropTimer = 0;
    this._event('rainmaker-reset', { pos: this.state.pos.slice(), reason });
  }

  _awardPassiveSpecial(dt) {
    if (!(dt > 0) || typeof this.engine?.special !== 'function') return;
    let team = null;
    if (this.state.carrier !== null && validTeam(this.state.carrierTeam)) {
      team = 1 - this.state.carrierTeam;
    } else {
      const counts = Array.isArray(this.engine?.counts) ? this.engine.counts : [100, 100];
      if (finite(counts[0]) && finite(counts[1]) && counts[0] !== counts[1]) team = counts[0] > counts[1] ? 0 : 1;
      else if (validTeam(this.engine?.leader)) team = 1 - this.engine.leader;
    }
    if (validTeam(team)) this.engine.special(team, 3 * dt);
  }

  _teamsAtDeadline() {
    const counts = Array.isArray(this.engine?.counts) ? this.engine.counts : [100, 100];
    const deadlineLoser = this.engine?.overtimeTeam;
    if (validTeam(deadlineLoser)) return { losingTeam: deadlineLoser, winningTeam: 1 - deadlineLoser };
    if (finite(counts[0]) && finite(counts[1]) && counts[0] !== counts[1]) {
      const winningTeam = counts[0] < counts[1] ? 0 : 1;
      return { losingTeam: 1 - winningTeam, winningTeam };
    }
    if (validTeam(this.engine?.leader)) return { losingTeam: 1 - this.engine.leader, winningTeam: this.engine.leader };
    return null;
  }

  _checkOvertimeLead() {
    const overtime = this.state.overtime;
    if (!overtime.active || !validTeam(overtime.losingTeam) || this.state.terminal) return;
    const counts = Array.isArray(this.engine?.counts) ? this.engine.counts : [100, 100];
    if (finite(counts[overtime.losingTeam]) && finite(counts[overtime.winningTeam])
      && counts[overtime.losingTeam] < counts[overtime.winningTeam]) {
      this._finish(overtime.losingTeam, 'rainmaker-overtime-lead');
    }
  }

  _findActor(actors, id) {
    if (id === null || !Array.isArray(actors)) return null;
    return actors.find(actor => actor?.id === id) ?? null;
  }

  _finish(team, reason) {
    if (this.state.terminal) return;
    this.state.terminal = true;
    if (this.engine?.winner !== null && this.engine?.winner !== undefined) return;
    if (typeof this.engine?.finish === 'function') this.engine.finish(team, reason);
  }

  _event(kind, data) {
    if (typeof this.engine?.event === 'function') this.engine.event(kind, data);
  }
}

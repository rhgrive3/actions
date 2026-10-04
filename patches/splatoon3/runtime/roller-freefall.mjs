// Issue #479: Splatoon 3 Ver. 11.3.0 natural free-fall 25F horizontal grace for Roller.
// When an actor enters natural free fall (e.g. walking off a ledge without jumping),
// the first 25 frames (25/60 s) of airtime still produce a horizontal flick. After 25 frames
// have elapsed (26+ frames), a newly started flick becomes vertical.
// Accepted jump or movement launch (normal jump, squid-roll, squid-surge, super jump) selects
// vertical flick immediately on 1F. Merely pressing/holding jump without native admission does
// NOT count as an actual jump and remains horizontal inside 25F.
// Any attack whose mode was already selected remains latched for the entire attack.

export const S3_ROLLER_NATURAL_FREEFALL_GRACE_FRAMES = 25;
export const S3_ROLLER_NATURAL_FREEFALL_GRACE_SEC = 25 / 60; // 0.4166666666666667 s
const EPS = 1e-6;

const FREEFALL_GUARD = Symbol.for('inkwave.splatoon3.roller-freefall.v1');
const TRIGGER_HOOKED = Symbol.for('inkwave.splatoon3.roller-freefall.trigger-hooked');

export function isRollerActor(a) {
  return !!(a && (a.weaponId === 'roller' || a.weapon?.kind === 'roller'));
}

export function resetAirborneState(a) {
  if (!a) return;
  a.s3JumpAirborne = false;
  a.s3NaturalAirborne = false;
  a.s3NaturalAirTicks = 0;
  a.s3NaturalAirTime = 0;
  a._s3LastAirStepFrame = 0;
}

export function recordMovementLaunch(a) {
  if (!a) return;
  a.s3JumpAirborne = true;
  a.s3NaturalAirborne = false;
  a.s3NaturalAirTicks = 0;
  a.s3NaturalAirTime = 0;
}

export function isMovementLaunchActive(a) {
  if (!a) return false;
  if (a.s3JumpAirborne) return true;
  // S3 squid roll
  if (a.s3?.roll || a.s3?.actions?.roll) return true;
  // S3 squid surge burst
  if (a.s3?.surge?.phase === 'burst' || a.s3?.actions?.surge?.phase === 'burst') return true;
  // Super jump flight
  if (a.superJumpState?.phase === 'flight') return true;
  return false;
}

export function ensureActorTriggerHooked(actor) {
  const ch = actor?.character;
  if (!ch || ch[TRIGGER_HOOKED]) return;
  ch[TRIGGER_HOOKED] = true;
  const origTrigger = ch.trigger;
  if (typeof origTrigger === 'function') {
    ch.trigger = function (name, ...args) {
      if (name === 'jump' || name === 'squidroll' || name === 'squidsurge' || name === 'squidsurge_top') {
        recordMovementLaunch(actor);
      }
      return origTrigger.apply(this, [name, ...args]);
    };
  }
}

export function stepAirborneTransition(a, dt) {
  if (!a) return;
  if (a.grounded) {
    resetAirborneState(a);
    return;
  }
  if (isMovementLaunchActive(a)) {
    recordMovementLaunch(a);
    return;
  }
  const frameId = a._s3UpdateCount || 1;
  if (a._s3LastAirStepFrame === frameId) {
    return;
  }
  a._s3LastAirStepFrame = frameId;
  a.s3NaturalAirborne = true;
  a.s3NaturalAirTime = (a.s3NaturalAirTime || 0) + dt;
  a.s3NaturalAirTicks = Math.round(a.s3NaturalAirTime * 60);
}

export function selectRollerFlickVertical(a, runner) {
  if (!a) return false;

  // 1. Latched mode: an attack already in progress never changes its mode.
  if (runner?.s3RollerAttack) {
    return runner.s3RollerAttack.vertical;
  }

  // 2. Grounded is always horizontal.
  if (a.grounded) {
    return false;
  }

  // 3. Accepted jump or movement launch produces vertical immediately.
  // Merely holding/pressing B without native admission does NOT count.
  if (isMovementLaunchActive(a)) {
    return true;
  }

  // Ensure current frame's natural fall air time has stepped if airborne
  if (a._s3RollerDt && a._s3LastAirStepFrame !== (a._s3UpdateCount || 1)) {
    stepAirborneTransition(a, a._s3RollerDt);
  }

  // 4. Natural free fall: boundary is based strictly on elapsed 25/60 seconds.
  // s3NaturalAirTicks serves as an optional diagnostic without conflicting on smaller dt.
  const elapsed = a.s3NaturalAirTime != null && a.s3NaturalAirborne
    ? a.s3NaturalAirTime
    : (typeof a.airTime === 'number' ? a.airTime : 0);

  if (elapsed <= S3_ROLLER_NATURAL_FREEFALL_GRACE_SEC + EPS) {
    return false; // inside grace -> horizontal
  }
  return true; // grace expired -> vertical
}

export function installActorFreefallHooks(apiOrActor) {
  const Actor = apiOrActor?.Actor || apiOrActor;
  const api = apiOrActor?.Actor ? apiOrActor : null;

  if (!Actor?.prototype || Object.hasOwn(Actor.prototype, FREEFALL_GUARD)) {
    return;
  }
  Object.defineProperty(Actor.prototype, FREEFALL_GUARD, { value: true });

  const origReset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const res = origReset.apply(this, args);
    if (isRollerActor(this)) {
      resetAirborneState(this);
    }
    return res;
  };

  const origSplat = Actor.prototype.splat;
  if (origSplat) {
    Actor.prototype.splat = function (...args) {
      const res = origSplat.apply(this, args);
      if (isRollerActor(this)) {
        resetAirborneState(this);
      }
      return res;
    };
  }

  const origUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    // Avoid unnecessary per-frame wrappers or allocations for non-Roller actors
    if (!isRollerActor(this)) {
      return origUpdate.call(this, dt);
    }

    ensureActorTriggerHooked(this);
    this._s3RollerDt = dt;
    this._s3UpdateCount = (this._s3UpdateCount || 0) + 1;

    if (this.grounded) {
      resetAirborneState(this);
    }

    const res = origUpdate.call(this, dt);

    if (this.grounded) {
      resetAirborneState(this);
    } else if (isMovementLaunchActive(this)) {
      recordMovementLaunch(this);
    } else if (!this.s3JumpAirborne) {
      stepAirborneTransition(this, dt);
    }

    return res;
  };

  if (typeof api?.on === 'function') {
    api.on('actor:jump', ({ actor }) => {
      if (isRollerActor(actor)) recordMovementLaunch(actor);
    });
    api.on('actor:squidroll', ({ actor }) => {
      if (isRollerActor(actor)) recordMovementLaunch(actor);
    });
    api.on('actor:squidsurge', ({ actor }) => {
      if (isRollerActor(actor)) recordMovementLaunch(actor);
    });
    api.on('superjump', ({ actor, phase }) => {
      if (phase === 'flight' && isRollerActor(actor)) recordMovementLaunch(actor);
    });
  }
}

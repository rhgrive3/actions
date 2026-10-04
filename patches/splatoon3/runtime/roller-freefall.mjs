// Issue #479: Splatoon 3 Ver. 11.3.0 natural free-fall 25F horizontal grace for Roller.
// When an actor enters natural free fall (e.g. walking off a ledge without jumping),
// the first 25 frames of airtime still produce a horizontal flick. After 25 frames have
// elapsed, a newly started flick becomes vertical. Jumping produces vertical immediately.
// Any attack whose mode was already selected remains latched for the entire attack.

export const S3_ROLLER_NATURAL_FREEFALL_GRACE_FRAMES = 25;
export const S3_ROLLER_NATURAL_FREEFALL_GRACE_SEC = 25 / 60; // 0.4166666666666667 s
const EPS = 1e-10;

const FREEFALL_GUARD = Symbol.for('inkwave.splatoon3.roller-freefall.v1');

export function resetAirborneState(a) {
  if (!a) return;
  a.s3JumpAirborne = false;
  a.s3NaturalAirborne = false;
  a.s3NaturalAirTicks = 0;
  a.s3NaturalAirTime = 0;
}

export function updateAirborneTransition(a, dt, wasGrounded, jumped) {
  if (a.grounded) {
    resetAirborneState(a);
    return;
  }
  // Airborne state:
  if (jumped || a.s3JumpAirborne) {
    a.s3JumpAirborne = true;
    a.s3NaturalAirborne = false;
    a.s3NaturalAirTicks = 0;
    a.s3NaturalAirTime = 0;
    return;
  }
  // Natural free fall without jump:
  a.s3NaturalAirborne = true;
  a.s3NaturalAirTicks = (a.s3NaturalAirTicks || 0) + 1;
  a.s3NaturalAirTime = (a.s3NaturalAirTime || 0) + dt;
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

  // 3. Normal jump produces vertical immediately.
  if (a.s3JumpAirborne || a.intent?.jump) {
    return true;
  }

  // 4. Natural free fall: check the 25F S3 grace window.
  if (a.s3NaturalAirborne) {
    const ticks = a.s3NaturalAirTicks ?? Math.round((a.s3NaturalAirTime ?? 0) * 60);
    if (ticks <= S3_ROLLER_NATURAL_FREEFALL_GRACE_FRAMES &&
        (a.s3NaturalAirTime ?? 0) <= S3_ROLLER_NATURAL_FREEFALL_GRACE_SEC + EPS) {
      return false; // inside grace -> horizontal
    }
    return true; // grace expired -> vertical
  }

  // 5. Fallback for actors with airTime tracked via public _resolve:
  if (typeof a.airTime === 'number' && a.airTime > 0) {
    const ticks = Math.round(a.airTime * 60);
    if (ticks <= S3_ROLLER_NATURAL_FREEFALL_GRACE_FRAMES &&
        a.airTime <= S3_ROLLER_NATURAL_FREEFALL_GRACE_SEC + EPS) {
      return false;
    }
    return true;
  }

  // 6. Direct fallback for isolated test runners where airborne state is unadorned.
  return !a.grounded;
}

export function installActorFreefallHooks(Actor) {
  if (!Actor?.prototype || Object.hasOwn(Actor.prototype, FREEFALL_GUARD)) {
    return;
  }
  Object.defineProperty(Actor.prototype, FREEFALL_GUARD, { value: true });

  const origReset = Actor.prototype.reset;
  Actor.prototype.reset = function (...args) {
    const res = origReset.apply(this, args);
    resetAirborneState(this);
    return res;
  };

  const origSplat = Actor.prototype.splat;
  if (origSplat) {
    Actor.prototype.splat = function (...args) {
      const res = origSplat.apply(this, args);
      resetAirborneState(this);
      return res;
    };
  }

  const origUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const wasGrounded = this.grounded;
    let jumpedThisFrame = false;

    // Detect jump triggered on character during this frame
    const ch = this.character;
    let origTrigger;
    if (ch && typeof ch.trigger === 'function') {
      origTrigger = ch.trigger;
      ch.trigger = function (name, ...args) {
        if (name === 'jump') {
          jumpedThisFrame = true;
        }
        return origTrigger.apply(this, [name, ...args]);
      };
    }

    // Intercept physics integrate to evaluate transition before weapons update
    const origIntegrate = this._integrate;
    let hookedIntegrate = false;
    if (typeof origIntegrate === 'function') {
      hookedIntegrate = true;
      this._integrate = function (idt, isSquid, jumped) {
        const res = origIntegrate.call(this, idt, isSquid, jumped);
        updateAirborneTransition(this, dt, wasGrounded, jumpedThisFrame || jumped);
        return res;
      };
    }

    try {
      const res = origUpdate.call(this, dt);
      if (!hookedIntegrate) {
        // If _integrate was stubbed / overridden, update transition directly
        updateAirborneTransition(this, dt, wasGrounded, jumpedThisFrame);
      }
      return res;
    } finally {
      if (ch && origTrigger) {
        ch.trigger = origTrigger;
      }
      if (hookedIntegrate) {
        this._integrate = origIntegrate;
      }
    }
  };
}

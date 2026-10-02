let api, config;
export function rollEligible(velocity, move, cfg) {
  const speed = Math.hypot(velocity.x, velocity.z), input = Math.hypot(move.x, move.z);
  if (speed < cfg.minimumSpeed || input < cfg.minimumInput) return false;
  const cosine = Math.max(-1, Math.min(1, (velocity.x * move.x + velocity.z * move.z) / (speed * input)));
  return Math.acos(cosine) + 1e-10 >= cfg.minimumAngle;
}
export function rollLaunchSpeed(speed, chain, retention) {
  // Speed already contains any loss from the previous roll. Apply the
  // per-roll coefficient once, rather than compounding it again by chain count.
  return speed * (chain > 0 ? retention : 1);
}
export function absorbArmor(state, damage) {
  if (!state || state.armorTime <= 0 || state.armorHP <= 0) return damage;
  const absorbed = Math.min(damage, state.armorHP); state.armorHP -= absorbed;
  return damage - absorbed;
}
export function movementState(a) {
  a.s3 ||= {};
  return a.s3.actions || (a.s3.actions = { chain: 0, chainTimer: 0, roll: null, surge: null });
}
function sync(a, state) { a.s3.roll = state.roll; a.s3.surge = state.surge; }
function launch(a, direction, speed, vertical, kind) {
  const length = Math.hypot(direction.x, direction.z) || 1;
  a._setClimb(false); a.grounded = false; a.coyote = 0; a.jumpBuffer = 0;
  a.vel.set(direction.x / length * speed, vertical, direction.z / length * speed);
  a.character.trigger('jump');
  api.emit('actor:' + kind, { actor: a });
}
export function beforeActions(a, dt, jumpPressed) {
  if (!api) throw new Error('INKWAVE movement patch not installed');
  const state = movementState(a), cfg = config;
  state.chainTimer = Math.max(0, state.chainTimer - dt);
  if (state.chainTimer <= 1e-10) { state.chain = 0; state.chainTimer = 0; }
  for (const action of [state.roll, state.surge]) if (action) {
    const remaining = (action.armorTime || 0) - dt;
    action.armorTime = remaining <= 1e-10 ? 0 : remaining;
  }
  if (state.roll) {
    state.roll.time -= dt;
    if (state.roll.time <= 1e-10 || a.form !== 'squid') state.roll = null;
  }
  if (!a.alive || a.specialActive || a.superJumpState || a.form !== 'squid') {
    state.roll = state.surge = null; a.anim.surgeCharge = 0; sync(a, state); return false;
  }
  // Own-ink roll uses the velocity captured BEFORE ordinary braking/turning.
  const wallRoll = a.climbing && jumpPressed && (a.intent.move.x * a.wallN.x + a.intent.move.z * a.wallN.z) >= cfg.wallRollMinimumInput;
  if (jumpPressed && (wallRoll || a.submerged && rollEligible(a.vel, a.intent.move, cfg.roll))) {
    const retention = a.s3.modifiers?.rollRetention ?? cfg.roll.chainRetention;
    const speed = rollLaunchSpeed(Math.max(cfg.roll.minimumSpeed, Math.hypot(a.vel.x, a.vel.z)), state.chain, retention);
    const direction = wallRoll ? a.wallN : a.intent.move;
    launch(a, direction, speed, cfg.roll.jumpVelocity, 'squidroll');
    state.roll = { time: cfg.roll.duration, armorTime: cfg.roll.armorTime, armorHP: cfg.roll.armorHP,
      vx: a.vel.x, vz: a.vel.z };
    state.surge = null; state.chain++; state.chainTimer = cfg.roll.chainReset;
    sync(a, state); return true;
  }
  if (a.climbing && a.intent.jump) {
    const surge = state.surge || (state.surge = { phase: 'charge', charge: 0, armorTime: 0, armorHP: 0 });
    if (surge.phase === 'charge') {
      const scale = a.s3.modifiers?.surgeChargeScale ?? 1;
      surge.charge = Math.min(1, surge.charge + dt / (cfg.surge.chargeTime * scale));
      if (1 - surge.charge <= 1e-10) surge.charge = 1;
      a.climbV = 0; a.vel.set(0, 0, 0); a.jumpBuffer = 0;
      a.anim.surgeCharge = surge.charge;
      sync(a, state); return true;
    }
  }
  const surge = state.surge;
  if (surge?.phase === 'charge') {
    if (!a.climbing) { state.surge = null; a.anim.surgeCharge = 0; }
    else if (!a.intent.jump) {
      surge.phase = 'burst'; surge.time = cfg.surge.duration * surge.charge;
      surge.speed = cfg.surge.minimumVelocity + (cfg.surge.velocity - cfg.surge.minimumVelocity) * surge.charge;
      surge.armorTime = surge.charge >= 1 ? cfg.surge.armorTime : 0;
      surge.armorHP = cfg.surge.armorHP;
      a.jumpBuffer = 0; a.anim.surgeCharge = 0;
      api.emit('actor:squidsurge', { actor: a, charge: surge.charge });
    }
  }
  if (state.surge?.phase === 'burst') {
    const burst = state.surge; burst.time -= dt;
    if (burst.time <= 1e-10 || !a.climbing && a.grounded) state.surge = null;
    else if (a.climbing) {
      a.climbV = burst.speed; a.vel.y = burst.speed; a.jumpBuffer = 0;
      sync(a, state); return true;
    }
  }
  sync(a, state);
  return !!state.roll;
}
export function installMovement(context, tuning) {
  api = context; config = tuning.movement;
  const { Actor } = api;
  const reset = Actor.prototype.reset, damage = Actor.prototype.damage;
  Actor.prototype.reset = function (...args) {
    const value = reset.apply(this, args); this.s3 ||= {}; delete this.s3.actions; this.s3.roll = this.s3.surge = null;
    this.anim.surgeCharge = 0; return value;
  };
  Actor.prototype.damage = function (amount, attacker, source) {
    if (this.invuln > 0 || !this.alive) return false;
    if (source !== 'ink') {
      const state = movementState(this);
      const action = state.roll?.armorTime > 0 ? state.roll : state.surge;
      const left = absorbArmor(action, amount);
      if (left !== amount) api.emit('actor:armorhit', { actor: this, absorbed: amount - left, broken: action.armorHP <= 0 });
      amount = left;
    }
    return damage.call(this, amount, attacker, source);
  };
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (...args) {
    const roll = movementState(this).roll;
    // Keep launch momentum, including any clipping applied by the real collision
    // resolver. Restoring vx/vz here would push into the wall again every tick.
    if (roll) return;
    return horizontal.apply(this, args);
  };
  const ledge = Actor.prototype._ledgePop;
  Actor.prototype._ledgePop = function (...args) {
    const surge = movementState(this).surge, value = ledge.apply(this, args);
    if (surge?.phase === 'burst') this.vel.y = Math.max(this.vel.y, surge.speed);
    return value;
  };
  const climb = Actor.prototype._updateClimb;
  Actor.prototype._updateClimb = function (...args) {
    const was = this.climbing, value = climb.apply(this, args);
    // Losing an inked wall cancels charge. A ledge burst is kept in the air.
    if (was && !this.climbing && movementState(this).surge?.phase === 'charge') { movementState(this).surge = null; this.anim.surgeCharge = 0; }
    return value;
  };
  for (const method of ['_startSpecial', 'superJump']) {
    const original = Actor.prototype[method];
    Actor.prototype[method] = function (...args) {
      const result = original.apply(this, args);
      if (this.specialActive || this.superJumpState) {
        const state = movementState(this); state.roll = state.surge = null; this.anim.surgeCharge = 0; sync(this, state);
      }
      return result;
    };
  }
}

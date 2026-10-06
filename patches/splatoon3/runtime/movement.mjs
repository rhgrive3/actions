let api, config;
const EPSILON = 1e-10;
export function rollEligible(velocity, move, cfg) {
  const speed = Math.hypot(velocity.x, velocity.z), input = Math.hypot(move.x, move.z);
  if (!Number.isFinite(speed + input) || speed + EPSILON < cfg.minimumSpeed || input <= EPSILON || input < cfg.minimumInput) return false;
  const cosine = Math.max(-1, Math.min(1, (velocity.x * move.x + velocity.z * move.z) / (speed * input)));
  return Math.acos(cosine) + 1e-10 >= cfg.minimumAngle;
}
// Input is already deadzone-filtered; wall-roll admission is angular.
export function wallRollRequested(a, jumpPressed, normal = a.wallN) {
  if (!jumpPressed || !a.alive || !a.climbing || a.form !== 'squid' || a.specialActive || a.superJumpState) return false;
  const move = a.intent.move, length = Math.hypot(move.x, move.z), nl = Math.hypot(normal.x, normal.z);
  if (!Number.isFinite(length + nl) || length <= EPSILON || nl <= EPSILON) return false;
  return (move.x * normal.x + move.z * normal.z) / (length * nl) + EPSILON >= Math.cos(config.wallRollMaximumAngle);
}
export function rollLaunchSpeed(speed, chain, retention, previous = 0) {
  // Consecutive rolls retain the previous penalized launch speed, including
  // across wall reattachment where native climb velocity would otherwise rebase.
  return chain > 0 && previous > 0 ? previous * retention : speed;
}
export function absorbArmor(state, damage) {
  if (!(damage > 0) || !state || state.armorTime <= 0 || state.armorHP <= 0) return damage;
  state.armorHP = Math.max(0, state.armorHP - damage);
  return Math.max(0, damage - (state.armorThreshold ?? 100));
}
export function movementState(a) {
  a.s3 ||= {};
  return a.s3.actions || (a.s3.actions = { chain: 0, chainTimer: 0, chainSpeed: 0, roll: null, surge: null, armor: null, floorSpeed: null });
}
function sync(a, state) { a.s3.roll = state.roll; a.s3.surge = state.surge; }
function launch(a, direction, speed, vertical, kind) {
  const length = Math.hypot(direction.x, direction.z) || 1;
  a._setClimb(false); a.grounded = false; a.coyote = 0; a.jumpBuffer = 0;
  a.vel.set(direction.x / length * speed, vertical, direction.z / length * speed);
  a.character.trigger('jump');
  a.character.trigger(kind, { duration: config.roll.duration });
  api.emit('actor:' + kind, { actor: a });
}
export function beforeActions(a, dt, jumpPressed) {
  if (!api) throw new Error('INKWAVE movement patch not installed');
  const state = movementState(a), cfg = config;
  state.chainTimer = Math.max(0, state.chainTimer - dt);
  if (state.chainTimer <= 1e-10) { state.chain = 0; state.chainTimer = 0; state.chainSpeed = 0; }
  for (const action of new Set([state.roll, state.surge, state.armor])) if (action) {
    const remaining = (action.armorTime || 0) - dt;
    action.armorTime = remaining <= 1e-10 ? 0 : remaining;
  }
  if (state.roll) {
    state.roll.time -= dt;
    if (state.roll.time <= 1e-10 || a.form !== 'squid') state.roll = null;
  }
  if (!a.alive || a.specialActive || a.superJumpState || a.form !== 'squid') {
    state.roll = state.surge = state.armor = state.floorSpeed = null; state.chainSpeed = 0; a.anim.surgeCharge = 0; sync(a, state); return false;
  }
  // Keep the last qualifying real velocity direction briefly; do not queue raw input.
  if (!a.submerged || !a.grounded || a.climbing || state.roll) state.floorSpeed = null;
  else if (Math.hypot(a.vel.x, a.vel.z) + EPSILON >= cfg.roll.minimumSpeed) {
    const recent = state.floorSpeed || (state.floorSpeed = { x: 0, z: 0, age: 0 });
    recent.x = a.vel.x; recent.z = a.vel.z; recent.age = 0;
  } else if (state.floorSpeed) {
    state.floorSpeed.age += dt;
    if (state.floorSpeed.age > cfg.roll.speedGraceTime + EPSILON) state.floorSpeed = null;
  }
  const wallRoll = wallRollRequested(a, jumpPressed);
  const floorVelocity = state.floorSpeed || a.vel;
  if (jumpPressed && (wallRoll || a.submerged && a.grounded && rollEligible(floorVelocity, a.intent.move, cfg.roll))) {
    const retention = a.s3.modifiers?.rollRetention ?? cfg.roll.chainRetention;
    const speed = rollLaunchSpeed(Math.max(cfg.roll.minimumSpeed, Math.hypot(a.vel.x, a.vel.z)), state.chain, retention, state.chainSpeed);
    const direction = wallRoll ? a.wallN : a.intent.move;
    launch(a, direction, speed, cfg.roll.jumpVelocity, 'squidroll');
    state.roll = { time: cfg.roll.duration, armorTime: wallRoll ? cfg.roll.wallArmorTime : cfg.roll.armorTime,
      armorHP: cfg.roll.armorHP, armorThreshold: cfg.roll.armorThreshold, vx: a.vel.x, vz: a.vel.z };
    state.armor = state.roll;
    state.surge = state.floorSpeed = null; state.chainSpeed = speed; state.chain++; state.chainTimer = cfg.roll.chainReset;
    sync(a, state); return true;
  }
  if (a.climbing && a.intent.jump) {
    const surge = state.surge || (state.surge = { phase: 'charge', charge: 0, armorTime: 0, armorHP: 0 });
    if (surge.phase === 'charge') {
      const scale = a.s3.modifiers?.surgeChargeScale ?? 1;
      surge.charge = Math.min(1, surge.charge + dt / (cfg.surge.chargeTime * scale));
      if (1 - surge.charge <= 1e-10) surge.charge = 1;
      // Native climb already resolved slow charge movement; retain that velocity.
      a.jumpBuffer = 0;
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
      surge.armorHP = cfg.surge.armorHP; surge.armorThreshold = cfg.surge.armorThreshold;
      if (surge.armorTime > 0) state.armor = surge;
      a.jumpBuffer = 0; a.anim.surgeCharge = 0;
      a.character.trigger('squidsurge', { charge: surge.charge, duration: surge.time });
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
// Called only at the native unpainted-wall boundary, after the real raycast.
export function crossSurgeInkGap(a, hit, into) {
  const burst = movementState(a).surge;
  if (burst?.phase !== 'burst' || burst.time <= 0 || a.vel.y <= 0 ||
      !a.climbing || a.form !== 'squid' || !hit.hit || Math.abs(hit.normal.y) >= .5 ||
      hit.face < 0 || api.G.paint.sample(hit.face, hit.u, hit.v) !== 0 ||
      into < api.PLAYER.climbDetachDot) return false;
  a._setClimb(false); a.grounded = false; a.climbExit = 0;
  return true;
}
export function normalJumpVelocity(a, velocity) {
  const r = a.weaponRunner, cap = a.weapon.fullChargeJumpVelocity;
  if (a.form !== 'squid' && a.weapon.kind === 'charger' && a.intent.fire &&
      r.charging && r.charge >= 1 && Number.isFinite(cap)) return Math.min(velocity, cap);
  return velocity;
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
      const action = this.form === 'squid' ? state.armor ?? (state.roll?.armorTime > 0 ? state.roll : state.surge) : null;
      const left = absorbArmor(action, amount);
      if (left !== amount) api.emit('actor:armorhit', { actor: this, absorbed: amount - left, broken: action.armorHP <= 0 });
      amount = left;
    }
    return damage.call(this, amount, attacker, source);
  };
  const integrate = Actor.prototype._integrate, splat = Actor.prototype.splat;
  Actor.prototype._integrate = function (...args) {
    const value = integrate.apply(this, args);
    if (this.contacts.ceiling) {
      const state = movementState(this);
      for (const shield of new Set([state.armor, state.roll, state.surge])) if (shield) shield.armorTime = 0;
      state.armor = null;
    }
    return value;
  };
  Actor.prototype.splat = function (...args) {
    const result = splat.apply(this, args);
    if (!this.alive) {
      const state = movementState(this); state.roll = state.surge = state.armor = null;
      this.anim.surgeCharge = 0; sync(this, state);
    }
    return result;
  };
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (...args) {
    const roll = movementState(this).roll;
    if (!roll || this.grounded) return horizontal.apply(this, args);
    const original = api.PLAYER.squidDrySpeed;
    api.PLAYER.squidDrySpeed = api.PLAYER.swimSpeed;
    try { return horizontal.apply(this, args); }
    finally { api.PLAYER.squidDrySpeed = original; }
  };
  const ledge = Actor.prototype._ledgePop;
  Actor.prototype._ledgePop = function (...args) {
    const surge = movementState(this).surge, value = ledge.apply(this, args);
    if (surge?.phase === 'burst') {
      this.vel.y = Math.max(this.vel.y, surge.speed);
      this.character.trigger('squidsurge_top', { charge: surge.charge, duration: config.surge.duration });
    }
    return value;
  };
  const superJumpUpdate = Actor.prototype._updateSuperJump;
  Actor.prototype._updateSuperJump = function (...args) {
    const value = superJumpUpdate.apply(this, args);
    // Charge probes the floor. Once launched, the rendered body is airborne;
    // keeping the charge's ground flag selected the dry-squid idle animation.
    if (this.superJumpState?.phase === 'flight') this.grounded = false;
    return value;
  };
  const climb = Actor.prototype._updateClimb;
  Actor.prototype._updateClimb = function (...args) {
    const was = this.climbing, state = movementState(this);
    const charging = this.alive && this.form === 'squid' && this.climbing && this.intent.jump &&
      !this.specialActive && !this.superJumpState && (!state.surge || state.surge.phase === 'charge');
    const P = api.PLAYER, speed = P.climbSpeed, side = P.climbSideSpeed;
    if (charging) {
      P.climbSpeed *= config.surge.chargeMoveScale;
      P.climbSideSpeed *= config.surge.chargeMoveScale;
    }
    let value;
    try { value = climb.apply(this, args); }
    finally { P.climbSpeed = speed; P.climbSideSpeed = side; }
    // Losing an inked wall cancels charge. A ledge burst is kept in the air.
    if (was && !this.climbing && movementState(this).surge?.phase === 'charge') { movementState(this).surge = null; this.anim.surgeCharge = 0; }
    return value;
  };
  for (const method of ['_startSpecial', 'superJump']) {
    const original = Actor.prototype[method];
    Actor.prototype[method] = function (...args) {
      const result = original.apply(this, args);
      if (this.specialActive || this.superJumpState) {
        const state = movementState(this); state.roll = state.surge = state.armor = state.floorSpeed = null; state.chainSpeed = 0; this.anim.surgeCharge = 0; sync(this, state);
      }
      return result;
    };
  }
}

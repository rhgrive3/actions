import { absorbSpawnDamage, spawnProtectionRemaining } from './respawn-lifecycle.mjs';
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
  const state = a.s3.actions || (a.s3.actions = {
    chain: 0, chainTimer: 0, chainSpeed: 0, roll: null, surge: null, armor: null, floorSpeed: null,
    fullCancelCandidate: null, fullCancelJumpVelocity: null, fullCancelGroundAttack: null
  });
  state.fullCancelCandidate ??= null;
  state.fullCancelJumpVelocity ??= null;
  state.fullCancelGroundAttack ??= null;
  return state;
}
function sync(a, state) { a.s3.roll = state.roll; a.s3.surge = state.surge; }
function advanceChainTimer(state, dt) {
  state.chainTimer = Math.max(0, state.chainTimer - dt);
  if (state.chainTimer <= EPSILON) { state.chain = 0; state.chainTimer = 0; state.chainSpeed = 0; }
}
export function clearFullCancelCandidate(a) {
  if (a?.s3?.actions) {
    a.s3.actions.fullCancelCandidate = null;
    a.s3.actions.fullCancelJumpVelocity = null;
    a.s3.actions.fullCancelGroundAttack = null;
  }
}
function fullCancelGroundAttackReady(a, state) {
  const context = state?.fullCancelGroundAttack;
  if (!context || !api) return false;
  const age = api.G.time - context.pressT;
  const window = Math.max(api.PLAYER.fireBuffer, Number.isFinite(a.weapon?.squidFlickDelay) ? a.weapon.squidFlickDelay : 0);
  const expiresAt = Number.isFinite(context.expiresAt) ? context.expiresAt : context.pressT + window;
  const valid = a.alive && !a.specialActive && !a.superJumpState && a.form === 'kid' &&
    a.weapon?.kind === 'roller' && a._firePressT === context.pressT &&
    Number.isFinite(age) && Number.isFinite(expiresAt) && age >= -EPSILON && api.G.time <= expiresAt + EPSILON;
  if (!valid) state.fullCancelGroundAttack = null;
  return valid;
}
export function hasFullCancelGroundAttack(a) {
  return fullCancelGroundAttackReady(a, a?.s3?.actions);
}
export function takeFullCancelGroundAttack(a) {
  const state = a?.s3?.actions;
  if (!fullCancelGroundAttackReady(a, state)) return false;
  state.fullCancelGroundAttack = null;
  return true;
}
export function takeFullCancelJumpVelocity(a) {
  const state = a?.s3?.actions;
  if (!state) return null;
  const velocity = state.fullCancelJumpVelocity;
  state.fullCancelJumpVelocity = null;
  return velocity;
}
function launch(a, direction, speed, vertical, kind) {
  const length = Math.hypot(direction.x, direction.z) || 1;
  a._setClimb(false); a.grounded = false; a.coyote = 0; a.jumpBuffer = 0;
  a.vel.set(direction.x / length * speed, vertical, direction.z / length * speed);
  a.character.trigger('jump');
  a.character.trigger(kind, { duration: config.roll.duration });
  api.emit('actor:' + kind, { actor: a });
}
function tickArmorTimer(action, dt) {
  const remaining = (action.armorTime || 0) - dt;
  action.armorTime = remaining <= 1e-10 ? 0 : remaining;
}
export function beforeActions(a, dt, jumpPressed, input = {}) {
  if (!api) throw new Error('INKWAVE movement patch not installed');
  const state = movementState(a), cfg = config;
  state.fullCancelJumpVelocity = null;
  advanceChainTimer(state, dt);

  if (!a.alive || a.specialActive || a.superJumpState || a.form === 'squid') {
    state.fullCancelCandidate = null; state.fullCancelGroundAttack = null;
  } else if (input.wasSquid && input.wasSubmerged && !input.wasClimbing && input.firePressed && input.fireWins &&
      !state.roll && !state.surge) {
    state.fullCancelCandidate = { pressT: a._firePressT, vx: a.vel.x, vz: a.vel.z };
  }
  if (state.fullCancelGroundAttack) fullCancelGroundAttackReady(a, state);
  const candidate = state.fullCancelCandidate;
  if (candidate) {
    const age = api.G.time - candidate.pressT, window = api.PLAYER.fireBuffer;
    const inWindow = Number.isFinite(age) && Number.isFinite(window) && age >= -EPSILON && age <= window + EPSILON;
    if (!inWindow || !a.alive || a.specialActive || a.superJumpState || a.form !== 'kid') {
      state.fullCancelCandidate = null;
    } else if (jumpPressed) {
      state.fullCancelCandidate = null;
      if (age > EPSILON && a.grounded && a.groundTeam === 1 && !a.climbing &&
          rollEligible({ x: candidate.vx, z: candidate.vz }, a.intent.move, cfg.roll)) {
        const retention = a.s3.modifiers?.rollRetention ?? cfg.roll.chainRetention;
        const speed = rollLaunchSpeed(Math.max(cfg.roll.minimumSpeed, Math.hypot(candidate.vx, candidate.vz)),
          state.chain, retention, state.chainSpeed);
        const length = Math.hypot(a.intent.move.x, a.intent.move.z);
        a.vel.x = a.intent.move.x / length * speed;
        a.vel.z = a.intent.move.z / length * speed;
        state.fullCancelJumpVelocity = cfg.roll.jumpVelocity;
        state.fullCancelGroundAttack = a.weapon?.kind === 'roller'
          ? { pressT: candidate.pressT, expiresAt: api.G.time + Math.max(0, a.fireBuffer || 0) }
          : null;
        state.chainSpeed = speed; state.chain++; state.chainTimer = cfg.roll.chainReset;
        sync(a, state); return false;
      }
    }
  }
  // Three optional references, not three distinct actions: armor aliases the
  // active roll/surge. Avoid temporary Array/Set allocation on every Actor tick.
  const rollAction = state.roll, surgeAction = state.surge, armorAction = state.armor;
  if (rollAction) tickArmorTimer(rollAction, dt);
  if (surgeAction && surgeAction !== rollAction) tickArmorTimer(surgeAction, dt);
  if (armorAction && armorAction !== rollAction && armorAction !== surgeAction) tickArmorTimer(armorAction, dt);
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
    const minimum = wallRoll ? Math.max(cfg.roll.minimumSpeed, api.PLAYER.swimSpeed * .8) : cfg.roll.minimumSpeed;
    const speed = rollLaunchSpeed(Math.max(minimum, Math.hypot(a.vel.x, a.vel.z)), state.chain, retention, state.chainSpeed);
    // The stick angle inside the admitted outward cone is the heading (#767). Passing
    // the wall normal here discarded it, so every admitted wall roll launched along the
    // normal regardless of how the stick was aimed. Admission, speed, vertical velocity,
    // chain and action timing are unchanged: launch() normalises whatever it is given,
    // and this is the same vector the own-ink roll path already used. No curve is added.
    launch(a, a.intent.move, speed, cfg.roll.jumpVelocity, 'squidroll');
    state.roll = { time: cfg.roll.duration, armorTime: wallRoll ? cfg.roll.wallArmorTime : cfg.roll.armorTime,
      armorHP: cfg.roll.armorHP, armorThreshold: cfg.roll.armorThreshold, vx: a.vel.x, vz: a.vel.z, steerReady: false };
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
      // Keep tangential/vertical charge movement, removing only native wall-contact bias.
      const n = a.wallN, vn = a.vel.x * n.x + a.vel.z * n.z;
      a.vel.x -= n.x * vn; a.vel.z -= n.z * vn;
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
      surge.armorTime = surge.charge > 0 ? cfg.surge.armorTime : 0;
      surge.armorHP = cfg.surge.armorHP; surge.armorThreshold = cfg.surge.armorThreshold;
      if (surge.armorTime > 0) state.armor = surge;
      a.jumpBuffer = 0; a.anim.surgeCharge = 0;
      a.character.trigger('squidsurge', { charge: surge.charge, duration: surge.time });
      api.emit('actor:squidsurge', { actor: a, charge: surge.charge });
    }
  }
  if (state.surge?.phase === 'burst') {
    const burst = state.surge; burst.time -= dt;
    if (burst.time <= 1e-10) {
      // The existing boost ends here; neutral auto-climb is a separate native-speed phase.
      if (a.climbing) { burst.phase = 'auto-climb'; burst.time = 0; }
      else state.surge = null;
    } else if (!a.climbing && a.grounded) state.surge = null;
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
export function isSquidReturnerCeiling(actor, physics) {
  const id = actor?.contacts?.ceilingBlock;
  return actor?.contacts?.ceiling === true && Number.isInteger(id) && id >= 0 &&
    physics?.level?.blocks?.[id]?.squidReturner === true;
}

export function installMovement(context, tuning) {
  api = context; config = tuning.movement;
  const { Actor } = api;
  const reset = Actor.prototype.reset, damage = Actor.prototype.damage;
  const clearMovement = actor => {
    actor.s3 ||= {}; delete actor.s3.actions; actor.s3.roll = actor.s3.surge = null;
    actor.anim.surgeCharge = 0;
  };
  const remoteRespawn = api.NetMatch?.prototype._remoteRespawn;
  if (remoteRespawn) api.NetMatch.prototype._remoteRespawn = function (actor, ...args) {
    const result = remoteRespawn.call(this, actor, ...args); clearMovement(actor); return result;
  };
  Actor.prototype.reset = function (...args) {
    const value = reset.apply(this, args); clearMovement(this); return value;
  };
  Actor.prototype.damage = function (amount, attacker, source) {
    if (this.invuln > 0 || !this.alive) return false;
    if (source !== 'ink') {
      // Spawn armor is the sole shield owner for this hit; do not charge a
      // simultaneous Roll/Surge armor pool as a second layer.
      if (this.s3?.spawnArmor && spawnProtectionRemaining(this) > 0) {
        const shield = this.s3.spawnArmor;
        const left = absorbSpawnDamage(this, amount, source, tuning.spawnArmor);
        if (left !== amount) api.emit('actor:armorhit', { actor: this, absorbed: amount - left, broken: !this.s3.spawnArmor || shield.hp <= 0, kind: 'spawn' });
        amount = left;
      } else {
        const state = movementState(this);
        const action = this.form === 'squid' ? state.armor ?? (state.roll?.armorTime > 0 ? state.roll : state.surge) : null;
        const left = absorbArmor(action, amount);
        if (left !== amount) api.emit('actor:armorhit', { actor: this, absorbed: amount - left, broken: action.armorHP <= 0 });
        amount = left;
      }
    }
    return damage.call(this, amount, attacker, source);
  };
  const integrate = Actor.prototype._integrate, splat = Actor.prototype.splat;
  Actor.prototype._integrate = function (...args) {
    const value = integrate.apply(this, args);
    // #1075: normal ceilings are geometry, not Squid Returners.
    if (isSquidReturnerCeiling(this, api.G.physics)) {
      const state = movementState(this);
      for (const shield of new Set([state.armor, state.roll, state.surge])) if (shield) shield.armorTime = 0;
      state.armor = null;
    }
    return value;
  };
  Actor.prototype.splat = function (...args) {
    clearFullCancelCandidate(this);
    const result = splat.apply(this, args);
    if (!this.alive) {
      const state = movementState(this); state.roll = state.surge = state.armor = null;
      this.anim.surgeCharge = 0; sync(this, state);
    }
    return result;
  };
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (...args) {
    const state = movementState(this), roll = state.roll;
    if (state.fullCancelJumpVelocity !== null) return;
    if (!roll || this.grounded) return horizontal.apply(this, args);
    // The admission tick keeps the exact launch speed; steer from the next tick.
    if (roll.steerReady === false) { roll.steerReady = true; return; }
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
    advanceChainTimer(movementState(this), args[0]);
    const value = superJumpUpdate.apply(this, args);
    // Charge probes the floor. Once launched, the rendered body is airborne;
    // keeping the charge's ground flag selected the dry-squid idle animation.
    if (this.superJumpState?.phase === 'flight') this.grounded = false;
    return value;
  };
  const climb = Actor.prototype._updateClimb;
  Actor.prototype._updateClimb = function (...args) {
    const was = this.climbing, state = movementState(this);
    // A fresh held B may start the existing charge path again after the boost.
    if (state.surge?.phase === 'auto-climb' && this.intent.jump) { state.surge = null; sync(this, state); }
    const move = this.intent.move, savedX = move.x, savedZ = move.z;
    const continueNeutral = was && state.surge?.phase === 'auto-climb' && this.form === 'squid' &&
      !this.specialActive && !this.superJumpState && Math.hypot(move.x, move.z) <= EPSILON;
    if (continueNeutral) { move.x = -this.wallN.x; move.z = -this.wallN.z; }
    const charging = this.alive && this.form === 'squid' && this.climbing && this.intent.jump &&
      !this.specialActive && !this.superJumpState && (!state.surge || state.surge.phase === 'charge');
    const P = api.PLAYER, speed = P.climbSpeed, side = P.climbSideSpeed;
    if (charging) {
      P.climbSpeed *= config.surge.chargeMoveScale;
      P.climbSideSpeed *= config.surge.chargeMoveScale;
    }
    let value;
    try { value = climb.apply(this, args); }
    finally { P.climbSpeed = speed; P.climbSideSpeed = side; if (continueNeutral) { move.x = savedX; move.z = savedZ; } }
    if (was && !this.climbing && movementState(this).surge?.phase === 'auto-climb') { movementState(this).surge = null; sync(this, state); }
    // Losing an inked wall cancels charge. A ledge burst is kept in the air.
    if (was && !this.climbing && movementState(this).surge?.phase === 'charge') { movementState(this).surge = null; this.anim.surgeCharge = 0; }
    return value;
  };
  for (const method of ['_startSpecial', 'superJump']) {
    const original = Actor.prototype[method];
    Actor.prototype[method] = function (...args) {
      const result = original.apply(this, args);
      if (this.specialActive || this.superJumpState) {
        clearFullCancelCandidate(this);
        const state = movementState(this);
        state.roll = state.surge = state.armor = state.floorSpeed = null;
        if (!this.superJumpState) state.chainSpeed = 0;
        this.anim.surgeCharge = 0; sync(this, state);
      }
      return result;
    };
  }
}

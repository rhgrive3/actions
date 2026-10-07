const EPS = 1e-10;
const TAG = Symbol.for('inkwave.s3.issue-six-followup.v1');
const PAD_TAG = Symbol.for('inkwave.s3.issue-1024-pad-cancel.v1');
const SESSION_TAG = Symbol.for('inkwave.s3.issue-1003-private-min.v1');
const NET_TAG = Symbol.for('inkwave.s3.issue-1025-bind-reconcile.v1');
const SHOOTER_SUB = 3 / 60;
const SHOOTER_SQUID = 4 / 60;

// Current public reference only establishes that S3's maximum steady stick turn
// remains below 360 deg/s. Keep a tiny strict margin rather than claiming an
// exact Nintendo +5 endpoint.
export const S3_PAD_MAX_YAW_RATE = Math.PI * 2 - 1e-4;
export const S3_PAD_SENSITIVITY_CAP = S3_PAD_MAX_YAW_RATE / 3.6;

export function privateTurfHasMinimum(session) {
  return session?.lobby?.mode !== 'turf' || (session?.lobby?.players?.length || 0) >= 2;
}

function padHeld(pad) {
  const button = (i, trigger = false) => {
    const b = pad?.buttons?.[i];
    return trigger ? (b?.value || 0) > .3 : !!b?.pressed;
  };
  return {
    fire: button(7, true),
    squid: button(6, true),
    sub: button(5),
    jump: button(0),
    special: button(3) || button(11),
  };
}

function clearShooterInterrupt(r) {
  if (!r) return;
  r.s3ShooterCancelSubRemaining = 0;
  r.s3ShooterCancelSquidRemaining = 0;
}

export function installIssueSixFollowup(api, _profile, deps = {}) {
  const { Actor, WeaponRunner, PlayerController, NetMatch, G } = api;
  const Input = deps.Input || api.Input;
  const NetSession = deps.NetSession || api.NetSession;

  // #1024 — device loss is cancellation, not a physical release edge.
  if (Input?.prototype && !Input.prototype[PAD_TAG]) {
    Object.defineProperty(Input.prototype, PAD_TAG, { value: true });
    const poll = Input.prototype.pollPad;
    Input.prototype.pollPad = function (...args) {
      const hadPad = !!this.pad;
      const heldBefore = this._s3LastPadHeld || (this.pad ? padHeld(this.pad) : null);
      const result = poll.apply(this, args);
      if (this.pad) this._s3LastPadHeld = padHeld(this.pad);
      else if (hadPad) {
        const epoch = (this._s3PadCancelEpoch || 0) + 1;
        this._s3PadCancelEpoch = epoch;
        this._s3PadCancel = { epoch, ...(heldBefore || {}) };
        this._s3LastPadHeld = null;
      }
      return result;
    };
  }

  if (PlayerController?.prototype && !PlayerController.prototype[TAG]) {
    Object.defineProperty(PlayerController.prototype, TAG, { value: true });
    const updateController = PlayerController.prototype.update;
    PlayerController.prototype.update = function (dt, ...args) {
      const input = this.input, settings = G?.settings;
      const usingPad = !!input?.pad && input.lastDevice === 'pad';
      const previousSensitivity = settings?.padSensitivity;
      if (usingPad) {
        // #1012 — remove the unverified held-rim 1.55x state and strictly cap
        // current exposed sensitivity below 360 deg/s at full horizontal stick.
        this.edgeT = -1;
        if (settings && Number.isFinite(previousSensitivity))
          settings.padSensitivity = Math.min(previousSensitivity, S3_PAD_SENSITIVITY_CAP);
      }
      let result;
      try { result = updateController.call(this, dt, ...args); }
      finally {
        if (usingPad) this.edgeT = 0;
        if (settings && Number.isFinite(previousSensitivity)) settings.padSensitivity = previousSensitivity;
      }

      const cancel = input?._s3PadCancel;
      if (cancel && this._s3PadCancelSeen !== cancel.epoch) {
        this._s3PadCancelSeen = cancel.epoch;
        const a = this.a, r = a?.weaponRunner;
        if (cancel.fire) {
          r?.cancelPendingInput?.();
          if (a) a.fireBuffer = 0;
        }
        if (cancel.sub && r) {
          r.aimingSub = false;
          r.s3SubReady = null;
          r.s3SubFromSquid = false;
        }
        // Rebase Actor's release-edge owner onto the already-neutralized
        // controller snapshot. Other live sources (mouse/touch/keyboard) remain
        // authoritative and do not inherit a synthetic pad release.
        if (a?._prevIntent) {
          if (cancel.fire) a._prevIntent.fire = !!a.intent.fire;
          if (cancel.sub) a._prevIntent.sub = !!a.intent.sub;
          if (cancel.squid) a._prevIntent.squid = !!a.intent.squid;
          if (cancel.jump) a._prevIntent.jump = !!a.intent.jump;
          if (cancel.special) a._prevIntent.special = !!a.intent.special;
        }
      }
      return result;
    };
  }

  // #1003 — bots may fill a valid Private Battle, but cannot satisfy the
  // reference two-human minimum needed to start Turf.
  if (NetSession?.prototype && !NetSession.prototype[SESSION_TAG]) {
    Object.defineProperty(NetSession.prototype, SESSION_TAG, { value: true });
    const canStart = NetSession.prototype.canStart, start = NetSession.prototype.start;
    NetSession.prototype.canStart = function (...args) {
      return privateTurfHasMinimum(this) && canStart.apply(this, args);
    };
    NetSession.prototype.start = function (...args) {
      if (!privateTurfHasMinimum(this)) return false;
      return start.apply(this, args);
    };
  }

  // #1025 — reconcile frozen-roster owners at bind on every stage. The existing
  // live leave policy then removes on no-bot stages or performs the same host
  // handoff used by a post-bind disconnect; no ownerless remote slot survives.
  if (NetMatch?.prototype && !NetMatch.prototype[NET_TAG]) {
    Object.defineProperty(NetMatch.prototype, NET_TAG, { value: true });
    const bind = NetMatch.prototype.bind;
    NetMatch.prototype.bind = function (match, ...args) {
      const result = bind.call(this, match, ...args);
      const missing = new Set();
      for (const a of this.byNid?.values?.() || []) {
        if (a.owner !== this.myId && !this.s?._members?.has?.(a.owner)) missing.add(a.owner);
      }
      for (const owner of missing) this.onLeave(owner, false);
      return result;
    };
  }

  // #1016 — Shooter sustained-fire cancellation owns fresh 3F sub / 4F squid
  // clocks. Existing shot-anchored recovery remains in parallel underneath.
  if (Actor?.prototype && WeaponRunner?.prototype) {
    const wr = WeaponRunner.prototype;
    const shooterTag = Symbol.for('inkwave.s3.issue-1016-shooter-cancel.v1');
    if (!wr[shooterTag]) {
      Object.defineProperty(wr, shooterTag, { value: true });
      const reset = wr.reset, cancelInput = wr.cancelPendingInput, busy = wr.busy, weaponUpdate = wr.update;
      wr.reset = function (...args) {
        clearShooterInterrupt(this);
        return reset.apply(this, args);
      };
      wr.cancelPendingInput = function (...args) {
        clearShooterInterrupt(this);
        return cancelInput?.apply(this, args);
      };
      wr.busy = function () {
        if (this.a?.weapon?.kind === 'shooter' && (this.s3ShooterCancelSquidRemaining || 0) > EPS) return true;
        return busy.call(this);
      };
      wr.update = function (dt, input = {}) {
        if (this.a?.weapon?.kind !== 'shooter') return weaponUpdate.call(this, dt, input);
        const subLeft = this.s3ShooterCancelSubRemaining || 0;
        const squidLeft = this.s3ShooterCancelSquidRemaining || 0;
        if (subLeft <= EPS && squidLeft <= EPS && !input.sub && !input.subReleased)
          return weaponUpdate.call(this, dt, input);
        const next = { ...input };
        // A cancellation owns the main action through its recovery. Once the
        // 3F sub boundary opens, R may start preparation while the independent
        // 4F squid boundary is still finishing.
        if (subLeft > EPS || squidLeft > EPS || input.sub || input.subReleased) {
          next.fire = false; next.firePressed = false;
        }
        if (subLeft > EPS) { next.sub = false; next.subReleased = false; }
        return weaponUpdate.call(this, dt, next);
      };

      const actorUpdate = Actor.prototype.update;
      Actor.prototype.update = function (dt, ...args) {
        const r = this.weaponRunner;
        if (!r || this.weapon?.kind !== 'shooter' || !this.alive || this.specialActive || this.superJumpState) {
          clearShooterInterrupt(r);
          return actorUpdate.call(this, dt, ...args);
        }
        const prev = this._prevIntent || {}, intent = this.intent || {};
        const active = !!r.s3ShooterHeld && !!prev.fire;
        const edge = (!intent.fire && !!prev.fire) ||
          (!!intent.sub && !prev.sub) ||
          (!!intent.squid && !prev.squid);
        const started = active && edge;
        if (started) {
          r.s3ShooterCancelSubRemaining = SHOOTER_SUB;
          r.s3ShooterCancelSquidRemaining = SHOOTER_SQUID;
        } else {
          r.s3ShooterCancelSubRemaining = Math.max(0, (r.s3ShooterCancelSubRemaining || 0) - Math.max(0, dt));
          r.s3ShooterCancelSquidRemaining = Math.max(0, (r.s3ShooterCancelSquidRemaining || 0) - Math.max(0, dt));
        }
        return actorUpdate.call(this, dt, ...args);
      };
    }
  }
}

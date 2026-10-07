// Public Heavy Splatling state owner. This changes only the Splatling runner
// and launch sampling; projectile integration remains with Projectiles.
// Source/measurement limits: reports/inkwave-splatling-batch-2026-10-04.md.
const EPS = 1e-10;
const clamp01 = value => Math.max(0, Math.min(1, value));
const INSTALLED = Symbol.for('inkwave.s3.splatling.v1');
const sampledSpeedViews = new WeakMap();

function withSampledProjectileSpeed(source, value, run) {
  let entry = sampledSpeedViews.get(source);
  if (!entry) {
    const values = [], view = {};
    const seen = new Set();
    for (let current = source; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
      for (const key of Reflect.ownKeys(current)) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (!Object.getOwnPropertyDescriptor(current, key)?.enumerable) continue;
        Object.defineProperty(view, key, {
          enumerable: true,
          get() { return key === 'projSpeed' && values.length ? values[values.length - 1] : source[key]; },
        });
      }
    }
    if (!Object.prototype.hasOwnProperty.call(view, 'projSpeed')) {
      Object.defineProperty(view, 'projSpeed', {
        enumerable: true,
        get() { return values.length ? values[values.length - 1] : source.projSpeed; },
      });
    }
    entry = { view: Object.freeze(view), values };
    sampledSpeedViews.set(source, entry);
  }
  entry.values.push(value);
  try { return run(entry.view); }
  finally { entry.values.pop(); }
}

// The wiki's full-charge 19.8..22.2 DU/F brackets 21 DU/F by 1.2 DU/F,
// matching raw 2.1 +/- .12. This is an absolute speed half-width, NOT +/-12%.
// The center-biased quantile uses the wiki's gamma model: magnitude(.5)=bias.
export function sampleSplatlingSpeed(base, halfWidth, bias, uniform) {
  const signed = clamp01(uniform) * 2 - 1;
  const magnitude = Math.pow(Math.abs(signed), Math.log(bias) / Math.log(.5));
  return Math.max(0, base + Math.sign(signed) * halfWidth * magnitude);
}

export function installSplatling(api, profile, { splatlingChargeCap, splatlingReservation, tickSplatlingInterrupt, releaseSplatlingInterrupt }) {
  const { WeaponRunner, Projectiles, Actor, G, PLAYER } = api;
  if (WeaponRunner.prototype[INSTALLED]) return;
  Object.defineProperty(WeaponRunner.prototype, INSTALLED, { value: true });

  function cancel(runner, refund = true) {
    const state = runner.s3Spin, a = runner.a;
    if (refund && state && Number.isFinite(a.ink)) {
      // Never refund low-ink progress that was not paid from the tank.
      a.ink = Math.min(PLAYER.inkMax, a.ink + Math.max(0, state.unspent));
    }
    runner.s3Spin = null;
    runner.charging = runner.streaming = false;
    runner.charge = runner.chargeT = runner.burstT = runner.burstFrac = 0;
    runner.spinLoop?.stop(.12); runner.spinLoop = null;
  }

  const cancelInput = WeaponRunner.prototype.cancelPendingInput;
  WeaponRunner.prototype.cancelPendingInput = function (...args) {
    if (this.a?.weapon?.kind === 'splatling') cancel(this, this.a?.alive !== false);
    return cancelInput?.apply(this, args);
  };
  const reset = WeaponRunner.prototype.reset;
  WeaponRunner.prototype.reset = function (...args) {
    cancel(this, this.a?.alive !== false);
    return reset.apply(this, args);
  };
  // Actor's special early return must not freeze a prepaid stream and revive
  // it after the special. Do not alter any other weapon's special behavior.
  if (Actor?.prototype._startSpecial) {
    const startSpecial = Actor.prototype._startSpecial;
    Actor.prototype._startSpecial = function (...args) {
      if (this.weapon.kind === 'splatling') cancel(this.weaponRunner);
      return startSpecial.apply(this, args);
    };
  }

  const spread = WeaponRunner.prototype._spreadDeg;
  WeaponRunner.prototype._spreadDeg = function (w) {
    if (w.kind !== 'splatling') return spread.call(this, w);
    // Preserve the current release-held cone, but remove shooter-style bloom.
    // This is not a claim that the inherited cone is S3's exact PDF.
    return (this.a.grounded ? w.spreadGround : w.spreadAir) * (w.spreadFirst ?? .6);
  };

  WeaponRunner.prototype._splatling = function (dt, input, w) {
    const a = this.a;
    if (tickSplatlingInterrupt?.(this, dt) === 'stream') {
      // Retire/refund through the dedicated owner once, preserving its paid state.
      cancel(this); return;
    }
    if (this.s3SplatlingSubInterruptReady) {
      this.s3SplatlingSubInterruptReady = false;
      // The 5F R edge is consumed here so prepaid stream ink still uses this
      // owner's exact unspent-round refund at the boundary.
      cancel(this); return;
    }
    if (a.form === 'squid') releaseSplatlingInterrupt?.(this, a._squidPressT);
    // R starts the native sub-ready workflow. It must end the old stream
    // before native update() admits/charges the sub later in this tick.
    if (a.form === 'squid' || input.sub || input.subReleased || this.aimingSub) {
      cancel(this); return;
    }
    const pos = a.isLocal ? undefined : a.pos;
    if (this.streaming) {
      const state = this.s3Spin;
      if (!state) { cancel(this, false); return; }
      state.elapsed = Math.min(this.burstDur, state.elapsed + dt);
      this.burstT = Math.max(0, this.burstDur - state.elapsed);
      this.burstFrac = this.charge = this.burstT / this.burstDur;
      this.firingT = .3; a.fireFacing = .5;
      // One deterministic schedule, independent of held ZR and render rate.
      // Keep the public 160F/4F = 40-shot endpoint convention in this batch.
      while (state.emitted < state.shots && state.emitted * w.fireInterval < state.elapsed - EPS) {
        state.emitted++;
        state.unspent = state.paid * (1 - state.emitted / state.shots);
        a.lastFire = 0;
        this.spread = this._spreadDeg(w);
        G.projectiles.fireSplatling(a, w, this.spread);
        a.character.trigger('shoot');
      }
      this.cooldown = state.emitted * w.fireInterval - state.elapsed;
      this.spinLoop?.set({ pitch: 1.5 + .06 * Math.sin(G.time * 31), pos });
      if (this.burstT <= EPS) {
        this.streaming = false; this.charge = this.burstFrac = 0;
        this.s3Spin = null; this.cooldown = Math.max(this.cooldown, w.postStreamDelay ?? .22);
        this.spinLoop?.stop(.12); this.spinLoop = null;
        if (a.isLocal || a._nearCamera()) G.audio?.play('splatling_wind', { pos, volume: a.isLocal ? .6 : .42 });
      }
      return;
    }

    if (input.fire && this.cooldown <= EPS) {
      if (!this.charging) {
        this.charging = true; this.charge = this.chargeT = 0; this.chargeDinged = false;
        this.s3Spin = { paid: 0, unspent: 0, elapsed: 0, emitted: 0, shots: 0 };
        if (a.isLocal || a._nearCamera()) this.spinLoop = G.audio?.loop('splatling_spin', { pos, volume: a.isLocal ? .6 : .4, pitch: .6 });
      }
      const oldCharge = this.charge;
      // Reserve logically while charging, then debit once on release. This
      // preserves the public tank display and avoids treating refundable
      // charge reservation as a fired-shot recovery lock in the gear wrapper.
      const affordable = Math.max(oldCharge, splatlingChargeCap(Math.max(0, a.ink), w));
      const airRate = a.grounded ? 1 : w.airChargeRate;
      // Split a timestep at the paid -> empty transition; air and empty use
      // the slower rate, not a multiplied 1/16 rate.
      const normalTime = Math.min(dt, Math.max(0, affordable - oldCharge) * w.chargeTime / airRate);
      const progress = (normalTime * airRate + (dt - normalTime) * Math.min(airRate, w.emptyChargeRate)) / w.chargeTime;
      this.charge = clamp01(oldCharge + progress);
      if (1 - this.charge < EPS) this.charge = 1;
      this.chargeT = this.charge * w.chargeTime;
      a.fireFacing = .45;
      this.spinLoop?.set({ pitch: .6 + .85 * this.charge, pos });
      if (this.charge === 1 && !this.chargeDinged) {
        this.chargeDinged = true;
        if (a.isLocal) { G.audio?.play('splatling_ready', { volume: .7 }); if (!a.isBot) G.input?.rumble?.(.05, .28, 60); }
      }
    } else if (this.charging) {
      this.charging = false;
      const state = this.s3Spin;
      // Reuse the integration owner's whole-round reservation so low-ink
      // releases cannot emit unpaid cadence slots while retaining S3 charge flow.
      const reservation = splatlingReservation(w, this.charge, a.ink);
      this.burstDur = this.burstT = reservation.duration;
      state.paid = state.unspent = reservation.cost;
      a.ink = Math.max(0, a.ink - state.paid); a.lastFire = 0;
      this.burstFrac = reservation.shots ? 1 : 0;
      this.streaming = reservation.shots > 0 && this.burstDur > EPS;
      state.shots = reservation.shots;
      state.elapsed = state.emitted = 0;
      this.cooldown = this.bloom = 0;
      if (!this.streaming) cancel(this);
    }
  };

  // Sample before _push/recProj publishes velocity. A remote ghost uses the
  // transmitted velocity and never samples again. PR #64 may supply a different
  // charge-dependent base to _fireRound; the jitter composes with that base.
  const fireRound = Projectiles.prototype._fireRound;
  Projectiles.prototype._fireRound = function (a, w, ...args) {
    if (w.kind !== 'splatling') return fireRound.call(this, a, w, ...args);
    const sampled = sampleSplatlingSpeed(w.projSpeed, w.speedRandomHalfWidth, w.speedRandomBias, Math.random());
    return withSampledProjectileSpeed(w, sampled, config => fireRound.call(this, a, config, ...args));
  };
}

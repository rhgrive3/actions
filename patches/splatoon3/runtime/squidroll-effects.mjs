// Nintendo's wcmuyl6pzsbbnxukgtk1 clip: white/gold launch flash, a turning
// light trace and loose ink. Sizes/curves below are INKWAVE visual calibration.
// Read existing actions only; never wrap Character or change the body animation.
const INSTALL = Symbol.for('inkwave.s3.squidroll-effects.v1');
const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, x));

// Use the existing FX sprite pool's 14-float record (fx.js _sprite), with a
// deterministic phase instead of its random seed. Full pools omit cosmetics.
// This adds no GPU objects and cannot consume the gameplay random stream.
function glow(fx, p, color, size, life, alpha, kind, phase = 0) {
  const pool = fx.glows;
  if (!pool || pool.n >= pool.cap) return;
  const i = pool.n++, j = i * 3, k = i * 14;
  pool.P[j] = p.x; pool.P[j + 1] = p.y; pool.P[j + 2] = p.z;
  pool.V[j] = pool.V[j + 1] = pool.V[j + 2] = 0;
  pool.C[j] = color.r; pool.C[j + 1] = color.g; pool.C[j + 2] = color.b;
  const x = pool.X;
  x[k] = size; x[k + 1] = size * .8; x[k + 2] = 0; x[k + 3] = life; x[k + 4] = alpha;
  x[k + 5] = phase; x[k + 6] = 0; x[k + 7] = 0; x[k + 8] = 0;
  x[k + 9] = kind; x[k + 10] = 0; x[k + 11] = .5; x[k + 12] = 0; x[k + 13] = 0;
}
// Same existing drop record, with no paint, ripple, collision, or random draws.
function drop(fx, p, v, color, phase) {
  if (fx.dN >= fx.dCap) return;
  const i = fx.dN++, j = i * 3, k = i * 8;
  for (let axis = 0; axis < 3; axis++) {
    const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
    fx.dP[j + axis] = fx.dK[j + axis] = p[key];
    fx.dV[j + axis] = v[key]; fx.dC[j + axis] = color[axis === 0 ? 'r' : axis === 1 ? 'g' : 'b'];
  }
  const x = fx.dA;
  x[k] = .025 + phase * .018; x[k + 1] = 0; x[k + 2] = .22;
  x[k + 3] = 1; x[k + 4] = 1.6; x[k + 5] = phase; x[k + 6] = 0; x[k + 7] = 12; // F_NOCOL | F_QUIET
  fx._dropColorStart = Math.min(fx._dropColorStart, i);
  fx._dropColorEnd = Math.max(fx._dropColorEnd, i + 1);
}

export function installSquidrollEffects({ FX, G, THREE }, profile) {
  if (!FX || !THREE || !profile?.movement?.roll) return;
  const proto = FX.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;
  Object.defineProperty(proto, INSTALL, { value: true });
  const states = new WeakMap(), disposed = new WeakSet();
  const update = proto.update, dispose = proto.dispose, cfg = profile.movement.roll;
  proto.update = function (dt, camera) {
    if (disposed.has(this)) return;
    if (dt > 0 && G.fx === this && !G.match?.paused && !G.match?.attract) {
      let s = states.get(this);
      if (!s) {
        s = { actors: new WeakMap(), pos: new THREE.Vector3(), point: new THREE.Vector3(),
          velocity: new THREE.Vector3(), gold: new THREE.Color(1, .88, .32) };
        states.set(this, s);
      }
      for (const a of G.actors || []) {
        const roll = a.remote ? a.remoteSquidrollVisual : a.s3?.actions?.roll;
        const remaining = a.remote ? roll?.remaining : roll?.time;
        if (!roll || !(remaining > 0) || !a.alive || a.form !== 'squid' || a.grounded ||
            a.climbing || a.specialActive || a.superJumpState || a.character?.root?.visible === false) continue;
        let state = s.actors.get(a);
        const age = Math.max(0, cfg.duration - remaining);
        if (!state || state.roll !== roll) {
          state = { roll, step: -1, fresh: age < 1 / 30 }; s.actors.set(a, state);
        }
        if (a.visualPos) a.visualPos(s.pos); else s.pos.copy(a.pos);
        if (camera && camera.position.distanceToSquared(s.pos) > 36 * 36) { state.fresh = false; continue; }
        s.pos.y += .35;
        const vx = roll.vx || 0, vz = roll.vz || 0, speed = Math.hypot(vx, vz) || 1;
        const nx=vx/speed,nz=vz/speed;
        if (state.fresh) {
          state.fresh = false;
          glow(this, s.pos, s.gold, 1.05, .1, .9, 4);
          const count = Math.max(4, Math.round(10 * (this.q || 1)));
          for (let i = 0; i < count; i++) {
            const phase = i / count, angle = phase * TAU;
            s.velocity.set(Math.cos(angle) * 2 - nx, .8 + phase * 1.8, Math.sin(angle) * 2 - nz);
            drop(this, s.pos, s.velocity, a.color, phase);
          }
        }
        const armored = a.remote ? age < cfg.armorTime : roll.armorTime > 0 && roll.armorHP > 0;
        if (!armored) continue;
        const life = Math.min(.075, dt * 1.5), strength = 1 - .45 * clamp(age / cfg.duration);
        glow(this, s.pos, s.gold, .6, life, .38 * strength, 2);
        // Partial arcs in the launch/up plane follow the existing action clock.
        // Keep the squid's face readable; do not paint over its body/material.
        const turn = age / cfg.duration * TAU;
        const arcCount=this.glows?Math.min(18,Math.max(0,this.glows.cap-this.glows.n)):0;
        for (let i = 0; i < arcCount; i++) {
          const angle = turn - i * .06, along = Math.cos(angle) * .53;
          s.point.set(s.pos.x + nx * along, s.pos.y + Math.sin(angle) * .44, s.pos.z + nz * along);
          glow(this, s.point, s.gold, .2 - i * .005, life, strength * (1 - i / 19), 1);
        }
        const step = Math.floor(age * 60 + 1e-6);
        if (step !== state.step) {
          state.step = step;
          const angle = step * 2.3999632297;
          s.point.set(s.pos.x + Math.cos(angle) * .48, s.pos.y + Math.sin(angle) * .4, s.pos.z - nz * .25);
          glow(this, s.point, s.gold, .13, .065, .8, 12, angle);
        }
      }
    }
    return update.call(this, dt, camera);
  };
  proto.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this); states.delete(this);
    return dispose.apply(this, args);
  };
}

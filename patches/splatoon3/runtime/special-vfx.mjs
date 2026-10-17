// Splatoon 3 special-weapon effects: activation, sustain, attack, impact and end
// for all nineteen specials (presentation only).
//
// Reference: Splatoon 3 footage of every special (Zephiel810, "Splatoon 3 - All
// Special Weapons (DLC Included)", youtu.be/PLxqXn_E898) read frame by frame,
// plus Nintendo's official special demos already cited by special-models.md.
// Observed families, per special, are recorded in
// patches/splatoon3/reference/special-vfx.md. Shapes, sizes, colours and
// timings below are INKWAVE calibrations against that footage; Nintendo's
// effect assets, particle counts and curves are not public.
//
// Authority: this module never changes a timer, hit, paint, armor, network row
// or gameplay field. It reads
//   - 'all:special' events (local) and the replayed copies of them (remote);
//   - the live actor state (`specialActive`, `_s3AllSpecialState`, kit states);
//   - the live projectile list and the special world objects;
// and draws through its own pooled GPU kit (special-vfx-kit.mjs) plus the
// game's FX pools (G.fx). Effect marks for animation (actor._s3SpecialMarks)
// are presentation timestamps only.

import { SpecialVfxKit, SPARK, PUFF, RIBBON, BEAM, SHELL, BAND, DISC, vfxRandom, excludeFromOverridePasses, inkLightUniforms } from './special-vfx-kit.mjs';
import { inkVacState } from './kit-ink-vac.mjs';
import { bigBubblerDomes, bigBubblerRemoteDomes } from './kit-big-bubbler.mjs';
import { createInkFist, disposeSpecialModel } from './special-motion.mjs';
import { superChumpLandingPreview, tentaMissilesLockPreview } from './all-specials.mjs';
import { remoteKrakenPhase } from './special-presentation.mjs';

const INSTALL = Symbol.for('inkwave.s3.special-vfx.install.v1');
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = x => clamp(x, 0, 1);
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const rnd = (a = 1, b = 0) => b + vfxRandom() * (a - b);
const sgn = () => (vfxRandom() < 0.5 ? -1 : 1);

// Per-special tuning that the reference doc cites (all calibration).
export const SPECIAL_VFX_CALIBRATION = Object.freeze({
  status: 'INKWAVE calibration against Splatoon 3 footage; not Nintendo effect data',
  activation: { flash: 1.7, ring: 2.6, streaks: 22 },
  killerWail: { beamRadius: 0.42, coreRadius: 0.13, beamHold: 0.14, maxLength: 140 },
  booyah: { blastSeconds: 40 / 60, holdSeconds: 40 / 60 },
  waveBreaker: { wallHeight: 1.6 },
  inkstrike: { twisterHeight: 13, dropFrames: 26 },
  reefslider: { wakeEvery: 1 / 30 },
});

// Remote/local presentation marks used by the device animation layer.
export function markSpecial(actor, name, time) {
  if (!actor) return;
  (actor._s3SpecialMarks ||= {})[name] = time;
}

class Director {
  constructor(api, fx) {
    this.api = api; this.THREE = api.THREE; this.G = api.G; this.fx = fx;
    const T = this.THREE;
    this.kit = new SpecialVfxKit(T, fx.root, fx.q ?? 1, inkLightUniforms(T, fx));
    this.tracks = new Map(); this.rounds = new Map(); this.objects = new Map(); this.lasers = new Map();
    this.domes = new Map(); this.coolers = new Map(); this.fists = new Map(); this.storms = new Map();
    this.v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new T.Vector3());
    this.up = new T.Vector3(0, 1, 0); this.c = new T.Color(); this.camPos = new T.Vector3(0, 10, 0);
    this.time = 0; this.errors = 0;
  }
  // ------------------------------------------------------------------ colour helpers (linear)
  rgb(owner, team) {
    const col = owner?.color ?? this.G.teamColors?.[owner?.team ?? team] ?? 0xffffff;
    if (col?.isColor) return [col.r, col.g, col.b];
    this.c.set(col); return [this.c.r, this.c.g, this.c.b];
  }
  // Linear HDR colour: team colour scaled by k with a small white lift, so cores bloom but stay team-coloured.
  hdr(c, k, white = 0) { const w = white * 0.32; return [c[0] * k + w, c[1] * k + w, c[2] * k + w]; }
  near(p, d) { const c = this.camPos; return (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2 < d * d; }
  // ------------------------------------------------------------------ primitive spawners
  spark(kind, p, vx, vy, vz, life, s0, s1, col, a = 1, o = null) {
    this.kit.sparks.spawn(p.x, p.y, p.z, vx, vy, vz, life, s0, s1, col[0], col[1], col[2], a, kind, o);
  }
  puff(kind, p, vx, vy, vz, life, s0, s1, col, a = 1, o = null) {
    if (kind === PUFF.CHUNK) { col = this.inkCol(col); if (o?.stretch === undefined) o = { ...o, stretch: 0.03 }; }   // liquid drops
    this.kit.puffs.spawn(p.x, p.y, p.z, vx, vy, vz, life, s0, s1, col[0], col[1], col[2], a, kind, o);
  }
  // radial burst of thrown ink: glossy teardrops stretched along their flight, falling under gravity
  // (S3 sprays liquid ink, not light; o.glow keeps the old additive light streaks for genuinely luminous sources)
  streaks(p, n, speed, col, o = {}) {
    n = Math.max(1, Math.round(n * this.kit.q));
    const up = o.up ?? 0.4, life = o.life ?? 0.45, size = o.size ?? 0.06, drag = o.drag ?? 3.2;
    for (let i = 0; i < n; i++) {
      const th = rnd(TAU), y = clamp(up + rnd(o.spread ?? 1, -(o.spread ?? 1)) * 0.6, -1, 1), h = Math.sqrt(1 - y * y), s = speed * rnd(1.2, 0.55);
      if (o.glow) this.spark(SPARK.STREAK, p, Math.cos(th) * h * s, y * s, Math.sin(th) * h * s, life * rnd(1.2, 0.7), size, size * 0.4, col, o.alpha ?? 1, { drag, grav: o.grav ?? 4, stretch: o.stretch ?? 0.09 });
      else if (i % 3 === 2) {   // glossy shards with white cores among the drops (S3 splatter)
        const c = this.inkCol(col), sz = size * rnd(3.6, 2);
        this.kit.puffs.spawn(p.x, p.y, p.z, Math.cos(th) * h * s, y * s, Math.sin(th) * h * s, life * rnd(1.4, 0.9), sz, sz * 0.5, c[0], c[1], c[2], 1, PUFF.PETAL, { drag: drag * 0.5, grav: (o.grav ?? 14) * 0.6, rot: rnd(TAU), spin: rnd(12, -12), fadeIn: 0.01 });
      } else this.drop(p, Math.cos(th) * h * s, y * s, Math.sin(th) * h * s, life * rnd(1.6, 1.0), size * rnd(2.6, 0.8), col, { drag: drag * 0.35, grav: o.grav ?? 14, stretch: 0.05 });
    }
  }
  // one liquid ink drop (a lit teardrop impostor in the puff pool); col is the plain team colour
  drop(p, vx, vy, vz, life, size, col, o = {}) {
    const c = this.inkCol(col);
    this.puff(PUFF.CHUNK, p, vx, vy, vz, life, size, size * (o.shrink ?? 0.45), c, 1, { drag: o.drag ?? 0.9, grav: o.grav ?? 14, stretch: o.stretch ?? 0.035, fadeIn: 0.01 });
  }
  // ink is the team colour itself: strip any HDR lift a caller meant for glow (bloom threshold 2.4)
  inkCol(c) { const m = Math.max(c[0], c[1], c[2]); if (m <= 1) return c; const lo = Math.min(c[0], c[1], c[2]), w = Math.min(lo, m - 1) * 0.8;
    return [(c[0] - w) / (m - w), (c[1] - w) / (m - w), (c[2] - w) / (m - w)]; }
  stars(p, n, radius, col, o = {}) {
    n = Math.max(1, Math.round(n * this.kit.q));
    for (let i = 0; i < n; i++) {
      const th = rnd(TAU), r = radius * Math.sqrt(vfxRandom()), y = rnd(o.h ?? 1.2, o.h0 ?? 0);
      this.v[7].set(p.x + Math.cos(th) * r, p.y + y, p.z + Math.sin(th) * r);
      this.spark(SPARK.STAR, this.v[7], rnd(0.6, -0.6), rnd(o.rise ?? 1.4, 0.2), rnd(0.6, -0.6), rnd(o.life ?? 0.7, 0.35), o.size ?? 0.22, 0.02, col, 1, { drag: 1.5, spin: rnd(4, -4) });
    }
  }
  chunks(p, n, speed, col, o = {}) {
    n = Math.max(1, Math.round(n * this.kit.q));
    const c = this.inkCol(col);
    for (let i = 0; i < n; i++) {
      const th = rnd(TAU), y = rnd(o.upMax ?? 1, o.upMin ?? 0.25), h = Math.sqrt(Math.max(0, 1 - y * y)), s = speed * rnd(1.15, 0.45);
      this.puff(PUFF.CHUNK, p, Math.cos(th) * h * s, y * s, Math.sin(th) * h * s, rnd(o.life ?? 0.9, 0.5), (o.size ?? 0.18) * rnd(1.4, 0.6), (o.size ?? 0.18) * 0.4, c, 1, { drag: 0.8, grav: 15, rot: rnd(TAU), spin: rnd(6, -6), stretch: 0.03, fadeIn: 0.01 });
    }
  }
  // S3 ink petals: pointed glossy leaves with a white core, thrown out and tumbling (83.0s, 96.8s)
  petals(p, n, speed, col, o = {}) {
    n = Math.max(1, Math.round(n * this.kit.q));
    const c = this.inkCol(col);
    for (let i = 0; i < n; i++) {
      const th = rnd(TAU), y = rnd(o.upMax ?? 0.9, o.upMin ?? -0.1), h = Math.sqrt(Math.max(0, 1 - y * y)), sp = speed * rnd(1.2, 0.5);
      const sz = (o.size ?? 0.22) * rnd(1.5, 0.7);
      this.kit.puffs.spawn(p.x, p.y, p.z, Math.cos(th) * h * sp, y * sp, Math.sin(th) * h * sp, rnd(o.life ?? 0.8, 0.45), sz, sz * 0.5, c[0], c[1], c[2], 1, PUFF.PETAL,
        { drag: o.drag ?? 2.2, grav: o.grav ?? 7, rot: rnd(TAU), spin: rnd(10, -10), fadeIn: 0.01 });
    }
  }
  smoke(p, n, col, o = {}) {
    n = Math.max(1, Math.round(n * this.kit.q));
    for (let i = 0; i < n; i++) {
      const th = rnd(TAU), s = (o.speed ?? 2) * rnd(1, 0.3);
      this.puff(o.kind ?? PUFF.SMOKE, p, Math.cos(th) * s, rnd(o.rise ?? 1.2, 0.2), Math.sin(th) * s, rnd(o.life ?? 1.2, 0.6), (o.size ?? 0.5) * rnd(1.2, 0.7), (o.size ?? 0.5) * (o.grow ?? 2.4), col, o.alpha ?? 0.6, { drag: o.drag ?? 2.2, buoy: o.buoy ?? 0.6, spin: rnd(1, -1), fadeIn: 0.05 });
    }
  }
  // retained shapes ----------------------------------------------------------------------------
  shell(add, life, style, pos, s0, s1, col, a, o = {}) {
    const pool = add ? this.kit.shells : this.kit.inkShells, seed = vfxRandom();
    const ease = o.ease || easeOut;
    return pool.add(life, [pos.x, pos.y, pos.z, o.hemi ? 1 : 0, s0, s0 * (o.sy ?? 1), s0, 0, col[0], col[1], col[2], a, style, 0, seed, 0], (r) => {
      const t = r.life > 0 ? clamp01(r.t / r.life) : 0, s = s0 + (s1 - s0) * ease(t);
      r.v[4] = s; r.v[5] = s * (o.sy ?? 1); r.v[6] = s; r.v[7] += (o.spin ?? 0) * 0.016;
      r.v[11] = a * (o.fade === false ? 1 : o.fadeIn ? Math.min(1, t / o.fadeIn) * (1 - smooth((t - 0.6) / 0.4)) : 1 - smooth((t - (o.hold ?? 0.35)) / (1 - (o.hold ?? 0.35))));
      r.v[13] = t;
      // the owner's follow runs last, so the size/alpha it drives is not overwritten by the default easing
      if (o.follow && o.follow(r) === false) return false;
    });
  }
  disc(add, life, style, pos, nrm, r0, r1, col, a, o = {}) {
    const pool = add ? this.kit.discs : this.kit.inkDiscs, seed = vfxRandom(), ease = o.ease || easeOut;
    return pool.add(life, [pos.x, pos.y, pos.z, r0, nrm.x, nrm.y, nrm.z, rnd(TAU), col[0], col[1], col[2], a, style, 0, seed, 0], (r) => {
      const t = r.life > 0 ? clamp01(r.t / r.life) : 0;
      r.v[3] = r0 + (r1 - r0) * ease(t); r.v[7] += (o.spin ?? 0) * 0.016; r.v[13] = t;
      if (o.fade !== false) r.v[11] = a * (1 - smooth((t - (o.hold ?? 0.5)) / (1 - (o.hold ?? 0.5))));
      if (o.follow && o.follow(r) === false) return false;   // after the defaults: follow wins
    });
  }
  band(add, life, style, pos, r0, r1, h0, h1, col, a, o = {}) {
    const pool = add ? this.kit.bands : this.kit.inkBands, seed = vfxRandom(), ease = o.ease || easeOut;
    return pool.add(life, [pos.x, pos.y, pos.z, rnd(TAU), r0, h0, o.taper ?? 1, o.twist ?? 0, col[0], col[1], col[2], a, style, 0, seed, o.speed ?? 1], (r) => {
      const t = r.life > 0 ? clamp01(r.t / r.life) : 0;
      r.v[4] = r0 + (r1 - r0) * ease(t); r.v[5] = h0 + (h1 - h0) * ease(t); r.v[3] += (o.spin ?? 0) * 0.016; r.v[13] = t;
      if (o.fade !== false) r.v[11] = a * (1 - smooth((t - (o.hold ?? 0.5)) / (1 - (o.hold ?? 0.5))));
      if (o.follow && o.follow(r) === false) return false;   // after the defaults: follow wins
    });
  }
  beam(add, life, style, a, b, r0, r1, col, alpha, o = {}) {
    const pool = add ? this.kit.beams : this.kit.inkBeams;
    return pool.add(life, [a.x, a.y, a.z, r0, b.x, b.y, b.z, r1, col[0], col[1], col[2], alpha, style, 0, o.seed ?? vfxRandom(), o.speed ?? 6], o.follow || null);
  }
  setBeam(r, a, b, r0, r1, alpha) {
    const v = r.v; v[0] = a.x; v[1] = a.y; v[2] = a.z; v[4] = b.x; v[5] = b.y; v[6] = b.z;
    if (r0 !== undefined) v[3] = r0; if (r1 !== undefined) v[7] = r1; if (alpha !== undefined) v[11] = alpha;
  }
  // ------------------------------------------------------------------ recipes
  // The game's own ink blast, with its droplet paint switched off: offline, FX droplets that land become
  // real turf (main.js onDropletLand), and presentation must never author paint.
  nativeBlast(pos, col, radius) {
    const fx = this.G.fx; if (!fx?.explosion) return;
    const pe = fx.paintEffects; fx.paintEffects = false;
    try { fx.explosion(pos, col, radius); } finally { fx.paintEffects = pe; }
  }
  // A spray burst. The game's own droplets are clean glossy spheres, which read as bubbles next to S3's lobed
  // splatter, so special bursts throw this layer's irregular drops and white-cored shards instead.
  nativeBurst(pos, normal, col, opts = {}) {
    const c = col?.isColor ? [col.r, col.g, col.b] : col;
    this.streaks(pos, opts.count ?? 12, (opts.speed ?? 6) * 1.1, c, { up: normal?.y > 0.5 ? 0.5 : 0, life: 0.6, size: (opts.size ?? 0.1) * 0.8 });
  }
  // a brief light at the heart of a burst: small and short, so the liquid ink stays the subject
  flash(pos, col, size, life = 0.28) {
    this.shell(true, life * 0.7, SHELL.FLASH, pos, size * 0.15, size * 0.45, this.hdr(col, 1.2, 1.0), 0.6, { hold: 0.05 });
    this.spark(SPARK.GLOW, pos, 0, 0, 0, life * 0.7, size * 0.6, size, this.hdr(col, 1.0, 0.5), 0.45);
  }
  // A big special explosion: the ink itself (dome, crown, drops), its shock (ground ring, sphere edge) and light.
  inkBlast(pos, col, radius, o = {}) {
    const G = this.G, R = radius, p = this.v[6].copy(pos);
    // the game's own blast (torn glossy sheets and round droplets) reads as plastic beside S3's splatter: opt-in only
    if (o.native === true) this.nativeBlast(p, this.c.setRGB(col[0], col[1], col[2]), Math.min(R, 6));
    this.flash(this.v[5].copy(p).setY(p.y + 0.6), col, Math.min(2.6, R * 0.3));
    // the liquid: a glossy ink dome tearing open, a crown thrown off its foot, a puddle and a ring of spray on the floor
    this.shell(false, o.domeLife ?? 0.75, SHELL.INK, p, R * 0.08, R * (o.dome ?? 0.5), col, 1, { hemi: true, sy: o.sy ?? 0.85, hold: 0.25, ease: easeOut });
    this.disc(false, 0.9, DISC.SPLAT, this.v[5].copy(p).setY(p.y + 0.03), this.up, R * 0.25, R * 0.85, col, 1, { hold: 0.55 });
    this.band(false, 0.7, BAND.SHOCK, p, R * 0.18, R * 0.8, 0.4, Math.min(4.5, R * 0.42), col, 1, { hold: 0.25 });
    this.streaks(this.v[5].copy(p).setY(p.y + 0.4), o.streaks ?? Math.min(40, 10 + R * 3), Math.min(26, 8 + R * 1.6), col, { up: 0.45, life: 0.6, size: 0.07 });
    this.chunks(this.v[5].copy(p).setY(p.y + 0.3), o.chunks ?? Math.min(28, 6 + R * 2), Math.min(18, 5 + R * 1.2), col, { size: 0.2 + R * 0.015 });
    this.petals(this.v[5].copy(p).setY(p.y + 0.5), Math.min(24, 6 + R * 2), Math.min(16, 6 + R), col, { size: 0.18 + R * 0.02 });
    this.smoke(this.v[5].copy(p).setY(p.y + 0.4), o.mist ?? Math.min(10, 2 + R), this.hdr(col, 0.95), { kind: PUFF.MIST, size: 0.6 + R * 0.06, speed: 1.2 + R * 0.35, alpha: 0.4, life: 0.8 });
  }
  activation(a, col, scale = 1) {
    const C = SPECIAL_VFX_CALIBRATION.activation, p = this.v[4].copy(a.pos);
    const chest = this.v[3].copy(p).setY(p.y + 0.95);
    this.flash(chest, col, C.flash * scale * 0.5, 0.2);
    // ink bursts off the body: a puddle, a ring of spray, a liquid crown and thrown drops
    this.disc(false, 0.8, DISC.SPLAT, this.v[2].copy(p).setY(p.y + 0.03), this.up, 0.4 * scale, 1.6 * scale, col, 1, { hold: 0.55 });
    this.streaks(chest, C.streaks * scale, 9 * scale, col, { up: 0.35, life: 0.5, size: 0.05 });
    this.petals(chest, 10 * scale, 8 * scale, col, { size: 0.16 * scale });
    for (let i = 0; i < Math.round(10 * this.kit.q); i++) {                 // the S3 activation spikes: rays radiating from the body
      const th = i / 10 * TAU + rnd(0.3), el = rnd(0.9, -0.2);
      this.spark(SPARK.RAY, chest, Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el), 0.22, 0.05 * scale, 0.015, this.hdr(col, 1.6, 1.0), 0.8,
        { drag: 0, stretch: 1.6 * scale, grav: 0 });
    }
    this.nativeBurst(this.v[2].copy(p).setY(p.y + 0.2), this.up, this.c.setRGB(col[0], col[1], col[2]), { count: Math.round(16 * scale), speed: 6, size: 0.1, paint: false });
    this.stars(p, 6 * scale, 0.9 * scale, this.hdr(col, 1.4, 1.2), { h: 1.9, h0: 0.4 });
  }
  // a shot leaving the barrel: a small flash and a cone of liquid ink spray
  muzzle(pos, dir, col, size = 1) {
    this.flash(pos, col, 0.35 * size, 0.1);
    this.disc(true, 0.12, DISC.FLASH, pos, dir, 0.15 * size, 0.5 * size, this.hdr(col, 1.3, 0.8), 0.55, { hold: 0.05 });
    for (let i = 0; i < Math.round(10 * size * this.kit.q); i++) {
      const s = rnd(14, 6) * size;
      this.drop(pos, (dir.x + rnd(0.3, -0.3)) * s, (dir.y + rnd(0.3, -0.3)) * s, (dir.z + rnd(0.3, -0.3)) * s, rnd(0.45, 0.25), 0.07 * size * rnd(1.4, 0.7), col, { drag: 2, grav: 12, stretch: 0.03 });
    }
  }
  // ------------------------------------------------------------------ actor tracks
  track(a) {
    let t = this.tracks.get(a);
    const id = a.alive && !a.superJumpState ? a.specialActive?.id || null : null;
    if (t && t.id !== id) { this.endTrack(a, t); this.tracks.delete(a); t = null; }
    if (!t && id) {
      t = { id, start: this.time, d: {}, phase: null, phaseAt: this.time, color: this.rgb(a) };
      this.tracks.set(a, t);
      this.call(DIRECTORS[id]?.start, a, t);
    }
    return t;
  }
  endTrack(a, t) { this.call(DIRECTORS[t.id]?.end, a, t); for (const r of t.d.ribbons || []) { this.kit.ribbons.end(r); this.kit.glowRibbons.end(r); } for (const r of t.d.recs || []) r.dead = true; }
  call(fn, ...args) {
    if (!fn) return;
    try { fn.call(this, ...args); } catch (e) { if (this.errors++ < 5) console.warn('[special-vfx]', e); }
  }
  // ------------------------------------------------------------------ main update (render cadence)
  update(dt, camera) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (camera?.position) this.camPos.copy(camera.position);
    const G = this.G;
    for (const a of G.actors || []) {
      if (!a) continue;
      const t = this.track(a);
      if (t) {
        const phase = a._s3AllSpecialState?.phase ?? a.specialActive?.phase ?? remoteKrakenPhase(a);
        if (phase !== t.phase) { t.prev = t.phase; t.phase = phase; t.phaseAt = this.time; this.call(DIRECTORS[t.id]?.phase, a, t, phase); }
        t.color = this.rgb(a);
        this.call(DIRECTORS[t.id]?.frame, a, t, dt);
      }
    }
    for (const [a, t] of this.tracks) if (!(G.actors || []).includes(a)) { this.endTrack(a, t); this.tracks.delete(a); }
    this.call(this.updateRounds, dt);
    this.call(this.updateObjects, dt);
    this.call(this.updateKits, dt);
    this.kit.update(dt, camera);
  }
  clear() {
    for (const [a, t] of this.tracks) this.endTrack(a, t);
    for (const m of [this.tracks, this.rounds, this.objects, this.lasers, this.domes, this.coolers, this.fists, this.storms]) m.clear();
    this.kit.clear();
  }
  // ------------------------------------------------------------------ events (local emits and replayed remote copies)
  event(e) {
    const a = e?.actor; if (!a || !e.id) return;
    const pos = Array.isArray(e.pos) && e.pos.length === 3 && e.pos.every(finite) ? new this.THREE.Vector3(...e.pos) : null;
    const target = Array.isArray(e.target) && e.target.length === 3 && e.target.every(finite) ? new this.THREE.Vector3(...e.target) : null;
    markSpecial(a, e.action, this.G.time || 0);
    const d = DIRECTORS[e.id];
    if (d?.event) this.call(d.event, a, e, pos, target);
  }
  // ------------------------------------------------------------------ projectiles of specials
  updateRounds(dt) {
    const list = this.G.projectiles?.list || [], seen = this.seenRounds ||= new Set();
    seen.clear();
    for (const p of list) {
      const spec = ROUND_FX[p?.wid];
      if (!spec || !p.pos || p.dead) continue;
      if (spec.when && !spec.when(p)) continue;
      const tag = `${p.wid}:${p.seed}:${p.s3AllSpecialSeed ?? ''}`;
      let r = this.rounds.get(p);
      if (r && r.tag !== tag) { this.finishRound(r, false); this.rounds.delete(p); r = null; }
      if (!r) {
        r = { tag, p, spec, wid: p.wid, color: this.rgb(p.owner, p.team), age: 0, last: p.pos.clone(), vel: new this.THREE.Vector3(), d: {} };
        this.rounds.set(p, r);
        this.call(spec.start, r, p);
      }
      seen.add(p); r.age += dt; r.last.copy(p.pos); if (p.vel) r.vel.copy(p.vel);
      if (this.near(p.pos, 90)) this.call(spec.frame, r, p, dt);
    }
    for (const [p, r] of this.rounds) if (!seen.has(p)) { this.finishRound(r, true); this.rounds.delete(p); }
  }
  finishRound(r, impact) {
    for (const rib of Object.values(r.d)) if (rib?.pts) { this.kit.ribbons.end(rib); this.kit.glowRibbons.end(rib); }
    if (impact) this.call(r.spec.impact, r);
  }
  // ------------------------------------------------------------------ deployed world objects
  updateObjects(dt) {
    const list = this.G.projectiles?._s3AllSpecialObjects || [], seen = this.seenObjects ||= new Set();
    seen.clear();
    for (const o of list) {
      if (!o || o.dead) continue;
      const spec = OBJECT_FX[o.kind];
      if (!spec) continue;
      let r = this.objects.get(o);
      if (r && r.kind !== o.kind) { this.call(r.spec.change, r, o); r.kind = o.kind; r.spec = spec; this.call(spec.start, r, o); }
      if (!r) { r = { o, kind: o.kind, spec, color: this.rgb(o.owner, o.team), age: 0, d: {} }; this.objects.set(o, r); this.call(spec.start, r, o); }
      seen.add(o); r.age += dt;
      this.call(spec.frame, r, o, dt);
    }
    for (const [o, r] of this.objects) if (!seen.has(o)) { this.call(r.spec.end, r, o); for (const x of Object.values(r.d)) { if (x?.pts) { this.kit.ribbons.end(x); this.kit.glowRibbons.end(x); } else if (x && 'dead' in x && x.v) x.dead = true; } this.objects.delete(o); }
  }
  // ------------------------------------------------------------------ kit specials with their own world records
  updateKits(dt) {
    const seen = this._kitSeen ||= new Set(); seen.clear();
    for (const list of [bigBubblerDomes?.() || [], bigBubblerRemoteDomes?.() || []]) for (const d of list) {
      if (!d || d.dead) continue; seen.add(d);
      let r = this.domes.get(d);
      if (!r) { r = { d: {}, color: d.color?.isColor ? [d.color.r, d.color.g, d.color.b] : this.rgb(d.owner, d.team), age: 0 }; this.domes.set(d, r); this.call(KIT_FX.bubbler.start, r, d); }
      r.age += dt; this.call(KIT_FX.bubbler.frame, r, d, dt);
    }
    for (const [d, r] of this.domes) if (!seen.has(d)) { this.call(KIT_FX.bubbler.end, r, d); for (const x of Object.values(r.d)) if (x && x.v) x.dead = true; this.domes.delete(d); }
    const P = this.G.projectiles;
    const coolers = P?._s3SupportCoolers || [], cs = this._kitSeenC ||= new Set(); cs.clear();
    for (const c of coolers) {
      if (!c || c.dead) continue; cs.add(c);
      let r = this.coolers.get(c);
      if (!r) { r = { d: {}, color: this.rgb(c.owner, c.team), age: 0 }; this.coolers.set(c, r); this.call(KIT_FX.cooler.start, r, c); }
      r.age += dt; this.call(KIT_FX.cooler.frame, r, c, dt);
    }
    for (const [c, r] of this.coolers) if (!cs.has(c)) { this.call(KIT_FX.cooler.end, r, c); this.coolers.delete(c); }
    const fists = P?._catalogueFists || [], fs = this._kitSeenF ||= new Set(); fs.clear();
    for (const f of fists) {
      if (!f || f.dead) continue; fs.add(f);
      let r = this.fists.get(f);
      if (!r) { r = { d: {}, color: this.rgb(f.owner, f.owner?.team), age: 0 }; this.fists.set(f, r); this.call(KIT_FX.fist.start, r, f); }
      r.age += dt; this.call(KIT_FX.fist.frame, r, f, dt);
    }
    for (const [f, r] of this.fists) if (!fs.has(f)) { this.call(KIT_FX.fist.end, r, f); this.fists.delete(f); }
    const clouds = P?.clouds || [], ss = this._kitSeenS ||= new Set(); ss.clear();
    for (const c of clouds) {
      if (!c) continue; ss.add(c);
      let r = this.storms.get(c);
      if (!r) { r = { d: {}, color: this.rgb(c.owner, c.team), age: 0 }; this.storms.set(c, r); this.call(KIT_FX.cloud.start, r, c); }
      r.age += dt; this.call(KIT_FX.cloud.frame, r, c, dt);
    }
    for (const [c, r] of this.storms) if (!ss.has(c)) { this.call(KIT_FX.cloud.end, r, c); this.storms.delete(c); }
  }
  // Tenta Missiles lock HUD (an SVG in the game HUD's marker layer). Returns false when there is no DOM HUD.
  tentaHud(t, show, limit = 0, inside = []) {
    const doc = globalThis.document, layer = this.G.hud?.markerLayer, canvas = this.G.renderer?.domElement;
    if (!doc?.createElementNS || !layer?.appendChild || !canvas?.getBoundingClientRect) return false;
    const NS = 'http://www.w3.org/2000/svg';
    let h = t.d.hud;
    if (!h && show) {
      const svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'iw-tenta-lock');
      svg.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:3');
      const mk = (tag, attrs) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.appendChild(e); return e; };
      const col = `rgb(${t.color.map(x => Math.round(255 * Math.pow(Math.min(1, x), 1 / 2.2))).join(',')})`;
      h = t.d.hud = { svg, col, brackets: [],
        // outer frame: sized from the footage (about 2.3x the lock circle), decorative only
        glow: mk('circle', { fill: 'none', stroke: col, 'stroke-width': 10, opacity: 0.16 }),
        ring: mk('circle', { fill: 'none', stroke: col, 'stroke-width': 3, opacity: 0.9 }),
        // the actual lock circle
        inner: mk('circle', { fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: 0.7, 'stroke-dasharray': '10 6' }),
        ticks: mk('path', { fill: 'none', stroke: col, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.9 }) };
      layer.appendChild(svg);
    }
    if (!h) return true;
    h.svg.style.display = show ? '' : 'none';
    if (!show) return true;
    const lr = layer.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const cx = cr.left - lr.left + cr.width / 2, cy = cr.top - lr.top + cr.height / 2, R = limit * cr.height / 2, k = this.time;
    const RO = R * 2.3;
    for (const c of [h.glow, h.ring]) { c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', RO); }
    h.inner.setAttribute('cx', cx); h.inner.setAttribute('cy', cy); h.inner.setAttribute('r', R);
    h.inner.setAttribute('transform', `rotate(${(k * 40) % 360} ${cx} ${cy})`);
    let d = '';
    for (let i = 0; i < 4; i++) { const th = i * Math.PI / 2, c0 = Math.cos(th), s0 = Math.sin(th);
      d += `M${cx + c0 * RO * 0.94} ${cy + s0 * RO * 0.94}L${cx + c0 * RO * 1.05} ${cy + s0 * RO * 1.05}`; }
    h.ticks.setAttribute('d', d);
    // a rotating four-corner bracket on each opponent inside the circle
    for (let i = 0; i < Math.max(inside.length, h.brackets.length); i++) {
      let b = h.brackets[i];
      if (!b && i < inside.length) {
        b = h.brackets[i] = globalThis.document.createElementNS(NS, 'path');
        b.setAttribute('fill', 'none'); b.setAttribute('stroke', h.col); b.setAttribute('stroke-width', 3); b.setAttribute('stroke-linecap', 'round');
        h.svg.appendChild(b);
      }
      if (i >= inside.length) { b.style.display = 'none'; continue; }
      b.style.display = '';
      const [, nx, ny] = inside[i], x = cr.left - lr.left + (nx * 0.5 + 0.5) * cr.width, y = cr.top - lr.top + (0.5 - ny * 0.5) * cr.height;
      const r = 16 + 3 * Math.sin(k * 10), e = 7;
      let p = '';
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p += `M${x + sx * r} ${y + sy * (r - e)}L${x + sx * r} ${y + sy * r}L${x + sx * (r - e)} ${y + sy * r}`;
      b.setAttribute('d', p); b.setAttribute('transform', `rotate(${(k * 90) % 360} ${x} ${y})`);
    }
    return true;
  }
  // Wave Breaker tracking lines: from the viewer to each opponent this device's team has marked
  // (S3 footage: thin lines run from the player to every marked target while the mark lasts).
  markingLines(r, o) {
    const G = this.G, viewer = (G.actors || []).find(x => x?.isLocal && x.alive);
    const lines = r.d.lines ||= new Map(), live = new Set();
    if (viewer && viewer.team === o.team) for (const e of G.actors || []) {
      if (!e?.alive || e.team === o.team || !((e.s3?.revealedUntil?.[o.team] || 0) > (G.time || 0))) continue;
      live.add(e);
      if (!lines.has(e)) lines.set(e, this.beam(true, 0, BEAM.LINE, viewer.pos, e.pos, 0.025, 0.025, this.hdr(r.color, 1.7, 0.9), 0.85, { seed: 0.9, speed: 2,
        follow: (rec) => { this.chest(viewer, this.v[0], 0.9); this.chest(e, this.v[1], 0.8); this.setBeam(rec, this.v[0], this.v[1]); } }));
    }
    for (const [e, rec] of lines) if (!live.has(e)) { rec.dead = true; lines.delete(e); }
  }
  clearLines(r) { for (const rec of r.d.lines?.values() || []) rec.dead = true; r.d.lines?.clear(); }
  // helpers for actor anchors
  chest(a, out, h = 0.95) { return out.set(a.pos.x, a.pos.y + h, a.pos.z); }
  forward(a, out) { const y = a.aimYaw ?? a.yaw ?? 0; return out.set(Math.sin(y), 0, Math.cos(y)); }
  aim(a, out) { if (a.aimDir && a.aimDir.lengthSq() > 1e-6) return out.copy(a.aimDir).normalize(); return this.forward(a, out); }
  bone(a, name, out) {
    const b = a.character?.bones?.[name];
    if (b?.getWorldPosition && a.character?.kid?.visible !== false) return b.getWorldPosition(out);
    return null;
  }
  ribbon(glow, o) { return (glow ? this.kit.glowRibbons : this.kit.ribbons).start(o); }
  pushRibbon(r, p, glow) { (glow ? this.kit.glowRibbons : this.kit.ribbons).push(r, p.x, p.y, p.z, this.kit.time); }
}

// =================================================================================================
// Projectile effects (local rounds and remote ghost rounds alike)
// =================================================================================================
const ROUND_FX = {
  tentaMissiles: {
    start(r, p) {
      const c = r.color;
      r.d.smoke = this.ribbon(false, { width: 0.12, widthTail: 0.55, color: [0.93, 0.93, 0.95], alpha: 0.42, style: RIBBON.SMOKE, life: 0.6, spacing: 0.2 });
      r.d.glow = this.ribbon(true, { width: 0.16, widthTail: 0.04, color: this.hdr(c, 2.2, 0.8), alpha: 1, style: RIBBON.GLOW, life: 0.22, spacing: 0.1 });
      this.flash(p.pos, c, 0.5, 0.16);
      this.smoke(p.pos, 3, [0.9, 0.9, 0.92], { size: 0.35, speed: 1.6, life: 0.8, alpha: 0.6 });
    },
    frame(r, p, dt) {
      this.pushRibbon(r.d.smoke, p.pos, false); this.pushRibbon(r.d.glow, p.pos, true);
      // exhaust: a bright flame tongue behind the missile
      const v = this.v[0].copy(r.vel); const s = v.length(); if (s > 0.1) v.multiplyScalar(-1 / s);
      if (vfxRandom() < 0.8) this.spark(SPARK.STREAK, p.pos, v.x * 6, v.y * 6, v.z * 6, 0.12, 0.11, 0.03, this.hdr(r.color, 2.4, 1.6), 1, { drag: 6, stretch: 0.05 });
    },
    impact(r) { this.inkBlast(r.last, r.color, 3.2, { streaks: 12, chunks: 8, mist: 4, native: false }); },
  },
  inkjet: {
    start(r, p) { r.d.ink = this.ribbon(false, { width: 0.45, widthTail: 0.1, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.2, spacing: 0.12 }); },
    frame(r, p) { this.pushRibbon(r.d.ink, p.pos, false); if (vfxRandom() < 0.4) this.drop(p.pos, rnd(1.5, -1.5), rnd(1, -1), rnd(1.5, -1.5), 0.45, 0.1, r.color, { grav: 12 }); },
    impact(r) { this.inkBlast(r.last, r.color, 3.6, { streaks: 14, chunks: 10, mist: 4, native: false }); },
  },
  booyahBomb: {
    start(r, p) {
      r.d.glow = this.ribbon(true, { width: 1.1, widthTail: 0.15, color: this.hdr(r.color, 1.6, 1.4), alpha: 1, style: RIBBON.GLOW, life: 0.45, spacing: 0.15 });
      r.d.core = this.shell(true, 0, SHELL.ORB, p.pos, 0.9, 0.9, this.hdr(r.color, 0.6, 6), 1, { fade: false, follow: (rec) => { if (r.done) return false; rec.v[0] = r.last.x; rec.v[1] = r.last.y; rec.v[2] = r.last.z; } });
    },
    frame(r, p) {
      this.pushRibbon(r.d.glow, p.pos, true);
      if (vfxRandom() < 0.9) this.spark(SPARK.STAR, this.v[0].copy(p.pos).add(this.v[1].set(rnd(0.6, -0.6), rnd(0.6, -0.6), rnd(0.6, -0.6))), 0, 0, 0, 0.35, 0.3, 0.02, this.hdr(r.color, 1.8, 1.6), 1);
    },
    impact(r) { r.done = true; this.flash(r.last, r.color, 2.2, 0.3); },
  },
  ultraStamp: {
    start(r, p) { r.d.ink = this.ribbon(false, { width: 0.7, widthTail: 0.12, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.3, spacing: 0.12 }); },
    frame(r, p) { this.pushRibbon(r.d.ink, p.pos, false); if (vfxRandom() < 0.6) this.puff(PUFF.CHUNK, p.pos, rnd(1, -1), rnd(0.5, -1), rnd(1, -1), 0.6, 0.14, 0.05, r.color, 1, { grav: 14, drag: 0.5 }); },
    impact(r) { this.inkBlast(r.last, r.color, 5.5, { streaks: 26, chunks: 18 }); },
  },
  crabTank: {
    when: p => p.s3AllSpecialMode === 'cannon' || p.type !== 'shot',
    start(r, p) { r.d.ink = this.ribbon(false, { width: p.s3AllSpecialMode === 'cannon' ? 0.95 : 0.32, widthTail: p.s3AllSpecialMode === 'cannon' ? 0.4 : 0.06, color: r.color, alpha: 1, style: RIBBON.INK, life: p.s3AllSpecialMode === 'cannon' ? 0.4 : 0.22, spacing: 0.12 });
      r.d.smoke = this.ribbon(false, { width: 0.2, widthTail: 0.7, color: [0.85, 0.85, 0.88], alpha: 0.45, style: RIBBON.SMOKE, life: 0.5, spacing: 0.2 }); },
    frame(r, p) { this.pushRibbon(r.d.ink, p.pos, false); this.pushRibbon(r.d.smoke, p.pos, false); },
    impact(r) { this.inkBlast(r.last, r.color, 4.5, { streaks: 16, chunks: 12, mist: 5, native: false }); },
  },
  trizooka: {
    start(r, p) {
      // remote volleys arrive as replicated rounds: the first round of a volley carries the muzzle burst
      if (p.owner?.remote && (p.s3VolleyIndex || 0) === 0 && p.owner.alive) trizookaMuzzle(this, p.owner, r.color);
      r.d.ink = this.ribbon(false, { width: 0.55, widthTail: 0.12, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.2, spacing: 0.12 });
      r.d.glow = this.ribbon(true, { width: 0.22, widthTail: 0.04, color: this.hdr(r.color, 1.2, 0.8), alpha: 0.6, style: RIBBON.GLOW, life: 0.08, spacing: 0.12 }); },
    frame(r, p) { this.pushRibbon(r.d.ink, p.pos, false); this.pushRibbon(r.d.glow, p.pos, true); },
    impact(r) { this.inkBlast(r.last, r.color, 3.4, { streaks: 18, chunks: 12, mist: 5, native: false }); },
  },
  inkVac: {
    start(r, p) { r.d.R = Number.isFinite(p.radius) && p.radius > 1 ? p.radius : 6;   // the charge-scaled 6..11 blast radius (kit-ink-vac descriptor)
      r.d.glow = this.ribbon(true, { width: 0.4, widthTail: 0.08, color: this.hdr(r.color, 1.2, 0.6), alpha: 0.5, style: RIBBON.GLOW, life: 0.15, spacing: 0.15 });
      r.d.ink = this.ribbon(false, { width: 1.0, widthTail: 0.2, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.28, spacing: 0.15 }); },
    frame(r, p) { this.pushRibbon(r.d.glow, p.pos, true); this.pushRibbon(r.d.ink, p.pos, false);
      if (vfxRandom() < 0.7) this.drop(p.pos, rnd(3, -3), rnd(3, -3), rnd(3, -3), 0.5, 0.12, r.color, { grav: 10 }); },
    impact(r) {   // S3 (53.4s, read as the burst): a big see-through dome of the team colour over the whole blast radius
      const R = r.d.R || 6, c = r.color;
      this.inkBlast(r.last, c, Math.min(R, 7), { streaks: 30, chunks: 18 });
      this.shell(true, 0.7, SHELL.ORB, r.last, 0.8, R, this.hdr(c, 1.1, 0.8), 0.3, { hemi: true, sy: 0.85, hold: 0.55 });
      this.shell(true, 0.7, SHELL.SHOCK, r.last, 0.8, R * 1.02, this.hdr(c, 1.5, 1.2), 0.6, { hemi: true, sy: 0.85, hold: 0.6 });
      this.disc(false, 1.2, DISC.SPLAT, this.v[0].copy(r.last).setY(r.last.y + 0.03), this.up, 1, R * 0.9, c, 1, { hold: 0.6 });
    },
  },
};

// =================================================================================================
// Deployed objects (world records of all-specials; local and replayed)
// =================================================================================================
const OBJECT_FX = {
  marker: { // Triple Inkstrike beacon in flight → landing marker, then the twister drops
    start(r, o) {
      r.d.trail = this.ribbon(true, { width: 0.18, widthTail: 0.04, color: this.hdr(r.color, 1.5, 0.8), alpha: 0.8, style: RIBBON.GLOW, life: 0.3, spacing: 0.12 });
      const tgt = o.target || o.pos;
      r.d.mark = this.disc(true, 0, DISC.TARGET, this.v[0].copy(tgt).setY(tgt.y + 0.05), this.up, 0.5, 0.5, this.hdr(r.color, 1.5, 0.7), 0.9,
        { fade: false, follow: (rec) => { const k = clamp01(r.age / ((o.flight || 82 / 60) * 0.6)); rec.v[3] = 1.2 + 6.5 * easeOut(k); rec.v[7] += 0.03; } });
    },
    frame(r, o) {
      this.pushRibbon(r.d.trail, o.pos, true);
      if (vfxRandom() < 0.25) this.spark(SPARK.STAR, o.pos, 0, 0, 0, 0.3, 0.14, 0.02, this.hdr(r.color, 1.5, 1.2), 1);
      const C = SPECIAL_VFX_CALIBRATION.inkstrike, flight = o.flight || 82 / 60, left = flight - r.age, tgt = o.target || o.pos;
      // the twister descends out of the sky over the last frames of the beacon's flight
      if (left < C.dropFrames / 60 && !r.d.funnel) {
        const top = tgt.y + 26;
        r.d.funnel = this.band(false, 0, BAND.TWISTER, this.v[0].set(tgt.x, top, tgt.z), 0.6, 0.6, 0.1, 0.1, this.hdr(r.color, 1.0), 0.95,
          { fade: false, taper: 3.2, twist: 3, speed: 1.4, follow: (rec) => { const k = clamp01(1 - ((o.flight || 82 / 60) - r.age) / (C.dropFrames / 60));
            rec.v[5] = Math.max(0.1, 26 * easeOut(k)); rec.v[1] = top - rec.v[5]; rec.v[4] = 0.9 + 1.2 * k; } });
      }
    },
    change(r, o) { if (r.d.trail) this.kit.glowRibbons.end(r.d.trail); },
    end() {},
  },
  strike: { // the tornado: 51F of spinning ink column, widening to 7.7
    start(r, o) {
      const C = SPECIAL_VFX_CALIBRATION.inkstrike, p = o.pos, c = r.color;
      if (r.d.funnel) r.d.funnel.dead = true;
      for (const k of ['mark']) if (r.d[k]) r.d[k].dead = true;
      this.flash(this.v[0].copy(p).setY(p.y + 1), c, 2.2, 0.3);
      const life = (o.dur || 51 / 60) + 0.5;
      const radius = () => Math.max(0.5, (o.currentRadius || 0.5));
      r.d.twA = this.band(false, life, BAND.TWISTER, p, 1, 1, C.twisterHeight, C.twisterHeight, this.hdr(c, 1.0), 0.95,
        { taper: 2.4, twist: 4, speed: 1.6, hold: 0.8, follow: (rec) => { rec.v[0] = o.pos.x; rec.v[2] = o.pos.z; rec.v[4] = radius() * 0.42; rec.v[3] += 0.22; } });
      // wind streaks wrapped round the ink column (pale air, not light)
      r.d.twB = this.band(false, life, BAND.SWIRL, p, 1, 1, C.twisterHeight * 0.8, C.twisterHeight * 0.8, [0.92, 0.95, 0.97], 0.3,
        { taper: 2.8, twist: -3, speed: 3, hold: 0.8, follow: (rec) => { rec.v[0] = o.pos.x; rec.v[2] = o.pos.z; rec.v[4] = radius() * 0.55; rec.v[3] -= 0.15; } });
      r.d.twC = this.band(false, life, BAND.TWISTER, p, 1, 1, 3, 3, this.hdr(c, 0.9), 0.9,
        { taper: 0.7, twist: 2, speed: 2.4, hold: 0.8, follow: (rec) => { rec.v[0] = o.pos.x; rec.v[2] = o.pos.z; rec.v[4] = radius() * 0.95; rec.v[3] += 0.3; } });
    },
    frame(r, o, dt) {
      const R = Math.max(0.5, o.currentRadius || 0.5), p = o.pos, c = r.color;
      r.acc = (r.acc || 0) + dt;
      while (r.acc > 0.03) {
        r.acc -= 0.03;
        const th = rnd(TAU), rr = R * rnd(1, 0.6);
        this.v[0].set(p.x + Math.cos(th) * rr, p.y + rnd(1.2, 0.1), p.z + Math.sin(th) * rr);
        // spray thrown off tangentially at the base
        this.drop(this.v[0], -Math.sin(th) * 9, rnd(5, 1), Math.cos(th) * 9, 0.5, 0.1, c, { grav: 12, drag: 0.6 });
        this.puff(PUFF.CHUNK, this.v[0], -Math.sin(th) * 6, rnd(8, 3), Math.cos(th) * 6, 0.6, 0.16, 0.05, c, 1, { grav: 16, drag: 0.6 });
        this.puff(PUFF.MIST, this.v[0], -Math.sin(th) * 3, rnd(3, 1), Math.cos(th) * 3, 0.7, 0.7, 1.6, this.hdr(c, 0.95), 0.4, { drag: 2, buoy: 1 });
      }
    },
    end(r, o) { const p = o.pos; this.smoke(this.v[0].copy(p).setY(p.y + 2), 6, this.hdr(r.color, 0.95), { kind: PUFF.MIST, size: 1.4, speed: 2, rise: 3, life: 1.1, alpha: 0.45 }); },
  },
  decoy: { // Super Chump balloon: confetti launch, landing marks, bob, pop
    start(r, o) {
      r.d.trail = this.ribbon(false, { width: 0.22, widthTail: 0.05, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.3, spacing: 0.15 });
      if (o.target && o.phase === 'flight') r.d.mark = this.disc(true, (o.flight || 1.8) + 0.1, DISC.TARGET, this.v[0].copy(o.target).setY(o.target.y + 0.05), this.up, 0.4, 1.3, this.hdr(r.color, 1.3, 0.5), 0.6, { hold: 0.9, spin: 2 });
    },
    frame(r, o) {
      if (o.phase === 'flight') { this.pushRibbon(r.d.trail, o.pos, false); if (vfxRandom() < 0.2) this.spark(SPARK.STAR, o.pos, 0, -1, 0, 0.3, 0.12, 0.02, this.hdr(r.color, 1.4, 1.2), 1); }
      else if (!r.landed) { r.landed = true; this.kit.ribbons.end(r.d.trail); this.disc(false, 0.6, DISC.SPLAT, this.v[0].copy(o.pos).setY(o.pos.y + 0.03), this.up, 0.3, 1.4, r.color, 0.9); this.nativeBurst(o.pos, this.up, this.c.setRGB(...r.color), { count: 8, speed: 4, size: 0.08, paint: false }); }
      // the last second before the pop: a quickening flash
      const left = (o.dur || 5.3) - o.age;
      if (left < 1) { r.blink = (r.blink || 0) + 1; if (r.blink % Math.max(2, Math.round(left * 12)) === 0) this.spark(SPARK.GLOW, this.v[0].copy(o.pos).setY(o.pos.y + 0.8), 0, 0, 0, 0.12, 0.9, 1.2, this.hdr(r.color, 1.6, 1.2), 0.8); }
    },
    end(r, o) {
      if (o.age < (o.dur || 5.3) - 0.05) return;   // removed early (destroyed) → native burst already shown
      const p = this.v[1].copy(o.pos); const R = o.maxRadius || 6;
      this.inkBlast(p, r.color, R * 0.75, { streaks: 18, chunks: 10, mist: 4, native: false, dome: 0.4 });
      // confetti: white and team stars
      for (let i = 0; i < Math.round(16 * this.kit.q); i++) this.spark(SPARK.STAR, this.v[2].copy(p).setY(p.y + 0.8), rnd(6, -6), rnd(9, 3), rnd(6, -6), rnd(0.9, 0.5), 0.2, 0.05, i % 3 ? this.hdr(r.color, 1.6, 1.2) : [3, 3, 3], 1, { grav: 9, drag: 1.2, spin: rnd(8, -8) });
    },
  },
  screen: { // Splattercolor Screen: unfurl, marbled flow, drips, fold back into the jar
    start(r, o) { this.nativeBurst(o.pos, this.up, this.c.setRGB(...r.color), { count: 14, speed: 6, size: 0.1, paint: false }); this.flash(this.v[0].copy(o.pos).setY(o.pos.y + 0.6), r.color, 1, 0.25); },
    frame(r, o, dt) {
      const w = o.width || 15, h = o.height || 9, k = smooth(o.age / 1), close = smooth((o.age - (o.dur - 1)) / 1), grown = k * (1 - close);
      if (grown <= 0.02 || !this.near(o.pos, 70)) return;
      r.acc = (r.acc || 0) + dt;
      while (r.acc > 0.045) {
        r.acc -= 0.045;
        const u = rnd(0.5, -0.5) * w, t = o.tangent || this.v[2].set(1, 0, 0);
        this.v[0].copy(o.pos).addScaledVector(t, u); this.v[0].y += h * grown * rnd(1, 0.85);
        this.puff(PUFF.CHUNK, this.v[0], 0, -rnd(2, 0.5), 0, 0.8, 0.13, 0.05, r.color, 1, { grav: 12, drag: 0.4 });   // drips off the leading edge
        this.v[0].y = o.pos.y + 0.15;
        this.puff(PUFF.MIST, this.v[0], (o.normal?.x || 0) * 1.5, 0.6, (o.normal?.z || 0) * 1.5, 0.9, 0.7, 1.4, this.hdr(r.color, 0.9), 0.35, { buoy: 0.4 });
      }
    },
    end(r, o) { this.smoke(this.v[0].copy(o.pos).setY(o.pos.y + 0.8), 8, this.hdr(r.color, 0.9), { kind: PUFF.MIST, size: 1.1, speed: 3, life: 0.9, alpha: 0.5 }); },
  },
  wave: { // Wave Breaker device: hologram cone while armed, pulse flashes
    start(r, o) {
      const c = r.color, p = o.pos;
      this.flash(this.v[0].copy(p).setY(p.y + 0.6), c, 1.2, 0.25);
      r.d.holo = this.shell(true, 0, SHELL.HOLO, this.v[0].copy(p), 1.1, 1.1, this.hdr(c, 1.3, 0.5), 0.75,
        { hemi: true, sy: 1.5, fade: false, follow: (rec) => { rec.v[0] = o.pos.x; rec.v[1] = o.pos.y; rec.v[2] = o.pos.z; const hp = o.maxHp ? clamp01(o.hp / o.maxHp) : 1; rec.v[11] = 0.45 + 0.35 * hp; } });
      r.d.dots = this.disc(true, 0, DISC.TARGET, this.v[0].copy(p).setY(p.y + 0.04), this.up, 2.2, 2.2, this.hdr(c, 1.2, 0.5), 0.55,
        { fade: false, follow: (rec) => { rec.v[0] = o.pos.x; rec.v[2] = o.pos.z; rec.v[7] += 0.01; } });
    },
    frame(r, o) {
      const pulse = o.pulse || 0;
      if (pulse !== r.pulse) { r.pulse = pulse; if (pulse > 0) { const p = o.pos; this.flash(this.v[0].copy(p).setY(p.y + 0.9), r.color, 1.4, 0.2); this.stars(p, 6, 0.8, this.hdr(r.color, 1.8, 1.2), { h: 1.6, h0: 0.5 }); } }
      // marking lines from the device to marked enemies (only for the viewer's team, as the HUD does)
      this.markingLines(r, o);
    },
    end(r, o) { this.inkBlast(o.pos, r.color, 1.6, { streaks: 10, chunks: 6, mist: 3, native: false }); this.clearLines(r); },
  },
  waveFront: { // one emitted wave: a jumpable glowing wall racing out to the AP radius
    start(r, o) {
      const c = r.color, H = SPECIAL_VFX_CALIBRATION.waveBreaker.wallHeight;
      const R = () => (o.maxRadius || 20) * clamp01(o.age / Math.max(1 / 60, o.maxWaveFrame || 160 / 60));
      r.d.wall = this.band(true, 0, BAND.WAVE, o.pos, 0.1, 0.1, H, H, this.hdr(c, 2.0, 0.5), 1, { fade: false, speed: 2,
        follow: (rec) => { const k = clamp01(o.age / Math.max(1 / 60, o.maxWaveFrame || 160 / 60)); rec.v[4] = Math.max(0.1, R()); rec.v[11] = 1 - smooth((k - 0.8) / 0.2); } });
      r.d.tint = this.band(false, 0, BAND.WAVE, o.pos, 0.1, 0.1, H, H, this.hdr(c, 0.95), 0.32, { fade: false, speed: 2,
        follow: (rec) => { const k = clamp01(o.age / Math.max(1 / 60, o.maxWaveFrame || 160 / 60)); rec.v[4] = Math.max(0.1, R()); rec.v[11] = 0.5 * (1 - smooth((k - 0.8) / 0.2)); } });
      r.d.ring = this.disc(true, 0, DISC.SHOCK, this.v[0].copy(o.pos).setY(o.pos.y + 0.05), this.up, 0.1, 0.1, this.hdr(c, 1.3, 0.5), 0.6, { fade: false,
        follow: (rec) => { const k = clamp01(o.age / Math.max(1 / 60, o.maxWaveFrame || 160 / 60)); rec.v[3] = Math.max(0.1, R() * 1.02); rec.v[13] = 0.35; rec.v[11] = 0.6 * (1 - k); } });
    },
    frame() {},
    end() {},
  },
  booyahBlast: { // 40F of the ball sitting and swelling, then a 40F energy dome to 12.6
    start(r, o) {
      const c = r.color, p = o.pos;
      r.d.orb = this.shell(true, 0, SHELL.ORB, this.v[0].copy(p).setY(p.y + 1), 1, 1, this.hdr(c, 0.6, 6), 1, { fade: false,
        follow: (rec) => { const f = (o.frameCount || 0); const k = clamp01(f / 40); rec.v[4] = rec.v[5] = rec.v[6] = 0.9 + 0.7 * k + 0.12 * Math.sin(this.time * (14 + 30 * k)); rec.v[11] = f >= 40 ? 0 : 1; } });
      r.d.warn = this.disc(true, 0, DISC.RUNE, this.v[0].copy(p).setY(p.y + 0.05), this.up, 1, 1, this.hdr(c, 1.3, 0.6), 0.8, { fade: false,
        follow: (rec) => { const f = (o.frameCount || 0); rec.v[3] = (o.maxRadius || 12.6) * smooth(f / 20); rec.v[7] += 0.02; rec.v[11] = f >= 40 ? 0 : 0.8; } });
    },
    frame(r, o) {
      const f = o.frameCount || 0, p = o.pos, c = r.color, R = o.maxRadius || 12.6;
      if (f < 40) {
        if (vfxRandom() < 0.8) { // energy drawn into the ball
          const th = rnd(TAU), el = rnd(1.2, -0.3), d = rnd(4, 2.5);
          this.v[0].set(p.x + Math.cos(th) * Math.cos(el) * d, p.y + 1 + Math.sin(el) * d, p.z + Math.sin(th) * Math.cos(el) * d);
          this.spark(SPARK.STREAK, this.v[0], (p.x - this.v[0].x) * 3.2, (p.y + 1 - this.v[0].y) * 3.2, (p.z - this.v[0].z) * 3.2, 0.3, 0.06, 0.02, this.hdr(c, 2.2, 1.4), 1, { drag: 0, stretch: 0.07 });
        }
      } else if (!r.blasted) {
        r.blasted = true;
        const k0 = p.clone();
        this.flash(this.v[0].copy(k0).setY(k0.y + 1.2), c, 4, 0.35);
        const life = SPECIAL_VFX_CALIBRATION.booyah.blastSeconds + 0.35;
        // a glossy ink dome swelling to the blast radius, with a thin luminous skin over it
        this.shell(false, life + 0.2, SHELL.INK, k0, 0.8, R * 0.97, c, 1, { hemi: true, sy: 0.9, hold: 0.55, ease: t => smooth(t * 1.4) });
        this.shell(true, life, SHELL.ORB, k0, 1, R, this.hdr(c, 1.1, 0.8), 0.35, { hemi: true, sy: 0.9, hold: 0.7, ease: t => smooth(t * 1.4) });
        this.shell(true, life, SHELL.SHOCK, k0, 1, R * 1.03, this.hdr(c, 1.5, 1.2), 0.6, { hemi: true, sy: 0.9, hold: 0.75, ease: t => smooth(t * 1.4) });
        this.disc(false, life + 0.5, DISC.SPLAT, this.v[0].copy(k0).setY(k0.y + 0.03), this.up, 1, R * 0.95, c, 1, { hold: 0.6, ease: t => smooth(t * 1.4) });
        this.streaks(this.v[0].copy(k0).setY(k0.y + 1), 46, 26, c, { up: 0.4, life: 0.9, size: 0.09, drag: 1.5 });
        this.chunks(this.v[0].copy(k0).setY(k0.y + 0.5), 30, 20, c, { size: 0.3 });
        this.petals(this.v[0].copy(k0).setY(k0.y + 1), 40, 18, c, { size: 0.34 });
      } else if (this.near(p, 80) && vfxRandom() < 0.9) {
        const k = clamp01((f - 40) / 40), th = rnd(TAU), rr = R * smooth(k * 1.4);
        this.v[0].set(p.x + Math.cos(th) * rr, p.y + rnd(1.5, 0.2), p.z + Math.sin(th) * rr);
        this.drop(this.v[0], Math.cos(th) * 5, rnd(6, 2), Math.sin(th) * 5, 0.7, 0.16, c);
      }
    },
    end() {},
  },
};

// =================================================================================================
// Kit specials with their own world records
// =================================================================================================
const KIT_FX = {
  bubbler: {
    start(r, d) {
      const c = r.color, p = d.pos;
      // S3 footage (2.0-5.9s): a thin bright beam stands up from the launcher for as long as the field lasts,
      // and the field ripples out once
      r.d.pillar = this.beam(true, 0, BEAM.LINE, p, this.v[0].copy(p).setY(p.y + 30), 0.07, 0.05, this.hdr(c, 1.6, 2.2), 1, { speed: 0, seed: 0.1,
        follow: (rec) => { if (r.gone) return false; const q = d.pos; rec.v[0] = q.x; rec.v[1] = q.y + 0.5; rec.v[2] = q.z; rec.v[4] = q.x; rec.v[5] = q.y + 30; rec.v[6] = q.z;
          rec.v[11] = 0.75 + 0.25 * Math.sin(this.time * 9); } });
      r.d.halo = this.beam(true, 0, BEAM.LINE, p, this.v[0].copy(p).setY(p.y + 30), 0.25, 0.2, this.hdr(c, 1.0, 0.6), 0.25, { speed: 0, seed: 0.1,
        follow: (rec) => { if (r.gone) return false; const q = d.pos; rec.v[0] = q.x; rec.v[1] = q.y + 0.5; rec.v[2] = q.z; rec.v[4] = q.x; rec.v[5] = q.y + 30; rec.v[6] = q.z; } });
      this.flash(this.v[0].copy(p).setY(p.y + 0.6), c, 1.0, 0.25);
      this.shell(true, 0.8, SHELL.SHOCK, p, 0.5, 6, this.hdr(c, 1.3, 0.6), 0.5, { hemi: true });
      this.disc(false, 0.9, DISC.SPLAT, this.v[0].copy(p).setY(p.y + 0.03), this.up, 0.3, 1.8, c, 1);
      this.streaks(this.v[0].copy(p).setY(p.y + 0.4), 22, 12, c, { up: 0.7, life: 0.6 });
    },
    frame(r, d, dt) {
      const hp = d.hpMax ? d.hp / d.hpMax : 1;
      if (r.hp !== undefined && hp < r.hp - 0.004) { // hit: shimmer pulse
        this.shell(true, 0.25, SHELL.SHOCK, d.pos, (d.radius || 4) * 0.98, (d.radius || 4) * 1.02, this.hdr(r.color, 1.6, 0.9), 0.8, { hemi: true });
      }
      r.hp = hp;
      r.acc = (r.acc || 0) + dt;
      if (this.near(d.pos, 60) && r.acc > 0.12) { r.acc = 0; const th = rnd(TAU), el = rnd(1.4, 0.1), R = d.radius || 4;
        this.v[0].set(d.pos.x + Math.cos(th) * Math.cos(el) * R, d.pos.y + Math.sin(el) * R, d.pos.z + Math.sin(th) * Math.cos(el) * R);
        this.spark(SPARK.STAR, this.v[0], 0, 0.3, 0, 0.5, 0.2, 0.02, this.hdr(r.color, 1.6, 1.2), 0.8); }
    },
    end(r, d) {
      r.gone = true;
      const R = d.radius || 4, c = r.color;
      this.shell(true, 0.4, SHELL.SHOCK, d.pos, R, R * 1.15, this.hdr(c, 2, 1.2), 1, { hemi: true });
      for (let i = 0; i < Math.round(40 * this.kit.q); i++) { const th = rnd(TAU), el = rnd(1.4, 0.05);
        this.v[0].set(d.pos.x + Math.cos(th) * Math.cos(el) * R, d.pos.y + Math.sin(el) * R, d.pos.z + Math.sin(th) * Math.cos(el) * R);
        this.spark(SPARK.STAR, this.v[0], Math.cos(th) * 2, rnd(2, -3), Math.sin(th) * 2, rnd(0.9, 0.4), 0.22, 0.03, this.hdr(c, 1.8, 1.3), 1, { grav: 3 }); }
    },
  },
  cooler: {
    start(r, c) { const p = c.pos || c.mesh?.position; if (!p) return; this.flash(this.v[0].copy(p).setY(p.y + 0.6), r.color, 0.9, 0.2); this.stars(p, 8, 0.6, this.hdr(r.color, 1.6, 1.4), { h: 1.2, h0: 0.3 });
      this.inkBlast(this.v[1].copy(p), r.color, 3, { streaks: 22, chunks: 14, mist: 3, dome: 0.32 }); },   // S3 (156.1s): the stand lands in a big splash
    frame(r, c, dt) {
      const p = c.pos || c.mesh?.position; if (!p || !this.near(p, 40)) return;
      r.acc = (r.acc || 0) + dt;
      if (r.acc > 0.18) { r.acc = 0; this.v[0].set(p.x + rnd(0.3, -0.3), p.y + rnd(1, 0.2), p.z + rnd(0.3, -0.3));
        this.puff(PUFF.MIST, this.v[0], 0, -0.25, 0, 1.4, 0.25, 0.7, [0.85, 0.95, 1.0], 0.25, { buoy: -0.2 });        // cold mist
        this.spark(SPARK.STAR, this.v[0], 0, 0.5, 0, 0.6, 0.14, 0.02, this.hdr(r.color, 1.5, 1.2), 0.9); }
    },
    end() {},
  },
  fist: { // Triple Splashdown fists: the existing ink-fist model replaces the box stand-in, with a glow trail and the slam
    start(r, f) {
      r.d.trail = this.ribbon(false, { width: 0.9, widthTail: 0.15, color: r.color, alpha: 1, style: RIBBON.INK, life: 0.3, spacing: 0.15 });
      try {
        r.model = createInkFist(this.c.setRGB(...r.color).getHex(), this.THREE);
        r.model.name = 'splashdown-fist-model';
        (this.G.scene || this.fx.root)?.add?.(r.model);
      } catch { r.model = null; }
      r.side = (f.index ?? 0) ? 1 : -1;
      const o = f.origin || f.start || f.pos, tg = f.target || f.pos;
      r.yaw = Math.atan2(tg.x - o.x, tg.z - o.z);
    },
    frame(r, f, dt) {
      this.pushRibbon(r.d.trail, f.pos, false);
      if (vfxRandom() < 0.4) this.drop(this.v[0].copy(f.pos).add(this.v[1].set(rnd(0.6, -0.6), rnd(0.3, -0.6), rnd(0.6, -0.6))), rnd(1, -1), -rnd(2, 0.5), rnd(1, -1), 0.6, 0.14, r.color);
      if (vfxRandom() < 0.2) this.spark(SPARK.STAR, this.v[0].copy(f.pos).add(this.v[1].set(rnd(0.6, -0.6), rnd(0.6, -0.6), rnd(0.6, -0.6))), 0, 0, 0, 0.3, 0.18, 0.02, this.hdr(r.color, 1.5, 1.2), 1);
      if (!r.marked && f.target) { r.marked = true; r.d.mark = this.disc(true, 1.4, DISC.TARGET, this.v[0].copy(f.target).setY(f.target.y + 0.05), this.up, 1, 5.5, this.hdr(r.color, 1.2, 0.1), 0.4, { hold: 0.85 }); }
      if (r.model) {
        if (f.mesh) f.mesh.visible = false;
        const elapsed = (f.age || 0) - 0.25, fall = smooth((elapsed - 0.75) / 0.3);
        r.model.position.copy(f.pos);
        // rising knuckles-forward with a slow roll, turning knuckles-down for the drop
        r.model.rotation.set(-0.25 - (Math.PI / 2 - 0.25) * fall, r.yaw, r.side * (0.1 + 0.25 * Math.sin(Math.max(0, elapsed) * 5) * (1 - fall)), 'YXZ');
        const pop = smooth((f.age || 0) / 0.18);
        r.model.scale.set((r.side < 0 ? 1.1 : -1.1) * pop, 1.1 * pop, 1.1 * pop);
        const u = r.model.userData.energy?.material?.uniforms; if (u?.age) u.age.value = this.time;
      }
    },
    end(r, f) {
      this.kit.ribbons.end(r.d.trail);
      if (r.model) { disposeSpecialModel(r.model); r.model = null; }
      if (f.dead && f.hp <= 0) { this.streaks(f.pos, 18, 10, r.color); this.chunks(f.pos, 14, 7, r.color, { size: 0.22 }); return; }
      this.inkBlast(f.target || f.pos, r.color, 6.4, { streaks: 24, chunks: 14, native: false });
    },
  },
  cloud: { // Ink Storm cloud: a forming puff burst, then visible rain streaks, ink drips off the belly, splash rings below
    start(r, c) { const p = c.group?.position || c.pos; if (!p) return; this.smoke(p, 12, this.hdr(r.color, 0.7), { kind: PUFF.SMOKE, size: 1.4, speed: 3, rise: 0.4, buoy: 0, life: 1.2, alpha: 0.6 }); this.flash(p, r.color, 1.4, 0.3); },
    frame(r, c, dt) {
      const p = c.group?.position || c.pos; if (!p || !this.near(p, 70)) return;
      const grow = clamp01((c.t || 0) / 0.5) * clamp01(((c.dur || 6) - (c.t || 0)) / 0.6), R = 3.4 * grow, ground = finite(c.groundY) ? c.groundY : groundBelowPoint(this, p, p.y - 8);
      r.acc = (r.acc || 0) + dt; r.drip = (r.drip || 0) + dt;
      while (r.acc > 0.02) { r.acc -= 0.02;
        const th = rnd(TAU), rr = R * Math.sqrt(vfxRandom());
        this.v[0].set(p.x + Math.cos(th) * rr, p.y - 0.5, p.z + Math.sin(th) * rr);
        // rain: thin liquid ink drops pulled long by their fall
        this.puff(PUFF.CHUNK, this.v[0], 0, -18, 0, Math.max(0.1, (p.y - 0.5 - ground) / 18), 0.035, 0.03, r.color, 1, { drag: 0, grav: 0, stretch: 0.05, fadeIn: 0.01 });
      }
      while (r.drip > 0.09) { r.drip -= 0.09;
        const th = rnd(TAU), rr = R * 0.9 * Math.sqrt(vfxRandom());
        this.v[0].set(p.x + Math.cos(th) * rr, p.y - 0.45, p.z + Math.sin(th) * rr);
        this.puff(PUFF.CHUNK, this.v[0], 0, -2, 0, 0.9, 0.11, 0.06, r.color, 1, { grav: 16, drag: 0 });
        this.v[0].y = ground + 0.04;
        this.disc(false, 0.35, DISC.SHOCK, this.v[0], this.up, 0.05, 0.45, r.color, 1);
      }
    },
    end(r, c) { const p = c.group?.position || c.pos; if (p) this.smoke(p, 8, this.hdr(r.color, 0.7), { kind: PUFF.SMOKE, size: 1.2, speed: 2, rise: 0.8, life: 1, alpha: 0.4 }); },
  },
};

// =================================================================================================
// Actor-attached specials: start / phase / frame / event / end
// =================================================================================================
const DIRECTORS = {
  // ---------------------------------------------------------------- Killer Wail 5.1
  killerWail: {
    start(a, t) { this.activation(a, t.color, 1); t.d.speakers = []; },
    frame(a, t, dt) {
      const st = a._s3AllSpecialState, c = t.color;
      // charging mouths: white rings in front of each speaker while the first lock charges (36F)
      const charging = (this.time - t.start) < 0.6;
      const anchors = speakerAnchors(this, a);
      if (charging && anchors.length) {
        const k = (this.time - t.start) / 0.6;
        for (const p of anchors) if (vfxRandom() < 0.5) {
          this.spark(SPARK.STREAK, this.v[0].copy(p).add(this.v[1].set(rnd(1.4, -1.4), rnd(1.4, -1.4), rnd(1.4, -1.4))), (p.x - this.v[0].x) * 5, (p.y - this.v[0].y) * 5, (p.z - this.v[0].z) * 5, 0.18, 0.05, 0.02, this.hdr(c, 2, 1.4), 1, { drag: 0, stretch: 0.05 });
        }
        if (!t.d.mouths) {
          t.d.mouths = anchors.map((p, i) => this.disc(true, 0, DISC.SPEAKER, p, this.v[2].set(0, 0, 1), 0.1, 0.1, this.hdr(c, 1.4, 2.4), 1, { fade: false,
            follow: (rec) => { const q = speakerAnchors(this, a)[i]; if (!q || !this.tracks.has(a)) return false; const f = this.aim(a, this.v[3]);
              rec.v[0] = q.x + f.x * 0.25; rec.v[1] = q.y + f.y * 0.25; rec.v[2] = q.z + f.z * 0.25; rec.v[4] = f.x; rec.v[5] = f.y; rec.v[6] = f.z;
              const age = this.time - t.start, firing = (this.G.time || 0) - (a._s3SpecialMarks?.laser ?? -9) < 0.12;
              rec.v[3] = age < 0.6 ? 0.2 + 0.75 * easeOut(age / 0.6) : firing ? 0.62 + 0.08 * Math.sin(this.time * 60) : 0.45;
              rec.v[11] = age < 0.6 ? 1 : firing ? 1 : 0.55; } }));
        }
        void k;
      }
      // live beams from the authoritative lasers
      for (const [key, L] of this.lasers) {
        if (L.actor !== a) continue;
        if (this.time - L.seen > SPECIAL_VFX_CALIBRATION.killerWail.beamHold) { L.outer.dead = L.core.dead = L.halo.dead = true; this.lasers.delete(key); continue; }
        const from = L.from, to = L.to;
        L.drawTo.lerp(to, 1 - Math.exp(-dt * 30));
        this.setBeam(L.outer, from, L.drawTo); this.setBeam(L.core, from, L.drawTo); this.setBeam(L.halo, from, L.drawTo);
        if (vfxRandom() < 0.6) { // impact crackle
          this.drop(L.drawTo, rnd(6, -6), rnd(7, 1), rnd(6, -6), 0.45, 0.1, c, { grav: 12 });   // the beam splashes ink where it lands
          if (vfxRandom() < 0.3) this.spark(SPARK.GLOW, L.drawTo, 0, 0, 0, 0.1, 0.6, 1.0, this.hdr(c, 1.3, 1), 0.6);
        }
        if (vfxRandom() < 0.35) { // sparks running along the beam
          const k = vfxRandom(); this.v[0].copy(from).lerp(L.drawTo, k);
          this.spark(SPARK.STAR, this.v[0], rnd(1, -1), rnd(1, -1), rnd(1, -1), 0.25, 0.25, 0.03, this.hdr(c, 1.8, 1.6), 1);
        }
      }
      void st;
    },
    event(a, e, pos, target) {
      const C = SPECIAL_VFX_CALIBRATION.killerWail, c = this.rgb(a);
      if (e.action === 'target' && target) {
        this.disc(true, 0.6, DISC.RETICLE, this.v[0].copy(target).setY(target.y + 1), this.v[1].copy(this.camPos).sub(target).normalize(), 1.6, 0.9, this.hdr(c, 1.6, 1), 1, { spin: 4 });
      } else if (e.action === 'laser' && pos && target) {
        const key = `${a.nid ?? 'l'}:${e.activation}:${e.index ?? 0}`;
        let L = this.lasers.get(key);
        const end = target.clone(), len = end.distanceTo(pos);
        if (len > C.maxLength) end.sub(pos).multiplyScalar(C.maxLength / len).add(pos);
        // visual origin: the speaker mouth nearest the gameplay origin
        const anchors = speakerAnchors(this, a); let from = pos.clone();
        if (anchors.length) from = anchors[(e.index ?? 0) % anchors.length].clone();
        if (!L) {
          L = { actor: a, from, to: end, drawTo: from.clone().lerp(end, 0.2), seen: this.time };
          // S3: a thick team-colour tube wound with brighter spiral bands, a hot core and a soft halo
          L.outer = this.beam(false, 0, BEAM.LASER, from, end, C.beamRadius * 0.85, C.beamRadius * 1.2, c, 1, { speed: 9 });
          L.halo = this.beam(true, 0, BEAM.LINE, from, end, C.beamRadius * 1.4, C.beamRadius * 1.9, this.hdr(c, 0.8, 0.1), 0.18, { speed: 0, seed: 0.1 });
          L.core = this.beam(true, 0, BEAM.LINE, from, end, C.coreRadius * 0.7, C.coreRadius, this.hdr(c, 1.2, 0.6), 0.5, { speed: 0, seed: 0.1 });
          this.lasers.set(key, L);
          this.muzzle(from, this.v[0].copy(end).sub(from).normalize(), c, 1.4);
        }
        L.from.copy(from); L.to.copy(end); L.seen = this.time;
      }
    },
    end(a, t) { for (const r of t.d.mouths || []) r.dead = true; for (const [k, L] of this.lasers) if (L.actor === a) { L.outer.dead = L.core.dead = L.halo.dead = true; this.lasers.delete(k); } },
  },
  // ---------------------------------------------------------------- Tenta Missiles
  tentaMissiles: {
    start(a, t) { this.activation(a, t.color, 1); },
    frame(a, t) {
      // S3 footage (173.9s): a large lock circle in the middle of the screen and a bracket on every opponent inside
      // it. The circle uses the gameplay lock test (selectTargets in all-specials: the projected chest within
      // TargetInCircleRadius 140/190/240 by Special Power Up, over 360 of the half screen height) read through
      // tentaMissilesLockPreview, so the brackets are exactly the opponents the salvo would lock. Local caster only;
      // hidden once the salvo launches.
      const pv = a.isLocal && a.alive && t.phase !== 'launching' ? tentaMissilesLockPreview(this.api, a) : null;
      const show = !!pv, cam = this.G.camera, limit = pv?.limit || 0, inside = [];
      if (pv && cam?.isPerspectiveCamera) for (const e of pv.targets) {
        const q = this.v[0].copy(e.pos); q.y += 0.7; q.project(cam);
        inside.push([e, q.x, q.y]);
      }
      if (this.tentaHud(t, show, limit, inside)) return;
      // no HUD layer (headless/tests): fall back to world-space reticles over the same opponents
      const locks = t.d.locks ||= new Map(), live = new Set();
      for (const [e] of inside) {
        live.add(e);
        if (!locks.has(e)) locks.set(e, this.disc(true, 0, DISC.RETICLE, e.pos, this.up, 2.2, 1.0, this.hdr(t.color, 1.5, 1.2), 1, { fade: false, spin: 2,
          follow: (rec) => { rec.v[0] = e.pos.x; rec.v[1] = e.pos.y + 0.9; rec.v[2] = e.pos.z; const n = this.v[1].copy(this.camPos).sub(e.pos).normalize(); rec.v[4] = n.x; rec.v[5] = n.y; rec.v[6] = n.z; rec.v[3] = Math.max(0.85, 2.2 - rec.t * 4.8); } }));
      }
      for (const [e, r] of locks) if (!live.has(e)) { r.dead = true; locks.delete(e); }
    },
    event(a, e, pos, target) {
      const c = this.rgb(a);
      if (e.action === 'target' && target) {
        this.disc(true, 2.6, DISC.TARGET, this.v[0].copy(target).setY(target.y + 0.05), this.up, 3, 2.2, this.hdr(c, 1.4, 0.6), 0.9, { hold: 0.8, spin: 3 });
      } else if (e.action === 'launch' && pos) {
        this.smoke(pos, 8, [0.92, 0.92, 0.95], { size: 0.5, speed: 2.5, life: 1.2, alpha: 0.55, rise: 2 });
      }
    },
    end(a, t) { for (const r of t.d.locks?.values() || []) r.dead = true; this.tentaHud(t, false); t.d.hud?.svg?.remove?.(); t.d.hud = null; },
  },
  // ---------------------------------------------------------------- Inkjet
  inkjet: {
    start(a, t) {
      this.activation(a, t.color, 1.1);
      const p = a.pos;   // the launch: a ground blast below the pack
      this.disc(false, 0.9, DISC.SPLAT, this.v[0].copy(p).setY(p.y + 0.03), this.up, 0.5, 2.6, t.color, 1);
      this.smoke(p, 10, this.hdr(t.color, 0.95), { kind: PUFF.MIST, size: 0.8, speed: 4, rise: 0.6, life: 0.9, alpha: 0.55 });
      t.d.jets = [0, 1].map(() => this.beam(false, 0, BEAM.JET, a.pos, a.pos, 0.12, 0.4, t.color, 1, { speed: 14 }));
      t.d.cones = [0, 1].map(() => this.beam(true, 0, BEAM.PILLAR, a.pos, a.pos, 0.08, 0.3, this.hdr(t.color, 1.2, 1.0), 0.3, { speed: 10 }));
      t.d.recs = [...t.d.jets, ...t.d.cones];
    },
    frame(a, t, dt) {
      const squid = a.form === 'squid' || a.intent?.squid;
      const c = t.color, f = this.forward(a, this.v[5]), side = this.v[6].set(f.z, 0, -f.x);
      const ground = groundBelow(this, a);
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const nozzle = this.v[0].set(a.pos.x - f.x * 0.32 + side.x * s * 0.16, a.pos.y + 0.55, a.pos.z - f.z * 0.32 + side.z * s * 0.16);
        const len = squid ? 0 : clamp(nozzle.y - ground, 0.5, 1.5);   // S3: short jets under the pack, not columns to the floor
        const end = this.v[1].copy(nozzle).setY(nozzle.y - len);
        end.x -= f.x * 0.35; end.z -= f.z * 0.35;
        const flick = 0.9 + 0.1 * Math.sin(this.time * 47 + i * 2);
        this.setBeam(t.d.jets[i], nozzle, end, 0.11 * flick, 0.42 * flick, squid ? 0 : 1);
        this.setBeam(t.d.cones[i], nozzle, this.v[2].copy(nozzle).lerp(end, 0.2), 0.08, 0.16 * flick, squid ? 0 : 0.3);
        if (!squid) { this.spark(SPARK.GLOW, nozzle, 0, 0, 0, 0.05, 0.2, 0.15, this.hdr(c, 1.2, 0.6), 0.4);
          if (vfxRandom() < 0.6) { const k = vfxRandom(); this.v[2].copy(nozzle).lerp(end, k);
            this.puff(PUFF.CHUNK, this.v[2], rnd(1.2, -1.2), -rnd(9, 5), rnd(1.2, -1.2), 0.25, 0.07 + 0.08 * k, 0.04, c, 1, { grav: 10, drag: 0.5 }); } }
        if (!squid && vfxRandom() < 0.7) this.drop(nozzle, rnd(1, -1), -rnd(14, 8), rnd(1, -1), 0.25, 0.07, c, { drag: 1, grav: 10 });
        if (!squid && vfxRandom() < 0.8) this.drop(end, rnd(1, -1), -rnd(10, 6), rnd(1, -1), 0.6, rnd(0.12, 0.06), c, { grav: 14, drag: 0.2, stretch: 0.05 });   // ink raining off the jets
        if (!squid && nozzle.y - ground < 7 && vfxRandom() < 0.55) { // splash where the ink lands
          this.v[2].copy(end).setY(ground + 0.05);
          const th = rnd(TAU), sp = rnd(5, 2);
          this.puff(PUFF.CHUNK, this.v[2], Math.cos(th) * sp, rnd(4, 1.5), Math.sin(th) * sp, 0.5, 0.12, 0.04, c, 1, { grav: 15, drag: 0.6 });
          if (vfxRandom() < 0.3) this.puff(PUFF.MIST, this.v[2], Math.cos(th) * 1.5, 0.6, Math.sin(th) * 1.5, 0.6, 0.4, 1.1, this.hdr(c, 0.9), 0.4, { buoy: 0.3 });
        }
      }
      if (!squid) { t.acc = (t.acc || 0) + dt; if (t.acc > 0.12) { t.acc = 0; this.disc(false, 0.5, DISC.SPLAT, this.v[2].set(a.pos.x - f.x * 0.6, ground + 0.03, a.pos.z - f.z * 0.6), this.up, 0.4, 1.2, c, 0.5); } }
    },
    event(a, e, pos, target) {
      if (e.action === 'shot' && pos) { const dir = target ? this.v[3].copy(target).sub(pos).normalize() : this.aim(a, this.v[3]); this.muzzle(this.v[4].copy(pos).addScaledVector(dir, 0.6), dir, this.rgb(a), 1.2); }
      else if (e.action === 'return' && pos) { this.flash(this.v[0].copy(pos).setY(pos.y + 1), this.rgb(a), 1.2, 0.25); }
    },
  },
  // ---------------------------------------------------------------- Booyah Bomb
  booyahBomb: {
    start(a, t) { this.activation(a, t.color, 1); },
    frame(a, t, dt) {
      const st = a._s3AllSpecialState, c = t.color;
      const charge = st ? clamp01(st.charge || 0) : clamp01((this.time - t.start - 0.5) / 4);
      const ball = this.v[0].set(a.pos.x, a.pos.y + 1.95 + 0.3 * charge, a.pos.z);
      const R = 0.35 + 0.65 * charge;
      if (!t.d.orb) {
        t.d.orb = this.shell(true, 0, SHELL.ORB, ball, R, R, this.hdr(c, 0.6, 6), 1,   // S3 (13.8/15.8s): a white-hot ball in a team-coloured halo
          { fade: false, follow: (rec) => { const st2 = a._s3AllSpecialState; const k = st2 ? clamp01(st2.charge || 0) : charge;
          rec.v[0] = a.pos.x; rec.v[1] = a.pos.y + 1.95 + 0.3 * k; rec.v[2] = a.pos.z; const s = (0.42 + 0.8 * k) * (1 + 0.05 * Math.sin(this.time * (10 + 20 * k)));
          rec.v[4] = rec.v[5] = rec.v[6] = s; rec.v[7] += 0.05; } });
        t.d.halo = this.disc(true, 0, DISC.RUNE, ball, this.up, 1, 1, this.hdr(c, 1.5, 1.2), 0.8, { fade: false, spin: 2, follow: (rec) => { const st2 = a._s3AllSpecialState; const k = st2 ? clamp01(st2.charge || 0) : charge;
          rec.v[0] = a.pos.x; rec.v[1] = a.pos.y + 1.95 + 0.3 * k; rec.v[2] = a.pos.z; rec.v[3] = 0.9 + 1.3 * k; rec.v[11] = 0.4 + 0.5 * k; } });
        t.d.recs = [t.d.orb, t.d.halo];
      }
      // rays streaming into the ball; denser as the charge rises (S3: "Charge with Booyahs!")
      const rate = 6 + 26 * charge; t.acc = (t.acc || 0) + dt * rate;
      while (t.acc >= 1) { t.acc -= 1;
        const th = rnd(TAU), el = rnd(1.2, -0.6), d = rnd(3.6, 2.2);
        this.v[1].set(ball.x + Math.cos(th) * Math.cos(el) * d, ball.y + Math.sin(el) * d, ball.z + Math.sin(th) * Math.cos(el) * d);
        this.spark(SPARK.STREAK, this.v[1], (ball.x - this.v[1].x) * 3.4, (ball.y - this.v[1].y) * 3.4, (ball.z - this.v[1].z) * 3.4, 0.28, 0.08, 0.03, this.hdr(c, 2.3, 0.9), 1, { drag: 0, stretch: 0.13 });
      }
      // radiant spikes flickering round the ball, longer as it fills (S3: the Booyah charge sun)
      t.rayAcc = (t.rayAcc || 0) + dt * (10 + 30 * charge);
      while (t.rayAcc >= 1) { t.rayAcc -= 1; const th = rnd(TAU), el = rnd(1.3, -1.3);
        this.spark(SPARK.RAY, ball, Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el), rnd(0.18, 0.1), 0.06 + 0.05 * charge, 0.02, this.hdr(c, 2.3, 1.0), 1, { drag: 0, stretch: 0.9 + 1.6 * charge, grav: 0 }); }
      if (charge >= 1 && !t.d.full) { t.d.full = true; this.flash(ball, c, 2.6, 0.3); this.disc(true, 0.4, DISC.SHOCK, ball, this.v[2].copy(this.camPos).sub(ball).normalize(), 0.5, 2.3, this.hdr(c, 1.6, 0.8), 0.8); }
      if (charge >= 1 && vfxRandom() < 0.4) this.spark(SPARK.STAR, this.v[1].copy(ball).add(this.v[2].set(rnd(1, -1), rnd(1, -1), rnd(1, -1))), 0, 0, 0, 0.2, 0.32, 0.03, this.hdr(c, 2, 1.8), 1);
    },
    event(a, e, pos, target) {
      const c = this.rgb(a);
      if (e.action === 'cheer') {           // an ally's "Booyah!": a spark flies from the caller to the ball
        const owner = (this.G.actors || []).find(x => x.specialActive?.id === 'booyahBomb' && x.team === a.team) || null;
        const from = this.v[0].copy(a.pos).setY(a.pos.y + 1.4);
        this.stars(a.pos, 6, 0.4, this.hdr(c, 1.8, 1.5), { h: 2, h0: 1 });
        if (owner) { const rib = this.ribbon(true, { width: 0.35, widthTail: 0.05, color: this.hdr(c, 2, 1.4), alpha: 1, style: RIBBON.GLOW, life: 0.3, spacing: 0.15 });
          const to = new this.THREE.Vector3(owner.pos.x, owner.pos.y + 2.2, owner.pos.z), start = from.clone();
          this.shell(true, 0.45, SHELL.FLASH, start, 0.3, 0.3, this.hdr(c, 2, 2), 1, { follow: (rec) => { const k = smooth(rec.t / rec.life); this.v[7].copy(start).lerp(to, k); this.v[7].y += Math.sin(k * Math.PI) * 2; rec.v[0] = this.v[7].x; rec.v[1] = this.v[7].y; rec.v[2] = this.v[7].z; this.pushRibbon(rib, this.v[7], true); if (k >= 1) this.kit.glowRibbons.end(rib); } }); }
      } else if (e.action === 'throw' && pos) { this.flash(pos, c, 1.6, 0.25); this.streaks(pos, 14, 10, c); }
    },
    end(a, t) { },
  },
  // ---------------------------------------------------------------- Ultra Stamp
  ultraStamp: {
    start(a, t) { this.activation(a, t.color, 1.15);   // S3: golden starburst rays round the kid as the stamp appears
      for (let i = 0; i < Math.round(14 * this.kit.q); i++) { const th = i / 14 * TAU, el = rnd(0.9, 0.1);
        this.spark(SPARK.RAY, this.v[0].copy(a.pos).setY(a.pos.y + 0.6), Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el), 0.42, 0.14, 0.03, this.hdr(t.color, 2.4, 1.8), 1, { drag: 0, stretch: 3.2, grav: 0 }); } },
    frame(a, t) {
      const st = a._s3AllSpecialState;
      if (st?.phase === 'aimThrow' && vfxRandom() < 0.3) this.spark(SPARK.STAR, this.v[0].copy(a.pos).setY(a.pos.y + 2.2), rnd(1, -1), rnd(1, 0), rnd(1, -1), 0.3, 0.25, 0.03, this.hdr(t.color, 1.8, 1.4), 1);
    },
    event(a, e, pos, target) {
      const c = this.rgb(a);
      if ((e.action === 'swing' || e.action === 'jumpSwing') && target) {
        const big = e.action === 'jumpSwing', g = this.v[0].copy(target); g.y = groundBelowPoint(this, target, a.pos.y);
        this.flash(this.v[1].copy(g).setY(g.y + 0.3), c, big ? 1.8 : 1.1, 0.18);
        this.disc(false, 0.8, DISC.SPLAT, this.v[1].copy(g).setY(g.y + 0.03), this.up, 0.4, big ? 2.6 : 1.8, c, 1);
        this.band(false, 0.45, BAND.SHOCK, g, 0.5, big ? 3.6 : 2.6, 0.3, big ? 1.8 : 1.2, c, 1, { hold: 0.2 });
        // S3 (217.4s): the slam throws a tall column of ink straight up in front of the kid
        this.band(false, 0.6, BAND.SHOCK, g, 0.35, big ? 1.4 : 1.1, 0.8, big ? 4.2 : 3.4, c, 1, { hold: 0.3, taper: 0.55 });
        for (let i = 0; i < Math.round((big ? 26 : 18) * this.kit.q); i++) { const th = rnd(TAU), sp = rnd(2.5, 0.5);
          this.drop(this.v[1].set(g.x + Math.cos(th) * 0.4, g.y + 0.3, g.z + Math.sin(th) * 0.4), Math.cos(th) * sp, rnd(13, 7), Math.sin(th) * sp, rnd(1.1, 0.7), rnd(0.2, 0.08), c, { grav: 16, drag: 0.4, stretch: 0.05 }); }
        this.petals(this.v[1].copy(g).setY(g.y + 1), big ? 16 : 10, 6, c, { size: 0.24, upMin: 0.4, upMax: 1 });
        this.chunks(this.v[1].copy(g).setY(g.y + 0.2), big ? 18 : 12, big ? 11 : 8, c, { size: 0.2, upMin: 0.5 });
        this.smoke(g, big ? 8 : 5, [0.75, 0.73, 0.7], { kind: PUFF.DUST, size: 0.45, speed: 4, rise: 0.4, life: 0.7, alpha: 0.5, buoy: 0.2 });
        this.nativeBurst(this.v[1].copy(g).setY(g.y + 0.15), this.up, this.c.setRGB(...c), { count: big ? 16 : 10, speed: 7, size: 0.12, paint: false });
      } else if (e.action === 'block' && pos) {
        this.v[0].copy(pos); this.v[0].y += 1;
        this.flash(this.v[0], [1, 1, 1], 0.6, 0.12); this.streaks(this.v[0], 10, 9, [3, 3, 2.6], { life: 0.25, glow: true });   // a blocked shot: sparks off the stamp face
      } else if (e.action === 'throw' && pos) { this.flash(pos, c, 1.2, 0.2); }
    },
  },
  // ---------------------------------------------------------------- Zipcaster
  zipcaster: {
    start(a, t) {   // S3: the kid bursts into an ink-coated form in a big splash
      this.activation(a, t.color, 1);
      const p = this.v[0].copy(a.pos).setY(a.pos.y + 0.9);
      this.chunks(p, 26, 11, t.color, { size: 0.26, upMin: 0.1 });
      this.streaks(p, 44, 15, t.color, { up: 0.2, spread: 1.4, life: 0.8, size: 0.09 });   // S3 (239.1s): an explosive splatter
      this.petals(p, 30, 12, t.color, { size: 0.3, upMin: -0.4, upMax: 0.9 });
      this.disc(false, 0.9, DISC.SPLAT, this.v[1].copy(a.pos).setY(a.pos.y + 0.03), this.up, 0.5, 2.4, t.color, 1, { hold: 0.6 });
      this.nativeBurst(p, this.up, this.c.setRGB(...t.color), { count: 26, speed: 8, size: 0.14, spread: 1 });
    },
    frame(a, t, dt) {
      const st = a._s3AllSpecialState, c = t.color;
      const hand = this.bone(a, 'handR', this.v[0]) || this.chest(a, this.v[0], 1.2);
      const phase = st?.phase ?? null, target = st?.zipTarget;
      if ((phase === 'hookFlight' || phase === 'zip') && target) {
        let head = target;
        if (phase === 'hookFlight') { const k = clamp01((st.hookFlightT || 0) / Math.max(1e-3, st.hookFlightDuration || 0.1)); head = this.v[1].copy(hand).lerp(target, easeOut(k)); }
        // the line is a stretched strand of liquid ink (S3), not a light beam
        if (!t.d.line) { t.d.line = this.beam(false, 0, BEAM.JET, hand, head, 0.06, 0.09, c, 1, { speed: 20 }); (t.d.recs ||= []).push(t.d.line); }
        const thick = phase === 'zip' ? 0.1 : 0.06;
        this.setBeam(t.d.line, hand, head, thick * 0.8, thick, 1);
        if (phase === 'hookFlight' && vfxRandom() < 0.6) this.drop(head, rnd(1, -1), rnd(1, -1.5), rnd(1, -1), 0.35, 0.09, c, { grav: 10 });
        if (phase === 'zip') {      // the pull: streaks peeling off the body and an ink trail behind
          if (!t.d.trail) t.d.trail = this.ribbon(false, { width: 0.8, widthTail: 0.15, color: c, alpha: 1, style: RIBBON.INK, life: 0.25, spacing: 0.15 });
          this.pushRibbon(t.d.trail, this.chest(a, this.v[2], 0.8), false);
          const v = a.vel || this.v[3].set(0, 0, 0);
          for (let i = 0; i < 2; i++) this.drop(this.v[2].set(a.pos.x + rnd(0.5, -0.5), a.pos.y + rnd(1.4, 0.2), a.pos.z + rnd(0.5, -0.5)), -v.x * 0.3, -v.y * 0.3, -v.z * 0.3, 0.35, 0.08, c, { drag: 3, grav: 8, stretch: 0.06 });
        }
      } else {
        if (t.d.line) t.d.line.v[11] = 0;
        if (t.d.trail) { this.kit.ribbons.end(t.d.trail); t.d.trail = null; }
      }
      // the coated body drips
      t.acc = (t.acc || 0) + dt; if (t.acc > 0.16) { t.acc = 0; this.puff(PUFF.CHUNK, this.v[2].set(a.pos.x + rnd(0.25, -0.25), a.pos.y + rnd(1.2, 0.4), a.pos.z + rnd(0.25, -0.25)), 0, -0.5, 0, 0.6, 0.06, 0.03, c, 1, { grav: 10 }); }
    },
    event(a, e, pos, target) {
      const c = this.rgb(a);
      if (e.action === 'zip' && target) {   // the hook lands: an ink splat where it grabs
        const n = this.v[0].copy(pos || a.pos).sub(target).normalize();
        this.disc(false, 1.2, DISC.SPLAT, target, n, 0.3, 1.3, c, 1, { hold: 0.7 });
      } else if (e.action === 'hookImpact' && pos) {
        this.inkBlast(pos, c, 3.5, { streaks: 14, chunks: 10, native: false, dome: 0.35 });
      }
    },
  },
  // ---------------------------------------------------------------- Crab Tank
  crabTank: {
    start(a, t) {
      this.activation(a, t.color, 1.2);
      this.chunks(this.v[0].copy(a.pos).setY(a.pos.y + 0.6), 20, 8, t.color, { size: 0.24 });
      this.shell(false, 0.32, SHELL.INK, a.pos, 0.3, 1.2, t.color, 1, { hemi: true, sy: 0.8, hold: 0.1 });
    },
    frame(a, t, dt) {
      const st = a._s3AllSpecialState, ball = a.specialActive?.pose === 'ball' || st?.ballMode, c = t.color;
      if (ball) {   // rolling: a churned-up ink wake and spray off the sides
        const v = a.vel || this.v[3].set(0, 0, 0), sp = Math.hypot(v.x, v.z);
        if (sp > 1 && vfxRandom() < 0.9) {
          const g = this.v[0].set(a.pos.x - v.x * 0.06, a.pos.y + 0.1, a.pos.z - v.z * 0.06);
          this.puff(PUFF.CHUNK, g, -v.x * 0.3 + rnd(3, -3), rnd(4, 1.5), -v.z * 0.3 + rnd(3, -3), 0.5, 0.15, 0.04, c, 1, { grav: 15 });
          if (vfxRandom() < 0.4) this.puff(PUFF.MIST, g, -v.x * 0.15, 0.5, -v.z * 0.15, 0.6, 0.5, 1.2, this.hdr(c, 0.9), 0.4);
        }
        if (!t.d.rollRib) t.d.rollRib = this.ribbon(false, { width: 1.4, widthTail: 1.0, color: c, alpha: 1, style: RIBBON.INK, life: 0.5, spacing: 0.25, flat: true });
        this.pushRibbon(t.d.rollRib, this.v[0].set(a.pos.x, a.pos.y + 0.06, a.pos.z), false);
      } else if (t.d.rollRib) { this.kit.ribbons.end(t.d.rollRib); t.d.rollRib = null; }
      if (st?.phase === 'finish' && !t.d.finished) { t.d.finished = true; this.smoke(a.pos, 8, this.hdr(c, 0.9), { kind: PUFF.MIST, size: 0.8, speed: 3, life: 0.8 }); }
    },
    event(a, e, pos, target) {
      const c = this.rgb(a);
      const dir = pos && target ? this.v[3].copy(target).sub(pos).normalize() : this.aim(a, this.v[3]);
      if (e.action === 'shot' && pos) {
        const m = this.v[4].copy(pos).addScaledVector(dir, 0.9);
        this.flash(m, c, 0.32, 0.08);
        this.drop(m, dir.x * 18 + rnd(1.5, -1.5), dir.y * 18 + rnd(1.5, -1.5), dir.z * 18 + rnd(1.5, -1.5), 0.25, 0.08, c, { drag: 1, grav: 8, stretch: 0.02 });
        if (vfxRandom() < 0.4) this.puff(PUFF.SMOKE, m, dir.x * 2, 0.8, dir.z * 2, 0.5, 0.15, 0.45, [0.9, 0.9, 0.92], 0.35);
      } else if (e.action === 'cannon' && pos) {
        const m = this.v[4].copy(pos).addScaledVector(dir, 1.1);
        this.muzzle(m, dir, c, 1.15);
        this.smoke(m, 8, [0.92, 0.92, 0.95], { size: 0.45, speed: 2.5, life: 1.1, alpha: 0.55, rise: 1.5 });
      }
    },
  },
  // ---------------------------------------------------------------- Reefslider
  reefslider: {
    start(a, t) {   // summoning the shark: an ink wave wraps round the kid
      this.activation(a, t.color, 1.1);
      this.band(false, 0.6, BAND.SHOCK, a.pos, 0.6, 2.2, 0.4, 2.2, t.color, 1, { hold: 0.25 });
      this.chunks(this.v[0].copy(a.pos).setY(a.pos.y + 0.4), 22, 9, t.color, { size: 0.24, upMin: 0.4 });
    },
    phase(a, t, phase) {
      const c = t.color;
      if (phase === 'dash') {
        this.puff(PUFF.MIST, a.pos, 0, 1, 0, 0.6, 1, 2, this.hdr(c, 0.9), 0.5);
        t.d.wakeL = this.ribbon(false, { width: 0.7, widthTail: 1.6, color: c, alpha: 1, style: RIBBON.INK, life: 0.7, spacing: 0.3, flat: true });
        t.d.wakeR = this.ribbon(false, { width: 0.7, widthTail: 1.6, color: c, alpha: 1, style: RIBBON.INK, life: 0.7, spacing: 0.3, flat: true });
        // pale air streaming past the rider (wind lines), not a light trail
        t.d.speed = this.ribbon(false, { width: 0.3, widthTail: 0.05, color: [0.95, 0.97, 1.0], alpha: 0.35, style: RIBBON.SMOKE, life: 0.2, spacing: 0.2 });
      } else if (phase === 'brake') {
        t.d.warn = this.disc(true, 0, DISC.TARGET, a.pos, this.up, 1, 1, this.hdr(c, 1.6, 0.8), 0.9, { fade: false,
          follow: (rec) => { const k = clamp01((this.time - t.phaseAt) / (38 / 60)); rec.v[0] = a.pos.x; rec.v[1] = a.pos.y + 0.06; rec.v[2] = a.pos.z; rec.v[3] = 1 + 8 * easeOut(k); rec.v[7] += 0.03 + 0.1 * k; } });
        (t.d.recs ||= []).push(t.d.warn);
      }
    },
    frame(a, t, dt) {
      const st = a._s3AllSpecialState, c = t.color, phase = st?.phase ?? t.phase;
      const dir = st?.direction || this.forward(a, this.v[5]);
      const side = this.v[6].set(dir.z, 0, -dir.x);
      if (phase === 'dash' || phase === 'brake') {
        const g = groundBelow(this, a);
        for (const [rib, s] of [[t.d.wakeL, -1], [t.d.wakeR, 1]]) this.pushRibbon(rib, this.v[0].set(a.pos.x + side.x * s * 0.55, g + 0.05, a.pos.z + side.z * s * 0.55), false);
        this.pushRibbon(t.d.speed, this.v[0].set(a.pos.x, a.pos.y + 0.7, a.pos.z), false);
        // bow spray: a V of ink chunks thrown off the nose
        t.acc = (t.acc || 0) + dt;
        while (t.acc > SPECIAL_VFX_CALIBRATION.reefslider.wakeEvery) { t.acc -= SPECIAL_VFX_CALIBRATION.reefslider.wakeEvery;
          for (const s of [-1, 1]) {
            const p = this.v[1].set(a.pos.x + dir.x * 0.9 + side.x * s * 0.4, g + 0.25, a.pos.z + dir.z * 0.9 + side.z * s * 0.4);
            this.puff(PUFF.CHUNK, p, side.x * s * rnd(7, 4) + dir.x * 3, rnd(6, 3), side.z * s * rnd(7, 4) + dir.z * 3, 0.55, 0.17, 0.05, c, 1, { grav: 16, drag: 0.6 });
            this.petals(p, 1, 7, c, { size: 0.34, upMin: 0.45, upMax: 0.95, life: 0.7 });   // S3 (102.8s): tall waves of spray shards
            if (vfxRandom() < 0.4) this.puff(PUFF.MIST, p, side.x * s * 2, 1, side.z * s * 2, 0.6, 0.5, 1.4, this.hdr(c, 0.9), 0.35);
          }
          this.spark(SPARK.STREAK, this.v[1].set(a.pos.x + rnd(1, -1), a.pos.y + rnd(1.5, 0.3), a.pos.z + rnd(1, -1)), -dir.x * 20, 0, -dir.z * 20, 0.12, 0.04, 0.02, [1.2, 1.2, 1.25], 0.35, { stretch: 0.06, drag: 0 });   // faint speed lines
        }
        if (phase === 'brake') { // arming: the shark glows harder and faster before it bursts
          const k = clamp01((this.time - t.phaseAt) / (38 / 60));
          if (vfxRandom() < 0.3 + 0.6 * k) this.spark(SPARK.GLOW, this.v[2].set(a.pos.x, a.pos.y + 0.7, a.pos.z), 0, 0, 0, 0.12, 1.0 + k, 1.6 + 1.6 * k, this.hdr(c, 1.2, 1.0), 0.45);
          if (vfxRandom() < 0.4 + 0.5 * k) this.drop(this.v[2].set(a.pos.x + rnd(0.6, -0.6), a.pos.y + rnd(0.9, 0.3), a.pos.z + rnd(0.6, -0.6)), rnd(2, -2), rnd(3, 1), rnd(2, -2), 0.4, 0.1, c);   // the shark sheds ink as it swells
        }
      } else if (phase === 'startup' && vfxRandom() < 0.5) {
        const th = rnd(TAU); this.puff(PUFF.CHUNK, this.v[1].set(a.pos.x + Math.cos(th) * 0.9, a.pos.y + 0.2, a.pos.z + Math.sin(th) * 0.9), -Math.sin(th) * 3, rnd(4, 2), Math.cos(th) * 3, 0.5, 0.14, 0.04, c, 1, { grav: 14 });
      }
    },
    event(a, e, pos) {
      if (e.action === 'impact' && pos) {
        const c = this.rgb(a), R = finite(e.radius) ? e.radius : 14.9;
        this.inkBlast(pos, c, Math.min(10, R * 0.62), { streaks: 34, chunks: 26, mist: 10, dome: 0.55 });
        // the geyser: a column of ink thrown straight up out of the blast
        this.beam(false, 0.8, BEAM.JET, pos, this.v[0].copy(pos).setY(pos.y + 7), 1.6, 0.5, c, 1, { speed: -10, follow: (rec) => { const k = rec.t / rec.life; rec.v[5] = pos.y + 7 * easeOut(k * 1.6) * (1 - k * 0.3); rec.v[11] = 1 - smooth((k - 0.5) / 0.5); } });
        this.band(false, 0.9, BAND.SHOCK, pos, 2, R * 0.8, 1, 5.5, c, 1, { hold: 0.3 });
      }
    },
    end(a, t) { for (const k of ['wakeL', 'wakeR', 'speed']) this.kit.ribbons.end(t.d[k]); },
  },
  // ---------------------------------------------------------------- Triple Inkstrike
  tripleInkstrike: {
    start(a, t) { this.activation(a, t.color, 1); },
    frame(a, t, dt) {   // S3: "Twister time!" – green wind lines spiral round the kid while the case is open
      t.acc = (t.acc || 0) + dt;
      if (t.acc > 0.1) { t.acc = 0;
        const rib = this.ribbon(true, { width: 0.1, widthTail: 0.02, color: this.hdr(t.color, 1.3, 0.8), alpha: 0.6, style: RIBBON.GLOW, life: 0.25, spacing: 0.08 });
        const y0 = rnd(1.6, 0.3), ph = rnd(TAU), r0 = rnd(1.2, 0.8), dirSign = sgn();
        this.shell(true, 0.5, SHELL.FLASH, a.pos, 0, 0, [0, 0, 0], 0, { follow: (rec) => { const k = rec.t / rec.life, th = ph + dirSign * k * 5;
          this.v[7].set(a.pos.x + Math.cos(th) * r0, a.pos.y + y0 + k * 0.8, a.pos.z + Math.sin(th) * r0); this.pushRibbon(rib, this.v[7], true); if (k > 0.98) this.kit.glowRibbons.end(rib); } });
      }
    },
    event(a, e, pos, target) { if (e.action === 'marker' && pos) this.flash(pos, this.rgb(a), 0.6, 0.15); },
  },
  // ---------------------------------------------------------------- Super Chump
  superChump: {
    start(a, t) { this.activation(a, t.color, 1); },
    frame(a, t) {
      // S3 footage (142.3s): while aiming, the landing area shows on the floor. These are the exact twelve decoy
      // landing points the throw would use (superChumpLandingPreview), local caster only.
      const pv = a.isLocal ? superChumpLandingPreview(this.api, a) : null;
      t.d.preview = pv;
      if (!pv) return;
      if (!t.d.marks) {
        const c = t.color;
        t.d.center = this.disc(true, 0, DISC.TARGET, pv.target, this.up, 2.4, 2.4, this.hdr(c, 1.4, 0.5), 0.75, { fade: false, spin: 1.5,
          follow: (rec) => { const p = t.d.preview; if (!p) return; rec.v[0] = p.target.x; rec.v[1] = p.target.y + 0.06; rec.v[2] = p.target.z; } });
        t.d.marks = pv.positions.map((_, i) => this.disc(true, 0, DISC.RETICLE, pv.positions[i], this.up, 1.2, 1.2, this.hdr(c, 1.3, 0.4), 0.7, { fade: false, spin: 2,
          follow: (rec) => { const p = t.d.preview?.positions[i]; if (!p) return; rec.v[0] = p.x; rec.v[1] = p.y + 0.06; rec.v[2] = p.z; } }));
        (t.d.recs ||= []).push(t.d.center, ...t.d.marks);
      }
    },
    event(a, e, pos, target) {
      if (e.action === 'balloon' && pos && (e.index ?? 0) === 0) {   // one firework burst for the salvo
        const c = this.rgb(a), m = this.v[0].copy(pos).setY(pos.y + 0.4);
        this.muzzle(m, this.aim(a, this.v[1]), c, 1.6);
        for (let i = 0; i < Math.round(26 * this.kit.q); i++) this.spark(SPARK.STAR, m, rnd(7, -7), rnd(10, 3), rnd(7, -7), rnd(1, 0.5), 0.2, 0.04, i % 2 ? this.hdr(c, 1.7, 1.3) : [3, 3, 3], 1, { grav: 8, drag: 1.4, spin: rnd(8, -8) });
        this.smoke(m, 6, [0.94, 0.94, 0.96], { size: 0.4, speed: 2, life: 1, alpha: 0.5 });
      }
    },
  },
  // ---------------------------------------------------------------- Kraken Royale
  krakenRoyale: {
    start(a, t) {   // S3: the transformation bursts in a ring of ink petals
      const c = t.color, p = this.v[0].copy(a.pos).setY(a.pos.y + 0.3);   // low: the Kraken's belly rests on the floor
      this.activation(a, c, 0.8);
      // S3 (83.0s): the transformation throws a cloud of glossy pink petals with white cores
      this.petals(p, 80, 13, c, { size: 0.32, life: 1.1, upMin: -0.05, upMax: 0.95 });
      this.chunks(p, 14, 9, c, { size: 0.24 });
    },
    phase(a, t, phase) {
      const c = t.color;
      if (phase === 'charge') {
        // thin ink filaments winding in round the body as the charge builds (the S3 effects are fine strands, not sheets)
        t.d.fil = krakenFilaments(this, c, 14, 0.12, 0.3, 4);
        // S3 footage (85.0s): arrows on the floor point the way the charge will go
        t.d.arrows = this.disc(false, 0, DISC.CHEVRON, a.pos, this.up, 2.2, 2.2, [0.95, 0.95, 0.95], 0.95, { fade: false,
          follow: (rec) => { if (this.tracks.get(a)?.phase !== 'charge') return false; const f = a._s3AllSpecialState?.direction || this.aim(a, this.v[6]);
            rec.v[0] = a.pos.x + f.x * 3.6; rec.v[1] = groundBelow(this, a) + 0.05; rec.v[2] = a.pos.z + f.z * 3.6; rec.v[7] = Math.atan2(f.z, f.x);
            rec.v[11] = 0.5 + 0.5 * smooth((this.time - t.phaseAt) / (35 / 60)); } });
        (t.d.recs ||= []).push(t.d.arrows);
      } else if (phase === 'dash') {
        this.flash(this.v[0].copy(a.pos).setY(a.pos.y + 0.4), c, 0.9, 0.16);
        // S3 (89.9/92.9s): a cage of many thin pink and white strands whirling round the body, white streaks and petals
        endFilaments(this, t.d.fil); t.d.fil = null;
        t.d.dashRibs = krakenFilaments(this, c, 22, 0.16, 0.3, 3);
      }
      if (phase !== 'charge' && t.d.fil) { endFilaments(this, t.d.fil); t.d.fil = null; }
      if (phase !== 'dash' && t.d.dashRibs) { endFilaments(this, t.d.dashRibs); t.d.dashRibs = null; }
      if (phase === 'finish') { this.v[0].copy(a.pos).setY(a.pos.y + 0.3); this.flash(this.v[0], c, 1.6, 0.25); this.streaks(this.v[0], 24, 10, c, { up: 0.5, life: 0.7, size: 0.09 });
        this.stars(a.pos, 8, 0.8, [3, 3, 3], { h: 1.2, h0: 0.2 }); this.petals(this.v[0], 30, 9, c, { size: 0.26 }); }   // S3 (96.8s): a white star burst and petals
    },
    frame(a, t, dt) {
      const c = t.color;
      if (t.phase === 'charge') {   // ink drawn in to the body
        if (t.d.fil) { const k = clamp01((this.time - t.phaseAt) / (35 / 60)); stepFilaments(this, a, t.d.fil, 1.35 - 0.35 * k, 0.5, 8 + 12 * k, a._s3AllSpecialState?.direction || null, dt); }
        if (vfxRandom() < 0.8) { const th = rnd(TAU), d = rnd(3, 2); this.v[0].set(a.pos.x + Math.cos(th) * d, a.pos.y + rnd(1.4, 0.1), a.pos.z + Math.sin(th) * d);
          this.drop(this.v[0], (a.pos.x - this.v[0].x) * 4, (a.pos.y + 0.35 - this.v[0].y) * 4, (a.pos.z - this.v[0].z) * 4, 0.24, 0.08, c, { drag: 0, grav: 0, stretch: 0.05, shrink: 0.3 }); }
      } else if (t.phase === 'dash' && t.d.dashRibs) {   // S3: corkscrewing ink arcs round the charge
        const f = a._s3AllSpecialState?.direction || this.forward(a, this.v[5]);
        stepFilaments(this, a, t.d.dashRibs, 1.15, 0.5, 20, f, dt);
        if (vfxRandom() < 0.9) {   // white speed streaks peeling back off the cage
          this.v[0].set(a.pos.x + rnd(1, -1), a.pos.y + rnd(1, 0.1), a.pos.z + rnd(1, -1));
          this.spark(SPARK.STREAK, this.v[0], -f.x * 16, rnd(1, -1), -f.z * 16, 0.14, 0.05, 0.02, [2.2, 2.2, 2.2], 0.9, { stretch: 0.07, drag: 2 }); }
        if (vfxRandom() < 0.5) this.petals(this.v[0].set(a.pos.x, a.pos.y + 0.5, a.pos.z), 1, 6, c, { size: 0.2, life: 0.5 });
        if (vfxRandom() < 0.9) this.drop(this.v[1].set(a.pos.x - f.x * 0.8 + rnd(0.5, -0.5), a.pos.y + 0.15, a.pos.z - f.z * 0.8 + rnd(0.5, -0.5)), -f.x * 4 + rnd(2, -2), rnd(4, 1.5), -f.z * 4 + rnd(2, -2), 0.5, 0.12, c);
        if (vfxRandom() < 0.8) this.puff(PUFF.CHUNK, this.v[1].set(a.pos.x + rnd(1, -1), a.pos.y + rnd(2, 0.2), a.pos.z + rnd(1, -1)), rnd(5, -5), rnd(5, 1), rnd(5, -5), 0.45, 0.2, 0.05, c, 1, { grav: 14 });
      } else if (vfxRandom() < 0.08) this.puff(PUFF.CHUNK, this.v[1].set(a.pos.x + rnd(0.5, -0.5), a.pos.y + rnd(0.9, 0.3), a.pos.z + rnd(1.2, -1.2)), 0, -0.3, 0, 0.7, 0.09, 0.04, c, 1, { grav: 10 });
    },
    event(a, e, pos) {
      if (e.action === 'jump' && pos) { const c = this.rgb(a), g = this.v[0].copy(pos); g.y = groundBelowPoint(this, pos, a.pos.y);
        this.disc(false, 0.8, DISC.SPLAT, this.v[1].copy(g).setY(g.y + 0.03), this.up, 0.4, 2.2, c, 1);
        this.band(false, 0.45, BAND.SHOCK, g, 0.6, 2.6, 0.3, 1.4, c, 1);
        this.chunks(this.v[1].copy(g).setY(g.y + 0.2), 14, 8, c, { size: 0.22 }); }
    },
    end(a, t) { endFilaments(this, t.d.dashRibs); endFilaments(this, t.d.fil); },
  },
  // ---------------------------------------------------------------- Splattercolor Screen / Wave Breaker (device in hand)
  splattercolorScreen: { start(a, t) { this.activation(a, t.color, 0.9); } },
  waveBreaker: { start(a, t) { this.activation(a, t.color, 0.9); } },
  // ---------------------------------------------------------------- kit specials on the actor
  trizooka: {
    start(a, t) { this.activation(a, t.color, 1.1); },
    frame(a, t) {
      const s = a.s3Trizooka, shots = s?.shots ?? null;
      if (shots !== null && shots !== t.d.shots) { if (t.d.shots !== undefined && shots > t.d.shots) trizookaMuzzle(this, a, t.color); t.d.shots = shots; }
    },
  },
  inkVac: {
    start(a, t) { this.activation(a, t.color, 1); },
    frame(a, t, dt) {
      const st = inkVacState?.(a), c = t.color, phase = st?.phase || a.specialActive?.phase;
      if (phase !== 'inhale') { if (phase === 'exhale' && !t.d.shot) { t.d.shot = true; const f = this.aim(a, this.v[1]); const m = this.v[0].copy(a.pos).setY(a.pos.y + 1).addScaledVector(f, 1.1); this.muzzle(m, f, c, 2.2); this.shell(true, 0.3, SHELL.SHOCK, m, 0.3, 2.0, this.hdr(c, 1.3, 1), 0.6); } return; }
      const sucking = a._s3InkVacSucking || a.intent?.fire, f = this.aim(a, this.v[1]);
      const mouth = this.v[0].copy(a.pos).setY(a.pos.y + 1).addScaledVector(f, 0.9);
      t.d.suck = !!sucking;
      if (!t.d.vortex) {   // S3 (51.4s): a big swirl of suction rings standing across the nozzle while it inhales
        const fv = this.v[7];
        t.d.vortex = this.disc(true, 0, DISC.VORTEX, mouth, f, 0.1, 0.1, this.hdr(c, 1.3, 0.9), 0, { fade: false,
          follow: (rec) => { const tr = this.tracks.get(a), s2 = inkVacState?.(a);
            if (!tr || tr !== t || (s2?.phase || a.specialActive?.phase) !== 'inhale') return false;
            this.aim(a, fv); rec.v[0] = a.pos.x + fv.x * 1.6; rec.v[1] = a.pos.y + 1 + fv.y * 1.6; rec.v[2] = a.pos.z + fv.z * 1.6;
            rec.v[4] = fv.x; rec.v[5] = fv.y; rec.v[6] = fv.z; rec.v[7] += 0.05;
            const target = t.d.suck ? 1 : 0; rec.v[11] += (target * 0.85 - rec.v[11]) * 0.2;
            rec.v[3] = 0.9 + 0.5 * (s2?.charge || 0) + 0.15 * Math.sin(this.time * 9); } });
        (t.d.recs ||= []).push(t.d.vortex);
      }
      if (sucking && this.near(a.pos, 70)) {
        // dust and droplets dragged into the nozzle along a widening cone (S3: green swirling suction rings)
        t.acc = (t.acc || 0) + dt * (30 + 40 * (st?.charge || 0));
        const far = st?.farR || 3, len = clamp(st?.length || 6, 2, 9);
        while (t.acc >= 1) { t.acc -= 1;
          const d = rnd(len, 1.2), w = (0.4 + (far - 0.4) * d / len) * Math.sqrt(vfxRandom()), th = rnd(TAU);
          const up = this.v[2].set(0, 1, 0), right = this.v[3].crossVectors(f, up).normalize(); up.crossVectors(right, f).normalize();
          this.v[4].copy(mouth).addScaledVector(f, d).addScaledVector(right, Math.cos(th) * w).addScaledVector(up, Math.sin(th) * w);
          const k = 2.6 / 0.35;
          this.drop(this.v[4], (mouth.x - this.v[4].x) * k / d * 1.4, (mouth.y - this.v[4].y) * k / d * 1.4, (mouth.z - this.v[4].z) * k / d * 1.4, 0.32, 0.06, c, { drag: 0, grav: 0, stretch: 0.04, shrink: 0.3 });
        }
        t.ringAcc = (t.ringAcc || 0) + dt;
        if (t.ringAcc > 0.14) { t.ringAcc = 0;   // rings that rush into the mouth
          const start = mouth.clone().addScaledVector(f, 2.6), end = mouth.clone(), n = f.clone();
          this.disc(true, 0.35, DISC.SHOCK, start, n, 2, 0.35, this.hdr(c, 1.2, 0.6), 0.55, { hold: 0.7, follow: (rec) => { const k = rec.t / rec.life; this.v[7].copy(start).lerp(end, k * k); rec.v[0] = this.v[7].x; rec.v[1] = this.v[7].y; rec.v[2] = this.v[7].z; } });
        }
      }
    },
  },
  storm: {
    start(a, t) { this.activation(a, t.color, 0.9); },
  },
  bubbler: { start(a, t) { this.activation(a, t.color, 1); } },
  tacticooler: { start(a, t) { this.activation(a, t.color, 0.9); } },
  tripleSplashdown: {
    start(a, t) { this.activation(a, t.color, 1.2); },
    frame(a, t, dt) {   // rising: energy spirals wind round the kid until the drop
      if (a.specialActive?.phase !== 'rise') return;
      t.acc = (t.acc || 0) + dt;
      if (t.acc > 0.04) { t.acc = 0; const th = this.time * 9 + rnd(0.4), r = 1.1;
        this.spark(SPARK.STAR, this.v[0].set(a.pos.x + Math.cos(th) * r, a.pos.y + rnd(1.8, 0.2), a.pos.z + Math.sin(th) * r), 0, 2, 0, 0.35, 0.28, 0.03, this.hdr(t.color, 2, 1.4), 1); }
    },
    event(a, e, pos) {
      if (e.action === 'impact' && pos && (e.index ?? -1) < 0) this.inkBlast(pos, this.rgb(a), 6.4, { streaks: 30, chunks: 18, native: false, dome: 0.55 });
    },
  },
  slam: {
    start(a, t) { this.activation(a, t.color, 1); },
  },
};

// Trizooka: three rounds per volley; S3 shows a white-hot burst with ink rings spinning off the muzzle.
function trizookaMuzzle(self, a, c) {
  const f = self.aim(a, self.v[1]);
  const m = self.v[0].copy(a.pos).setY(a.pos.y + 1.1).addScaledVector(f, 1.0);
  const dev = a.character?.kid?.getObjectByName?.('special:trizooka');
  if (dev?.userData?.muzzle) { dev.updateWorldMatrix(true, false); m.copy(dev.userData.muzzle).applyMatrix4(dev.matrixWorld); }
  self.muzzle(m, f, c, 0.95);
  for (let i = 0; i < 3; i++) self.disc(true, 0.26 + i * 0.06, DISC.SHOCK, self.v[2].copy(m).addScaledVector(f, 0.5 + i * 0.6), f, 0.25, 0.8 + i * 0.3, self.hdr(c, 1.2, 0.8), 0.5);
  self.smoke(m, 6, [0.94, 0.94, 0.96], { size: 0.4, speed: 2.2, life: 0.9, alpha: 0.5, rise: 1 });
  self.streaks(m, 26, 13, c, { up: 0.1, life: 0.5, size: 0.08 });
  self.petals(m, 14, 10, c, { size: 0.26, upMin: -0.3, upMax: 0.6 });
  self.spark(SPARK.GLOW, m, 0, 0, 0, 0.14, 0.7, 1.3, [2.4, 2.4, 2.4], 0.8);   // S3 (205.5s): white-hot core of the burst
}
// Kraken strands (S3 89.9/92.9s): thin pink and white strands rolling round the body's front-back axis — each
// one a ring standing across the direction of travel (side/up plane), set at its own place along the body and
// slightly tipped, all spinning the same way like a drill. Every few strands is a white streak.
function krakenFilaments(self, c, n, w, life, whiteEvery) {
  const out = [], dir = vfxRandom() < 0.5 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const white = whiteEvery > 0 && i % whiteEvery === whiteEvery - 1;
    out.push({ r: white ? self.ribbon(true, { width: w * 0.6, widthTail: 0.01, color: [2.0, 2.0, 2.0], alpha: 0.9, style: RIBBON.GLOW, life, spacing: 0.03 })
                        : self.ribbon(false, { width: w, widthTail: w * 0.25, color: c, alpha: 1, style: RIBBON.INK, life, spacing: 0.03 }),
      white, off: rnd(0.9, -0.7), tip: rnd(0.35, -0.35), ph: rnd(TAU), sp: rnd(1.2, 0.85) * dir, rr: rnd(1.1, 0.8) });
  }
  return out;
}
function stepFilaments(self, a, fil, R, cy, speed, f, dt) {
  if (!fil?.length) return;
  // the travel axis: the dash/charge direction, else the facing
  const fw = f || self.forward(a, self.v[6]), fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl, sx = fz, sz = -fx;
  // Sub-steps through the frame, sweeping both the strand's angle (accumulated, so a changing speed never jumps it)
  // and the body's movement (the dash covers 0.35 m a frame), so a strand draws a smooth arc instead of chords.
  const cx = a.pos.x, cyy = a.pos.y + cy, cz = a.pos.z;
  const lc = fil.lc || [cx, cyy, cz], move = Math.hypot(cx - lc[0], cyy - lc[1], cz - lc[2]);
  const n = Math.max(1, Math.min(16, Math.ceil(Math.max(speed * R * 1.3 * dt, move) / 0.05))), now = self.kit.time;
  for (const q of fil) {
    const pool = q.white ? self.kit.glowRibbons : self.kit.ribbons, th0 = q.ang ?? q.ph, dth = speed * q.sp * dt;
    q.ang = th0 + dth;
    for (let k = 1; k <= n; k++) {
      const u = k / n, th = th0 + dth * u, rh = R * q.rr, rv = R * q.rr * 0.72;
      const cs = Math.cos(th) * rh, sn = Math.sin(th) * rv, along = q.off + q.tip * Math.sin(th);   // a ring across the travel axis
      pool.push(q.r, lc[0] + (cx - lc[0]) * u + sx * cs + fx * along, lc[1] + (cyy - lc[1]) * u + sn, lc[2] + (cz - lc[2]) * u + sz * cs + fz * along,
        now - dt * (1 - u));
    }
  }
  fil.lc = [cx, cyy, cz];
}
function endFilaments(self, fil) { for (const q of fil || []) (q.white ? self.kit.glowRibbons : self.kit.ribbons).end(q.r); }
// Killer Wail speaker mouths, from the drawn devices when present, otherwise from the shared ring layout.
const SPEAKER_RING = [[-0.55, 1.95], [0.55, 1.95], [-1.0, 1.35], [1.0, 1.35], [-0.55, 0.75], [0.55, 0.75]];
function speakerAnchors(self, a) {
  const out = self._spk ||= SPEAKER_RING.map(() => new self.THREE.Vector3());
  const ch = a.character, list = ch?.s3SpecialDevices?.() || null;
  const holders = list ? list.filter(d => d.spec?.speakers).map(d => d.holder) : [];
  if (holders.length === SPEAKER_RING.length) {
    for (let i = 0; i < holders.length; i++) { holders[i].updateWorldMatrix(true, false); out[i].set(0, 0, 0.25).applyMatrix4(holders[i].matrixWorld); }
    return out;
  }
  const y = a.yaw ?? a.aimYaw ?? 0, cs = Math.cos(y), sn = Math.sin(y);
  for (let i = 0; i < SPEAKER_RING.length; i++) { const [x, h] = SPEAKER_RING[i], z = -0.1; out[i].set(a.pos.x + x * cs + z * sn, a.pos.y + h, a.pos.z - x * sn + z * cs); }
  return out;
}
function groundBelow(self, a) { return groundBelowPoint(self, a.pos, a.pos.y); }
function groundBelowPoint(self, p, fallback) {
  const G = self.G, probe = self.v[7].set(p.x, p.y + 0.5, p.z);
  const hit = G.physics?.raycast?.(probe, self.down ||= new self.THREE.Vector3(0, -1, 0), 12, self.hit ||= (self.api.Hit ? new self.api.Hit() : { hit: false, point: new self.THREE.Vector3(), normal: new self.THREE.Vector3() }), true);
  if (hit?.hit && finite(hit.point?.y)) return hit.point.y;
  const h = G.level?.groundHeight?.(p.x, p.z);
  return finite(h) ? h : fallback;
}

// =================================================================================================
// Installation
// =================================================================================================
const directors = new WeakMap();
export function specialVfxDirector(fx) { return fx?.s3SpecialVfx || directors.get(fx) || null; }
export function installSpecialVfx(api) {
  const { FX, on, G } = api;
  if (!FX?.prototype?.update || FX.prototype[INSTALL]) return api;
  Object.defineProperty(FX.prototype, INSTALL, { value: true });
  const ensure = (fx) => {
    let d = directors.get(fx);
    if (!d && fx?.root) {
      d = new Director(api, fx); directors.set(fx, d); Object.defineProperty(fx, 's3SpecialVfx', { value: d, configurable: true });
      // The game's own FX pools share the problem: keep their origin-anchored base shapes out of the AO normal pass too.
      for (const m of fx.root.children) if (m.isMesh || m.isInstancedMesh) excludeFromOverridePasses(m);
    }
    return d;
  };
  // Build the pools as soon as the game wires its FX (before the boot shader warm-up).
  const setCollider = FX.prototype.setCollider;
  FX.prototype.setCollider = function (...args) { const out = setCollider.apply(this, args); try { ensure(this); } catch (e) { console.warn('[special-vfx]', e); } return out; };
  const update = FX.prototype.update;
  FX.prototype.update = function (dt, camera, ...rest) {
    const out = update.call(this, dt, camera, ...rest);
    const d = ensure(this);
    if (d && G.fx === this && this.s3SpecialVfxEnabled !== false) d.update(dt, camera);
    return out;
  };
  const clear = FX.prototype.clear;
  FX.prototype.clear = function (...args) { directors.get(this)?.clear(); return clear.apply(this, args); };
  const dispose = FX.prototype.dispose;
  if (dispose) FX.prototype.dispose = function (...args) { const d = directors.get(this); if (d) { d.kit.dispose(); directors.delete(this); delete this.s3SpecialVfx; } return dispose.apply(this, args); };
  const route = (e) => { const d = G.fx && G.fx.s3SpecialVfxEnabled !== false && directors.get(G.fx); if (d) d.event(e); };
  on?.('all:special', (e) => { if (!e?.actor?.remote) route(e); });
  api.specialVfxReplay = route;
  return api;
}
// Wrap the remote replay entry so accepted presentation rows reach the effects too.
export function observeSpecialReplay(api, replay) {
  return (a, event, ...rest) => {
    const accepted = replay(a, event, ...rest);
    if (accepted && event?.actor?.remote) { try { api.specialVfxReplay?.(event); } catch (e) { console.warn('[special-vfx]', e); } }
    return accepted;
  };
}
export default installSpecialVfx;

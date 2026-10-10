import { distanceDamage } from './weapons.mjs';
import { kitBombDamageBands, kitBombDamageMax } from './kit-subs.mjs';
// Special contacts are candidates in the native swept segment, never a second step.
// Pinned spl__DamageRateInfoConfig row of an explosion's blast core against the
// Big Bubbler (see BIG_BUBBLER_SOURCE_RATES in kit-big-bubbler.mjs).
export function explosionBubblerRow(p) {
  if (!p) return null;
  if (p.kind === 'bomb') return (p.s3Sub?.id || p.s3Resolved?.spec?.id) === 'suction' ? 'Bomb_Suction' : 'Bomb';
  if (p.wid === 'trizooka') return 'UltraShot';
  if (p.wid === 'inkVac' || p.s3SpecialWeapon?.id === 'inkVac') return 'BlowerExhale_BombCore';
  if (p.type === 'blast' && (p.s3Weapon || p.owner?.weapon)?.kind === 'blaster') return 'Blaster_BlasterMiddle';
  return null;
}
export function installKitDefense(api) {
  const { Projectiles, G } = api;
  Projectiles.prototype.kitDefenseCandidate = function (p) {
    const length = p.prev.distanceTo(p.pos);
    let best = null;
    const consider = candidate => {
      if (!candidate || typeof candidate.onHit !== 'function' ||
          !Number.isFinite(candidate.distance) || candidate.distance < 0 || candidate.distance > length) return;
      if (!best || candidate.distance < best.distance) best = candidate;
    };
    consider(this.kitBarrierCandidate?.(p, p.prev, p.pos));
    if (api.inkVacAbsorbCandidate) for (const actor of G.actors || []) {
      if (actor.alive && actor.team !== p.team) consider(api.inkVacAbsorbCandidate(actor, p.prev, p.pos, p));
    }
    return best;
  };
  // #1118/#1113: native thrown bombs share the same first-contact arbitration
  // as ordinary projectiles without creating a second bomb integrator.
  Projectiles.prototype.kitBombDefenseCandidate = function (b, start, end) {
    if (!b || b.kind !== 'bomb' || !start || !end) return null;
    const subId = b.s3Sub?.id || b.s3Resolved?.spec?.id || 'bomb';
    // Curling owns distinct rolling/contact rules; only generic Splat Bomb and
    // verified Suction Bomb use this airborne contact lane.
    if (subId !== 'bomb' && subId !== 'suction') return null;
    const length = start.distanceTo(end);
    if (!(length > 0)) return null;
    const probe = this._s3BombDefenseProbe || (this._s3BombDefenseProbe = {
      owner: null, team: -1, prev: null, pos: null, vel: null, damage: 0,
      type: 'bomb', size: .2, ghost: false, s3InkVacBomb: null,
    });
    probe.owner = b.owner; probe.team = b.team; probe.prev = start; probe.pos = end;
    probe.vel = b.vel; probe.damage = kitBombDamageMax(api.SUB, b, api.SUB.bomb.damageMax);
    probe.ghost = !!b.ghost; probe.s3InkVacBomb = b; probe.s3InkVacAbsorbed = !!b.s3InkVacAbsorbed;
    let best = null;
    const consider = (candidate, kind) => {
      if (!candidate || typeof candidate.onHit !== 'function' || !Number.isFinite(candidate.distance)
        || candidate.distance < 0 || candidate.distance > length) return;
      if (!best || candidate.distance < best.distance) {
        best = { distance: candidate.distance, point: candidate.point?.clone?.() || null,
          normal: candidate.normal?.clone?.() || null, onHit: candidate.onHit, kind,
          visualOnly: !!candidate.visualOnly };
      }
    };
    consider(this.kitBarrierCandidate?.(probe, start, end), 'bubbler');
    if (api.inkVacAbsorbCandidate) for (const actor of G.actors || []) {
      if (actor.alive && actor.team !== b.team)
        consider(api.inkVacAbsorbCandidate(actor, start, end, probe), 'ink-vac');
    }
    return best;
  };

  Projectiles.prototype.kitBeamDefense = function (owner, start, dir, length, damage) {
    if (this.s3BeamDefense?.owner === owner) return this.s3BeamDefense.candidate;
    const p = { owner, team: owner.team, prev: start, pos: start.clone().addScaledVector(dir, length),
      vel: dir, damage, type: 'beam', size: 0, ghost: false };
    return this.kitDefenseCandidate(p);
  };
  // Keep the native blast's reach, LOS, paint and damage loop. Add the dome
  // only at the existing actor-hit boundary, using the same explosion context.
  for (const [method, descriptor] of [
    ['_blastBurst', p => ({ origin: null, bands: (p.s3SpecialWeapon || api.WEAPONS.blaster).splashBands ||
      (p.s3SpecialWeapon || api.WEAPONS.blaster).damageBands, linear: true })],
    ['_explodeBomb', b => ({ origin: b.pos, bands: kitBombDamageBands(api.SUB, b, api.SUB.bomb.damageBands), linear: false })],
  ]) {
    const native = Projectiles.prototype[method];
    Projectiles.prototype[method] = function (p, ...args) {
      const previous = this.s3ExplosionDefense;
      const spec = descriptor(p);
      this.s3ExplosionDefense = { projectile: p, origin: spec.origin || args[0], bands: spec.bands,
        linear: spec.linear, spent: new Map() };
      try { return native.call(this, p, ...args); }
      finally { this.s3ExplosionDefense = previous; }
    };
  }
  const applyHit = Projectiles.prototype.applyHit;
  Projectiles.prototype.applyHit = function (attacker, victim, ...args) {
    const context = this.s3ExplosionDefense;
    if (context && context.projectile.owner === attacker) {
      const p = context.projectile;
      if (p.ghost) return;
      const end = victim.pos.clone(); end.y += .7;
      const probe = { owner: attacker, team: p.team, damage: 0, size: 0, ghost: false, s3BubblerRow: explosionBubblerRow(p) };
      const candidate = this.kitBarrierCandidate?.(probe, context.origin, end);
      if (candidate) {
        const damage = distanceDamage(context.bands, candidate.distance, context.linear);
        const old = context.spent.get(candidate.domeId) || 0;
        if (damage > old) {
          context.spent.set(candidate.domeId, damage); probe.damage = damage - old;
          this.kitBarrierCandidate(probe, context.origin, end)?.onHit();
        }
        return;
      }
    }
    return applyHit.call(this, attacker, victim, ...args);
  };
  return api;
}

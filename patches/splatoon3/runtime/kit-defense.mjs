// Special contacts are candidates in the native swept segment, never a second step.
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
  return api;
}

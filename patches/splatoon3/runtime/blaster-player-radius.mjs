// Pinned Splatoon 3 Ver. 11.3.0 regular Blaster BulletSimpleCollisionParam:
// InitRadiusForPlayer: 0.285, EndRadiusForPlayer: 0.285.
// Field collision radius is 0.2 (tracked separately); visual blob size remains p.size (0.26).
export const BLASTER_PLAYER_COLLISION_RADIUS = 0.285;

export function blasterPlayerCollisionRadius(p) {
  if (!p) return 0;
  if (p.type === 'blast') return BLASTER_PLAYER_COLLISION_RADIUS;
  return p.s3PlayerRadius ?? p.size;
}

export function installBlasterPlayerRadius({ Projectiles }) {
  if (!Projectiles || !Projectiles.prototype) return;
  const tag = Symbol.for('inkwave.s3.blaster-player-radius.v1');
  if (Projectiles.prototype[tag]) return;
  Object.defineProperty(Projectiles.prototype, tag, { value: true });

  const fresh = Projectiles.prototype._new;
  if (fresh) {
    Projectiles.prototype._new = function (...args) {
      const p = fresh.apply(this, args);
      p.s3PlayerRadius = null;
      return p;
    };
  }

  const push = Projectiles.prototype._push;
  if (push) {
    Projectiles.prototype._push = function (p) {
      if (p && p.type === 'blast') {
        p.s3PlayerRadius = BLASTER_PLAYER_COLLISION_RADIUS;
      }
      return push.call(this, p);
    };
  }
}

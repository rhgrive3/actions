// One deadline authority gate; presentation continues to own its own clock.
export function turfCombatAllowed(G) {
  const m = G?.match;
  if (!m || m.bossMode || m.attract || (m.mode != null && m.mode !== 'turf') || m.state == null) return true;
  return m.state === 'playing' && (m.s3DeadlineStep === true || !Number.isFinite(m.time) || m.time > 0);
}
const INSTALLED = Symbol.for('inkwave.turf-combat-gate.v1');
export function installTurfCombatGate({G, Actor, Projectiles, NetMatch}) {
  const A = Actor.prototype;
  if (Object.hasOwn(A, INSTALLED)) return;
  Object.defineProperty(A, INSTALLED, {value:true});
  const guard = (target, key, denied) => {
    const original = target?.[key];
    if (typeof original !== 'function') return;
    target[key] = function (...args) {
      if (!turfCombatAllowed(G)) return denied;
      return original.apply(this,args);
    };
  };
  // damage covers every direct/continuous HP attack. splat also covers water,
  // fall and adapters that bypass damage; applyHit gates outgoing hit messages.
  guard(A,'damage',false); guard(A,'splat'); guard(A,'addTurf');
  guard(Projectiles?.prototype,'applyHit');
  guard(NetMatch?.prototype,'_hit'); guard(NetMatch?.prototype,'_remoteSplat');
  guard(NetMatch?.prototype,'_remoteRespawn');
  const applyRemote = NetMatch?.prototype?.applyRemote;
  if (applyRemote) NetMatch.prototype.applyRemote = function (a,...args) {
    if (turfCombatAllowed(G)) return applyRemote.call(this,a,...args);
    // Still sample the visual timeline, but late owner packets cannot alter the
    // frozen finish combat state. The authoritative result packet retains stats.
    const hp=a.hp,alive=a.alive,stats={...a.stats};
    try { return applyRemote.call(this,a,...args); }
    finally { a.hp=hp; a.alive=alive; Object.assign(a.stats,stats); }
  };
}

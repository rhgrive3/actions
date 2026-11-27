// Presentation-only access to a native special temporarily masked by its
// gameplay wrapper. Never restore specialActive inside the delegated update:
// native movement, main/sub admission and clocks must still see the mask.
const CONTEXT = Symbol.for('inkwave.s3.special-presentation-owner.v1');
const KILLER_WAIL_UNLOCK_S = 40 / 60;

// True when no special is active, or the active special still permits the
// player's equipped main weapon (Killer Wail 5.1 after its 40F lock, or
// Zipcaster while in its ready phase between hooks).
export function specialAllowsMainWeapon(actor) {
  const s = actor?.specialActive;
  if (!s) return true;
  if (s.id === 'killerWail') {
    const t = actor._s3AllSpecialState?.id === 'killerWail' ? actor._s3AllSpecialState.t : s.t;
    return Number.isFinite(t) && t + 1e-8 >= KILLER_WAIL_UNLOCK_S;
  }
  if (s.id === 'zipcaster') {
    const phase = actor._s3AllSpecialState?.id === 'zipcaster'
      ? actor._s3AllSpecialState.phase
      : (s.phase ?? (s.net === true ? 'ready' : undefined));
    return phase === 'ready';
  }
  return false;
}

// True when no special is active, or the active special still permits sub
// weapon aim/throw presentation (Killer Wail 5.1 post-40F, or Storm hold).
export function specialAllowsSubWeapon(actor) {
  const s = actor?.specialActive;
  if (!s) return true;
  if (s.id === 'killerWail') {
    const t = actor._s3AllSpecialState?.id === 'killerWail' ? actor._s3AllSpecialState.t : s.t;
    return Number.isFinite(t) && t + 1e-8 >= KILLER_WAIL_UNLOCK_S;
  }
  if (s.id === 'storm') return s.phase === 'hold';
  return false;
}

// These specials retain the native swim/climb/squid presentation. The actor
// already owns whether each action is admitted; presentation must not turn an
// admitted squid back into a human merely because a special is still active.
export function specialKeepsNativeForm(id) {
  const key = typeof id === 'string' ? id : (id?.specialActive?.id ?? id?.id);
  return key === 'trizooka' || key === 'killerWail' || key === 'zipcaster'
    || key === 'superChump' || key === 'inkjet' || key === 'krakenRoyale' || key === 'ultraStamp'
    || key === 'waveBreaker' || key === 'splattercolorScreen' || key === 'storm' || key === 'tacticooler'
    || key === 'tentaMissiles';
}

export function specialPresentationToken(actor) {
  if (actor?.specialActive) return actor.specialActive;
  const context = actor?.[CONTEXT];
  return context?.current() ? context.token : null;
}

export function withSpecialPresentation(actor, token, current, update) {
  const previous = actor[CONTEXT];
  actor[CONTEXT] = { token, current };
  try { return update(); }
  finally {
    if (previous === undefined) delete actor[CONTEXT];
    else actor[CONTEXT] = previous;
  }
}

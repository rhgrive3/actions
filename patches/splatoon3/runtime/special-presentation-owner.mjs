// Presentation-only access to a native special temporarily masked by its
// gameplay wrapper. Never restore specialActive inside the delegated update:
// native movement, main/sub admission and clocks must still see the mask.
const CONTEXT = Symbol.for('inkwave.s3.special-presentation-owner.v1');

// These specials retain the native swim/climb/squid presentation. The actor
// already owns whether each action is admitted; presentation must not turn an
// admitted squid back into a human merely because a special is still active.
export function specialKeepsNativeForm(id) {
  return id === 'trizooka' || id === 'killerWail' || id === 'zipcaster'
    || id === 'superChump' || id === 'inkjet' || id === 'krakenRoyale' || id === 'ultraStamp'
    || id === 'waveBreaker' || id === 'splattercolorScreen' || id === 'storm' || id === 'tacticooler';
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

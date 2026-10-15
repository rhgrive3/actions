// Presentation-only access to a native special temporarily masked by its
// gameplay wrapper. Never restore specialActive inside the delegated update:
// native movement, main/sub admission and clocks must still see the mask.
const CONTEXT = Symbol.for('inkwave.s3.special-presentation-owner.v1');

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

// Special state used for ranked objective eligibility (clam pickup/throw,
// Rainmaker pickup). Pure so the policy is testable without the browser runtime.
//
// #1669: the host's own observation of the actor's Special (the owner snapshot
// flag, rendered as `actor.specialActive`) takes precedence. An owner-
// authenticated `rki` command may only ADD a restriction before that snapshot
// arrives (e.g. a Special started this tick); it can never clear one. A fresh
// `special: null` therefore cannot lift Kraken Royale / Zipcaster / Inkjet
// limits. The restriction ends when the owner snapshot reports the Special is
// over and the 0.75 s command window has lapsed or been refreshed with null,
// so no restricted state is left behind.
export function objectiveSpecialFor(actor, command) {
  return actor?.specialActive?.id ?? command?.special ?? null;
}

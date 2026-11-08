// CPU form stability (owner report 2026-11-07: CPUs sometimes toggled
// squid -> human -> squid at very high speed).
//
// BotBrain recomputes intent.squid from scratch every tick from conditions
// such as the ink under its feet, the remaining path length and a firing
// pulse. At an ink edge, or when a one-tick fire pulse alternates with the
// travel rule, those conditions flip on consecutive ticks and the form
// followed them, each switch playing the form sound and splash.
//
// After a form change the CPU keeps the new form for at least BOT_FORM_HOLD
// seconds. Leaving squid form for an action that needs the humanoid (fire,
// sub, special) stays immediate, as does every frame owned by a native-stage
// traversal (climb/drop/jump attach) and death, super jump and specials.
// INKWAVE bot behaviour, not a Splatoon 3 measurement.
export const BOT_FORM_HOLD = 0.3;

export function stabilizeBotForm(actor, dt, traversal = false) {
  const it = actor?.intent;
  if (!it) return;
  const want = !!it.squid;
  const s = actor._s3BotForm || (actor._s3BotForm = { squid: want, t: Infinity });
  s.t += Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (!actor.alive || actor.superJumpState || actor.specialActive || actor.climbing || traversal) {
    s.squid = want; s.t = Infinity; return;
  }
  if (want === s.squid) return;
  const action = !want && (it.fire || it.sub || it.special || it.throw);
  if (action || s.t >= BOT_FORM_HOLD) { s.squid = want; s.t = 0; return; }
  it.squid = s.squid;
  // Holding squid form cancels nothing else; holding human form keeps the
  // humanoid move intent unchanged.
}

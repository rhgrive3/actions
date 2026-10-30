// Presentation calibration for the reported eight presses/second. These are
// INKWAVE timings, not extracted Nintendo transformation frames.
export const FORM_EXCHANGE = Object.freeze({ dive: 3 / 60, emerge: 3 / 60 });
export function formExchangeWeight(from, toKid, age) {
  const duration = toKid ? FORM_EXCHANGE.emerge : FORM_EXCHANGE.dive;
  const u = Math.max(0, Math.min(1, age / duration));
  return from + ((toKid ? 1 : 0) - from) * u * u * u * (10 + u * (-15 + 6 * u));
}

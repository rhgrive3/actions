// Cosmetic 60 Hz event trials. Two trials at 30 Hz, alternate trials at
// 120 Hz; one at 60 Hz preserves probabilities and RNG order. Cap hitch work.
export function nonWailVfxTicks(record, dt, enabled = true) {
  if (!enabled) { record.nonWailCarry = 0; return 0; }
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  const frames = (record.nonWailCarry || 0) + Math.min(2, dt * 60);
  const count = Math.min(2, Math.floor(frames + 1e-9));
  record.nonWailCarry = Math.max(0, frames - count);
  return count;
}

// One bounded emission on threshold crossing; keep the fractional phase and
// discard whole overdue intervals after hitches or camera-gated pauses.
export function consumeVfxPeriod(record, key, period) {
  const age = record[key] || 0;
  if (!(age + 1e-9 >= period)) return false;
  record[key] = Math.max(0, age - Math.floor((age + 1e-9) / period) * period);
  return true;
}

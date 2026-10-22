// Presentation-only clock: retain the existing 60 Hz emission budget at all
// render rates. Drop backlog after stalls instead of creating particle storms.
// This clock never touches gameplay clocks or either random-number generator.
export function inkjetVfxTicks(record, dt, enabled = true) {
  if (!enabled) { record.inkjetVfxCarry = 0; return 0; }
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  const frames = (record.inkjetVfxCarry || 0) + Math.min(dt * 60, 2);
  const count = Math.min(2, Math.floor(frames + 1e-9));
  record.inkjetVfxCarry = Math.max(0, frames - count);
  return count;
}

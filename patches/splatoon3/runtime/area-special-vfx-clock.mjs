// Tenta exhaust / Wail charge only. Preserve the existing 60 Hz opportunity
// rate rather than tying particle density to render callbacks. This is an
// INKWAVE continuity fix, not a measured Nintendo particle rate.
// At most two ticks are admitted per update; stalled time is discarded.
export function areaSpecialVfxTicks(record, dt) {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  const frames = (record.areaSpecialVfxCarry || 0) + Math.min(dt * 60, 2);
  const ticks = Math.min(2, Math.floor(frames + 1e-9));
  record.areaSpecialVfxCarry = Math.max(0, frames - ticks);
  return ticks;
}

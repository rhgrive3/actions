// Validate the authoritative result before any statistics or terminal state is
// committed. This is INKWAVE wire admission, not a retail protocol extraction.
export function validResultPacket(packet) {
  if (!packet || !Array.isArray(packet.cov) || packet.cov.length !== 2 ||
      !packet.cov.every(n => Number.isFinite(n) && n >= 0 && n <= 1) ||
      (packet.win !== 0 && packet.win !== 1)) return false;
  // Native Turf sendResult omits mode; preserve that older wire representation.
  if (packet.mode !== undefined && packet.mode !== 'turf' && packet.mode !== 'boss') return false;
  if (packet.st == null) return true;
  if (!Array.isArray(packet.st)) return false;
  for (const row of packet.st) {
    if (!Array.isArray(row) || row.length < 4 || !Number.isSafeInteger(row[0]) || row[0] < 0) return false;
    for (let i = 1; i < 4; i++) if (!Number.isFinite(row[i]) || row[i] < 0) return false;
    // Boss damage, weak hits and assists are optional in legacy result tuples.
    for (let i = 4; i < 7; i++) if (row[i] !== undefined && (!Number.isFinite(row[i]) || row[i] < 0)) return false;
  }
  return true;
}

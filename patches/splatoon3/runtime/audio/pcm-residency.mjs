// Optional reference accounting, not browser/process memory measurement. Sources
// already handed to AudioBufferSourceNode and opaque native decode allocations
// remain outside these reachable-bank identities.
export function pcmResidency(published, staged, decoded, pendingNativeDecodes = 0) {
  const live = new Map(), next = new Map(), raw = new Map();
  const addRows = (out, rows) => { for (const row of rows.values()) out.set(row.buffer, row.bytes); };
  addRows(live, published); addRows(next, staged);
  for (const buffer of decoded.values()) raw.set(buffer, buffer.length * buffer.numberOfChannels * 4);
  const sum = map => { let bytes = 0; for (const n of map.values()) bytes += n; return bytes; };
  const union = new Map(live); for (const [buffer, bytes] of next) union.set(buffer, bytes);
  const retained = new Map(union); for (const [buffer, bytes] of raw) retained.set(buffer, bytes);
  return { publishedBytes: sum(live), stagedBytes: sum(next), unionBytes: sum(union),
    decodedBytes: sum(raw), retainedBytes: sum(retained),
    publishedBuffers: live.size, stagedBuffers: next.size, retainedBuffers: retained.size,
    pendingNativeDecodes };
}

// A window contains complete events: every requested variant has settled before
// any new mapping from that window becomes live. Single-event/microbatch imports
// retain their original order and need only one final publication.
export function pcmEventWindows(clips, limit) {
  if (!limit) return [clips];
  const events = new Map();
  for (const clip of clips) {
    const key = clip.id + ':' + clip.event;
    if (!events.has(key)) events.set(key, []);
    events.get(key).push(clip);
  }
  if (events.size <= limit) return [clips];
  const windows = []; let next = [];
  for (const group of events.values()) {
    next.push(group);
    if (next.length === limit) { windows.push(next.flat()); next = []; }
  }
  if (next.length) windows.push(next.flat());
  return windows;
}

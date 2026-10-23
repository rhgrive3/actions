// QA only: wrap the real receiver without changing its arguments, return value,
// admission or clocks. Emit a bounded numeric record while the page is alive,
// so a later unresponsive-page diagnostic cannot erase startup evidence.
export async function installOwnerClockDiagnostic(moduleOrClass, options = {}) {
  const NetMatch = typeof moduleOrClass === 'string' ? (await import(moduleOrClass)).NetMatch : moduleOrClass;
  const proto = NetMatch.prototype;
  if (proto.__iwClockObserved) return false;
  const now = options.now || (() => performance.now() / 1000);
  const emit = options.emit || (row => console.debug('IW_OWNER_CLOCK_DIAGNOSTIC:' + JSON.stringify(row)));
  const number = value => Number.isFinite(value) ? value : null;
  const states = new WeakMap();
  let emitted = 0;
  const state = nm => {
    let value = states.get(nm);
    if (!value) { value = { peers: new Map(), tickCalls: 0 }; states.set(nm, value); }
    return value;
  };
  const actors = (nm, from) => [...nm.byNid.values()].filter(a => a.owner === from).slice(0, 2).map(a => ({
    sequence: number(a.net?._adoptionSeq), tick: number(a.net?._adoptionTick),
    bufferedSequence: number(a.net?.buf?.at(-1)?.adoption?.sequence),
    sampledSequence: number(a.net?.cur?.adoption?.sequence),
    spawn: ['aim', 'flight', 'landing'].includes(a.s3?.squidSpawn?.phase) ? a.s3.squidSpawn.phase : null,
  }));
  const originalTick = proto._tick, originalMessage = proto.onMessage;
  proto._tick = function (...args) { state(this).tickCalls++; return originalTick.apply(this, args); };
  proto.onMessage = function (from, data) {
    const kind = ['t', 'ocq', 'oca'].includes(data?.k) ? data.k : null;
    if (!kind || emitted >= 96) return originalMessage.apply(this, arguments);
    const s = state(this);
    if (!s.peers.has(from) && s.peers.size >= 2) return originalMessage.apply(this, arguments);
    let counts = s.peers.get(from);
    if (!counts) { counts = { peer: s.peers.size, received: 0, accepted: 0, rejected: 0, controls: 0 }; s.peers.set(from, counts); }
    const previous = this.peers.get(from), previousTs = number(previous?.lastTs);
    const receivedAt = number(now()), previousReceivedAt = number(previous?.lastReceiveAt), tickCalls = s.tickCalls;
    // Never catch/rewrite the native receiver's exception or return value.
    const result = originalMessage.apply(this, arguments);
    const after = this.peers.get(from), accepted = kind === 't' && after?.lastTs === data.ts && previousTs !== after.lastTs;
    if (kind === 't') { counts.received++; if (accepted) counts.accepted++; else counts.rejected++; }
    else counts.controls++;
    const n = kind === 't' ? counts.received : counts.controls;
    // First receipts, then powers of two; retain early rejection transitions.
    const rejection = kind === 't' && !accepted && counts.rejected <= 4;
    if (n <= 8 || (n & (n - 1)) === 0 || rejection) {
      const row = { schema: 1, kind, peer: counts.peer, bound: !!this.match, receivedAt,
        senderTs: number(data.ts), ownerTick: number(data.u), previousTs, previousReceivedAt,
        acceptedTs: number(after?.lastTs), acceptedReceivedAt: number(after?.lastReceiveAt),
        tickEntered: s.tickCalls > tickCalls, accepted, received: counts.received,
        acceptedCount: counts.accepted, rejectedCount: counts.rejected, controls: counts.controls,
        actors: actors(this, from) };
      emitted++;
      // Diagnostic output failure must never change the native transaction.
      try { emit(row); } catch {}
    }
    return result;
  };
  Object.defineProperty(proto, '__iwClockObserved', { value: true });
  return true;
}

// Browser console text is untrusted. Copy only bounded numeric/boolean fields
// and fixed labels, never actor IDs, nonces, payloads, URLs or exception text.
export function readOwnerClockDiagnostic(text) {
  const prefix = 'IW_OWNER_CLOCK_DIAGNOSTIC:';
  if (typeof text !== 'string' || !text.startsWith(prefix) || text.length > 4096) return null;
  let row;
  try { row = JSON.parse(text.slice(prefix.length)); } catch { return null; }
  if (!row || row.schema !== 1 || !['t', 'ocq', 'oca'].includes(row.kind)) return null;
  const number = value => Number.isFinite(value) ? value : null;
  const out = { schema: 1, kind: row.kind };
  for (const key of ['peer', 'receivedAt', 'senderTs', 'ownerTick', 'previousTs', 'previousReceivedAt', 'acceptedTs', 'acceptedReceivedAt', 'received', 'acceptedCount', 'rejectedCount', 'controls']) out[key] = number(row[key]);
  for (const key of ['bound', 'tickEntered', 'accepted']) out[key] = row[key] === true;
  out.actors = (Array.isArray(row.actors) ? row.actors : []).slice(0, 2).map(a => ({
    sequence: number(a?.sequence), tick: number(a?.tick), bufferedSequence: number(a?.bufferedSequence),
    sampledSequence: number(a?.sampledSequence), spawn: ['aim', 'flight', 'landing'].includes(a?.spawn) ? a.spawn : null,
  }));
  return out;
}

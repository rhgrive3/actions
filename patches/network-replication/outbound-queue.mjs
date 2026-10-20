// Owner event queue for NetMatch._sendTick (#1692).
//
// NetMatch records the owner's timeline events (paint, projectile births, specials)
// in `out` and ships them in the 20 Hz tick. Originally _sendTick moved every row
// into the packet and cleared `out` before handing the packet to the transport,
// ignoring the transport's answer. The transport refuses a frame when its socket is
// unavailable, when the frame exceeds the relay's 64 KiB limit, or when the socket's
// send backlog is past its cap, so those rows were simply lost and the receivers'
// timelines (paint ownership, projectile and special state) diverged.
//
// Here rows leave `out` only after the transport accepted the frame that carried
// them. Each tick sends at most one packet (with a fresh timestamp; receivers reject
// a repeated one) holding a prefix of the queue that
//   - has at most MAX_ROWS_PER_TICK rows (recipients truncate longer lists), and
//   - leaves room in the 64 KiB frame for everything else in the packet (actors,
//     clock, boss and sidecars), measured in UTF-8 bytes like the relay does.
// The rest stays queued, in order, for the next ordinary tick. If the transport still
// refuses a frame for its size (Transport sets `refused = 'size'`), the batch shrinks and
// then recovers step by step, so the sender converges instead of retrying a frame that
// cannot go out; a closed socket or send backlog just keeps the rows for later. Nothing is stored without
// bound: past MAX_QUEUED_ROWS the oldest rows are dropped and counted in
// stats.outDropped, and a single row too large for any frame is dropped and counted.

// Keep in step with MAX_RELAY_FRAME_BYTES in src/net/transport.js (asserted by tests).
export const OUTBOUND_FRAME_BYTES = 64 * 1024;
// Everything in a tick that is not an event row: measured about 2.6 KiB for eight local
// actors; the reserve also covers a host's boss snapshot and per-mode sidecars.
export const OUTBOUND_NON_EVENT_RESERVE_BYTES = 16 * 1024;
export const OUTBOUND_ROW_BUDGET_BYTES = OUTBOUND_FRAME_BYTES - 2 /* "b|" */ - OUTBOUND_NON_EVENT_RESERVE_BYTES;
// The receiving NetMatch truncates `e` at 256 rows.
export const MAX_ROWS_PER_TICK = 256;
export const MAX_QUEUED_ROWS = 4096;

function utf8Bytes(text) {
  let size = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) size++;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { size += 2; i++; }
    else size += 2;
  }
  return size;
}
// Serialized size of a row inside the JSON array, including its separator.
function rowBytes(row) {
  try { return utf8Bytes(JSON.stringify(row)) + 1; } catch { return Infinity; }
}

export function installOutboundQueue(NetMatch) {
  const sendTick = NetMatch.prototype._sendTick;
  NetMatch.prototype._sendTick = function (...args) {
    const queue = this.out;
    if (!Array.isArray(queue) || queue.length === 0) return sendTick.apply(this, args);
    const stats = this.stats || (this.stats = {});
    const drop = count => { stats.outDropped = (stats.outDropped || 0) + count; };

    if (queue.length > MAX_QUEUED_ROWS) { drop(queue.length - MAX_QUEUED_ROWS); queue.splice(0, queue.length - MAX_QUEUED_ROWS); }

    // The largest prefix within this tick's row and byte budgets.
    const limit = Math.min(MAX_ROWS_PER_TICK, Math.max(1, this._outBatchLimit || MAX_ROWS_PER_TICK));
    let count = 0, bytes = 0;
    while (count < queue.length && count < limit) {
      const size = rowBytes(queue[count]);
      if (size > OUTBOUND_ROW_BUDGET_BYTES) { queue.splice(count, 1); drop(1); continue; }   // can never be sent
      if (bytes + size > OUTBOUND_ROW_BUDGET_BYTES) break;
      bytes += size; count++;
    }
    if (count === 0) return sendTick.apply(this, args);

    // _sendTick takes whatever is in this.out (rows it records itself land there
    // too), so it is given a copy of the batch and the real queue stays intact.
    const batch = queue.slice(0, count);
    this.out = batch;
    this._sendTickResult = undefined;
    try { return sendTick.apply(this, args); }
    finally {
      const consumed = this.out !== batch;           // _sendTick took the batch and reset out
      const during = consumed ? this.out : [];       // rows recorded after it took the batch
      const early = batch.slice(count);              // rows recorded while building the packet
      this.out = queue;
      // _sendTickResult is set by the packet's final send: true when a transport existed and
      // did not answer `false` (a stub that returns nothing counts as accepting, as before).
      const delivered = consumed && this._sendTickResult === true;
      if (delivered) {
        queue.splice(0, count);   // removed only once the transport accepted the packet carrying them
        // Recover gradually: doubling straight back would hit the same wall every other tick.
        this._outBatchLimit = Math.min(MAX_ROWS_PER_TICK, limit + Math.ceil(limit / 4));
      } else if (this.s?.tr?.refused === 'size') {
        // Our byte estimate was too generous for this transport. Other refusals (a closed socket,
        // a send backlog) say nothing about batch size, so they keep the limit and the rows.
        this._outBatchLimit = Math.max(1, Math.floor(count / 2));
      }
      for (const row of early) queue.push(row);
      for (const row of during) queue.push(row);
    }
  };
}

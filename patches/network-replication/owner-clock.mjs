// #1767: a receiver-originated freshness proof bounds the sender's clock
// without treating a queued packet's late arrival as its original send time.
// Current NetSession instances require this COMPAT-epoch contract. Older custom
// session embeddings without its explicit version retain their existing gate.
import { validOwnerTickAdvance, validOwnerClockOriginAdvance } from './snapshot-guard.mjs';
import { utf8ByteLength } from './utf8-length.mjs';

export const OWNER_CLOCK_VERSION = 1;
export const OWNER_CLOCK_CHALLENGE_TTL = 2;
export const OWNER_CLOCK_REFUSED_RETRY = 0.1;
export const OWNER_CLOCK_PENDING_PACKETS = 64;
export const OWNER_CLOCK_PENDING_BYTES = 256 * 1024;
const states = new WeakMap();
// The relay stamp exists only during Transport's synchronous dispatch. Preserve
// it on internally replayed packets, never in JSON or a sender-controlled field.
const queuedRelayReceipt = Symbol('queued owner-clock relay receipt');
function relayReceipt(nm, from, packet) {
  if (packet && Object.hasOwn(packet, queuedRelayReceipt)) return packet[queuedRelayReceipt];
  const millis = nm.s.tr?.relayReceipt?.(from);
  return Number.isSafeInteger(millis) && millis >= 0 ? millis / 1000 : null;
}
// Offline imports do not need network encoders; initialize only on an online packet.
let encoder;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const nonceValid = n => typeof n === 'string' && /^[a-f0-9]{32}$/.test(n);
const enabled = nm => nm.s?.ownerClockVersion === OWNER_CLOCK_VERSION
  && typeof nm.cfg?.id === 'string' && nm.cfg.id.length > 0 && nm.cfg.id.length <= 128;
const member = (nm, from) => typeof from === 'string' && from !== nm.myId && nm.s?._members?.has(from);
function state(nm) {
  let s = states.get(nm);
  if (!s) { s = { closed: false, peers: new Map(), unproven: 0 }; states.set(nm, s); }
  return s;
}
function peer(nm, from) {
  const s = state(nm);
  if (s.closed || !member(nm, from)) return null;
  let p = s.peers.get(from);
  if (!p && s.peers.size < 16) {
    p = { required: true, origin: null, relayAnchor: null, pending: null, queue: [], bytes: 0,
      dropped: 0, answeredAt: -Infinity };
    s.peers.set(from, p);
    s.unproven++;
  }
  return p;
}
function send(nm, to, payload) {
  // Transport failures must leave an unanswered challenge available for retry.
  try { return nm.s.tr?.sendTo(to, payload) === true; } catch { return false; }
}
function request(nm, from, p, at, resend = false) {
  if (p.origin || !finite(at) || at < 0) return;
  if (p.pending && at >= p.pending.at && at - p.pending.at <= OWNER_CLOCK_CHALLENGE_TTL) {
    if (!resend && (p.pending.sent || at < p.pending.retryAt)) return;
    // Repeating the SAME nonce does not renew its origin or expiration time.
  } else {
    const words = new Uint32Array(4);
    globalThis.crypto.getRandomValues(words);
    p.pending = { nonce: Array.from(words, x => x.toString(16).padStart(8, '0')).join(''), at, sent: false, retryAt: at };
  }
  // Only locally refused writes use the short retry. Keep one nonce and its
  // original freshness deadline; successful sends retain the existing TTL.
  const pending = p.pending;
  pending.retryAt = at + OWNER_CLOCK_REFUSED_RETRY;
  const sent = send(nm, from, { k: 'ocq', v: OWNER_CLOCK_VERSION, m: nm.cfg.id, n: pending.nonce });
  pending.sent ||= sent;
}
export function beginOwnerClock(nm, at) {
  if (!enabled(nm) || !nm.match) return;
  for (const from of nm.s._members.keys()) {
    const p = peer(nm, from);
    if (p) request(nm, from, p, at);
  }
}
export function advanceOwnerClock(nm, at) {
  if (!enabled(nm) || !nm.match || states.get(nm)?.closed) return;
  const s=state(nm);
  if(!s.unproven)return;
  for (const [from, p] of s.peers)
    if (p.required && !p.origin) request(nm, from, p, at);
}
export function retireOwnerClock(nm, from) {
  const s=states.get(nm),p=s?.peers.get(from);
  if(p){if(!p.origin)s.unproven--;s.peers.delete(from);}
}
export function closeOwnerClock(nm) {
  const s = state(nm); s.closed = true; s.peers.clear(); s.unproven=0;
}

// Run before paint-codec and birth normalization: queued wire messages must
// traverse those owners exactly once, only after a fresh clock is established.
export function handleOwnerClockMessage(nm, from, d, at) {
  if (!enabled(nm) || !d || typeof d !== 'object') return false;
  const control = d.k === 'ocq' || d.k === 'oca';
  if (!member(nm, from) || states.get(nm)?.closed || !nm.match)
    return control || d.k === 't' && d.oc === OWNER_CLOCK_VERSION;
  if (control) {
    if (d.v !== OWNER_CLOCK_VERSION || d.m !== nm.cfg.id || !nonceValid(d.n) || !finite(at) || at < 0) return true;
    const p = peer(nm, from);
    if (!p) return true;
    if (d.k === 'ocq') {
      if (at - p.answeredAt < 0.25) return true;
      p.answeredAt = at;
      send(nm, from, { k: 'oca', v: OWNER_CLOCK_VERSION, m: nm.cfg.id, n: d.n, ts: Math.round(at * 1000) / 1000 });
      return true;
    }
    const q = p.pending;
    if (p.origin || !q || q.nonce !== d.n || at < q.at || at - q.at > OWNER_CLOCK_CHALLENGE_TTL
      || !validOwnerTickAdvance(d.ts, undefined)) return true;
    // An advertised protocol cannot erase a previously accepted legacy clock.
    const previous = nm.peers.get(from);
    if (previous?.lastTs !== undefined && d.ts !== previous.lastTs
      && !validOwnerTickAdvance(d.ts, previous.lastTs, at, previous.lastReceiveAt)) return true;
    p.required = true;
    p.origin = { timestamp: d.ts, sentAt: q.at };
    state(nm).unproven--;
    p.pending = null;
    const queued = p.queue; p.queue = []; p.bytes = 0;
    for (const { wire, receipt } of queued) {
      const packet = JSON.parse(wire);
      // Enumerable symbols survive the existing {...packet} admission wrappers
      // while remaining absent from Object.keys/JSON and inaccessible to peers.
      Object.defineProperty(packet, queuedRelayReceipt, { value: receipt, enumerable: true });
      nm.onMessage(from, packet);
    }
    return true;
  }
  if (d.k !== 't') return false;
  if (d.oc !== undefined && d.oc !== OWNER_CLOCK_VERSION) return true;
  if (d.oc === OWNER_CLOCK_VERSION && d.ocm !== nm.cfg.id) return true;
  const receipt = relayReceipt(nm, from, d);
  if (nm.s.tr?._relayClock === true && receipt === null) return true;
  const p = peer(nm, from);
  if (!p) return true;
  if (d.oc !== OWNER_CLOCK_VERSION) return p.required; // never downgrade after negotiation
  const firstCurrentPacket = !p.seenCurrent;
  p.seenCurrent = true;
  p.required = true;
  if (p.origin) return false;
  if (!validOwnerTickAdvance(d.ts, undefined)) return true;
  if (p.queue.length >= OWNER_CLOCK_PENDING_PACKETS || p.bytes >= OWNER_CLOCK_PENDING_BYTES) {
    p.dropped++;
    request(nm, from, p, at, firstCurrentPacket);
    return true;
  }
  try {
    const wire = JSON.stringify(d), bytes = wire.length <= 1024 ? utf8ByteLength(wire)
      : (encoder ||= new TextEncoder()).encode(wire).byteLength;
    if (p.queue.length < OWNER_CLOCK_PENDING_PACKETS && p.bytes + bytes <= OWNER_CLOCK_PENDING_BYTES) {
      p.queue.push({ wire, receipt }); p.bytes += bytes;
    } else p.dropped++;
  } catch { p.dropped++; }
  request(nm, from, p, at, firstCurrentPacket);
  return true;
}

export function validOwnerClockTick(nm, from, d, at, previous, legacyAt = at, previousLegacyAt = previous?.lastReceiveAt) {
  if (!enabled(nm)) return validOwnerTickAdvance(d.ts, previous?.lastTs, legacyAt, previousLegacyAt);
  if (!member(nm, from) || states.get(nm)?.closed) return false;
  const p = peer(nm, from);
  if (!p) return false;
  if (d.oc !== undefined && d.oc !== OWNER_CLOCK_VERSION || p.required && d.oc !== OWNER_CLOCK_VERSION
    || d.oc === OWNER_CLOCK_VERSION && d.ocm !== nm.cfg.id) return false;
  if (d.oc === OWNER_CLOCK_VERSION) p.required = true;
  if (!p.required) return validOwnerTickAdvance(d.ts, previous?.lastTs, legacyAt, previousLegacyAt);
  if (!p.origin) { request(nm, from, p, at); return false; }
  if (!validOwnerClockOriginAdvance(d.ts, previous?.lastTs, at, p.origin.timestamp, p.origin.sentAt)) return false;
  const receipt = relayReceipt(nm, from, d);
  if (nm.s.tr?._relayClock === true && receipt === null) return false;
  if (p.relayAnchor) {
    if (receipt === null || !validOwnerClockOriginAdvance(d.ts, previous?.lastTs, receipt,
      p.relayAnchor.timestamp, p.relayAnchor.receipt)) return false;
  } else if (receipt !== null) {
    // A nonce proves freshness, not the truth of the owner's clock value. This
    // second fixed origin bounds progress by authenticated forwarding time,
    // including old startup packets delivered together after a browser hitch.
    p.relayAnchor = { timestamp: d.ts, receipt };
  }
  return true;
}

export function ownerClockStatus(nm, from) {
  const p = states.get(nm)?.peers.get(from);
  return p ? { required: p.required, origin: p.origin ? { ...p.origin } : null,
    relayAnchor: p.relayAnchor ? { ...p.relayAnchor } : null,
    awaiting: !!p.pending, pendingPackets: p.queue.length, pendingBytes: p.bytes, dropped: p.dropped } : null;
}

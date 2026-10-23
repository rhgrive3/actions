// #1767: a receiver-originated freshness proof bounds the sender's clock
// without treating a queued packet's late arrival as its original send time.
// Current NetSession instances require this COMPAT-epoch contract. Older custom
// session embeddings without its explicit version retain their existing gate.
import { validOwnerTickAdvance, validOwnerClockOriginAdvance } from './snapshot-guard.mjs';

export const OWNER_CLOCK_VERSION = 1;
export const OWNER_CLOCK_CHALLENGE_TTL = 2;
export const OWNER_CLOCK_PENDING_PACKETS = 64;
export const OWNER_CLOCK_PENDING_BYTES = 256 * 1024;
const states = new WeakMap();
// Offline imports do not need network encoders; initialize only on an online packet.
let encoder;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const nonceValid = n => typeof n === 'string' && /^[a-f0-9]{32}$/.test(n);
const enabled = nm => nm.s?.ownerClockVersion === OWNER_CLOCK_VERSION
  && typeof nm.cfg?.id === 'string' && nm.cfg.id.length > 0 && nm.cfg.id.length <= 128;
const member = (nm, from) => typeof from === 'string' && from !== nm.myId && nm.s?._members?.has(from);
function state(nm) {
  let s = states.get(nm);
  if (!s) { s = { closed: false, peers: new Map() }; states.set(nm, s); }
  return s;
}
function peer(nm, from) {
  const s = state(nm);
  if (s.closed || !member(nm, from)) return null;
  let p = s.peers.get(from);
  if (!p && s.peers.size < 16) {
    p = { required: true, origin: null, pending: null, queue: [], bytes: 0,
      dropped: 0, answeredAt: -Infinity };
    s.peers.set(from, p);
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
    if (!resend) return;
    // Repeating the SAME nonce does not renew its origin or expiration time.
  } else {
    const words = new Uint32Array(4);
    globalThis.crypto.getRandomValues(words);
    p.pending = { nonce: Array.from(words, x => x.toString(16).padStart(8, '0')).join(''), at };
  }
  send(nm, from, { k: 'ocq', v: OWNER_CLOCK_VERSION, m: nm.cfg.id, n: p.pending.nonce });
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
  for (const [from, p] of state(nm).peers)
    if (p.required && !p.origin) request(nm, from, p, at);
}
export function retireOwnerClock(nm, from) { states.get(nm)?.peers.delete(from); }
export function closeOwnerClock(nm) {
  const s = state(nm); s.closed = true; s.peers.clear();
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
    p.pending = null;
    const queued = p.queue; p.queue = []; p.bytes = 0;
    for (const wire of queued) nm.onMessage(from, JSON.parse(wire));
    return true;
  }
  if (d.k !== 't') return false;
  if (d.oc !== undefined && d.oc !== OWNER_CLOCK_VERSION) return true;
  if (d.oc === OWNER_CLOCK_VERSION && d.ocm !== nm.cfg.id) return true;
  const p = peer(nm, from);
  if (!p) return true;
  if (d.oc !== OWNER_CLOCK_VERSION) return p.required; // never downgrade after negotiation
  const firstCurrentPacket = !p.seenCurrent;
  p.seenCurrent = true;
  p.required = true;
  if (p.origin) return false;
  if (!validOwnerTickAdvance(d.ts, undefined)) return true;
  try {
    const wire = JSON.stringify(d), bytes = (encoder ||= new TextEncoder()).encode(wire).byteLength;
    if (p.queue.length < OWNER_CLOCK_PENDING_PACKETS && p.bytes + bytes <= OWNER_CLOCK_PENDING_BYTES) {
      p.queue.push(wire); p.bytes += bytes;
    } else p.dropped++;
  } catch { p.dropped++; }
  request(nm, from, p, at, firstCurrentPacket);
  return true;
}

export function validOwnerClockTick(nm, from, d, at, previous) {
  if (!enabled(nm)) return validOwnerTickAdvance(d.ts, previous?.lastTs, at, previous?.lastReceiveAt);
  if (!member(nm, from) || states.get(nm)?.closed) return false;
  const p = peer(nm, from);
  if (!p) return false;
  if (d.oc !== undefined && d.oc !== OWNER_CLOCK_VERSION || p.required && d.oc !== OWNER_CLOCK_VERSION
    || d.oc === OWNER_CLOCK_VERSION && d.ocm !== nm.cfg.id) return false;
  if (d.oc === OWNER_CLOCK_VERSION) p.required = true;
  if (!p.required) return validOwnerTickAdvance(d.ts, previous?.lastTs, at, previous?.lastReceiveAt);
  if (!p.origin) { request(nm, from, p, at); return false; }
  return validOwnerClockOriginAdvance(d.ts, previous?.lastTs, at, p.origin.timestamp, p.origin.sentAt);
}

export function ownerClockStatus(nm, from) {
  const p = states.get(nm)?.peers.get(from);
  return p ? { required: p.required, origin: p.origin ? { ...p.origin } : null,
    awaiting: !!p.pending, pendingPackets: p.queue.length, pendingBytes: p.bytes, dropped: p.dropped } : null;
}

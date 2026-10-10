// #1185: A room can start another match using the same actor nids/lives
// and hit sequence numbers. Combat transactions belong to a match, not a
// transport connection. Keep this strictly on the composed NetMatch source.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error('Match-bound hit patch conflict: ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptMatchHitIdentity(rel, code) {
  if (rel !== 'src/net/netmatch.js') return code;
  // Record the match on the ORIGINAL object. All queued retries and owner
  // handoff paths reuse this object, so they cannot silently retag a packet.
  code = once(code,
    '      seq: ++this.hitNextSeq };',
    '      seq: ++this.hitNextSeq };\n    message.m = this.cfg.id;',
    'outgoing hit match ID');
  // Acknowledgements may update HP, credits and pending receipt state;
  // stamp them at the victim authority, not at the transport relay.
  code = once(code,
    "    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);",
    "    ack.m = this.cfg.id;\n    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);",
    'outgoing hit acknowledgement match ID');
  code = once(code,
    '  onMessage(from, d) {\n    switch (d.k) {',
    `  onMessage(from, d) {
    if (!d || typeof d !== 'object') return;
    // Reject old-round and legacy untagged combat *before* the hit sequence,
    // damage or ACK/revision handlers can mutate any new-round state.
    if ((d.k === 'hit' || d.k === 'hit_ack') &&
        (typeof this.cfg?.id !== 'string' || d.m !== this.cfg.id)) return;
    switch (d.k) {`,
    'incoming match-bound hit/ACK');
  return code;
}

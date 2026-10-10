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
  // In source-only fixtures the ACK path exists already. In the actual build,
  // the network-replication adapter introduces the ACK later, so it must stamp
  // the ACK at creation time rather than forcing an unavailable early anchor.
  if (code.includes("    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);"))
    code = once(code,
      "    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);",
      "    ack.m = this.cfg.id;\n    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);",
      'outgoing hit acknowledgement match ID');
  // The #427 source-only ACK producer is created by the quality layer,
  // before the final network adapter replaces it with a richer ACK. Bind
  // *both* producer shapes to the match, not only the final broadcast one.
  const sourceAck = "    this.s.tr?.sendTo(from ?? atk.owner, { k: 'hit_ack', h: d.h, v: v.nid, a: atk.nid, d: r2(acceptedDmg), kld: killed ? 1 : 0, vl: v.netLife ?? 0 });";
  if (code.includes(sourceAck))
    code = once(code, sourceAck, sourceAck.replace("{ k: 'hit_ack',", "{ k: 'hit_ack', m: this.cfg.id,"), 'source-only ACK match ID');
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

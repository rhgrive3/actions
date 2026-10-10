export function adaptKitPaintAdmission(code,once){
 const patch=(a,b,label)=>{code=once(code,a,b,'kit paint: '+label);};
 code="import { kitBombBirthMetadata, recordKitBombBirth, acceptPendingKitBirths, prepareKitPaintEvents, kitPaintPlayback, kitPaintRadiusAllowed, consumeKitPaint, retireSlosherPaintProjectile } from '../../patches/network-replication/kit-paint-admission.mjs';\n"+code;
 code="import { recordSlosherPaintBirth, slosherBirthInkMeta } from '../../patches/network-replication/slosher-paint-admission.mjs';\n"+code;
 patch("    this._rec(['p', o.nid","    const projectileBirth = this._rec(['p', o.nid",'capture projectile birth identity');
 patch('\n  }\n\n  recBomb(b) {','\n    recordSlosherPaintBirth(this,p,projectileBirth);\n  }\n\n  recBomb(b) {','record slosher terrain impact permit');
 patch('p.inkMeta || null, kitVolleyPacketIndex','slosherBirthInkMeta(this,p), kitVolleyPacketIndex','epoch and life in existing projectile metadata slot');
 const birth="const s3kit = kitBombPacket(b); if (!s3kit) return; this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z), b.kind === 'storm' ? { stormDuration: b.s3StormDuration } : null, s3kit[0], s3kit[1]]);";
 if(code.includes(birth))patch(birth,birth.replace("this._rec(","const birth = this._rec(").replace('s3kit[1]]);','s3kit[1], ...(kitBombBirthMetadata(this,b) ? [kitBombBirthMetadata(this,b)] : [])]); recordKitBombBirth(this,b,birth);'),'birth action metadata');
 patch('  _tick(from, d) {', '  _tick(from, d) {\n    if (Array.isArray(d?.e)) d = { ...d, e: d.e.filter(Array.isArray) };\n    acceptPendingKitBirths(this, from, d);', 'awaited birth in reordered envelope');
 // Legacy uncomposed fixtures have no kit launch producer and keep their cap.
 patch('nextPaintOrder(this, !!o.instant)]);','nextPaintOrder(this, !!o.instant), ...((o.kitPaint || o.projectilePaint) ? [o.kitPaint || o.projectilePaint] : [])]);','core action metadata');
 patch('if (d.e) for (const e of d.e) {','const kitPreparedEvents = [];\n    if (d.e) for (const e of d.e) {','prepare native envelope proofs before deferral');
 patch("      if (e[1] === 's') {\n        if (e._netSeq !== undefined", "      kitPreparedEvents.push(e);\n    }\n    for (const e of prepareKitPaintEvents(this, from, { ...d, e: kitPreparedEvents })) {\n      if (e[1] === 's') {\n        if (e._netSeq !== undefined",'causal birth before core admission');
 patch("        for (const p of G.projectiles?.list || []) if (p.ghost && p.owner?.nid === e[2] && p._netId === e[3])","        retireSlosherPaintProjectile(this,from,e);\n        for (const p of G.projectiles?.list || []) if (p.ghost && p.owner?.nid === e[2] && p._netId === e[3])",'terminal projectile retires unused terrain permit');
 patch('  _play(from, e) {', `  _queueKitRecoveredEvents(from, rows) {
    const p = this.peers.get(from); if (!p) return;
    for (const e of rows) {
      e._netPeer = from;
      if (e[1] === 's') {
        if (e._netSeq <= Math.max(p._lastEventSeq || 0, p._lastPaintSeq || 0, this._paintClockState.applied.get(from) || 0)
          || receivePaintOrder(this, from, e) === false) continue;
        p._lastPaintSeq = e._netSeq;
      }
      if (p.events.length >= 512) break; // #1200: recovered births cannot overflow the same bounded event FIFO
      p.events.push(e);
    }
    p.events.sort((a,b) => (a._netSeq ?? Infinity) - (b._netSeq ?? Infinity));
  }

  _play(from, e) {`, 'recovered rows retain deadline proof and ordinary paint admission');
 patch("  _play(from, e) {\n    if (e[1] === 's')", "  _play(from, e) {\n    if (!kitPaintPlayback(this, from, e)) return;\n    if (e[1] === 's')",'causal playback order');
 patch('if (Math.fround(e[5]) > Math.fround(PAINT_RADIUS_MAX)) return false;','if (!kitPaintRadiusAllowed(nm, from, e, PAINT_RADIUS_MAX)) return false;','source-derived action-specific radius');
 patch('    const state = this._paintClockState;\n    if (e._netSeq !== undefined)', '    if (!consumeKitPaint(this, e._netPeer, e)) return false;\n    const state = this._paintClockState;\n    if (e._netSeq !== undefined)','single authoritative core');
 return code;
}

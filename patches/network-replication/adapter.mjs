// Network owns the wire contract. Compose LAST; upstream modules and gameplay
// tuning remain immutable. Each connection fails closed on source drift.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const NETWORK_ROOT = fileURLToPath(new URL('./', import.meta.url));
function once(code, before, after, label) {
  const i = code.indexOf(before);
  if (i < 0 || code.indexOf(before, i + before.length) >= 0) throw Error('Network replication anchor mismatch: ' + label);
  return code.slice(0,i) + after + code.slice(i+before.length);
}
export function networkIdentity() {
  return Object.fromEntries(['adapter.mjs'].map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex')]));
}
export function adaptNetworkSource(rel, code) {
  const patch = (before,after,label) => { code = once(code,before,after,rel+': '+label); };
  if (rel === 'src/net/netmatch.js') {
    patch('  dispose() {\n    for (const u of this.unsubs)', `  dispose() {
    retireNetworkGhosts();
    for (const u of this.unsubs)`, 'session disposal retirement');
    patch('  _remove(a) {\n    this.byNid.delete(a.nid);', `  _remove(a) {
    retireNetworkGhosts(a);
    this.byNid.delete(a.nid);`, 'departed owner retirement');

    patch('  _rec(e) { this.out.push([r3(now()), ...e]); }', `  _rec(e) {
    const seq = this._eventSeq = (this._eventSeq || 0) + 1;
    const tick = Math.round((G.time || 0)*60);
    const event = [r3(now()), ...e, tick, seq]; event._netSeq = seq; event._netTick = tick; this.out.push(event);
  }`, 'ordered event identity');
    {
      const lifeTick = "const msg = { k: 't', ts: r3(now()), a, l: Object.fromEntries([...this.byNid.values()].filter(x => !x.remote).map(x => [x.nid, x.netLife ?? 0])) };";
      if (code.includes(lifeTick)) patch(lifeTick,
        "const msg = { k: 't', ts: r3(now()), a, l: Object.fromEntries([...this.byNid.values()].filter(x => !x.remote).map(x => [x.nid, x.netLife ?? 0])), u: Math.round((G.time || 0)*60) };",
        'owner simulation tick with combat life');
      else patch("const msg = { k: 't', ts: r3(now()), a };",
        "const msg = { k: 't', ts: r3(now()), a, u: Math.round((G.time || 0)*60) };",
        'owner simulation tick');
    }
    patch('for (const p of this.peers.values()) this._advance(p, dt);', 'for (const p of this.peers.values()) { this._advance(p,dt); sampleOwnerSimulation(p); }', 'sample owner simulation clock');
    patch('    // actors\n    if (d.a)', `    if (Number.isSafeInteger(d.u)) {
      const points = p.physicsPoints || (p.physicsPoints = []);
      points.push(d.ts,d.u); if (points.length > 80) { points.copyWithin(0,points.length-80); points.length = 80; }
    }
    // actors
    if (d.a)`, 'snapshot physics tick pair');
    patch('if (this.out.length) { msg.e = this.out; this.out = []; }', 'if (this.out.length) { msg.r = 2; msg.e = this.out; this.out = []; }', 'event schema only in event packets');
    patch('if (d.e) for (const e of d.e) p.events.push(e);', `if (d.e) for (const e of d.e) {
      if (!Array.isArray(e) || !Number.isFinite(e[0])) continue;
      if (d.r === 2) { const seq = e[e.length-1]; if (!Number.isSafeInteger(seq) || seq < 1) continue; e._netSeq = seq; const tick = e[e.length-2]; if (Number.isSafeInteger(tick)) e._netTick = tick; }
      // Receiver-created proof only: an event cannot supply its own authority.
      e._stormSnapshot = null;
      const stormNid = e[1] === 'b' && e[3] === 'storm' ? e[2]
        : e[1] === 'ev' && e[2] === 'special:use' && e[3]?.id === 'storm' ? e[3]?.actor?.n : null;
      const stormActor = this.byNid.get(stormNid), snap = stormActor?.net?.buf?.at(-1);
      if (stormActor?.remote && stormActor.owner === from && snap?.t === d.ts
        && Number.isSafeInteger(snap.life) && snap.life === stormActor.net.lastLife
        && (snap.f & F.alive) && (snap.f & F.special)
        && Number.isSafeInteger(d.u) && Number.isSafeInteger(e._netTick) && e._netTick >= 0
        && e._netTick >= (p.physicsPoints?.at(-3) ?? 0) && e._netTick <= d.u && e[0] <= d.ts) {
        e._stormSnapshot = { owner: from, life: snap.life, at: snap.t, tick: d.u };
      }
      p.events.push(e);
    }`, 'receive event identity');
    patch("    this._rec(['ev', name, packEvent(e)]);", "    this._rec(['ev',name,packEvent(e,name === 'weapon:fire' && (WEAPONS[e.weapon] || a.weapon)?.kind === 'charger')]);", 'preserve hitscan endpoint state');
    patch('r2(p.vel.x), r2(p.vel.y), r2(p.vel.z)', 'p.vel.x, p.vel.y, p.vel.z', 'preserve nonlinear ballistic phase boundaries');
    patch('function packEvent(e) {', 'function packEvent(e, precise = false) {', 'hitscan precision policy');
    patch('else if (v && v.isVector3) o[k] = [r2(v.x), r2(v.y), r2(v.z)];', 'else if (v && v.isVector3) o[k] = precise ? [v.x,v.y,v.z] : [r2(v.x),r2(v.y),r2(v.z)];', 'hitscan unit direction and origin');
    patch("else if (typeof v === 'number') o[k] = r3(v);", "else if (typeof v === 'number') o[k] = precise ? v : r3(v);", 'hitscan charge and length');
    patch('while (i < p.events.length && p.events[i][0] <= tr) i++;',
      'while (i < p.events.length && p.events[i][0] <= tr && (!Number.isFinite(p.events[i]._netTick) || !Number.isFinite(p.sim) || p.events[i]._netTick <= p.sim + .0306)) i++;',
      'events share owner simulation time during render hitches');
    patch('      if (drop) { this._remove(a); continue; }\n      a.owner = this.s.hostId;',
      '      if (drop) { this._remove(a); continue; }\n      retireNetworkGhosts(a);\n      if (a.net) a.net._stormBirthAuth = null;\n      a.owner = this.s.hostId;', 'retire old timeline before remote owner transfer');
    patch('  _adopt(a) {', '  _adopt(a) {\n    retireNetworkGhosts(a);\n    if (a.net) a.net._stormBirthAuth = null;', 'ownership transfer retirement');
    patch('r3(o.seed ?? Math.random())', 'o.seed ?? Math.random()', 'preserve paint pattern seed');
    patch('r3(p.delay || 0), r3(p.life), r3(p.straight)', 'p.delay || 0, p.life, p.straight', 'preserve exact physics timing boundaries');
    patch('p.nose ?? 0.3, p.sats ?? 3]);', 'p.nose ?? 0.3, p.sats ?? 3, p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1)]);', 'append birth mode, appearance seed, identity');
    {
      const combatLifeTick = '  _tick(from, d) {\n    this.stats.in++;\n    // Ordered WebSocket ticks cannot replay paint or terminal events.\n    if (!Number.isFinite(d.ts) || d.ts <= (this.peers.get(from)?.lastTs ?? -Infinity)) return;\n    const p = this._peer(from);';
      if (code.includes(combatLifeTick)) patch(combatLifeTick, `  _tick(from, d) {
    if (!Number.isFinite(d.ts)) return;
    const previous = this.peers.get(from);
    // One ordered replay gate owns both combat-life admission and projectile/event chronology.
    if (previous?.lastTs !== undefined && d.ts <= previous.lastTs) return;
    this.stats.in++;
    const p = this._peer(from);`, 'ordered tick replay guard with combat life');
      else patch('  _tick(from, d) {\n    this.stats.in++;', `  _tick(from, d) {
    if (!Number.isFinite(d.ts)) return;
    const previous = this.peers.get(from);
    // WebSocket delivery is ordered and reliable. A replay cannot create a
    // second shot, rewind the clock window, or resurrect a finished projectile.
    if (previous?.lastTs !== undefined && d.ts <= previous.lastTs) return;
    this.stats.in++;`, 'ordered tick replay guard');
    }
    patch('  _play(from, e) {\n    switch (e[1]) {', `  _play(from, e) {
    const eventPeer = this.peers.get(from);
    if (e._netSeq !== undefined && eventPeer) { if (e._netSeq <= (eventPeer._lastEventSeq || 0)) return; eventPeer._lastEventSeq = e._netSeq; }
    if (e[1] === 'p' || e[1] === 'pe' || e[1] === 'b' || e[1] === 'tr') {
      const actor = this.byNid.get(e[2]);
      if (!actor?.remote || actor.owner !== from) return;
    }
    if (e[1] === 'ev') {
      const nid = e[3]?.actor?.n ?? e[3]?.victim?.n;
      const actor = this.byNid.get(nid);
      if (!actor?.remote || actor.owner !== from) return;
    }
    switch (e[1]) {`, 'event ownership');
    patch(`  recSplat(c, radius, team, o) {
    if (this.applying || this.mute > 0 || o.cosmetic) return;
    const st = o.stretch;`, `  recSplat(c, radius, team, o) {
    if (this.applying || this.mute > 0 || o.cosmetic) return;
    const st = o.stretch;
    // Stamp the origin's own splat with the room-wide order identity every
    // receiver derives from the same wire fields, so the immediate local apply
    // and the delayed remote replay converge on one canonical order.
    o._netKey = netSplatKey(Math.round((G.time || 0) * 60), this.myId, team, (this._eventSeq || 0) + 1);`, 'origin splat canonical order identity');
    patch(`        const opts = { seed: e[7] };
        if (e[8]) opts.kind = e[8];
        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);`, `        const opts = { seed: e[7] };
        if (e[8]) opts.kind = e[8];
        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
        // Paint ownership is not commutative, so a replayed splat only lands when
        // it carries the order identity. Anything unorderable is dropped by every
        // client alike rather than being applied in arrival order.
        if (!Number.isSafeInteger(e._netTick) || !Number.isSafeInteger(e._netSeq)
          || e._netTick < 0 || e._netSeq < 1 || (e[6] !== 0 && e[6] !== 1)) return;
        opts._netKey = netSplatKey(e._netTick, from, e[6], e._netSeq);
        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);`, 'remote splat canonical order identity');
    patch("case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]); break; }", `case 'b': {
        for (let index = 4; index <= 9; index++) if (!Number.isFinite(e[index])) return;
        const a = this.byNid.get(e[2]);
        if (e[3] === 'storm') {
          const auth = a?.net?._stormBirthAuth;
          if (!stormSnapshotAllows(a, e._stormSnapshot, from) || a.weapon?.special !== 'storm'
            || !auth || auth.used || auth.owner !== from || auth.life !== e._stormSnapshot.life
            || !Number.isSafeInteger(e._netTick) || e._netTick !== auth.tick
            || !Number.isSafeInteger(e._netSeq) || e._netSeq <= auth.useSeq) break;
          auth.used = true;
        }
        const b = a && G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]);
        if (b) {
          b._netBorn = e[0]; b._netBornTick = e._netTick; b._netPeer = this.peers.get(from); b._netSteps = 0;
        }
        break;
      }`, 'bomb timeline birth');
    patch("case 'ev': this._playEvent(e[2], e[3]); break;", `case 'ev': {
        const before = G.projectiles?.beams.length || 0;
        const actor = this.byNid.get(e[3]?.actor?.n);
        if (actor && e[2] === 'special:use') {
          if (e[3]?.id === 'storm' && actor.weapon?.special === 'storm'
            && stormSnapshotAllows(actor, e._stormSnapshot, from) && Number.isSafeInteger(e._netTick) && Number.isSafeInteger(e._netSeq)) {
            const previous = actor.net._stormBirthAuth;
            if (!previous || previous.owner !== from || previous.life !== e._stormSnapshot.life || previous.tick !== e._netTick) {
              actor.net._stormBirthAuth = { owner: from, life: e._stormSnapshot.life, tick: e._netTick, useSeq: e._netSeq, used: false };
            }
          } else if (actor.net) actor.net._stormBirthAuth = null;
        }
        if (actor && e[2] === 'weapon:fire') actor._netFlickFirst = e[3].projectileFirst;
        try { this._playEvent(e[2],e[3]); } finally { if (actor) actor._netFlickFirst = undefined; }
        for (let i = before; i < (G.projectiles?.beams.length || 0); i++) { const b = G.projectiles.beams[i]; b._netPeer = this.peers.get(from); b._netBorn = e[0]; b._netBornTick = e._netTick; b._netOwner = actor; b._netSteps = 0; }
        break;
      }`, 'beam birth clock');
    patch('    victim.specialActive = null; victim.superJumpState = null;', '    if (victim.net) victim.net._stormBirthAuth = null;\n    victim.specialActive = null; victim.superJumpState = null;', 'death invalidates storm admission');
    patch('  _remoteRespawn(a) {\n    a.superJumpGround = null;\n    a.alive = true;', '  _remoteRespawn(a) {\n    if (a.net) a.net._stormBirthAuth = null;\n    a.superJumpGround = null;\n    a.alive = true;', 'respawn invalidates storm admission');
    patch("case 'p': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostProjectile(a, e); break; }", `case 'p': {
        for (let index = 5; index <= 18; index++) if (!Number.isFinite(e[index])) return;
        if (e[11] < 0 || e[12] <= 0) return;
        const peer = this.peers.get(from);
        if (Number.isFinite(e[29]) && peer) { if (e[29] <= (peer._lastProjectileId || 0)) break; peer._lastProjectileId = e[29]; }
        const a = this.byNid.get(e[2]), p = a && G.projectiles?.ghostProjectile(a, e);
        if (p) { p._netBorn = e[0]; p._netBornTick = e._netTick; p._netPeer = this.peers.get(from); p._netSteps = 0; p._netMaxSteps = Math.ceil((p.life + Math.max(0,p.delay)) * 60) + 2; }
        break;
      }
      case 'pe': {
        if (e[4] === 1 && (!Number.isFinite(e[5]) || !Number.isFinite(e[6]) || !Number.isFinite(e[7]))) return;
        for (const p of G.projectiles?.list || []) if (p.ghost && p.owner?.nid === e[2] && p._netId === e[3]) { p._netEnded = true; p._qualityDead = true; p._netEndStep = Number.isFinite(e._netTick) && Number.isFinite(p._netBornTick) ? e._netTick - p._netBornTick + 1 : Math.floor((e[0] - p._netBorn + .00101) * 60) + 1; p._netEndReason = e[4] || 0; p._netHitX = e[5]; p._netHitY = e[6]; p._netHitZ = e[7]; }
        break;
      }`, 'birth and terminal events');
    code += `
// One room-wide, globally comparable order for non-commutative paint writes:
// (owner simulation tick, sender, team, per-sender event sequence). The origin
// stamps it from the same fields it puts on the wire and every receiver rebuilds
// it from the packet, so conflicting splats compare identically on all clients
// without a second territory engine or a protocol change. 53 bits: exact in a
// double, so ordering never depends on floating point rounding.
function netSplatKey(tick, from, team, seq) {
  const t = Math.max(0, Math.min(0xFFFFF, Math.round(tick)));
  let h = 0x811c9dc5;
  const id = typeof from === 'string' ? from : '';
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return t * 8589934592 + (h & 0xFFFFF) * 8192 + (team ? 1 : 0) * 4096 + (seq & 0xFFF);
}
function stormSnapshotAllows(actor, proof, from) {
  const latest = actor?.net?.buf?.at(-1);
  return !!(proof && actor?.alive && actor.remote && actor.owner === from && proof.owner === from
    && actor.net.lastLife === proof.life && latest?.life === proof.life
    && latest.t >= proof.at && (latest.f & F.alive) && (latest.f & F.special));
}
function sampleOwnerSimulation(peer) {
  const points = peer.physicsPoints, t = peer.tr;
  if (!points?.length || !Number.isFinite(t)) return;
  if (t <= points[0]) { peer.sim = points[1] + (t-points[0])*60; return; }
  for (let i = 2; i < points.length; i += 2) if (t <= points[i]) {
    const span = points[i]-points[i-2], k = span ? (t-points[i-2])/span : 1;
    peer.sim = points[i-1] + (points[i+1]-points[i-1])*k; return;
  }
  peer.sim = points[points.length-1]; // no physics beyond the latest owner state
}
function retireNetworkGhosts(owner = null) {
  const P = G.projectiles; if (!P) return;
  const owns = p => !owner || p.owner === owner;
  for (const p of P.list) if (p.ghost && owns(p)) { p._netEnded = true; p._qualityDead = true; p._netEndStep = p._netSteps; }
  for (let i = P.bombs.length-1; i >= 0; i--) if (P.bombs[i].ghost && owns(P.bombs[i])) { P._releaseBomb(P.bombs[i]); P.bombs.splice(i,1); }
  for (let i = P.clouds.length-1; i >= 0; i--) if (P.clouds[i].ghost && owns(P.clouds[i])) { P._releaseCloud(P.clouds[i],.3); P.clouds.splice(i,1); }
  for (let i = P.beams.length-1; i >= 0; i--) { const b = P.beams[i]; if (b._netPeer && (!owner || b._netOwner === owner)) { b.mesh.visible = false; P.beamPool.push(b.mesh); P.beams.splice(i,1); } }
  for (const [a,mesh] of P.sights) if (a.remote && (!owner || a === owner)) { P.scene.remove(mesh); mesh.material.dispose(); P.sights.delete(a); }
}
`;
  }
  if (rel === 'src/game/weapons.js') {
    patch('    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;', '    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;\n    let projectileFirst;', 'attack-owned first projectile');
    patch("      this._push(p);\n    }\n    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });", "      this._push(p);\n      if (i === 0) projectileFirst = p._netId;\n    }\n    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });", 'capture exact volley during generation');
    patch('weapon: w.id, muzzle: new THREE.Vector3(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6)', 'weapon: w.id, projectileFirst, muzzle: new THREE.Vector3(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6)', 'publish exact volley event');

    patch('      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);', `      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);
      // The active attack parameters own physics. Finalize before _push records
      // them; the gameplay overlay formerly assigned these only after publication.
      p.s3Vertical = !!a.weaponRunner?.s3FlickVertical;
      p.grav = w.flickGravity ?? p.grav;
      p.drag = w.flickDrag ?? p.drag;`, 'final flick physics before publication');

    patch('    p.delay = 0; p.head = false;', '    p._netId = undefined; p._netEnded = false; p._netPeer = null; p._netBorn = undefined; p._netBornTick = undefined; p._netSteps = 0; p._netMaxSteps = 0; p._netEndStep = undefined; p._netEndReason = 0; p._netHitActor = false;\n    p.delay = 0; p.head = false;', 'recycled identity reset');
    patch('    this.list.push(p);\n  }\n\n  ghostBomb', `    p.s3Vertical = e[27] === 1;
    if (Number.isFinite(e[28])) p.seed = e[28]; // retain the native random draw above
    p._netId = e[29];
    this.list.push(p);
    return p;
  }

  ghostBomb`, 'exact ghost metadata');
    if (code.includes('      const elapsed = Math.max(0, dt - Math.max(0, p.delay || 0));')) {
      patch(`      const elapsed = Math.max(0, dt - Math.max(0, p.delay || 0));
      p.delay = Math.max(0, (p.delay || 0) - dt);
      if (elapsed <= 1e-10) continue;`, `      if (p.ghost && p._netPeer) {
        const clock = Math.min(p._netPeer.tr,p._netPeer.lastTs ?? p._netPeer.tr);
        const ownerElapsed = Number.isFinite(p._netPeer.sim) && Number.isFinite(p._netBornTick) ? p._netPeer.sim - p._netBornTick : (clock-p._netBorn)/SIM_DT;
        const target = Math.min(Math.floor(ownerElapsed+.0306)+1,p._netEndStep ?? Infinity);
        const limit = p._netMaxSteps;
        let dead = false;
        if (nm) nm.mute++;
        try {
          while (!dead && p._netSteps < target && p._netSteps < limit) {
            p._netSteps++;
            const activeDt = Math.max(0, SIM_DT - Math.max(0, p.delay || 0));
            p.delay = Math.max(0, (p.delay || 0) - SIM_DT);
            if (activeDt <= 1e-10) continue;
            dead = this._step(p, activeDt);
          }
        } finally { if (nm) nm.mute--; }
        dead ||= p._netEnded && p._netSteps >= p._netEndStep;
        if (dead) { p._qualityDead = true; list[i] = list[list.length-1]; list.pop(); this.pool.push(p); }
        continue;
      }
      const elapsed = Math.max(0, dt - Math.max(0, p.delay || 0));
      p.delay = Math.max(0, (p.delay || 0) - dt);
      if (elapsed <= 1e-10) continue;`, 'owner timeline projectile advancement with fractional delay');
    } else {
      patch('      if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }', `      if (p.ghost && p._netPeer) {
          const clock = Math.min(p._netPeer.tr,p._netPeer.lastTs ?? p._netPeer.tr);
          const elapsed = Number.isFinite(p._netPeer.sim) && Number.isFinite(p._netBornTick) ? p._netPeer.sim - p._netBornTick : (clock-p._netBorn)/SIM_DT;
          const target = Math.min(Math.floor(elapsed+.0306)+1,p._netEndStep ?? Infinity);
          // Step on the owner's playback clock, never on receipt wall time.
          // .0306 tick tolerates 0.51 ms legacy timestamp rounding, not travel distance.
          // Finite lifetime bounds catch-up work, including a delayed birth.
          const limit = p._netMaxSteps;
          let dead = false;
          if (nm) nm.mute++;
          try {
            while (!dead && p._netSteps < target && p._netSteps < limit) {
              p._netSteps++;
              if (p.delay > 0) { p.delay -= SIM_DT; if (p.delay > 0) continue; }
              dead = this._step(p, SIM_DT);
            }
          } finally { if (nm) nm.mute--; }
          dead ||= p._netEnded && p._netSteps >= p._netEndStep;
          if (dead) { p._qualityDead = true; list[i] = list[list.length-1]; list.pop(); this.pool.push(p); }
          continue;
        }
        if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }`, 'owner timeline projectile advancement');
    }
    patch('      if (!dead && p.pos.y < PLAYER.waterY - 1.8) dead = true;\n      return dead;', `      if (!dead && p.pos.y < PLAYER.waterY - 1.8) dead = true;
      if (dead && !p.ghost && p._netId !== undefined && G.netm) G.netm._rec(p._netHitActor ? ['pe',p.owner.nid,p._netId,1,p._netHitX,p._netHitY,p._netHitZ] : ['pe',p.owner.nid,p._netId,0]);
      return dead;`, 'owner terminal publication');
    patch('          let dmg = p.damage;', '          p._netHitActor = true; p._netHitX = _v.x; p._netHitY = _v.y; p._netHitZ = _v.z;\n          let dmg = p.damage;', 'capture owner actor impact');
    if (code.includes('      advanceFidelityProjectile(p, dt);')) {
      patch('      advanceFidelityProjectile(p, dt);', `      advanceFidelityProjectile(p, dt);
      if (p.ghost && p._netEndReason === 1 && p._netSteps >= p._netEndStep) {
        _v.set(p._netHitX,p._netHitY,p._netHitZ);
        G.fx?.burst(_v,_v2.copy(p.vel).normalize().negate(),p.owner.color,{count:6,speed:3,size:.07});
        if (p.type === 'blast') this._blastBurst(p,_v,null);
        if (p.type === 'slosh' && p.head) this._sloshSplash(p,_v,null);
        return true;
      }`, 'owner actor terminal effect with fidelity integration');
    } else {
      patch('      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;', `      p.pos.addScaledVector(p.vel, dt);
        if (p.ghost && p._netEndReason === 1 && p._netSteps >= p._netEndStep) {
          _v.set(p._netHitX,p._netHitY,p._netHitZ);
          G.fx?.burst(_v,_v2.copy(p.vel).normalize().negate(),p.owner.color,{count:6,speed:3,size:.07});
          if (p.type === 'blast') this._blastBurst(p,_v,null);
          if (p.type === 'slosh' && p.head) this._sloshSplash(p,_v,null);
          return true;
        }
        let dead = false;`, 'owner actor terminal effect');
    }
    if (code.includes('      for (const e of fidelityProjectileTargets(this, p)) {')) {
      patch('      for (const e of fidelityProjectileTargets(this, p)) {',
        '      for (const e of fidelityProjectileTargets(this, p)) {\n        if (p.ghost) break;',
        'authoritative actor collision ownership with fidelity chronology');
    } else {
      patch('      // actors\n      for (const e of G.actors) {', '      // Actor collisions belong to the shooter; terminal events retire ghosts.\n      for (const e of G.actors) {\n        if (p.ghost) break;', 'authoritative actor collision ownership');
    }
    patch('      if (!dead && G.boss) {', '      if (!dead && G.boss && !p.ghost) {', 'authoritative boss collision ownership');
    patch('    if (b.dir) b.dir.set(vx, 0, vz).normalize();', '    if (b.dir) b.dir.set(vx, 0, vz).normalize();\n    return b;', 'ghost bomb handle');
    const bombStart = code.indexOf('  _updateBombs(dt) {'), bombEnd = code.indexOf('  _updateClouds(dt) {', bombStart);
    if (bombStart < 0 || bombEnd < 0) throw Error('Network bomb integrator anchor mismatch');
    let bombs = code.slice(bombStart,bombEnd);
    bombs = once(bombs,'      b.age += dt;', `      const peer = b.ghost && b._netPeer;
      const target = peer ? Math.floor((Number.isFinite(peer.sim) && Number.isFinite(b._netBornTick) ? peer.sim-b._netBornTick : (Math.min(peer.tr,peer.lastTs ?? peer.tr)-b._netBorn)/SIM_DT)+.0306)+1 : 0;
      const steps = peer ? Math.max(0,Math.min(180,target - b._netSteps)) : 1;
      const stepDt = peer ? SIM_DT : dt;
      for (let tick = 0; tick < steps; tick++) {
      if (peer) b._netSteps++;
      b.age += stepDt;`, 'bomb owner steps');
    bombs = bombs.replace(/\bdt\b/g,'stepDt').replace('_updateBombs(stepDt)', '_updateBombs(dt)').replace('peer ? SIM_DT : stepDt','peer ? SIM_DT : dt');
    bombs = bombs.replaceAll('this.bombs.splice(i, 1); continue;', 'this.bombs.splice(i, 1); break;');
    bombs = once(bombs,'      b.mesh.rotation.z += b.spin.y * stepDt * (b.fuse < 0 ? 1 : 0.2);', '      b.mesh.rotation.z += b.spin.y * stepDt * (b.fuse < 0 ? 1 : 0.2);\n      }', 'close bomb steps');
    code = code.slice(0,bombStart)+bombs+code.slice(bombEnd);
    patch('e.len || 20, e.charge || 0.5', 'e.len ?? 20, e.charge ?? 0.5', 'charger zero values');
    patch('    this.clouds.push({ owner: b.owner,', `    this.clouds.push({ _netPeer: b._netPeer, _netBorn: b._netBorn + (b._netSteps - 1) * SIM_DT, _netBornTick: b._netBornTick + b._netSteps - 1, _netSteps: 0, owner: b.owner,`, 'cloud inherits owner timeline');
    const cloudStart = code.indexOf('  _updateClouds(dt) {'), cloudEnd = code.indexOf('  _updateBeams(dt) {',cloudStart);
    let clouds = code.slice(cloudStart,cloudEnd);
    clouds = once(clouds,'      c.t += dt;', `      const peer = c.ghost && c._netPeer;
      const target = peer ? Math.floor((Number.isFinite(peer.sim) && Number.isFinite(c._netBornTick) ? peer.sim-c._netBornTick : (Math.min(peer.tr,peer.lastTs ?? peer.tr)-c._netBorn)/SIM_DT)+.0306)+1 : 0;
      const steps = peer ? Math.max(0,Math.min(Math.ceil(c.dur / SIM_DT) + 1,target - c._netSteps)) : 1;
      const stepDt = peer ? SIM_DT : dt;
      for (let tick = 0; tick < steps; tick++) {
      if (peer) c._netSteps++;
      c.t += stepDt;`, 'cloud owner steps');
    clouds = clouds.replace(/\bdt\b/g,'stepDt').replace('_updateClouds(stepDt)','_updateClouds(dt)').replace('peer ? SIM_DT : stepDt','peer ? SIM_DT : dt');
    clouds = once(clouds,'this.clouds.splice(i, 1); }','this.clouds.splice(i, 1); break; }\n      }','close cloud steps');
    clouds = once(clouds,'        for (const e of G.actors) {','        for (const e of G.actors) {\n          if (peer && tick !== steps-1) break;', 'recipient cloud damage once per frame');
    clouds = once(clouds,'e.damage(sp.dps * stepDt,', 'e.damage(sp.dps * (peer ? dt : stepDt),', 'recipient damage elapsed time');
    clouds = once(clouds,'        G.fx?.rain(c.group.position, sp.radius * s, G.teamColors[c.team], stepDt, { cloud: false });','        if (!peer || tick === steps-1) G.fx?.rain(c.group.position, sp.radius * s, G.teamColors[c.team], peer ? dt : stepDt, { cloud: false });','bounded catch-up rain emission');
    code = code.slice(0,cloudStart)+clouds+code.slice(cloudEnd);
    patch('      b.t += dt;', `      if (b._netPeer) {
        const clock = Math.min(b._netPeer.tr,b._netPeer.lastTs ?? b._netPeer.tr);
        const target = Math.min(Math.floor((Number.isFinite(b._netPeer.sim) && Number.isFinite(b._netBornTick) ? b._netPeer.sim-b._netBornTick : (clock-b._netBorn)/SIM_DT)+.0306)+1,Math.ceil(b.life/SIM_DT)+1);
        b._netSteps ??= 0;
        while (b._netSteps < target && b.t < b.life) { b.t += SIM_DT; b._netSteps++; }
      } else b.t += dt;`, 'beam owner age');

  }
  if (rel === 'patches/local-quality/roller-visual.mjs') {
    patch('P._push=function(p){', 'P._push=function(p){\n    if (p.type === \'drop\' && p.owner?.weapon?.kind === \'roller\') p.s3Vertical = !!p.owner.weaponRunner?.s3FlickVertical;', 'capture birth mode before visual and gameplay finalization');
    patch("p.owner.weaponRunner?.s3FlickVertical){", "p.s3Vertical){", 'birth mode owns ligament');
    patch("if(p.owner!==actor||p.type!=='drop'||p.age>1/60||p._qualityDead)continue;", `if(p.owner!==actor||p.type!=='drop'||p._qualityDead)continue;
    if (p.ghost) {
      const first = actor._netFlickFirst;
      if (!Number.isFinite(first) || p._netId < first || p._netId >= first + (p.s3Vertical ? actor.weapon.verticalDrops : actor.weapon.flickDrops)) continue;
    } else if (p.age > 1/60) continue;`, 'late curtain uses explicit volley');
    patch('const vertical=p.ghost?p.nose===.55&&p.tailK===1.7:!!actor.weaponRunner?.s3FlickVertical;\n    if(vertical)out.push(p);', 'out.push(p); // immutable births own both horizontal and vertical curtains', 'projectile envelope owns both curtain modes');
  }
  if (rel === 'src/fx/fx.js') {
    // The quality adapter uses source presence as a vertical proxy. With both
    // modes bound, select silhouette from the immutable birth mode instead.
    const count = (code.match(/sources\?\.length \?/g) || []).length;
    if (count !== 4) throw Error('Network curtain silhouette anchor mismatch');
    code = code.replaceAll('sources?.length ?', 'sources?.[0]?.s3Vertical ?');
    patch('      this._sprite(this.puffs, pos.x + Math.sin(a) * 0.8, pos.y + 0.2, pos.z + Math.cos(a) * 0.8, Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB,', '      const puff = this._sprite(this.puffs, pos.x + Math.sin(a) * 0.8, pos.y + 0.2, pos.z + Math.cos(a) * 0.8, Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB,', 'curtain puff handle');
    patch('    }\n  }\n\n  // ---- bombs\n  dangerRing', `      if (sources?.length) {
        const pool = this.puffs, source = sources[Math.floor(i * sources.length / 3)];
        pool._netSource ||= new Array(pool.cap).fill(null);
        pool._netGeneration ||= new Uint32Array(pool.cap);
        pool._netSource[puff] = source; pool._netGeneration[puff] = source._qualityGeneration;
      }
    }
  }

  // ---- bombs
  dangerRing`, 'bind curtain puff');
    patch('    const i3 = i * 3, x = i * 14;', '    if (pool._netSource) pool._netSource[i] = null;\n    const i3 = i * 3, x = i * 14;', 'sprite pool identity reset');
    patch('        const last = --pool.n;', `        const last = --pool.n;
        if (pool._netSource) { pool._netSource[i] = pool._netSource[last]; pool._netGeneration[i] = pool._netGeneration[last]; pool._netSource[last] = null; }`, 'sprite compaction identity');
    patch('      aC[i4] = C[i3]; aC[i4 + 1] = C[i3 + 1]; aC[i4 + 2] = C[i3 + 2]; aC[i4 + 3] = a;', `      const source = pool._netSource?.[i];
      if (source) {
        if (source._qualityDead || source._qualityGeneration !== pool._netGeneration[i]) { aPS[i4 + 3] = 0; }
        else { aPS[i4] = source.pos.x; aPS[i4 + 1] = source.pos.y; aPS[i4 + 2] = source.pos.z; }
      }
      aC[i4] = C[i3]; aC[i4 + 1] = C[i3 + 1]; aC[i4 + 2] = C[i3 + 2]; aC[i4 + 3] = a;`, 'puff presentation belongs to source');

  }
  if (rel === 'src/world/paint.js') {
    // Cell ownership is "newest applied splat wins" and that write is not
    // commutative, so every cell also remembers the room-wide order identity of
    // the splat that last wrote it. A splat only writes a cell it is ordered
    // after, which makes the final grid independent of arrival order on every
    // client, and lets the GPU growth pass read the same authority.
    patch('    this.grid = new Uint8Array(total);      // 0 none, 1 team0, 2 team1\n    this.dead = new Uint8Array(total);      // cells buried inside other geometry',
      '    this.grid = new Uint8Array(total);      // 0 none, 1 team0, 2 team1\n    this.gridOrder = new Float64Array(total); // canonical order identity of the last writer per cell\n    this.dead = new Uint8Array(total);      // cells buried inside other geometry',
      'paint grid canonical order tracking');
    patch('    this.grid.fill(0);\n    this.counts[0] = this.counts[1] = 0;',
      '    this.grid.fill(0);\n    if (this.gridOrder) this.gridOrder.fill(0);\n    this.counts[0] = this.counts[1] = 0;',
      'clear paint order tracking');
    patch('if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); nm.recSplat(center, radius, team, opts); }\n    }',
      'if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); nm.recSplat(center, radius, team, opts); }\n    }\n    const prevNetKey = this._currentNetKey;\n    this._currentNetKey = opts._netKey;',
      'bind the active splat order identity');
    patch('    return claimed;\n  }\n\n  // Cosmetic micro-splat',
      '    this._currentNetKey = prevNetKey;\n    return claimed;\n  }\n\n  // Cosmetic micro-splat',
      'restore the active splat order identity');
    patch('    const entries = [];\n    let wall = false;',
      '    const entries = [];\n    let wall = false;\n    let live = 0;\n    const runs = [];',
      'count faces that still owe GPU ink');
    patch('        if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);\n        entries.push(f, lu, lv, dn, sdu, sdv, sa);',
      `        this._lastOrderWins = 0;
        const won = cosmetic ? 0 : this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);
        claimed += won;
        // Entry stride 8: the eighth slot records whether this face still owes GPU
        // ink to this splat. A face a stale packet fully lost must not redraw, or
        // the atlas would contradict the gameplay grid it is supposed to match.
        const liveFace = cosmetic || this._currentNetKey === undefined || won > 0 || this._lastOrderWins > 0;
        if (liveFace) live++;
        // Entry stride 10. Slot 8 is where this face's won cell runs start in the
        // splat run list and slot 9 is how many there are; -1 means the splat has no
        // canonical order and keeps the plain one-quad-per-face growth draw.
        const runCount = this._currentNetKey === undefined ? -1 : (this._runs.length / 3);
        entries.push(f, lu, lv, dn, sdu, sdv, sa, liveFace ? 1 : 0, runs.length, runCount);
        for (let r = 0; r < this._runs.length; r++) runs.push(this._runs[r]);`,
      'record per-face GPU paint authority and won cell runs');
    patch('    if (entries.length) {\n      // an older splat of the other team still spreading underneath this one finishes instantly',
      '    if (live > 0) {\n      // an older splat of the other team still spreading underneath this one finishes instantly',
      'skip GPU growth for a fully superseded splat');
    patch('  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {\n    if (r <= 0.02) return 0;',
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {\n    this._runs = [];\n    if (r <= 0.02) return 0;',
      'reset the per-face won cell run list');
    patch('    if (claimed > 0) this.version++;\n    return claimed;\n  }',
      `    const order = this._currentNetKey;
    if (order !== undefined) {
      // Record exactly which cells this splat may draw. The order array already
      // answers that, so no second shape evaluation is needed. Row runs keep the
      // GPU quad count near the number of scanlines the splat covers.
      for (let j = j0; j <= j1; j++) {
        let start = -1;
        const row = f.grid + j * f.nu;
        for (let i = i0; i <= i1; i++) {
          if (this.gridOrder[row + i] === order) { if (start < 0) start = i; }
          else if (start >= 0) { this._runs.push(start, i, j); start = -1; }
        }
        if (start >= 0) this._runs.push(start, i1 + 1, j);
      }
    }
    if (claimed > 0) this.version++;
    return claimed;
  }`,
      'collect the exact won cell runs for the GPU growth pass');
    patch('        const k = f.grid + j * f.nu + i;\n        const prev = this.grid[k];\n        if (prev === val) continue;\n        this.grid[k] = val;\n        claimed += cellA;',
      `        const k = f.grid + j * f.nu + i;
        const prev = this.grid[k];
        const key = this._currentNetKey;
        if (key !== undefined) {
          const prevKey = this.gridOrder[k];
          if (key < prevKey) continue;          // a newer canonically ordered splat owns this cell
          if (key > prevKey) this._lastOrderWins++;
          this.gridOrder[k] = key;
        }
        if (prev === val) continue;
        this.grid[k] = val;
        claimed += cellA;`,
      'deterministic cell ownership by canonical order identity');
    patch('        cx: center.x, cy: center.y, cz: center.z,\n      };',
      '        cx: center.x, cy: center.y, cz: center.z,\n        runs: runs.length ? runs : null,\n      };',
      'carry the won cell runs with the growth splat');
    patch('    const E = g.entries, R = g.R, kind = g.kind;\n    const reachK = REACH[kind];\n    for (let i = 0; i < E.length; i += 7) {\n      const f = E[i], lu = E[i + 1], lv = E[i + 2], dn = E[i + 3], sdu = E[i + 4], sdv = E[i + 5], sa = E[i + 6];\n      if (dn >= R) continue;\n      const rr = Math.sqrt(R * R - dn * dn);\n      if (dripOnly) {\n        if (!f.wall || rr < R * 0.3) continue;\n        this._pushQuad(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);\n      } else {\n        const ext = rr * (reachK + 1.4 * sa);\n        const down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;\n        this._pushQuad(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);\n      }\n    }',
      `    const E = g.entries, R = g.R, kind = g.kind;
    const reachK = REACH[kind];
    for (let i = 0; i < E.length; i += 10) {
      const f = E[i], lu = E[i + 1], lv = E[i + 2], dn = E[i + 3], sdu = E[i + 4], sdv = E[i + 5], sa = E[i + 6];
      if (!E[i + 7]) continue;                  // newer canonical ink already covers this whole face
      if (dn >= R) continue;
      const rr = Math.sqrt(R * R - dn * dn);
      const runCount = E[i + 9];
      if (runCount === 0) continue;             // every cell of this face was canonically lost
      if (runCount < 0) {                       // no canonical order: unchanged one-quad-per-face growth
        if (dripOnly) {
          if (!f.wall || rr < R * 0.3) continue;
          this._pushQuad(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);
        } else {
          const ext = rr * (reachK + 1.4 * sa);
          const down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;
          this._pushQuad(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);
        }
        continue;
      }
      // Canonically ordered: draw only the cell runs this splat won, so the atlas
      // can never show ink the gameplay grid already gave away. Same shape function
      // and same blend, so every pixel still drawn is identical to the unclipped
      // draw, and the quad count stays near the number of scanlines covered.
      const runs = g.runs;
      for (let r = 0; r < runCount; r++) {
        const o = E[i + 8] + r * 3;
        // Keep the atlas pad bleed the unclipped draw had, so ink still covers the
        // mip guard band at the face edge; only cells another splat owns are cut.
        const padM = (f.atlas.pad - 0.5) / f.atlas.ppm;
        const cu0 = runs[o] * f.cu - padM, cu1 = runs[o + 1] * f.cu + padM;
        const cv0 = runs[o + 2] * f.cv - padM, cv1 = cv0 + f.cv + padM;
        if (dripOnly) {
          if (!f.wall || rr < R * 0.3) continue;
          const u0 = Math.max(cu0, lu - rr * 0.95), u1 = Math.min(cu1, lu + rr * 0.95);
          const v0 = Math.max(cv0, lv - rr * DRIP_REACH), v1 = Math.min(cv1, lv - rr * 0.3);
          if (u1 > u0 && v1 > v0) this._pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);
        } else {
          const ext = rr * (reachK + 1.4 * sa);
          const down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;
          const u0 = Math.max(cu0, lu - ext), u1 = Math.min(cu1, lu + ext);
          const v0 = Math.max(cv0, lv - Math.max(ext, down)), v1 = Math.min(cv1, lv + ext);
          if (u1 > u0 && v1 > v0) this._pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);
        }
      }
    }`,
      'GPU growth draws exactly the canonically won cells');
  }
  return code;
}

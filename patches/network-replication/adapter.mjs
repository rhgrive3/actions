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
  if (rel === 'src/net/netmatch.js') {
    const ctor = "    this.applying = false;         // replaying someone else's splat (don't re-record)";
    patch(ctor, ctor + "\n    this._paintState = paintOrderStateFor(session,cfg);", 'match-local paint order state');

    const recStart = code.indexOf('  recSplat(c, radius, team, o) {');
    const recEnd = code.indexOf('\n  recProj(p) {', recStart);
    if (recStart < 0 || recEnd < 0) throw Error('Network paint recording anchor mismatch');
    const oldRec = code.slice(recStart, recEnd);
    const newRec = [
      "  recSplat(c, radius, team, o) {",
      "    if (this.applying || this.mute > 0 || o.cosmetic || G.netm !== this) return;",
      "    const state = this._paintState, st = o.stretch;",
      "    if (!state?.matchId || state.matchId !== this.cfg?.id) return;",
      "    if (o.seed === undefined) o.seed = Math.random();",
      "    const shape = { x:c.x, y:c.y, z:c.z, radius, team, seed:o.seed,",
      "      kind:o.kind === undefined ? -1 : o.kind, sx:st?.x ?? 0, sy:st?.y ?? 0, sz:st?.z ?? 0,",
      "      stretchAmt:st ? (o.stretchAmt ?? 1) : 0 };",
      "    delete o._netOrder; delete o._netPrediction;",
      "    if (this.isHost) {",
      "      const sequence = state.sequence + 1;",
      "      if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(state.epoch) || state.epoch < 0) return;",
      "      state.sequence = sequence;",
      "      o._netOrder = { epoch:state.epoch, sequence };",
      "      recordCanonicalPaint(this, this.myId, 0, state.epoch, sequence, shape);",
      "      return;",
      "    }",
      "    const requestId = state.nextRequest + 1;",
      "    if (!Number.isSafeInteger(requestId) || requestId < 1) return;",
      "    state.nextRequest = requestId;",
      "    o._netPrediction = { requestId };",
      "    recordPaintRequest(this, requestId, shape);",
      "  }"
    ].join('\n');
    code = once(code, oldRec, newRec, 'splat-only ordered paint recording');

    const acceptMethod = [
      "  _acceptPaintRequest(from, e, d) {",
      "    if (!validPaintRequest(this, from, e, d) || !G.paint?.splat) return false;",
      "    const state = this._paintState, requestId = e[13], sequence = state.sequence + 1;",
      "    if (!Number.isSafeInteger(sequence) || sequence < 1) return false;",
      "    const shape = paintShapeFrom(e, 16), opts = paintOptions(shape, { epoch:state.epoch, sequence });",
      "    const wasApplying = this.applying;",
      "    this.applying = true;",
      "    try { G.paint.splat(new THREE.Vector3(shape.x,shape.y,shape.z),shape.radius,shape.team,opts); }",
      "    finally { this.applying = wasApplying; }",
      "    state.sequence = sequence;",
      "    state.lastRequest.set(from, requestId);",
      "    recordCanonicalPaint(this, from, requestId, state.epoch, sequence, shape);",
      "    return true;",
      "  }",
      "",
      "  recProj(p) {"
    ].join('\n');
    patch('  recProj(p) {', acceptMethod, 'host applies each owner splat once and relays ordered paint');

    const eventPush = "      p.events.push(e);\n    }";
    const paintDispatch = [
      "      if (e[1] === 's') {",
      "        if (this.isHost && from !== this.myId) this._acceptPaintRequest(from,e,d);",
      "        else if (!this.isHost && from === this.s.hostId && validCanonicalPaint(this,from,e,d)) {",
      "          const key = e[15] + ':' + e[16];",
      "          if (!this._paintState.seenCanonical.has(key)) { this._paintState.seenCanonical.add(key); p.events.push(e); }",
      "        }",
      "        continue;",
      "      }",
      "      p.events.push(e);",
      "    }"
    ].join('\n');
    patch(eventPush, paintDispatch, 'route only host-canonical splats into remote playback');

    const eventOrder = "    if (e._netSeq !== undefined && eventPeer) { if (e._netSeq <= (eventPeer._lastEventSeq || 0)) return; eventPeer._lastEventSeq = e._netSeq; }";
    patch(eventOrder,
      "    if (e[1] !== 's' && e._netSeq !== undefined && eventPeer) { if (e._netSeq <= (eventPeer._lastEventSeq || 0)) return; eventPeer._lastEventSeq = e._netSeq; }",
      'paint duplicates use per-cell order while other events keep their sequence gate');

    patch('  onLeave(id, hostChanged) {\n    if (!this.match) return;',
      "  onLeave(id, hostChanged) {\n    if (hostChanged) {\n      this._paintState.epoch++;\n      this._paintState.sequence = 0;\n      this._paintState.nextRequest = 0;\n      this._paintState.lastRequest.clear();\n      this._paintState.seenCanonical.clear();\n      for (const r of this.cfg.roster || []) if (r.owner === id || r.owner === this.s.hostId) this._paintState.hostTeams.add(r.team);\n      G.paint?.cancelPredictedPaint?.();\n    }\n    if (!this.match) return;",
      'retire paint epoch on host ownership change');

    const playStart = code.indexOf("      case 's': {");
    const playEnd = code.indexOf("      case 'p':", playStart);
    if (playStart < 0 || playEnd < 0) throw Error('Network paint replay anchor mismatch');
    const oldPlay = code.slice(playStart, playEnd);
    const newPlay = [
      "      case 's': {",
      "        if (!validCanonicalPaint(this,from,e)) break;",
      "        const shape = paintShapeFrom(e,18);",
      "        const ack = e[13] === this.myId ? e[14] : 0;",
      "        const opts = paintOptions(shape,{ epoch:e[15], sequence:e[16] },ack);",
      "        const wasApplying = this.applying;",
      "        this.applying = true;",
      "        try { G.paint?.splat(_v.set(shape.x,shape.y,shape.z),shape.radius,shape.team,opts); }",
      "        finally { this.applying = wasApplying; }",
      "        break;",
      "      }",
      "      "
    ].join('\n');
    code = once(code, oldPlay, newPlay, 'apply only host-ordered splats on remote paint grid');

    code += '\n' + [
      "const paintOrderSessions = new WeakMap();",
      "function paintOrderStateFor(session,cfg) {",
      "  const matchId = typeof cfg?.id === 'string' && cfg.id ? cfg.id : null;",
      "  let state = paintOrderSessions.get(session);",
      "  if (!state || state.matchId !== matchId) {",
      "    const hostTeams = new Set((cfg.roster || []).filter(r => r.owner === session.hostId).map(r => r.team));",
      "    if (cfg.mode === 'boss') hostTeams.add(1);",
      "    state = { matchId, epoch:0, sequence:0, nextRequest:0, lastRequest:new Map(), seenCanonical:new Set(), hostTeams };",
      "    paintOrderSessions.set(session,state);",
      "  }",
      "  return state;",
      "}",
      "const paintKinds = new Set(['shot','line','blast','bomb','trail','drop','roll','speck']);",
      "function paintKindValid(kind) {",
      "  return kind === -1 || (Number.isSafeInteger(kind) && kind >= 0 && kind <= 7) || (typeof kind === 'string' && paintKinds.has(kind));",
      "}",
      "function paintShapeFrom(e,start) {",
      "  return { team:e[6], x:e[start], y:e[start+1], z:e[start+2], radius:e[start+3], seed:e[start+4],",
      "    kind:e[start+5], sx:e[start+6], sy:e[start+7], sz:e[start+8], stretchAmt:e[start+9] };",
      "}",
      "function paintShapeValid(shape,e) {",
      "  if (![shape.x,shape.y,shape.z,shape.radius,shape.seed,shape.sx,shape.sy,shape.sz,shape.stretchAmt].every(Number.isFinite)",
      "    || Math.max(Math.abs(shape.x),Math.abs(shape.y),Math.abs(shape.z)) > 10000 || shape.radius <= 0 || shape.radius > 64",
      "    || Math.max(Math.abs(shape.sx),Math.abs(shape.sy),Math.abs(shape.sz)) > 10000 || shape.stretchAmt < 0 || shape.stretchAmt > 32",
      "    || (shape.team !== 0 && shape.team !== 1) || shape.seed < 0 || shape.seed >= 1 || !paintKindValid(shape.kind)) return false;",
      "  const baseKind = shape.kind === -1 ? 0 : shape.kind;",
      "  return e[2] === r2(shape.x) && e[3] === r2(shape.y) && e[4] === r2(shape.z)",
      "    && e[5] === r2(shape.radius) && e[7] === r3(shape.seed) && e[8] === baseKind",
      "    && e[9] === r3(shape.sx) && e[10] === r3(shape.sy) && e[11] === r3(shape.sz) && e[12] === r2(shape.stretchAmt);",
      "}",
      "function paintOwnerAllowed(nm,ownerId,team) {",
      "  if (!nm.s._members?.has(ownerId)) return false;",
      "  const roster = nm.cfg?.roster;",
      "  if (!Array.isArray(roster)) return false;",
      "  if (ownerId === nm.s.hostId) return nm._paintState.hostTeams.has(team);",
      "  return roster.some(r => r.owner === ownerId && !r.bot && r.team === team);",
      "}",
      "function validPaintRequest(nm,from,e,d) {",
      "  const state = nm._paintState;",
      "  if (!nm.isHost || nm.s.myId !== nm.s.hostId || from === nm.s.hostId || !state?.matchId",
      "    || !nm.s._members?.has(from) || !Array.isArray(e) || e[1] !== 's' || e.length !== 28",
      "    || e[14] !== nm.cfg?.id || !Number.isSafeInteger(e[13]) || e[13] <= (state.lastRequest.get(from) || 0)",
      "    || !Number.isSafeInteger(e[15]) || e[15] !== state.epoch",
      "    || d?.r !== 2 || !Number.isSafeInteger(d.u) || d.u < 0 || !Number.isFinite(d.ts)",
      "    || !Number.isSafeInteger(e._netTick) || e._netTick !== e[26] || e._netTick < 0 || e._netTick > d.u",
      "    || !Number.isSafeInteger(e._netSeq) || e._netSeq !== e[27] || e._netSeq < 1 || !Number.isFinite(e[0]) || e[0] > d.ts) return false;",
      "  const shape = paintShapeFrom(e,16);",
      "  return paintShapeValid(shape,e) && paintOwnerAllowed(nm,from,shape.team);",
      "}",
      "function validCanonicalPaint(nm,from,e,d = null) {",
      "  const state = nm._paintState;",
      "  if (!state?.matchId || from !== nm.s.hostId || !nm.s._members?.has(from) || !Array.isArray(e) || e[1] !== 's' || e.length !== 30",
      "    || e[17] !== nm.cfg?.id || !Number.isSafeInteger(e[15]) || e[15] !== state.epoch || e[15] < 0",
      "    || !Number.isSafeInteger(e[16]) || e[16] < 1 || !Number.isSafeInteger(e[14]) || e[14] < 0",
      "    || !Number.isSafeInteger(e._netTick) || e._netTick !== e[28] || e._netTick < 0",
      "    || !Number.isSafeInteger(e._netSeq) || e._netSeq !== e[29] || e._netSeq < 1 || !Number.isFinite(e[0])) return false;",
      "  if (d && (d.r !== 2 || !Number.isSafeInteger(d.u) || e._netTick > d.u || !Number.isFinite(d.ts) || e[0] > d.ts)) return false;",
      "  const ownerId = e[13], requestId = e[14], shape = paintShapeFrom(e,18);",
      "  if (typeof ownerId !== 'string' || (ownerId === nm.s.hostId ? requestId !== 0 : requestId < 1)) return false;",
      "  return paintShapeValid(shape,e) && paintOwnerAllowed(nm,ownerId,shape.team);",
      "}",
      "function paintOptions(shape,order = null,predictionAck = 0) {",
      "  const opts = { seed:shape.seed };",
      "  if (shape.kind !== -1) opts.kind = shape.kind;",
      "  if (shape.sx || shape.sy || shape.sz) { opts.stretch = new THREE.Vector3(shape.sx,shape.sy,shape.sz); opts.stretchAmt = shape.stretchAmt; }",
      "  if (order) opts._netOrder = { epoch:order.epoch, sequence:order.sequence };",
      "  if (predictionAck > 0) opts._netPredictionAck = predictionAck;",
      "  return opts;",
      "}",
      "function paintBaseFields(shape) {",
      "  return [r2(shape.x),r2(shape.y),r2(shape.z),r2(shape.radius),shape.team,r3(shape.seed),shape.kind === -1 ? 0 : shape.kind,",
      "    r3(shape.sx),r3(shape.sy),r3(shape.sz),r2(shape.stretchAmt)];",
      "}",
      "function recordPaintRequest(nm,requestId,shape) {",
      "  nm._rec(['s',...paintBaseFields(shape),requestId,nm._paintState.matchId,nm._paintState.epoch,shape.x,shape.y,shape.z,shape.radius,shape.seed,shape.kind,shape.sx,shape.sy,shape.sz,shape.stretchAmt]);",
      "}",
      "function recordCanonicalPaint(nm,ownerId,requestId,epoch,sequence,shape) {",
      "  nm._rec(['s',...paintBaseFields(shape),ownerId,requestId,epoch,sequence,nm._paintState.matchId,",
      "    shape.x,shape.y,shape.z,shape.radius,shape.seed,shape.kind,shape.sx,shape.sy,shape.sz,shape.stretchAmt]);",
      "}"
    ].join('\n');
  }
  if (rel === 'src/world/paint.js') {
    patch('    this.grid = new Uint8Array(total);      // 0 none, 1 team0, 2 team1\n    this.dead = new Uint8Array(total);',
      '    this.grid = new Uint8Array(total);      // 0 none, 1 team0, 2 team1\n    this.gridCanonical = new Uint8Array(total);\n    this.gridPrediction = new Float64Array(total); this.gridPrediction.fill(-1);\n    this.gridOrderEpoch = new Float64Array(total); this.gridOrderEpoch.fill(-1);\n    this.gridOrderSeq = new Float64Array(total); this.gridOrderSeq.fill(-1);\n    this._paintOrderVersion = 0;\n    this.dead = new Uint8Array(total);',
      'per-cell canonical ownership and immediate local prediction');
    patch('    this.grid.fill(0);\n    this.counts[0] = this.counts[1] = 0;',
      '    this.grid.fill(0);\n    this.gridCanonical?.fill(0);\n    this.gridPrediction?.fill(-1);\n    this.gridOrderEpoch?.fill(-1);\n    this.gridOrderSeq?.fill(-1);\n    this._paintOrderVersion = (this._paintOrderVersion || 0) + 1;\n    this.counts[0] = this.counts[1] = 0;',
      'clear canonical paint ownership with the grid');
    patch('  splat(center, radius, team, opts = {}) {',
      '  splat(center, radius, team, opts = {}) {\n    const previous = this._netPaintContext;\n    this._netPaintContext = paintContextFrom(opts);\n    try { return this._splat(center,radius,team,opts); }\n    finally { this._netPaintContext = previous; }\n  }\n\n  _splat(center, radius, team, opts = {}) {',
      'scoped paint context survives exceptions');
    patch('      if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); nm.recSplat(center, radius, team, opts); }',
      '      if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); nm.recSplat(center, radius, team, opts); this._netPaintContext = paintContextFrom(opts); }',
      'bind order assigned by the real recorder');
    patch('        if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);\n        entries.push(f, lu, lv, dn, sdu, sdv, sa);',
      `        const owner = this._netPaintContext?.order
          ? { epoch:this._netPaintContext.order.epoch, sequence:this._netPaintContext.order.sequence }
          : this._netPaintContext?.prediction ? { requestId:this._netPaintContext.prediction.requestId } : null;
        const beforeOrderVersion = this._paintOrderVersion || 0;
        this._lastPaintRange = null;
        if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);
        const tracked = !cosmetic && !!owner;
        const live = !tracked || this._paintOrderVersion !== beforeOrderVersion;
        if (live) entries.push({ f, lu, lv, dn, sdu, sdv, sa, owner:tracked ? owner : null, range:this._lastPaintRange });`,
      'retain each splat face only while it still owns canonical cells');
    const growthStart = code.indexOf('  _emitGrowth(g, tn, dT, dripOnly) {');
    const growthEnd = code.indexOf('\n  _cpuSplat(', growthStart);
    if (growthStart < 0 || growthEnd < 0) throw Error('Network paint growth anchor mismatch');
    const oldGrowth = code.slice(growthStart, growthEnd);
    const newGrowth = `  _emitGrowth(g, tn, dT, dripOnly) {
    const R = g.R, kind = g.kind, reachK = REACH[kind];
    for (const e of g.entries) {
      const { f, lu, lv, dn, sdu, sdv, sa, owner, range } = e;
      if (dn >= R) continue;
      const rr = Math.sqrt(R * R - dn * dn);
      if (!owner) {
        if (dripOnly) {
          if (f.wall && rr >= R * 0.3) this._pushQuad(f,lu-rr*0.95,lu+rr*0.95,lv-rr*DRIP_REACH,lv-rr*0.3,lu,lv,dn,R,g.team,g.seed,kind,sdu,sdv,sa,tn,dT,1);
        } else {
          const ext = rr * (reachK + 1.4 * sa), down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;
          this._pushQuad(f,lu-ext,lu+ext,lv-Math.max(ext,down),lv+ext,lu,lv,dn,R,g.team,g.seed,kind,sdu,sdv,sa,tn,dT,0);
        }
        continue;
      }
      if (!range) continue;
      if (e.runVersion !== this._paintOrderVersion) {
        const runs = e.runs = [], { i0, i1, j0, j1 } = range;
        for (let row = j0; row <= j1; row++) {
          let start = -1;
          for (let col = i0; col <= i1; col++) {
            const k = f.grid + row * f.nu + col;
            const owns = owner.requestId !== undefined
              ? this.gridPrediction[k] === owner.requestId
              : this.gridPrediction[k] < 0 && this.gridOrderEpoch[k] === owner.epoch && this.gridOrderSeq[k] === owner.sequence;
            if (owns) { if (start < 0) start = col; }
            else if (start >= 0) { runs.push(start,col,row); start = -1; }
          }
          if (start >= 0) runs.push(start,i1+1,row);
        }
        e.runVersion = this._paintOrderVersion;
      }
      const runs = e.runs || [], pad = (f.atlas.pad - 0.5) / f.atlas.ppm;
      for (let i = 0; i < runs.length; i += 3) {
        const c0 = runs[i], c1 = runs[i+1], row = runs[i+2];
        const cu0 = c0*f.cu - (c0 === 0 ? pad : 0), cu1 = c1*f.cu + (c1 === f.nu ? pad : 0);
        const cv0 = row*f.cv - (row === 0 ? pad : 0), cv1 = (row+1)*f.cv + (row+1 === f.nv ? pad : 0);
        if (dripOnly) {
          if (!f.wall || rr < R*0.3) continue;
          const u0 = Math.max(cu0,lu-rr*0.95), u1 = Math.min(cu1,lu+rr*0.95);
          const v0 = Math.max(cv0,lv-rr*DRIP_REACH), v1 = Math.min(cv1,lv-rr*0.3);
          if (u1 > u0 && v1 > v0) this._pushQuad(f,u0,u1,v0,v1,lu,lv,dn,R,g.team,g.seed,kind,sdu,sdv,sa,tn,dT,1);
        } else {
          const ext = rr*(reachK+1.4*sa), down = f.wall && g.dripDur ? rr*DRIP_REACH : 0;
          const u0 = Math.max(cu0,lu-ext), u1 = Math.min(cu1,lu+ext);
          const v0 = Math.max(cv0,lv-Math.max(ext,down)), v1 = Math.min(cv1,lv+ext);
          if (u1 > u0 && v1 > v0) this._pushQuad(f,u0,u1,v0,v1,lu,lv,dn,R,g.team,g.seed,kind,sdu,sdv,sa,tn,dT,0);
        }
      }
    }
  }`;
    code = once(code, oldGrowth, newGrowth, 'clip deferred growth to current per-cell owner');
    patch('  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {\n    if (r <= 0.02) return 0;',
      '  _cpuSplat(f, lu, lv, r, team, seed, sdu, sdv, sa, kind) {\n    this._lastPaintRange = null;\n    if (r <= 0.02) return 0;',
      'paint ownership range reset');
    patch('    if (i1 < i0 || j1 < j0) return 0;\n    let claimed = 0;',
      '    if (i1 < i0 || j1 < j0) return 0;\n    this._lastPaintRange = { i0, i1, j0, j1 };\n    let claimed = 0;',
      'paint ownership range capture');
    patch(`        const k = f.grid + j * f.nu + i;
        const prev = this.grid[k];
        if (prev === val) continue;
        this.grid[k] = val;
        claimed += cellA;
        if (f.turf && !this.dead[k]) {
          if (prev) this.counts[prev - 1]--;
          this.counts[team]++;
        }`,
      `        const k = f.grid + j * f.nu + i;
        const prev = this.grid[k], context = this._netPaintContext;
        const order = context?.order, prediction = context?.prediction, ack = context?.ack;
        let next = prev;
        if (order) {
          if (paintOrderAfter(order.epoch,order.sequence,this.gridOrderEpoch[k],this.gridOrderSeq[k])) {
            this.gridOrderEpoch[k] = order.epoch; this.gridOrderSeq[k] = order.sequence;
            this.gridCanonical[k] = val; orderChanged = true;
          }
          if (ack > 0 && this.gridPrediction[k] === ack) { this.gridPrediction[k] = -1; orderChanged = true; }
          next = this.gridPrediction[k] >= 0 ? prev : this.gridCanonical[k];
        } else if (prediction) {
          if (prediction.requestId > this.gridPrediction[k]) { this.gridPrediction[k] = prediction.requestId; orderChanged = true; next = val; }
        } else {
          if (this.gridCanonical[k] !== val) { this.gridCanonical[k] = val; orderChanged = true; }
          next = val;
        }
        if (prev === next) continue;
        this.grid[k] = next;
        gridChanged = true;
        if (next === val) claimed += cellA;
        if (f.turf && !this.dead[k]) {
          if (prev) this.counts[prev - 1]--;
          if (next) this.counts[next - 1]++;
        }`,
      'resolve per-cell prediction and canonical order');
    patch('    let claimed = 0;\n    const cellA = f.cu * f.cv;',
      '    let claimed = 0, orderChanged = false, gridChanged = false;\n    const cellA = f.cu * f.cv;',
      'track ownership version changes');
    patch('    if (claimed > 0) this.version++;\n    return claimed;\n  }',
      '    if (orderChanged) this._paintOrderVersion++;\n    if (gridChanged) this.version++;\n    return claimed;\n  }',
      'version cell-owner changes for deferred growth');
    patch('  dispose() { this.rt.dispose();',
      `  cancelPredictedPaint() {
    if (!this.gridPrediction) return;
    let changed = false;
    for (let i = 0; i < this.gridPrediction.length; i++) if (this.gridPrediction[i] >= 0) { this.gridPrediction[i] = -1; changed = true; }
    if (!changed) return;
    this.grid.set(this.gridCanonical);
    this.counts[0] = this.counts[1] = 0;
    for (const f of this.paintFaces) if (f.turf) for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
      const k = f.grid + j*f.nu + i;
      if (!this.dead[k] && this.grid[k]) this.counts[this.grid[k]-1]++;
    }
    this._paintOrderVersion++;
    this.version++;
  }

  dispose() { this.rt.dispose();`,
      'discard rejected predictions on host change');
    code += `\nfunction paintContextFrom(opts) {
  if (opts?._netOrder) return { order:opts._netOrder, prediction:null, ack:opts._netPredictionAck || 0 };
  if (opts?._netPrediction) return { order:null, prediction:opts._netPrediction, ack:0 };
  return null;
}
function paintOrderAfter(epoch,sequence,oldEpoch,oldSequence) {
  return epoch > oldEpoch || (epoch === oldEpoch && sequence > oldSequence);
}
`;
  }
  return code;
}

// Network owns the wire contract. Compose LAST; upstream modules and gameplay
// tuning remain immutable. Each connection fails closed on source drift.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptIssue1088SurgePresentation } from './issue-1088-surge-adapter.mjs';
export const NETWORK_ROOT = fileURLToPath(new URL('./', import.meta.url));
function once(code, before, after, label) {
  const i = code.indexOf(before);
  if (i < 0 || code.indexOf(before, i + before.length) >= 0) throw Error('Network replication anchor mismatch: ' + label);
  return code.slice(0,i) + after + code.slice(i+before.length);
}
function replaceAllExpected(code, before, after, expected, label) {
  const count = code.split(before).length - 1;
  if (count !== expected) throw Error('Network replication anchor mismatch: ' + label + ' (' + count + ' != ' + expected + ')');
  return code.split(before).join(after);
}
export function networkIdentity() {
  return Object.fromEntries(['adapter.mjs', 'issue-1088-surge-adapter.mjs', 'issue-1088-surge-presentation.mjs']
    .map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex')]));
}
export function adaptNetworkSource(rel, code) {
  const patch = (before,after,label) => { code = once(code,before,after,rel+': '+label); };
  if (rel === 'src/game/inkFlightRuntime.js') {
    patch('      for (const actor of G.actors) {',
      '      for (const actor of G.actors) {\n        if (p.ghost) break; // remote actor geometry cannot retire an owner-controlled head',
      'source-guided head collision authority');
    patch('this.system.applyHit(p.owner, target, damage, p.wid || p.inkKey);',
      '{ p._netHitActor = true; p._netHitX = p.pos.x; p._netHitY = p.pos.y; p._netHitZ = p.pos.z; this.system.applyHit(p.owner, target, damage, p.wid || p.inkKey); }',
      'source-guided head terminal identity');
    return code;
  }
  if (rel === 'src/world/paint.js') {
    patch('    const nm = G.netm;', '    const nm = G.netm;\n    let paintOrder = opts.__netOrder || null;', 'paint event identity enters shared owner');
    patch('if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); nm.recSplat(center, radius, team, opts); }',
      'if (!nm.applying) { if (opts.seed === undefined) opts.seed = Math.random(); paintOrder = nm.recSplat(center, radius, team, opts) || null; }',
      'local paint captures canonical network identity');
    patch('    const cosmetic = !!opts.cosmetic;',
      '    const cosmetic = !!opts.cosmetic;\n    const netOrderId = !cosmetic && paintOrder ? this._paintOrderId(paintOrder) : 0;\n    const ownerOrder = netOrderId || this._paintCurrentOrder || 0;\n    const orderState = ownerOrder && !cosmetic ? { accepted: false } : null;',
      'shared local and network cell owner');
    patch('if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);\n          entries.push(f, lu, lv, dn, sdu, sdv, sa);',
      'if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind, ownerOrder, orderState);\n          if (netOrderId || !orderState || orderState.accepted) entries.push(f, lu, lv, dn, sdu, sdv, sa);',
      'retain ordered ancillary growth while masking rejected body cells');
    patch('          if (g.team === team || g.kind === K_SPECK) continue;',
      '          if (g.netOrderId || netOrderId || g.team === team || g.kind === K_SPECK) continue;',
      'network growth cannot finish by packet arrival order');
    patch('        g.cx = center.x; g.cy = center.y; g.cz = center.z;\n        g.paintOwner = this._paintOwnerContext?.owner || null;\n        g.paintCreditMode = this._paintOwnerContext?.mode || 0;\n        g.paintOrder = this._paintCurrentOrder || 0;',
      '        g.cx = center.x; g.cy = center.y; g.cz = center.z;\n        g.paintOwner = this._paintOwnerContext?.owner || null;\n        g.paintCreditMode = this._paintOwnerContext?.mode || 0;\n        g.paintOrder = ownerOrder; g.netOrderId = netOrderId;',
      'growth keeps the shared canonical owner');
    patch('  _emitGrowth(g, tn, dT, dripOnly) {', `  _emitGrowth(g, tn, dT, dripOnly) {
    const draw = (f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode) => {
      if (!g.netOrderId) { this._pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode); return; }
      const count = this._paintOrderRuns(f, g.netOrderId, u0, u1, v0, v1), runs = this._paintOrderRunScratch;
      for (let i = 0; i < count; i++) { const at = i * 4;
        this._pushQuad(f, runs[at], runs[at + 1], runs[at + 2], runs[at + 3], lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode);
      }
    };`, 'GPU growth uses the CPU owner mask');
    patch('this._pushQuad(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);',
      'draw(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);',
      'wall drips respect the shared CPU mask');
    patch('this._pushQuad(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);',
      'draw(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);',
      'body growth respects the shared CPU mask');
    patch('    if (r <= 0.02) return 0;',
      '    if (r <= 0.02) { if (orderState) orderState.accepted = true; return 0; }',
      'keep existing fine paint presentation');
  }
  if (rel === 'src/core/ctx.js') {
    patch('export function emit(name, payload) {\n  const set = listeners.get(name);\n  if (!set) return;\n  for (const fn of set) fn(payload);\n}', `const EVENT_VECTOR_FIELDS = Object.freeze({
  muzzle: eventVectorField('weapon-fire-muzzle', readMuzzle, writeMuzzle),
  dir: eventVectorField('weapon-fire-direction', readDirection, writeDirection),
  pos: eventVectorField('weapon-impact-position', readPosition, writePosition),
  normal: eventVectorField('weapon-impact-normal', readNormal, writeNormal),
});
function eventVectorField(name, get, set) {
  return {
    x: Symbol(name + '.x'), y: Symbol(name + '.y'), z: Symbol(name + '.z'),
    cached: Symbol(name + '.cached'), valid: Symbol(name + '.valid'), wrapped: Symbol(name + '.wrapped'), get, set,
    xDescriptor: { configurable: true, writable: true, value: 0 },
    yDescriptor: { configurable: true, writable: true, value: 0 },
    zDescriptor: { configurable: true, writable: true, value: 0 },
    cachedDescriptor: { configurable: true, writable: true, value: undefined },
    validDescriptor: { configurable: true, writable: true, value: false },
    wrappedDescriptor: { configurable: true, writable: true, value: false },
    propertyDescriptor: { configurable: true, enumerable: true, get, set },
  };
}
function writeVectorSlot(payload, field, slot, value) {
  const descriptor = field[slot + 'Descriptor'];
  descriptor.value = value;
  Object.defineProperty(payload, field[slot], descriptor);
}
function setVectorCoordinates(payload, field, value) {
  payload[field.valid] = !!value && !!value.isVector3;
  if (!payload[field.valid]) return;
  writeVectorSlot(payload, field, 'x', value.x);
  writeVectorSlot(payload, field, 'y', value.y);
  writeVectorSlot(payload, field, 'z', value.z);
}
function materializeVector(payload, field) {
  const cached = payload[field.cached];
  if (cached !== undefined || !payload[field.valid]) return cached;
  const vector = new THREE.Vector3(payload[field.x], payload[field.y], payload[field.z]);
  writeVectorSlot(payload, field, 'cached', vector);
  return vector;
}
function assignVector(payload, field, value) {
  setVectorCoordinates(payload, field, value);
  writeVectorSlot(payload, field, 'cached', value);
}
function readMuzzle() { return materializeVector(this, EVENT_VECTOR_FIELDS.muzzle); }
function writeMuzzle(value) { assignVector(this, EVENT_VECTOR_FIELDS.muzzle, value); }
function readDirection() { return materializeVector(this, EVENT_VECTOR_FIELDS.dir); }
function writeDirection(value) { assignVector(this, EVENT_VECTOR_FIELDS.dir, value); }
function readPosition() { return materializeVector(this, EVENT_VECTOR_FIELDS.pos); }
function writePosition(value) { assignVector(this, EVENT_VECTOR_FIELDS.pos, value); }
function readNormal() { return materializeVector(this, EVENT_VECTOR_FIELDS.normal); }
function writeNormal(value) { assignVector(this, EVENT_VECTOR_FIELDS.normal, value); }
function snapshotEventVector(payload, key) {
  const field = EVENT_VECTOR_FIELDS[key];
  if (!field || payload[field.wrapped]) return false;
  const value = payload[key];
  if (!value || !value.isVector3) return false;
  writeVectorSlot(payload, field, 'x', value.x);
  writeVectorSlot(payload, field, 'y', value.y);
  writeVectorSlot(payload, field, 'z', value.z);
  writeVectorSlot(payload, field, 'valid', true);
  Object.defineProperty(payload, key, field.propertyDescriptor);
  writeVectorSlot(payload, field, 'wrapped', true);
  return true;
}
function snapshotWeaponEvent(name, payload) {
  if (!payload || typeof payload !== 'object') return;
  if (name === 'weapon:fire') { snapshotEventVector(payload, 'muzzle'); snapshotEventVector(payload, 'dir'); }
  else if (name === 'weapon:impact') { snapshotEventVector(payload, 'pos'); snapshotEventVector(payload, 'normal'); }
}
export function isEventVectorPayload(payload, key) {
  const field = EVENT_VECTOR_FIELDS[key];
  return !!(field && payload && payload[field.valid] && (payload[field.cached] === undefined || payload[field.cached] !== null && payload[field.cached] !== undefined && payload[field.cached].isVector3));
}
export function hasEventVector(payload, key) {
  const field = EVENT_VECTOR_FIELDS[key];
  if (field && payload && payload[field.valid]) return payload[field.cached] === undefined || !!payload[field.cached];
  return !!(payload && payload[key]);
}
export function eventVectorComponent(payload, key, axis) {
  const field = EVENT_VECTOR_FIELDS[key];
  if (field && payload && payload[field.valid]) {
    const cached = payload[field.cached];
    if (cached !== undefined) return cached ? cached[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z'] : undefined;
    return payload[axis === 0 ? field.x : axis === 1 ? field.y : field.z];
  }
  const value = payload && payload[key];
  return value && value[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z'];
}
export function copyEventVector(payload, key, target) {
  const field = EVENT_VECTOR_FIELDS[key];
  if (field && payload && payload[field.valid]) {
    const cached = payload[field.cached];
    if (cached !== undefined) { if (!cached) return false; target.copy(cached); return true; }
    target.set(payload[field.x], payload[field.y], payload[field.z]);
    return true;
  }
  const value = payload && payload[key];
  if (!value) return false;
  target.copy(value);
  return true;
}
export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set) return;
  snapshotWeaponEvent(name, payload);
  for (const fn of set) fn(payload);
}`, 'snapshot event vectors before synchronous dispatch');
    code = "import * as THREE from 'three';\n" + code;
    return code;
  }
  if (rel === 'src/net/netmatch.js') {
    code = "import { isPaintOrderClock, nextPaintOrderClock, paintClockComesAfter } from '../../patches/splatoon3/runtime/paint-ownership.mjs';\n" + code;
    patch('  if (a.invuln > 0) f |= F.invuln;', '  if (a.invuln > 0 || slamProtected(a)) f |= F.invuln;', 'Slam authoritative invulnerability wire flag');
    code = "import { slamProtected } from '../../patches/splatoon3/runtime/tidal-slam-gauge.mjs';\nimport { retireDisconnectedMainProjectiles } from '../../patches/splatoon3/runtime/disconnect-fidelity.mjs';\n" + code;
    code = "import { recordWipeoutLife, packWipeoutTimeline, acceptWipeoutTimeline, acceptWipeoutConfirmation, replayWipeoutConfirmations } from '../../patches/splatoon3/runtime/disconnect-fidelity.mjs';\n" + code;
    patch("    this._rec(['ev', name, packEvent(e)]);", "    recordWipeoutLife(this, name, e);\n    this._rec(['ev', name, packEvent(e)]);", 'owner wipeout transitions');
    patch('    if (this.out.length) { msg.e = this.out; this.out = []; }', '    const wf = packWipeoutTimeline(this); if (wf) msg.wf = wf;\n    replayWipeoutConfirmations(this);\n    if (this.out.length) { msg.e = this.out; this.out = []; }', 'owner wipeout history and watermark');
    patch("      case 't': this._tick(from, d); break;", "      case 't': if (d.wf) acceptWipeoutTimeline(this, from, d.wf); this._tick(from, d); break;\n      case 'wc': acceptWipeoutConfirmation(this, from, d); break;", 'authenticated wipeout protocol');
    code = "import { acceptOnlineContinuation, tickOnlineContinuation } from '../../patches/splatoon3/runtime/disconnect-fidelity.mjs';\n" + code;
    patch('  _sendTick() {', '  _sendTick() {\n    tickOnlineContinuation(this);', 'per-player result continuation');
    patch("      case 'wc': acceptWipeoutConfirmation(this, from, d); break;", "      case 'wc': acceptWipeoutConfirmation(this, from, d); break;\n      case 'rc': acceptOnlineContinuation(this, from, d); break;", 'continuation sender and match identity');
    patch('    this.myId = session.myId;', '    this.myId = session.myId;\n    this._matchStateAPI = { G, emit };', 'native match-state protocol context');
    patch('    this.cfg = cfg;\n    this.myId = session.myId;', '    this.cfg = cfg;\n    this._firstSplatState = firstSplatStateFor(session,cfg);\n    this._paintClockState = paintClockStateFor(session,cfg);\n    this.myId = session.myId;', 'match-scoped first-splat decision state');
    patch('    G.netm = this;\n    for (const a of match.actors)', '    G.netm = this;\n    this._requestFirstSplat();\n    for (const a of match.actors)', 'reconnect first-splat decision request');
    patch("    this.unsubs.push(on('match:state', ({ state, match: m }) => { if (m === this.match && this.isHost) this._sendNow({ k: 'st', s: state, t: r2(m.time) }); }));",
      "    this.unsubs.push(on('match:state', ({ state, match: m }) => { if (m === this.match && this.isHost) { const d={ k:'st', s:state, t:r2(m.time) }; if (state==='finish' && validFinishCoverage(m.s3FinishCoverage)) d.fc=[...m.s3FinishCoverage]; if (state==='finish' && validFinishMapDataUrl(m.s3FinishMapDataUrl)) d.fm=m.s3FinishMapDataUrl; this._sendNow(d); } }));",
      'propagate immutable Turf finish snapshot');
    patch("      case 'own': if (from === this.s.hostId) this._ownership(d.map); break;", "      case 'own': if (from === this.s.hostId) this._ownership(d.map); break;\n      case 'fs': this._acceptFirstSplat(from,d); break;\n      case 'fsq': this._answerFirstSplat(from,d); break;", 'first-splat host confirmation packets');
    patch(`  _hostState(d) {
    const m = this.match;
    if (!m || this.isHost) return;
    if (typeof d.t === 'number') m.time = d.t;
    if (d.s !== m.state && d.s !== 'judge') m.setState(d.s);
  }`, `  _hostState(d) {
    const m = this.match;
    if (!m || this.isHost) return;
    if (typeof d.t === 'number') m.time = d.t;
    if (d.s === 'finish') {
      if (validFinishCoverage(d.fc)) m.s3FinishCoverage = Object.freeze([d.fc[0], d.fc[1]]);
      if (validFinishMapDataUrl(d.fm)) m.s3FinishMapDataUrl = d.fm;
    }
    if (d.s !== m.state && d.s !== 'judge') m.setState(d.s);
  }`, 'receive immutable Turf finish snapshot');
    patch('  _remoteSplat(victim, attacker, cause) {', `  _requestFirstSplat() {
    const id = this.cfg?.id;
    if (!this.isHost && typeof id === 'string' && id && this.s.hostId) this.s.tr?.sendTo(this.s.hostId,{k:'fsq',m:id});
  }

  _firstSplatPair(attackerNid,victimNid) {
    const m = this.match, validNid = n => Number.isSafeInteger(n) && n >= 0;
    if (!m || G.netm !== this || m.attract || m.range || m.opts?.range
      || !validNid(attackerNid) || !validNid(victimNid) || attackerNid === victimNid) return null;
    const attacker = this.byNid.get(attackerNid), victim = this.byNid.get(victimNid);
    if (!attacker || !victim || !m.actors?.includes(attacker) || !m.actors?.includes(victim)
      || attacker.team === victim.team) return null;
    return { attacker, victim };
  }

  claimFirstSplat(attacker,victim) {
    const state = this._firstSplatState;
    if (!this.isHost || !state.matchId || state.matchId !== this.cfg?.id || state.claimed
      || !attacker || !victim) return false;
    const pair = this._firstSplatPair(attacker.nid,victim.nid);
    if (!pair || pair.attacker !== attacker || pair.victim !== victim) return false;
    state.claimed = true;
    state.attackerNid = attacker.nid; state.victimNid = victim.nid;
    this._sendNow({k:'fs',m:state.matchId,a:state.attackerNid,v:state.victimNid});
    return true;
  }

  _acceptFirstSplat(from,d) {
    const state = this._firstSplatState;
    if (from !== this.s.hostId || !state.matchId || d?.m !== this.cfg?.id || d.m !== state.matchId || state.claimed) return false;
    const pair = this._firstSplatPair(d.a,d.v);
    if (!pair) return false;
    state.claimed = true;
    state.attackerNid = pair.attacker.nid; state.victimNid = pair.victim.nid;
    emit('flow:first-splat-confirmed',{match:this.match,matchId:d.m,attacker:pair.attacker,victim:pair.victim});
    return true;
  }

  _answerFirstSplat(from,d) {
    const state = this._firstSplatState;
    if (!this.isHost || from === this.myId || !this.s._members?.has(from)
      || !state.matchId || d?.m !== this.cfg?.id || d.m !== state.matchId || !state.claimed) return false;
    this.s.tr?.sendTo(from,{k:'fs',m:state.matchId,a:state.attackerNid,v:state.victimNid});
    return true;
  }

  _remoteSplat(victim, attacker, cause) {`, 'host-authoritative first-splat protocol');
    patch('    if (!victim || !victim.alive) return;\n    victim.alive = false;', "    if (!victim || !victim.alive) return;\n    emit('flow:splat-observed',{match:this.match,victim,attacker,cause});\n    clearRemoteSquidroll(victim);\n    clearRemoteRollerPresentation(victim);\n    victim.alive = false;", 'Flow observes only accepted remote splats');
    patch("import { G, emit, on } from '../core/ctx.js'",
      "import { G, emit, on, isEventVectorPayload, eventVectorComponent } from '../core/ctx.js';\nimport { exportPendingLethal, restorePendingLethal } from '../../patches/splatoon3/runtime/damage-timing.mjs';\nimport { exportSplatlingReservation, isValidSplatlingReservation, refundSplatlingReservation } from '../../patches/splatoon3/runtime/splatling.mjs';\nimport { validFinishCoverage, validFinishMapDataUrl } from '../../patches/splatoon3/runtime/turf-finish.mjs'",
      'read numeric event and adoption snapshots');
    patch(`    if (a.weapon.kind === 'roller' && (f & F.flickVertical)) {
      const w = a.weapon;
      if (!wr.s3RollerAttack?.networkRemote) wr.s3RollerAttack = {
        networkRemote: true, vertical: true, windup: w.verticalWindup,
        interval: w.verticalInterval ?? w.flickInterval, elapsed: 0, released: false, rolling: false,
      };
      const attack = wr.s3RollerAttack;
      attack.elapsed = Math.min(attack.interval, attack.elapsed + Math.max(0, dt));
      attack.released = !(f & F.flick); attack.rolling = wr.rolling;
      wr.s3FlickVertical = true;
      a.character.s3RollerFlick = attack;
    } else if (wr.s3RollerAttack?.networkRemote) {
      wr.s3RollerAttack = null; wr.s3FlickVertical = false;
      a.character.s3RollerFlick = null;
    }
`, '', 'remote Roller mode remains Character presentation only');
    patch('invuln: 262144, enemy: 524288,',
      'invuln: 262144, enemy: 524288, rollerFoldAttack: 1048576, rollerFoldVertical: 2097152,',
      'roller fold mode snapshot flags');
    patch('if (wr.slosh >= 0) f |= F.slosh;',
      'if (wr.slosh >= 0) f |= F.slosh;\n  if (wr.s3RollerAttack) f |= F.rollerFoldAttack;\n  if (wr.s3RollerAttack?.vertical) f |= F.rollerFoldVertical;',
      'pack owner Roller fold mode');
    patch('wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;',
      'wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;\n    wr.s3RollerFoldAttack = f & F.rollerFoldAttack ? { vertical: !!(f & F.rollerFoldVertical) } : null;\n    applyRemoteRollerPresentation(a, S.rollerFlick, dt, !!(S.f & F.alive));',
      'apply remote Roller fold mode');
    patch('const FORWARD = [', "const FORWARD = ['hit', 'hit:rejected', ",
      'authoritative hit admission feedback');
    patch('    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;',
      "    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;\n    if (name === 'hit' && e.killed) return;",
      'lethal confirmation remains owned by splat event');
    {
      const hitCalls = [
        'G.projectiles?.applyHit(atk, v, d.d, d.w);',
        'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);'
      ];
      const hitCall = hitCalls.find(candidate => code.includes(candidate));
      if (!hitCall) throw Error('Network replication anchor mismatch: ' + rel + ': owner hit admission result');
      patch(hitCall,
        `const hitAdmission = ${hitCall.slice(0, -1)};\n    if (hitAdmission === 'rejected-invulnerable') emit('hit:rejected', { attacker: atk, victim: v, damage: d.d, weaponId: d.w });`,
        'owner confirms invulnerability rejection');
    }
    code = "import { packRollerPresentation, readRollerPresentation, applyRemoteRollerPresentation, clearRemoteRollerPresentation } from '../../patches/network-replication/roller-presentation.mjs';\nimport { validFidelityRollerUnitPacket } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + code;
    patch('  sendHit(attacker, victim, dmg, wid) {',
      '  sendHit(attacker, victim, dmg, wid, slosherVolleyId) {', 'Slosher volley identity send');
    {
      const matches = [...code.matchAll(/    this\.s\.tr\?\.sendTo\(victim\.owner, \{ k: 'hit',[^\n]+\}\);/g)];
      if (matches.length === 1) {
        const match = matches[0], payload = match[0].slice(match[0].indexOf('{'), -2);
        const replacement = `    const hit = ${payload};\n    if (slosherVolleyId != null) hit.g = slosherVolleyId;\n    this.s.tr?.sendTo(victim.owner, hit);`;
        code = code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length);
      } else if (matches.length === 0 && code.includes("const message = { k: 'hit', v: victim.nid, a: attacker.nid,")) {
        // #1033 stores a bounded retransmission record before attempting
        // delivery. Carry the Slosher group on THAT stored object so a later
        // negative-ACK retry retains the same group identity.
        patch('    this.s.tr?.sendTo(victim.owner, message);',
          '    if (slosherVolleyId != null) message.g = slosherVolleyId;\n    this.s.tr?.sendTo(victim.owner, message);',
          'Slosher volley identity on retryable hit');
      } else {
        throw Error('Network replication anchor mismatch: ' + rel + ': Slosher volley identity wire field');
      }
    }
    const groupedHit = 'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);';
    patch(code.includes(groupedHit) ? groupedHit : 'G.projectiles?.applyHit(atk, v, d.d, d.w);',
      groupedHit, 'Slosher volley identity owner admission');
    // #1150: a missing/invalid volley cannot downgrade an online maximum to
    // ungrouped damage. Existing combat-life admission owns respawn isolation.
    code = "import { validDamageGroup } from '../../patches/splatoon3/runtime/final-damage.mjs';\n" + code;
    patch('    this.s.tr?.sendTo(victim.owner, message);',
      `    if (WEAPONS[wid]?.kind === 'slosher') {
      if (typeof message.g !== 'string' || !validDamageGroup(message.g)) { this.hitPending.delete(message.seq); this._pendingHits?.delete(message.h); return false; }
    }
    this.s.tr?.sendTo(victim.owner, message);`, 'Slosher required volley identity');
    patch('    this._applyingHit = true;', `    if (WEAPONS[d.w]?.kind === 'slosher' &&
      (typeof d.g !== 'string' || !validDamageGroup(d.g))) return;
    this._applyingHit = true;`, 'Slosher owner identity admission');
    patch('  dispose() {\n    for (const u of this.unsubs)', `  dispose() {
    for (const a of this.byNid.values()) { clearRemoteSquidroll(a); clearRemoteRollerPresentation(a); }
    retireNetworkGhosts();
    for (const u of this.unsubs)`, 'session disposal retirement');
    patch('  _remove(a) {\n    this.byNid.delete(a.nid);', `  _remove(a) {
    clearRemoteSquidroll(a);
    clearRemoteRollerPresentation(a);
    retireNetworkGhosts(a);
    this.byNid.delete(a.nid);`, 'departed owner retirement');

    patch('  _hit(d, from) {', `  _hit(d, from) {
    // Bomb damage is victim-owned. Ignore attack-side guesses, including packets
    // from older clients; the ordered bomb event is replayed on the victim owner.
    if (d.w === 'bomb' || d.w === 'splat-bomb-far') return;`, 'reject shooter bomb hit');
    patch("  shouldApplyHit(attacker, victim) {\n    // ghosts never hurt anyone; the shooter's client decides, the victim's owner applies\n    if (this._applyingHit) return 'local';",
      `  shouldApplyHit(attacker, victim, weaponId) {
    // A bomb ghost tests local actors using their owner's position and LOS.
    // Never accept the attacker's remote-actor geometry as bomb authority.
    if (this._applyingHit) return 'local';
    if (weaponId === 'bomb' || weaponId === 'splat-bomb-far') return victim.remote ? 'drop' : 'local';`, 'bomb recipient authority');

    patch('  onLeave(id, hostChanged) {', '  onLeave(id, hostChanged) {\n    this.s._members?.delete(id);\n    this.peers.delete(id);', 'retire departed paint sender before replay');
    patch('  _rec(e) { this.out.push([r3(now()), ...e]); }', `  _rec(e) {
    const seq = this._eventSeq = Math.max(this._eventSeq || 0, this.s._inkwaveEventSeq || 0) + 1;
    if (!Number.isSafeInteger(seq)) throw new Error('Network event sequence exhausted');
    this.s._inkwaveEventSeq = seq;
    const tick = Math.round((G.time || 0)*60);
    const event = [r3(now()), ...e, tick, seq]; event._netSeq = seq; event._netTick = tick; this.out.push(event); return event;
  }`, 'ordered event identity');
    patch("const msg = { k: 't', ts: r3(now()), a",
      "const msg = { k: 't', ts: r3(now()), a, u: Math.round((G.time || 0)*60)",
      'owner simulation tick preserving existing sidecars');
    patch('    const a = [];\n    for (const x of this.byNid.values()) if (!x.remote) a.push(packActor(x));',
      '    const a = [], sq = Object.create(null), wp = Object.create(null), bw = Object.create(null), rf = Object.create(null);\n    const simulationTick = Math.max(0, Math.round((G.time || 0) * 60));\n    for (const x of this.byNid.values()) if (!x.remote) {\n      a.push(packActor(x));\n      const flick = packRollerPresentation(x, this, simulationTick);\n      if (flick) rf[x.nid] = flick;\n      const visual = packSquidrollSnapshot(x);\n      if (visual) sq[x.nid] = visual;\n      const wr = x.weaponRunner, slosh = x.weapon?.kind === \'slosher\' && Number.isFinite(wr?.slosh) && wr.slosh >= 0 ? Math.min(2, wr.slosh) : -1;\n      const sp = x.specialActive, phase = sp?.id === \'slam\' ? ({ rise:1, hang:2, fall:3 }[sp.phase] || 0) : 0;\n      const slamT = phase && Number.isFinite(sp.t) ? Math.max(0, Math.min(4, sp.t)) : 0;\n      if (slosh >= 0 || phase) wp[x.nid] = [slosh, phase, slamT];\n      const windup = x.weapon?.kind === \'blaster\' ? x.weaponRunner?.s3BlasterWindup : 0;\n      if (Number.isFinite(windup) && windup > 0) bw[x.nid] = Math.min(1, windup);\n    }',
      'append optional Squid Roll and weapon/special motion sidecars');
    patch('for (const p of this.peers.values()) this._advance(p, dt);', 'for (const p of this.peers.values()) { this._advance(p,dt); sampleOwnerSimulation(p); }', 'sample owner simulation clock');
    patch('    // actors\n    if (d.a)', `    if (Number.isSafeInteger(d.u)) {
      const points = p.physicsPoints || (p.physicsPoints = []);
      points.push(d.ts,d.u); if (points.length > 80) { points.copyWithin(0,points.length-80); points.length = 80; }
    }
    // actors
    if (d.a)`, 'snapshot physics tick pair');
    patch('if (this.out.length) { msg.e = this.out; this.out = []; }', 'if (Object.keys(sq).length) msg.sq = sq;\n    if (Object.keys(wp).length) msg.wp = wp;\n    if (Object.keys(bw).length) msg.bw = bw;\n    if (Object.keys(rf).length) msg.rf = rf;\n    if (this.out.length) { msg.r = 2; msg.e = this.out; this.out = []; }', 'event schema and optional presentation sidecars');
    patch('if (d.a) for (const s of d.a) {\n      const a = this.byNid.get(s[0]);',
      'if (d.a) for (const s of d.a) {\n      const rawRoll = d.sq && typeof d.sq === \'object\' && !Array.isArray(d.sq) && Object.hasOwn(d.sq, s[0])\n        ? readSquidrollSnapshot(d.sq[s[0]]) : null;\n      const roll = rawRoll === false ? null : rawRoll;\n      const rawPose = d.wp && typeof d.wp === \'object\' && !Array.isArray(d.wp) && Object.hasOwn(d.wp, s[0]) ? d.wp[s[0]] : null;\n      const pose = Array.isArray(rawPose) && rawPose.length === 3 && Number.isFinite(rawPose[0]) && rawPose[0] >= -1 && rawPose[0] <= 2 && Number.isInteger(rawPose[1]) && rawPose[1] >= 0 && rawPose[1] <= 3 && Number.isFinite(rawPose[2]) && rawPose[2] >= 0 && rawPose[2] <= 4 ? rawPose : null;\n      const rawWindup = d.bw && typeof d.bw === \'object\' && !Array.isArray(d.bw) && Object.hasOwn(d.bw, s[0]) ? d.bw[s[0]] : 0;\n      const windup = Number.isFinite(rawWindup) && rawWindup > 0 && rawWindup <= 1 ? rawWindup : 0;\n      const rawFlick = d.rf && typeof d.rf === \'object\' && !Array.isArray(d.rf) && Object.hasOwn(d.rf, s[0]) ? d.rf[s[0]] : null;\n      const flick = readRollerPresentation(rawFlick); if (flick) flick.owner = from;\n      const a = this.byNid.get(s[0]);',
      'strict optional Squid Roll and motion metadata validation');
    patch('      const snap = unpackActor(s, d.ts);\n      snap.spCost = d.sc?.[a.nid];',
      '      const snap = unpackActor(s, d.ts);\n      snap.rollId = roll?.id ?? 0; snap.rollRemaining = roll?.remaining ?? 0;\n      snap.rollVx = roll?.vx ?? 0; snap.rollVz = roll?.vz ?? 0;\n      snap.sloshElapsed = pose ? pose[0] : -1; snap.slamPhase = pose ? pose[1] : 0; snap.slamT = pose ? pose[2] : 0;\n      snap.blasterWindup = windup; snap.rollerFlick = flick;\n      snap.spCost = d.sc?.[a.nid];',
      'attach validated presentation-only action clocks');
    patch('if (d.e) for (const e of d.e) p.events.push(e);', `if (d.e) for (const e of d.e) {
      if (!Array.isArray(e) || !Number.isFinite(e[0])) continue;
      e._netPeer = from;
      if (d.r === 2) { const seq = e[e.length-1]; if (!Number.isSafeInteger(seq) || seq < 1) continue; e._netSeq = seq; const tick = e[e.length-2]; if (Number.isSafeInteger(tick)) e._netTick = tick; }
      // Receiver-created proof only: an event cannot supply its own authority.
      e._stormSnapshot = null;
      e._deadlineEligible = e[1] === 's' && this.isHost && this.match?.state === 'playing'
        && d.r === 2 && Number.isSafeInteger(e._netTick) && Number.isSafeInteger(d.u)
        && e._netTick >= 0 && e._netTick <= d.u;
      e._finishPaintApplied = false;
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
      if (e[1] === 's') {
        if (e._netSeq !== undefined && e._netSeq <= Math.max(p._lastEventSeq || 0, p._lastPaintSeq || 0, this._paintClockState.applied.get(from) || 0)) continue;
        if (receivePaintOrder(this, from, e) === false) continue;
        if (e._netSeq !== undefined) p._lastPaintSeq = e._netSeq;
      }
      p.events.push(e);
    }`, 'receive event identity');
    patch("    this._rec(['ev', name, packEvent(e)]);", "    this._rec(['ev',name,packEvent(e,name === 'weapon:fire' && (WEAPONS[e.weapon] || a.weapon)?.kind === 'charger')]);", 'preserve hitscan endpoint state');
    patch('r2(p.vel.x), r2(p.vel.y), r2(p.vel.z)', 'p.vel.x, p.vel.y, p.vel.z', 'preserve nonlinear ballistic phase boundaries');
    patch('function packEvent(e) {', 'function packEvent(e, precise = false) {', 'hitscan precision policy');
    patch('  for (const k in e) {\n    const v = e[k];', `  for (const k in e) {
    if (isEventVectorPayload(e,k)) {
      const x = eventVectorComponent(e,k,0), y = eventVectorComponent(e,k,1), z = eventVectorComponent(e,k,2);
      o[k] = precise ? [x,y,z] : [r2(x),r2(y),r2(z)];
      continue;
    }
    const v = e[k];`, 'pack immutable event vectors without materializing');
    patch('else if (v && v.isVector3) o[k] = [r2(v.x), r2(v.y), r2(v.z)];', 'else if (v && v.isVector3) o[k] = precise ? [v.x,v.y,v.z] : [r2(v.x),r2(v.y),r2(v.z)];', 'hitscan unit direction and origin');
    patch("else if (typeof v === 'number') o[k] = r3(v);", "else if (typeof v === 'number') o[k] = precise ? v : r3(v);", 'hitscan charge and length');
    patch('while (i < p.events.length && p.events[i][0] <= tr) i++;',
      'while (i < p.events.length && p.events[i][0] <= tr && (!Number.isFinite(p.events[i]._netTick) || !Number.isFinite(p.sim) || p.events[i]._netTick <= p.sim + .0306)) i++;',
      'events share owner simulation time during render hitches');
    patch('  o.lock = a.lock + (b.lock - a.lock) * u;\n  const sameJumpPhase = (a.f & (F.sjCharge | F.sjFlight)) === (b.f & (F.sjCharge | F.sjFlight));\n  o.sjT = sameJumpPhase ? Math.max(0, a.sjT + (b.sjT - a.sjT) * u) : Math.max(0, a.sjT);\n  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  o.spCost = a.spCost;\n  return o;',
      '  o.lock = a.lock + (b.lock - a.lock) * u;\n  const sameJumpPhase = (a.f & (F.sjCharge | F.sjFlight)) === (b.f & (F.sjCharge | F.sjFlight));\n  o.sjT = sameJumpPhase ? Math.max(0, a.sjT + (b.sjT - a.sjT) * u) : Math.max(0, a.sjT);\n  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  if (a.rollId && a.rollId === b.rollId) o.rollRemaining = a.rollRemaining + (b.rollRemaining - a.rollRemaining) * u;\n  if (a.sloshElapsed >= 0 && b.sloshElapsed >= 0) o.sloshElapsed = a.sloshElapsed + (b.sloshElapsed - a.sloshElapsed) * u;\n  if (a.slamPhase && a.slamPhase === b.slamPhase) o.slamT = a.slamT + (b.slamT - a.slamT) * u;\n  o.blasterWindup = (a.blasterWindup || 0) + ((b.blasterWindup || 0) - (a.blasterWindup || 0)) * u;\n  o.spCost = a.spCost;\n  return o;',
      'interpolate matching presentation action clocks');
    patch('    const S = n.cur;\n    if (!a.alive) { a.respawnTimer -= dt; return; }',
      '    const S = n.cur;\n    if (a.remote) {\n      const flags = S.f;\n      if (!a.alive || !(flags & F.alive) || !(flags & F.squid) || (flags & F.special) || !S.rollId) clearRemoteSquidroll(a);\n      else syncRemoteSquidroll(a, S, this.peers.get(a.owner));\n    }\n    if (!a.alive) { a.respawnTimer -= dt; return; }',
      'remote presentation follows accepted owner Roll snapshot');
    patch('    wr.aimingSub = !!(f & F.subAim); wr.firingT = f & F.firing ? 0.3 : 0;',
      '    wr.aimingSub = !!(f & F.subAim); wr.firingT = f & F.firing ? 0.3 : 0;\n    wr.s3BlasterWindup = a.weapon.kind === \'blaster\' ? Math.max(0, Number(S.blasterWindup) || 0) : 0;',
      'remote Blaster startup windup presentation');
    patch('        a.character._netTrig?.(e[3], unpackTrig(e[4]));',
      "        if (e[3] === 'movement_cancel' || e[3] === 'land' || e[3] === 'spawn') clearRemoteSquidroll(a, true);\n        a.character._netTrig?.(e[3], unpackTrig(e[4]));",
      'remote cancellation event invalidates current visual Roll');
    patch('      if (drop) { this._remove(a); continue; }\n      a.owner = this.s.hostId;',
      '      if (drop) { this._remove(a); continue; }\n      clearRemoteSquidroll(a);\n      clearRemoteRollerPresentation(a);\n      retireNetworkGhosts(a);\n      if (a.net) a.net._stormBirthAuth = null;\n      a.owner = this.s.hostId;', 'retire old timeline before remote owner transfer');
    patch('    const drop = mapNoBots(this.cfg.map);',
      "    const drop = this.cfg.map === 'range' || mapNoBots(this.cfg.map);", 'Practice Range remains humans-only on disconnect');
    patch('  _adopt(a) {', '  _adopt(a) {\n    const adoptionTransfer = latestAdoptionTransfer(a);\n    clearRemoteSquidroll(a);\n    clearRemoteRollerPresentation(a);\n    retireNetworkGhosts(a);\n    if (a.net) a.net._stormBirthAuth = null;', 'capture accepted actor state before adoption');
    patch('    a.superJumpState = null; a.specialActive = null;',
      '    a.superJumpState = null; a.specialActive = null;\n    restoreAdoptionState(this, a, adoptionTransfer);',
      'restore authoritative actor state after ordinary runner reset');
    {
      const rowWithStats = 'r3(Number.isFinite(a.superJumpState?.t) ? Math.max(0, a.superJumpState.t) : 0), a.stats.specials || 0];';
      if (code.includes(rowWithStats)) patch(rowWithStats,
        'r3(Number.isFinite(a.superJumpState?.t) ? Math.max(0, a.superJumpState.t) : 0), a.stats.specials || 0, packAdoptionState(a)];',
        'append tagged adoption state after existing special counter');
      else patch('r2(wr.lockT || 0)];',
        'r2(wr.lockT || 0), packAdoptionState(a)];',
        'append tagged adoption state to legacy actor row');
    }
    patch('wz: s[19], lock: s[20], sjT: Number.isFinite(s[21]) ? s[21] : 0 };',
      'wz: s[19], lock: s[20], sjT: Number.isFinite(s[21]) ? s[21] : 0, adoption: s[23] };',
      'unpack independent adoption row slot');
    patch('const mode = this._pathAt(buf, tr, S);',
      'const mode = this._pathAt(buf, tr, S);\n    S.adoption = sampleAdoptionState(buf, tr, mode, peer.sim);',
      'sample adoption state on the sender timeline');
    patch('      a.net.lastLife = snap.life;', `      if (s.length !== 21 && s.length !== 22 && s.length !== 23 && s.length !== 24 && s.length !== 25) continue;
      const adoption = s.length >= 24
        ? readAdoptionState(s[23], snap.life, s[10], s[11], a.weapon?.kind, a.net._adoptionSeq, a.weapon?.special)
        : null;
      if (s.length >= 24 && !adoption) continue;
      if (adoption) { snap.adoption = adoption; a.net._adoptionSeq = adoption.sequence; }
      else delete snap.adoption;
      a.net.lastLife = snap.life;`, 'strict life/sequence-bound adoption packet');
    patch('    const wr = a.weaponRunner;\n    wr.charging = !!(f & F.charging);',
      '    applyAdoptionSample(this, a, S);\n    const wr = a.weaponRunner;\n    wr.charging = !!(f & F.charging);',
      'restore adoption sample after authoritative age-based Super Jump phase');
    patch('    a.specialActive = f & F.special ? (a.specialActive || { id: a.weapon.special, net: true }) : null;',
      "    a.specialActive = f & F.special ? (a.specialActive || { id: a.weapon.special, net: true }) : null;\n    if (a.specialActive?.id === 'slam' && S.slamPhase) { a.specialActive.phase = ['','rise','hang','fall'][S.slamPhase]; a.specialActive.t = Math.max(0, S.slamT || 0); }",
      'remote Tidal Slam phase clock');
    patch('    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;',
      '    wr.slosh = f & F.slosh ? (Number.isFinite(S.sloshElapsed) && S.sloshElapsed >= 0 ? S.sloshElapsed : Math.max(0, wr.slosh)) : -1;',
      'remote Slosher elapsed windup clock');
    patch('    a.landT += dt; a.lastDamage += dt;',
      '    a.landT += dt; a.lastDamage += dt;\n    applyAdoptionRecoveryAge(this, a, S);',
      'retain remote elapsed damage recovery clock');
    patch('r3(o.seed ?? Math.random())', 'o.seed ?? Math.random()', 'preserve paint pattern seed');
    // #1112: CPU turf ownership must consume the exact same canonical stamp on
    // sender and receiver. Paint event transport therefore keeps gameplay
    // position/radius/stretch scalars unrounded; render-only compression belongs elsewhere.
    patch("this._rec(['s', r2(c.x), r2(c.y), r2(c.z), r2(radius), team, o.seed ?? Math.random(), o.kind ?? 0,",
      "this._rec(['s', c.x, c.y, c.z, radius, team, o.seed ?? Math.random(), o.kind ?? 0,",
      'full-precision paint position/radius');
    patch('st ? r3(st.x) : 0, st ? r3(st.y) : 0, st ? r3(st.z) : 0, st ? r2(o.stretchAmt ?? 1) : 0',
      'st ? st.x : 0, st ? st.y : 0, st ? st.z : 0, st ? (o.stretchAmt ?? 1) : 0',
      'full-precision paint stretch');
    patch("this._rec(['s', c.x, c.y, c.z, radius, team, o.seed ?? Math.random(), o.kind ?? 0,",
      "const event = this._rec(['s', c.x, c.y, c.z, radius, team, o.seed ?? Math.random(), o.kind ?? 0,",
      'return local paint order identity');
    patch('st ? st.x : 0, st ? st.y : 0, st ? st.z : 0, st ? (o.stretchAmt ?? 1) : 0, Number.isInteger(o.face) ? o.face : -1]);',
      'st ? st.x : 0, st ? st.y : 0, st ? st.z : 0, st ? (o.stretchAmt ?? 1) : 0, Number.isInteger(o.face) ? o.face : -1, nextPaintOrder(this, !!o.instant)]);\n    this._paintClockState.applied.set(this.s.myId, event._netSeq);\n    return { clock: event[14][2], epoch: event[14][1], peer: this.s.myId, seq: event._netSeq };',
      'return local paint order identity');

    patch('r3(p.delay || 0), r3(p.life), r3(p.straight)', 'p.delay || 0, p.life, p.straight', 'preserve exact physics timing boundaries');
    const inkMetaBase = 'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null]);';
    const inkMetaKitBirth = 'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex)]);';
    const poweredInkMetaKitBirth = 'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), ...(Number.isFinite(p.s3SpecialWeapon?.specialPowerAP) ? [{ s3SpecialPowerAP: p.s3SpecialWeapon.specialPowerAP ?? 0 }] : [])]);';
    const kitBirth = 'p.nose ?? 0.3, p.sats ?? 3, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex)]);';
    const poweredKitBirth = 'p.nose ?? 0.3, p.sats ?? 3, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), ...(Number.isFinite(p.s3SpecialWeapon?.specialPowerAP) ? [{ s3SpecialPowerAP: p.s3SpecialWeapon.specialPowerAP ?? 0 }] : [])]);';
    if (code.includes(poweredInkMetaKitBirth)) patch(poweredInkMetaKitBirth,
      'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1, ...(Number.isFinite(p.s3SpecialWeapon?.specialPowerAP) ? [{ s3SpecialPowerAP: p.s3SpecialWeapon.specialPowerAP ?? 0 }] : [])]);',
      'append immutable special power after ink metadata and stable birth fields');
    else if (code.includes(inkMetaKitBirth)) patch(inkMetaKitBirth,
      'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1]);',
      'append birth fields after ink metadata and kit fields');
    else if (code.includes(poweredKitBirth)) patch(poweredKitBirth,
      'p.nose ?? 0.3, p.sats ?? 3, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1, ...(Number.isFinite(p.s3SpecialWeapon?.specialPowerAP) ? [{ s3SpecialPowerAP: p.s3SpecialWeapon.specialPowerAP ?? 0 }] : [])]);',
      'append immutable special power after stable birth fields');
    else if (code.includes(kitBirth)) patch(kitBirth,
      'p.nose ?? 0.3, p.sats ?? 3, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex), p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1]);',
      'append birth mode, appearance seed, identity, roller unit after kit fields');
    else if (code.includes(inkMetaBase)) patch(inkMetaBase,
      'p.nose ?? 0.3, p.sats ?? 3, p.inkMeta || null, p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1]);',
      'append birth fields after ink metadata');
    else patch('p.nose ?? 0.3, p.sats ?? 3]);',
      'p.nose ?? 0.3, p.sats ?? 3, p.s3Vertical ? 1 : 0, p.seed, (p._netId = this._projectileSeq = (this._projectileSeq || 0) + 1), p.fidelitySloshPacketIndex ?? p.fidelityRollerUnitIndex ?? -1]);',
      'append birth mode, appearance seed, identity, roller unit');
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
    patch('  _playEvents() {', `  _applyRemoteSplatEvent(e) {
    const order = readPaintOrder(this, e._netPeer, e);
    if (order === false) return false;
    const state = this._paintClockState;
    if (e._netSeq !== undefined) {
      if (e._netSeq <= (state.applied.get(e._netPeer) || 0)) return false;
      state.applied.set(e._netPeer, e._netSeq);
    }
    receivePaintOrder(this, e._netPeer, e);
    this.applying = true;
    try {
      const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;
      const opts = { seed: e[7] };
      if (order) opts.__netOrder = order;
      if (Array.isArray(e[14])) opts.instant = e[14][3] === 1;
      if (e[8]) opts.kind = e[8];
      if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
      if (Number.isInteger(e[13]) && e[13] >= 0) opts.face = e[13];
      G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);
      return true;
    } finally { this.applying = false; }
  }

  commitDeadlinePaint() {
    if (!this.isHost || !this.match || this.match.state !== 'playing') return 0;
    let committed = 0;
    for (const p of this.peers.values()) for (const e of p.events) {
      if (e[1] !== 's' || !e._deadlineEligible || e._finishPaintApplied) continue;
      if (!this._applyRemoteSplatEvent(e)) continue;
      e._finishPaintApplied = true;
      committed++;
    }
    return committed;
  }

  _playEvents() {`, 'authoritative pre-deadline paint commit');
    patch(`      case 's': {
        this.applying = true;
        const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;
        const opts = { seed: e[7] };
        if (e[8]) opts.kind = e[8];
        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
        if (Number.isInteger(e[13]) && e[13] >= 0) opts.face = e[13];
        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);
        this.applying = false;
        break;
      }`, `      case 's': {
        if (!e._finishPaintApplied) this._applyRemoteSplatEvent(e);
        break;
      }`, 'deadline paint is never double-applied');
    patch('  _play(from, e) {\n    switch (e[1]) {', `  _play(from, e) {
    if (e[1] === 's') e._netPeer = from;
    if (e[1] === 's') {
      const hasTick = e._netTick !== undefined, hasSeq = e._netSeq !== undefined;
      if (!this.s._members?.has(from) || hasTick !== hasSeq
        || hasTick && (!Number.isSafeInteger(e._netTick) || e._netTick < 0 || !Number.isSafeInteger(e._netSeq) || e._netSeq < 1)
        || readPaintOrder(this, from, e) === false) return;
    }
    if (e[1] === 'p' && !validFidelityRollerUnitPacket(e)) return;
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
    // Boss hazard/crablet timeline records are host-authoritative at admission.
    if (e[1] === 'bm' || e[1] === 'bc') {
      if (from !== this.s.hostId) return;
      if (e[1] === 'bm') {
        const move = e[2];
        if (!move || typeof move !== 'object' || !Number.isFinite(move.t0)) return;
      } else if (!Number.isSafeInteger(e[2]) || !Number.isFinite(e[3]) || !Number.isFinite(e[4]) || !Number.isFinite(e[5])) return;
    }
    switch (e[1]) {`, 'event ownership and host-only Boss timeline admission');
    {
      const bombWithKitMeta = "case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11], e[12]); break; }";
      const bombWithKit = "case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11]); break; }";
      const bombWithMeta = "case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10]); break; }";
      const bombPlain = "case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]); break; }";
      const before = code.includes(bombWithKitMeta) ? bombWithKitMeta : code.includes(bombWithKit) ? bombWithKit : code.includes(bombWithMeta) ? bombWithMeta : bombPlain;
      const bombReplayArgs = before === bombWithKitMeta ? ', e[10], e[11], e[12]' : before === bombWithKit ? ', e[10], e[11]' : before === bombWithMeta ? ', e[10]' : '';
      patch(before, `case 'b': {
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
        const b = a && G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]${bombReplayArgs});
        if (b) {
          b._netBorn = e[0]; b._netBornTick = e._netTick; b._netPeer = this.peers.get(from); b._netSteps = 0;
          b._netBornLocal = Number.isFinite(b._netPeer?.off) ? e[0] + b._netPeer.off : NaN;
        }
        break;
      }`, 'bomb timeline birth with optional metadata and kit identity');
    }
    const kitEventCase = "case 'ev': this._playEvent(e[2], e[3], from); break;";
    if (code.includes(kitEventCase)) patch(kitEventCase, `case 'ev': {
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
        try { this._playEvent(e[2],e[3],from); } finally { if (actor) actor._netFlickFirst = undefined; }
        for (let i = before; i < (G.projectiles?.beams.length || 0); i++) { const b = G.projectiles.beams[i]; b._netPeer = this.peers.get(from); b._netBorn = e[0]; b._netBornTick = e._netTick; b._netOwner = actor; b._netSteps = 0; }
        break;
      }`, 'beam birth clock with kit sender');
    else patch("case 'ev': this._playEvent(e[2], e[3]); break;", `case 'ev': {
        const before = G.projectiles?.beams.length || 0;
        const actor = this.byNid.get(e[3]?.actor?.n);
        if (actor && e[2] === 'weapon:fire') actor._netFlickFirst = e[3].projectileFirst;
        try { this._playEvent(e[2],e[3]); } finally { if (actor) actor._netFlickFirst = undefined; }
        for (let i = before; i < (G.projectiles?.beams.length || 0); i++) { const b = G.projectiles.beams[i]; b._netPeer = this.peers.get(from); b._netBorn = e[0]; b._netBornTick = e._netTick; b._netOwner = actor; b._netSteps = 0; }
        break;
      }`, 'beam birth clock');
    patch('    victim.specialActive = null; victim.superJumpState = null;', '    if (victim.net) victim.net._stormBirthAuth = null;\n    victim.specialActive = null; victim.superJumpState = null;', 'death invalidates storm admission');
    patch('  _remoteRespawn(a) {', '  _remoteRespawn(a) {\n    clearRemoteSquidroll(a);\n    clearRemoteRollerPresentation(a);\n    if (a.net) a.net._stormBirthAuth = null;', 'respawn invalidates storm admission');
    patch("case 'p': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostProjectile(a, e); break; }", `case 'p': {
        for (let index = 5; index <= 18; index++) if (!Number.isFinite(e[index])) return;
        if (e[11] < 0 || e[12] <= 0) return;
        const peer = this.peers.get(from);
        const inkMetaOffset = e[27] === null || typeof e[27] === 'object' ? 1 : 0;
        const kitOffset = e.length === 35 || e.length === 36 || e.length === 37 ? 2 : 0;
        const birthId = e[29 + inkMetaOffset + kitOffset];
        if (Number.isFinite(birthId) && peer) { if (birthId <= (peer._lastProjectileId || 0)) break; peer._lastProjectileId = birthId; }
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
const ADOPTION_STATE_TAG = 'inkwave-adoption-v1';
const ADOPTION_AGE_MAX = 60, ADOPTION_COOLDOWN_MAX = 10, ADOPTION_WORLD_MAX = 100000;
function clampAdoptionAge(value) { return Number.isFinite(value) ? Math.min(ADOPTION_AGE_MAX, Math.max(0, value)) : 0; }
function vectorRow(value) {
  return value?.isVector3 && [value.x, value.y, value.z].every(Number.isFinite)
    ? [value.x, value.y, value.z] : null;
}
function packSuperJumpState(state) {
  if (!state) return null;
  const phase = state.phase === 'flight' ? 1 : state.phase === 'charge' ? 0 : -1;
  const from = vectorRow(state.from), to = vectorRow(state.to);
  if (phase < 0 || !from || !to) return null;
  let targetKind = 0, targetId = -1, target = [0, 0, 0];
  if (phase === 0 && state.target?.pos?.isVector3) {
    const p = vectorRow(state.target.pos);
    if (!p || !Number.isSafeInteger(state.target.nid) || state.target.nid < 0) return null;
    targetKind = 1; targetId = state.target.nid; target = p;
  } else if (phase === 0 && state.target?.isVector3) {
    const p = vectorRow(state.target); if (!p) return null;
    targetKind = 2; target = p;
  } else if (phase === 0) return null;
  const elapsed = Number.isFinite(state.t) ? state.t : 0;
  const duration = Number.isFinite(state.dur) ? state.dur : 0;
  const marker = Number.isFinite(state.marker) ? state.marker : 0;
  if (elapsed < 0 || elapsed > 60 || duration < 0 || duration > 60 || marker < 0 || marker > 60
    || (phase === 1 && (duration <= 0 || elapsed > duration + 1e-6))) return null;
  return [phase, elapsed, duration, ...from, ...to, marker, state.startForm === 'kid' ? 1 : 0,
    targetKind, targetId, ...target];
}
function readSuperJumpState(row, flags) {
  const hasJump = !!(flags & (F.sjCharge | F.sjFlight));
  if (row === null) return hasJump ? undefined : null;
  if (!Array.isArray(row) || row.length !== 16) return undefined;
  const [phase, elapsed, duration] = row;
  const marker = row[9], startForm = row[10], targetKind = row[11], targetId = row[12];
  const values = [...row.slice(3, 9), marker, ...row.slice(13, 16)];
  if (!Number.isSafeInteger(phase) || (phase !== 0 && phase !== 1)
    || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 60
    || !Number.isFinite(duration) || duration < 0 || duration > 60
    || !Number.isFinite(marker) || marker < 0 || marker > 60
    || !Number.isSafeInteger(startForm) || (startForm !== 0 && startForm !== 1)
    || !Number.isSafeInteger(targetKind) || targetKind < 0 || targetKind > 2
    || !Number.isSafeInteger(targetId) || targetId < -1
    || !values.every(value => Number.isFinite(value) && Math.abs(value) <= ADOPTION_WORLD_MAX)) return undefined;
  if (phase === 1 && (duration <= 0 || elapsed > duration + 1e-6 || targetKind !== 0 || targetId !== -1)) return undefined;
  if (phase === 0 && (duration !== 0 || targetKind === 0 && targetId !== -1
    || targetKind === 1 && targetId < 0 || targetKind === 2 && targetId !== -1)) return undefined;
  if ((phase === 1) !== !!(flags & F.sjFlight) || (phase === 0) !== !!(flags & F.sjCharge)) return undefined;
  return { phase: phase ? 'flight' : 'charge', elapsed, duration,
    from: row.slice(3, 6), to: row.slice(6, 9), marker, startForm: startForm ? 'kid' : 'squid',
    targetKind, targetId, target: row.slice(13, 16) };
}
function validLethalState(row, life, flags, hp) {
  if (row === null) return (flags & F.alive) && hp <= 0 ? undefined : null;
  if (!Array.isArray(row) || row.length !== 5) return undefined;
  const [hitLife, sequence, attackerNid, cause, punisher] = row;
  if (!(flags & F.alive) || hp > 0 || hitLife !== life || !Number.isSafeInteger(hitLife) || hitLife < 0
    || !Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(attackerNid) || attackerNid < -1
    || typeof punisher !== 'boolean' || typeof cause !== 'string' || !cause.length || cause.length > 48 || /[\\u0000-\\u001f\\u007f]/.test(cause)) return undefined;
  return [hitLife, sequence, attackerNid, cause, punisher];
}
// #958: versioned protection payload inside the existing recovery-age slot.
// The outer adoption row and its extension slots remain unchanged (#1169 owns
// the separate Slam extension). Old numeric recovery ages remain readable.
const PROTECTION_TAG = 'inkwave-protection-v1';
function packProtectionAge(actor) {
  const armor = actor.s3?.spawnArmor;
  return [PROTECTION_TAG, clampAdoptionAge(actor.lastDamage),
    Number.isFinite(actor.invuln) ? Math.max(0, Math.min(10, actor.invuln)) : 0,
    !!actor.s3?.spawnArmorManaged,
    armor ? [armor.hp, armor.remaining, armor.breakRemaining] : null];
}
function readProtectionAge(row) {
  if (!Array.isArray(row) || row.length !== 5 || row[0] !== PROTECTION_TAG
    || !Number.isFinite(row[1]) || row[1] < 0 || row[1] > ADOPTION_AGE_MAX
    || !Number.isFinite(row[2]) || row[2] < 0 || row[2] > 10 || typeof row[3] !== 'boolean') return null;
  const armor = row[4];
  if (armor !== null && (!row[3] || !Array.isArray(armor) || armor.length !== 3
    || !Number.isFinite(armor[0]) || armor[0] < 0 || armor[0] > 30
    || !Number.isFinite(armor[1]) || armor[1] < 0 || armor[1] > 235 / 60
    || armor[2] !== null && (!Number.isFinite(armor[2]) || armor[2] < 0 || armor[2] > 20 / 60))) return null;
  return { invuln: row[2], managed: row[3], armor: armor?.slice() || null };
}
function restoreProtection(actor, state) {
  const p = state.protection;
  if (!p || !actor.alive) return;
  actor.invuln = p.invuln;
  actor.s3 ||= {};
  actor.s3.spawnArmorManaged = p.managed;
  actor.s3.spawnArmorRemote = false;
  actor.s3.spawnArmor = p.armor && p.armor[1] > 0
    ? { hp: p.armor[0], remaining: p.armor[1], breakRemaining: p.armor[2] } : null;
}
function packAdoptionState(actor) {
  const life = Number.isSafeInteger(actor.netLife) && actor.netLife >= 0 ? actor.netLife : 0;
  const previous = Number.isSafeInteger(actor._adoptionSequence) && actor._adoptionSequence >= 0 ? actor._adoptionSequence : 0;
  const sequence = previous >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : previous + 1;
  actor._adoptionSequence = sequence;
  const tick = Number.isFinite(G.time) ? Math.max(0, Math.round(G.time * 60)) : 0;
  const lethal = exportPendingLethal(actor);
  const spin = exportSplatlingReservation(actor.weaponRunner);
  const cooldown = Number.isFinite(actor.weaponRunner?.cooldown)
    ? Math.min(ADOPTION_COOLDOWN_MAX, Math.max(0, actor.weaponRunner.cooldown)) : 0;
  return [ADOPTION_STATE_TAG, life, sequence, tick, packProtectionAge(actor),
    packSuperJumpState(actor.superJumpState), lethal?.[0] === life ? lethal : null, spin, cooldown, packSlamState(actor)];
}
function readAdoptionState(row, life, flags, hp, weaponKind, previousSequence, weaponSpecial) {
  if (!Array.isArray(row) || ![8,9,10].includes(row.length) || row[0] !== ADOPTION_STATE_TAG) return null;
  const [tag, rowLife, sequence, tick, ageRow, jumpRow, lethalRow, spinRow] = row;
  const protection = Array.isArray(ageRow) ? readProtectionAge(ageRow) : null;
  if (Array.isArray(ageRow) && !protection) return null;
  const recoveryAge = Array.isArray(ageRow) ? ageRow[1] : ageRow;
  const cooldown = row.length >= 9 ? row[8] : 0;
  if (!Number.isSafeInteger(rowLife) || rowLife < 0 || rowLife !== life
    || !Number.isSafeInteger(sequence) || sequence < 1 || sequence <= (previousSequence || 0)
    || !Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(recoveryAge)
    || recoveryAge < 0 || recoveryAge > ADOPTION_AGE_MAX
    || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > ADOPTION_COOLDOWN_MAX) return null;
  const jump = readSuperJumpState(jumpRow, flags);
  if (jump === undefined) return null;
  const lethal = validLethalState(lethalRow, rowLife, flags, hp);
  if (lethal === undefined) return null;
  const streaming = !!(flags & F.streaming);
  if (spinRow === null ? streaming : (!streaming || weaponKind !== 'splatling' || !isValidSplatlingReservation(spinRow, PLAYER.inkMax))) return null;
  const slam = row.length === 10 ? readSlamState(row[9], !!(flags & F.alive) && !!(flags & F.special) && weaponSpecial === 'slam') : null;
  if (slam === undefined) return null;
  return { life: rowLife, sequence, tick, recoveryAge, protection, jump, lethal, spin: spinRow === null ? null : spinRow.slice(), cooldown, slam };
}
// Transfer the latest accepted native action, not an interpolated presentation
// phase. Its exact pose/velocity and gauge reservation continue on one host.
function packSlamState(actor) {
  const s = actor.specialActive;
  if (!actor.alive || s?.id !== 'slam' || s.net) return null;
  return [['rise','hang','fall'].indexOf(s.phase), s.t, s.startY, !!s.armor,
    s.gaugeStart, s.gaugeCost, s.gaugeElapsed, actor.special,
    actor.pos.x, actor.pos.y, actor.pos.z, actor.vel.x, actor.vel.y, actor.vel.z];
}
function readSlamState(row, active) {
  if (row === null) return active ? undefined : null;
  if (!active || !Array.isArray(row) || row.length !== 14 || !Number.isInteger(row[0]) || row[0] < 0 || row[0] > 2
    || typeof row[3] !== 'boolean' || !row.every((v,i) => i === 3 || Number.isFinite(v) && Math.abs(v) <= ADOPTION_WORLD_MAX)
    || row[1] < 0 || row[1] > 60 || row[4] < 0 || row[5] <= 0 || row[6] < 0 || row[6] > 60
    || row[7] < 0 || row[7] > row[4] || row[4] > row[5]) return undefined;
  return row.slice();
}
function restoreSlamState(actor, row) {
  if (!row || !actor.alive) return;
  const [phase,t,startY,armor,gaugeStart,gaugeCost,gaugeElapsed,special] = row;
  actor.specialActive = {id:'slam',phase:['rise','hang','fall'][phase],t,startY,armor,gaugeStart,gaugeCost,gaugeElapsed,gaugeMismatch:null};
  actor.special = special;
  actor.pos.set(row[8],row[9],row[10]); actor.vel.set(row[11],row[12],row[13]);
  actor.grounded = false; actor.climbing = false; actor.form = 'kid';
  actor.character.root.position.copy(actor.pos);
}
function copyAdoptionState(state) {
  if (!state) return null;
  return { ...state, jump: state.jump ? { ...state.jump, from: state.jump.from.slice(), to: state.jump.to.slice(), target: state.jump.target.slice() } : null,
    lethal: state.lethal ? state.lethal.slice() : null, spin: state.spin ? state.spin.slice() : null };
}
function sampleAdoptionState(buf, t, mode, ownerTick) {
  if (!buf?.length) return null;
  let left = buf[buf.length - 1], right = null;
  for (let index = 1; index < buf.length; index++) if (t <= buf[index].t) { left = buf[index - 1]; right = buf[index]; break; }
  const a = left?.adoption;
  if (!a) return null;
  if (!right) {
    const out = copyAdoptionState(a);
    const dt = Number.isFinite(ownerTick) && ownerTick > a.tick ? (ownerTick - a.tick) / 60 : 0;
    out.tick = a.tick + dt * 60; out.recoveryAge = clampAdoptionAge(a.recoveryAge + dt);
    out.cooldown = Math.max(0, (a.cooldown || 0) - dt);
    if (out.jump?.phase === 'flight') out.jump.elapsed = Math.min(out.jump.duration, out.jump.elapsed + dt);
    return out;
  }
  const b = right.adoption;
  if (!b || b.life !== a.life) return copyAdoptionState(a);
  const span = Math.max(1e-9, right.t - left.t), u = Math.max(0, Math.min(1, (t - left.t) / span));
  if (u >= 1) return copyAdoptionState(b);
  const out = copyAdoptionState(a);
  out.sequence = a.sequence;
  out.tick = a.tick + (b.tick - a.tick) * u;
  out.recoveryAge = clampAdoptionAge(a.recoveryAge + (b.recoveryAge - a.recoveryAge) * u);
  out.cooldown = Math.max(0, (a.cooldown || 0) + ((b.cooldown || 0) - (a.cooldown || 0)) * u);
  if (a.jump && b.jump && a.jump.phase === b.jump.phase) {
    out.jump.elapsed = a.jump.elapsed + (b.jump.elapsed - a.jump.elapsed) * u;
    out.jump.duration = a.jump.duration + (b.jump.duration - a.jump.duration) * u;
  }
  return out;
}
function superJumpActorState(match, actor, data) {
  if (!data) return null;
  let target = null;
  if (data.phase === 'charge') target = data.targetKind === 1 ? (match.byNid.get(data.targetId) || new THREE.Vector3(...data.target))
    : data.targetKind === 2 ? new THREE.Vector3(...data.target) : null;
  return { phase: data.phase, t: data.elapsed, dur: data.duration, from: new THREE.Vector3(...data.from),
    to: new THREE.Vector3(...data.to), marker: data.marker, startForm: data.startForm, target, wallSupport: null };
}
function superJumpPosition(state) {
  const k = Math.max(0, Math.min(1, state.t / state.dur));
  const ease = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const apex = 11 + state.from.distanceTo(state.to) * .08, vertical = Math.pow(k, .86);
  return new THREE.Vector3().lerpVectors(state.from, state.to, ease).setY(
    state.from.y + (state.to.y - state.from.y) * ease + Math.sin(Math.PI * vertical) * apex);
}
function applyAdoptionSample(match, actor, sample) {
  const state = sample.adoption;
  if (!state || state.life !== actor.net.lastLife) return;
  if (!state.jump) { actor.net.sjTo = null; return; }
  actor.superJumpState = superJumpActorState(match, actor, state.jump);
  if (state.jump.phase === 'flight') {
    actor.net.sjTo = actor.superJumpState.to.clone();
    actor.pos.copy(superJumpPosition(actor.superJumpState));
  } else actor.net.sjTo = null;
}
function applyAdoptionRecoveryAge(match, actor, sample) {
  const state = sample.adoption;
  if (!state || state.life !== actor.net.lastLife) return;
  const peer = match.peers.get(actor.owner), ahead = Number.isFinite(peer?.sim) && peer.sim > state.tick ? (peer.sim - state.tick) / 60 : 0;
  actor.lastDamage = clampAdoptionAge(state.recoveryAge + ahead);
}
function latestAdoptionTransfer(actor) {
  const latest = actor.net?.buf?.at(-1), state = latest?.adoption;
  if (!state || state.life !== actor.net.lastLife) return null;
  const sampled = actor.net.cur?.adoption;
  return { latest: state, current: sampled?.life === state.life ? sampled : state, hp: latest.hp };
}
function restoreAdoptionState(match, actor, transfer) {
  if (!transfer) return;
  const latest = transfer.latest, current = transfer.current;
  const life = actor.net?.lastLife ?? actor.netLife ?? 0;
  if (latest.life !== life) return;
  // A later completed/dead snapshot has slam=null and cannot revive an older
  // sampled action. onLeave transfers ownership before any future impact.
  restoreSlamState(actor, latest.slam);
  actor._adoptionSequence = Math.max(Number.isSafeInteger(actor._adoptionSequence) ? actor._adoptionSequence : 0, latest.sequence);
  actor.net._adoptionSeq = Math.max(Number.isSafeInteger(actor.net._adoptionSeq) ? actor.net._adoptionSeq : 0, latest.sequence);
  // Resume from the newest accepted owner state, not the delayed visual
  // sample (which would extend protection or undo an already broken armor).
  restoreProtection(actor, latest);
  actor.lastDamage = clampAdoptionAge(current.recoveryAge);
  actor.weaponRunner.cooldown = Math.max(actor.weaponRunner.cooldown || 0, current.cooldown || 0);
  if (current.jump) {
    let jump = current.jump;
    if (latest.jump?.phase === 'flight' && jump.phase !== 'flight') {
      jump = { ...latest.jump, from: vectorRow(actor.pos), elapsed: 0,
        duration: Math.max(1 / 60, latest.jump.duration - latest.jump.elapsed) };
    }
    actor.superJumpState = superJumpActorState(match, actor, jump);
    if (actor.superJumpState.phase === 'flight') actor.net.sjTo = actor.superJumpState.to.clone();
  }
  if (latest.lethal) {
    if (Number.isFinite(transfer.hp) && transfer.hp <= 0) actor.hp = transfer.hp;
    const attackerNid = latest.lethal[2], attacker = attackerNid < 0 ? null : match.byNid.get(attackerNid);
    if (attackerNid < 0 || attacker) restorePendingLethal(actor, latest.lethal, attacker);
  }
  if (latest.spin) refundSplatlingReservation(actor.weaponRunner, latest.spin, latest.life, latest.sequence, PLAYER.inkMax);
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
  retireDisconnectedMainProjectiles(P, owner, {ghostOnly:true});
  const owns = p => !owner || p.owner === owner;
  for (const p of P.list) if (p.ghost && owns(p)) { p._netEnded = true; p._qualityDead = true; p._netEndStep = p._netSteps; }
  for (let i = P.bombs.length-1; i >= 0; i--) if (P.bombs[i].ghost && owns(P.bombs[i])) { P._releaseBomb(P.bombs[i]); P.bombs.splice(i,1); }
  for (let i = P.clouds.length-1; i >= 0; i--) if (P.clouds[i].ghost && owns(P.clouds[i])) { P._releaseCloud(P.clouds[i],.3); P.clouds.splice(i,1); }
  for (let i = P.beams.length-1; i >= 0; i--) { const b = P.beams[i]; if (b._netPeer && (!owner || b._netOwner === owner)) { b.mesh.visible = false; P.beamPool.push(b.mesh); P.beams.splice(i,1); } }
  for (const [a,mesh] of P.sights) if (a.remote && (!owner || a === owner)) { P.scene.remove(mesh); mesh.material.dispose(); P.sights.delete(a); }
}
const SQUIDROLL_ROW_TAG = 's3roll-v1';
const outgoingSquidrolls = new WeakMap();
function packSquidrollSnapshot(a) {
  const action = a.s3?.actions?.roll;
  const previous = outgoingSquidrolls.get(a);
  const inactive = () => {
    if (!previous?.action) return null;
    previous.action = null;
    return [SQUIDROLL_ROW_TAG, 0, 0, 0, 0];
  };
  if (!action || !a.alive || a.form !== 'squid' || a.specialActive || a.superJumpState
    || !Number.isFinite(action.time) || action.time <= 0 || action.time > 0.5
    || !Number.isFinite(action.vx) || !Number.isFinite(action.vz)
    || Math.hypot(action.vx, action.vz) <= 1e-6 || Math.hypot(action.vx, action.vz) > 40) return inactive();
  let state = previous;
  if (!state || state.action !== action) {
    let id = (state?.id || 0) + 1;
    if (id > 0x7fffffff) id = 1;
    state = { action, id };
    outgoingSquidrolls.set(a, state);
  }
  return [SQUIDROLL_ROW_TAG, state.id, action.time, action.vx, action.vz];
}
function readSquidrollSnapshot(meta) {
  if (meta == null) return null; // legacy packets carry no optional presentation sidecar
  if (!Array.isArray(meta) || meta.length !== 5 || meta[0] !== SQUIDROLL_ROW_TAG
    || !Number.isSafeInteger(meta[1]) || meta[1] < 0 || meta[1] > 0x7fffffff
    || !Number.isFinite(meta[2]) || meta[2] < 0 || meta[2] > 0.5
    || !Number.isFinite(meta[3]) || !Number.isFinite(meta[4])
    || Math.hypot(meta[3], meta[4]) > 40) return false;
  if (meta[1] === 0) return meta[2] === 0 && meta[3] === 0 && meta[4] === 0 ? null : false;
  if (meta[2] <= 0 || Math.hypot(meta[3], meta[4]) <= 1e-6) return false;
  return { id: meta[1], remaining: meta[2], vx: meta[3], vz: meta[4] };
}
function clearRemoteSquidroll(actor, blockCurrent = false) {
  if (!actor) return;
  if (blockCurrent) {
    const id = actor.remoteSquidrollVisual?.id ?? actor.net?.cur?.rollId;
    if (id) actor._remoteSquidrollBlocked = { owner: actor.owner, id };
  } else actor._remoteSquidrollBlocked = null;
  actor.remoteSquidrollVisual = null;
}
function syncRemoteSquidroll(actor, sample, peer) {
  const id = sample.rollId;
  const blocked = actor._remoteSquidrollBlocked;
  if (blocked?.owner === actor.owner && blocked.id === id) { actor.remoteSquidrollVisual = null; return; }
  if (blocked) actor._remoteSquidrollBlocked = null;
  const elapsed = Number.isFinite(peer?.tr) ? Math.max(0, peer.tr - sample.t) : 0;
  const remaining = Math.max(0, sample.rollRemaining - elapsed);
  if (!remaining || remaining > 0.5) { clearRemoteSquidroll(actor); return; }
  let visual = actor.remoteSquidrollVisual;
  if (!visual || visual.id !== id || visual.owner !== actor.owner) {
    visual = actor.remoteSquidrollVisual = { remotePresentation: true, id, owner: actor.owner,
      remaining, vx: sample.rollVx, vz: sample.rollVz };
  } else {
    visual.remaining = Math.min(visual.remaining, remaining);
    visual.vx = sample.rollVx; visual.vz = sample.rollVz;
  }
}
// Sender simulation ticks only schedule playback. They are application uptimes,
// never a clock that can order paint from two different owners.
const PAINT_ORDER_TAG = 'inkwave-paint-order-v1';
const paintClockSessions = new WeakMap();
function paintClockStateFor(session, cfg) {
  const matchId = typeof cfg?.id === 'string' ? cfg.id : '';
  let matches = paintClockSessions.get(session);
  if (!matches) { matches = new Map(); paintClockSessions.set(session, matches); }
  let state = matches.get(matchId);
  if (state) matches.delete(matchId);
  else state = { matchId, clock: 0, applied: new Map() };
  matches.set(matchId, state);
  if (matches.size > 8) matches.delete(matches.keys().next().value);
  return state;
}
function nextPaintOrder(nm, instant) {
  const state = nm._paintClockState || (nm._paintClockState = paintClockStateFor(nm.s, nm.cfg));
  const clock = nextPaintOrderClock(state.clock);
  state.clock = clock;
  return [PAINT_ORDER_TAG, state.matchId, clock, instant ? 1 : 0];
}
function readPaintOrder(nm, from, e) {
  if (typeof from !== 'string' || !nm.s._members?.has(from)) return false;
  // Victim-owned splat bursts and host-owned Boss ink can paint the other team.
  // Membership, the match epoch and sender sequence own admission, not team color.
  for (let i = 2; i <= 7; i++) if (!Number.isFinite(e[i])) return false;
  for (let i = 9; i <= 12; i++) if (e[i] !== undefined && !Number.isFinite(e[i])) return false;
  if (e[5] <= 0 || (e[6] !== 0 && e[6] !== 1)) return false;
  const hasTick = e._netTick !== undefined, hasSeq = e._netSeq !== undefined;
  if (hasTick !== hasSeq || hasTick && (!Number.isSafeInteger(e._netTick) || e._netTick < 0
    || !Number.isSafeInteger(e._netSeq) || e._netSeq < 1)) return false;
  const row = e[14];
  if (Array.isArray(row)) {
    if (!hasSeq || row.length !== 4 || row[0] !== PAINT_ORDER_TAG
      || row[1] !== (typeof nm.cfg?.id === 'string' ? nm.cfg.id : '')
      || !isPaintOrderClock(row[2]) || row[2] === 0
      || (row[3] !== 0 && row[3] !== 1)) return false;
    return { clock: row[2], epoch: row[1], peer: from, seq: e._netSeq };
  }
  if (e.length > 16) return false;
  // Older rows remain paint-compatible, but cannot outrank causal records.
  // Their owner-local sequence is deterministic; their uptime is irrelevant.
  return hasSeq ? { clock: e._netSeq, peer: from, seq: e._netSeq, legacy: true } : null;
}
function receivePaintOrder(nm, from, e) {
  const order = readPaintOrder(nm, from, e);
  if (order && !order.legacy) {
    const state = nm._paintClockState || (nm._paintClockState = paintClockStateFor(nm.s, nm.cfg));
    if (paintClockComesAfter(order.clock, state.clock)) state.clock = order.clock;
  }
  return order;
}
const firstSplatSessions = new WeakMap();
// #529: retain reconnect decisions for the eight most recent match IDs.
const FIRST_SPLAT_RECENT_MATCHES = 8;
function firstSplatStateFor(session,cfg) {
  const id = typeof cfg?.id === 'string' && cfg.id ? cfg.id : null;
  if (!id) return { matchId:null, claimed:false, attackerNid:null, victimNid:null };
  let matches = firstSplatSessions.get(session);
  if (!matches) { matches = new Map(); firstSplatSessions.set(session,matches); }
  let state = matches.get(id);
  if (state) matches.delete(id);
  else state = { matchId:id, claimed:false, attackerNid:null, victimNid:null };
  matches.set(id,state);
  if (matches.size > FIRST_SPLAT_RECENT_MATCHES) matches.delete(matches.keys().next().value);
  return state;
}
`;
  }
  if (rel === 'src/fx/fxHooks.js') {
    patch("import { on } from '../core/ctx.js';", "import { on, copyEventVector, hasEventVector } from '../core/ctx.js';", 'consume vector snapshots without materialization');
    patch('    this._sp = new THREE.Vector3();', '    this._sp = new THREE.Vector3();\n    this._eventVectorPool = []; this._eventVectorDepth = 0;', 'owned nested event scratch pool');
    patch('  _weaponFire(e) {\n    const a = e.actor; if (!a || !e.muzzle) return;\n    const kind = (e.weapon && (e.weapon.kind || e.weapon)) || a.weapon?.kind;\n    const dir = e.dir || a.aimDir;\n    if (kind === \'blaster\') this.fx.muzzle?.(e.muzzle, dir, a.color, \'blaster\');\n    else if (kind === \'charger\') this.fx.muzzle?.(e.muzzle, dir, a.color, \'charger\');\n    else if (kind === \'roller\') this._flick(a);\n    this._bump(FIRE_KEY[kind] || \'fire:other\');\n  }', `  _borrowEventVectors() {
    const depth = this._eventVectorDepth++;
    let pair = this._eventVectorPool[depth];
    if (!pair) pair = this._eventVectorPool[depth] = [new THREE.Vector3(), new THREE.Vector3()];
    return pair;
  }
  _releaseEventVectors() { this._eventVectorDepth--; }
  _weaponFire(e) {
    const a = e.actor; if (!a || !hasEventVector(e, 'muzzle')) return;
    const kind = (e.weapon && (e.weapon.kind || e.weapon)) || a.weapon?.kind;
    if (kind === 'blaster' || kind === 'charger') {
      const pair = this._borrowEventVectors();
      try {
        if (!copyEventVector(e, 'muzzle', pair[0])) return;
        const dir = copyEventVector(e, 'dir', pair[1]) ? pair[1] : a.aimDir;
        this.fx.muzzle?.(pair[0], dir, a.color, kind);
      } finally { this._releaseEventVectors(); }
    } else if (kind === 'roller') this._flick(a);
    this._bump(FIRE_KEY[kind] || 'fire:other');
  }`, 'read fire snapshots through owned scratch');
    patch('  _impact(e) {\n    if (!e.pos || !this._near(e.pos, 32)) return;\n    const col = this.G.teamColors[e.team] || _c.set(0xffffff);\n    const n = e.normal || UP;\n    // shots / flick drops: weapons.js already bursts the splash (fx.burst) and the paint system ripples the ink —\n    // nothing is stacked on top here (no decal blots)\n    if (e.kind === \'charger\') this.fx.beamImpact?.(e.pos, n, col, 1);\n    if (e.kind === \'drop\' && !e.victim) {\n      const H = this.dropHits;\n      if (H.length >= 24) H.shift();\n      H.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, nx: n.x, ny: n.y, nz: n.z, t: this.time });\n    }\n    this._bump(IMPACT_KEY[e.kind] || \'impact:other\');\n  }', `  _impact(e) {
    if (!hasEventVector(e, 'pos')) return;
    const pair = this._borrowEventVectors();
    try {
      const pos = pair[0];
      if (!copyEventVector(e, 'pos', pos) || !this._near(pos, 32)) return;
      const col = this.G.teamColors[e.team] || _c.set(0xffffff);
      const n = copyEventVector(e, 'normal', pair[1]) ? pair[1] : UP;
      if (e.kind === 'charger') this.fx.beamImpact?.(pos, n, col, 1);
      if (e.kind === 'drop' && !e.victim) {
        const H = this.dropHits;
        if (H.length >= 24) H.shift();
        H.push({ x: pos.x, y: pos.y, z: pos.z, nx: n.x, ny: n.y, nz: n.z, t: this.time });
      }
      this._bump(IMPACT_KEY[e.kind] || 'impact:other');
    } finally { this._releaseEventVectors(); }
  }`, 'read impact snapshots through owned scratch');
    return code;
  }
  if (rel === 'src/fx/screenfx.js') {
    patch("import { on, G as CTX, clamp, damp, lerp } from '../core/ctx.js';", "import { on, G as CTX, clamp, damp, lerp, copyEventVector } from '../core/ctx.js';", 'consume impact snapshot numerically');
    patch('const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();', 'const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _impactPos = new THREE.Vector3();', 'retain lens impact scratch vector');
    patch("    on('weapon:impact', ({ pos, team, kind }) => {\n      if (!live() || !pos || kind === 'roll') return;", "    on('weapon:impact', (e) => {\n      const { team, kind } = e;\n      if (!live() || kind === 'roll' || !copyEventVector(e, 'pos', _impactPos)) return;\n      const pos = _impactPos;", 'project impact snapshots without event vectors');
    return code;
  }
  if (rel === 'src/game/weapons.js') {
    // Source-guided heads return before the generic fidelity branch below.
    // Preserve the same owner terminal publication and receiver-only impact FX.
    patch('    if (p.inkProfile) return this.inkFlight.stepHead(p, dt);', `    if (p.inkProfile) {
      const dead = this.inkFlight.stepHead(p, dt);
      if (p.ghost && p._netEndReason === 1 && p._netSteps >= p._netEndStep) {
        _v.set(p._netHitX,p._netHitY,p._netHitZ);
        G.fx?.burst(_v,_v2.copy(p.vel).normalize().negate(),p.owner.color,{count:6,speed:3,size:.07});
        return true;
      }
      if (dead && !p.ghost && p._netId !== undefined && G.netm) G.netm._rec(p._netHitActor ? ['pe',p.owner.nid,p._netId,1,p._netHitX,p._netHitY,p._netHitZ] : ['pe',p.owner.nid,p._netId,0]);
      return dead;
    }`, 'source-guided head terminal publication and replay');
    code = replaceAllExpected(code,
      "emit('weapon:impact', { pos: _v.set(a.pos.x + fx * 0.75, a.pos.y + 0.02, a.pos.z + fz * 0.75).clone(), normal: a.groundN ? a.groundN.clone() : UP.clone(), team: a.team, kind: 'roll', radius: w.rollWidth / 2 });",
      "emit('weapon:impact', { pos: _v.set(a.pos.x + fx * 0.75, a.pos.y + 0.02, a.pos.z + fz * 0.75), normal: a.groundN || UP, team: a.team, kind: 'roll', radius: w.rollWidth / 2 });",
      1, 'roller impact snapshots shared scratch');
    code = replaceAllExpected(code,
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });",
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m, dir });",
      3, 'pooled shooter, splatling and blaster fire payloads');
    patch("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), hand });",
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m, dir, hand });", 'dualies fire payload');
    patch("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: _dir.clone() });",
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m, dir: _dir });", 'blaster fire payload');
    patch("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: new THREE.Vector3(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6), dir: new THREE.Vector3(fx, Math.sin(up), fz).normalize() });",
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: _v2.set(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6), dir: _v3.set(fx, Math.sin(up), fz).normalize() });",
      'roller flick fire uses existing scratch vectors');
    patch('      const end = new THREE.Vector3().copy(m).addScaledVector(dir, len);',
      '      const end = _v3.copy(m).addScaledVector(dir, len);', 'charger endpoint reuses existing scratch');
    patch("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), charge, len });",
      "emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m, dir, charge, len });", 'charger fire payload');
    patch("emit('weapon:impact', { pos: end, normal: hit.hit && !victim && !bossHit ? hit.normal.clone() : dir.clone().negate(), team: a.team, kind: 'charger', radius: w.impactRadius * (0.6 + 0.4 * charge) });",
      "emit('weapon:impact', { pos: end, normal: hit.hit && !victim && !bossHit ? hit.normal : _v2.copy(dir).negate(), team: a.team, kind: 'charger', radius: w.impactRadius * (0.6 + 0.4 * charge) });",
      'charger impact payload');
    patch("if (p.type !== 'blast') emit('weapon:impact', { pos: _v.clone(), normal: _v2.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: e });",
      "if (p.type !== 'blast') emit('weapon:impact', { pos: _v, normal: _v2, team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: e });",
      'victim impact payload');
    patch("if (p.type !== 'blast') emit('weapon:impact', { pos: at.clone(), normal: _v2.copy(p.vel).normalize().negate().clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: null });",
      "if (p.type !== 'blast') emit('weapon:impact', { pos: at, normal: _v2.copy(p.vel).normalize().negate(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: null });",
      'boss impact payload');
    patch("if (p.type !== 'blast') emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: rad });",
      "if (p.type !== 'blast') emit('weapon:impact', { pos: hit.point, normal: hit.normal, team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: rad });",
      'world impact payload');
    patch("emit('weapon:impact', { pos: c.clone(), normal: new THREE.Vector3(0, 1, 0), team: p.team, kind: 'blast', radius: w.burstRadius });",
      "emit('weapon:impact', { pos: c, normal: UP, team: p.team, kind: 'blast', radius: w.burstRadius });",
      'blast impact payload');
    patch('    if (nm && !p.ghost) nm.recProj(p);',
      '    if (nm && !p.ghost && !p._s3SloshBirthPending) nm.recProj(p);',
      'defer pending Slosher projectile packet until birth');
    patch('  applyHit(attacker, victim, dmg, weaponId) {',
      '  applyHit(attacker, victim, dmg, weaponId, slosherVolleyId) {', 'Slosher volley identity projectile entry');
    patch('nm.sendHit(attacker, victim, dmg, weaponId)',
      'nm.sendHit(attacker, victim, dmg, weaponId, slosherVolleyId)', 'Slosher volley identity projectile forwarding');
    patch("    const route = nm ? nm.shouldApplyHit(attacker, victim) : 'local';",
      "    const route = nm ? nm.shouldApplyHit(attacker, victim, weaponId) : 'local';", 'pass weapon to damage authority');
// Kit explosion paint may have replaced the legacy body splat already.
    // This stable, single-location anchor is the bomb explosion's event clock
    // and must precede both ordinary and kit-specific paint paths.
    patch('    const c = b.pos;',
      '    const c = b.pos;\n    const detonationLocalTime = b.ghost ? b._netBornLocal + b.age : null;',
      'bomb detonation playback time');
    {
      // Gameplay fidelity may classify the far Splat Bomb band as
      // 'splat-bomb-far'; the recipient-life guard belongs to the bomb actor,
      // not to one exact cause-string spelling.
      const bombHitMatches = [...code.matchAll(/^([ \t]*)this\.applyHit\(b\.owner, e, [^\n]+\);$/gm)];
      if (bombHitMatches.length !== 1) throw Error('Network replication anchor mismatch: ' + rel + ': reject bomb from prior recipient life');
      const bombHit = bombHitMatches[0][0], indent = bombHitMatches[0][1];
      const guarded = `${indent}if (b.ghost && (!Number.isFinite(detonationLocalTime)
${indent}  || !Number.isFinite(e._netLifeStartedAt) || e._netLifeStartedAt > detonationLocalTime)) continue;
${bombHit}`;
      code = code.slice(0, bombHitMatches[0].index) + guarded + code.slice(bombHitMatches[0].index + bombHit.length);
    }
    patch('    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;', '    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;\n    let projectileFirst;', 'attack-owned first projectile');
    // Preserve the preceding presentation/gameplay layer's release footprint.
    // Capture only the volley identity; remote ghosts never replay owner paint.
    const releaseFootprint = code.includes('    paintRollerReleaseFootprint(this, a, w, { G, PLAYER, Hit, WALKABLE });')
      ? '    paintRollerReleaseFootprint(this, a, w, { G, PLAYER, Hit, WALKABLE });\n' : '';
    patch(`      this._push(p);\n    }\n${releaseFootprint}    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });`, `      this._push(p);\n      if (i === 0) projectileFirst = p._netId;\n    }\n${releaseFootprint}    appendRollerNearUnit(this, a, w);\n    if (a.isLocal) emit('recoil', { amount: 0.007 });`, 'capture exact volley during generation');
    patch('weapon: w.id, muzzle: _v2.set(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6)', 'weapon: w.id, projectileFirst, muzzle: _v2.set(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6)', 'publish exact volley event');

    patch('      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);', `      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);
      // The active attack parameters own physics. Finalize before _push records
      // them; the gameplay overlay formerly assigned these only after publication.
      p.s3Vertical = !!a.weaponRunner?.s3FlickVertical;
      p.grav = w.flickGravity ?? p.grav;
      p.drag = w.flickDrag ?? p.drag;`, 'final flick physics before publication');

    patch('    p.delay = 0; p.head = false;', '    p._netId = undefined; p._netEnded = false; p._netPeer = null; p._netBorn = undefined; p._netBornTick = undefined; p._netSteps = 0; p._netMaxSteps = 0; p._netEndStep = undefined; p._netEndReason = 0; p._netHitActor = false;\n    p.delay = 0; p.head = false;', 'recycled identity reset');
    patch('    this.list.push(p);\n  }\n\n  ghostBomb', `    const inkMetaOffset = e[27] === null || typeof e[27] === 'object' ? 1 : 0;
    const kitOffset = e.length === 35 || e.length === 36 || e.length === 37 ? 2 : 0;
    const birthOffset = inkMetaOffset + kitOffset;
    p.s3Vertical = e[27 + birthOffset] === 1;
    if (Number.isFinite(e[28 + birthOffset])) p.seed = e[28 + birthOffset]; // retain the native random draw above
    p._netId = e[29 + birthOffset];
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
        if (dead) { p._qualityDead = true; list[i] = list[list.length-1]; list.pop(); this._recycle(p); }
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
          if (dead) { p._qualityDead = true; list[i] = list[list.length-1]; list.pop(); this._recycle(p); }
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
    if (clouds.includes('e.damage(sp.dps * stepDt,')) {
      clouds = once(clouds,'e.damage(sp.dps * stepDt,', 'e.damage(sp.dps * (peer ? dt : stepDt),', 'recipient damage elapsed time');
    } else {
      clouds = once(clouds,'collectStormHit(rainHits, e, c, sp.dps * stepDt);',
        'collectStormHit(rainHits, e, c, sp.dps * (peer ? dt : stepDt));',
        'recipient Storm arbitration elapsed time');
    }
    clouds = once(clouds,'        G.fx?.rain(c.group.position, sp.radius * s, G.teamColors[c.team], stepDt, { cloud: false });','        if (!peer || tick === steps-1) G.fx?.rain(c.group.position, sp.radius * s, G.teamColors[c.team], peer ? dt : stepDt, { cloud: false });','bounded catch-up rain emission');
    code = code.slice(0,cloudStart)+clouds+code.slice(cloudEnd);
    patch('      b.t += dt;', `      if (b._netPeer) {
        const clock = Math.min(b._netPeer.tr,b._netPeer.lastTs ?? b._netPeer.tr);
        const target = Math.min(Math.floor((Number.isFinite(b._netPeer.sim) && Number.isFinite(b._netBornTick) ? b._netPeer.sim-b._netBornTick : (clock-b._netBorn)/SIM_DT)+.0306)+1,Math.ceil(b.life/SIM_DT)+1);
        b._netSteps ??= 0;
        while (b._netSteps < target && b.t < b.life) { b.t += SIM_DT; b._netSteps++; }
      } else b.t += dt;`, 'beam owner age');

  }
  if (rel === 'src/game/actor.js') {
    patch('    this.netLife = (this.netLife ?? 0) + 1;',
      '    this.netLife = (this.netLife ?? 0) + 1;\n    this._netLifeStartedAt = performance.now() / 1000;',
      'record recipient life start for late bomb replay');
  }
  if (rel === 'patches/splatoon3/runtime/weapons-fidelity.mjs') {
    patch('api=context;completion=profile.weaponsFidelityCompletion;', 'api=context;completion=profile.weaponsFidelityCompletion;\n  const eventImpactNormal = new context.THREE.Vector3();', 'reuse fidelity impact normal scratch');
    patch("api.emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: p.type === 'drop' ? 'drop' : 'shot', radius: state.shockRadius });",
      "api.emit('weapon:impact', { pos: hit.point, normal: hit.normal, team: p.team, kind: p.type === 'drop' ? 'drop' : 'shot', radius: state.shockRadius });",
      'wall drop impact payload');
    patch("context.emit('weapon:impact',{pos:hit.point.clone(),normal:p.vel.clone().normalize().negate(),team:p.team,kind:p.type==='shot'?'shot':'drop',radius:p.radius*.5,victim:null});",
      "context.emit('weapon:impact',{pos:hit.point,normal:eventImpactNormal.copy(p.vel).normalize().negate(),team:p.team,kind:p.type==='shot'?'shot':'drop',radius:p.radius*.5,victim:null});",
      'boss impact payload');
    return code;
  }
  if (rel === 'patches/splatoon3/runtime/weapons-charger-flight.mjs') {
    patch("emit('weapon:fire',{actor,weapon:w.id,muzzle:origin.clone(),dir:direction.clone(),charge,len:distance});",
      "emit('weapon:fire',{actor,weapon:w.id,muzzle:origin,dir:direction,charge,len:distance});",
      'charger flight fire payload');
    patch("emit('weapon:impact',{pos:job.pos.clone(),normal,team:job.team,kind:'charger',radius:job.paint.impact,victim:target==='boss'||target==='defense'||target?.team===job.team?null:target});",
      "emit('weapon:impact',{pos:job.pos,normal,team:job.team,kind:'charger',radius:job.paint.impact,victim:target==='boss'||target==='defense'||target?.team===job.team?null:target});",
      'charger flight impact payload');
    return code;
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
    code = adaptIssue1088SurgePresentation(code);
    patch('    const S = n.cur;', '    const S = n.cur;\n    if (!a.alive || !(S.f & F.alive)) clearRemoteRollerPresentation(a);', 'clear Roller presentation before native death return');
  }
  return code;
}

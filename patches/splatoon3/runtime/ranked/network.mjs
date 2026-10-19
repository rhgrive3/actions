import { validRankedSnapshot } from './engine.mjs';
import { noteRankedBarrierShots, queueRankedBarrierHit, resetRankedBarrierAdmission } from './barrier-admission.mjs';
import { withObjectDamageCause } from '../sub-resistance.mjs';
import { specialGaugeLocked } from '../tacticooler-gauge.mjs';
import { recordTowerHostSnapshot, clearTowerPaintSupport } from '../../../network-replication/tower-paint-support.mjs';

const damageCauses = new Set(['Gachihoko_Bullet', 'Gachihoko_BombCore', 'GachihokoTimeUpBurst']);

export const actorId = a => String(a.nid ?? `${a.team}:${a.slot}`);
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 2000);
function current(nm) { return !nm._disposed && !nm.match?._disposed && nm.match?.ranked && nm._rankedAPI.G.netm === nm; }
function envelope(nm, data) { return { ...data, match: nm.cfg.id, host: nm.s.hostId }; }

export function installRankedNetwork(api) {
  const { NetMatch, G } = api, P = NetMatch.prototype;
  Object.defineProperty(P, '_rankedAPI', { get: () => api, configurable: true });
  const send = P._sendNow;
  P._sendNow = function (d) {
    if (current(this) && this.isHost && ['st', 'res', 'end'].includes(d.k)) {
      d = { ...d, rk: envelope(this, { state: this.match.ranked.snapshot(), gains: this.match.rankedGains || [0, 0] }) };
      if (d.k === 'res') Object.assign(d, { rankedResult: this.match.ranked.result() });
    }
    if (current(this) && this.isHost && d.rk?.match === this.cfg.id && d.rk.host === this.s.hostId)
      recordTowerHostSnapshot(this, d.rk.state);
    return send.call(this, d);
  };
  // Extend the existing 20Hz actor packet, with 5Hz objective snapshots. The
  // session already provides reliable ordered transport; revision checks also
  // reject duplicate/reordered captures and late packets from a prior match.
  const tick = P._sendTick;
  P._sendTick = function () {
    if (!current(this)) return tick.call(this);
    const tr = this.s.tr, broadcast = tr?.broadcast;
    if (!broadcast) return tick.call(this);
    tr.broadcast = d => {
      if (d.k === 't') {
        this.rankedTick = (this.rankedTick || 0) + 1;
        if (this.isHost && this.rankedTick % 4 === 0) {
          d.rk = envelope(this, { state: this.match.ranked.snapshot(), gains: this.match.rankedGains || [0, 0] });
          recordTowerHostSnapshot(this, d.rk.state);
        }
        const a = this.match.local;
        if (a && !this.isHost) {
          const cmd = a._rankedInput || {};
          d.rki = { match: this.cfg.id, id: actorId(a), seq: this.rankedInputSeq = (this.rankedInputSeq || 0) + 1,
            fire: !!cmd.fire, throw: !!a._rankedThrowPending, aim: cmd.aim || [0, 0, 1], special: a.specialActive?.id ?? null,
            specialDeployed: a.specialActive?.id === 'storm' && a.specialActive?.t > 0, clamDrop: a._rankedClamDrop || 0 };
          a._rankedThrowPending = false;
        }
      }
      return broadcast.call(tr, d);
    };
    try { return tick.call(this); } finally { tr.broadcast = broadcast; }
  };
  const incoming = P.onMessage;
  P.onMessage = function (from, d) {
    if (!current(this) || !d || typeof d !== 'object') return incoming.call(this, from, d);
    const m = this.match;
    if (d.rk && from === this.s.hostId && !this.isHost) {
      const accepted = acceptState(this, d.rk);
      if (!accepted && ['st', 'res', 'end'].includes(d.k)) return;
    }
    if (d.rki && this.isHost && m.state === 'playing' && m.ranked.winner == null) {
      const cmd = d.rki, a = m.actors.find(a => actorId(a) === cmd.id);
      if (cmd.match === this.cfg.id && a?.owner === from && a.alive && Number.isSafeInteger(cmd.seq) && cmd.seq > 0 && finiteVector(cmd.aim)) {
        this.rankedInputs ||= new Map();
        const old = this.rankedInputs.get(cmd.id);
        const specialOk = cmd.special == null || cmd.special === a.weapon?.special;
        const dropOk = cmd.clamDrop === undefined || Number.isSafeInteger(cmd.clamDrop) && cmd.clamDrop >= 0 && cmd.clamDrop <= 100000;
        if ((!old || cmd.seq > old.seq) && specialOk && dropOk) this.rankedInputs.set(cmd.id, { seq: cmd.seq, fire: !!cmd.fire, throw: !!cmd.throw || !!old?.throw, aim: cmd.aim, at: G.time,
          special: cmd.special ?? null, specialDeployed: cmd.special === 'storm' && cmd.specialDeployed === true, clamDrop: Math.max(old?.clamDrop || 0, cmd.clamDrop || 0) });
      }
    }
    if (d.k === 'rkhit') {
      if (!this.isHost || d.match !== this.cfg.id || m.state !== 'playing' || m.ranked.winner != null) return;
      const a = m.actors.find(a => actorId(a) === d.id);
      if (!a?.alive || a.owner !== from || !Number.isSafeInteger(d.seq) || d.seq <= 0 || !Number.isFinite(d.damage) || !(d.damage > 0) || d.damage > 2000 || !finiteVector(d.pos)) return;
      if (d.seq <= (this.rankedHitSeq?.get(from) || 0)) return;
      const s = m.ranked.rule.state;
      if (m.mode !== 'rainmaker' || !s.barrier?.active || !finiteVector(s.pos) || Math.hypot(...s.pos.map((n, i) => n - d.pos[i])) > 6) return;
      // A client's impact is a proposal only. Admission waits for matching
      // owner-stamped, geometrically plausible shot evidence in the tick stream.
      queueRankedBarrierHit(this, from, d, G.time);
      return;
    }
    if (d.k === 'rkevent') {
      if (!this.isHost && from === this.s.hostId && d.match === this.cfg.id && Number.isSafeInteger(d.seq) && d.seq > (this.rankedEventSeq || 0)) {
        if (!Array.isArray(d.events) || d.events.length > 128 || !d.events.every(validEvent)) return;
        this.rankedEventSeq = d.seq;
        m.playRankedEvents?.(d.events, true);
      }
      return;
    }
    if (d.k === 'rkdamage') {
      if (m.state !== 'playing' || m.ranked.winner != null) return;
      if (!this.isHost && from === this.s.hostId && d.match === this.cfg.id && Number.isSafeInteger(d.seq) && d.seq > (this.rankedDamageSeq || 0)
          && (d.cause === undefined || damageCauses.has(d.cause))
          && (d.deathReason === undefined || (d.deathReason === 'rainmaker-timeout' && d.attacker === null && d.damage === 2000))) {
        const victim = m.actors.find(a => actorId(a) === d.victim), attacker = m.actors.find(a => actorId(a) === d.attacker) || null;
        if (victim?.owner === this.myId && victim.alive && (victim.netLife ?? 0) === d.life && Number.isFinite(d.damage) && d.damage > 0 && d.damage <= 2000) {
          this.rankedDamageSeq = d.seq;
          const killed = withObjectDamageCause(attacker, () => victim.damage(d.damage, attacker || null, d.deathReason === 'rainmaker-timeout' ? 'rainmaker-timeout' : 'rainmaker'), d.cause || 'Gachihoko_Bullet');
          api.emit('hit', { attacker, victim, damage: d.damage, killed, weaponId: 'rainmaker' });
        }
      }
      return;
    }
    const result = incoming.call(this, from, d);
    if (d.k === 't' && this.isHost && m.mode === 'rainmaker' && m.state === 'playing')
      noteRankedBarrierShots(this, from, d, G.time);
    if (d.k === 'res' && from === this.s.hostId && !this.isHost && m.ranked.winner !== null) m.result = { ...m.result, ...m.ranked.result() };
    return result;
  };
  const clock = P._hostClock;
  P._hostClock = function (d) { if (!this.match?.ranked) return clock.call(this, d); };
  const leave = P.onLeave;
  P.onLeave = function (id, changed) {
    const m = this.match;
    if (m?.ranked) for (const a of m.actors.filter(a => a.owner === id)) m.ranked.rule.removeActor(actorId(a));
    const r = leave.call(this, id, changed);
    if (m?.ranked && changed) {
      clearTowerPaintSupport(this);
      this.rankedInputs?.clear(); this.rankedHitSeq?.clear();
      resetRankedBarrierAdmission(this);
      this.rankedEventSeq = this.rankedDamageSeq = 0;
      if (this.isHost) {
        m.follower = false;
        this._sendNow({ k: 'rkstate', rk: envelope(this, { state: m.ranked.snapshot(), gains: m.rankedGains || [0, 0] }) });
      }
    }
    return r;
  };
  const dispose = P.dispose;
  P.dispose = function () {
    clearTowerPaintSupport(this);
    this.rankedInputs?.clear(); this.rankedHitSeq?.clear();
    resetRankedBarrierAdmission(this);
    return dispose.call(this);
  };
}
function validEvent(e) {
  if (!e || typeof e.kind !== 'string' || e.kind.length > 40 || !Number.isFinite(e.at)) return false;
  if (e.team !== undefined && e.team !== 0 && e.team !== 1) return false;
  if (e.kind.startsWith('rainmaker-')) {
    if (!finiteVector(e.pos)) return false;
    if (e.kind === 'rainmaker-shot' && (!finiteVector(e.aim) || !Number.isFinite(e.speed) || e.speed < 0 || e.speed > 300)) return false;
    for (const key of ['damage', 'blastDamage', 'outerDamage', 'radius', 'paintRadius', 'nearRadius', 'directRange', 'effectiveRange', 'launchY', 'recoil', 'trailRadius']) if (e[key] !== undefined && (!Number.isFinite(e[key]) || e[key] < 0 || e[key] > 2000)) return false;
  }
  if (e.kind === 'clam-paint' && (!finiteVector(e.pos) || !Number.isFinite(e.radius) || e.radius <= 0 || e.radius > 1)) return false;
  return true;
}
export function acceptState(nm, packet) {
  const m = nm.match, engine = m?.ranked;
  if (!engine || packet.match !== nm.cfg.id || packet.host !== nm.s.hostId || !validRankedSnapshot(packet.state, engine.mode, engine.stage.id)) return false;
  let ok = false;
  try { ok = engine.restore(packet.state); } catch { return false; }
  if (!ok) return false;
  m.time = engine.time;
  if (Array.isArray(packet.gains) && packet.gains.length === 2 && packet.gains.every(n => Number.isFinite(n) && n >= 0 && n < 10000)) {
    const previous = m.rankedGains || [0, 0];
    for (const a of m.actors) if (!a.remote && a.alive && !a.specialActive && !specialGaugeLocked(a)) {
      const gain = Math.max(0, packet.gains[a.team] - previous[a.team]);
      // Host totals use baseline points, independent of this actor's SCU.
      a.special = Math.min(a.specialCost(), a.special + gain / (a.s3?.modifiers?.specialCharge || 1));
    }
    m.rankedGains = [...packet.gains];
  }
  m.rankedWorld?.update(engine, 0);
  recordTowerHostSnapshot(nm, packet.state);
  return true;
}

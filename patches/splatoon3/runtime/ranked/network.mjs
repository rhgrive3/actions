import { observeOwnerTick } from '../../../network-replication/owner-tick-receipt.mjs';
import { OWNER_CLOCK_VERSION } from '../../../network-replication/owner-clock.mjs';
import { validRainmakerShotOrigin } from './rainmaker-shot-origin.mjs';
import { validRankedSnapshot } from './engine.mjs';
import { admitRankedPose, bindRankedInput, rankedInputFor } from './pose-admission.mjs';
import { noteRankedBarrierShots, queueRankedBarrierHit, resetRankedBarrierAdmission } from './barrier-admission.mjs';
import { withObjectDamageCause } from '../sub-resistance.mjs';
import { specialGaugeLocked } from '../tacticooler-gauge.mjs';
import { recordTowerHostSnapshot, clearTowerPaintSupport, flushTowerHostSnapshots } from '../../../network-replication/tower-paint-support.mjs';

const damageCauses = new Set(['Gachihoko_Bullet', 'Gachihoko_BombCore', 'GachihokoTimeUpBurst']);
const HOST_SNAPSHOT_KINDS = Object.freeze(['st', 'res', 'end']);

export const actorId = a => String(a.nid ?? `${a.team}:${a.slot}`);
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 2000);
function current(nm) { return !nm._disposed && !nm.match?._disposed && nm.match?.ranked && nm._rankedAPI.G.netm === nm; }
function envelope(nm, data) { return { ...data, match: nm.cfg.id, host: nm.s.hostId }; }
// Host-known facts for pose admission (#1648): the host's own receive clock
// and the relocation targets this host can see for the owner's team.
function rankedPoseContext(nm, m, api) {
  const { G } = api, level = G.level, clock = globalThis.performance?.now?.();
  return {
    now: Number.isFinite(clock) ? clock / 1000 : null, level, fallDeathY: api.PLAYER?.fallDeathY,
    landings: actor => [level?.homeSuperJumpPoints?.[actor.team], level?.spawnPads?.[actor.team],
      ...(G.bigBubblerJumpTargets?.(actor.team) || []).map(t => t?.pos)],
    *allies(actor) {
      const actors=m.actors,length=actors.length;
      for (let i=0;i<length;i++) {
        if(!(i in actors))continue;
        const a=actors[i];
        if (a === actor || a.team !== actor.team || !a.alive || a.s3Disconnected) continue;
        const pose = a.remote ? nm.rankedPose?.get(actorId(a)) : null;
        yield pose?.actor === a ? pose.last.pos : a.pos;
        yield a.superJumpGround;
        yield a.superJumpState?.to;
      }
    },
  };
}

function rankedTickBroadcast(nm, tr, broadcast, d) {
      let throwActor = null;
      if (d.k === 't') {
        nm.rankedTick = (nm.rankedTick || 0) + 1;
        if (nm.isHost && nm.rankedTick % 4 === 0) {
          d.rk = envelope(nm, { state: nm.match.ranked.snapshot(), gains: nm.match.rankedGains || [0, 0] });

        }
        const a = nm.match.local;
        if (a && !nm.isHost) {
          const cmd = a._rankedInput || {};
          d.rki = { match: nm.cfg.id, id: actorId(a), seq: nm.rankedInputSeq = (nm.rankedInputSeq || 0) + 1,
            fire: !!cmd.fire, throw: !!a._rankedThrowPending, aim: cmd.aim || [0, 0, 1], special: a.specialActive?.id ?? null,
            specialDeployed: a.specialActive?.id === 'storm' && a.specialActive?.t > 0, clamDrop: a._rankedClamDrop || 0 };
          throwActor = a;
        }
      }
      const match = nm.match, session = nm.s, host = nm.s.hostId, epoch = nm.cfg.id;
      const accepted = broadcast.call(tr, d);
      if (accepted === true && nm.match === match && nm.s === session && nm.s.hostId === host && nm.cfg.id === epoch && current(nm) && nm.isHost && d.rk)
        recordTowerHostSnapshot(nm, d.rk.state);
      // A bounded transport can refuse this tick. Retain the one-shot edge
      // until a later ordinary tick is accepted, or input lifecycle cancels it.
      if (accepted === true && throwActor) throwActor._rankedThrowPending = false;
      return accepted;
}

export function installRankedNetwork(api) {
  const { NetMatch, G } = api, P = NetMatch.prototype;
  Object.defineProperty(P, '_rankedAPI', { get: () => api, configurable: true });
  const send = P._sendNow;
  P._sendNow = function (d) {
    if (current(this) && this.isHost && HOST_SNAPSHOT_KINDS.includes(d.k)) {
      d = { ...d, rk: envelope(this, { state: this.match.ranked.snapshot(), gains: this.match.rankedGains || [0, 0] }) };
      if (d.k === 'res') Object.assign(d, { rankedResult: this.match.ranked.result() });
    }
    const match = this.match, session = this.s, host = this.s.hostId, epoch = this.cfg.id;
    let flushedPacket = false;
    if (current(this) && this.isHost && !flushTowerHostSnapshots(this, packet => { const ok=send.call(this, packet); if(ok===true && packet===d)flushedPacket=true; return ok; })) return false;
    if (flushedPacket) return true;
    const accepted = send.call(this, d);
    if (accepted === true && current(this) && this.match === match && this.s === session && this.s.hostId === host && this.cfg.id === epoch
        && this.isHost && d.rk?.match === this.cfg.id && d.rk.host === host)
      recordTowerHostSnapshot(this, d.rk.state);
    return accepted;
  };
  // Extend the existing 20Hz actor packet, with 5Hz objective snapshots. The
  // session already provides reliable ordered transport; revision checks also
  // reject duplicate/reordered captures and late packets from a prior match.
  const broadcastSlots = new WeakMap();
  const tick = P._sendTick;
  P._sendTick = function () {
    if (!current(this)) return tick.call(this);
    if (this.isHost && !flushTowerHostSnapshots(this, packet => send.call(this, packet))) return false;
    const tr = this.s.tr, broadcast = tr?.broadcast;
    if (!broadcast) return tick.call(this);
    let slot = broadcastSlots.get(this);
    if (!slot) {
      slot = { active: false, tr: null, broadcast: null, callback: null };
      const nm = this;
      slot.callback = d => rankedTickBroadcast(nm, slot.tr, slot.broadcast, d);
      broadcastSlots.set(this, slot);
    }
    const nested = slot.active;
    if (!nested) { slot.active = true; slot.tr = tr; slot.broadcast = broadcast; }
    tr.broadcast = nested ? d => rankedTickBroadcast(this, tr, broadcast, d) : slot.callback;
    try { return tick.call(this); } finally {
      tr.broadcast = broadcast;
      if (!nested) { slot.active = false; slot.tr = slot.broadcast = null; }
    }
  };
  const incoming = P.onMessage;
  P.onMessage = function (from, d) {
    if (!current(this) || !d || typeof d !== 'object') return incoming.call(this, from, d);
    if (d.k === 't' && Array.isArray(d.a) && (d.a.length > 8 || d.a.length > this.byNid.size)) return;
    if (d.k === 't' && this.s?.ownerClockVersion === OWNER_CLOCK_VERSION
        && typeof this.cfg?.id === 'string' && this.cfg.id.length > 0 && this.cfg.id.length <= 128
        && (d.oc !== undefined && d.oc !== OWNER_CLOCK_VERSION
          || d.oc === OWNER_CLOCK_VERSION && d.ocm !== this.cfg.id)) return;
    const m = this.match, inputSession = this.s, inputMatchId = this.cfg.id;
    let stagedInput = null;
    if (d.rk && from === this.s.hostId && !this.isHost && (d.k==='st'||d.k==='res'||d.k==='end'||d.k==='rkstate')) {
      const accepted = acceptState(this, d.rk);
      if (!accepted && HOST_SNAPSHOT_KINDS.includes(d.k)) return;
    }
    if (d.k === 't' && d.rki && this.isHost && m.state === 'playing' && m.ranked.winner == null) {
      const cmd = d.rki, a = m.actors.find(a => actorId(a) === cmd.id);
      if (cmd.match === this.cfg.id && a?.owner === from && a.alive && Number.isSafeInteger(cmd.seq) && cmd.seq > 0 && finiteVector(cmd.aim)) {
        this.rankedInputs ||= new Map();
        const inputLife = d.l && Object.hasOwn(d.l,a.nid) ? d.l[a.nid] : a.net?.lastLife;
        const old = inputLife===a.net?.lastLife ? rankedInputFor(this.rankedInputs.get(cmd.id),a,m,this) : null;
        const specialOk = cmd.special == null || cmd.special === a.weapon?.special;
        const dropOk = cmd.clamDrop === undefined || Number.isSafeInteger(cmd.clamDrop) && cmd.clamDrop >= 0 && cmd.clamDrop <= 100000;
        if ((!old || cmd.seq > old.seq) && specialOk && dropOk && Number.isSafeInteger(inputLife) && inputLife>=0)
          stagedInput = {id:cmd.id,actor:a,life:inputLife,input:{ seq: cmd.seq, fire: !!cmd.fire, throw: !!cmd.throw || !!old?.throw, aim: cmd.aim, at: G.time,
            special: cmd.special ?? null, specialDeployed: cmd.special === 'storm' && cmd.specialDeployed === true, clamDrop: Math.max(old?.clamDrop || 0, cmd.clamDrop || 0) }};
      }
    }
    if (d.k === 'rkhit') {
      if (!this.isHost || d.match !== this.cfg.id || m.state !== 'playing' || m.ranked.winner != null) return;
      const a = m.actors.find(a => actorId(a) === d.id);
      if (!a?.alive || a.owner !== from || !Number.isSafeInteger(d.seq) || d.seq <= 0 || !Number.isFinite(d.damage) || !(d.damage > 0) || d.damage > 2000 || !finiteVector(d.pos)) return;
      if (d.seq <= (this.rankedHitSeq?.get(from) || 0)) return;
      const s = m.ranked.rule.state;
      if (m.mode !== 'rainmaker' || !s.barrier?.active || !finiteVector(s.pos) || Math.hypot(s.pos[0]-d.pos[0],s.pos[1]-d.pos[1],s.pos[2]-d.pos[2]) > 6) return;
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
    // Stage plausibility without publishing authority before the native packet,
    // owner-life and adoption-sequence checks have accepted the actual snapshot.
    const stagedPoses = d.k === 't' && this.isHost ? [] : null, session = this.s;
    if (d.k === 't' && this.isHost && Array.isArray(d.a)) {
      this.rankedPose ||= new Map();
      let accepted = null, rowIndex = 0;
      const poseContext = rankedPoseContext(this, m, api);
      for (const row of d.a) {
        const actor = this.byNid.get(row?.[0]);
        if (!actor?.remote || actor.owner !== from) {
          if (!accepted) { accepted = []; for (let i = 0; i < rowIndex; i++) accepted.push(d.a[i]); }
          rowIndex++; continue;
        }
        const id = actorId(actor), previous = this.rankedPose.get(id);
        const state = previous?.actor === actor && previous.match === m && previous.session === session && previous.owner === from
          ? { ...previous } : {};
        if (!admitRankedPose(state, row, actor, d.ts, m.rankedWorld, poseContext)) {
          if (!accepted) { accepted = []; for (let i = 0; i < rowIndex; i++) accepted.push(d.a[i]); }
          rowIndex++; continue;
        }
        stagedPoses.push({ id, actor, row, state, tail: actor.net?.buf?.at(-1) });
        if (accepted) accepted.push(row);
        rowIndex++;
      }
      if (accepted) d = { ...d, a: accepted };
    }
    const observed = d.k === 't' ? observeOwnerTick(this,from,d,()=>incoming.call(this,from,d)) : null;
    const result = observed ? observed.result : incoming.call(this, from, d);
    const receipt=observed?.receipt;
    if(receipt && d.rk && from===this.s.hostId && !this.isHost)acceptState(this,d.rk);
    // Native processing may advance life or replace the actor/session. Publish
    // only into that same epoch; a valid first new-life edge is not discarded.
    if (receipt && stagedInput && current(this) && this.match===m && this.s===inputSession && this.cfg.id===inputMatchId && this.isHost) {
      const {id,actor,life,input}=stagedInput;
      if (receipt.actors?.includes(actor) && this.byNid.get(actor.nid)===actor && actor.owner===from && actor.net?.lastLife===life) {
        const bound=bindRankedInput(input,actor,m,this);
        if(bound)this.rankedInputs.set(id,bound);
      }
    }
    if (receipt && stagedPoses && current(this) && this.match === m && this.s === session && this.isHost) {
      for (const { id, actor, row, state, tail } of stagedPoses) {
        const snap = actor.net?.buf?.at(-1);
        if (this.byNid.get(actor.nid) !== actor || actor.owner !== from || !actor.remote ||
            !snap || snap === tail || snap.t !== d.ts || snap.life !== d.l?.[actor.nid] ||
            snap.x !== row[1] || snap.y !== row[2] || snap.z !== row[3]) continue;
        state.owner = from; state.life = snap.life;
        // Keep local object identities out of snapshots/debug JSON.
        Object.defineProperties(state, { actor: { value: actor }, match: { value: m }, session: { value: session } });
        this.rankedPose.set(id, state);
      }
    }
    if (receipt && this.isHost && m.mode === 'rainmaker' && m.state === 'playing')
      noteRankedBarrierShots(this, from, receipt, G.time);
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
      this.rankedInputs?.clear(); this.rankedHitSeq?.clear(); this.rankedPose?.clear();
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
    this.rankedInputs?.clear(); this.rankedHitSeq?.clear(); this.rankedPose?.clear();
    resetRankedBarrierAdmission(this);
    return dispose.call(this);
  };
}
function validEvent(e) {
  if (!e || typeof e.kind !== 'string' || e.kind.length > 40 || !Number.isFinite(e.at)) return false;
  if (e.team !== undefined && e.team !== 0 && e.team !== 1) return false;
  if (e.kind.startsWith('rainmaker-')) {
    if (!finiteVector(e.pos)) return false;
    if (e.kind === 'rainmaker-shot' && (!validRainmakerShotOrigin(e.shotOrigin, e) || !finiteVector(e.aim) || !Number.isFinite(e.speed) || e.speed < 0 || e.speed > 300)) return false;
    for (const key of ['damage', 'blastDamage', 'outerDamage', 'radius', 'paintRadius', 'nearRadius', 'directRange', 'effectiveRange', 'launchY', 'recoil', 'trailRadius']) if (e[key] !== undefined && (!Number.isFinite(e[key]) || e[key] < 0 || e[key] > 2000)) return false;
  }
  if (e.kind === 'clam-paint' && (!finiteVector(e.pos) || !Number.isFinite(e.radius) || e.radius <= 0 || e.radius > 1)) return false;
  return true;
}
export function acceptState(nm, packet) {
  const m = nm.match, engine = m?.ranked;
  if (!engine || packet.match !== nm.cfg.id || packet.host !== nm.s.hostId) return false;
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
    m.rankedGains = packet.gains.map((total, team) => Math.max(previous[team], total));
  }
  m.rankedWorld?.update(engine, 0);
  recordTowerHostSnapshot(nm, packet.state);
  return true;
}

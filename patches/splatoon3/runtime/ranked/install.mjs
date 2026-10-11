import { Match } from '../../../../src/game/match.js';
import { BotBrain } from '../../../../src/game/bots.js';
import { NetSession } from '../../../../src/net/session.js';
import { RankedEngine, isRankedMode } from './engine.mjs';
import { createRankedStage, RankedWorld } from './world.mjs';
import { installRankedUi } from './ui.mjs';
import { installRankedBots } from './bots.mjs';
import { installRankedNetwork, actorId } from './network.mjs';
import { installRankedCombat, createRankedEffects, isCarrier } from './combat.mjs';

const INSTALLED = Symbol.for('inkwave.ranked.v1');
export function installRanked(context) {
  if (Match.prototype[INSTALLED]) return;
  Object.defineProperty(Match.prototype, INSTALLED, { value: true });
  const api = { ...context, Match, BotBrain, NetSession }, { G, Actor, PlayerController } = api;
  installRankedCombat(api); installRankedNetwork(api); installRankedUi(api); installRankedBots(api);
  const setup = Match.prototype.setup;
  Match.prototype.setup = function () {
    const r = setup.call(this);
    if (!isRankedMode(this.mode)) return r;
    const stage = createRankedStage(G);
    this.ranked = new RankedEngine(this.mode, stage);
    this.rankedWorld = new RankedWorld(api, this, stage);
    this.rankedEffects = createRankedEffects(api, this);
    this.rankedBarrierHits = []; this.rankedGains = [0, 0]; this.duration = this.time = 300;
    return r;
  };
  const update = Match.prototype.update;
  Match.prototype.update = function (dt) {
    if (this.ranked && !this.paused && this.state === 'playing') this.rankedWorld.beforeActors?.(this.ranked, dt);
    return update.call(this, dt);
  };
  Match.prototype.advanceRanked = function (dt) {
    if (!this.ranked || this.paused || this.state !== 'playing') return;
    const nm = G.netm;
    // Frame is available to local bot planning even when only the host can score.
    const frame = this.ranked.frame = buildFrame(this, api);
    if (!this.follower) {
      this.ranked.update(dt, frame); this.time = this.ranked.time;
      const events = this.ranked.events.splice(0);
      this.playRankedEvents(events);
      const wire = events.filter(e => e.kind !== 'special-gain' && e.kind !== 'zone-capture');
      if (wire.length && nm?.isHost) nm._sendNow({ k: 'rkevent', match: nm.cfg.id, seq: nm.rankedEventNext = (nm.rankedEventNext || 0) + 1, events: wire });
      if (this.ranked.winner !== null) {
        this.local?.weaponRunner?.cancelPendingInput?.();
        for (const a of this.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.sub = a.intent.special = a.intent.throw = false; }
        this.setState('finish');
      }
    }
    this.rankedWorld.update(this.ranked, dt);
    this.rankedEffects.update(dt);
  };
  Match.prototype.playRankedEvents = function (events, visualOnly = false) {
    if (!this.ranked) return;
    for (const e of events) {
      if (!e || typeof e.kind !== 'string') continue;
      if (e.kind === 'zone-capture' && !visualOnly) this.rankedWorld.captureZone(e.zone, e.team);
      if (e.kind === 'special-gain' && !visualOnly) {
        this.rankedGains[e.team] += e.points;
        for (const a of this.actors) if (a.team === e.team && a.alive && !a.remote && !a.specialActive) a.special = Math.min(a.specialCost(), a.special + e.points);
      }
      this.rankedEffects.event(e, visualOnly);
      if (['lead', 'checkpoint', 'tower-capture', 'zone-capture', 'clam-score', 'overtime'].includes(e.kind)) {
        api.emit('ranked:event', { match: this, ...e });
        if (e.kind !== 'clam-score') G.audio?.play?.(e.kind === 'overtime' ? 'ui_confirm' : 'splat_small', { volume: .6 });
      }
    }
  };
  const judge = Match.prototype._judge;
  Match.prototype._judge = function () {
    if (!this.ranked) return judge.call(this);
    if (this.follower || this.ranked.winner === null || this.result) return;
    this.result = this.ranked.result(); G.netm?.sendResult(this.result); this.setState('judge');
  };
  const remove = Match.prototype.removeActor;
  Match.prototype.removeActor = function (a) { this.ranked?.rule.removeActor(actorId(a)); return remove.call(this, a); };
  const dispose = Match.prototype.dispose;
  Match.prototype.dispose = function () {
    this.rankedWorld?.dispose(); this.rankedEffects?.dispose();
    this.rankedWorld = this.rankedEffects = null; this.ranked = null;
    return dispose.call(this);
  };
  const controller = PlayerController.prototype.update;
  PlayerController.prototype.update = function (dt) {
    const r = controller.call(this, dt), a = this.a, m = G.match;
    if (m?.mode === 'clams' && this.enabled && a?.alive) {
      const input = this.input, touch = input.mobile;
      const inv = m.ranked?.rule.state.inventories?.[actorId(a)];
      const throwHeld = input.down('KeyC') || input.padButton(1) || (!!(inv?.small || inv?.power) && !!touch?.down('sub'));
      a.intent.throw = !!throwHeld && !a._rankedThrowHeld;
      a._rankedThrowHeld = !!throwHeld;
      if (throwHeld && touch?.down('sub')) {
        a.intent.sub = false;
        if (a._prevIntent) a._prevIntent.sub = false;
      }
    }
    return r;
  };
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const m = G.match;
    if (!m?.ranked) return actorUpdate.call(this, dt);
    const aim = this.aimDir?.toArray?.() || [Math.sin(this.yaw) * Math.cos(this.aimPitch), Math.sin(this.aimPitch), Math.cos(this.yaw) * Math.cos(this.aimPitch)];
    this._rankedInput = { fire: !!this.intent.fire, throw: !!this.intent.throw, aim };
    if (this.intent.throw) this._rankedThrowPending = true;
    if (isCarrier(m, this)) {
      this.intent.fire = this.intent.sub = this.intent.special = false;
      if (this._prevIntent) this._prevIntent.sub = false;
      this.fireBuffer = 0;
    }
    return actorUpdate.call(this, dt);
  };
}

export function buildFrame(match, api) {
  const nm = api.G.netm, inputs = {};
  const actors = match.actors.map(a => {
    const id = actorId(a), cmd = a.remote && nm?.isHost ? nm.rankedInputs?.get(id) : a._rankedInput;
    if (cmd && (!a.remote || api.G.time - cmd.at < .75)) inputs[id] = { fire: !!cmd.fire, throw: !!cmd.throw, aim: cmd.aim };
    if (a.remote && cmd) cmd.throw = false;
    if (!a.remote) { a.intent.throw = false; if (!nm || nm.isHost) a._rankedThrowPending = false; }
    return { id, team: a.team, pos: a.pos.toArray(), alive: a.alive && !a.s3Disconnected, grounded: a.grounded,
      remote: a.remote, onTower: !!a._rankedOnTower, weight: a.weapon.weight || 'middle', swimming: a.form === 'squid', slot: a.slot };
  });
  return { actors, inputs, zoneCoverage: match.rankedWorld.zoneCoverage(), barrierHits: match.rankedBarrierHits.splice(0),
    floorAt: (x, z) => match.rankedWorld.floorAt(x, z), blocked: (a, b) => match.rankedWorld.blocked(a, b) };
}

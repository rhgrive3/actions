import { captureRainmakerShotOrigin, rainmakerActorLife, rainmakerActorOwner } from './rainmaker-shot-origin.mjs';
import { admitRainmakerHostEvents } from './rainmaker-device-contact.mjs';
import { Match } from '../../../../src/game/match.js';
import { BotBrain } from '../../../../src/game/bots.js';
import { NetSession } from '../../../../src/net/session.js';
import { RankedEngine, isRankedMode, OWNED_RANKED_FRAME, OWNED_RANKED_ACTOR, OWNED_RANKED_BLOCKED } from './engine.mjs';
import { createRankedStage, RankedWorld } from './world.mjs';
import { installRankedUi } from './ui.mjs';
import { installRankedBots } from './bots.mjs';
import { installRankedNetwork, actorId } from './network.mjs';
import { objectiveSpecialFor, rankedInputFor } from './pose-admission.mjs';
import { installRankedCombat, createRankedEffects, isCarrier } from './combat.mjs';

import { interruptSpecialForObjective } from '../all-specials.mjs';
import { specialGaugeLocked, clearSpecialGaugeLocks } from '../tacticooler-gauge.mjs';
import { catalogSplatanaThrowBlocked } from '../main-weapon-catalog.mjs';

const INSTALLED = Symbol.for('inkwave.ranked.v1');
export function installRanked(context) {
  if (Match.prototype[INSTALLED]) return;
  Object.defineProperty(Match.prototype, INSTALLED, { value: true });
  const api = { ...context, Match, BotBrain, NetSession }, { G, Actor, PlayerController } = api;
  installRankedCombat(api); installRankedNetwork(api); installRankedUi(api); installRankedBots(api);
  const dropClams = a => {
    if (G.match?.mode === 'clams' && a && !a.remote) a._rankedClamDrop = (a._rankedClamDrop || 0) + 1;
  };
  api.on?.('all:special', e => {
    if ((e?.id === 'krakenRoyale' && e.action === 'activate') || (e?.id === 'reefslider' && e.action === 'impact')) dropClams(e.actor);
  });
  api.on?.('special:slam', e => dropClams(e?.actor));
  const setup = Match.prototype.setup;
  Match.prototype.setup = function () {
    const r = setup.call(this);
    if (!isRankedMode(this.mode)) return r;
    const stage = createRankedStage(G, this.mode);
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
      if (this.ranked.events.length) {
        if (this.playRankedEvents === playRankedEvents && this.ranked.events.length === 1 && this.ranked.events[0].kind === 'special-gain') {
          const event = this.ranked.events[0];
          // Detach before callbacks, just like splice: reentrant events belong
          // to the next tick and must not be erased by this drain.
          this.ranked.events.length = 0;
          playRankedEvent.call(this, event, false);
        } else {
          const events = this.ranked.events.splice(0);
          if (nm?.isHost) admitRainmakerHostEvents(nm, this, events, nm.myId);
          this.playRankedEvents(events);
          const singleInternal = nm?.isHost && events.length === 1 && (events[0].kind === 'special-gain' || events[0].kind === 'zone-capture');
          const wire = nm?.isHost && events.length && !singleInternal ? events.filter(e => e.kind !== 'special-gain' && e.kind !== 'zone-capture') : null;
          if (wire?.length) nm._sendNow({ k: 'rkevent', match: nm.cfg.id, seq: nm.rankedEventNext = (nm.rankedEventNext || 0) + 1, events: wire });
        }
      }
      if (this.ranked.winner !== null) {
        this.local?.weaponRunner?.cancelPendingInput?.();
        for (const a of this.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.sub = a.intent.special = a.intent.throw = false; }
        this.setState('finish');
      }
    }
    this.rankedWorld.update(this.ranked, dt);
    this.rankedEffects.update(dt);
  };
  function playRankedEvent(e, visualOnly) {
    if (!e || typeof e.kind !== 'string') return;
    if (e.kind === 'zone-capture' && !visualOnly) this.rankedWorld.captureZone(e.zone, e.team);
    if (e.kind === 'rainmaker-pickup') {
      const a = this.actors.find(a => actorId(a) === String(e.id));
      if (a?.specialActive) interruptSpecialForObjective(api, a);
      if (a && !a.remote) prepareCarrier(api, a);
    }
    if (e.kind === 'special-gain' && !visualOnly) {
      // The replicated total stays in baseline points. SCU discounts the
      // actor gauge cost, so only paint may keep the indirect multiplier.
      this.rankedGains[e.team] += e.points;
      for (const a of this.actors) if (a.team === e.team && a.alive && !a.remote && !a.specialActive && !specialGaugeLocked(a)) a.special = Math.min(a.specialCost(), a.special + e.points / (a.s3?.modifiers?.specialCharge || 1));
    }
    this.rankedEffects.event(e, visualOnly);
    const kind = e.kind;
    if (kind === 'lead' || kind === 'checkpoint' || kind === 'tower-capture'
      || kind === 'zone-capture' || kind === 'clam-score' || kind === 'overtime') {
      api.emit('ranked:event', { match: this, ...e });
      if (e.kind !== 'clam-score') G.audio?.play?.(e.kind === 'overtime' ? 'ui_confirm' : 'splat_small', { volume: .6 });
    }
  }
  function playRankedEvents(events, visualOnly = false) {
    if (!this.ranked) return;
    for (const e of events) playRankedEvent.call(this, e, visualOnly);
  }
  Match.prototype.playRankedEvents = playRankedEvents;
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
    if (m?.mode === 'clams' && a) {
      const input = this.input, touch = input.mobile;
      const inv = m.ranked?.rule.state.inventories?.[actorId(a)];
      const touchDown = !!touch?.down('sub'), touchPressed = !!touch?.wasPressed?.('sub');
      // The same finger hold stays a clam gesture after its last clam leaves.
      // Reinterpreting it as SUB on the next tick would arm/throw a bomb.
      const touchThrow = !!(inv?.small || inv?.power || a._rankedTouchThrowHeld) && (touchDown || touchPressed);
      a._rankedTouchThrowHeld = touchThrow && touchDown;
      const throwHeld = input.down('KeyC') || input.padButton(1) || (touchThrow && touchDown);
      // A press/release can occur between fixed ticks. Preserve the same raw
      // press edges as jump/sub instead of sampling only the current hold.
      const throwPressed = input.wasPressed('KeyC') || input.padPressed.has(1) || (touchThrow && touchPressed);
      const allowed = this.enabled && a.alive && !this.mapHeld && !this.menuBlocked;
      a.intent.throw = !!allowed && (!!throwPressed || !!throwHeld && !a._rankedThrowHeld);
      a._rankedThrowHeld = !!throwHeld;
      if (!allowed) a._rankedThrowPending = false;
      if (allowed && touchThrow) {
        a.intent.sub = false;
        if (a._prevIntent) a._prevIntent.sub = false;
      }
    }
    return r;
  };
  const actorUpdate = Actor.prototype.update;
  Actor.prototype.update = function (dt) {
    const m = G.match;
    if (!m?.ranked) { this._rankedCarrierPrepared = false; return actorUpdate.call(this, dt); }
    // Controller/BotBrain have already supplied this tick's aim angles. The
    // cached aimDir is refreshed inside actorUpdate and still points along
    // the previous tick here, so a turn-and-throw/shot must use the new angles.
    const yaw = Number.isFinite(this.aimYaw) ? this.aimYaw : this.yaw;
    const pitch = Number.isFinite(this.aimPitch) ? this.aimPitch : 0;
    const cosPitch = Math.cos(pitch);
    const aim = [Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch];
    // Reject at the same pre-update recovery boundary as sub preparation,
    // before either the local command or follower wire latch can retain it.
    if (m.mode === 'clams' && catalogSplatanaThrowBlocked(this)) this.intent.throw = false;
    this._rankedInput = { fire: !!this.intent.fire, throw: !!this.intent.throw, aim };
    if (this.intent.throw) this._rankedThrowPending = true;
    if (isCarrier(m, this)) {
      if (this.specialActive) interruptSpecialForObjective(api, this);
      prepareCarrier(api, this);
      this.intent.sub = this.intent.special = false;
      if (this._prevIntent) this._prevIntent.sub = false;
      this.fireBuffer = 0;
      if (m.ranked.rule.state.goalHold) {
        this.intent.move.set(0, 0, 0);
        this.intent.fire = this.intent.jump = this.intent.squid = false;
        this.vel.x = this.vel.z = 0;
        this._rankedInput.fire = false;
      }
    } else this._rankedCarrierPrepared = false;
    return actorUpdate.call(this, dt);
  };
}

function prepareCarrier(api, actor) {
  if (actor._rankedCarrierPrepared) return;
  clearSpecialGaugeLocks(actor);actor.special=0;
  // A suspended main-weapon charge/stream would retain its busy gate, block
  // swimming, and resume firing when the holder reaches a checkpoint.
  actor.weaponRunner?.reset?.();
  actor.fireBuffer = 0;
  actor.ink = api.PLAYER.inkMax;
  actor._rankedCarrierPrepared = true;
}

export function buildFrame(match, api) {
  let scratch = match._rankedFrameScratch;
  if (!scratch) {
    const frame = { actors: [], inputs: {}, zoneCoverage: [], barrierHits: [],
      floorAt: (x, z, yMax) => match.rankedWorld.floorAt(x, z, yMax), fallDeathY: api.PLAYER?.fallDeathY,
      blocked: (a, b) => match.rankedWorld.blocked(a, b) };
    Object.defineProperty(frame, OWNED_RANKED_FRAME, { value: frame.inputs });
    Object.defineProperty(frame, OWNED_RANKED_BLOCKED, { value: null, writable: true });
    scratch = match._rankedFrameScratch = { frame, rows: new WeakMap(), inputIds: [] };
  }
  const frame = scratch.frame, inputs = frame.inputs, actors = frame.actors, nm = api.G.netm;
  for (const id of scratch.inputIds) delete inputs[id];
  scratch.inputIds.length = 0; actors.length = match.actors.length;
  for (let index = 0; index < match.actors.length; index++) {
    const a = match.actors[index];
    let owned = scratch.rows.get(a);
    if (!owned) {
      owned = { row: { pos: [0, 0, 0] }, input: { fire: false, throw: false, aim: null } };
      Object.defineProperty(owned.row, OWNED_RANKED_ACTOR, { value: owned.row.pos });
      scratch.rows.set(a, owned);
    }
    const id = actorId(a), received = a.remote && nm?.isHost ? rankedInputFor(nm.rankedInputs?.get(id),a,match,nm) : a._rankedInput;
    const age = a.remote && received ? api.G.time - received.at : 0;
    const cmd = !a.remote || Number.isFinite(age) && age >= 0 && age < .75 ? received : null;
    if (cmd) {
      owned.input.fire = !!cmd.fire; owned.input.throw = !!cmd.throw; owned.input.aim = cmd.aim;
      inputs[id] = owned.input; scratch.inputIds.push(id);
    }
    if (a.remote && received) received.throw = false;
    if (!a.remote) { a.intent.throw = false; if (!nm || nm.isHost) a._rankedThrowPending = false; }
    const hostRemote = a.remote && nm?.isHost && nm.match === match;
    const pose = hostRemote ? nm.rankedPose?.get(id) : null;
    const admitted = pose?.actor === a && pose.match === match && pose.session === nm.s && pose.owner === a.owner && pose.life === a.net?.lastLife;
    const objectivePos = owned.row.pos;
    if (hostRemote && admitted) { objectivePos[0] = pose.last.pos[0]; objectivePos[1] = pose.last.pos[1]; objectivePos[2] = pose.last.pos[2]; }
    else { objectivePos[0] = a.pos.x; objectivePos[1] = a.pos.y; objectivePos[2] = a.pos.z; }
    const special = objectiveSpecialFor(a, a.remote ? cmd : null);
    const specialDeployed = special === 'storm' && (a.specialActive?.t > 0 || (a.remote && cmd?.specialDeployed === true));
    const grounded = hostRemote ? admitted && pose.last.grounded === true : a.grounded;
    const swimming = hostRemote && admitted ? pose.last.squid === true : a.form === 'squid';
    const shotRequired = match.mode === 'rainmaker' && match.ranked.rule.state.carrier === id;
    const charge = shotRequired ? match.ranked.rule.state.charge : null;
    const shotOrigin = shotRequired && charge?.firing && (!cmd?.fire || charge.released) && !swimming && (!hostRemote || admitted)
      ? captureRainmakerShotOrigin(api.THREE, a, id, objectivePos, cmd?.aim || a.aimDir?.toArray()) : null;
    const row = owned.row;
    row.life = rainmakerActorLife(a); row.owner = rainmakerActorOwner(a); row.rainmakerShotRequired = shotRequired; row.rainmakerShotOrigin = shotOrigin;
    row.special = special; row.specialDeployed = specialDeployed; row.clamDrop = a.remote && cmd ? cmd.clamDrop : a._rankedClamDrop || 0;
    row.id = id; row.team = a.team; row.alive = a.alive && !a.s3Disconnected && (!hostRemote || admitted); row.grounded = grounded;
    row.remote = a.remote; row.onTower = !!a._rankedOnTower; row.weight = a.weapon.weight || 'middle'; row.swimming = swimming; row.slot = a.slot;
    actors[index] = row;
  }
  const world = match.rankedWorld;
  frame[OWNED_RANKED_BLOCKED] = world instanceof RankedWorld && world.blocked === RankedWorld.prototype.blocked ? frame.blocked : null;
  frame.zoneCoverage = match.mode === 'zones' ? world.zoneCoverage()
    : (world._emptyZoneCoverage ??= Object.freeze((world.stage?.zones || []).map(() => Object.freeze([0, 0]))));
  frame.barrierHits = match.rankedBarrierHits.length ? match.rankedBarrierHits.splice(0)
    : (scratch.emptyBarrierHits || (scratch.emptyBarrierHits = Object.freeze([])));
  frame.fallDeathY = api.PLAYER?.fallDeathY;
  return frame;
}

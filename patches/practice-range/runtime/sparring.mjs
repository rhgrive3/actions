// Practice Range sparring Bots (owner request 2026-11-05). Real Actors with the
// real Character, weapons, damage and movement; only who drives them differs:
//   static - stands still (a moving body you can't miss for a static TTK)
//   move   - strafes left/right and hops, never shoots (tracking practice)
//   combat - the normal match BotBrain: moves, jumps, shoots, dodges, retreats
// Training rules (not Splatoon 3 rules): a splatted sparring Bot stands up at
// its anchor 3 s later; at most 3 at once. Read-outs listen to the same
// 'damage' / 'splatted' events as the targets and read the player's attacks
// from match-insights.mjs.
import * as THREE from 'three';
import { G, emit } from '../../../src/core/ctx.js';
import { WEAPONS, WEAPON_ORDER } from '../../../src/config.js';
import { Actor } from '../../../src/game/actor.js';
import { BotBrain } from '../../../src/game/bots.js';
import { insightsOf } from '../../splatoon3/runtime/match-insights.mjs';

export const SPARRING_BEHAVIORS = Object.freeze(['static', 'move', 'combat']);
export const SPARRING_MAX = 3;
export const SPARRING_RESPAWN = 3;
export const SPARRING_DISTANCE = 9;
const _v = new THREE.Vector3();

// Scripted strafe for 'move': a 1.6 s left/right cycle with a hop every 2.4 s.
export class StrafeDriver {
  constructor(actor) { this.a = actor; this.t = 0; }
  update(dt) {
    const a = this.a, it = a.intent;
    this.t += dt;
    const side = Math.sin(this.t * Math.PI / .8) >= 0 ? 1 : -1;
    const yaw = a.sparring?.faceYaw ?? a.yaw;
    it.move.set(Math.cos(yaw) * side, 0, -Math.sin(yaw) * side);
    it.fire = it.squid = it.sub = it.special = false;
    it.jump = this.t % 2.4 < dt;
    a.aimYaw = yaw; a.aimPitch = 0;
  }
  reset() { this.t = 0; }
}
export class StandDriver {
  constructor(actor) { this.a = actor; }
  update() { const it = this.a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; }
  reset() {}
}

export function blankSparringStats() {
  return { damageTaken: 0, hitsTaken: 0, splats: 0, lastTtk: null, bestTtk: null, damageToPlayer: 0, attacks0: 0, landed0: 0 };
}

export class SparringBots {
  constructor(session) { this.s = session; this.bots = []; this.stats = blankSparringStats(); this._combo = new Map(); }

  spawn({ weapon = null, behavior = 'combat', difficulty = 'normal' } = {}) {
    const m = this.s.m, local = this.s.local;
    if (!SPARRING_BEHAVIORS.includes(behavior) || !local) return null;
    while (this.bots.length >= SPARRING_MAX) this.remove(this.bots[0]);
    const id = WEAPONS[weapon] ? weapon : WEAPON_ORDER[(Math.random() * WEAPON_ORDER.length) | 0];
    const slot = 40 + this.bots.length;
    const a = new Actor({ team: 1, slot, weapon: id, isLocal: false, isBot: true, name: `Bot ${this.bots.length + 1}`, style: null, CharacterClass: m.opts.CharacterClass });
    // Anchor: in front of the player, spread sideways per Bot, on the ground.
    const yaw = local.yaw, off = (this.bots.length - 1) * 2.2;
    const ax = local.pos.x + Math.sin(yaw) * SPARRING_DISTANCE + Math.cos(yaw) * off;
    const az = local.pos.z + Math.cos(yaw) * SPARRING_DISTANCE - Math.sin(yaw) * off;
    const ay = G.level?.groundHeight?.(ax, az, local.pos.y + 3);
    const faceYaw = Math.atan2(local.pos.x - ax, local.pos.z - az);
    a.sparring = { behavior, anchor: new THREE.Vector3(ax, Number.isFinite(ay) ? ay + .05 : local.pos.y, az), faceYaw };
    a.bot = behavior === 'combat' ? new BotBrain(a, difficulty) : behavior === 'move' ? new StrafeDriver(a) : new StandDriver(a);
    a.respawn = () => this._standUp(a);
    a.character.actor = a;
    G.scene?.add(a.character.root);
    m.actors.push(a);
    this._standUp(a);
    this.bots.push(a);
    this.resetStats();
    return a;
  }
  _standUp(a) {
    const s = a.sparring;
    a.spawnAt(_v.copy(s.anchor), s.faceYaw);
    a.invuln = 0;
    a.bot?.reset?.();
    if (a.bot instanceof BotBrain) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    a.character.trigger?.('spawn');
    emit('respawn', { actor: a });
  }
  remove(a) {
    const i = this.bots.indexOf(a);
    if (i < 0) return;
    this.bots.splice(i, 1);
    const list = this.s.m.actors, j = list.indexOf(a);
    if (j >= 0) list.splice(j, 1);
    a.alive = false; a.bot = null;
    G.scene?.remove(a.character.root);
    a.character.dispose?.();
    emit('actor:removed', { actor: a });
  }
  removeAll() { for (const a of [...this.bots]) this.remove(a); }
  resetStats() {
    this.stats = blankSparringStats();
    const ins = insightsOf(this.s.local);
    if (ins) { this.stats.attacks0 = ins.attacks; this.stats.landed0 = ins.landed; }
    this._combo.clear();
  }
  onDamage({ victim, attacker, amount }) {
    if (!(amount > 0)) return;
    if (this.bots.includes(victim) && attacker === this.s.local) {
      this.stats.damageTaken += amount; this.stats.hitsTaken++;
      const c = this._combo.get(victim);
      if (!c || this.s.time - c.last > 1.5) this._combo.set(victim, { t0: this.s.time, last: this.s.time });
      else c.last = this.s.time;
    } else if (this.bots.includes(attacker) && victim === this.s.local) this.stats.damageToPlayer += amount;
  }
  onSplatted({ victim }) {
    if (!this.bots.includes(victim)) return;
    this.stats.splats++;
    const c = this._combo.get(victim);
    if (c) {
      const ttk = this.s.time - c.t0;
      this.stats.lastTtk = ttk;
      this.stats.bestTtk = this.stats.bestTtk == null ? ttk : Math.min(this.stats.bestTtk, ttk);
      this._combo.delete(victim);
    }
    victim.respawnTimer = SPARRING_RESPAWN;
  }
  /** Player-side numbers since the last spawn / reset. */
  readout() {
    const ins = insightsOf(this.s.local);
    const attacks = ins ? ins.attacks - this.stats.attacks0 : 0, landed = ins ? ins.landed - this.stats.landed0 : 0;
    return {
      bots: this.bots.length, behaviors: this.bots.map(b => b.sparring.behavior), weapons: this.bots.map(b => b.weaponId),
      attacks, landed, accuracy: attacks > 0 ? landed / attacks : null,
      damage: Math.round(this.stats.damageTaken), hits: this.stats.hitsTaken, splats: this.stats.splats,
      lastTtk: this.stats.lastTtk, bestTtk: this.stats.bestTtk, damageTaken: Math.round(this.stats.damageToPlayer),
    };
  }
  update() {
    for (const a of this.bots) {
      if (!a.alive || a.sparring.behavior !== 'static') continue;
      // static: pinned to the anchor (knockback / slopes do not walk it away)
      a.pos.x = a.sparring.anchor.x; a.pos.z = a.sparring.anchor.z; a.vel.x = a.vel.z = 0;
      a.yaw = a.aimYaw = a.sparring.faceYaw;
    }
  }
  dispose() { this.removeAll(); }
}

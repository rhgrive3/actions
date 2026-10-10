// Practice Range session: everything the range adds on top of a normal (humans-only) match — its targets, the action
// pads, resets, travel, resupply and the training read-outs. Created by Match.setup for a range match only
// (install.mjs) and disposed with it: nothing here exists in a Turf War, a Boss Battle or an online room.
//
// Honesty rules: the session never touches weapon, damage, movement or paint rules. Targets are real Actors hit by the
// real weapon code; the read-outs listen to the game's own 'damage' / 'hit' / 'splatted' events and read actor state.
// The only training-specific rules are listed here and in the report: targets re-inflate in place 2 s after a splat
// (instead of the 5.5 s player respawn on a spawn pad), endurance targets never pop, resupply pads refill ink + special,
// the INK COURSE pad paints the swim course with your ink, and travel moves you to a zone's reference stand.
import * as THREE from 'three';
import { G, on, emit } from '../../../src/core/ctx.js';
import { PLAYER, WEAPONS, WEAPON_ORDER } from '../../../src/config.js';
import { Actor } from '../../../src/game/actor.js';
import { disposeInkVac } from '../../splatoon3/runtime/kit-ink-vac.mjs';
import { TargetDummyCharacter } from './dummy.mjs';
import { RangePads } from './pads.mjs';
import { RangeHud } from './hud.mjs';
import { L } from './strings.mjs';
import {
  GALLERY_TARGETS, DODGE_TARGET, DODGE_RAIL, DODGE_STAND, SPECIAL_TARGETS, SPECIAL_CENTER, CAROUSEL, CONSOLE, RESUPPLY_PADS, PAD_R, PAD_DWELL,
  TRAVEL, SWIM, PAINT_FLOOR, zoneAt, ZONES, FIRE_Z, WALL_FACE_Z,
} from '../stage/zones.mjs';

export const REINFLATE_TIME = 2.0;       // s from a splat to the target standing again (training rule, not a player rule)
export const COMBO_GAP = 1.5;            // s without damage that starts a new combo on a target
const ENDURANCE_HP = 1e9;                 // endurance targets: HP that cannot run out (they report damage, never pop)
const _v = new THREE.Vector3();

const noop = () => {};
const HEADLESS_HUD = { toast: noop, padPrompt: noop, damageNumber: noop, welcome: noop, update: noop, dispose: noop };
const headlessPads = (defs) => ({ defs, update: noop, dispose: noop });

export class RangeSession {
  constructor(match, opts = {}) {
    this.m = match;
    this.headless = !!opts.headless;     // node tests: no meshes / DOM, same rules
    this.local = match.local;
    this.time = 0;
    this.targets = [];
    this.movingTargets = true;
    this.log = [];                         // last damage events (for the HUD + tests)
    this.last = null;                      // { target, amount, dist, t }
    this._buildTargets();
    this.pads = this.headless ? headlessPads(this._padDefs()) : new RangePads(G.scene, this._padDefs());
    this.hud = this.headless ? HEADLESS_HUD : new RangeHud(this);
    this.unsubs = [];   // ('damage' / 'splatted' arrive through install.mjs → onDamage / onSplatted)
    this._tp = 0;
  }

  // ------------------------------------------------------------------ targets
  _buildTargets() {
    const defs = [
      ...GALLERY_TARGETS.map((t) => ({ kind: 'standard', x: t.x, z: t.z, face: [t.x, FIRE_Z], label: `${t.z} m`, zone: 'gallery', dist: t.z })),
      { kind: 'standard', x: DODGE_TARGET.x, z: DODGE_TARGET.z, face: DODGE_STAND, label: `${DODGE_TARGET.z - DODGE_STAND[1]} m`, zone: 'dualies' },
      { kind: 'rail', x: (DODGE_RAIL.x[0] + DODGE_RAIL.x[1]) / 2, z: DODGE_RAIL.z, face: DODGE_STAND, label: L('Rail target'), zone: 'dualies', span: (DODGE_RAIL.x[1] - DODGE_RAIL.x[0]) / 2 },
      ...SPECIAL_TARGETS.map((t) => ({ kind: 'endurance', x: t.x, z: t.z, face: SPECIAL_CENTER, label: `r ${Math.round(t.r * 10) / 10} m`, zone: 'special' })),
    ];
    defs.forEach((d, i) => {
      const name = d.kind === 'endurance' ? `${L('Endurance target')} ${d.label}` : d.kind === 'rail' ? d.label : `${L('Target')} ${d.label}`;
      const a = new Actor({ team: 1, slot: i, weapon: 'shooter', isLocal: false, isBot: false, name, style: null, CharacterClass: TargetDummyCharacter });
      a.rangeTarget = { ...d, index: i, yaw: Math.atan2(d.face[0] - d.x, d.face[1] - d.z), phase: 0, combo: null, deaths: 0, hidden: false };
      // a popped target re-inflates where it stood (the engine would send it to Bravo's spawn pad)
      a.respawn = () => this._reinflate(a);
      a.character.actor = a;
      G.scene.add(a.character.root);
      this.m.actors.push(a);
      this._place(a, true);
      this.targets.push(a);
    });
  }
  _place(a, fresh) {
    const t = a.rangeTarget;
    if (fresh) {
      a.spawnAt(_v.set(t.x, 0.3, t.z), t.yaw);
      a.invuln = 0;
    }
    if (t.kind === 'endurance') a.hp = ENDURANCE_HP;
    t.phase = 0;
  }
  _reinflate(a) {
    const t = a.rangeTarget;
    a.spawnAt(_v.set(t.x, 0.3, t.z), t.yaw);
    a.invuln = 0;                                    // no spawn shield on a target
    a.character.trigger('spawn');
    if (t.kind === 'endurance') a.hp = ENDURANCE_HP;
    // the finished combo stays readable on the card ("SPLAT IN n · t s") until the next hit starts a new one
    t.phase = 0;
    G.audio?.play?.('respawn', { pos: a.pos, volume: 0.35 });
    emit('respawn', { actor: a });
  }
  resetTargets() {
    for (const a of this.targets) {
      if (!a.alive) a.respawnTimer = 0;
      this._reinflate(a);
      a.rangeTarget.combo = null; a.rangeTarget.deaths = 0;
    }
    this.last = null; this.log.length = 0;
    this.hud.toast(L('Targets reset'));
  }

  onDamage({ victim, attacker, amount, source }) {
    const t = victim && victim.rangeTarget;
    if (!t || !this.targets.includes(victim) || !(amount > 0)) return;
    const now = this.time;
    if (!t.combo || now - t.combo.tLast > COMBO_GAP || t.combo.done) t.combo = { total: 0, hits: 0, t0: now, tLast: now, done: false, splatT: null };
    t.combo.total += amount; t.combo.hits++; t.combo.tLast = now;
    const dist = attacker ? Math.hypot(attacker.pos.x - victim.pos.x, attacker.pos.z - victim.pos.z) : null;
    this.last = { target: victim, amount, dist, t: now, source, weapon: attacker?.weaponId || null };
    this.log.push({ t: now, target: t.index, amount, dist, source, weapon: attacker?.weaponId || null });
    if (this.log.length > 64) this.log.shift();
    this.hud.damageNumber(victim, amount, false);
  }
  onSplatted({ victim }) {
    const t = victim && victim.rangeTarget;
    if (!t || !this.targets.includes(victim)) return;
    t.deaths++;
    if (t.combo) { t.combo.done = true; t.combo.splatT = this.time - t.combo.t0; }
    victim.respawnTimer = REINFLATE_TIME;
    this.hud.damageNumber(victim, 0, true);
  }

  // ------------------------------------------------------------------ pads
  _padDefs() {
    const defs = [];
    WEAPON_ORDER.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / WEAPON_ORDER.length) * Math.PI * 2;
      defs.push({ id: 'weapon:' + id, kind: 'weapon', weapon: id, x: CAROUSEL.center[0] + Math.cos(a) * CAROUSEL.r, z: CAROUSEL.center[1] + Math.sin(a) * CAROUSEL.r, color: '#35405a' });
    });
    for (const c of CONSOLE) defs.push({ id: c.id, kind: c.id, x: c.pos[0], z: c.pos[1], color: c.color });
    RESUPPLY_PADS.forEach(([x, z], i) => defs.push({ id: 'resupply:' + i, kind: 'resupply', x, z, color: '#a9822a' }));
    return defs;
  }
  _updatePads(dt) {
    const a = this.local;
    let on = null;
    if (a && a.alive && !a.superJumpState) {
      for (const p of this.pads.defs) {
        const dx = a.pos.x - p.x, dz = a.pos.z - p.z;
        if (dx * dx + dz * dz < PAD_R * PAD_R && Math.abs(a.pos.y - (G.level.groundHeight(p.x, p.z) || 0)) < 0.7) { on = p; break; }
      }
    }
    if (on !== this.padOn) { this.padOn = on; this.padT = 0; this.padFired = false; }
    let k = 0;
    if (on && !this.padFired && !this._padIdle(on)) {
      this.padT += dt; k = Math.min(1, this.padT / PAD_DWELL);
      if (k >= 1) { this.padFired = true; this.activate(on); }
    }
    this.pads.update(dt, on, k, this.local?.weaponId);
    this.hud.padPrompt(on && !this.padFired && !this._padIdle(on) ? on : null, k);
  }
  _padIdle(p) { return p.kind === 'weapon' && p.weapon === this.local?.weaponId; }

  activate(p) {
    if (p.kind === 'weapon') this.setWeapon(p.weapon);
    else if (p.kind === 'resetPaint') this.resetPaint();
    else if (p.kind === 'resetDummies') this.resetTargets();
    else if (p.kind === 'inkCourse') this.inkCourse();
    else if (p.kind === 'resupply') this.resupply();
    G.audio?.play?.('ui_confirm', { volume: 0.55 });
  }

  // ------------------------------------------------------------------ actions
  setWeapon(id) {
    const a = this.local;
    if (!a || !WEAPONS[id] || a.weaponId === id) return;
    const previousWeapon = a.weaponId;
    try { a.setWeapon(id); }
    finally {
      // A downstream setter can throw after the new loadout was committed.
      // Retire the old input owner whenever the requested change actually landed.
      if (a.weaponId === id && a.weaponId !== previousWeapon) disposeInkVac(a);
    }
    // a weapon switch starts from a full tank and an empty special gauge, as if you had just picked it up
    a.ink = PLAYER.inkMax; a.special = 0;
    G.game?.api?.setLoadout?.({ weapon: id });
    this.hud.toast(L('Now using {name}', { name: WEAPONS[id].name }));
  }
  resetPaint() {
    G.paint.clear();
    G.projectiles.clear?.();
    if (this.local) this.local.stats.turf = 0;
    const h = G.hud; if (h) { h._turfAcc = 0; h._turfTotal = 0; h._turfShown = 0; if (h.turfNum) h.turfNum.textContent = '0'; }
    this.hud.toast(L('Paint reset'));
  }
  resupply() {
    const a = this.local;
    if (!a) return;
    a.ink = PLAYER.inkMax;
    if (!a.specialActive && a.special < a.specialCost()) { a.special = a.specialCost(); emit('special:ready', { actor: a }); }
    this.hud.toast(L('Ink and special refilled'));
  }
  // Paint the swim course's floor with your ink (real splats through the paint system, none credited as turf or
  // special charge). The planted island is not inkable, so the loop is exactly what gets painted.
  inkCourse() {
    const a = this.local;
    if (!a) return;
    const [x0, x1, z0, z1] = ZONES.squid.rect;
    const inside = (r, x, z, m = 0.3) => x > r.x[0] - m && x < r.x[1] + m && z > r.z[0] - m && z < r.z[1] + m;
    for (let x = x0 + 0.5; x < x1; x += 1.1) for (let z = z0 + 0.5; z < z1; z += 1.1) {
      if (inside(SWIM.island, x, z) || SWIM.kerbs.some((k) => inside(k, x, z))) continue;   // planted, not inkable
      const y = G.level.groundHeight(x, z, 5);
      if (!Number.isFinite(y) || y > SWIM.plateau.h + 0.05) continue;
      G.paint.splat(_v.set(x, y + 0.25, z), 0.95, a.team, { seed: (x * 7.3 + z * 3.1) % 1, kind: 'blast' });
    }
    this.hud.toast(L('Swim course inked'));
  }
  travel(id) {
    const tp = TRAVEL.find((t) => t.id === id);
    const a = this.local;
    if (!tp || !a || !a.alive) return;
    a.superJumpState = null;
    a.pos.set(tp.pos[0], tp.pos[1] + 0.05, tp.pos[2]);
    a.vel.set(0, 0, 0);
    a.yaw = a.aimYaw = tp.yaw; a.aimPitch = 0;
    a.grounded = false; a.climbing = false; a.form = 'kid';
    a.netTp = (a.netTp || 0) + 1;
    a.character.root.position.copy(a.pos);
    if (G.rig) { G.rig.yaw = tp.yaw; G.rig.pitch = -0.12; G.rig.follow(a, true); }
    if (this.m.controller) { this.m.controller.yaw = tp.yaw; }
    this.hud.toast(id === 'spawn' ? L('Back to the start') : L(ZONES[tp.zone].name));
  }
  setMovingTargets(on) { this.movingTargets = !!on; }

  // ------------------------------------------------------------------ per tick (60 Hz, after the match update)
  update(dt) {
    this.time += dt;
    for (const a of this.targets) {
      const t = a.rangeTarget;
      if (!a.alive) continue;
      if (t.kind === 'rail') {
        // rail target: x(t) = cx + A·sin(ωt), peak speed = the CURRENT player run speed (PLAYER.runSpeed, read live)
        if (this.movingTargets) t.phase += dt;
        const A = t.span, v = PLAYER.runSpeed, w = v / A;
        const x = t.x + A * Math.sin(w * t.phase);
        a.pos.x = x; a.pos.z = t.z;
        a.vel.x = this.movingTargets ? A * w * Math.cos(w * t.phase) : 0; a.vel.z = 0;
      } else {
        a.pos.x = t.x; a.pos.z = t.z; a.vel.x = 0; a.vel.z = 0;
      }
      a.yaw = a.aimYaw = t.yaw; a.yawVel = 0;
      if (t.kind === 'endurance') a.hp = ENDURANCE_HP;
      a.character.root.position.set(a.pos.x, a.pos.y + (a.smoothY || 0), a.pos.z);
      a.character.root.rotation.y = t.yaw;
    }
    this._updatePads(dt);
    // keyboard shortcuts (range only): R reset paint, T reset targets, G back to the start
    const inp = G.input;
    if (inp && !G.menus?.current && this.m.state === 'playing') {
      if (inp.wasPressed?.('KeyR')) this.resetPaint();
      if (inp.wasPressed?.('KeyT')) this.resetTargets();
      if (inp.wasPressed?.('KeyG')) this.travel('spawn');
    }
  }

  // ------------------------------------------------------------------ read-outs
  telemetry() {
    const a = this.local;
    if (!a) return null;
    const hs = Math.hypot(a.vel.x, a.vel.z);
    const zone = zoneAt(a.pos.x, a.pos.z);
    let measure = null;
    if (zone === 'lane' || zone === 'gallery' || (zone === 'hub' && a.pos.z > -3)) measure = { kind: 'downrange', value: a.pos.z - FIRE_Z };
    else if (zone === 'wall') measure = { kind: 'wall', value: WALL_FACE_Z - a.pos.z };
    return { speed: hs, vy: a.vel.y, zone, measure, weapon: a.weaponId, form: a.anim?.form || a.form };
  }
  // painted area of the 400 m² paint-test floor (CPU turf grid cells of its top face, your team)
  paintStats() {
    const P = G.paint, L0 = G.level;
    if (!P || !L0) return null;
    if (!this._paintFace) {
      this._paintFace = L0.faces.find((f) => f.turf && f.atlas && L0.blocks[f.block].tag === 'floor:paint') || null;
    }
    const f = this._paintFace;
    if (!f) return null;
    if (this._paintVer === P.version && this._paintStat) return this._paintStat;
    let own = 0, enemy = 0, n = 0;
    const team = (this.local?.team ?? 0) + 1;
    for (let k = f.grid, e = f.grid + f.nu * f.nv; k < e; k++) {
      if (P.dead[k]) continue;
      n++;
      const g = P.grid[k];
      if (g === team) own++; else if (g) enemy++;
    }
    const cellArea = f.cu * f.cv;
    const total = (PAINT_FLOOR.x[1] - PAINT_FLOOR.x[0]) * (PAINT_FLOOR.z[1] - PAINT_FLOOR.z[0]);
    this._paintStat = { own: own * cellArea, enemy: enemy * cellArea, area: n * cellArea, total };
    this._paintVer = P.version;
    return this._paintStat;
  }

  presentStart() {
    const game = G.game, a = this.local;
    if (!game) return;
    if (a && game.rig) { game.rig.follow(a, true); game.rig.yaw = a.yaw; game.rig.pitch = -0.12; }
    game.hud?.setVisible(true);
    game.hud?.el?.classList.add('iw-hud--range');
    game.hud?.overLayer?.classList.add('iw-hud--range');
    game._playMusic?.('menu');
    this.hud.welcome();
  }
  updateHud(dt) { this.hud.update(dt); }

  dispose() {
    this.unsubs.forEach((u) => u());
    this.pads.dispose();
    this.hud.dispose();
    G.hud?.el?.classList.remove('iw-hud--range');
    G.hud?.overLayer?.classList.remove('iw-hud--range');
    this.targets.length = 0;
  }
}

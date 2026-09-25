import * as THREE from "three";
import { Player } from "../entities/Player";
import { World, RayHit } from "../physics/World";
import { InkSystem } from "../ink/InkSystem";
import { NavGrid, NavNode } from "./NavGrid";
import { StageInfo } from "../stage/ScorchGorge";

export type BotObjective = "PAINT" | "ATTACK" | "RETREAT" | "HOLD" | "FLANK";

export interface Difficulty { reaction: number; aimError: number; trackGain: number; prediction: number; burst: number; }
export const DIFFICULTIES: Record<string, Difficulty> = {
  easy: { reaction: 0.55, aimError: 0.14, trackGain: 4, prediction: 0.3, burst: 0.4 },
  normal: { reaction: 0.32, aimError: 0.075, trackGain: 7, prediction: 0.6, burst: 0.65 },
  hard: { reaction: 0.18, aimError: 0.04, trackGain: 11, prediction: 0.85, burst: 0.85 },
};

const _hit: RayHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null!, face: 0 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _goal = new THREE.Vector3();
const cov = [0, 0, 0, 0];

interface Memory { target: Player | null; lastSeen: THREE.Vector3; lastSeenTime: number; seenSince: number }

export class Bot {
  objective: BotObjective = "PAINT";
  path: NavNode[] = [];
  pathIdx = 0;
  goal = new THREE.Vector3();
  goalTime = 0;
  thinkTimer: number;
  repathTimer = 0;
  mem: Memory = { target: null, lastSeen: new THREE.Vector3(), lastSeenTime: -99, seenSince: 0 };
  aimYaw: number; aimPitch = 0;
  aimErr = new THREE.Vector2();
  errTimer = 0;
  fireTimer = 0; burstTimer = 0;
  tapTimer = 0; // roller flick tap
  chargeTarget = 1;
  stuckTimer = 0; lastPos = new THREE.Vector3();
  strafeDir = 1; strafeTimer = 0;
  diff: Difficulty;
  role: "shooter" | "roller" | "charger";
  paintFireTimer = 0;
  wantSwim = false;
  swimHold = 0;
  climbTimer = 0;

  constructor(public p: Player, private world: World, private ink: InkSystem, private nav: NavGrid, private stage: StageInfo, private players: Player[], diff: Difficulty, seed: number) {
    this.diff = diff; this.role = p.weapon.kind;
    this.thinkTimer = (seed % 7) * 0.05;
    this.aimYaw = p.spawnYaw;
  }

  private time = 0;

  update(dt: number, matchTimeLeft: number) {
    const p = this.p; this.time += dt;
    if (!p.alive) { this.path.length = 0; this.mem.target = null; p.input.fire = false; p.input.swim = false; return; }
    const inp = p.input;
    this.perceive(dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.thinkTimer = 0.25 + Math.random() * 0.15; this.decide(matchTimeLeft); }
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || (this.path.length && this.pathIdx >= this.path.length)) { this.repathTimer = 0.9 + Math.random() * 0.5; this.nav.findPath(p.pos, this.goal, p.team, this.path); this.pathIdx = 0; }
    // stuck detection
    if (p.pos.distanceToSquared(this.lastPos) < 0.05 && (inp.moveX || inp.moveY)) this.stuckTimer += dt; else this.stuckTimer = 0;
    this.lastPos.copy(p.pos);
    if (this.stuckTimer > 1.2) { this.stuckTimer = 0; this.repathTimer = 0; inp.jump = !inp.jump; this.pickPaintGoal(true); }

    // ---- steering
    let mx = 0, my = 0;
    const target = this.mem.target;
    const engaging = this.objective === "ATTACK" && target && target.alive;
    let dirX = 0, dirZ = 0;
    if (this.path.length && this.pathIdx < this.path.length) {
      const n = this.path[this.pathIdx];
      const dx = n.x - p.pos.x, dz = n.z - p.pos.z; const d = Math.hypot(dx, dz);
      if (d < 1.1 || (d < 1.8 && this.pathIdx < this.path.length - 1)) this.pathIdx++;
      if (d > 1e-3) { dirX = dx / d; dirZ = dz / d; }
      // climbing edge: paint the wall and swim into it
      const prev = this.pathIdx > 0 ? this.path[this.pathIdx - 1] : this.nav.nearest(p.pos);
      if (prev && n.y - p.pos.y > 0.8 && this.nav.isClimbEdge(prev, n)) this.climbTimer = 0.6; else this.climbTimer = Math.max(0, this.climbTimer - dt);
    } else {
      const dx = this.goal.x - p.pos.x, dz = this.goal.z - p.pos.z; const d = Math.hypot(dx, dz);
      if (d > 1.5) { dirX = dx / d; dirZ = dz / d; }
    }
    if (engaging && target) {
      const dist = target.pos.distanceTo(p.pos);
      const ideal = this.role === "charger" ? p.weapon.range * 0.85 : this.role === "roller" ? 1.5 : p.weapon.range * 0.7;
      const tx = target.pos.x - p.pos.x, tz = target.pos.z - p.pos.z; const td = Math.max(0.01, Math.hypot(tx, tz));
      const toward = dist > ideal ? 1 : dist < ideal * 0.6 ? -0.7 : 0;
      this.strafeTimer -= dt; if (this.strafeTimer <= 0) { this.strafeTimer = 0.6 + Math.random(); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      const perpX = -tz / td, perpZ = tx / td;
      dirX = (tx / td) * toward + perpX * this.strafeDir * 0.8; dirZ = (tz / td) * toward + perpZ * this.strafeDir * 0.8;
      if (this.role === "roller" && this.mem.seenSince > 0.1) { dirX = tx / td; dirZ = tz / td; }
      if (this.role === "charger" && dist < 5) { dirX = -tx / td; dirZ = -tz / td; }
    }
    // camera-relative → convert desired world dir into stick relative to aimYaw
    const cy = Math.cos(this.aimYaw), sy = Math.sin(this.aimYaw);
    mx = dirX * cy - dirZ * sy; my = -(dirX * sy + dirZ * cy);
    inp.moveX = mx; inp.moveY = my;

    // ---- aim
    const desiredYaw = engaging && target ? this.aimAtTarget(target, dt) : this.aimAlongPath(dirX, dirZ, dt);
    let dy = desiredYaw - this.aimYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const gain = engaging ? this.diff.trackGain : 6;
    this.aimYaw += dy * Math.min(1, gain * dt);
    inp.aimYaw = this.aimYaw; inp.aimPitch = this.aimPitch;

    // ---- swim / weapon
    const onOwn = p.onOwnInk;
    const moving = Math.hypot(mx, my) > 0.1;
    const needInk = p.ink < 30;
    const wantsSwim = (!engaging || needInk || this.objective === "RETREAT") && onOwn && moving && this.climbTimer <= 0 && p.wr.rollerPhase === "idle" && !(this.role === "charger" && p.wr.charge > 0.3);
    inp.swim = wantsSwim || (needInk && onOwn && !engaging);
    if (this.climbTimer > 0) inp.swim = true;
    // hop over obstacles / jump when enemy ink ahead
    inp.jump = false;
    if (this.stuckTimer > 0.6 && p.grounded) inp.jump = true;
    if (engaging && this.role === "shooter" && Math.random() < 0.004) inp.jump = true;
    this.updateWeapon(dt, engaging ? target : null, dirX, dirZ);
  }

  private perceive(dt: number) {
    const p = this.p; const m = this.mem;
    let best: Player | null = null, bd = Infinity;
    const eye = _a.set(p.pos.x, p.pos.y + 1.2, p.pos.z);
    for (const o of this.players) {
      if (o.team === p.team || !o.alive) continue;
      const d = o.pos.distanceTo(p.pos);
      if (d > 34) continue;
      // submerged squids on their own ink are hard to notice beyond 7 m
      if (o.squid && o.onOwnInk && d > 7 && o.moveSpeedNow < 4) continue;
      _b.set(o.pos.x, o.centerY, o.pos.z);
      if (!this.world.lineOfSight(eye, _b, _hit)) continue;
      const score = d * (o === m.target ? 0.7 : 1);
      if (score < bd) { bd = score; best = o; }
    }
    if (best) {
      if (m.target !== best) { m.target = best; m.seenSince = -this.diff.reaction; }
      m.seenSince += dt; m.lastSeen.copy(best.pos); m.lastSeenTime = this.time;
    } else if (m.target) {
      m.seenSince = Math.min(m.seenSince, 0);
      if (this.time - m.lastSeenTime > 3.0 || !m.target.alive) m.target = null;
    }
  }

  private decide(timeLeft: number) {
    const p = this.p; const m = this.mem;
    const target = m.target;
    const visible = target && this.time - m.lastSeenTime < 0.3;
    const health = p.health / 100;
    const endgame = timeLeft < 35;
    // utilities
    let uAttack = 0, uPaint = 0.4, uRetreat = 0, uHold = 0;
    if (target && target.alive) {
      const d = target.pos.distanceTo(p.pos);
      const inRange = d < p.weapon.range * (this.role === "roller" ? 1.6 : 1.4);
      uAttack = (visible ? 0.7 : 0.35) * (inRange ? 1 : 0.55) * (0.5 + health * 0.5) * (p.ink > 15 ? 1 : 0.4);
      if (this.role === "roller" && d < 9) uAttack += 0.2;
      if (this.role === "charger" && d > 6 && d < p.weapon.range) uAttack += 0.25;
    }
    this.ink.areaCoverage(p.pos.x, p.pos.z, 6, cov);
    uPaint += cov[2] * 0.4 + cov[1 - p.team] * 0.5 + (endgame ? 0.5 : 0);
    if (health < 0.4 || p.ink < 10) uRetreat = 0.85 - health * 0.5;
    if (this.role === "charger") uHold = 0.55;
    const best = Math.max(uAttack, uPaint, uRetreat, uHold);
    const prev = this.objective;
    this.objective = best === uAttack ? "ATTACK" : best === uRetreat ? "RETREAT" : best === uHold ? "HOLD" : "PAINT";
    if (this.objective === "ATTACK" && target) {
      _goal.copy(visible ? target.pos : m.lastSeen);
      if (this.role === "charger") { this.pickPerch(); } else { this.goal.copy(_goal); }
      this.repathTimer = Math.min(this.repathTimer, 0.3);
    } else if (this.objective === "RETREAT") {
      // back toward own spawn side onto own ink
      const sign = p.team === 0 ? -1 : 1;
      this.goal.set(p.pos.x * 0.5, 0, p.pos.z + sign * 16);
      this.clampToStage(this.goal);
      this.repathTimer = 0;
    } else if (this.objective === "HOLD") {
      this.pickPerch();
    } else if (prev !== "PAINT" || this.time > this.goalTime || p.pos.distanceTo(this.goal) < 3) {
      this.pickPaintGoal(false);
    }
  }

  private pickPerch() {
    const p = this.p; const sign = p.team === 0 ? -1 : 1;
    // team-side perch or high right ledge; pick the one with least enemy ink nearby / nearest
    const candidates = [new THREE.Vector3(0, 6.5, 25 * sign), new THREE.Vector3(-21 * sign, 5, 24 * sign), new THREE.Vector3(0, 4.5, 2 * sign)];
    let best = candidates[0], bs = -Infinity;
    for (const c of candidates) { this.ink.areaCoverage(c.x, c.z, 5, cov); const s = -c.distanceTo(p.pos) * 0.05 - cov[1 - p.team] * 2 + Math.random() * 0.3; if (s > bs) { bs = s; best = c; } }
    this.goal.copy(best); this.goalTime = this.time + 8;
  }

  private pickPaintGoal(random: boolean) {
    const p = this.p;
    const sign = p.team === 0 ? 1 : -1; // forward direction toward enemy
    let best: THREE.Vector3 | null = null, bs = -Infinity;
    for (const pt of this.stage.paintPoints) {
      this.ink.areaCoverage(pt.x, pt.z, 6, cov);
      const d = pt.distanceTo(p.pos);
      const forward = (pt.z - p.pos.z) * sign;
      let s = cov[2] * 1.2 + cov[1 - p.team] * 1.5 - d * 0.03 + forward * 0.01 + Math.random() * (random ? 1.5 : 0.5);
      if (this.role === "roller" && Math.abs(pt.x) > 12) s += 0.5; // rollers prefer flanks
      if (this.role === "shooter" && Math.abs(pt.x) < 12) s += 0.3;
      if (d < 4) s -= 1;
      if (s > bs) { bs = s; best = pt; }
    }
    if (best) { this.goal.set(best.x + (Math.random() - 0.5) * 4, 0, best.z + (Math.random() - 0.5) * 4); this.clampToStage(this.goal); }
    this.goalTime = this.time + 6 + Math.random() * 4;
    this.repathTimer = 0;
  }

  private clampToStage(v: THREE.Vector3) { v.x = THREE.MathUtils.clamp(v.x, -25, 25); v.z = THREE.MathUtils.clamp(v.z, -45, 45); }

  private aimAlongPath(dirX: number, dirZ: number, dt: number): number {
    this.aimPitch += (-0.25 - this.aimPitch) * Math.min(1, 4 * dt); // look slightly down when painting
    if (this.climbTimer > 0) this.aimPitch = 0.5;
    if (Math.abs(dirX) + Math.abs(dirZ) < 0.05) return this.aimYaw;
    return Math.atan2(-dirX, -dirZ);
  }

  private aimAtTarget(t: Player, dt: number): number {
    const p = this.p;
    // prediction with lead + bounded random error that decays while tracking
    this.errTimer -= dt;
    if (this.errTimer <= 0) { this.errTimer = 0.25 + Math.random() * 0.3; const e = this.diff.aimError * (1 + Math.max(0, 1 - this.mem.seenSince) * 2); this.aimErr.set((Math.random() - 0.5) * 2 * e, (Math.random() - 0.5) * 2 * e); }
    const dist = t.pos.distanceTo(p.pos);
    const lead = this.role === "charger" ? 0.05 : Math.min(0.5, dist / 24) * this.diff.prediction;
    _b.set(t.pos.x + t.vel.x * lead, t.centerY + (this.role === "charger" ? 0.1 : 0), t.pos.z + t.vel.z * lead);
    const dx = _b.x - p.pos.x, dz = _b.z - p.pos.z, dy = _b.y - (p.pos.y + 1.2);
    const yaw = Math.atan2(-dx, -dz) + this.aimErr.x;
    const horiz = Math.hypot(dx, dz);
    let pitch = Math.atan2(dy, horiz) + this.aimErr.y;
    // arc compensation for shooter drop at range
    if (this.role === "shooter") pitch += Math.max(0, dist - 6) * 0.012;
    if (this.role === "roller") pitch = Math.max(pitch, -0.1);
    this.aimPitch += (pitch - this.aimPitch) * Math.min(1, this.diff.trackGain * dt);
    return yaw;
  }

  private updateWeapon(dt: number, target: Player | null, dirX: number, dirZ: number) {
    const p = this.p; const inp = p.input;
    const dist = target ? target.pos.distanceTo(p.pos) : Infinity;
    const canSee = target && this.mem.seenSince > 0;
    inp.altFire = false;
    this.paintFireTimer -= dt;
    if (this.role === "shooter") {
      this.burstTimer -= dt;
      if (canSee && dist < p.weapon.range * 1.15 && p.ink > 3) {
        if (this.burstTimer <= 0) { this.burstTimer = Math.random() < this.diff.burst ? -0.6 : 0.25; }
        inp.fire = this.burstTimer < 0 || this.burstTimer > 0.15; inp.swim = false;
      } else {
        // paint while moving on unpainted/enemy ink: shoot the ground ahead
        const ahead = this.ink.floorTeamAt(p.pos.x + dirX * 2.5, p.pos.z + dirZ * 2.5);
        const paintNow = !p.onOwnInk || ahead !== p.team;
        inp.fire = paintNow && p.ink > 8 && (dirX !== 0 || dirZ !== 0) && !this.wantSwimFor(dt);
        if (inp.fire) inp.swim = false;
        if (this.climbTimer > 0) { inp.fire = true; inp.swim = p.ink < 5 ? false : (this.climbTimer < 0.35); }
      }
    } else if (this.role === "roller") {
      this.tapTimer -= dt;
      if (this.tapTimer > 0) { inp.fire = true; inp.swim = false; return; }
      if (canSee && dist < 3.2 && p.wr.rollerPhase === "idle" && p.ink > 10) { this.tapTimer = 0.06; inp.fire = true; inp.swim = false; return; }
      if (canSee && dist < 8.5 && dist > 3.2 && p.wr.rollerPhase === "idle" && p.ink > 12 && Math.random() < 0.05) { inp.altFire = true; inp.fire = true; inp.swim = false; return; }
      if (p.wr.rollerPhase === "hflick_startup" || p.wr.rollerPhase === "vflick_startup") { inp.fire = false; return; }
      // roll when on non-own ink and moving (paint path); dash when chasing
      const ahead = this.ink.floorTeamAt(p.pos.x + dirX * 2.0, p.pos.z + dirZ * 2.0);
      const roll = (ahead !== p.team || (canSee && dist < 12)) && p.ink > 6 && (dirX !== 0 || dirZ !== 0) && this.climbTimer <= 0;
      if (roll) { inp.fire = true; inp.swim = false; }
      else inp.fire = false;
      if (this.climbTimer > 0 && p.wr.rollerPhase === "idle" && p.ink > 12) { inp.altFire = true; inp.fire = true; inp.swim = false; }
    } else {
      // charger: charge when target visible in range; release at target charge. When idle, paint lines toward mid.
      if (canSee && dist < p.weapon.range * 1.05 && p.ink > 5) {
        if (!p.wr.charging) this.chargeTarget = dist < 5 ? 0.45 : 1;
        inp.swim = false;
        inp.fire = p.wr.charge < this.chargeTarget - 0.001 || p.wr.cooldown > 0;
        if (p.wr.charge >= this.chargeTarget - 0.001 && this.mem.seenSince > this.diff.reaction * 0.5) inp.fire = false;
      } else if (this.paintFireTimer <= 0 && p.ink > 20 && !p.squid && Math.random() < 0.02) {
        this.chargeTarget = 0.6; this.paintFireTimer = 2.5; inp.fire = true; inp.swim = false;
      } else if (p.wr.charging) {
        inp.fire = p.wr.charge < this.chargeTarget; inp.swim = false;
      } else inp.fire = false;
      if (this.climbTimer > 0) { inp.fire = p.wr.charge < 0.3; inp.swim = p.wr.charge >= 0.3 || p.ink < 5; }
    }
  }

  private wantSwimFor(dt: number) {
    // when ink low or path is long on own ink, prefer swimming over painting
    void dt;
    return this.p.ink < 25 && this.p.onOwnInk;
  }
}

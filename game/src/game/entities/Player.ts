import * as THREE from "three";
import { World, Box } from "../physics/World";
import { InkSystem } from "../ink/InkSystem";
import { CHARACTER, MOVEMENT, HEALTH, INK_TANK, FIXED_DT } from "../data/tuning";
import { WeaponDefinition } from "../data/weapons";

export type MoveState =
  | "HUMANOID_IDLE" | "HUMANOID_MOVE" | "HUMANOID_AIR" | "SWIM_ENTER" | "SWIM" | "SWIM_FAST" | "SWIM_WALL" | "SQUID_ROLL"
  | "JUMP" | "FALL" | "LAND" | "SPLATTED" | "RESPAWN";

export interface PlayerInput {
  moveX: number; // -1..1 (right)
  moveY: number; // -1..1 (forward)
  aimYaw: number; // radians
  aimPitch: number; // radians (+ = up)
  fire: boolean;
  swim: boolean;
  jump: boolean;
  altFire: boolean; // roller vertical flick / (reserved)
}

export interface WeaponRuntime {
  cooldown: number;
  refillDelay: number;
  spread: number;
  charge: number; // 0..1
  charging: boolean;
  storedCharge: number;
  storedTimer: number;
  rollerPhase: "idle" | "roll" | "hflick_startup" | "hflick_recover" | "vflick_startup" | "vflick_recover";
  rollerTimer: number;
  rollDashTime: number;
  rollDistanceAcc: number;
  firingAnim: number; // recoil anim decay
  lastFireTime: number;
  shotCount: number;
}

export interface GameEvents {
  onSplat(victim: Player, killer: Player | null): void;
  onDamage(victim: Player, amount: number, from: Player | null): void;
  onStateChange(p: Player, from: MoveState, to: MoveState): void;
  onLand(p: Player, fallSpeed: number): void;
  onSwimToggle(p: Player, squid: boolean): void;
  onJump(p: Player): void;
}

let nextId = 0;
const _res = { hitX: false, hitZ: false, grounded: false, hitHead: false, wallNormal: new THREE.Vector3(), wallBox: null as Box | null, groundBox: null as Box | null };
const _dir = new THREE.Vector3();
const _pt = new THREE.Vector3();

export class Player {
  id = nextId++;
  name: string;
  team: number;
  isHuman: boolean;
  weapon: WeaponDefinition;
  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  vel = new THREE.Vector3();
  bodyYaw = 0;
  aimYaw = 0;
  aimPitch = 0;
  state: MoveState = "HUMANOID_IDLE";
  stateTime = 0;
  grounded = false;
  groundBox: Box | null = null;
  groundTeam = -1; // ink under feet: -1 none, 0/1 team
  onOwnInk = false;
  onEnemyInk = false;
  squid = false;
  squidBlend = 0; // visual morph 0=human 1=squid
  wallNormal = new THREE.Vector3();
  health = HEALTH.max;
  damageTimer = 0; // time since last damage
  enemyInkDamageAcc = 0;
  ink = INK_TANK.max;
  alive = true;
  respawnTimer = 0;
  splatTimer = 0;
  kills = 0; deaths = 0; assists = 0; paintedPoints = 0;
  lastHitBy: Player | null = null;
  lastHitTime = 0;
  invulnerable = 0;
  jumpBuffer = 0; coyote = 0;
  landSquash = 0;
  input: PlayerInput = { moveX: 0, moveY: 0, aimYaw: 0, aimPitch: 0, fire: false, swim: false, jump: false, altFire: false };
  prevJump = false;
  wr: WeaponRuntime = {
    cooldown: 0, refillDelay: 0, spread: 0, charge: 0, charging: false, storedCharge: 0, storedTimer: 0,
    rollerPhase: "idle", rollerTimer: 0, rollDashTime: 0, rollDistanceAcc: 0, firingAnim: 0, lastFireTime: -9, shotCount: 0,
  };
  speedFactor = 1; // set by weapon system (firing/charging/rolling)
  lockMovement = false; // roller flick startup etc.
  moveSpeedNow = 0;
  rollAxisTime = 0;
  spawnPoint = new THREE.Vector3();
  spawnYaw = 0;
  /** For the human player the camera rig writes the camera position here so shots resolve against the reticle. */
  aimOrigin: THREE.Vector3 | null = null;
  flowAura = 0; // Ver 11.0.0+: consecutive splats within a short period grant a temporary aura
  recentSplats: number[] = [];
  time = 0;

  constructor(name: string, team: number, isHuman: boolean, weapon: WeaponDefinition) {
    this.name = name; this.team = team; this.isHuman = isHuman; this.weapon = weapon;
  }

  get height() { return this.squid ? CHARACTER.swimHeight : CHARACTER.height; }
  get radius() { return this.squid ? CHARACTER.swimRadius : CHARACTER.radius; }
  get eyePos() { return _pt.set(this.pos.x, this.pos.y + (this.squid ? 0.4 : CHARACTER.eyeHeight), this.pos.z); }
  get centerY() { return this.pos.y + this.height * 0.5; }

  setState(s: MoveState, ev: GameEvents) {
    if (s === this.state) return;
    const from = this.state;
    this.state = s; this.stateTime = 0;
    ev.onStateChange(this, from, s);
  }

  respawn(ev: GameEvents) {
    this.pos.copy(this.spawnPoint); this.prevPos.copy(this.pos); this.vel.set(0, 0, 0);
    this.health = HEALTH.max; this.ink = INK_TANK.max; this.alive = true; this.squid = false; this.squidBlend = 0;
    this.aimYaw = this.spawnYaw; this.bodyYaw = this.spawnYaw; this.aimPitch = 0;
    this.input.aimYaw = this.spawnYaw; this.input.aimPitch = 0;
    this.wr.charge = 0; this.wr.charging = false; this.wr.storedCharge = 0; this.wr.rollerPhase = "idle"; this.wr.cooldown = 0;
    this.enemyInkDamageAcc = 0; this.invulnerable = 2.0; this.lastHitBy = null;
    this.setState("RESPAWN", ev);
  }

  takeDamage(amount: number, from: Player | null, ev: GameEvents) {
    if (!this.alive || this.invulnerable > 0) return;
    if (this.state === "SQUID_ROLL" && this.stateTime < MOVEMENT.squidRollArmorTime && amount < 100) amount *= 0.5;
    this.health -= amount;
    this.damageTimer = 0;
    if (from && from !== this) { this.lastHitBy = from; this.lastHitTime = this.time; }
    ev.onDamage(this, amount, from);
    if (this.health <= 0) this.splat(from, ev);
  }

  splat(killer: Player | null, ev: GameEvents) {
    if (!this.alive) return;
    this.alive = false; this.health = 0; this.deaths++;
    this.respawnTimer = HEALTH.respawnTime; this.splatTimer = HEALTH.splatAnimTime;
    this.vel.set(0, 0, 0); this.wr.charging = false; this.wr.charge = 0; this.wr.rollerPhase = "idle";
    const k = killer && killer !== this ? killer : (this.time - this.lastHitTime < 4 ? this.lastHitBy : null);
    if (k) {
      k.kills++;
      k.recentSplats.push(k.time);
      k.recentSplats = k.recentSplats.filter((t) => k.time - t < 8);
      if (k.recentSplats.length >= 2) k.flowAura = 10; // Flow Aura duration (short) — see docs/KNOWN_DIFFERENCES.md
    }
    this.setState("SPLATTED", ev);
    ev.onSplat(this, k);
  }

  /** Fixed-step update. */
  update(dt: number, world: World, ink: InkSystem, ev: GameEvents) {
    this.time += dt;
    this.stateTime += dt;
    this.prevPos.copy(this.pos);
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.flowAura > 0) this.flowAura -= dt;
    if (!this.alive) {
      this.splatTimer -= dt; this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(ev);
      return;
    }
    const inp = this.input;
    const wasSquid = this.squid;
    const canSwim = !this.lockMovement && this.wr.rollerPhase !== "hflick_startup" && this.wr.rollerPhase !== "vflick_startup";
    this.squid = inp.swim && canSwim;
    if (this.squid !== wasSquid) {
      ev.onSwimToggle(this, this.squid);
      if (!this.squid) {
        // stand up: ensure headroom
        if (!world.canStandAt(this.pos.x, this.pos.y, this.pos.z, CHARACTER.radius, CHARACTER.height)) this.squid = true;
      }
      if (this.squid && this.state !== "SWIM_WALL") this.setState("SWIM_ENTER", ev);
    }
    // visual morph
    const target = this.squid ? 1 : 0;
    const rate = dt / (this.squid ? MOVEMENT.swimEnterTime : MOVEMENT.swimExitTime);
    this.squidBlend += Math.sign(target - this.squidBlend) * Math.min(rate, Math.abs(target - this.squidBlend));

    // aim
    this.aimYaw = inp.aimYaw; this.aimPitch = inp.aimPitch;

    // ink under feet
    this.groundTeam = this.grounded ? ink.floorTeamAt(this.pos.x, this.pos.z) : -1;
    if (this.grounded && this.groundBox && !this.groundBox.paintFloor) this.groundTeam = -1;
    this.onOwnInk = this.groundTeam === this.team;
    this.onEnemyInk = this.groundTeam >= 0 && this.groundTeam !== this.team;

    // health regen
    this.damageTimer += dt;
    if (this.damageTimer > HEALTH.recoveryDelay && this.health < HEALTH.max) {
      this.health = Math.min(HEALTH.max, this.health + (this.squid && this.onOwnInk ? HEALTH.recoveryRateSquid : HEALTH.recoveryRateKid) * dt);
    }
    // enemy ink damage (capped)
    if (this.onEnemyInk && this.grounded) {
      const d = Math.min(MOVEMENT.enemyInkDamagePerSec * dt, Math.max(0, MOVEMENT.enemyInkDamageCap - this.enemyInkDamageAcc));
      if (d > 0 && this.health - d > 0.5) { this.health -= d; this.enemyInkDamageAcc += d; this.damageTimer = 0; }
    } else if (!this.onEnemyInk) this.enemyInkDamageAcc = Math.max(0, this.enemyInkDamageAcc - 30 * dt);

    // ink refill
    if (this.wr.refillDelay > 0) this.wr.refillDelay -= dt;
    else if (this.ink < INK_TANK.max) {
      const rate = this.squid && this.onOwnInk ? INK_TANK.max / INK_TANK.refillSquidTime : INK_TANK.max / INK_TANK.refillKidTime;
      this.ink = Math.min(INK_TANK.max, this.ink + rate * dt);
    }

    // --- movement input (camera relative)
    const cy = Math.cos(this.aimYaw), sy = Math.sin(this.aimYaw);
    let mx = inp.moveX, my = inp.moveY;
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) { mx /= mlen; my /= mlen; }
    if (this.lockMovement) { mx = 0; my = 0; }
    // forward = -Z rotated by yaw
    const wx = mx * cy - my * sy, wz = -mx * sy - my * cy;
    const wantMove = mlen > 0.08;

    // jump buffering / coyote
    const jumpPressed = inp.jump && !this.prevJump;
    this.prevJump = inp.jump;
    if (jumpPressed) this.jumpBuffer = 0.12;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.09 : Math.max(0, this.coyote - dt);

    // speed selection
    let maxSpeed: number, accel: number, decel: number;
    if (this.squid) {
      if (this.onOwnInk) { maxSpeed = MOVEMENT.swimSpeed; accel = MOVEMENT.swimAccel; decel = MOVEMENT.swimDecel; }
      else if (this.onEnemyInk) { maxSpeed = MOVEMENT.enemyInkSpeed; accel = 20; decel = 40; }
      else { maxSpeed = MOVEMENT.squidUnpaintedSpeed; accel = 24; decel = 40; }
    } else {
      maxSpeed = this.onEnemyInk ? MOVEMENT.enemyInkSpeed : MOVEMENT.runSpeed * this.speedFactor;
      accel = MOVEMENT.runAccel; decel = MOVEMENT.runDecel;
    }
    if (!this.grounded) { accel *= MOVEMENT.airControl; decel *= 0.25; maxSpeed = Math.max(maxSpeed, Math.hypot(this.vel.x, this.vel.z)); }
    // wall swim
    let wallSwimming = false;
    if (this.squid && this.state === "SWIM_WALL") {
      // remain on wall while pushing into it and it's still inked
      const pushing = wantMove && (wx * -this.wallNormal.x + wz * -this.wallNormal.z) > 0.2;
      if (pushing) {
        wallSwimming = true;
        this.vel.y = Math.min(this.vel.y + MOVEMENT.wallSwimAccel * dt, MOVEMENT.wallSwimSpeed);
        // lateral slide along wall
        const tx = -this.wallNormal.z, tz = this.wallNormal.x;
        const lat = wx * tx + wz * tz;
        this.vel.x = tx * lat * 3 - this.wallNormal.x * 0.5; this.vel.z = tz * lat * 3 - this.wallNormal.z * 0.5;
      } else {
        this.setState("FALL", ev);
        this.vel.x = this.wallNormal.x * MOVEMENT.wallDetachPush; this.vel.z = this.wallNormal.z * MOVEMENT.wallDetachPush;
      }
    }
    if (!wallSwimming) {
      // horizontal acceleration model
      const tvx = wx * maxSpeed, tvz = wz * maxSpeed;
      const dvx = tvx - this.vel.x, dvz = tvz - this.vel.z;
      const dlen = Math.hypot(dvx, dvz);
      const a = wantMove ? accel : decel;
      const step = Math.min(dlen, a * dt);
      if (dlen > 1e-5) { this.vel.x += (dvx / dlen) * step; this.vel.z += (dvz / dlen) * step; }
      // Squid Roll: sharp reversal while swimming fast
      if (this.squid && this.grounded && this.onOwnInk && wantMove && this.state !== "SQUID_ROLL") {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 6.5) {
          const dot = (this.vel.x * wx + this.vel.z * wz) / sp;
          if (dot < -0.4) { this.setState("SQUID_ROLL", ev); this.vel.x = wx * MOVEMENT.squidRollSpeed; this.vel.z = wz * MOVEMENT.squidRollSpeed; this.vel.y = 3.2; this.grounded = false; }
        }
      }
      // jump
      if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.lockMovement) {
        let jv = this.squid ? MOVEMENT.swimJumpVelocity : MOVEMENT.jumpVelocity;
        if (this.onEnemyInk) jv *= MOVEMENT.enemyInkNoJumpHeightMul;
        this.vel.y = jv; this.grounded = false; this.jumpBuffer = 0; this.coyote = 0;
        this.setState("JUMP", ev); ev.onJump(this);
      }
      // gravity
      const g = MOVEMENT.gravity * (this.vel.y < 0 ? MOVEMENT.fallGravityMul : 1);
      this.vel.y -= g * dt;
      if (this.vel.y < -30) this.vel.y = -30;
    }
    // integrate
    const wasGrounded = this.grounded;
    const fallSpeed = this.vel.y;
    world.moveBody(this.pos, this.radius, this.height, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, this.squid ? MOVEMENT.stepHeight * 0.7 : MOVEMENT.stepHeight, _res);
    this.grounded = _res.grounded;
    this.groundBox = _res.groundBox;
    if (_res.hitHead && this.vel.y > 0) this.vel.y = 0;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    if (this.grounded && !wasGrounded && fallSpeed < -2) { this.landSquash = Math.min(1, -fallSpeed / 12); ev.onLand(this, -fallSpeed); if (this.state !== "SQUID_ROLL") this.setState("LAND", ev); }
    // wall contact → wall swim if wall is own ink
    if ((_res.hitX || _res.hitZ) && _res.wallBox) {
      const b = _res.wallBox; const n = _res.wallNormal;
      if (this.squid && b.paintWalls && wantMove && (wx * -n.x + wz * -n.z) > 0.3) {
        const side = n.x > 0 ? 0 : n.x < 0 ? 1 : n.z > 0 ? 2 : 3;
        const tile = b.wallTiles[side];
        _pt.set(this.pos.x - n.x * (this.radius + 0.05), this.pos.y + 0.3, this.pos.z - n.z * (this.radius + 0.05));
        if (tile >= 0 && ink.wallTeamAt(tile, _pt) === this.team) {
          if (this.state !== "SWIM_WALL") { this.setState("SWIM_WALL", ev); this.vel.y = Math.max(this.vel.y, 1.5); }
          this.wallNormal.copy(n);
        }
      } else if (!this.squid) { if (_res.hitX) this.vel.x = 0; if (_res.hitZ) this.vel.z = 0; }
    } else if (this.state === "SWIM_WALL" && !_res.hitX && !_res.hitZ) {
      // reached top of the wall: pop over the edge
      this.vel.x += -this.wallNormal.x * 3.0; this.vel.z += -this.wallNormal.z * 3.0; this.vel.y = Math.max(this.vel.y, 2.5);
      this.setState("SWIM", ev);
    }
    this.landSquash = Math.max(0, this.landSquash - dt * 5);
    this.moveSpeedNow = Math.hypot(this.vel.x, this.vel.z);

    // body yaw follows aim; while moving humanoid, body faces aim (Splatoon: body always faces camera direction when shooting/moving)
    let dy = this.aimYaw - this.bodyYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const follow = this.squid ? 22 : (this.wr.firingAnim > 0 || wantMove ? 18 : MOVEMENT.turnResponse);
    if (Math.abs(dy) > 1.2 && !this.squid) this.bodyYaw += dy * Math.min(1, 26 * dt); // fast turn-in-place
    else this.bodyYaw += dy * Math.min(1, follow * dt);

    // state resolution
    if (this.state === "SQUID_ROLL" && this.stateTime > MOVEMENT.squidRollTime) this.setState("SWIM", ev);
    else if (this.state === "SPLATTED" || this.state === "SQUID_ROLL") { /* keep */ }
    else if (this.state === "SWIM_WALL" && wallSwimming) { /* keep */ }
    else if (this.state === "LAND" && this.stateTime < 0.12 && this.grounded) { /* keep */ }
    else if (this.state === "SWIM_ENTER" && this.stateTime < MOVEMENT.swimEnterTime) { /* keep */ }
    else if (!this.grounded) this.setState(this.vel.y > 0.5 && this.state === "JUMP" ? "JUMP" : this.squid ? "SWIM" : this.vel.y > 0 ? "HUMANOID_AIR" : "FALL", ev);
    else if (this.squid) this.setState(this.moveSpeedNow > 6 ? "SWIM_FAST" : "SWIM", ev);
    else this.setState(this.moveSpeedNow > 0.4 ? "HUMANOID_MOVE" : "HUMANOID_IDLE", ev);

    // kill plane
    if (this.pos.y < world.killY) this.splat(this.lastHitBy && this.time - this.lastHitTime < 3 ? this.lastHitBy : null, ev);
    void FIXED_DT; void _dir;
  }
}

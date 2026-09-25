import * as THREE from "three";
import { World } from "./physics/World";
import { InkSystem } from "./ink/InkSystem";
import { buildScorchGorge, StageInfo } from "./stage/ScorchGorge";
import { Player, GameEvents, MoveState } from "./entities/Player";
import { WeaponSystem, WeaponEvents, aimDir } from "./weapons/WeaponSystem";
import { CameraRig } from "./camera/CameraRig";
import { Input } from "./input/Input";
import { CharacterModel } from "./render/CharacterModel";
import { Effects } from "./vfx/Effects";
import { Sfx } from "./audio/Sfx";
import { NavGrid } from "./ai/NavGrid";
import { Bot, DIFFICULTIES } from "./ai/Bot";
import { WEAPONS, WeaponId, WeaponDefinition } from "./data/weapons";
import { FIXED_DT, MATCH, TEAM_COLORS } from "./data/tuning";

export type Phase = "IDLE" | "INTRO" | "BATTLE" | "TIMEUP" | "RESULT";
export type Quality = "LOW" | "MEDIUM" | "HIGH";

export interface HudState {
  phase: Phase; timeLeft: number; introCount: number;
  ink: number; health: number; charge: number; charging: boolean; storedCharge: number;
  weapon: WeaponId; rollerPhase: string; squid: boolean; state: MoveState;
  teamAlive: boolean[][]; teamRespawn: number[][]; score: [number, number]; myTeam: number;
  killfeed: { text: string; t: number; team: number }[];
  respawnIn: number; alive: boolean; damageFlash: number; hitConfirm: number; splatBanner: number;
  message: string; finalMinute: boolean;
  result: null | { score: [number, number]; winner: number; kills: number; deaths: number; painted: number; cpuScore: [number, number] };
  stats: BenchStats; quality: Quality; renderScale: number; backend: string; gyro: boolean;
  flowAura: boolean; enemyInkWarning: boolean; lowInk: boolean; onOwnInk: boolean;
}
export interface BenchStats { fps: number; frameMs: number; simMs: number; aiMs: number; inkMs: number; renderMs: number; drawCalls: number; triangles: number; particles: number; projectiles: number; stamps: number; heapMB: number; low1: number }

const QUALITY: Record<Quality, { scale: number; particles: number; maxDpr: number }> = {
  LOW: { scale: 0.6, particles: 300, maxDpr: 1.5 }, MEDIUM: { scale: 0.8, particles: 600, maxDpr: 2 }, HIGH: { scale: 1.0, particles: 900, maxDpr: 2 },
};

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  world = new World();
  ink: InkSystem;
  stage: StageInfo;
  stageMat: THREE.ShaderMaterial;
  players: Player[] = [];
  models: CharacterModel[] = [];
  bots: Bot[] = [];
  human!: Player;
  weapons!: WeaponSystem;
  rig: CameraRig;
  input: Input;
  fx: Effects;
  sfx = new Sfx();
  nav: NavGrid;
  phase: Phase = "IDLE";
  timeLeft = MATCH.duration;
  phaseTime = 0;
  private acc = 0; private last = 0; private raf = 0;
  private simTime = 0;
  hud: HudState;
  quality: Quality = "MEDIUM";
  renderScale = 0.8;
  private frameTimes: number[] = [];
  private stats: BenchStats = { fps: 0, frameMs: 0, simMs: 0, aiMs: 0, inkMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, particles: 0, projectiles: 0, stamps: 0, heapMB: 0, low1: 0 };
  private killfeed: HudState["killfeed"] = [];
  private damageFlash = 0; private hitConfirm = 0; private splatBanner = 0;
  private message = ""; private messageT = 0;
  private lookTmp = { dYaw: 0, dPitch: 0 };
  private blobShadows: THREE.InstancedMesh;
  private budgetOver = 0; private budgetUnder = 0;
  private laserA = new THREE.Vector3(); private laserB = new THREE.Vector3();
  benchmarkLog: BenchStats[] = [];
  debug = false;
  private disposed = false;
  private tmpV = new THREE.Vector3();

  constructor(public canvas: HTMLCanvasElement, public overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false, stencil: false });
    this.renderer.setClearColor(0xe8d2b0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.detectTier();
    this.scene.fog = null;
    this.ink = new InkSystem(this.renderer, { x0: -30, z0: -62, x1: 30, z1: 62 });
    const st = buildScorchGorge(this.world, this.ink, this.scene);
    this.stage = st.info; this.stageMat = st.material;
    this.nav = new NavGrid(this.world, this.ink);
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a6a4a, 0.85); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35); sun.position.set(40, 80, 30); this.scene.add(sun);
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.input = new Input(overlay);
    this.input.onAnyInput = () => this.sfx.init();
    this.fx = new Effects(this.scene, QUALITY[this.quality].particles);
    this.blobShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), 8);
    this.blobShadows.frustumCulled = false; this.scene.add(this.blobShadows);
    this.hud = this.makeHud();
    this.resize();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { this.last = 0; this.sfx.setRolling(false, 0); } });
    this.setupPlayers("splattershot");
    this.render(0, 1);
  }

  private detectTier() {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    const mem = (navigator as any).deviceMemory ?? 4;
    if (!mobile) this.quality = "HIGH";
    else if (mem <= 3 || /Mali-G5|Adreno 5|Adreno 61|PowerVR/i.test(gpu)) this.quality = "LOW";
    else this.quality = "MEDIUM";
    this.renderScale = QUALITY[this.quality].scale;
  }

  setQuality(q: Quality) { this.quality = q; this.renderScale = QUALITY[q].scale; this.resize(); }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].maxDpr) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h); this.rig.camera.updateProjectionMatrix();
  };

  private makeHud(): HudState {
    return {
      phase: this.phase, timeLeft: MATCH.duration, introCount: 3, ink: 100, health: 100, charge: 0, charging: false, storedCharge: 0, weapon: "splattershot", rollerPhase: "idle", squid: false, state: "HUMANOID_IDLE",
      teamAlive: [[true, true, true, true], [true, true, true, true]], teamRespawn: [[0, 0, 0, 0], [0, 0, 0, 0]], score: [0, 0], myTeam: 0, killfeed: [], respawnIn: 0, alive: true, damageFlash: 0, hitConfirm: 0, splatBanner: 0,
      message: "", finalMinute: false, result: null, stats: this.stats, quality: this.quality, renderScale: this.renderScale, backend: "WebGL2", gyro: false,
      flowAura: false, enemyInkWarning: false, lowInk: false, onOwnInk: false,
    };
  }

  // ------------------------------------------------------------------ setup
  setupPlayers(humanWeapon: WeaponId) {
    for (const m of this.models) this.scene.remove(m.root);
    this.players = []; this.models = []; this.bots = [];
    const names0 = ["You", "Kai", "Mina", "Rex"], names1 = ["Nori", "Tako", "Yuzu", "Ebi"];
    const others = (["splattershot", "splat_roller", "splat_charger"] as WeaponId[]).filter((w) => w !== humanWeapon);
    const team0: WeaponDefinition[] = [WEAPONS[humanWeapon], WEAPONS[others[0]], WEAPONS[others[1]], WEAPONS.splattershot];
    const team1: WeaponDefinition[] = [WEAPONS.splattershot, WEAPONS.splat_roller, WEAPONS.splat_charger, WEAPONS.splattershot];
    const diff = DIFFICULTIES.normal;
    let seed = 1;
    for (let t = 0; t < 2; t++) {
      const defs = t === 0 ? team0 : team1;
      for (let s = 0; s < 4; s++) {
        const human = t === 0 && s === 0;
        const p = new Player(t === 0 ? names0[s] : names1[s], t, human, defs[s]);
        p.spawnPoint.copy(this.stage.spawns[t][s]); p.spawnYaw = this.stage.spawnYaw[t];
        p.pos.copy(p.spawnPoint); p.prevPos.copy(p.pos); p.aimYaw = p.bodyYaw = p.spawnYaw; p.input.aimYaw = p.spawnYaw;
        this.players.push(p);
        const m = new CharacterModel(p, seed++); this.scene.add(m.root); this.models.push(m);
        if (human) this.human = p;
        else this.bots.push(new Bot(p, this.world, this.ink, this.nav, this.stage, this.players, diff, seed));
      }
    }
    this.weapons = new WeaponSystem(this.world, this.ink, this.players, this.weaponEvents, this.gameEvents);
    this.rig.snapTo(this.human);
  }

  startMatch(weapon: WeaponId) {
    this.sfx.init();
    this.ink.clear();
    this.setupPlayers(weapon);
    for (const n of this.nav.nodes) n.danger = 0;
    this.timeLeft = MATCH.duration; this.killfeed = []; this.hud.result = null;
    this.setPhase("INTRO");
    this.sfx.play("countdown");
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }

  private setPhase(p: Phase) { this.phase = p; this.phaseTime = 0; }

  // ------------------------------------------------------------------ events
  private gameEvents: GameEvents = {
    onSplat: (victim, killer) => {
      this.fx.splatBurst(victim.pos, killer ? killer.team : 1 - victim.team);
      this.ink.stampFloor(victim.pos.x, victim.pos.z, 1.6, killer ? killer.team : 1 - victim.team, 1, Math.random() * 6, 1.2, Math.random());
      this.nav.addDanger(victim.pos, 1.5);
      const pan = this.panFor(victim.pos);
      this.sfx.play("splat", victim === this.human ? 1 : 0.6, pan);
      this.killfeed.unshift({ text: killer ? `${killer.name} splatted ${victim.name}` : `${victim.name} fell`, t: 4, team: killer ? killer.team : 1 - victim.team });
      if (this.killfeed.length > 4) this.killfeed.pop();
      if (killer === this.human) { this.splatBanner = 1.5; this.sfx.play("hit_confirm"); }
      if (victim === this.human) { this.rig.shake = 1; this.damageFlash = 1; }
    },
    onDamage: (victim, amount, from) => {
      if (victim === this.human) { this.damageFlash = Math.min(1, this.damageFlash + amount / 60); this.rig.shake = Math.max(this.rig.shake, 0.4); this.sfx.play("hit", 0.6); }
      if (from === this.human) { this.hitConfirm = 0.25; this.sfx.play("hit_confirm", 0.5); }
    },
    onStateChange: (p, _from, to) => {
      if (to === "SQUID_ROLL" && p === this.human) this.sfx.play("swim", 0.8);
      if (to === "RESPAWN") { if (p === this.human) { this.rig.snapTo(p); this.sfx.play("respawn"); } }
    },
    onLand: (p, spd) => { this.sfx.play("land", Math.min(1, spd / 10) * (p === this.human ? 1 : 0.3), this.panFor(p.pos)); if (p.squid && p.onOwnInk) this.fx.burst(p.pos, new THREE.Vector3(0, 1, 0), p.team, 0.8, 8); },
    onSwimToggle: (p, squid) => { this.sfx.play("swim", p === this.human ? 0.8 : 0.3, this.panFor(p.pos)); if (squid && p.onOwnInk) this.fx.burst(p.pos, new THREE.Vector3(0, 1, 0), p.team, 0.7, 10); },
    onJump: (p) => { if (p === this.human) this.sfx.play("jump", 0.5); },
  };
  private weaponEvents: WeaponEvents = {
    onFire: (p, kind, strength) => {
      const pan = this.panFor(p.pos); const vol = p === this.human ? 1 : 0.45;
      if (kind === "shooter") { this.sfx.play("shoot", vol, pan); if (p === this.human) this.rig.recoil = 1; }
      else if (kind.startsWith("roller")) { if (strength > 0) this.sfx.play("roller_flick", vol, pan); }
      else { if (strength === 0 && p === this.human) this.sfx.play("charger_charge"); else if (strength === 0.5 && p === this.human) this.sfx.play("charger_full"); else if (strength === 1) { this.sfx.play("charger_fire", vol, pan); if (p === this.human) this.rig.recoil = 2; } }
    },
    onImpact: (pos, normal, team, size) => { this.fx.burst(pos, normal, team, size, 6); if (this.human && pos.distanceToSquared(this.human.pos) < 400) this.sfx.play("impact", 0.4, this.panFor(pos)); },
    onChargerBeam: (a, b, team, full) => this.fx.chargerBeam(a, b, team, full),
    onPlayerHit: (victim, _from, _amt, pos) => { this.fx.burst(pos, new THREE.Vector3(0, 1, 0), 1 - victim.team, 0.8, 8); },
  };

  private panFor(pos: THREE.Vector3) {
    const cam = this.rig.camera;
    this.tmpV.copy(pos).sub(cam.position);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    return THREE.MathUtils.clamp(this.tmpV.dot(right) / 20, -0.8, 0.8);
  }

  // ------------------------------------------------------------------ loop
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    let frame = (now - this.last) / 1000; this.last = now;
    if (frame > 0.25) frame = 0.25; // background tab / hitch: clamp to avoid spiral of death
    this.frameTimes.push(frame * 1000); if (this.frameTimes.length > 120) this.frameTimes.shift();
    const t0 = performance.now();
    // input → human
    if (this.phase === "BATTLE" || this.phase === "INTRO" || this.phase === "TIMEUP") {
      this.input.pollKeyboard();
      this.input.consumeLook(this.lookTmp);
      if (this.phase === "BATTLE") this.rig.addLook(this.lookTmp.dYaw, this.lookTmp.dPitch);
    }
    this.acc += frame;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 5) { this.simulate(FIXED_DT); this.acc -= FIXED_DT; steps++; }
    if (steps === 5) this.acc = 0;
    const alpha = this.acc / FIXED_DT;
    const t1 = performance.now();
    this.render(frame, alpha);
    const t2 = performance.now();
    this.stats.simMs = t1 - t0; this.stats.renderMs = t2 - t1; this.stats.frameMs = frame * 1000;
    this.updateStats();
    this.dynamicResolution(frame);
  };

  private simulate(dt: number) {
    this.simTime += dt; this.phaseTime += dt;
    const battle = this.phase === "BATTLE";
    // human input
    const h = this.human; const inp = h.input; const I = this.input;
    if (battle) {
      inp.moveX = I.moveX; inp.moveY = I.moveY; inp.aimYaw = this.rig.yaw; inp.aimPitch = this.rig.pitch;
      inp.fire = I.fire; inp.swim = I.swim && !I.fire; inp.jump = I.jump; inp.altFire = I.alt;
    } else { inp.moveX = inp.moveY = 0; inp.fire = inp.swim = inp.jump = false; inp.aimYaw = this.rig.yaw; }
    // bots
    const ta = performance.now();
    if (battle) for (const b of this.bots) b.update(dt, this.timeLeft);
    else for (const b of this.bots) { b.p.input.fire = false; b.p.input.moveX = b.p.input.moveY = 0; }
    this.stats.aiMs = performance.now() - ta;
    // players + weapons
    for (const p of this.players) p.update(dt, this.world, this.ink, this.gameEvents);
    if (battle) this.weapons.update(dt);
    this.nav.decayDanger(dt);
    this.ink.updateLiveScore();
    // swim spray
    for (const p of this.players) if (p.alive && p.squid && p.onOwnInk && p.moveSpeedNow > 5) this.fx.swimSpray(p.pos, p.vel, p.team);
    // phase flow
    if (this.phase === "INTRO") {
      const c = Math.ceil(MATCH.introTime - this.phaseTime);
      if (c !== this.hud.introCount && c > 0) this.sfx.play("countdown");
      this.hud.introCount = c;
      if (this.phaseTime >= MATCH.introTime) { this.setPhase("BATTLE"); this.sfx.play("start"); this.showMessage("GO!", 1.2); this.input.lockWanted = !this.input.isTouch; }
    } else if (battle) {
      const prev = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (prev > MATCH.finalMinuteWarning && this.timeLeft <= MATCH.finalMinuteWarning) { this.showMessage("1 MINUTE REMAINING!", 2); this.sfx.play("whistle"); }
      if (prev > 10 && this.timeLeft <= 10) this.sfx.play("countdown");
      if (this.timeLeft <= 0) { this.setPhase("TIMEUP"); this.sfx.play("whistle"); this.showMessage("GAME!", 2.5); }
    } else if (this.phase === "TIMEUP") {
      for (const p of this.players) { p.input.fire = false; p.input.moveX = p.input.moveY = 0; }
      if (this.phaseTime > 2.5) this.finishMatch();
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5); this.hitConfirm = Math.max(0, this.hitConfirm - dt); this.splatBanner = Math.max(0, this.splatBanner - dt);
    this.messageT = Math.max(0, this.messageT - dt);
    for (const k of this.killfeed) k.t -= dt; this.killfeed = this.killfeed.filter((k) => k.t > 0);
  }

  private finishMatch() {
    this.setPhase("RESULT");
    const gpu = this.ink.finalScore();
    const cpu = this.ink.liveScore as [number, number];
    const winner = gpu[0] === gpu[1] ? -1 : gpu[0] > gpu[1] ? 0 : 1;
    this.hud.result = { score: gpu, winner, kills: this.human.kills, deaths: this.human.deaths, painted: Math.round(this.human.paintedPoints * 10), cpuScore: cpu };
    this.sfx.play("result");
    this.sfx.setRolling(false, 0); this.sfx.stopCharge();
    this.input.lockWanted = false;
    if (document.pointerLockElement) document.exitPointerLock();
    console.info("[TurfCalc] GPU readback:", gpu.map((v) => (v * 100).toFixed(2)), "CPU mirror:", cpu.map((v) => (v * 100).toFixed(2)));
  }

  showMessage(m: string, t: number) { this.message = m; this.messageT = t; }

  private render(dt: number, alpha: number) {
    const h = this.human;
    // interpolated character presentation
    for (const m of this.models) m.update(dt, alpha, this.simTime);
    // blob shadows
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), S = new THREE.Vector3();
    let n = 0;
    for (const p of this.players) {
      if (!p.alive) continue;
      const gy = this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.2, 0.2);
      if (!isFinite(gy)) continue;
      const k = 1 - Math.min(0.7, (p.pos.y - gy) / 6);
      S.setScalar(k * (p.squid ? 0.9 : 1));
      M.compose(this.tmpV.set(p.pos.x, gy + 0.02, p.pos.z), Q, S);
      this.blobShadows.setMatrixAt(n++, M);
    }
    this.blobShadows.count = n; this.blobShadows.instanceMatrix.needsUpdate = true;
    // camera
    this.tmpV.lerpVectors(h.prevPos, h.pos, alpha);
    this.rig.update(h, this.world, dt, this.tmpV);
    this.stageMat.uniforms.uCamPos.value.copy(this.rig.camera.position);
    // charger laser sight for human (and visible bots)
    for (const p of this.players) {
      if (p.weapon.kind !== "charger") continue;
      if (p.alive && p.wr.charging && p.wr.charge > 0.05) {
        this.weapons.muzzle(p, this.laserA);
        const range = p.weapon.charger!.minRange + (p.weapon.charger!.fullRange - p.weapon.charger!.minRange) * p.wr.charge;
        this.weapons.aimPoint(p, this.laserB, range);
        aimDir(p.aimYaw, p.aimPitch, this.tmpV);
        const d = Math.min(range, this.laserA.distanceTo(this.laserB));
        this.laserB.copy(this.laserA).addScaledVector(this.tmpV, d);
        this.fx.setLaser(p.team, this.laserA, this.laserB);
      } else if (p === this.human || p.team === 1) { /* keep others' lasers minimal */ }
    }
    // clear lasers of teams with no charging chargers
    for (let t = 0; t < 2; t++) if (!this.players.some((p) => p.team === t && p.alive && p.weapon.kind === "charger" && p.wr.charging && p.wr.charge > 0.05)) this.fx.setLaser(t, null, null);
    // audio loops
    this.sfx.setRolling(h.alive && h.wr.rollerPhase === "roll" && h.moveSpeedNow > 0.5, h.moveSpeedNow);
    if (h.wr.charging) this.sfx.setChargeLevel(h.wr.charge); else this.sfx.stopCharge();
    const ti = performance.now();
    this.ink.flush();
    this.stats.inkMs = performance.now() - ti;
    this.fx.update(dt, this.weapons ? this.weapons.projectiles : [], alpha);
    this.renderer.render(this.scene, this.rig.camera);
    this.syncHud();
  }

  private syncHud() {
    const h = this.human; const s = this.hud;
    s.phase = this.phase; s.timeLeft = this.timeLeft; s.ink = h.ink; s.health = h.health; s.charge = h.wr.charge; s.charging = h.wr.charging; s.storedCharge = h.wr.storedCharge;
    s.weapon = h.weapon.id; s.rollerPhase = h.wr.rollerPhase; s.squid = h.squid; s.state = h.state; s.alive = h.alive; s.respawnIn = Math.max(0, h.respawnTimer);
    for (let t = 0; t < 2; t++) { const tp = this.players.filter((p) => p.team === t); for (let i = 0; i < 4; i++) { s.teamAlive[t][i] = tp[i]?.alive ?? false; s.teamRespawn[t][i] = tp[i]?.respawnTimer ?? 0; } }
    s.score = this.ink.liveScore as [number, number]; s.myTeam = h.team; s.killfeed = this.killfeed; s.damageFlash = this.damageFlash; s.hitConfirm = this.hitConfirm; s.splatBanner = this.splatBanner;
    s.message = this.messageT > 0 ? this.message : ""; s.finalMinute = this.timeLeft <= 60 && this.phase === "BATTLE";
    s.stats = this.stats; s.quality = this.quality; s.renderScale = this.renderScale; s.gyro = this.input.gyroEnabled;
    s.flowAura = h.flowAura > 0; s.enemyInkWarning = h.onEnemyInk; s.lowInk = h.ink < 15; s.onOwnInk = h.onOwnInk;
  }

  private updateStats() {
    const ft = this.frameTimes; if (!ft.length) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    this.stats.fps = 1000 / avg;
    const sorted = [...ft].sort((a, b) => b - a); this.stats.low1 = 1000 / sorted[0];
    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls; this.stats.triangles = info.render.triangles;
    this.stats.particles = this.fx.activeParticles; this.stats.projectiles = this.weapons?.activeCount ?? 0; this.stats.stamps = this.ink.totalStamps;
    const mem = (performance as any).memory; this.stats.heapMB = mem ? mem.usedJSHeapSize / 1048576 : 0;
    if (this.phase === "BATTLE" && Math.floor(this.simTime * 2) !== Math.floor((this.simTime - 1 / 60) * 2)) this.benchmarkLog.push({ ...this.stats });
    if (this.benchmarkLog.length > 400) this.benchmarkLog.shift();
  }

  private dynamicResolution(frame: number) {
    const ms = frame * 1000;
    if (ms > 19) { this.budgetOver += frame; this.budgetUnder = 0; } else if (ms < 13) { this.budgetUnder += frame; this.budgetOver = 0; } else { this.budgetOver = this.budgetUnder = 0; }
    if (this.budgetOver > 2 && this.renderScale > 0.5) { this.renderScale = Math.max(0.5, this.renderScale - 0.1); this.budgetOver = 0; this.resize(); }
    else if (this.budgetUnder > 6 && this.renderScale < QUALITY[this.quality].scale) { this.renderScale = Math.min(QUALITY[this.quality].scale, this.renderScale + 0.1); this.budgetUnder = 0; this.resize(); }
  }

  benchmarkSummary() {
    const log = this.benchmarkLog; if (!log.length) return null;
    const avg = (k: keyof BenchStats) => log.reduce((a, b) => a + (b[k] as number), 0) / log.length;
    return { samples: log.length, fps: avg("fps"), low1: Math.min(...log.map((l) => l.low1)), frameMs: avg("frameMs"), simMs: avg("simMs"), aiMs: avg("aiMs"), inkMs: avg("inkMs"), renderMs: avg("renderMs"), drawCalls: Math.max(...log.map((l) => l.drawCalls)), triangles: Math.max(...log.map((l) => l.triangles)), heapMB: Math.max(...log.map((l) => l.heapMB)) };
  }

  teamColor(t: number) { return TEAM_COLORS[t].css; }

  dispose() { this.disposed = true; cancelAnimationFrame(this.raf); window.removeEventListener("resize", this.resize); this.renderer.dispose(); }
}

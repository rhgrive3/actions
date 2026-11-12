import * as THREE from "three";
import { AudioFX, type SfxName } from "./audio";
import {
  DEFS, FACTIONS, FACTION_UNITS, FIELD, GEO, M, MAX_PER_TEAM, TEAM_COLORS_CSS,
  type Faction, type TeamId, type UnitKind,
} from "./units";
import { buildUnitRig, type UnitRig } from "./rigs";
import { STAGES, loadCleared, type Stage } from "./campaign";
import { BattleSimulation, RESULT_DELAY, type CombatUnit, type EndStats, type Formation, type Phase } from "./simulation";
import { UnitBatchRenderer } from "./unit-renderer";
import { EffectLayer } from "./effects";
import { buildStageEnv, type SceneEnv } from "./stages3d";
import { terrainObstacles } from "./terrain";

export type { EndStats, Formation, Phase } from "./simulation";
export type ControlMode = "place" | "camera";

export interface SelectedUnitSummary {
  name: string;
  role: string;
  hp: number;
  maxHp: number;
  kills: number;
  damage: number;
  buffs: string[];
}

export interface Notice { id: number; text: string; error: boolean }
export interface HudState {
  phase: Phase;
  time: number;
  speed: number;
  budget: [number, number];
  counts: [number, number];
  kills: [number, number];
  losses: [number, number];
  sel: number;
  deploy: UnitKind | null;
  deployTeam: TeamId;
  faction: Faction;
  batch: boolean;
  boxMode: boolean;
  mode: ControlMode;
  story: boolean;
  stageIndex: number;
  sceneId: number;
  stageName: string;
  stageHint: string;
  showcase: boolean;
  muted: boolean;
  canUndo: boolean;
  resolving: number | null;
  notice: Notice | null;
  quality: "standard" | "low";
  fps: number;
  deployFail: number;
  teamHp?: [[number, number], [number, number]];
  formation?: Formation;
  following?: boolean;
  selectedUnit?: SelectedUnitSummary | null;
}
interface EngineCB {
  onHud: (h: HudState) => void;
  onEnd: (s: EndStats) => void;
  onError: (message: string) => void;
}
interface Particle {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  life: number;
  duration: number;
  grow: number;
  gravity: number;
}
interface Gesture {
  id: number;
  button: number;
  type: string;
  mode: "deploy" | "select" | "rotate" | "pan" | "place";
  downStamp: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastWorld: THREE.Vector3 | null;
  shift: boolean;
  moved: boolean;
}
interface Pinch { dist: number; midX: number; midY: number }
interface Floater { x: number; y: number; z: number; text: string; color: string; age: number; life: number }
interface GroundRing { x: number; z: number; age: number; life: number; size: number; color: string }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const pulse = (s: number) => (s < 0.25 ? s / 0.25 : 1 - ((s - 0.25) / 0.75) * 0.85);
const UP = new THREE.Vector3(0, 1, 0);
const DROP = 0.34;

type AttackStyle = "thrust" | "overhead" | "slash" | "shoot" | "throw" | "cast" | "heal" | "claw" | "lance";
const POSE: Record<UnitKind, { r: number; l: number; swing: number; style: AttackStyle }> = {
  spear: { r: -0.3, l: -0.25, swing: 0.28, style: "thrust" },
  guardian: { r: -0.25, l: -0.65, swing: 0.22, style: "slash" },
  archer: { r: -0.5, l: -0.5, swing: 0.12, style: "shoot" },
  crossbow: { r: -0.55, l: -0.5, swing: 0.1, style: "shoot" },
  swordsman: { r: -0.35, l: -0.45, swing: 0.45, style: "slash" },
  halberdier: { r: -0.3, l: -0.2, swing: 0.3, style: "thrust" },
  knight: { r: -0.3, l: 0.1, swing: 0, style: "lance" },
  paladin: { r: -0.3, l: -0.45, swing: 0.35, style: "overhead" },
  king: { r: -0.35, l: -0.5, swing: 0.32, style: "overhead" },
  orc: { r: -0.2, l: -0.3, swing: 0.4, style: "overhead" },
  berserker: { r: -0.25, l: -0.25, swing: 0.5, style: "overhead" },
  javelin: { r: -0.4, l: 0.1, swing: 0.5, style: "throw" },
  bomber: { r: -0.4, l: 0.1, swing: 0.5, style: "throw" },
  pirate: { r: -0.9, l: -0.2, swing: 0.12, style: "shoot" },
  shaman: { r: -0.9, l: -0.05, swing: 0.1, style: "cast" },
  troll: { r: -0.15, l: 0.05, swing: 0.32, style: "overhead" },
  giant: { r: -0.15, l: 0.05, swing: 0.32, style: "overhead" },
  elf: { r: -0.5, l: -0.5, swing: 0.12, style: "shoot" },
  monk: { r: -0.5, l: -0.5, swing: 0.5, style: "claw" },
  assassin: { r: -0.5, l: -0.5, swing: 0.5, style: "slash" },
  mage: { r: -0.9, l: -0.05, swing: 0.1, style: "cast" },
  frost: { r: -0.9, l: -0.05, swing: 0.1, style: "cast" },
  cleric: { r: -0.9, l: 0, swing: 0.1, style: "heal" },
  zeus: { r: -1.6, l: -1.2, swing: 0.1, style: "cast" },
  zombie: { r: -1.35, l: -1.35, swing: 0.06, style: "claw" },
  skeleton: { r: -0.35, l: -0.2, swing: 0.5, style: "slash" },
  bonearcher: { r: -0.5, l: -0.5, swing: 0.12, style: "shoot" },
  vampire: { r: -0.4, l: -0.35, swing: 0.45, style: "slash" },
  robot: { r: -0.35, l: -0.35, swing: 0.35, style: "slash" },
  tank: { r: -0.2, l: 0.05, swing: 0.1, style: "shoot" },
  sapper: { r: -1.1, l: -1.1, swing: 0.2, style: "overhead" },
  necromancer: { r: -0.9, l: -0.3, swing: 0.1, style: "cast" },
  catapult: { r: -0.5, l: 0, swing: 1.3, style: "overhead" },
  railgun: { r: -1.1, l: -1.15, swing: 0.06, style: "shoot" },
};

const DEPLOY_MESSAGES: Record<string, string> = {
  funds: "資金が足りません",
  limit: `配置上限（${MAX_PER_TEAM}体）に達しました`,
  zone: "自陣エリア内に配置してください",
  inactive: "戦闘中は配置できません",
  occupied: "空きスペースがありません",
  locked: "まだ解放されていません",
};

const FORMATION_NAMES: Record<Formation, string> = {
  box: "方陣",
  line: "横陣",
  wedge: "楔陣",
  scatter: "散開",
};

export class Engine {
  private sim = new BattleSimulation();
  private scene = new THREE.Scene();
  private unitRenderer = new UnitBatchRenderer(this.scene);
  private fx!: EffectLayer;
  private camera = new THREE.PerspectiveCamera(55, 1, 0.3, 600);
  private renderer: THREE.WebGLRenderer;
  private ctx: CanvasRenderingContext2D;
  private miniCtx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private contextLost = false;
  private width = 1280;
  private height = 720;
  private views = new Map<number, UnitRig>();
  private spawnFx = new Map<number, { birth: number; landed: boolean }>();
  private projectileViews = new Map<number, THREE.Object3D>();
  private arrowPool: THREE.Group[] = [];
  private quarrelPool: THREE.Group[] = [];
  private javelinPool: THREE.Group[] = [];
  private boltPool: THREE.Mesh[] = [];
  private bombPool: THREE.Group[] = [];
  private pistolPool: THREE.Group[] = [];
  private cannonPool: THREE.Group[] = [];
  private railPool: THREE.Group[] = [];
  private particles: Particle[] = [];
  private particleIndex = 0;
  private floaters: Floater[] = [];
  private groundRings: GroundRing[] = [];
  private zones = new THREE.Group();
  private stageEnv: SceneEnv | null = null;
  private sceneId = 1;
  private customSceneId = 1;
  private selected = new Set<number>();
  private hoverId: number | null = null;
  private deployKind: UnitKind | null = null;
  private deployTeam: TeamId = 0;
  private faction: Faction = "kingdom";
  private batchMode = false;
  private boxMode = false;
  private mode: ControlMode = "place";
  private formation: Formation = "box";
  private following = false;
  private story = false;
  private stageIndex = 0;
  private showcaseMode = false;
  private deployFail = 0;
  private gesture: Gesture | null = null;
  private boxGesture: Gesture | null = null;
  private keys = new Set<string>();
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: Pinch | null = null;
  private lastTap = { time: 0, x: 0, y: 0 };
  private animClock = 0;
  private trailOn = false;
  private pointer = { x: 0, y: 0, over: false, shift: false, type: "mouse" };
  private yaw = 0;
  private pitch = 0.68;
  private distance = 96;
  private cameraTarget = new THREE.Vector3();
  private vYaw = 0;
  private vPitch = 0.68;
  private vDist = 96;
  private vTarget = new THREE.Vector3();
  private shake = 0;
  private quality: "standard" | "low" = "standard";
  private fps = 60;
  private lowFpsTime = 0;
  private hudTimer = 0;
  private hudSig = "";
  private telemetry = "";
  private miniTimer = 0;
  private notice: Notice | null = null;
  private noticeUntil = 0;
  private noticeId = 0;
  private reportedEnd = false;
  private lastActionStamp = 0;
  private markers: { x: number; z: number; age: number }[] = [];
  private audio = new AudioFX();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private tipScratch = new THREE.Vector3();
  private groundScratchA = new THREE.Vector3();
  private groundScratchB = new THREE.Vector3();
  private proj3 = new THREE.Vector3();
  private P = { x: 0, y: 0, visible: false };

  constructor(
    private container: HTMLDivElement,
    private overlay: HTMLCanvasElement,
    private mini: HTMLCanvasElement,
    private cb: EngineCB,
  ) {
    const ctx = overlay.getContext("2d"), miniCtx = mini.getContext("2d");
    if (!ctx || !miniCtx) throw new Error("2D canvas is unavailable");
    this.ctx = ctx;
    this.miniCtx = miniCtx;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    const canvas = this.renderer.domElement;
    canvas.dataset.testid = "battle-canvas";
    canvas.setAttribute("aria-label", "3D戦場");
    canvas.style.touchAction = "none";
    container.appendChild(canvas);
    this.createZonesAndParticles();
    this.setSceneTheme(1);
    this.fx = new EffectLayer(this.scene, this.camera);
    this.sim.phase = "menu";
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(container);
    this.resize();
    this.resetCamera();
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.clearInput);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("touchend", this.onTouchEnd);
    window.addEventListener("touchcancel", this.onTouchEnd);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    mini.addEventListener("pointerdown", this.onMinimap);
    mini.addEventListener("pointermove", this.onMinimapMove);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.pushHud();
  }

  /* ================= scene & stage environment ================= */

  private createZonesAndParticles() {
    for (const sign of [-1, 1]) {
      const color = sign === -1 ? 0x3f7fd6 : 0xd0453a;
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(73, 100), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(sign * 39.5, 0.03, 0);
      this.zones.add(zone);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 100), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(sign * 3, 0.045, 0);
      this.zones.add(line);
    }
    const grid = new THREE.GridHelper(156, 39, 0x9aa4a0, 0x9aa4a0);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.1;
    grid.material.depthWrite = false;
    this.zones.add(grid);
    this.scene.add(this.zones);

    for (let i = 0; i < 200; i++) {
      const mesh = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0, duration: 1, grow: 0, gravity: 9 });
    }
  }

  private setSceneTheme(id: number) {
    if (this.disposed) return;
    const clamped = clamp(id, 1, 4);
    if (this.stageEnv && this.sceneId === clamped) return;
    this.sceneId = clamped;
    this.stageEnv?.dispose();
    this.stageEnv = buildStageEnv(this.scene, clamped);
    this.miniTimer = 0;
    this.pushHud();
  }

  /* ================= public API ================= */

  startSandbox() {
    if (this.disposed) return;
    this.resetBattleState();
    this.story = false;
    this.showcaseMode = false;
    this.deployTeam = 0;
    this.sim.setupSandbox();
    this.sim.sceneIndex = this.customSceneId;
    this.sim.resolveAllTerrain();
    this.setSceneTheme(this.customSceneId);
    this.setMode("place");
    this.resetCamera();
    this.audio.init();
    this.notify("カスタム戦: 敵・味方を自由に編成できます");
  }

  setCustomScene(id: number) {
    if (this.disposed || this.story || this.showcaseMode) return;
    this.customSceneId = clamp(id, 1, 4);
    this.sim.sceneIndex = this.customSceneId;
    this.sim.resolveAllTerrain();
    this.setSceneTheme(this.customSceneId);
    this.audio.sfx("tab");
  }

  setDeployTeam(team: TeamId) {
    if (this.disposed || this.story || this.showcaseMode) return;
    this.deployTeam = team;
    this.audio.sfx("click");
    this.notify(team === 0 ? "味方（青）を配置" : "敵（赤）を配置");
    this.pushHud();
  }

  clearCustomUnits() {
    if (this.disposed || this.story || this.showcaseMode || this.sim.phase !== "setup") return;
    if (this.sim.clearUnits()) {
      this.clearInput();
      this.clearViews();
      this.selected.clear();
      this.hoverId = null;
      this.floaters = [];
      this.groundRings = [];
      this.miniTimer = 0;
      this.audio.sfx("click");
      this.notify("両軍をリセットしました");
      this.pushHud();
    }
  }

  clearArmies() {
    this.clearCustomUnits();
  }

  clearDeployment() {
    this.setDeploy(null);
  }

  setFormation(formation: Formation) {
    if (this.disposed) return;
    this.formation = formation;
    this.audio.sfx("click");
    this.notify(`陣形: ${FORMATION_NAMES[formation]}`);
    this.pushHud();
  }

  cycleFormation() {
    const order: Formation[] = ["box", "line", "wedge", "scatter"];
    const next = order[(order.indexOf(this.formation) + 1) % order.length];
    this.setFormation(next);
  }

  toggleFollow() {
    if (this.disposed || !this.isInteractive()) return;
    this.following = !this.following;
    if (this.following) {
      if (!this.selected.size) {
        const first = this.findNearestFollowTarget(this.cameraTarget);
        if (first) this.selected.add(first.id);
      }
      if (!this.selected.size) {
        this.following = false;
        this.notify("追従できる生存部隊がいません", true);
        this.pushHud();
        return;
      }
      this.distance = clamp(this.distance, 26, 48);
      this.pitch = 0.45;
      this.notify("追従カメラON（移動操作で解除）");
    } else {
      this.notify("追従カメラOFF");
    }
    this.audio.sfx("click");
    this.pushHud();
  }

  startStage(index: number) {
    if (this.disposed) return;
    const stage = STAGES[clamp(index, 0, STAGES.length - 1)];
    this.resetBattleState();
    this.story = true;
    this.showcaseMode = false;
    this.deployTeam = 0;
    this.stageIndex = STAGES.indexOf(stage);
    this.setSceneTheme(stage.scene);
    this.sim.setupStage(stage, loadCleared());
    this.setMode("place");
    this.target(0, 4, this.width / this.height < 1 ? 132 : 96, 0.62);
    this.yaw = 0;
    this.snapView();
    this.audio.init();
    this.pushHud();
  }

  startShowcase() {
    if (this.disposed) return;
    this.resetBattleState();
    this.showcaseMode = true;
    this.story = false;
    this.deployTeam = 0;
    this.setSceneTheme(4);
    this.sim.showcase();
    this.setMode("camera");
    this.target(0, 1, 74, 0.36);
    this.yaw = 0;
    this.snapView();
    this.audio.init();
  }

  private resetBattleState() {
    this.clearInput();
    this.clearViews();
    this.selected.clear();
    this.hoverId = null;
    this.deployKind = null;
    this.deployTeam = 0;
    this.boxMode = false;
    this.following = false;
    this.reportedEnd = false;
    this.shake = 0;
    this.floaters = [];
    this.groundRings = [];
    this.mode = "place";
    this.miniTimer = 0;
    this.audio.setWarDrums(false);
  }

  beginBattle() {
    if (this.disposed || this.sim.phase !== "setup") return;
    const now = performance.now();
    if (now - this.lastActionStamp < 80) return;
    this.lastActionStamp = now;
    if (!this.sim.begin()) {
      this.notify(this.sim.count(0) === 0 ? "味方を1体以上配置してください" : "敵を1体以上配置してください", true);
      return;
    }
    this.clearInput();
    this.showcaseMode = false;
    this.deployKind = null;
    this.boxMode = false;
    this.reportedEnd = false;
    this.audio.init();
    this.audio.sfx("horn");
    this.audio.sfx("charge");
    this.audio.setWarDrums(true);
    this.setMode("camera");
    this.notify("戦闘開始");
  }

  backToMenu() {
    if (this.disposed) return;
    this.resetBattleState();
    this.showcaseMode = false;
    this.story = false;
    this.sim.reset(false);
    this.sim.phase = "menu";
    this.notice = null;
    this.resetCamera();
    this.pushHud();
  }

  togglePause() {
    if (this.disposed || (this.sim.phase !== "playing" && this.sim.phase !== "paused")) return;
    const now = performance.now();
    if (now - this.lastActionStamp < 80) return;
    this.lastActionStamp = now;
    this.clearInput();
    this.sim.togglePause();
    this.audio.setWarDrums(this.sim.phase === "playing");
    this.audio.sfx("click");
    this.pushHud();
  }

  setSpeed(speed: number) {
    if (this.disposed || ![0.5, 1, 2, 4].includes(speed)) return;
    this.sim.speed = speed;
    this.audio.sfx("click");
    this.pushHud();
  }

  setMode(mode: ControlMode) {
    if (this.disposed) return;
    this.mode = mode;
    this.gesture = null;
    this.boxGesture = null;
    this.audio.sfx("click");
    this.pushHud();
  }

  toggleBoxMode() {
    if (this.disposed || !this.isInteractive()) return;
    this.boxMode = !this.boxMode;
    if (this.boxMode) this.deployKind = null;
    this.audio.sfx("click");
    this.notify(this.boxMode ? "ドラッグで部隊を囲んで選択" : "範囲選択を解除");
    this.pushHud();
  }

  setFaction(faction: Faction) {
    if (this.disposed || this.faction === faction) return;
    this.faction = faction;
    this.audio.sfx("tab");
    this.pushHud();
  }

  cycleFaction(step: number) {
    const i = FACTIONS.findIndex(f => f.id === this.faction);
    this.setFaction(FACTIONS[(i + step + FACTIONS.length) % FACTIONS.length].id);
  }

  toggleBatch() {
    if (this.disposed) return;
    this.batchMode = !this.batchMode;
    this.audio.sfx("click");
    this.pushHud();
  }

  setDeploy(kind: UnitKind | null) {
    if (this.disposed || !this.isInteractive()) return;
    this.gesture = null;
    this.boxMode = false;
    this.deployKind = this.deployKind === kind ? null : kind;
    if (this.deployKind && this.deployTeam === 0 && !this.sim.unlocked.has(this.deployKind)) {
      this.deployKind = null;
      return;
    }
    if (this.deployKind) {
      this.selected.clear();
      this.faction = DEFS[this.deployKind].faction;
      if (this.mode !== "place") this.mode = "place";
      this.notify(`${DEFS[this.deployKind].name}を選択`);
    }
    this.audio.sfx("click");
    this.pushHud();
  }

  selectAll() {
    if (this.disposed || !this.isInteractive()) return;
    this.deployKind = null;
    this.boxMode = false;
    this.selected = new Set(this.sim.units.filter(u => u.team === 0 && !u.dead).map(u => u.id));
    this.audio.sfx("select");
    this.pushHud();
  }

  issueOrder(order: "auto" | "hold") {
    if (this.disposed || !this.isInteractive()) return;
    if (!this.selected.size) this.selectAll();
    this.deployKind = null;
    this.boxMode = false;
    this.sim.command(this.selected, order);
    this.audio.sfx("select");
    this.notify(order === "auto" ? "総攻撃" : "待機");
  }

  undoDeploy() {
    if (this.disposed) return;
    if (this.sim.undoDeploy()) this.notify("直前の配置を取り消し");
    this.miniTimer = 0;
    this.pushHud();
  }

  toggleMute() { if (this.disposed) return; this.audio.init(); this.audio.toggleMute(); this.pushHud(); }

  toggleQuality() {
    if (this.disposed) return;
    this.setQuality(this.quality === "standard" ? "low" : "standard");
  }

  private setQuality(q: "standard" | "low") {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === "standard";
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.needsUpdate = true;
      }
    });
    this.resize();
    this.pushHud();
  }

  resetCamera() {
    this.following = false;
    this.target(0, 0, this.width / this.height < 1 ? 140 : 96, 0.68);
    this.yaw = 0;
    this.snapView();
  }

  private target(x: number, z: number, distance: number, pitch: number) {
    this.cameraTarget.set(Number.isFinite(x) ? x : 0, 0, Number.isFinite(z) ? z : 0);
    this.distance = Number.isFinite(distance) ? clamp(distance, 16, 180) : 96;
    this.pitch = Number.isFinite(pitch) ? clamp(pitch, 0.18, 1.35) : 0.68;
  }

  focusSelected() {
    const units = [...this.selected].map(id => this.sim.getUnit(id)).filter((u): u is CombatUnit => !!u);
    if (!units.length) { this.resetCamera(); return; }
    let sx = 0, sz = 0, valid = 0;
    for (const u of units) {
      if (Number.isFinite(u.position.x) && Number.isFinite(u.position.z)) {
        sx += u.position.x;
        sz += u.position.z;
        valid++;
      }
    }
    if (!valid) { this.resetCamera(); return; }
    this.cameraTarget.set(sx / valid, 0, sz / valid);
    this.distance = 58;
    this.clampCamera();
  }

  zoom(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.distance = clamp(this.distance * factor, 16, 180);
  }
  private isInteractive() { return this.sim.phase === "setup" || this.sim.phase === "playing"; }

  private notify(text: string, error = false) {
    this.notice = { id: ++this.noticeId, text, error };
    this.noticeUntil = performance.now() + 2600;
    if (error) this.audio.sfx("error");
    this.pushHud();
  }

  private clearViews() {
    for (const id of this.views.keys()) this.fx?.endTrail(String(id));
    this.unitRenderer.clear();
    this.views.clear();
    this.spawnFx.clear();
    for (const view of this.projectileViews.values()) this.recycleProjectile(view);
    this.projectileViews.clear();
    for (const p of this.particles) { p.life = 0; p.mesh.visible = false; }
    this.markers = [];
    this.fx?.clear();
  }

  /* ================= views & posing ================= */

  private updateViews(dt: number) {
    this.animClock += dt;
    const ids = new Set<number>();
    let fresh = 0;
    for (const u of this.sim.units) {
      ids.add(u.id);
      let rig = this.views.get(u.id);
      if (!rig) {
        rig = buildUnitRig(u.kind, u.team);
        this.views.set(u.id, rig);
        this.unitRenderer.add(u.id, rig);
        this.spawnFx.set(u.id, { birth: this.animClock + Math.min(0.7, fresh * 0.03), landed: false });
        fresh++;
      }
      rig.root.position.copy(u.position);
      rig.root.rotation.set(0, u.facing, 0);
      rig.root.scale.setScalar(rig.scale);
      rig.body.scale.set(1, 1, 1);
      if (u.dead) {
        this.poseDead(u, rig);
        this.selected.delete(u.id);
        continue;
      }
      if (this.spawnFx.has(u.id)) {
        this.applySpawn(u, rig);
        continue;
      }
      if (this.sim.isDown(u)) this.poseKnocked(u, rig);
      else this.poseUnit(u, rig, dt, this.sim.phase === "playing");
    }
    for (const id of this.views.keys()) {
      if (!ids.has(id)) {
        this.fx.endTrail(String(id));
        this.unitRenderer.remove(id);
        this.views.delete(id);
        this.spawnFx.delete(id);
        this.selected.delete(id);
      }
    }
    this.unitRenderer.sync();
    const projectileIds = new Set<number>();
    const emitTrail = dt > 0 && this.quality === "standard" && this.sim.projectiles.length < 40;
    for (const p of this.sim.projectiles) {
      projectileIds.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) { view = this.makeProjectile(p.style, p.team); this.projectileViews.set(p.id, view); }
      view.visible = true;
      view.position.copy(p.position);
      if (p.style === "bomb") view.rotation.x += 0.2;
      else if (p.velocity.lengthSq() > 0.001) view.quaternion.setFromUnitVectors(UP, this.tmp.copy(p.velocity).normalize());
      if (emitTrail && Math.random() < 0.45) {
        if (p.style === "bomb" || p.style === "cannon") {
          this.fx.puff(p.position.x, p.position.y, p.position.z, 1, 0.28, 0x8a8278, 0.4, 0.32);
        } else if (p.style === "rail") {
          this.fx.flare(p.position.x, p.position.y, p.position.z, 0.55, 0x9ff0ff, 0.08);
        } else if (p.style === "bolt") {
          this.fx.flare(p.position.x, p.position.y, p.position.z, 0.45, p.team === 0 ? 0xd0a0ff : 0xffb090, 0.08);
        }
      }
    }
    for (const [id, view] of this.projectileViews) {
      if (!projectileIds.has(id)) { this.recycleProjectile(view); this.projectileViews.delete(id); }
    }
  }

  /** Units drop in from above, land with a squash, and kick up dust. */
  private applySpawn(u: CombatUnit, rig: UnitRig) {
    const fx = this.spawnFx.get(u.id);
    if (!fx) return;
    const age = this.animClock - fx.birth;
    if (age > 1.4) { this.spawnFx.delete(u.id); return; }
    if (age < 0) { rig.root.position.y = -60; return; }
    const pop = clamp(age / 0.14, 0, 1);
    rig.root.scale.setScalar(rig.scale * (0.35 + 0.65 * (1 + 1.4 * Math.pow(pop - 1, 3) + 1.4 * Math.pow(pop - 1, 2))));
    if (age < DROP) {
      const p = age / DROP;
      rig.root.position.y = 7 * (1 - p * p);
      rig.root.rotation.x = 0.35 * (1 - p);
      return;
    }
    if (!fx.landed) {
      fx.landed = true;
      const heavy = DEFS[u.kind].radius > 0.9;
      this.burst(u.position.x, 0.2, u.position.z, 0xd8d0b8, heavy ? 12 : 7, 3.4, 0.22, 0.5, 0.2, 1.4);
      this.groundRings.push({ x: u.position.x, z: u.position.z, age: 0, life: 0.5, size: heavy ? 3.4 : 2.2, color: u.team === 0 ? "#8cbcff" : "#ff9a8a" });
      this.audio.sfx("land", this.panAt(u.position.x, u.position.z));
      if (heavy) this.shake = Math.max(this.shake, 0.3);
    }
    const t = age - DROP;
    const sq = Math.exp(-t * 8) * Math.cos(t * 26);
    rig.body.scale.set(1 + 0.26 * sq, 1 - 0.3 * sq, 1 + 0.26 * sq);
    if (age > 0.9) this.poseUnit(u, rig, 0.016, this.sim.phase === "playing");
  }

  private spring(rig: UnitRig, key: string, target: number, dt: number, freq: number, damp: number) {
    const s = rig.fx[key] ?? (rig.fx[key] = { x: target, v: 0 });
    if (dt <= 0) return s.x;
    const k = freq * freq, c = 2 * damp * freq;
    const steps = Math.max(1, Math.ceil(dt / 0.012));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s.v += (k * (target - s.x) - c * s.v) * h;
      s.x += s.v * h;
    }
    return s.x;
  }

  private poseUnit(u: CombatUnit, rig: UnitRig, dt: number, active: boolean) {
    const d = DEFS[u.kind];
    const pose = POSE[u.kind];
    const pdt = Math.min(dt, 0.05);
    const t = this.animClock + u.id * 1.37;
    const speed = active ? u.velocity.length() : 0;
    const move = clamp(speed / Math.max(1.2, d.speed * 0.8), 0, 1) * (u.slowT > 0 ? 0.6 : 1);
    const gait = u.gait;
    const sw = Math.sin(gait);
    const att = active ? u.animation : -1;
    const knight = u.kind === "knight";
    const zombie = u.kind === "zombie";
    const sp = (key: string, target: number, freq = 18, damp = 0.65) => this.spring(rig, key, target, pdt, freq, damp);

    // Legs / gallop
    if (knight) {
      const amp = 0.8 * move, ph = gait * 0.72;
      rig.flLeg!.rotation.x = Math.sin(ph) * amp;
      rig.brLeg!.rotation.x = Math.sin(ph + 0.4) * amp;
      rig.frLeg!.rotation.x = Math.sin(ph + Math.PI) * amp;
      rig.blLeg!.rotation.x = Math.sin(ph + Math.PI + 0.4) * amp;
      rig.body.rotation.x = Math.sin(ph) * 0.07 * move;
    } else {
      const stride = (zombie ? 0.36 : u.kind === "giant" || u.kind === "troll" ? 0.45 : 0.65) * move;
      rig.lLeg.rotation.x = sw * stride;
      rig.rLeg.rotation.x = zombie ? -sw * stride * 0.4 + 0.18 * move : -sw * stride;
    }

    // Arm, wrist, torso, crouch & lunge targets
    let rX = pose.r - sw * move * pose.swing;
    let lX = pose.l + sw * move * pose.swing;
    let rY = 0, lY = 0;
    let rZ = -0.06, lZ = 0.06;
    let hX = rig.handMode === "fixed" ? rig.handRest - rX : rig.handRest;
    let hZ = 0;
    let tX = rig.tilt + move * (knight ? 0.12 : 0.1);
    let tY = knight ? 0 : -sw * 0.1 * move;
    let lunge = 0;
    let hUp = 0;
    let crouch = 0;

    // Leg drive from a lunge: the stance widens, the rear leg drives, the front leg plants.
    let frontLeg = 0, rearLeg = 0, hipShift = 0;

    if (att >= 0) {
      const rate = (d.rage ? 0.45 + 0.55 * (u.hp / u.maxHp) : 1) * (u.slowT > 0 ? 1.55 : 1);
      const wind = d.windup * rate;
      const split = wind / (wind + 0.3);
      // Three phases: coil (slow), strike (near-instant snap), settle (overshoot, then rest).
      const w = att < split ? easeOut(att / split) : 1;
      const strikePhase = att < split ? 0 : Math.min(1, (att - split) / 0.42);
      const settle = att < split ? 0 : Math.max(0, (att - split - 0.42) / Math.max(0.001, 1 - split - 0.42));
      const s = att < split ? 0 : (att - split) / (1 - split);
      const k = att < split ? 0 : pulse(s);
      const snap = att < split ? 0 : Math.pow(strikePhase, 0.55); // fast whip
      const twoHand = u.kind === "giant" || u.kind === "troll" || u.kind === "halberdier" || u.kind === "paladin" || u.kind === "berserker";

      // Every melee strike drives off the back leg and plants the front one.
      if (!d.ranged) {
        frontLeg = -0.45 * snap + 0.25 * w;
        rearLeg = 0.55 * snap - 0.3 * w;
        hipShift = -0.12 * w + 0.3 * snap - 0.12 * settle;
      }

      this.trailOn = true;
      switch (pose.style) {
        case "thrust":
          // Pull shoulder & hip back while crouching, then drive spear cleanly forward along +Z
          rX = att < split ? lerp(pose.r, 0.7, w) : lerp(0.7, -1.5, snap);
          rY = att < split ? -0.4 * w : lerp(-0.4, 0.2, snap);
          lX = att < split ? lerp(pose.l, -0.55, w) : lerp(-0.55, 0.3, snap);
          hX = att < split ? lerp(0.35, -0.8, w) : lerp(-0.8, 1.5, snap);
          lunge = att < split ? -0.2 * w : 0.72 * snap - 0.2 * (1 - snap) - 0.1 * settle;
          crouch = att < split ? -0.16 * w : -0.05 * snap;
          tX += att < split ? -0.16 * w : 0.32 * snap;
          tY = att < split ? -0.5 * w : lerp(-0.5, 0.42, snap) + 0.12 * settle;
          hUp = att < split ? 0.12 * w : -0.1 * snap;
          break;
        case "lance":
          // Brace couched lance level and drive the whole knight forward
          rX = att < split ? lerp(pose.r, -0.65, w) : lerp(-0.65, -1.35, k);
          hX = -rX - 0.04;
          lunge = att < split ? -0.2 * w : 0.9 * k - 0.2 * (1 - k);
          tX += att < split ? 0.08 * w : 0.34 * k;
          break;
        case "overhead":
          // Cock wrist & weapon behind the head, then whip torso + arm + wrist forward
          rX = att < split ? lerp(pose.r, -2.8, w) : lerp(-2.8, 0.4, snap) - 0.35 * settle;
          lX = twoHand ? (att < split ? lerp(pose.l, -2.6, w) : lerp(-2.6, 0.3, snap) - 0.3 * settle) : lerp(pose.l, 0.45, snap);
          hX = att < split ? lerp(rig.handRest, -0.6, w) : lerp(-0.6, -0.7, snap);
          crouch = att < split ? -0.1 * w : -0.14 * snap;
          tX += att < split ? -0.36 * w : 0.58 * snap - 0.36 * (1 - snap);
          tY = att < split ? -0.22 * w : lerp(-0.22, 0.3, snap);
          lunge = att < split ? -0.16 * w : 0.52 * snap;
          hUp = att < split ? 0.24 * w : -0.16 * snap;
          break;
        case "slash": {
          // True diagonal cross-body sweep with yaw + roll + wrist follow-through
          const dual = u.kind === "assassin" || u.kind === "vampire" || u.kind === "swordsman";
          const shield = u.kind === "guardian";
          rX = att < split ? lerp(pose.r, -1.4, w) : lerp(-1.4, -0.5, snap) - 0.3 * settle;
          rY = att < split ? -0.85 * w : lerp(-0.85, 1.0, snap);
          rZ = att < split ? lerp(-0.08, -1.0, w) : lerp(-1.0, 0.9, snap);
          hX = att < split ? lerp(rig.handRest, -0.45, w) : lerp(-0.45, -1.1, snap);
          hZ = att < split ? -0.24 * w : 0.5 * snap;
          if (dual) {
            lX = att < split ? lerp(pose.l, -0.7, w) : lerp(-0.7, -1.15, snap);
            lY = -rY * 0.7;
            lZ = -rZ * 0.75;
          } else if (shield) {
            lX = -1.05;
            lY = 0.48;
            lZ = 0.15;
          }
          tY = att < split ? -0.62 * w : lerp(-0.62, 0.75, snap) + 0.14 * settle;
          tX += att < split ? -0.12 * w : 0.3 * snap;
          crouch = att < split ? -0.12 * w : -0.07 * snap;
          lunge = att < split ? -0.08 * w : 0.45 * snap - 0.08 * settle;
          break;
        }
        case "shoot": {
          const aim = clamp(att * 6, 0, 1);
          const recoil = att >= split ? Math.exp(-s * 6) : 0;
          lX = lerp(pose.l, -1.48, aim);
          lY = 0.25 * aim;
          rX = lerp(pose.r, -1.42, aim) + 0.28 * recoil;
          rY = -0.35 * aim * (1 - recoil);
          hX = -rX;
          tY = -0.4 * aim;
          tX += -0.12 * recoil;
          hUp = -0.05 * recoil;
          break;
        }
        case "throw":
          rX = att < split ? lerp(pose.r, 1.35, w) : lerp(1.35, -2.35, easeOut(s * 1.6));
          rY = att < split ? -0.4 * w : 0.45 * k;
          lX = att < split ? lerp(pose.l, -0.9, w) : lerp(-0.9, 0.3, s);
          hX = att < split ? -0.35 * w : 0.2 * k;
          tY = att < split ? -0.65 * w : lerp(-0.65, 0.55, k);
          tX += att < split ? -0.32 * w : 0.52 * k - 0.32 * (1 - k);
          lunge = att < split ? -0.1 * w : 0.32 * k;
          break;
        case "cast":
          rX = att < split ? lerp(pose.r, -2.25, w) : lerp(-2.25, -1.25, k);
          lX = att < split ? lerp(pose.l, -1.9, w) : lerp(-1.9, -1.05, k);
          hX = 0.85 - rX * 0.45;
          tX += att < split ? -0.16 * w : 0.28 * k;
          hUp = att < split ? 0.28 * w : -0.12 * k;
          break;
        case "heal": {
          const lift = Math.sin(Math.min(1, att * 1.4) * Math.PI * 0.5);
          rX = lerp(pose.r, -2.05, lift);
          lX = lerp(pose.l, -1.65, lift);
          hX = -rX - 0.2;
          tX += -0.12 * Math.sin(att * Math.PI);
          hUp = 0.32 * Math.sin(att * Math.PI);
          break;
        }
        case "claw":
          rX = att < split ? lerp(pose.r, -2.0, w) : lerp(-2.0, -0.4, snap);
          lX = att < split ? lerp(pose.l, -1.6, w) : lerp(-1.6, -0.5, snap);
          lunge = att < split ? -0.12 * w : 0.42 * snap;
          tX += att < split ? -0.24 * w : 0.48 * snap;
          tY = att < split ? -0.45 * w : lerp(-0.45, 0.52, snap);
          hUp = att < split ? 0.3 * w : -0.22 * snap;
          break;
      }
    }

    // Weapon trail: sample the blade tip while the attack is in motion.
    if (this.trailOn && att >= 0 && att <= 1) {
      const tip = this.tipScratch;
      rig.hand.getWorldPosition(tip);
      const reach = DEFS[u.kind].range * 0.75;
      tip.x += Math.sin(u.facing) * reach;
      tip.z += Math.cos(u.facing) * reach;
      tip.y += 0.2;
      this.fx.trail(String(u.id), tip.x, tip.y, tip.z, 0xfff0c8);
    } else if (this.trailOn) {
      this.fx.endTrail(String(u.id));
    }
    this.trailOn = false;

    // Lunge stance overrides the walk cycle while swinging.
    if (frontLeg !== 0 || rearLeg !== 0 || hipShift !== 0) {
      rig.lLeg.rotation.x = frontLeg;
      rig.rLeg.rotation.x = rearLeg;
      if (!knight) {
        rig.body.position.z = sp("hip", hipShift, 20, 0.6);
        rig.torso.rotation.z = sp("hipz", -0.09 * Math.abs(hipShift) * (1 - Math.abs(hipShift)) * 4, 20, 0.7);
      }
    }

    const flinch = u.flinch;
    rig.rArm.rotation.set(sp("ra", rX, 22, 0.58), sp("ray", rY, 22, 0.58), sp("rz", rZ, 22, 0.6));
    rig.lArm.rotation.set(sp("la", lX, 22, 0.58), sp("lay", lY, 22, 0.58), sp("lz", lZ, 0.6));
    rig.hand.rotation.set(sp("hx_w", hX, 24, 0.58), 0, sp("hz_w", hZ, 24, 0.58));

    rig.torso.rotation.x = sp("tx", tX, 15, 0.7) - flinch * 1.5;
    rig.torso.rotation.y = sp("ty", tY, 16, 0.68);
    rig.torso.rotation.z = Math.sin(t * 0.8) * 0.02 + sw * 0.05 * move + (zombie ? Math.sin(gait * 0.5) * 0.08 * move : 0);
    const bob = Math.abs(sw) * (u.kind === "giant" || u.kind === "troll" ? 0.14 : knight ? 0.08 : 0.1) * move
      + Math.sin(t * 1.7) * 0.014 * (1 - move);
    rig.body.position.y = bob + sp("cr", crouch, 18, 0.65);
    rig.body.position.z = sp("lg", lunge - flinch * 0.35, 18, 0.6);
    rig.body.rotation.z = sw * 0.045 * move;

    const target = active && u.targetId !== null ? this.sim.getUnit(u.targetId) : undefined;
    let yawT = Math.sin(t * 0.34) * 0.45 * (1 - move * 0.6), pitchT = 0;
    if (target) {
      yawT = clamp(wrapAngle(Math.atan2(target.position.x - u.position.x, target.position.z - u.position.z) - u.facing), -0.95, 0.95);
      if (d.ranged) pitchT = -0.06;
    } else pitchT += Math.sin(t * 0.22) * 0.06;
    rig.head.rotation.y = sp("hy", yawT, 12, 0.8);
    rig.head.rotation.x = sp("hx", pitchT - hUp - sw * 0.04 * move, 14, 0.7) - flinch * 0.9;
    rig.head.rotation.z = zombie ? 0.22 + Math.sin(t * 0.6) * 0.08 : sp("hz", sw * 0.03 * move, 12, 0.8);

    if (rig.cloak) {
      const flap = 0.1 + move * 0.7 + Math.sin(t * 4) * 0.05 * (0.3 + move) + flinch * 0.6;
      rig.cloak.rotation.x = sp("cl", flap, 10, 0.45);
    }
  }

  /** TABS-style knockdown: tumble through the air, lie stunned, push back up. */
  private poseKnocked(u: CombatUnit, rig: UnitRig) {
    const dir = Math.atan2(u.lastHit.x, u.lastHit.z) + Math.PI / 2;
    if (u.airborne) {
      rig.root.position.y = u.position.y;
      const spin = u.spin * u.spinAxis;
      rig.root.rotation.set(-spin, u.facing + dir * 0.35, spin * 0.35);
      const flail = Math.sin(this.animClock * 26 + u.id) * 0.55;
      rig.rArm.rotation.set(-1.5 + flail, 0, -0.95);
      rig.lArm.rotation.set(-1.2 - flail, 0, 0.95);
      rig.lLeg.rotation.x = 0.7 - flail * 0.5;
      rig.rLeg.rotation.x = -0.5 + flail * 0.5;
      rig.torso.rotation.set(-0.2, 0, 0);
      rig.head.rotation.set(-0.4, 0, 0);
      return;
    }
    if (u.downTime > 0) {
      rig.root.rotation.set(1.5 * u.spinAxis, u.facing + dir, 0.12 * u.spinAxis);
      rig.root.position.y = -0.16;
      const twitch = Math.sin(this.animClock * 14 + u.id) * 0.12 * Math.min(1, Math.max(0, u.downTime - 0.15));
      rig.rArm.rotation.set(-0.7 + twitch, 0, -0.4);
      rig.lArm.rotation.set(-0.5 - twitch, 0, 0.4);
      rig.lLeg.rotation.x = 0.35;
      rig.rLeg.rotation.x = -0.25;
      rig.torso.rotation.set(0.1, 0, 0);
      rig.head.rotation.set(0.35, 0, 0);
      return;
    }
    const k = clamp(1 - u.getUp / 0.5, 0, 1);
    const rise = easeOut(k);
    const fall = 1 - rise;
    rig.root.rotation.set(1.5 * u.spinAxis * fall, u.facing + dir * fall, 0.12 * u.spinAxis * fall);
    rig.root.position.y = -0.16 * fall + 0.1 * Math.sin(k * Math.PI);
    rig.rArm.rotation.set(lerp(-0.6, POSE[u.kind].r, rise), 0, lerp(-0.4, -0.06, rise));
    rig.lArm.rotation.set(lerp(-0.4, POSE[u.kind].l, rise), 0, lerp(0.4, 0.06, rise));
    rig.lLeg.rotation.x = lerp(0.5, 0, rise);
    rig.rLeg.rotation.x = lerp(-0.35, 0, rise);
    rig.torso.rotation.set(lerp(0.3, rig.tilt, rise), 0, 0);
    rig.head.rotation.set(lerp(0.3, 0, rise), 0, 0);
  }

  private poseDead(u: CombatUnit, rig: UnitRig) {
    const t = u.deathTime;
    const fall = easeOut(t * 2.0);
    const forward = u.lastHit.x * Math.sin(u.facing) + u.lastHit.z * Math.cos(u.facing) > 0;
    const dir = forward ? 1 : -1;
    const side = u.id % 2 ? 1 : -1;
    const knight = u.kind === "knight";
    if (u.airborne) {
      rig.root.position.y = u.position.y;
      rig.root.rotation.set(-u.spin * u.spinAxis, u.facing, u.spin * 0.35);
    } else {
      const hop = t < 0.4 ? Math.sin((t / 0.4) * Math.PI) * (knight ? 0.3 : 0.55) : 0;
      rig.root.rotation.x = knight ? 0 : dir * fall * 1.52;
      rig.root.rotation.z = knight ? side * fall * 1.4 : side * 0.22 * fall;
      rig.root.position.y = hop - (knight ? 0.5 : 0.26) * fall - Math.max(0, t - 3.2) * 1.8;
    }
    rig.body.position.set(0, 0, 0);
    const flail = Math.exp(-t * 4);
    const wob = Math.sin(t * 22 + u.id) * 0.5 * flail;
    rig.rArm.rotation.set(lerp(POSE[u.kind].r, -1.6 * dir * flail + wob, fall), 0, -0.7 * flail - 0.1);
    rig.lArm.rotation.set(lerp(POSE[u.kind].l, -1.3 * dir * flail - wob, fall), 0, 0.7 * flail + 0.1);
    rig.lLeg.rotation.x = 0.5 * flail;
    rig.rLeg.rotation.x = -0.4 * flail;
    rig.torso.rotation.set(0, 0, 0);
    rig.head.rotation.set(0.4 * dir * fall, 0.3 * side * fall, 0);
    if (rig.cloak) rig.cloak.rotation.x = 0.1;
    rig.hand.rotation.set(rig.handRest, 0, 0);
  }

  private makeProjectile(style: string, team: number): THREE.Object3D {
    let view: THREE.Object3D;
    if (style === "bolt") {
      const bolt = this.boltPool.pop() ?? new THREE.Mesh(GEO.sph, new THREE.MeshBasicMaterial());
      (bolt.material as THREE.MeshBasicMaterial).color.setHex(team === 0 ? 0xc77dff : 0xff9a6a);
      bolt.scale.setScalar(0.26);
      view = bolt;
    } else if (style === "bomb") view = this.bombPool.pop() ?? this.buildBomb();
    else if (style === "cannon") view = this.cannonPool.pop() ?? this.buildCannonball();
    else if (style === "pistol") view = this.pistolPool.pop() ?? this.buildBullet();
    else if (style === "rail") view = this.railPool.pop() ?? this.buildRailSlug();
    else if (style === "quarrel") view = this.quarrelPool.pop() ?? this.buildArrow(0.8, 0.06);
    else if (style === "javelin") view = this.javelinPool.pop() ?? this.buildArrow(1.7, 0.045);
    else view = this.arrowPool.pop() ?? this.buildArrow(1.2, 0.035);
    view.userData.style = style;
    this.scene.add(view);
    return view;
  }

  private buildArrow(len: number, thick: number) {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(GEO.cyl, M(0xb69250));
    shaft.scale.set(thick, len, thick);
    const tip = new THREE.Mesh(GEO.cone, M(0xdbe2e8, 0.35, 0.75));
    tip.scale.set(thick * 2.4, 0.25, thick * 2.4);
    tip.position.y = len / 2 + 0.1;
    const fletch = new THREE.Mesh(GEO.box, M(0xf2ede0));
    fletch.scale.set(thick * 5, 0.2, thick * 0.6);
    fletch.position.y = -len / 2 + 0.12;
    arrow.add(shaft, tip, fletch);
    return arrow;
  }

  private buildBomb() {
    const bomb = new THREE.Group();
    const shell = new THREE.Mesh(GEO.sph, M(0x25252a, 0.5, 0.2));
    shell.scale.setScalar(0.34);
    const fuse = new THREE.Mesh(GEO.cyl, M(0xa58a5a));
    fuse.scale.set(0.03, 0.2, 0.03);
    fuse.position.y = 0.38;
    const spark = new THREE.Mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: 0xffb050 }));
    spark.scale.setScalar(0.1);
    spark.position.y = 0.5;
    bomb.add(shell, fuse, spark);
    return bomb;
  }

  private buildCannonball() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(GEO.sph, M(0x2a2d34, 0.4, 0.65));
    shell.scale.setScalar(0.42);
    const glow = new THREE.Mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: 0xff8c3a }));
    glow.scale.set(0.28, 0.55, 0.28);
    glow.position.y = -0.25;
    g.add(shell, glow);
    return g;
  }

  private buildBullet() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0xffe498 }));
    core.scale.set(0.07, 0.65, 0.07);
    const tip = new THREE.Mesh(GEO.sph, M(0xd9a53c, 0.3, 0.8));
    tip.scale.setScalar(0.11);
    tip.position.y = 0.32;
    g.add(core, tip);
    return g;
  }

  private buildRailSlug() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0x9ff0ff }));
    beam.scale.set(0.09, 2.2, 0.09);
    const core = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.scale.set(0.045, 2.4, 0.045);
    g.add(beam, core);
    return g;
  }

  private recycleProjectile(view: THREE.Object3D) {
    view.visible = false;
    this.scene.remove(view);
    view.rotation.set(0, 0, 0);
    switch (view.userData.style) {
      case "bolt": this.boltPool.push(view as THREE.Mesh); break;
      case "bomb": this.bombPool.push(view as THREE.Group); break;
      case "cannon": this.cannonPool.push(view as THREE.Group); break;
      case "pistol": this.pistolPool.push(view as THREE.Group); break;
      case "rail": this.railPool.push(view as THREE.Group); break;
      case "quarrel": this.quarrelPool.push(view as THREE.Group); break;
      case "javelin": this.javelinPool.push(view as THREE.Group); break;
      default: this.arrowPool.push(view as THREE.Group);
    }
  }

  /* ================= effects ================= */

  private burst(x: number, y: number, z: number, color: number, n: number, speed: number, size: number, life: number, grow = 0, gravity = 9) {
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.particleIndex++ % this.particles.length];
      p.mesh.position.set(x, y, z);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 0.9;
      p.mesh.scale.setScalar(size * (0.6 + ((i * 37) % 10) / 12));
      p.mesh.visible = true;
      const a = (i / n) * Math.PI * 2 + (i * 1.7);
      const s = speed * (0.5 + ((i * 53) % 10) / 12);
      p.velocity.set(Math.cos(a) * s, 1.2 + ((i * 29) % 10) / 4, Math.sin(a) * s);
      p.life = p.duration = life * (0.7 + ((i * 17) % 10) / 20);
      p.grow = grow;
      p.gravity = gravity;
    }
  }

  /** Screen-space stereo pan for a world position, so hits land where you see them. */
  private panAt(x: number, z: number): number {
    const p = this.proj(x, 1, z);
    if (!p.visible) return 0;
    return clamp((p.x / this.width) * 2 - 1, -1, 1);
  }

  private facingDir(u: { facing: number }): [number, number] {
    return [Math.sin(u.facing), Math.cos(u.facing)];
  }

  private slashArc(u: CombatUnit) {
    const d = DEFS[u.kind];
    const fx = Math.sin(u.facing), fz = Math.cos(u.facing);
    const px = -fz, pz = fx;
    for (let i = 0; i < 7; i++) {
      const k = (i / 6 - 0.5) * 2;
      const r = d.range * 0.55;
      const p = this.particles[this.particleIndex++ % this.particles.length];
      p.mesh.position.set(u.position.x + fx * r + px * k * r * 0.7, d.height * 0.6 + Math.abs(k) * 0.2, u.position.z + fz * r + pz * k * r * 0.7);
      p.mesh.material.color.setHex(0xfff6d8);
      p.mesh.material.opacity = 0.85;
      p.mesh.scale.setScalar(0.1 + Math.abs(k) * 0.05);
      p.mesh.visible = true;
      p.velocity.set(px * k * 2.4, 1.1, pz * k * 2.4);
      p.life = p.duration = 0.14;
      p.grow = 0.9;
      p.gravity = 0.4;
    }
  }

  private processEffects(dt: number) {
    const events = this.sim.drainEvents();
    const crowded = events.length > 90;
    for (const e of events) {
      const p = e.position;
      const victim = this.sim.units.find(u => !u.dead && u.position.distanceToSquared(p) < 3.2);
      const attacker = this.sim.units.find(u => !u.dead && u.position.distanceToSquared(p) < 3.2 && u.team !== e.team);
      // Impact direction: from the attacker towards the victim.
      let ix = 0, iz = 1;
      if (attacker && victim) {
        ix = victim.position.x - attacker.position.x;
        iz = victim.position.z - attacker.position.z;
        const l = Math.hypot(ix, iz) || 1;
        ix /= l; iz /= l;
      } else if (victim) {
        ix = victim.lastHit.x; iz = victim.lastHit.z;
      }
      switch (e.type) {
        case "spawn": {
          if (crowded) break;
          const c = e.team === 0 ? 0x8cbcff : 0xff9a8a;
          this.fx.shock(p.x, 0.05, p.z, 0.4, 2.6, c, 0.5);
          this.fx.puff(p.x, 0.15, p.z, 4, 0.7, 0xbfb6a6, 0.8, 0.7);
          this.fx.spark(p.x, 0.6, p.z, 0, 1, 0, 8, c, 5);
          break;
        }
        case "swing": {
          this.audio.sfx("swing", this.panAt(p.x, p.z));
          const u = this.sim.units.find(x => !x.dead && x.position.distanceToSquared(p) < 4);
          if (u && !crowded) {
            this.slashArc(u);
            const [fx2, fz2] = this.facingDir(u);
            this.fx.puff(u.position.x + fx2 * 0.8, 1.2, u.position.z + fz2 * 0.8, 2, 0.4, 0xd8d0b8, 0.5, 0.35);
          }
          break;
        }
        case "hit": {
          this.audio.sfx("hit", this.panAt(p.x, p.z));
          this.fx.impact(p.x, 1.25, p.z, ix, iz, crowded ? 0.5 : 1, 0xffd08a);
          if (!crowded && e.value && e.value >= 25 && this.floaters.length < 36) {
            this.floaters.push({
              x: p.x + (Math.random() - 0.5) * 0.6,
              y: 2.5,
              z: p.z,
              text: `-${e.value}`,
              color: e.value >= 55 ? "#ff6b57" : "#ffd08a",
              age: 0,
              life: 0.75,
            });
          }
          break;
        }
        case "block": {
          this.audio.sfx("block", this.panAt(p.x, p.z));
          this.fx.impact(p.x, 1.3, p.z, ix, iz, crowded ? 0.5 : 1, 0xffffff);
          if (!crowded && this.floaters.length < 36) {
            this.floaters.push({ x: p.x, y: 2.5, z: p.z, text: "GUARD", color: "#bfe8ff", age: 0, life: 0.65 });
          }
          break;
        }
        case "launch": {
          this.audio.sfx("charge", this.panAt(p.x, p.z));
          this.fx.flare(p.x, 1.1, p.z, 2.2, 0xfff2d4, 0.16);
          this.fx.spark(p.x, 0.9, p.z, 0, 0.9, 0, crowded ? 3 : 8, 0xffe2a8, 7);
          this.fx.puff(p.x, 0.2, p.z, crowded ? 3 : 6, 0.9, 0xd8cfbe, 0.7, 0.7);
          this.fx.shock(p.x, 0.05, p.z, 0.5, 2.6, 0xf0e6d0, 0.34);
          break;
        }
        case "land": {
          this.audio.sfx("land", this.panAt(p.x, p.z));
          const power = Math.min(1, (e.value ?? 1) / 9);
          this.fx.flare(p.x, 0.5, p.z, 1.8 + power * 2, 0xffe8b8, 0.14);
          this.fx.puff(p.x, 0.18, p.z, 5 + Math.round(power * 5), 0.8 + power, 0xd2c9b6, 0.55, 0.75);
          this.fx.shock(p.x, 0.05, p.z, 0.4, 2.4 + power * 3.2, 0xe8dfc8, 0.4);
          this.fx.chip(p.x, 0.15, p.z, 0, 0, 3, 0xbdb49f);
          this.shake = Math.max(this.shake, Math.min(0.3, (e.value ?? 1) * 0.04));
          break;
        }
        case "death": {
          this.audio.sfx("death", this.panAt(p.x, p.z));
          this.fx.impact(p.x, 1.1, p.z, ix, iz, crowded ? 0.5 : 1.1, 0xffb090);
          this.fx.blood(p.x, 1.0, p.z, ix, iz, crowded ? 4 : 10);
          break;
        }
        case "arrow": case "quarrel": {
          this.audio.sfx(e.type as SfxName, this.panAt(p.x, p.z));
          this.fx.flare(p.x, p.y, p.z, 0.9, 0xffe8b0, 0.1);
          this.fx.spark(p.x, p.y, p.z, -ix, 0.45, -iz, crowded ? 2 : 5, 0xffd8a0, 7);
          this.fx.chip(p.x, p.y, p.z, -ix, -iz, 2, 0xbdb49f);
          break;
        }
        case "pistol": {
          this.audio.sfx("pistol", this.panAt(p.x, p.z));
          this.fx.impact(p.x, p.y, p.z, ix, iz, 0.75, 0xffdca0);
          this.fx.puff(p.x + ix * 0.3, p.y, p.z + iz * 0.3, 3, 0.4, 0xbdb4a4, 0.7, 0.5);
          break;
        }
        case "rail": {
          this.audio.sfx("rail", this.panAt(p.x, p.z));
          this.fx.impact(p.x, p.y, p.z, ix, iz, 1.4, 0x9ff0ff);
          this.fx.lightning(p.x - ix * 3, p.y + 1.5, p.z - iz * 3, p.x, p.y, p.z, 0x9ff0ff);
          this.fx.puff(p.x + ix * 0.6, p.y, p.z + iz * 0.6, 4, 0.5, 0xc8d8e0, 0.5, 0.5);
          break;
        }
        case "bolt": {
          this.audio.sfx("bolt", this.panAt(p.x, p.z));
          const c = e.team === 0 ? 0xd0a0ff : 0xffb090;
          this.fx.impact(p.x, p.y, p.z, ix, iz, 1.05, c);
          this.fx.lightning(p.x, p.y + 7, p.z, p.x, p.y, p.z, c);
          break;
        }
        case "lightning": {
          this.audio.sfx("lightning", this.panAt(p.x, p.z));
          const from = e.target ?? new THREE.Vector3(p.x, p.y + 8, p.z);
          this.fx.lightning(from.x, from.y, from.z, p.x, 1.4, p.z);
          this.fx.impact(p.x, 1.3, p.z, 0, 1, 0.7, 0xcfeaff);
          this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case "bomb": {
          this.audio.sfx("bomb", this.panAt(p.x, p.z));
          this.fx.puff(p.x, p.y, p.z, 2, 0.3, 0xa8a096, 0.4, 0.35);
          break;
        }
        case "boom": {
          const big = (e.value ?? 0) > 0;
          this.audio.sfx("boom", this.panAt(p.x, p.z));
          this.fx.explosion(p.x, 0.7, p.z, big ? 1.6 : 0.85);
          this.shake = Math.max(this.shake, big ? 0.4 : 0.22);
          break;
        }
        case "heal": {
          this.audio.sfx("heal", this.panAt(p.x, p.z));
          // motes drift upward around the healed ally
          for (let i = 0; i < (crowded ? 3 : 7); i++) {
            this.fx.flare(p.x + (Math.random() - 0.5) * 1.1, 0.6 + Math.random(), p.z + (Math.random() - 0.5) * 1.1, 0.32, 0x7dffa8, 0.55);
          }
          this.fx.shock(p.x, 0.05, p.z, 0.3, 1.8, 0x7dffa8, 0.45);
          if (e.value) this.floaters.push({ x: p.x, y: 2.6, z: p.z, text: `+${e.value}`, color: "#7dffa8", age: 0, life: 1.0 });
          break;
        }
        case "charge": {
          this.audio.sfx("charge", this.panAt(p.x, p.z));
          this.shake = Math.max(this.shake, 0.24);
          this.fx.shock(p.x, 0.05, p.z, 0.4, 3.4, 0xffe0a0, 0.4);
          this.fx.puff(p.x, 0.25, p.z, 7, 1.1, 0xe0d6c2, 0.8, 0.7);
          this.fx.spark(p.x, 0.6, p.z, 0, 1, 0, 10, 0xffd890, 7);
          if (!crowded && this.floaters.length < 36) {
            this.floaters.push({ x: p.x, y: 2.9, z: p.z, text: "CHARGE!", color: "#ffe27a", age: 0, life: 0.85 });
          }
          break;
        }
      }
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.velocity.y -= dt * p.gravity;
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.velocity.y *= -0.3; p.velocity.x *= 0.8; p.velocity.z *= 0.8; }
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      p.mesh.material.opacity = clamp(p.life / p.duration, 0, 1) * 0.9;
    }
    this.markers = this.markers.filter(m => { m.age += dt; return m.age < 0.8; });
    this.floaters = this.floaters.filter(f => { f.age += dt; return f.age < f.life; });
    this.groundRings = this.groundRings.filter(r => { r.age += dt; return r.age < r.life; });
  }

  /* ================= input ================= */

  private setPointer(e: PointerEvent) {
    const bounds = this.container.getBoundingClientRect();
    this.pointer.x = e.clientX - bounds.left;
    this.pointer.y = e.clientY - bounds.top;
    this.pointer.shift = e.shiftKey;
    this.pointer.type = e.pointerType;
    this.pointer.over = document.elementFromPoint(e.clientX, e.clientY) === this.renderer.domElement;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.isInteractive()) return;
    e.preventDefault();
    this.audio.init();
    this.setPointer(e);
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* not capturable */ }

    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, { x: this.pointer.x, y: this.pointer.y });
      if (this.touches.size >= 2) {
        this.gesture = null;
        this.boxGesture = null;
        this.beginPinch();
        return;
      }
      // Touch gesture assignment: explicit boxMode > camera mode (left=pan, right=rotate) > place paint > select/pan
      let mode: Gesture["mode"];
      if (this.boxMode) mode = "pan";
      else if (this.mode === "camera") mode = this.pointer.x < this.width / 2 ? "pan" : "rotate";
      else if (this.mode === "place" && this.deployKind) mode = "place";
      else if (this.deployKind) mode = "deploy";
      else mode = "select";

      this.gesture = {
        id: e.pointerId, type: "touch", button: 0, mode, downStamp: e.timeStamp,
        startX: this.pointer.x, startY: this.pointer.y, lastX: this.pointer.x, lastY: this.pointer.y,
        lastWorld: null, shift: false, moved: false,
      };
      if (this.boxMode) this.boxGesture = this.gesture;
      else if (mode === "place") this.placeAt(this.pointer.x, this.pointer.y, this.batchMode);
      return;
    }

    if (!e.isPrimary || ![0, 1, 2].includes(e.button) || this.gesture) return;
    let mode: Gesture["mode"];
    if (e.button === 2) mode = "rotate";
    else if (e.button === 1) mode = "pan";
    else if (this.boxMode) mode = "pan";
    else if (this.mode === "camera") mode = this.pointer.x < this.width / 2 ? "pan" : "rotate";
    else if (this.mode === "place" && this.deployKind) mode = "place";
    else if (this.deployKind) mode = "deploy";
    else mode = "select";

    this.gesture = {
      id: e.pointerId, type: e.pointerType, button: e.button, mode, downStamp: e.timeStamp,
      startX: this.pointer.x, startY: this.pointer.y, lastX: this.pointer.x, lastY: this.pointer.y,
      lastWorld: null, shift: e.shiftKey, moved: false,
    };
    if (e.button === 0 && this.boxMode) this.boxGesture = this.gesture;
    else if (mode === "place") this.placeAt(this.pointer.x, this.pointer.y, this.batchMode || e.shiftKey);
  };

  private beginPinch() {
    const pts = [...this.touches.values()];
    if (pts.length < 2) { this.pinch = null; return; }
    this.pinch = {
      dist: Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
  }

  private onMove = (e: PointerEvent) => {
    this.setPointer(e);
    if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: this.pointer.x, y: this.pointer.y });
      if (this.touches.size >= 2) {
        if (!this.pinch) {
          this.gesture = null;
          this.boxGesture = null;
          this.beginPinch();
          return;
        }
        const pts = [...this.touches.values()];
        const dist = Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        const stepMid = Math.hypot(midX - this.pinch.midX, midY - this.pinch.midY);
        if (stepMid < Math.max(this.width, this.height) * 0.45) {
          this.panByPointer(this.pinch.midX, this.pinch.midY, midX, midY);
        }
        const rawFactor = this.pinch.dist / dist;
        if (Number.isFinite(rawFactor) && Math.abs(rawFactor - 1) > 0.002) {
          this.zoomAt(clamp(rawFactor, 0.72, 1.38), midX, midY);
        }
        this.pinch = { dist, midX, midY };
        return;
      }
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;

    const distMoved = Math.hypot(this.pointer.x - g.startX, this.pointer.y - g.startY);
    // Allow up to 18px micro-jitter during the 450ms hold before pan locks out long-press box select.
    const moveLimit = g.type === "touch" && g.mode === "select" && e.timeStamp - g.downStamp < 450 ? 18
      : g.type === "touch" ? 12 : 6;

    if (g.type === "touch" && g.mode === "select" && !g.moved && !this.boxGesture && e.timeStamp - g.downStamp >= 450) {
      g.mode = "pan";
      this.boxGesture = g;
      this.audio.sfx("select");
    }
    if (distMoved > moveLimit) g.moved = true;

    const dx = clamp(this.pointer.x - g.lastX, -120, 120);
    const dy = clamp(this.pointer.y - g.lastY, -120, 120);
    if (g.mode === "place") {
      this.paintAlong(g);
    } else if (this.boxGesture === g) {
      // box select drag: rectangle is drawn in drawOverlay
    } else if (g.moved && g.mode === "rotate") {
      this.yaw = wrapAngle(this.yaw - dx * 0.005);
      this.pitch = clamp(this.pitch + dy * 0.005, 0.18, 1.35);
      this.snapView();
    } else if (g.moved && (g.mode === "pan" || (g.type === "touch" && (g.mode === "select" || g.mode === "deploy")))) {
      this.panByPointer(g.lastX, g.lastY, this.pointer.x, this.pointer.y);
    }
    g.lastX = this.pointer.x;
    g.lastY = this.pointer.y;
  };

  /** Continuous placement: drop a unit every ~1 diameter of travel while dragging. */
  private paintAlong(g: Gesture) {
    if (!this.deployKind) return;
    const ground = this.groundAt(this.pointer.x, this.pointer.y, this.groundScratchA);
    if (!ground) return;
    const spacing = Math.max(1.6, DEFS[this.deployKind].radius * 2.6);
    if (!g.lastWorld) {
      g.lastWorld = ground.clone();
      this.placeAt(this.pointer.x, this.pointer.y, this.batchMode || g.shift);
      return;
    }
    if (g.lastWorld.distanceTo(ground) >= spacing) {
      g.lastWorld.copy(ground);
      this.placeAt(this.pointer.x, this.pointer.y, this.batchMode || g.shift);
    }
  }

  private onTouchEnd = (e?: TouchEvent) => {
    if (e && e.touches && e.touches.length > 0) return;
    if (this.touches.size === 0 && !this.pinch) return;
    this.touches.clear();
    this.pinch = null;
    if (this.gesture?.type === "touch") { this.gesture = null; this.boxGesture = null; }
  };

  private onUp = (e: PointerEvent) => {
    const touch = e.pointerType === "touch";
    if (touch) {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size >= 2) { this.beginPinch(); return; }
        this.pinch = null;
        this.gesture = null;
        this.boxGesture = null;
        return;
      }
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId || (!touch && g.button !== e.button)) return;
    this.setPointer(e);
    const wasBox = this.boxGesture === g;
    this.boxGesture = null;
    this.gesture = null;
    const over = this.pointer.over;
    if (touch) this.pointer.over = false;
    if (!this.isInteractive() || !over) return;
    if (wasBox) {
      this.boxMode = false;
      this.boxSelect(g);
      return;
    }
    if (g.mode === "place") {
      // already painted during down/drag
    } else if (g.mode === "deploy" && !g.moved) {
      this.placeAt(this.pointer.x, this.pointer.y, this.batchMode || g.shift || e.shiftKey);
    } else if (g.mode === "select") {
      if (g.moved && !touch) this.boxSelect(g);
      else if (!g.moved) {
        if (touch) this.touchTap(this.pointer.x, this.pointer.y, e.timeStamp);
        else this.clickSelect(e.shiftKey, false);
      }
    } else if (g.mode === "pan" && !g.moved) {
      if (touch) this.touchTap(this.pointer.x, this.pointer.y, e.timeStamp);
      else this.clickSelect(e.shiftKey, false);
    } else if (g.mode === "rotate" && !g.moved) {
      if (touch) this.touchTap(this.pointer.x, this.pointer.y, e.timeStamp);
      else if (this.deployKind) this.setDeploy(null);
      else this.commandAt();
    }
  };

  private touchTap(x: number, y: number, stamp: number) {
    const isDouble = stamp - this.lastTap.time < 450 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 22;
    this.lastTap = { time: stamp, x, y };
    if (isDouble) {
      this.lastTap.time = 0;
      this.selectAll();
      return;
    }
    this.clickSelect(false, true);
  }

  private clearInput = () => {
    this.gesture = null;
    this.keys.clear();
    this.pointer.shift = false;
    this.pointer.over = false;
    this.touches.clear();
    this.pinch = null;
    this.boxGesture = null;
  };

  private onBlur = () => {
    this.clearInput();
    if (this.sim.phase === "playing") {
      this.sim.togglePause();
      this.audio.setWarDrums(false);
      this.notify("一時停止中");
    }
  };
  private onVisibility = () => { if (document.hidden) this.onBlur(); this.last = performance.now(); };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.onBlur();
    this.cb.onError("3D描画が中断されました。重いタブを閉じて再読み込みしてください。");
  };
  private onContextMenu = (e: Event) => e.preventDefault();
  private onDoubleClick = (e: MouseEvent) => { if (!this.deployKind && e.button === 0) this.selectAll(); };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.isInteractive()) return;
    const bounds = this.container.getBoundingClientRect();
    this.zoomAt(Math.exp(clamp(e.deltaY, -300, 300) * 0.0012), e.clientX - bounds.left, e.clientY - bounds.top);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "a" && this.isInteractive()) { e.preventDefault(); this.selectAll(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (key === "shift") this.pointer.shift = true;
    if (key === " " && this.sim.phase !== "menu" && this.sim.phase !== "over") {
      e.preventDefault();
      if (e.repeat) return;
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      if (this.sim.phase === "setup") this.beginBattle(); else this.togglePause();
      return;
    }
    if (key === "escape" && !e.repeat) {
      if (this.sim.phase === "paused") this.togglePause();
      else if (this.deployKind) this.setDeploy(null);
      else if (this.boxMode) { this.boxMode = false; this.pushHud(); }
      else if (this.following) { this.following = false; this.pushHud(); }
      else { this.selected.clear(); this.gesture = null; this.pushHud(); }
      return;
    }
    if (e.repeat && ["m", "f", "h", "g", "q", "e", "c", "v", "t", "home", "b", ..."123456789"].includes(key)) return;
    if (key === "m") { this.toggleMute(); return; }
    if (!this.isInteractive()) return;
    if (key === "c") { this.setMode(this.mode === "place" ? "camera" : "place"); return; }
    if (key === "v") { this.toggleFollow(); return; }
    if (key === "t") { this.cycleFormation(); return; }
    if (key >= "1" && key <= "9") {
      const kind = FACTION_UNITS[this.faction][Number(key) - 1];
      if (kind) this.setDeploy(kind);
      return;
    }
    if (key === "q" || key === "[") { this.cycleFaction(-1); return; }
    if (key === "e" || key === "]") { this.cycleFaction(1); return; }
    if (key === "b") { this.toggleBatch(); return; }
    if (key === "g") { this.issueOrder("auto"); return; }
    if (key === "h") { this.issueOrder("hold"); return; }
    if (key === "f") { this.focusSelected(); return; }
    if (key === "home") { e.preventDefault(); this.resetCamera(); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { e.preventDefault(); this.keys.add(key); }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); if (e.key === "Shift") this.pointer.shift = false; };

  /* ================= camera ================= */

  private clampCamera() {
    if (!Number.isFinite(this.cameraTarget.x)) this.cameraTarget.x = 0;
    if (!Number.isFinite(this.cameraTarget.y)) this.cameraTarget.y = 0;
    if (!Number.isFinite(this.cameraTarget.z)) this.cameraTarget.z = 0;
    this.cameraTarget.x = clamp(this.cameraTarget.x, -FIELD.x, FIELD.x);
    this.cameraTarget.y = 0;
    this.cameraTarget.z = clamp(this.cameraTarget.z, -FIELD.z, FIELD.z);
    if (!Number.isFinite(this.distance)) this.distance = 96;
    this.distance = clamp(this.distance, 16, 180);
    if (!Number.isFinite(this.pitch)) this.pitch = 0.68;
    this.pitch = clamp(this.pitch, 0.18, 1.35);
    if (!Number.isFinite(this.yaw)) this.yaw = 0;
  }

  private snapView() {
    this.clampCamera();
    this.vTarget.copy(this.cameraTarget);
    this.vYaw = this.yaw;
    this.vPitch = this.pitch;
    this.vDist = this.distance;
    this.applyCamera();
  }

  private applyCamera() {
    if (!Number.isFinite(this.vTarget.x) || !Number.isFinite(this.vTarget.z)) {
      this.vTarget.set(0, 0, 0);
    }
    this.vTarget.y = 0;
    if (!Number.isFinite(this.vYaw)) this.vYaw = 0;
    if (!Number.isFinite(this.vPitch)) this.vPitch = 0.68;
    if (!Number.isFinite(this.vDist)) this.vDist = 96;
    const cp = Math.cos(this.vPitch);
    this.camera.position.set(Math.sin(this.vYaw) * cp, Math.sin(this.vPitch), Math.cos(this.vYaw) * cp)
      .multiplyScalar(this.vDist).add(this.vTarget);
    if (this.shake > 0.01) this.camera.position.y += Math.sin(this.animClock * 90) * 0.5 * this.shake;
    this.camera.lookAt(this.vTarget);
    this.camera.updateMatrixWorld();
  }

  private panByPointer(x0: number, y0: number, x1: number, y1: number) {
    const a = this.groundAt(x0, y0, this.groundScratchA);
    const b = this.groundAt(x1, y1, this.groundScratchB);
    if (!a || !b) return;
    const dx = a.x - b.x, dz = a.z - b.z;
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    this.following = false;
    this.cameraTarget.x += clamp(dx, -60, 60);
    this.cameraTarget.z += clamp(dz, -60, 60);
    this.clampCamera();
    this.snapView();
  }

  private zoomAt(factor: number, px: number, py: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const a = this.groundAt(px, py, this.groundScratchA);
    this.distance = clamp(this.distance * factor, 16, 180);
    this.vDist = this.distance;
    this.snapView();
    const b = this.groundAt(px, py, this.groundScratchB);
    if (a && b && !this.following) {
      const dx = a.x - b.x, dz = a.z - b.z;
      if (Number.isFinite(dx) && Number.isFinite(dz)) {
        this.cameraTarget.x += clamp(dx, -60, 60);
        this.cameraTarget.z += clamp(dz, -60, 60);
        this.clampCamera();
        this.snapView();
      }
    }
  }

  private onMinimap = (e: PointerEvent) => {
    if (!this.isInteractive()) return;
    e.preventDefault();
    this.following = false;
    try { this.mini.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = this.mini.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const scale = this.minimapScale();
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.cameraTarget.set(
      ((e.clientX - r.left) / r.width * this.mini.width - this.mini.width / 2) / scale,
      0,
      ((e.clientY - r.top) / r.height * this.mini.height - this.mini.height / 2) / scale,
    );
    this.clampCamera();
    this.miniTimer = 0;
  };

  private onMinimapMove = (e: PointerEvent) => {
    if (!(e.buttons & 1) || !this.isInteractive()) return;
    this.onMinimap(e);
  };

  private findNearestFollowTarget(anchor: THREE.Vector3): CombatUnit | undefined {
    const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
    const az = Number.isFinite(anchor.z) ? anchor.z : 0;
    let bestAlly: CombatUnit | undefined;
    let bestAllyDist = Infinity;
    let bestAny: CombatUnit | undefined;
    let bestAnyDist = Infinity;
    for (const u of this.sim.units) {
      if (u.dead || !Number.isFinite(u.position.x) || !Number.isFinite(u.position.z)) continue;
      const d = (u.position.x - ax) ** 2 + (u.position.z - az) ** 2;
      if (u.team === 0 && d < bestAllyDist) {
        bestAllyDist = d;
        bestAlly = u;
      }
      if (d < bestAnyDist) {
        bestAnyDist = d;
        bestAny = u;
      }
    }
    return bestAlly ?? bestAny;
  }

  private updateCamera(dt: number) {
    if (this.isInteractive()) {
      let x = 0, z = 0;
      if (this.keys.has("a") || this.keys.has("arrowleft")) x--;
      if (this.keys.has("d") || this.keys.has("arrowright")) x++;
      if (this.keys.has("w") || this.keys.has("arrowup")) z++;
      if (this.keys.has("s") || this.keys.has("arrowdown")) z--;
      if (x || z) {
        this.following = false;
        const sp = this.distance * 0.9 * dt;
        this.cameraTarget.x -= (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) * sp;
        this.cameraTarget.z -= (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) * sp;
        this.clampCamera();
      }
      if (this.following) {
        for (const id of [...this.selected]) {
          if (!this.sim.getUnit(id)) this.selected.delete(id);
        }
        let tracked = [...this.selected]
          .map(id => this.sim.getUnit(id))
          .filter((u): u is CombatUnit => !!u && Number.isFinite(u.position.x) && Number.isFinite(u.position.z));
        if (!tracked.length) {
          const fallback = this.findNearestFollowTarget(this.cameraTarget);
          if (fallback) {
            this.selected.clear();
            this.selected.add(fallback.id);
            tracked = [fallback];
          } else {
            this.following = false;
            this.pushHud();
          }
        }
        if (tracked.length) {
          let sx = 0, sz = 0;
          for (const u of tracked) {
            sx += u.position.x;
            sz += u.position.z;
          }
          const nx = sx / tracked.length, nz = sz / tracked.length;
          if (Number.isFinite(nx) && Number.isFinite(nz)) {
            this.cameraTarget.set(nx, 0, nz);
            this.clampCamera();
          }
        }
      }
    }
    if (this.sim.phase === "menu") this.yaw = wrapAngle(this.yaw + dt * 0.05);
    this.clampCamera();
    const k = 1 - Math.exp(-12 * dt);
    this.vTarget.lerp(this.cameraTarget, k);
    this.vYaw += wrapAngle(this.yaw - this.vYaw) * k;
    this.vPitch = lerp(this.vPitch, this.pitch, k);
    this.vDist = lerp(this.vDist, this.distance, k);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.applyCamera();
  }

  /* ================= picking & projection ================= */

  private groundAt(x: number, y: number, out = new THREE.Vector3()) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.width <= 0 || this.height <= 0) return null;
    this.ndc.set(x / this.width * 2 - 1, 1 - y / this.height * 2);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.groundPlane, out);
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) && p.distanceTo(this.camera.position) < 400 ? p : null;
  }

  private proj(x: number, y: number, z: number) {
    const p = this.proj3.set(x, y, z).project(this.camera);
    this.P.x = (p.x + 1) / 2 * this.width;
    this.P.y = (1 - p.y) / 2 * this.height;
    this.P.visible = Number.isFinite(p.x) && Number.isFinite(p.y) && p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
    return this.P;
  }

  private pickUnit(team: number | null) {
    let closest: CombatUnit | undefined, best = Infinity;
    const minTol = this.pointer.type === "touch" ? 26 : 13;
    for (const u of this.sim.units) {
      if (u.dead || (team !== null && u.team !== team)) continue;
      const d = DEFS[u.kind];
      const c = this.proj(u.position.x, d.height * 0.5, u.position.z);
      if (!c.visible) continue;
      const cx = c.x, cy = c.y;
      if (Math.abs(cx - this.pointer.x) > 90 || Math.abs(cy - this.pointer.y) > 130) continue;
      const top = this.proj(u.position.x, d.height, u.position.z).y;
      const foot = this.proj(u.position.x, 0, u.position.z).y;
      const tolerance = clamp(Math.abs(foot - top) * 0.5, minTol, 46);
      const distance = Math.hypot(cx - this.pointer.x, cy - this.pointer.y);
      if (distance < tolerance && distance < best) { closest = u; best = distance; }
    }
    return closest;
  }

  private updateHover() {
    this.hoverId = null;
    if (this.pointer.type === "touch" || !this.pointer.over || this.gesture?.moved || !this.isInteractive() || this.deployKind) return;
    const u = this.pickUnit(null);
    if (u) this.hoverId = u.id;
  }

  /* ================= commands ================= */

  private placeAt(px: number, py: number, batch: boolean) {
    if (!this.deployKind) return;
    const kind = this.deployKind;
    const ground = this.groundAt(px, py, this.groundScratchA);
    if (!ground) { this.notify("地面を選んでください", true); return; }
    const result = this.sim.deploy(kind, ground.x, ground.z, batch ? 5 : 1, this.deployTeam);
    if (result.count) {
      this.audio.sfx("deploy", this.panAt(ground.x, ground.z));
      const cost = result.count * DEFS[kind].cost;
      this.floaters.push({ x: ground.x, y: 3.4, z: ground.z, text: `-${cost}`, color: "#f6d98a", age: 0, life: 0.9 });
      this.miniTimer = 0;
    } else {
      if (result.reason === "funds") this.deployFail++;
      const msg = result.reason === "zone"
        ? (this.deployTeam === 0 ? "青い味方エリア内に配置してください" : "赤い敵エリア内に配置してください")
        : (DEPLOY_MESSAGES[result.reason ?? "inactive"] ?? "配置できません");
      this.notify(msg, true);
    }
  }

  private clickSelect(shift: boolean, touch: boolean) {
    const friendly = this.pickUnit(0);
    if (friendly) {
      if (!shift) this.selected.clear();
      if (shift && this.selected.has(friendly.id)) this.selected.delete(friendly.id); else this.selected.add(friendly.id);
      this.audio.sfx("select");
    } else if (this.selected.size && (this.pickUnit(1) || touch)) this.commandAt();
    else if (!shift) this.selected.clear();
    this.pushHud();
  }

  private boxSelect(g: Gesture) {
    if (!g.shift) this.selected.clear();
    const left = Math.min(g.startX, this.pointer.x), right = Math.max(g.startX, this.pointer.x);
    const top = Math.min(g.startY, this.pointer.y), bottom = Math.max(g.startY, this.pointer.y);
    for (const u of this.sim.units) {
      if (u.team !== 0 || u.dead) continue;
      const p = this.proj(u.position.x, DEFS[u.kind].height * 0.5, u.position.z);
      if (p.visible && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) this.selected.add(u.id);
    }
    this.audio.sfx("select");
    this.pushHud();
  }

  private commandAt() {
    if (!this.selected.size) { this.notify("味方を選択してください"); return; }
    const enemy = this.pickUnit(1);
    const ground = enemy ? null : this.groundAt(this.pointer.x, this.pointer.y, this.groundScratchA);
    if (!enemy && (!ground || Math.abs(ground.x) > FIELD.x || Math.abs(ground.z) > FIELD.z)) {
      this.notify("戦場内の地面を指定してください", true);
      return;
    }
    this.sim.command(this.selected, enemy ? "attack" : "move", ground ?? undefined, enemy?.id, this.formation);
    const at = enemy ? enemy.position : ground!;
    this.markers.push({ x: at.x, z: at.z, age: 0 });
    this.audio.sfx("select");
    this.notify(enemy ? "集中攻撃" : `移動（${FORMATION_NAMES[this.formation]}）`);
  }

  /* ================= main loop ================= */

  private loop = (now: number) => {
    if (this.disposed || this.contextLost) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    if (dt > 0) this.fps += (Math.min(120, 1 / dt) - this.fps) * 0.06;
    const cw = this.container.clientWidth || 1280, ch = this.container.clientHeight || 720;
    if (cw !== this.width || ch !== this.height) this.resize();
    this.sim.advance(dt);
    if (this.sim.result && !this.reportedEnd) {
      this.reportedEnd = true;
      this.deployKind = null;
      this.boxMode = false;
      this.following = false;
      this.clearInput();
      this.audio.setWarDrums(false);
      this.audio.sfx(this.sim.result.winner === 0 ? "win" : "lose");
      this.cb.onEnd(this.sim.result);
      this.pushHud();
    }
    const phase = this.sim.phase;
    const animDt = phase === "paused" ? 0 : dt * (phase === "playing" ? this.sim.speed : 1);
    this.updateViews(animDt);
    this.processEffects(animDt);
    this.fx.update(animDt);
    this.updateCamera(dt);
    this.updateHover();
    this.zones.visible = phase === "setup" || this.deployKind !== null;
    const hovered = this.hoverId !== null ? this.sim.getUnit(this.hoverId) : undefined;
    this.renderer.domElement.style.cursor = (this.deployKind && this.mode === "place") || this.boxMode ? "crosshair"
      : this.gesture?.mode === "rotate" || (this.gesture?.mode === "pan" && !this.boxGesture) ? "grabbing"
      : hovered ? (hovered.team === 1 && this.selected.size ? "crosshair" : "pointer") : "default";
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
    this.miniTimer -= dt;
    if (this.miniTimer <= 0) { this.miniTimer = 0.1; this.drawMinimap(); }
    this.autoQuality(dt);
    this.updateTelemetry();
    this.hudTimer -= dt;
    if (this.notice && now > this.noticeUntil) { this.notice = null; this.hudTimer = 0; }
    if (this.hudTimer <= 0) { this.hudTimer = 0.12; this.pushHud(); }
  };

  private autoQuality(dt: number) {
    if (this.quality !== "standard" || this.sim.phase !== "playing") { this.lowFpsTime = 0; return; }
    this.lowFpsTime = this.fps < 26 ? this.lowFpsTime + dt : Math.max(0, this.lowFpsTime - dt);
    if (this.lowFpsTime > 4) {
      this.lowFpsTime = 0;
      this.setQuality("low");
      this.notify("軽量画質に切り替えました");
    }
  }

  private updateTelemetry() {
    const x = Math.round(this.cameraTarget.x), z = Math.round(this.cameraTarget.z), d = Math.round(this.distance);
    const y = Math.round(this.yaw * 100), p = this.pitch.toFixed(3);
    const sig = `${x}|${z}|${d}|${y}|${p}|${this.sim.sceneIndex}`;
    if (sig === this.telemetry) return;
    this.telemetry = sig;
    const el = this.container.parentElement;
    if (el) {
      el.dataset.camX = String(x); el.dataset.camZ = String(z); el.dataset.cam = String(d);
      el.dataset.camYaw = String(y); el.dataset.camPitch = p; el.dataset.scene = String(this.sim.sceneIndex);
    }
  }

  /* ================= 2D overlay ================= */

  private drawRing(x: number, z: number, radius: number, color: string, width = 1.6) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * Math.PI * 2;
      const p = this.proj(x + Math.cos(a) * radius, 0.06, z + Math.sin(a) * radius);
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }

  private drawOverlay() {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    if (this.sim.phase === "menu") return;
    const pulseAmt = 0.5 + 0.5 * Math.sin(this.animClock * 5);

    // King's command aura ring (11m radius) & Paladin heal aura
    for (const u of this.sim.units) {
      if (u.dead) continue;
      if (u.kind === "king") {
        c.globalAlpha = 0.25 + 0.15 * pulseAmt;
        this.drawRing(u.position.x, u.position.z, DEFS.king.buffRange ?? 11, u.team === 0 ? "#f6d98a" : "#ff9a6a", 1.8);
      }
    }
    c.globalAlpha = 1;

    for (const r of this.groundRings) {
      const k = r.age / r.life;
      c.globalAlpha = 1 - k;
      this.drawRing(r.x, r.z, r.size * easeOut(k), r.color, 2.5);
    }
    c.globalAlpha = 1;
    for (const [id, fx] of this.spawnFx) {
      const age = this.animClock - fx.birth;
      if (age < 0 || age > DROP) continue;
      const u = this.sim.getUnit(id);
      if (!u) continue;
      const k = age / DROP;
      c.globalAlpha = 0.35 + 0.6 * k;
      this.drawRing(u.position.x, u.position.z, DEFS[u.kind].radius * (3.2 - 1.8 * k), u.team === 0 ? "#9fc7ff" : "#ff9f90", 2);
    }
    c.globalAlpha = 1;

    if (this.hoverId !== null) {
      const u = this.sim.getUnit(this.hoverId);
      if (u) this.drawRing(u.position.x, u.position.z, DEFS[u.kind].radius * 1.8, u.team === 0 ? "rgba(190,220,255,0.95)" : "rgba(255,150,130,0.95)", 2);
    }
    for (const id of this.selected) {
      const u = this.sim.getUnit(id);
      if (!u) continue;
      c.globalAlpha = 0.6 + 0.4 * pulseAmt;
      this.drawRing(u.position.x, u.position.z, DEFS[u.kind].radius * 1.6, "#8cbcff", 2.2);
      c.globalAlpha = 1;
      if (u.destination) {
        const from = this.proj(u.position.x, 0.1, u.position.z);
        const to = this.proj(u.destination.x, 0.1, u.destination.z);
        c.strokeStyle = "rgba(190,218,255,0.4)";
        c.setLineDash([4, 5]);
        c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
        c.setLineDash([]);
      }
    }
    for (const u of this.sim.units) {
      if (u.dead || (u.hp >= u.maxHp - 0.01 && !this.selected.has(u.id))) continue;
      const rig = this.views.get(u.id);
      const y = (rig?.headH ?? 2.5) + 0.35 + (u.airborne ? u.position.y : 0);
      const p = this.proj(u.position.x, y, u.position.z);
      if (!p.visible) continue;
      const w = DEFS[u.kind].radius > 0.9 ? 40 : 28, frac = clamp(u.hp / u.maxHp, 0, 1);
      c.fillStyle = "rgba(8,10,14,0.82)"; c.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
      c.fillStyle = u.slowT > 0 ? "#8fd8ff" : frac > 0.5 ? (u.team === 0 ? "#79b4ff" : "#f08069") : frac > 0.25 ? "#f0c55a" : "#ff5a4a";
      c.fillRect(p.x - w / 2, p.y, w * frac, 4);
    }
    for (const m of this.markers) {
      c.globalAlpha = 1 - m.age / 0.8;
      this.drawRing(m.x, m.z, 0.6 + m.age * 3.2, "#eec25f", 2.4);
      c.globalAlpha = 1;
    }

    if (this.showcaseMode && this.sim.phase === "setup") {
      c.textAlign = "center";
      let n = 0;
      for (const u of this.sim.units) {
        if (u.team !== 1) continue;
        const p = this.proj(u.position.x, 0, u.position.z);
        if (!p.visible) continue;
        const row = (n++ % 2) * 32;
        const d = DEFS[u.kind];
        c.font = "bold 12px sans-serif";
        const w = Math.max(64, c.measureText(d.name).width + 18);
        c.fillStyle = "rgba(10,14,20,0.86)";
        c.fillRect(p.x - w / 2, p.y + 6 + row, w, 29);
        c.fillStyle = "#f6d98a";
        c.fillText(d.name, p.x, p.y + 19 + row);
        c.font = "10px sans-serif";
        c.fillStyle = "#a9b4c6";
        c.fillText(`${d.role} ${d.cost}`, p.x, p.y + 31 + row);
      }
    }

    c.font = "bold 14px sans-serif";
    c.textAlign = "center";
    for (const f of this.floaters) {
      const k = f.age / f.life;
      const p = this.proj(f.x, f.y + k * 1.8, f.z);
      if (!p.visible) continue;
      c.globalAlpha = 1 - k * k;
      c.lineWidth = 3;
      c.strokeStyle = "rgba(8,10,14,0.9)";
      c.strokeText(f.text, p.x, p.y);
      c.fillStyle = f.color;
      c.fillText(f.text, p.x, p.y);
    }
    c.globalAlpha = 1;

    // Subtle atmospheric weather overlay per scene (Snow in Scene 3, Embers in Scene 2/4, Mist spores in Scene 1)
    if (this.quality === "standard" && !this.showcaseMode) {
      const count = 24;
      c.fillStyle = this.sceneId === 3 ? "rgba(235,248,255,0.45)" : this.sceneId === 2 ? "rgba(255,180,95,0.38)" : this.sceneId === 4 ? "rgba(255,205,120,0.34)" : "rgba(180,210,165,0.28)";
      for (let i = 0; i < count; i++) {
        const seed = i * 97.31;
        const speedY = this.sceneId === 3 ? 38 : -24;
        const px = ((seed * 17.3 + this.animClock * (12 + (i % 5) * 3)) % this.width + this.width) % this.width;
        const py = ((seed * 29.7 + this.animClock * speedY) % this.height + this.height) % this.height;
        const r = this.sceneId === 3 ? 1.8 + (i % 2) * 0.8 : 1.3 + (i % 2) * 0.6;
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    const g = this.boxGesture ?? (this.gesture?.mode === "select" && this.gesture.moved && this.gesture.type !== "touch" ? this.gesture : null);
    if (g) {
      c.fillStyle = "rgba(238,194,95,0.12)"; c.strokeStyle = "#eec25f"; c.lineWidth = 1.5;
      c.fillRect(g.startX, g.startY, this.pointer.x - g.startX, this.pointer.y - g.startY);
      c.strokeRect(g.startX, g.startY, this.pointer.x - g.startX, this.pointer.y - g.startY);
    }
    if (this.deployKind && this.mode === "place" && this.pointer.over && this.isInteractive()) {
      const point = this.groundAt(this.pointer.x, this.pointer.y, this.groundScratchA);
      if (!point) return;
      const def = DEFS[this.deployKind];
      const batch = (this.pointer.type !== "touch" && this.pointer.shift) || this.batchMode;
      const team = this.deployTeam;
      const inZone = this.sim.isDeployPosition(point.x, point.z, team);
      const hasCap = this.sim.count(team) < MAX_PER_TEAM;
      const hasFunds = this.sim.gold[team] >= def.cost;
      const phaseOk = this.sim.phase === "setup" || (this.sim.allowBattleDeploy && this.sim.count(team) > 0);
      const valid = inZone && hasCap && hasFunds && phaseOk;
      const okColor = team === 0 ? "#f6d98a" : "#ff9f90";
      const color = valid ? okColor : "#ff6552";
      c.globalAlpha = 0.65 + 0.35 * pulseAmt;
      this.drawRing(point.x, point.z, (batch ? 2.8 : 1.3) + def.radius * 0.6, color, 2.2);
      c.globalAlpha = 1;
      const base = this.proj(point.x, 0, point.z);
      const baseX = base.x, baseY = base.y;
      const top = this.proj(point.x, 3.4, point.z);
      c.strokeStyle = color; c.setLineDash([3, 4]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(baseX, baseY); c.lineTo(top.x, top.y); c.stroke(); c.setLineDash([]);
      const canAfford = Math.min(batch ? 5 : 1, Math.floor(this.sim.gold[team] / def.cost), MAX_PER_TEAM - this.sim.count(team));
      const label = valid
        ? `${def.name} ×${canAfford}  -${def.cost * canAfford}`
        : !phaseOk ? DEPLOY_MESSAGES.inactive
        : !inZone ? DEPLOY_MESSAGES.zone
        : !hasCap ? DEPLOY_MESSAGES.limit
        : DEPLOY_MESSAGES.funds;
      c.font = "bold 11px sans-serif"; c.textAlign = "center";
      const boxW = Math.max(124, Math.ceil(c.measureText(label).width + 20));
      c.fillStyle = "rgba(11,14,20,0.88)"; c.fillRect(baseX - boxW / 2, baseY + 16, boxW, 22);
      c.fillStyle = color;
      c.fillText(label, baseX, baseY + 31);
    }
  }

  private minimapScale() { return Math.min(this.mini.width / (FIELD.x * 2 + 12), this.mini.height / (FIELD.z * 2 + 12)); }

  private drawMinimap() {
    const c = this.miniCtx, w = this.mini.width, h = this.mini.height;
    const s = this.minimapScale(), cx = w / 2, cy = h / 2;
    c.fillStyle = "#0c1416"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(63,127,214,0.15)"; c.fillRect(0, 0, cx - 3 * s, h);
    c.fillStyle = "rgba(208,69,58,0.15)"; c.fillRect(cx + 3 * s, 0, cx, h);
    c.strokeStyle = "#424c4a"; c.strokeRect(cx - FIELD.x * s, cy - FIELD.z * s, FIELD.x * 2 * s, FIELD.z * 2 * s);
    c.fillStyle = "#6d756c";
    for (const o of terrainObstacles(this.sim.sceneIndex)) {
      c.beginPath(); c.arc(cx + o.x * s, cy + o.z * s, o.radius * s, 0, Math.PI * 2); c.fill();
    }
    for (const u of this.sim.units) {
      if (u.dead) continue;
      c.fillStyle = this.selected.has(u.id) ? "#f6d98a" : TEAM_COLORS_CSS[u.team];
      const sz = DEFS[u.kind].radius > 0.9 ? 4 : 3;
      c.fillRect(cx + u.position.x * s - sz / 2, cy + u.position.z * s - sz / 2, sz, sz);
    }
    c.strokeStyle = "rgba(246,217,138,0.8)"; c.beginPath();
    const corners = [[0, this.height * 0.18], [this.width, this.height * 0.18], [this.width, this.height * 0.82], [0, this.height * 0.82]];
    corners.forEach(([x, y], i) => {
      const p = this.groundAt(x, y, this.groundScratchA) ?? this.cameraTarget;
      const px = clamp(cx + p.x * s, -w, w * 2), py = clamp(cy + p.z * s, -h, h * 2);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    });
    c.closePath(); c.stroke();
  }

  private buildSelectedUnitSummary(): SelectedUnitSummary | null {
    const id = this.selected.size === 1 ? [...this.selected][0] : this.hoverId;
    if (id === null || id === undefined) return null;
    const u = this.sim.getUnit(id);
    if (!u) return null;
    const d = DEFS[u.kind];
    const buffs: string[] = [];
    if (this.sim.buffFor(u) > 0) buffs.push("👑王の威光+30%");
    if (u.kind === "knight" && u.chargeReady) buffs.push("⚡突撃準備");
    if (d.rage && u.hp < u.maxHp * 0.8) buffs.push("🔥狂乱加速");
    if (d.shield && !this.sim.isDown(u)) buffs.push(`🛡️正面盾+${Math.round(d.shield * 100)}%`);
    if (this.sim.isDown(u)) buffs.push("💫転倒中");
    if (u.slowT > 0) buffs.push("❄️減速中");
    if (d.regen) buffs.push("💚自己再生");
    return {
      name: d.name,
      role: d.role,
      hp: Math.ceil(u.hp),
      maxHp: u.maxHp,
      kills: u.kills,
      damage: Math.round(u.damageDealt),
      buffs,
    };
  }

  private pushHud() {
    if (this.disposed) return;
    const stage: Stage | null = this.story ? STAGES[this.stageIndex] ?? null : null;
    const hud: HudState = {
      phase: this.sim.phase, time: Math.floor(this.sim.time), speed: this.sim.speed,
      budget: [Math.floor(this.sim.gold[0]), Math.floor(this.sim.gold[1])],
      counts: [this.sim.count(0), this.sim.count(1)], kills: [...this.sim.kills], losses: [...this.sim.losses],
      sel: this.selected.size, deploy: this.deployKind, deployTeam: this.deployTeam, faction: this.faction, batch: this.batchMode,
      boxMode: this.boxMode, mode: this.mode, story: this.story, stageIndex: this.stageIndex, sceneId: this.sceneId,
      stageName: stage ? `${stage.scene}-${stage.id - (stage.scene - 1) * 5} ${stage.name}` : "",
      stageHint: stage?.hint ?? "",
      showcase: this.showcaseMode, muted: this.audio.muted, canUndo: this.sim.canUndo,
      resolving: this.sim.eliminationTime > 0 ? Math.ceil(Math.max(0, RESULT_DELAY - this.sim.eliminationTime)) : null,
      notice: this.notice, quality: this.quality, fps: Math.round(this.fps / 5) * 5, deployFail: this.deployFail,
      teamHp: [this.sim.teamHp(0), this.sim.teamHp(1)],
      formation: this.formation,
      following: this.following,
      selectedUnit: this.buildSelectedUnitSummary(),
    };
    const sig = JSON.stringify(hud);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    this.cb.onHud(hud);
  }

  private onResize = () => {
    this.resize();
  };

  private resize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(this.container.clientWidth || rect.width || window.innerWidth || 1280));
    this.height = Math.max(1, Math.round(this.container.clientHeight || rect.height || window.innerHeight || 720));
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === "low" ? 1 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
    this.overlay.width = Math.max(1, Math.floor(this.width * dpr));
    this.overlay.height = Math.max(1, Math.floor(this.height * dpr));
    this.overlay.style.width = `${this.width}px`;
    this.overlay.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.miniTimer = 0;
    if (!this.contextLost) {
      this.drawOverlay();
      this.drawMinimap();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clearInput();
    this.clearViews();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.clearInput);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("dblclick", this.onDoubleClick);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.mini.removeEventListener("pointerdown", this.onMinimap);
    this.mini.removeEventListener("pointermove", this.onMinimapMove);
    this.audio.dispose();
    this.stageEnv?.dispose();
    this.stageEnv = null;
    this.unitRenderer.dispose();
    this.fx.dispose();
    const sharedGeo = new Set<THREE.BufferGeometry>(Object.values(GEO));
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        if (!sharedGeo.has(object.geometry)) geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of list) materials.add(m);
      }
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
    this.arrowPool = [];
    this.quarrelPool = [];
    this.javelinPool = [];
    this.boltPool = [];
    this.bombPool = [];
    this.pistolPool = [];
    this.cannonPool = [];
    this.railPool = [];
    this.particles = [];
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}

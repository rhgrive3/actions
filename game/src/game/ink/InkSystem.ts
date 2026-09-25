import * as THREE from "three";

/**
 * Ink state lives in two GPU render targets:
 *  - floorRT: world XZ top-down projection of every paintable floor (1024 x 2048, ~5.8 cm/texel)
 *  - wallRT : atlas of 16x16 tiles (128px each) for paintable wall faces
 * Encoding: R = team0 ownership, G = team1 ownership, B = per-splat variation (wet spec), A = painted
 * Stamps are batched each frame as instanced quads with a procedural splat fragment shader.
 * A coarse CPU mirror grid answers gameplay queries (movement, AI, live score) with no GPU readback;
 * an exact GPU readback runs at match end for the final result.
 */

export const FLOOR_W = 1024, FLOOR_H = 2048;
export const WALL_RES = 2048, WALL_TILES = 16, WALL_TILE_PX = WALL_RES / WALL_TILES;
export const CPU_W = 128, CPU_H = 256;
export const WALL_CPU = 12;
const MAX_STAMPS = 4096;

export interface WallTile {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  width: number;
  height: number;
  normal: THREE.Vector3;
  cpu: Uint8Array; // WALL_CPU x WALL_CPU
}

export interface StampParams {
  mode: 0 | 1; // 0 floor, 1 wall
  tile: number;
  x: number; z: number; // world (mode 0)
  u: number; v: number; // metres in tile space (mode 1)
  radius: number; // metres
  aspect: number; // 1 = round, >1 = stretched along rot
  rot: number;
  shape: number;
  team: number;
  seed: number;
}

export class InkSystem {
  floorRT: THREE.WebGLRenderTarget;
  wallRT: THREE.WebGLRenderTarget;
  bounds: { x0: number; z0: number; x1: number; z1: number };
  cpuFloor = new Uint8Array(CPU_W * CPU_H); // 0 none,1 team0,2 team1
  scoreMask = new Uint8Array(CPU_W * CPU_H); // 1 = eligible
  walls: WallTile[] = [];
  private queue: StampParams[] = [];
  private stampMesh: THREE.InstancedMesh;
  private stampScene = new THREE.Scene();
  private stampCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private aPos: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  stampsThisFrame = 0;
  totalStamps = 0;
  liveScore = [0, 0];
  eligibleCells = 0;
  private scoreCursor = 0;
  private scoreCounts = [0, 0];
  private stampPool: StampParams[] = [];

  constructor(private renderer: THREE.WebGLRenderer, bounds: { x0: number; z0: number; x1: number; z1: number }) {
    this.bounds = bounds;
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    };
    this.floorRT = new THREE.WebGLRenderTarget(FLOOR_W, FLOOR_H, opts);
    this.wallRT = new THREE.WebGLRenderTarget(WALL_RES, WALL_RES, opts);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 3), 3).setUsage(THREE.DynamicDrawUsage); // rx, ry, rot
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4).setUsage(THREE.DynamicDrawUsage); // team, seed, shape, aspectK
    geo.setAttribute("aPos", this.aPos); geo.setAttribute("aSize", this.aSize); geo.setAttribute("aMisc", this.aMisc);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: STAMP_VS, fragmentShader: STAMP_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending, side: THREE.DoubleSide,
    });
    this.stampMesh = new THREE.InstancedMesh(geo, this.mat, MAX_STAMPS);
    this.stampMesh.frustumCulled = false;
    this.stampScene.add(this.stampMesh);
    this.clear();
  }

  clear() {
    const prev = this.renderer.getRenderTarget();
    const c = this.renderer.getClearColor(new THREE.Color()); const a = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.floorRT); this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(this.wallRT); this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(prev); this.renderer.setClearColor(c, a);
    this.cpuFloor.fill(0);
    for (const w of this.walls) w.cpu.fill(0);
    this.liveScore = [0, 0]; this.totalStamps = 0;
  }

  registerWall(origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, width: number, height: number, normal: THREE.Vector3): number {
    if (this.walls.length >= WALL_TILES * WALL_TILES) return -1;
    this.walls.push({ origin: origin.clone(), u: u.clone(), v: v.clone(), width, height, normal: normal.clone(), cpu: new Uint8Array(WALL_CPU * WALL_CPU) });
    return this.walls.length - 1;
  }

  tileUV(tile: number, u01: number, v01: number, out: THREE.Vector2) {
    const tx = tile % WALL_TILES, ty = Math.floor(tile / WALL_TILES);
    out.set((tx + u01 * 0.96 + 0.02) / WALL_TILES, (ty + v01 * 0.96 + 0.02) / WALL_TILES);
  }

  private alloc(): StampParams {
    return this.stampPool.pop() ?? { mode: 0, tile: -1, x: 0, z: 0, u: 0, v: 0, radius: 0.5, aspect: 1, rot: 0, shape: 0, team: 0, seed: 0 };
  }

  /** Paint the floor at world position. */
  stampFloor(x: number, z: number, radius: number, team: number, shape = 0, rot = 0, aspect = 1, seed = Math.random()) {
    if (this.queue.length >= MAX_STAMPS) return;
    const s = this.alloc();
    s.mode = 0; s.x = x; s.z = z; s.radius = radius; s.team = team; s.shape = shape; s.rot = rot; s.aspect = aspect; s.seed = seed; s.tile = -1;
    this.queue.push(s);
    this.cpuStampFloor(x, z, radius * 0.85, aspect, rot, team);
  }

  /** Paint a wall tile at world hit point. */
  stampWall(tile: number, point: THREE.Vector3, radius: number, team: number, shape = 0, seed = Math.random()) {
    if (tile < 0 || this.queue.length >= MAX_STAMPS) return;
    const w = this.walls[tile];
    const dx = point.x - w.origin.x, dy = point.y - w.origin.y, dz = point.z - w.origin.z;
    const u = dx * w.u.x + dy * w.u.y + dz * w.u.z;
    const v = dx * w.v.x + dy * w.v.y + dz * w.v.z;
    const s = this.alloc();
    s.mode = 1; s.tile = tile; s.u = u; s.v = v; s.radius = radius; s.team = team; s.shape = shape; s.rot = seed * 6.28; s.aspect = 1; s.seed = seed;
    this.queue.push(s);
    // cpu
    const cu = Math.floor((u / w.width) * WALL_CPU), cv = Math.floor((v / w.height) * WALL_CPU);
    const rr = Math.max(1, Math.round((radius / Math.max(w.width, w.height)) * WALL_CPU));
    for (let j = cv - rr; j <= cv + rr; j++) for (let i = cu - rr; i <= cu + rr; i++) {
      if (i < 0 || j < 0 || i >= WALL_CPU || j >= WALL_CPU) continue;
      if ((i - cu) * (i - cu) + (j - cv) * (j - cv) <= rr * rr) w.cpu[j * WALL_CPU + i] = team + 1;
    }
  }

  private cpuStampFloor(x: number, z: number, radius: number, aspect: number, rot: number, team: number) {
    const b = this.bounds;
    const cw = (b.x1 - b.x0) / CPU_W, ch = (b.z1 - b.z0) / CPU_H;
    const cx = (x - b.x0) / cw, cz = (z - b.z0) / ch;
    const rmax = radius * Math.max(1, aspect);
    const rx = rmax / cw, rz = rmax / ch;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let j = Math.floor(cz - rz); j <= Math.ceil(cz + rz); j++) {
      if (j < 0 || j >= CPU_H) continue;
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        if (i < 0 || i >= CPU_W) continue;
        const wx = (i + 0.5) * cw - (x - b.x0), wz = (j + 0.5) * ch - (z - b.z0);
        const lx = (wx * cs + wz * sn) / (radius * aspect), lz = (-wx * sn + wz * cs) / radius;
        if (lx * lx + lz * lz <= 1) {
          const idx = j * CPU_W + i;
          if (this.scoreMask[idx]) this.cpuFloor[idx] = team + 1;
        }
      }
    }
  }
  /** Team ownership at world floor position: -1 none, 0, 1 */
  floorTeamAt(x: number, z: number): number {
    const b = this.bounds;
    const i = Math.floor(((x - b.x0) / (b.x1 - b.x0)) * CPU_W), j = Math.floor(((z - b.z0) / (b.z1 - b.z0)) * CPU_H);
    if (i < 0 || j < 0 || i >= CPU_W || j >= CPU_H) return -1;
    return this.cpuFloor[j * CPU_W + i] - 1;
  }

  wallTeamAt(tile: number, point: THREE.Vector3): number {
    if (tile < 0) return -1;
    const w = this.walls[tile];
    const dx = point.x - w.origin.x, dy = point.y - w.origin.y, dz = point.z - w.origin.z;
    const u = dx * w.u.x + dy * w.u.y + dz * w.u.z, v = dx * w.v.x + dy * w.v.y + dz * w.v.z;
    const cu = Math.min(WALL_CPU - 1, Math.max(0, Math.floor((u / w.width) * WALL_CPU)));
    const cv = Math.min(WALL_CPU - 1, Math.max(0, Math.floor((v / w.height) * WALL_CPU)));
    return w.cpu[cv * WALL_CPU + cu] - 1;
  }

  /** Coverage fraction [0..1] of team ink in a radius around (x,z) on the CPU grid. */
  areaCoverage(x: number, z: number, radius: number, out: number[]) {
    const b = this.bounds;
    const cw = (b.x1 - b.x0) / CPU_W, ch = (b.z1 - b.z0) / CPU_H;
    const cx = (x - b.x0) / cw, cz = (z - b.z0) / ch, rx = radius / cw, rz = radius / ch;
    let n = 0, a = 0, bb = 0, none = 0;
    for (let j = Math.floor(cz - rz); j <= Math.ceil(cz + rz); j++) {
      if (j < 0 || j >= CPU_H) continue;
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        if (i < 0 || i >= CPU_W) continue;
        const idx = j * CPU_W + i;
        if (!this.scoreMask[idx]) continue;
        n++;
        const v = this.cpuFloor[idx];
        if (v === 1) a++; else if (v === 2) bb++; else none++;
      }
    }
    out[0] = n ? a / n : 0; out[1] = n ? bb / n : 0; out[2] = n ? none / n : 0; out[3] = n;
  }

  /** Flush queued stamps to GPU (call once per rendered frame). */
  flush() {
    this.stampsThisFrame = this.queue.length;
    if (this.queue.length === 0) return;
    const prev = this.renderer.getRenderTarget();
    const prevAuto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    const b = this.bounds;
    const bw = b.x1 - b.x0, bh = b.z1 - b.z0;
    for (let pass = 0; pass < 2; pass++) {
      let n = 0;
      for (const s of this.queue) {
        if (s.mode !== pass) continue;
        if (pass === 0) {
          this.aPos.setXY(n, (s.x - b.x0) / bw, (s.z - b.z0) / bh);
          this.aSize.setXYZ(n, (s.radius * s.aspect) / bw, s.radius / bh, s.rot);
        } else {
          const w = this.walls[s.tile];
          const tx = s.tile % WALL_TILES, ty = Math.floor(s.tile / WALL_TILES);
          const u01 = s.u / w.width, v01 = s.v / w.height;
          this.aPos.setXY(n, (tx + 0.02 + Math.min(1, Math.max(0, u01)) * 0.96) / WALL_TILES, (ty + 0.02 + Math.min(1, Math.max(0, v01)) * 0.96) / WALL_TILES);
          this.aSize.setXYZ(n, (s.radius / w.width) * 0.96 / WALL_TILES, (s.radius / w.height) * 0.96 / WALL_TILES, s.rot);
        }
        const k = pass === 0 ? bh / bw : this.walls[s.tile].height / this.walls[s.tile].width;
        this.aMisc.setXYZW(n, s.team, s.seed, s.shape, k);
        n++;
      }
      if (n === 0) continue;
      this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aMisc.needsUpdate = true;
      this.stampMesh.count = n;
      this.renderer.setRenderTarget(pass === 0 ? this.floorRT : this.wallRT);
      this.renderer.render(this.stampScene, this.stampCam);
    }
    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = prevAuto;
    this.totalStamps += this.queue.length;
    for (const s of this.queue) this.stampPool.push(s);
    this.queue.length = 0;
  }

  /** Incremental live score: scans 1/8 of the CPU grid per call. */
  updateLiveScore() {
    const slice = (CPU_W * CPU_H) / 8;
    const end = this.scoreCursor + slice;
    for (let i = this.scoreCursor; i < end; i++) {
      if (!this.scoreMask[i]) continue;
      const v = this.cpuFloor[i];
      if (v === 1) this.scoreCounts[0]++; else if (v === 2) this.scoreCounts[1]++;
    }
    this.scoreCursor = end;
    if (this.scoreCursor >= CPU_W * CPU_H) {
      this.scoreCursor = 0;
      const e = Math.max(1, this.eligibleCells);
      this.liveScore = [this.scoreCounts[0] / e, this.scoreCounts[1] / e];
      this.scoreCounts[0] = this.scoreCounts[1] = 0;
    }
  }

  /** Exact GPU readback of the floor texture masked by score eligibility (used at TIME UP). */
  finalScore(): [number, number] {
    const w = FLOOR_W >> 2, h = FLOOR_H >> 2; // downsample by 4 via linear filtered copy
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.floorRT.texture }));
    scene.add(q);
    const prev = this.renderer.getRenderTarget();
    const cc = this.renderer.getClearColor(new THREE.Color()); const ca = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    (q.material as THREE.MeshBasicMaterial).transparent = true;
    this.renderer.setRenderTarget(rt); this.renderer.clear(true, false, false); this.renderer.render(scene, cam);
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    this.renderer.setRenderTarget(prev); this.renderer.setClearColor(cc, ca);
    rt.dispose(); q.geometry.dispose(); (q.material as THREE.Material).dispose();
    let a = 0, b = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mi = Math.floor((y / h) * CPU_H) * CPU_W + Math.floor((x / w) * CPU_W);
      if (!this.scoreMask[mi]) continue;
      n++;
      const i = (y * w + x) * 4;
      if (buf[i + 3] > 127) { if (buf[i] > buf[i + 1]) a++; else b++; }
    }
    if (n === 0) return [0, 0];
    return [a / n, b / n];
  }

  buildScoreMask(sample: (x: number, z: number) => boolean) {
    const b = this.bounds; let n = 0;
    for (let j = 0; j < CPU_H; j++) for (let i = 0; i < CPU_W; i++) {
      const x = b.x0 + ((i + 0.5) / CPU_W) * (b.x1 - b.x0), z = b.z0 + ((j + 0.5) / CPU_H) * (b.z1 - b.z0);
      const ok = sample(x, z) ? 1 : 0; this.scoreMask[j * CPU_W + i] = ok; n += ok;
    }
    this.eligibleCells = n;
  }
}

const STAMP_VS = /* glsl */ `
attribute vec2 aPos; attribute vec3 aSize; attribute vec4 aMisc;
varying vec2 vLocal; varying vec3 vMisc;
void main(){
  vec2 p = position.xy * 2.8; // -1.4..1.4 (room for secondary droplets)
  vLocal = p; vMisc = aMisc.xyz;
  float k = aMisc.w; // (v texels per metre) / (u texels per metre) -> makes rotation isotropic in metres
  float c = cos(aSize.z), s = sin(aSize.z);
  float wx = p.x * aSize.x, wy = p.y * aSize.y * k;
  vec2 r = vec2(wx * c - wy * s, wx * s + wy * c);
  vec2 uv = aPos + vec2(r.x, r.y / k);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

const STAMP_FS = /* glsl */ `
precision highp float;
varying vec2 vLocal; varying vec3 vMisc;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  float seed = vMisc.y * 37.0; float shape = vMisc.z;
  vec2 p = vLocal;
  float ang = atan(p.y, p.x); float r = length(p);
  // irregular edge: low-frequency angular noise + higher frequency wobble
  float edge = 0.78 + 0.16 * noise(vec2(ang * 1.6 + seed, seed)) + 0.08 * noise(vec2(ang * 5.0 + seed*2.0, seed + 3.0));
  if (shape > 1.5) { edge = 0.9 + 0.08 * noise(vec2(ang*3.0+seed, seed)); }       // charger: crisp line dots
  else if (shape > 0.5) { edge = 0.7 + 0.25 * noise(vec2(ang*2.2+seed, seed)); }  // roller glob: blobbier
  // secondary droplets
  float drop = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float a = hash(vec2(seed, fk)) * 6.2831; float d = 0.85 + 0.45 * hash(vec2(fk, seed));
    vec2 c = vec2(cos(a), sin(a)) * d; float rr = 0.10 + 0.12 * hash(vec2(seed + fk, 2.0));
    drop = max(drop, 1.0 - step(rr, length(p - c)));
  }
  float inside = step(r, edge);
  if (inside + drop < 0.5) discard;
  float team = vMisc.x;
  gl_FragColor = vec4(team < 0.5 ? 1.0 : 0.0, team < 0.5 ? 0.0 : 1.0, 0.4 + 0.6 * hash(vec2(seed, r)), 1.0);
}`;

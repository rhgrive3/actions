import * as THREE from "three";
import { TEAM_COLORS } from "../data/tuning";
import { Projectile } from "../weapons/WeaponSystem";
import { lighten } from "../render/CharacterModel";

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);

interface Particle { life: number; maxLife: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; team: number; grav: number; drag: number; }

/** CPU-simulated, GPU-instanced particle pool (one draw call). Count scales with quality tier. */
export class Effects {
  particles: Particle[] = [];
  mesh: THREE.InstancedMesh;
  projMesh: THREE.InstancedMesh;
  beams: { line: THREE.Mesh; life: number }[] = [];
  private beamMat: THREE.MeshBasicMaterial[];
  private teamColors: THREE.Color[];
  activeParticles = 0;
  maxParticles: number;
  private lasers: THREE.Line[] = [];

  constructor(private scene: THREE.Scene, maxParticles = 800) {
    this.maxParticles = maxParticles;
    for (let i = 0; i < maxParticles; i++) this.particles.push({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, team: 0, grav: 20, drag: 0.5 });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxParticles);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.projMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial(), 512);
    this.projMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(512 * 3), 3);
    this.projMesh.frustumCulled = false; this.projMesh.count = 0;
    scene.add(this.projMesh);
    this.teamColors = TEAM_COLORS.map((t) => new THREE.Color(t.hex));
    this.beamMat = TEAM_COLORS.map((t) => new THREE.MeshBasicMaterial({ color: lighten(t.hex, 0.3), transparent: true, opacity: 0.9 }));
    for (let t = 0; t < 2; t++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: lighten(TEAM_COLORS[t].hex, 0.2), transparent: true, opacity: 0.7 }));
      l.visible = false; l.frustumCulled = false; scene.add(l); this.lasers.push(l);
    }
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, team: number, grav = 20, drag = 0.5) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = life; p.maxLife = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.team = team; p.grav = grav; p.drag = drag;
      return;
    }
  }

  burst(pos: THREE.Vector3, normal: THREE.Vector3, team: number, size: number, count: number) {
    const n = Math.min(count, Math.round(count * (this.maxParticles / 800)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.random();
      const sp = 1.5 + Math.random() * 3.5 * size;
      const vx = (Math.cos(a) * r + normal.x * 1.2) * sp, vy = (Math.abs(normal.y) * 1.5 + Math.random() * 1.5) * sp * 0.6 + normal.y * 2, vz = (Math.sin(a) * r + normal.z * 1.2) * sp;
      this.emit(pos.x, pos.y + 0.05, pos.z, vx, vy, vz, 0.05 + Math.random() * 0.12 * size, 0.3 + Math.random() * 0.4, team);
    }
  }

  splatBurst(pos: THREE.Vector3, team: number) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 1.2;
      const sp = 3 + Math.random() * 6;
      this.emit(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, 0.08 + Math.random() * 0.22, 0.6 + Math.random() * 0.6, team, 18, 0.8);
    }
  }

  swimSpray(pos: THREE.Vector3, vel: THREE.Vector3, team: number) {
    if (Math.random() > 0.5) return;
    this.emit(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.1, pos.z + (Math.random() - 0.5) * 0.4, -vel.x * 0.15 + (Math.random() - 0.5), 1.5 + Math.random(), -vel.z * 0.15 + (Math.random() - 0.5), 0.04 + Math.random() * 0.06, 0.25, team);
  }

  chargerBeam(a: THREE.Vector3, b: THREE.Vector3, team: number, full: boolean) {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(full ? 0.09 : 0.06, full ? 0.11 : 0.07, len, 6, 1, true);
    const line = new THREE.Mesh(geo, this.beamMat[team].clone());
    line.position.lerpVectors(a, b, 0.5);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _p.subVectors(b, a).normalize());
    this.scene.add(line);
    this.beams.push({ line, life: 0.25 });
    // droplets along the beam
    for (let s = 0; s < len; s += 0.8) { _p.lerpVectors(a, b, s / len); this.emit(_p.x, _p.y, _p.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.05, 0.3, team, 12); }
  }

  /** Charger laser sight while charging */
  setLaser(team: number, from: THREE.Vector3 | null, to: THREE.Vector3 | null) {
    const l = this.lasers[team];
    if (!from || !to) { l.visible = false; return; }
    l.visible = true;
    const pos = l.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, to.x, to.y, to.z); pos.needsUpdate = true;
  }

  update(dt: number, projectiles: Projectile[], alpha: number) {
    let n = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= p.grav * dt; const k = 1 - Math.min(1, p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = p.life / p.maxLife;
      _p.set(p.x, p.y, p.z); _s.setScalar(p.size * (0.5 + f)); _q.identity();
      _m.compose(_p, _q, _s); this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.copy(this.teamColors[p.team]).lerp(WHITE, (1 - f) * 0.35));
      n++;
    }
    this.mesh.count = n; this.activeParticles = n;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    // projectiles
    let m = 0;
    for (const pr of projectiles) {
      if (!pr.active) continue;
      _p.lerpVectors(pr.prev, pr.pos, alpha);
      const stretch = 1 + Math.min(2.5, pr.vel.length() / 14);
      const dir = _s.copy(pr.vel).normalize();
      if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
      _q.setFromUnitVectors(Z_AXIS, dir);
      _s.set(pr.radius * 0.9, pr.radius * 0.9, pr.radius * 0.9 * stretch);
      _m.compose(_p, _q, _s); this.projMesh.setMatrixAt(m, _m);
      this.projMesh.setColorAt(m, this.teamColors[pr.team]);
      m++;
    }
    this.projMesh.count = m;
    if (m) { this.projMesh.instanceMatrix.needsUpdate = true; if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true; }
    // beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life -= dt;
      (b.line.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / 0.25);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); (b.line.material as THREE.Material).dispose(); this.beams.splice(i, 1); }
    }
  }
}

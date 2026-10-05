// Practice Range target dummy: the visual half of a target. The target itself is an ordinary Actor (team Bravo) — it is
// hit, damaged, splatted and healed by exactly the code that does it to a player (weapons.js applyHit → Actor.damage,
// the patched resources/regen, the projectile capsule test against PLAYER.radius / PLAYER.height). Only its look is
// different: a weighted inflatable target whose silhouette IS that hit capsule (radius PLAYER.radius, PLAYER.height
// tall from the feet), so what you see is exactly what can be hit.
//
// Implements the Character contract the Actor uses (root, update, trigger, setHurt, setVisible, setColor, setWeapon,
// getHeadPosition, warmAll, dispose). Cost: two draws per target (body + team-ink parts) plus their shadow casts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '../../../src/config.js';
import { G } from '../../../src/core/ctx.js';

const TAU = Math.PI * 2;
let SHARED = null;   // geometries / textures shared by every dummy (built once, kept for the session)

function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));

function bullseyeTexture() {
  if (typeof document === 'undefined') return null;   // headless (node tests): geometry only
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  const rings = [[0.5, '#ffffff'], [0.4, '#262b38'], [0.3, '#ffffff'], [0.2, '#262b38'], [0.1, '#ffffff']];
  for (const [r, c] of rings) { x.fillStyle = c; x.beginPath(); x.arc(S / 2, S / 2, r * S * 0.96, 0, TAU); x.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function buildShared() {
  const R = PLAYER.radius, H = PLAYER.height;
  const base = 0.07;
  // body: the hit capsule (feet → H), cream vinyl, a darker seam band and two cartoon eyes on the dome
  const capLen = Math.max(0.01, H - base - 2 * R);
  const body = [];
  body.push(paint(at(new THREE.CapsuleGeometry(R * 0.995, capLen, 6, 20), 0, base + R + capLen / 2, 0), '#f3efe6'));
  body.push(paint(at(new THREE.CylinderGeometry(0.43, 0.46, base, 28), 0, base / 2, 0), '#2c3140'));      // weighted foot
  body.push(paint(at(new THREE.TorusGeometry(R * 1.0, 0.018, 6, 32), 0, base + R + capLen * 0.02, 0, Math.PI / 2), '#c8c2b5'));   // seam
  for (const s of [-1, 1]) {
    body.push(paint(at(new THREE.SphereGeometry(0.075, 12, 8), s * 0.13, H - 0.33, R * 0.9, 0, 0, 0, 1, 1.35, 0.5), '#1d2230'));
    body.push(paint(at(new THREE.SphereGeometry(0.026, 8, 6), s * 0.13 + 0.02, H - 0.29, R * 0.95), '#ffffff'));
  }
  const bodyGeo = mergeGeometries(body.map(clean), false);
  // team-ink parts: the bullseye on the chest (a curved patch on the capsule) + two little fins on the dome
  const team = [];
  const patch = new THREE.CylinderGeometry(R * 1.012, R * 1.012, 0.5, 18, 1, true, -0.62, 1.24);
  team.push(at(patch, 0, base + R + capLen * 0.5 - 0.02, 0));
  // (cylinder uvs run 0..1 around the arc and up the height: the bullseye texture is mapped across the patch)
  for (const s of [-1, 1]) {
    const fin = new THREE.ConeGeometry(0.12, 0.26, 3);
    // fins: sample the white centre of the bullseye texture → pure team colour
    const uv = fin.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
    team.push(at(fin, s * 0.2, H - 0.06, -0.05, 0, 0, -s * 0.9, 1, 1, 0.45));
  }
  const teamGeo = mergeGeometries(team.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
  return { bodyGeo, teamGeo, bull: bullseyeTexture(), teamMat: new THREE.MeshStandardMaterial({ map: null, roughness: 0.45, metalness: 0 }) };
}

export class TargetDummyCharacter {
  constructor({ color }) {
    if (!SHARED) { SHARED = buildShared(); SHARED.teamMat.map = SHARED.bull; }
    this.root = new THREE.Group(); this.root.name = 'range:dummy';
    this.bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: 0x000000 });
    this.body = new THREE.Mesh(SHARED.bodyGeo, this.bodyMat);
    this.team = new THREE.Mesh(SHARED.teamGeo, SHARED.teamMat);
    for (const m of [this.body, this.team]) { m.castShadow = true; m.receiveShadow = true; }
    this.pivot = new THREE.Group();
    this.pivot.add(this.body, this.team);
    this.root.add(this.pivot);
    this.style = null;
    this.onEvent = null;
    // opt out of the gameplay patch's squidkid-only motion layers (they key per-character state; a dummy has no rig)
    this.s3HitSpawnMotionEnabled = false; this.s3SpecialMotionEnabled = false; this.s3WeaponMotionEnabled = false;
    this._tilt = new THREE.Vector2(); this._tiltV = new THREE.Vector2();
    this._grow = 1; this._growV = 0; this._hurt = 0;
    if (color) this.setColor(color);
  }
  // team colour of the target's own ink parts (Bravo — the side the range player shoots at)
  setColor(c) { if (c) SHARED.teamMat.color.copy(c); }
  setWeapon() {}
  setVisible(v) { this.root.visible = !!v; }
  setHurt(k, color) {
    const kk = Math.max(0, Math.min(1, k || 0));
    if (Math.abs(kk - this._hurt) < 0.004 && kk > 0) return;
    this._hurt = kk;
    if (color) this.bodyMat.emissive.copy(color).multiplyScalar(0.55 * kk * kk);
    else this.bodyMat.emissive.setScalar(0);
  }
  trigger(name, data) {
    if (name === 'hit') {
      // a weighted bag rocks away from the hit (local frame: +z forward, +x the dummy's left)
      const amp = Math.min(1.2, +data || 0.5);
      const lx = data && Number.isFinite(data.x) ? data.x : 0, lz = data && Number.isFinite(data.z) ? data.z : 1;
      this._tiltV.x -= lz * 2.6 * amp; this._tiltV.y += lx * 2.6 * amp;
    } else if (name === 'spawn') { this._grow = 0.25; this._growV = 0; }
  }
  update(dt) {
    // tilt spring (critically under-damped: two or three rocks, then still)
    const w = 11, z = 0.32;
    for (const k of ['x', 'y']) {
      const a = -w * w * this._tilt[k] - 2 * z * w * this._tiltV[k];
      this._tiltV[k] += a * dt; this._tilt[k] += this._tiltV[k] * dt;
      this._tilt[k] = Math.max(-0.5, Math.min(0.5, this._tilt[k]));
    }
    this.pivot.rotation.set(this._tilt.x, 0, this._tilt.y);
    // reinflate after a pop: springs up from a quarter size with a little overshoot
    if (this._grow !== 1 || this._growV !== 0) {
      const wg = 14, a = -wg * wg * (this._grow - 1) - 2 * 0.45 * wg * this._growV;
      this._growV += a * dt; this._grow += this._growV * dt;
      if (Math.abs(this._grow - 1) < 1e-3 && Math.abs(this._growV) < 1e-3) { this._grow = 1; this._growV = 0; }
      this.pivot.scale.set(1, Math.max(0.05, this._grow), 1);
    }
  }
  // the native Character finds its Actor the same way (patch motion layers ask for it)
  _owner() { return this.actor && this.actor.character === this ? this.actor : null; }
  getHeadPosition(out) { return out.copy(this.root.position).setY(this.root.position.y + PLAYER.height); }
  warmAll() { return G.renderer?.compileAsync ? G.renderer.compileAsync(this.root, G.camera, G.scene).catch(() => {}) : null; }
  dispose() { this.bodyMat.dispose(); this.root.removeFromParent(); }
}

// the shared team-part material follows the Bravo ink (called when the palette changes)
export function dummyTeamColor(c) { if (SHARED && c) SHARED.teamMat.color.copy(c); }

// Practice Range action pads: flat discs you stand on to switch weapon, reset, ink the swim course or resupply.
// Rendering: one instanced base (team-neutral rubber + coloured rim), one merged label mesh (canvas atlas: an icon and
// a word per pad, lying flat), one dwell ring that sweeps round the pad you stand on. Four draws for every pad.
import * as THREE from 'three';
import { WEAPONS } from '../../../src/config.js';
import { weaponIcon } from '../../../src/ui/ui-icons.js';
import { PAD_R } from '../stage/zones.mjs';
import { L } from './strings.mjs';

const CELL = 192, COLS = 8;
const LABEL = { resetPaint: 'RESET PAINT', resetDummies: 'RESET TARGETS', inkCourse: 'INK COURSE', resupply: 'REFILL' };
const Y = 0.012;   // pads sit just proud of the floor (they are devices: ink never covers them)

function svgImage(svg, color) {
  let s = svg.replace(/currentColor/g, color);
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  return img;
}

function drawIcon(g, kind, cx, cy, r, color) {
  g.save(); g.translate(cx, cy); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = r * 0.16; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'resetPaint') {        // splat with a circular arrow
    g.beginPath(); g.arc(0, 0, r * 0.62, -Math.PI * 0.2, Math.PI * 1.45); g.stroke();
    g.beginPath(); g.moveTo(r * 0.62, -r * 0.62); g.lineTo(r * 0.62, -r * 0.1); g.lineTo(r * 0.12, -r * 0.32); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 0, r * 0.26, 0, Math.PI * 2); g.fill();
  } else if (kind === 'resetDummies') {   // bullseye
    for (const [rr, f] of [[0.7, false], [0.42, false], [0.14, true]]) { g.beginPath(); g.arc(0, 0, r * rr, 0, Math.PI * 2); f ? g.fill() : g.stroke(); }
  } else if (kind === 'inkCourse') {      // wave / swim
    g.beginPath(); for (let i = 0; i <= 24; i++) { const x = -r * 0.75 + (i / 24) * r * 1.5, y = Math.sin(i / 24 * Math.PI * 2) * r * 0.22; i ? g.lineTo(x, y - r * 0.2) : g.moveTo(x, y - r * 0.2); } g.stroke();
    g.beginPath(); for (let i = 0; i <= 24; i++) { const x = -r * 0.75 + (i / 24) * r * 1.5, y = Math.sin(i / 24 * Math.PI * 2) * r * 0.22; i ? g.lineTo(x, y + r * 0.25) : g.moveTo(x, y + r * 0.25); } g.stroke();
  } else if (kind === 'resupply') {       // ink drop + plus
    g.beginPath(); g.moveTo(-r * 0.15, -r * 0.7); g.bezierCurveTo(-r * 0.15, -r * 0.7, r * 0.3, -r * 0.1, r * 0.3, r * 0.2); g.arc(-r * 0.15, r * 0.2, r * 0.45, 0, Math.PI); g.bezierCurveTo(-r * 0.6, -r * 0.1, -r * 0.15, -r * 0.7, -r * 0.15, -r * 0.7); g.fill();
    g.fillRect(r * 0.38, -r * 0.08, r * 0.5, r * 0.16); g.fillRect(r * 0.55, -r * 0.25, r * 0.16, r * 0.5);
  }
  g.restore();
}

export class RangePads {
  constructor(scene, defs) {
    this.defs = defs;
    this.group = new THREE.Group(); this.group.name = 'range:pads';
    scene.add(this.group);
    const n = defs.length;
    // ---- base discs (instanced): dark rubber puck, rim coloured per pad
    const base = new THREE.CylinderGeometry(PAD_R, PAD_R * 1.04, 0.03, 40);
    this.baseMat = new THREE.MeshStandardMaterial({ color: 0x2b3142, roughness: 0.8, metalness: 0 });
    this.base = new THREE.InstancedMesh(base, this.baseMat, n);
    const rim = new THREE.TorusGeometry(PAD_R * 0.93, 0.045, 6, 48); rim.rotateX(Math.PI / 2);
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.0 });
    this.rim = new THREE.InstancedMesh(rim, this.rimMat, n);
    const m = new THREE.Matrix4();
    this._col = defs.map((d) => new THREE.Color(d.color));
    defs.forEach((d, i) => {
      m.makeTranslation(d.x, Y + 0.015, d.z); this.base.setMatrixAt(i, m);
      m.makeTranslation(d.x, Y + 0.035, d.z); this.rim.setMatrixAt(i, m);
      this.rim.setColorAt(i, this._col[i]);
    });
    this.base.receiveShadow = true; this.rim.receiveShadow = true;
    // ---- labels: one atlas cell per pad (icon + word), flat on the pad, readable facing north
    this.canvas = document.createElement('canvas'); this.canvas.width = CELL * COLS; this.canvas.height = CELL * Math.ceil(n / COLS);
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this._icons = {};
    for (const d of defs) if (d.kind === 'weapon') this._icons[d.weapon] = svgImage(weaponIcon(WEAPONS[d.weapon].kind || d.weapon), '#f6f2e8');
    this._draw();
    for (const img of Object.values(this._icons)) img.onload = () => { if (!this.disposed) this._draw(); };
    const pos = [], uv = [], nor = [];
    const H = this.canvas.height, Wc = this.canvas.width, s = PAD_R * 0.78;
    defs.forEach((d, i) => {
      const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
      const u0 = cx / Wc, u1 = (cx + CELL) / Wc, v0 = 1 - (cy + CELL) / H, v1 = 1 - cy / H;
      // flat quad facing up; canvas up = north (+z), canvas right = −x (right for someone facing north)
      const y = Y + 0.04;
      const P = (sx, sz) => [d.x - sx * s, y, d.z + sz * s];
      const q = [[P(-1, -1), u0, v0], [P(1, -1), u1, v0], [P(1, 1), u1, v1], [P(-1, -1), u0, v0], [P(1, 1), u1, v1], [P(-1, 1), u0, v1]];
      for (const [p, u, v] of q) { pos.push(...p); uv.push(u, v); nor.push(0, 1, 0); }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.labelMat = new THREE.MeshStandardMaterial({ map: this.tex, transparent: true, alphaTest: 0.05, roughness: 0.6, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.labels = new THREE.Mesh(lg, this.labelMat);
    this.labels.renderOrder = 2;
    // ---- dwell ring (one, moved to the active pad)
    this.ringGeo = new THREE.RingGeometry(PAD_R * 0.98, PAD_R * 1.16, 64, 1, Math.PI / 2, 0.001);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 3;
    this.group.add(this.base, this.rim, this.labels, this.ring);
    for (const o of [this.base, this.rim, this.labels, this.ring]) o.frustumCulled = false;
    this.t = 0; this._k = -1;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.defs.forEach((d, i) => {
      const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
      g.save(); g.translate(cx, cy);
      const label = d.kind === 'weapon' ? (WEAPONS[d.weapon].class || d.weapon).toUpperCase() : L(LABEL[d.kind] || d.kind);
      const img = d.kind === 'weapon' && this._icons[d.weapon];
      if (img && img.complete && img.naturalWidth) g.drawImage(img, CELL * 0.27, CELL * 0.1, CELL * 0.46, CELL * 0.46);
      else drawIcon(g, d.kind, CELL / 2, CELL * 0.36, CELL * 0.22, '#f6f2e8');
      g.fillStyle = '#f6f2e8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = 30; g.font = `800 ${px}px Rubik, "Arial Black", sans-serif`;
      while (px > 12 && g.measureText(label).width > CELL * 0.86) { px -= 2; g.font = `800 ${px}px Rubik, "Arial Black", sans-serif`; }
      g.fillText(label, CELL / 2, CELL * 0.74);
      g.restore();
    });
    this.tex.needsUpdate = true;
  }

  // on = the pad the player stands on (or null), k = dwell progress 0…1, weapon = the equipped weapon id
  update(dt, on, k, weapon) {
    this.t += dt;
    const glow = 0.35 + 0.15 * Math.sin(this.t * 3);
    this.defs.forEach((d, i) => {
      const equipped = d.kind === 'weapon' && d.weapon === weapon;
      const c = equipped ? _gold : this._col[i];
      this.rim.setColorAt(i, _tmp.copy(c).multiplyScalar(d === on ? 1.6 : equipped ? 1.3 : 1));
    });
    this.rim.instanceColor.needsUpdate = true;
    this.rimMat.emissiveIntensity = glow * 0.25;
    if (on && k > 0 && k < 1) {
      this.ring.visible = true;
      this.ring.position.set(on.x, Y + 0.06, on.z);
      if (Math.abs(k - this._k) > 0.01) {
        this._k = k;
        this.ring.geometry.dispose();
        this.ring.geometry = new THREE.RingGeometry(PAD_R * 0.98, PAD_R * 1.16, 48, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
      }
    } else { this.ring.visible = false; this._k = -1; }
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    this.base.geometry.dispose(); this.rim.geometry.dispose(); this.labels.geometry.dispose(); this.ring.geometry.dispose();
    this.baseMat.dispose(); this.rimMat.dispose(); this.labelMat.dispose(); this.ringMat.dispose(); this.tex.dispose();
    this.base.dispose(); this.rim.dispose();
  }
}
const _gold = new THREE.Color('#e5b94d'), _tmp = new THREE.Color();

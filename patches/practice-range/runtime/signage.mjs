// Practice Range signage: the artwork on every board, pylon and panel listed in zones.mjs SIGNS (the boards themselves
// are solid level blocks). One canvas atlas, one merged mesh, one draw call; nothing casts shadows. Distance numbers
// and the wall gauge are drawn from the same world coordinates the boards stand on (a "15" board stands at z = 15; the
// gauge's 3 m tick is at world y = 3), so the signage cannot drift from the geometry.
import * as THREE from 'three';
import { SIGNS, ZONES } from '../stage/zones.mjs';
import { L, isJa } from './strings.mjs';

const W = 2048, H = 2048, MARGIN = 0.035;
const NAVY = '#232b3d', NAVY2 = '#2d364c', CREAM = '#f6f2e8', MUTED = '#a9b1c2';
const TITAN = (px) => `${px}px "Titan One", "Arial Black", sans-serif`;
const RUBIK = (px, w = 800) => `${w} ${px}px Rubik, "Arial Black", sans-serif`;
const SUBTITLE = {
  lane: 'Paint distance · long shots · bomb throw', gallery: 'Range · damage at distance', paint: '400 m² floor · paint coverage',
  roller: 'Rolling · flicks · curves', dualies: 'Dodge rolls · fire after rolling', squid: 'Swim speed · turns · slopes',
  wall: 'Paint height · climbing · ledges', bomb: 'Throws · bounces · blast radius', special: 'Special radius · endurance targets',
};
const zoneName = (id) => (isJa ? ZONES[id].ja : ZONES[id].name);

function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function fit(g, text, font, maxW, px) { let p = px; g.font = font(p); while (p > 8 && g.measureText(text).width > maxW) { p -= 2; g.font = font(p); } return p; }
function letterDisc(g, cx, cy, r, letter, accent) {
  g.fillStyle = CREAM; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = accent; g.font = TITAN(Math.round(r * 1.3)); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, cx, cy + r * 0.06);
}

const ART = {
  dist(g, w, h, a) {
    const acc = ZONES[a.zone].accent;
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.08); g.fill();
    g.fillStyle = acc; g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = CREAM; g.textBaseline = 'alphabetic';
    const num = String(a.value);
    fit(g, num, TITAN, w * 0.62, Math.round(h * 0.66));
    const nw = g.measureText(num).width;
    g.font = RUBIK(Math.round(h * 0.22)); const mw = g.measureText('m').width;
    const x0 = (w - nw - mw - w * 0.03) / 2;
    fit(g, num, TITAN, w * 0.62, Math.round(h * 0.66)); g.textAlign = 'left'; g.fillText(num, x0, h * 0.72);
    g.font = RUBIK(Math.round(h * 0.22)); g.fillText('m', x0 + nw + w * 0.03, h * 0.72);
  },
  head(g, w, h, a) {
    const z = ZONES[a.zone];
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.1); g.fill();
    g.fillStyle = z.accent; rr(g, 0, 0, h * 1.1, h, h * 0.1); g.fill();
    letterDisc(g, h * 0.55, h * 0.5, h * 0.34, z.letter, z.accent);
    g.fillStyle = CREAM; g.textAlign = 'left'; g.textBaseline = 'middle';
    const right = a.value ? w * 0.68 : w - h * 0.3;
    fit(g, zoneName(a.zone), (p) => RUBIK(p, 900), right - h * 1.35, Math.round(h * 0.4));
    g.fillText(zoneName(a.zone), h * 1.3, h * 0.42);
    g.fillStyle = MUTED; fit(g, L(SUBTITLE[a.zone]), (p) => RUBIK(p, 600), right - h * 1.35, Math.round(h * 0.17));
    g.fillText(L(SUBTITLE[a.zone]), h * 1.3, h * 0.76);
    if (a.value) {
      g.fillStyle = CREAM; g.textAlign = 'right'; g.font = TITAN(Math.round(h * 0.66));
      g.fillText(String(a.value), w * 0.9, h * 0.54);
      g.font = RUBIK(Math.round(h * 0.22)); g.textAlign = 'left'; g.fillText('m', w * 0.91, h * 0.62);
    }
  },
  banner(g, w, h) {
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, w * 0.08); g.fill();
    const cols = ['#e9836c', '#e5b94d', '#47aea3', '#7fc0df', '#a79be0'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.1 + i * w * 0.16, h * 0.04, w * 0.1, h * 0.06); });
    g.save(); g.translate(w / 2, h * 0.55); g.rotate(-Math.PI / 2);
    g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'INK LAB', TITAN, h * 0.72, Math.round(w * 0.6)); g.fillText('INK LAB', 0, 0);
    g.restore();
    g.fillStyle = '#e5b94d'; g.textAlign = 'center'; g.font = RUBIK(Math.round(w * 0.1), 900); g.fillText(isJa ? '試し撃ち' : 'RANGE', w / 2, h * 0.95);
  },
  stand(g, w, h, a) {
    g.fillStyle = a.color || NAVY; rr(g, 0, 0, w, h, w * 0.12); g.fill();
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(w * 0.5, h * 0.08); g.lineTo(w * 0.78, h * 0.34); g.lineTo(w * 0.22, h * 0.34); g.closePath(); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = TITAN(Math.round(h * 0.3)); g.fillText(`${a.value}`, w * 0.5, h * 0.6);
    g.font = RUBIK(Math.round(h * 0.13), 900); g.fillText(isJa ? 'm（壁から）' : 'm FROM WALL', w * 0.5, h * 0.85);
  },
  zero(g, w, h) {
    g.fillStyle = '#e5b94d'; rr(g, 0, 0, w, h, h * 0.14); g.fill();
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = TITAN(Math.round(h * 0.62)); g.fillText('0', w * 0.36, h * 0.54);
    g.font = RUBIK(Math.round(h * 0.2), 900); g.fillText('m', w * 0.6, h * 0.62);
    g.font = RUBIK(Math.round(h * 0.12), 800); g.fillText(isJa ? '射撃線' : 'FIRING LINE', w / 2, h * 0.88);
  },
  zone(g, w, h, a) {
    const z = ZONES[a.zone];
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.08); g.fill();
    g.fillStyle = z.accent; rr(g, 0, 0, w, h * 0.56, h * 0.08); g.fill(); g.fillRect(0, h * 0.3, w, h * 0.26);
    letterDisc(g, h * 0.3, h * 0.28, h * 0.2, z.letter, z.accent);
    g.fillStyle = CREAM; g.textAlign = 'left'; g.textBaseline = 'middle';
    fit(g, zoneName(a.zone), (p) => RUBIK(p, 900), w - h * 0.62, Math.round(h * 0.2));
    g.fillText(zoneName(a.zone), h * 0.56, h * 0.29);
    g.fillStyle = CREAM; fit(g, L(SUBTITLE[a.zone]), (p) => RUBIK(p, 600), w * 0.9, Math.round(h * 0.11));
    g.textAlign = 'center'; g.fillText(L(SUBTITLE[a.zone]), w / 2, h * 0.76);
  },
  band(g, w, h, a) {
    const z = ZONES[a.zone];
    g.fillStyle = z.accent; rr(g, 0, 0, w, h, h * 0.16); g.fill();
    letterDisc(g, h * 0.55, h * 0.5, h * 0.36, z.letter, z.accent);
    g.fillStyle = CREAM; g.textAlign = 'left'; g.textBaseline = 'middle';
    const t = `${zoneName(a.zone)}  ·  ${L(SUBTITLE[a.zone])}`;
    fit(g, t, (p) => RUBIK(p, 800), w - h * 1.4, Math.round(h * 0.42));
    g.fillText(t, h * 1.1, h * 0.53);
  },
  tower(g, w, h) {
    g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
    const cols = ['#e9836c', '#e5b94d', '#a1d7b7', '#7fc0df', '#a79be0', '#eea0bf', '#47aea3'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, h * 0.08 + i * h * 0.025, w, h * 0.016); });
    g.save(); g.translate(w / 2, h * 0.62); g.rotate(-Math.PI / 2);
    g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = isJa ? 'ブキ' : 'WEAPONS';
    fit(g, t, TITAN, h * 0.55, Math.round(w * 0.62)); g.fillText(t, 0, 0);
    g.restore();
    g.fillStyle = MUTED; g.font = RUBIK(Math.round(w * 0.11), 700); g.textAlign = 'center';
    g.fillText(isJa ? 'パッドで' : 'STAND ON', w / 2, h * 0.92); g.fillText(isJa ? '持ちかえ' : 'A PAD', w / 2, h * 0.96);
  },
  control(g, w, h) {
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.08); g.fill();
    g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, isJa ? 'コントロール' : 'CONTROL', TITAN, w * 0.9, Math.round(h * 0.2)); g.fillText(isJa ? 'コントロール' : 'CONTROL', w / 2, h * 0.17);
    const rows = [['#2f8f86', 'RESET PAINT'], ['#b5523f', 'RESET TARGETS'], ['#2c7f91', 'INK COURSE'], ['#a9822a', 'REFILL']];
    // pads are laid out as a 2 × 2 grid: front row (nearer the lanes) first — legend in the same order as seen from here
    rows.forEach(([c, t], i) => {
      const y = h * (0.38 + i * 0.155);
      g.fillStyle = c; g.beginPath(); g.arc(w * 0.12, y, h * 0.05, 0, Math.PI * 2); g.fill();
      g.fillStyle = CREAM; g.textAlign = 'left'; fit(g, L(t), (p) => RUBIK(p, 700), w * 0.75, Math.round(h * 0.1)); g.fillText(L(t), w * 0.2, y);
    });
  },
  lab(g, w, h) {
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.12); g.fill();
    const stripes = ['#e9836c', '#e5b94d', '#47aea3', '#7fc0df', '#a79be0'];
    stripes.forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.015 + i * h * 0.12, h * 0.15, h * 0.08, h * 0.7); });
    g.fillStyle = CREAM; g.textAlign = 'left'; g.textBaseline = 'middle';
    const x0 = w * 0.015 + stripes.length * h * 0.12 + h * 0.18;
    fit(g, 'INKWAVE INK LAB', TITAN, w * 0.6, Math.round(h * 0.46)); g.fillText('INKWAVE INK LAB', x0, h * 0.42);
    g.fillStyle = '#e5b94d'; fit(g, isJa ? '試し撃ちラボ ・ PRACTICE RANGE' : 'PRACTICE RANGE · TEST FACILITY', (p) => RUBIK(p, 800), w * 0.55, Math.round(h * 0.2));
    g.fillText(isJa ? '試し撃ちラボ ・ PRACTICE RANGE' : 'PRACTICE RANGE · TEST FACILITY', x0, h * 0.78);
    g.fillStyle = MUTED; g.textAlign = 'right'; g.font = RUBIK(Math.round(h * 0.13), 600);
    g.fillText(isJa ? '目盛り＝ワールド座標 (1 m = 1.000)' : 'ALL MARKS = WORLD COORDINATES (1 m = 1.000)', w * 0.98, h * 0.84);
  },
  gauge(g, w, h, a) {
    // world heights: canvas y = (1 − y / a.h) · h — the board spans y 0 … a.h exactly
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    const yPx = (y) => (1 - y / a.h) * h;
    g.fillStyle = NAVY;
    for (let k = 1; k < a.h * 10; k++) {
      const y = k / 10, major = k % 10 === 0, half = k % 5 === 0;
      const len = major ? w * 0.62 : half ? w * 0.42 : w * 0.2;
      const th = major ? 5 : half ? 3 : 2;
      g.fillRect(0, yPx(y) - th / 2, len, th); g.fillRect(w - len, yPx(y) - th / 2, len, th);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = 1; m <= a.h; m++) {
      g.fillStyle = NAVY; rr(g, w * 0.22, yPx(m) + h * 0.012, w * 0.56, h * 0.05, 8); g.fill();
      g.fillStyle = CREAM; g.font = TITAN(Math.round(h * 0.034)); g.fillText(`${m} m`, w / 2, yPx(m) + h * 0.038);
    }
  },
  gate(g, w, h, a) {
    g.fillStyle = '#2c7f91'; rr(g, 0, 0, w, h, h * 0.12); g.fill();
    g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = TITAN(Math.round(h * 0.5)); g.fillText(`${a.value}`, w * 0.45, h * 0.52);
    g.font = RUBIK(Math.round(h * 0.2)); g.fillText('m', w * 0.8, h * 0.62);
  },
  slope(g, w, h, a) {
    g.fillStyle = NAVY; rr(g, 0, 0, w, h, h * 0.12); g.fill();
    g.fillStyle = '#2c7f91'; g.beginPath(); g.moveTo(w * 0.08, h * 0.8); g.lineTo(w * 0.4, h * 0.8); g.lineTo(w * 0.4, h * (0.8 - 0.5 * Math.tan(a.deg * Math.PI / 180) * 0.64)); g.closePath(); g.fill();
    g.fillStyle = CREAM; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = TITAN(Math.round(h * 0.36));
    g.fillText(`${a.deg.toFixed(1)}°`, w * 0.45, h * 0.52);
  },
};

const NORMAL = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1], '+y': [0, 1, 0] };

export class RangeSignage {
  constructor(scene) {
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.cells = this._layout();
    this._draw();
    if (document.fonts?.load) Promise.all([document.fonts.load('120px "Titan One"'), document.fonts.load('800 100px Rubik')]).then(() => { if (!this.disposed) this._draw(); }).catch(() => {});
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.22 });
    this.mesh = new THREE.Mesh(this._geometry(), this.mat);
    this.mesh.name = 'range:signage'; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  // one atlas cell per distinct (art, size): shelf-packed, ~150 px per metre (capped for the big panels)
  _layout() {
    const faces = [];
    for (const s of SIGNS) for (const f of s.faces) {
      const [x0, x1, y0, y1, z0, z1] = s.box;
      const wide = f.n.endsWith('x') ? z1 - z0 : x1 - x0, tall = f.n === '+y' ? z1 - z0 : y1 - y0;
      const exact = f.art.kind === 'gauge';   // the gauge spans its board's full height: canvas y ↔ world y exactly
      faces.push({ s, f, exact, w: wide - MARGIN * 2, h: exact ? tall : tall - MARGIN * 2, key: JSON.stringify(f.art) + `|${wide.toFixed(2)}x${tall.toFixed(2)}` });
    }
    const uniq = new Map();
    for (const fc of faces) if (!uniq.has(fc.key)) {
      const ppm = Math.min(128, 1700 / fc.w, 900 / fc.h);
      uniq.set(fc.key, { art: fc.f.art, pw: Math.ceil(fc.w * ppm), ph: Math.ceil(fc.h * ppm) });
    }
    // tall strips (gauge, tower) stack in a left column; everything else is shelf-packed to its right
    const list = [...uniq.values()].sort((a, b) => b.ph - a.ph);
    let colW = 0, cy = 0;
    for (const c of list.filter((c) => c.ph > 2.2 * c.pw)) { c.x = 0; c.y = cy; cy += c.ph + 4; colW = Math.max(colW, c.pw + 4); }
    let x = colW, y = 0, row = 0;
    for (const c of list.filter((c) => !(c.ph > 2.2 * c.pw))) {
      if (x + c.pw + 4 > W) { x = colW; y += row + 4; row = 0; }
      c.x = x; c.y = y; x += c.pw + 4; row = Math.max(row, c.ph);
    }
    if (y + row > H || cy > H) console.warn('[range] signage atlas overflow');
    this.faces = faces;
    return uniq;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    for (const c of this.cells.values()) {
      g.save(); g.translate(c.x, c.y); g.beginPath(); g.rect(0, 0, c.pw, c.ph); g.clip();
      try { ART[c.art.kind]?.(g, c.pw, c.ph, c.art); } catch (e) { console.error('[range] sign', c.art, e); }
      g.restore();
    }
    this.tex.needsUpdate = true;
  }

  _geometry() {
    const pos = [], nor = [], uv = [];
    for (const fc of this.faces) {
      const c = this.cells.get(fc.key), [x0, x1, y0, y1, z0, z1] = fc.s.box, n = NORMAL[fc.f.n];
      // the face plane, 3 mm proud; "right" as seen by someone looking at the face: right = (−n) × up
      const right = [n[2], 0, -n[0]];
      const cx = (x0 + x1) / 2 + n[0] * ((x1 - x0) / 2 + 0.003), cz = (z0 + z1) / 2 + n[2] * ((z1 - z0) / 2 + 0.003);
      const hw = fc.w / 2, yb = fc.exact ? y0 : y0 + MARGIN, yt = fc.exact ? y1 : y1 - MARGIN;
      const P = (s, y) => [cx + right[0] * hw * s, y, cz + right[2] * hw * s];
      const u0 = c.x / W, u1 = (c.x + c.pw) / W, v0 = 1 - (c.y + c.ph) / H, v1 = 1 - c.y / H;
      let quad = [[P(-1, yb), u0, v0], [P(1, yb), u1, v0], [P(1, yt), u1, v1], [P(-1, yb), u0, v0], [P(1, yt), u1, v1], [P(-1, yt), u0, v1]];
      if (fc.f.n === '+y') {
        // floor plate: lies on the top, reads facing north (canvas right = −x, canvas up = +z)
        const cxp = (x0 + x1) / 2, czp = (z0 + z1) / 2, yy = y1 + 0.003, hh = fc.h / 2;
        const Q = (sx, sz) => [cxp - sx * hw, yy, czp + sz * hh];
        quad = [[Q(-1, -1), u0, v0], [Q(1, -1), u1, v0], [Q(1, 1), u1, v1], [Q(-1, -1), u0, v0], [Q(1, 1), u1, v1], [Q(-1, 1), u0, v1]];
      }
      for (const [p, u, v] of quad) { pos.push(...p); nor.push(...n); uv.push(u, v); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  dispose() {
    this.disposed = true;
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose();
  }
}

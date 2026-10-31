// MAP3's original civic waterfront / ferry-terminal architecture.
// Art is static and built from the same records as gameplay. Added assemblies
// declare their collision bounds through map3ArtColliders before Level builds.
// Paintable level faces remain visible: broad surfaces belong to Level; narrow
// joinery, fascias and hardware belong here. See art-direction.md for envelopes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMap3SignAtlas, MAP3_SIGN_TILES } from './map3-sign-atlas.js';
import { dressTidewaterLife } from './map3-tidewater-life.js';
import { dressKelplineLife } from './map3-kelpline-life.js';

const TAU = Math.PI * 2;
export const MAP3_ART_SKIN_EPSILON = 0.035;
export const MAP3_ART_PALETTES = Object.freeze({
  tidewater: Object.freeze({ stone: '#e7dfcd', dark: '#435b5b', accent: '#6c9b92', warm: '#b77f59', metal: '#bdc6bb', glass: '#a6c2bd', leaf: '#698457', lamp: '#fff0c8' }),
  kelpline: Object.freeze({ stone: '#d9ddd3', dark: '#344e5c', accent: '#5e8586', warm: '#c6a057', metal: '#a9b6b9', glass: '#93afb6', leaf: '#718a68', lamp: '#dce9da' }),
});

// Reused per live scene, released when the last MAP3 art owner is disposed.
let textures = null, textureUsers = 0;
function acquireTextures() {
  if (!textures) {
    textures = {};
    for (const kind of ['stone', 'metal', 'wood']) {
      const n = 64, data = new Uint8Array(n * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const hash = ((x * 1973 + y * 9277 + x * y * 37) ^ (x * 7919 + y * 1049)) & 255;
        let c = 242 + (hash % 14);
        if (kind === 'stone' && (x % 32 === 0 || y % 32 === 0)) c = 215;
        if (kind === 'wood') c = 229 + Math.round(11 * Math.sin(x * 0.65 + Math.sin(y * 0.13)) + hash / 22);
        if (kind === 'metal') c = 244 + hash % 12;
        const i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = c; data[i + 3] = 255;
      }
      const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      t.name = `map3-${kind}-micrograin`; t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
      textures[kind] = t;
    }
    textures.signage = createMap3SignAtlas();
  }
  textureUsers++; return textures;
}
function releaseTextures() {
  if (--textureUsers === 0) { Object.values(textures).forEach(t => t.dispose()); textures = null; }
}

const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const leafCluster = new THREE.SphereGeometry(1, 6, 4);
const unitY = new THREE.Vector3(0, 1, 0);
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), vector = new THREE.Vector3(), scale = new THREE.Vector3();

class ArtBuilder {
  constructor(stage) { this.stage = stage; this.palette = MAP3_ART_PALETTES[stage.id]; this.buckets = new Map(); this.records = []; this.owner = null; }
  scope(id, constraint, run) {
    const old = this.owner; this.owner = { id, constraint, bounds: new THREE.Box3(), parts: 0 };
    run(); this.records.push(this.owner); this.owner = old;
  }
  add(material, geometry, color, position = [0, 0, 0], size = [1, 1, 1], rotation = null) {
    const g = geometry.clone();
    quaternion.identity(); if (rotation?.isQuaternion) quaternion.copy(rotation); else if (rotation) quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(vector.fromArray(position), quaternion, scale.fromArray(size)); g.applyMatrix4(matrix);
    if (!g.index) { const indices = []; for (let i = 0; i < g.attributes.position.count; i++) indices.push(i); g.setIndex(indices); }
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    if (this.owner) { g.computeBoundingBox(); this.owner.bounds.union(g.boundingBox); this.owner.parts++; }
  }
  box(mat, col, x, y, z, w, h, d, ry = 0) { this.add(mat, box, col, [x, y, z], [w, h, d], [0, ry, 0]); }
  cylinder(mat, col, x, y, z, radius, height, rotation = null) { this.add(mat, cylinder, col, [x, y, z], [radius, height, radius], rotation); }
  decal(tile, position, width, height, rotation = [0, 0, 0]) {
    const r = MAP3_SIGN_TILES[tile];
    if (!r) throw new Error(`Unknown MAP3 print tile: ${tile}`);
    const g = new THREE.PlaneGeometry(width, height), uv = g.attributes.uv;
    // DataTexture rows are stored top first. Keep each face inside the tile's
    // quiet outer border, including when minified and sampled with mipmaps.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x + 2 + uv.getX(i) * (r.w - 4)) / 512, (r.y + 2 + (1 - uv.getY(i)) * (r.h - 4)) / 512);
    this.add('signage', g, '#ffffff', position, [1, 1, 1], rotation); g.dispose();
  }
  beam(mat, col, a, b, width = 0.12, depth = width) {
    const axis = new THREE.Vector3().fromArray(b).sub(vector.fromArray(a)), length = axis.length();
    if (length < 1e-5) return;
    const q = new THREE.Quaternion().setFromUnitVectors(unitY, axis.normalize());
    this.add(mat, box, col, a.map((v, i) => (v + b[i]) / 2), [width, length, depth], q);
  }
  tube(mat, col, points, radius = 0.065, sides = 6) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, sides, false);
    this.add(mat, g, col); g.dispose();
  }
  chamfer(mat, col, x, y, z, w, h, d, radius = 0.16) {
    const r = Math.min(radius, w / 4, d / 4), s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.lineTo(w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r); s.lineTo(w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
    s.lineTo(-w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, steps: 1 });
    g.rotateX(-Math.PI / 2); this.add(mat, g, col, [x, y - h / 2, z]); g.dispose();
  }
  finish(group, materials, castShadow) {
    for (const [key, parts] of this.buckets) {
      const geometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[key]); mesh.name = `map3:${this.stage.id}:${key}`;
      mesh.castShadow = castShadow && key !== 'glass' && key !== 'glow'; mesh.receiveShadow = key !== 'glow'; group.add(mesh);
    }
    this.buckets.clear(); // release build-only typed arrays after the merge
    group.userData.map3Art = { stage: this.stage.id, records: this.records.map(r => ({ id: r.id, constraint: r.constraint, min: r.bounds.min.toArray(), max: r.bounds.max.toArray(), parts: r.parts })) };
  }
}

// Place a detail on an obstacle face. x runs horizontally along the face, y up;
// geometry lies no farther than 0.03 WU proud of the original collision plane.
function faceFrame(b, o, side, run) {
  const [x0, x1, z0, z1] = o.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const width = side % 2 ? z1 - z0 : x1 - x0;
  const yaw = side * Math.PI / 2;
  const base = side === 0 ? [cx, o.y0, z1] : side === 1 ? [x1, o.y0, cz] : side === 2 ? [cx, o.y0, z0] : [x0, o.y0, cz];
  const at = (x, y, z = 0) => [base[0] + x * Math.cos(yaw) + z * Math.sin(yaw), base[1] + y, base[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
  const panel = (mat, color, x, y, w, h, d = 0.025) => b.box(mat, color, ...at(x, y, 0.007), w, h, d, yaw);
  run({ width, height: o.y1 - o.y0, at, panel, yaw });
}
function band(b, o, y, height, color, material = 'metal', inset = 0.16) {
  for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => f.panel(material, color, 0, y, f.width - inset * 2, height));
}
function roundBadge(b, frame, x, y, radius, color) {
  const p = frame.at(x, y, 0.012), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, frame.yaw, 0, 'YXZ'));
  b.add('metal', cylinder, color, p, [radius, 0.024, radius], q);
}

function tidewaterCover(b, o, index) {
  const p = b.palette, h = o.y1 - o.y0, [x0, x1, z0, z1] = o.rect;
  b.scope(o.id, 'obstacle-skin', () => {
    if (o.paint === false) {
      // Coped parapet: rhythm is on the existing solid lip, not a pretend rail.
      band(b, o, h - 0.09, 0.14, p.stone, 'stone', 0.05);
      for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
        for (let x = -f.width / 2 + 0.3; x < f.width / 2 - 0.2; x += 1.35) f.panel('metal', p.accent, x, h / 2, 0.075, h - 0.26);
      });
      return;
    }
    const low = h <= 1.4, middle = /mid_screen/.test(o.id), kiosk = /market|civic|east_screen/.test(o.id);
    band(b, o, 0.14, 0.18, p.dark, 'stone');
    band(b, o, h - 0.15, 0.22, low ? p.stone : p.accent, low ? 'stone' : 'metal');
    if (low) {
      // Ceramic planter/seat base: tile joints and glazed corner sleeves. The
      // original top stays inkable and supports standing exactly at its collider.
      for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
        const inset = 0.23;
        for (let x = -f.width / 2 + inset; x <= f.width / 2 - inset; x += 0.45) f.panel('stone', p.accent, x, h * 0.47, 0.022, h - 0.48);
        f.panel('stone', p.accent, 0, h * 0.48, f.width - 0.46, 0.022);
      });
      if (/bridge_cover/.test(o.id)) for (const side of [0, 2]) faceFrame(b, o, side, f => {
        f.panel('metal', p.dark, 0, h * 0.53, Math.min(f.width - 0.44, 1.5), 0.40);
        // Original two-route board: paired arrows and a small tidal line. It
        // mounts on existing solid cover and introduces no new collision.
        for (const dir of [-1, 1]) {
          const xx = dir * 0.45, yy = h * 0.53;
          b.beam('metal', p.stone, f.at(xx - dir * 0.16, yy - 0.10, 0.024), f.at(xx, yy, 0.024), 0.018, 0.012);
          b.beam('metal', p.stone, f.at(xx - dir * 0.16, yy + 0.10, 0.024), f.at(xx, yy, 0.024), 0.018, 0.012);
        }
        f.panel('metal', p.warm, 0, h * 0.53, 0.22, 0.055);
      });
    } else {
      for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
        for (const x of [-f.width / 2 + 0.18, f.width / 2 - 0.18]) f.panel('metal', p.accent, x, h / 2, 0.13, h - 0.27);
        // Facade remains mostly neutral and writable with ink. Small hardware
        // clusters, original wave motif and roof-edge slats identify the object.
        if (f.width > 1.1) {
          for (let x = -f.width / 2 + 0.38; x < f.width / 2 - 0.25; x += 0.38) f.panel('wood', p.warm, x, h - 0.42, 0.20, 0.18);
          if (kiosk) {
            f.panel('metal', p.dark, 0, h * 0.57, Math.min(1.05, f.width * 0.42), 0.38);
            for (let j = -2; j <= 2; j++) roundBadge(b, f, j * 0.13, h * 0.57 + Math.sin(j * 1.4) * 0.06, 0.035, p.stone);
            f.panel('metal', p.metal, f.width / 2 - 0.4, h * 0.37, 0.07, 0.30);
          } else if (!middle) roundBadge(b, f, 0, h * 0.69, 0.20, p.warm);
        }
      });
    }
    // Small flush top corner inlays: do not cover the broad paintable top.
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box('metal', p.warm, cx, o.y1 + 0.009, cz, Math.min(0.55, x1 - x0 - 0.4), 0.018, Math.min(0.18, z1 - z0 - 0.3));
  });
}
function kelplineCover(b, o, index) {
  const p = b.palette, h = o.y1 - o.y0;
  b.scope(o.id, 'obstacle-skin', () => {
    band(b, o, 0.15, 0.21, p.dark);
    band(b, o, h - 0.15, 0.20, /kiosk|spawn/.test(o.id) ? p.accent : p.metal);
    for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
      for (const x of [-f.width / 2 + 0.17, f.width / 2 - 0.17]) {
        f.panel('metal', p.dark, x, h / 2, 0.14, h - 0.22);
        for (const y of [0.30, h - 0.30]) roundBadge(b, f, x, y, 0.045, p.metal);
      }
      if (f.width < 1.3) return;
      if (/kiosk|spawn|bridge_edge/.test(o.id)) {
        // Off-white service face with a limited inset blue instrument panel.
        const panelWidth = Math.min(1.6, f.width * 0.46);
        f.panel('metal', p.dark, 0, h * 0.67, panelWidth, 0.42);
        for (let i = 0; i < 3; i++) f.panel('glow', p.lamp, -panelWidth * 0.3 + i * panelWidth * 0.3, h * 0.67, panelWidth * 0.18, 0.05);
        f.panel('metal', p.warm, 0, h - 0.43, f.width - 0.55, 0.08);
        for (let x = -f.width / 2 + 0.4; x < f.width / 2 - 0.3; x += 0.28) f.panel('metal', p.metal, x, 0.42, 0.09, 0.24);
      } else {
        // Cargo/utility cover has raised end clamps, upper cooling ribs and one
        // circular service hatch, while the large central paint face stays clear.
        for (let x = -f.width / 2 + 0.43; x < f.width / 2 - 0.3; x += 0.34) f.panel('metal', p.metal, x, h - 0.37, 0.10, 0.16);
        const x = -f.width / 2 + 0.62;
        roundBadge(b, f, x, Math.min(h * 0.52, 0.92), 0.24, p.dark);
        roundBadge(b, f, x, Math.min(h * 0.52, 0.92), 0.16, p.metal);
        f.panel('metal', p.warm, f.width / 2 - 0.42, h * 0.52, 0.11, Math.min(h * 0.3, 0.55));
      }
    });
  });
}

function floorArt(b, floor) {
  const p = b.palette, [x0, x1, z0, z1] = floor.rect, y = floor.y, bottom = floor.bottom;
  if (floor.material === 'grate') return;
  const raised = bottom > 0, depth = raised ? y - bottom : Math.min(0.62, y + 1.0);
  if (depth < 0.1) return;
  b.scope(floor.id, 'floor-skin', () => {
    // Side-only frames. They never add rails across the authored drop edges.
    const faces = [
      { a: [x0 + 0.06, z0 - 0.012], b: [x1 - 0.06, z0 - 0.012], yaw: 0 },
      { a: [x0 + 0.06, z1 + 0.012], b: [x1 - 0.06, z1 + 0.012], yaw: 0 },
      { a: [x0 - 0.012, z0 + 0.06], b: [x0 - 0.012, z1 - 0.06], yaw: Math.PI / 2 },
      { a: [x1 + 0.012, z0 + 0.06], b: [x1 + 0.012, z1 - 0.06], yaw: Math.PI / 2 },
    ];
    for (const f of faces) {
      const length = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), cx = (f.a[0] + f.b[0]) / 2, cz = (f.a[1] + f.b[1]) / 2;
      const point = (t, h) => [f.a[0] + (f.b[0] - f.a[0]) * t, h, f.a[1] + (f.b[1] - f.a[1]) * t];
      b.box('metal', raised ? p.dark : p.metal, cx, y - 0.1, cz, length, 0.13, 0.022, f.yaw);
      if (raised) {
        b.box('metal', p.dark, cx, bottom + 0.10, cz, length, 0.13, 0.022, f.yaw);
        const n = Math.ceil(length / (b.stage.id === 'tidewater' ? 1.5 : 1.9));
        // Shallow arch / Warren web inside the real solid slab's vertical range.
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n, mid = (t0 + t1) / 2;
          const y0 = bottom + 0.18, arch = y0 + Math.sin(mid * Math.PI) * (depth - 0.34);
          if (b.stage.id === 'tidewater') {
            b.beam('metal', p.accent, point(t0, y0), point(mid, arch), 0.04, 0.026);
            b.beam('metal', p.accent, point(mid, arch), point(t1, y0), 0.04, 0.026);
          } else b.beam('metal', p.accent, point(t0, i % 2 ? y - 0.19 : y0), point(t1, i % 2 ? y0 : y - 0.19), 0.042, 0.022);
        }
      } else {
        for (let t = 0.08; t < 0.98; t += Math.max(1.8 / length, 0.05)) b.box('stone', p.stone, ...point(t, y - 0.38), 0.08, 0.35, 0.022, f.yaw);
      }
    }
    if (raised) {
      // The opaque underside is not a paint target. Steel bay framing gives the
      // real slab a structural underside without lowering available headroom.
      b.box('metal', p.dark, (x0 + x1) / 2, bottom - 0.001, (z0 + z1) / 2, x1 - x0 - 0.07, 0.002, z1 - z0 - 0.07);
      for (let z = z0 + 1.4; z < z1 - 0.5; z += 2.8) b.box('metal', p.metal, (x0 + x1) / 2, bottom - 0.003, z, x1 - x0 - 0.16, 0.004, 0.16);
      for (let x = x0 + 1.4; x < x1 - 0.5; x += 3.5) b.box('metal', p.accent, x, bottom - 0.003, (z0 + z1) / 2, 0.12, 0.004, z1 - z0 - 0.16);
    }
    if (/spawn|arrival|concourse|boarding_rear|ferry|lower_court/.test(floor.id)) {
      // Sparse tactile studs along one short edge; 0.018 WU relief, not a step.
      const z = z0 + 0.45, n = Math.min(24, Math.floor((x1 - x0 - 1) / 0.48));
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) b.cylinder('metal', p.warm, x0 + 0.5 + i * 0.48, y + 0.009, z + j * 0.18, 0.036, 0.018);
    }
  });
}

// Exterior architecture is entirely outside arena bounds by >= 0.7 WU. Its
// visible floors cannot be mistaken for playable space: they stand across open
// water and are separated from every route by the arena's actual boundary.
function exteriorPlanter(b, x, y, z, w = 3.0, d = 1.4) {
  const p = b.palette;
  b.chamfer('stone', p.stone, x, y + 0.56, z, w, 1.12, d, 0.24);
  b.chamfer('metal', p.accent, x, y + 1.14, z, w + 0.10, 0.16, d + 0.10, 0.24);
  b.chamfer('stone', p.dark, x, y + 1.23, z, w - 0.24, 0.03, d - 0.24, 0.18);
  for (let i = 0; i < 7; i++) {
    const cx = x + (i % 3 - 1) * w * 0.26, cz = z + (Math.floor(i / 3) - 1) * d * 0.22;
    for (let k = 0; k < 4; k++) {
      const angle = k * TAU / 4 + i * 1.7, length = 0.65 + (i % 3) * 0.17;
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      const end = [cx + Math.sin(angle) * length * 0.3, y + 1.45 + length * 0.32, cz + Math.cos(angle) * length * 0.3];
      b.add('foliage', leaf, k % 2 ? p.leaf : '#8e9d70', end, [0.17, length * 0.58, 0.09], [Math.cos(angle) * 0.65, angle, Math.sin(angle) * 0.65]); leaf.dispose();
    }
  }
}
function lamp(b, x, y, z, inward = 1) {
  const p = b.palette;
  b.cylinder('metal', p.dark, x, y + 0.22, z, 0.28, 0.44);
  b.cylinder('metal', p.dark, x, y + 2.8, z, 0.095, 5.3);
  b.tube('metal', p.dark, [[x, y + 5.2, z], [x, y + 5.7, z], [x + inward * 0.4, y + 5.92, z], [x + inward * 1.05, y + 5.8, z]], 0.085);
  b.chamfer('metal', p.accent, x + inward * 1.03, y + 5.72, z, 0.80, 0.15, 0.44, 0.12);
  b.box('glow', p.lamp, x + inward * 1.03, y + 5.63, z, 0.62, 0.035, 0.28);
}
function canopy(b, x, y, z, w, d, terminal = false) {
  const p = b.palette, segments = 16;
  const verts = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, xx = (t - 0.5) * w, yy = Math.sin(t * Math.PI) * w * 0.16;
    for (const side of [-1, 1]) { verts.push(x + xx, y + yy, z + side * d / 2); normals.push(0, 1, 0); uvs.push(t * 4, side > 0 ? 2 : 0); }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals();
  b.add(terminal ? 'glass' : 'canopy', g, terminal ? p.glass : p.stone); g.dispose();
  for (let j = 0; j <= 4; j++) {
    const zz = z - d / 2 + j * d / 4, points = [];
    for (let i = 0; i <= 8; i++) points.push([x + (i / 8 - 0.5) * w, y + Math.sin(i / 8 * Math.PI) * w * 0.16 + 0.03, zz]);
    b.tube('metal', j === 0 || j === 4 ? p.accent : p.metal, points, j === 0 || j === 4 ? 0.09 : 0.045);
  }
  for (const xx of [x - w / 2 + 0.18, x + w / 2 - 0.18]) for (const zz of [z - d / 2 + 0.16, z + d / 2 - 0.16]) {
    b.cylinder('metal', p.dark, xx, y - 1.65, zz, 0.09, 3.3);
    b.beam('metal', p.accent, [xx, y - 0.75, zz], [xx + (x - xx) * 0.32, y + 0.23, zz], 0.09);
  }
}
function signBars(b, x, y, z, w, h, word = 'TIDE') {
  const p = b.palette;
  b.chamfer('metal', p.dark, x, y, z, w, h, 0.14, 0.12);
  // Original abstract wayfinding: tidal wave / ferry-lane glyphs with an arrow.
  for (let i = 0; i < 5; i++) {
    const xx = x - w * 0.3 + i * w * 0.11;
    b.box('metal', p.stone, xx, y + Math.sin(i * 1.6) * h * 0.12, z + 0.08, w * 0.065, h * (word === 'TIDE' ? 0.22 : 0.38), 0.025);
  }
  b.beam('metal', p.warm, [x + w * 0.25, y - h * 0.2, z + 0.08], [x + w * 0.38, y, z + 0.08], 0.08, 0.025);
  b.beam('metal', p.warm, [x + w * 0.25, y + h * 0.2, z + 0.08], [x + w * 0.38, y, z + 0.08], 0.08, 0.025);
}
function tidewaterExterior(b) {
  const p = b.palette;
  waterfrontQuays(b);
  for (const s of [-1, 1]) {
    // An inhabited waterside market strip; not a monolithic scenery box.
    for (const [i, z] of [-53, -29, 11, 40].entries()) b.scope(`market-pavilion-${s}-${i}`, 'exterior', () => {
      const x = s * 49, zz = z * s, ground = 1.4;
      b.chamfer('stone', p.stone, x, -0.6, zz, 9, 4, 9, 0.45);
      b.chamfer('wood', p.warm, x, ground + 1.05, zz, 4.4, 2.1, 3.0, 0.24);
      canopy(b, x, ground + 4.4, zz, 7.2, 5.1);
      signBars(b, x, ground + 2.75, zz + 1.6, 3.8, 0.65);
      for (let k = -2; k <= 2; k++) b.box('wood', p.dark, x + k * 0.72, ground + 1.1, zz + 1.52, 0.045, 1.45, 0.06);
      exteriorPlanter(b, x - s * 2.35, ground, zz + 3.2, 2.7, 1.0);
      lamp(b, x + s * 2.6, ground, zz - 3.1, -s);
    });
    b.scope(`tidal-arch-${s}`, 'exterior', () => {
      const x = s * 58, z = s * -5, length = 31;
      // Two shallow tied arches and crossed web rods give a recognisable bridge
      // silhouette behind the playable short bridge, over separated water.
      b.chamfer('stone', p.stone, x, 1.7, z, 5.6, 0.7, length, 0.2);
      for (const dx of [-2.35, 2.35]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) pts.push([x + dx, 2.1 + Math.sin(i / 16 * Math.PI) * 5.0, z - length / 2 + i * length / 16]);
        b.tube('metal', p.accent, pts, 0.24, 8);
        for (let i = 1; i < 16; i++) {
          const zz = z - length / 2 + i * length / 16, yy = 2.1 + Math.sin(i / 16 * Math.PI) * 5;
          b.beam('metal', p.metal, [x + dx, 2.05, zz], [x + dx, yy, zz], 0.075);
        }
        for (const yy of [2.65, 3.15]) b.beam('metal', p.dark, [x + dx, yy, z - length / 2], [x + dx, yy, z + length / 2], 0.085);
      }
      for (const zz of [z - length / 2 + 1, z + length / 2 - 1]) b.chamfer('stone', p.stone, x, 0, zz, 5.8, 4, 1.8, 0.3);
    });
  }
}
function kelplineExterior(b) {
  const p = b.palette;
  waterfrontQuays(b);
  for (const s of [-1, 1]) {
    b.scope(`ferry-terminal-${s}`, 'exterior', () => {
      const x = s * 55, z = s * -30;
      b.chamfer('stone', p.stone, x, 0, z, 14, 5, 32, 0.4);
      b.chamfer('metal', p.stone, x, 6.6, z - 6 * s, 11.4, 8.3, 17, 0.35);
      for (let i = -4; i <= 4; i++) {
        const zz = z + i * 1.8;
        b.box('metal', p.metal, x - s * 5.72, 6.8, zz - 6 * s, 0.10, 7.4, 0.13);
      }
      for (let level = 0; level < 3; level++) {
        b.box('metal', p.dark, x - s * 5.78, 4.1 + level * 2.5, z - 6 * s, 0.10, 1.45, 14.4);
        for (let k = -4; k <= 4; k++) b.box('metal', p.metal, x - s * 5.85, 4.1 + level * 2.5, z - 6 * s + k * 1.6, 0.12, 1.48, 0.08);
      }
      canopy(b, x, 7.0, z + 8 * s, 12.6, 10.4, true);
      signBars(b, x, 9.8, z + 2.7 * s, 6.6, 1.0, 'FERRY');
      for (let i = -2; i <= 2; i++) {
        const zz = z + i * 5.8;
        b.cylinder('metal', p.dark, x - s * 6.0, 2.6, zz, 0.25, 0.95);
        b.cylinder('metal', p.warm, x - s * 6.0, 3.12, zz, 0.34, 0.16);
        const torus = new THREE.TorusGeometry(0.55, 0.18, 8, 14);
        b.add('rubber', torus, '#303b40', [x - s * 7.05, 0.6, zz], [1, 1, 1], [0, Math.PI / 2, 0]); torus.dispose();
      }
      lamp(b, x - s * 5.4, 2.5, z + 13.7 * s, -s);
    });
    b.scope(`terminal-portal-${s}`, 'exterior', () => {
      const x = s * 54, z = s * 18;
      // Distinctive inclined portal, haunched beams and corrugated canopy.
      for (const dz of [-6, 6]) {
        b.beam('metal', p.dark, [x - 5.2, -1.1, z + dz], [x - 4.3, 12, z + dz], 0.75, 0.6);
        b.beam('metal', p.dark, [x + 5.2, -1.1, z + dz], [x + 4.3, 12, z + dz], 0.75, 0.6);
        b.beam('metal', p.accent, [x - 4.3, 12, z + dz], [x + 4.3, 12, z + dz], 0.65, 0.75);
        for (const dir of [-1, 1]) b.beam('metal', p.warm, [x + dir * 4.55, 8.6, z + dz], [x + dir * 1.9, 12, z + dz], 0.26, 0.22);
      }
      canopy(b, x, 10.5, z, 8.5, 11.8, true);
      for (let i = -6; i <= 6; i++) b.box('metal', p.metal, x, 10.7, z + i * 0.84, 8.2, 0.06, 0.07);
      b.chamfer('stone', p.stone, x, 0, z, 12, 4.0, 16, 0.4);
      for (const dz of [-5.9, 5.9]) for (let k = -3; k <= 3; k++) {
        b.cylinder('metal', p.dark, x + k * 1.5, 3.0, z + dz, 0.065, 1.7);
        b.beam('metal', p.warm, [x - 4.7, 3.8, z + dz], [x + 4.7, 3.8, z + dz], 0.09);
      }
    });
  }
}

// Real structural piers below the market's sea edge. These are deliberately
// absent on Kelpline: its elevated footprints overlap working lower routes.
// The same exact bounds drive collision and rendering, so there are no ghost
// supports. `roof` prevents the narrow buried cap becoming a new inkable perch.
function pierColliders(layout) {
  const stage = layout?.map3;
  if (stage?.id !== 'tidewater') return [];
  const result = [];
  for (const side of ['A', 'B']) {
    const f = stage.floors.find(f => f.id === `${side}_market_hall`);
    if (!f) continue;
    const sign = side === 'A' ? 1 : -1;
    const outsideX = sign === 1 ? f.rect[0] : f.rect[1];
    const x = outsideX + sign * 1.2;
    for (const z of [f.rect[2] + 1.1, f.rect[3] - 1.1]) result.push({
      min: [x - 0.55, stage.waterY - 2.4, z - 0.55],
      max: [x + 0.55, f.bottom, z + 0.55], roof: true,
      map3ArtSupport: `${side}_market_pier_${result.length % 2}`,
    });
  }
  return result;
}
function supportArt(b, layout) {
  const p = b.palette;
  for (const c of pierColliders(layout)) b.scope(c.map3ArtSupport, 'support', () => {
    const center = c.min.map((v, i) => (v + c.max[i]) / 2), size = c.min.map((v, i) => c.max[i] - v);
    b.box('stone', p.stone, ...center, ...size);
    // Chamfered collar and fluted relief lie within the declared pier volume.
    b.chamfer('metal', p.accent, center[0], c.max[1] - 0.30, center[2], size[0], 0.50, size[2], 0.12);
    for (let y = b.stage.waterY + 0.3; y < c.max[1] - 0.6; y += 0.8) {
      for (const x of [c.min[0], c.max[0]]) b.box('metal', p.metal, x, y, center[2], 0.018, 0.055, size[2] - 0.16);
      for (const z of [c.min[2], c.max[2]]) b.box('metal', p.metal, center[0], y, z, size[0] - 0.16, 0.055, 0.018);
    }
  });
}

/** Build original static MAP3 architecture; never mutates level or collision. */
export function createMap3Art(scene, level, { castShadow = true } = {}) {
  const stage = level?.layout?.map3;
  if (!stage || !MAP3_ART_PALETTES[stage.id]) return null;
  const tex = acquireTextures(), b = new ArtBuilder(stage), group = new THREE.Group();
  group.name = `map3-art:${stage.id}`;
  const base = { vertexColors: true, roughness: 0.84, metalness: 0, color: 0xffffff };
  const materials = {
    stone: new THREE.MeshStandardMaterial({ ...base, map: tex.stone }),
    metal: new THREE.MeshStandardMaterial({ ...base, map: tex.metal, roughness: 0.51, metalness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ ...base, map: tex.wood, roughness: 0.88 }),
    rubber: new THREE.MeshStandardMaterial({ ...base, roughness: 0.95 }),
    foliage: new THREE.MeshStandardMaterial({ ...base, roughness: 0.93 }),
    canopy: new THREE.MeshStandardMaterial({ ...base, map: tex.stone, side: THREE.DoubleSide, roughness: 0.64 }),
    glass: new THREE.MeshStandardMaterial({ ...base, side: THREE.DoubleSide, roughness: 0.38, transparent: true, opacity: 0.73, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
    signage: new THREE.MeshStandardMaterial({ ...base, map: tex.signage, roughness: 0.86 }),
  };
  try {
    stage.floors.forEach(f => floorArt(b, f));
    supportArt(b, level.layout);
    assemblyArt(b, level.layout);
    stage.obstacles.forEach((o, i) => stage.id === 'tidewater' ? tidewaterCover(b, o, i) : kelplineCover(b, o, i));
    if (stage.id === 'tidewater') tidewaterExterior(b); else kelplineExterior(b);
    if (stage.id === 'tidewater') dressTidewaterLife(b, level.layout); else dressKelplineLife(b, level.layout);
    b.finish(group, materials, castShadow); scene.add(group);
  } catch (error) {
    for (const parts of b.buckets.values()) parts.forEach(g => g.dispose());
    Object.values(materials).forEach(m => m.dispose()); releaseTextures(); throw error;
  }
  const stats = { draws: group.children.length, triangles: group.children.reduce((sum, m) => sum + m.geometry.index.count / 3, 0), parts: b.records.reduce((sum, r) => sum + r.parts, 0) };
  group.userData.map3Art.stats = stats;
  let disposed = false;
  return { group, stats, dispose() {
    if (disposed) return; disposed = true; group.removeFromParent();
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    Object.values(materials).forEach(m => m.dispose()); releaseTextures();
  } };
}

// These additions have real runtime colliders. Every assembly is anchored inside
// one existing cover footprint; the low seat top retains a broad standing area.
// Roof strips, hard planters and utility crowns use the same part bounds below
// for both art and collision, rather than depending on invisible ad-hoc volumes.
export function map3ArtAssemblies(layout) {
  const stage = layout?.map3; if (!stage || !MAP3_ART_PALETTES[stage.id]) return [];
  const out = [], p = MAP3_ART_PALETTES[stage.id];
  for (const o of stage.obstacles) {
    const [x0, x1, z0, z1] = o.rect, w = x1 - x0, d = z1 - z0, x = (x0 + x1) / 2, z = (z0 + z1) / 2, y = o.y1;
    const family = /sea_lip/.test(o.id) ? 'arch-rail' : stage.id === 'tidewater'
      ? /market_screen|civic_screen|arrival_screen/.test(o.id) ? 'vendor' : /terrace_screen/.test(o.id) ? 'crates' : /court_cover|bridge_cover|mid_screen/.test(o.id) ? 'planter' : /east_screen/.test(o.id) ? 'machine' : null
      : /kiosk/.test(o.id) ? 'terminal-kiosk' : /cargo|stack/.test(o.id) ? 'crates' : /service_cover|ferry_cover|bridge_edge/.test(o.id) ? 'machine' : null;
    if (!family) continue;
    const a = { id: `${o.id}:${family}`, owner: o.id, family, parts: [], source: o };
    const teamSign = o.id.startsWith('B_') ? -1 : 1;
    const part = (kind, center, size, color, extra = {}) => {
      const min = center.map((v, i) => v - size[i] / 2), max = center.map((v, i) => v + size[i] / 2);
      a.parts.push({ kind, center, size, min, max, color, ...extra });
    };
    if (family === 'vendor' || family === 'terminal-kiosk') {
      const fabricColor = /market_screen/.test(o.id) ? '#b6634a' : /civic_screen/.test(o.id) ? '#6d9480' : '#c0a163';
      const rise = Math.min(w * 0.18, 0.85), lift = family === 'vendor' ? 0.85 : 1.15, count = 8, width = w - 0.18, depth = d - 0.16;
      for (let i = 0; i < count; i++) {
        const left = x - width / 2 + i * width / count, right = left + width / count;
        const yl = y + lift + Math.sin(i / count * Math.PI) * rise, yr = y + lift + Math.sin((i + 1) / count * Math.PI) * rise;
        const height = Math.abs(yr - yl) + 0.16;
        part('roof-strip', [(left + right) / 2, (yl + yr) / 2, z], [right - left + 0.065, height, depth], family === 'vendor' ? i % 2 ? p.stone : fabricColor : p.glass, { left, right, yl, yr, clear: family === 'terminal-kiosk' });
      }
      for (const xx of [x0 + 0.18, x1 - 0.18]) for (const zz of [z0 + 0.18, z1 - 0.18]) part('post', [xx, y + lift / 2, zz], [0.17, lift + 0.05, 0.17], p.dark);
      part('sign', [x, y + lift * 0.62, teamSign > 0 ? z1 - 0.08 : z0 + 0.08], [Math.max(0.5, w - 0.58), 0.42, 0.12], p.accent, { front: teamSign });
    } else if (family === 'planter') {
      const sign = o.id.startsWith('B_') ? -1 : 1, depth = Math.min(0.6, d * 0.36), zz = z + sign * (d / 2 - depth / 2 - 0.19);
      part('planter-bed', [x, y + 0.16, zz], [w - 0.5, 0.32, depth], p.accent);
      part('foliage', [x, y + 0.48, zz], [w - 0.62, 0.37, depth - 0.1], p.leaf);
    } else if (family === 'crates') {
      const ww = Math.min(w * 0.43, 1.9), dd = Math.min(d * 0.63, 2.1);
      for (const dir of [-1, 1]) part('crate', [x + dir * teamSign * w * 0.23, y + (dir > 0 ? 0.38 : 0.58), z], [ww, dir > 0 ? 0.76 : 1.16, dd], dir > 0 ? p.warm : p.accent);
    } else if (family === 'machine') {
      // Covered service streets have a 3.0 WU ceiling. A 0.68-WU crown
      // fits the 1.8-WU low body; upper equipment uses the same scale.
      const radius = Math.min(w * 0.20, d * 0.30, 0.64), height = 0.66;
      for (const dir of [-1, 1]) part('fan', [x + dir * w * 0.22, y + height / 2, z], [radius * 2, height, radius * 2], dir > 0 ? p.metal : p.accent);
      part('service-box', [x, y + 0.22, z + (o.id.startsWith('central_') ? 0 : teamSign * d * 0.28)], [Math.min(w * 0.45, 1.5), 0.44, Math.min(0.45, d * 0.2)], p.dark);
    } else {
      const longZ = d > w, length = Math.max(w, d) - 0.24, radius = 0.055, segments = 8;
      for (let i = 0; i < segments; i++) {
        const t0 = i / segments, t1 = (i + 1) / segments;
        const l0 = -length / 2 + t0 * length, l1 = -length / 2 + t1 * length;
        const yl = y + 0.10 + Math.sin(t0 * Math.PI) * 1.65, yr = y + 0.10 + Math.sin(t1 * Math.PI) * 1.65;
        const a0 = [x + (longZ ? 0 : l0), yl, z + (longZ ? l0 : 0)], a1 = [x + (longZ ? 0 : l1), yr, z + (longZ ? l1 : 0)];
        part('arch-rod', a0.map((v, k) => (v + a1[k]) / 2), a0.map((v, k) => Math.abs(v - a1[k]) + radius * 2), p.accent, { a0, a1, radius, rail: true });
        if (i > 0 && i % 2 === 0) part('post', [a0[0], (y + yl) / 2, a0[2]], [0.09, yl - y, 0.09], p.metal, { rail: true });
      }
    }
    out.push(a);
  }
  return out.concat(bridgeAssemblies(stage));
}
export function map3ArtColliders(layout) {
  return [...pierColliders(layout), ...map3ArtAssemblies(layout).flatMap(a => a.parts.map((p, index) => ({
    min: [...p.min], max: [...p.max], roof: true, rail: !!p.rail, ...(p.obb || {}),
    map3ArtSupport: `${a.id}:${index}`, map3ArtOwner: p.owner || a.owner, map3ArtKind: a.family,
  })))];
}
function assemblyArt(b, layout) {
  const palette = b.palette;
  for (const a of map3ArtAssemblies(layout)) {
    const o = a.source;
    for (const [partIndex, p] of a.parts.entries()) {
      b.scope(`${a.id}:${partIndex}`, 'assembly-part', () => {
        const [x, y, z] = p.center, [w, h, d] = p.size;
        if (p.kind === 'portal-beam') {
          b.add('metal', box, p.color, p.center, p.obb.size, [0, p.obb.rotY * Math.PI / 180, 0]);
        } else if (p.kind === 'roof-strip') {
          const length = Math.hypot(p.right - p.left, p.yr - p.yl), angle = Math.atan2(p.yr - p.yl, p.right - p.left);
          b.add(p.clear ? 'glass' : 'canopy', box, p.color, p.center, [length, 0.12, d], [0, 0, angle]);
          for (const dz of [-d / 2 + 0.025, d / 2 - 0.025]) b.beam('metal', palette.dark, [p.left, p.yl, z + dz], [p.right, p.yr, z + dz], 0.07, 0.07);
        } else if (p.kind === 'post') b.cylinder('metal', p.color, x, y, z, w / 2, h);
        else if (p.kind === 'arch-rod') b.beam('metal', p.color, p.a0, p.a1, p.radius * 1.5, p.radius * 1.5);
        else if (p.kind === 'foliage') {
          // Layered, oblique leaves replace the evenly spaced bead-like balls.
          // Every stem/leaf remains inside the existing non-inkable crown.
          for (let i = 0; i < 7; i++) {
            const xx = x + (i / 6 - 0.5) * w * 0.78;
            const yy = p.min[1] + h * (0.51 + (i % 3) * 0.04);
            b.beam('foliage', '#536d49', [xx, p.min[1] + 0.025, z], [xx, yy, z], 0.028);
            for (let k = 0; k < 3; k++) {
              const a = i * 1.7 + k * 2.1, r = Math.min(w * 0.048, d * 0.24);
              b.add('foliage', leafCluster, ['#698457', '#88996b', '#a6ad7d'][(i + k) % 3],
                [xx + Math.cos(a) * r * 0.25, yy, z + Math.sin(a) * d * 0.10],
                [r, h * 0.30, d * 0.16], [0, a, 0.28 * Math.sin(a)]);
            }
          }
        } else if (p.kind === 'fan') {
          b.cylinder('metal', palette.dark, x, p.min[1] + 0.08, z, w / 2, 0.16);
          b.cylinder('metal', p.color, x, y + 0.01, z, w * 0.43, h * 0.8);
          b.cylinder('metal', palette.dark, x, p.max[1] - 0.035, z, w * 0.41, 0.055);
          for (let k = 0; k < 6; k++) b.box('metal', palette.metal, x, p.max[1] - 0.012, z, w * 0.74, 0.02, 0.045, k * Math.PI / 6);
        } else {
          b.chamfer(p.kind === 'crate' ? 'wood' : 'metal', p.color, x, y, z, w, h, d, Math.min(0.12, d / 4));
          if (p.kind === 'crate') {
            for (const dz of [-d / 2 + 0.015, d / 2 - 0.015]) {
              for (const yy of [p.min[1] + 0.12, p.max[1] - 0.12]) b.box('wood', palette.dark, x, yy, z + dz, w - 0.10, 0.10, 0.018);
              b.beam('wood', palette.stone, [p.min[0] + 0.12, p.min[1] + 0.2, z + dz], [p.max[0] - 0.12, p.max[1] - 0.2, z + dz], 0.07, 0.018);
            }
          }
          if (p.kind === 'sign') for (let i = -3; i <= 3; i++) b.box('metal', palette.stone, x + i * Math.min(0.25, w / 9), y + Math.sin(i) * 0.025, (p.front > 0 ? p.max[2] - 0.004 : p.min[2] + 0.004), 0.12, i % 2 ? 0.19 : 0.13, 0.012);
        }
      });
    }
    if (!a.source) continue;
    // High contrast visual functions occupy limited existing-face panels. The
    // remaining broad neutral faces retain their original ink/standing model.
    b.scope(o.id, 'obstacle-skin', () => {
      if (a.family === 'vendor' || a.family === 'terminal-kiosk') {
        for (const side of [0, 2]) faceFrame(b, o, side, f => {
          f.panel('metal', palette.dark, 0, f.height * 0.65, f.width - 0.65, Math.min(0.8, f.height * 0.25));
          for (let k = -1; k <= 1; k++) f.panel('metal', palette.metal, k * f.width * 0.22, f.height * 0.65, 0.055, Math.min(0.82, f.height * 0.26));
          f.panel('wood', palette.warm, 0, f.height * 0.49, f.width - 0.45, 0.15);
        });
      } else if (a.family === 'crates') {
        for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
          for (let y = 0.45; y < f.height - 0.3; y += 0.5) f.panel('wood', palette.warm, 0, y, f.width - 0.42, 0.12);
        });
      } else if (a.family === 'machine') {
        for (let side = 0; side < 4; side++) faceFrame(b, o, side, f => {
          for (let k = 0; k < 5; k++) f.panel('metal', palette.dark, 0, f.height * 0.42 + k * 0.12, Math.min(1.4, f.width - 0.55), 0.06);
        });
      }
    });
  }
}

// A connected off-limits working waterfront gives every exterior bridge and
// pavilion a destination. The central arch remains over a real water channel;
// its abutments join side branches of the long quay and an outer building row.
function waterfrontQuays(b) {
  const p = b.palette, tide = b.stage.id === 'tidewater';
  for (const sign of [-1, 1]) b.scope(`waterfront-quay-${sign}`, 'exterior', () => {
    const x = sign * (tide ? 49 : 55), top = tide ? 1.4 : 2.5, width = tide ? 9 : 17;
    b.box('stone', p.stone, x, top - 2.6, 0, width, 5.2, 158);
    b.box('stone', p.metal, x, top - 0.12, 0, width + 0.04, 0.24, 158);
    // Repeated quay bollards, coping and timber seating tie the separate bays.
    const inner = x - sign * (width / 2 - 0.18);
    for (let z = -75; z <= 75; z += 7.5) {
      b.cylinder('metal', p.dark, inner, top + 0.28, z, 0.11, 0.56);
      b.cylinder('metal', p.warm, inner, top + 0.58, z, 0.17, 0.12);
    }
    if (tide) {
      for (const z of [-22.8, 13.5]) b.box('stone', p.stone, sign * 60, 0.5, sign * z, 22, 2.0, 5.6);
      b.box('stone', p.stone, sign * 73, -0.4, 0, 18, 3.6, 158);
    } else b.box('stone', p.stone, sign * 74, 0.5, 0, 22, 4.0, 158);
    const buildingX = sign * (tide ? 73 : 75);
    for (let i = 0; i < 6; i++) {
      const z = -65 + i * 25, height = (tide ? 9 : 13) + (i % 3) * 2.2, depth = 17 + i % 2 * 3;
      const color = i % 3 === 0 ? p.accent : p.stone;
      b.chamfer('stone', color, buildingX, top + height / 2, z, 12, height, depth, 0.28);
      b.chamfer('metal', p.dark, buildingX, top + height + 0.16, z, 12.5, 0.32, depth + 0.5, 0.18);
      const facadeX = buildingX - sign * 6.02;
      for (let floor = 0; floor < Math.floor(height / 2.8); floor++) for (let bay = -2; bay <= 2; bay++) {
        b.box('metal', p.dark, facadeX, top + 1.65 + floor * 2.8, z + bay * depth / 6, 0.035, 1.35, depth / 7.2);
        b.box('metal', p.metal, facadeX - sign * 0.08, top + 1.65 + floor * 2.8, z + bay * depth / 6, 0.05, 1.38, 0.065);
        b.box('metal', p.warm, facadeX - sign * 0.17, top + 2.40 + floor * 2.8, z + bay * depth / 6, 0.36, 0.10, depth / 6.7);
      }
      if (tide && i % 2 === 0) exteriorPlanter(b, sign * 64.8, top, z, 2.6, 2.3);
    }
  });
}

// Playable bridge architecture is sparse and intentionally leaves its end
// mouths and authored drops open. Nothing is suspended below the actual deck.
function bridgeAssemblies(stage) {
  const p = MAP3_ART_PALETTES[stage.id], result = [];
  function member(a, kind, a0, a1, width, color, owner, rail = false) {
    const center = a0.map((v, i) => (v + a1[i]) / 2), size = a0.map((v, i) => Math.abs(v - a1[i]) + width);
    const part = { kind, center, size, a0, a1, radius: width / 2, color, owner, rail,
      min: center.map((v, i) => v - size[i] / 2), max: center.map((v, i) => v + size[i] / 2) };
    if (kind === 'portal-beam') {
      const dx = a1[0] - a0[0], dz = a1[2] - a0[2], length = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
      const ex = Math.abs(Math.sin(angle)) * length / 2 + Math.abs(Math.cos(angle)) * width / 2;
      const ez = Math.abs(Math.cos(angle)) * length / 2 + Math.abs(Math.sin(angle)) * width / 2;
      part.min = [center[0] - ex, center[1] - width / 2, center[2] - ez]; part.max = [center[0] + ex, center[1] + width / 2, center[2] + ez];
      part.obb = { obox: true, center: [...center], size: [width, width, length], rotY: angle * 180 / Math.PI };
    }
    a.parts.push(part);
  }
  if (stage.id === 'tidewater') {
    for (const f of stage.floors.filter(f => /_market_bridge$/.test(f.id))) {
      const a = { id: `${f.id}:tied-arches`, owner: f.id, family: 'market-bridge', parts: [] }, [x0, x1, z0, z1] = f.rect;
      const left = x0 + 0.3, right = x1 - 0.3, segments = 12;
      for (const z of [z0 + 0.3, z1 - 0.3]) {
        for (const x of [left, right]) member(a, 'post', [x, f.y + 0.09, z], [x, f.y + 0.65, z], 0.17, p.dark, f.id);
        for (let i = 0; i < segments; i++) {
          const t0 = i / segments, t1 = (i + 1) / segments;
          const a0 = [left + t0 * (right - left), f.y + 0.65 + Math.sin(t0 * Math.PI) * 2.35, z];
          const a1 = [left + t1 * (right - left), f.y + 0.65 + Math.sin(t1 * Math.PI) * 2.35, z];
          member(a, 'arch-rod', a0, a1, 0.15, p.accent, f.id);
          if (i === 3 || i === 9) member(a, 'arch-rod', [a0[0], f.y + 1.20, z], a0, 0.045, p.metal, f.id, true);
        }
      }
      result.push(a);
    }
  } else {
    const a = { id: 'central-transfer-portals', owner: 'central_service', family: 'terminal-portal', parts: [] };
    const supports = [[-11.6, -5.4], [10.4, 8.6], [-10.4, -8.6], [11.6, 5.4]], top = 13.0;
    for (const [x, z] of supports) {
      const owner = x < 0 ? 'A_bridge_edge' : 'B_bridge_edge';
      member(a, 'post', [x, 5.98, z], [x, top, z], 0.32, p.dark, owner);
    }
    for (const [i, j] of [[0, 1], [2, 3]]) member(a, 'portal-beam', [supports[i][0], top, supports[i][1]], [supports[j][0], top, supports[j][1]], 0.48, p.accent, 'central_service');
    for (const [i, j] of [[0, 2], [1, 3]]) member(a, 'portal-beam', [supports[i][0], top, supports[i][1]], [supports[j][0], top, supports[j][1]], 0.24, p.warm, 'central_service');
    result.push(a);
  }
  return result;
}

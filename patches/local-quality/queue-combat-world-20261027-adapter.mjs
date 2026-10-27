// Reviewed terminal transformations for legacy adapter-owned sources.
// Direct-owned authored modules carry their edits directly under the ownership gate.
// The terminal GPU-22 adapter owns shell static-attribute dirty ranges and GPU-08b
// owns SwimWake point pooling. Applying the old axisDirty/free-list queue edits
// here would double-own those buffers and break exact source composition.
const CHANGES = [
  [
    "src/fx/fx.js",
    "else { i = this._recycle % this.dCap; this._recycle += 7; }",
    "else { i = this._recycle % this.dCap; this._recycle = (i + (this.dCap % 7 === 0 ? 1 : 7)) % this.dCap; }",
    "droplet-overflow-coprime"
  ],
  [
    "src/fx/fx.js",
    "if (B.n < B.cap) i = B.n++; else i = 0;",
    "if (B.n < B.cap) i = B.n++; else { i = B.recycle || 0; B.recycle = (i + 1) % B.cap; }",
    "beam-overflow-round-robin"
  ],
  [
    "src/fx/fx.js",
    "function markUpdated(geo, count, staticAttribute = null) {",
    "function markUpdated(geo, count, staticAttribute = null, staticAttribute2 = null) {",
    "static-attribute-pair"
  ],
  [
    "src/fx/fx.js",
    "if (a === staticAttribute) continue;",
    "if (a === staticAttribute || a === staticAttribute2) continue;",
    "static-attribute-pair-skip"
  ],
  [
    "src/fx/fx.js",
    "const R = this.rings;\n    let i;",
    "const R = this.rings;\n    R.staticDirty = true;\n    let i;",
    "ring-birth-dirty"
  ],
  [
    "src/fx/fx.js",
    "const last = --R.n;",
    "const last = --R.n;\n        R.staticDirty = true;",
    "ring-swap-dirty"
  ],
  [
    "src/fx/fx.js",
    "  _updateRings(dt) {\n    const R = this.rings, X = R.X;",
    "  _updateRings(dt) {\n    const R = this.rings, X = R.X;\n    if (this.marks.n > 0) R.staticDirty = true;",
    "ring-immediate-dirty"
  ],
  [
    "src/fx/fx.js",
    "      aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n      aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;",
    "      if (R.staticDirty) {\n        aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n        aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;\n      }",
    "ring-static-copy"
  ],
  [
    "src/fx/fx.js",
    "    markUpdated(R.geo, n);",
    "    markUpdated(R.geo, n, R.staticDirty ? null : R.geo.attributes.aColA, R.staticDirty ? null : R.geo.attributes.aMisc);\n    R.staticDirty = false;",
    "ring-static-upload"
  ],
  [
    "src/fx/fx.js",
    "    this._sprite(this.glows, pos.x + Math.cos(a) * r, pos.y + y, pos.z + Math.sin(a) * r, -Math.sin(a) * 0.6, 0.45 + rand() * 0.3, Math.cos(a) * 0.6,",
    "    const ca = Math.cos(a), sa = Math.sin(a);\n    this._sprite(this.glows, pos.x + ca * r, pos.y + y, pos.z + sa * r, -sa * 0.6, 0.45 + rand() * 0.3, ca * 0.6,",
    "sparkle-angle-trig"
  ],
  [
    "src/fx/fxHooks.js",
    "      this.seenBeams.add(b);\n      const m = b.mesh;",
    "      const m = b.mesh;",
    "beam-retry-unadmitted"
  ],
  [
    "src/fx/fxHooks.js",
    "      if (!this._near(_v, 60) && !this._near(_v2, 40)) continue;",
    "      if (!this._near(_v, 60) && !this._near(_v2, 40)) continue;\n      this.seenBeams.add(b);",
    "beam-admit-visible"
  ],
  [
    "src/world/paint.js",
    "const idx = new Uint32Array(MAX_QUADS * 6);",
    "const idx = new Uint16Array(MAX_QUADS * 6);",
    "paint-quad-u16"
  ],
  [
    "src/world/paint.js",
    "const dT = g.dripDur ? 1 - Math.pow(1 - td, 2.2) : 1;",
    "const dT = g.dripDur && td !== 1 ? 1 - Math.pow(1 - td, 2.2) : 1;",
    "paint-saturated-drip"
  ],
  [
    "src/world/stages/cargo/props.js",
    "constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }",
    "constructor() { this.p = []; this.n = []; this.c = null; this.idx = []; }",
    "cargo-template-static-attrs"
  ],
  [
    "src/world/stages/cargo/props.js",
    "v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(r, g, b); return this.p.length / 3 - 1; }",
    "v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); if (!this.c && (r !== 1 || g !== 1 || b !== 1)) this.c = new Array(this.p.length - 3).fill(1); if (this.c) this.c.push(r, g, b); return this.p.length / 3 - 1; }",
    "cargo-template-optional-colors"
  ],
  [
    "src/world/stages/cargo/props.js",
    "      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));\n      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));",
    "      if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));",
    "cargo-template-omit-constants"
  ],
  [
    "src/world/environment.js",
    "      const n = idx ? idx.count : pos.count;\n      for (let i = 0; i + 2 < n; i += 3) {",
    "      const n = idx ? idx.count : pos.count;\n      const e = mat?.elements;\n      const affine = e && e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1 && pos.isBufferAttribute && !pos.isInterleavedBufferAttribute;\n      for (let i = 0; i + 2 < n; i += 3) {",
    "marina-affine-plane-matrix"
  ],
  [
    "src/world/environment.js",
    "        A.fromBufferAttribute(pos, ia); Bv.fromBufferAttribute(pos, ib); Cv.fromBufferAttribute(pos, ic);\n        if (mat) { A.applyMatrix4(mat); Bv.applyMatrix4(mat); Cv.applyMatrix4(mat); }",
    "        if (affine) {\n          const ax = pos.getX(ia), ay = pos.getY(ia), az = pos.getZ(ia);\n          const bx = pos.getX(ib), by = pos.getY(ib), bz = pos.getZ(ib);\n          const cx = pos.getX(ic), cy = pos.getY(ic), cz = pos.getZ(ic);\n          if (Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bz) && Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz)) {\n            const sa = e[1] * ax + e[5] * ay + e[9] * az + e[13] > Wy;\n            const sb = e[1] * bx + e[5] * by + e[9] * bz + e[13] > Wy;\n            const sc = e[1] * cx + e[5] * cy + e[9] * cz + e[13] > Wy;\n            if (sa === sb && sb === sc) continue;\n          }\n        }\n        A.fromBufferAttribute(pos, ia); Bv.fromBufferAttribute(pos, ib); Cv.fromBufferAttribute(pos, ic);\n        if (mat) { A.applyMatrix4(mat); Bv.applyMatrix4(mat); Cv.applyMatrix4(mat); }",
    "marina-affine-plane-prune"
  ],
  [
    "src/world/environment.js",
    "    const open = (x, z) => !M.decks.some((r) => inR(r, x, z)) && !M.wet.some((r) => inR(r, x, z));",
    "    let openDecks = M.decks, openWet = M.wet;\n    const open = (x, z) => !openDecks.some((r) => inR(r, x, z)) && !openWet.some((r) => inR(r, x, z));",
    "marina-waterline-candidate-owner"
  ],
  [
    "src/world/environment.js",
    "      const n = f.n, u = f.u;\n      const steps = Math.max(2, Math.ceil(f.su / 0.2));",
    "      const n = f.n, u = f.u;\n      openDecks = M.decks; openWet = M.wet;\n      if (Number.isFinite(f.su)) {\n        const fixedX = f.origin.x + u.x * 0 + n.x * 0.3, fixedZ = f.origin.z + u.z * 0 + n.z * 0.3;\n        if (u.x === 0 && Number.isFinite(fixedX)) {\n          openDecks = M.decks.filter(r => fixedX > r.minX && fixedX < r.maxX);\n          openWet = M.wet.filter(r => fixedX > r.minX && fixedX < r.maxX);\n        } else if (u.z === 0 && Number.isFinite(fixedZ)) {\n          openDecks = M.decks.filter(r => fixedZ > r.minZ && fixedZ < r.maxZ);\n          openWet = M.wet.filter(r => fixedZ > r.minZ && fixedZ < r.maxZ);\n        }\n      }\n      const steps = Math.max(2, Math.ceil(f.su / 0.2));",
    "marina-waterline-axis-prune"
  ],
  [
    "src/game/weapons.js",
    "new THREE.Color(0.6, 0.6, 0.6)",
    "(this._arcNoInkGray || (this._arcNoInkGray = new THREE.Color(0.6, 0.6, 0.6)))",
    "weapons-native-bomb-arc-cache-low-ink-gray-color",
    1
  ],
  [
    "src/fx/fxHooks.js",
    "    const near = this._near(pos, 36);",
    "    const camera = this.G.camera, cameraD2 = camera ? camera.position.distanceToSquared(pos) : Infinity;\n    const near = cameraD2 < 36 * 36;",
    "fxhooks-actor-distance-once",
    1
  ],
  [
    "src/fx/fxHooks.js",
    "onEnemy && this._near(pos, 22)",
    "onEnemy && cameraD2 < 22 * 22",
    "fxhooks-enemy-distance-reuse",
    1
  ]
];
export function adaptCombatWorldQueue20261027(rel, code) {
  for (const [file, before, after, label, expected = 1] of CHANGES) {
    if (rel !== file) continue;
    const count = code.split(before).length - 1;
    if (count !== expected) throw new Error(`Queue combat/world ${label}: ${rel}: expected ${expected} anchors, got ${count}`);
    code = code.split(before).join(after);
  }
  return code;
}

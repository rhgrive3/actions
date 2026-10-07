// Release consumed static PropKit parts; replay placements without retaining duplicate animation records.
const patches = [
  [
    "    this._headless = !!opts.headless || typeof document === 'undefined';\n    if (!this._headless) this._makeMaterials();\n    this._buckets = new Map();\n    this._spin = []; this._blink = []; this._flags = []; this._banners = [];\n    this._meshes = []; this._inst = [];\n    this._tpl = {};\n",
    "    this._headless = !!opts.headless || typeof document === 'undefined';\n    if (!this._headless) this._makeMaterials();\n    this._buckets = new Map();\n    this._placements = [];   // lightweight {type, o} records: regenerate build buckets on rebuild\n    this._released = false;  // true once build() has released the consumed static buckets\n    this._spin = []; this._blink = []; this._flags = []; this._banners = [];\n    this._meshes = []; this._inst = [];\n    this._tpl = {};\n"
  ],
  [
    "  }\n  _tplTris(kind) { return triCountOf(this._tplGeo(kind)); }\n\n  add(type, o = {}) {\n    const def = D[type];\n    if (!def) { console.warn('[props] unknown prop type', type); return { colliders: [] }; }\n    const pos = o.pos || [0, 0, 0], rotY = o.rotY || 0, scale = o.scale ?? 1;\n    const seed = o.seed ?? ((Math.round(pos[0] * 131) ^ Math.round(pos[2] * 71) ^ Math.round(pos[1] * 17)) + 1013);\n    const B = this._B;\n    B.begin(pos, rotY, scale, seed, def.mount !== 'wall' || type === 'pipes' || type === 'ladder' || type === 'container_door');\n    B.tris = 0;\n    def.build(B, o);\n    this.lastTris = B.tris;\n    this.count++;\n    return { colliders: this._xfCols(B.cols, pos, rotY, scale, !!o.oboxCols) };\n  }\n\n  // Local collider boxes → level boxes. A quarter-turned prop gives exact axis-aligned boxes; any other angle gives the\n",
    "  }\n  _tplTris(kind) { return triCountOf(this._tplGeo(kind)); }\n\n  // Shared placement runner: seeds the builder from the placement and runs the definition to\n  // populate `_buckets`. Used by add() (fresh placement) and _replayBuckets() (same-instance rebuild\n  // after the consumed buckets were released). Deterministic: the seeded rng + quality factor drive\n  // every generated vertex, so replaying the same placements reproduces identical geometry.\n  _place(def, type, o) {\n    const pos = o.pos || [0, 0, 0], rotY = o.rotY || 0, scale = o.scale ?? 1;\n    const seed = o.seed ?? ((Math.round(pos[0] * 131) ^ Math.round(pos[2] * 71) ^ Math.round(pos[1] * 17)) + 1013);\n    const B = this._B;\n    B.begin(pos, rotY, scale, seed, def.mount !== 'wall' || type === 'pipes' || type === 'ladder' || type === 'container_door');\n    B.tris = 0;\n    def.build(B, o);\n    return { pos, rotY, scale, B };\n  }\n\n  add(type, o = {}) {\n    const def = D[type];\n    if (!def) { console.warn('[props] unknown prop type', type); return { colliders: [] }; }\n    const { pos, rotY, scale, B } = this._place(def, type, o);\n    this.lastTris = B.tris;\n    this.count++;\n    this._placements.push({ type, o });\n    return { colliders: this._xfCols(B.cols, pos, rotY, scale, !!o.oboxCols) };\n  }\n\n  // Regenerate released build buckets from the recorded placements (same-instance rebuild).\n  // Does not touch count/lastTris/colliders — those are established by the first add().\n  _replayBuckets() {\n    // Recreate each animated record exactly once alongside its static geometry.\n    this._spin = []; this._blink = []; this._flags = []; this._banners = [];\n    for (const p of this._placements) {\n      const def = D[p.type];\n      if (def) this._place(def, p.type, p.o);\n    }\n  }\n\n  // Local collider boxes → level boxes. A quarter-turned prop gives exact axis-aligned boxes; any other angle gives the\n"
  ],
  [
    "  }\n\n  build() {\n    this._disposeMeshes();\n    if (this._headless) return this;\n    for (const [bucket, parts] of this._buckets) {\n",
    "  }\n\n  build() {\n    // A prior build released the consumed buckets; regenerate them from the recorded placements so\n    // a same-instance rebuild re-merges identical geometry instead of wiping the live meshes.\n    if (this._released) { this._buckets.clear(); this._replayBuckets(); }\n    this._disposeMeshes();\n    if (this._headless) return this;\n    for (const [bucket, parts] of this._buckets) {\n"
  ],
  [
    "      this.group.add(mesh); this._inst.push(mesh);\n    }\n    this._applyColors();\n    return this;\n  }\n\n",
    "      this.group.add(mesh); this._inst.push(mesh);\n    }\n    this._applyColors();\n    // Release the consumed static build graph now that every part is merged into the final buffers.\n    // Part records, per-part Matrix4s and uncached procedural tube sources become garbage; shared\n    // TPL templates stay owned by the module cache and are never disposed here. The separate\n    // animated/instanced records (_spin/_blink/_flags/_banners) are retained for update().\n    this._buckets.clear();\n    this._released = true;\n    return this;\n  }\n\n"
  ],
  [
    "  clear() {\n    this._disposeMeshes();\n    this._buckets.clear();\n    this._spin = []; this._blink = []; this._flags = []; this._banners = [];\n    this.count = 0;\n  }\n",
    "  clear() {\n    this._disposeMeshes();\n    this._buckets.clear();\n    this._placements = []; this._released = false;\n    this._spin = []; this._blink = []; this._flags = []; this._banners = [];\n    this.count = 0;\n  }\n"
  ]
];
export function adaptPropRetention(rel, code) {
  if (rel !== "src/world/props.js") return code;
  for (const [before, after] of patches) {
    const at = code.indexOf(before);
    if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error("Prop retention anchor conflict");
    code = code.slice(0, at) + after + code.slice(at + before.length);
  }
  return code;
}

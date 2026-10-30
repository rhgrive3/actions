// Final composed-source refinements. Anchors are exact and run after existing adapters.
// Only non-contributing work or a guaranteed overwritten result is omitted.
const changes = [
  {
    "rel": "src/game/character.js",
    "old": "      const tl = Math.hypot(tx, ty, tz); if (tl > 0.62) { tx *= 0.62 / tl; ty *= 0.62 / tl; tz *= 0.62 / tl; }",
    "new": "      // Preserve hypot's scaling/rounding for boundary and non-finite inputs.\n      const gravityLength2 = tx * tx + ty * ty + tz * tz;\n      if (!(Number.isFinite(gravityLength2) && gravityLength2 < 0.62 * 0.62 - 1e-10)) {\n        const tl = Math.hypot(tx, ty, tz); if (tl > 0.62) { tx *= 0.62 / tl; ty *= 0.62 / tl; tz *= 0.62 / tl; }\n      }",
    "label": "hair gravity conservative hypot guard",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "  const teleport=!this.rootSet||Math.hypot(dx,dy,dz)>HOST_MOTION.teleportDistance;",
    "new": "  let teleport=!this.rootSet;\n  if(!teleport){\n   const limit=HOST_MOTION.teleportDistance,d2=dx*dx+dy*dy+dz*dz,limit2=limit*limit;\n   teleport=Number.isFinite(d2)&&Math.abs(d2-limit2)>1e-10?d2>limit2:Math.hypot(dx,dy,dz)>limit;\n  }",
    "label": "source teleport conservative squared guard",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "   this.squidBank.sample(name,frame,this.squidPose);\n   if((name==='Sqd_ToHuman'||name==='Sqd_ToSquid'&&this.returnInterrupted)&&this.formTime<this.formDuration){",
    "new": "   const blendForm=(name==='Sqd_ToHuman'||name==='Sqd_ToSquid'&&this.returnInterrupted)&&this.formTime<this.formDuration;\n   const blendClip=this.squidBlendTime<HOST_MOTION.transitionSeconds&&!name.startsWith('Sqd_To');\n   // Both blend paths overwrite world transforms, then run the required final FK.\n   this.squidBank.sample(name,frame,this.squidPose,undefined,!(blendForm||blendClip));\n   if(blendForm){",
    "label": "skip sampled squid FK only before guaranteed replacement FK",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "   else if(this.squidBlendTime<HOST_MOTION.transitionSeconds&&!name.startsWith('Sqd_To')){",
    "new": "   else if(blendClip){",
    "label": "reuse the exact squid blend predicate",
    "count": 1
  },
  {
    "rel": "src/fx/fx.js",
    "old": "  float r = length(vUv);\n  if (r > 1.0) discard;\n  float st = vMisc.y;",
    "new": "  // Outside a generous float32 boundary band, length must also exceed one.\n  // Keep the original length and comparison for every surviving fragment.\n  if (dot(vUv, vUv) > 1.000001) discard;\n  float r = length(vUv);\n  if (r > 1.0) discard;\n  float st = vMisc.y;",
    "label": "ring conservative squared-radius reject",
    "count": 1
  },
  {
    "rel": "src/fx/fx.js",
    "old": "  float jet = max(fxN3v(n * 3.3 + s) - 0.52, 0.0) * 2.1;",
    "new": "  float jet = 0.0;\n  if (aAxis.w != 1.0) jet = max(fxN3v(n * 3.3 + s) - 0.52, 0.0) * 2.1;",
    "label": "shell omit zero crown jet noise",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "      col += uCharge.rgb * exp(-abs(r - mix(0.95, 0.3, uCharge.a)) * 40.0) * uCharge.a * 0.35 * step(0.01, uCharge.a);",
    "new": "      if (uCharge.a >= 0.01) col += uCharge.rgb * exp(-abs(r - mix(0.95, 0.3, uCharge.a)) * 40.0) * uCharge.a * 0.35 * step(0.01, uCharge.a);",
    "label": "focus omit zero charge exponential",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "      float fs = Lc.r + Lc.g;\n      if (fs > 0.03) {\n        vec2 tx = uLensTexel * 1.5;\n        vec4 Lx1 = texture2D(tLens, vUv + vec2(tx.x, 0.0)), Lx0 = texture2D(tLens, vUv - vec2(tx.x, 0.0));\n        vec4 Ly1 = texture2D(tLens, vUv + vec2(0.0, tx.y)), Ly0 = texture2D(tLens, vUv - vec2(0.0, tx.y));",
    "new": "      float fs = Lc.r + Lc.g;\n      vec4 Lx1 = vec4(0.0), Lx0 = vec4(0.0), Ly1 = vec4(0.0), Ly0 = vec4(0.0);\n      // tLens is a non-mipmapped linear render target; both films use the same taps.\n      if (fs > 0.03 || Lc.b > 0.03) {\n        vec2 tx = uLensTexel * 1.5;\n        Lx1 = texture2D(tLens, vUv + vec2(tx.x, 0.0)); Lx0 = texture2D(tLens, vUv - vec2(tx.x, 0.0));\n        Ly1 = texture2D(tLens, vUv + vec2(0.0, tx.y)); Ly0 = texture2D(tLens, vUv - vec2(0.0, tx.y));\n      }\n      if (fs > 0.03) {",
    "label": "share identical lens-film neighbor samples",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "        vec2 tx = uLensTexel * 1.5;\n        float wx = texture2D(tLens, vUv + vec2(tx.x, 0.0)).b - texture2D(tLens, vUv - vec2(tx.x, 0.0)).b;\n        float wy = texture2D(tLens, vUv + vec2(0.0, tx.y)).b - texture2D(tLens, vUv - vec2(0.0, tx.y)).b;",
    "new": "        float wx = Lx1.b - Lx0.b;\n        float wy = Ly1.b - Ly0.b;",
    "label": "water film reuses lens neighbor samples",
    "count": 1
  },
  {
    "rel": "src/world/levelMaterial.js",
    "old": "    mark *= 0.75 + 0.25 * step(0.35, vnoise(vWPos.xz * 6.0));",
    "new": "    if (vWNorm.y > 0.5 && mark != 0.0) mark *= 0.75 + 0.25 * step(0.35, vnoise(vWPos.xz * 6.0));",
    "label": "court omit zero marking wear noise",
    "count": 2
  },
  {
    "rel": "src/world/levelMaterial.js",
    "old": "      base = mix(base, vec3(0.42, 0.2, 0.1) * (0.8 + 0.4 * vnoise(fu * 11.0)), rust * 0.42);",
    "new": "      if (rust != 0.0) base = mix(base, vec3(0.42, 0.2, 0.1) * (0.8 + 0.4 * vnoise(fu * 11.0)), rust * 0.42);",
    "label": "container omit zero rust color noise",
    "count": 1
  },
  {
    "rel": "src/world/levelMaterial.js",
    "old": "      float slot = smoothstep(0.3 - fw / 0.025, 0.3 + fw / 0.025, abs(fract(run / 0.025) - 0.5) * 2.0);\n      float bar = mix(0.4, slot, clamp(0.025 / (fw * 4.0) - 0.5, 0.0, 1.0));",
    "new": "      float bar = 0.4;\n      // fw is evaluated before divergence; bar is consumed only through chan.\n      if (chan != 0.0) {\n        float slot = smoothstep(0.3 - fw / 0.025, 0.3 + fw / 0.025, abs(fract(run / 0.025) - 0.5) * 2.0);\n        bar = mix(0.4, slot, clamp(0.025 / (fw * 4.0) - 0.5, 0.0, 1.0));\n      }",
    "label": "drain omit zero channel slot work",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "  // ---- baked volumetric cumulus (slow drift = rotation of the whole field) ----\n  {",
    "new": "  // ---- baked volumetric cumulus (slow drift = rotation of the whole field) ----\n  if (d.y > -0.002) {",
    "label": "sky omit zero cumulus coverage",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "  if (d.y > 0.02) {",
    "new": "  if (d.y > 0.06) {",
    "label": "sky omit zero cirrus coverage",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "    float lit = step(r, style > 2.5 && style < 3.5 ? 0.34 : 0.44);\n    lit = mix(lit, 0.38, far);\n    vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.8, 0.88, 1.0), step(0.78, hash12(id * 1.7 + seed)));\n    hzLitCol = lc * lit * glass;",
    "new": "    if (uNight != 0.0) {\n      float lit = step(r, style > 2.5 && style < 3.5 ? 0.34 : 0.44);\n      lit = mix(lit, 0.38, far);\n      vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.8, 0.88, 1.0), step(0.78, hash12(id * 1.7 + seed)));\n      hzLitCol = lc * lit * glass;\n    }",
    "label": "city omit daytime emissive color hash",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "      this.mdx = damp(this.mdx, this.kgx * il, 10, dt); this.mdz = damp(this.mdz, this.kgz * il, 10, dt);",
    "new": "      const directionAlpha = 1 - Math.exp(-10 * dt);\n      this.mdx = lerp(this.mdx, this.kgx * il, directionAlpha); this.mdz = lerp(this.mdz, this.kgz * il, directionAlpha);",
    "label": "share direction damping exponential",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "    this.wGlow = damp(this.wGlow, (s.special ?? 0) >= 0.999 ? 1 : 0, 6, dt);\n    this.wLow = damp(this.wLow, s.lowInk ? 1 : 0, 8, dt);\n    this.inkS = damp(this.inkS, clamp(s.ink ?? 1, 0, 1), 8, dt);",
    "new": "    const alpha6 = 1 - Math.exp(-6 * dt), alpha8 = 1 - Math.exp(-8 * dt);\n    this.wGlow = lerp(this.wGlow, (s.special ?? 0) >= 0.999 ? 1 : 0, alpha6);\n    this.wLow = lerp(this.wLow, s.lowInk ? 1 : 0, alpha8);\n    this.inkS = lerp(this.inkS, clamp(s.ink ?? 1, 0, 1), alpha8);",
    "label": "share low ink damping exponential",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "    this.wGoo = damp(this.wGoo, s.inEnemyInk && this.grounded && kid ? 1 : 0, 6, dt);",
    "new": "    this.wGoo = lerp(this.wGoo, s.inEnemyInk && this.grounded && kid ? 1 : 0, alpha6);",
    "label": "reuse enemy ink damping exponential",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "    this.stepOfsX = damp(this.stepOfsX, 0, 2.2, dt); this.stepOfsZ = damp(this.stepOfsZ, 0, 2.2, dt);",
    "new": "    const stepAlpha = 1 - Math.exp(-2.2 * dt);\n    this.stepOfsX = lerp(this.stepOfsX, 0, stepAlpha); this.stepOfsZ = lerp(this.stepOfsZ, 0, stepAlpha);",
    "label": "share step offset damping exponential",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "const SIDES=['','Back','Left','Right'];",
    "new": "const SIDES=['','Back','Left','Right'];\nconst SOURCE_UPPER_MASKS=new WeakMap();\nfunction upperMaskFor(bank){\n let mask=SOURCE_UPPER_MASKS.get(bank);\n if(!mask){mask=bank.bones.map((b,i)=>{for(let p=i;p>=0;p=bank.bones[p].parent)if(bank.bones[p].name==='spine1')return true;return false;});SOURCE_UPPER_MASKS.set(bank,mask);}\n // Keep controller-owned mutation semantics for tools/debug callers.\n return mask.slice();\n}",
    "label": "cache upper-body traversal by motion bank",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "   this.upperMask=bank.bones.map((b,i)=>{for(let p=i;p>=0;p=bank.bones[p].parent)if(bank.bones[p].name==='spine1')return true;return false;});",
    "new": "   this.upperMask=upperMaskFor(bank);",
    "label": "reuse cached upper-body template with private copy",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "function polarPatch(rings, segs, fn) {",
    "new": "function polarPatch(rings, segs, fn) {\n  const angularBasis = Number.isInteger(segs) && segs > 0 && segs <= 128 ? iwSweepBasis(segs) : null;",
    "label": "reuse exact polar angular basis",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "const u = Math.cos(th) * rr, v = Math.sin(th) * rr; fn(u, v, rr, p);",
    "new": "const u = (angularBasis ? angularBasis[s * 2] : Math.cos(th)) * rr, v = (angularBasis ? angularBasis[s * 2 + 1] : Math.sin(th)) * rr; fn(u, v, rr, p);",
    "label": "polar rings use cached trigonometry",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "function revolve(profile, seg) {\n  const rows = profile.map(([r, y]) => { const row = []; for (let i = 0; i < seg; i++) { const th = (i / seg) * TAU; row.push(new V3(r * Math.sin(th), y, r * Math.cos(th))); } return row; });",
    "new": "function revolve(profile, seg) {\n  // TAU multiplication differs in rounding from sweep's left-associated PI*2.\n  const sine = [], cosine = [];\n  for (let i = 0; i < seg; i++) { const th = (i / seg) * TAU; sine.push(Math.sin(th)); cosine.push(Math.cos(th)); }\n  const rows = profile.map(([r, y]) => { const row = []; for (let i = 0; i < seg; i++) { row.push(new V3(r * sine[i], y, r * cosine[i])); } return row; });",
    "label": "revolve preserves angular evaluation order and shares rows",
    "count": 1
  },
  {
    "rel": "src/game/character-face.js",
    "old": "function bakeAO(acc, N) {",
    "new": "const eyeAOProxies = new WeakMap();\nfunction eyeAOProxyPoints(F) {\n  let cached = eyeAOProxies.get(F);\n  const matrix = F.M.elements, center = F.C;\n  let same = cached && Object.is(cached.x, center.x) && Object.is(cached.y, center.y) && Object.is(cached.z, center.z);\n  if (same) for (let i = 0; i < 9; i++) if (!Object.is(cached.matrix[i], matrix[i])) { same = false; break; }\n  if (same) return cached.points;\n  const points = [], s = new V3();\n  for (let i = 0; i < 260; i++) {\n    const z = 1 - (i + 0.5) / 260 * 1.2, r = Math.sqrt(Math.max(0, 1 - z * z)), ph = i * 2.39996;\n    if (z < -0.2) continue; s.set(r * Math.cos(ph), r * Math.sin(ph), z); points.push(fromEye(F, s, new V3()));\n  }\n  eyeAOProxies.set(F, { x: center.x, y: center.y, z: center.z, matrix: matrix.slice(), points });\n  return points;\n}\nfunction bakeAO(acc, N) {",
    "label": "cache eye occluders with exported frame mutation invalidation",
    "count": 1
  },
  {
    "rel": "src/game/character-face.js",
    "old": "  const s = new V3();\n  for (const F of EYE_FRAMES) for (let i = 0; i < 260; i++) {\n    const z = 1 - (i + 0.5) / 260 * 1.2, r = Math.sqrt(Math.max(0, 1 - z * z)), ph = i * 2.39996;\n    if (z < -0.2) continue; s.set(r * Math.cos(ph), r * Math.sin(ph), z); pts.push(fromEye(F, s, new V3()));\n  }",
    "new": "  for (const F of EYE_FRAMES) for (const point of eyeAOProxyPoints(F)) pts.push(point);",
    "label": "reuse eye occluder coordinates without changing point order or thinning",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "function shortsFold(p, lvF) {",
    "new": "const SHORTS_SIDES = [1, -1];\nconst SHORTS_POCKETS = SHORTS_SIDES.map(sx => {\n  const x0 = sx * 0.064, y0 = 0.754, x1 = sx * 0.116, y1 = 0.668;\n  const bx = x1 - x0, by = y1 - y0, L2 = bx * bx + by * by;\n  return { sx, x0, y0, bx, by, L2 };\n});\nconst SHORTS_WHISKERS = [[0.062, 0.598, 0.0022], [0.088, 0.618, 0.0018], [0.042, 0.588, 0.0014]];\nconst SHORTS_SEAT_FOLDS = [[0.1, 0.63, 0.002], [0.07, 0.61, 0.0016]];\nfunction shortsFold(p, lvF) {",
    "label": "hoist immutable shorts pocket and fold tables",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "    for (const sx of [1, -1]) {\n      const x0 = sx * 0.064, y0 = 0.754, x1 = sx * 0.116, y1 = 0.668;\n      const bx = x1 - x0, by = y1 - y0, L2 = bx * bx + by * by;",
    "new": "    for (const { sx, x0, y0, bx, by, L2 } of SHORTS_POCKETS) {",
    "label": "reuse exact pocket segment coefficients",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "for (const [x1, y1, amp] of [[0.062, 0.598, 0.0022], [0.088, 0.618, 0.0018], [0.042, 0.588, 0.0014]])",
    "new": "for (const [x1, y1, amp] of SHORTS_WHISKERS)",
    "label": "reuse shorts whisker table",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "for (const [x1, y1, amp] of [[0.1, 0.63, 0.002], [0.07, 0.61, 0.0016]])",
    "new": "for (const [x1, y1, amp] of SHORTS_SEAT_FOLDS)",
    "label": "reuse shorts seat fold table",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "    for (const sx of [1, -1]) {\n      const qx = p.x - sx * 0.058, qy = y - 0.668;",
    "new": "    for (const sx of SHORTS_SIDES) {\n      const qx = p.x - sx * 0.058, qy = y - 0.668;",
    "label": "reuse shorts pocket side order",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "function shNormal(x, z, y, out) {\n  const h = 2e-4;\n  const S0 = shSec(y), S1 = shSec(y + h), S2 = shSec(y - h);",
    "new": "function shNormal(x, z, y, out, sections = null) {\n  const h = 2e-4;\n  const S0 = sections ? sections[0] : shSec(y), S1 = sections ? sections[1] : shSec(y + h), S2 = sections ? sections[2] : shSec(y - h);",
    "label": "allow row-owned shorts normal sections",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "    const ring = shRing(y, nTh);\n    rows.push(ring.map(([x, z]) => { shNormal(x, z, y, nrm);",
    "new": "    const ring = shRing(y, nTh), sections = [shSec(y), shSec(y + 2e-4), shSec(y - 2e-4)];\n    rows.push(ring.map(([x, z]) => { shNormal(x, z, y, nrm, sections);",
    "label": "reuse shorts normal sections across one pelvis row",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "function strapPaths() {",
    "new": "const strapLockAnchors = new WeakMap();\nfunction strapPaths() {",
    "label": "own ladder-lock samples by private immutable curve",
    "count": 1
  },
  {
    "rel": "src/game/character-outfit.js",
    "old": "    let best = null;\n    for (let k = 0; k <= 300; k++) { const t = k / 300; const P = curve.getPointAt(t); if (P.z > 0.03 && (!best || Math.abs(P.y - 0.842) < Math.abs(best.P.y - 0.842))) best = { t, P }; }",
    "new": "    let best = strapLockAnchors.get(curve);\n    if (!best) {\n      for (let k = 0; k <= 300; k++) { const t = k / 300; const P = curve.getPointAt(t); if (P.z > 0.03 && (!best || Math.abs(P.y - 0.842) < Math.abs(best.P.y - 0.842))) best = { t, P }; }\n      if (best) strapLockAnchors.set(curve, best);\n    }",
    "label": "reuse exact 301-sample ladder-lock winner across LODs",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "this._footPose(F[0]); this._footPose(F[1]);",
    "new": "this._footPose(F[0], dt); this._footPose(F[1], dt);",
    "label": "native idle foot pose uses caller delta",
    "count": 2
  },
  {
    "rel": "src/game/character.js",
    "old": "  _footPose(f) {",
    "new": "  _footPose(f, dt) {",
    "label": "accept native foot render delta",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "f.pitch = damp(f.pitch, 0, 12, 1 / 60);",
    "new": "f.pitch = damp(f.pitch, 0, 12, dt);",
    "label": "native foot damping advances elapsed time only",
    "count": 1
  },
  {
    "rel": "src/world/paint.js",
    "old": "import { notePaintMutation } from '../../patches/splatoon3/runtime/scoring.mjs';",
    "new": "import { notePaintMutation, noteCoverageCell } from '../../patches/splatoon3/runtime/scoring.mjs';",
    "label": "cell-aware ordered turf membership writer",
    "count": 1
  },
  {
    "rel": "src/world/paint.js",
    "old": "        this.grid[k] = val;",
    "new": "        this.grid[k] = val; noteCoverageCell(this, k, val);",
    "label": "track exact authoritative painted cell",
    "count": 1
  },
  {
    "rel": "src/world/paint.js",
    "old": "notePaintMutation(this, claimed > 0);",
    "new": "notePaintMutation(this, claimed > 0, true);",
    "label": "confirm cell-aware turf mutation",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet.js",
    "old": "this.moth.name = 'lobbySet:moth'; this.moth.frustumCulled = false;",
    "new": "g.computeBoundingSphere(); this.moth.name = 'lobbySet:moth'; this.moth.frustumCulled = true;",
    "label": "moth local undeformed bound follows live object transform",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet.js",
    "old": "this.steam.name = 'lobbySet:steam'; this.steam.frustumCulled = false;",
    "new": "this.steam.name = 'lobbySet:steam'; cards.computeBoundingSphere(); this.steam.frustumCulled = true;",
    "label": "steam local immutable card bound",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "    this.lhBeam.frustumCulled = false;",
    "new": "    bGeo.computeBoundingSphere(); this.lhBeam.frustumCulled = true;",
    "label": "lighthouse bound follows rotating rigid mesh",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "    this.ferris.frustumCulled = false;",
    "new": "    this._ferrisGeo.computeBoundingSphere(); this.ferris.frustumCulled = true;",
    "label": "ferris wheel bound follows rotating rigid mesh",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "    this.city.frustumCulled = false;",
    "new": "    geo.computeBoundingSphere(); geo.boundingSphere.radius += Math.max(1e-4, geo.boundingSphere.radius * 1e-6); this.city.frustumCulled = true;",
    "label": "city full static geometry sphere for each render camera",
    "count": 1
  },
  {
    "rel": "src/world/environment.js",
    "old": "    this.staticScenery.add(containerMesh);",
    "new": "    containerMesh.computeBoundingSphere(); containerMesh.boundingSphere.radius += Math.max(1e-4, containerMesh.boundingSphere.radius * 1e-6); containerMesh.frustumCulled = true;\n    this.staticScenery.add(containerMesh);",
    "label": "port full instance union sphere after final matrices",
    "count": 1
  },
  {
    "rel": "src/world/decor.js",
    "old": "    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'flags:cloth';",
    "new": "    // Full analytic shader envelope: |z wave|<=.205, y drop<=.09,\n    // x retreat<=.0246; margins include float32 vertex/transform rounding.\n    geo.computeBoundingBox(); geo.boundingBox.min.add(new THREE.Vector3(-.026, -.092, -.207));\n    geo.boundingBox.max.add(new THREE.Vector3(.001, .001, .207));\n    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());\n    mesh.computeBoundingSphere();\n    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true; mesh.name = 'flags:cloth';",
    "label": "full-time flag wave envelope for color and shadow frusta",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet.js",
    "old": "    let bi = 0, colorDirty = false;",
    "new": "    let bi = 0, colorDirty = false, matrixDirty = false, bulbDirty = false;\n    const matrixChanged = this._glowMatrixAttribute !== this.glows.instanceMatrix || this._bulbMatrixAttribute !== this.bulbs.instanceMatrix;\n    this._glowMatrixAttribute = this.glows.instanceMatrix; this._bulbMatrixAttribute = this.bulbs.instanceMatrix;",
    "label": "track static glow transform uploads",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet.js",
    "old": "      if (gl.tag) { this._bulbPos(gl.tag.s, gl.tag.k, t, gl.pos); _m.compose(gl.pos, _q, _s.setScalar(1)); this.bulbs.setMatrixAt(bi++, _m); }\n      _m.compose(_p.copy(gl.pos), _q, _s.setScalar(gl.r));\n      this.glows.setMatrixAt(i, _m);",
    "new": "      if (gl.tag) this._bulbPos(gl.tag.s, gl.tag.k, t, gl.pos);\n      const moved = matrixChanged || !Object.is(gl._matrixX, gl.pos.x) || !Object.is(gl._matrixY, gl.pos.y) || !Object.is(gl._matrixZ, gl.pos.z);\n      if (gl.tag) { if (moved) { _m.compose(gl.pos, _q, _s.setScalar(1)); this.bulbs.setMatrixAt(bi, _m); bulbDirty = true; } bi++; }\n      if (moved || !Object.is(gl._matrixRadius, gl.r)) {\n        _m.compose(_p.copy(gl.pos), _q, _s.setScalar(gl.r)); this.glows.setMatrixAt(i, _m); matrixDirty = true;\n        gl._matrixX = gl.pos.x; gl._matrixY = gl.pos.y; gl._matrixZ = gl.pos.z; gl._matrixRadius = gl.r;\n      }",
    "label": "skip unchanged glow and bulb instance matrix writes",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet.js",
    "old": "    this.glows.instanceMatrix.needsUpdate = true; if (colorDirty) this.glows.instanceColor.needsUpdate = true;\n    this.bulbs.instanceMatrix.needsUpdate = true;",
    "new": "    if (matrixDirty) this.glows.instanceMatrix.needsUpdate = true; if (colorDirty) this.glows.instanceColor.needsUpdate = true;\n    if (bulbDirty) this.bulbs.instanceMatrix.needsUpdate = true;",
    "label": "dirty matrices only when values changed",
    "count": 1
  },
  {
    "rel": "src/fx/swimWake.js",
    "old": "  pt.x = x; pt.y = y; pt.z = z; pt.t = t;",
    "new": "  pt.x = x; pt.y = y; pt.z = z; pt.t = t; pt.uploadVersion = (pt.uploadVersion || 0) + 1;",
    "label": "stamp pooled wake point rewrites",
    "count": 1
  },
  {
    "rel": "src/fx/swimWake.js",
    "old": "counts: [-1, -1, -1, -1], active: [true, true, true, true]",
    "new": "counts: [-1, -1, -1, -1], active: [true, true, true, true], refs: [], versions: [], targets: []",
    "label": "uniform upload cache invalidates on rebind",
    "count": 1
  },
  {
    "rel": "src/fx/swimWake.js",
    "old": "          W[base + n++].set(o.x, o.y, o.z, o.t);",
    "new": "          const wi = base + n++, target = W[wi];\n          if (upload.refs[wi] !== o || upload.versions[wi] !== o.uploadVersion || upload.targets[wi] !== target) {\n            target.set(o.x, o.y, o.z, o.t); upload.refs[wi] = o; upload.versions[wi] = o.uploadVersion; upload.targets[wi] = target;\n          }",
    "label": "reuse unchanged history uniform but detect pooled records",
    "count": 1
  },
  {
    "rel": "src/fx/swimWake.js",
    "old": "if (s.swimming) { W[base + n++].set(s.head.x, s.head.y, s.head.z, now);",
    "new": "if (s.swimming) { upload.refs[base + n] = null; W[base + n++].set(s.head.x, s.head.y, s.head.z, now);",
    "label": "moving wake head invalidates history upload identity",
    "count": 1
  },
  {
    "rel": "src/fx/swimWake.js",
    "old": "      for (let i = n; i < (previous < 0 ? PTS : previous); i++) W[base + i].set(0, 0, 0, BREAK);",
    "new": "      for (let i = n; i < (previous < 0 ? PTS : previous); i++) { upload.refs[base + i] = null; W[base + i].set(0, 0, 0, BREAK); }",
    "label": "cleared wake tail cannot retain a history identity",
    "count": 1
  },
  {
    "rel": "src/boss/bossModelFx.js",
    "old": "void main(){ vec2 c = gl_PointCoord - 0.5;",
    "new": "void main(){ if (vA <= 0.0) discard; vec2 c = gl_PointCoord - 0.5;",
    "label": "dead steam zero-alpha discard before noise",
    "count": 1
  },
  {
    "rel": "src/world/inkShading.js",
    "old": "export const INK_SLOPE = /* glsl */`\n  if (gInk > 0.01) {",
    "new": "export const INK_SLOPE = /* glsl */`\n  float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));\n  if (gInk > 0.01 && rFar > 0.0) {",
    "label": "impact ripple zero-distance fade excludes loop",
    "count": 1
  },
  {
    "rel": "src/world/inkShading.js",
    "old": "      float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));\n",
    "new": "",
    "label": "impact ripple derivative remains outside divergent loop",
    "count": 1
  },
  {
    "rel": "src/world/texlib.js",
    "old": "TexlibSample texlibSample(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym) {\n  vec2 gx = dFdx(uv), gy = dFdy(uv);",
    "new": "TexlibSample texlibSampleGrad(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym, vec2 gx, vec2 gy) {",
    "label": "accept derivatives computed before sample gating",
    "count": 1
  },
  {
    "rel": "src/world/texlib.js",
    "old": "mat3 texlibTangentFrame(vec3 eyePos, vec3 surfNormal, vec2 uv) {",
    "new": "TexlibSample texlibSample(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym) {\n  vec2 gx = dFdx(uv), gy = dFdy(uv);\n  return texlibSampleGrad(tA, tN, tO, uv, layer, mode, sym, gx, gy);\n}\nmat3 texlibTangentFrame(vec3 eyePos, vec3 surfNormal, vec2 uv) {",
    "label": "retain original texlib wrapper arithmetic and derivative semantics",
    "count": 1
  },
  {
    "rel": "src/game/lobbySet-mats.js",
    "old": "  TexlibSample ts = texlibSample(tAlbedo, tNormal, tOrm, vUvM * tl.y, tl.x, int(tl.z), int(tl.w));\n  if (tt.x > -0.5) {",
    "new": "  vec2 surfaceUV = vUvM * tl.y, surfaceDx = dFdx(surfaceUV), surfaceDy = dFdy(surfaceUV);\n  if (tt.x > -0.5) {\n    TexlibSample ts = texlibSampleGrad(tAlbedo, tNormal, tOrm, surfaceUV, tl.x, int(tl.z), int(tl.w), surfaceDx, surfaceDy);",
    "label": "plain lobby slot elides unused texture samples with explicit gradients",
    "count": 1
  }
];
const rejectedPerformance = new Set(['ring conservative squared-radius reject','sky omit zero cumulus coverage','sky omit zero cirrus coverage','city omit daytime emissive color hash','court omit zero marking wear noise','container omit zero rust color noise','dead steam zero-alpha discard before noise']);
export function adaptQueueRender20261030Candidate(rel, code, includeRejected = true) {
  if (rel === 'src/world/texlib.js' && code.includes('TexlibSample texlibSampleGrad(')) throw new Error('Render queue anchor: texlib derivative entry already applied');
  for (const c of changes) if (c.rel === rel && (includeRejected || !rejectedPerformance.has(c.label))) {
    const count = code.split(c.old).length - 1;
    if (count !== c.count) throw new Error(`Render queue anchor: ${c.label} (${count}, expected ${c.count})`);
    code = code.split(c.old).join(c.new);
  }
  return code;
}
export const renderQueueTargets = Object.freeze([...new Set(changes.map(c => c.rel))]);

export function adaptQueueRender20261030(rel, code) { return adaptQueueRender20261030Candidate(rel, code, false); }

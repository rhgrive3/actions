// Late visual refinements. Exact anchors protect the previously composed source.
const changes = [
  {
    "rel": "src/fx/fx.js",
    "old": "  float r = length(vUv);\n  float seed = vMisc.y * 37.0;\n  float ang = atan(vUv.y, vUv.x);\n  float n = fxNoise(vec2(cos(ang), sin(ang)) * 2.2 + seed) * 0.6 + fxNoise(vUv * 3.1 + seed + vMisc.z * 1.5) * 0.4;\n  float a = 0.0;\n  vec3 col = vCol.rgb;\n  float kind = vMisc.w;",
    "new": "  float kind = vMisc.w;\n  float r = 0.0, seed = 0.0, n = 0.0;\n  // Only mist, cloud and dust consume this kernel. Keep their expression order.\n  if (!(kind > 1.5 && kind <= 3.5)) {\n    r = length(vUv);\n    seed = vMisc.y * 37.0;\n    float ang = atan(vUv.y, vUv.x);\n    n = fxNoise(vec2(cos(ang), sin(ang)) * 2.2 + seed) * 0.6 + fxNoise(vUv * 3.1 + seed + vMisc.z * 1.5) * 0.4;\n  }\n  float a = 0.0;\n  vec3 col = vCol.rgb;",
    "label": "puff unused noise"
  },
  {
    "rel": "src/fx/fx.js",
    "old": "  float ang = atan(vUv.y, vUv.x);\n  float seed = vMisc.x * 53.0;\n  float wob = fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5;\n  float a = 0.0;\n  vec3 col = vCol.rgb;\n  float st = vMisc.y;",
    "new": "  float st = vMisc.y;\n  float ang = 0.0, seed = 0.0, wob = 0.0;\n  if (st < 6.5) {\n    ang = atan(vUv.y, vUv.x);\n    if (st < 2.5 || st >= 4.5) {\n      seed = vMisc.x * 53.0;\n      wob = fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5;\n    }\n  }\n  float a = 0.0;\n  vec3 col = vCol.rgb;",
    "label": "ring unused wobble"
  },
  {
    "rel": "src/world/inkShading.js",
    "old": "    vec4 l2 = textureLod(uPaint, vPaintUv, 2.0);\n    float seam2 = l2.r / max(l2.a, 1e-3);",
    "new": "    vec4 l2 = vec4(0.0);\n    float seam2 = 0.0;\n    if (near > 0.0 || !(pnt.a > 0.002)) {\n      l2 = textureLod(uPaint, vPaintUv, 2.0);\n      seam2 = l2.r / max(l2.a, 1e-3);\n    }",
    "label": "far unused mip2"
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "      if (uHole > 0.0) {\n        float hn = (fbm(q * 4.5 + vec2(uTime * 0.4, 0.0)) - 0.44) * 0.16;",
    "new": "      float hn = 0.0;\n      if (uHole > 0.0) {\n        hn = (fbm(q * 4.5 + vec2(uTime * 0.4, 0.0)) - 0.44) * 0.16;",
    "label": "iris cache noise"
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "float rd = abs(r + (fbm(q * 4.5 + vec2(uTime * 0.4, 0.0)) - 0.44) * 0.16 - uHole);",
    "new": "float rd = abs(r + hn - uHole);",
    "label": "iris reuse noise"
  },
  {
    "rel": "src/game/character-face.js",
    "old": "  const X = MF.X, U = MF.U, Fw = MF.F, n = R.teeth, ns = Math.max(6, Math.round(n / 2));",
    "new": "  const X = MF.X, U = MF.U, Fw = MF.F, n = R.teeth, ns = Math.max(6, Math.round(n / 2));\n  const toothCos = new Float64Array(ns), toothSin = new Float64Array(ns);\n  for (let k = 0; k < ns; k++) { const ang = (k / ns) * TAU; toothCos[k] = Math.cos(ang); toothSin[k] = Math.sin(ang); }",
    "label": "teeth ring cache"
  },
  {
    "rel": "src/game/character-face.js",
    "old": "        const ang = (k / ns) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);",
    "new": "        const cs = toothCos[k], sn = toothSin[k];",
    "label": "teeth ring reuse"
  },
  {
    "rel": "src/game/character-face.js",
    "old": "  const nT = Math.max(6, n), t0 = acc.idx.length, rows = [];\n  for (let j = 0; j <= nT / 2; j++) {\n    const th = (j / (nT / 2)) * Math.PI, row = [];\n    for (let k = 0; k < nT; k++) {\n      const ph = (k / nT) * TAU;\n      const sx = Math.sin(th) * Math.cos(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.sin(ph);",
    "new": "  const nT = Math.max(6, n), t0 = acc.idx.length, rows = [];\n  const tongueCos = new Float64Array(nT), tongueSin = new Float64Array(nT);\n  for (let k = 0; k < nT; k++) { const ph = (k / nT) * TAU; tongueCos[k] = Math.cos(ph); tongueSin[k] = Math.sin(ph); }\n  for (let j = 0; j <= nT / 2; j++) {\n    const th = (j / (nT / 2)) * Math.PI, row = [], sinTh = Math.sin(th), cosTh = Math.cos(th);\n    for (let k = 0; k < nT; k++) {\n      const sx = sinTh * tongueCos[k], sy = cosTh, sz = sinTh * tongueSin[k];",
    "label": "tongue angular cache"
  }
];
function adaptVisual(rel, code, candidates) {
  for (const c of changes) if (c.rel === rel && (candidates || c.label !== 'puff unused noise')) {
    if (code.split(c.old).length !== 2) throw new Error('Visual continuation anchor: ' + c.label);
    code = code.replace(c.old, c.new);
  }
  if (candidates && rel === 'src/world/environment.js') {
    const marker = '${GLSL_SEA_MARINA}\n#else\nvoid main() {';
    const at = code.indexOf(marker);
    if (at < 0) throw new Error('Visual continuation open-sea variant');
    const prefix = code.slice(0, at); let sea = code.slice(at);
    const mask = '  float dEdge = sdDeck(p);\n  // the sea never shows through inside the arena footprint (e.g. dry-dock trenches below sea level)\n  if (dEdge < -0.05) discard;\n';
    if (sea.split(mask).length !== 2) throw new Error('Visual continuation sea mask');
    sea = sea.replace(mask, '');
    const coords = [
      'p * 0.041 + uTime * vec2(0.012, 0.007)',
      'p * 0.097 + vec2(0.37, 0.61) + uTime * vec2(-0.019, 0.013)',
      'p * 0.0083 + uTime * vec2(0.0034, -0.0022)'
    ];
    let gradients = '';
    for (let i = 0; i < 3; i++) {
      gradients += `  vec2 deckUV${i} = ${coords[i]};\n  vec2 deckDx${i} = dFdx(deckUV${i}), deckDy${i} = dFdy(deckUV${i});\n`;
      const sample = `texture2D(uWaveTex, ${coords[i]})`;
      if (sea.split(sample).length !== 2) throw new Error('Visual continuation sea wave ' + i);
      sea = sea.replace(sample, `textureGrad(uWaveTex, deckUV${i}, deckDx${i}, deckDy${i})`);
    }
    // All four explicit gradients precede the spatial discard. The existing
    // fine-wave guard supplies fineDx/fineDy and remains otherwise unchanged.
    const anchor = '  vec2 fineDx = dFdx(fineUV), fineDy = dFdy(fineUV);\n';
    if (sea.split(anchor).length !== 2) throw new Error('Visual continuation fine wave gradients');
    sea = sea.replace(anchor, anchor + gradients + mask);
    code = prefix + sea;
  }
  return code;
}
// Puff and early sea mask candidates failed the measured adoption gate.
// Keep them testable while leaving production shader paths unchanged.
export const adaptQueueVisualContinuation20261029 = (rel, code) => adaptVisual(rel, code, false);
export const adaptQueueVisualContinuationCandidates20261029 = (rel, code) => adaptVisual(rel, code, true);
export const visualContinuationTargets = Object.freeze([...new Set(changes.map(c => c.rel))]);

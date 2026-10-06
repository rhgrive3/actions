// Issue #264 build seam: make the authoritative CPU paint ownership agree with the native GPU
// footprint (rays, satellite droplets, fine spatter, wall drips) without touching inkwave-public/.
//
// Only five small, anchored seams live here. The geometry, the exactly-once cell accounting, the
// stale-order guard and the safety wraps live in ./paint-footprint.mjs.
//
// The stable shape hash replaces the native `sin(n) * 43758.5`: it keeps seed agreement between the
// GLSL and the CPU mirror without amplifying backend sin precision. The tone channel keeps the
// original sin hash through `toneHash`, so the rendered ink tone for a given seed is unchanged.
const IMPORT_LINE = "import { installPaintFootprint } from '../../patches/local-quality/paint-footprint.mjs';\n";

const STABLE_HASH = `float hsh(float n) {
  // Keep geometry seeds reproducible on CPU and GPU without amplifying backend sin precision differences.
  float x = fract(n * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x + 0.056);
}
float toneHash(float n) { return fract(sin(n) * 43758.5453123); }`;

export function adaptPaintFootprint(rel, code, once) {
  if (rel !== 'src/world/paint.js') return code;
  const patch = (before, after, label) => { code = once(code, before, after, 'paint footprint: ' + label); };

  // 1. Float-stable geometry hash shared with the CPU mirror; the tone hash is preserved as-is.
  patch('float hsh(float n) { return fract(sin(n) * 43758.5453123); }', STABLE_HASH, 'stable shape hash');
  patch('  gl_FragColor = vec4(team, 1.0, hsh(seed * 1.73), a);   // premultiplied by the blend: team share, wet, tone',
    '  gl_FragColor = vec4(team, 1.0, toneHash(seed * 1.73), a);   // premultiplied by the blend: team share, wet, tone',
    'preserved tone hash');

  // 2. One ownership order per non-cosmetic splat; cosmetic specks never claim turf.
  patch('    const cosmetic = !!opts.cosmetic;',
    '    const cosmetic = !!opts.cosmetic;\n    const order = cosmetic ? 0 : this._nextPaintOrder();',
    'paint order');

  // 3. The authoritative body now uses the sub-sampled owned writer.
  patch('        if (!cosmetic) claimed += this._cpuSplat(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind);',
    '        if (!cosmetic) claimed += this._cpuSplatOwned(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind, order);',
    'owned body writer');

  // 4. Carry the order (and an optional owner for late credit) on the growing entry.
  patch('        entries, R: radius, team, seed, kind, age: 0,',
    '        entries, R: radius, team, seed, kind, order, owner: opts.owner || null, age: 0,',
    'growth order and owner');

  // 5. Mirror growth only after its quad was actually submitted (clipped draws mirror nothing).
  patch('        this._pushQuad(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);',
    '        if (this._pushQuad(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1) === 1) {\n' +
    '          this._queueCpuGrowth(g, i, tn, dT, true);\n        }',
    'drip-only growth gate');
  patch('        this._pushQuad(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);',
    '        if (this._pushQuad(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0) === 1) {\n' +
    '          this._queueCpuGrowth(g, i, tn, dT, false);\n        }',
    'body growth gate');

  // 6. Report whether the quad reached the atlas so the caller can mirror it.
  patch('    if (u1 <= u0 || v1 <= v0) return;',
    '    if (u1 <= u0 || v1 <= v0) return 0;',
    'clipped quad result');
  patch('this.aGrow[vi * 4 + 2] = dripOnly; this.aGrow[vi * 4 + 3] = 0;\n    }\n  }',
    'this.aGrow[vi * 4 + 2] = dripOnly; this.aGrow[vi * 4 + 3] = 0;\n    }\n' +
    '    // Mode 2 is reserved for a body-only draw that is already authoritative in the CPU grid.\n' +
    '    return dripOnly === 2 ? 2 : 1;\n  }',
    'submitted quad result');

  // 7. Install the mirroring methods on the class the native module just defined.
  return IMPORT_LINE + code + '\ninstallPaintFootprint(PaintSystem, { blobWobble, maxQuads: MAX_QUADS });\n';
}

// Selective Wave 6/7 GPU optimization adapter.
// Keep source files locked, preserve current main ownership, and reject missing anchors.
// Candidate exclusions: incorrect ScreenFX light vectors, broad texlib regex,
// divergent ink clearcoat gating, unsafe pending-range clipping, redundant InkVolume work.
import { orderedShaderSmoothsteps, orderedVariableSmoothstep } from './ordered-shader-smoothstep.mjs';

function applyIdempotent(code, before, after, replaceOnce, label, acceptSupportGate = false, finalFxRamps = null) {
  if (code.includes(after)) return code;
  // The subsequent reviewed Wave 9 gloss/city support gates indent these two
  // audited blocks. Recognize only their exact algebra, keeping unknown or
  // corrupted expressions fail-closed on a second full composition pass.
  if (acceptSupportGate && code.includes(after.split('\n').map(line => '  ' + line).join('\n').replace('vec3 col = mix(base, env, fres * 0.42);', 'col = mix(base, env, fres * 0.42);'))) return code;
  // The final non-stage FX pass orders descending smoothsteps. Admit only
  // that exact projection of this entire reviewed output block, at one site;
  // a marker, partial rewrite, changed ramp or altered pow algebra cannot
  // bypass the original anchor. Only the three affected FX blocks opt in.
  if (finalFxRamps !== null) {
    let finalAfter = orderedShaderSmoothsteps(after);
    for (const [high, low] of finalFxRamps) finalAfter = orderedVariableSmoothstep(finalAfter, high, low);
    const site = code.indexOf(finalAfter);
    if (site >= 0) {
      if (code.indexOf(finalAfter, site + finalAfter.length) >= 0 || code.includes(before))
        throw new Error(`Reviewed Wave 6/7 optimization requires one final FX owner (${label})`);
      return code;
    }
  }
  if (!code.includes(before)) throw new Error(`Reviewed Wave 6/7 optimization anchor missing (${label})`);
  return replaceOnce(code, before, after, label);
}

export function adaptReviewedWave67Gpu(rel, code, replaceOnce) {
  if (rel === 'src/world/levelMaterial.js') {
    code = applyIdempotent(
      code,
      `      vec3 stone = vec3(0.9, 0.885, 0.845) * (0.95 + 0.07 * vnoise(fu * 9.0) + 0.03 * vnoise(fu * 41.0));
      base = mix(base, stone * texlibMacro(wp + vWPos.y * 0.7), cop);
      rough = mix(rough, 0.72, cop);
      gTexStr *= 1.0 - 0.8 * cop;
      base *= 1.0 - 0.28 * groove;`,
      `      if (cop != 0.0) {
        vec3 stone = vec3(0.9, 0.885, 0.845) * (0.95 + 0.07 * vnoise(fu * 9.0) + 0.03 * vnoise(fu * 41.0));
        base = mix(base, stone * texlibMacro(wp + vWPos.y * 0.7), cop);
        rough = mix(rough, 0.72, cop);
        gTexStr *= 1.0 - 0.8 * cop;
      }
      if (groove > 0.0) base *= 1.0 - 0.28 * groove;`,
      replaceOnce,
      'GPU-02b gate stone coping procedural noise on cop > 0.0'
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    code = applyIdempotent(
      code,
      `      float ring = exp(-pow((bl - uBlastRing) * 18.0, 2.0));`,
      `      float brd = (bl - uBlastRing) * 18.0;
      float ring = exp(-(brd * brd));`,
      replaceOnce,
      'GPU-SFX1b ScreenFX uBlast pow(x, 2.0) elimination'
    );
    code = applyIdempotent(
      code,
      `      col += uSwim.rgb * pow(cst, 3.0) * 1.6 * uSwim.a * v;`,
      `      col += uSwim.rgb * (cst * cst * cst) * 1.6 * uSwim.a * v;`,
      replaceOnce,
      'GPU-SFX1c ScreenFX uSwim caustic pow(cst, 3.0) elimination'
    );
    code = applyIdempotent(
      code,
      `const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };`,
      `const easeOut = (t) => { const u = 1 - clamp(t, 0, 1); return 1 - u * u * u; };
const easeInOut = (t) => { t = clamp(t, 0, 1); if (t < 0.5) return 4 * t * t * t; const u = -2 * t + 2; return 1 - (u * u * u) * 0.5; };`,
      replaceOnce,
      'GPU-SFX2a ScreenFX CPU Math.pow elimination in easeOut and easeInOut'
    );
    code = applyIdempotent(
      code,
      `      const beat = Math.exp(-Math.pow((p - 0.04) / 0.05, 2)) + 0.7 * Math.exp(-Math.pow((p - 0.24) / 0.055, 2));`,
      `      const d1 = (p - 0.04) / 0.05, d2 = (p - 0.24) / 0.055;
      const beat = Math.exp(-(d1 * d1)) + 0.7 * Math.exp(-(d2 * d2));`,
      replaceOnce,
      'GPU-SFX2b ScreenFX _sim heartbeat Math.pow(x, 2) elimination'
    );
  }

  if (rel === 'src/fx/fx.js') {
    code = applyIdempotent(
      code,
      `  float trans = pow(clamp(-dot(q, sxy), 0.0, 1.0), 1.5) * (0.35 + 0.65 * edge);
  base += vCol * (vCol + 0.25) * trans * 0.7 * g;
  // lens rim: the curved edge of the liquid reads darker and richer
  base *= mix(1.0, 0.6, pow(edge, 2.2) * g);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  float rup = dot(R, uUpV);
  vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.4, smoothstep(-0.15, 0.35, rup));
  float fres = (0.04 + 0.96 * pow(edge, 4.0)) * g;
  vec3 col = mix(base, env, fres * 0.42);
  float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
  col += uSunCol * (pow(rl, 150.0) * 7.0 + pow(rl, 16.0) * 0.28) * g;`,
      `  float tr0 = clamp(-dot(q, sxy), 0.0, 1.0);
  float trans = (tr0 * sqrt(tr0)) * (0.35 + 0.65 * edge);
  base += vCol * (vCol + 0.25) * trans * 0.7 * g;
  // lens rim: the curved edge of the liquid reads darker and richer
  base *= mix(1.0, 0.6, pow(edge, 2.2) * g);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  float rup = dot(R, uUpV);
  vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.4, smoothstep(-0.15, 0.35, rup));
  float edge2 = edge * edge;
  float fres = (0.04 + 0.96 * (edge2 * edge2)) * g;
  vec3 col = mix(base, env, fres * 0.42);
  float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
  float rl2 = rl * rl, rl4 = rl2 * rl2, rl8 = rl4 * rl4, rl16 = rl8 * rl8;
  col += uSunCol * (pow(rl, 150.0) * 7.0 + rl16 * 0.28) * g;`,
      replaceOnce,
      'GPU-FX1 DROP_FRAG transcendental pow elimination and specular gate', true
    );
    code = applyIdempotent(
      code,
      `    float fin = 0.22 * exp(-pow((q.y - 0.3) / 0.12, 2.0));`,
      `    float qyFin = (q.y - 0.3) / 0.12;
    float fin = 0.22 * exp(-(qyFin * qyFin));`,
      replaceOnce,
      'GPU-FX2a PUFF_FRAG integer pow(x, 2.0) elimination'
    );
    code = applyIdempotent(
      code,
      `  if (kind < 0.5) {
    float g = pow(max(1.0 - r, 0.0), 2.2);
    float c = pow(max(1.0 - r * 1.8, 0.0), 3.0);
    col = vCol.rgb * g + vec3(1.0, 0.97, 0.92) * c * core;
  } else if (kind < 1.5) {
    // star glint: 4-point cross flare + faint diagonals + tight hot core
    vec2 q = vUv;
    float cr = max(exp(-abs(q.x) * 22.0) * exp(-abs(q.y) * 2.6), exp(-abs(q.y) * 22.0) * exp(-abs(q.x) * 2.6));
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.7071;
    float dg = max(exp(-abs(d.x) * 30.0) * exp(-abs(d.y) * 6.0), exp(-abs(d.y) * 30.0) * exp(-abs(d.x) * 6.0)) * 0.4;
    float halo = pow(max(1.0 - r, 0.0), 3.0) * 0.45;
    float hot = pow(max(1.0 - r * 3.2, 0.0), 2.0);
    col = vCol.rgb * (cr + dg + halo) + vec3(1.0, 0.98, 0.95) * hot * core;
  } else if (kind < 2.5) {
    // bubble: thin bright rim + specular dot
    float rim = smoothstep(0.16, 0.0, abs(r - 0.8)) * 0.8 + smoothstep(0.5, 0.95, r) * step(r, 0.9) * 0.25;
    float hl = smoothstep(0.24, 0.0, length(vUv - vec2(-0.3, 0.34)));
    col = vCol.rgb * rim + vec3(1.0) * hl * (0.6 + core * 0.2);
  } else {
    // halo ring flash
    float ring = exp(-pow((r - 0.78) * 7.0, 2.0));
    col = vCol.rgb * ring + vec3(1.0) * ring * ring * core * 0.3;
  }`,
      `  if (kind < 0.5) {
    float g = pow(max(1.0 - r, 0.0), 2.2);
    float c0 = max(1.0 - r * 1.8, 0.0);
    float c = c0 * c0 * c0;
    col = vCol.rgb * g + vec3(1.0, 0.97, 0.92) * c * core;
  } else if (kind < 1.5) {
    // star glint: 4-point cross flare + faint diagonals + tight hot core
    vec2 q = vUv;
    float cr = max(exp(-abs(q.x) * 22.0) * exp(-abs(q.y) * 2.6), exp(-abs(q.y) * 22.0) * exp(-abs(q.x) * 2.6));
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.7071;
    float dg = max(exp(-abs(d.x) * 30.0) * exp(-abs(d.y) * 6.0), exp(-abs(d.y) * 30.0) * exp(-abs(d.x) * 6.0)) * 0.4;
    float h0 = max(1.0 - r, 0.0);
    float halo = (h0 * h0 * h0) * 0.45;
    float ht0 = max(1.0 - r * 3.2, 0.0);
    float hot = ht0 * ht0;
    col = vCol.rgb * (cr + dg + halo) + vec3(1.0, 0.98, 0.95) * hot * core;
  } else if (kind < 2.5) {
    // bubble: thin bright rim + specular dot
    float rim = smoothstep(0.16, 0.0, abs(r - 0.8)) * 0.8 + smoothstep(0.5, 0.95, r) * step(r, 0.9) * 0.25;
    float hl = smoothstep(0.24, 0.0, length(vUv - vec2(-0.3, 0.34)));
    col = vCol.rgb * rim + vec3(1.0) * hl * (0.6 + core * 0.2);
  } else {
    // halo ring flash
    float rg0 = (r - 0.78) * 7.0;
    float ring = exp(-(rg0 * rg0));
    col = vCol.rgb * ring + vec3(1.0) * ring * ring * core * 0.3;
  }`,
      replaceOnce,
      'GPU-FX2b GLOW_FRAG integer pow(x, 2.0 / 3.0) elimination', false, []
    );
    code = applyIdempotent(
      code,
      `    float fill = pow(1.0 - vT, 4.0) * 0.45 * smoothstep(outer, outer * 0.3, r);
    a = max(max(band, beads * (1.0 - vT)), fill);
    col *= 0.9 + 0.35 * smoothstep(outer - w, outer, r);
    a *= pow(1.0 - vT, 1.3);
  } else if (st < 1.5) {
    // water / swim ripple: thin soft outline
    float outer = 0.9 + wob * 0.06;
    a = smoothstep(outer + 0.06, outer, r) * smoothstep(outer - 0.16, outer - 0.03, r) * (1.0 - vT) * (1.0 - vT);
    col = mix(col, vec3(1.0), 0.35);
  } else if (st < 2.5) {
    // splash disc: quick filled blot
    a = smoothstep(0.95 + wob * 0.2, 0.7 + wob * 0.2, r) * pow(1.0 - vT, 2.0);`,
      `    float ivT = 1.0 - vT, ivT2 = ivT * ivT, ivT4 = ivT2 * ivT2;
    float fill = ivT4 * 0.45 * smoothstep(outer, outer * 0.3, r);
    a = max(max(band, beads * ivT), fill);
    col *= 0.9 + 0.35 * smoothstep(outer - w, outer, r);
    a *= pow(ivT, 1.3);
  } else if (st < 1.5) {
    // water / swim ripple: thin soft outline
    float outer = 0.9 + wob * 0.06;
    float ivT = 1.0 - vT;
    a = smoothstep(outer + 0.06, outer, r) * smoothstep(outer - 0.16, outer - 0.03, r) * (ivT * ivT);
    col = mix(col, vec3(1.0), 0.35);
  } else if (st < 2.5) {
    // splash disc: quick filled blot
    float ivT = 1.0 - vT;
    a = smoothstep(0.95 + wob * 0.2, 0.7 + wob * 0.2, r) * (ivT * ivT);`,
      replaceOnce,
      'GPU-FX3a RING_FRAG integer pow(1.0 - vT, 4.0 / 2.0) elimination', false,
      [['outer', 'outer * 0.3'], ['outer + 0.06', 'outer'], ['0.95 + wob * 0.2', '0.7 + wob * 0.2']]
    );
    code = applyIdempotent(
      code,
      `  vec3 R = reflect(-V, Nf);
  float fres = pow(1.0 - abs(facing), 3.0) * (1.0 - inner);
  col = mix(col, uSkyCol * 1.25, fres * 0.32);
  col += uSunCol * (pow(clamp(dot(R, uSunDir), 0.0, 1.0), 70.0) * 3.2 + rim * 0.12) * (1.0 - inner);`,
      `  if (inner < 1.0) {
    vec3 R = reflect(-V, Nf);
    float fr0 = 1.0 - abs(facing);
    float fres = (fr0 * fr0 * fr0) * (1.0 - inner);
    col = mix(col, uSkyCol * 1.25, fres * 0.32);
    float rSun = clamp(dot(R, uSunDir), 0.0, 1.0);
    col += uSunCol * ((rSun > 0.0 ? pow(rSun, 70.0) * 3.2 : 0.0) + rim * 0.12) * (1.0 - inner);
  }`,
      replaceOnce,
      'GPU-FX4 SHELL_FRAG outer-shell gate and Fresnel/specular optimization'
    );
    code = applyIdempotent(
      code,
      `  float rim = pow(max(1.0 - facing, 0.0), 1.5);
  float a; vec3 col;
  if (vMisc.w > 0.5) {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 7.0 - uTime * 2.6));
    a = (0.12 + 0.55 * rim) * (0.45 + 0.75 * streak) * smoothstep(1.0, 0.25, vH) * smoothstep(0.0, 0.04, vH);
    col = vCol.rgb * (1.1 + 0.8 * streak) + vec3(1.2) * pow(streak, 4.0) * (1.0 - vH);
  } else {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 5.0 - vMisc.x * 9.0));
    a = (0.3 + 0.7 * rim) * (0.45 + 0.8 * streak);
    a *= smoothstep(1.0, 0.4, vH) * smoothstep(0.0, 0.05, vH);
    col = vCol.rgb * (1.0 + 0.9 * streak) + vec3(3.2) * pow(streak, 5.0) * (1.0 - vH) * (1.0 - vMisc.x);
  }`,
      `  float rm0 = max(1.0 - facing, 0.0);
  float rim = rm0 * sqrt(rm0);
  float a; vec3 col;
  if (vMisc.w > 0.5) {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 7.0 - uTime * 2.6));
    float st2 = streak * streak, st4 = st2 * st2;
    a = (0.12 + 0.55 * rim) * (0.45 + 0.75 * streak) * smoothstep(1.0, 0.25, vH) * smoothstep(0.0, 0.04, vH);
    col = vCol.rgb * (1.1 + 0.8 * streak) + vec3(1.2) * st4 * (1.0 - vH);
  } else {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 5.0 - vMisc.x * 9.0));
    float st2 = streak * streak, st5 = st2 * st2 * streak;
    a = (0.3 + 0.7 * rim) * (0.45 + 0.8 * streak);
    a *= smoothstep(1.0, 0.4, vH) * smoothstep(0.0, 0.05, vH);
    col = vCol.rgb * (1.0 + 0.9 * streak) + vec3(3.2) * st5 * (1.0 - vH) * (1.0 - vMisc.x);
  }`,
      replaceOnce,
      'GPU-FX5a BEAM_FRAG pow(1.5 / 4.0 / 5.0) elimination', false, []
    );
    code = applyIdempotent(
      code,
      `  float fwd = pow(max(dot(V, uSunDir), 0.0), 4.0);`,
      `  float fw0 = max(dot(V, uSunDir), 0.0), fw2 = fw0 * fw0;
  float fwd = fw2 * fw2;`,
      replaceOnce,
      'GPU-FX5b MOTE_VERT pow(x, 4.0) elimination'
    );
    code = applyIdempotent(
      code,
      `void main() {
  float r = length(vUv);
  float g = pow(max(1.0 - r, 0.0), 2.4);
  if (g * vA < 0.002) discard;`,
      `void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0 || vA < 0.002) discard;
  float r = sqrt(r2);
  float g = pow(max(1.0 - r, 0.0), 2.4);
  if (g * vA < 0.002) discard;`,
      replaceOnce,
      'GPU-FX5c MOTE_FRAG sqrt-before-discard elimination'
    );
  }

  if (rel === 'src/world/environment.js') {
    code = applyIdempotent(
      code,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = min((0.025 + 0.975 * pow(1.0 - NdV, 5.0)) * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres);
  col = mix(col, uShadeCol * (uSeaAmbient + 0.02), under * 0.85);

  // sun glints (blocked by shadows and by anything reflected in front of the sky)
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under) * (1.0 - occl);`,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fnv = 1.0 - NdV, fnv2 = fnv * fnv;
  float fres = min((0.025 + 0.975 * (fnv2 * fnv2 * fnv)) * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres);
  col = mix(col, uShadeCol * (uSeaAmbient + 0.02), under * 0.85);

  // sun glints (blocked by shadows and by anything reflected in front of the sky)
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  if (rs > 0.0 && shadow > 0.0 && under < 1.0 && occl < 1.0) {
    float rs2 = rs * rs, rs4 = rs2 * rs2, rs8 = rs4 * rs4, rs16 = rs8 * rs8;
    float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + (rs16 * rs8) * 0.04;
    col += uSunLight * spec * uSunSpec * shadow * (1.0 - under) * (1.0 - occl);
  }`,
      replaceOnce,
      'GPU-ENV2a GLSL_SEA_MARINA Fresnel pow(5.0) and sun-glint specular gate'
    );
    code = applyIdempotent(
      code,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.035 + 0.965 * pow(1.0 - NdV, 5.0);
  fres = min(fres * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres * mix(1.0, 0.45, under));
  col *= mix(1.0, 0.2, under);

  // sun glint: broad sheen + tight sparkles from the fine normals
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under);`,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fnv = 1.0 - NdV, fnv2 = fnv * fnv;
  float fres = 0.035 + 0.965 * (fnv2 * fnv2 * fnv);
  fres = min(fres * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres * mix(1.0, 0.45, under));
  col *= mix(1.0, 0.2, under);

  // sun glint: broad sheen + tight sparkles from the fine normals
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  if (rs > 0.0 && shadow > 0.0 && under < 1.0) {
    float rs2 = rs * rs, rs4 = rs2 * rs2, rs8 = rs4 * rs4, rs16 = rs8 * rs8;
    float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + (rs16 * rs8) * 0.04;
    col += uSunLight * spec * uSunSpec * shadow * (1.0 - under);
  }`,
      replaceOnce,
      'GPU-ENV2b SEA_FRAG Fresnel pow(5.0) and sun-glint specular gate'
    );
    code = applyIdempotent(
      code,
      `  float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(-V, wn2), 0.0, 1.0), 5.0);`,
      `  float fnv = 1.0 - clamp(dot(-V, wn2), 0.0, 1.0), fnv2 = fnv * fnv;
  float fres = 0.05 + 0.95 * (fnv2 * fnv2 * fnv);`,
      replaceOnce,
      'GPU-ENV2c HZ_FRAG_HAZE Fresnel pow(5.0) elimination', true
    );
  }

  if (rel === 'src/world/paint.js') {
    code = applyIdempotent(
      code,
      `float wob(float a, float s) {
  return 1.0 + 0.12 * sin(3.0 * a + s * 6.2831) + 0.08 * sin(5.0 * a + s * 17.0) + 0.05 * sin(7.0 * a + s * 41.0)
    + 0.03 * sin(11.0 * a + s * 73.0) + 0.018 * sin(17.0 * a + s * 29.0)
    + 0.17 * pow(max(cos(a - s * 37.7), 0.0), 28.0) + 0.12 * pow(max(cos(a - s * 53.3 - 2.1), 0.0), 36.0);
}`,
      `float wob(float a, float s) {
  float c0 = max(cos(a - s * 37.7), 0.0);
  float c2 = c0 * c0, c4 = c2 * c2, c8 = c4 * c4, c16 = c8 * c8;
  float d0 = max(cos(a - s * 53.3 - 2.1), 0.0);
  float d2 = d0 * d0, d4 = d2 * d2, d8 = d4 * d4, d16 = d8 * d8, d32 = d16 * d16;
  return 1.0 + 0.12 * sin(3.0 * a + s * 6.2831) + 0.08 * sin(5.0 * a + s * 17.0) + 0.05 * sin(7.0 * a + s * 41.0)
    + 0.03 * sin(11.0 * a + s * 73.0) + 0.018 * sin(17.0 * a + s * 29.0)
    + 0.17 * (c16 * c8 * c4) + 0.12 * (d32 * d4);
}`,
      replaceOnce,
      'GPU-PNT1a PAINT_FS wob integer pow(28/36) elimination'
    );
    code = applyIdempotent(
      code,
      `    float tb = 1.0 - pow(1.0 - clamp(tn, 0.0, 1.0), 4.0);`,
      `    float tnc = 1.0 - clamp(tn, 0.0, 1.0), tnc2 = tnc * tnc;
    float tb = 1.0 - tnc2 * tnc2;`,
      replaceOnce,
      'GPU-PNT1b PAINT_FS body tb pow(4.0) elimination'
    );
    code = applyIdempotent(
      code,
      `    float tsp = 1.0 - pow(1.0 - clamp(tn * 1.4, 0.0, 1.0), 3.0);`,
      `    float tns = 1.0 - clamp(tn * 1.4, 0.0, 1.0);
    float tsp = 1.0 - tns * tns * tns;`,
      replaceOnce,
      'GPU-PNT1c PAINT_FS ray tsp pow(3.0) elimination'
    );
  }

  return code;
}

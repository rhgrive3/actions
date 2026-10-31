import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptReviewedWave67Gpu } from '../reviewed-wave67-gpu-adapter.mjs';
import {
  adaptCombatGpuCpuPerfectTargets,
  adaptCombatWave345,
} from '../combat-gpu-cpu-perfect-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function replaceOnce(code, before, after, label) {
  const idx = code.indexOf(before);
  if (idx < 0) throw new Error(`Missing anchor (${label})`);
  if (code.indexOf(before, idx + before.length) >= 0) {
    throw new Error(`Duplicate anchor (${label})`);
  }
  return code.slice(0, idx) + after + code.slice(idx + before.length);
}

const WAVE9_10_11_GPU_TARGETS = [
  ['src/world/levelMaterial.js', 8, [
    'if (cop > 0.0) {',
    'if (grime > 0.0) {',
    'if (bed > 0.0) {',
    'if (rawPaintM > 0.0 || bay > 0.0) {',
    'nBase = tStr != 0.0 ? texlibPerturbNormal(gTexN, T, Bt, vWNorm, tStr) : normalize(vWNorm * gTexN.z);',
    'float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));',
    'if (d2 > maxD * maxD) continue;',
  ]],
  ['src/world/inkShading.js', 9, [
    'bool wallF = abs(vWNorm.y) < 0.5; // face frame is evaluated only by the active halo',
    'if (halo > 0.0) {',
    'if (gInk > 0.0) {',
    'uRipCount: { value: INK_RIPPLES },',
    'uniform int uRipCount;',
    'if (i >= uRipCount) break;',
    'if (U.uRipCount) U.uRipCount.value = ripCount;',
    'if (dHdxy.x == 0.0 && dHdxy.y == 0.0) return surf_norm;',
    'fr2 > 0.0 ? fr2 * 0.022 * vec2(sin(uTime * 2.3), cos(uTime * 1.9)) : vec2(0.0)',
    'if (gInk > 0.0 || gWake > 0.0) {',
  ]],
  ['src/core/renderer.js', 1, [
    'if (uExposure != 1.0) c.rgb *= uExposure;',
    'if (uContrast != 1.0) {',
    'if (uVignette > 0.0 || uHurt > 0.0) {',
    'if (uFlash != 0.0) c.rgb += uFlash;',
  ]],
  ['src/fx/screenfx.js', 7, [
    'if (ed > width * (1.0 + wob * 1.6) + 0.02) return width - ed;',
    'if (y < -0.02 || y > len * 1.1 + 0.04) return -1.0;',
    'float satK = uSat * (1.0 - uDesat);',
    'float spec = nh32 * nh32;',
    'float spec2 = ns2 * ns16;',
    'if (uSwim.a > 0.001 && r > 0.35) {',
    'float spec = sp16 * sp64;',
    'float spec = sp2 * sp4 * sp64;',
  ]],
  ['src/world/environment.js', 12, [
    'if (rs > 0.0 && shadow > 0.0 && under < 1.0 && occl < 1.0) {',
    'if (detail > 0.0 && (dEdge < 3.4 || dObj < 2.2)) {',
    'if (wl2 >= 0.0 && wl2 < 1.1) {',
    'float fnv1 = 1.0 - NdV, fnv2 = fnv1 * fnv1;',
    'if (wood > 0.0) {',
    'if (hzWin > 0.0) {',
    'c += uGlowColor * (pow(sd, uGlowParams.x) * uGlowParams.y + (sd2 * sd2 * sd2) * uGlowParams.w);',
    'col += uGlowColor * (sd32 * sd32) * 1.2;',
    'return sqrt(d2) - sqrt(d1);',
    'if (facing > 0.002 && fall > 0.0 && uStripK.x != 0.0) {',
    'if (uNight == 0.0) discard;',
  ]],
  ['src/world/decor.js', 2, [
    'if (r < 0.62) {',
    'if (pool > 0.0) {',
    'if (uAlpha == 0.0 && uPulse == 0.0 && vUv.y >= 0.035) discard;',
    'float rim = rm0 * rm0;',
  ]],
  ['src/world/paint.js', 3, [
    'c1_4 * c1_8 * c1_16',
    'c2_4 * c2_16 * c2_16',
    'float tb = 1.0 - it2 * it2;',
    'float tsp = 1.0 - isp * isp * isp;',
  ]],
  ['src/game/character-mats.js', 18, [
    'if (dhx == 0.0 && dhy == 0.0) return n;',
    'float mottLod = iwLod(vBindPos.y * 60.0, 1.0);',
    'float fk = iwFill(fd) * step(0.45, rnd) * region;',
    'if (iwThin > 0.0) {',
    'float back = bk0 * bk0 * bk0;',
    'if (irisM > 0.0 && fl > 0.0) {',
    'float tgX = vIwUv.x / 0.12;',
    'if (r > 0.006) {',
    'if (crLod > 0.0) iwH += iwTeeCrease(p, th) * crLod;',
    'float groove = (gb2 * gb2 * gb2) * crown;',
    'float dl = length(dv) - L.z * (1.0 + 0.9 * (lc2 * lc2 * lc0));',
    'if (vIwPos.z < 0.0 && abs(vIwPos.y) <= 0.0745) {',
    'float fres = fr0 * fr0 * fr0;',
    'if (satLod > 0.0) iwH += 0.00004 * (iwNoise(vWPos * 1400.0) - 0.5) * satLod;',
  ]],
  ['src/boss/bossMats.js', 7, [
    'if (dhx == 0.0 && dhy == 0.0) return n;',
    'if (uCrack != 0.0) {',
    'dot(bRimC, bRimC) > 0.0 ? bRimC * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), bRimP) : vec3(0.0)',
    'float pool = uDrip != 0.0 ? smoothstep(0.16, 0.05, fromTop)',
    'float r = sqrt(sqrt(dx2 * dx2 + dy2 * dy2));',
    'if (uDrip != 0.0 && ex < 9.5 && cls <= 0.5) {',
    'if (uCrack > 0.001 && cls < 0.5) {',
    'float qa = iris > 0.0 ? atan(q.y, q.x) : 0.0;',
  ]],
  ['src/fx/fx.js', 7, [
    'vec3 col = base * 0.85;',
    'if (g > 0.0) {',
    'if (vCol.a < 0.004 || r >= 1.18) discard;',
    'if (kind <= 1.5 || kind > 3.5) {',
    'float c = c0 * c0 * c0;',
    'float wob = (st < 2.5 || (st >= 4.5 && st < 6.5))',
    'if (inner < 0.5) {',
  ]],
  ['src/game/lobbySet-mats.js', 7, [
    'vec3 m = inside > 0.0 ? textureGrad(tMask, iwMaskCenterUv, iwMaskCenterDx, iwMaskCenterDy).rgb : vec3(0.0);',
    'if (water > 0.0) {',
    'if (e > 0.02 && e < 0.9) {',
    'if (d.a > 0.0) {',
    'if (uReflOn > 0.5 && kRefl > 0.0) {',
    'vec3 col = c * I * (0.45 + 0.55 * f) + vec3(1.0) * I * 0.4 * (f2 * f2) + c * 0.06;',
    'if (edge == 0.0) discard;',
  ]],
  ['src/world/texlib.js', 19, [
    'return vec4(F1, F2, id, id2);',
    'if (strength == 0.0 || (nTS.x == 0.0 && nTS.y == 0.0)) return normalize(N * nTS.z);',
    'float lyN = (ly - PW * 0.5) / (PW * 0.5);',
    'float dome = sqrt(max(1.0 - rdN * rdN, 0.0));',
    'float bulge = (1.0 - lpxN * lpxN) * (1.0 - lpyN * lpyN);',
    'float toe = max(exp(-(twW * twW)), exp(-(twB * twB)));',
    'float sr = 0.0018 + 0.004 * (scf * scf * scf) + 0.006 * step(0.985, fract(sc.z * 29.3));',
    'float rib = (rbG * rbG * rbG) * smoothstep(0.004, 0.009, eS);',
  ]],
  ['src/game/weapons.js', 3, [
    'float tau = back > 0.5 ? (1.0 - 0.42 * pow(u, 1.3)) : 1.0;',
    'float iwRim = iwR0 * iwR0 * iwR0;',
    'if (drawn == 0.0) discard;',
  ]],
  ['src/game/character-weapons.js', 1, [
    'float ce0 = (uCharge - vSeg + 0.05) * 11.0;',
    'float edge = exp(-(ce0 * ce0)) * (1.0 - uFull);',
  ]],
  ['src/game/character.js', 1, [
    'if (dot(uIwRim.rgb, uIwRim.rgb) > 0.0) {',
    'float iwFl = clamp(dot(normal, normalize(vec3(0.25, 0.45, 1.0))) * 0.6 + 0.4, 0.0, 1.0);',
  ]],
  ['src/game/lobbySet.js', 1, [
    'float dnv = dot(normalize(vN), normalize(vV)); float e = dnv * dnv;',
  ]],
  ['src/game/showcase.js', 1, [
    'float rx = max(0.0, 1.0 - abs(p.x)), ry = max(0.0, 1.0 - abs(p.y));',
    'float rays = exp(-abs(p.y) * 30.0) * (rx * rx) + exp(-abs(p.x) * 30.0) * (ry * ry);',
  ]],
  ['src/boss/bossHazards.js', 1, [
    'if (uAlpha == 0.0 || vUv.y >= 1.0) discard;',
  ]],
];

test('reviewed Wave 9–11 raw and production epochs resolve every GPU site and remain idempotent', () => {
  assert.equal(adaptCombatGpuCpuPerfectTargets.length, 24);

  let totalAdapterSites = 0;
  let rawResolvedSites = 0, productionResolvedSites = 0;
  for (const [rel, minSites, expectedSnippets] of WAVE9_10_11_GPU_TARGETS) {
    const raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
    let sites = 0;
    const pass1 = adaptCombatWave345(rel, raw, (c, b, a, l) => {
      sites++;
      return replaceOnce(c, b, a, l);
    }, { onGpuSite: site => { rawResolvedSites++; assert.ok(site.status, site.id); } });
    assert.ok(sites >= minSites, `Expected at least ${minSites} sites in ${rel}, got ${sites}`);
    totalAdapterSites += sites;

    for (const snip of expectedSnippets) {
      assert.ok(pass1.includes(snip), `Missing expected snippet in ${rel}: ${snip}`);
    }
    const production = adaptBuildSource(rel, raw);
    // Current main's audited algebra has equivalent expressions with different
    // names. Require those exact expressions instead of rewriting their owner.
    const reviewed67 = new Map([
      ['if (cop > 0.0) {', 'if (cop != 0.0) {'],
      ['float fnv1 = 1.0 - NdV, fnv2 = fnv1 * fnv1;', 'float fnv = 1.0 - NdV, fnv2 = fnv * fnv;'],
      ['c1_4 * c1_8 * c1_16', 'c16 * c8 * c4'],
      ['c2_4 * c2_16 * c2_16', 'd32 * d4'],
      ['float tb = 1.0 - it2 * it2;', 'float tb = 1.0 - tnc2 * tnc2;'],
      ['float tsp = 1.0 - isp * isp * isp;', 'float tsp = 1.0 - tns * tns * tns;'],
      ['if (inner < 0.5) {', 'if (inner < 1.0) {'],
    ]);
    for (const snip of expectedSnippets) {
      if (rel === 'src/world/inkShading.js' && /uRipCount/.test(snip)) continue; // the revision-owned packed table is already bounded
      if (rel === 'src/fx/fx.js' && snip.startsWith('float wob =')) {
        assert.ok(production.includes('if (st < 2.5 || st >= 4.5) {'), 'retain the existing ring noise gate');
        assert.ok(production.includes('float ivT = 1.0 - vT, ivT2 = ivT * ivT, ivT4 = ivT2 * ivT2;'));
        continue;
      }
      assert.ok(production.includes(reviewed67.get(snip) || snip), `Missing composed production optimization in ${rel}: ${snip}`);
    }
    if (rel === 'src/world/inkShading.js') {
      assert.ok(production.includes('if (i >= uRipActiveCount) break;'));
      assert.ok(production.includes('updateRippleUniforms(U, P, INK_RIPPLES);'));
      assert.ok(production.includes('float d2 = dot(D, D);'));
      assert.ok(!production.includes('uRipCount'), 'do not publish a redundant count alongside the packed owner');
    }
    // The build API has no audit callback. Resolve every site against its
    // actual final output, after all later owners, without reapplying a change.
    assert.equal(adaptCombatWave345(rel, production, replaceOnce, {
      onGpuSite: site => {
        productionResolvedSites++;
        assert.ok(site.status, site.id);
        assert.notEqual(site.status, 'applied', `${rel}: ${site.id} must not reapply`);
      },
    }), production, `${rel}: the final composed epoch must also be idempotent`);
    if (rel === 'src/fx/fx.js') {
      assert.ok(!pass1.includes('gl_Position = vec4(2.0, 2.0, 2.0, 1.0)'), 'per-vertex alpha cannot prove the whole triangle invisible');
      assert.ok(!production.includes('if (vA < 0.002) { vUv'), 'retain the audited fragment-only particle rejection');
    }
    if (rel === 'src/world/levelMaterial.js') {
      assert.ok(!pass1.includes('float ew = fwidth(e);'), 'Dead chamfer fwidth(e) must be removed');
    }

    // Second pass must be 100% idempotent (zero additional replacements)
    let pass2Sites = 0;
    const pass2 = adaptCombatWave345(rel, pass1, (c, b, a, l) => {
      pass2Sites++;
      return replaceOnce(c, b, a, l);
    });
    assert.equal(pass2Sites, 0, `Expected 0 replacements on second pass for ${rel}`);
    assert.equal(pass2, pass1, `Expected idempotent output on second pass for ${rel}`);
  }
  // 111 raw semantic sites, including the preserved ID-bearing Worley rank;
  // production proves three legacy ripple-count sites equivalent to its packed owner.
  assert.equal(rawResolvedSites, 111);
  assert.equal(productionResolvedSites, 111);
  assert.ok(totalAdapterSites >= 108, `Expected >= 108 safe adapter replacements across 18 GPU target modules, got ${totalAdapterSites}`);

  // Verify ink-volume/runtime.mjs and special-vfx-kit.mjs
  const inkVol = fs.readFileSync(path.join(repoRoot, 'patches/local-quality/ink-volume/runtime.mjs'), 'utf8');
  assert.ok(inkVol.includes('float nh=max(dot(n,h),0.0), nh2=nh*nh, nh4=nh2*nh2, nh8=nh4*nh4, nh16=nh8*nh8;'));

  const s3Vfx = fs.readFileSync(path.join(repoRoot, 'patches/splatoon3/runtime/special-vfx-kit.mjs'), 'utf8');
  assert.ok(s3Vfx.includes('if (g <= 0.0) return base * 0.85;'));
  assert.ok(s3Vfx.includes('if (a < 0.005) discard;\n    float u = clamp'));
  assert.ok(s3Vfx.includes('float f = f4 * f4 * f2;'));
  assert.ok(s3Vfx.includes('float sw = sw2 * sw2 * sw2;'));
  assert.ok(s3Vfx.includes('float rays = (ry2 * ry2 * ry2) * (1.0 - r);'));
});

test('composed shader derivatives precede spatial masks and retain the current ink tuning', () => {
  const built = rel => adaptBuildSource(rel, fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8'));
  const ink = built('src/world/inkShading.js');
  const color = ink.slice(ink.indexOf('export const INK_COLOR'), ink.indexOf('export const INK_ROUGH'));
  assert.equal((color.match(/vec3 Tf =/g) || []).length, 1, 'the tangent/sun frame must have one lazy definition');
  assert.ok(!color.slice(0, color.indexOf('if (halo > 0.0)')).includes('vec3 Tf ='), 'the old eager frame must actually be removed');
  const coat = ink.slice(ink.indexOf('export const INK_LIGHTS'), ink.indexOf('export const INK_LIGHT_MAPS'));
  for (const term of ['0.034, 0.026', '0.97 * gInk', '0.02, gInk', '0.45, gInk']) assert.ok(coat.includes(term), term);
  assert.ok(coat.indexOf('dFdx(normal)') < coat.indexOf('if (gInk > 0.0)'));
  const maps = ink.slice(ink.indexOf('export const INK_LIGHT_MAPS'), ink.indexOf('export const INK_SHADE'));
  assert.ok(maps.indexOf('fwidth(rel)') < maps.indexOf('if (gInk > 0.0 || gWake > 0.0)'));
  assert.ok(maps.includes('5.0 * key + 0.3 * gFresh'), 'preserve the filtered reflected highlight');
  const character = built('src/game/character-mats.js');
  const gauge = character.slice(character.indexOf('float iwTick = 0.0;'));
  assert.ok(gauge.indexOf('fwidth(yd)') < gauge.indexOf('if (vIwPos.z < 0.0'));
  assert.ok(gauge.indexOf('fwidth(s)') < gauge.indexOf('if (vIwPos.z < 0.0'));
  assert.ok(character.indexOf('float fl = iwLod(r * 24.0, 1.0);') < character.indexOf('if (irisM > 0.0 && fl > 0.0)'));
  assert.ok(character.includes('mix(0.9, 1.08, fib)'), 'preserve the current iris colour');
  assert.ok(character.includes('if (p.z > 0.0) { base = iwFrontBase; iwH = iwFrontH; iwAO = iwFrontAO; }'), 'preserve front/back shorts ownership');
});

test('composed support gates retain strict checks on the reviewed Wave 6/7 algebra', () => {
  for (const [rel, expression] of [
    ['src/fx/fx.js', 'tr0 * sqrt(tr0)'],
    ['src/world/environment.js', '0.05 + 0.95 * (fnv2 * fnv2 * fnv)'],
  ]) {
    const production = adaptBuildSource(rel, fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8'));
    assert.equal(adaptReviewedWave67Gpu(rel, production, replaceOnce), production);
    assert.ok(production.includes(expression));
    assert.throws(() => adaptReviewedWave67Gpu(rel, production.replace(expression, 'corruptedMath'), replaceOnce), /anchor missing/);
  }
});

test('lobby mask sampling has explicit gradients before spatial gates in raw and composed epochs', () => {
  const rel = 'src/game/lobbySet-mats.js', raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
  for (const source of [adaptCombatWave345(rel, raw, replaceOnce), adaptBuildSource(rel, raw)]) {
    assert.ok(source.indexOf('dFdx(iwMaskCenterUv)') < source.indexOf('vec3 m = inside > 0.0 ? textureGrad'));
    const start = source.indexOf('vec2 iwMaskNeighborDx = dFdx(muv)');
    const gate = source.indexOf('if (inside > 0.0) {', start);
    assert.ok(start >= 0 && gate > start);
    const body = source.slice(gate, source.indexOf('gTilt =', gate));
    assert.equal((body.match(/textureGrad\(tMask,/g) || []).length, 4);
    assert.ok(!body.includes('texture2D('));
    assert.ok(!body.includes('dFdx(') && !body.includes('dFdy('));
  }
});

test('an unknown wake epoch fails closed with its module and optimization ID', () => {
  const raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public/src/world/levelMaterial.js'), 'utf8');
  const unusual = raw.replace('float r = 0.1 + age * 0.95', 'float r = 0.101 + age * 0.95');
  assert.notEqual(unusual, raw);
  assert.throws(() => adaptCombatWave345('src/world/levelMaterial.js', unusual, replaceOnce), /src\/world\/levelMaterial\.js: GPU-LVL-07a/);
});

const REVIEW_DRIFT_CASES = [
  ['src/world/levelMaterial.js', 'vec3 stone = vec3(0.9, 0.885, 0.845)', 'GPU-LVL-01'],
  ['src/world/levelMaterial.js', 'normalize(vWNorm * gTexN.z)', 'GPU-LVL-06'],
  ['src/world/levelMaterial.js', 'r = 0.08 + age * 0.35', 'GPU-LVL-07a'],
  ['src/world/levelMaterial.js', 'slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;', 'GPU-LVL-07b'],
  ['src/world/inkShading.js', 'uniform int uRipActiveCount;', 'GPU-INK-03'],
  ['src/world/inkShading.js', 'float maxD = front + sg * 3.0, minD = front - Qr.y * 4.0;', 'GPU-INK-03c'],
  ['src/world/inkShading.js', '5.0 * key + 0.3 * gFresh', 'GPU-INK-04c'],
  ['src/core/renderer.js', 'if (uExposure != 1.0) c.rgb *= uExposure;', 'GPU-POST-01'],
  ['src/fx/screenfx.js', 'uSwim.a > 0.001 && r > 0.35', 'GPU-SFX-03c'],
  ['src/world/environment.js', 'if (detail > 0.0 && (dEdge < 3.4 || dObj < 2.2))', 'GPU-ENV-01'],
  ['src/world/environment.js', '0.025 + 0.975 * (fnv2 * fnv2 * fnv)', 'GPU-ENV2a'],
  ['src/world/environment.js', 'float fres = 0.05 + 0.95 * (fnv2 * fnv2 * fnv);', 'GPU-ENV2c'],
  ['src/world/paint.js', 'c16 * c8 * c4', 'GPU-PNT1a'],
  ['src/world/paint.js', 'float tb = 1.0 - tnc2 * tnc2;', 'GPU-PNT1b'],
  ['src/world/paint.js', 'float tsp = 1.0 - tns * tns * tns;', 'GPU-PNT1c'],
  ['src/game/character-mats.js', 'float back = bk0 * bk0 * sqrt(bk0);', 'GPU-CHR-02b'],
  ['src/game/character-mats.js', 'mix(0.9, 1.08, fib)', 'GPU-CHR-02d'],
  ['src/fx/fx.js', 'tr0 * sqrt(tr0)', 'GPU-FX1'],
  ['src/fx/fx.js', 'if (vCol.a < 0.004 || r >= 1.18) discard;', 'GPU-FX-02a'],
  ['src/fx/fx.js', 'float fill = ivT4 * 0.45', 'GPU-FX3a'],
  ['src/fx/fx.js', 'rSun > 0.0 ? pow(rSun, 70.0) * 3.2 : 0.0', 'GPU-FX4'],
  ['src/fx/fx.js', 'float fwd = fw2 * fw2;', 'GPU-FX5b'],
];

test('every reported raw/composed collision rejects mutated production algebra instead of skipping it', () => {
  const built = new Map();
  for (const [rel, anchor, id] of REVIEW_DRIFT_CASES) {
    if (!built.has(rel)) built.set(rel, adaptBuildSource(rel, fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8')));
    const source = built.get(rel);
    assert.ok(source.includes(anchor), `${rel}: fixture for ${id}`);
    const mutated = source.replace(anchor, 'unknownGpuEpoch');
    assert.throws(() => adaptCombatWave345(rel, mutated, replaceOnce), error =>
      /optimization drift/.test(error.message) && error.message.includes(rel) && error.message.includes(id), `${rel}: ${id}`);
  }
  for (const [rel] of WAVE9_10_11_GPU_TARGETS) {
    assert.throws(() => adaptCombatWave345(rel, 'unknown upstream shader', replaceOnce), /optimization drift|Missing anchor/, rel);
  }
  assert.equal(adaptCombatWave345('src/world/level.js', 'unrelated owner epoch', replaceOnce), 'unrelated owner epoch');
});

test('spatial support gates preserve freckle derivatives, pad gradients, and the ripple fade derivative', () => {
  for (const [rel] of WAVE9_10_11_GPU_TARGETS) {
    const raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
    for (const source of [adaptCombatWave345(rel, raw, replaceOnce), adaptBuildSource(rel, raw)]) {
      if (rel === 'src/game/character-mats.js') {
        assert.ok(!source.includes('if (region >'), 'freckle iwFill requires uniform fwidth and preserves the positive region tail');
        assert.ok(source.includes('if (r > 0.006) {'));
        assert.ok(!source.includes('r < 0.135'), 'the crease exponential is positive beyond three standard deviations');
      }
      if (rel === 'src/world/decor.js') {
        const pad = source.slice(source.indexOf('const PAD_FRAG'), source.indexOf('const BARRIER_FRAG'));
        assert.ok(pad.indexOf('dFdx(eu)') < pad.indexOf('if (r < 0.62)'));
        assert.ok(pad.indexOf('dFdx(eu)') < pad.indexOf('discard;'), 'subpixel discs retain gradients before any fragment is discarded');
        assert.ok(pad.includes('textureGrad(uEmblem, eu, euDx, euDy).a'));
        assert.ok(!pad.includes('texture2D(uEmblem'));
      }
    }
  }
  const rel = 'src/world/inkShading.js';
  const raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
  for (const [epoch, source] of [['raw', raw], ['wave', adaptCombatWave345(rel, raw, replaceOnce)], ['production', adaptBuildSource(rel, raw)]]) {
    const gel = source.slice(source.indexOf('export const INK_GEL'), source.indexOf('export const INK_SLOPE'));
    const slope = source.slice(source.indexOf('export const INK_SLOPE'), source.indexOf('export const INK_EMISSIVE'));
    for (const [name, chunk, derivatives] of [['gel', gel, ['dFdx(gp)', 'dFdy(gp)', 'fwidth(vWPos)']], ['slope', slope, ['fwidth(vWPos)']]]) {
      // The reviewed render-queue owner adds only the zero-distance-fade
      // exclusion. Both epochs still evaluate the footprint before coverage.
      const gateText = name === 'slope' && epoch === 'production'
        ? 'if (gInk > 0.01 && rFar > 0.0)' : 'if (gInk > 0.01)';
      const gate = chunk.indexOf(gateText);
      assert.ok(gate >= 0, `${epoch} ${name}: the exact reviewed ink coverage gate bounds sampling and ripple work`);
      assert.equal(chunk.indexOf(gateText, gate + gateText.length), -1, `${epoch} ${name}: the coverage gate is unique`);
      for (const derivative of derivatives) {
        const at = chunk.indexOf(derivative);
        assert.ok(at >= 0 && at < gate, `${derivative} must precede the outer ink coverage branch`);
      }
      assert.ok(!/\b(?:dFdx|dFdy|fwidth)\s*\(/.test(chunk.slice(gate)), 'no hidden derivative remains within the outer spatial gate');
    }
    assert.ok(gel.indexOf('textureGrad(tNormal') > gel.indexOf('if (gInk > 0.01)'), 'gel texture reads remain bounded by ink coverage');
    assert.ok(gel.indexOf('vnoise(q') > gel.indexOf('if (gInk > 0.01)'), 'fallback noise remains bounded by ink coverage');
  }
});

test('nonzero fades, authored roof drips, and zero-strength normal orientation survive both epochs', () => {
  const required = new Map([
    ['src/game/lobbySet-mats.js', ['if (d.a > 0.0)', 'kRefl > 0.0', 'if (edge == 0.0) discard;']],
    ['src/game/weapons.js', ['if (drawn == 0.0) discard;']],
    ['src/world/environment.js', ['wl2 >= 0.0', 'fall > 0.0 && uStripK.x != 0.0']],
    ['src/world/levelMaterial.js', [': normalize(vWNorm * gTexN.z)']],
    ['src/boss/bossMats.js', ['if (wall && pid < 2.5) {', 'bCC = max(bCC, ink); bCCR = 0.04;', 'float pool = uDrip != 0.0 ?', 'if (uCrack != 0.0)', 'uGlowL != 0.0']],
  ]);
  for (const [rel, snippets] of required) {
    const raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
    for (const source of [adaptCombatWave345(rel, raw, replaceOnce), adaptBuildSource(rel, raw)]) {
      for (const snippet of snippets) assert.ok(source.includes(snippet), `${rel}: ${snippet}`);
    }
  }
  // These inputs were lost by the proposed thresholds despite positive output.
  assert.ok(Math.exp(-Math.pow(0.14 / 0.045, 2)) > 0);
  assert.ok(0.0005 * (1 - 0.8 * 0.5) > 0);
  assert.ok(0.0005 * 0.8 > 0);
  const n = [0, 2, 0], slope = [0.2, 0, 0];
  const normalize = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const authored = normalize(normalize(n).map((x, i) => x - slope[i]));
  const unnormalized = normalize(n.map((x, i) => x - slope[i]));
  assert.notDeepEqual(authored, unnormalized, 'normalization before slope application is observable');
});

test('ID-bearing Worley keeps stable rounded-length ties while distance-only caustics defer sqrt', () => {
  const rel = 'src/world/texlib.js', raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
  const worley = source => source.match(/vec4 worR\(WReq q\) \{[\s\S]*?return vec4\(F1, F2, id, id2\);\n\}/)?.[0];
  assert.ok(worley(raw));
  for (const source of [adaptCombatWave345(rel, raw, replaceOnce), adaptBuildSource(rel, raw)]) assert.equal(worley(source), worley(raw));
  const f = Math.fround, candidates = [
    { d2: f(0.5746048092842102), id: 0.8665964007377625 },
    { d2: f(0.5746047496795654), id: 0.21772730350494385 },
  ];
  assert.ok(candidates[1].d2 < candidates[0].d2);
  assert.equal(f(Math.sqrt(candidates[0].d2)), f(Math.sqrt(candidates[1].d2)));
  const original = candidates.reduce((a, b) => f(Math.sqrt(b.d2)) < f(Math.sqrt(a.d2)) ? b : a);
  const squared = candidates.reduce((a, b) => b.d2 < a.d2 ? b : a);
  assert.notEqual(original.id, squared.id, 'ranking squared distances changes the material ID at rounded-length ties');
  const envRel = 'src/world/environment.js';
  const environment = adaptBuildSource(envRel, fs.readFileSync(path.join(repoRoot, 'inkwave-public', envRel), 'utf8'));
  assert.ok(environment.includes('return sqrt(d2) - sqrt(d1);'));
});

test('squared ripple rejection preserves the sign domain and wake skips only already rejected envelopes', () => {
  const rel = 'src/world/inkShading.js', raw = fs.readFileSync(path.join(repoRoot, 'inkwave-public', rel), 'utf8');
  for (const source of [adaptCombatWave345(rel, raw, replaceOnce), adaptBuildSource(rel, raw)]) {
    assert.ok(source.includes('if (maxD < 0.0 || d2 > maxD * maxD || (minD > 0.0 && d2 < minD * minD)) continue;'));
  }
  const front = -1, sg = 0.2, d = 0.2, maxD = front + sg * 3;
  assert.ok(d - front > sg * 3, 'the original distance comparison rejects a negative upper radius');
  assert.equal(d * d > maxD * maxD, false, 'squaring alone loses the upper radius sign');
  assert.ok(maxD < 0, 'the explicit sign check restores rejection');
  for (const age of [1e-6, 0.1, 0.5, 1, 1.15]) {
    for (const [r, w] of [[0.1 + age * 0.95, 0.075 + age * 0.085], [0.08 + age * 0.35, 0.045 + age * 0.055]]) {
      const radius = r + w * 2.45;
      for (const distance of [radius, radius + w * 1e-4, radius + w, radius * 2]) {
        if (distance * distance > radius * radius) assert.ok(Math.exp(-Math.pow((distance - r) / w, 2)) < 0.003);
      }
    }
  }
});

test('polynomial and zero-contribution bounds hold for the explicitly tested domains', () => {
  const smoothstep = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  // 1. Spawn pad pool gate: pool = smoothstep(0.58, 0.5, r + (n - 0.5) * 0.06) for n in [0, 1]
  for (let r = 0.62; r <= 1.0; r += 0.01) {
    for (let n = 0; n <= 1.0; n += 0.1) {
      const pool = smoothstep(0.58, 0.5, r + (n - 0.5) * 0.06);
      assert.equal(pool, 0);
    }
  }

  // 2. ScreenFX gooBand gate
  for (const width of [0.028, 0.066, 0.094]) {
    for (const wob of [0.35, 0.45, 0.55]) {
      const edThreshold = width * (1.0 + wob * 1.6) + 0.02;
      const maxG = width * (1.0 + (0.56 * 2.2 + 0.5 * 0.7) * wob) - edThreshold;
      assert.ok(maxG < -0.02);
      assert.equal(smoothstep(-0.015, 0.004, maxG), 0);
    }
  }

  // 3. Open-sea foam gate
  for (let fn = 0; fn <= 1.0; fn += 0.1) {
    const dEdge = 3.4, dObj = 2.2;
    const edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
    const lap = smoothstep(3.4, 0.5, dEdge);
    const objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45) + 0.45 * smoothstep(2.2, 0.4, dObj);
    assert.equal(edgeF, 0);
    assert.equal(lap, 0);
    assert.equal(objF, 0);
  }

  // 4. Wave 10 PUFF_FRAG radius bound
  for (let n = 0; n <= 1.0; n += 0.25) {
    for (let n2 = 0; n2 <= 1.0; n2 += 0.25) {
      const r = 1.18;
      const edgeDust = 0.55 + (n - 0.5) * 0.6;
      const aDust = smoothstep(1.0, edgeDust * 0.4, r + (n2 - 0.5) * 0.35);
      const aStorm = smoothstep(1.0, 0.84, r + (n - 0.5) * 0.16);
      const edgeMist = 0.62 + (n - 0.5) * 0.5;
      const aMist = smoothstep(1.0, edgeMist * 0.55, r + (n - 0.5) * 0.25);
      assert.equal(aDust, 0);
      assert.equal(aStorm, 0);
      assert.equal(aMist, 0);
    }
  }

  // 5. Wave 10 swim wake segment squared-distance bound
  assert.ok(Math.exp(-2.45 * 2.45) < 0.003);

  // 6. Wave 10 & Wave 11 polynomial power chains (pow18, pow28, pow36, pow64, pow70, pow80)
  for (const x of [0.0, 0.25, 0.5, 0.75, 0.95, 1.0]) {
    const x2 = x * x, x4 = x2 * x2, x8 = x4 * x4, x16 = x8 * x8, x32 = x16 * x16, x64 = x32 * x32;
    assert.ok(Math.abs(x2 * x16 - Math.pow(x, 18)) < 1e-12);
    assert.ok(Math.abs(x4 * x8 * x16 - Math.pow(x, 28)) < 1e-12);
    assert.ok(Math.abs(x4 * x16 * x16 - Math.pow(x, 36)) < 1e-12);
    assert.ok(Math.abs(x64 - Math.pow(x, 64)) < 1e-12);
    assert.ok(Math.abs(x2 * x4 * x64 - Math.pow(x, 70)) < 1e-12);
    assert.ok(Math.abs(x16 * x64 - Math.pow(x, 80)) < 1e-12);
  }
});

import { adaptReviewedWave67Gpu } from './reviewed-wave67-gpu-adapter.mjs';
// Audited build-time source transformer for the 2026-10-26 (e781229b) Combat GPU/CPU Perfect-Reconciled upgrade.
// Respects all 18 Direct-Source owned modules (including src/game/nav.js, src/world/props-core.js, src/game/character-lod.js)
// and composes cleanly with all upstream queue adapters on main @ dd93aac2c408f746adb0c9aa572ea2f06f3bed43 (Step 145, and d88aa683, e781229b).

function applyIdempotent(code, before, after, replaceOnce, label, composedAfter = null) {
  if (code.includes(after) || (composedAfter !== null && code.includes(composedAfter))) return code;
  return replaceOnce(code, before, after, label);
}

// Apply additional Wave 3-5 optimizations only when the upstream stage still has
// the exact source anchor. Earlier adapters and current main may already own the
// site; never overwrite those authoritative changes or weaken other patch gates.
function applyWave345Compatible(code, before, after, replaceOnce, label) {
  if (code.includes(after) || !code.includes(before)) return code;
  return replaceOnce(code, before, after, label);
}

const WAVE_INK_HALO = `    float halo = smoothstep(0.06, 0.5, amt) * (1.0 - gInk) * near;
    if (halo > 0.0) {
      if (!wallF) {
        vec3 Tf = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bf = cross(vWNorm, Tf);
#if NUM_DIR_LIGHTS > 0
        vec3 sunW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
#else
        vec3 sunW = normalize(vec3(-0.41, 0.83, -0.38));
#endif
        vec2 sunF = vec2(dot(sunW, Tf), dot(sunW, Bf));
        // ink sits ON the ground: the lip throws a soft contact shadow, heavier on the side away from the sun
        vec2 outN = -gradA / max(length(gradA), 1e-4);
        float away = clamp(0.55 - 0.9 * dot(outN, normalize(sunF + 1e-4)) * length(sunF), 0.25, 1.3);
        halo *= smoothstep(0.4, 0.85, vWNorm.y) * away;
        base *= mix(vec3(1.0), team * 0.45 + 0.3, halo * 0.5);
      } else {
        // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
        base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
      }
    }`;

export const adaptCombatGpuCpuPerfectTargets = Object.freeze([
  'src/world/inkShading.js',
  'src/world/levelMaterial.js',
  'src/core/renderer.js',
  'src/fx/fx.js',
  'src/fx/screenfx.js',
  'src/fx/swimWake.js',
  'src/world/decor.js',
  'src/world/environment.js',
  'src/world/texlib.js',
  'src/core/shadowcache.js',
  'src/game/character.js',
  'src/game/character-weapons.js',
  'src/world/paint.js',
  'src/game/actor.js',
  'src/game/inkFlightRuntime.js',
  'src/game/weapons.js',
  'src/game/bots.js',
  'src/boss/boss.js',
  'src/game/match.js',
  'src/game/player.js',
  'src/game/cameraRig.js',
  'src/ui/hud.js',
  'src/net/netmatch.js',
  'src/main.js',
]);

export function adaptCombatGpuCpuPerfect(rel, code, replaceOnce, options = {}) {
  const stage = options?.stage || 'all';

  if (rel === 'src/world/inkShading.js') {
    // GPU-03: Gate wet-ink colour/seam/halo synthesis on non-empty ink coverage after uniform fwidth(amt).
    code = applyIdempotent(
      code,
      `    float amt = pnt.a;
    float fw = fwidth(amt);
    float w = clamp(fw * 0.8, 0.008, 0.25);
    gInk = smoothstep(0.5 - w, 0.5 + w, amt);
    float ia = 1.0 / max(amt, 0.02);
    float tRaw = clamp(pnt.r * ia, 0.0, 1.0);
    // crisp, pixel-anti-aliased colour border between the teams (no muddy mixed-colour fringe)
    float wT = clamp(fwidth(tRaw) * 0.75, 0.012, 0.2);`,
      `    float amt = pnt.a;
    float fw = fwidth(amt);
    float w = clamp(fw * 0.8, 0.008, 0.25);
    gInk = smoothstep(0.5 - w, 0.5 + w, amt);
    float ia = 1.0 / max(amt, 0.02);
    float tRaw = clamp(pnt.r * ia, 0.0, 1.0);
    // crisp, pixel-anti-aliased colour border between the teams (no muddy mixed-colour fringe)
    float wT = clamp(fwidth(tRaw) * 0.75, 0.012, 0.2);
    if (amt > 0.002 || l2.a > 0.002) {`,
      replaceOnce,
      'GPU-03 gate wet-ink colour/seam/halo synthesis on active ink coverage'
    );
    code = applyIdempotent(
      code,
      `      // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
      base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
    }
    base = mix(base, gInkCol, gInk);
  }\`;`,
      `      // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
      base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
    }
    base = mix(base, gInkCol, gInk);
    }
  }\`;`,
      replaceOnce,
      'GPU-03 close wet-ink coverage gate',
      WAVE_INK_HALO + `
    base = mix(base, gInkCol, gInk);
    }
  }\`;`
    );
    // GPU-01b: Skip ripple slope/wake normalization when no ripple contributed.
    code = applyIdempotent(
      code,
      `    float rl = length(rS);
    if (rl > 0.75) rS *= 0.75 / rl;
    float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));
    slope += vec2(dot(rS, T), dot(rS, Bt)) * gInk * rFar;
    gWake = max(gWake, clamp(rG * 0.5, 0.0, 1.0) * gInk * rFar);`,
      `    if (rG > 0.0 || dot(rS, rS) > 0.0) {
      float rl = length(rS);
      if (rl > 0.75) rS *= 0.75 / rl;
      float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));
      slope += vec2(dot(rS, T), dot(rS, Bt)) * gInk * rFar;
      gWake = max(gWake, clamp(rG * 0.5, 0.0, 1.0) * gInk * rFar);
    }`,
      replaceOnce,
      'GPU-01b skip ripple slope projection when zero ripples contribute'
    );
  }

  if (rel === 'src/world/levelMaterial.js') {
    // GPU-02: Add uWakeCount uniform and squared-distance wake bound rejection.
    code = applyIdempotent(
      code,
      `    uSwimF: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 0)) },`,
      `    uSwimF: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uWakeCount: { value: 4 },`,
      replaceOnce,
      'GPU-02 add uWakeCount uniform to levelMaterial'
    );
    code = applyIdempotent(
      code,
      `uniform vec4 uWake[48];
uniform vec4 uWakeB[4];
uniform vec4 uSwimH[4];
uniform vec4 uSwimF[4];`,
      `uniform vec4 uWake[48];
uniform vec4 uWakeB[4];
uniform vec4 uSwimH[4];
uniform vec4 uSwimF[4];
uniform int uWakeCount;`,
      replaceOnce,
      'GPU-02 declare uWakeCount in levelMaterial shader'
    );
    code = applyIdempotent(
      code,
      `    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      vec4 Bd = uWakeB[s];
      if (Bd.w <= 0.0 || distance(vWPos, Bd.xyz) > Bd.w) continue;`,
      `    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      if (s >= uWakeCount) break;
      vec4 Bd = uWakeB[s];
      vec3 dWake = vWPos - Bd.xyz;
      if (Bd.w <= 0.0 || dot(dWake, dWake) > Bd.w * Bd.w) continue;`,
      replaceOnce,
      'GPU-02 bound swim-wake loop by uWakeCount and squared distance'
    );
    code = applyIdempotent(
      code,
      `    float wl = length(wS);
    if (wl > 0.9) wS *= 0.9 / wl;
    float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
    slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
    gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;`,
      `    if (wG > 0.0 || dot(wS, wS) > 0.0) {
      float wl = length(wS);
      if (wl > 0.9) wS *= 0.9 / wl;
      float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
      slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
      gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;
    }`,
      replaceOnce,
      'GPU-02 skip wake tangent projection when no wake contributed',
      `    if (wG > 0.0 || dot(wS, wS) > 0.0) {
      float wl = length(wS);
      if (wl > 0.9) wS *= 0.9 / wl;
      slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
      gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;
    }`
    );
  }

  if (rel === 'src/core/renderer.js') {
    // GPU-06: Gate low-health desaturation in GradeShader when uHurt <= 0.0.
    code = applyIdempotent(
      code,
      `      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
      c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);`,
      `      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      if (uHurt > 0.0) {
        float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
        c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
      }`,
      replaceOnce,
      'GPU-06 branch over low-health desaturation in GradeShader when uHurt <= 0',
      `        if (uHurt > 0.0) {
          // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
          float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
          c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
        }`
    );
  }

  if (rel === 'src/fx/fx.js') {
    // GPU-22: Track dirty slot bounds for shell static attributes (aColA and aAxis, 32B/shell)
    // so settled live shells cost zero CPU Float32Array writes and zero GPU buffer uploads per frame.
    // The later ring optimization adds a second static-attribute slot before
    // this terminal GPU-22 pass. Retain both ring skip slots and append the
    // shell-only static guard instead of overwriting either owner.
    const staticGuard = code.includes('staticAttribute2 = null')
      ? '    if (a === staticAttribute || a === staticAttribute2) continue;'
      : '    if (a === staticAttribute) continue;';
    code = applyIdempotent(
      code,
      staticGuard,
      staticGuard.replace(') continue;', ' || a._fxStatic) continue;'),
      replaceOnce,
      'GPU-22 skip _fxStatic attributes in markUpdated'
    );
    code = applyIdempotent(
      code,
      `    this.shells = { cap, n: 0, geo, mesh, P: new Float32Array(cap * 3), V: new Float32Array(cap * 3), C: new Float32Array(cap * 3), X: new Float32Array(cap * 9), A: new Float32Array(cap * 4) };`,
      `    geo.attributes.aColA._fxStatic = true; geo.attributes.aAxis._fxStatic = true;
    this.shells = { cap, n: 0, dirtyStart: cap, dirtyEnd: 0, geo, mesh, P: new Float32Array(cap * 3), V: new Float32Array(cap * 3), C: new Float32Array(cap * 3), X: new Float32Array(cap * 9), A: new Float32Array(cap * 4) };`,
      replaceOnce,
      'GPU-22 mark shell aColA/aAxis static and init dirty bounds'
    );
    code = applyIdempotent(
      code,
      `    if (axis) { S.A[i4] = axis.x; S.A[i4 + 1] = axis.y; S.A[i4 + 2] = axis.z; S.A[i4 + 3] = crown; }
    else { S.A[i4] = 0; S.A[i4 + 1] = 1; S.A[i4 + 2] = 0; S.A[i4 + 3] = 0; }
  }`,
      `    if (axis) { S.A[i4] = axis.x; S.A[i4 + 1] = axis.y; S.A[i4 + 2] = axis.z; S.A[i4 + 3] = crown; }
    else { S.A[i4] = 0; S.A[i4 + 1] = 1; S.A[i4 + 2] = 0; S.A[i4 + 3] = 0; }
    S.dirtyStart = Math.min(S.dirtyStart, i); S.dirtyEnd = Math.max(S.dirtyEnd, i + 1);
  }`,
      replaceOnce,
      'GPU-22 record dirty shell slot on birth/recycle'
    );
    code = applyIdempotent(
      code,
      `        if (i !== last) { S.P.copyWithin(i3, last * 3, last * 3 + 3); S.V.copyWithin(i3, last * 3, last * 3 + 3); S.C.copyWithin(i3, last * 3, last * 3 + 3); X.copyWithin(x, last * 9, last * 9 + 9); S.A.copyWithin(i * 4, last * 4, last * 4 + 4); }`,
      `        if (i !== last) { S.P.copyWithin(i3, last * 3, last * 3 + 3); S.V.copyWithin(i3, last * 3, last * 3 + 3); S.C.copyWithin(i3, last * 3, last * 3 + 3); X.copyWithin(x, last * 9, last * 9 + 9); S.A.copyWithin(i * 4, last * 4, last * 4 + 4); S.dirtyStart = Math.min(S.dirtyStart, i); S.dirtyEnd = Math.max(S.dirtyEnd, i + 1); }`,
      replaceOnce,
      'GPU-22 record dirty shell slot on swap compaction'
    );
    code = applyIdempotent(
      code,
      `      // the sheet does not fade: it tears apart (t drives the holes in the shader); alpha = how intact it starts
      aP[i4] = S.P[i3]; aP[i4 + 1] = S.P[i3 + 1]; aP[i4 + 2] = S.P[i3 + 2]; aP[i4 + 3] = r;
      aC[i4] = S.C[i3]; aC[i4 + 1] = S.C[i3 + 1]; aC[i4 + 2] = S.C[i3 + 2]; aC[i4 + 3] = X[x + 5];
      aM[i4] = t; aM[i4 + 1] = X[x + 7]; aM[i4 + 2] = X[x + 6]; aM[i4 + 3] = X[x + 8] * (1 - te * 0.6);
      aA[i4] = S.A[i4]; aA[i4 + 1] = S.A[i4 + 1]; aA[i4 + 2] = S.A[i4 + 2]; aA[i4 + 3] = S.A[i4 + 3];
    }
    S.geo.instanceCount = S.n;
    markUpdated(S.geo, S.n);`,
      `      // the sheet does not fade: it tears apart (t drives the holes in the shader); alpha = how intact it starts
      aP[i4] = S.P[i3]; aP[i4 + 1] = S.P[i3 + 1]; aP[i4 + 2] = S.P[i3 + 2]; aP[i4 + 3] = r;
      aM[i4] = t; aM[i4 + 1] = X[x + 7]; aM[i4 + 2] = X[x + 6]; aM[i4 + 3] = X[x + 8] * (1 - te * 0.6);
    }
    const sStart = S.dirtyStart, sEnd = Math.min(S.dirtyEnd, S.n);
    if (sStart < sEnd) {
      for (let i = sStart; i < sEnd; i++) {
        const i3 = i * 3, i4 = i * 4, x = i * 9;
        aC[i4] = S.C[i3]; aC[i4 + 1] = S.C[i3 + 1]; aC[i4 + 2] = S.C[i3 + 2]; aC[i4 + 3] = X[x + 5];
        aA[i4] = S.A[i4]; aA[i4 + 1] = S.A[i4 + 1]; aA[i4 + 2] = S.A[i4 + 2]; aA[i4 + 3] = S.A[i4 + 3];
      }
      for (const attr of [S.geo.attributes.aColA, S.geo.attributes.aAxis]) {
        let first = sStart * 4, last = sEnd * 4;
        for (const pending of attr.updateRanges) {
          first = Math.min(first, pending.start);
          last = Math.max(last, pending.start + pending.count);
        }
        const range = attr._fxRange || (attr._fxRange = { start: 0, count: 0 });
        range.start = first; range.count = last - first;
        attr.updateRanges.length = 0; attr.updateRanges.push(range); attr.needsUpdate = true;
      }
    }
    S.dirtyStart = S.cap; S.dirtyEnd = 0;
    S.geo.instanceCount = S.n;
    markUpdated(S.geo, S.n);`,
      replaceOnce,
      'GPU-22 upload only dirty shell aColA and aAxis ranges',
      '    const sStart = S.dirtyStart, sEnd = Math.min(S.dirtyEnd, S.n);'
    );
    code = applyIdempotent(
      code,
      `    this._dropColorStart = this.dCap; this._dropColorEnd = 0;
    for (const p of [this.puffs, this.glows, this.rings, this.shells, this.beams]) { p.n = 0; p.geo.instanceCount = 0; }`,
      `    this._dropColorStart = this.dCap; this._dropColorEnd = 0;
    if (this.shells) { this.shells.dirtyStart = this.shells.cap; this.shells.dirtyEnd = 0; }
    for (const p of [this.puffs, this.glows, this.rings, this.shells, this.beams]) { p.n = 0; p.geo.instanceCount = 0; }`,
      replaceOnce,
      'GPU-22 reset shell dirty range on clear()'
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    // GPU-07b: Guard LensInk.render(aspect) when already cleared and empty.
    code = applyIdempotent(
      code,
      `  render(aspect) {
    if (this._parked) this._fit();
    const P = this.parts, n = Math.min(P.length, MAXS);`,
      `  render(aspect) {
    if (!this.parts.length && !this.dirty && this._wasEmpty) return;
    this._wasEmpty = !this.parts.length;
    if (this._parked) this._fit();
    const P = this.parts, n = Math.min(P.length, MAXS);`,
      replaceOnce,
      'GPU-07b skip redundant empty LensInk render pass'
    );
  }

  if (rel === 'src/fx/swimWake.js' && code.includes('this._wakeUpload = null;')) {
    // GPU-08b: Pool wake trail point objects and publish active wake slot count to U.uWakeCount.
    code = applyIdempotent(
      code,
      `const compareWakeDistance = (x, y) => x._wakeD2 - y._wakeD2;

export class SwimWake {`,
      `const compareWakeDistance = (x, y) => x._wakeD2 - y._wakeD2;
function recycleWakePoints(slot) {
  const pool = slot.pool || (slot.pool = []);
  while (slot.pts.length) pool.push(slot.pts.pop());
}
function shiftWakePoint(slot) {
  const pt = slot.pts.shift();
  if (pt) (slot.pool || (slot.pool = [])).push(pt);
}
function pushWakePoint(slot, x, y, z, t) {
  const pool = slot.pool || (slot.pool = []);
  const pt = pool.pop() || { x: 0, y: 0, z: 0, t: 0 };
  pt.x = x; pt.y = y; pt.z = z; pt.t = t;
  slot.pts.push(pt);
}

export class SwimWake {`,
      replaceOnce,
      'GPU-08b add wake point pooling helpers in SwimWake'
    );
    code = applyIdempotent(
      code,
      `    this.slots = Array.from({ length: SLOTS }, () => ({
      actor: null, pts: [], k: 0, speedK: 0, fwd: new THREE.Vector3(0, 0, 1), head: new THREE.Vector3(), last: null, swimming: false,
    }));`,
      `    this.slots = Array.from({ length: SLOTS }, () => ({
      actor: null, pts: [], pool: [], k: 0, speedK: 0, fwd: new THREE.Vector3(0, 0, 1), head: new THREE.Vector3(), last: null, swimming: false,
    }));`,
      replaceOnce,
      'GPU-08b initialize per-slot wake point pool'
    );
    code = applyIdempotent(
      code,
      `  reset() { this._wakeUpload = null; for (const s of this.slots) { s.actor = null; s.pts.length = 0; s.k = 0; s.last = null; s.swimming = false; } }`,
      `  reset() { this._wakeUpload = null; for (const s of this.slots) { s.actor = null; recycleWakePoints(s); s.k = 0; s.last = null; s.swimming = false; } }`,
      replaceOnce,
      'GPU-08b recycle wake points on reset'
    );
    code = applyIdempotent(
      code,
      `        if (s) { s.pts.length = 0; s.last = null; s.k = 0; }
      }
      if (!s) continue;
      if (s.actor !== a) { s.actor = a; s.pts.length = 0; s.last = null; s.k = 0; }`,
      `        if (s) { recycleWakePoints(s); s.last = null; s.k = 0; }
      }
      if (!s) continue;
      if (s.actor !== a) { s.actor = a; recycleWakePoints(s); s.last = null; s.k = 0; }`,
      replaceOnce,
      'GPU-08b recycle wake points on slot reassignment'
    );
    code = applyIdempotent(
      code,
      `      while (s.pts.length && (s.pts[0].t === BREAK ? true : now - s.pts[0].t > LIFE)) s.pts.shift();
      if (s.swimming) {
        const p = a.pos;
        const v = a.vel, sp = v.length();
        if (sp > 0.6) s.fwd.set(v.x, a.anim?.form === 'climb' ? v.y : 0, v.z).normalize();
        s.speedK = damp(s.speedK, clamp(sp / 11.8, 0, 1), 10, dt);
        // teleports / re-entries start a new trail (never draw a ripple across a jump or a respawn)
        if (s.last && s.last.distanceToSquared(p) > 2.5 * 2.5) { if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) s.pts.push({ x: 0, y: 0, z: 0, t: BREAK }); s.last = null; }
        if (!s.last || s.last.distanceToSquared(p) > SPACING * SPACING) {
          if (sp > 0.8 || !s.last) {
            s.pts.push({ x: p.x, y: p.y, z: p.z, t: now });
            (s.last || (s.last = new THREE.Vector3())).copy(p);
          }
        }
        s.head.copy(p);
        s.k = damp(s.k, 1, 14, dt);
      } else {
        // left the ink (jumped, emerged, splatted): the mound sinks away, the trail ages out, then the slot frees
        if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) s.pts.push({ x: 0, y: 0, z: 0, t: BREAK });
        s.last = null;
        s.k = damp(s.k, 0, 16, dt);
        if (s.k < 0.004 && !s.pts.some((o) => o.t !== BREAK)) { s.actor = null; s.pts.length = 0; s.k = 0; }
      }
      while (s.pts.length > PTS - 1) s.pts.shift();`,
      `      while (s.pts.length && (s.pts[0].t === BREAK ? true : now - s.pts[0].t > LIFE)) shiftWakePoint(s);
      if (s.swimming) {
        const p = a.pos;
        const v = a.vel, sp = v.length();
        if (sp > 0.6) s.fwd.set(v.x, a.anim?.form === 'climb' ? v.y : 0, v.z).normalize();
        s.speedK = damp(s.speedK, clamp(sp / 11.8, 0, 1), 10, dt);
        // teleports / re-entries start a new trail (never draw a ripple across a jump or a respawn)
        if (s.last && s.last.distanceToSquared(p) > 2.5 * 2.5) { if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) pushWakePoint(s, 0, 0, 0, BREAK); s.last = null; }
        if (!s.last || s.last.distanceToSquared(p) > SPACING * SPACING) {
          if (sp > 0.8 || !s.last) {
            pushWakePoint(s, p.x, p.y, p.z, now);
            (s.last || (s.last = new THREE.Vector3())).copy(p);
          }
        }
        s.head.copy(p);
        s.k = damp(s.k, 1, 14, dt);
      } else {
        // left the ink (jumped, emerged, splatted): the mound sinks away, the trail ages out, then the slot frees
        if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) pushWakePoint(s, 0, 0, 0, BREAK);
        s.last = null;
        s.k = damp(s.k, 0, 16, dt);
        if (s.k < 0.004 && !s.pts.some((o) => o.t !== BREAK)) { s.actor = null; recycleWakePoints(s); s.k = 0; }
      }
      while (s.pts.length > PTS - 1) shiftWakePoint(s);`,
      replaceOnce,
      'GPU-08b pool wake point allocations during trail update'
    );
    code = applyIdempotent(
      code,
      `      const previous = upload.counts[si];
      for (let i = n; i < (previous < 0 ? PTS : previous); i++) W[base + i].set(0, 0, 0, BREAK);
      upload.counts[si] = n; upload.active[si] = !!s.actor;
    }`,
      `      const previous = upload.counts[si];
      for (let i = n; i < (previous < 0 ? PTS : previous); i++) W[base + i].set(0, 0, 0, BREAK);
      upload.counts[si] = n; upload.active[si] = !!s.actor;
    }
    if (U.uWakeCount) {
      let activeWakeSlots = 0;
      for (let si = 0; si < SLOTS; si++) if (this.slots[si].actor) activeWakeSlots = si + 1;
      U.uWakeCount.value = activeWakeSlots;
    }`,
      replaceOnce,
      'GPU-08b publish activeWakeSlots to U.uWakeCount'
    );
  }

  if (rel === 'src/world/decor.js') {
    // GPU-12b: Add squared-distance rejection before Math.hypot(dx, dz) in spawn pad proximity check.
    code = applyIdempotent(
      code,
      `        const reach = this.level.spawnBarrier + 4;
        if (Number.isFinite(reach) && reach >= 0 && !Number.isNaN(dx) && !Number.isNaN(dz) && (Math.abs(dx) > reach || Math.abs(dz) > reach)) continue;
        const d = Math.hypot(dx, dz);`,
      `        const reach = this.level.spawnBarrier + 4;
        if (Number.isFinite(reach) && reach >= 0 && !Number.isNaN(dx) && !Number.isNaN(dz) && (Math.abs(dx) > reach || Math.abs(dz) > reach)) continue;
        const d2 = dx * dx + dz * dz;
        if (Number.isFinite(reach) && reach >= 0 && Number.isFinite(d2) && Number.isFinite(reach * reach) && d2 >= reach * reach) continue;
        const d = Math.hypot(dx, dz);`,
      replaceOnce,
      'GPU-12b reject out-of-range spawn barrier actors via squared distance before sqrt'
    );
  }

  if (rel === 'src/world/environment.js') {
    // GPU-15b: Bound sail, buoy, and gull instanceMatrix upload ranges.
    code = applyIdempotent(
      code,
      `      this.sailInst.setMatrixAt(i, _m4);
    }
    this.sailInst.instanceMatrix.needsUpdate = true;`,
      `      this.sailInst.setMatrixAt(i, _m4);
    }
    this.sailInst.instanceMatrix.clearUpdateRanges();
    this.sailInst.instanceMatrix.addUpdateRange(0, this.sailboats.length * 16);
    this.sailInst.instanceMatrix.needsUpdate = true;`,
      replaceOnce,
      'GPU-15b bound sailInst instanceMatrix updateRange',
      // Exact completed form emitted by the downstream world full-upload adapter.
      `      this.sailInst.setMatrixAt(i, _m4);
    }
    this.sailInst.instanceMatrix.clearUpdateRanges();
    if(this.sailInst.instanceMatrix.array.length!==this.sailboats.length*16) this.sailInst.instanceMatrix.addUpdateRange(0, this.sailboats.length * 16);
    this.sailInst.instanceMatrix.needsUpdate = true;`
    );
    code = applyIdempotent(
      code,
      `      this.buoyInst.setMatrixAt(i, _m4);
    }
    this.buoyInst.instanceMatrix.needsUpdate = true;`,
      `      this.buoyInst.setMatrixAt(i, _m4);
    }
    this.buoyInst.instanceMatrix.clearUpdateRanges();
    this.buoyInst.instanceMatrix.addUpdateRange(0, this.buoys.length * 16);
    this.buoyInst.instanceMatrix.needsUpdate = true;`,
      replaceOnce,
      'GPU-15b bound buoyInst instanceMatrix updateRange',
      // Exact completed form emitted by the downstream world full-upload adapter.
      `      this.buoyInst.setMatrixAt(i, _m4);
    }
    this.buoyInst.instanceMatrix.clearUpdateRanges();
    if(this.buoyInst.instanceMatrix.array.length!==this.buoys.length*16) this.buoyInst.instanceMatrix.addUpdateRange(0, this.buoys.length * 16);
    this.buoyInst.instanceMatrix.needsUpdate = true;`
    );
    code = applyIdempotent(
      code,
      `      this.gullInst.setMatrixAt(i, _m4);
    }
    this.gullInst.instanceMatrix.needsUpdate = true;`,
      `      this.gullInst.setMatrixAt(i, _m4);
    }
    this.gullInst.instanceMatrix.clearUpdateRanges();
    this.gullInst.instanceMatrix.addUpdateRange(0, this.gulls.length * 16);
    this.gullInst.instanceMatrix.needsUpdate = true;`,
      replaceOnce,
      'GPU-15b bound gullInst instanceMatrix updateRange',
      // Exact completed form emitted by the downstream world full-upload adapter.
      `      this.gullInst.setMatrixAt(i, _m4);
    }
    this.gullInst.instanceMatrix.clearUpdateRanges();
    if(this.gullInst.instanceMatrix.array.length!==this.gulls.length*16) this.gullInst.instanceMatrix.addUpdateRange(0, this.gulls.length * 16);
    this.gullInst.instanceMatrix.needsUpdate = true;`
    );
  }

  if (rel === 'src/world/texlib.js') {
    // GPU-16b: Reuse 4-byte sync pixel scratch buffer on renderer when texlib-sync-timing is active.
    code = applyIdempotent(
      code,
      `  if (syncTiming) renderer.readRenderTargetPixels(out, 0, 0, 1, 1, new Uint8Array(4), undefined, 2);`,
      `  if (syncTiming) renderer.readRenderTargetPixels(out, 0, 0, 1, 1, renderer._iwTexlibSyncPixel || (renderer._iwTexlibSyncPixel = new Uint8Array(4)), undefined, 2);`,
      replaceOnce,
      'GPU-16b reuse _iwTexlibSyncPixel buffer in createTextureLibrary'
    );
  }

  if (rel === 'src/core/shadowcache.js') {
    // GPU-19: Reuse _dynList and _statSet in ShadowCache._render while retaining exact wasCasting restoration.
    code = applyIdempotent(
      code,
      `        this.static = this._collect();
        const dyn = [], stat = new Set(this.static.map((s) => s.o));
        try {
          scene.traverse((o) => {
            if (o.castShadow && (o.isMesh || o.isInstancedMesh) && !stat.has(o)) {
              dyn.push([o, o.castShadow]); o.castShadow = false;
            }
          });
          sm.needsUpdate = true;
          orig.call(sm, lights, scene, camera);
        } finally {
          for (const [o, wasCasting] of dyn) o.castShadow = wasCasting;
        }`,
      `        this.static = this._collect();
        const dyn = this._dynList || (this._dynList = []);
        const stat = this._statSet || (this._statSet = new Set());
        dyn.length = 0; stat.clear();
        for (let i = 0; i < this.static.length; i++) stat.add(this.static[i].o);
        try {
          scene.traverse((o) => {
            if (o.castShadow && (o.isMesh || o.isInstancedMesh) && !stat.has(o)) {
              dyn.push([o, o.castShadow]); o.castShadow = false;
            }
          });
          sm.needsUpdate = true;
          orig.call(sm, lights, scene, camera);
        } finally {
          for (const [o, wasCasting] of dyn) o.castShadow = wasCasting;
          dyn.length = 0; stat.clear();
        }`,
      replaceOnce,
      'GPU-19 reuse _dynList and _statSet in ShadowCache._render'
    );
  }

  if (rel === 'src/game/character.js') {
    // GPU-20 & CPU-03: Gate _updateMaterials(dt, s) on shown and dirty-check uFlash.
    code = applyIdempotent(
      code,
      `    this.squid.ghost.visible = false;
    this._updateMaterials(dt, s);`,
      `    this.squid.ghost.visible = false;
    if (shown) this._updateMaterials(dt, s);`,
      replaceOnce,
      'GPU-20 & CPU-03 gate _updateMaterials on shown character'
    );
    code = applyIdempotent(
      code,
      `    const fl = s.invuln ? 0.22 * (0.5 + 0.5 * Math.sin(t * TAU * 6)) : 0;
    u.uFlash.value.setRGB(fl, fl, fl);`,
      `    const fl = s.invuln ? 0.22 * (0.5 + 0.5 * Math.sin(t * TAU * 6)) : 0;
    if (this._lastFl !== fl) { this._lastFl = fl; u.uFlash.value.setRGB(fl, fl, fl); }`,
      replaceOnce,
      'GPU-20 & CPU-03 dirty-check uFlash in _updateMaterials'
    );
    // CPU-04: Fast-path unit scale in _updateHair(dt) via _q3.setFromRotationMatrix(this.kid.matrixWorld)
    // to skip matrixWorld.decompose column-length sqrt & determinant overhead, with exact fallback to decompose on scaled frames.
    code = applyIdempotent(
      code,
      `    this.kid.matrixWorld.decompose(_v3, _q3, _v4);`,
      `    const _ms = this.model.scale, _ks = this.kid.scale, _rs = this.root?.scale;
    if (_ms.x === 1 && _ms.y === 1 && _ms.z === 1 && _ks.x === 1 && _ks.y === 1 && _ks.z === 1 && (!_rs || (_rs.x === 1 && _rs.y === 1 && _rs.z === 1))) {
      _q3.setFromRotationMatrix(this.kid.matrixWorld);
    } else {
      this.kid.matrixWorld.decompose(_v3, _q3, _v4);
    }`,
      replaceOnce,
      'CPU-04 fast-path unit-scale world quaternion in _updateHair'
    );
  }

  if (rel === 'src/game/character-weapons.js') {
    // CPU-06: Bypass mergeGeometries iteration for single-part geometries while returning an independent clone.
    code = applyIdempotent(
      code,
      `  build() { return this.list.length ? mergeGeometries(this.list, false) : null; }`,
      `  build() { return this.list.length === 1 ? this.list[0].clone() : this.list.length ? mergeGeometries(this.list, false) : null; }`,
      replaceOnce,
      'CPU-06 fast-path single-element Parts.build clone'
    );
  }

  if (rel === 'src/world/paint.js') {
    // CPU-01 / CMB-11: Early bounds rejection, row-hoisted dv2 check, and array reference hoist in PaintSystem.regionStats.
    code = applyIdempotent(
      code,
      `        const i0 = Math.max(0, Math.floor((lu - radius) / f.cu)), i1 = Math.min(f.nu - 1, Math.floor((lu + radius) / f.cu));
        const j0 = Math.max(0, Math.floor((lv - radius) / f.cv)), j1 = Math.min(f.nv - 1, Math.floor((lv + radius) / f.cv));
        for (let j = j0; j <= j1; j += 2) for (let i = i0; i <= i1; i += 2) {
          const du = (i + 0.5) * f.cu - lu, dv = (j + 0.5) * f.cv - lv;
          if (du * du + dv * dv > radius * radius) continue;
          const k = f.grid + j * f.nu + i;
          if (this.dead[k]) continue;
          const g = this.grid[k];`,
      `        const i0 = Math.max(0, Math.floor((lu - radius) / f.cu)), i1 = Math.min(f.nu - 1, Math.floor((lu + radius) / f.cu));
        if (i0 > i1) continue;
        const j0 = Math.max(0, Math.floor((lv - radius) / f.cv)), j1 = Math.min(f.nv - 1, Math.floor((lv + radius) / f.cv));
        if (j0 > j1) continue;
        const r2 = radius * radius, cu = f.cu, cv = f.cv, nu = f.nu, fGrid = f.grid, dead = this.dead, grid = this.grid;
        for (let j = j0; j <= j1; j += 2) {
          const dv = (j + 0.5) * cv - lv, dv2 = dv * dv;
          if (dv2 > r2) continue;
          const row = fGrid + j * nu;
          for (let i = i0; i <= i1; i += 2) {
            const du = (i + 0.5) * cu - lu;
            if (du * du + dv2 > r2) continue;
            const k = row + i;
            if (dead[k]) continue;
            const g = grid[k];`,
      replaceOnce,
      'CPU-01 early bounds rejection and r2 hoist in PaintSystem.regionStats'
    );
    code = applyIdempotent(
      code,
      `          if (g === own) out.own++; else if (g) out.enemy++; else out.empty++;
        }
      }`,
      `          if (g === own) out.own++; else if (g) out.enemy++; else out.empty++;
          }
        }
      }`,
      replaceOnce,
      'CPU-01 close outer j loop in PaintSystem.regionStats'
    );
  }

  if (rel === 'src/game/actor.js') {
    // CPU-02 omitted: PaintSystem.version does not cover every direct grid mutation.
    // A stale sample affects swimming, enemy ink damage, and Charger charge retention.

    // CPU-21: Pre-filter Actor._spawnBarrier with height, AABB, and squared distance before Math.sqrt.
    code = applyIdempotent(
      code,
      `  _spawnBarrier() {
    const pad = G.level.spawnPads[this.enemyTeam];
    const R = G.level.spawnBarrier;
    const dx = this.pos.x - pad.x, dz = this.pos.z - pad.z;
    const d = Math.hypot(dx, dz);
    if (d < R && this.pos.y > pad.y - 1.0) {`,
      `  _spawnBarrier() {
    const pad = G.level.spawnPads[this.enemyTeam];
    if (this.pos.y <= pad.y - 1.0) return;
    const R = G.level.spawnBarrier;
    const dx = this.pos.x - pad.x, dz = this.pos.z - pad.z;
    if (Math.abs(dx) >= R || Math.abs(dz) >= R) return;
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R) {
      const d = Math.sqrt(d2);`,
      replaceOnce,
      'CPU-21 pre-filter Actor._spawnBarrier before sqrt'
    );
  }

  if (rel === 'src/game/weapons.js') {
    // CPU-07a: Fast-path empty clouds and reuse _rainHits Map in _updateClouds(dt).
    code = applyIdempotent(
      code,
      `  _updateClouds(dt) {
    const rainHits = new Map();`,
      `  _updateClouds(dt) {
    if (!this.clouds.length) return;
    const rainHits = this._rainHits || (this._rainHits = new Map());
    rainHits.clear();`,
      replaceOnce,
      'CPU-07a fast-path empty clouds and reuse _rainHits Map in _updateClouds'
    );

  }

  if (rel === 'src/game/bots.js') {
    // CPU-10: Replace per-frame charge-family array literal allocations with boolean comparisons.
    code = applyIdempotent(
      code,
      `    } else if (['charger', 'splatling', 'stringer', 'splatana'].includes(family) && a.weaponRunner.charging && !enemyVisible) {`,
      `    } else if ((family === 'charger' || family === 'splatling' || family === 'stringer' || family === 'splatana') && a.weaponRunner.charging && !enemyVisible) {`,
      replaceOnce,
      'CPU-10 replace combat charge-hold array literal in bots.js'
    );
    code = applyIdempotent(
      code,
      `      if (!onOwnInk && remaining < 1.5 && (inkFrac > 0.03 || ['charger', 'splatling', 'stringer', 'splatana'].includes(w.behaviorKind || w.kind) && (a.weaponRunner.charging || a.weaponRunner.s3ReleaseHold))) {
        // no ink here: paint a puddle to swim in`,
      `      const _wk0 = w.behaviorKind || w.kind;
      if (!onOwnInk && remaining < 1.5 && (inkFrac > 0.03 || (_wk0 === 'charger' || _wk0 === 'splatling' || _wk0 === 'stringer' || _wk0 === 'splatana') && (a.weaponRunner.charging || a.weaponRunner.s3ReleaseHold))) {
        // no ink here: paint a puddle to swim in`,
      replaceOnce,
      'CPU-10 replace turf refill array literal in bots.js'
    );
    code = applyIdempotent(
      code,
      `      } else if (['charger', 'splatling', 'stringer', 'splatana'].includes(family)
        && a.weaponRunner.charging && T.los) it.fire = a.weaponRunner.charge < this.chargeRelease;`,
      `      } else if ((family === 'charger' || family === 'splatling' || family === 'stringer' || family === 'splatana')
        && a.weaponRunner.charging && T.los) it.fire = a.weaponRunner.charge < this.chargeRelease;`,
      replaceOnce,
      'CPU-10 replace boss charge-hold array literal in bots.js'
    );
    code = applyIdempotent(
      code,
      `        it.fire = family === 'roller' ? wantMove
          : !['charger', 'splatling', 'stringer', 'splatana'].includes(family) ? true
          : !a.weaponRunner.charging || a.weaponRunner.charge < (family === 'splatana' ? 0.45 : 0.6);`,
      `        it.fire = family === 'roller' ? wantMove
          : !(family === 'charger' || family === 'splatling' || family === 'stringer' || family === 'splatana') ? true
          : !a.weaponRunner.charging || a.weaponRunner.charge < (family === 'splatana' ? 0.45 : 0.6);`,
      replaceOnce,
      'CPU-10 replace boss clean-ink array literal in bots.js'
    );
    code = applyIdempotent(
      code,
      `      if (!onOwnInk && remaining < 1.5 && (inkFrac > 0.03 || ['charger', 'splatling', 'stringer', 'splatana'].includes(w.behaviorKind || w.kind) && (a.weaponRunner.charging || a.weaponRunner.s3ReleaseHold))) { it.squid = false; it.fire = this._puddleFire(dt); wantPitch = -1.0; }`,
      `      const _wk1 = w.behaviorKind || w.kind;
      if (!onOwnInk && remaining < 1.5 && (inkFrac > 0.03 || (_wk1 === 'charger' || _wk1 === 'splatling' || _wk1 === 'stringer' || _wk1 === 'splatana') && (a.weaponRunner.charging || a.weaponRunner.s3ReleaseHold))) { it.squid = false; it.fire = this._puddleFire(dt); wantPitch = -1.0; }`,
      replaceOnce,
      'CPU-10 replace boss refill array literal in bots.js'
    );
    // MOV-09: Precompute fixed trigonometric table for [0.8, -0.8, 1.45, -1.45] in _edgeGuardUncached.
    code = applyIdempotent(
      code,
      `    for (const ang of [0.8, -0.8, 1.45, -1.45]) {
      const c = Math.cos(ang), s = Math.sin(ang), nx = dx * c + dz * s, nz = -dx * s + dz * c;
      if (!bad(nx, nz)) { mv.set(nx * m, 0, nz * m); return; }
    }`,
      `    const _egCos0 = Math.cos(0.8), _egSin0 = Math.sin(0.8), _egCos1 = Math.cos(1.45), _egSin1 = Math.sin(1.45);
    for (let _egi = 0; _egi < 4; _egi++) {
      const c = _egi < 2 ? _egCos0 : _egCos1, s = _egi === 0 ? _egSin0 : _egi === 1 ? -_egSin0 : _egi === 2 ? _egSin1 : -_egSin1;
      const nx = dx * c + dz * s, nz = -dx * s + dz * c;
      if (!bad(nx, nz)) { mv.set(nx * m, 0, nz * m); return; }
    }`,
      replaceOnce,
      'MOV-09 precompute trigonometric values in _edgeGuardUncached'
    );
  }

  if (rel === 'src/boss/boss.js') {
    // CPU-12: Replace G.actors.find closures and reuse crablet state descriptor in Boss.
    code = applyIdempotent(
      code,
      `  targetActor() { return this.target >= 0 ? G.actors.find((a) => (a.nid ?? a.slot) === this.target && a.alive) || null : null; }`,
      `  targetActor() {
    if (this.target < 0) return null;
    const actors = G.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if ((a.nid ?? a.slot) === this.target && a.alive) return a;
    }
    return null;
  }`,
      replaceOnce,
      'CPU-12 replace targetActor G.actors.find closure with indexed loop'
    );
    code = applyIdempotent(
      code,
      `      const by = G.actors.find((a) => (a.nid ?? a.slot) === this.killer) || null;`,
      `      let by = null;
      for (let i = 0; i < G.actors.length; i++) {
        const a = G.actors[i];
        if ((a.nid ?? a.slot) === this.killer) { by = a; break; }
      }`,
      replaceOnce,
      'CPU-12 replace boss defeat killer G.actors.find closure with indexed loop'
    );
    code = applyIdempotent(
      code,
      `      c.model.update(dt, { speed: c.speed || 0, turn: 0, dead: c.dead });`,
      `      const cs = this._crabState || (this._crabState = { speed: 0, turn: 0, dead: false });
      cs.speed = c.speed || 0; cs.turn = 0; cs.dead = c.dead;
      c.model.update(dt, cs);`,
      replaceOnce,
      'CPU-12 reuse _crabState object in _crabVisuals'
    );
  }

  if (rel === 'src/game/player.js') {
    // CPU-14: Unroll navigation pressed/padPressed/touch cleanup without per-frame array allocations.
    code = applyIdempotent(
      code,
      `    for (const key of ['Space','KeyE','KeyF','KeyQ']) inp.pressed.delete(key);
    for (const i of [2,4,5,6,7,11]) inp.padPressed.delete(i);
    if (touch) for (const id of ['fire','jump','sub','special','squid']) touch.pressed.delete(id);`,
      `    inp.pressed.delete('Space'); inp.pressed.delete('KeyE'); inp.pressed.delete('KeyF'); inp.pressed.delete('KeyQ');
    inp.padPressed.delete(2); inp.padPressed.delete(4); inp.padPressed.delete(5); inp.padPressed.delete(6); inp.padPressed.delete(7); inp.padPressed.delete(11);
    if (touch) { touch.pressed.delete('fire'); touch.pressed.delete('jump'); touch.pressed.delete('sub'); touch.pressed.delete('special'); touch.pressed.delete('squid'); }`,
      replaceOnce,
      'CPU-14 unroll respawn navigation input cleanup in PlayerController'
    );
  }

  if (rel === 'src/ui/hud.js') {
    // CPU-15: Cache team colour hex conversion when team colour objects/RGB are unchanged.
    code = applyIdempotent(
      code,
      `    const t0 = f.teams && f.teams[0], t1 = f.teams && f.teams[1];
    const ca = toHex(t0 && t0.color, '#ff8a14'), cb = toHex(t1 && t1.color, '#2f5bff');`,
      `    const t0 = f.teams && f.teams[0], t1 = f.teams && f.teams[1];
    const c0 = t0 && t0.color, c1 = t1 && t1.color;
    let ca = L._caHex;
    if (!ca || L._c0Ref !== c0 || (c0 && typeof c0 === 'object' && (L._c0R !== c0.r || L._c0G !== c0.g || L._c0B !== c0.b))) {
      L._c0Ref = c0; if (c0 && typeof c0 === 'object') { L._c0R = c0.r; L._c0G = c0.g; L._c0B = c0.b; }
      ca = L._caHex = toHex(c0, '#ff8a14');
    }
    let cb = L._cbHex;
    if (!cb || L._c1Ref !== c1 || (c1 && typeof c1 === 'object' && (L._c1R !== c1.r || L._c1G !== c1.g || L._c1B !== c1.b))) {
      L._c1Ref = c1; if (c1 && typeof c1 === 'object') { L._c1R = c1.r; L._c1G = c1.g; L._c1B = c1.b; }
      cb = L._cbHex = toHex(c1, '#2f5bff');
    }`,
      replaceOnce,
      'CPU-15 cache team hex strings in HUD.update'
    );
  }

  if (rel === 'src/main.js') {
    // CPU-20: Reuse cached renderer quality profile in Game._frame.
    code = applyIdempotent(
      code,
      `    const shadowQuality = effectiveQuality(this.settings, this.mobile);`,
      `    const shadowQuality = this.R?.q || effectiveQuality(this.settings, this.mobile);`,
      replaceOnce,
      'CPU-20 reuse cached renderer quality profile in Game._frame'
    );
  }

  // Audited Wave 6/7 GPU transforms are appended after existing CPU/GPU owners.
  code = adaptReviewedWave67Gpu(rel, code, replaceOnce);

  // Network-coupled modules (match.js and netmatch.js) are transformed after adaptNetworkSource and adaptQueueNetworkUi
  // when running inside the multi-stage build pipeline (stage !== 'quality').
  if (stage !== 'quality') {
    if (rel === 'src/game/match.js') {
      // CPU-13: Keep actor/alive/radius reads inside every native pair iteration.
      // softPushActor invokes collision callbacks which may mutate the live roster,
      // radius, or alive state, append actors, reenter, or throw. Hoisting any of
      // those reads across a callback changes native collision semantics.
      const postNetBefore = `    // soft push between actors
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      if (!a.alive || !b.alive || (a.remote && b.remote)) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dz * dz;
      const r = PLAYER.radius * 1.7;
      if (d2 < r * r && Math.abs(dy) < 1.2 && d2 > 1e-5) {`;
      // Preserve the original loop, but keep the exact unique source guard.
      code = replaceOnce(code, postNetBefore, postNetBefore,
        'CPU-13 preserve live per-pair reads in Match soft-push loop');
    }

    if (rel === 'src/net/netmatch.js') {
      // CPU-17b: Pack sc, l, and rl in a single pass over this.byNid.values() without intermediate .filter/.map arrays.
      const exactBeforeDD = "    const a = [], sjEpochs = Object.create(null);\n    let sq = null, dr = null, wp = null, bw = null, rf = null, pg = null;\n    const simulationTick = Math.max(0, Math.round((G.time || 0) * 60));\n    for (const x of this.byNid.values()) if (publishActors && !x.remote) {\n      a.push(packActor(x));\n      if (Number.isSafeInteger(x.nid)) { const epoch = x._s3SuperJumpEpoch; sjEpochs[x.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0; }\n      const splashdown = packSplashdownSnapshot(x); if (splashdown) (pg || (pg = Object.create(null)))[x.nid] = splashdown;\n      const flick = packRollerPresentation(x, this, simulationTick);\n      if (flick) (rf || (rf = Object.create(null)))[x.nid] = flick;\n      const visual = packSquidrollSnapshot(x);\n      if (visual) (sq || (sq = Object.create(null)))[x.nid] = visual;\n      const dropRoll = packDropRollSnapshot(x);\n      if (dropRoll) (dr || (dr = Object.create(null)))[x.nid] = dropRoll;\n      const wr = x.weaponRunner, slosh = x.weapon?.kind === 'slosher' && Number.isFinite(wr?.slosh) && wr.slosh >= 0 ? Math.min(2, wr.slosh) : -1;\n      const sp = x.specialActive, phase = sp?.id === 'slam' ? ({ rise:1, hang:2, fall:3 }[sp.phase] || 0) : 0;\n      const slamT = phase && Number.isFinite(sp.t) ? Math.max(0, Math.min(4, sp.t)) : 0;\n      if (slosh >= 0 || phase) (wp || (wp = Object.create(null)))[x.nid] = [slosh, phase, slamT];\n      const windup = x.weapon?.kind === 'blaster' ? x.weaponRunner?.s3BlasterWindup : 0;\n      if (Number.isFinite(windup) && windup > 0) (bw || (bw = Object.create(null)))[x.nid] = Math.min(1, windup);\n    }\n    const msg = { k: 't', ts: r3(now()), a, gg: (publishActors ? packOwnerGear(this) : {}), gc: (publishActors ? packConditionalGear(this) : {}), gb: (publishActors ? packTransientGear(this, G.time) : {}), u: Math.round((G.time || 0)*60), sc: Object.fromEntries([...this.byNid.values()].filter(actor => !actor.remote).map(actor => [actor.nid, actor.specialCost()])), l: Object.fromEntries([...this.byNid.values()].filter(x => !x.remote).map(x => [x.nid, x.netLife ?? 0])) };\n    const wf = packWipeoutTimeline(this); if (wf) msg.wf = wf;\n    replayWipeoutConfirmations(this);\n    if (sq) msg.sq = sq;\n    if (dr) msg.dr = dr;\n    if (wp) msg.wp = wp;\n    if (pg) msg.pg = pg;\n    if (bw) msg.bw = bw;\n    if (rf) msg.rf = rf;\n    if (this.out.length) msg.r = 2;\n    const boss = this.match?.boss;\n    if (this.isHost && boss && boss.sim) { this.bossN = (this.bossN || 0) + 1; msg.B = boss.pack(this.bossN % 10 === 0); }\n    if (this.isHost && this.match) {\n      this.clockT -= TICK;\n      if (this.clockT <= 0) { this.clockT = 0.5; msg.c = [this.match.state, r2(this.match.time)]; }\n    }\n    msg.rl = Object.fromEntries([...this.byNid.values()].filter(x => !x.remote && dualiesNetworkAction(x)).map(x => {\n      // The action/direction helpers only read this actor's current runner.\n      // Keep this pass after gear and cost packing, with no cross-tick cache.\n      const nid = x.nid, action = dualiesNetworkAction(x);\n      const startup = action.startup > 1e-10 || action.startupDur > 0 && action.t <= 1e-10;\n      const row = {\n        token: action.token || 1,\n        phase: startup ? 'startup' : 'roll',\n        time: r3(startup ? Math.max(0, (action.startupDur || (4 / 60)) - action.startup) : action.t),\n        dur: r3(action.dur || 0.2),\n        ...(x.net?._remoteDodge && x.net._remoteDodge.token === action.token\n          && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)\n          ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,\n            startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }\n          : {})\n      };\n      const direction = dualiesNetworkDirection(x);\n      if (direction && Number.isFinite(direction.x) && Number.isFinite(direction.z)) row.dir = [r2(direction.x), r2(direction.z)];\n      return [nid, row];\n    }));\n    if (this.s.ownerClockVersion === 1) { msg.oc = 1; msg.ocm = this.cfg.id; }\n    msg.sjEpochs = sjEpochs;";
      const exactAfterDD = "    const a = [], sjEpochs = Object.create(null), sc = {}, l = {}, rl = {};\n    let sq = null, dr = null, wp = null, bw = null, rf = null, pg = null;\n    const simulationTick = Math.max(0, Math.round((G.time || 0) * 60));\n    for (const x of this.byNid.values()) {\n      if (x.remote) continue;\n      if (publishActors) {\n        a.push(packActor(x));\n        if (Number.isSafeInteger(x.nid)) { const epoch = x._s3SuperJumpEpoch; sjEpochs[x.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0; }\n        const splashdown = packSplashdownSnapshot(x); if (splashdown) (pg || (pg = Object.create(null)))[x.nid] = splashdown;\n        const flick = packRollerPresentation(x, this, simulationTick);\n        if (flick) (rf || (rf = Object.create(null)))[x.nid] = flick;\n        const visual = packSquidrollSnapshot(x);\n        if (visual) (sq || (sq = Object.create(null)))[x.nid] = visual;\n        const dropRoll = packDropRollSnapshot(x);\n        if (dropRoll) (dr || (dr = Object.create(null)))[x.nid] = dropRoll;\n        const wr = x.weaponRunner, slosh = x.weapon?.kind === 'slosher' && Number.isFinite(wr?.slosh) && wr.slosh >= 0 ? Math.min(2, wr.slosh) : -1;\n        const sp = x.specialActive, phase = sp?.id === 'slam' ? ({ rise:1, hang:2, fall:3 }[sp.phase] || 0) : 0;\n        const slamT = phase && Number.isFinite(sp.t) ? Math.max(0, Math.min(4, sp.t)) : 0;\n        if (slosh >= 0 || phase) (wp || (wp = Object.create(null)))[x.nid] = [slosh, phase, slamT];\n        const windup = x.weapon?.kind === 'blaster' ? x.weaponRunner?.s3BlasterWindup : 0;\n        if (Number.isFinite(windup) && windup > 0) (bw || (bw = Object.create(null)))[x.nid] = Math.min(1, windup);\n      }\n      sc[x.nid] = x.specialCost();\n      l[x.nid] = x.netLife ?? 0;\n      const action = dualiesNetworkAction(x);\n      if (action) {\n        const nid = x.nid;\n        const startup = action.startup > 1e-10 || action.startupDur > 0 && action.t <= 1e-10;\n        const row = {\n          token: action.token || 1,\n          phase: startup ? 'startup' : 'roll',\n          time: r3(startup ? Math.max(0, (action.startupDur || (4 / 60)) - action.startup) : action.t),\n          dur: r3(action.dur || 0.2),\n          ...(x.net?._remoteDodge && x.net._remoteDodge.token === action.token\n            && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)\n            ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,\n              startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }\n            : {})\n        };\n        const direction = dualiesNetworkDirection(x);\n        if (direction && Number.isFinite(direction.x) && Number.isFinite(direction.z)) row.dir = [r2(direction.x), r2(direction.z)];\n        rl[nid] = row;\n      }\n    }\n    const msg = { k: 't', ts: r3(now()), a, gg: (publishActors ? packOwnerGear(this) : {}), gc: (publishActors ? packConditionalGear(this) : {}), gb: (publishActors ? packTransientGear(this, G.time) : {}), u: Math.round((G.time || 0)*60), sc, l };\n    const wf = packWipeoutTimeline(this); if (wf) msg.wf = wf;\n    replayWipeoutConfirmations(this);\n    if (sq) msg.sq = sq;\n    if (dr) msg.dr = dr;\n    if (wp) msg.wp = wp;\n    if (pg) msg.pg = pg;\n    if (bw) msg.bw = bw;\n    if (rf) msg.rf = rf;\n    if (this.out.length) msg.r = 2;\n    const boss = this.match?.boss;\n    if (this.isHost && boss && boss.sim) { this.bossN = (this.bossN || 0) + 1; msg.B = boss.pack(this.bossN % 10 === 0); }\n    if (this.isHost && this.match) {\n      this.clockT -= TICK;\n      if (this.clockT <= 0) { this.clockT = 0.5; msg.c = [this.match.state, r2(this.match.time)]; }\n    }\n    msg.rl = rl;\n    if (this.s.ownerClockVersion === 1) { msg.oc = 1; msg.ocm = this.cfg.id; }\n    msg.sjEpochs = sjEpochs;";
      if (code.includes(exactBeforeDD)) {
        code = replaceOnce(code, exactBeforeDD, exactAfterDD, 'CPU-17b single-pass sc, l, and rl packing in NetMatch._sendTick (dd93aac2)');
      } else if (code.includes(exactAfterDD.replace('      this.clockT -= TICK;\n', ''))) {
        // The terminal elapsed-heartbeat adapter owns this one removed line.
        // Require the entire remaining packing body for idempotence.
      } else {
        const beforeBlockD8 = `    const a = [], sjEpochs = Object.create(null);
    let sq = null, dr = null, wp = null, bw = null, rf = null, pg = null;
    const simulationTick = Math.max(0, Math.round((G.time || 0) * 60));
    for (const x of this.byNid.values()) if (publishActors && !x.remote) {
      a.push(packActor(x));
      if (Number.isSafeInteger(x.nid)) { const epoch = x._s3SuperJumpEpoch; sjEpochs[x.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0; }
      const splashdown = packSplashdownSnapshot(x); if (splashdown) (pg || (pg = Object.create(null)))[x.nid] = splashdown;
      const flick = packRollerPresentation(x, this, simulationTick);
      if (flick) (rf || (rf = Object.create(null)))[x.nid] = flick;
      const visual = packSquidrollSnapshot(x);
      if (visual) (sq || (sq = Object.create(null)))[x.nid] = visual;
      const dropRoll = packDropRollSnapshot(x);
      if (dropRoll) (dr || (dr = Object.create(null)))[x.nid] = dropRoll;
      const wr = x.weaponRunner, slosh = x.weapon?.kind === 'slosher' && Number.isFinite(wr?.slosh) && wr.slosh >= 0 ? Math.min(2, wr.slosh) : -1;
      const sp = x.specialActive, phase = sp?.id === 'slam' ? ({ rise:1, hang:2, fall:3 }[sp.phase] || 0) : 0;
      const slamT = phase && Number.isFinite(sp.t) ? Math.max(0, Math.min(4, sp.t)) : 0;
      if (slosh >= 0 || phase) (wp || (wp = Object.create(null)))[x.nid] = [slosh, phase, slamT];
      const windup = x.weapon?.kind === 'blaster' ? x.weaponRunner?.s3BlasterWindup : 0;
      if (Number.isFinite(windup) && windup > 0) (bw || (bw = Object.create(null)))[x.nid] = Math.min(1, windup);
    }
    const msg = { k: 't', ts: r3(now()), a, gg: (publishActors ? packOwnerGear(this) : {}), gc: (publishActors ? packConditionalGear(this) : {}), gb: (publishActors ? packTransientGear(this, G.time) : {}), u: Math.round((G.time || 0)*60), sc: Object.fromEntries([...this.byNid.values()].filter(actor => !actor.remote).map(actor => [actor.nid, actor.specialCost()])), l: Object.fromEntries([...this.byNid.values()].filter(x => !x.remote).map(x => [x.nid, x.netLife ?? 0])) };
    const wf = packWipeoutTimeline(this); if (wf) msg.wf = wf;
    replayWipeoutConfirmations(this);
    if (sq) msg.sq = sq;
    if (dr) msg.dr = dr;
    if (wp) msg.wp = wp;
    if (pg) msg.pg = pg;
    if (bw) msg.bw = bw;
    if (rf) msg.rf = rf;
    if (this.out.length) msg.r = 2;
    const boss = this.match?.boss;
    if (this.isHost && boss && boss.sim) { this.bossN = (this.bossN || 0) + 1; msg.B = boss.pack(this.bossN % 10 === 0); }
    if (this.isHost && this.match) {
      this.clockT -= TICK;
      if (this.clockT <= 0) { this.clockT = 0.5; msg.c = [this.match.state, r2(this.match.time)]; }
    }
    msg.rl = Object.fromEntries([...this.byNid.values()].filter(x => !x.remote && dualiesNetworkAction(x)).map(x => [x.nid, {
      token: dualiesNetworkAction(x).token || 1,
      phase: (dualiesNetworkAction(x).startup > 1e-10 || dualiesNetworkAction(x).startupDur > 0 && dualiesNetworkAction(x).t <= 1e-10 ? 'startup' : 'roll'),
      time: r3(dualiesNetworkAction(x).startup > 1e-10 || dualiesNetworkAction(x).startupDur > 0 && dualiesNetworkAction(x).t <= 1e-10 ? Math.max(0, (dualiesNetworkAction(x).startupDur || (4 / 60)) - dualiesNetworkAction(x).startup) : dualiesNetworkAction(x).t),
      dur: r3(dualiesNetworkAction(x).dur || 0.2),
      ...(x.net?._remoteDodge && x.net._remoteDodge.token === dualiesNetworkAction(x).token
        && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)
        ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,
          startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }
        : {}),
      ...(dualiesNetworkDirection(x) && Number.isFinite(dualiesNetworkDirection(x).x) && Number.isFinite(dualiesNetworkDirection(x).z)
        ? { dir: [r2(dualiesNetworkDirection(x).x), r2(dualiesNetworkDirection(x).z)] }
        : {})
    }]));`;
        code = applyIdempotent(code, beforeBlockD8, exactAfterDD, replaceOnce, 'CPU-17b single-pass sc, l, and rl packing in NetMatch._sendTick (d88aa683)');
      }
    }
    if (rel === 'src/game/cameraRig.js') {
      // MOV-03: Remove redundant unconditional gc.updateProjectionMatrix() after projectionDirty guard.
      code = applyIdempotent(
        code,
        `    if (projectionDirty) gc.updateProjectionMatrix();
    gc.updateProjectionMatrix();
    gc.updateMatrixWorld();`,
        `    if (projectionDirty) gc.updateProjectionMatrix();
    gc.updateMatrixWorld();`,
        replaceOnce,
        'MOV-03 remove duplicate unconditional gameCam.updateProjectionMatrix in CameraRig.update'
      );
    }

    if (rel === 'src/game/player.js') {
      // MOV-04a: Reuse cached effective weapon descriptor in _assistTarget and computeAim instead of per-frame object spread.
      code = applyIdempotent(
        code,
        `    const fwd = cam.getWorldDirection(_fwd);
    const w = (a.weapon?.behaviorKind || a.weapon?.kind === 'catalog') ? {
      ...a.weapon,
      kind: ({
        stringer: 'charger',
        splatana: 'charger',
        brush: 'roller',
        brella: 'shooter',
      }[a.weapon.behaviorKind || a.weapon.modelKind] || a.weapon.behaviorKind || a.weapon.modelKind),
    } : a.weapon;`,
        `    const fwd = cam.getWorldDirection(_fwd);
    let w = a.weapon;
    if (w?.behaviorKind || w?.kind === 'catalog') {
      const bk = w.behaviorKind || w.modelKind;
      const rk = bk === 'stringer' || bk === 'splatana' ? 'charger' : bk === 'brush' ? 'roller' : bk === 'brella' ? 'shooter' : bk;
      const ew = this._effWeapon || (this._effWeapon = {});
      if (this._effWeaponSrc !== w) { this._effWeaponSrc = w; Object.assign(ew, w); }
      else { ew.range = w.range; ew.rangeMin = w.rangeMin; ew.rangeMax = w.rangeMax; ew.reticleRange = w.reticleRange; ew.combatRange = w.combatRange; }
      ew.kind = rk;
      w = ew;
    }`,
        replaceOnce,
        'MOV-04a reuse _effWeapon in PlayerController._assistTarget'
      );
      code = applyIdempotent(
        code,
        `    // is the crosshair point inside the weapon's effective range? (HUD reticle state)
    const w = (a.weapon?.behaviorKind || a.weapon?.kind === 'catalog') ? {
      ...a.weapon,
      kind: ({
        stringer: 'charger',
        splatana: 'charger',
        brush: 'roller',
        brella: 'shooter',
      }[a.weapon.behaviorKind || a.weapon.modelKind] || a.weapon.behaviorKind || a.weapon.modelKind),
    } : a.weapon;`,
        `    // is the crosshair point inside the weapon's effective range? (HUD reticle state)
    let w = a.weapon;
    if (w?.behaviorKind || w?.kind === 'catalog') {
      const bk = w.behaviorKind || w.modelKind;
      const rk = bk === 'stringer' || bk === 'splatana' ? 'charger' : bk === 'brush' ? 'roller' : bk === 'brella' ? 'shooter' : bk;
      const ew = this._effWeapon || (this._effWeapon = {});
      if (this._effWeaponSrc !== w) { this._effWeaponSrc = w; Object.assign(ew, w); }
      else { ew.range = w.range; ew.rangeMin = w.rangeMin; ew.rangeMax = w.rangeMax; ew.reticleRange = w.reticleRange; ew.combatRange = w.combatRange; }
      ew.kind = rk;
      w = ew;
    }`,
        replaceOnce,
        'MOV-04a reuse _effWeapon in PlayerController.computeAim'
      );
      // MOV-04b: Reuse _padMapAllies and eliminate per-tick direction/shoulder array allocations in respawn & pad map navigation.
      code = applyIdempotent(
        code,
        `    this.updatePadMapSelection(standard);
    const allies = G.actors.filter(o => o.team === a.team && o !== a);
    // Mobile's normal consume method closes the map. A deferred choice stays visible/cancellable.
    const touchIndex = touch?.jumpTarget ?? -1; if (touch) touch.jumpTarget = -1;
    for (let i = 0; i < 4; i++) {
      const key = 'Digit' + (i + 1), direction = [14,12,15,13][i];`,
        `    this.updatePadMapSelection(standard);
    const allies = this._padMapAllies || (this._padMapAllies = []); allies.length = 0;
    for (let i = 0; i < G.actors.length; i++) { const o = G.actors[i]; if (o.team === a.team && o !== a) allies.push(o); }
    // Mobile's normal consume method closes the map. A deferred choice stays visible/cancellable.
    const touchIndex = touch?.jumpTarget ?? -1; if (touch) touch.jumpTarget = -1;
    for (let i = 0; i < 4; i++) {
      const key = 'Digit' + (i + 1), direction = i === 0 ? 14 : i === 1 ? 12 : i === 2 ? 15 : 13;`,
        replaceOnce,
        'MOV-04b reuse _padMapAllies and branch direction lookup in updateRespawnNavigation'
      );
      code = applyIdempotent(
        code,
        `    if (!this.mapHeld || !standardPad) { this.padJumpTarget = null; this.padJumpIndex = -1; return; }
    const allies = G.actors.filter(o => o.team === a.team && o !== a);
    let selected = false;
    // W3C standard positions: D-pad left/up/right/down, LB/RB cycle Bubblers, right face = Nintendo A.
    const directions = [14, 12, 15, 13], confirm = 1;
    const bubblers = G.bigBubblerJumpTargets?.(a.team) || [];
    for (let i = 0; i < directions.length; i++) if (inp.padPressed.has(directions[i])) {
      this.padJumpTarget = i === 3 ? { spawn: true } : { actor: allies[i] || null };
      this._mapGyroYaw = this._mapGyroPitch = 0;
      this._mapGyroCursor = false; this.mapGyroTarget = null;
      selected = true; this.pendingRespawnJump = null; inp.padPressed.delete(directions[i]);
    }
    for (const [button, delta] of [[4, -1], [5, 1]]) if (inp.padPressed.has(button)) {
      const current = this.padJumpTarget?.bubblerIndex ?? (delta > 0 ? -1 : bubblers.length);
      const index = (current + delta + bubblers.length) % bubblers.length;
      this.padJumpTarget = bubblers.length ? { bubbler: bubblers[index], bubblerIndex: index } : null;
      this._mapGyroYaw = this._mapGyroPitch = 0;
      this._mapGyroCursor = false; this.mapGyroTarget = null;
      selected = true; this.pendingRespawnJump = null; inp.padPressed.delete(button);
    }`,
        `    if (!this.mapHeld || !standardPad) { this.padJumpTarget = null; this.padJumpIndex = -1; return; }
    const allies = this._padMapAllies || (this._padMapAllies = []); allies.length = 0;
    for (let i = 0; i < G.actors.length; i++) { const o = G.actors[i]; if (o.team === a.team && o !== a) allies.push(o); }
    let selected = false;
    // W3C standard positions: D-pad left/up/right/down, LB/RB cycle Bubblers, right face = Nintendo A.
    const confirm = 1;
    const bubblers = G.bigBubblerJumpTargets?.(a.team) || [];
    for (let i = 0; i < 4; i++) {
      const dirBtn = i === 0 ? 14 : i === 1 ? 12 : i === 2 ? 15 : 13;
      if (inp.padPressed.has(dirBtn)) {
        this.padJumpTarget = i === 3 ? { spawn: true } : { actor: allies[i] || null };
        this._mapGyroYaw = this._mapGyroPitch = 0;
        this._mapGyroCursor = false; this.mapGyroTarget = null;
        selected = true; this.pendingRespawnJump = null; inp.padPressed.delete(dirBtn);
      }
    }
    for (let s = 0; s < 2; s++) {
      const button = s === 0 ? 4 : 5, delta = s === 0 ? -1 : 1;
      if (inp.padPressed.has(button)) {
        const current = this.padJumpTarget?.bubblerIndex ?? (delta > 0 ? -1 : bubblers.length);
        const index = (current + delta + bubblers.length) % bubblers.length;
        this.padJumpTarget = bubblers.length ? { bubbler: bubblers[index], bubblerIndex: index } : null;
        this._mapGyroYaw = this._mapGyroPitch = 0;
        this._mapGyroCursor = false; this.mapGyroTarget = null;
        selected = true; this.pendingRespawnJump = null; inp.padPressed.delete(button);
      }
    }`,
        replaceOnce,
        'MOV-04b reuse _padMapAllies and unroll direction/shoulder loops in updatePadMapSelection'
      );
    }

    if (rel === 'src/game/actor.js') {
      // MOV-05: Reuse _stormIntent and preserve jumpPressed consumption on this.intent during Ink Storm hold.
      code = applyIdempotent(
        code,
        `    const stormHolding = isStormHolding(this);
    const intent = stormHolding ? { ...this.intent, fire: false, sub: false, special: false } : this.intent;`,
        `    const stormHolding = isStormHolding(this);
    let intent = this.intent;
    if (stormHolding) {
      const si = this._stormIntent || (this._stormIntent = { move: intent.move, squid: false, jump: false, jumpPressed: undefined, fire: false, sub: false, special: false });
      si.move = intent.move; si.squid = intent.squid; si.jump = intent.jump; si.jumpPressed = intent.jumpPressed;
      si.fire = false; si.sub = false; si.special = false;
      if (intent.jumpPressed !== undefined) intent.jumpPressed = false;
      intent = si;
    }`,
        replaceOnce,
        'MOV-05 reuse _stormIntent and clear this.intent.jumpPressed during Ink Storm hold'
      );
    }

    if (rel === 'src/game/bots.js') {
      // MOV-08a: Reuse _paintChoices, _paintChoicePool, _mates, and _triedGoals in BotMind._pickPaintGoal.
      code = applyIdempotent(
        code,
        `    const choices = [];
    const enemyPad = G.level.spawnPads[1 - a.team];
    const ownPad = G.level.spawnPads[a.team];
    const total = ownPad.distanceTo(enemyPad);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot);`,
        `    const choices = this._paintChoices || (this._paintChoices = []); choices.length = 0;
    const choicePool = this._paintChoicePool || (this._paintChoicePool = []);
    const enemyPad = G.level.spawnPads[1 - a.team];
    const ownPad = G.level.spawnPads[a.team];
    const total = ownPad.distanceTo(enemyPad);
    const mates = this._mates || (this._mates = []); mates.length = 0;
    for (let i = 0; i < G.actors.length; i++) { const o = G.actors[i]; if (o !== a && o.team === a.team && o.bot) mates.push(o); }`,
        replaceOnce,
        'MOV-08a reuse _paintChoices, _paintChoicePool, and _mates in BotMind._pickPaintGoal'
      );
      code = applyIdempotent(
        code,
        `      choices.push({ id, score });
    }
    this.goalTimer = 4 + Math.random() * 3;
    choices.sort((a, b) => b.score - a.score);
    // Try at most three distinct goals. A one-way drop or isolated height must
    // not trigger sixteen new paint scans on every simulation tick.
    const tried = new Set();`,
        `      let entry = choicePool[choices.length];
      if (!entry) entry = choicePool[choices.length] = { id: 0, score: 0 };
      entry.id = id; entry.score = score;
      choices.push(entry);
    }
    this.goalTimer = 4 + Math.random() * 3;
    choices.sort((a, b) => b.score - a.score);
    // Try at most three distinct goals. A one-way drop or isolated height must
    // not trigger sixteen new paint scans on every simulation tick.
    const tried = this._triedGoals || (this._triedGoals = new Set()); tried.clear();`,
        replaceOnce,
        'MOV-08a pool choice entries and reuse _triedGoals Set in BotMind._pickPaintGoal'
      );
    }

    // MOV-08b Character._updateSquid optimization remains excluded:
    // character-model work is paused pending explicit scope review.

    if (rel === 'src/game/inkFlightRuntime.js') {
      // CMB-04: capsuleEntry already bounds the segment with the actual hurtbox
      // and projectile radii. A terrain-radius + .25 prefilter rejects the
      // installed .675 squid hurtbox and caller-supplied larger hurtboxes.
      // Keep the native actor scan and its exact unique source guard.
      const nativeActorScan = `      for (const actor of G.actors) {
        if (p.ghost) break; // remote actor geometry cannot retire an owner-controlled head
        const friendly = actor.team === p.team;
        if (!actor.alive || actor === p.owner || (friendly && (actor.submerged || !Number.isFinite(p.fidelityFriendThrough)))) continue;
        this.base.set(actor.pos.x, actor.pos.y, actor.pos.z);
        const motion = coherentMotionStart(actor);`;
      code = replaceOnce(code, nativeActorScan, nativeActorScan,
        'CMB-04 preserve native shape-aware capsule scan');
    }

    if (rel === 'src/game/bots.js') {
      // CMB-06: dSq > awareness*awareness is not equivalent to native
      // distanceTo > awareness at IEEE-754 rounding boundaries. It also skips
      // custom distanceTo behavior. Keep the native distance and scan policy.
      const nativePerceptionScan = `    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      const d = e.pos.distanceTo(a.pos);
      if (d > aw) continue;`;
      code = replaceOnce(code, nativePerceptionScan, nativePerceptionScan,
        'CMB-06 preserve native perception distance semantics');
    }

    return code;
}
}

// Final Wave 3–5 pass runs after strict world/audio/UI queue adapters.
// Conditional misses retain those owners; they are not counted as applied.
export function adaptCombatWave345(rel, code, replaceOnce) {
    if (rel === 'src/world/level.js') {
      // LVL-01: Ternary hash clamping, scalar OBB test and scalar ground plane.
      code = applyWave345Compatible(
        code,
        `  _hxi(x) { return Math.max(0, Math.min(this.hw - 1, Math.floor((x - this.hx0) / this.hashCell))); }
  _hzi(z) { return Math.max(0, Math.min(this.hd - 1, Math.floor((z - this.hz0) / this.hashCell))); }`,
        `  _hxi(x) { const i = Math.floor((x - this.hx0) / this.hashCell), hi = this.hw - 1; return i <= 0 ? 0 : i >= hi ? (hi >= 0 ? hi : 0) : i; }
  _hzi(z) { const i = Math.floor((z - this.hz0) / this.hashCell), hi = this.hd - 1; return i <= 0 ? 0 : i >= hi ? (hi >= 0 ? hi : 0) : i; }`,
        replaceOnce,
        'LVL-01a ternary spatial-hash index clamping in Level._hxi and Level._hzi'
      );
      code = applyWave345Compatible(
        code,
        `  pointInBlock(b, p, pad = 0) {
    _v2.copy(p).sub(b.center);
    return Math.abs(_v2.dot(b.axes[0])) < b.half.x + pad &&
      Math.abs(_v2.dot(b.axes[1])) < b.half.y + pad &&
      Math.abs(_v2.dot(b.axes[2])) < b.half.z + pad;
  }`,
        `  pointInBlock(b, p, pad = 0) {
    const dx = p.x - b.center.x, dy = p.y - b.center.y, dz = p.z - b.center.z;
    _v2.x = dx; _v2.y = dy; _v2.z = dz;
    const a0 = b.axes[0], a1 = b.axes[1], a2 = b.axes[2];
    return Math.abs(dx * a0.x + dy * a0.y + dz * a0.z) < b.half.x + pad &&
      Math.abs(dx * a1.x + dy * a1.y + dz * a1.z) < b.half.y + pad &&
      Math.abs(dx * a2.x + dy * a2.y + dz * a2.z) < b.half.z + pad;
  }`,
        replaceOnce,
        'LVL-01b inline scalar OBB dot products in Level.pointInBlock'
      );
      code = applyWave345Compatible(
        code,
        `    for (const id of ids) {
      const b = this.blocks[id];
      if (!b.solid) continue;
      // intersect vertical line with the block's top face plane
      const n = b.axes[1];
      if (n.y < 0.5) continue;
      const top = _v.copy(b.center).addScaledVector(n, b.half.y);
      // plane: n·(p - top) = 0 → y = top.y - (n.x (x-top.x) + n.z (z-top.z)) / n.y
      const y = top.y - (n.x * (x - top.x) + n.z * (z - top.z)) / n.y;
      _v2.set(x, y - 0.01, z);
      if (y <= yMax && y > best && this.pointInBlock(b, _v2, 0.001)) best = y;
    }`,
        `    for (let i = 0; i < ids.length; i++) {
      const b = this.blocks[ids[i]];
      if (!b.solid) continue;
      // intersect vertical line with the block's top face plane
      const n = b.axes[1];
      if (n.y < 0.5) continue;
      const topX = b.center.x + n.x * b.half.y, topY = b.center.y + n.y * b.half.y, topZ = b.center.z + n.z * b.half.y;
      _v.x = topX; _v.y = topY; _v.z = topZ;
      // plane: n·(p - top) = 0 → y = top.y - (n.x (x-top.x) + n.z (z-top.z)) / n.y
      const y = topY - (n.x * (x - topX) + n.z * (z - topZ)) / n.y;
      if (y <= yMax && y > best) {
        _v2.set(x, y - 0.01, z);
        if (this.pointInBlock(b, _v2, 0.001)) best = y;
      }
    }`,
        replaceOnce,
        'LVL-01c scalar plane intersection preserving native support skin in Level.groundHeight'
      );
    }

    if (rel === 'src/game/physics.js') {
      // PHY-01: Scalar ray bounds and inlined OBB slab dot products in Physics.raycast and Physics.closestOnBlock.
      code = applyWave345Compatible(
        code,
        `    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    // Oriented blocks are enclosed by their original Level-generated AABBs.
    // Include a conservative epsilon, including at grazing endpoints.
    // Non-finite reach leaves this test inert rather than rejecting a hit.
    const ey = origin.y + dir.y * maxDist;
    const yLo = Math.min(origin.y, ey) - 1e-6;
    const yHi = Math.max(origin.y, ey) + 1e-6;
    const xLo = Math.min(origin.x, ex) - 1e-6, xHi = Math.max(origin.x, ex) + 1e-6;
    const zLo = Math.min(origin.z, ez) - 1e-6, zHi = Math.max(origin.z, ez) + 1e-6;
    const ids = candidates || this.level.queryBlocks(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez), this._ids);
    const blocks = this.level.blocks;
    let best = maxDist, bestK = -1, bestSign = 0, bestB = -1;
    for (let i = 0; i < ids.length; i++) {
      const b = blocks[ids[i]];
      if (!b.solid || (skipGrates && b.grate)) continue;
      // Most XZ-candidate blocks cannot overlap the ray vertically.
      // Optional bounds retain compatibility with partial/custom fixtures.
      if (b.aabbMin?.y > yHi || b.aabbMax?.y < yLo) continue;
      if (b.aabbMin && (b.aabbMin.x > xHi || b.aabbMax.x < xLo || b.aabbMin.z > zHi || b.aabbMax.z < zLo)) continue;
      // AABB precheck along the segment (cheap)
      _o.copy(origin).sub(b.center);
      let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;
      for (let k = 0; k < 3; k++) {
        const ax = b.axes[k];
        const o = _o.dot(ax), d = dir.dot(ax), h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;`,
        `    const ox0 = origin.x, oy0 = origin.y, oz0 = origin.z;
    const dx0 = dir.x, dy0 = dir.y, dz0 = dir.z;
    const ex = ox0 + dx0 * maxDist, ez = oz0 + dz0 * maxDist;
    // Oriented blocks are enclosed by their original Level-generated AABBs.
    // Include a conservative epsilon, including at grazing endpoints.
    // Non-finite reach leaves this test inert rather than rejecting a hit.
    const ey = oy0 + dy0 * maxDist;
    const minY = oy0 <= ey ? oy0 : (ey < oy0 ? ey : NaN), maxY = oy0 >= ey ? oy0 : (ey > oy0 ? ey : NaN);
    const minX = ox0 <= ex ? ox0 : (ex < ox0 ? ex : NaN), maxX = ox0 >= ex ? ox0 : (ex > ox0 ? ex : NaN);
    const minZ = oz0 <= ez ? oz0 : (ez < oz0 ? ez : NaN), maxZ = oz0 >= ez ? oz0 : (ez > oz0 ? ez : NaN);
    const yLo = minY - 1e-6, yHi = maxY + 1e-6;
    const xLo = minX - 1e-6, xHi = maxX + 1e-6;
    const zLo = minZ - 1e-6, zHi = maxZ + 1e-6;
    const ids = candidates || this.level.queryBlocks(minX, minZ, maxX, maxZ, this._ids);
    const blocks = this.level.blocks;
    let best = maxDist, bestK = -1, bestSign = 0, bestB = -1;
    for (let i = 0; i < ids.length; i++) {
      const b = blocks[ids[i]];
      if (!b.solid || (skipGrates && b.grate)) continue;
      // Most XZ-candidate blocks cannot overlap the ray vertically.
      // Optional bounds retain compatibility with partial/custom fixtures.
      if (b.aabbMin?.y > yHi || b.aabbMax?.y < yLo) continue;
      if (b.aabbMin && (b.aabbMin.x > xHi || b.aabbMax.x < xLo || b.aabbMin.z > zHi || b.aabbMax.z < zLo)) continue;
      // AABB precheck along the segment (cheap)
      const ox = ox0 - b.center.x, oy = oy0 - b.center.y, oz = oz0 - b.center.z;
      _o.x = ox; _o.y = oy; _o.z = oz;
      let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;
      for (let k = 0; k < 3; k++) {
        const ax = b.axes[k];
        const o = ox * ax.x + oy * ax.y + oz * ax.z, d = dx0 * ax.x + dy0 * ax.y + dz0 * ax.z, h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;`,
        replaceOnce,
        'PHY-01a scalar ray bounds and inlined OBB slab dot products in Physics.raycast'
      );
      code = applyWave345Compatible(
        code,
        `  closestOnBlock(b, p, out) {
    _o.copy(p).sub(b.center);
    out.copy(b.center);
    for (let k = 0; k < 3; k++) {
      const ax = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
      let d = _o.dot(ax);
      if (d > h) d = h; else if (d < -h) d = -h;
      out.addScaledVector(ax, d);
    }
    return out;
  }`,
        `  closestOnBlock(b, p, out) {
    const ox = p.x - b.center.x, oy = p.y - b.center.y, oz = p.z - b.center.z;
    _o.x = ox; _o.y = oy; _o.z = oz;
    let rx = b.center.x, ry = b.center.y, rz = b.center.z;
    for (let k = 0; k < 3; k++) {
      const ax = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
      let d = ox * ax.x + oy * ax.y + oz * ax.z;
      if (d > h) d = h; else if (d < -h) d = -h;
      rx += ax.x * d; ry += ax.y * d; rz += ax.z * d;
    }
    out.x = rx; out.y = ry; out.z = rz;
    return out;
  }`,
        replaceOnce,
        'PHY-01b scalar OBB projection in Physics.closestOnBlock'
      );
    }

    if (rel === 'src/game/motion/source-controller.js') {
      // The profile owner already keys its result by bank/name. Match those
      // keys before reusing it on a direction record, which is public/mutable.
      // Keep cadence/sample Map reads native: SourceBank exposes no clip-map
      // mutation epoch, and caching a clip can retain replaced/deleted entries.
      code = applyWave345Compatible(
        code,
        `   const item=(j?runClips:walkClips)[mode][i],p=locomotionProfile(this.bank,item.name);`,
        `   const item=(j?runClips:walkClips)[mode][i],bank=this.bank,name=item.name;
   const p=item._profBank===bank&&item._profName===name?item._prof:
    (item._prof=locomotionProfile(bank,name),item._profName=name,item._profBank=bank,item._prof);`,
        replaceOnce,
        'MOT-01a cache locomotionProfile by direction item, bank and name'
      );
    }

    if (rel === 'src/game/motion/squid-rig.js') {
      // MOT-02: Inline scalar 4x4/3x3 vertex deformation and bounding-sphere computation in SourceSquidRig.deformEyes.
      code = applyWave345Compatible(
        code,
        ` deformEyes(){
  // A connected surface must share the mantle/outline deformation across its center.
  // Retain separate-eye bone behavior for legacy geometry without this explicit tag.
  const data=this.eyeData;
  if(data.headIds){
   const p=this.eyeGeometry.attributes.position,n=this.eyeGeometry.attributes.normal;
   for(let k=0;k<3;k++)this.eyeHeadNormals[k].getNormalMatrix(this.matrices[data.headIds[k]]);
   for(let i=0;i<p.count;i++){
    const j=i*3,k=data.headSegments[i],t=data.headWeights[i];
    this.v.fromArray(this.eyeBase,j).applyMatrix4(this.matrices[data.headIds[k]]).multiplyScalar(1-t);
    this.eyeV2.fromArray(this.eyeBase,j).applyMatrix4(this.matrices[data.headIds[k+1]]);this.v.addScaledVector(this.eyeV2,t);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
    this.n.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeHeadNormals[k]).multiplyScalar(1-t);
    this.eyeN2.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeHeadNormals[k+1]);this.n.addScaledVector(this.eyeN2,t).normalize();n.setXYZ(i,this.n.x,this.n.y,this.n.z);
   }
   p.needsUpdate=true;n.needsUpdate=true;this.eyeGeometry.computeBoundingSphere();return;
  }
  this.eyeNormalMatrices ||= [new THREE.Matrix3(),new THREE.Matrix3()];
  for(let i=0;i<2;i++){this.eyeDeform[i].copy(this.matrices[this.index[i?'Sqd_eye_R':'Sqd_eye_L']]);this.eyeNormalMatrices[i].getNormalMatrix(this.eyeDeform[i]);}
  const p=this.eyeGeometry.attributes.position,n=this.eyeGeometry.attributes.normal;
  for(let i=0;i<p.count;i++){
   const j=i*3,side=this.eyeBase[j]>=0?0:1,m=this.eyeDeform[side];
   this.v.fromArray(this.eyeBase,j).applyMatrix4(m);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
   this.n.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeNormalMatrices[side]).normalize();n.setXYZ(i,this.n.x,this.n.y,this.n.z);
  }
  p.needsUpdate=true;n.needsUpdate=true;this.eyeGeometry.computeBoundingSphere();
 }`,
        ` deformEyes(){
  // A connected surface must share the mantle/outline deformation across its center.
  // Retain separate-eye bone behavior for legacy geometry without this explicit tag.
  const data=this.eyeData;
  const p=this.eyeGeometry.attributes.position,n=this.eyeGeometry.attributes.normal;
  const pa=p.array,na=n.array,base=this.eyeBase,norm=this.eyeNormals,count=p.count;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  let invalidVertex=false;
  if(data.headIds){
   const hIds=data.headIds,mats=this.matrices,hNorms=this.eyeHeadNormals;
   for(let k=0;k<3;k++)hNorms[k].getNormalMatrix(mats[hIds[k]]);
   const me0=mats[hIds[0]].elements,me1=mats[hIds[1]].elements,me2=mats[hIds[2]].elements;
   const ne0=hNorms[0].elements,ne1=hNorms[1].elements,ne2=hNorms[2].elements;
   const segs=data.headSegments,weights=data.headWeights;
   for(let i=0;i<count;i++){
    const j=i*3,k=segs[i],t=weights[i],s=1-t;
    const mA=k===0?me0:me1,mB=k===0?me1:me2;
    const bx=base[j],by=base[j+1],bz=base[j+2];
    const wA=1/(mA[3]*bx+mA[7]*by+mA[11]*bz+mA[15]);
    const ax=(mA[0]*bx+mA[4]*by+mA[8]*bz+mA[12])*wA*s;
    const ay=(mA[1]*bx+mA[5]*by+mA[9]*bz+mA[13])*wA*s;
    const az=(mA[2]*bx+mA[6]*by+mA[10]*bz+mA[14])*wA*s;
    const wB=1/(mB[3]*bx+mB[7]*by+mB[11]*bz+mB[15]);
    const b2x=(mB[0]*bx+mB[4]*by+mB[8]*bz+mB[12])*wB;
    const b2y=(mB[1]*bx+mB[5]*by+mB[9]*bz+mB[13])*wB;
    const b2z=(mB[2]*bx+mB[6]*by+mB[10]*bz+mB[14])*wB;
    const vx=ax+b2x*t,vy=ay+b2y*t,vz=az+b2z*t;
    pa[j]=vx;pa[j+1]=vy;pa[j+2]=vz;
    const px=pa[j],py=pa[j+1],pz=pa[j+2];
    if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz))invalidVertex=true;
    if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;if(pz<minZ)minZ=pz;if(pz>maxZ)maxZ=pz;
    const nA=k===0?ne0:ne1,nB=k===0?ne1:ne2;
    const ox=norm[j],oy=norm[j+1],oz=norm[j+2];
    const nax=(nA[0]*ox+nA[3]*oy+nA[6]*oz)*s,nay=(nA[1]*ox+nA[4]*oy+nA[7]*oz)*s,naz=(nA[2]*ox+nA[5]*oy+nA[8]*oz)*s;
    const nbx=nB[0]*ox+nB[3]*oy+nB[6]*oz,nby=nB[1]*ox+nB[4]*oy+nB[7]*oz,nbz=nB[2]*ox+nB[5]*oy+nB[8]*oz;
    let nx=nax+nbx*t,ny=nay+nby*t,nz=naz+nbz*t;
    const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1,invNl=1/nl;
    nx*=invNl;ny*=invNl;nz*=invNl;
    na[j]=nx;na[j+1]=ny;na[j+2]=nz;
   }
  }else{
   this.eyeNormalMatrices ||= [new THREE.Matrix3(),new THREE.Matrix3()];
   for(let i=0;i<2;i++){this.eyeDeform[i].copy(this.matrices[this.index[i?'Sqd_eye_R':'Sqd_eye_L']]);this.eyeNormalMatrices[i].getNormalMatrix(this.eyeDeform[i]);}
   const me0=this.eyeDeform[0].elements,me1=this.eyeDeform[1].elements;
   const ne0=this.eyeNormalMatrices[0].elements,ne1=this.eyeNormalMatrices[1].elements;
   for(let i=0;i<count;i++){
    const j=i*3,bx=base[j],by=base[j+1],bz=base[j+2],side=bx>=0?0:1;
    const mA=side===0?me0:me1,nA=side===0?ne0:ne1;
    const wA=1/(mA[3]*bx+mA[7]*by+mA[11]*bz+mA[15]);
    pa[j]=(mA[0]*bx+mA[4]*by+mA[8]*bz+mA[12])*wA;
    pa[j+1]=(mA[1]*bx+mA[5]*by+mA[9]*bz+mA[13])*wA;
    pa[j+2]=(mA[2]*bx+mA[6]*by+mA[10]*bz+mA[14])*wA;
    const px=pa[j],py=pa[j+1],pz=pa[j+2];
    if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz))invalidVertex=true;
    if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;if(pz<minZ)minZ=pz;if(pz>maxZ)maxZ=pz;
    const ox=norm[j],oy=norm[j+1],oz=norm[j+2];
    let nx=nA[0]*ox+nA[3]*oy+nA[6]*oz,ny=nA[1]*ox+nA[4]*oy+nA[7]*oz,nz=nA[2]*ox+nA[5]*oy+nA[8]*oz;
    const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1,invNl=1/nl;
    na[j]=nx*invNl;na[j+1]=ny*invNl;na[j+2]=nz*invNl;
   }
  }
  p.needsUpdate=true;n.needsUpdate=true;
  // Preserve native empty/invalid, morph-target and custom bounds owners.
  if(count>0&&!invalidVertex&&!this.eyeGeometry.morphAttributes.position?.length&&
     this.eyeGeometry.computeBoundingSphere===THREE.BufferGeometry.prototype.computeBoundingSphere&&
     Number.isFinite(minX)&&Number.isFinite(maxX)&&Number.isFinite(minY)&&Number.isFinite(maxY)&&Number.isFinite(minZ)&&Number.isFinite(maxZ)){
   let sphere=this.eyeGeometry.boundingSphere;
   if(!sphere)sphere=this.eyeGeometry.boundingSphere=new THREE.Sphere();
   const cx=(minX+maxX)*0.5,cy=(minY+maxY)*0.5,cz=(minZ+maxZ)*0.5;
   sphere.center.set(cx,cy,cz);
   let maxR2=0;
   for(let j=0,end=count*3;j<end;j+=3){
    const dx=cx-pa[j],dy=cy-pa[j+1],dz=cz-pa[j+2],d2=dx*dx+dy*dy+dz*dz;
    if(d2>maxR2)maxR2=d2;
   }
   sphere.radius=Math.sqrt(maxR2);
  }else this.eyeGeometry.computeBoundingSphere();
 }`,
        replaceOnce,
        'MOT-02 inline scalar vertex deformation and bounding-sphere computation in SourceSquidRig.deformEyes'
      );
    }

    if (rel === 'src/game/motion/retarget.js') {
      // MOT-03a: Normalize on scratch quaternion before copying to bone.quaternion in setBoneWorld, applyAccessories, and liftFreeFoot to halve onQuaternionChange Euler sync callbacks.
      code = applyWave345Compatible(
        code,
        `  bone.quaternion.copy(this.q2).normalize();`,
        `  this.q2.normalize();bone.quaternion.copy(this.q2);`,
        replaceOnce,
        'MOT-03a normalize on q2 before bone.quaternion.copy in HumanRetarget.setBoneWorld'
      );
      // MOT-03b: Inline scalar quaternion premultiplication chain in HumanRetarget._kidQuat.
      code = applyWave345Compatible(
        code,
        ` _kidQuat(bone,outQ){
  const c=this.character;outQ.identity();
  for(let x=bone;x&&x!==c.kid;x=x.parent)outQ.premultiply(x.quaternion);
  return outQ;
 }`,
        ` _kidQuat(bone,outQ){
  const kid=this.character.kid;
  let qx=0,qy=0,qz=0,qw=1;
  for(let x=bone;x&&x!==kid;x=x.parent){
   const q=x.quaternion,ax=q._x,ay=q._y,az=q._z,aw=q._w;
   const nx=ax*qw+aw*qx+ay*qz-az*qy,ny=ay*qw+aw*qy+az*qx-ax*qz,nz=az*qw+aw*qz+ax*qy-ay*qx,nw=aw*qw-ax*qx-ay*qy-az*qz;
   qx=nx;qy=ny;qz=nz;qw=nw;
  }
  outQ._x=qx;outQ._y=qy;outQ._z=qz;outQ._w=qw;outQ._onChangeCallback();
  return outQ;
 }`,
        replaceOnce,
        'MOT-03b inline scalar quaternion premultiplication in HumanRetarget._kidQuat'
      );
      code = applyWave345Compatible(
        code,
        `   this.q2.invert().multiply(this.q);e.bone.quaternion.copy(this.q2).normalize();`,
        `   this.q2.invert().multiply(this.q).normalize();e.bone.quaternion.copy(this.q2);`,
        replaceOnce,
        'MOT-03c normalize on q2 before bone.quaternion.copy in HumanRetarget.applyAccessories'
      );
      code = applyWave345Compatible(
        code,
        `  f.limb.end.quaternion.copy(this.ccdParent.invert().multiply(f.endQ)).normalize();`,
        `  this.ccdParent.invert().multiply(f.endQ).normalize();f.limb.end.quaternion.copy(this.ccdParent);`,
        replaceOnce,
        'MOT-03d normalize on ccdParent before bone.quaternion.copy in HumanRetarget.liftFreeFoot'
      );
      code = applyWave345Compatible(
        code,
        `   f.limb.up.updateWorldMatrix(true,true);f.actual.setFromMatrixPosition(f.bone.matrixWorld);f.actual.add(f.offset);`,
        `   f.limb.up.updateWorldMatrix(false,true);f.actual.setFromMatrixPosition(f.bone.matrixWorld);f.actual.add(f.offset);`,
        replaceOnce,
        'MOT-03e skip redundant parent chain updateWorldMatrix on limb.up in HumanRetarget.ground'
      );
    }

    if (rel === 'src/game/motion/root-hair.js') {
      // MOT-04: Inline scalar head/parent quaternion chains, reuse headInv across chains, and normalize on delta before copying to bone.quaternion in RootHairInertia.update.
      code = applyWave345Compatible(
        code,
        `  const c=this.c;this.head.identity();for(let x=c.bones.head;x&&x!==c.kid;x=x.parent)this.head.premultiply(x.quaternion);this.q.copy(this.head).invert();this.axis.set(0,rootTurnRate,0).applyQuaternion(this.q);`,
        `  const c=this.c,kid=c.kid;
  let hqx=0,hqy=0,hqz=0,hqw=1;
  for(let x=c.bones.head;x&&x!==kid;x=x.parent){
   const q=x.quaternion,ax=q._x,ay=q._y,az=q._z,aw=q._w;
   const nx=ax*hqw+aw*hqx+ay*hqz-az*hqy,ny=ay*hqw+aw*hqy+az*hqx-ax*hqz,nz=az*hqw+aw*hqz+ax*hqy-ay*hqx,nw=aw*hqw-ax*hqx-ay*hqy-az*hqz;
   hqx=nx;hqy=ny;hqz=nz;hqw=nw;
  }
  this.head._x=hqx;this.head._y=hqy;this.head._z=hqz;this.head._w=hqw;
  const headInv=this._headInv||(this._headInv=new THREE.Quaternion());
  headInv._x=-hqx;headInv._y=-hqy;headInv._z=-hqz;headInv._w=hqw;
  this.q._x=-hqx;this.q._y=-hqy;this.q._z=-hqz;this.q._w=hqw;
  this.axis.set(0,rootTurnRate,0).applyQuaternion(this.q);`,
        replaceOnce,
        'MOT-04a inline scalar head quaternion chain and cache headInv in RootHairInertia.update'
      );
      code = applyWave345Compatible(
        code,
        `   this.q.copy(this.head).multiply(this.delta).multiply(this.delta.copy(this.head).invert());
   if(e.bone.parent===c.bones.head)this.parent.copy(this.head);else{this.parent.identity();for(let x=e.bone.parent;x&&x!==c.kid;x=x.parent)this.parent.premultiply(x.quaternion);}
   this.delta.copy(this.parent).invert().multiply(this.q).multiply(this.parent);
   e.bone.quaternion.premultiply(this.delta).normalize();`,
        `   this.q.copy(this.head).multiply(this.delta).multiply(headInv);
   if(e.bone.parent===c.bones.head){this.parent._x=hqx;this.parent._y=hqy;this.parent._z=hqz;this.parent._w=hqw;}
   else{
    let pqx=0,pqy=0,pqz=0,pqw=1;
    for(let x=e.bone.parent;x&&x!==kid;x=x.parent){
     const q=x.quaternion,ax=q._x,ay=q._y,az=q._z,aw=q._w;
     const nx=ax*pqw+aw*pqx+ay*pqz-az*pqy,ny=ay*pqw+aw*pqy+az*pqx-ax*pqz,nz=az*pqw+aw*pqz+ax*pqy-ay*pqx,nw=aw*pqw-ax*pqx-ay*pqy-az*pqz;
     pqx=nx;pqy=ny;pqz=nz;pqw=nw;
    }
    this.parent._x=pqx;this.parent._y=pqy;this.parent._z=pqz;this.parent._w=pqw;
   }
   this.delta.copy(this.parent).invert().multiply(this.q).multiply(this.parent).multiply(e.bone.quaternion).normalize();
   e.bone.quaternion.copy(this.delta);`,
        replaceOnce,
        'MOT-04b inline scalar parent quaternion chain and normalize on delta before bone.quaternion.copy in RootHairInertia.update'
      );
    }

    if (rel === 'src/game/character.js') {
      // CHR-01a: Inline scalar quaternion-vector rotation and quaternion premultiplication in Character._kidXform.
      code = applyWave345Compatible(
        code,
        `  _kidXform(bone, pos, quat) {
    pos.set(0, 0, 0); quat.identity();
    let o = bone;
    while (o && o !== this.kid) { pos.applyQuaternion(o.quaternion).add(o.position); quat.premultiply(o.quaternion); o = o.parent; }
    return pos;
  }`,
        `  _kidXform(bone, pos, quat) {
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0, qw = 1;
    const kid = this.kid;
    let o = bone;
    while (o && o !== kid) {
      const q = o.quaternion, ax = q._x, ay = q._y, az = q._z, aw = q._w;
      const p = o.position;
      const tx = 2 * (ay * pz - az * py), ty = 2 * (az * px - ax * pz), tz = 2 * (ax * py - ay * px);
      px = px + aw * tx + ay * tz - az * ty;
      py = py + aw * ty + az * tx - ax * tz;
      pz = pz + aw * tz + ax * ty - ay * tx;
      px += p.x; py += p.y; pz += p.z;
      const nx = ax * qw + aw * qx + ay * qz - az * qy;
      const ny = ay * qw + aw * qy + az * qx - ax * qz;
      const nz = az * qw + aw * qz + ax * qy - ay * qx;
      const nw = aw * qw - ax * qx - ay * qy - az * qz;
      qx = nx; qy = ny; qz = nz; qw = nw;
      o = o.parent;
    }
    pos.x = px; pos.y = py; pos.z = pz;
    quat._x = qx; quat._y = qy; quat._z = qz; quat._w = qw;
    quat._onChangeCallback();
    return pos;
  }`,
        replaceOnce,
        'CHR-01a inline scalar ancestor transform chain in Character._kidXform'
      );
    }

    if (rel === 'src/world/paint.js') {
      // PNT-01: Eliminate per-call draw closure in _emitGrowth and hoist paintShapeSeed + unroll 4-vertex writes in _pushQuad.
      code = applyWave345Compatible(
        code,
        `  _emitGrowth(g, tn, dT, dripOnly) {
    const draw = (f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode) => {
      if (!g.netOrderId) { this._pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode); return; }
      const count = this._paintOrderRuns(f, g.netOrderId, u0, u1, v0, v1), runs = this._paintOrderRunScratch;
      for (let i = 0; i < count; i++) { const at = i * 4;
        this._pushQuad(f, runs[at], runs[at + 1], runs[at + 2], runs[at + 3], lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode);
      }
    };
    const E = g.entries, R = g.R, kind = g.kind;
    const entryStride = g.entryStride === 8 ? 8 : 7;
    const cachedProjection = entryStride === 8 && Object.is(g.entryRadius, R);
    const reachK = REACH[kind];
    for (let i = 0; i < E.length; i += entryStride) {
      const f = E[i], lu = E[i + 1], lv = E[i + 2], dn = E[i + 3], sdu = E[i + 4], sdv = E[i + 5], sa = E[i + 6];
      if (dn >= R) continue;
      const rr = cachedProjection ? E[i + 7] : Math.sqrt(R * R - dn * dn);
      if (dripOnly) {
        if (!f.wall || rr < R * 0.3) continue;
        draw(f, lu - rr * 0.95, lu + rr * 0.95, lv - rr * DRIP_REACH, lv - rr * 0.3, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 1);
      } else {
        const ext = rr * (reachK + 1.4 * (kind === 14 ? Math.max(0, sa) : sa));
        const down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;
        draw(f, lu - ext, lu + ext, lv - Math.max(ext, down), lv + ext, lu, lv, dn, R, g.team, g.seed, kind, sdu, sdv, sa, tn, dT, 0);
      }
    }
  }`,
        `  _emitGrowth(g, tn, dT, dripOnly) {
    const E = g.entries, R = g.R, kind = g.kind;
    const entryStride = g.entryStride === 8 ? 8 : 7;
    const cachedProjection = entryStride === 8 && Object.is(g.entryRadius, R);
    const reachK = REACH[kind];
    for (let i = 0; i < E.length; i += entryStride) {
      const f = E[i], lu = E[i + 1], lv = E[i + 2], dn = E[i + 3], sdu = E[i + 4], sdv = E[i + 5], sa = E[i + 6];
      if (dn >= R) continue;
      const rr = cachedProjection ? E[i + 7] : Math.sqrt(R * R - dn * dn);
      let u0, u1, v0, v1, mode;
      if (dripOnly) {
        if (!f.wall || rr < R * 0.3) continue;
        u0 = lu - rr * 0.95; u1 = lu + rr * 0.95; v0 = lv - rr * DRIP_REACH; v1 = lv - rr * 0.3; mode = 1;
      } else {
        const ext = rr * (reachK + 1.4 * (kind === 14 ? Math.max(0, sa) : sa));
        const down = f.wall && g.dripDur ? rr * DRIP_REACH : 0;
        u0 = lu - ext; u1 = lu + ext; v0 = lv - Math.max(ext, down); v1 = lv + ext; mode = 0;
      }
      // Match the original draw argument/property order after each entry.
      const team = g.team, seed = g.seed;
      if (!g.netOrderId) {
        this._pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode);
      } else {
        const count = this._paintOrderRuns(f, g.netOrderId, u0, u1, v0, v1), runs = this._paintOrderRunScratch;
        for (let r = 0; r < count; r++) {
          const at = r * 4;
          this._pushQuad(f, runs[at], runs[at + 1], runs[at + 2], runs[at + 3], lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, mode);
        }
      }
    }
  }`,
        replaceOnce,
        'PNT-01a inline draw closure in PaintSystem._emitGrowth'
      );
      code = applyWave345Compatible(
        code,
        `    for (let c = 0; c < 4; c++) {
      const vi = q * 4 + c;
      this.aLocal[vi * 3 + 2] = dn;
      this.aSplat[vi * 4] = R; this.aSplat[vi * 4 + 1] = team; this.aSplat[vi * 4 + 2] = seed; this.aSplat[vi * 4 + 3] = flags;
      this.aStretch[vi * 3] = sdu; this.aStretch[vi * 3 + 1] = sdv; this.aStretch[vi * 3 + 2] = sa;
      this.aGrow[vi * 4] = tn; this.aGrow[vi * 4 + 1] = dT; this.aGrow[vi * 4 + 2] = dripOnly; this.aGrow[vi * 4 + 3] = paintShapeSeed(seed);
    }`,
        `    const shapeSeed = paintShapeSeed(seed), aLocal = this.aLocal, aSplat = this.aSplat, aStretch = this.aStretch, aGrow = this.aGrow, sp = q * 16;
    aLocal[local + 2] = dn; aLocal[local + 5] = dn; aLocal[local + 8] = dn; aLocal[local + 11] = dn;
    aSplat[sp] = R; aSplat[sp + 1] = team; aSplat[sp + 2] = seed; aSplat[sp + 3] = flags;
    aSplat[sp + 4] = R; aSplat[sp + 5] = team; aSplat[sp + 6] = seed; aSplat[sp + 7] = flags;
    aSplat[sp + 8] = R; aSplat[sp + 9] = team; aSplat[sp + 10] = seed; aSplat[sp + 11] = flags;
    aSplat[sp + 12] = R; aSplat[sp + 13] = team; aSplat[sp + 14] = seed; aSplat[sp + 15] = flags;
    aStretch[local] = sdu; aStretch[local + 1] = sdv; aStretch[local + 2] = sa;
    aStretch[local + 3] = sdu; aStretch[local + 4] = sdv; aStretch[local + 5] = sa;
    aStretch[local + 6] = sdu; aStretch[local + 7] = sdv; aStretch[local + 8] = sa;
    aStretch[local + 9] = sdu; aStretch[local + 10] = sdv; aStretch[local + 11] = sa;
    aGrow[sp] = tn; aGrow[sp + 1] = dT; aGrow[sp + 2] = dripOnly; aGrow[sp + 3] = shapeSeed;
    aGrow[sp + 4] = tn; aGrow[sp + 5] = dT; aGrow[sp + 6] = dripOnly; aGrow[sp + 7] = shapeSeed;
    aGrow[sp + 8] = tn; aGrow[sp + 9] = dT; aGrow[sp + 10] = dripOnly; aGrow[sp + 11] = shapeSeed;
    aGrow[sp + 12] = tn; aGrow[sp + 13] = dT; aGrow[sp + 14] = dripOnly; aGrow[sp + 15] = shapeSeed;`,
        replaceOnce,
        'PNT-01b hoist paintShapeSeed and unroll 4-vertex writes in PaintSystem._pushQuad'
      );
    }

    if (rel === 'src/fx/fx.js') {
      // FX-01a: Hoist _qualityDropSource and _qualityDropGeneration outside the per-droplet attribute write loop in FX._updateDrops.
      code = applyWave345Compatible(
        code,
        `    // --- write instance attributes ---
    const aP = this.dGeo.attributes.aPosR.array, aV = this.dGeo.attributes.aVelS.array;
    for (let i = 0; i < this.dN; i++) {
      const i3 = i * 3, i4 = i * 4, i8 = i * 8;
      const size = A[i8], age = A[i8 + 1], life = A[i8 + 2];
      const source = this._qualityDropSource?.[i];
      const linked = source && !source._qualityDead && source._qualityGeneration === this._qualityDropGeneration[i];`,
        `    // --- write instance attributes ---
    const aP = this.dGeo.attributes.aPosR.array, aV = this.dGeo.attributes.aVelS.array;
    const qDropSrc = this._qualityDropSource, qDropGen = this._qualityDropGeneration;
    for (let i = 0; i < this.dN; i++) {
      const i3 = i * 3, i4 = i * 4, i8 = i * 8;
      const size = A[i8], age = A[i8 + 1], life = A[i8 + 2];
      const source = qDropSrc ? qDropSrc[i] : null;
      const linked = source && !source._qualityDead && source._qualityGeneration === qDropGen[i];`,
        replaceOnce,
        'FX-01a hoist _qualityDropSource and _qualityDropGeneration in FX._updateDrops'
      );
      // FX-01b: Hoist _netSource and _netGeneration outside the per-sprite attribute write loop in FX._updateSprites.
      code = applyWave345Compatible(
        code,
        `    for (let i = 0; i < pool.n; i++) {
      const x = i * 14, i3 = i * 3, i4 = i * 4;
      const age = X[x + 2], life = X[x + 3];
      const t = age / life;
      const size = X[x] + (X[x + 1] - X[x]) * easeOut(t);
      const fi = X[x + 10] > 0 ? Math.min(1, age / X[x + 10]) : 1;
      const fo = X[x + 13] > 0 ? Math.min(1, (life - age) / X[x + 13]) : (additive ? (1 - t) : (1 - t * t));
      const a = X[x + 4] * fi * fo;
      aPS[i4] = P[i3]; aPS[i4 + 1] = P[i3 + 1]; aPS[i4 + 2] = P[i3 + 2]; aPS[i4 + 3] = size;
      const source = pool._netSource?.[i];
      if (source) {
        if (source._qualityDead || source._qualityGeneration !== pool._netGeneration[i]) { aPS[i4 + 3] = 0; }
        else { aPS[i4] = source.pos.x; aPS[i4 + 1] = source.pos.y; aPS[i4 + 2] = source.pos.z; }
      }`,
        `    const netSrc = pool._netSource, netGen = pool._netGeneration;
    for (let i = 0; i < pool.n; i++) {
      const x = i * 14, i3 = i * 3, i4 = i * 4;
      const age = X[x + 2], life = X[x + 3];
      const t = age / life;
      const size = X[x] + (X[x + 1] - X[x]) * easeOut(t);
      const fi = X[x + 10] > 0 ? Math.min(1, age / X[x + 10]) : 1;
      const fo = X[x + 13] > 0 ? Math.min(1, (life - age) / X[x + 13]) : (additive ? (1 - t) : (1 - t * t));
      const a = X[x + 4] * fi * fo;
      aPS[i4] = P[i3]; aPS[i4 + 1] = P[i3 + 1]; aPS[i4 + 2] = P[i3 + 2]; aPS[i4 + 3] = size;
      const source = netSrc ? netSrc[i] : null;
      if (source) {
        if (source._qualityDead || source._qualityGeneration !== netGen[i]) { aPS[i4 + 3] = 0; }
        else { aPS[i4] = source.pos.x; aPS[i4 + 1] = source.pos.y; aPS[i4 + 2] = source.pos.z; }
      }`,
        replaceOnce,
        'FX-01b hoist _netSource and _netGeneration in FX._updateSprites'
      );
    }

    if (rel === 'src/game/minimap.js') {
      // MAP-01a: Hoist isNative outside the per-pixel halo loop in Minimap._drawInk.
      code = applyWave345Compatible(
        code,
        `    for (let _ry = ry0; _ry < ry1; _ry++) {
      const _row = _ry * W;
      for (let i = _row + rx0; i < _row + rx1; i++) {
      const k = cell[i];
      if (k < 0) { al[i] = 0; continue; }
      if (this.level.native) {
        const team = grid[k]; al[i] = team ? 1 : 0; tm[i] = team; tt[i] = team || 1;
        continue;
      }`,
        `    const _isNative = !!this.level.native;
    for (let _ry = ry0; _ry < ry1; _ry++) {
      const _row = _ry * W, _rowEnd = _row + rx1;
      if (_isNative) {
        for (let i = _row + rx0; i < _rowEnd; i++) {
          const k = cell[i];
          if (k < 0) { al[i] = 0; continue; }
          const team = grid[k]; al[i] = team ? 1 : 0; tm[i] = team; tt[i] = team || 1;
        }
        continue;
      }
      for (let i = _row + rx0; i < _rowEnd; i++) {
      const k = cell[i];
      if (k < 0) { al[i] = 0; continue; }`,
        replaceOnce,
        'MAP-01a hoist _isNative outside per-pixel halo loop in Minimap._drawInk'
      );
      // MAP-01b: Hoist row index and byte offset outside the inner px loop in Minimap._drawInk while keeping exact adaptMinimapDirty anchor.
      code = applyWave345Compatible(
        code,
        `    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = py * W + px, o = i * 4, a = al[i];`,
        `    for (let py = y0; py < y1; py++) {
      let i = py * W + x0 - 1, o = i * 4;
      for (let px = x0; px < x1; px++) {
        i++; o += 4; const a = al[i];`,
        replaceOnce,
        'MAP-01b hoist row index and byte offset in Minimap._drawInk'
      );
    }


  // Lossless GPU upload/Uniform audit, 2026-10-29. Apply after the existing
  // GPU-22/07b adapters without changing any target-module ownership.

  if (rel === 'src/fx/screenfx.js') {
    // GPU-07c: Keep the aspect uniform and its CPU mirror exactly current, but
    // skip repeated work while the drawing-buffer dimensions are unchanged.
    code = applyIdempotent(
      code,
      `    this._aspect = 16 / 9;`,
      `    this._aspect = 16 / 9;
    this._iwAspectValid = false;`,
      replaceOnce, 'GPU-07c initialize aspect independently of the size cache'
    );
    code = applyIdempotent(
      code,
      `    if (W !== this._w || H !== this._h) { this._w = W; this._h = H; U.uRes.value.set(W, H); }
    this._aspect = W / Math.max(1, H);
    U.uAspect.value = this._aspect;`,
      `    if (W !== this._w || H !== this._h) {
      this._w = W; this._h = H; U.uRes.value.set(W, H);
      this._aspect = W / Math.max(1, H); U.uAspect.value = this._aspect;
      this._iwAspectValid = true;
    } else if (!this._iwAspectValid) {
      this._aspect = W / Math.max(1, H); U.uAspect.value = this._aspect;
      this._iwAspectValid = true;
    }`,
      replaceOnce, 'GPU-07c cache aspect only while drawing-buffer size is stable'
    );

    // GPU-07d: A fixed local team palette cannot change its 9 uniform RGB
    // values. Preserve all alpha-channel updates on every frame.
    code = applyIdempotent(
      code,
      `    this._w = 0; this._h = 0;`,
      `    this._w = 0; this._h = 0;
    this._iwTeamRgb = new Float64Array(6);
    this._iwTeamRgbValid = false;`,
      replaceOnce, 'GPU-07d initialize team RGB cache'
    );
    code = applyIdempotent(
      code,
      `  reset() {
    const s = this.s;`,
      `  reset() {
    this._iwTeamRgbValid = false;
    const s = this.s;`,
      replaceOnce, 'GPU-07d invalidate cache on reset'
    );
    const teamRgbBefore = `    if (local) {
      const own = this._teamColor(local.team), enemy = this._teamColor(local.enemyTeam);
      U.uLensColA.value.copy(enemy); U.uLensColB.value.copy(own);
      U.uEdgeInk.value.set(enemy.r, enemy.g, enemy.b, s.edgeInk);
      _c.copy(enemy).lerp(_cc.setRGB(0.55, 0.0, 0.04), 0.55);
      U.uHeart.value.set(_c.r, _c.g, _c.b, s.heart);
      U.uAura.value.set(own.r * 1.6, own.g * 1.6, own.b * 1.6, U.uAura.value.w);
      U.uSwim.value.set(own.r, own.g, own.b, s.swim);
      U.uSpeedTint.value.copy(own).lerp(WHITE, 0.6);
      U.uKill.value.set(own.r * 1.3, own.g * 1.3, own.b * 1.3, U.uKill.value.w);
      U.uShimmer.value.set(own.r + 0.3, own.g + 0.3, own.b + 0.3, s.shimmer);
      U.uCharge.value.set(own.r + 0.5, own.g + 0.5, own.b + 0.5, U.uCharge.value.w);
    }
    void alive;`;
    const teamRgbAfter = `    if (local) {
      const own = this._teamColor(local.team), enemy = this._teamColor(local.enemyTeam);
      const rgb = this._iwTeamRgb;
      if (!this._iwTeamRgbValid ||
          !Object.is(rgb[0], own.r) || !Object.is(rgb[1], own.g) || !Object.is(rgb[2], own.b) ||
          !Object.is(rgb[3], enemy.r) || !Object.is(rgb[4], enemy.g) || !Object.is(rgb[5], enemy.b)) {
        U.uLensColA.value.copy(enemy); U.uLensColB.value.copy(own);
        U.uEdgeInk.value.set(enemy.r, enemy.g, enemy.b, s.edgeInk);
        _c.copy(enemy).lerp(_cc.setRGB(0.55, 0.0, 0.04), 0.55);
        U.uHeart.value.set(_c.r, _c.g, _c.b, s.heart);
        U.uAura.value.set(own.r * 1.6, own.g * 1.6, own.b * 1.6, U.uAura.value.w);
        U.uSwim.value.set(own.r, own.g, own.b, s.swim);
        U.uSpeedTint.value.copy(own).lerp(WHITE, 0.6);
        U.uKill.value.set(own.r * 1.3, own.g * 1.3, own.b * 1.3, U.uKill.value.w);
        U.uShimmer.value.set(own.r + 0.3, own.g + 0.3, own.b + 0.3, s.shimmer);
        U.uCharge.value.set(own.r + 0.5, own.g + 0.5, own.b + 0.5, U.uCharge.value.w);
        rgb[0] = own.r; rgb[1] = own.g; rgb[2] = own.b;
        rgb[3] = enemy.r; rgb[4] = enemy.g; rgb[5] = enemy.b;
        this._iwTeamRgbValid = true;
      }
    } else this._iwTeamRgbValid = false;
    void alive;`;
    // The final pass follows the submitted-pass owner in current builds.
    // Keep both exact source epochs, and reject mixed/duplicate sites rather
    // than accidentally restoring color work for a dormant pass.
    const teamRgbEpochs = [
      { before: teamRgbBefore, after: teamRgbAfter },
      { before: teamRgbBefore.replace('if (local)', 'if (local && any)'),
        after: teamRgbAfter.replace('if (local)', 'if (local && any)') },
    ];
    let teamRgbEpoch = null, teamRgbSites = 0;
    for (const epoch of teamRgbEpochs) {
      const sites = code.split(epoch.before).length - 1 + code.split(epoch.after).length - 1;
      if (sites) teamRgbEpoch = epoch;
      teamRgbSites += sites;
    }
    if (teamRgbSites !== 1) throw new Error('INKWAVE GPU-07d team RGB source epoch: expected exactly one complete site');
    code = applyIdempotent(code, teamRgbEpoch.before, teamRgbEpoch.after,
      replaceOnce, 'GPU-07d skip unchanged team RGB while retaining live alpha');
    code = applyIdempotent(
      code,
      `    if (!a) { this.U.uLensColA.value.copy(enemy); this.U.uLensColB.value.copy(own); this.U.uEdgeInk.value.set(enemy.r, enemy.g, enemy.b, 0); }`,
      `    if (!a) { this._iwTeamRgbValid = false; this.U.uLensColA.value.copy(enemy); this.U.uLensColB.value.copy(own); this.U.uEdgeInk.value.set(enemy.r, enemy.g, enemy.b, 0); }`,
      replaceOnce, 'GPU-07d invalidate cache on standalone visual test'
    );
  }

  if (rel === 'src/world/decor.js') {
    // GPU-12c: Non-pulsing pads have a mathematically zero wave. Keep the
    // signed nonzero case unchanged if a mod injects an unusual pulse value.
    code = applyIdempotent(
      code,
      `  float wave = uPulse * smoothstep(0.09, 0.0, abs(r - uPulseT * 1.35)) * (1.0 - smoothstep(0.7, 1.35, uPulseT * 1.35));`,
      `  float wave = uPulse != 0.0 ? uPulse * smoothstep(0.09, 0.0, abs(r - uPulseT * 1.35)) * (1.0 - smoothstep(0.7, 1.35, uPulseT * 1.35)) : 0.0;`,
      replaceOnce, 'GPU-12c bypass inactive spawn-pad pulse wave ALU'
    );
    code = applyIdempotent(
      code,
      `      u.uTime.value = this.time; u.uPulse.value = p.pulse; u.uPulseT.value = p.pulseT;
      b.uTime.value = this.time; b.uPulse.value = p.pulse;`,
      `      u.uTime.value = this.time;
      if(u.uPulse.value !== p.pulse) u.uPulse.value = p.pulse;
      if(u.uPulseT.value !== p.pulseT) u.uPulseT.value = p.pulseT;
      b.uTime.value = this.time;
      if(b.uPulse.value !== p.pulse) b.uPulse.value = p.pulse;`,
      replaceOnce, 'GPU-12c skip identical pulse uniform writes without stale CPU state'
    );
  }

  if (rel === 'src/fx/fx.js') {
    // GPU-22b: Three.js clears update ranges after bufferSubData, but not
    // after first bufferData; clear the latter via a shared onUpload callback.
    code = applyIdempotent(
      code,
      `export class FX {`,
      `function clearGpu22UploadRanges() { this.clearUpdateRanges(); }
export class FX {`,
      replaceOnce, 'GPU-22b first buffer upload range cleanup helper'
    );
    code = applyIdempotent(
      code,
      `    const geo = makeQuadGeo(cap, [['aPosR', 4], ['aVelS', 4], ['aColA', 4]]);`,
      `    const geo = makeQuadGeo(cap, [['aPosR', 4], ['aVelS', 4], ['aColA', 4]]);
    geo.attributes.aColA.onUpload(clearGpu22UploadRanges);`,
      replaceOnce, 'GPU-22b clean initial drop static attribute upload ranges'
    );
    code = applyIdempotent(
      code,
      `    const geo = withInstanceAttrs(base, cap, [['aPosR', 4], ['aColA', 4], ['aMisc', 4], ['aAxis', 4]]);`,
      `    const geo = withInstanceAttrs(base, cap, [['aPosR', 4], ['aColA', 4], ['aMisc', 4], ['aAxis', 4]]);
    geo.attributes.aColA.onUpload(clearGpu22UploadRanges);
    geo.attributes.aAxis.onUpload(clearGpu22UploadRanges);`,
      replaceOnce, 'GPU-22b clean initial shell static attribute upload ranges'
    );
    code = applyWave345Compatible(
      code,
      `        for (const pending of attr.updateRanges) {
          first = Math.min(first, pending.start);
          last = Math.max(last, pending.start + pending.count);
        }`,
      `        // A removed shell tail must not force uploads beyond the live end.
        // Any later newly visible tail is marked dirty by the spawn path.
        for (const pending of attr.updateRanges) {
          if (pending.start >= S.n * 4) continue;
          first = Math.min(first, pending.start);
          last = Math.max(last, Math.min(S.n * 4, pending.start + pending.count));
        }`,
      replaceOnce, 'GPU-22b clamp pending shell transfers to live end'
    );
  }

  // ── Whole-Game GPU Shader & Pipeline Optimizations (Wave 9) ──
  if (rel === 'src/world/levelMaterial.js') {
    // GPU-LVL-01: Gate stone coping noise (2x vnoise + texlibMacro = 16 hashes/px) on cop > 0.0.
    // On patterns 0, 2, 3, 13, 15, 16, 23 (~80% of stage surfaces), cop is 0.0 on ~90% of interior pixels.
    code = applyWave345Compatible(
      code,
      `      vec3 stone = vec3(0.9, 0.885, 0.845) * (0.95 + 0.07 * vnoise(fu * 9.0) + 0.03 * vnoise(fu * 41.0));
      base = mix(base, stone * texlibMacro(wp + vWPos.y * 0.7), cop);
      rough = mix(rough, 0.72, cop);
      gTexStr *= 1.0 - 0.8 * cop;
      base *= 1.0 - 0.28 * groove;`,
      `      if (cop > 0.0) {
        vec3 stone = vec3(0.9, 0.885, 0.845) * (0.95 + 0.07 * vnoise(fu * 9.0) + 0.03 * vnoise(fu * 41.0));
        base = mix(base, stone * texlibMacro(wp + vWPos.y * 0.7), cop);
        rough = mix(rough, 0.72, cop);
        gTexStr *= 1.0 - 0.8 * cop;
      }
      base *= 1.0 - 0.28 * groove;`,
      replaceOnce,
      'GPU-LVL-01 gate stone coping noise and macro FBM on cop > 0.0'
    );
    // GPU-LVL-02: Gate 3rd floor-grime octave vnoise(wp * 1.3) on grime > 0.0 (~55% of floor pixels have grime == 0.0).
    code = applyWave345Compatible(
      code,
      `      float m1 = vnoise(wp * 0.09 + 5.3), m2 = vnoise(wp * 0.31 + 1.7), m3 = vnoise(wp * 1.3);
      float grime = smoothstep(0.52, 0.86, m1 * 0.65 + m2 * 0.35);
      base *= 1.0 - 0.075 * grime * (0.7 + 0.3 * m3);`,
      `      float m1 = vnoise(wp * 0.09 + 5.3), m2 = vnoise(wp * 0.31 + 1.7);
      float grime = smoothstep(0.52, 0.86, m1 * 0.65 + m2 * 0.35);
      if (grime > 0.0) {
        float m3 = vnoise(wp * 1.3);
        base *= 1.0 - 0.075 * grime * (0.7 + 0.3 * m3);
      }`,
      replaceOnce,
      'GPU-LVL-02 gate floor grime 3rd noise octave on grime > 0.0'
    );
    // GPU-LVL-03: Gate planter grass 4-octave fbm(fu * 6.0) (16 hashes/px) on bed > 0.0.
    code = applyWave345Compatible(
      code,
      `    float bed = smoothstep(0.24, 0.27, e) * step(0.5, vWNorm.y);
    vec3 grass = vec3(0.32, 0.55, 0.22) * (0.8 + 0.35 * fbm(fu * 6.0));
    base = mix(base, grass, bed);
    rough = mix(rough, 0.95, bed);
    gTexStr *= 1.0 - bed;`,
      `    float bed = smoothstep(0.24, 0.27, e) * step(0.5, vWNorm.y);
    if (bed > 0.0) {
      vec3 grass = vec3(0.32, 0.55, 0.22) * (0.8 + 0.35 * fbm(fu * 6.0));
      base = mix(base, grass, bed);
      rough = mix(rough, 0.95, bed);
      gTexStr *= 1.0 - bed;
    }`,
      replaceOnce,
      'GPU-LVL-03 gate planter grass 4-octave fbm on bed > 0.0'
    );
    // GPU-LVL-04: Gate container-yard asphalt marking wear vnoise(wp * 3.0) on active lane/hatch/border/bay mask.
    code = applyWave345Compatible(
      code,
      `      float wear = 0.9 + 0.1 * smoothstep(0.2, 0.5, vnoise(wp * 3.0));
      float paintM = clamp(lane + hatch * 0.9 + border, 0.0, 1.0) * wear;
      base = mix(base, vec3(0.95, 0.74, 0.18), paintM);
      base = mix(base, vec3(0.93, 0.93, 0.9), bay * wear);
      rough = mix(rough, 0.7, max(paintM, bay));`,
      `      float rawPaintM = clamp(lane + hatch * 0.9 + border, 0.0, 1.0);
      if (rawPaintM > 0.0 || bay > 0.0) {
        float wear = 0.9 + 0.1 * smoothstep(0.2, 0.5, vnoise(wp * 3.0));
        float paintM = rawPaintM * wear;
        base = mix(base, vec3(0.95, 0.74, 0.18), paintM);
        base = mix(base, vec3(0.93, 0.93, 0.9), bay * wear);
        rough = mix(rough, 0.7, max(paintM, bay));
      }`,
      replaceOnce,
      'GPU-LVL-04 gate asphalt marking wear vnoise on active marking mask'
    );
    // GPU-LVL-05: Eliminate dead chamfer derivative (e and fwidth(e)) executed on 100% of stage pixels.
    code = applyWave345Compatible(
      code,
      `  // crisp modelled edges: thin bright chamfer + soft inner shadow
  float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
  float ew = fwidth(e);
  // (edges are real bevel geometry now; the old painted chamfer lines drew seams where faces stack)`,
      `  // crisp modelled edges: thin bright chamfer + soft inner shadow
  // (edges are real bevel geometry now; the old painted chamfer lines drew seams where faces stack)`,
      replaceOnce,
      'GPU-LVL-05 remove dead chamfer fwidth(e) calculation'
    );
    // GPU-LVL-06: Skip tangent-space relief normal perturbation & normalization when thick ink masks out relief.
    code = applyWave345Compatible(
      code,
      `  float keep = max((vFaceData.x > 4.5 && vFaceData.x < 5.5) ? 0.55 : 0.0, gTexKeep);   // containers + stairs
  nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm, gTexStr * (1.0 - gInk * (1.0 - max(keep, gInkKeep))));`,
      `  float keep = max((vFaceData.x > 4.5 && vFaceData.x < 5.5) ? 0.55 : 0.0, gTexKeep);   // containers + stairs
  float tStr = gTexStr * (1.0 - gInk * (1.0 - max(keep, gInkKeep)));
  if (tStr != 0.0) nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm, tStr);`,
      replaceOnce,
      'GPU-LVL-06 gate texlibPerturbNormal on positive relief strength'
    );
  }

  if (rel === 'src/world/inkShading.js') {
    // GPU-INK-01: Defer face tangent frame (Tf, Bf) and viewMatrix sun projection to halo > 0.0 && !wallF.
    code = applyWave345Compatible(
      code,
      `    bool wallF = abs(vWNorm.y) < 0.5;
    vec3 Tf = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bf = cross(vWNorm, Tf);
    // world-space direction toward the sun (the scene's only directional light)
#if NUM_DIR_LIGHTS > 0
    vec3 sunW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
#else
    vec3 sunW = normalize(vec3(-0.41, 0.83, -0.38));
#endif
    vec2 sunF = vec2(dot(sunW, Tf), dot(sunW, Bf));        // sun direction in the face's (u, v) plane`,
      `    bool wallF = abs(vWNorm.y) < 0.5;`,
      replaceOnce,
      'GPU-INK-01a remove eager per-pixel Tf/Bf/sunW/sunF evaluation in INK_COLOR'
    );
    code = applyWave345Compatible(
      code,
      `    float halo = smoothstep(0.06, 0.5, amt) * (1.0 - gInk) * near;
    if (!wallF) {
      // ink sits ON the ground: the lip throws a soft contact shadow, heavier on the side away from the sun
      vec2 outN = -gradA / max(length(gradA), 1e-4);
      float away = clamp(0.55 - 0.9 * dot(outN, normalize(sunF + 1e-4)) * length(sunF), 0.25, 1.3);
      halo *= smoothstep(0.4, 0.85, vWNorm.y) * away;
      base *= mix(vec3(1.0), team * 0.45 + 0.3, halo * 0.5);
    } else {
      // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
      base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
    }`,
      WAVE_INK_HALO,
      replaceOnce,
      'GPU-INK-01b evaluate Tf/Bf/sunW/sunF only inside active floor halo'
    );
    // GPU-INK-02: Gate clearcoat roughness pow/sqrt and specular Fresnel mixes on gInk > 0.0.
    code = applyWave345Compatible(
      code,
      `  vec3 cdu = dFdx(normal), cdv = dFdy(normal);
  float kern = min(0.3 * (dot(cdu, cdu) + dot(cdv, cdv)), 0.18);
  float cr = mix(mix(0.034, 0.026, gFresh), 0.022, gWake);
  material.clearcoat = gInk;
  material.clearcoatRoughness = min(sqrt(sqrt(cr * cr * cr * cr + kern)), 1.0);
  material.roughness = mix(material.roughness, min(sqrt(sqrt(pow(material.roughness, 4.0) + kern)), 1.0), gInk);
  // the coat carries all the gloss; a sheen on the pigment layer underneath would spread the sun into a broad milky blob
  material.specularColor *= 1.0 - 0.97 * gInk;
  material.specularColorBlended *= 1.0 - 0.97 * gInk;
  material.specularF90 = mix(material.specularF90, 0.02, gInk);
  // flatter Fresnel on the coat: a little more reflection head-on, far less at grazing angles, so the team colour
  // survives a low gameplay camera instead of washing out to sky-white
  material.clearcoatF0 = vec3(mix(0.04, 0.055 + 0.015 * gFresh, gInk));
  material.clearcoatF90 = mix(1.0, 0.45, gInk);`,
      `  vec3 cdu = dFdx(normal), cdv = dFdy(normal);
  material.clearcoat = gInk;
  if (gInk > 0.0) {
    float kern = min(0.3 * (dot(cdu, cdu) + dot(cdv, cdv)), 0.18);
    float cr = mix(mix(0.034, 0.026, gFresh), 0.022, gWake);
    float cr2 = cr * cr, mr2 = material.roughness * material.roughness;
    material.clearcoatRoughness = min(sqrt(sqrt(cr2 * cr2 + kern)), 1.0);
    material.roughness = mix(material.roughness, min(sqrt(sqrt(mr2 * mr2 + kern)), 1.0), gInk);
    // the coat carries all the gloss; a sheen on the pigment layer underneath would spread the sun into a broad milky blob
    material.specularColor *= 1.0 - 0.97 * gInk;
    material.specularColorBlended *= 1.0 - 0.97 * gInk;
    material.specularF90 = mix(material.specularF90, 0.02, gInk);
    // flatter Fresnel on the coat: a little more reflection head-on, far less at grazing angles, so the team colour
    // survives a low gameplay camera instead of washing out to sky-white
    material.clearcoatF0 = vec3(mix(0.04, 0.055 + 0.015 * gFresh, gInk));
    material.clearcoatF90 = mix(1.0, 0.45, gInk);
  }`,
      replaceOnce,
      'GPU-INK-02 gate clearcoat roughness pow/sqrt and specular mixes on gInk > 0.0'
    );
    // GPU-INK-03: legacy tables use a high-water count; production keeps its packed owner.
    if (!code.includes('uRipActiveCount')) {
    code = applyWave345Compatible(
      code,
      `    uRipP: { value: Array.from({ length: INK_RIPPLES }, () => new THREE.Vector4(0, 0.2, 1, 0.01)) },`,
      `    uRipP: { value: Array.from({ length: INK_RIPPLES }, () => new THREE.Vector4(0, 0.2, 1, 0.01)) },
    uRipCount: { value: INK_RIPPLES },`,
      replaceOnce,
      'GPU-INK-03a add uRipCount uniform to inkUniforms'
    );
    code = applyWave345Compatible(
      code,
      `uniform vec4 uRipP[\${INK_RIPPLES}];`,
      `uniform vec4 uRipP[\${INK_RIPPLES}];
uniform int uRipCount;`,
      replaceOnce,
      'GPU-INK-03b declare uRipCount in INK_PARS'
    );
    }
    code = applyWave345Compatible(
      code,
      `    for (int i = 0; i < \${INK_RIPPLES}; i++) {
      vec4 Pr = uRip[i], Qr = uRipP[i];
      float age = uInkClock - Pr.w;
      if (age <= 0.0 || age >= Qr.w) continue;
      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float d = length(D);
      float x = d - front;
      float sg = Qr.y * 0.8;
      if (x > sg * 3.0 || x < -Qr.y * 4.0) continue;`,
      `    for (int i = 0; i < \${INK_RIPPLES}; i++) {
      if (i >= uRipCount) break;
      vec4 Pr = uRip[i], Qr = uRipP[i];
      float age = uInkClock - Pr.w;
      if (age <= 0.0 || age >= Qr.w) continue;
      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float sg = Qr.y * 0.8;
      float maxD = front + sg * 3.0, minD = front - Qr.y * 4.0;
      float d2 = dot(D, D);
      if (d2 > maxD * maxD || (minD > 0.0 && d2 < minD * minD)) continue;
      float d = sqrt(d2);
      float x = d - front;`,
      replaceOnce,
      'GPU-INK-03c dynamic uRipCount bound and squared-distance rejection before sqrt in INK_SLOPE'
    );
    if (!code.includes('uRipActiveCount')) code = applyWave345Compatible(
      code,
      `  const ra = U.uRip.value, rb = U.uRipP.value;
  for (let i = 0; i < INK_RIPPLES; i++) {
    const o = i * 4;
    ra[i].set(A[o], A[o + 1], A[o + 2], A[o + 3]);
    rb[i].set(B[o], B[o + 1], B[o + 2], B[o + 3]);
  }`,
      `  const ra = U.uRip.value, rb = U.uRipP.value;
  const clk = U.uInkClock.value;
  let ripCount = 0;
  for (let i = 0; i < INK_RIPPLES; i++) {
    const o = i * 4;
    const birth = A[o + 3], life = B[o + 3];
    ra[i].set(A[o], A[o + 1], A[o + 2], birth);
    rb[i].set(B[o], B[o + 1], B[o + 2], life);
    const age = clk - birth;
    if (age > 0 && age < life) ripCount = i + 1;
  }
  if (U.uRipCount) U.uRipCount.value = ripCount;`,
      replaceOnce,
      'GPU-INK-03d update uRipCount active high-water mark in inkBeforeRender'
    );
  }

  if (rel === 'src/core/renderer.js') {
    // GPU-POST-01: Gate identity exposure, contrast, vignette, hurt, and flash in full-screen GradeShader.
    code = applyWave345Compatible(
      code,
      `      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      float v = smoothstep(0.55, 1.25, r);
      c.rgb *= 1.0 - uVignette * v;
      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
      c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
      c.rgb += uFlash;`,
      `      vec4 c = texture2D(tDiffuse, vUv);
      if (uExposure != 1.0) c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      if (uContrast != 1.0) {
        c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      } else {
        c.rgb = max(c.rgb, vec3(1e-6)) + uLift;
      }
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      if (uVignette > 0.0 || uHurt > 0.0) {
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(q);
        float v = smoothstep(0.55, 1.25, r);
        c.rgb *= 1.0 - uVignette * v;
        if (uHurt > 0.0) {
          // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
          float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
          c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
        }
      }
      if (uFlash != 0.0) c.rgb += uFlash;`,
      replaceOnce,
      'GPU-POST-01 gate identity exposure, contrast, vignette, hurt, and flash in GradeShader'
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    // GPU-POST-02: Early-exit ScreenFX gooBand on interior screen pixels, drips below top band, and identity saturation mix.
    code = applyWave345Compatible(
      code,
      `  // gooey ink band hugging the screen edges: > 0 inside the ink
  float gooBand(vec2 uv, float width, float wob, float seed) {
    vec2 p = uv * vec2(uAspect, 1.0);
    float n = fbm(p * 3.2 + vec2(seed, uTime * 0.12)) - 0.44;
    float n2 = vnoise(p * 10.0 + vec2(uTime * 0.25, seed * 1.7)) - 0.5;
    return width * (1.0 + n * wob * 2.2 + n2 * wob * 0.7) - edgeD(uv);
  }
  // ink drips hanging from the top edge: > 0 inside
  float drips(vec2 uv, float len, float seed, float top) {
    const float N = 19.0;
    float x = uv.x * N;
    float id = floor(x);
    float h = hash12(vec2(id, seed));
    float h2 = hash12(vec2(id, seed + 7.3));
    float fx = (fract(x) - 0.5 - (h2 - 0.5) * 0.5) / N * uAspect;   // horizontal distance, height units
    float L = len * (0.12 + 0.88 * h * h) * (0.9 + 0.1 * sin(uTime * (0.7 + h) + h * 6.28));
    float y = 1.0 - uv.y - top;
    if (y < -0.02) return -1.0;`,
      `  // gooey ink band hugging the screen edges: > 0 inside the ink
  float gooBand(vec2 uv, float width, float wob, float seed) {
    float ed = edgeD(uv);
    // fbm, vnoise in [0, 1] => n <= 0.56, n2 <= 0.5 => max factor is 1.0 + 1.582 * wob;
    // callers smoothstep(-0.015, ...) so any return < -0.02 is identically 0.0 across all callers.
    if (ed > width * (1.0 + wob * 1.6) + 0.02) return width - ed;
    vec2 p = uv * vec2(uAspect, 1.0);
    float n = fbm(p * 3.2 + vec2(seed, uTime * 0.12)) - 0.44;
    float n2 = vnoise(p * 10.0 + vec2(uTime * 0.25, seed * 1.7)) - 0.5;
    return width * (1.0 + n * wob * 2.2 + n2 * wob * 0.7) - ed;
  }
  // ink drips hanging from the top edge: > 0 inside
  float drips(vec2 uv, float len, float seed, float top) {
    float y = 1.0 - uv.y - top;
    // Max L is len * 1.1 and max bulb rad is 0.016 * 1.55 = 0.0248; callers smoothstep(-0.012, ...)
    if (y < -0.02 || y > len * 1.1 + 0.04) return -1.0;
    const float N = 19.0;
    float x = uv.x * N;
    float id = floor(x);
    float h = hash12(vec2(id, seed));
    float h2 = hash12(vec2(id, seed + 7.3));
    float fx = (fract(x) - 0.5 - (h2 - 0.5) * 0.5) / N * uAspect;   // horizontal distance, height units
    float L = len * (0.12 + 0.88 * h * h) * (0.9 + 0.1 * sin(uTime * (0.7 + h) + h * 6.28));`,
      replaceOnce,
      'GPU-POST-02a early-exit ScreenFX gooBand interior and drips lower-screen pixels'
    );
    code = applyWave345Compatible(
      code,
      `    float l0 = luma(col);
    col = max(mix(vec3(l0), col, uSat * (1.0 - uDesat)), 0.0);`,
      `    float satK = uSat * (1.0 - uDesat);
    if (satK != 1.0) {
      float l0 = luma(col);
      col = max(mix(vec3(l0), col, satK), 0.0);
    } else {
      col = max(col, 0.0);
    }`,
      replaceOnce,
      'GPU-POST-02b gate ScreenFX luma saturation mix on non-unit satK'
    );
  }

  if (rel === 'src/world/environment.js') {
    // GPU-ENV-01 & GPU-ENV-02: Gate Marina and Open-Sea sun glitter 3x pow on rs > 0.0 && shadow > 0.0 && under < 1.0,
    // and gate open-sea shoreline/object foam smoothsteps & fract on detail > 0.0 && (dEdge < 3.4 || dObj < 2.2).
    code = applyWave345Compatible(
      code,
      `  // sun glints (blocked by shadows and by anything reflected in front of the sky)
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under) * (1.0 - occl);`,
      `  // sun glints (blocked by shadows and by anything reflected in front of the sky)
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  if (rs > 0.0 && shadow > 0.0 && under < 1.0 && occl < 1.0) {
    float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
    col += uSunLight * spec * uSunSpec * shadow * (1.0 - under) * (1.0 - occl);
  }`,
      replaceOnce,
      'GPU-ENV-02a gate Marina water sun glitter 3x pow on rs > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `  // sun glint: broad sheen + tight sparkles from the fine normals
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under);

  // foam: lapping band along the deck edge, rings around pilings / boats / buoys
  float fn = w2.z * 0.6 + w1.z * 0.4;
  float edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
  float lapPhase = fract(dEdge * 0.7 - uTime * 0.3);
  float lap = smoothstep(0.1, 0.0, abs(lapPhase - 0.5) - 0.4) * smoothstep(3.4, 0.5, dEdge) * step(0.0, dEdge);
  lap *= smoothstep(0.35, 0.7, fn + 0.15);
  float objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45);
  objF += 0.45 * smoothstep(0.1, 0.0, abs(fract(dObj * 0.9 - uTime * 0.35) - 0.5) - 0.42) * smoothstep(2.2, 0.4, dObj) * smoothstep(0.35, 0.7, fn + 0.1);
  float foam = clamp(edgeF + lap * 0.5 + objF, 0.0, 1.0) * mix(1.0, 0.35, under);
  vec3 foamCol = uFoamColor * (uSeaAmbient * 1.3 + uSunLight * (0.35 + 0.65 * shadow) * 0.6);
  col = mix(col, foamCol, foam * detail);`,
      `  // sun glint: broad sheen + tight sparkles from the fine normals
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  if (rs > 0.0 && shadow > 0.0 && under < 1.0) {
    float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
    col += uSunLight * spec * uSunSpec * shadow * (1.0 - under);
  }

  // foam: lapping band along the deck edge, rings around pilings / boats / buoys
  if (detail > 0.0 && (dEdge < 3.4 || dObj < 2.2)) {
    float fn = w2.z * 0.6 + w1.z * 0.4;
    float edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
    float lapPhase = fract(dEdge * 0.7 - uTime * 0.3);
    float lap = smoothstep(0.1, 0.0, abs(lapPhase - 0.5) - 0.4) * smoothstep(3.4, 0.5, dEdge) * step(0.0, dEdge);
    lap *= smoothstep(0.35, 0.7, fn + 0.15);
    float objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45);
    objF += 0.45 * smoothstep(0.1, 0.0, abs(fract(dObj * 0.9 - uTime * 0.35) - 0.5) - 0.42) * smoothstep(2.2, 0.4, dObj) * smoothstep(0.35, 0.7, fn + 0.1);
    float foam = clamp(edgeF + lap * 0.5 + objF, 0.0, 1.0) * mix(1.0, 0.35, under);
    vec3 foamCol = uFoamColor * (uSeaAmbient * 1.3 + uSunLight * (0.35 + 0.65 * shadow) * 0.6);
    col = mix(col, foamCol, foam * detail);
  }`,
      replaceOnce,
      'GPU-ENV-01 gate open-sea sun glitter 3x pow and shoreline/object foam ALU'
    );
    // GPU-ENV-03: Gate horizon waterline caustic 4x sin + normalize on wl2 in (0.0, 1.1).
    code = applyWave345Compatible(
      code,
      `#ifdef HZ_WATERLINE
  float wl2 = vHzWorld.y - \${WATER_Y.toFixed(3)};
  vec2 cq = vHzWorld.xz * 1.7 + vec2(vHzWorld.y * 2.3, 0.0);
  float cz = sin(cq.x + uTime * 1.3 + sin(cq.y * 1.3 + uTime * 0.9) * 1.6) * sin(cq.y * 1.1 - uTime * 1.1 + sin(cq.x * 0.9 - uTime * 0.7) * 1.4);
  float side = 1.0 - abs(normalize(vHzNormal).y);
  totalEmissiveRadiance += uGlowColor * 0.07 * side * smoothstep(0.45, 0.95, cz) * smoothstep(1.1, 0.15, wl2) * step(0.0, wl2);
#endif`,
      `#ifdef HZ_WATERLINE
  float wl2 = vHzWorld.y - \${WATER_Y.toFixed(3)};
  if (wl2 > 0.0 && wl2 < 1.1) {
    vec2 cq = vHzWorld.xz * 1.7 + vec2(vHzWorld.y * 2.3, 0.0);
    float cz = sin(cq.x + uTime * 1.3 + sin(cq.y * 1.3 + uTime * 0.9) * 1.6) * sin(cq.y * 1.1 - uTime * 1.1 + sin(cq.x * 0.9 - uTime * 0.7) * 1.4);
    float side = 1.0 - abs(normalize(vHzNormal).y);
    totalEmissiveRadiance += uGlowColor * 0.07 * side * smoothstep(0.45, 0.95, cz) * smoothstep(1.1, 0.15, wl2);
  }
#endif`,
      replaceOnce,
      'GPU-ENV-03 gate horizon waterline caustic 4x sin on active 0..1.1m band'
    );
  }

  if (rel === 'src/world/decor.js') {
    // GPU-DEC-01: Gate spawn pad center ink pool 2x dNoise, pow(n, 7.0), and emblem texture fetch on r < 0.62 (>61% of disc skipped).
    code = applyWave345Compatible(
      code,
      `  // pooled ink in the centre: slow liquid swirl, wet highlight
  float n = dNoise(q * 3.2 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + dNoise(q * 7.0 - uTime * 0.3) * 0.4;
  float pool = smoothstep(0.58, 0.5, r + (n - 0.5) * 0.06);
  vec3 ink = uColor * (0.42 + 0.3 * n) + vec3(0.9) * pow(n, 7.0) * 1.4;
  base = mix(base, ink, pool);
  // emblem (white squid) in the pool
  vec2 eu = q / 0.46 * 0.5 + 0.5;
  float em = (eu.x > 0.0 && eu.x < 1.0 && eu.y > 0.0 && eu.y < 1.0) ? texture2D(uEmblem, eu).a : 0.0;
  base = mix(base, vec3(1.0) * (0.9 + 0.2 * uPulse), em * pool);`,
      `  // pooled ink in the centre: slow liquid swirl, wet highlight
  float pool = 0.0;
  if (r < 0.62) {
    float n = dNoise(q * 3.2 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + dNoise(q * 7.0 - uTime * 0.3) * 0.4;
    pool = smoothstep(0.58, 0.5, r + (n - 0.5) * 0.06);
    if (pool > 0.0) {
      float n2 = n * n;
      vec3 ink = uColor * (0.42 + 0.3 * n) + vec3(0.9) * (n2 * n2 * n2 * n) * 1.4;
      base = mix(base, ink, pool);
      // emblem (white squid) in the pool
      vec2 eu = q / 0.46 * 0.5 + 0.5;
      float em = (eu.x > 0.0 && eu.x < 1.0 && eu.y > 0.0 && eu.y < 1.0) ? texture2D(uEmblem, eu).a : 0.0;
      base = mix(base, vec3(1.0) * (0.9 + 0.2 * uPulse), em * pool);
    }
  }`,
      replaceOnce,
      'GPU-DEC-01 gate spawn pad center pool noise and emblem texture sample on r < 0.62'
    );
  }

  if (rel === 'src/game/character-mats.js') {
    // GPU-CHR-01: Early-exit iwBumpN when height derivatives are zero & gate skin 3D iwFbm (24 hashes/px) on mottLod > 0.0.
    code = applyWave345Compatible(
      code,
      `vec3 iwBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n;
}`,
      `vec3 iwBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  if (dhx == 0.0 && dhy == 0.0) return n;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n;
}`,
      replaceOnce,
      'GPU-CHR-01a early-exit iwBumpN when height gradient is zero'
    );
    code = applyWave345Compatible(
      code,
      `        {
          float mott = iwFbm(vBindPos * 60.0);
          diffuseColor.rgb *= 1.0 + (mott - 0.5) * 0.06 * iwLod(vBindPos.y * 60.0, 1.0);
        }`,
      `        {
          float mottLod = iwLod(vBindPos.y * 60.0, 1.0);
          if (mottLod > 0.0) {
            float mott = iwFbm(vBindPos * 60.0);
            diffuseColor.rgb *= 1.0 + (mott - 0.5) * 0.06 * mottLod;
          }
        }`,
      replaceOnce,
      'GPU-CHR-01b gate skin 3D iwFbm mottling on mottLod > 0.0'
    );
  }

  if (rel === 'src/boss/bossMats.js') {
    // GPU-BOS-01: Early-exit bBumpN when height derivatives are zero & gate phase-2 STEEL Voronoi fracture on uCrack > 0.001.
    code = applyWave345Compatible(
      code,
      `vec3 bBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2); return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n; }`,
      `vec3 bBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos); float dhx = dFdx(h), dhy = dFdy(h);
  if (dhx == 0.0 && dhy == 0.0) return n;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2); return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n; }`,
      replaceOnce,
      'GPU-BOS-01a early-exit bBumpN when height gradient is zero'
    );
    code = applyWave345Compatible(
      code,
      `      float ang = atan(d.y, d.x);
      float jag = 1.0 + 0.1 * sin(ang * 7.0 + (pid < 1.5 ? 1.0 : -1.0)) + 0.06 * sin(ang * 13.0 + 2.0) + 0.05 * sin(ang * 23.0);
      float edge = abs(r - jag) * 0.5;
      float near = exp(-max(0.0, r - jag) * 2.2);
      float vor = bVoro(uv * 2.6 + 11.0);
      float cracks = bLine(vor, 0.035) * near * smoothstep(0.2, 0.9, bN2(uv * 1.7)) * step(jag, r);
      float rim = bLine(edge, 0.018);
      float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + uv.x * 2.0);
      float g = (rim + cracks) * uCrack * pulse;
      c = mix(c, vec3(0.01), g * 0.8);
      bEmis += uWeak * g * (2.5 + 3.0 * uOpen);`,
      `      if (uCrack > 0.001) {
        float ang = atan(d.y, d.x);
        float jag = 1.0 + 0.1 * sin(ang * 7.0 + (pid < 1.5 ? 1.0 : -1.0)) + 0.06 * sin(ang * 13.0 + 2.0) + 0.05 * sin(ang * 23.0);
        float edge = abs(r - jag) * 0.5;
        float near = exp(-max(0.0, r - jag) * 2.2);
        float vor = bVoro(uv * 2.6 + 11.0);
        float cracks = bLine(vor, 0.035) * near * smoothstep(0.2, 0.9, bN2(uv * 1.7)) * step(jag, r);
        float rim = bLine(edge, 0.018);
        float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + uv.x * 2.0);
        float g = (rim + cracks) * uCrack * pulse;
        c = mix(c, vec3(0.01), g * 0.8);
        bEmis += uWeak * g * (2.5 + 3.0 * uOpen);
      }`,
      replaceOnce,
      'GPU-BOS-01b gate STEEL phase-2 Voronoi fractures on uCrack > 0.001'
    );
  }

  if (rel === 'src/fx/fx.js') {
    // GPU-FX-01: Gate glossy droplet transmission/Fresnel/specular 5x pow + reflect on vGloss > 0.0 (matte dust/debris particles have vGloss == 0.0).
    code = applyWave345Compatible(
      code,
      `  float edge = 1.0 - z;
  // light passes through the ink and exits on the far side: a saturated glow opposite the sun, strongest near the rim
  vec2 sxy = normalize(vec2(dot(uSunDirV.xy, bx), dot(uSunDirV.xy, vAx)) + 1e-4);
  float trans = pow(clamp(-dot(q, sxy), 0.0, 1.0), 1.5) * (0.35 + 0.65 * edge);
  base += vCol * (vCol + 0.25) * trans * 0.7 * g;
  // lens rim: the curved edge of the liquid reads darker and richer
  base *= mix(1.0, 0.6, pow(edge, 2.2) * g);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  float rup = dot(R, uUpV);
  vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.4, smoothstep(-0.15, 0.35, rup));
  float fres = (0.04 + 0.96 * pow(edge, 4.0)) * g;
  vec3 col = mix(base, env, fres * 0.42);
  float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
  col += uSunCol * (pow(rl, 150.0) * 7.0 + pow(rl, 16.0) * 0.28) * g;
  col *= mix(0.85, 1.0, g);`,
      `  vec3 col = base * 0.85;
  if (g > 0.0) {
    float edge = 1.0 - z;
    // light passes through the ink and exits on the far side: a saturated glow opposite the sun, strongest near the rim
    vec2 sxy = normalize(vec2(dot(uSunDirV.xy, bx), dot(uSunDirV.xy, vAx)) + 1e-4);
    float trans = pow(clamp(-dot(q, sxy), 0.0, 1.0), 1.5) * (0.35 + 0.65 * edge);
    base += vCol * (vCol + 0.25) * trans * 0.7 * g;
    // lens rim: the curved edge of the liquid reads darker and richer
    base *= mix(1.0, 0.6, pow(edge, 2.2) * g);
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
    float rup = dot(R, uUpV);
    vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.4, smoothstep(-0.15, 0.35, rup));
    float fres = (0.04 + 0.96 * pow(edge, 4.0)) * g;
    col = mix(base, env, fres * 0.42);
    float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
    col += uSunCol * (pow(rl, 150.0) * 7.0 + pow(rl, 16.0) * 0.28) * g;
    col *= mix(0.85, 1.0, g);
  }`,
      replaceOnce,
      'GPU-FX-01 gate droplet transmission/Fresnel/specular 5x pow on vGloss > 0.0'
    );
  }

  if (rel === 'src/game/lobbySet-mats.js') {
    // GPU-LOB-01: Gate 5x tMask texture fetches on inside > 0.0, gate 6-ripple loop on water > 0.0, and gate sky lsF on cloud elevation band.
    code = applyWave345Compatible(
      code,
      `  vec2 muv = vec2((p.x - uMaskR.x) / (uMaskR.z - uMaskR.x), 1.0 - (p.y - uMaskR.y) / (uMaskR.w - uMaskR.y));
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  vec3 m = texture2D(tMask, clamp(muv, 0.0, 1.0)).rgb * inside;`,
      `  vec2 muv = vec2((p.x - uMaskR.x) / (uMaskR.z - uMaskR.x), 1.0 - (p.y - uMaskR.y) / (uMaskR.w - uMaskR.y));
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  vec2 iwMaskCenterUv = clamp(muv, 0.0, 1.0);
  vec2 iwMaskCenterDx = dFdx(iwMaskCenterUv), iwMaskCenterDy = dFdy(iwMaskCenterUv);
  vec3 m = inside > 0.0 ? textureGrad(tMask, iwMaskCenterUv, iwMaskCenterDx, iwMaskCenterDy).rgb : vec3(0.0);`,
      replaceOnce,
      'GPU-LOB-01a gate lobby ground center tMask texture fetch on inside > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `  // ink is a liquid film with a rounded rim: slope from the mask gradient (world metres) tilts the normal at its edges
  {
    vec2 du = vec2(0.025 / (uMaskR.z - uMaskR.x), 0.0), dv = vec2(0.0, 0.025 / (uMaskR.w - uMaskR.y));
    float hx = dot(texture2D(tMask, muv + du).rg - texture2D(tMask, muv - du).rg, vec2(1.0));
    float hz = -dot(texture2D(tMask, muv + dv).rg - texture2D(tMask, muv - dv).rg, vec2(1.0));
    gTilt = vec2(hx, hz) * 0.35 * inside;
  }
  gRough = mix(gRough, gRough * 0.42, gDamp);
  gRough = mix(gRough, 0.07, max(ink, track * 0.4));
  gRough = mix(gRough, 0.025, water);
  // drip ripples in standing water
  for (int i = 0; i < 6; i++) {
    vec4 r = uRip[i]; float age = uTime - r.z;
    if (age < 0.0 || age > 2.2) continue;
    vec2 dv = p - r.xy; float d = length(dv) + 1e-4;
    float front = age * 0.32;
    float env = exp(-age * 1.8) * smoothstep(front + 0.05, front - 0.03, d) * smoothstep(0.0, 0.03, d) * r.w;
    gRipN += (dv / d) * cos((d - front) * 70.0) * env * 0.6;
  }
  gRipN *= water;`,
      `  // ink is a liquid film with a rounded rim: slope from the mask gradient (world metres) tilts the normal at its edges
  // Neighbor offsets are uniform; hoist their shared UV gradients before
  // the spatial gate so implicit LOD never depends on divergent execution.
  vec2 iwMaskNeighborDx = dFdx(muv), iwMaskNeighborDy = dFdy(muv);
  if (inside > 0.0) {
    vec2 du = vec2(0.025 / (uMaskR.z - uMaskR.x), 0.0), dv = vec2(0.0, 0.025 / (uMaskR.w - uMaskR.y));
    float hx = dot(textureGrad(tMask, muv + du, iwMaskNeighborDx, iwMaskNeighborDy).rg - textureGrad(tMask, muv - du, iwMaskNeighborDx, iwMaskNeighborDy).rg, vec2(1.0));
    float hz = -dot(textureGrad(tMask, muv + dv, iwMaskNeighborDx, iwMaskNeighborDy).rg - textureGrad(tMask, muv - dv, iwMaskNeighborDx, iwMaskNeighborDy).rg, vec2(1.0));
    gTilt = vec2(hx, hz) * 0.35;
  }
  gRough = mix(gRough, gRough * 0.42, gDamp);
  gRough = mix(gRough, 0.07, max(ink, track * 0.4));
  gRough = mix(gRough, 0.025, water);
  // drip ripples in standing water
  if (water > 0.0) {
    for (int i = 0; i < 6; i++) {
      vec4 r = uRip[i]; float age = uTime - r.z;
      if (age < 0.0 || age > 2.2) continue;
      vec2 dv = p - r.xy;
      float front = age * 0.32, maxD = front + 0.05;
      float d2 = dot(dv, dv);
      if (d2 >= maxD * maxD) continue;
      float d = sqrt(d2) + 1e-4;
      float env = exp(-age * 1.8) * smoothstep(maxD, front - 0.03, d) * smoothstep(0.0, 0.03, d) * r.w;
      gRipN += (dv / d) * cos((d - front) * 70.0) * env * 0.6;
    }
    gRipN *= water;
  }`,
      replaceOnce,
      'GPU-LOB-01b gate 4x lobby ground neighbor tMask fetches on inside > 0.0 and 6-ripple loop on water > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `        // thin high cloud streaks catching the city light from below
        vec2 cp = d.xz / max(e + 0.12, 0.05);
        float cl = smoothstep(0.55, 0.8, lsF(cp * vec2(0.35, 1.2) + vec2(uTime * 0.004, 0.0)));
        c = mix(c, uGlow * 0.35 + vec3(0.03, 0.04, 0.07), cl * 0.55 * smoothstep(0.02, 0.2, e) * smoothstep(0.9, 0.3, e));`,
      `        // thin high cloud streaks catching the city light from below
        if (e > 0.02 && e < 0.9) {
          vec2 cp = d.xz / max(e + 0.12, 0.05);
          float cl = smoothstep(0.55, 0.8, lsF(cp * vec2(0.35, 1.2) + vec2(uTime * 0.004, 0.0)));
          c = mix(c, uGlow * 0.35 + vec3(0.03, 0.04, 0.07), cl * 0.55 * smoothstep(0.02, 0.2, e) * smoothstep(0.9, 0.3, e));
        }`,
      replaceOnce,
      'GPU-LOB-01c gate lobby sky 4-octave lsF cloud FBM on e in (0.02, 0.9)'
    );
  }

  // ============================================================================
  // WAVE 10 WHOLE-GAME GPU SHADER, RASTERIZATION & PIPELINE OPTIMIZATIONS
  // ============================================================================
  if (rel === 'src/fx/fx.js') {
    // GPU-FX-02: PUFF_FRAG early corner/alpha discard, gate atan + 2x fxNoise on kind <= 1.5 || kind > 3.5 (skipping 8 hashes/px on feathers & squid ghosts), and polynomial pow2 in squid ghost fin.
    code = applyWave345Compatible(
      code,
      `void main() {
  float r = length(vUv);
  float seed = vMisc.y * 37.0;
  float ang = atan(vUv.y, vUv.x);
  float n = fxNoise(vec2(cos(ang), sin(ang)) * 2.2 + seed) * 0.6 + fxNoise(vUv * 3.1 + seed + vMisc.z * 1.5) * 0.4;
  float a = 0.0;
  vec3 col = vCol.rgb;
  float kind = vMisc.w;`,
      `void main() {
  float r = length(vUv);
  if (vCol.a < 0.004 || r >= 1.18) discard;
  float seed = vMisc.y * 37.0;
  float kind = vMisc.w;
  float n = 0.0;
  if (kind <= 1.5 || kind > 3.5) {
    float ang = atan(vUv.y, vUv.x);
    n = fxNoise(vec2(cos(ang), sin(ang)) * 2.2 + seed) * 0.6 + fxNoise(vUv * 3.1 + seed + vMisc.z * 1.5) * 0.4;
  }
  float a = 0.0;
  vec3 col = vCol.rgb;`,
      replaceOnce,
      'GPU-FX-02a PUFF_FRAG early corner/alpha discard and gate atan + 2x fxNoise on kind <= 1.5 || kind > 3.5'
    );
    code = applyWave345Compatible(
      code,
      `    float fin = 0.22 * exp(-pow((q.y - 0.3) / 0.12, 2.0));`,
      `    float qf = (q.y - 0.3) / 0.12;
    float fin = 0.22 * exp(-(qf * qf));`,
      replaceOnce,
      'GPU-FX-02b PUFF_FRAG squid ghost fin polynomial pow2'
    );

    // GPU-FX-03: GLOW_FRAG replace all 4 integer pow(..., 2.0/3.0) calls with exact polynomial multiplies.
    code = applyWave345Compatible(
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
    float h0 = max(1.0 - r, 0.0), ht = max(1.0 - r * 3.2, 0.0);
    float halo = (h0 * h0 * h0) * 0.45;
    float hot = ht * ht;
    col = vCol.rgb * (cr + dg + halo) + vec3(1.0, 0.98, 0.95) * hot * core;
  } else if (kind < 2.5) {
    // bubble: thin bright rim + specular dot
    float rim = smoothstep(0.16, 0.0, abs(r - 0.8)) * 0.8 + smoothstep(0.5, 0.95, r) * step(r, 0.9) * 0.25;
    float hl = smoothstep(0.24, 0.0, length(vUv - vec2(-0.3, 0.34)));
    col = vCol.rgb * rim + vec3(1.0) * hl * (0.6 + core * 0.2);
  } else {
    // halo ring flash
    float rd = (r - 0.78) * 7.0;
    float ring = exp(-(rd * rd));
    col = vCol.rgb * ring + vec3(1.0) * ring * ring * core * 0.3;
  }`,
      replaceOnce,
      'GPU-FX-03 GLOW_FRAG polynomial pow2/pow3 replacements'
    );

    // GPU-FX-04: RING_FRAG gate fxNoise wobble on styles that actually use wob, and replace pow(1.0 - vT, 4.0) / pow(1.0 - vT, 2.0).
    code = applyWave345Compatible(
      code,
      `  float ang = atan(vUv.y, vUv.x);
  float seed = vMisc.x * 53.0;
  float wob = fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5;
  float a = 0.0;
  vec3 col = vCol.rgb;
  float st = vMisc.y;
  if (st < 0.5) {
    // ink shockwave: thick wobbly band that thins as it expands, plus droplet beads on the rim
    float outer = 0.93 + wob * 0.1;
    float w = mix(0.34, 0.07, vT) * vMisc.z;
    float band = smoothstep(outer + 0.02, outer - 0.02, r) * smoothstep(outer - w - 0.03, outer - w + 0.02, r);
    float beads = smoothstep(0.35, 0.0, length(vec2(fract(ang / 6.2831 * 18.0 + seed) - 0.5, (r - outer) * 7.0))) * step(0.45, fxHash(vec2(floor(ang / 6.2831 * 18.0 + seed), seed)));
    float fill = pow(1.0 - vT, 4.0) * 0.45 * smoothstep(outer, outer * 0.3, r);
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
      `  float ang = atan(vUv.y, vUv.x);
  float seed = vMisc.x * 53.0;
  float st = vMisc.y;
  float wob = (st < 2.5 || (st >= 4.5 && st < 6.5)) ? (fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5) : 0.0;
  float a = 0.0;
  vec3 col = vCol.rgb;
  float ivT = 1.0 - vT, ivT2 = ivT * ivT;
  if (st < 0.5) {
    // ink shockwave: thick wobbly band that thins as it expands, plus droplet beads on the rim
    float outer = 0.93 + wob * 0.1;
    float w = mix(0.34, 0.07, vT) * vMisc.z;
    float band = smoothstep(outer + 0.02, outer - 0.02, r) * smoothstep(outer - w - 0.03, outer - w + 0.02, r);
    float beads = smoothstep(0.35, 0.0, length(vec2(fract(ang / 6.2831 * 18.0 + seed) - 0.5, (r - outer) * 7.0))) * step(0.45, fxHash(vec2(floor(ang / 6.2831 * 18.0 + seed), seed)));
    float fill = (ivT2 * ivT2) * 0.45 * smoothstep(outer, outer * 0.3, r);
    a = max(max(band, beads * ivT), fill);
    col *= 0.9 + 0.35 * smoothstep(outer - w, outer, r);
    a *= pow(ivT, 1.3);
  } else if (st < 1.5) {
    // water / swim ripple: thin soft outline
    float outer = 0.9 + wob * 0.06;
    a = smoothstep(outer + 0.06, outer, r) * smoothstep(outer - 0.16, outer - 0.03, r) * ivT2;
    col = mix(col, vec3(1.0), 0.35);
  } else if (st < 2.5) {
    // splash disc: quick filled blot
    a = smoothstep(0.95 + wob * 0.2, 0.7 + wob * 0.2, r) * ivT2;`,
      replaceOnce,
      'GPU-FX-04 RING_FRAG gate fxNoise wobble and polynomial pow2/pow4'
    );

    // GPU-FX-05: SHELL_FRAG gate reflect/Fresnel/specular on inner < 0.5, BEAM_FRAG eliminate all 3 pow calls, and MOTE_VERT cull invisible motes + polynomial pow4.
    code = applyWave345Compatible(
      code,
      `  vec3 R = reflect(-V, Nf);
  float fres = pow(1.0 - abs(facing), 3.0) * (1.0 - inner);
  col = mix(col, uSkyCol * 1.25, fres * 0.32);
  col += uSunCol * (pow(clamp(dot(R, uSunDir), 0.0, 1.0), 70.0) * 3.2 + rim * 0.12) * (1.0 - inner);`,
      `  if (inner < 0.5) {
    vec3 R = reflect(-V, Nf);
    float f1 = 1.0 - abs(facing);
    float fres = f1 * f1 * f1;
    col = mix(col, uSkyCol * 1.25, fres * 0.32);
    col += uSunCol * (pow(clamp(dot(R, uSunDir), 0.0, 1.0), 70.0) * 3.2 + rim * 0.12);
  }`,
      replaceOnce,
      'GPU-FX-05a SHELL_FRAG gate reflect/Fresnel/specular on inner < 0.5 and cubic Fresnel'
    );
    code = applyWave345Compatible(
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
      `  float rf = max(1.0 - facing, 0.0);
  float rim = rf * sqrt(rf);
  float a; vec3 col;
  if (vMisc.w > 0.5) {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 7.0 - uTime * 2.6)), st2 = streak * streak;
    a = (0.12 + 0.55 * rim) * (0.45 + 0.75 * streak) * smoothstep(1.0, 0.25, vH) * smoothstep(0.0, 0.04, vH);
    col = vCol.rgb * (1.1 + 0.8 * streak) + vec3(1.2) * (st2 * st2) * (1.0 - vH);
  } else {
    float streak = fxNoise(vec2(ang * 3.0 + vMisc.z * 13.0, vH * 5.0 - vMisc.x * 9.0)), st2 = streak * streak;
    a = (0.3 + 0.7 * rim) * (0.45 + 0.8 * streak);
    a *= smoothstep(1.0, 0.4, vH) * smoothstep(0.0, 0.05, vH);
    col = vCol.rgb * (1.0 + 0.9 * streak) + vec3(3.2) * (st2 * st2 * streak) * (1.0 - vH) * (1.0 - vMisc.x);
  }`,
      replaceOnce,
      'GPU-FX-05b BEAM_FRAG replace all 3 pow calls with exact algebraic/polynomial ops'
    );
    code = applyWave345Compatible(
      code,
      `  float fwd = pow(max(dot(V, uSunDir), 0.0), 4.0);
  vA *= 0.16 + 1.5 * fwd;
  vA *= 0.55 + 0.45 * sin(uTime * (1.3 + aSeed.w * 3.0) + aSeed.x * 50.0);
  vA *= smoothstep(-0.2, 0.4, wp.y);`,
      `  float fd0 = max(dot(V, uSunDir), 0.0), fd2 = fd0 * fd0;
  float fwd = fd2 * fd2;
  vA *= 0.16 + 1.5 * fwd;
  vA *= 0.55 + 0.45 * sin(uTime * (1.3 + aSeed.w * 3.0) + aSeed.x * 50.0);
  vA *= smoothstep(-0.2, 0.4, wp.y);
`,
      replaceOnce,
      'GPU-FX-05c MOTE_VERT polynomial pow4 and vertex-level culling of invisible motes'
    );
  }

  if (rel === 'src/world/paint.js') {
    // GPU-PNT-01: Replace pow(..., 28.0) and pow(..., 36.0) in wob(a, s) (called up to 11x/texel = 22 pows/texel!) and pow(..., 4.0) / pow(..., 3.0) in PAINT_FS with polynomial chains.
    code = applyWave345Compatible(
      code,
      `float wob(float a, float s) {
  return 1.0 + 0.12 * sin(3.0 * a + s * 6.2831) + 0.08 * sin(5.0 * a + s * 17.0) + 0.05 * sin(7.0 * a + s * 41.0)
    + 0.03 * sin(11.0 * a + s * 73.0) + 0.018 * sin(17.0 * a + s * 29.0)
    + 0.17 * pow(max(cos(a - s * 37.7), 0.0), 28.0) + 0.12 * pow(max(cos(a - s * 53.3 - 2.1), 0.0), 36.0);
}`,
      `float wob(float a, float s) {
  float c1 = max(cos(a - s * 37.7), 0.0), c1_2 = c1 * c1, c1_4 = c1_2 * c1_2, c1_8 = c1_4 * c1_4, c1_16 = c1_8 * c1_8;
  float c2 = max(cos(a - s * 53.3 - 2.1), 0.0), c2_2 = c2 * c2, c2_4 = c2_2 * c2_2, c2_8 = c2_4 * c2_4, c2_16 = c2_8 * c2_8;
  return 1.0 + 0.12 * sin(3.0 * a + s * 6.2831) + 0.08 * sin(5.0 * a + s * 17.0) + 0.05 * sin(7.0 * a + s * 41.0)
    + 0.03 * sin(11.0 * a + s * 73.0) + 0.018 * sin(17.0 * a + s * 29.0)
    + 0.17 * (c1_4 * c1_8 * c1_16) + 0.12 * (c2_4 * c2_16 * c2_16);
}`,
      replaceOnce,
      'GPU-PNT-01a PAINT_FS wob(a, s) polynomial pow28 and pow36 (eliminates up to 22 pows/texel)'
    );
    code = applyWave345Compatible(
      code,
      `    float tb = 1.0 - pow(1.0 - clamp(tn, 0.0, 1.0), 4.0);`,
      `    float it0 = 1.0 - clamp(tn, 0.0, 1.0), it2 = it0 * it0;
    float tb = 1.0 - it2 * it2;`,
      replaceOnce,
      'GPU-PNT-01b PAINT_FS body ease-out polynomial pow4'
    );
    code = applyWave345Compatible(
      code,
      `    float tsp = 1.0 - pow(1.0 - clamp(tn * 1.4, 0.0, 1.0), 3.0);`,
      `    float isp = 1.0 - clamp(tn * 1.4, 0.0, 1.0);
    float tsp = 1.0 - isp * isp * isp;`,
      replaceOnce,
      'GPU-PNT-01c PAINT_FS ray ease-out polynomial pow3'
    );
  }

  if (rel === 'src/world/levelMaterial.js') {
    // GPU-LVL-07: Hoist wFar before the 4x11 swim-wake loop and gate on gInk > 0.01 && wFar > 0.0, plus squared-distance segment culling d2 > maxD * maxD before sqrt/exp/sin/cos.
    code = applyWave345Compatible(
      code,
      `  if (gInk > 0.01) {
    // swim wakes: the ink itself ripples where a squid swims. Each trail segment sheds an expanding ripple (a stadium
    // around the path — their envelope opens into the V-wake) and the submerged body pushes up a glossy mound with a
    // small bow ridge at speed. Height field → analytic gradient in the face's tangent plane.
    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      vec4 Bd = uWakeB[s];
      if (Bd.w <= 0.0 || distance(vWPos, Bd.xyz) > Bd.w) continue;
      for (int i = 0; i < 11; i++) {
        vec4 A0 = uWake[s * 12 + i], A1 = uWake[s * 12 + i + 1];
        if (A0.w < -1.0 || A1.w < -1.0) continue;
        vec3 ab = A1.xyz - A0.xyz;
        float t = clamp(dot(vWPos - A0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        float age = uTime - mix(A0.w, A1.w, t);
        if (age <= 0.0 || age > 1.15) continue;
        vec3 D = vWPos - (A0.xyz + ab * t);
        D -= vWNorm * dot(D, vWNorm);
        float d = length(D);
        float r = 0.1 + age * 0.95, w = 0.075 + age * 0.085;
        float x = d - r;
        float env = exp(-x * x / (w * w));
        if (env < 0.003) continue;`,
      `  float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
  if (gInk > 0.01 && wFar > 0.0) {
    // swim wakes: the ink itself ripples where a squid swims. Each trail segment sheds an expanding ripple (a stadium
    // around the path — their envelope opens into the V-wake) and the submerged body pushes up a glossy mound with a
    // small bow ridge at speed. Height field → analytic gradient in the face's tangent plane.
    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      vec4 Bd = uWakeB[s];
      vec3 bDv = vWPos - Bd.xyz;
      if (Bd.w <= 0.0 || dot(bDv, bDv) > Bd.w * Bd.w) continue;
      for (int i = 0; i < 11; i++) {
        vec4 A0 = uWake[s * 12 + i], A1 = uWake[s * 12 + i + 1];
        if (A0.w < -1.0 || A1.w < -1.0) continue;
        vec3 ab = A1.xyz - A0.xyz;
        float t = clamp(dot(vWPos - A0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        float age = uTime - mix(A0.w, A1.w, t);
        if (age <= 0.0 || age > 1.15) continue;
        vec3 D = vWPos - (A0.xyz + ab * t);
        D -= vWNorm * dot(D, vWNorm);
        float r = 0.1 + age * 0.95, w = 0.075 + age * 0.085, maxD = r + w * 2.45;
        float d2 = dot(D, D);
        if (d2 > maxD * maxD) continue;
        float d = sqrt(d2);
        float x = d - r;
        float env = exp(-x * x / (w * w));
        if (env < 0.003) continue;`,
      replaceOnce,
      'GPU-LVL-07a hoist wFar gate before 4x11 swim-wake loop and cull out-of-range segments via squared distance'
    );
    if (code.includes('if (gInk > 0.01 && wFar > 0.0) {')) {
    code = applyWave345Compatible(
      code,
      `    float wl = length(wS);
    if (wl > 0.9) wS *= 0.9 / wl;
    float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
    slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
    gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;`,
      `    float wl = length(wS);
    if (wl > 0.9) wS *= 0.9 / wl;
    slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
    gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;`,
      replaceOnce,
      'GPU-LVL-07b reuse hoisted wFar after swim-wake loop'
    );
    }
  }

  if (rel === 'src/world/inkShading.js') {
    // GPU-INK-04: perturbInk zero-gradient early exit, INK_GEL dry-ink trig skip, and INK_LIGHT_MAPS unpainted clearcoat skip.
    code = applyWave345Compatible(
      code,
      `vec3 perturbInk(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos.xyz);
  vec3 vSigmaY = dFdy(surf_pos.xyz);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`,
      `vec3 perturbInk(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos.xyz);
  vec3 vSigmaY = dFdy(surf_pos.xyz);
  if (dHdxy.x == 0.0 && dHdxy.y == 0.0) return surf_norm;
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`,
      replaceOnce,
      'GPU-INK-04a perturbInk zero-gradient early exit before 2x cross and normalize'
    );
    code = applyWave345Compatible(
      code,
      `    float fr2 = gFresh * gFresh;
    gp += vec2(uTime * 0.011, -uTime * 0.007) + fr2 * 0.022 * vec2(sin(uTime * 2.3), cos(uTime * 1.9));`,
      `    float fr2 = gFresh * gFresh;
    gp += vec2(uTime * 0.011, -uTime * 0.007) + (fr2 > 0.0 ? fr2 * 0.022 * vec2(sin(uTime * 2.3), cos(uTime * 1.9)) : vec2(0.0));`,
      replaceOnce,
      'GPU-INK-04b INK_GEL skip sin/cos wobble on dry ink (fr2 == 0.0)'
    );
    code = applyWave345Compatible(
      code,
      `#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )
  // stylised wet reflections: pushed toward a neutral sheen so a blue sky never turns yellow ink olive, then tinted a
  // little by the pigment underneath (a thick coloured gel) so a grazing view keeps the team hue. The white highlights
  // on Splatoon 3 turf are reflections: thin wavy lines where the swells and splat rims sweep the mirror image across
  // something brighter than the sky. Keyed against the mean sky brightness, a narrow band just above it (the edges of
  // the clouds) comes through white and strong; the plain blue and the broad cloud cores stay a faint sheen, so the
  // team colour stays clean between the lines instead of under pale patches.
  {
    const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
    float cl = dot(clearcoatRadiance, LW);
    vec3 tint = gInkCol / max(dot(gInkCol, LW), 1e-3);
    float skyMean = dot(iblIrradiance, LW) * RECIPROCAL_PI;
    float rel = cl / max(skyMean, 1e-4), fr = fwidth(rel);
    // pixel-filtered band: where it is thinner than a pixel it widens and fades instead of breaking into dots
    float key = smoothstep(1.55 - fr, 1.65 + fr, rel) * (1.0 - smoothstep(1.9 - fr, 2.5 + fr, rel))
              * min(1.0, 0.5 / max(fr, 1e-4));
    clearcoatRadiance = mix(clearcoatRadiance, mix(vec3(cl), cl * min(tint, vec3(2.5)), 0.3 * (1.0 - key)), 0.6 * gInk);
    clearcoatRadiance *= 1.0 + gInk * (5.0 * key + 0.3 * gFresh) + gWake * 0.7;
  }
#endif`,
      `#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )
  // stylised wet reflections: pushed toward a neutral sheen so a blue sky never turns yellow ink olive, then tinted a
  // little by the pigment underneath (a thick coloured gel) so a grazing view keeps the team hue. The white highlights
  // on Splatoon 3 turf are reflections: thin wavy lines where the swells and splat rims sweep the mirror image across
  // something brighter than the sky. Keyed against the mean sky brightness, a narrow band just above it (the edges of
  // the clouds) comes through white and strong; the plain blue and the broad cloud cores stay a faint sheen, so the
  // team colour stays clean between the lines instead of under pale patches.
  {
    const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
    float cl = dot(clearcoatRadiance, LW);
    vec3 tint = gInkCol / max(dot(gInkCol, LW), 1e-3);
    float skyMean = dot(iblIrradiance, LW) * RECIPROCAL_PI;
    float rel = cl / max(skyMean, 1e-4), fr = fwidth(rel);
    // pixel-filtered band: where it is thinner than a pixel it widens and fades instead of breaking into dots
    float key = smoothstep(1.55 - fr, 1.65 + fr, rel) * (1.0 - smoothstep(1.9 - fr, 2.5 + fr, rel))
              * min(1.0, 0.5 / max(fr, 1e-4));
    if (gInk > 0.0 || gWake > 0.0) {
    clearcoatRadiance = mix(clearcoatRadiance, mix(vec3(cl), cl * min(tint, vec3(2.5)), 0.3 * (1.0 - key)), 0.6 * gInk);
    clearcoatRadiance *= 1.0 + gInk * (5.0 * key + 0.3 * gFresh) + gWake * 0.7;
    }
  }
#endif`,
      replaceOnce,
      'GPU-INK-04c INK_LIGHT_MAPS gate clearcoat environment tinting on gInk > 0.0 || gWake > 0.0'
    );
  }

  if (rel === 'src/world/environment.js') {
    // GPU-ENV-04: Polynomial pow5 Fresnel in GLSL_SEA_MARINA, SEA_FRAG, and HZ_FRAG_HAZE; gate HZ_CITY sky reflection on hzWin > 0.0; gate HZ_TERRAIN 2x vnoise2 canopy noise on wood > 0.0.
    code = applyWave345Compatible(
      code,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = min((0.025 + 0.975 * pow(1.0 - NdV, 5.0)) * 1.1, 1.0);`,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fnv1 = 1.0 - NdV, fnv2 = fnv1 * fnv1;
  float fres = min((0.025 + 0.975 * (fnv2 * fnv2 * fnv1)) * 1.1, 1.0);`,
      replaceOnce,
      'GPU-ENV-04a GLSL_SEA_MARINA polynomial pow5 Fresnel'
    );
    code = applyWave345Compatible(
      code,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.035 + 0.965 * pow(1.0 - NdV, 5.0);`,
      `  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fnv1 = 1.0 - NdV, fnv2 = fnv1 * fnv1;
  float fres = 0.035 + 0.965 * (fnv2 * fnv2 * fnv1);`,
      replaceOnce,
      'GPU-ENV-04b SEA_FRAG polynomial pow5 Fresnel'
    );
    code = applyWave345Compatible(
      code,
      `  float n1 = fbm2(tp * 0.011);
  float n2 = vnoise2(tp * 0.05) * 0.6 + vnoise2(tp * 0.17) * 0.4;
  float nt = vnoise2(tp * 0.3) * 0.55 + vnoise2(tp * 0.83 + 7.0) * 0.45;
  vec3 tint = diffuseColor.rgb;
  float slope = 1.0 - wn.y;
  vec3 grass = tint * mix(0.9, 1.08, n1);
  float wood = smoothstep(0.47, 0.62, n1 + (n2 - 0.5) * 0.3) * smoothstep(0.62, 0.3, slope) * smoothstep(1.5, 5.0, hgt);
  vec3 canopy = tint * vec3(0.5, 0.66, 0.52) * mix(0.68, 1.14, smoothstep(0.3, 0.78, nt));
  grass = mix(grass, canopy, wood * 0.92);`,
      `  float n1 = fbm2(tp * 0.011);
  float n2 = vnoise2(tp * 0.05) * 0.6 + vnoise2(tp * 0.17) * 0.4;
  vec3 tint = diffuseColor.rgb;
  float slope = 1.0 - wn.y;
  vec3 grass = tint * mix(0.9, 1.08, n1);
  float wood = smoothstep(0.47, 0.62, n1 + (n2 - 0.5) * 0.3) * smoothstep(0.62, 0.3, slope) * smoothstep(1.5, 5.0, hgt);
  if (wood > 0.0) {
    float nt = vnoise2(tp * 0.3) * 0.55 + vnoise2(tp * 0.83 + 7.0) * 0.45;
    vec3 canopy = tint * vec3(0.5, 0.66, 0.52) * mix(0.68, 1.14, smoothstep(0.3, 0.78, nt));
    grass = mix(grass, canopy, wood * 0.92);
  }`,
      replaceOnce,
      'GPU-ENV-04c HZ_TERRAIN gate 2x vnoise2 canopy noise on wood > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `#ifdef HZ_CITY
{
  // glass reflects the sky gradient (grazing angles → mirror-bright), so towers pick up the sky's colours
  vec3 wn2 = normalize(vHzNormal);
  vec3 V = normalize(vHzWorld - cameraPosition);
  vec3 Rr = reflect(V, wn2);
  float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(-V, wn2), 0.0, 1.0), 5.0);
  vec3 refl = min(skyGradient(normalize(vec3(Rr.x, max(Rr.y, 0.02), Rr.z))), vec3(1.1));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, refl * mix(0.92, 0.55, uNight), hzWin * clamp(0.18 + fres * 0.75, 0.0, 0.85) * (1.0 - uNight * 0.75));
  // dusk: the skyline across the bay settles a stop darker so its lit windows carry it (was one flat salmon glow)
  gl_FragColor.rgb *= 1.0 - 0.38 * uNight;
}
#endif`,
      `#ifdef HZ_CITY
{
  // glass reflects the sky gradient (grazing angles → mirror-bright), so towers pick up the sky's colours
  if (hzWin > 0.0) {
    vec3 wn2 = normalize(vHzNormal);
    vec3 V = normalize(vHzWorld - cameraPosition);
    vec3 Rr = reflect(V, wn2);
    float fnv1 = 1.0 - clamp(dot(-V, wn2), 0.0, 1.0), fnv2 = fnv1 * fnv1;
    float fres = 0.05 + 0.95 * (fnv2 * fnv2 * fnv1);
    vec3 refl = min(skyGradient(normalize(vec3(Rr.x, max(Rr.y, 0.02), Rr.z))), vec3(1.1));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, refl * mix(0.92, 0.55, uNight), hzWin * clamp(0.18 + fres * 0.75, 0.0, 0.85) * (1.0 - uNight * 0.75));
  }
  // dusk: the skyline across the bay settles a stop darker so its lit windows carry it (was one flat salmon glow)
  gl_FragColor.rgb *= 1.0 - 0.38 * uNight;
}
#endif`,
      replaceOnce,
      'GPU-ENV-04d HZ_FRAG_HAZE gate city sky reflection on hzWin > 0.0 and polynomial pow5 Fresnel'
    );
  }

  if (rel === 'src/world/decor.js') {
    // GPU-DEC-02: BARRIER_FRAG polynomial pow2 rim and early discard when barrier is completely invisible.
    code = applyWave345Compatible(
      code,
      `  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(max(1.0 - abs(dot(normalize(vN), V)), 0.0), 2.0);`,
      `  if (uAlpha + uPulse <= 0.0005 && vUv.y >= 0.035) discard;
  vec3 V = normalize(cameraPosition - vW);
  float rm0 = max(1.0 - abs(dot(normalize(vN), V)), 0.0);
  float rim = rm0 * rm0;`,
      replaceOnce,
      'GPU-DEC-02 BARRIER_FRAG early discard when inactive and polynomial pow2 rim'
    );
  }

  if (rel === 'src/game/character-mats.js') {
    // GPU-CHR-02: Gate 3x iwHash2 freckle noise on nose/cheek region, gate iwThin back-light pow on iwThin > 0.0, polynomial pow2/pow3 in makeSkinMaterial & GUMMY_LIGHT, and gate 2x 3D iwNoise in makeEyeMaterial on irisM > 0.0 && fl > 0.0.
    code = applyWave345Compatible(
      code,
      `          // ---- blush: soft warm gradient over the cheek apples (+ uMouth2.w flush), stronger on fair skin
          float bl = exp(-pow((abs(az) - 0.6) / 0.2, 2.0) - pow((el + 0.3) / 0.13, 2.0));
          float blushK = bl * mix(0.3, 0.12, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.72, 0.72), blushK);
          // ---- freckles across the nose bridge + cheeks
          if (uFreckle > 0.5) {
            vec2 fp = vec2(az, el + 0.12) * 42.0;
            vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;
            float rnd = iwHash2(cell);
            vec2 off = vec2(iwHash2(cell + 3.1), iwHash2(cell + 7.7)) - 0.5;
            float region = exp(-pow((abs(az) - 0.3) / 0.28, 2.0) - pow((el + 0.14) / 0.1, 2.0));
            float fd = length(fr - off * 0.5) - 0.13 * rnd;
            float fk = iwFill(fd) * step(0.45, rnd) * region;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), fk * 0.7);
          }
          // ---- nose tip + nostril rims: slightly warmer
          float nose = exp(-pow(az / 0.06, 2.0) - pow((el + 0.13) / 0.06, 2.0)) + 0.6 * exp(-pow((abs(az) - 0.045) / 0.03, 2.0) - pow((el + 0.165) / 0.025, 2.0));`,
      `          // ---- blush: soft warm gradient over the cheek apples (+ uMouth2.w flush), stronger on fair skin
          float blX = (abs(az) - 0.6) / 0.2, blY = (el + 0.3) / 0.13;
          float bl = exp(-(blX * blX) - (blY * blY));
          float blushK = bl * mix(0.3, 0.12, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.72, 0.72), blushK);
          // ---- freckles across the nose bridge + cheeks
          if (uFreckle > 0.5) {
            float frX = (abs(az) - 0.3) / 0.28, frY = (el + 0.14) / 0.1;
            float region = exp(-(frX * frX) - (frY * frY));
            if (region > 0.002) {
              vec2 fp = vec2(az, el + 0.12) * 42.0;
              vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;
              float rnd = iwHash2(cell);
              vec2 off = vec2(iwHash2(cell + 3.1), iwHash2(cell + 7.7)) - 0.5;
              float fd = length(fr - off * 0.5) - 0.13 * rnd;
              float fk = iwFill(fd) * step(0.45, rnd) * region;
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), fk * 0.7);
            }
          }
          // ---- nose tip + nostril rims: slightly warmer
          float nsX1 = az / 0.06, nsY1 = (el + 0.13) / 0.06, nsX2 = (abs(az) - 0.045) / 0.03, nsY2 = (el + 0.165) / 0.025;
          float nose = exp(-(nsX1 * nsX1) - (nsY1 * nsY1)) + 0.6 * exp(-(nsX2 * nsX2) - (nsY2 * nsY2));`,
      replaceOnce,
      'GPU-CHR-02a makeSkinMaterial gate 3x iwHash2 freckle noise on region > 0.002 and polynomial pow2 in blush/freckles/nose'
    );
    code = applyWave345Compatible(
      code,
      `          // thin parts glow when lit from behind
          float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 2.5);
          reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * uSSSTint * (iwThin * back * 0.55 + iwThin * 0.12 * clamp(-ndl + 0.3, 0.0, 1.0));`,
      `          // thin parts glow when lit from behind
          if (iwThin > 0.0) {
            float bk0 = clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0);
            float back = bk0 * bk0 * sqrt(bk0);
            reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * uSSSTint * (iwThin * back * 0.55 + iwThin * 0.12 * clamp(-ndl + 0.3, 0.0, 1.0));
          }`,
      replaceOnce,
      'GPU-CHR-02b RE_Direct_IwSkin gate thin back-scatter on iwThin > 0.0 and algebraic pow2.5'
    );
    code = applyWave345Compatible(
      code,
      `    vec3 Lb = normalize( L + N * 0.45 );
    float back = pow( clamp( dot( V, -Lb ), 0.0, 1.0 ), 3.0 );             // looking through the jelly toward the light
    vec3 tr = pow( max( iwGumTrans, vec3( 1e-4 ) ), vec3( mix( 2.1, 0.85, iwGumThin ) ) );   // Beer–Lambert: longer path → deeper
    vec3 bleed = tr * back * ( 0.12 + 2.6 * iwGumThin * iwGumThin + 0.35 * iwGumThin ) + pow( max( iwGumTrans, vec3( 1e-4 ) ), vec3( 1.8 ) ) * soak * 0.4;`,
      `    vec3 Lb = normalize( L + N * 0.45 );
    float bk0 = clamp( dot( V, -Lb ), 0.0, 1.0 );
    float back = bk0 * bk0 * bk0;                                          // looking through the jelly toward the light
    vec3 gt = max( iwGumTrans, vec3( 1e-4 ) );
    vec3 bleed = (back > 0.0 ? pow( gt, vec3( mix( 2.1, 0.85, iwGumThin ) ) ) * back * ( 0.12 + 2.6 * iwGumThin * iwGumThin + 0.35 * iwGumThin ) : vec3( 0.0 ))
               + (soak > 0.0 ? pow( gt, vec3( 1.8 ) ) * soak * 0.4 : vec3( 0.0 ));`,
      replaceOnce,
      'GPU-CHR-02c GUMMY_LIGHT cubic back-scatter and gate vec3 pow on back > 0.0 / soak > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `          float fl = iwLod(r * 24.0, 1.0);
          vec2 idr = iq / max(r, 1e-4);                                   // seam-free angular coordinate
          float fib = iwNoise(vec3(idr * 11.0, r * 4.0 + vSide * 7.0)) * 0.6 + iwNoise(vec3(idr * 27.0, r * 1.5 + vSide)) * 0.4;
          ic *= mix(1.0, mix(0.76, 1.2, fib), smoothstep(0.3, 0.7, r) * fl);
          float coll = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.47 - 0.035 * sin(ang * 9.0 + vSide)));
          ic = mix(ic, ic * 1.3 + 0.04, coll * 0.55 * fl);`,
      `          float fl = iwLod(r * 24.0, 1.0);
          if (irisM > 0.0 && fl > 0.0) {
            vec2 idr = iq / max(r, 1e-4);                                 // seam-free angular coordinate
            float fib = iwNoise(vec3(idr * 11.0, r * 4.0 + vSide * 7.0)) * 0.6 + iwNoise(vec3(idr * 27.0, r * 1.5 + vSide)) * 0.4;
            ic *= mix(1.0, mix(0.76, 1.2, fib), smoothstep(0.3, 0.7, r) * fl);
            float coll = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.47 - 0.035 * sin(ang * 9.0 + vSide)));
            ic = mix(ic, ic * 1.3 + 0.04, coll * 0.55 * fl);
          }`,
      replaceOnce,
      'GPU-CHR-02d makeEyeMaterial gate 2x 3D iwNoise (16 hashes/px) on irisM > 0.0 && fl > 0.0'
    );
  }

  if (rel === 'src/boss/bossMats.js') {
    // GPU-BOS-02: Gate boss rim emissive normalize(vViewPosition) + pow(..., bRimP) on dot(bRimC, bRimC) > 0.0, and gate STEEL roof-hatch drip noise on uDrip > 0.001.
    code = applyWave345Compatible(
      code,
      `.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n totalEmissiveRadiance += bEmis + bRimC * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), bRimP);')`,
      `.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n totalEmissiveRadiance += bEmis + (dot(bRimC, bRimC) > 0.0 ? bRimC * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), bRimP) : vec3(0.0));')`,
      replaceOnce,
      'GPU-BOS-02a gate boss rim emissive normalize(vViewPosition) + pow on dot(bRimC, bRimC) > 0.0'
    );
    code = applyWave345Compatible(
      code,
      `    // ink drips down the walls from the roof hatches + pooled along the top rail
    if (wall && pid < 2.5) {
      float cw = uv.x * 3.2; float ci = floor(cw); float cf = fract(cw);
      float h0 = bH2(vec2(ci, pid + 9.0));
      float L = (0.25 + 1.4 * h0 * h0) * uDrip * (0.92 + 0.08 * sin(uTime * 0.7 + h0 * 20.0));
      float fromTop = H - uv.y;
      float w = 0.06 + 0.05 * h0;
      float xc = 0.3 + 0.4 * bH2(vec2(ci, pid + 3.0));
      float drip = step(0.35, h0) * (1.0 - smoothstep(w * 0.8, w, abs(cf - xc) * 3.2 / (1.0 + 0.8 * smoothstep(L - 0.12, L, fromTop)))) * step(fromTop, L);
      float pool = smoothstep(0.16, 0.05, fromTop) * uDrip * smoothstep(0.3, 0.6, bN2(vec2(uv.x * 2.0, pid)));
      float ink = max(drip, pool);
      c = mix(c, uInk * 0.55, ink);
      bRough = mix(bRough, 0.08, ink); bMetal = mix(bMetal, 0.0, ink); bCC = max(bCC, ink); bCCR = 0.04;
    }`,
      `    // ink drips down the walls from the roof hatches + pooled along the top rail
    if (wall && pid < 2.5 && uDrip > 0.001) {
      float cw = uv.x * 3.2; float ci = floor(cw); float cf = fract(cw);
      float h0 = bH2(vec2(ci, pid + 9.0));
      float L = (0.25 + 1.4 * h0 * h0) * uDrip * (0.92 + 0.08 * sin(uTime * 0.7 + h0 * 20.0));
      float fromTop = H - uv.y;
      float w = 0.06 + 0.05 * h0;
      float xc = 0.3 + 0.4 * bH2(vec2(ci, pid + 3.0));
      float drip = step(0.35, h0) * (1.0 - smoothstep(w * 0.8, w, abs(cf - xc) * 3.2 / (1.0 + 0.8 * smoothstep(L - 0.12, L, fromTop)))) * step(fromTop, L);
      float pool = smoothstep(0.16, 0.05, fromTop) * uDrip * smoothstep(0.3, 0.6, bN2(vec2(uv.x * 2.0, pid)));
      float ink = max(drip, pool);
      c = mix(c, uInk * 0.55, ink);
      bRough = mix(bRough, 0.08, ink); bMetal = mix(bMetal, 0.0, ink); bCC = max(bCC, ink); bCCR = 0.04;
    }`,
      replaceOnce,
      'GPU-BOS-02b gate STEEL roof-hatch drip noise on uDrip > 0.001'
    );
  }

  if (rel === 'src/game/lobbySet-mats.js') {
    // GPU-LOB-02: Gate decal wear lsF + lsN (20 hashes/px) on d.a > 0.001, gate 5-tap planar reflection textureLod blur on k > 0.001 with polynomial pow5, polynomial pow4 in neonMaterial, and early discard transparent steam border before 3x lsF (48 hashes/px).
    code = applyWave345Compatible(
      code,
      `  if (vDec.z > 0.5) {
    vec4 d = texture2D(tDecal, vDec.xy);
    if (mod(vDec.z + 0.5, 2.0) < 1.0) d.rg = d.gr;
    float wear = smoothstep(0.45, 0.85, lsF(vUvM * 2.3 + 11.0)) * 0.75 + smoothstep(0.5, 0.9, lsN(vUvM * 14.0)) * 0.25;
    float cov = d.a * (1.0 - wear * 0.8);
    if (vDec.z > 2.5 && cov < 0.08) discard;
    vec3 paint = uTeamA * d.r * 0.85 + uTeamB * d.g * 0.85 + vec3(0.72) * d.b;
    base = mix(base, paint * mix(1.0, 0.8, gr), cov);
    gRough = mix(gRough, 0.5, cov * 0.7);
    gNS *= 1.0 - 0.5 * cov;
  }`,
      `  if (vDec.z > 0.5) {
    vec4 d = texture2D(tDecal, vDec.xy);
    if (vDec.z > 2.5 && d.a < 0.08) discard;
    if (d.a > 0.001) {
      if (mod(vDec.z + 0.5, 2.0) < 1.0) d.rg = d.gr;
      float wear = smoothstep(0.45, 0.85, lsF(vUvM * 2.3 + 11.0)) * 0.75 + smoothstep(0.5, 0.9, lsN(vUvM * 14.0)) * 0.25;
      float cov = d.a * (1.0 - wear * 0.8);
      if (vDec.z > 2.5 && cov < 0.08) discard;
      vec3 paint = uTeamA * d.r * 0.85 + uTeamB * d.g * 0.85 + vec3(0.72) * d.b;
      base = mix(base, paint * mix(1.0, 0.8, gr), cov);
      gRough = mix(gRough, 0.5, cov * 0.7);
      gNS *= 1.0 - 0.5 * cov;
    }
  }`,
      replaceOnce,
      'GPU-LOB-02a surfaceMaterial gate decal wear lsF + lsN (20 hashes/px) on d.a > 0.001'
    );
    code = applyWave345Compatible(
      code,
      `  if (uReflOn > 0.5) {
    vec4 rp = uReflMat * vec4(vLsW, 1.0);
    vec3 nw = (vec4(normal, 0.0) * viewMatrix).xyz;          // view → world normal
    vec2 ruv = rp.xy / rp.w + nw.xz * vec2(0.05, 0.08) * (1.0 - gWater * 0.6);
    float lod = mix(3.2, 0.2, gWater);
    float sp = mix(0.018, 0.003, gWater);
    vec3 rc = textureLod(tRefl, ruv, lod).rgb * 0.36
            + (textureLod(tRefl, ruv + vec2(0.0, sp), lod).rgb + textureLod(tRefl, ruv - vec2(0.0, sp), lod).rgb) * 0.22
            + (textureLod(tRefl, ruv + vec2(0.0, sp * 2.6), lod + 0.6).rgb + textureLod(tRefl, ruv - vec2(0.0, sp * 2.6), lod + 0.6).rgb) * 0.1;
    float NdV = saturate(dot(normal, geometryViewDir));
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    float k = clamp(gWater + gDamp * 0.5 + gInk * 0.5, 0.0, 1.0);
    reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, rc * F * mix(0.8, 1.0, gWater), k);
  }`,
      `  float kRefl = clamp(gWater + gDamp * 0.5 + gInk * 0.5, 0.0, 1.0);
  if (uReflOn > 0.5 && kRefl > 0.001) {
    vec4 rp = uReflMat * vec4(vLsW, 1.0);
    vec3 nw = (vec4(normal, 0.0) * viewMatrix).xyz;          // view → world normal
    vec2 ruv = rp.xy / rp.w + nw.xz * vec2(0.05, 0.08) * (1.0 - gWater * 0.6);
    float lod = mix(3.2, 0.2, gWater);
    float sp = mix(0.018, 0.003, gWater);
    vec3 rc = textureLod(tRefl, ruv, lod).rgb * 0.36
            + (textureLod(tRefl, ruv + vec2(0.0, sp), lod).rgb + textureLod(tRefl, ruv - vec2(0.0, sp), lod).rgb) * 0.22
            + (textureLod(tRefl, ruv + vec2(0.0, sp * 2.6), lod + 0.6).rgb + textureLod(tRefl, ruv - vec2(0.0, sp * 2.6), lod + 0.6).rgb) * 0.1;
    float NdV = saturate(dot(normal, geometryViewDir));
    float fnv1 = 1.0 - NdV, fnv2 = fnv1 * fnv1;
    float F = 0.02 + 0.98 * (fnv2 * fnv2 * fnv1);
    reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, rc * F * mix(0.8, 1.0, gWater), kRefl);
  }`,
      replaceOnce,
      'GPU-LOB-02b groundMaterial gate 5-tap planar reflection textureLod on kRefl > 0.001 and polynomial pow5 Fresnel'
    );
    code = applyWave345Compatible(
      code,
      `        vec3 col = c * I * (0.45 + 0.55 * f) + vec3(1.0) * I * 0.4 * pow(f, 4.0) + c * 0.06;`,
      `        float f2 = f * f;
        vec3 col = c * I * (0.45 + 0.55 * f) + vec3(1.0) * I * 0.4 * (f2 * f2) + c * 0.06;`,
      replaceOnce,
      'GPU-LOB-02c neonMaterial polynomial pow4 core'
    );
    code = applyWave345Compatible(
      code,
      `      void main() {
        vec2 p = vUv * vec2(1.6, 3.0); float t = uTime * 0.35 + vSeed * 7.0;
        vec2 q = vec2(lsF(p + vec2(0.0, -t)), lsF(p * 1.3 + vec2(3.1, -t * 1.3)));
        float n = lsF(p * 1.1 + q * 1.4 + vec2(vSeed * 3.0, -t * 0.8));
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.35, vUv.y);`,
      `      void main() {
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        if (edge <= 0.001) discard;
        vec2 p = vUv * vec2(1.6, 3.0); float t = uTime * 0.35 + vSeed * 7.0;
        vec2 q = vec2(lsF(p + vec2(0.0, -t)), lsF(p * 1.3 + vec2(3.1, -t * 1.3)));
        float n = lsF(p * 1.1 + q * 1.4 + vec2(vSeed * 3.0, -t * 0.8));`,
      replaceOnce,
      'GPU-LOB-02d steamMaterial early discard transparent border before 3x 4-octave lsF (48 hashes/px)'
    );
  }

  // ============================================================================
  // WAVE 11 ULTIMATE ZERO-HEADROOM WHOLE-GAME GPU OPTIMIZATIONS
  // ============================================================================
  if (rel === 'src/world/texlib.js') {
    // GPU-TXL-01a: Worley 3x3 cell loop squared distance (eliminates 72 sqrt calls per baked texel across 4x2 Worley passes).
    code = applyWave345Compatible(
      code,
      `vec4 worR(WReq q) {
  if (q.n.x == 0) return vec4(0.0);
  vec2 x = q.uv * vec2(q.n); ivec2 i = ivec2(floor(x)); vec2 f = x - vec2(i);
  float F1 = 9.0, F2 = 9.0, id = 0.0, id2 = 0.0;
  for (int y = -uOne; y <= uOne; y++) for (int xx = -uOne; xx <= uOne; xx++) {
    ivec2 c = ivec2(xx, y); ivec2 w = wrp(i + c, q.n);
    vec2 o = vec2(c) + 0.5 + (hf2(w, q.seed) - 0.5) * q.jit;
    float d = length(o - f);
    if (d < F1) { F2 = F1; F1 = d; id2 = id; id = hf(w, q.seed + 7u); } else if (d < F2) { F2 = d; }
  }
  return vec4(F1, F2, id, id2);
}`,
      `vec4 worR(WReq q) {
  if (q.n.x == 0) return vec4(0.0);
  vec2 x = q.uv * vec2(q.n); ivec2 i = ivec2(floor(x)); vec2 f = x - vec2(i);
  float F1 = 81.0, F2 = 81.0, id = 0.0, id2 = 0.0;
  for (int y = -uOne; y <= uOne; y++) for (int xx = -uOne; xx <= uOne; xx++) {
    ivec2 c = ivec2(xx, y); ivec2 w = wrp(i + c, q.n);
    vec2 df = vec2(c) + 0.5 + (hf2(w, q.seed) - 0.5) * q.jit - f;
    float d = dot(df, df);
    if (d < F1) { F2 = F1; F1 = d; id2 = id; id = hf(w, q.seed + 7u); } else if (d < F2) { F2 = d; }
  }
  return vec4(sqrt(F1), sqrt(F2), id, id2);
}`,
      replaceOnce,
      'GPU-TXL-01a texlib worR 3x3 loop squared distance (eliminates 72 sqrts/texel)'
    );

    // GPU-TXL-01b: texlibPerturbNormal zero-strength / flat-normal early exit.
    code = applyWave345Compatible(
      code,
      `vec3 texlibPerturbNormal(vec3 nTS, vec3 T, vec3 B, vec3 N, float strength) {
  return normalize(T * (nTS.x * strength) + B * (nTS.y * strength) + N * nTS.z);
}`,
      `vec3 texlibPerturbNormal(vec3 nTS, vec3 T, vec3 B, vec3 N, float strength) {
  if (strength == 0.0 || (nTS.x == 0.0 && nTS.y == 0.0)) return normalize(N * nTS.z);
  return normalize(T * (nTS.x * strength) + B * (nTS.y * strength) + N * nTS.z);
}`,
      replaceOnce,
      'GPU-TXL-01b texlibPerturbNormal zero-strength/flat early return'
    );

    // GPU-TXL-01c..q: Replace 21 integer pow(..., 2.0/3.0) calls across procedural PBR material shaders.
    code = applyWave345Compatible(
      code,
      `  h += (0.0007 * (1.0 - pow((ly - PW * 0.5) / (PW * 0.5), 2.0)) + 0.00011 * streak - 0.00006 * lines) * (1.0 - gap);`,
      `  float lyN = (ly - PW * 0.5) / (PW * 0.5);
  h += (0.0007 * (1.0 - lyN * lyN) + 0.00011 * streak - 0.00006 * lines) * (1.0 - gap);`,
      replaceOnce,
      'GPU-TXL-01c planks crown pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float rib = exp(-pow((abs(lp.y) - 0.333) / 0.022, 2.0)) * smoothstep(0.03, 0.09, e);
  float ry = -0.9 + 0.2 * clamp(floor((lp.y + 1.0) / 0.2), 0.0, 9.0);
  float d1 = length(vec2(abs(lp.x) - 0.465, lp.y - ry));
  float rx = -0.4 + 0.2 * clamp(floor((lp.x + 0.5) / 0.2), 0.0, 4.0);
  float d2 = length(vec2(lp.x - rx, abs(lp.y) - 0.965));
  float rd = min(d1, d2);
  float rv = 1.0 - aa(0.0065, rd);
  float dome = sqrt(max(1.0 - pow(rd / 0.0065, 2.0), 0.0));`,
      `  float rb0 = (abs(lp.y) - 0.333) / 0.022;
  float rib = exp(-(rb0 * rb0)) * smoothstep(0.03, 0.09, e);
  float ry = -0.9 + 0.2 * clamp(floor((lp.y + 1.0) / 0.2), 0.0, 9.0);
  float d1 = length(vec2(abs(lp.x) - 0.465, lp.y - ry));
  float rx = -0.4 + 0.2 * clamp(floor((lp.x + 0.5) / 0.2), 0.0, 4.0);
  float d2 = length(vec2(lp.x - rx, abs(lp.y) - 0.965));
  float rd = min(d1, d2), rdN = rd / 0.0065;
  float rv = 1.0 - aa(0.0065, rd);
  float dome = sqrt(max(1.0 - rdN * rdN, 0.0));`,
      replaceOnce,
      'GPU-TXL-01d metalpanel rib and dome pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float crestEdge = exp(-pow((a - 0.045) / 0.007, 2.0));
  float troughEdge = exp(-pow((a - 0.105) / 0.009, 2.0));`,
      `  float ce0 = (a - 0.045) / 0.007, te0 = (a - 0.105) / 0.009;
  float crestEdge = exp(-(ce0 * ce0));
  float troughEdge = exp(-(te0 * te0));`,
      replaceOnce,
      'GPU-TXL-01e corrugated crestEdge/troughEdge pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float hb = -0.0026 * pow(clamp(db / 0.01, 0.0, 1.0), 2.0) - 0.0005 * (0.5 + 0.5 * cos(TAU * P.x / 0.0125)) * smoothstep(0.0075, 0.0, db);
  float hc = -0.003 - 0.002 * pow(clamp(dc / 0.007, 0.0, 1.0), 2.0);`,
      `  float dbN = clamp(db / 0.01, 0.0, 1.0), dcN = clamp(dc / 0.007, 0.0, 1.0);
  float hb = -0.0026 * (dbN * dbN) - 0.0005 * (0.5 + 0.5 * cos(TAU * P.x / 0.0125)) * smoothstep(0.0075, 0.0, db);
  float hc = -0.003 - 0.002 * (dcN * dcN);`,
      replaceOnce,
      'GPU-TXL-01f grate bar profile pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float bulge = (1.0 - pow(lp.x / 0.125, 2.0)) * (1.0 - pow(lp.y / 0.05, 2.0));
  vec3 cb = vec3(0.79) * (1.0 + 0.1 * (hid - 0.5)) * (1.0 + 0.025 * sand + 0.02 * mott) * (1.0 - 0.1 * pit);
  cb *= 1.0 - 0.04 * clamp(1.0 - (e - 0.005) / 0.01, 0.0, 1.0) * (1.0 - inM);
  vec3 mort = vec3(0.9) * (1.0 + 0.05 * n[2]);
  s.alb = mix(cb, mort, inM);
  s.h = pr.x + (0.0005 * bulge * hid2 + 0.00012 * sand - 0.0008 * pit) * (1.0 - inM) + inM * 0.0008 * (pow(clamp(e / 0.005, 0.0, 1.0), 2.0) - 1.0);`,
      `  float lpxN = lp.x / 0.125, lpyN = lp.y / 0.05, eM = clamp(e / 0.005, 0.0, 1.0);
  float bulge = (1.0 - lpxN * lpxN) * (1.0 - lpyN * lpyN);
  vec3 cb = vec3(0.79) * (1.0 + 0.1 * (hid - 0.5)) * (1.0 + 0.025 * sand + 0.02 * mott) * (1.0 - 0.1 * pit);
  cb *= 1.0 - 0.04 * clamp(1.0 - (e - 0.005) / 0.01, 0.0, 1.0) * (1.0 - inM);
  vec3 mort = vec3(0.9) * (1.0 + 0.05 * n[2]);
  s.alb = mix(cb, mort, inM);
  s.h = pr.x + (0.0005 * bulge * hid2 + 0.00012 * sand - 0.0008 * pit) * (1.0 - inM) + inM * 0.0008 * (eM * eM - 1.0);`,
      replaceOnce,
      'GPU-TXL-01g brick bulge and mortar pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float inner = exp(-pow((e - 0.016) / 0.004, 2.0));`,
      `  float in0 = (e - 0.016) / 0.004;
  float inner = exp(-(in0 * in0));`,
      replaceOnce,
      'GPU-TXL-01h tile inner rim pow2'
    );
    code = applyWave345Compatible(
      code,
      `  h = mix(h, -0.0004 + 0.00025 * sqrt(max(1.0 - pow(sd / 0.0042, 2.0), 0.0)), screw);`,
      `  float sdN = sd / 0.0042;
  h = mix(h, -0.0004 + 0.00025 * sqrt(max(1.0 - sdN * sdN, 0.0)), screw);`,
      replaceOnce,
      'GPU-TXL-01i decking screw dome pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float toe = max(exp(-pow((dW - 0.011) / 0.004, 2.0)), exp(-pow((dB - 0.011) / 0.004, 2.0)));   // paint pools at the weld toes
  float dL = abs(y - 1.6);
  float seamL = 1.0 - aa(0.001, dL);
  const float RP = 3.2 / 36.0;
  float rd = length(vec2(abs(mod(x, RP) - RP * 0.5), abs(dL - 0.036)));
  float riv = 1.0 - aa(0.0105, rd);
  float dome = sqrt(max(1.0 - pow(rd / 0.0105, 2.0), 0.0));`,
      `  float twW = (dW - 0.011) / 0.004, twB = (dB - 0.011) / 0.004;
  float toe = max(exp(-(twW * twW)), exp(-(twB * twB)));   // paint pools at the weld toes
  float dL = abs(y - 1.6);
  float seamL = 1.0 - aa(0.001, dL);
  const float RP = 3.2 / 36.0;
  float rd = length(vec2(abs(mod(x, RP) - RP * 0.5), abs(dL - 0.036))), rdN = rd / 0.0105;
  float riv = 1.0 - aa(0.0105, rd);
  float dome = sqrt(max(1.0 - rdN * rdN, 0.0));`,
      replaceOnce,
      'GPU-TXL-01j hullpaint weld toe and rivet dome pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float rim = exp(-pow((r - 0.064) / 0.004, 2.0));`,
      `  float rm0 = (r - 0.064) / 0.004;
  float rim = exp(-(rm0 * rm0));`,
      replaceOnce,
      'GPU-TXL-01k hull fitting rim pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float ridge = exp(-pow((e - 0.005) / 0.002, 2.0));`,
      `  float rg0 = (e - 0.005) / 0.002;
  float ridge = exp(-(rg0 * rg0));`,
      replaceOnce,
      'GPU-TXL-01l gelcoat seam ridge pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float sr = 0.0018 + 0.004 * pow(fract(sc.z * 13.1), 3.0) + 0.006 * step(0.985, fract(sc.z * 29.3));`,
      `  float scf = fract(sc.z * 13.1);
  float sr = 0.0018 + 0.004 * (scf * scf * scf) + 0.006 * step(0.985, fract(sc.z * 29.3));`,
      replaceOnce,
      'GPU-TXL-01m yard speck radius pow3'
    );
    code = applyWave345Compatible(
      code,
      `  float foot = exp(-pow((a - ar - 0.004) / 0.007, 2.0));`,
      `  float ft0 = (a - ar - 0.004) / 0.007;
  float foot = exp(-(ft0 * ft0));`,
      replaceOnce,
      'GPU-TXL-01n stair riser foot pow2'
    );
    code = applyWave345Compatible(
      code,
      `  s.cav = (1.0 - 0.35 * exp(-pow((a - ar) / 0.006, 2.0))) * (1.0 - 0.18 * lbase);`,
      `  float cv0 = (a - ar) / 0.006;
  s.cav = (1.0 - 0.35 * exp(-(cv0 * cv0))) * (1.0 - 0.18 * lbase);`,
      replaceOnce,
      'GPU-TXL-01o stair riser cavity pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float gl = exp(-pow((a - ar - 0.003) / 0.006, 2.0));`,
      `  float gl0 = (a - ar - 0.003) / 0.006;
  float gl = exp(-(gl0 * gl0));`,
      replaceOnce,
      'GPU-TXL-01p stonestep grime line pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float hCl = 0.028 * sqrt(max(1.0 - pow(1.0 - clamp(ce / 0.007, 0.0, 1.0), 2.0), 0.0));`,
      `  float ceN = 1.0 - clamp(ce / 0.007, 0.0, 1.0);
  float hCl = 0.028 * sqrt(max(1.0 - ceN * ceN, 0.0));`,
      replaceOnce,
      'GPU-TXL-01q rampboard cleat profile pow2'
    );
    code = applyWave345Compatible(
      code,
      `  s.cav = mix(1.0, 0.35, gap) * (1.0 - 0.15 * dirt) * (1.0 - 0.55 * exp(-pow((ce + 0.003) / 0.005, 2.0)) * (1.0 - cl));`,
      `  float rc0 = (ce + 0.003) / 0.005;
  s.cav = mix(1.0, 0.35, gap) * (1.0 - 0.15 * dirt) * (1.0 - 0.55 * exp(-(rc0 * rc0)) * (1.0 - cl));`,
      replaceOnce,
      'GPU-TXL-01r rampboard cleat cavity pow2'
    );
    code = applyWave345Compatible(
      code,
      `  float rib = pow(0.5 + 0.5 * cos(TAU * (lx - 0.0075) / 0.015), 3.0) * smoothstep(0.004, 0.009, eS);
  float cy = P.y - (floor(P.y / PD) + 0.5) * PD;
  float ce = 0.0175 - abs(cy);
  float cl = smoothstep(-PX, PX, ce);
  float hCl = 0.018 * sqrt(max(1.0 - pow(1.0 - clamp(ce / 0.005, 0.0, 1.0), 2.0), 0.0));
  float bd = length(vec2(lx - PW * 0.5, cy));
  float bolt = (1.0 - aa(0.0065, bd)) * cl;
  float bdome = sqrt(max(1.0 - pow(bd / 0.0065, 2.0), 0.0));`,
      `  float rbG = 0.5 + 0.5 * cos(TAU * (lx - 0.0075) / 0.015);
  float rib = (rbG * rbG * rbG) * smoothstep(0.004, 0.009, eS);
  float cy = P.y - (floor(P.y / PD) + 0.5) * PD;
  float ce = 0.0175 - abs(cy);
  float cl = smoothstep(-PX, PX, ce);
  float ceG = 1.0 - clamp(ce / 0.005, 0.0, 1.0);
  float hCl = 0.018 * sqrt(max(1.0 - ceG * ceG, 0.0));
  float bd = length(vec2(lx - PW * 0.5, cy)), bdN = bd / 0.0065;
  float bolt = (1.0 - aa(0.0065, bd)) * cl;
  float bdome = sqrt(max(1.0 - bdN * bdN, 0.0));`,
      replaceOnce,
      'GPU-TXL-01s gangdeck rib pow3 and cleat/bolt pow2'
    );
    code = applyWave345Compatible(
      code,
      `  s.cav = mix(1.0, 0.55, ps.y * (1.0 - cl)) * (1.0 - 0.2 * (1.0 - rib) * (1.0 - cl)) * (1.0 - 0.3 * exp(-pow((ce + 0.0015) / 0.002, 2.0)));`,
      `  float gc0 = (ce + 0.0015) / 0.002;
  s.cav = mix(1.0, 0.55, ps.y * (1.0 - cl)) * (1.0 - 0.2 * (1.0 - rib) * (1.0 - cl)) * (1.0 - 0.3 * exp(-(gc0 * gc0)));`,
      replaceOnce,
      'GPU-TXL-01t gangdeck cavity pow2'
    );
  }

  if (rel === 'src/world/environment.js') {
    // GPU-ENV-05a: Gate sun glow pow(sd, uGlowParams.x) + polynomial pow6 in skyGradient on sd > 0.0 (skips pow on 50% of sky/reflection/haze pixels!).
    code = applyWave345Compatible(
      code,
      `  float sd = max(dot(normalize(vec3(d.x, hp, d.z)), uSunDir), 0.0);
  c += uGlowColor * (pow(sd, uGlowParams.x) * uGlowParams.y + pow(sd, 6.0) * uGlowParams.w);`,
      `  float sd = max(dot(normalize(vec3(d.x, hp, d.z)), uSunDir), 0.0);
  if (sd > 0.0) {
    float sd2 = sd * sd;
    c += uGlowColor * (pow(sd, uGlowParams.x) * uGlowParams.y + (sd2 * sd2 * sd2) * uGlowParams.w);
  }`,
      replaceOnce,
      'GPU-ENV-05a skyGradient gate sun glow pow on sd > 0.0 and polynomial pow6'
    );

    // GPU-ENV-05b: SKY_FRAG gate pow(sd, 1400.0) on sd > 0.0 and replace pow(sd, 64.0) in ENV_PASS with 6 squarings gated on sd > 0.0.
    code = applyWave345Compatible(
      code,
      `#ifndef ENV_PASS
  // ---- sun disk + tight halo (HDR → blooms) ----
  float aa = 0.00012;
  float disk = smoothstep(uSunCos - aa, uSunCos + aa, sd);
  col += uSunDisk * disk * (1.0 - cloudA * 0.94);
  col += uSunDisk * 0.02 * pow(max(sd, 0.0), 1400.0) * (1.0 - cloudA * 0.6);
#else
  // env map: soft sun lobe only (a tiny HDR disk would sparkle in rough mips)
  col += uGlowColor * pow(max(sd, 0.0), 64.0) * 1.2;
  col *= 0.72;
#endif`,
      `#ifndef ENV_PASS
  // ---- sun disk + tight halo (HDR → blooms) ----
  if (sd > 0.0) {
    float aa = 0.00012;
    float disk = smoothstep(uSunCos - aa, uSunCos + aa, sd);
    col += uSunDisk * disk * (1.0 - cloudA * 0.94);
    col += uSunDisk * 0.02 * pow(sd, 1400.0) * (1.0 - cloudA * 0.6);
  }
#else
  // env map: soft sun lobe only (a tiny HDR disk would sparkle in rough mips)
  if (sd > 0.0) {
    float sd2 = sd * sd, sd4 = sd2 * sd2, sd8 = sd4 * sd4, sd16 = sd8 * sd8, sd32 = sd16 * sd16;
    col += uGlowColor * (sd32 * sd32) * 1.2;
  }
  col *= 0.72;
#endif`,
      replaceOnce,
      'GPU-ENV-05b SKY_FRAG gate sun disk pow1400 on sd > 0.0 and polynomial pow64 in ENV_PASS'
    );

    // GPU-ENV-05c: STRIP_FRAG cellEdge 3x3 Voronoi squared distance (eliminates 14 sqrts/px) and gate caustic on fall > 0.002.
    code = applyWave345Compatible(
      code,
      `float cellEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 h = hash22s(i + g);
    vec2 o = 0.5 + 0.4 * sin(t * (0.7 + 0.6 * h) + 6.2831 * h.yx);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}`,
      `float cellEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 64.0, d2 = 64.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 h = hash22s(i + g);
    vec2 df = g + 0.5 + 0.4 * sin(t * (0.7 + 0.6 * h) + 6.2831 * h.yx) - f;
    float d = dot(df, df);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}`,
      replaceOnce,
      'GPU-ENV-05c1 STRIP_FRAG cellEdge 3x3 loop squared distance'
    );
    code = applyWave345Compatible(
      code,
      `  if (facing > 0.002) {
    float lit = getShadowMask();
    if (lit > 0.002) {
      float c = caustic(vPw.xz, uTime, 0.02 + max(h, 0.0) * 0.1);
      float fall = exp(-max(h, 0.0) * 0.8) * smoothstep(-0.02, 0.05, h);
      vec3 alb = max(vInfo.rgb, vec3(0.12));
      add = uSunLight * alb * (c * 0.06) * facing * lit * fall * uStripK.x;
    }
  }`,
      `  float fall = exp(-max(h, 0.0) * 0.8) * smoothstep(-0.02, 0.05, h);
  if (facing > 0.002 && fall > 0.002 && uStripK.x > 0.001) {
    float lit = getShadowMask();
    if (lit > 0.002) {
      float c = caustic(vPw.xz, uTime, 0.02 + max(h, 0.0) * 0.1);
      vec3 alb = max(vInfo.rgb, vec3(0.12));
      add = uSunLight * alb * (c * 0.06) * facing * lit * fall * uStripK.x;
    }
  }`,
      replaceOnce,
      'GPU-ENV-05c2 STRIP_FRAG gate shadow and 18-cell caustic evaluation on fall > 0.002'
    );

    // GPU-ENV-05d: LighthouseBeam early discard in daytime (uNight <= 0.001) and polynomial pow2.
    code = applyWave345Compatible(
      code,
      `      fragmentShader: /* glsl */\`uniform float uNight; uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vV;
        void main(){ float e = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0); float a = e * pow(max(1.0 - vA, 0.0), 1.6) * smoothstep(0.0, 0.03, vA) * 0.5 * uNight;`,
      `      fragmentShader: /* glsl */\`uniform float uNight; uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vV;
        void main(){ if (uNight <= 0.001) discard; float e0 = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); float e = e0 * e0; float a = e * pow(max(1.0 - vA, 0.0), 1.6) * smoothstep(0.0, 0.03, vA) * 0.5 * uNight;`,
      replaceOnce,
      'GPU-ENV-05d LighthouseBeam early discard when uNight <= 0.001 and polynomial pow2'
    );
  }

  if (rel === 'src/fx/screenfx.js') {
    // GPU-SFX-03: Polynomial pow64, pow18, pow2 in inkShade; polynomial pow2 in uBlast; gate vnoise on v > 0.0 and pow3 in uSwim; polynomial pow80 and pow70 in LensInk water & flood sheet.
    code = applyWave345Compatible(
      code,
      `    float spec = pow(clamp(dot(n, H), 0.0, 1.0), 64.0);
    float spec2 = pow(clamp(dot(n, normalize(vec3(0.5, -0.3, 0.8))), 0.0, 1.0), 18.0);
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);`,
      `    float nh0 = clamp(dot(n, H), 0.0, 1.0), nh2 = nh0 * nh0, nh4 = nh2 * nh2, nh8 = nh4 * nh4, nh16 = nh8 * nh8, nh32 = nh16 * nh16;
    float spec = nh32 * nh32;
    float ns0 = clamp(dot(n, vec3(0.50507627, -0.30304576, 0.80812204)), 0.0, 1.0), ns2 = ns0 * ns0, ns4 = ns2 * ns2, ns8 = ns4 * ns4, ns16 = ns8 * ns8;
    float spec2 = ns2 * ns16;
    float fnz = 1.0 - clamp(n.z, 0.0, 1.0);
    float fres = fnz * fnz;`,
      replaceOnce,
      'GPU-SFX-03a inkShade polynomial pow64, pow18, pow2 and pre-normalized secondary light dir'
    );
    code = applyWave345Compatible(
      code,
      `      float ring = exp(-pow((bl - uBlastRing) * 18.0, 2.0));`,
      `      float brd = (bl - uBlastRing) * 18.0;
      float ring = exp(-(brd * brd));`,
      replaceOnce,
      'GPU-SFX-03b uBlast ring polynomial pow2'
    );
    code = applyWave345Compatible(
      code,
      `    if (uSwim.a > 0.001) {
      float v = smoothstep(0.35, 1.05, r);
      col = mix(col, col * (0.55 + uSwim.rgb * 0.9), v * 0.45 * uSwim.a);
      float cst = vnoise(q * 16.0 + vec2(uTime * 0.7, -uTime * 0.4)) * vnoise(q * 21.0 - vec2(uTime * 0.5, uTime * 0.6));
      col += uSwim.rgb * pow(cst, 3.0) * 1.6 * uSwim.a * v;
    }`,
      `    if (uSwim.a > 0.001 && r > 0.35) {
      float v = smoothstep(0.35, 1.05, r);
      col = mix(col, col * (0.55 + uSwim.rgb * 0.9), v * 0.45 * uSwim.a);
      float cst = vnoise(q * 16.0 + vec2(uTime * 0.7, -uTime * 0.4)) * vnoise(q * 21.0 - vec2(uTime * 0.5, uTime * 0.6));
      col += uSwim.rgb * (cst * cst * cst) * 1.6 * uSwim.a * v;
    }`,
      replaceOnce,
      'GPU-SFX-03c uSwim gate 2x vnoise (8 hashes/px) on r > 0.35 and polynomial pow3'
    );
    code = applyWave345Compatible(
      code,
      `        float spec = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 80.0);`,
      `        float sp0 = clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), sp2 = sp0 * sp0, sp4 = sp2 * sp2, sp8 = sp4 * sp4, sp16 = sp8 * sp8, sp32 = sp16 * sp16, sp64 = sp32 * sp32;
        float spec = sp16 * sp64;`,
      replaceOnce,
      'GPU-SFX-03d LensInk water droplet polynomial pow80'
    );
    code = applyWave345Compatible(
      code,
      `          float spec = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 70.0);`,
      `          float sp0 = clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), sp2 = sp0 * sp0, sp4 = sp2 * sp2, sp8 = sp4 * sp4, sp16 = sp8 * sp8, sp32 = sp16 * sp16, sp64 = sp32 * sp32;
          float spec = sp2 * sp4 * sp64;`,
      replaceOnce,
      'GPU-SFX-03e uFloodClear water sheet polynomial pow70'
    );
  }

  if (rel === 'src/game/weapons.js') {
    // GPU-WPN-01a/b: Gate vertex tail pow(u, 1.3) on back > 0.5, cubic Fresnel rim in makeBlobMaterial, and early discard in RIBBON_FRAG before 2x iwN and 3x exp.
    code = applyWave345Compatible(
      code,
      `          float tau = mix(1.0, 1.0 - 0.42 * pow(u, 1.3), back);       // tail taper (soft, rounded tip)`,
      `          float tau = back > 0.5 ? (1.0 - 0.42 * pow(u, 1.3)) : 1.0;  // tail taper (soft, rounded tip)`,
      replaceOnce,
      'GPU-WPN-01a makeBlobMaterial gate vertex pow(u, 1.3) on back > 0.5'
    );
    code = applyWave345Compatible(
      code,
      `          float iwRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`,
      `          float iwR0 = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
          float iwRim = iwR0 * iwR0 * iwR0;`,
      replaceOnce,
      'GPU-WPN-01b makeBlobMaterial cubic Fresnel rim'
    );
    code = applyWave345Compatible(
      code,
      `  if (uMode < 0.5) {
    // fired shot: tracer front races out, white-hot core snaps off, the ink sheath breaks into dashes as it goes
    float t = uT;
    float front = t * 1100.0;
    float drawn = smoothstep(front + 0.6, front - 0.6, m);
    float head = exp(-max(0.0, front - m) * 0.8) * (1.0 - smoothstep(0.02, 0.05, t));
    float k0 = -0.35 + 1.5 * (t / uLife);
    float br = iwN(m * 1.9 - t * 7.0) * 0.72 + iwN(m * 6.3 + 3.1) * 0.28;
    float keep = smoothstep(k0, k0 + 0.3, br);
    float ca = core * min(1.0, exp(-t * 11.0) * 1.3 + head);
    float ga = glow * 0.85 * exp(-t * 4.5) * keep;
    vec3 hot = mix(uColor, vec3(1.0), 0.6) * (2.2 + 3.2 * uCharge + 3.0 * head);
    col = uColor * (1.05 + 0.5 * uCharge) * ga + hot * ca;
    a = clamp(ga + ca, 0.0, 1.0);
    col /= max(a, 1e-3);
    a *= drawn * smoothstep(0.0, 0.3, m) * smoothstep(uLen + 0.05, uLen - 0.12, m);
  }`,
      `  if (uMode < 0.5) {
    // fired shot: tracer front races out, white-hot core snaps off, the ink sheath breaks into dashes as it goes
    float t = uT;
    float front = t * 1100.0;
    float drawn = smoothstep(front + 0.6, front - 0.6, m) * smoothstep(0.0, 0.3, m) * smoothstep(uLen + 0.05, uLen - 0.12, m);
    if (drawn <= 0.0005) discard;
    float head = exp(-max(0.0, front - m) * 0.8) * (1.0 - smoothstep(0.02, 0.05, t));
    float k0 = -0.35 + 1.5 * (t / uLife);
    float br = iwN(m * 1.9 - t * 7.0) * 0.72 + iwN(m * 6.3 + 3.1) * 0.28;
    float keep = smoothstep(k0, k0 + 0.3, br);
    float ca = core * min(1.0, exp(-t * 11.0) * 1.3 + head);
    float ga = glow * 0.85 * exp(-t * 4.5) * keep;
    vec3 hot = mix(uColor, vec3(1.0), 0.6) * (2.2 + 3.2 * uCharge + 3.0 * head);
    col = uColor * (1.05 + 0.5 * uCharge) * ga + hot * ca;
    a = clamp(ga + ca, 0.0, 1.0);
    col /= max(a, 1e-3);
    a *= drawn;
  }`,
      replaceOnce,
      'GPU-WPN-01c RIBBON_FRAG early discard before 2x iwN and 3x exp on charger shot trails'
    );
  }

  if (rel === 'src/game/character-weapons.js') {
    // GPU-WPN-01d: makeCoilMaterial polynomial pow2.
    code = applyWave345Compatible(
      code,
      `          float edge = exp(-pow((uCharge - vSeg + 0.05) * 11.0, 2.0)) * (1.0 - uFull);`,
      `          float ce0 = (uCharge - vSeg + 0.05) * 11.0;
          float edge = exp(-(ce0 * ce0)) * (1.0 - uFull);`,
      replaceOnce,
      'GPU-WPN-01d makeCoilMaterial polynomial pow2'
    );
  }

  if (rel === 'src/game/character.js') {
    // GPU-CHR-03a: Pre-normalize constant camera-side fill vector in withRim and gate rim pow on dot(uIwRim.rgb, uIwRim.rgb) > 0.0.
    code = applyWave345Compatible(
      code,
      `        vec3 iwV = normalize(vViewPosition);
        float iwF = pow(1.0 - clamp(dot(normal, iwV), 0.0, 1.0), uIwRim.w);
        float iwS = clamp(dot(normal, uIwRimL) * 0.5 + 0.5, 0.0, 1.0);
        outgoingLight += uIwRim.rgb * (\${k.toFixed(3)} * iwF * (0.3 + 0.7 * iwS * iwS));
        // soft camera-side fill (a big bounce card above the lens): lifts faces out of low / back-lit sun
        float iwFl = clamp(dot(normal, normalize(vec3(0.25, 0.45, 1.0))) * 0.6 + 0.4, 0.0, 1.0);
        outgoingLight += uIwFill * diffuseColor.rgb * iwFl * iwFl;`,
      `        if (dot(uIwRim.rgb, uIwRim.rgb) > 0.0) {
          vec3 iwV = normalize(vViewPosition);
          float iwF = pow(1.0 - clamp(dot(normal, iwV), 0.0, 1.0), uIwRim.w);
          float iwS = clamp(dot(normal, uIwRimL) * 0.5 + 0.5, 0.0, 1.0);
          outgoingLight += uIwRim.rgb * (\${k.toFixed(3)} * iwF * (0.3 + 0.7 * iwS * iwS));
        }
        // soft camera-side fill (a big bounce card above the lens): lifts faces out of low / back-lit sun
        float iwFl = clamp(dot(normal, normalize(vec3(0.25, 0.45, 1.0))) * 0.6 + 0.4, 0.0, 1.0);
        outgoingLight += uIwFill * diffuseColor.rgb * iwFl * iwFl;`,
      replaceOnce,
      'GPU-CHR-03a character.js withRim gate rim pow and pre-normalize fill direction'
    );
  }

  if (rel === 'src/game/character-mats.js') {
    // GPU-CHR-03b..l: Gate iwTeeCrease on crLod > 0.0, gate getGlassMaterial gauge on back strip, gate getPlasticMaterial satin noise on LOD, and replace all 17 remaining integer/half-integer pow calls!
    code = applyWave345Compatible(
      code,
      `        } else if (iwSub > 11.5 && iwSub < 12.5) {        // tongue
          float groove = exp(-pow(vIwUv.x / 0.12, 2.0));`,
      `        } else if (iwSub > 11.5 && iwSub < 12.5) {        // tongue
          float tgX = vIwUv.x / 0.12;
          float groove = exp(-(tgX * tgX));`,
      replaceOnce,
      'GPU-CHR-03b makeSkinMaterial tongue groove pow2'
    );
    code = applyWave345Compatible(
      code,
      `float iwTeeCrease(vec3 p, float th) {
  float ax = abs(p.x), h = 0.0;
  float side = pow(abs(sin(th * 6.2831)), 2.0);
  float wy = (p.y - 0.705) / 0.0105 + 0.6 * sin(th * 6.2831 * 9.0 + p.y * 40.0);
  h += 0.00032 * side * exp(-pow((p.y - 0.765) / 0.035, 2.0)) * (0.5 + 0.5 * sin(wy * 6.2831));
  vec2 q = vec2(ax - 0.114, p.y - 0.884);
  float r = length(q), ang = atan(q.y, -q.x);
  h += 0.00011 * sin(ang * 17.0 + 1.3 + (p.z > 0.0 ? 0.0 : 2.1) + 2.5 * iwNoise(vec3(ang * 3.0, r * 60.0, p.z * 20.0))) * exp(-pow(r / 0.045, 2.0)) * smoothstep(0.006, 0.02, r) * (0.4 + 0.6 * iwNoise(p * 90.0));
  h += 0.00028 * sin(th * 6.2831 * 23.0 + 2.0 * sin(th * 30.0)) * (1.0 - smoothstep(0.698, 0.726, p.y));
  return h;
}`,
      `float iwTeeCrease(vec3 p, float th) {
  float ax = abs(p.x), h = 0.0;
  float snT = sin(th * 6.2831), side = snT * snT;
  float wy = (p.y - 0.705) / 0.0105 + 0.6 * sin(th * 6.2831 * 9.0 + p.y * 40.0), pyN = (p.y - 0.765) / 0.035;
  h += 0.00032 * side * exp(-(pyN * pyN)) * (0.5 + 0.5 * sin(wy * 6.2831));
  vec2 q = vec2(ax - 0.114, p.y - 0.884);
  float r = length(q), rN = r / 0.045;
  if (r > 0.006 && r < 0.135) {
    float ang = atan(q.y, -q.x);
    h += 0.00011 * sin(ang * 17.0 + 1.3 + (p.z > 0.0 ? 0.0 : 2.1) + 2.5 * iwNoise(vec3(ang * 3.0, r * 60.0, p.z * 20.0))) * exp(-(rN * rN)) * smoothstep(0.006, 0.02, r) * (0.4 + 0.6 * iwNoise(p * 90.0));
  }
  h += 0.00028 * sin(th * 6.2831 * 23.0 + 2.0 * sin(th * 30.0)) * (1.0 - smoothstep(0.698, 0.726, p.y));
  return h;
}`,
      replaceOnce,
      'GPU-CHR-03c iwTeeCrease polynomial pow2 and gate 2x 3D iwNoise (16 hashes/px) on underarm radius band'
    );
    code = applyWave345Compatible(
      code,
      `              float seam = iwStroke(dx, 0.0008);
              iwH -= 0.0005 * exp(-pow(dx / 0.0016, 2.0));
              float st = iwStroke(abs(dx) - 0.004, 0.0005) * iwDash(p.y, 0.0055, 0.6);
              base *= 1.0 - 0.12 * seam;
              base = mix(base, base * 0.8, st * iwLod(p.y, 0.0055));
              iwH += 0.00025 * st;
            }
            // double-needle hem stitching + hem fold
            float hy = p.y - vCloth.z;
            float st2 = (iwStroke(hy - 0.013, 0.0005) + iwStroke(hy - 0.019, 0.0005)) * iwDash(th * circ, 0.0055, 0.62);
            base = mix(base, base * 0.8, st2 * iwLod(th * circ, 0.0055));
            iwH += 0.0003 * st2 - 0.0006 * exp(-pow((hy - 0.024) / 0.002, 2.0));
            // fine creases riding on the sculpted folds (geometry carries the big ones): waist compression, underarm
            // crease fans, short vertical hem creases — per pixel, faded with footprint
            iwH += iwTeeCrease(p, th) * iwLod(p.y, 0.012);`,
      `              float seam = iwStroke(dx, 0.0008), dxN = dx / 0.0016;
              iwH -= 0.0005 * exp(-(dxN * dxN));
              float st = iwStroke(abs(dx) - 0.004, 0.0005) * iwDash(p.y, 0.0055, 0.6);
              base *= 1.0 - 0.12 * seam;
              base = mix(base, base * 0.8, st * iwLod(p.y, 0.0055));
              iwH += 0.00025 * st;
            }
            // double-needle hem stitching + hem fold
            float hy = p.y - vCloth.z, hyN = (hy - 0.024) / 0.002;
            float st2 = (iwStroke(hy - 0.013, 0.0005) + iwStroke(hy - 0.019, 0.0005)) * iwDash(th * circ, 0.0055, 0.62);
            base = mix(base, base * 0.8, st2 * iwLod(th * circ, 0.0055));
            iwH += 0.0003 * st2 - 0.0006 * exp(-(hyN * hyN));
            // fine creases riding on the sculpted folds (geometry carries the big ones): waist compression, underarm
            // crease fans, short vertical hem creases — per pixel, faded with footprint
            float crLod = iwLod(p.y, 0.012);
            if (crLod > 0.0) iwH += iwTeeCrease(p, th) * crLod;`,
      replaceOnce,
      'GPU-CHR-03d makeClothMaterial gate iwTeeCrease on crLod > 0.0 and polynomial pow2 in tee seams'
    );
    code = applyWave345Compatible(
      code,
      `            // tank-strap pressure shading on the shoulders (strap sits on top)
            iwAO *= 1.0 - 0.18 * exp(-pow((abs(p.x) - 0.075) / 0.018, 2.0)) * smoothstep(0.9, 0.98, p.y);`,
      `            // tank-strap pressure shading on the shoulders (strap sits on top)
            float shN = (abs(p.x) - 0.075) / 0.018;
            iwAO *= 1.0 - 0.18 * exp(-(shN * shN)) * smoothstep(0.9, 0.98, p.y);`,
      replaceOnce,
      'GPU-CHR-03e makeClothMaterial shoulder strap AO pow2'
    );
    code = applyWave345Compatible(
      code,
      `            float dxs = iwPart == 4.0 ? min(abs(dx0), abs(dx1)) : abs(th - 0.5) * circ;   // legs: uv.x 0 = inseam, 0.5 = outer seam
            iwH -= 0.0005 * exp(-pow(dxs / 0.0016, 2.0));
            float stripe = 0.0; vec3 stripeC = uTeam;
            if (uPattern > 0.5 && uPattern < 2.5) stripe = iwStroke(dxs, 0.0065);
            else if (uPattern > 7.5 && uPattern < 8.5) stripe = iwStroke(dxs, 0.011);                                   // jersey: wide team panel
            else if (uPattern > 8.5) { stripe = iwStroke(dxs - 0.0075, 0.0026); stripeC = vec3(0.95); }                // track: twin white stripes
            base = mix(base, stripeC, stripe);
            float ss = iwStroke(dxs - 0.0045, 0.00045) * iwDash(p.y, 0.005, 0.6);
            base = mix(base, base * 0.75 + 0.02, ss * iwLod(p.y, 0.005));
            if (iwPart == 4.0) {
              vec2 f = vec2(p.x, p.y);
              // front: fly J-stitch + slant pocket openings
              if (p.z > 0.0) {
                float fly = iwSdSeg(f, vec2(0.012, 0.745), vec2(0.012, 0.64));
                fly = min(fly, iwSdSeg(f, vec2(0.012, 0.64), vec2(0.0, 0.625)));
                float fs = iwStroke(fly, 0.0005) * iwDash(p.y + p.x, 0.005, 0.6);
                base = mix(base, base * 0.72 + 0.02, fs * iwLod(p.y, 0.005));
                iwH -= 0.0006 * exp(-pow(abs(p.x) / 0.0018, 2.0)) * step(0.63, p.y);
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pk = iwSdSeg(f, vec2(sx * 0.062, 0.752), vec2(sx * 0.112, 0.668));
                  iwH -= 0.0009 * exp(-pow(pk / 0.0018, 2.0));
                  float ps = iwStroke(pk - 0.004, 0.00045) * iwDash(p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.25 * exp(-pow(pk / 0.003, 2.0));
                }
              } else {
                // back patch pockets with a little team label on the right one
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pb = iwSdBox(f - vec2(sx * 0.058, 0.668), vec2(0.036, 0.04), 0.01);
                  iwH += 0.0008 * (1.0 - smoothstep(-0.002, 0.0015, pb));
                  float ps = (iwStroke(pb + 0.0035, 0.00045)) * iwDash(p.x + p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.3 * exp(-pow(pb / 0.0022, 2.0)) * step(0.0, pb);
                  if (s < 0) { float lab = iwSdBox(f - vec2(sx * 0.03, 0.692), vec2(0.006, 0.012), 0.002); base = mix(base, uTeam, iwFill(lab)); }
                }
                // seat seam
                iwH -= 0.0006 * exp(-pow(p.x / 0.0017, 2.0));
              }
              // waistband stitch (mostly under the tee hem)
              float ws = iwStroke(p.y - 0.735, 0.0005) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.75, ws);
            } else {
              // leg: inseam
              float dxi = min(th, 1.0 - th) * circ;
              iwH -= 0.0004 * exp(-pow(dxi / 0.0015, 2.0));`,
      `            float dxs = iwPart == 4.0 ? min(abs(dx0), abs(dx1)) : abs(th - 0.5) * circ, dxsN = dxs / 0.0016;   // legs: uv.x 0 = inseam, 0.5 = outer seam
            iwH -= 0.0005 * exp(-(dxsN * dxsN));
            float stripe = 0.0; vec3 stripeC = uTeam;
            if (uPattern > 0.5 && uPattern < 2.5) stripe = iwStroke(dxs, 0.0065);
            else if (uPattern > 7.5 && uPattern < 8.5) stripe = iwStroke(dxs, 0.011);                                   // jersey: wide team panel
            else if (uPattern > 8.5) { stripe = iwStroke(dxs - 0.0075, 0.0026); stripeC = vec3(0.95); }                // track: twin white stripes
            base = mix(base, stripeC, stripe);
            float ss = iwStroke(dxs - 0.0045, 0.00045) * iwDash(p.y, 0.005, 0.6);
            base = mix(base, base * 0.75 + 0.02, ss * iwLod(p.y, 0.005));
            if (iwPart == 4.0) {
              vec2 f = vec2(p.x, p.y);
              // front: fly J-stitch + slant pocket openings
              if (p.z > 0.0) {
                float fly = iwSdSeg(f, vec2(0.012, 0.745), vec2(0.012, 0.64));
                fly = min(fly, iwSdSeg(f, vec2(0.012, 0.64), vec2(0.0, 0.625)));
                float fs = iwStroke(fly, 0.0005) * iwDash(p.y + p.x, 0.005, 0.6), pxN = p.x / 0.0018;
                base = mix(base, base * 0.72 + 0.02, fs * iwLod(p.y, 0.005));
                iwH -= 0.0006 * exp(-(pxN * pxN)) * step(0.63, p.y);
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pk = iwSdSeg(f, vec2(sx * 0.062, 0.752), vec2(sx * 0.112, 0.668)), pkN1 = pk / 0.0018, pkN2 = pk / 0.003;
                  iwH -= 0.0009 * exp(-(pkN1 * pkN1));
                  float ps = iwStroke(pk - 0.004, 0.00045) * iwDash(p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.25 * exp(-(pkN2 * pkN2));
                }
              } else {
                // back patch pockets with a little team label on the right one
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pb = iwSdBox(f - vec2(sx * 0.058, 0.668), vec2(0.036, 0.04), 0.01), pbN = pb / 0.0022;
                  iwH += 0.0008 * (1.0 - smoothstep(-0.002, 0.0015, pb));
                  float ps = (iwStroke(pb + 0.0035, 0.00045)) * iwDash(p.x + p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.3 * exp(-(pbN * pbN)) * step(0.0, pb);
                  if (s < 0) { float lab = iwSdBox(f - vec2(sx * 0.03, 0.692), vec2(0.006, 0.012), 0.002); base = mix(base, uTeam, iwFill(lab)); }
                }
                // seat seam
                float sxN = p.x / 0.0017;
                iwH -= 0.0006 * exp(-(sxN * sxN));
              }
              // waistband stitch (mostly under the tee hem)
              float ws = iwStroke(p.y - 0.735, 0.0005) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.75, ws);
            } else {
              // leg: inseam
              float dxi = min(th, 1.0 - th) * circ, dxiN = dxi / 0.0015;
              iwH -= 0.0004 * exp(-(dxiN * dxiN));`,
      replaceOnce,
      'GPU-CHR-03f makeClothMaterial shorts seams and pockets polynomial pow2'
    );
    code = applyWave345Compatible(
      code,
      `      h += 0.0007 * exp(-pow(md / 0.003, 2.0)) - 0.0005 * seam + 0.0002 * st;`,
      `      float mdN = md / 0.003;
      h += 0.0007 * exp(-(mdN * mdN)) - 0.0005 * seam + 0.0002 * st;`,
      replaceOnce,
      'GPU-CHR-03g HAT_GLSL snapback seam pow2'
    );
    code = applyWave345Compatible(
      code,
      `    h -= 0.0011 * exp(-pow((v - 0.2) / 0.006, 2.0));                    // fold of the cuff
    ao *= 1.0 - 0.32 * exp(-pow((v - 0.206) / 0.012, 2.0));`,
      `    float cf1 = (v - 0.2) / 0.006, cf2 = (v - 0.206) / 0.012;
    h -= 0.0011 * exp(-(cf1 * cf1));                                    // fold of the cuff
    ao *= 1.0 - 0.32 * exp(-(cf2 * cf2));`,
      replaceOnce,
      'GPU-CHR-03h HAT_GLSL beanie cuff fold pow2'
    );
    code = applyWave345Compatible(
      code,
      `            float groove = pow(1.0 - abs(bundles), 6.0) * crown;`,
      `            float gb0 = 1.0 - abs(bundles), gb2 = gb0 * gb0;
            float groove = (gb2 * gb2 * gb2) * crown;`,
      replaceOnce,
      'GPU-CHR-03i makeHairMaterial scalp cap groove pow6'
    );
    code = applyWave345Compatible(
      code,
      `              float dl = length(dv) - L.z * (1.0 + 0.9 * pow(max(0.0, cos(atan(dv.y, dv.x) - tipA)), 5.0));`,
      `              float lc0 = max(0.0, cos(atan(dv.y, dv.x) - tipA)), lc2 = lc0 * lc0;
              float dl = length(dv) - L.z * (1.0 + 0.9 * (lc2 * lc2 * lc0));`,
      replaceOnce,
      'GPU-CHR-03j makeEyeMaterial lash contact shadow pow5'
    );
    code = applyWave345Compatible(
      code,
      `          float iwTick = 0.0;
          {
            // etched gauge on the back face: a scale spine with ticks every 10 % (majors every 20 %)
            vec3 q = vIwPos;
            float ang = atan(q.x, -q.z);                 // 0 = straight back
            float s = ang * 0.068;                       // metres around the glass
            float inStrip = step(abs(q.y), 0.0745) * step(0.0, -q.z);
            float yv = (q.y + 0.074) / 0.0148;
            float yd = abs(fract(yv + 0.5) - 0.5) * 0.0148;
            float aa = max(fwidth(yd), 1e-5);
            float tickLine = 1.0 - smoothstep(0.00045 - aa, 0.00045 + aa, yd);
            float major = mod(floor(yv + 0.5), 2.0) < 0.5 ? 1.0 : 0.0;
            float len = major > 0.5 ? 0.009 : 0.0048;
            float tick = tickLine * step(0.004, s) * step(s, 0.004 + len);
            float sa = max(fwidth(s), 1e-5);
            float spine = 1.0 - smoothstep(0.0004 - sa, 0.0004 + sa, abs(s - 0.004));
            float tick2 = tick; float spine2 = spine;
            iwTick = clamp(max(tick2, spine2) * inStrip, 0.0, 1.0);
          }
        \`,
        fOpaque: /* glsl */\`
          {
            float fr = pow(1.0 - saturate(dot(normalize(geometryNormal), normalize(geometryViewDir))), 2.5);`,
      `          float iwTick = 0.0;
          {
            vec3 q = vIwPos;
            float ang = atan(q.x, -q.z);                 // 0 = straight back
            float s = ang * 0.068;                       // metres around the glass
            float yv = (q.y + 0.074) / 0.0148;
            float yd = abs(fract(yv + 0.5) - 0.5) * 0.0148;
            float aa = max(fwidth(yd), 1e-5);
            float sa = max(fwidth(s), 1e-5);
            if (vIwPos.z < 0.0 && abs(vIwPos.y) <= 0.0745) {
            float tickLine = 1.0 - smoothstep(0.00045 - aa, 0.00045 + aa, yd);
            float major = mod(floor(yv + 0.5), 2.0) < 0.5 ? 1.0 : 0.0;
            float len = major > 0.5 ? 0.009 : 0.0048;
            float tick = tickLine * step(0.004, s) * step(s, 0.004 + len);
            float spine = 1.0 - smoothstep(0.0004 - sa, 0.0004 + sa, abs(s - 0.004));
            iwTick = clamp(max(tick, spine), 0.0, 1.0);
            }
          }
        \`,
        fOpaque: /* glsl */\`
          {
            float fr0 = 1.0 - saturate(dot(normalize(geometryNormal), normalize(geometryViewDir)));
            float fr = fr0 * fr0 * sqrt(fr0);`,
      replaceOnce,
      'GPU-CHR-03k getGlassMaterial gate etched gauge on back strip and algebraic pow2.5 Fresnel'
    );
    code = applyWave345Compatible(
      code,
      `          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);`,
      `          float fr0 = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
          float fres = fr0 * fr0 * fr0;`,
      replaceOnce,
      'GPU-CHR-03l makeSquidMaterial ghost cubic Fresnel'
    );
    code = applyWave345Compatible(
      code,
      `          } else if (iwM == 0.0) {            // satin: faint moulding texture
            iwH += 0.00004 * (iwNoise(vWPos * 1400.0) - 0.5) * iwLod(vWPos.y * 1400.0, 1.0);
          }`,
      `          } else if (iwM == 0.0) {            // satin: faint moulding texture
            float satLod = iwLod(vWPos.y * 1400.0, 1.0);
            if (satLod > 0.0) iwH += 0.00004 * (iwNoise(vWPos * 1400.0) - 0.5) * satLod;
          }`,
      replaceOnce,
      'GPU-CHR-03m getPlasticMaterial gate 3D iwNoise (8 hashes/px) on satLod > 0.0'
    );
  }

  if (rel === 'src/boss/bossMats.js') {
    // GPU-BOS-03a/b/c: Replace 3x pow in STEEL tear flap with 2x mul + 2x sqrt; gate CARA bFbm(P * 2.6 + 9.0) (24 hashes/px) on uDrip > 0.001 && ex < 9.5 && cls <= 0.5 and gate CARA Voronoi cracks (60 hashes/px) on tone < 0.55; gate EYE strie (2x atan + 2x sin) on iris > 0.0 inside uEyeMode < 0.5.
    code = applyWave345Compatible(
      code,
      `      float r = pow(pow(abs(d.x), 4.0) + pow(abs(d.y), 4.0), 0.25);`,
      `        float dx2 = d.x * d.x, dy2 = d.y * d.y;
        float r = sqrt(sqrt(dx2 * dx2 + dy2 * dy2));`,
      replaceOnce,
      'GPU-BOS-03a STEEL tear flap replace 3x pow with 2x mul + 2x sqrt'
    );
    code = applyWave345Compatible(
      code,
      `  inkM = max(inkM, smoothstep(0.78, 0.84, bFbm(P * 2.6 + 9.0)) * uDrip * step(0.5, 1.0 - step(9.5, ex)) * step(cls, 0.5));
  c = mix(c, uInk * 0.32, inkM); bRough = mix(bRough, 0.06, inkM); bCCR = mix(bCCR, 0.03, inkM); bSheen *= 1.0 - inkM;
  // crusher charge veins (slam telegraph) — ink colour
  float cw = (ex > 0.2 && ex < 1.5) ? ex : 0.0;
  if (cw > 0.0) {
    // a few fat fissures that light up (not a net): ridged noise at low frequency, masked to the upper carapace
    float rv = abs(bNoise(P * 2.3 + 5.0) * 2.0 - 1.0);
    float veins = bLine(rv, 0.03) * smoothstep(0.35, 0.65, bNoise(P * 1.1 + 2.0)) + 0.4 * bLine(abs(bNoise(P * 5.5 + 9.0) * 2.0 - 1.0), 0.02) * smoothstep(0.6, 0.8, bNoise(P * 1.7));
    float g = uGlowL * cw;
    c = mix(c, vec3(0.02, 0.01, 0.02), g * veins * 0.8);
    bEmis += uInk * (veins * 10.0 + 0.03) * g + vec3(1.0) * veins * g * g * 0.6; bRimC += uInk * 0.5 * g;
  }
  // phase cracks: carapace fracture lines glowing in the weak-point colour
  if (uCrack > 0.001 && cls < 0.5) {`,
      `  if (uDrip > 0.001 && ex < 9.5 && cls <= 0.5) {
    inkM = max(inkM, smoothstep(0.78, 0.84, bFbm(P * 2.6 + 9.0)) * uDrip);
  }
  c = mix(c, uInk * 0.32, inkM); bRough = mix(bRough, 0.06, inkM); bCCR = mix(bCCR, 0.03, inkM); bSheen *= 1.0 - inkM;
  // crusher charge veins (slam telegraph) — ink colour
  float cw = (ex > 0.2 && ex < 1.5) ? ex : 0.0;
  if (cw > 0.0 && uGlowL > 0.001) {
    // a few fat fissures that light up (not a net): ridged noise at low frequency, masked to the upper carapace
    float rv = abs(bNoise(P * 2.3 + 5.0) * 2.0 - 1.0);
    float veins = bLine(rv, 0.03) * smoothstep(0.35, 0.65, bNoise(P * 1.1 + 2.0)) + 0.4 * bLine(abs(bNoise(P * 5.5 + 9.0) * 2.0 - 1.0), 0.02) * smoothstep(0.6, 0.8, bNoise(P * 1.7));
    float g = uGlowL * cw;
    c = mix(c, vec3(0.02, 0.01, 0.02), g * veins * 0.8);
    bEmis += uInk * (veins * 10.0 + 0.03) * g + vec3(1.0) * veins * g * g * 0.6; bRimC += uInk * 0.5 * g;
  }
  // phase cracks: carapace fracture lines glowing in the weak-point colour
  if (uCrack > 0.001 && cls < 0.5) {`,
      replaceOnce,
      'GPU-BOS-03b CARA gate bFbm ink splash, uGlowL crusher veins (32 hashes/px), and Voronoi cracks (60 hashes/px)'
    );
    code = applyWave345Compatible(
      code,
      `  float strie = 0.7 + 0.3 * sin(atan(q.y, q.x) * 26.0 + ang * 12.0) * sin(atan(q.y, q.x) * 7.0);
  vec3 dark = vec3(0.006, 0.005, 0.01);
  vec3 c = dark;
  float glow = uEyeGlow;
  vec3 E = vec3(0.0);
  if (uEyeMode < 0.5) {
    // slit pupil (horizontal bar), dilates a touch while enraged
    // vertical slit pupil, dilates while enraged; the iris burns brightest at its rim
    float pw = 0.07 + 0.05 * uEnrage, ph = 0.36;
    float pup = 1.0 - smoothstep(0.0, 0.08, max(abs(q.x) / pw, abs(q.y) / ph) - 1.0);
    float halo = (1.0 - smoothstep(0.0, 0.1, max(abs(q.x) / (pw + 0.05), abs(q.y) / (ph + 0.05)) - 1.0)) * (1.0 - pup);   // hot rim hugging the slit
    float lit = iris * (1.0 - pup) * (1.0 - limbal * 0.75);
    E = uWeak * lit * (0.55 + 1.5 * ring * strie + 1.4 * halo) * glow + vec3(1.0, 0.85, 0.6) * halo * lit * 0.35 * glow;`,
      `  vec3 dark = vec3(0.006, 0.005, 0.01);
  vec3 c = dark;
  float glow = uEyeGlow;
  vec3 E = vec3(0.0);
  if (uEyeMode < 0.5) {
    // slit pupil (horizontal bar), dilates a touch while enraged
    // vertical slit pupil, dilates while enraged; the iris burns brightest at its rim
    float pw = 0.07 + 0.05 * uEnrage, ph = 0.36;
    float pup = 1.0 - smoothstep(0.0, 0.08, max(abs(q.x) / pw, abs(q.y) / ph) - 1.0);
    float halo = (1.0 - smoothstep(0.0, 0.1, max(abs(q.x) / (pw + 0.05), abs(q.y) / (ph + 0.05)) - 1.0)) * (1.0 - pup);   // hot rim hugging the slit
    float lit = iris * (1.0 - pup) * (1.0 - limbal * 0.75);
    float qa = iris > 0.0 ? atan(q.y, q.x) : 0.0;
    float strie = iris > 0.0 ? (0.7 + 0.3 * sin(qa * 26.0 + ang * 12.0) * sin(qa * 7.0)) : 0.7;
    E = uWeak * lit * (0.55 + 1.5 * ring * strie + 1.4 * halo) * glow + vec3(1.0, 0.85, 0.6) * halo * lit * 0.35 * glow;`,
      replaceOnce,
      'GPU-BOS-03c EYE gate strie atan + 2x sin on uEyeMode < 0.5 && iris > 0.0'
    );
  }

  if (rel === 'src/game/lobbySet.js') {
    // GPU-LOB-03: Replace pow(abs(dot(normalize(vN), normalize(vV))), 2.0) with dnv * dnv in _volumes lamp cones.
    code = applyWave345Compatible(
      code,
      `      fragmentShader: 'uniform vec3 uCol; varying float vF; varying vec3 vN; varying vec3 vV; void main() { float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = e * smoothstep(0.0, 0.15, vF) * (1.0 - vF * 0.85); gl_FragColor = vec4(uCol * a, 1.0); }',`,
      `      fragmentShader: 'uniform vec3 uCol; varying float vF; varying vec3 vN; varying vec3 vV; void main() { float dnv = dot(normalize(vN), normalize(vV)); float e = dnv * dnv; float a = e * smoothstep(0.0, 0.15, vF) * (1.0 - vF * 0.85); gl_FragColor = vec4(uCol * a, 1.0); }',`,
      replaceOnce,
      'GPU-LOB-03 lobbySet _volumes lamp cone polynomial pow2'
    );
  }

  if (rel === 'src/game/showcase.js') {
    // GPU-SHW-01: Replace 2x pow(..., 2.0) in makeSparkMaterial with squared multiplies.
    code = applyWave345Compatible(
      code,
      `        float rays = exp(-abs(p.y) * 30.0) * pow(max(0.0, 1.0 - abs(p.x)), 2.0) + exp(-abs(p.x) * 30.0) * pow(max(0.0, 1.0 - abs(p.y)), 2.0);`,
      `        float rx = max(0.0, 1.0 - abs(p.x)), ry = max(0.0, 1.0 - abs(p.y));
        float rays = exp(-abs(p.y) * 30.0) * (rx * rx) + exp(-abs(p.x) * 30.0) * (ry * ry);`,
      replaceOnce,
      'GPU-SHW-01 showcase makeSparkMaterial polynomial pow2'
    );
  }

  if (rel === 'src/boss/bossHazards.js') {
    // GPU-BHZ-01: Early discard invisible boss hazard lanes and rings when uAlpha <= 0.001 or vUv.y >= 1.0.
    code = applyWave345Compatible(
      code,
      `void main() {
  float edge = smoothstep(0.08, 0.0, min(vUv.x, 1.0 - vUv.x));`,
      `void main() {
  if (uAlpha <= 0.001 || vUv.y >= 1.0) discard;
  float edge = smoothstep(0.08, 0.0, min(vUv.x, 1.0 - vUv.x));`,
      replaceOnce,
      'GPU-BHZ-01 bossHazards LANE_FRAG early discard when inactive or past end'
    );
  }

    return adaptWholeGpuComposedEpochs(rel, code, replaceOnce);
}

// Exact composed epochs retain the earlier queue owners and visual tuning.
function adaptWholeGpuComposedEpochs(rel, code, replaceOnce) {
  if (rel === "src/world/inkShading.js") code = applyWave345Compatible(code,
    `      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float d = length(D);
      float x = d - front;
      float sg = Qr.y * 0.8;
      if (x > sg * 3.0 || x < -Qr.y * 4.0) continue;`,
    `      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float sg = Qr.y * 0.8;
      float maxD = front + sg * 3.0, minD = front - Qr.y * 4.0;
      float d2 = dot(D, D);
      if (d2 > maxD * maxD || (minD > 0.0 && d2 < minD * minD)) continue;
      float d = sqrt(d2);
      float x = d - front;`, replaceOnce, "GPU-INK-03c packed ripple table keeps its active-count owner and gains squared-distance rejection");
  if (rel === "src/world/levelMaterial.js") code = applyWave345Compatible(code,
    `  float keep = max((vFaceData.x > 4.5 && vFaceData.x < 5.5) ? 0.55 : 0.0, gTexKeep);
  nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm, gTexStr * (1.0 - gInk * (1.0 - max(keep, gInkKeep))));`,
    `  float keep = max((vFaceData.x > 4.5 && vFaceData.x < 5.5) ? 0.55 : 0.0, gTexKeep);
  float tStr = gTexStr * (1.0 - gInk * (1.0 - max(keep, gInkKeep)));
  if (tStr != 0.0) nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm, tStr);`, replaceOnce, "GPU-LVL-06 composed relief normal epoch");
  if (rel === "src/world/levelMaterial.js") code = applyWave345Compatible(code,
    `  if (gInk > 0.01) {
    // swim wakes: the ink itself ripples where a squid swims. Each trail segment sheds an expanding ripple (a stadium
    // around the path — their envelope opens into the V-wake) and the submerged body pushes up a glossy mound with a
    // small bow ridge at speed. Height field → analytic gradient in the face's tangent plane.
    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      if (s >= uWakeCount) break;
      vec4 Bd = uWakeB[s];
      vec3 dWake = vWPos - Bd.xyz;
      if (Bd.w <= 0.0 || dot(dWake, dWake) > Bd.w * Bd.w) continue;
      for (int i = 0; i < 11; i++) {
        vec4 A0 = uWake[s * 12 + i], A1 = uWake[s * 12 + i + 1];
        if (A0.w < -1.0 || A1.w < -1.0) continue;
        vec3 ab = A1.xyz - A0.xyz;
        float t = clamp(dot(vWPos - A0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        float age = uTime - mix(A0.w, A1.w, t);
        if (age <= 0.0 || age > 1.15) continue;
        vec3 D = vWPos - (A0.xyz + ab * t);
        D -= vWNorm * dot(D, vWNorm);
        float d = length(D);
        float r = 0.08 + age * 0.35, w = 0.045 + age * 0.055;
        float x = d - r;
        float env = exp(-x * x / (w * w));
        if (env < 0.003) continue;`,
    `  float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
  if (gInk > 0.01 && wFar > 0.0) {
    // swim wakes: the ink itself ripples where a squid swims. Each trail segment sheds an expanding ripple (a stadium
    // around the path — their envelope opens into the V-wake) and the submerged body pushes up a glossy mound with a
    // small bow ridge at speed. Height field → analytic gradient in the face's tangent plane.
    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      if (s >= uWakeCount) break;
      vec4 Bd = uWakeB[s];
      vec3 dWake = vWPos - Bd.xyz;
      if (Bd.w <= 0.0 || dot(dWake, dWake) > Bd.w * Bd.w) continue;
      for (int i = 0; i < 11; i++) {
        vec4 A0 = uWake[s * 12 + i], A1 = uWake[s * 12 + i + 1];
        if (A0.w < -1.0 || A1.w < -1.0) continue;
        vec3 ab = A1.xyz - A0.xyz;
        float t = clamp(dot(vWPos - A0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        float age = uTime - mix(A0.w, A1.w, t);
        if (age <= 0.0 || age > 1.15) continue;
        vec3 D = vWPos - (A0.xyz + ab * t);
        D -= vWNorm * dot(D, vWNorm);
        float r = 0.08 + age * 0.35, w = 0.045 + age * 0.055, maxD = r + w * 2.45;
        float d2 = dot(D, D);
        if (d2 > maxD * maxD) continue;
        float d = sqrt(d2);
        float x = d - r;
        float env = exp(-x * x / (w * w));
        if (env < 0.003) continue;`, replaceOnce, "GPU-LVL-07a composed wake bounds preserve the tuned radius and wavelength");
  if (rel === "src/world/levelMaterial.js" && code.includes('if (gInk > 0.01 && wFar > 0.0) {')) code = applyWave345Compatible(code,
    `    if (wG > 0.0 || dot(wS, wS) > 0.0) {
      float wl = length(wS);
      if (wl > 0.9) wS *= 0.9 / wl;
      float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
      slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
      gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;`,
    `    if (wG > 0.0 || dot(wS, wS) > 0.0) {
      float wl = length(wS);
      if (wl > 0.9) wS *= 0.9 / wl;
      slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
      gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;`, replaceOnce, "GPU-LVL-07b composed wake slope reuses the unconditional derivative");
  if (rel === "src/core/renderer.js") code = applyWave345Compatible(code,
    `      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      float v = smoothstep(0.55, 1.25, r);
      c.rgb *= 1.0 - uVignette * v;
      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      if (uHurt > 0.0) {
        float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
        c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
      }
      c.rgb += uFlash;`,
    `      vec4 c = texture2D(tDiffuse, vUv);
      if (uExposure != 1.0) c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      if (uContrast != 1.0) {
        c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      } else {
        c.rgb = max(c.rgb, vec3(1e-6)) + uLift;
      }
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      if (uVignette > 0.0 || uHurt > 0.0) {
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(q);
        float v = smoothstep(0.55, 1.25, r);
        c.rgb *= 1.0 - uVignette * v;
        if (uHurt > 0.0) {
          // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
          float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
          c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
        }
      }
      if (uFlash != 0.0) c.rgb += uFlash;`, replaceOnce, "GPU-POST-01 composed Grade retains the existing hurt guard");
  if (rel === "src/fx/fx.js") code = applyWave345Compatible(code,
    `  float st = vMisc.y;
  float ang = 0.0, seed = 0.0, wob = 0.0;
  if (st < 6.5) {
    ang = atan(vUv.y, vUv.x);
    if (st < 2.5 || st >= 4.5) {
      seed = vMisc.x * 53.0;
      wob = fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5;
    }
  }
  float a = 0.0;
  vec3 col = vCol.rgb;
  if (st < 0.5) {
    // ink shockwave: thick wobbly band that thins as it expands, plus droplet beads on the rim
    float outer = 0.93 + wob * 0.1;
    float w = mix(0.34, 0.07, vT) * vMisc.z;
    float band = smoothstep(outer + 0.02, outer - 0.02, r) * smoothstep(outer - w - 0.03, outer - w + 0.02, r);
    float beads = smoothstep(0.35, 0.0, length(vec2(fract(ang / 6.2831 * 18.0 + seed) - 0.5, (r - outer) * 7.0))) * step(0.45, fxHash(vec2(floor(ang / 6.2831 * 18.0 + seed), seed)));
    float fill = pow(1.0 - vT, 4.0) * 0.45 * smoothstep(outer, outer * 0.3, r);
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
    a = smoothstep(0.95 + wob * 0.2, 0.7 + wob * 0.2, r) * pow(1.0 - vT, 2.0);
`,
    `  float st = vMisc.y;
  float ang = 0.0, seed = 0.0, wob = 0.0;
  if (st < 6.5) {
    ang = atan(vUv.y, vUv.x);
    if (st < 2.5 || st >= 4.5) {
      seed = vMisc.x * 53.0;
      wob = fxNoise(vec2(cos(ang), sin(ang)) * 3.0 + seed) - 0.5;
    }
  }
  float a = 0.0;
  vec3 col = vCol.rgb;
  float ivT = 1.0 - vT, ivT2 = ivT * ivT;
  if (st < 0.5) {
    // ink shockwave: thick wobbly band that thins as it expands, plus droplet beads on the rim
    float outer = 0.93 + wob * 0.1;
    float w = mix(0.34, 0.07, vT) * vMisc.z;
    float band = smoothstep(outer + 0.02, outer - 0.02, r) * smoothstep(outer - w - 0.03, outer - w + 0.02, r);
    float beads = smoothstep(0.35, 0.0, length(vec2(fract(ang / 6.2831 * 18.0 + seed) - 0.5, (r - outer) * 7.0))) * step(0.45, fxHash(vec2(floor(ang / 6.2831 * 18.0 + seed), seed)));
    float fill = (ivT2 * ivT2) * 0.45 * smoothstep(outer, outer * 0.3, r);
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
    a = smoothstep(0.95 + wob * 0.2, 0.7 + wob * 0.2, r) * ivT2;
`, replaceOnce, "GPU-FX-04 composed ring retains the existing noise and atan gates");
  if (rel === "src/game/character-mats.js") code = applyWave345Compatible(code,
    `          // ---- blush: soft warm gradient over the cheek apples (+ uMouth2.w flush), stronger on fair skin
          float bl = exp(-pow((abs(az) - 0.62) / 0.3, 2.0) - pow((el + 0.32) / 0.2, 2.0));
          float blushK = bl * mix(0.14, 0.06, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.72, 0.72), blushK);
          // ---- freckles across the nose bridge + cheeks
          if (uFreckle > 0.5) {
            vec2 fp = vec2(az, el + 0.12) * 42.0;
            vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;
            float rnd = iwHash2(cell);
            vec2 off = vec2(iwHash2(cell + 3.1), iwHash2(cell + 7.7)) - 0.5;
            float region = exp(-pow((abs(az) - 0.3) / 0.28, 2.0) - pow((el + 0.14) / 0.1, 2.0));
            float fd = length(fr - off * 0.5) - 0.13 * rnd;
            float fk = iwFill(fd) * step(0.45, rnd) * region;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), fk * 0.7);
          }
          // ---- nose tip + nostril rims: slightly warmer
          float nose = exp(-pow(az / 0.1, 2.0) - pow((el + 0.19) / 0.06, 2.0));   // S3: a warm, rosy nose tip
          iwNoseTip = exp(-pow(az / 0.05, 2.0) - pow((el + 0.13) / 0.04, 2.0));   // and a glossy point on it`,
    `          // ---- blush: soft warm gradient over the cheek apples (+ uMouth2.w flush), stronger on fair skin
          float bl = exp(-(((abs(az) - 0.62) / 0.3) * ((abs(az) - 0.62) / 0.3)) - (((el + 0.32) / 0.2) * ((el + 0.32) / 0.2)));
          float blushK = bl * mix(0.14, 0.06, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.72, 0.72), blushK);
          // ---- freckles across the nose bridge + cheeks
          if (uFreckle > 0.5) {
            float region = exp(-(((abs(az) - 0.3) / 0.28) * ((abs(az) - 0.3) / 0.28)) - (((el + 0.14) / 0.1) * ((el + 0.14) / 0.1)));
            if (region > 0.002) {
            vec2 fp = vec2(az, el + 0.12) * 42.0;
            vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;
            float rnd = iwHash2(cell);
            vec2 off = vec2(iwHash2(cell + 3.1), iwHash2(cell + 7.7)) - 0.5;
            float fd = length(fr - off * 0.5) - 0.13 * rnd;
            float fk = iwFill(fd) * step(0.45, rnd) * region;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), fk * 0.7);
            }
          }
          // ---- nose tip + nostril rims: slightly warmer
          float nose = exp(-((az / 0.1) * (az / 0.1)) - (((el + 0.19) / 0.06) * ((el + 0.19) / 0.06)));   // S3: a warm, rosy nose tip
          iwNoseTip = exp(-((az / 0.05) * (az / 0.05)) - (((el + 0.13) / 0.04) * ((el + 0.13) / 0.04)));   // and a glossy point on it`, replaceOnce, "GPU-CHR-02a composed freckles preserve the current face and nose tuning");
  if (rel === "src/game/character-mats.js") code = applyWave345Compatible(code,
    `          float fl = iwLod(r * 24.0, 1.0);
          vec2 idr = iq / max(r, 1e-4);                                   // seam-free angular coordinate
          float fib = iwNoise(vec3(idr * 11.0, r * 4.0 + vSide * 7.0)) * 0.6 + iwNoise(vec3(idr * 27.0, r * 1.5 + vSide)) * 0.4;
          ic *= mix(1.0, mix(0.9, 1.08, fib), smoothstep(0.3, 0.7, r) * fl);
          float coll = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.47 - 0.035 * sin(ang * 9.0 + vSide)));
          ic = mix(ic, ic * 1.3 + 0.04, coll * 0.55 * fl);`,
    `          float fl = iwLod(r * 24.0, 1.0);
          if (irisM > 0.0 && fl > 0.0) {
            vec2 idr = iq / max(r, 1e-4);                                 // seam-free angular coordinate
            float fib = iwNoise(vec3(idr * 11.0, r * 4.0 + vSide * 7.0)) * 0.6 + iwNoise(vec3(idr * 27.0, r * 1.5 + vSide)) * 0.4;
            ic *= mix(1.0, mix(0.9, 1.08, fib), smoothstep(0.3, 0.7, r) * fl);
            float coll = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.47 - 0.035 * sin(ang * 9.0 + vSide)));
            ic = mix(ic, ic * 1.3 + 0.04, coll * 0.55 * fl);
          }`, replaceOnce, "GPU-CHR-02d composed iris retains its authored colour and unconditional LOD");
  if (rel === "src/game/character-mats.js") code = applyWave345Compatible(code,
    `            float dxs = iwPart == 4.0 ? min(abs(dx0), abs(dx1)) : abs(th - 0.5) * circ;   // legs: uv.x 0 = inseam, 0.5 = outer seam
            iwH -= 0.0005 * exp(-pow(dxs / 0.0016, 2.0));
            float stripe = 0.0; vec3 stripeC = uTeam;
            if (uPattern > 0.5 && uPattern < 2.5) stripe = iwStroke(dxs, 0.0065);
            else if (uPattern > 7.5 && uPattern < 8.5) stripe = iwStroke(dxs, 0.011);                                   // jersey: wide team panel
            else if (uPattern > 8.5) { stripe = iwStroke(dxs - 0.0075, 0.0026); stripeC = vec3(0.95); }                // track: twin white stripes
            base = mix(base, stripeC, stripe);
            float ss = iwStroke(dxs - 0.0045, 0.00045) * iwDash(p.y, 0.005, 0.6);
            base = mix(base, base * 0.75 + 0.02, ss * iwLod(p.y, 0.005));
            if (iwPart == 4.0) {
              vec2 f = vec2(p.x, p.y);
              // front: fly J-stitch + slant pocket openings
              {
                vec3 iwShortBase = base;
                float iwShortH = iwH, iwShortAO = iwAO;
                {
                float fly = iwSdSeg(f, vec2(0.012, 0.745), vec2(0.012, 0.64));
                fly = min(fly, iwSdSeg(f, vec2(0.012, 0.64), vec2(0.0, 0.625)));
                float fs = iwStroke(fly, 0.0005) * iwDash(p.y + p.x, 0.005, 0.6);
                base = mix(base, base * 0.72 + 0.02, fs * iwLod(p.y, 0.005));
                iwH -= 0.0006 * exp(-pow(abs(p.x) / 0.0018, 2.0)) * step(0.63, p.y);
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pk = iwSdSeg(f, vec2(sx * 0.062, 0.752), vec2(sx * 0.112, 0.668));
                  iwH -= 0.0009 * exp(-pow(pk / 0.0018, 2.0));
                  float ps = iwStroke(pk - 0.004, 0.00045) * iwDash(p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.25 * exp(-pow(pk / 0.003, 2.0));
                }
              }
                vec3 iwFrontBase = base;
                float iwFrontH = iwH, iwFrontAO = iwAO;
                base = iwShortBase; iwH = iwShortH; iwAO = iwShortAO;
                {
                // back patch pockets with a little team label on the right one
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pb = iwSdBox(f - vec2(sx * 0.058, 0.668), vec2(0.036, 0.04), 0.01);
                  iwH += 0.0008 * (1.0 - smoothstep(-0.002, 0.0015, pb));
                  float ps = (iwStroke(pb + 0.0035, 0.00045)) * iwDash(p.x + p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.3 * exp(-pow(pb / 0.0022, 2.0)) * step(0.0, pb);
                  if (s < 0) { float lab = iwSdBox(f - vec2(sx * 0.03, 0.692), vec2(0.006, 0.012), 0.002); base = mix(base, uTeam, iwFill(lab)); }
                }
                // seat seam
                iwH -= 0.0006 * exp(-pow(p.x / 0.0017, 2.0));
              }
                if (p.z > 0.0) { base = iwFrontBase; iwH = iwFrontH; iwAO = iwFrontAO; }
              }
              // waistband stitch (mostly under the tee hem)
              float ws = iwStroke(p.y - 0.735, 0.0005) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.75, ws);
            } else {
              // leg: inseam
              float dxi = min(th, 1.0 - th) * circ;
              iwH -= 0.0004 * exp(-pow(dxi / 0.0015, 2.0));`,
    `            float dxs = iwPart == 4.0 ? min(abs(dx0), abs(dx1)) : abs(th - 0.5) * circ;   // legs: uv.x 0 = inseam, 0.5 = outer seam
            iwH -= 0.0005 * exp(-((dxs / 0.0016) * (dxs / 0.0016)));
            float stripe = 0.0; vec3 stripeC = uTeam;
            if (uPattern > 0.5 && uPattern < 2.5) stripe = iwStroke(dxs, 0.0065);
            else if (uPattern > 7.5 && uPattern < 8.5) stripe = iwStroke(dxs, 0.011);                                   // jersey: wide team panel
            else if (uPattern > 8.5) { stripe = iwStroke(dxs - 0.0075, 0.0026); stripeC = vec3(0.95); }                // track: twin white stripes
            base = mix(base, stripeC, stripe);
            float ss = iwStroke(dxs - 0.0045, 0.00045) * iwDash(p.y, 0.005, 0.6);
            base = mix(base, base * 0.75 + 0.02, ss * iwLod(p.y, 0.005));
            if (iwPart == 4.0) {
              vec2 f = vec2(p.x, p.y);
              // front: fly J-stitch + slant pocket openings
              {
                vec3 iwShortBase = base;
                float iwShortH = iwH, iwShortAO = iwAO;
                {
                float fly = iwSdSeg(f, vec2(0.012, 0.745), vec2(0.012, 0.64));
                fly = min(fly, iwSdSeg(f, vec2(0.012, 0.64), vec2(0.0, 0.625)));
                float fs = iwStroke(fly, 0.0005) * iwDash(p.y + p.x, 0.005, 0.6);
                base = mix(base, base * 0.72 + 0.02, fs * iwLod(p.y, 0.005));
                iwH -= 0.0006 * exp(-((abs(p.x) / 0.0018) * (abs(p.x) / 0.0018))) * step(0.63, p.y);
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pk = iwSdSeg(f, vec2(sx * 0.062, 0.752), vec2(sx * 0.112, 0.668));
                  iwH -= 0.0009 * exp(-((pk / 0.0018) * (pk / 0.0018)));
                  float ps = iwStroke(pk - 0.004, 0.00045) * iwDash(p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.25 * exp(-((pk / 0.003) * (pk / 0.003)));
                }
              }
                vec3 iwFrontBase = base;
                float iwFrontH = iwH, iwFrontAO = iwAO;
                base = iwShortBase; iwH = iwShortH; iwAO = iwShortAO;
                {
                // back patch pockets with a little team label on the right one
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pb = iwSdBox(f - vec2(sx * 0.058, 0.668), vec2(0.036, 0.04), 0.01);
                  iwH += 0.0008 * (1.0 - smoothstep(-0.002, 0.0015, pb));
                  float ps = (iwStroke(pb + 0.0035, 0.00045)) * iwDash(p.x + p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.3 * exp(-((pb / 0.0022) * (pb / 0.0022))) * step(0.0, pb);
                  if (s < 0) { float lab = iwSdBox(f - vec2(sx * 0.03, 0.692), vec2(0.006, 0.012), 0.002); base = mix(base, uTeam, iwFill(lab)); }
                }
                // seat seam
                iwH -= 0.0006 * exp(-((p.x / 0.0017) * (p.x / 0.0017)));
              }
                if (p.z > 0.0) { base = iwFrontBase; iwH = iwFrontH; iwAO = iwFrontAO; }
              }
              // waistband stitch (mostly under the tee hem)
              float ws = iwStroke(p.y - 0.735, 0.0005) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.75, ws);
            } else {
              // leg: inseam
              float dxi = min(th, 1.0 - th) * circ;
              iwH -= 0.0004 * exp(-((dxi / 0.0015) * (dxi / 0.0015)));`, replaceOnce, "GPU-CHR-03f composed shorts retain front/back ownership and replace scalar squares");
  return adaptReviewed67WaveComposedEpochs(rel, code, replaceOnce);
}

// Current main already owns the audited Wave 6/7 algebra. Add only missing
// support gates, preserving its coefficients, naming and paint hash contract.
function adaptReviewed67WaveComposedEpochs(rel, code, replaceOnce) {
  if (rel === "src/fx/screenfx.js") code = applyWave345Compatible(code,
    `    if (uSwim.a > 0.001) {
      float v = smoothstep(0.35, 1.05, r);
      col = mix(col, col * (0.55 + uSwim.rgb * 0.9), v * 0.45 * uSwim.a);
      float cst = vnoise(q * 16.0 + vec2(uTime * 0.7, -uTime * 0.4)) * vnoise(q * 21.0 - vec2(uTime * 0.5, uTime * 0.6));
      col += uSwim.rgb * (cst * cst * cst) * 1.6 * uSwim.a * v;`,
    `    if (uSwim.a > 0.001 && r > 0.35) {
      float v = smoothstep(0.35, 1.05, r);
      col = mix(col, col * (0.55 + uSwim.rgb * 0.9), v * 0.45 * uSwim.a);
      float cst = vnoise(q * 16.0 + vec2(uTime * 0.7, -uTime * 0.4)) * vnoise(q * 21.0 - vec2(uTime * 0.5, uTime * 0.6));
      col += uSwim.rgb * (cst * cst * cst) * 1.6 * uSwim.a * v;`, replaceOnce, "GPU-SFX-03c preserve reviewed caustic cubic while bounding its support");
  if (rel === "src/world/environment.js") code = applyWave345Compatible(code,
    `  // foam: lapping band along the deck edge, rings around pilings / boats / buoys
  float fn = w2.z * 0.6 + w1.z * 0.4;
  float edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
  float lapPhase = fract(dEdge * 0.7 - uTime * 0.3);
  float lap = smoothstep(0.1, 0.0, abs(lapPhase - 0.5) - 0.4) * smoothstep(3.4, 0.5, dEdge) * step(0.0, dEdge);
  lap *= smoothstep(0.35, 0.7, fn + 0.15);
  float objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45);
  objF += 0.45 * smoothstep(0.1, 0.0, abs(fract(dObj * 0.9 - uTime * 0.35) - 0.5) - 0.42) * smoothstep(2.2, 0.4, dObj) * smoothstep(0.35, 0.7, fn + 0.1);
  float foam = clamp(edgeF + lap * 0.5 + objF, 0.0, 1.0) * mix(1.0, 0.35, under);
  vec3 foamCol = uFoamColor * (uSeaAmbient * 1.3 + uSunLight * (0.35 + 0.65 * shadow) * 0.6);
  col = mix(col, foamCol, foam * detail);`,
    `  // foam: lapping band along the deck edge, rings around pilings / boats / buoys
  if (detail > 0.0 && (dEdge < 3.4 || dObj < 2.2)) {
    float fn = w2.z * 0.6 + w1.z * 0.4;
    float edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
    float lapPhase = fract(dEdge * 0.7 - uTime * 0.3);
    float lap = smoothstep(0.1, 0.0, abs(lapPhase - 0.5) - 0.4) * smoothstep(3.4, 0.5, dEdge) * step(0.0, dEdge);
    lap *= smoothstep(0.35, 0.7, fn + 0.15);
    float objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45);
    objF += 0.45 * smoothstep(0.1, 0.0, abs(fract(dObj * 0.9 - uTime * 0.35) - 0.5) - 0.42) * smoothstep(2.2, 0.4, dObj) * smoothstep(0.35, 0.7, fn + 0.1);
    float foam = clamp(edgeF + lap * 0.5 + objF, 0.0, 1.0) * mix(1.0, 0.35, under);
    vec3 foamCol = uFoamColor * (uSeaAmbient * 1.3 + uSunLight * (0.35 + 0.65 * shadow) * 0.6);
    col = mix(col, foamCol, foam * detail);
  }`, replaceOnce, "GPU-ENV-01 preserve reviewed sea glints while bounding foam support");
  if (rel === "src/world/environment.js") code = applyWave345Compatible(code,
    `#ifdef HZ_CITY
{
  // glass reflects the sky gradient (grazing angles → mirror-bright), so towers pick up the sky's colours
  vec3 wn2 = normalize(vHzNormal);
  vec3 V = normalize(vHzWorld - cameraPosition);
  vec3 Rr = reflect(V, wn2);
  float fnv = 1.0 - clamp(dot(-V, wn2), 0.0, 1.0), fnv2 = fnv * fnv;
  float fres = 0.05 + 0.95 * (fnv2 * fnv2 * fnv);
  vec3 refl = min(skyGradient(normalize(vec3(Rr.x, max(Rr.y, 0.02), Rr.z))), vec3(1.1));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, refl * mix(0.92, 0.55, uNight), hzWin * clamp(0.18 + fres * 0.75, 0.0, 0.85) * (1.0 - uNight * 0.75));
  // dusk: the skyline across the bay settles a stop darker so its lit windows carry it (was one flat salmon glow)`,
    `#ifdef HZ_CITY
{
  // glass reflects the sky gradient (grazing angles → mirror-bright), so towers pick up the sky's colours
  if (hzWin > 0.0) {
    vec3 wn2 = normalize(vHzNormal);
    vec3 V = normalize(vHzWorld - cameraPosition);
    vec3 Rr = reflect(V, wn2);
    float fnv = 1.0 - clamp(dot(-V, wn2), 0.0, 1.0), fnv2 = fnv * fnv;
    float fres = 0.05 + 0.95 * (fnv2 * fnv2 * fnv);
    vec3 refl = min(skyGradient(normalize(vec3(Rr.x, max(Rr.y, 0.02), Rr.z))), vec3(1.1));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, refl * mix(0.92, 0.55, uNight), hzWin * clamp(0.18 + fres * 0.75, 0.0, 0.85) * (1.0 - uNight * 0.75));
  }
  // dusk: the skyline across the bay settles a stop darker so its lit windows carry it (was one flat salmon glow)`, replaceOnce, "GPU-ENV-04d preserve reviewed Fresnel while gating city glass");
  if (rel === "src/fx/fx.js") code = applyWave345Compatible(code,
    `  float edge = 1.0 - z;
  // light passes through the ink and exits on the far side: a saturated glow opposite the sun, strongest near the rim
  vec2 sxy = normalize(vec2(dot(uSunDirV.xy, bx), dot(uSunDirV.xy, vAx)) + 1e-4);
  float tr0 = clamp(-dot(q, sxy), 0.0, 1.0);
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
  col += uSunCol * (pow(rl, 150.0) * 7.0 + rl16 * 0.28) * g;
  col *= mix(0.85, 1.0, g);`,
    `  vec3 col = base * 0.85;
  if (g > 0.0) {
    float edge = 1.0 - z;
    // light passes through the ink and exits on the far side: a saturated glow opposite the sun, strongest near the rim
    vec2 sxy = normalize(vec2(dot(uSunDirV.xy, bx), dot(uSunDirV.xy, vAx)) + 1e-4);
    float tr0 = clamp(-dot(q, sxy), 0.0, 1.0);
    float trans = (tr0 * sqrt(tr0)) * (0.35 + 0.65 * edge);
    base += vCol * (vCol + 0.25) * trans * 0.7 * g;
    // lens rim: the curved edge of the liquid reads darker and richer
    base *= mix(1.0, 0.6, pow(edge, 2.2) * g);
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
    float rup = dot(R, uUpV);
    vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.4, smoothstep(-0.15, 0.35, rup));
    float edge2 = edge * edge;
    float fres = (0.04 + 0.96 * (edge2 * edge2)) * g;
    col = mix(base, env, fres * 0.42);
    float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
    float rl2 = rl * rl, rl4 = rl2 * rl2, rl8 = rl4 * rl4, rl16 = rl8 * rl8;
    col += uSunCol * (pow(rl, 150.0) * 7.0 + rl16 * 0.28) * g;
    col *= mix(0.85, 1.0, g);
  }`, replaceOnce, "GPU-FX-01 preserve reviewed droplet polynomials inside the gloss gate");
  return code;
}

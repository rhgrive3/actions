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
      'GPU-03 close wet-ink coverage gate'
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
      'GPU-02 skip wake tangent projection when no wake contributed'
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
      'GPU-06 branch over low-health desaturation in GradeShader when uHurt <= 0'
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
    // DO NOT MERGE: matched diagnostic baseline from current 98ccd1c6.
    // Disable only the six applied CPU ancestor/quaternion transformations.
    // RootHair MOT-04 is already unmatched here; all other Wave owners stay on.
    if (rel === 'src/game/character.js' || rel === 'src/game/motion/retarget.js') return code;
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
    code = applyIdempotent(
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

    return code;
}

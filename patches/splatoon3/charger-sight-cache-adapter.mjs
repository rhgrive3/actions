export function adaptChargerSightCache(rel, code, replaceOnce) {
  if (rel === 'src/game/weapons.js') {
    const maxReachSource = `        const range = this.chargerReach ? this.chargerReach(1) : w.rangeMax;
        const hit = G.physics.raycast(m, dir, range, _hit, true);
        const len = hit.hit ? hit.dist : range;`;
    const nativeSource = `        const range = lerp(w.rangeMin, w.rangeMax, ch);
        const hit = G.physics.raycast(m, dir, range, _hit, true);
        const len = hit.hit ? hit.dist : range;`;
    if (code.includes(maxReachSource)) code = replaceOnce(code,
      maxReachSource,
      `        const range = this.chargerReach ? this.chargerReach(1) : w.rangeMax;
        const hit = G.physics.raycast(m, dir, chargerSightRayRange(range), _hit, true);
        const len = hit.hit ? Math.min(hit.dist, range) : range;`,
      'charger sight includes the existing laser-dot reach while keeping line range capped');
    else code = replaceOnce(code,
      nativeSource,
      `        const range = lerp(w.rangeMin, w.rangeMax, ch);
        const hit = G.physics.raycast(m, dir, chargerSightRayRange(range), _hit, true);
        const len = hit.hit ? Math.min(hit.dist, range) : range;`,
      'charger sight includes the existing laser-dot reach while keeping line range capped');
    code = replaceOnce(code,
      `        u.uCharge.value = ch; u.uLen.value = len; u.uT.value = G.time; u.uWidth.value = 0.014 + ch * 0.02;
        s.visible = true;`,
      `        u.uCharge.value = ch; u.uLen.value = len; u.uT.value = G.time; u.uWidth.value = 0.014 + ch * 0.02;
        cacheChargerSightDot(s, hit);
        s.visible = true;`,
      'charger sight caches hit inside extracted placement method');
    code = replaceOnce(code,
      `      } else if (s) {
        s.visible = false;
      }`,
      `      } else if (s) {
        clearChargerSightDot(s);
        s.visible = false;
      }`,
      'charger sight clears laser-dot hit when hidden');
    return "import { cacheChargerSightDot, clearChargerSightDot, chargerSightRayRange } from '../../patches/splatoon3/runtime/charger-sight-cache.mjs';\n" + code;
  }
  if (rel === 'src/fx/fxHooks.js') {
    code = replaceOnce(code,
      '      if (!s.visible || !a.alive || !this._near(s.position, 50)) return;',
      `      if (!s.visible || !a.alive) { clearChargerSightDot(s); return; }
      if (!this._near(s.position, 50)) return;`,
      'clear stale charger-dot hit when sight is hidden');
    code = replaceOnce(code,
      'const h = this.G.physics?.raycast(_v, _dir, 0.6, this.hit2, true);',
      'const h = cachedChargerSightDot(s) ?? this.G.physics?.raycast(_v, _dir, 0.6, this.hit2, true);',
      'reuse cached charger laser-dot hit');
    return "import { cachedChargerSightDot, clearChargerSightDot } from '../../patches/splatoon3/runtime/charger-sight-cache.mjs';\n" + code;
  }
  return code;
}

export function adaptChargerSightCache(rel, code, replaceOnce) {
  if (rel === 'src/game/weapons.js') {
    const sightStart = code.indexOf('// charger laser sights');
    const sightEnd = code.indexOf('// bomb/special throw arc preview', sightStart);
    if (sightStart < 0 || sightEnd < sightStart) throw new Error('INKWAVE patch conflict: charger sight loop boundary');
    let sight = code.slice(sightStart, sightEnd);
    if (!sight.includes('chargerSightRayRange(range)')) {
      const hitPattern = /const hit = G\.physics\.raycast\(m, dir, range, _hit(?:, true)?\);/g;
      const hits = sight.match(hitPattern) || [];
      if (hits.length !== 1) throw new Error('INKWAVE patch conflict (charger sight ray): expected exactly one charger sight raycast.');
      sight = sight.replace(hitPattern, 'const hit = G.physics.raycast(m, dir, chargerSightRayRange(range), _hit, true);');
      const lenPattern = /const len = hit\.hit \? hit\.dist : range;/g;
      const lens = sight.match(lenPattern) || [];
      if (lens.length !== 1) throw new Error('INKWAVE patch conflict (charger sight length): expected exactly one charger sight length.');
      sight = sight.replace(lenPattern, 'const len = hit.hit ? Math.min(hit.dist, range) : range;');
    }
    if (!sight.includes('cacheChargerSightDot(s, hit);')) sight = replaceOnce(sight,
      `        u.uCharge.value = ch; u.uLen.value = len; u.uT.value = G.time; u.uWidth.value = 0.014 + ch * 0.02;
        s.visible = true;`,
      `        u.uCharge.value = ch; u.uLen.value = len; u.uT.value = G.time; u.uWidth.value = 0.014 + ch * 0.02;
        cacheChargerSightDot(s, hit);
        s.visible = true;`,
      'charger sight caches hit inside extracted placement method');
    if (!sight.includes('clearChargerSightDot(s);')) sight = replaceOnce(sight,
      `      } else if (s) {
        s.visible = false;
      }`,
      `      } else if (s) {
        clearChargerSightDot(s);
        s.visible = false;
      }`,
      'charger sight clears laser-dot hit when hidden');
    code = code.slice(0, sightStart) + sight + code.slice(sightEnd);
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

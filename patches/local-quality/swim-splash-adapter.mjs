// Presentation calibration from Nintendo's JP ikatohito/movie/modal_pc.mp4 (2026-10-21).
// Retail particle counts/curves are unknown; these are INKWAVE visual settings.
// Prefer low surface breakup over the previous long-lived, high bubble fan.
export function adaptSwimSplash(rel, code, replaceOnce) {
  if (rel === 'src/game/actor.js') {
    return replaceOnce(code,
      `    if (a.form === 'swim' && hs > 2 && G.fx && swimSplashVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      if (this._wakeT > 0.05) { this._wakeT = 0; G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs); }
    }`,
      `    if (a.form === 'swim' && this.grounded && hs > 2 && G.fx && swimSplashVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      while (this._wakeT + 1e-10 >= 1 / 60) {
        this._wakeT = Math.max(0, this._wakeT - 1 / 60);
        G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs);
      }
    } else this._wakeT = 0;`, 'swim splash cadence');
  }
  if (rel === 'src/fx/fx.js') {
    const start = code.indexOf('  wake(pos, dir, color, speed = 8, normal = UP) {');
    const end = code.indexOf('\n  // Carving a hard turn', start);
    if (start < 0 || end < 0) throw new Error('INKWAVE swim splash conflict: missing wake recipe');
    const before = code.slice(start, end);
    const after = `  wake(pos, dir, color, speed = 8, normal = UP) {
    if (!this._near(pos, 45)) return;
    const col = this._color(color, this._col);
    const k = Math.min(1, speed / 11.8), rx = dir.z, rz = -dir.x;
    let n = Math.floor((0.65 + 2.35 * k * k) * this.q + rand());
    while (n-- > 0) {
      // Fine drops detach close to the shoulders and return to the surface.
      // Small forward carry leaves a short wake relative to the moving squid.
      const sign = this._swimSpraySide = -(this._swimSpraySide || 1);
      const side = sign * (0.3 + 0.65 * k) * (0.65 + rand() * 0.6);
      const edge = Math.sign(side) * (0.11 + rand() * 0.1), tail = 0.08 + rand() * 0.24;
      const carry = speed * (0.12 + rand() * 0.1), up = 0.45 + rand() * 0.65 + 0.25 * k;
      this._spawnDrop(pos.x - dir.x * tail + rx * edge, pos.y + 0.025, pos.z - dir.z * tail + rz * edge,
        dir.x * carry + normal.x * up + rx * side, dir.y * carry + normal.y * up, dir.z * carry + normal.z * up + rz * side,
        col, 0.008 + rand() * 0.009 + 0.004 * k, 0.14 + rand() * 0.1, 1, 1.25, F_QUIET | F_SWIM);
    }
  }
`;
    code = replaceOnce(code, 'F_MATTE = 16;', 'F_MATTE = 16, F_SWIM = 32;', 'swim drop presentation flag');
    code = replaceOnce(code, '(A[i8 + 7] & F_MATTE) ? 0 : 1;', '(A[i8 + 7] & F_MATTE) ? 0 : (A[i8 + 7] & F_SWIM) ? 0.5 : 1;', 'swim drops keep ink colour instead of a glass rim');
    code = replaceOnce(code, before, after, 'swim splash fan');
    const carveStart = code.indexOf('  swimCarve(pos, dir, out, color, k = 1) {');
    const carveEnd = code.indexOf('\n  muzzle(', carveStart);
    if (carveStart < 0 || carveEnd < 0) throw new Error('INKWAVE swim splash conflict: missing carve recipe');
    const carve = code.slice(carveStart, carveEnd);
    let fineCarve = replaceOnce(carve, '1.8 + rand() * 1.6 * k', '0.65 + rand() * 0.6 * k', 'low turn splash');
    fineCarve = replaceOnce(fineCarve, '0.018 + rand() * 0.022, 0.65, 1, 1.6, 0', '0.01 + rand() * 0.015, 0.18 + rand() * 0.1, 1, 1.25, F_QUIET | F_SWIM', 'fine turn splash');
    return replaceOnce(code, carve, fineCarve, 'swim turn spray');
  }
  if (rel === 'src/world/levelMaterial.js') {
    return replaceOnce(code,
      '        wG += hm * 16.0 + hb * 20.0;',
      `        wG += hm * 16.0 + hb * 20.0;
        // Short, travelling folds remain in the ink surface. Their analytic
        // gradient breaks up the broad bow highlight without a cloud of beads.
        float phase = al * 23.0 - uTime * 19.0;
        float fold = 0.008 * H.w * F.w * exp(-(am * am) / 0.18 - (ac * ac) / 0.04);
        float ripple = fold * sin(phase);
        wS += Fp * (fold * 23.0 * cos(phase) - 2.0 * am / 0.18 * ripple)
            + Cn * (-2.0 * ac / 0.04 * ripple);
        wG += abs(ripple) * 32.0;`, 'swim surface folds');
  }
  return code;
}

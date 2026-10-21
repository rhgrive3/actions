// Presentation calibration from Nintendo's JP ikatohito/movie/modal_pc.mp4 (2026-10-21).
// Retail particle counts/curves are unknown; these are INKWAVE visual settings.
export function adaptSwimSplash(rel, code, replaceOnce) {
  if (rel === 'src/game/actor.js') {
    return replaceOnce(code,
      `    if (a.form === 'swim' && hs > 2 && G.fx && swimSplashVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      if (this._wakeT > 0.05) { this._wakeT = 0; G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs); }
    }`,
      `    if (a.form === 'swim' && this.grounded && hs > 2 && G.fx && swimSplashVisible(this)) {
      this._wakeT = (this._wakeT || 0) + dt;
      while (this._wakeT + 1e-10 >= 0.05) {
        this._wakeT = Math.max(0, this._wakeT - 0.05);
        G.fx.wake(this.pos, _v.set(this.vel.x, 0, this.vel.z).normalize(), this.color, hs);
      }
    } else this._wakeT = 0;`, 'swim splash cadence');
  }
  if (rel === 'src/fx/fx.js') {
    const start = code.indexOf('  wake(pos, dir, color, speed = 8, normal = UP) {');
    const end = code.indexOf('\n  // Carving a hard turn', start);
    if (start < 0 || end < 0) throw new Error('INKWAVE swim splash conflict: missing wake recipe');
    const before = code.slice(start, end);
    let after = before;
    const changes = [
      ['(0.5 + 3.0 * k * k)', '(2.0 + 7.0 * k * k)'],
      ['speed * (0.06 + rand() * 0.1)', 'speed * (0.04 + rand() * 0.08)'],
      ['1.5 + rand() * 1.3 + 1.5 * k', '1.7 + rand() * 1.8 + 1.8 * k'],
      ['(rand() - 0.5) * (0.7 + 0.9 * k)', '(n % 2 ? -1 : 1) * (0.6 + rand() * 1.3) * (0.5 + k)'],
      ['this._spawnDrop(pos.x - dir.x * 0.34, pos.y + 0.05, pos.z - dir.z * 0.34,', 'const edge = Math.sign(side) * (0.1 + rand() * 0.12), tail = 0.1 + rand() * 0.45;\n      this._spawnDrop(pos.x - dir.x * tail + rx * edge, pos.y + 0.05, pos.z - dir.z * tail + rz * edge,'],
      ['0.016 + rand() * 0.018 + 0.012 * k, 0.6, 1, 1.7, 0', '0.028 + rand() * 0.026 + 0.022 * k, 0.6, 1, 2.1, 0'],
    ];
    for (const [from, to] of changes) after = replaceOnce(after, from, to, 'swim spray recipe');
    return replaceOnce(code, before, after, 'swim splash fan');
  }
  return code;
}

// Focused protected-source composition for verified #1158/#1159/#1162/#1165/#1166.
// Build-time only: no changes to the locked inkwave-public upstream bytes.
export function adaptIssueBatch1171(rel, code, replaceOnce) {
  const patch = (before, after, why) => {
    code = replaceOnce(code, before, after, '#1171 ' + why);
  };

  if (rel === 'src/ui/hud.js') {
    // Keep both normal-fire sights and their per-hand kick references. Add a
    // separate centered sight for S3's post-roll turret, which CSS alone toggles.
    patch('<path class="iw-ret__lock" d="M0 -19 L19 0 L0 19 L-19 0 Z"/>',
      '<circle cx="0" cy="0" r="6.2" class="iw-ret__ring thin iw-ret__merged"/>' +
      '<path class="iw-ret__lock" d="M0 -19 L19 0 L0 19 L-19 0 Z"/>',
      '#1158 merged Dualies post-roll sight');
  }

  if (rel === 'src/world/environment.js') {
    // This function runs per decorated boat/buoy every rendered frame. Avoid a
    // newly allocated [M.decks, M.wet] / [this.footprint] carrier each call.
    patch('for (const set of M ? [M.decks, M.wet] : [this.footprint]) for (const r of set) {',
      'for (let wi = 0, wn = M ? 2 : 1; wi < wn; wi++) for (const r of M ? (wi === 0 ? M.decks : M.wet) : this.footprint) {',
      '#1162 zero-array water footprint iteration');
  }

  if (rel === 'src/net/session.js') {
    // Explicitly retire the old round deadline on *every* owner retirement.
    // A late callback also carries the exact cfg object and Transport identity,
    // so it cannot act on a different room even if an old callback was queued.
    for (const sig of ['  leave(silent = false) {', '  _fail(e) {',
                       '  _closed(reason) {', '  endMatch() {']) {
      patch(sig, sig + '\n    clearTimeout(this._goT); this._goT = null;',
        '#1159 retire GO deadline: ' + sig.trim());
    }
    patch('  async _begin(cfg) {',
      '  async _begin(cfg) {\n    clearTimeout(this._goT); this._goT = null;',
      '#1159 new round owns fresh deadline');
    patch("else if (!this._goT) this._goT = setTimeout(() => this._go(), 12000);   // don't hold everyone for one slow load",
      `else if (!this._goT) {
      const round = this._startCfg, tr = this.tr;
      this._goT = setTimeout(() => {
        if (this.state !== 'starting' || this._startCfg !== round || this.tr !== tr) return;
        this._go();
      }, 12000);
    }`,
      '#1159 late room GO fencing');
  }

  if (rel === 'src/world/paint.js') {
    // Shader roller band: q.x along drum, q.y across; the seed-dependent
    // width wobble is part of the *main body*, not a cosmetic satellite.
    // The former CPU -0.03*r inset + zero wobble permanently disagreed with
    // visible GPU ink and therefore Turf ownership/Judd.
    patch(`const qa = Math.abs(px * sdu + py * sdv) - r * BAND_L, qb = Math.abs(-px * sdv + py * sdu) - r * BAND_W;
          const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;
          if (sd > -0.03 * r) continue;`,
      `const along = px * sdu + py * sdv, across = -px * sdv + py * sdu;
          const wobble = r * (0.03 * Math.sin(along / r * 9.0 + seed * 30.0)
            + 0.018 * Math.sin(along / r * 23.0 + seed * 11.0));
          const qa = Math.abs(along) - r * BAND_L, qb = Math.abs(across) - r * BAND_W - wobble;
          const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;
          if (sd > 0) continue;`,
      '#1165 CPU follows GPU roller band core signed distance');
  }

  if (rel === 'src/main.js') {
    // The world simulation/net owner above worldHidden must keep ticking for
    // online authority. No hidden frame should submit visual FX/atlas/shadows,
    // the scene compositor or showcase to WebGL.
    patch('    const worldHidden = setUp;',
      '    const worldHidden = setUp || document.hidden;',
      '#1166 hidden world visuals');
    patch('    if (!this._skipRender) {',
      '    if (!this._skipRender && !document.hidden) {',
      '#1166 hidden WebGL frame submissions');
  }
  return code;
}

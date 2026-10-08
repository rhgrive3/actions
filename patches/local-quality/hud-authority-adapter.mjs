// Build-only HUD information policy. No gameplay cost, score or winner mutation.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE HUD patch conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
function section(code, start, end, after, label) {
  const a = code.indexOf(start), b = code.indexOf(end, a + start.length);
  if (a < 0 || b < a) throw new Error(`INKWAVE HUD patch conflict (${label}): missing boundary`);
  return once(code, code.slice(a, b), after, label);
}

// Splatoon 3 footage (2026-10-08 capture, version not shown; Splat Zones, 1280x720 game area):
// a least-squares ring fit gives 20 consecutive lit teeth at 11.9 deg pitch, i.e. 30
// teeth per turn. The earlier 23 came from a community wiki sentence, not a measurement.
export const SPECIAL_SEGMENTS = 30;
const point = (r, a) => `${(50 + r * Math.cos(a)).toFixed(3)} ${(50 + r * Math.sin(a)).toFixed(3)}`;
// Radial teeth: each tooth is centred in its 12 deg cell, so the boundary between the
// last and the first tooth sits at 12 o'clock and the fill runs clockwise from there.
// The footage shows ~46% duty (5.5 deg of 12) and bars from 0.64R to 0.93R of the dial.
function toothPaths(inner, outer, name, duty = .46) {
  const step = 2 * Math.PI / SPECIAL_SEGMENTS, half = step * duty / 2;
  return Array.from({ length: SPECIAL_SEGMENTS }, (_, i) => {
    const c = -Math.PI / 2 + (i + .5) * step, a = c - half, b = c + half;
    return `<path class="${name}" d="M${point(inner,a)} L${point(outer,a)} A${outer} ${outer} 0 0 1 ${point(outer,b)} L${point(inner,b)} A${inner} ${inner} 0 0 0 ${point(inner,a)} Z"/>`;
  }).join('');
}
// Team-ink burst behind the special icon (disc + eight short rays), as in the footage.
function burst() {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 4;
    return `M${point(13.5, a)} L${point(19.5, a)}`;
  }).join(' ');
  return `<g class="iw-sp__burst"><path d="${rays}"/><circle cx="50" cy="50" r="9.5"/></g>`;
}
export function specialGaugeSVG() {
  const segments = toothPaths(31, 45, 'iw-sp__segment');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="iw-sp__bg" cx="50" cy="50" r="48.5"/>${burst()}${segments}<circle class="iw-sp__rim" cx="50" cy="50" r="48.5"/><circle class="iw-sp__spin" cx="50" cy="50" r="29" pathLength="100"/></svg>`;
}

const UPDATE_SPECIAL = `  _updSpecial(f, dt) {
    const L = this._L;
    const s = clamp(+f.special || 0);
    const ready = !!f.specialReady;
    // Quantize only the normalized gauge; readiness remains a separate authority.
    const filled = Math.min(${SPECIAL_SEGMENTS}, Math.floor(s * ${SPECIAL_SEGMENTS}));
    // Check segment boundaries independently of the gain-animation deadband.
    if (filled !== L.spSegments) {
      L.spSegments = filled;
      this.spSegments.forEach((segment, i) => segment.classList.toggle('is-filled', i < filled));
      this.sp.setAttribute('aria-valuenow', String(filled));
    }
    if (L.special == null || Math.abs(s - L.special) > 0.002) {
      if (L.special != null && s > L.special + 0.035 && !ready) {
        this.sp.animate([{ scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.34,1.8,.64,1)' });
        this._restart(this.sp, 'is-gain');
      }
      L.special = s;
    }
    if (ready !== L.ready) {
      L.ready = ready;
      this.sp.classList.toggle('is-ready', ready);
      if (ready) {
        this.sp.animate([{ transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.34,1.9,.64,1)' });
        this._restart(this.sp, 'is-flare');
      }
    }
    const act = !!f.specialActive;
    if (act !== L.active) { L.active = act; this.sp.classList.toggle('is-active', act); }
    void dt;
  }

`;

export function adaptHudAuthority(rel, code) {
  if (rel === 'src/main.js') {
    // The Splatoon3 gameplay adapter may already own the authoritative winner.
    // In that composition, retain it verbatim and apply no duplicate producer.
    if (code.includes('winner: m.result.winner')) return code;
    return once(code,
      'const judgeP = this.hud?.judge({ colors:',
      'const judgeP = this.hud?.judge({ winner: m.result.winner, colors:', 'authoritative result producer');
  }
  if (rel === 'src/ui/hud.js') {
    // C22/main may already have the same winner authority under the
    // authoritativeWinner name. Only add this adapter's winner path when absent;
    // the segmented Special gauge below still applies in either composition.
    const winnerOwned = code.includes('winner: authoritativeWinner') &&
      code.includes('authoritativeWinner === 0 || authoritativeWinner === 1');
    if (!winnerOwned) {
      code = once(code, '  judge({ colors =', '  judge({ winner: resultWinner = -1, colors =', 'judge result input');
      code = once(code, 'const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
        'const winner = resultWinner === 0 || resultWinner === 1 ? resultWinner : -1;', 'one winner authority');
    }
    code = section(code, '    // ---- special gauge (liquid orb) + turf total\n', '    const rays =',
      `    // ---- special gauge (${SPECIAL_SEGMENTS} visible segments) + turf total\n`, 'remove continuous gauge construction');
    const from = "      h('div', { class: 'iw-sp__orb', html:", to = "      h('i', { class: 'iw-sp__ring' })";
    code = section(code, from, to, `      h('div', { class: 'iw-sp__orb', html: ${JSON.stringify(specialGaugeSVG())} }),\n`, 'segmented gauge markup');
    code = once(code, "this.sp = h('div', { class: 'iw-sp' },", `this.sp = h('div', { class: 'iw-sp', role: 'progressbar', 'aria-label': tr('Special'), 'aria-valuemin': '0', 'aria-valuemax': '${SPECIAL_SEGMENTS}', 'aria-valuenow': '0' },`, 'segment accessibility');
    code = once(code, "      h('span', { class: 'iw-sp__pct' }),\n", '', 'no precise percentage label');
    code = once(code, "    this.spLiquid = this.sp.querySelector('.iw-sp__liquid');", "    this.spSegments = this.sp.querySelectorAll('.iw-sp__segment');", 'segment elements');
    code = once(code, "    this.spPct = this.sp.querySelector('.iw-sp__pct');\n", '', 'remove percentage reference');
    return section(code, '  _updSpecial(f, dt) {\n', '  // ---------------------------------------------------------------- turf ticker', UPDATE_SPECIAL, 'authoritative segment update');
  }
  if (rel === 'src/core/mobile.js') {
    code = once(code, 'const sp = Math.round(clamp(special, 0, 1) * 100);',
      `const sp = Math.floor(clamp(+special || 0, 0, 1) * ${SPECIAL_SEGMENTS});`, 'touch gauge quantization');
    code = once(code, "if (sp !== L.sp) { L.sp = sp; E.special.style.setProperty('--g', (sp / 100).toFixed(2)); }",
      "if (sp !== L.sp) { L.sp = sp; E.special.querySelectorAll('.iwm-sp-segment').forEach((segment, i) => segment.classList.toggle('is-filled', i < sp)); }", 'touch gauge state');
    return once(code, '<svg class="iwm-b__gauge" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100"/></svg>',
      '<svg class="iwm-b__gauge" viewBox="0 0 100 100" aria-hidden="true">' + toothPaths(36, 49, 'iwm-sp-segment') + '</svg>', 'touch gauge markup');
  }
  if (rel === 'styles/mobile.css') return code + '\n/* #425: touch SP replaces the hidden desktop gauge with the same segment steps. */\n.iwm-b__gauge { transform: none; }\n.iwm-sp-segment { fill: rgba(255,255,255,.16); stroke: rgba(0,0,0,.65); stroke-width: .6; }\n.iwm-sp-segment.is-filled { fill: var(--iwm-c); }\n';
  if (rel === 'styles/hud.css') return code + '\n/* #425: discrete fill; no animated interpolation across segment boundaries. */\n.iw-sp__segment { fill: rgba(255,255,255,.16); stroke: rgba(0,0,0,.65); stroke-width: 1; }\n.iw-sp__segment.is-filled { fill: var(--self); }\n';
  return code;
}

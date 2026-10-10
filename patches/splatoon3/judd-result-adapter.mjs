// #894 — Splatoon 3's Judd + Li'l Judd result scene for the Turf War judge state.
//
// Published behaviour (`inkwave-public/src/ui/hud.js` → `HUD.judge()`): a generic DOM overlay
// headed JUDGING that animates an abstract race bar and rolls `Math.random()` percentages
// while judging, then prints `{team} WINS!`. Splatoon 3 keeps the series referees on the
// stage/map result instead: Judd judges for the local player's team, Li'l Judd for the
// opposing team, and the authoritative winner drives their flag/outcome. This adapter
// rebuilds that presentation inside `HUD.judge()`.
//
// Build-only: `inkwave-public/` stays byte-for-byte intact and every connection is an exact
// unique anchor. The judge timeline (0.8s drumroll, 3.45s reveal, 3.75s winner, 5.1s
// resolve), the `judge_drumroll` / `judge_reveal` sounds, the owner/cancellation contract and
// `resolve({ winner })` are untouched, so the touch-layout, reliability and local-quality
// adapters (and their #158/#381/#720 + ownership tests) keep composing with this one.
//
// No invented official data: the referee figures are original stylised SVG/CSS cats carrying
// the canonical character names. No Nintendo asset, model, pose or frame value is copied or
// asserted — the real Switch presentation stays 未確認 (see
// `reports/inkwave-splatoon3-behavior-2026-10-02.md`).

// Original stylised referee figure (not an official asset): a tuxedo-cat head with ears,
// eyes and whiskers. Li'l Judd is the miniature of Judd, so the same figure is scaled down.
const CAT_FIGURE = '<svg class="iw-jd__cat" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path class="iw-jd__ear" d="M20 47 L24 11 L47 30 Z"/><path class="iw-jd__ear" d="M80 47 L76 11 L53 30 Z"/><ellipse class="iw-jd__face" cx="50" cy="58" rx="33" ry="29"/><path class="iw-jd__patch" d="M50 30c14 1 24 11 27 25-8-9-18-14-27-14-9 0-19 5-27 14 3-14 13-24 27-25z"/><circle class="iw-jd__eye" cx="38" cy="58" r="5"/><circle class="iw-jd__eye" cx="62" cy="58" r="5"/><path class="iw-jd__nose" d="M46 67h8l-4 5z"/><path class="iw-jd__mouth" d="M43 75q7 6 14 0"/><path class="iw-jd__whisker" d="M12 62h15M12 71h15M88 62H73M88 71H73"/></svg>';

export function adaptJuddResult(rel, code, once) {
  if (rel !== 'src/ui/hud.js') return code;
  const patch = (before, after, label) => { code = once(code, before, after, 'judd result scene: ' + label); };

  // The percentages stay blank while the referees judge: no synthetic value is presented as a
  // measurement. The real coverage is written by the existing reveal count-up only.
  patch(
    "      const numA = h('b', { class: 'iw-jd__num' }, '0.0%'), numB = h('b', { class: 'iw-jd__num' }, '0.0%');",
    "      const numA = h('b', { class: 'iw-jd__num' }, ''), numB = h('b', { class: 'iw-jd__num' }, '');",
    'no placeholder percentages before the reveal');

  // Stage/map result composition: snapshot the same live minimap canvas used by the HUD. The
  // existing renderer builds its terrain from the current level and its ink from G.paint; no
  // decorative gradient is presented as the actual map.
  patch(
    `      const el = h('div', { class: 'iw-jd' },
        h('div', { class: 'iw-jd__bg' }),
        h('div', { class: 'iw-jd__title iw-display' }, h('span', null, 'JUDGING'), h('span', { class: 'iw-jd__dots' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'iw-jd__arena' },
          h('div', { class: 'iw-jd__labels' },
            h('div', { class: 'iw-jd__side a' }, h('span', { class: 'iw-jd__name' }, names[0] || TEAM_NAMES[0]), numA),
            h('div', { class: 'iw-jd__side b' }, numB, h('span', { class: 'iw-jd__name' }, names[1] || TEAM_NAMES[1]))),
          h('div', { class: 'iw-jd__track' }, h('div', { class: 'iw-jd__clip' }, barA, barB), edgeA, edgeB, clash)),
        win);`,
    `      // #894 result referees: Judd stands for the local player's team, Li'l Judd for the
      // opponent. Both stay on the stage plate for the whole judgement (win and loss alike).
      const localTeam = (() => { const me = (this.lab && this.lab.local) || (typeof G !== 'undefined' && G && G.match && G.match.local) || null; return me && me.team === 1 ? 1 : 0; })();
      // #1092: the result scene may never sample mutable post-TIME-UP paint.
      // The host freezes this PNG beside s3FinishCoverage and online followers
      // receive the same immutable value with the finish-state packet.
      const resultMap = (() => {
        const match = (typeof G !== 'undefined' && G && G.match) || null;
        const frozen = match?.s3FinishMapDataUrl;
        if (typeof frozen !== 'string' || !frozen.startsWith('data:image/png;base64,')) return null;
        try {
          const image = h('img', { class: 'iw-jd__map-snapshot' });
          image.alt = '';
          image.src = frozen;
          return image;
        } catch { return null; }
      })();
      const mapPlate = resultMap ? h('div', { class: 'iw-jd__stagemap', role: 'img', 'aria-label': 'STAGE MAP' }, resultMap) : null;
      const referee = (team, kind) => {
        const flag = h('div', { class: 'iw-jd__flag', 'aria-hidden': 'true' }, h('i', { class: 'iw-jd__pole' }), h('i', { class: 'iw-jd__cloth' }));
        const node = h('div', { class: 'iw-jd__ref ' + (team === 0 ? 'a' : 'b') + (kind === 'judd' ? ' is-judd' : ' is-liljudd'), data: { ref: kind, team: String(team) } },
          flag,
          h('div', { class: 'iw-jd__figure', html: '${CAT_FIGURE}' }),
          h('div', { class: 'iw-jd__refname iw-display' }, kind === 'judd' ? 'JUDD' : "LI'L JUDD"));
        return { node, flag, team };
      };
      const refJudd = referee(localTeam, 'judd'), refLil = referee(localTeam === 0 ? 1 : 0, 'lil-judd');
      const el = h('div', { class: 'iw-jd iw-jd--refs' },
        h('div', { class: 'iw-jd__bg' }),
        h('div', { class: 'iw-jd__title iw-display' }, h('span', null, 'TURF WAR'), h('span', { class: 'iw-jd__dots' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'iw-jd__refs' }, refJudd.node, refLil.node),
        h('div', { class: 'iw-jd__stage' },
          mapPlate,
          h('div', { class: 'iw-jd__arena' },
            h('div', { class: 'iw-jd__labels' },
              h('div', { class: 'iw-jd__side a' }, h('span', { class: 'iw-jd__name' }, names[0] || TEAM_NAMES[0]), numA),
              h('div', { class: 'iw-jd__side b' }, numB, h('span', { class: 'iw-jd__name' }, names[1] || TEAM_NAMES[1]))),
            h('div', { class: 'iw-jd__track' }, h('div', { class: 'iw-jd__clip' }, barA, barB), edgeA, edgeB, clash))),
        win);`,
    'stage plate with both referees');

  // Reduced motion plus the authoritative outcome assignment, installed with the FX clock.
  patch(
    `      const t0 = this._fxTime;`,
    `      // #894 reduced motion (prefers-reduced-motion, or an explicit HUD override): the
      // finished two-referee result is presented straight away instead of animated into place.
      const juddReduced = (() => { try { if (typeof this._juddReducedMotion === 'function') return !!this._juddReducedMotion(); return typeof prefersReducedMotion === 'function' ? !!prefersReducedMotion() : false; } catch { return false; } })();
      const setRefOutcome = () => {
        const tie = winner !== 0 && winner !== 1;
        for (const r of [refJudd, refLil]) {
          r.node.classList.add(tie ? 'is-tie' : (r.team === winner ? 'is-win' : 'is-lose'));
          r.flag.classList.add(tie ? 'is-flat' : (r.team === winner ? 'is-up' : 'is-down'));
        }
      };
      const t0 = this._fxTime - (juddReduced ? 3.8 : 0);`,
    'reduced-motion clock and referee outcome');

  // No rolling fake percentages while judging: only the drumroll beat remains.
  patch(
    `          rollT += dt;
          if (rollT > 0.05) {
            rollT = 0;
            if (t > 2.3) { numA.textContent = '??.?%'; numB.textContent = '??.?%'; el.classList.add('is-drum'); }
            else { numA.textContent = fmt(10 + Math.random() * 60); numB.textContent = fmt(10 + Math.random() * 60); }
          }`,
    `          rollT += dt;
          if (rollT > 0.05) {
            rollT = 0;
            // #894 the referees keep the real coverage undisclosed until the reveal, so the
            // judgement never displays a value it did not measure.
            if (t > 2.3) el.classList.add('is-drum');
          }`,
    'drop random interim percentages');

  patch(
    `        const rk = clamp((t - 3.45) / 0.55);`,
    `        const rk = juddReduced ? 1 : clamp((t - 3.45) / 0.55);`,
    'reduced motion settles the turf plate immediately');

  patch(
    `        const nk = easeOutCubic(clamp((t - 3.45) / 0.45));`,
    `        const nk = juddReduced ? 1 : easeOutCubic(clamp((t - 3.45) / 0.45));`,
    'reduced motion shows the final coverage immediately');

  patch(
    `        if (!punched && t > 3.75) { punched = true; el.classList.add('is-winner', winner === 1 ? 'is-win-b' : winner === 0 ? 'is-win-a' : 'is-tie'); }`,
    `        if (!punched && t > 3.75) { punched = true; el.classList.add('is-winner', winner === 1 ? 'is-win-b' : winner === 0 ? 'is-win-a' : 'is-tie'); setRefOutcome(); }`,
    'authoritative winner drives the referee flags');

  return code;
}

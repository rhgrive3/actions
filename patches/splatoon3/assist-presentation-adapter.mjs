// Build-only source connections for Splatoon 3 assist presentation (Issue #561).
// Upstream `inkwave-public/src/ui/hud.js` is never modified: every connection below is a
// unique exact anchor owned by the repository's replaceOnce, so a changed, missing or
// duplicated connection fails the build closed instead of silently publishing a fallback.
//
// Reference: Splatoon 2 and Splatoon 3 give an assisting player no splat notification.
// A different splat icon appears above the place where the opponent was splatted.
// Assist attribution itself (K.dealt, Flow Aura, result stats) is untouched; only the
// live presentation of an already-recognized assist changes.
export const ASSIST_PRESENTATION_CONNECTIONS = [
  // The recognized assist keeps its exact admission and credit-window consumption; only the
  // presentation target changes. K.dealt.delete stays so one local damage window cannot
  // present twice.
  [
    "      this._killCard(victim, 'assist');\n      K.dealt.delete(victim);",
    '      this._assistMark(victim);\n      K.dealt.delete(victim);',
    'assist leaves the kill-card stack',
  ],
  // World-space assist marker. Reuses the existing ally-down projection pool
  // (downLayer/_downs/_updDowns) and the distinct SPLAT_ICON; no name tag, no sound.
  [
    '  // ---------------------------------------------------------------- kill / assist cards + callouts\n  _killCard(victim, kind) {',
    [
      '  // Splatoon 3: the assister gets no splat notification. A distinct splat icon appears',
      '  // above the splatted location instead, projected through the existing world pool.',
      '  _assistMark(victim) {',
      '    if (!victim.pos) return;',
      "    const el = h('div', { class: 'iw-down iw-down--assist' }, h('i', { html: SPLAT_ICON }));",
      "    colorVars(el, 'c', '#ffffff');",
      '    this.downLayer.appendChild(el);',
      '    this._downs.push({ el, x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z, t: 0 });',
      '    if (this._downs.length > 4) this._downs.shift().el.remove();',
      '  }',
      '',
      '  // ---------------------------------------------------------------- kill cards + callouts',
      '  _killCard(victim, kind) {',
    ].join('\n'),
    'world-space assist marker',
  ],
  // The remaining assist-only presentation inside the direct-splat kill card is removed.
  // Direct-splat cards keep their own colour, label, 2200 ms lifetime and no extra sound.
  [
    "    const col = toHex(G.teamHex?.[victim.team], kind === 'assist' ? '#ffffff' : (this._L.cb || '#2f5bff'));",
    "    const col = toHex(G.teamHex?.[victim.team], this._L.cb || '#2f5bff');",
    'direct-splat card colour',
  ],
  [
    "        h('small', null, kind === 'assist' ? 'ASSIST' : (isJa ? 'たおした！' : 'SPLATTED')),",
    "        h('small', null, isJa ? 'たおした！' : 'SPLATTED'),",
    'no ASSIST label on a splat card',
  ],
  [
    '    card._t = setTimeout(() => this._dropCard(card), kind === \'assist\' ? 1700 : 2200);',
    '    card._t = setTimeout(() => this._dropCard(card), 2200);',
    'direct-splat card lifetime',
  ],
  [
    "    if (kind === 'assist') this._snd('hit_marker', { volume: 0.4, pitch: 1.3 });\n",
    '',
    'unverified assist hit-marker sound',
  ],
];

export function adaptAssistPresentation(rel, code, replaceOnce) {
  if (rel !== 'src/ui/hud.js') return code;
  for (const [before, after, label] of ASSIST_PRESENTATION_CONNECTIONS) {
    code = replaceOnce(code, before, after, 'assist presentation: ' + label);
  }
  return code;
}
// Issue #305: the locked public Roller runner rejects any flick whose ink is
// below the full swing cost. Splatoon 3 instead runs a depletion attack: the
// real (already-depleted) tank pays the reduced cost once and the swing fires.
// This adapter only adds a positive-tank branch in front of the original gate.
// When the installed roller runtime has not marked a depletion swing, the
// original `if (a.ink < w.flickInk)` rejection runs unchanged, so no unmapped
// composition can emit a short flick with a full-cost volley.
export function adaptRollerDepletion(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  return replaceOnce(code,
    '      if (a.ink < w.flickInk) { this._empty(); }',
    `      const s3dep = this.s3RollerDepletion;
      if (s3dep && a.ink > 1e-10) {
        // Pay the actual remaining-tank amount once; never inject ink to satisfy
        // the native full gate.
        a.ink = Math.max(0, a.ink - Math.min(a.ink, s3dep.inkCost)); a.lastFire = 0;
        this.flick = 0;
        a.character.trigger('flick');
        if (a.isLocal || a._nearCamera()) G.audio?.play('roller_flick', { pos: a.isLocal ? undefined : a.pos, volume: 0.8 });
        return;
      }
      if (a.ink < w.flickInk) { this._empty(); }`,
    'roller depletion flick admission');
}

// Current-main residuals from the ten-issue INKWAVE batch. Work only on the
// disposable composed build: the upstream-locked source must remain untouched.
export function adaptIssue10Gameplay(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'issue10 ' + label); };
  if (rel === 'src/game/actor.js') {
    // #646: A normal Super Jump landing is a movement action, not a splat.
    // Its ring/burst/rumble/actor grounded transition remain presentation-only.
    patch('        this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));',
      '        // #646: ordinary Super Jump landing neither paints nor credits turf/special.',
      'superjump no free paint');
  }
  return code;
}

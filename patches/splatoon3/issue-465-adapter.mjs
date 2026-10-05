// Capture the actual form at the native ZR edge, before the native emerge transition.
// A recently emerged humanoid is not a swim-origin press merely because kidT is small.
export function adaptIssue465(rel, code) {
  if (rel !== 'src/game/actor.js') return code;
  const before = '    if (firePressed) this._firePressT = G.time;';
  if (code.indexOf(before) < 0 || code.indexOf(before) !== code.lastIndexOf(before))
    throw new Error('INKWAVE issue-465 patch conflict: native fire edge');
  return code.replace(before, `    if (firePressed) {
      this._firePressT = G.time;
      if (this.weapon.kind === 'blaster') this.weaponRunner.s3BlasterFromSwim = this.form === 'squid';
    }`);
}
// Refill fallback with no own ink nearby ("paint a puddle to swim in") held Fire every tick. Chargers and Splatlings only
// emit when Fire is released, and a held charge keeps WeaponRunner.busy() true, which blocks kid-form ink recovery: the bot
// charged forever, painted nothing and never left refill mode. Hold-to-fire weapons are unchanged; hold/release weapons
// charge briefly, then drop Fire so the shot / stream paints the puddle.
const HOLD = 0.25;   // seconds of charge before the refill fallback releases Fire (project value, not an S3 figure)

export function adaptBotRefillRelease(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  // Progressive Charger payment may cross the start threshold before release.
  // Keep an admitted charge inside the fallback until its release owner completes.
  const admission = 'a.groundTeam !== 1 && this._pathRemaining() < 1.5 && inkFrac > 0.03';
  if (code.split(admission).length - 1 !== 2) throw new Error('bot refill puddle admission conflict');
  code = code.replaceAll(admission, 'a.groundTeam !== 1 && this._pathRemaining() < 1.5 && (inkFrac > 0.03 || w.kind === \'charger\' && (a.weaponRunner.charging || a.weaponRunner.s3ReleaseHold))');
  code = once(code,
    '  _pathRemaining() {',
    '  // Refill-puddle trigger. Held Fire only emits for weapons that fire while held; charger / splatling emit on release,\n' +
    '  // and a held charge blocks kid-form recovery (busy()), so charge for a moment, then let go.\n' +
    '  _puddleFire(dt) {\n' +
    "    const k = this.a.weapon.kind;\n" +
    "    if (k !== 'charger' && k !== 'splatling') return true;\n" +
    '    const wr = this.a.weaponRunner;\n' +
    '    if (this.t - (this._puddleT ?? -9) > 0.25) this._puddleHold = 0;   // fallback was not running: start a fresh hold\n' +
    '    this._puddleT = this.t;\n' +
    '    if (wr.streaming) { this._puddleHold = 0; return false; }\n' +
    '    if (wr.s3ReleaseHold) { this._puddleHold = 0; return false; }   // preserve the queued source-guided release\n' +
    '    if (!wr.charging) { this._puddleHold = 0; return true; }\n' +
    '    this._puddleHold = (this._puddleHold || 0) + dt;\n' +
    `    return this._puddleHold < ${HOLD};\n` +
    '  }\n\n' +
    '  _pathRemaining() {',
    'bot refill puddle trigger');
  code = once(code,
    '        // no ink here: paint a puddle to swim in\n        it.squid = false; it.fire = true;',
    '        // no ink here: paint a puddle to swim in\n        it.squid = false; it.fire = this._puddleFire(dt);',
    'bot refill puddle (turf)');
  return once(code,
    '{ it.squid = false; it.fire = true; wantPitch = -1.0; }',
    '{ it.squid = false; it.fire = this._puddleFire(dt); wantPitch = -1.0; }',
    'bot refill puddle (boss)');
}

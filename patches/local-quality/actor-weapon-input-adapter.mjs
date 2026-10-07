// Actor.update handed WeaponRunner.update a fresh four-boolean object on every live tick (up to ~480/s in a 4v4). The runner
// and every S3 wrapper consume it synchronously (they spread or read it; none retains it), so each Actor owns one reusable
// input object whose four fields are rewritten before the call. Per-actor ownership keeps nested/wrapped calls independent.
export function adaptActorWeaponInput(rel, code, once) {
  if (rel !== 'src/game/actor.js') return code;
  code = once(code,
    '    this._prevIntent = { fire: false, sub: false, jump: false, special: false, squid: false };\n',
    '    this._prevIntent = { fire: false, sub: false, jump: false, special: false, squid: false };\n' +
    '    this._weaponInput = { fire: false, firePressed: false, sub: false, subReleased: false };   // reused every tick (no per-tick allocation)\n',
    'Actor weapon input storage');
  return once(code,
    '    this.weaponRunner.update(dt, { fire, firePressed: pressed, sub: intent.sub && !isSquid, subReleased: subReleased && !isSquid });',
    '    const winp = this._weaponInput;\n' +
    '    winp.fire = fire; winp.firePressed = pressed; winp.sub = intent.sub && !isSquid; winp.subReleased = subReleased && !isSquid;\n' +
    '    this.weaponRunner.update(dt, winp);',
    'Actor weapon input reuse');
}

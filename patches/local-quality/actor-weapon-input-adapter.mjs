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
  const needle = 'this.weaponRunner.update(dt, {';
  const at = code.indexOf(needle);
  if (at < 0 || code.indexOf(needle, at + needle.length) !== -1) {
    throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): expected one WeaponRunner update call');
  }
  const lineStart = code.lastIndexOf('\n', at) + 1;
  const lineEnd0 = code.indexOf('\n', at);
  const lineEnd = lineEnd0 < 0 ? code.length : lineEnd0;
  const line = code.slice(lineStart, lineEnd);
  const m = line.match(/^(\s*)this\.weaponRunner\.update\(dt,\s*\{\s*fire(?:\s*:\s*([^,}]+))?,\s*firePressed:\s*([^,}]+),\s*sub:\s*([^,}]+),\s*subReleased:\s*([^}]+)\s*\}\);\s*$/);
  if (!m) throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): unsupported WeaponRunner input shape');
  const [, indent, fireExpr = 'fire', pressedExpr, subExpr, subReleasedExpr] = m;
  const after = indent + 'const winp = this._weaponInput;\n' +
    indent + 'winp.fire = ' + fireExpr.trim() + '; winp.firePressed = ' + pressedExpr.trim() +
    '; winp.sub = ' + subExpr.trim() + '; winp.subReleased = ' + subReleasedExpr.trim() + ';\n' +
    indent + 'this.weaponRunner.update(dt, winp);';
  return code.slice(0, lineStart) + after + code.slice(lineEnd);
}

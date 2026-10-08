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
  const objStart = code.indexOf('{', at);
  const objEnd = code.indexOf('});', objStart);
  if (objStart < 0 || objEnd < 0)
    throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): unterminated WeaponRunner input object');
  const body = code.slice(objStart + 1, objEnd);
  const splitTopLevel = (source) => {
    const parts = []; let start = 0, depth = 0, quote = '', escaped = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) { parts.push(source.slice(start, i)); start = i + 1; }
    }
    parts.push(source.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
  };
  const fields = splitTopLevel(body).map((part) => {
    let depth = 0, quote = '', escaped = false, colon = -1;
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ':' && depth === 0) { colon = i; break; }
    }
    const key = (colon < 0 ? part : part.slice(0, colon)).trim();
    const expr = (colon < 0 ? part : part.slice(colon + 1)).trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) || !expr)
      throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): unsupported field ' + part);
    return [key, expr];
  });
  const requiredFields = ['fire', 'firePressed', 'sub', 'subReleased'];
  if (fields.length !== requiredFields.length || fields.some(([key], i) => key !== requiredFields[i]))
    throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): unexpected WeaponRunner input fields');
  const fieldExpr = Object.fromEntries(fields);
  if (!fieldExpr.sub.includes('!isSquid') || !fieldExpr.subReleased.includes('!isSquid'))
    throw new Error('INKWAVE quality patch conflict (Actor weapon input reuse): squid gate drift');
  const assigns = fields.map(([key, expr]) => `this._weaponInput.${key} = (${expr})`).join(', ');
  const after = '(' + assigns + ', this.weaponRunner.update(dt, this._weaponInput))';
  return code.slice(0, at) + after + code.slice(objEnd + 3);
}

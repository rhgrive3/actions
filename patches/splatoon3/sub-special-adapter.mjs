// Build-only source connection for Sub/Special fidelity.
// The repository's replaceOnce owner makes this fail closed if upstream changes.
export function adaptSubSpecialFidelity(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  return replaceOnce(
    code,
    '        if (hit.normal.y > 0.6 && b.fuse < 0) {',
    '        if (b.fuse < 0) {',
    'sub/special: Splat Bomb arms on first world-surface contact',
  );
}

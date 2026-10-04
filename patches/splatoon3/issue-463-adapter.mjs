// Sourced Splatoon 3 Ver. 11.3.0 Blaster player collision radius (Issue #463).
// Replaces generic visual blob size p.size = 0.26 with authoritative playerHitRadius = 0.285.
// Field collision, direct damage, explosion damage bands and visual blob size remain independent.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-463 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue463(rel, code) {
  if (rel !== 'src/game/weapons.js') return code;

  // Adapt fireBlaster to expose explicit authoritative s3PlayerRadius: 0.285
  if (code.includes('size: 0.26,')) {
    code = replaceOnce(
      code,
      'size: 0.26,',
      'size: 0.26, s3PlayerRadius: 0.285,',
      'blaster projectile player radius tag'
    );
  }

  // Adapt player collision check to use authoritative blasterPlayerCollisionRadius(p)
  if (code.includes('PLAYER.radius * 0.95 + p.size')) {
    code = replaceOnce(
      code,
      'PLAYER.radius * 0.95 + p.size',
      'PLAYER.radius * 0.95 + blasterPlayerCollisionRadius(p)',
      'blaster authoritative player collision radius'
    );
  } else if (code.includes('PLAYER.radius * 0.95 + playerCollisionRadius(p)')) {
    code = replaceOnce(
      code,
      'PLAYER.radius * 0.95 + playerCollisionRadius(p)',
      "PLAYER.radius * 0.95 + (p.type === 'blast' ? blasterPlayerCollisionRadius(p) : playerCollisionRadius(p))",
      'blaster authoritative player collision radius composite'
    );
  } else {
    throw new Error('INKWAVE issue-463 patch conflict: player collision threshold anchor not found');
  }

  return "import { blasterPlayerCollisionRadius } from '../../patches/splatoon3/runtime/blaster-player-radius.mjs';\n" + code;
}

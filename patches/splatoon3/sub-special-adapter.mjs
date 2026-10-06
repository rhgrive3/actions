// Build-only source connection for Sub/Special fidelity.
// The repository's replaceOnce owner makes this fail closed if upstream changes.
export function adaptSubSpecialFidelity(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replaceOnce(
    code,
    '        if (hit.normal.y > 0.6 && b.fuse < 0) {',
    '        if (b.fuse < 0) {',
    'sub/special: Splat Bomb arms on first world-surface contact',
  );
  code = replaceOnce(code,
    '        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);',
    '        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);\n' +
    "        if (b.kind === 'bomb') {\n" +
    '          if (!b.s3FuseNormal) b.s3FuseNormal = new THREE.Vector3();\n' +
    '          b.s3FuseNormal.copy(hit.normal);\n' +
    '        }', 'bomb fuse contact normal');
  code = replaceOnce(code,
    '      if (b.fuse >= 0) {\n        b.fuse -= dt;',
    '      // Native collision places the center 0.21 from the surface.\n' +
    '      // Probe that same clearance to retain resting contact between sweeps.\n' +
    "      const fuseContact = b.kind !== 'bomb' || hit.hit || b.s3FuseNormal &&\n" +
    '        G.physics.raycast(b.pos, _v2.copy(b.s3FuseNormal).negate(), 0.21 + 1e-8, _hit2).hit;\n' +
    '      if (b.fuse >= 0 && fuseContact) {\n        b.fuse -= dt;', 'bomb fuse advances only on surface contact');
  return replaceOnce(
    code,
    'dx * dx + dz * dz > sp.radius * sp.radius || e.pos.y > c.group.position.y',
    'dx * dx + dz * dz > (sp.radius * s) ** 2 || e.pos.y > c.group.position.y',
    'sub/special: Storm player coverage shares current rain/Boss radius',
  );
}

// Final, fail-closed transformations for the 2026-10-24 Drive queue.
// The upstream snapshot and every preceding gameplay adapter stay intact.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error('Drive core queue composition conflict: ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptDriveCoreQueue(rel, code) {
  const patch = (before, after, label) => { code = once(code, before, after, label); };
  if (rel === 'src/net/netmatch.js') {
    patch('  if (hasStretch && ![e[9], e[10], e[11]].every(paintFloat)) return false;',
      '  if (hasStretch) { const sx=e[9], sy=e[10], sz=e[11]; if (!paintFloat(sx) || !paintFloat(sy) || !paintFloat(sz)) return false; }',
      'paint stretch scalar validation');
    patch('    } else if (n.prev && n.prevT !== undefined && n.ready) {\n      const P = n._P || (n._P = {});\n      queueBossPath(buf, n.prevT, P);',
      '    } else if (n.prev && n.prevT !== undefined && n.ready && (n._driveBossBuffer !== buf || n._driveBossFirst !== buf[0] || n._driveBossLast !== buf[buf.length-1] || n._driveBossLength !== buf.length || n._driveBossOwner !== this.s.hostId)) {\n      const P = n._P || (n._P = {});\n      queueBossPath(buf, n.prevT, P);',
      'unchanged Boss rewind input');
    patch('    (n.prev || (n.prev = new THREE.Vector3())).set(S.x + err.x, S.y + err.y, S.z + err.z);\n    n.ready = true;',
      '    (n.prev || (n.prev = new THREE.Vector3())).set(S.x + err.x, S.y + err.y, S.z + err.z);\n    n._driveBossBuffer=buf; n._driveBossFirst=buf[0]; n._driveBossLast=buf[buf.length-1]; n._driveBossLength=buf.length; n._driveBossOwner=this.s.hostId;\n    n.ready = true;',
      'remember Boss rewind inputs');
  }
  if (rel === 'src/game/character-weapons.js') {
    patch('  const shotK = pulseE(ts, 0.006, 30);',
      "  const shotK = kind === 'shooter' || kind === 'splatling' ? pulseE(ts, 0.006, 30) : 0;",
      'only two weapon families consume the common shot pulse');
  }
  return code;
}

// #579 — keep the gamepad look filter current while the Turf Map owns the camera.
// Raw inkwave-public stays immutable; this build adapter only changes ownership
// of the already-existing filter update. While mapUp is true, the right stick,
// padLook and edgeT continue to track the physical pad, but no gameplay camera
// yaw/pitch is emitted. Closing the map therefore cannot replay stale turn state.

const replaceOnce = (code, before, after, label) => {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE reliability patch conflict (map look: ${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
};

const replaceVariantOnce = (code, variants, label) => {
  const found = variants.filter(({ before }) => {
    const at = code.indexOf(before);
    return at >= 0 && code.indexOf(before, at + before.length) < 0;
  });
  if (found.length !== 1) {
    throw new Error(`INKWAVE reliability patch conflict (map look: ${label}): expected exactly one composed connection`);
  }
  return replaceOnce(code, found[0].before, found[0].after, label);
};

export function adaptMapLook(rel, code) {
  if (rel !== 'src/game/player.js') return code;

  code = replaceVariantOnce(code, [
    {
      before: '    if (usingPad && !mapUp) {',
      after: '    if (usingPad) {',
    },
    {
      before: '    if (inp.pad && !mapUp) {',
      after: '    if (inp.pad) {',
    },
  ], 'pad filter ownership');

  code = replaceOnce(code,
    '      if (_stick.mag > 0) lookActive = true;',
    '      if (!mapUp && _stick.mag > 0) lookActive = true;',
    'look activity suppression');

  if (!code.includes('if (!mapUp) rig.yaw -= this.padLook.x')) {
    const yawPattern = /^([ \t]*)rig\.yaw -= this\.padLook\.x[^;]*;$/gm;
    const yawMatches = [...code.matchAll(yawPattern)];
    if (yawMatches.length !== 1) {
      throw new Error(`INKWAVE reliability patch conflict (map look: map yaw suppression): expected exactly one padLook yaw line (${yawMatches.length})`);
    }
    code = code.replace(yawPattern, '$1if (!mapUp) ' + yawMatches[0][0].trimStart());
  }

  if (!code.includes('if (!mapUp) rig.pitch -= this.padLook.y') &&
      !code.includes('if (!mapUp && !gyroActive) rig.pitch -= this.padLook.y')) {
    const pitchPattern = /^([ \t]*)(?:if \(!gyroActive\) )?rig\.pitch -= this\.padLook\.y[^;]*;$/gm;
    const pitchMatches = [...code.matchAll(pitchPattern)];
    if (pitchMatches.length !== 1) {
      throw new Error(`INKWAVE reliability patch conflict (map look: map pitch suppression): expected exactly one padLook pitch line (${pitchMatches.length})`);
    }
    code = code.replace(pitchPattern, (line, indent) => {
      const body = line.trimStart();
      if (body.startsWith('if (!gyroActive) ')) return indent + body.replace('if (!gyroActive) ', 'if (!mapUp && !gyroActive) ');
      return indent + 'if (!mapUp) ' + body;
    });
  }

  return code;
}

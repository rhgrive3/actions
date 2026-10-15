// Splatoon 3 squid-form look (presentation only).
//
// References (fetched 2026-10-08): Nintendo's Japanese site clip ikahito_pc.mp4 and the How to Play clips
// s3_howtoplay_move01/02/03.mp4 (hashes in reports/inkwave-s3-hud-look-2026-10-08.md).
//  * Swimming in own ink: the clips show a raised surface over the squid. A floor-level hemisphere mound was tried
//    and removed (see the note after HALF_TURN); the local swimmer keeps the squid-shaped ghost, splashes/wake come from FX.
//  * The squid travels mantle-first with its face trailing (eyes toward the third-person camera); on dry ground it
//    lies flat with the eyes up and hops; arms are short and bundled, with two long feelers ending in dark clubs.
// Gameplay (speed, acceleration, hop timing, visibility rules, damage) is untouched; remote swimmers stay hidden
// by the floor exactly as before, and the climbing ghost is unchanged.

function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE S3 squid look conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const HALF_TURN = `
    // S3 squids travel mantle-first with the face trailing: in the official clips the third-person camera sees
    // the eyes of a squid moving away from it (rising out of ink, landing, climbing). Turn the drawn squid half
    // a turn about its mantle axis inside the pivot, so every pose owner (native, swim/roll/wall/flight patches)
    // keeps its own pivot transform and the face simply sits on the trailing side.
    for (const m of [body, ghost, dark, eyes]) m.rotation.y = Math.PI;`;

// The former own-ink mound (a team-coloured hemisphere scaled into an ellipse at the floor) was removed. It was
// only reachable from the native squid path (roller family; the sourced squid rig never updated it), its
// visibility switched on at full size on the first swim frame while the squid body was still above the ink
// (entering ink from dry ground, landing, form changes) and it kept the native yaw while swim-motion turned the
// body, so players saw an unexplained own-colour ellipse under the squid. The local swimmer now uses the same
// squid-shaped ghost on every weapon path.

export function adaptS3SquidLook(rel, code) {
  if (rel === 'src/game/character.js') {
    code = once(code, '    this.squid = { pivot, body, ghost, dark, eyes };\n', '    this.squid = { pivot, body, ghost, dark, eyes };' + HALF_TURN + '\n', 'trailing face');
    // Dry ground: the clips show the squid lying flat, mantle pointing along travel and eyes up (move02 0.0–0.25 s
    // and 6.6 s), not standing on its arms. Keep the native hop/squash/yaw clocks; only the resting axis changes.
    code = once(code,
      "      _e1.set(tilt, this.sqYaw, 0.05 * Math.sin(t * 2.3), 'YXZ'); q.setFromEuler(_e1);\n      p.set(0, 0.165 + hop, 0);",
      "      _e1.set(Math.PI / 2 - 0.52 - tilt * 0.5, this.sqYaw, 0.05 * Math.sin(t * 2.3), 'YXZ'); q.setFromEuler(_e1);\n      p.set(0, 0.09 + hop * 0.8, 0);\n      _v2.set(0, -0.11, 0).applyQuaternion(q); p.add(_v2);", 'flat dry squid');
    return code;
  }
  if (rel === 'src/game/character-geo.js') {
    // the two long feelers hang in front of the face (the +Z side, which faces the camera after the half turn),
    // as in the clips; the other arms are short, stubby and hang close together instead of splaying out
    code = once(code, '    const feeler = k === 4 || k === 6;', '    const feeler = k === 0 || k === N - 1;', 'feelers under the face');
    code = once(code,
      '    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 1.3 : 1);',
      '    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 2.0 : 0.62);', 'bundled arms and long feelers');
    code = once(code,
      '    const raw = [[dx * 0.055, 0.012, dz * 0.055], [dx * 0.09, -0.04, dz * 0.09], [dx * 0.118, -0.035 - len * 0.55, dz * 0.118], [dx * 0.15, -0.035 - len * 0.86, dz * 0.15], [dx * (0.178 + curl * 0.6), -0.032 - len * 0.98, dz * (0.178 + curl * 0.6)]].map((q) => new V3(...q));',
      '    const raw = [[dx * 0.055, 0.012, dz * 0.055], [dx * 0.08, -0.04, dz * 0.08], [dx * 0.088, -0.035 - len * 0.55, dz * 0.088], [dx * 0.094, -0.035 - len * 0.86, dz * 0.094], [dx * (0.1 + curl * 0.3), -0.032 - len * 0.98, dz * (0.1 + curl * 0.3)]].map((q) => new V3(...q));', 'arms hang bundled');
    // S3 squid colours follow the tentacle scheme: the two longest tentacles shade darker toward their club
    // tips (negative tint = the material's dark ink shade); the cups keep their pale tint, so the club reads
    // as a dark tip with light spots.
    code = once(code,
      'color: (p, i) => _c.setRGB(tint(tA[i]), tA[i], k / N)',
      'color: (p, i) => _c.setRGB(feeler ? lerp(tint(tA[i]), -0.95, sstep(0.5, 0.8, tA[i])) : tint(tA[i]), tA[i], k / N)', 'dark feeler clubs');
    // bigger eyes in a slightly taller mask band, as the clips' squid face reads mostly as eyes
    code = once(code, 'const hh = 0.045 * Math.pow(', 'const hh = 0.053 * Math.pow(', 'taller mask band');
    code = once(code, 'sqSurfN(sx * 0.5 + u * 0.31, 0.092 + v * 0.037,', 'sqSurfN(sx * 0.5 + u * 0.37, 0.092 + v * 0.045,', 'bigger squid eyes');
    return once(code,
      "(feeler ? 0.22 * gauss(t - 0.8, 0.07) : 0)",
      "(feeler ? 2.4 * gauss(t - 0.8, 0.1) : 0)", 'feeler club tips');
  }
  return code;
}

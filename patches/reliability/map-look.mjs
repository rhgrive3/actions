// Turf Map must not freeze the gameplay camera filter (#579).
//
// The native right-stick look branch is gated by `!mapUp`, so while the map is up
// `padLook.x/y` and the rim-boost timer `edgeT` are neither advanced nor decayed.
// They stay paused in time at their pre-map values and are replayed into
// `rig.yaw` / `rig.pitch` on the first frame after the map closes, which also
// moves the aim ray. The residual grows with frame rate and pad sensitivity.
//
// Policy (issue #579): the map owns the right stick as a cursor, but the gameplay
// filter must keep tracking the *live* physical stick while it does. On the rising
// edge of `mapUp` any pre-map filter state is dropped outright, then every map frame
// the same low-pass/edge-boost the gameplay path uses is advanced against the live
// stick. Nothing here is applied to the rig and no button/axis edge is synthesized,
// so a neutral stick reads neutral when the map closes while a deliberately held
// stick still turns the camera immediately.
//
// Distinct from #521 (stale filter across a disabled controller) and #475 (stale
// filter when the pad is not the owning device): this only runs while the controller
// is enabled and the pad is present.
//
// Build connection (#579): raw inkwave-public/ is never edited. The maintenance
// helper is injected directly above `class PlayerController` and called right after
// the `mapUp` line — not imported from patches/reliability/, because the published
// tree only copies patches/splatoon3, patches/local-quality and patches/practice-range
// runtime files, so a reliability import from player.js would 404 when the site loads.
// The helper reuses the native `lookCurve`, so there is no second copy of the
// response curve to drift. The native `if (inp.pad && !mapUp)` gameplay branch is
// left byte-identical, so non-map behaviour cannot drift.
import { replaceOnce } from './input-adapter.mjs';

const MAP_UP = "    const mapUp = (G.rig?.mapK ?? 0) > 0.05 || inp.down('Tab') || inp.down('KeyM') || inp.padButton(8) || !!touch?.mapOpen;";
const CLASS = 'export class PlayerController {';
const CALL = '    maintainPadLook(this, inp, mapUp, dt);';

// Module-scope helper, injected immediately above the class. It only reads the
// live pad through inp.padStick (same sampling the gameplay branch uses, into its
// own buffer so the shared `_stick` is never touched) and writes padLook/edgeT.
const HELPER = [
  '// #579: the map owns the right stick, but the gameplay camera filter keeps tracking',
  '// the live stick, so a neutral stick reads neutral when the map closes.',
  'const _mapStick = { x: 0, y: 0, mag: 0 };',
  'function maintainPadLook(c, inp, mapUp, dt) {',
  '  if (!mapUp || !inp || !inp.pad) { c._mapLookOpen = false; return; }',
  '  // Rising edge: a pre-map filter value must not survive into the map interval.',
  '  if (!c._mapLookOpen) { c._mapLookOpen = true; c.padLook.x = c.padLook.y = 0; c.edgeT = 0; }',
  '  inp.padStick(2, 3, _mapStick, 0.11, 0.96);',
  '  if (_mapStick.mag > 0.93) c.edgeT = Math.min(0.5, c.edgeT + dt); else c.edgeT = Math.max(0, c.edgeT - dt * 3);',
  '  const k = 1 - Math.exp(-60 * dt);',
  '  const mc = _mapStick.mag > 0 ? lookCurve(_mapStick.mag) / _mapStick.mag : 0;',
  '  c.padLook.x += (_mapStick.x * mc - c.padLook.x) * k;',
  '  c.padLook.y += (_mapStick.y * mc - c.padLook.y) * k;',
  '}',
  '',
].join('\n');

export function adaptMapLook(rel, code) {
  if (rel !== 'src/game/player.js') return code;
  // Fail closed on a second application: both anchors are still present in the
  // patched source, so replaceOnce alone would insert a duplicate helper/call.
  if (code.includes('maintainPadLook')) {
    throw new Error('INKWAVE reliability map-look conflict (turf map look maintenance): already connected. Review upstream changes; site was not built.');
  }
  code = replaceOnce(code, CLASS, HELPER + CLASS, 'turf map look helper');
  code = replaceOnce(code, MAP_UP,
    MAP_UP + '\n' +
    '    // #579: keep the gameplay filter tracking the live stick while the map suppresses it.\n' +
    CALL,
    'turf map look maintenance');
  return code;
}

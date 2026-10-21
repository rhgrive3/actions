import { adaptQueueNine } from '../patches/reliability/queue-nine-final-adapter.mjs';
import { adaptCombatProvenance } from '../patches/network-replication/combat-provenance-adapter.mjs';
import { adaptWeaponOpponentPreview } from '../patches/splatoon3/weapon-opponent-preview-adapter.mjs';
import { adaptWeaponOpponentPalette } from '../patches/splatoon3/weapon-opponent-palette-adapter.mjs';
import { adaptUiLocalization } from '../patches/splatoon3/ui-localization-adapter.mjs';
import { adaptNativeStages } from '../patches/native-stages/adapter.mjs';
import { adaptWeaponAudio } from '../patches/splatoon3/audio-adapter.mjs';
import { adaptSource } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../patches/local-quality/adapter.mjs';
import { adaptStaticMenuArt } from '../patches/local-quality/static-menu-adapter.mjs';
import { adaptNetworkSource } from '../patches/network-replication/adapter.mjs';
import { adaptRange } from '../patches/practice-range/adapter.mjs';
import { adaptRanked } from '../patches/splatoon3/ranked-adapter.mjs';
import { adaptCameraAimControls } from '../patches/splatoon3/camera-aim-controls-adapter.mjs';
import { adaptProjectileVisuals } from '../patches/splatoon3/projectile-visual-adapter.mjs';
import { adaptMainInkFootprints } from '../patches/splatoon3/main-ink-footprint-adapter.mjs';
import { adaptLoadingScreen } from '../patches/local-quality/loading-screen-adapter.mjs';

// #1165: the Roller ink band must claim its seeded GPU core in the CPU turf
// grid. Apply at build time so the upstream game snapshot remains immutable.
function adaptRollerBandParity(rel, code) {
  if (rel !== 'src/world/paint.js') return code;
  const constants = 'const BAND_L = 0.55, BAND_W = 0.62, BAND_R = 0.1;';
  const helper = [
    'export function rollerBandSignedDistance(along, across, r, seed) {',
    '  if (!(r > 0)) return Infinity;',
    '  const wv = r * (0.03 * Math.sin(along / r * 9 + seed * 30) + 0.018 * Math.sin(along / r * 23 + seed * 11));',
    '  const qa = Math.abs(along) - r * BAND_L, qb = Math.abs(across) - (r * BAND_W + wv);',
    '  return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;',
    '}',
  ].join('\n');
  code = replaceOnce(code, constants, constants + '\n' + helper, 'Roller seeded band CPU/GPU shared boundary');
  // The former axis-independent CPU scan bound misses some rotated,
  // seed-expanded rounded corners even after the SDFs agree.
  code = replaceOnce(code,
    '    const ext = roll ? r * (Math.hypot(BAND_L, BAND_W) + BAND_R + 0.05) : r * (1 + sa) * WOB_MAX;',
    '    const ext = roll ? r * Math.hypot(BAND_L + BAND_R, BAND_W + BAND_R + 0.048) : r * (1 + sa) * WOB_MAX;',
    'Roller scan bounds cover all wobble phases and rotations');
  const original = [
    '          const qa = Math.abs(px * sdu + py * sdv) - r * BAND_L, qb = Math.abs(-px * sdv + py * sdu) - r * BAND_W;',
    '          const sd = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * BAND_R;',
    '          if (sd > -0.03 * r) continue;',
  ].join('\n');
  const corrected = [
    '          const along = px * sdu + py * sdv, across = -px * sdv + py * sdu;',
    '          // Reject the complete possible extent before paying for the two seeded sines.',
    '          if (Math.abs(along) > r * (BAND_L + BAND_R) || Math.abs(across) > r * (BAND_W + 0.048 + BAND_R)) continue;',
    '          if (rollerBandSignedDistance(along, across, r, seed) > 0) continue;',
  ].join('\n');
  return replaceOnce(code, original, corrected, 'Roller CPU ink footprint seeded band SDF');
}
// Keep the tested source path identical to the production build's adapters.
export function adaptBuildSource(rel, code) {
  // Source lives under inkwave-public/, whereas compiled modules share the
  // versioned site's root with patches/. Keep direct Node imports working and
  // remap exactly this import in published output.
  if (rel === 'src/game/inkCollision.js') code = replaceOnce(code,
    "from '../../../patches/native-stages/runtime/native-projectile-sweep.mjs'",
    "from '../../patches/native-stages/runtime/native-projectile-sweep.mjs'",
    'native sweep source/site relocation');
  code = adaptSource(rel, code);
  code = adaptTouchLayout(rel, code);
  code = adaptReliability(rel, code);
  code = adaptQualitySource(rel, code);
  code = adaptNetworkSource(rel, code);
  code = adaptRange(rel, code);
  code = adaptRanked(rel, code);
  code = adaptNativeStages(rel, code);
  // Audio patches are applied before the verified final camera pass.
  // The camera adapter must retain the terminal fail-closed position.
  code = adaptWeaponAudio(rel, code);
  code = adaptProjectileVisuals(rel, code);
  code = adaptUiLocalization(rel, code);
  code = adaptMainInkFootprints(rel, code);
  code = adaptRollerBandParity(rel, code);
  code = adaptWeaponOpponentPalette(rel, code);
  code = adaptWeaponOpponentPreview(rel, code);
  return adaptCombatProvenance(rel, applyZevantDisplayName(rel, adaptLoadingScreen(rel, adaptQueueNine(rel, adaptStaticMenuArt(rel, adaptCameraAimControls(rel, code), replaceOnce)))));
}

// Display-only rename applied after all gameplay/UI adapters. Keep the upstream
// input snapshot, storage keys, JS identifiers and source hash lock unchanged.
const ZEVANT_DISPLAY_REPLACEMENTS = {
  'index.html': [
    ['<title>INKWAVE — ナワバリバトル</title>', '<title>ZEVANT — ナワバリバトル</title>'],
    ['content="INKWAVE：4対4', 'content="ZEVANT：4対4'],
  ],
  'src/config.js': [
    ["export const GAME_TITLE = 'INKWAVE';", "export const GAME_TITLE = 'ZEVANT';"],
  ],
  'src/ui/menus.js': [
    ['The INKWAVE servers didn', 'The ZEVANT servers didn'],
    ['The squidkids and code behind INKWAVE', 'The squidkids and code behind ZEVANT'],
  ],
  'src/i18n.js': [
    ["'The squidkids and code behind INKWAVE': 'INKWAVE をつくった仲間たち'", "'The squidkids and code behind ZEVANT': 'ZEVANT をつくった仲間たち'"],
  ],
};

export function applyZevantDisplayName(rel, code) {
  for (const [before, after] of ZEVANT_DISPLAY_REPLACEMENTS[rel] || []) {
    code = replaceOnce(code, before, after, 'ZEVANT public display name (' + rel + ')');
  }
  return code;
}

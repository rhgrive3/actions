import { adaptWorldQueueBuild } from '../patches/local-quality/world-queue-build-adapter.mjs';
import { adaptSettingsHudQueue } from '../patches/local-quality/settings-hud-queue-adapter.mjs';
import { adaptFiringCosmetics } from '../patches/splatoon3/firing-cosmetics-adapter.mjs';
import { adaptAddedUiMotion } from '../patches/local-quality/added-ui-motion-adapter.mjs';
import { adaptInputLensQueue } from '../patches/local-quality/input-lens-queue-adapter.mjs';
import { adaptCharacterShadowBatch } from '../patches/local-quality/character-shadow-batch-adapter.mjs';
import { adaptQueueNetworkUi } from '../patches/reliability/queue-network-ui-adapter.mjs';
import { adaptInkRipplePresentation } from '../patches/local-quality/ink-ripple-presentation-adapter.mjs';
import { adaptShowcaseIdlePools } from '../patches/local-quality/showcase-idle-pools-adapter.mjs';
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
import { adaptSpawnExclusion } from '../patches/splatoon3/spawn-exclusion-adapter.mjs';

// #1165: the Roller ink band must claim its seeded GPU core in the CPU turf
// grid. Apply at build time so the upstream game snapshot remains immutable.
// #1165: CPU/GPU already share the native triangular seeded band morphology
// from adaptIssueBatch1171. Do not change either signed-distance equation.
// Its old circular scan box, however, is smaller than the rotated rounded
// rectangle at some seed phases. Cover the *whole* existing GPU body in CPU.
function adaptRollerBandParity(rel, code) {
  if (rel !== 'src/world/paint.js') return code;
  const old = '    const ext = roll ? r * (Math.hypot(BAND_L, BAND_W) + BAND_R + 0.05) : r * (stencil ? Math.max(1, 1 + sa) : 1 + sa) * (stencil ? 1.42 : sourced ? 1 : WOB_MAX);';
  const next = '    const ext = roll ? r * Math.hypot(BAND_L + BAND_R, BAND_W + BAND_R + 0.12) : r * (stencil ? Math.max(1, 1 + sa) : 1 + sa) * (stencil ? 1.42 : sourced ? 1 : WOB_MAX);';
  // 0.12 is the exact 0.08+0.04 maximum of the emitted GPU tooth waves.
  // Rotations cannot escape the enclosing circle of the rounded half-axes.
  return replaceOnce(code, old, next, 'Roller rotated GPU core stays in CPU scan bounds');
}

// Keep the tested source path identical to the production build's adapters.
export function adaptBuildSource(rel, code) {
  // Source lives under inkwave-public/, whereas compiled modules share the
  // versioned site's root with patches/. Keep direct Node imports working and
  // remap exactly this import in published output.
  if (rel === 'src/world/prop-packs.js') code = replaceOnce(code,
    "'../../../patches/practice-range/stage/props.mjs'",
    "'../../patches/practice-range/stage/props.mjs'",
    'selected prop packs source/site relocation');
  if (rel === 'src/game/inkCollision.js') code = replaceOnce(code,
    "from '../../../patches/native-stages/runtime/native-projectile-sweep.mjs'",
    "from '../../patches/native-stages/runtime/native-projectile-sweep.mjs'",
    'native sweep source/site relocation');
  code = adaptSource(rel, code);
  code = adaptTouchLayout(rel, code);
  code = adaptReliability(rel, code);
  code = adaptQualitySource(rel, code);
  code = adaptSettingsHudQueue(rel, code, replaceOnce);
  code = adaptNetworkSource(rel, code);
  code = adaptRange(rel, code);
  code = adaptRanked(rel, code);
  code = adaptNativeStages(rel, code);
  code = adaptWorldQueueBuild(rel, code, replaceOnce);
  code = adaptShowcaseIdlePools(rel, code, replaceOnce);
  code = adaptInkRipplePresentation(rel, code, replaceOnce);
  // Audio patches are applied before the verified final camera pass.
  // The camera adapter must retain the terminal fail-closed position.
  code = adaptWeaponAudio(rel, code);
  code = adaptProjectileVisuals(rel, code);
  code = adaptUiLocalization(rel, code);
  code = adaptMainInkFootprints(rel, code);
  code = adaptRollerBandParity(rel, code);
  code = adaptWeaponOpponentPalette(rel, code);
  code = adaptWeaponOpponentPreview(rel, code);
  code = adaptInputLensQueue(rel, code);
  code = adaptSpawnExclusion(rel, code);
  const composed = adaptAddedUiMotion(rel, adaptCharacterShadowBatch(rel, adaptQueueNetworkUi(rel, adaptCombatProvenance(rel, applyZevantDisplayName(rel, adaptLoadingScreen(rel, adaptQueueNine(rel, adaptStaticMenuArt(rel, adaptCameraAimControls(rel, code), replaceOnce)))))), replaceOnce));
  return adaptFiringCosmetics(rel, composed);
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

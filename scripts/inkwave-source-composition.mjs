import { adaptQueueNine } from '../patches/reliability/queue-nine-final-adapter.mjs';
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

// Keep the tested source path identical to the production build's adapters.
export function adaptBuildSource(rel, code) {
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
  code = adaptWeaponOpponentPalette(rel, code);
  code = adaptWeaponOpponentPreview(rel, code);
  return applyZevantDisplayName(rel, adaptQueueNine(rel, adaptStaticMenuArt(rel, adaptCameraAimControls(rel, code), replaceOnce)));
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
  // In-world text is rendered into procedural textures / 3-D lettering.
  'patches/splatoon3/runtime/ui-strings.mjs': [
    ['The INKWAVE servers didn’t answer. Check your connection, then try again.', 'The ZEVANT servers didn’t answer. Check your connection, then try again.'],
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

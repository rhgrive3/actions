// Owner request 2026-11-05: offline Bot roster / Mutators / Boss squad size
// (runtime/custom-match.mjs), detailed result statistics
// (runtime/match-insights.mjs + runtime/results-detail.mjs). Installed once
// from main.js next to the Practice Range; the setup / results screens are
// decorated through the Menus prototype.
const IMPORT = "import { installCustomMatch, installCustomMatchMenus } from '../patches/splatoon3/runtime/custom-match.mjs';\n" +
  "import { installMatchInsights } from '../patches/splatoon3/runtime/match-insights.mjs';\n" +
  "import { installResultsDetail } from '../patches/splatoon3/runtime/results-detail.mjs';\n" +
  "import { WEAPONS as S3_CUSTOM_WEAPONS } from './config.js';\n" +
  "import { isJa as S3_CUSTOM_JA } from './i18n.js';\n";
export function adaptCustomMatch(rel, code, replaceOnce) {
  if (rel !== 'src/main.js') return code;
  if (code.includes(IMPORT)) throw new Error('INKWAVE custom match: repeated main.js transform');
  code = replaceOnce(code, 'installPracticeRange(Game);\n',
    'installPracticeRange(Game);\ninstallMatchInsights({ Projectiles, Match, on });\ninstallCustomMatch({ Match, Projectiles });\n',
    'custom match / insights installation');
  // Menus stay lazily loaded: decorate the class where main.js loads it.
  code = replaceOnce(code, "    this.menus = G.menus = menusMod.Menus ? new menusMod.Menus(this.uiRoot, this._menuApi()) : null;",
    "    if (menusMod.Menus) { installCustomMatchMenus(menusMod.Menus); installResultsDetail(menusMod.Menus, { G, WEAPONS: S3_CUSTOM_WEAPONS, isJa: S3_CUSTOM_JA }); }\n    this.menus = G.menus = menusMod.Menus ? new menusMod.Menus(this.uiRoot, this._menuApi()) : null;",
    'custom match menus at the lazy menus load');
  return IMPORT + code;
}

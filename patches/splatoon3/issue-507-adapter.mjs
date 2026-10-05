// #507 only: attach the source-guided nearest-foot paint cycle to successful
// Splattershot emissions. The public source remains byte-for-byte unchanged.
export function adaptIssue507(rel, code, replaceOnce) {
  if (rel !== 'src/game/weapons.js') return code;
  code = replaceOnce(
    code,
    "      if (w.kind === 'shooter') G.projectiles.fireShooter(a, w, this.spread);",
    "      if (w.kind === 'shooter') {\n        const projectiles = G.projectiles;\n        const before = projectiles?.list?.length;\n        projectiles.fireShooter(a, w, this.spread);\n        if (Number.isInteger(before) && projectiles.list.length === before + 1) {\n          recordSuccessfulSplattershotShot(a, w, projectiles.list.at(-1), G.paint);\n        }\n      }",
    'issue #507 successful shooter emission'
  );
  return "import { recordSuccessfulSplattershotShot } from '../../patches/splatoon3/runtime/issue-507-splash-cycle.mjs';\n" + code;
}

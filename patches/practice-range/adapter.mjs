// Build-only Practice Range connections, composed after the gameplay, touch-layout, reliability and quality adapters.
// Upstream inkwave-public/ stays byte-for-byte intact. Every connection needs exactly one anchor; a missing or duplicated
// anchor stops the build (no unpatched fallback is published).
//
// What is connected (nothing here changes weapon, movement, damage, network or animation code):
//   src/world/maps.js            the 'range' layout joins MAP_LAYOUTS (not MAPS: no stage picker ever lists it)
//   src/world/stages/index.js    the stage-module registry (props, murals) gains the range stage
//   src/world/stages/surfaces.js the range's three texlib surfaces on slots 31–33
//   src/world/levelMaterial.js   measuring lines drawn from world coordinates, only on slots 31 (floors) / 32 (walls)
//   src/ui/hud.js                upstream bug fix: the missing `isJa` import (see the branch below)
//   src/main.js                  startMatch resolves 'range' (humans-only, no bots), the attract backdrop stays empty on
//                                the range, the turf-war state presentation skips range matches, installPracticeRange()
//   index.html                   the range stylesheet
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RANGE_ROOT = path.dirname(fileURLToPath(import.meta.url));

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE practice range conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const CONNECTED = ['src/world/maps.js', 'src/world/stages/index.js', 'src/world/stages/surfaces.js', 'src/main.js', 'src/world/levelMaterial.js', 'index.html'];
export function adaptRange(rel, code) {
  // a second application (or an upstream that already carries the range) must stop the build, not stack connections
  if (CONNECTED.includes(rel) && /practice-range|rangeLine\(/.test(code)) throw new Error(`INKWAVE practice range conflict (${rel}): already connected. Review upstream changes; site was not built.`);
  if (rel === 'src/world/maps.js') {
    code = replaceOnce(code, "import { LAYOUT as CARGO } from './stages/cargo/layout.js';",
      "import { LAYOUT as CARGO } from './stages/cargo/layout.js';\nimport { LAYOUT as RANGE } from '../../patches/practice-range/stage/layout.mjs';", 'range layout import');
    return replaceOnce(code, 'export const MAP_LAYOUTS = { tidewater: TIDEWATER, kelpline: KELPLINE, halyard: HALYARD, cargo: CARGO };',
      'export const MAP_LAYOUTS = { tidewater: TIDEWATER, kelpline: KELPLINE, halyard: HALYARD, cargo: CARGO, range: RANGE };', 'range layout registry');
  }
  if (rel === 'src/world/stages/index.js') {
    code = replaceOnce(code, "import * as cargoMurals from './cargo/murals.js';",
      "import * as cargoMurals from './cargo/murals.js';\n" +
      "import * as rangeLayout from '../../../patches/practice-range/stage/layout.mjs';\n" +
      "import * as rangeProps from '../../../patches/practice-range/stage/props.mjs';\n" +
      "import * as rangeSurfaces from '../../../patches/practice-range/stage/surfaces.mjs';\n" +
      "import * as rangeMurals from '../../../patches/practice-range/stage/murals.mjs';", 'range stage imports');
    return replaceOnce(code, '  cargo: { ...cargoLayout, ...cargoProps, ...cargoSurfaces, ...cargoMurals },',
      '  cargo: { ...cargoLayout, ...cargoProps, ...cargoSurfaces, ...cargoMurals },\n  range: { ...rangeLayout, ...rangeProps, ...rangeSurfaces, ...rangeMurals },', 'range stage registry');
  }
  if (rel === 'src/world/stages/surfaces.js') {
    code = replaceOnce(code, "import * as cargo from './cargo/surfaces.js';",
      "import * as cargo from './cargo/surfaces.js';\nimport * as range from '../../../patches/practice-range/stage/surfaces.mjs';", 'range surfaces import');
    code = replaceOnce(code, 'const PACKS = { cargo };', 'const PACKS = { cargo, range };', 'range surface pack');
    code = replaceOnce(code, 'export const STAGE_SLOTS = { cargo: [28, 29, 30] };', 'export const STAGE_SLOTS = { cargo: [28, 29, 30], range: [31, 32, 33] };', 'range surface slots');
    return replaceOnce(code, 'export const FIRST_STAGE_SLOT = 28, LAST_STAGE_SLOT = 30;', 'export const FIRST_STAGE_SLOT = 28, LAST_STAGE_SLOT = 33;', 'stage slot table size');
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code, '    let map = MAPS.find((m) => m.id === opts.mapId) || MAPS[0];',
      '    let map = MAPS.find((m) => m.id === opts.mapId) || rangeMapFor(opts.mapId) || MAPS[0];', 'range map lookup');
    code = replaceOnce(code, '    if (!mapOfflineOk(map.id) && !DEV_STAGE) {\n      console.warn(',
      '    if (!mapOfflineOk(map.id) && !DEV_STAGE && !isRangeMap(map)) {\n      console.warn(', 'range offline admission');
    code = replaceOnce(code, 'noBots: mapNoBots(map.id),   // (devstage: a solo walk)',
      'noBots: mapNoBots(map.id) || isRangeMap(map), range: isRangeMap(map),   // (devstage: a solo walk; range: you + its targets)', 'range match options');
    code = replaceOnce(code, 'noBots: mapNoBots(this.mapDef?.id), mannequins: DEV_STAGE',
      'noBots: mapNoBots(this.mapDef?.id) || isRangeMap(this.mapDef), mannequins: DEV_STAGE', 'range attract backdrop');
    code = replaceOnce(code, '      if (match.attract || match !== this.match) return;\n      if (state === \'intro\') this._intro();',
      '      if (match.attract || match !== this.match || match.opts?.range) return;   // the range presents itself (practice-range/runtime/session.mjs)\n      if (state === \'intro\') this._intro();', 'range state presentation');
    code = replaceOnce(code, 'installGame(Game);\n', 'installGame(Game);\ninstallPracticeRange(Game);\n', 'range installation');
    return "import { rangeMapFor, isRangeMap } from '../patches/practice-range/range-map.mjs';\nimport { installPracticeRange } from '../patches/practice-range/install.mjs';\n" + code;
  }
  if (rel === 'src/world/levelMaterial.js') {
    // Measuring lines for the range's own surface slots only (31 court floors, 32 panel walls): drawn from the
    // fragment's WORLD position, so a line marked "12 m" is exactly world z = 12 whatever slab it is on. They sit in the
    // base colour, i.e. under the ink like any floor marking. Slots 31/32 exist on no other stage: other stages never
    // take these branches (same program, no visual change).
    code = replaceOnce(code, 'float gridLine(float x, float period, float width) {',
      '// practice range: anti-aliased world line (half-width hw, metres) that fades to its mean coverage once a pixel\n' +
      '// spans more than the line, so distant grids never shimmer\n' +
      'float rangeLine(float x, float period, float hw) {\n' +
      '  float fw = max(fwidth(x), 1e-5);\n' +
      '  float d = abs(fract(x / period + 0.5) - 0.5) * period;\n' +
      '  float a = 1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, d);\n' +
      '  return mix(a, 2.0 * hw / period, smoothstep(hw, 4.0 * hw, fw));\n' +
      '}\n' +
      'float gridLine(float x, float period, float width) {', 'range line helper');
    code = replaceOnce(code, '    // ramps: anti-slip grooves across the slope\n',
      '    // practice range measuring grid (floors): thin lines on every world metre, bold on every 5 m\n' +
      '    if (pid == 31 && isTop) {\n' +
      '      float mn = max(rangeLine(vWPos.x, 1.0, 0.011), rangeLine(vWPos.z, 1.0, 0.011));\n' +
      '      float mj = max(rangeLine(vWPos.x, 5.0, 0.04), rangeLine(vWPos.z, 5.0, 0.04));\n' +
      '      base = mix(base, base * 0.6, mn * 0.8);\n' +
      '      base = mix(base, base * 0.34, mj);\n' +
      '    }\n' +
      '    // practice range height lines (walls): every 0.5 m of world height, bold on every metre\n' +
      '    if (pid == 32 && isWall) {\n' +
      '      float hm = rangeLine(vWPos.y, 0.5, 0.009), hM = rangeLine(vWPos.y, 1.0, 0.022);\n' +
      '      base = mix(base, base * 0.62, hm * 0.8);\n' +
      '      base = mix(base, vec3(0.13, 0.16, 0.23), hM * 0.85);\n' +
      '    }\n' +
      '    // ramps: anti-slip grooves across the slope\n', 'range measuring lines');
    return replaceOnce(code, "'inkwave-level-v6-quality1'", "'inkwave-level-v6-quality1-range1'", 'material program identity');
  }
  if (rel === 'src/ui/hud.js') {
    // Upstream bug (found while testing the range): HUD._killCard reads `isJa`, which hud.js never imports, so every
    // splat by the local player throws a ReferenceError inside the 'splatted' event — in every mode — and the listeners
    // after the HUD (match log, range read-outs, the gameplay patch's splat post-processing) never run. One missing
    // import; same kind of connection as the gameplay layer's `t as tr` import for this file.
    if (/\bisJa\b/.test(code.split('\n').filter((l) => l.startsWith('import')).join('\n'))) return code;
    return "import { isJa } from '../i18n.js';\n" + code;
  }
  if (rel === 'index.html') {
    return replaceOnce(code, '</head>', '<link rel="stylesheet" href="./patches/practice-range/styles/range.css">\n</head>', 'range stylesheet');
  }
  return code;
}

// Every shipped file of this layer (tests and docs excluded), for the build identity ('practice-range/' namespace).
export function rangeIdentity() {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const out = {};
  for (const file of walk(RANGE_ROOT).sort()) {
    const rel = path.relative(RANGE_ROOT, file).split(path.sep).join('/');
    if (rel.startsWith('tests/') || rel.endsWith('.md')) continue;
    out[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return out;
}

// Build-only catalog bridge: weapon IDs identify entries, while kind/modelKind
// select the shared visuals. Upstream sources remain locked and unmodified.
function replaceOnce(code, before, after, label) {
  const first = code.indexOf(before);
  if (first < 0 || code.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE patch conflict (weapon catalog: ${label}): expected one exact connection.`);
  }
  return code.slice(0, first) + after + code.slice(first + before.length);
}

function replaceAllExpected(code, before, after, expected, label) {
  const count = code.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`INKWAVE patch conflict (weapon catalog: ${label}): expected ${expected} connections, found ${count}.`);
  }
  return code.split(before).join(after);
}

function behaviorKindHelper(name) {
  return `// Temporary legacy-control approximation for catalog families; this does not define Splatoon 3 behavior.
const ${name} = (weapon) => {
  const family = weapon?.behaviorKind || (weapon?.kind === 'catalog' ? weapon?.modelKind : weapon?.kind);
  if (family === 'stringer' || family === 'splatana') return 'charger';
  if (family === 'brush') return 'roller';
  if (family === 'brella') return 'shooter';
  return family;
};`;
}

export function adaptWeaponCatalog(rel, code) {
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code,
      "import { PLAYER } from '../config.js';",
      "import { PLAYER, WEAPONS } from '../config.js';",
      'character weapon catalog import');
    return replaceOnce(code,
      "  setWeapon(kind) {\n    if (!HOLD[kind]) kind = 'shooter';",
      "  setWeapon(kind) {\n    kind = WEAPONS[kind]?.modelKind || WEAPONS[kind]?.kind || kind;\n    if (!HOLD[kind]) kind = 'shooter';",
      'character ID to visual family');
  }

  if (rel === 'src/ui/ui-icons.js') {
    code = replaceOnce(code,
      "import { tx } from '../i18n.js';",
      "import { tx } from '../i18n.js';\nimport { WEAPONS } from '../config.js';",
      'weapon icon catalog import');
    return replaceOnce(code,
      'export const weaponIcon = (idOrKind) => WEAPON_ICONS[idOrKind] || WEAPON_ICONS.shooter;',
      `export const weaponIcon = (idOrKind) => {
  const weapon = WEAPONS[idOrKind];
  const family = weapon?.modelKind || weapon?.kind || idOrKind;
  return WEAPON_ICONS[family] || WEAPON_ICONS.shooter;
};`,
      'weapon ID to shared family icon');
  }

  if (rel === 'src/i18n.js') {
    code = replaceOnce(code,
      '  if (localized || !isJa) return;\n  localized = true;',
      '  if (localized) return;\n  localized = true;\n  if (isJa) {',
      'localization language branch');
    return replaceOnce(code,
      '  if (Array.isArray(LOOK.PRESETS)) for (const p of LOOK.PRESETS) { const b = DATA_JA.presets[p.id]; if (b) p.blurb = b; }',
      `  if (Array.isArray(LOOK.PRESETS)) for (const p of LOOK.PRESETS) { const b = DATA_JA.presets[p.id]; if (b) p.blurb = b; }
  }
  const lang = isJa ? 'ja' : 'en';
  for (const w of Object.values(WEAPONS)) {
    const name = w.referenceNames?.[lang];
    if (typeof name === 'string' && name.trim()) w.name = name;
  }`,
      'reference weapon names for current language');
  }

  if (rel === 'src/game/bots.js') {
    code = replaceOnce(code,
      "import { PLAYER, DIFFICULTY, SUB } from '../config.js';",
      `import { PLAYER, DIFFICULTY, SUB } from '../config.js';\n\n${behaviorKindHelper('botBehaviorKind')}`,
      'bot behavior-kind helper');
    code = replaceAllExpected(code, 'w.kind', 'botBehaviorKind(w)', 45, 'bot weapon family decisions');
    return replaceOnce(code,
      'this.a.weapon.kind === \'charger\'',
      "botBehaviorKind(this.a.weapon) === 'charger'",
      'boss bot behavior-kind decision');
  }

  if (rel === 'src/game/player.js') {
    return replaceAllExpected(code,
      'const w = a.weapon;',
      `const w = (a.weapon?.behaviorKind || a.weapon?.kind === 'catalog') ? {
      ...a.weapon,
      kind: ({
        stringer: 'charger',
        splatana: 'charger',
        brush: 'roller',
        brella: 'shooter',
      }[a.weapon.behaviorKind || a.weapon.modelKind] || a.weapon.behaviorKind || a.weapon.modelKind),
    } : a.weapon;`,
      2,
      'player weapon range behavior view');
  }

  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code,
      "const kindOf = (w) => (WEAPONS[w] && WEAPONS[w].kind) || w || 'shooter';",
      "const kindOf = (w) => (WEAPONS[w] && (WEAPONS[w].modelKind || WEAPONS[w].kind)) || w || 'shooter';",
      'HUD icon and model family');
    return replaceOnce(code,
      '      const kind = (W && W.kind) || w;',
      `      const family = W?.behaviorKind || (W?.kind === 'catalog' ? W?.modelKind : W?.kind);
      const kind = family === 'stringer' || family === 'splatana' ? 'charger'
        : family === 'brush' ? 'roller'
        : family === 'brella' ? 'shooter'
        : family || w;`,
      'HUD weapon reticle behavior family');
  }

  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      '    const w = a.weapon;\n    // crosshair spread = the weapon\'s live cone (first-shot accurate, blooms with sustained fire / in the air)',
      `    const w = a.weapon;
    const family = w?.behaviorKind || (w?.kind === 'catalog' ? w?.modelKind : w?.kind);
    const kind = family === 'stringer' || family === 'splatana' ? 'charger'
      : family === 'brush' ? 'roller'
      : family === 'brella' ? 'shooter'
      : family || w.kind;
    // crosshair spread = the weapon's live cone (first-shot accurate, blooms with sustained fire / in the air)`,
      'main crosshair weapon family');
    code = replaceOnce(code,
      "    const coneDeg = a.weaponRunner.spread ?? (w.kind === 'shooter' ? 5.5 : w.kind === 'blaster' ? 1.2 : 0);\n    const spread = w.kind === 'roller' ? 28 : Math.min(90, (Math.tan((coneDeg * Math.PI) / 180) / Math.tan(vHalf)) * (innerHeight / 2));",
      "    const coneDeg = a.weaponRunner.spread ?? (kind === 'shooter' ? 5.5 : kind === 'blaster' ? 1.2 : 0);\n    const spread = kind === 'roller' ? 28 : Math.min(90, (Math.tan((coneDeg * Math.PI) / 180) / Math.tan(vHalf)) * (innerHeight / 2));",
      'main crosshair spread family');
    return replaceOnce(code,
      'weapon: w.kind || a.weaponId, specialId: w.special',
      'weapon: w.modelKind || w.kind || a.weaponId, specialId: w.special',
      'mobile weapon model-family icon lookup');
  }

  if (rel === 'src/ui/menus.js') {
    code = replaceAllExpected(code,
      'weaponIcon(W.kind || lo.weapon)', 'weaponIcon(W.id || lo.weapon)', 5,
      'loadout and kit weapon ID icons');
    code = replaceAllExpected(code,
      'weaponIcon(w.kind || id)', 'weaponIcon(w.id || id)', 2,
      'weapon-card ID icons');
    code = replaceOnce(code,
      'weaponIcon((W && W.kind) || tag.weapon)',
      'weaponIcon((W && W.id) || tag.weapon)',
      'splat-tag weapon ID icon');
    code = replaceOnce(code,
      'weaponIcon(W?.kind || p.weapon)',
      'weaponIcon(W?.id || p.weapon)',
      'lobby roster weapon ID icon');
    code = replaceOnce(code,
      'weaponIcon((W && W.kind) || p.weapon)',
      'weaponIcon((W && W.id) || p.weapon)',
      'player roster weapon ID icon');
    code = replaceOnce(code,
      'weaponIcon((W && W.kind) || wid)',
      'weaponIcon((W && W.id) || wid)',
      'locker weapon ID icon');
    return replaceAllExpected(code,
      '(this._weapons()[p.weapon] || {}).kind || p.weapon',
      '(this._weapons()[p.weapon] || {}).id || p.weapon', 3,
      'result roster weapon ID icons');
  }

  if (rel === 'src/game/showcase.js') {
    return replaceOnce(code,
      "const weaponKind = (id) => (WEAPONS[id] && WEAPONS[id].kind) || id || 'shooter';",
      "const weaponKind = (id) => (WEAPONS[id] && (WEAPONS[id].modelKind || WEAPONS[id].kind)) || id || 'shooter';",
      'showcase weapon model-family routing');
  }

  return code;
}

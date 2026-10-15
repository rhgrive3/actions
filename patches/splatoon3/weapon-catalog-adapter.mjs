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

export function adaptWeaponCatalog(rel, code) {
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code,
      "import { PLAYER } from '../config.js';",
      "import { PLAYER, WEAPONS } from '../config.js';\nimport { weaponModelKey, weaponModelFamily, weaponHold, weaponNeedsNativeCarry } from '../../patches/splatoon3/runtime/weapon-models/registry.mjs';",
      'character weapon catalog import');
    // A weapon ID keeps its own model (cache key) while its family remains the
    // HOLD/behaviour kind every native and patched pose layer reads.
    return replaceOnce(code,
      `  setWeapon(kind) {
    if (!HOLD[kind]) kind = 'shooter';
    if (kind === this.weaponKind) return;
    const old = this.weaponKind && this.weapons[this.weaponKind];
    if (old) { this.bones.handR.remove(old.pivot); if (old.left) this.bones.handL.remove(old.left.pivot); }
    const w = this._getWeapon(kind);
    this.bones.handR.add(w.pivot);
    if (w.left) this.bones.handL.add(w.left.pivot);
    this.weaponKind = kind; this.weapon = w; this.hold = HOLD[kind];`,
      `  setWeapon(id) {
    let kind = WEAPONS[id]?.modelKind || WEAPONS[id]?.kind || weaponModelFamily(id);
    if (!HOLD[kind]) kind = 'shooter';
    const model = (WEAPONS[id] || HOLD[weaponModelFamily(id)]) ? weaponModelKey(id) : kind;
    if (kind === this.weaponKind && model === this.weaponModel && this.weapon) return;
    const old = this.weapon;
    if (old) { this.bones.handR.remove(old.pivot); if (old.left) this.bones.handL.remove(old.left.pivot); }
    const w = this._getWeapon(model);
    this.bones.handR.add(w.pivot);
    if (w.left) this.bones.handL.add(w.left.pivot);
    this.weaponKind = kind; this.weaponModel = model; this.weapon = w; this.hold = weaponHold(model, HOLD[kind]);
    this.weaponNativeCarry = weaponNeedsNativeCarry(id);`,
      'character weapon ID to its own model and family hold');
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
    // BotBrain now owns its precise behavior-family selection in the source.
    // Do not rewrite 45 `w.kind` occurrences or fold Stringer/Splatana into
    // Charger here. Preserve the independent canonical special adapter only.
    code = "import { driveCanonicalBotSpecial } from '../../patches/splatoon3/runtime/canonical-kits.mjs';\\n".replace('\\n','\n') + code;
    return replaceOnce(code, '    // ---------------- aim: critically-damped spring',
      '    driveCanonicalBotSpecial(a, it, dt, this.target);\\n    // ---------------- aim: critically-damped spring'.replace('\\n','\n'),
      'canonical bot special inputs');
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
      "const weaponKind = (id) => (WEAPONS[id] ? id : id || 'shooter'); // Character.setWeapon resolves its family",
      'showcase weapon ID routing');
  }

  return code;
}

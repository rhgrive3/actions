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
  if (rel === 'src/game/weapons.js') {
    // Consume the remaining fixed-step time of newly born catalog splashes
    // before native draw copies their positions into the visible instance
    // buffer. Drawing itself must never advance authoritative paint.
    return replaceOnce(code, '    this.inkFlight.updateDrops();',
      '    this.s3FlushCatalogSplashBirths?.();\n    this.inkFlight.updateDrops();',
      'catalog splash birth catch-up before draw');
  }
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code,
      "import { PLAYER } from '../config.js';",
      "import { PLAYER, WEAPONS } from '../config.js';\nimport { weaponModelKey, weaponModelFamily, weaponHold, weaponNeedsNativeCarry, weaponSourceBodyFamily, weaponIdleStanceFamily, weaponAppearanceKey, weaponDefaultAppearance, weaponBaseModelId } from '../../patches/splatoon3/runtime/weapon-models/registry.mjs';\nimport { selectedWeaponAppearance } from '../../patches/splatoon3/runtime/weapon-appearance.mjs';\n",
      'character weapon catalog import');
    code = replaceOnce(code, "    this.setWeapon(opts.weapon || 'shooter');",
      "    this.weaponAppearancePreview = opts.weaponAppearancePreview === true;\n    this.setWeapon(opts.weapon || 'shooter');", 'personal preview appearance');
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
    const selected = (this.isLocal || this.weaponAppearancePreview) ? selectedWeaponAppearance(id) : weaponDefaultAppearance(id);
    const visual = weaponAppearanceKey(model, selected);
    if (kind === this.weaponKind && model === this.weaponModel && visual === this.weaponAppearanceModel && this.weapon) return;
    const old = this.weapon;
    if (old) { this.bones.handR.remove(old.pivot); if (old.left) this.bones.handL.remove(old.left.pivot); }
    const w = this._getWeapon(visual);
    this.bones.handR.add(w.pivot);
    if (w.left) this.bones.handL.add(w.left.pivot);
    this.weaponKind = kind; this.weaponModel = model; this.weapon = w; this.hold = weaponHold(model, HOLD[kind]);
    this.weaponAppearanceModel = visual; this.modelVariantId = visual === weaponBaseModelId(visual) ? null : visual;
    this.weaponNativeCarry = weaponNeedsNativeCarry(id);
    this.weaponSourceBody = weaponSourceBodyFamily(id);
    this.weaponIdleStance = weaponIdleStanceFamily(id);`,
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
    code = "import { driveCanonicalBotSpecial, resetBotSpecialMemory } from '../../patches/splatoon3/runtime/canonical-kits.mjs';\n" + code;
    code = replaceOnce(code, '  reset() {\n', '  reset() {\n    resetBotSpecialMemory(this.a);\n', 'bot special reset');
    code = replaceOnce(code, '    const it = a.intent;\n',
      `    const it = a.intent;
    if (a.remote || a.isLocal || a.isBot === false) return;
    if (!a.alive || a.superJumpState || !G.match?.playing()) resetBotSpecialMemory(a);
`, 'local bot special lifecycle');
    code = replaceOnce(code, `        // special
        if (a.specialReady()) {
          if (w.special === 'slam' && dist < 4.5) it.special = true;
          if (w.special === 'storm' && dist < 16) it.special = true;
        }`, '        // Special admission is owned by the final shared tail.', 'single duel special owner');
    code = replaceOnce(code, `      if (a.specialReady() && Math.random() < 0.01) {
        const r = G.paint.regionStats(a.pos.x, a.pos.y, a.pos.z, 5, a.team, _stats);
        if (r.own < 0.5) it.special = true;
      }`, '', 'remove indiscriminate paint special');
    code = replaceOnce(code, `      // specials: slam from under its claws, the storm cloud onto it
      if (a.specialReady() && !th.level && !T.crab) {
        if (w.special === 'slam' && dist < 5.5) it.special = true;
        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;
      }`, '      // The shared tail also owns special inputs in boss play.', 'single boss special owner');
    code = replaceOnce(code, '    // ---------------- aim: critically-damped spring',
      `    const specialControl = driveCanonicalBotSpecial(a, it, dt, this.target, {
      world: G, brain: this, move, wantYaw, wantPitch, aimDistance: aimDist,
    }, true);
    if (specialControl?.handled) {
      wantYaw = specialControl.wantYaw; wantPitch = specialControl.wantPitch;
      aimDist = specialControl.aimDistance;
      wantMove = move.lengthSq() > 0.01;
    }
    const specialJump = it.jump;
    // ---------------- aim: critically-damped spring`, 'canonical bot special inputs');
    code = replaceOnce(code,
      "    const fighting = this.mode === 'fight';",
      "    const fighting = this.mode === 'fight' || !!(specialControl?.handled && (specialControl.state || specialControl.aimChanged));",
      'special aim spring combat response');
    code = replaceOnce(code,
      "      const d = fighting && this.target ? aimDist : this.mode === 'refill' ? 1.6 : 6;",
      "      const d = specialControl?.handled && (specialControl.state || specialControl.aimChanged) ? aimDist : this._footPaint ? 4 : fighting && this.target ? aimDist : this.mode === 'refill' ? 1.6 : 6;",
      'special actual aim ray distance');
    return replaceOnce(code,
      '    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }',
      `    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }
    if (specialControl?.handled && specialControl.state) {
      // A navigation hop must not become an unrequested special attack.
      it.jump = specialJump;
      this._needJump = false;
      this.noProg = 0;
      if (move.lengthSq() < 1e-8) { it.move.set(0, 0, 0); this.mvMag = 0; }
    }`, 'preserve special jump and stop input after navigation');
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
    code = "import { weaponAppearanceOptions, weaponAppearancePreference, setWeaponAppearance } from '../../patches/splatoon3/runtime/weapon-appearance.mjs';\nimport { weaponBaseModelId, weaponModelKey } from '../../patches/splatoon3/runtime/weapon-models/registry.mjs';\n" + code;
    code = replaceOnce(code, "    // ---- detail panel\n", `    // Appearance is device-local and preserves this weapon's sub/special/stats.
    const appearanceLabel = h('span');
    const appearance = h('button', { class: 'iw-btn iw-btn--menu', type: 'button', 'aria-label': 'Weapon appearance / ブキの見た目' }, appearanceLabel);
    const refreshAppearance = () => {
      const options = weaponAppearanceOptions(shown, LANG), selected = weaponAppearancePreference(shown) ?? '';
      appearanceLabel.textContent = tr('APPEARANCE / 見た目: ') + (options.find(o => o.id === selected) || options[0]).name;
      appearance.hidden = options.length < 2;
      appearance.disabled = options.length < 2;
    };
    this._bind(appearance, { id: 'weapon-appearance', accept: () => {
      const options = weaponAppearanceOptions(shown, LANG), selected = weaponAppearancePreference(shown) ?? '';
      const index = Math.max(0, options.findIndex(o => o.id === selected));
      setWeaponAppearance(shown, options[(index + 1) % options.length].id);
      for (const c of this._sc()?.chars || []) if (c.weaponAppearancePreview && c.weaponModel === weaponModelKey(shown)) c.setWeapon(shown);
      refreshAppearance(); this._sfx('ui_toggle');
    } });
    // ---- detail panel
`, 'appearance selector');
    code = replaceOnce(code, "      blurb,\n      h('div', { class: 'iw-wd__stats' }", "      blurb, appearance,\n      h('small', null, 'Visual only · Local device / 見た目のみ・この端末'),\n      h('div', { class: 'iw-wd__stats' }", 'appearance panel');
    code = replaceOnce(code, "      shown = id;\n      const w = Ws[id]", "      shown = id;\n      refreshAppearance();\n      const w = Ws[id]", 'appearance refresh');
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
    code = replaceAllExpected(code, "name: 'preview', isLocal: false", "name: 'preview', isLocal: false, weaponAppearancePreview: true", 2, 'personal showcase appearance');
    code = replaceOnce(code,
      "const weaponKind = (id) => (WEAPONS[id] && WEAPONS[id].kind) || id || 'shooter';",
      "const weaponKind = (id) => (WEAPONS[id] ? id : id || 'shooter'); // Character.setWeapon resolves its family",
      'showcase weapon ID routing');
    return replaceOnce(code,
      "    if (this.phase === 'emerge') {",
      "    // A selection made during emergence must use the native hop once ready.\n    if (this.phase === 'pose' && this.hopWeapon) {\n      this.phase = 'hop'; this.hopT = t;\n    }\n    if (this.phase === 'emerge') {",
      'queued showcase weapon selection after emergence');
  }

  return code;
}

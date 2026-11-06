// Custom offline matches (owner request 2026-11-05): Bot roster per slot,
// match-wide rule multipliers ("Mutators") and the Boss Battle squad size.
// INKWAVE features; Splatoon 3 has no equivalent offline mode, so nothing here
// is a retail rule. Online rooms, the Practice Range, the title demo and
// replays never read these settings: they apply to offline matches only.
//
// Fairness: Mutators are applied by the gear owner's finalizer to EVERY actor
// of the match (player and Bots alike) and by one damage wrapper for every
// attacker, so no side gets a different rule.
import { G } from '../../../src/core/ctx.js';
import { WEAPONS, WEAPON_ORDER } from '../../../src/config.js';
import { addGearFinalizer } from './gear.mjs';
import { CUSTOM_MATCH_KEY, MAX_PRESETS, MUTATOR_STEPS, NEUTRAL_MUTATORS, normalizeCustomMatch, readCustomMatch, writeCustomMatch, savePreset, loadPreset,
  mutatorsActive, customMatchApplies, applyRoster, activeMutators, setActiveMutators, applyMutatorsToActor, setCustomMatchWeapons } from './custom-match-rules.mjs';
export * from './custom-match-rules.mjs';
import { isJa } from '../../../src/i18n.js';

export function installCustomMatch({ Match, Projectiles }) {
  if (installCustomMatch.done) return;
  installCustomMatch.done = true;
  setCustomMatchWeapons(WEAPONS);
  addGearFinalizer((a, info) => { if (activeMutators() !== NEUTRAL_MUTATORS) applyMutatorsToActor(a, info); });
  const setup = Match.prototype.setup;
  Match.prototype.setup = function (...args) {
    const applies = customMatchApplies(this, G);
    const cfg = applies ? readCustomMatch() : null;
    // Gear equips run inside the native setup (Actor construction): the rule
    // must be active before it, for every actor alike.
    setActiveMutators(applies ? cfg.mutators : null);
    if (applies && this.mode === 'boss' && this.bossCfg && cfg.bossSquad !== this.bossCfg.squad)
      this.bossCfg = Object.freeze({ ...this.bossCfg, squad: cfg.bossSquad });
    const result = setup.apply(this, args);
    this.s3Custom = applies ? { roster: applyRoster(this, cfg), mutators: { ...activeMutators() }, bossSquad: this.mode === 'boss' ? this.bossCfg?.squad : null } : null;
    if (applies && mutatorsActive(cfg.mutators)) for (const a of this.actors) a.s3RefreshGear?.();
    return result;
  };
  // One damage rule for every attacker. An own instance property, replaced on
  // each setup, so no prototype wrapper order matters.
  const P = Projectiles.prototype;
  const prevSetupProjectiles = Match.prototype.setup;
  Match.prototype.setup = function (...args) {
    const result = prevSetupProjectiles.apply(this, args);
    const projectiles = G.projectiles;
    if (projectiles && Object.hasOwn(projectiles, 'applyHit') && projectiles.applyHit.s3Mutator) delete projectiles.applyHit;
    const k = this.s3Custom?.mutators?.damage ?? 1;
    if (projectiles && k !== 1) {
      const wrapped = function (attacker, victim, amount, ...rest) {
        return P.applyHit.call(this, attacker, victim, Number.isFinite(amount) ? amount * k : amount, ...rest);
      };
      wrapped.s3Mutator = k;
      projectiles.applyHit = wrapped;
    }
    return result;
  };
}

// ---------------------------------------------------------------- settings UI
const LABEL = {
  title: ['BOTS & RULES', 'Bot編成・ルール'], allies: ['Allies', '味方'], enemies: ['Opponents', '相手'],
  random: ['Random', 'ランダム'], allRandom: ['All random', '全員ランダム'], save: ['Save preset', 'プリセット保存'],
  load: ['Load preset', 'プリセット読込'], none: ['—', '—'], rules: ['Rules (offline only)', 'ルール（オフラインのみ）'],
  ink: ['Ink use', 'インク消費'], damage: ['Damage', 'ダメージ'], speed: ['Move speed', '移動速度'], special: ['Special charge', 'スペシャル増加'],
  squad: ['Boss squad', 'ボス戦の人数'], note: ['Applies to you and every Bot alike.', 'あなたと全Botに同じく適用されます。'],
};
const ja = () => isJa === true;
const t = key => LABEL[key][ja() ? 1 : 0];
export const CUSTOM_MATCH_CSS = `
.s3-custom { display: grid; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.18); font-size: 13px; }
.s3-custom__h { font-weight: 800; letter-spacing: .04em; }
.s3-custom__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 10px; }
.s3-custom label { display: grid; gap: 2px; min-width: 0; }
.s3-custom label > span { font-size: 11px; opacity: .8; }
.s3-custom select { width: 100%; min-width: 0; min-height: 30px; font: inherit; color: #fff; background: rgba(12,10,20,.85); border: 1px solid rgba(255,255,255,.3); border-radius: 8px; padding: 2px 6px; }
.s3-custom__row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.s3-custom button { font: inherit; font-weight: 700; color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: 4px 12px; min-height: 30px; cursor: pointer; }
.s3-custom__note { font-size: 11px; opacity: .75; }
.s3-stage-settings .iw-modal__card { max-height: min(92vh, 100%); overflow-y: auto; }
`;
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  for (const k of kids.flat()) if (k) e.append(k);
  return e;
}
function weaponSelect(value, onChange, label) {
  const s = el('select', { 'aria-label': label });
  s.append(el('option', { value: '', text: t('random') }));
  for (const id of WEAPON_ORDER) if (WEAPONS[id]) s.append(el('option', { value: id, text: WEAPONS[id].name }));
  s.value = value || '';
  s.addEventListener('change', () => onChange(s.value || null));
  return s;
}
function stepSelect(list, value, onChange, label) {
  const s = el('select', { 'aria-label': label });
  for (const v of list) s.append(el('option', { value: String(v), text: `×${v}` }));
  s.value = String(value);
  s.addEventListener('change', () => onChange(Number(s.value)));
  return s;
}
/** Build the panel into the battle-settings match panel. `mode` is the setup mode. */
export function buildCustomMatchPanel(mode, storage = globalThis.localStorage) {
  if (!globalThis.document) return null;
  if (!document.getElementById('s3-custom-css')) document.head.append(el('style', { id: 's3-custom-css', text: CUSTOM_MATCH_CSS }));
  let cfg = readCustomMatch(storage);
  const boss = mode === 'boss';
  const root = el('div', { class: 's3-custom', 'data-custom-match': '' });
  const save = () => { cfg = writeCustomMatch(cfg, storage); };
  const render = () => {
    root.textContent = '';
    const allyCount = boss ? Math.max(0, cfg.bossSquad - 1) : 3;
    const allies = cfg.allies.slice(0, allyCount).map((id, i) => el('label', {}, el('span', { text: `${t('allies')} ${i + 1}` }),
      weaponSelect(id, v => { cfg.allies[i] = v; save(); }, `${t('allies')} ${i + 1}`)));
    const enemies = boss ? [] : cfg.enemies.map((id, i) => el('label', {}, el('span', { text: `${t('enemies')} ${i + 1}` }),
      weaponSelect(id, v => { cfg.enemies[i] = v; save(); }, `${t('enemies')} ${i + 1}`)));
    const presetSel = el('select', { 'aria-label': t('load') });
    presetSel.append(el('option', { value: '', text: t('load') }));
    for (const p of cfg.presets) presetSel.append(el('option', { value: p.name, text: p.name }));
    presetSel.addEventListener('change', () => { if (presetSel.value) { cfg = loadPreset(cfg, presetSel.value); save(); render(); } });
    const allRandom = el('button', { type: 'button', text: t('allRandom') });
    allRandom.addEventListener('click', () => { cfg.allies = cfg.allies.map(() => null); cfg.enemies = cfg.enemies.map(() => null); save(); render(); });
    const savePresetBtn = el('button', { type: 'button', text: t('save') });
    savePresetBtn.addEventListener('click', () => { cfg = savePreset(cfg, `${ja() ? 'プリセット' : 'Preset'} ${cfg.presets.length % MAX_PRESETS + 1}`); save(); render(); });
    const rules = ['ink', 'damage', 'speed', 'special'].map(key => el('label', {}, el('span', { text: t(key) }),
      stepSelect(MUTATOR_STEPS[key], cfg.mutators[key], v => { cfg.mutators[key] = v; save(); }, t(key))));
    const squad = boss ? el('label', {}, el('span', { text: t('squad') }),
      stepSelect([1, 2, 3, 4, 5, 6, 7, 8], cfg.bossSquad, v => { cfg.bossSquad = v; save(); render(); }, t('squad'))) : null;
    if (squad) squad.querySelectorAll('option').forEach(o => { o.textContent = o.value; });
    root.append(
      el('div', { class: 's3-custom__h', text: t('title') }),
      squad ? el('div', { class: 's3-custom__grid' }, squad) : null,
      el('div', { class: 's3-custom__grid' }, allies, enemies),
      el('div', { class: 's3-custom__row' }, allRandom, savePresetBtn, presetSel),
      el('div', { class: 's3-custom__h', text: t('rules') }),
      el('div', { class: 's3-custom__grid' }, rules),
      el('div', { class: 's3-custom__note', text: t('note') }));
  };
  render();
  return root;
}
export function installCustomMatchMenus(Menus) {
  const P = Menus?.prototype, setup = P?._scr_setup;
  if (!setup || P._s3CustomMatchMenus) return;
  P._s3CustomMatchMenus = true;
  P._scr_setup = function (...args) {
    const scr = setup.apply(this, args);
    const panel = scr?.el?.querySelector?.('.iw-ss__match');
    const mode = this._setup?.mode;
    if (panel && !panel.querySelector('[data-custom-match]') && mode !== 'range') {
      const custom = buildCustomMatchPanel(mode);
      if (custom) panel.append(custom);
    }
    return scr;
  };
}

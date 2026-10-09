export function adaptTenacity(rel, code, once) {
  if (rel === 'src/game/match.js') {
    code = "import { advanceTenacity } from '../../patches/local-quality/tenacity.mjs';\n" + code;
    return once(code, '    this.bossMode?.update(dt);', '    advanceTenacity(this, dt, emit);\n    this.bossMode?.update(dt);', 'Tenacity one post-actor tick');
  }
  if (rel !== 'patches/splatoon3/runtime/gear.mjs') return code;
  code = once(code, "  none: 'なし',", "  tenacity: '逆境強化', none: 'なし',", 'Tenacity registry');
  code = once(code, 'export function normalizeLoadout(value) {', 'function normalizeOtherAbilities(value) {', 'Tenacity normalize wrapper');
  code += `
export function normalizeLoadout(value) {
  if (!Array.isArray(value) || value.length !== 3) return normalizeOtherAbilities(value);
  const equipped = value[0]?.main === 'tenacity';
  const sanitized = value.map(part => ({...part,
    main: part?.main === 'tenacity' ? 'none' : part?.main,
    subs: Array.from({length:3}, (_, i) => part?.subs?.[i] === 'tenacity' ? 'none' : part?.subs?.[i])
  }));
  const normalized = normalizeOtherAbilities(sanitized);
  if (equipped) normalized[0].main = 'tenacity';
  return normalized;
}
`;
  code = once(code, "if (part.main !== 'none'", "if (part.main !== 'none' && part.main !== 'tenacity'", 'Tenacity not stackable AP');
  code = once(code, '    a.weapon.specialCost /= m.specialCharge ?? 1;', '    a.s3.tenacityBaseCost = a.weapon.specialCost;\n    a.weapon.specialCost /= m.specialCharge ?? 1;', 'Tenacity undiscounted basis');
  code = once(code, '        for (const [id, name] of Object.entries(ABILITIES)) {', `        if (piece === 0 && slot === 0) {
          const option = document.createElement('option'); option.value = 'tenacity'; option.textContent = ABILITIES.tenacity; select.append(option);
        }
        for (const [id, name] of Object.entries(ABILITIES)) {
          if (id === 'tenacity') continue;`, 'Tenacity slot UI');
  return code;
}

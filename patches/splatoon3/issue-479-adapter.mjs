// Issue #479: Build-only adapter for Roller natural free-fall 25F horizontal grace.
// Keep adapter composition tolerant of already extended Roller installers.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-479 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const ROLLER_RUNTIME_REL = 'patches/splatoon3/runtime/roller.mjs';
const ROLLER_IMPORT = "import { selectRollerFlickVertical, installActorFreefallHooks } from './roller-freefall.mjs';\n";

export function adaptIssue479(rel, code) {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.?\/?/, '');
  if (normalized !== ROLLER_RUNTIME_REL && normalized !== 'runtime/roller.mjs') return code;

  if (!code.includes('./roller-freefall.mjs')) code = ROLLER_IMPORT + code;

  if (code.includes('export function installRollerLogic(api, _profile) {')) {
    return code;
  }

  const patterns = [
    'export function installRollerLogic({ WeaponRunner }, _profile) {',
    'export function installRollerLogic({ WeaponRunner, Actor, G, on }, _profile) {',
    'export function installRollerLogic({ WeaponRunner, Actor, G, on, THREE, Hit }, _profile) {'
  ].filter(x => code.includes(x));

  if (patterns.length !== 1) {
    throw new Error('INKWAVE issue-479 patch conflict (roller install owner): expected one known shape');
  }

  code = replaceOnce(code, patterns[0],
    'export function installRollerLogic(api, _profile) {\n  const { WeaponRunner, Actor, G, on, THREE, Hit } = api || {};\n  installActorFreefallHooks(api);',
    'roller install owner');

  const oldMode = 'this.s3FlickVertical = !groundedCancel && !a.grounded;';
  const currentAdmission = '    const fullCancelGroundAttack = hasFullCancelGroundAttack(a);';
  const legacyAdmission = '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);';
  if (code.includes(currentAdmission)) {
    // Payment and the admitted pose share one latched free-fall selection.
    // Retain all current contact, full-cancel and depleted-volley branches.
    code = replaceOnce(code, currentAdmission,
      currentAdmission + '\n    const isVertical = !fullCancelGroundAttack && selectRollerFlickVertical(a, this);',
      'roller current free-fall admission');
    code = replaceOnce(code, '!a.grounded ? w.verticalInk : w.flickInk',
      'isVertical ? w.verticalInk : w.flickInk', 'roller selected-mode payment');
    code = replaceOnce(code, oldMode,
      'this.s3FlickVertical = groundedCancel ? false : isVertical;',
      'roller vertical selector');
  } else if (code.includes(legacyAdmission)) {
    code = replaceOnce(code, legacyAdmission,
      '    const isVertical = selectRollerFlickVertical(a, this);\n' +
      '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (isVertical ? w.verticalInk : w.flickInk);',
      'roller legacy free-fall admission');
    code = replaceOnce(code, 'this.s3FlickVertical = !a.grounded;',
      'this.s3FlickVertical = isVertical;', 'roller legacy vertical selector');
  } else {
    throw new Error('INKWAVE issue-479 patch conflict (roller admission): expected one known shape');
  }

  return code;
}

export const adaptIssue479Source = adaptIssue479;

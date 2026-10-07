// Issue #479: Build-only adapter for Roller natural free-fall 25F horizontal grace.
// Splatoon 3 Ver. 11.3.0 reference: falling without jump provides 25 frames of horizontal flick grace.
// Transforms patches/splatoon3/runtime/roller.mjs without mutating raw inkwave-public sources.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-479 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const ROLLER_RUNTIME_REL = 'patches/splatoon3/runtime/roller.mjs';
const ROLLER_IMPORT = `import { selectRollerFlickVertical, installActorFreefallHooks } from './roller-freefall.mjs';\n`;

export function adaptIssue479(rel, code) {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.?\/?/, '');
  if (normalized !== ROLLER_RUNTIME_REL && normalized !== 'runtime/roller.mjs') {
    return code;
  }

  // Keep current Roller reset/contact/roll-stop owners and pass their existing API.
  const oldInstall = 'export function installRollerLogic({ WeaponRunner }, _profile) {';
  const currentInstall = 'export function installRollerLogic({ WeaponRunner, Actor, G, on }, _profile) {';
  const matches = [oldInstall, currentInstall].filter(anchor => code.includes(anchor));
  if (matches.length !== 1) throw new Error('INKWAVE issue-479 patch conflict (roller install owner): expected one known shape');
  const installAnchor = matches[0];
  // 1. Pass api (containing Actor, Character, WeaponRunner, on, emit) to install free-fall hooks
  code = replaceOnce(
    code,
    installAnchor,
    'export function installRollerLogic(api, _profile) {\n  const { WeaponRunner, Actor, G, on } = api || {};\n  installActorFreefallHooks(api);',
    'roller installRollerLogic actor hook connection'
  );

  // Select the sourced free-fall mode without removing C37's grounded
  // full-cancel override or C43's intervening drum-support admission.
  const fullCancelStart =
    '    const fullCancelGroundAttack = hasFullCancelGroundAttack(a);\n' +
    '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS &&\n' +
    '      a.ink >= (fullCancelGroundAttack ? w.flickInk : !a.grounded ? w.verticalInk : w.flickInk);';
  if (code.includes(fullCancelStart)) {
    code = replaceOnce(code, fullCancelStart,
      '    const fullCancelGroundAttack = hasFullCancelGroundAttack(a);\n' +
      '    const isVertical = !fullCancelGroundAttack && selectRollerFlickVertical(a, this);\n' +
      '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS &&\n' +
      '      a.ink >= (isVertical ? w.verticalInk : w.flickInk);',
      'roller free-fall mode with grounded full-cancel and drum support');
    code = replaceOnce(code, '      this.s3FlickVertical = !groundedCancel && !a.grounded;',
      '      this.s3FlickVertical = groundedCancel ? false : isVertical;',
      'roller grounded cancel retains horizontal mode');
  } else {
    code = replaceOnce(code,
      '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);',
      '    const isVertical = selectRollerFlickVertical(a, this);\n' +
      '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (isVertical ? w.verticalInk : w.flickInk);',
      'roller selectRollerFlickVertical 25F grace and latching');
    code = replaceOnce(code, '      this.s3FlickVertical = !a.grounded;',
      '      this.s3FlickVertical = isVertical;',
      'roller selected free-fall mode owns attack');
  }

  if (!code.includes('./roller-freefall.mjs')) {
    code = ROLLER_IMPORT + code;
  }

  return code;
}

export const adaptIssue479Source = adaptIssue479;

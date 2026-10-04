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

  // 1. Pass api (containing Actor, Character, WeaponRunner, on, emit) to install free-fall hooks
  code = replaceOnce(
    code,
    'export function installRollerLogic({ WeaponRunner }, _profile) {',
    'export function installRollerLogic(api, _profile) {\n  const { WeaponRunner, Actor } = api || {};\n  installActorFreefallHooks(api);',
    'roller installRollerLogic actor hook connection'
  );

  // 2. Select vertical mode considering 25F natural free-fall grace and latched attacks
  code = replaceOnce(
    code,
    '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);\n' +
    '    if (starting) {\n' +
    '      this.cooldown = Math.min(0, this.cooldown);\n' +
    '      this.s3FlickVertical = !a.grounded;',
    '    const isVertical = selectRollerFlickVertical(a, this);\n' +
    '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (isVertical ? w.verticalInk : w.flickInk);\n' +
    '    if (starting) {\n' +
    '      this.cooldown = Math.min(0, this.cooldown);\n' +
    '      this.s3FlickVertical = isVertical;',
    'roller selectRollerFlickVertical 25F grace and latching'
  );

  if (!code.includes('./roller-freefall.mjs')) {
    code = ROLLER_IMPORT + code;
  }

  return code;
}

export const adaptIssue479Source = adaptIssue479;

// Issue #432 — effective sub-cost helper (build-only, narrow).
// S3 11.3.0: ink-tank marker must show the actor's effective sub cost after
// Ink Saver (Sub), not the unmodified Splat Bomb base 70.
// Main root: gear.mjs multiplies SHARED SUB.bomb.inkCost inside
// WeaponRunner.update() then restores it, so later HUD/arc/mobile readers
// see base 70 while gameplay paid the effective cost.
export function effectiveSubCost(actor, base) {
  const raw = Number(base?.inkCost);
  const fallback = Number.isFinite(raw) ? raw : 70;
  const mult = Number(actor?.s3?.modifiers?.inkSaverSub);
  const scale = Number.isFinite(mult) ? mult : 1;
  const cost = fallback * scale;
  return Number.isFinite(cost) && cost >= 0 ? cost : fallback;
}
export function subReadyFor(actor, base, ink) {
  const level = Number(ink);
  if (!Number.isFinite(level)) return false;
  return level >= effectiveSubCost(actor, base);
}
export function replaceOnce432(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-432 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptIssue432(rel, code) {
  if (rel === 'src/main.js') {
    code = replaceOnce432(code,
      'subCost: SUB.bomb.inkCost / PLAYER.inkMax,',
      'subCost: effectiveSubCost(a, SUB.bomb) / PLAYER.inkMax, subReady: subReadyFor(a, SUB.bomb, a.ink),',
      'main hud effective sub cost');
    code = replaceOnce432(code,
      'ink: frame.ink, subCost: frame.subCost });',
      'ink: frame.ink, subCost: frame.subCost, subReady: frame.subReady });',
      'main mobile effective sub readiness');
    if (!code.includes('issue-432-sub-cost.mjs')) {
      code = replaceOnce432(code,
        "import { Projectiles } from './game/weapons.js';",
        "import { Projectiles } from './game/weapons.js';\nimport { effectiveSubCost, subReadyFor } from '../patches/splatoon3/runtime/issue-432-sub-cost.mjs';",
        'main effective sub cost import');
    }
    return code;
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce432(code,
      '      const ok = (f.ink ?? 1) >= (f.subCost ?? 0.7) - 1e-3;',
      '      const ok = f.subReady ?? ((f.ink ?? 1) >= (f.subCost ?? 0.7) - 1e-3);',
      'hud aim exact sub readiness');
    code = replaceOnce432(code,
      '    const nosub = sub > 0 && ink < sub;',
      '    const nosub = sub > 0 && !(f.subReady ?? (ink >= sub));',
      'hud tank exact sub readiness');
    return code;
  }
  if (rel === 'src/core/mobile.js') {
    code = replaceOnce432(code,
      '  setHud({ special = 0, ready = false, activeSp = false, weapon = null, specialId = null, ink = 1, subCost = 0.7 } = {}) {',
      '  setHud({ special = 0, ready = false, activeSp = false, weapon = null, specialId = null, ink = 1, subCost = 0.7, subReady = null } = {}) {',
      'mobile optional sub readiness input');
    code = replaceOnce432(code,
      '    const noSub = ink < subCost - 1e-3;',
      '    const noSub = !(subReady ?? (ink >= subCost));',
      'mobile exact sub admission');
    return code;
  }
  if (rel === 'src/game/weapons.js') {
    code = replaceOnce432(code,
      '    const col = a.ink >= SUB.bomb.inkCost ? a.color : new THREE.Color(0.6, 0.6, 0.6);',
      '    const col = subReadyFor(a, SUB.bomb, a.ink) ? a.color : new THREE.Color(0.6, 0.6, 0.6);',
      'weapons arc exact sub readiness');
    if (!code.includes('issue-432-sub-cost.mjs')) {
      code = replaceOnce432(code,
        "import { Physics, Hit } from './physics.js';",
        "import { Physics, Hit } from './physics.js';\nimport { subReadyFor } from '../../patches/splatoon3/runtime/issue-432-sub-cost.mjs';",
        'weapons arc sub readiness import');
    }
    return code;
  }
  return code;
}


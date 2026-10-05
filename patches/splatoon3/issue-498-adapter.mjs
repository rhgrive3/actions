// Issue #498 — build-only Roller projectile paint-width age decay.
//
// Primary source (pinned): Leanny/splat3 @ 7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json
// (Splatoon 3 Ver. 11.3.0), re-read locally as evidence/517-primary-roller.json:
//   WideSwingUnitGroupParam.Unit[0..1].UnitParam.PaintParam
//     ChangeFrameWidthRate = 0.6, ChangeWidthStartFrame = 20, ChangeWidthEndFrame = 50
//   VerticalSwingUnitGroupParam.Unit[0..2].UnitParam.PaintParam
//     ChangeFrameWidthRate = 0.6, ChangeWidthStartFrame = 30, ChangeWidthEndFrame = 50
// Parameter-semantics reference (wikiwiki splatoon3mix パラメータ情報): 
//   ChangeFrameWidthRate = minimum paint-radius multiplier caused by elapsed time;
//   ChangeWidthStartFrame = frame at which the paint-radius reduction begins;
//   ChangeWidthEndFrame = frame by which the reduction has completed.
//
// Scope: only the radius handed to G.paint.splat at a Roller flick glob's own
// paint events is scaled by that glob's flight age. The multiplier is applied
// exactly once per paint event and composes multiplicatively with whatever
// width is already selected for that event. Per-group distance-width selection
// remains a separate dimension, as does the
// depletion paint scaling, player/field collision radii (#402), visual draw
// size and the age damage falloff (#124/#128) all stay separate dimensions.
//
// The transition is linear between the pinned start/end frames — the same
// interpolation convention used by this reconstruction's sibling ageDamage
// window. The pinned table establishes the endpoints, not the engine curve;
// this linear interpolation is an explicit implementation inference and has
// not been verified against original-game sub-frame captures.
//
// Current main also tags remote ghosts with weapon metadata. The explicit
// p.ghost guard keeps those visual replicas outside age-based paint changes;
// NetMatch independently mutes their authoritative paint while they step.
export const ROLLER_PAINT_AGE = Object.freeze({
  // Pinned Ver. 11.3.0 values; frames are S3 60 Hz frames, compared as seconds.
  matureRate: 0.6,
  horizontal: Object.freeze({ startFrame: 20, endFrame: 50 }),
  vertical: Object.freeze({ startFrame: 30, endFrame: 50 }),
});

// Age multiplier for one Roller flick glob's paint footprint. Returns `width`
// untouched for every other projectile so neighbouring weapons keep their
// exact native paint radius.
export function rollerAgePaintWidth(p, width) {
  if (!p || p.ghost || p.type !== 'drop' || p.s3Weapon?.kind !== 'roller') return width;
  const age = Number.isFinite(p.age) ? p.age : 0;
  const window = p.s3Vertical ? ROLLER_PAINT_AGE.vertical : ROLLER_PAINT_AGE.horizontal;
  const start = window.startFrame / 60, end = window.endFrame / 60;
  if (!(age > start)) return width;
  const k = age >= end ? 1 : (age - start) / (end - start);
  return width * (1 + (ROLLER_PAINT_AGE.matureRate - 1) * k);
}

const ISSUE_498_REL = 'src/game/weapons.js';
const ISSUE_498_IMPORT = `import { rollerAgePaintWidth } from '../../patches/splatoon3/issue-498-adapter.mjs';`;

// Trail drip paint inside Projectiles._step.
const TRAIL_WIDTH = 'p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }';
const TRAIL_WIDTH_AGE = 'rollerAgePaintWidth(p, p.trailRadius * (0.8 + Math.random() * 0.4)), p.team, { seed: Math.random() }';
// World-impact paint inside Projectiles._impact. Only the splat radius moves:
// `rad` still feeds the visual weapon:impact event, `p.radius` still feeds the
// impact emit/damage paths and `p.size` still feeds player collision.
const IMPACT_WIDTH = '} else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });';
const IMPACT_WIDTH_AGE = '} else area = G.paint.splat(_v, rollerAgePaintWidth(p, rad), p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });';

export const ISSUE_498_ANCHORS = Object.freeze([TRAIL_WIDTH, IMPACT_WIDTH]);

// Applied by the gameplay build dispatcher to the disposable build tree only.
// Both anchors must exist exactly once; missing or duplicated hooks fail closed.
export function adaptIssue498(rel, code, replace) {
  if (rel !== ISSUE_498_REL) return code;
  code = replace(code, TRAIL_WIDTH, TRAIL_WIDTH_AGE, 'roller trail paint age width');
  code = replace(code, IMPACT_WIDTH, IMPACT_WIDTH_AGE, 'roller impact paint age width');
  if (!code.includes(ISSUE_498_IMPORT)) code = `${ISSUE_498_IMPORT}\n${code}`;
  return code;
}

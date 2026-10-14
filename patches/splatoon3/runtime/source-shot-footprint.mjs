// INKWAVE raster-envelope calibration for source-defined main-weapon paint.
//
// S3 PaintParam / SplashPaintParam WidthHalf are treated as the width-half
// envelope. The custom PaintSystem shader adds rays, satellite drops and fine
// speckle *outside* its input circle. Passing WidthHalf as that inner circle
// inflated an ordinary single shot substantially above the sourced width.
//
// The baseline procedural shader's fine-spatter centre travels at most 2.5 R
// and each dot extends at most .031 R, hence a conservative 2.56 R bound.
// For the detached splash-drop shader (no fine spatter), satellites travel
// at most 1.9 R with up to .113 R radius; 2.08 R allows for smooth joining.
//
// This calibrates ONLY that INKWAVE artist shader, not Nintendo's original
// textures, masks, material growth or a verified pixel-for-pixel S3 footprint.
// It does not alter source WidthHalf values, shot RNG, collision, damage,
// projectile movement, timestamps or the network packet's nominal radius.
// Both CPU ownership and GPU stamping consume the resulting radius together.
export const SOURCE_SHOT_RASTER_ENVELOPE = Object.freeze({
  shot: 2.56,
  drop: 2.08,
});

// The PaintSystem uses 0=shot, 1=line, 4=trail, 5=drop, other kinds
// (bomb, blast, roll, speck) keep their legacy size and shape.
// A face key is the contract of the source collision or catalog paint path.
// This excludes generic untyped and cosmetic splats from global shrinking.
export function sourceShotRasterRadius(radius, kind, face, cosmetic = false) {
  if (cosmetic || !Number.isInteger(face) || !Number.isFinite(radius) || radius <= 0) return radius;
  if (kind === 0 || kind === 1 || kind === 4) return radius / SOURCE_SHOT_RASTER_ENVELOPE.shot;
  if (kind === 5) return radius / SOURCE_SHOT_RASTER_ENVELOPE.drop;
  return radius;
}

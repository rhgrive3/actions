// S3 11.3.0 source-backed paint events, not an artist-defined radius scale.
//
// The caller already obtains WidthHalfNear/Middle/Far, WidthHalfNearest,
// SplashPaintParam.WidthHalf and DepthScale* from the pinned weapon parameter
// tables. Their numeric radii are passed through unchanged (no 2.56/2.08
// correction and no speculative Switch-to-INKWAVE world-unit conversion).
//
// Source-backed events have their OWN raster kind because the generic INKWAVE
// shader invents extra rays, dots and satellites that are not produced by
// SplashSpawnParam. A source kind's body uses exactly the supplied WidthHalf
// as its widest lateral semi-axis, retaining its own DepthScale stretch.
// Actual detached paint drops remain separate sourced events and do not
// gain additional independent, randomly placed, scored paint droplets.
export const SOURCE_SHOT_PAINT_KIND = 'source-shot';
export const SOURCE_SPLASH_PAINT_KIND = 'source-splash';

export function sourceFlightInkKind(kind) {
  if (kind === 'shot') return SOURCE_SHOT_PAINT_KIND;
  if (kind === 'drop' || kind === 'trail') return SOURCE_SPLASH_PAINT_KIND;
  return kind;
}

// Geometry used by the raster's source kinds: smooth deterministic growth,
// a clipped organic inner edge, no synthetic satellites or timed spatter.
// This is a bounded INKWAVE approximation. Nintendo's proprietary mask
// textures and full per-pixel spread law have not been extracted.
export const SOURCE_BODY_OUTLINE = 'min(1, blobWobble) / source WidthHalf';

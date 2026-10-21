// Minimap bomb blink/halo progress (display only).
//
// The map scaled every armed bomb by the stock Splat Bomb fuse. Catalogue
// and kit subs keep their own, longer fuses (all-subs firstGroundFuseFrames,
// kit-subs s3FuseTotal), so 1 - fuse / SUB.bomb.fuse fell below -1 and
// CanvasRenderingContext2D.arc threw IndexSizeError for the negative radius,
// aborting the whole HUD frame. Use the bomb's own total when it records one
// and clamp to [0, 1], as fx/fxHooks.js already does for the 3-D halo.
export function adaptMinimapBombFuse(rel, code, replaceOnce) {
  if (rel !== 'src/game/minimap.js') return code;
  const fixed = '      const k = armed ? Math.min(1, Math.max(0, 1 - b.fuse / (b.s3FuseTotal || SUB.bomb.fuse || 1))) : 0;';
  if (code.includes(fixed)) return code;
  return replaceOnce(code,
    '      const k = armed ? 1 - b.fuse / (SUB.bomb.fuse || 1) : 0;',
    fixed,
    'minimap bomb fuse progress range');
}

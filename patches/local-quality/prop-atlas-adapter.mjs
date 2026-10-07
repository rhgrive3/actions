// Presentation resource policy: logical atlas coordinates/UVs remain 2048-based.
function once(code, before, after) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('Prop atlas anchor conflict');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptPropAtlas(rel, code) {
  if (rel !== 'src/world/props.js') return code;
  code = once(code,
    "    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;",
    "    const cv = document.createElement('canvas'), size = propAtlasDimension(this); cv.width = size; cv.height = size;");
  code = once(code,
    "    const redraw = () => { drawAtlas(cv.getContext('2d')); atlas.needsUpdate = true; };",
    `    const redraw = () => {
      if (this._disposed) return;
      const x = cv.getContext('2d');
      x.save();
      try { x.setTransform(cv.width / AW, 0, 0, cv.height / AH, 0, 0); drawAtlas(x); }
      finally { x.restore(); }
      atlas.needsUpdate = true;
    };
    this._propAtlasRedraw = redraw;`);
  return "import { G as propAtlasGame } from '../core/ctx.js';\n" + code + `
// A presentation policy, not a Nintendo numerical reference or a gameplay tuning.
function propAtlasDimension(kit) {
  return kit.quality === 'low' || propAtlasGame.settings?.quality === 'low' || propAtlasGame.game?.mobile?.touch ? 1024 : 2048;
}
function syncPropAtlas(kit) {
  if (kit._headless || kit._disposed || !kit.atlas) return;
  const size = propAtlasDimension(kit), cv = kit.atlas.image;
  if (cv.width === size && cv.height === size) return;
  // Delete the old GPU allocation; native Three recreates the same texture on upload.
  // Materials retain their texture reference and context restoration retains the canvas.
  kit.atlas.dispose();
  cv.width = size; cv.height = size;
  kit._propAtlasRedraw();
}
const propAtlasBuild = PropKit.prototype.build, propAtlasUpdate = PropKit.prototype.update, propAtlasDispose = PropKit.prototype.dispose;
PropKit.prototype.build = function(...args) { syncPropAtlas(this); return propAtlasBuild.apply(this, args); };
PropKit.prototype.update = function(...args) { syncPropAtlas(this); return propAtlasUpdate.apply(this, args); };
PropKit.prototype.dispose = function(...args) {
  try { return propAtlasDispose.apply(this, args); }
  finally { this._propAtlasRedraw = null; }
};
`;
}

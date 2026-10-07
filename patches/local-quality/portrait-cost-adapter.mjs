export function adaptPortraitCostSource(rel, code, replaceOnce) {
  if (rel !== 'src/game/showcase.js') return code;
  code = replaceOnce(code,
    "import { WEAPONS } from '../config.js';",
    "import { WEAPONS } from '../config.js';\n" +
      "import { acquirePortraitReadback, portraitCanvasFromBuffer, releasePortraitReadback, installPortraitCost } from '../../patches/local-quality/portrait-cost.mjs';",
    'portrait cost helpers');
  code = replaceOnce(code,
    '    const buf = new Uint8Array(S * S * 4);\n' +
    '    const read = r.readRenderTargetPixelsAsync ? r.readRenderTargetPixelsAsync(this._prt8, 0, 0, S, S, buf) : Promise.resolve(r.readRenderTargetPixels(this._prt8, 0, 0, S, S, buf));',
    '    const readback = acquirePortraitReadback(this, S);\n' +
    '    const buf = readback.buffer;\n' +
    '    let read;\n' +
    '    try { read = r.readRenderTargetPixelsAsync ? r.readRenderTargetPixelsAsync(this._prt8, 0, 0, S, S, buf) : Promise.resolve(r.readRenderTargetPixels(this._prt8, 0, 0, S, S, buf)); }\n' +
    '    catch (e) { releasePortraitReadback(this, readback); throw e; }',
    'portrait readback lease');
  code = replaceOnce(code,
    '    return read.then(() => {\n' +
    "      const cv = document.createElement('canvas');\n" +
    '      cv.width = cv.height = S;\n' +
    "      const ctx = cv.getContext('2d');\n" +
    '      const img = ctx.createImageData(S, S);\n' +
    '      const row = S * 4;\n' +
    '      for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * row, (S - y) * row), y * row);\n' +
    '      ctx.putImageData(img, 0, 0);\n' +
    '      return cv;\n' +
    '    });',
    '    return Promise.resolve(read).then(() => {\n' +
    "      const cv = document.createElement('canvas');\n" +
    '      cv.width = cv.height = S;\n' +
    "      const ctx = cv.getContext('2d');\n" +
    '      return portraitCanvasFromBuffer(this, ctx, S, buf, cv);\n' +
    '    }).finally(() => releasePortraitReadback(this, readback));',
    'portrait readback conversion');
  return code + '\ninstallPortraitCost(Showcase);\n';
}

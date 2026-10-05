// Actual production PaintSystem and native Three WebGL mipmap acceptance.
import assert from 'node:assert/strict';
export async function runPaintMipmapBrowserProbe(page) {
  const report = await page.evaluate(async () => {
    const THREE = await import('three');
    const { PaintSystem } = await import(new URL('src/world/paint.js', document.baseURI).href);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const gl = renderer.getContext();

    let mipCalls = 0;
    let maxGlError = 0;
    const origGenerateMipmap = gl.generateMipmap.bind(gl);
    gl.generateMipmap = function(...args) {
      mipCalls++;
      const res = origGenerateMipmap(...args);
      const err = gl.getError();
      if (err !== 0) maxGlError = err;
      return res;
    };

    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const face = {
      paintable: true, turf: true,
      origin: v(0, 0, 0), u: v(1, 0, 0), v: v(0, 0, 1), n: v(0, 1, 0),
      su: 20, sv: 20, block: 0, wall: false
    };
    const block = {
      aabbMin: v(-10, -5, -10), aabbMax: v(30, 5, 30),
      faces: [0, -1, -1, -1, -1, -1]
    };
    const level = {
      faces: [face], blocks: [block],
      pointInside: () => false,
      queryBlocks: () => [0]
    };

    // 1. Initial creation and clear
    const paint = new PaintSystem(renderer, level, { atlasSize: 512 });
    const initialMipCalls = mipCalls;
    const initialGlError = gl.getError();

    // 2. Draw splat and verify actual RT pixel upload
    paint.splat(v(5, 0, 5), 1.0, 1, { instant: true, seed: 0.1 });
    paint.flush(1 / 60);

    const buf = new Uint8Array(512 * 512 * 4);
    renderer.readRenderTargetPixels(paint.rt, 0, 0, 512, 512, buf);
    let paintedPixels = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 0) paintedPixels++;
    }

    // 3. 60 frames (1.0s) drying cadence measurement
    const preDryingCalls = mipCalls;
    for (let f = 0; f < 60; f++) {
      paint.flush(1 / 60);
    }
    const dryingCalls = mipCalls - preDryingCalls;

    // 4. Test explicit public _regenerateMipmaps into empty scene
    const preRegenCalls = mipCalls;
    paint._regenerateMipmaps();
    const regenCalls = mipCalls - preRegenCalls;
    const postRegenGlError = gl.getError();

    // Combined production quality-resample/mipmap path, without a full boot.
    const { updatePaintQuality } = await import(new URL('patches/local-quality/world-quality.mjs', document.baseURI).href);
    const cpuGrid = paint.grid, counts = [...paint.counts];
    renderer.setClearColor(0x123456, .7);
    const resizeCallsBefore = mipCalls;
    updatePaintQuality(null, 1024, {paint}, THREE);
    const resized = new Uint8Array(1024*1024*4);
    renderer.readRenderTargetPixels(paint.rt,0,0,1024,1024,resized);
    let resizedPixels=0; for(let i=3;i<resized.length;i+=4)if(resized[i])resizedPixels++;
    const resize = {pixels:resizedPixels, mipCalls:mipCalls-resizeCallsBefore,
      gridPreserved:paint.grid===cpuGrid, countsPreserved:paint.counts.every((v,i)=>v===counts[i]),
      mipFlag:paint.rt.texture.generateMipmaps, clearColor:renderer.getClearColor(new THREE.Color()).getHex(),
      clearAlpha:renderer.getClearAlpha(), glError:gl.getError()};
    const result = {
      resize,
      glVersion: gl.getParameter(gl.VERSION),
      glRenderer: gl.getParameter(gl.RENDERER),
      initialMipCalls,
      initialGlError,
      paintedPixels,
      preDryingCalls,
      dryingCalls,
      regenCalls,
      totalMipCalls: mipCalls,
      postRegenGlError,
      maxGlError,
      rtGenerateMipmapsRestored: paint.rt.texture.generateMipmaps === false,
      autoClearRestored: renderer.autoClear === true,
      counts: [...paint.counts],
    };
    paint.dispose(); renderer.dispose();
    return result;
  });

  // Strict acceptance criteria
  assert.equal(report.initialGlError, 0, 'GL error must be 0 after init');
  assert.equal(report.maxGlError, 0, 'gl.getError must remain 0 throughout all generateMipmap calls');
  assert.equal(report.postRegenGlError, 0, 'GL error must remain 0 after _regenerateMipmaps');
  assert.equal(report.initialMipCalls, 1, 'Initial clear must synchronize mipmap chain exactly once');
  assert.ok(report.paintedPixels > 1000, `Actual GPU paint pass must draw pixels into RT (got ${report.paintedPixels})`);
  assert.ok(report.dryingCalls <= 6 && report.dryingCalls >= 3, `Drying mip calls (${report.dryingCalls}) must be bounded ~4 Hz over 60 frames`);
  assert.equal(report.regenCalls, 1, '_regenerateMipmaps via empty scene pass must trigger exactly 1 native gl.generateMipmap');
  assert.equal(report.rtGenerateMipmapsRestored, true, 'rt.texture.generateMipmaps must be false in finally');
  assert.equal(report.autoClearRestored, true, 'renderer.autoClear must be restored to true in finally');

  assert.ok(report.resize.pixels > 1000, 'quality resample retains real GPU ink');
  assert.equal(report.resize.mipCalls, 1, 'quality resample generates exactly one mip chain');
  assert.equal(report.resize.gridPreserved, true); assert.equal(report.resize.countsPreserved,true);
  assert.equal(report.resize.mipFlag,false); assert.equal(report.resize.clearColor,0x123456);
  assert.equal(report.resize.clearAlpha,.7); assert.equal(report.resize.glError,0);
  return {status: 'passed', ...report};
}
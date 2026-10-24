// QA only: frozen DOM probes do not run the normal render-owned resize path.
// Use the loaded renderer once, without a Game frame or simulation tick, then
// fail closed on the real surface before and after Playwright captures it.
export function inspectFrozenHudSurface({viewport, redraw = false}) {
  const G = globalThis.s3ProbeG, g = G?.game, R = g?.R, m = g?.match;
  const require = (ok, label) => { if (!ok) throw Error('Frozen HUD capture: ' + label); };
  require(g?.frozen && m && !G.netm, 'requires the frozen offline match');
  require(viewport?.width === innerWidth && viewport?.height === innerHeight, 'viewport mismatch');
  const canvas = R?.renderer?.domElement;
  require(canvas?.isConnected && typeof R.render === 'function', 'native canvas unavailable');
  const clock = () => [G.time, m.time, m.stateT, g.s3Clock?.ticks];
  const before = clock();
  if (redraw) R.render();
  require(g.match === m && g.frozen && clock().every((x, i) => Object.is(x, before[i])), 'redraw advanced simulation');
  const box = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
  const near = (a, b, tolerance = .01) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
  const {width, height} = viewport, ratio = R.renderer.getPixelRatio();
  require(R._w === width && R._h === height, 'stale renderer dimensions');
  require(near(box.x, 0) && near(box.y, 0) && near(box.width, width) && near(box.height, height), 'stale canvas CSS bounds');
  require(Number.isFinite(ratio) && ratio > 0 && canvas.width === Math.floor(width * ratio) && canvas.height === Math.floor(height * ratio), 'drawing buffer mismatch');
  require(style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0, 'canvas hidden');
  require(!R._contextLost && !R.renderer.getContext().isContextLost(), 'WebGL context lost');
  require(near(R.camera?.aspect, width / height, 1e-8), 'stale camera aspect');
  const active = !!R.camera?.userData.s3BattleFrame;
  const fw = Math.min(width, height * 16 / 9), fh = fw * 9 / 16;
  const frame = active ? {x:(width-fw)/2, y:(height-fh)/2, width:fw, height:fh} : {x:0,y:0,width,height};
  const crop = canvas.style.clipPath;
  const match = /^inset\(([\d.+-]+)px(?: ([\d.+-]+)px)?\)$/.exec(crop);
  require(active ? match && near(Number(match[1]), frame.y) && near(Number(match[2] ?? match[1]), frame.x) : crop === 'none', 'stale battle crop');
  return {viewport:{width,height}, canvas:{x:box.x,y:box.y,width:box.width,height:box.height},
    backing:[canvas.width,canvas.height], pixelRatio:ratio, cameraAspect:R.camera.aspect, battleFrame:frame, clipPath:crop, simulation:before};
}

export async function captureFrozenHud(page, options) {
  const viewport = page.viewportSize();
  const before = await page.evaluate(inspectFrozenHudSurface, {viewport, redraw:true});
  await page.screenshot(options);
  const after = await page.evaluate(inspectFrozenHudSurface, {viewport});
  if (JSON.stringify(after) !== JSON.stringify(before)) throw Error('Frozen HUD capture: surface changed during screenshot');
  return {before, after};
}

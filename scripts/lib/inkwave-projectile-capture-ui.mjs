// QA-only observer. Never completes UI, changes match state, or hides overlays.
// Install before navigation; all receipts are plain JSON, not renderer objects.
export function installProjectileCaptureUiGate() {
  window.__iwProjectileCaptureUiGate = ({ phase = 'capture', allowIntro = false,
    settled = true, requireReady = false } = {}) => {
    const g = window.__inkwave, G = window.__G, m = g?.match;
    const inspect = el => {
      if (!el) return { connected: false, visible: false };
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      let opacity = 1, displayed = true;
      for (let node = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        opacity *= Number(s.opacity);
        displayed &&= s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
      }
      return { connected: el.isConnected === true, tag: el.tagName, id: el.id || null,
        classes: String(el.className || ''), display: style.display, visibility: style.visibility,
        effectiveOpacity: opacity, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: el.isConnected === true && displayed && opacity >= 0.99 &&
          rect.width > 0 && rect.height > 0 && rect.x < innerWidth && rect.y < innerHeight &&
          rect.right > 0 && rect.bottom > 0 };
    };
    const renderer = G?.renderer, canvas = renderer?.domElement, hud = g?.hud;
    const menu = g?.menus, wipe = menu?.wipe;
    const gl = renderer?.getContext?.();
    const receipt = {
      schema: 1, phase, observedAtMs: Date.now(),
      native: { mode: G?.mode ?? null, state: m?.state ?? null, matchIdentity: !!m && m === G?.match,
        local: m?.local?.isLocal === true, attract: m?.attract ?? null,
        paused: m?.paused ?? null, frozen: g?.frozen ?? null,
        controller: !!m?.controller, orientationBlocked: !!m?.controller?.orientationBlocked,
        projectiles: !!G?.projectiles, documentVisibility: document.visibilityState },
      hud: { flag: hud?._visible === true, owner: !!hud?.el && hud.el === document.querySelector('.iw-hud'),
        count: document.querySelectorAll('.iw-hud').length, hiddenClass: !!hud?.el?.classList.contains('is-hidden'),
        dom: inspect(hud?.el) },
      ui: { lineupCount: document.querySelectorAll('.iw-lineup').length,
        startupBannerCount: document.querySelectorAll('.iw-bn--ready, .iw-bn--go').length,
        menuCurrent: menu?.current ?? null, menuPresent: !!menu,
        menuScreen: menu?._scr?.name ?? null, menuChildren: menu?.layer?.childElementCount ?? null,
        wipePresent: !!wipe, wipeBusy: wipe?.busy ?? null, wipeRunning: wipe?.running ?? null,
        wipeActiveClass: !!menu?.wipeEl?.classList.contains('is-run'), wipeDom: inspect(menu?.wipeEl) },
      renderer: { gameOwner: !!g && G?.game === g, rendererOwner: !!renderer && renderer === g?.R?.renderer,
        canvasOwner: !!canvas && canvas === document.querySelector('#game-canvas'),
        canvasCount: document.querySelectorAll('#game-canvas').length, dom: inspect(canvas),
        canvasSize: [canvas?.width ?? null, canvas?.height ?? null],
        drawingBuffer: [gl?.drawingBufferWidth ?? null, gl?.drawingBufferHeight ?? null] },
    };
    const n = receipt.native, h = receipt.hud, u = receipt.ui, r = receipt.renderer;
    const checks = {
      native: n.mode === 'match' && n.matchIdentity && (n.state === 'playing' || allowIntro && n.state === 'intro') &&
        n.local && n.attract === false && !n.paused && n.controller && !n.orientationBlocked && n.projectiles &&
        n.documentVisibility === 'visible',
      hud: h.flag && h.owner && h.count === 1 && !h.hiddenClass && h.dom.visible,
      lineup: u.lineupCount === 0,
      startupBanners: !settled || u.startupBannerCount === 0,
      menu: u.menuPresent && u.menuCurrent === null && u.menuScreen === null && u.menuChildren === 0,
      wipe: u.wipePresent && u.wipeBusy === false && u.wipeRunning === false && !u.wipeActiveClass,
      renderer: r.gameOwner && r.rendererOwner && r.canvasOwner && r.canvasCount === 1 &&
        r.dom.tag === 'CANVAS' && r.dom.visible && r.canvasSize.every((size, i) => size > 0 && size === r.drawingBuffer[i]),
    };
    receipt.failed = Object.keys(checks).filter(key => !checks[key]);
    receipt.ready = receipt.failed.length === 0;
    window.__iwProjectileCaptureUiReceipt = receipt;
    if (receipt.ready && phase === 'admission') window.__iwProjectileCaptureUiAdmission = receipt;
    if (receipt.ready && phase === 'playing') window.__iwProjectileCaptureUiPlaying = receipt;
    if (requireReady && !receipt.ready) throw new Error('Native capture UI/renderer gate failed: ' + JSON.stringify(receipt));
    return receipt;
  };
}

// Preserve the supplied native predicate and its primitive-boolean contract.
// The admission observer runs in the same atomic browser task, before any
// synchronous intro frames can outrun the production wall-clock HUD timer.
export function withProjectileCaptureUi(predicate, options) {
  return new Function(`return function(){
    const nativeReady=(${predicate.toString()})();
    const ui=window.__iwProjectileCaptureUiGate(${JSON.stringify(options)});
    return nativeReady===true && ui.ready===true;
  }`)();
}

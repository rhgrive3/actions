// QA-only observer. Never completes UI, changes match state, or hides overlays.
// Install before navigation; all receipts are plain JSON, not renderer objects.
export function installProjectileCaptureUiGate() {
  // Observation caps bound retained JSON, not native DOM or animation state.
  const history = { schema: 1, admissionCount: 0, first: [], recent: [], omitted: 0,
    limits: { first: 4, recent: 8, ancestors: 16, animations: 16 } };
  window.__iwProjectileCaptureUiHistory = history;
  const text = value => typeof value === 'string' ? value.slice(0, 160) : null;
  const scalar = value => value == null ? null : typeof value === 'number'
    ? Number.isFinite(value) ? value : String(value) : text(value);
  const observeHud = el => {
    const out = { available: !!el, ancestors: [], ancestorsTruncated: false,
      animations: [], animationsAvailable: false, animationsTotal: null, animationsTruncated: false, errors: [] };
    if (!el) return out;
    try {
      let node = el;
      for (; node && out.ancestors.length < 16; node = node.parentElement) {
        const s = getComputedStyle(node);
        out.ancestors.push({ own: node === el, tag: text(node.tagName), id: text(node.id),
          classes: text(String(node.className || '')), opacity: text(s.opacity),
          inlineOpacity: text(node.style?.opacity), display: text(s.display), visibility: text(s.visibility),
          transitionProperty: text(s.transitionProperty), transitionDuration: text(s.transitionDuration),
          transitionDelay: text(s.transitionDelay), animationName: text(s.animationName),
          animationPlayState: text(s.animationPlayState) });
      }
      out.ancestorsTruncated = !!node;
    } catch (error) { out.errors.push('styles: ' + String(error?.message || error).slice(0, 160)); }
    try {
      if (typeof el.getAnimations === 'function') {
        const animations = el.getAnimations({ subtree: false });
        out.animationsAvailable = true; out.animationsTotal = animations.length;
        out.animationsTruncated = animations.length > 16;
        for (const a of animations.slice(0, 16)) {
          const t = a.effect?.getComputedTiming?.();
          out.animations.push({ id: text(a.id), animationName: text(a.animationName),
            transitionProperty: text(a.transitionProperty), playState: text(a.playState),
            pending: a.pending === true, currentTime: scalar(a.currentTime), startTime: scalar(a.startTime),
            playbackRate: scalar(a.playbackRate), targetIsHud: a.effect?.target === el,
            timing: t ? Object.fromEntries(['delay','endDelay','duration','iterations','endTime','activeDuration',
              'localTime','progress','currentIteration'].map(k => [k, scalar(t[k])])) : null });
        }
      }
    } catch (error) { out.errors.push('animations: ' + String(error?.message || error).slice(0, 160)); }
    return out;
  };
  window.__iwProjectileCaptureUiGate = ({ phase = 'capture', allowIntro = false,
    settled = true, requireReady = false, cinematicAdmission = false, requireHudSettled = false } = {}) => {
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
    // The native intro deliberately owns a hidden HUD and a lineup. This is
    // only permission to prepare the cinematic, never permission to capture.
    const structuralIntro = cinematicAdmission === true && phase === 'admission' && allowIntro === true && n.state === 'intro';
    receipt.admissionKind = structuralIntro ? 'native-intro-structure' : 'visible-ui';
    receipt.hud.observation = observeHud(hud?.el);
    const hudSettled = () => {
      // Do not accept an opacity threshold while its real transition is still
      // pending/running. Inspect all animations, not the diagnostic JSON cap.
      try {
        for (let node = hud?.el; node; node = node.parentElement) {
          if (typeof node.getAnimations !== 'function') return false;
          for (const a of node.getAnimations({ subtree: false })) {
            if (a.pending || a.playState !== 'finished' && a.playState !== 'idle') return false;
          }
        }
        return !!hud?.el;
      } catch { return false; }
    };
    const checks = {
      native: n.mode === 'match' && n.matchIdentity && (n.state === 'playing' || allowIntro && n.state === 'intro') &&
        n.local && n.attract === false && !n.paused && n.controller && !n.orientationBlocked && n.projectiles &&
        n.documentVisibility === 'visible',
      hud: h.owner && h.count === 1 && h.dom.connected &&
        (structuralIntro || h.flag && !h.hiddenClass && h.dom.visible),
      hudSettled: structuralIntro || !(settled || requireHudSettled) || hudSettled(),
      lineup: structuralIntro ? u.lineupCount <= 1 : u.lineupCount === 0,
      startupBanners: !settled || u.startupBannerCount === 0,
      menu: u.menuPresent && u.menuCurrent === null && u.menuScreen === null && u.menuChildren === 0,
      wipe: u.wipePresent && u.wipeBusy === false && u.wipeRunning === false && !u.wipeActiveClass,
      renderer: r.gameOwner && r.rendererOwner && r.canvasOwner && r.canvasCount === 1 &&
        r.dom.tag === 'CANVAS' && r.dom.visible && r.canvasSize.every((size, i) => size > 0 && size === r.drawingBuffer[i]),
    };
    receipt.failed = Object.keys(checks).filter(key => !checks[key]);
    receipt.ready = receipt.failed.length === 0;
    // Structural admission never erases the corresponding strict capture
    // failures. Preserve both interpretations of this same observed state.
    const captureChecks = { ...checks, native: checks.native && n.state === 'playing',
      hud: h.flag && h.owner && h.count === 1 && !h.hiddenClass && h.dom.visible,
      hudSettled: hudSettled(), lineup: u.lineupCount === 0,
      startupBanners: u.startupBannerCount === 0 };
    receipt.captureFailed = Object.keys(captureChecks).filter(key => !captureChecks[key]);
    receipt.captureReady = receipt.captureFailed.length === 0;
    if (phase === 'admission') {
      history.admissionCount++;
      const sample = JSON.parse(JSON.stringify({ attempt: history.admissionCount, observedAtMs: receipt.observedAtMs,
        state: receipt.native.state, stateT: scalar(m?.stateT), admissionKind: receipt.admissionKind,
        ready: receipt.ready, failed: receipt.failed, captureFailed: receipt.captureFailed,
        hud: receipt.hud }));
      if (history.first.length < 4) history.first.push(sample);
      else { history.recent.push(sample); if (history.recent.length > 8) history.recent.shift(); }
      history.omitted = history.admissionCount - history.first.length - history.recent.length;
    }
    window.__iwProjectileCaptureUiReceipt = receipt;
    if (receipt.ready && phase === 'admission') window.__iwProjectileCaptureUiAdmission = receipt;
    if (receipt.ready && phase === 'playing') window.__iwProjectileCaptureUiPlaying = receipt;
    if (requireReady && !receipt.ready) throw new Error('Native capture UI/renderer gate failed: ' + JSON.stringify(receipt));
    return receipt;
  };
}

// Preserve the supplied native predicate and its primitive-boolean contract.
// Structural admission is explicit and valid only in the native intro phase.
// The cinematic helper must let native HUD timers run before completing intro.
export function withProjectileCaptureUi(predicate, options) {
  return new Function(`return function(){
    const nativeReady=(${predicate.toString()})();
    const ui=window.__iwProjectileCaptureUiGate(${JSON.stringify(options)});
    return nativeReady===true && ui.ready===true;
  }`)();
}

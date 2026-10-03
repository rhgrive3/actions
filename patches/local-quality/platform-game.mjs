import { getPlatformLifecycle, PlatformFrameDriver } from './platform-lifecycle.mjs';
import { resetPlatformInput } from './platform-input.mjs';
const INSTALLED = Symbol.for('inkwave.platform.game.v1');

export function rebasePlatformGame(game) {
  game.timer?.update?.(); game.s3Clock?.reset?.();
  game._frameCapAcc = game._frameCapElapsed = 0;
  game.fpsAcc = game.fpsN = 0;
  game._stickT = 0;
  resetPlatformInput(game.input, game.match?.controller);
  game.input?.mobile?.gyro?.resync?.();
}

export function installPlatformGame(Game, G, env = globalThis) {
  const P = Game.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const owner = getPlatformLifecycle(env), unlock = P._onPointerUnlock;
  function ensure(game) {
    if (game.platform) return game.platform;
    const r = game.platform = { owner, driver: null, off: null, canvas: null, disposers: [], rendererLost: false };
    game.timer?.disconnect?.();
    game.menus?.setPlatformDriven?.(true);
    if (game.input?.mobile) game.input.mobile._platformCanRun = () => G.mode === 'match' && !!game.match && !game.match.paused && !game.menus?.current;
    const clear = () => rebasePlatformGame(game);
    r.off = owner.subscribe({
      suspend: clear,
      prepareResume() { clear(); game.R?.resize?.(); },
      blur() { resetPlatformInput(game.input, game.match?.controller); },
      screen() { resetPlatformInput(game.input, game.match?.controller); },
    });
    const canvas = game.R?.renderer?.domElement;
    if (canvas) {
      r.canvas = canvas;
      const lost = event => {
        event.preventDefault(); r.rendererLost = true;
        canvas.setAttribute('aria-label', env.document?.documentElement?.lang?.startsWith('ja') ? '描画の復旧を待っています' : 'Waiting for graphics recovery');
        if (!r.notice && env.document?.createElement) {
          r.notice = env.document.createElement('div'); r.notice.setAttribute('role', 'status');
          r.notice.textContent = env.document.documentElement?.lang?.startsWith('ja')
            ? '描画が中断されています。復旧しない場合はページを開き直してください。現在の対戦は失われる場合があります。'
            : 'Graphics are interrupted. If recovery does not occur, reopen the page. The current battle may be lost.';
          Object.assign(r.notice.style, { position: 'fixed', top: '12px', left: '12px', right: '12px', zIndex: '10000', padding: '16px', background: '#161824', color: '#fff', font: '16px/1.5 system-ui', borderRadius: '10px' });
          env.document.body?.appendChild(r.notice);
        }
        owner.block('webgl', true);
      };
      const restored = () => {
        try {
          game.R.renderer.resetState?.(); game.R.resize?.();
          r.rendererLost = false; r.notice?.remove(); r.notice = null; canvas.removeAttribute('aria-label'); owner.block('webgl', false);
        } catch (error) { env.console?.error?.('[platform] renderer restore', error); }
      };
      canvas.addEventListener('webglcontextlost', lost);
      canvas.addEventListener('webglcontextrestored', restored);
      r.disposers.push(() => { canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); });
    }
    r.driver = new PlatformFrameDriver(owner, dt => {
      if (game.frozen) return;
      const setting = game.settings.frameRate ?? 'auto';
      const cap = setting === 'display' ? 0 : setting === 60 || game.mobile?.touch ? 60 : 0;
      let frameDt = dt;
      if (cap > 0 && dt > 0) {
        const step = 1 / cap;
        game._frameCapAcc = (game._frameCapAcc || 0) + dt;
        game._frameCapElapsed = (game._frameCapElapsed || 0) + dt;
        if (game._frameCapAcc + 1e-6 < step) return;
        game._frameCapAcc = Math.min(step, Math.max(0, game._frameCapAcc - step));
        frameDt = game._frameCapElapsed; game._frameCapElapsed = 0;
      } else game._frameCapAcc = game._frameCapElapsed = 0;
      game.fpsAcc += frameDt; game.fpsN++;
      if (game.fpsAcc > .5) { game.fps = Math.round(game.fpsN / game.fpsAcc); game.fpsAcc = game.fpsN = 0; }
      game._dynRes(frameDt); game._frame(frameDt);
    }, clear);
    r.snapshot = () => ({ ...owner.snapshot(), frame: r.driver.snapshot(), rendererLost: r.rendererLost,
      gyro: game.input?.mobile?.gyro?.platformStatus,
      audio: { state: G.audio?.ctx?.state ?? 'uninitialized', needsGesture: !!G.audio?._platformAudio?.needsGesture },
      network: { readyState: G.net?.tr?.ws?.readyState ?? null, resumeChecks: G.net?.tr?._platformTransport?.resumes ?? 0 } });
    clear();
    return r;
  }
  P._loop = function () { ensure(this).driver.start(); };
  P._onPointerUnlock = function (...args) {
    if (!owner.active || !owner.focused || env.document?.hidden) { this._relock = true; return; }
    return unlock?.apply(this, args);
  };
  P.disposePlatform = function () {
    const r = this.platform; if (!r) return;
    r.driver.dispose(); r.off(); r.notice?.remove(); for (const dispose of r.disposers) dispose();
    this.menus?.setPlatformDriven?.(false); this.input?.mobile?.destroy?.();
    G.audio?.disposePlatform?.();
    if (r.rendererLost) owner.block('webgl', false);
    this.platform = null;
  };
}

export function adaptIdleSource(rel, code, replace) {
  const patch = (before, after, label) => { code = replace(code, before, after, 'idle: ' + label); };
  if (rel === 'styles/ui.css') {
    code += `
/* The offline pause backdrop includes the HUD. Keep its exact animation phase
   instead of repainting SVG gauges/glows beneath the full-screen blur. */
:is(.iw-hud, .iw-hud-over).is-world-paused,
:is(.iw-hud, .iw-hud-over).is-world-paused *,
:is(.iw-hud, .iw-hud-over).is-world-paused *::before,
:is(.iw-hud, .iw-hud-over).is-world-paused *::after {
  animation-play-state: paused !important;
}
`;
  }
  if (rel === 'src/ui/hud.js') {
    patch('  setVisible(v) {', `  // Offline world pause has a separate owner from the HUD lab/debug pause.
  setWorldPaused(on) {
    on = !!on;
    if (on === !!this._worldPaused) return;
    this._worldPaused = on;
    this.el.classList.toggle('is-world-paused', on);
    this.overLayer.classList.toggle('is-world-paused', on);
    if (on) {
      // CSS animation-play-state does not own CSS transitions or animations
      // started through Element.animate(). Park those finite effects too.
      this._worldPausedAnimations = [];
      for (const root of [this.el, this.overLayer]) {
        for (const animation of root.getAnimations?.({ subtree: true }) || []) {
          if (typeof animation.animationName === 'string' || animation.playState !== 'running') continue;
          animation.pause(); this._worldPausedAnimations.push(animation);
        }
      }
      cancelAnimationFrame(this._rafId); this._rafId = 0;
    } else {
      for (const animation of this._worldPausedAnimations || []) {
        if (animation.playState === 'paused' && animation.effect?.target?.isConnected !== false) animation.play();
      }
      this._worldPausedAnimations = null;
      if (this._fxMap?.size && !this._rafId) {
        this._lastFx = performance.now();
        this._rafId = requestAnimationFrame(this._fxLoop);
      }
    }
  }

  setVisible(v) {
    this.setWorldPaused(false);`, 'HUD pause lifetime and visibility reset');
    patch('    if (!this._rafId) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }',
      '    if (!this._rafId && !this._worldPaused) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }', 'effects added during pause stay parked');
    patch('  _fxLoop(t) {', '  _fxLoop(t) {\n    if (this._worldPaused) { this._rafId = 0; return; }', 'retired effects callback stays parked');
  }
  if (rel === 'src/ui/menus.js') {
    patch('        if (snap.live) refresh(this._matchSnapshot());',
      '        if (snap.live && (!G.match?.paused || G.netm)) refresh(this._matchSnapshot());',
      'offline pause stats do not rebuild unchanged DOM');
  }
  if (rel === 'src/world/environment.js') {
    code = "import { environmentBudget, releaseFarReflection, releaseReflection } from '../../patches/local-quality/idle-resources.mjs';\n" + code;
    patch('  _initCloudBake() {', '  _initCloudBake() {\n    const { cloudWidth: CLOUD_W, cloudHeight: CLOUD_H } = environmentBudget(G.settings, G.game?.mobile ?? G.mobile);', 'cloud allocation budget');
    patch('    const rt = this._cloudRT;', '    const rt = this._cloudRT;\n    const CLOUD_W = rt.width, CLOUD_H = rt.height;', 'cloud bake dimensions');
    patch('    if (!this._marina) { U.uFarOn.value = 0; return; }',
      '    if (!this._marina) { releaseFarReflection(this); return; }\n    const farSize = environmentBudget(G.settings, G.game?.mobile ?? G.mobile).farSize;\n    if (this._farRT && this._farRT.width !== farSize) releaseFarReflection(this);', 'far reflection lifetime');
    patch('new THREE.WebGLCubeRenderTarget(512, {', 'new THREE.WebGLCubeRenderTarget(farSize, {', 'far reflection budget');
    patch('    if (!on) { this._marinaData = null; U.uWetCount.value = 0; U.uReflOn.value = 0; this._writeRects(); return; }',
      '    if (!on) { releaseReflection(this); this._marinaData = null; U.uWetCount.value = 0; U.uReflOn.value = 0; this._writeRects(); return; }', 'planar reflection lifetime');
  }
  if (rel === 'src/audio/music.js') {
    code = "import { installMusicIdle } from '../../patches/local-quality/music-idle.mjs';\n" + code;
    // #366: construction/startup failure must release the resources created
    // before falling back. Keep the native successful-worker cleanup delay.
    patch('  _startTimer() {',
      '  _startTimer() {\n    let workerUrl = null;', 'music worker failure URL owner');
    patch("      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));",
      "      const url = workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));", 'music worker URL capture');
    patch('      this.worker.onerror = () => { this.worker = null; if (!this._timerPaused && !this.timer) this.timer = setInterval(tick, TICK_MS); };',
      `      const startedWorker = this.worker;
      startedWorker.onerror = () => {
        if (this.worker !== startedWorker) return;
        this.worker = null;
        startedWorker.onmessage = startedWorker.onerror = null; startedWorker.terminate();
        if (!this._timerPaused && !this.timer) this.timer = setInterval(tick, TICK_MS);
      };`, 'music asynchronous failure owner');
    patch('    } catch (e) {\n      if (!this._timerPaused) this.timer = setInterval(tick, TICK_MS);',
      `    } catch (e) {
      const worker = this.worker; this.worker = null;
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
      if (workerUrl !== null) URL.revokeObjectURL(workerUrl);
      if (!this._timerPaused) this.timer = setInterval(tick, TICK_MS);`, 'music failed worker cleanup');
    patch('export const music = new MusicEngine();', 'installMusicIdle(MusicEngine);\nexport const music = new MusicEngine();', 'music installer before singleton');
  }
  if (rel === 'src/audio/audio.js') {
    const init = '    if (this.opts.music !== false && this.music) this.music._init(ctx, this.musicBus, { offline: this.offline });';
    // #366: the music engine idles at any zero effective volume (Master or Music), not only Music = 0.
    patch(init, '    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.master > 0 && this.vol.music > 0);\n' + init, 'initial mute state before music initialization');
    patch("    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", "    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.master > 0 && this.vol.music > 0);\n    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", 'live and pre-init mute');
  }
  if (rel === 'src/core/renderer.js') {
    // Install the GPU framebuffer presentation on the real Renderer class.
    code = "import { installPausedFrameRetention } from '../../patches/local-quality/pause-frame-retention.mjs';\n" + code;
    code += "\ninstallPausedFrameRetention(Renderer);\n";
  }
  if (rel === 'src/main.js') {
    code = "import { idleAttractMenuBudget, notePausedWorldChange, pausedWorldFrame, refreshEnvironmentBudget } from '../patches/local-quality/idle-resources.mjs';\n" + code;
    patch('  _setSettings(partial) {', '  _setSettings(partial) {\n    notePausedWorldChange(this, partial);', 'settings writes invalidate paused backdrop');
    patch('    G.audio = audioMod.audio; G.music = musicMod.music;', '    G.audio = audioMod.audio; G.music = musicMod.music;\n    this._applyAudioVolumes();', 'persisted volumes before any audio init path');
    patch('G.audio?.init?.(); this._applyAudioVolumes();', 'this._applyAudioVolumes(); G.audio?.init?.();', 'persisted mute before unlock');
    patch("    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);",
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);\n    if ('quality' in partial) refreshEnvironmentBudget(G.env, this.settings, this.mobile);", 'resource quality refresh');
    // The gameplay layer may already own the page-visibility gate (#1166).
    // Compose it with pause/attract budgeting without dropping either owner.
    const worldGate = code.includes('    const worldHidden = setUp || document.hidden;')
      ? 'setUp || document.hidden' : 'setUp';
    patch(`    const worldHidden = ${worldGate};`, `    const pausedFrame = pausedWorldFrame(this, G);\n    if (!pausedFrame.paused) this.R?.releasePausedFrame?.();\n    const menuAttractBudget = idleAttractMenuBudget(this, G);\n    const worldHidden = ${worldGate} || pausedFrame.paused || (menuAttractBudget && !this._menuAttractFrame);\n    const worldDt = menuAttractBudget ? this._menuAttractFrameDelta : dt;`, 'offline pause and idle attract budget');
    patch('G.fx.update(dt, G.camera);', 'G.fx.update(worldDt, G.camera);', 'attract FX cadence');
    patch('this.fxHooks?.update?.(dt);', 'this.fxHooks?.update?.(worldDt);', 'attract FX hooks cadence');
    patch('this.screenfx?.update?.(dt, this);', 'this.screenfx?.update?.(worldDt, this);', 'attract screen FX cadence');
    patch('G.env.update?.(dt, G.camera);', 'G.env.update?.(worldDt, G.camera);', 'attract environment cadence');
    patch('this.decor.update(dt);', 'this.decor.update(worldDt);', 'attract decor cadence');
    patch('this.props?.update?.(dt, G.time);', 'this.props?.update?.(worldDt, G.time);', 'attract props cadence');
    patch('this.rig.update(dt);', 'this.rig.update(worldDt);', 'attract camera cadence');
    patch('this.diorama?.update(dt, this.rig.mapK);', 'this.diorama?.update(worldDt, this.rig.mapK);', 'attract diorama cadence');
    patch('G.paint.flush(dt);', 'G.paint.flush(worldDt);', 'attract paint cadence');
    patch('this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);', 'this.swimWake.update(worldDt, this.levelMat.userData.uniforms, G.camera.position);', 'attract wake cadence');
    // Menu demo only: coverage scans the entire turf grid after most splats.
    // The reset condition is presentation-only; sampling twice per second
    // preserves the same threshold and the 110s hard cap without taxing every
    // bot decision tick. A new attract match checks immediately once.
    patch('    this.attractT = 0; this.shotT = 0; this.shotIdx = 0;',
      '    this.attractT = 0; this.shotT = 0; this.shotIdx = 0; this._attractCoverageElapsed = 0.5;',
      'reset menu demo coverage timer');
    patch('    const cov = G.paint.coverage();\n    if (this.attractT > 110 || cov[0] + cov[1] > 0.72) {',
      '    this._attractCoverageElapsed = (this._attractCoverageElapsed || 0) + dt;\n' +
      '    const inspect = this._attractCoverageElapsed >= 0.5;\n' +
      '    if (inspect) this._attractCoverageElapsed = 0;\n' +
      '    const cov = inspect && this.attractT <= 110 ? G.paint.coverage() : null;\n' +
      '    if (this.attractT > 110 || (cov && cov[0] + cov[1] > 0.72)) {',
      'throttle menu-only turf reset coverage scan');
    patch('  _dynRes(dt) {', '  _dynRes(dt) {\n    if (this.match?.paused && !this.match.attract && !G.netm) return;', 'paused frames are not GPU headroom samples');
    patch('      if (!setUp) this.R.render();', `      if (!setUp && (!menuAttractBudget || this._menuAttractFrame)) {
        if (pausedFrame.paused && !pausedFrame.draw) {
          // Preserve the WebGL backdrop through page composition without
          // rerendering the world/composer. A missing snapshot falls back.
          if (this.R.presentPausedFrame?.() === false) {
            this._pausedWorld = null;
            if (sm.enabled) sm.needsUpdate = true;
            this.R.render();
            this.R.capturePausedFrame?.();
            sm.needsUpdate = false;
          }
        } else {
          if (pausedFrame.paused && sm.enabled) sm.needsUpdate = true;
          this.R.render();
          if (pausedFrame.paused) {
            sm.needsUpdate = false;
            if (this.R.capturePausedFrame?.() !== false) pausedFrame.commit?.();
            else this._pausedWorld = null;
          }
        }
      }`, 'frozen pause or budgeted menu backdrop');
    patch('    this.menus?.update?.(dt);', '    this.menus?.update?.(dt);\n    if (pausedFrame.paused) G.renderer.shadowMap.needsUpdate = false;', 'paused shadow flag retirement');
    patch("    if (m && !m.attract && this.hud && (m.state === 'playing' || m.state === 'intro' || m.state === 'finish')) this._updateHud(dt);",
      "    this.hud?.setWorldPaused?.(pausedFrame.paused);\n    if (m && !m.attract && this.hud && (!pausedFrame.paused || pausedFrame.draw) && (m.state === 'playing' || m.state === 'intro' || m.state === 'finish')) this._updateHud(pausedFrame.paused ? 0 : dt);",
      'freeze HUD canvas/minimap and refresh once after backdrop invalidation');
  }
  return code;
}

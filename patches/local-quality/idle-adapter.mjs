export function adaptIdleSource(rel, code, replace) {
  const patch = (before, after, label) => { code = replace(code, before, after, 'idle: ' + label); };
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
    patch(init, '    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.master > 0 && this.vol.music > 0);\n' + init, 'initial mute state before music initialization');
    patch("    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", "    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.master > 0 && this.vol.music > 0);\n    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", 'live and pre-init mute');
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
    patch(`    const worldHidden = ${worldGate};`, `    const pausedFrame = pausedWorldFrame(this, G);\n    const menuAttractBudget = idleAttractMenuBudget(this, G);\n    const worldHidden = ${worldGate} || pausedFrame.paused || (menuAttractBudget && !this._menuAttractFrame);\n    const worldDt = menuAttractBudget ? this._menuAttractFrameDelta : dt;`, 'offline pause and idle attract budget');
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
    patch('  _dynRes(dt) {', '  _dynRes(dt) {\n    if (this.match?.paused && !this.match.attract && !G.netm) return;', 'paused frames are not GPU headroom samples');
    patch('      if (!setUp) this.R.render();', `      if (!setUp && pausedFrame.draw && (!menuAttractBudget || this._menuAttractFrame)) {
        // A paused quality/context invalidation may have retired the sun map.
        // Refresh it once with the backdrop; unchanged paused frames stay idle.
        if (pausedFrame.paused && sm.enabled) sm.needsUpdate = true;
        this.R.render();
        if (pausedFrame.paused) sm.needsUpdate = false;
        pausedFrame.commit?.();
      }`, 'frozen pause or budgeted menu backdrop');
    patch('    this.menus?.update?.(dt);', '    this.menus?.update?.(dt);\n    if (pausedFrame.paused) G.renderer.shadowMap.needsUpdate = false;', 'paused shadow flag retirement');
  }
  return code;
}

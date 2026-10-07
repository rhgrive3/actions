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
    patch('export const music = new MusicEngine();', 'installMusicIdle(MusicEngine);\nexport const music = new MusicEngine();', 'music installer before singleton');
  }
  if (rel === 'src/audio/audio.js') {
    const init = '    if (this.opts.music !== false && this.music) this.music._init(ctx, this.musicBus, { offline: this.offline });';
    patch(init, '    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.music > 0);\n' + init, 'initial mute state before music initialization');
    patch("    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", "    if (this.opts.music !== false) this.music?.setMusicEnabled?.(this.vol.music > 0);\n    if (!this.ctx) return;\n    const t = this.ctx.currentTime;\n    this.master.gain.setTargetAtTime", 'live and pre-init mute');
  }
  if (rel === 'src/main.js') {
    code = "import { pausedWorldFrame, refreshEnvironmentBudget } from '../patches/local-quality/idle-resources.mjs';\n" + code;
    patch('    G.audio = audioMod.audio; G.music = musicMod.music;', '    G.audio = audioMod.audio; G.music = musicMod.music;\n    this._applyAudioVolumes();', 'persisted volumes before any audio init path');
    patch('G.audio?.init?.(); this._applyAudioVolumes();', 'this._applyAudioVolumes(); G.audio?.init?.();', 'persisted mute before unlock');
    patch("    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);",
      "    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);\n    if ('quality' in partial) refreshEnvironmentBudget(G.env, this.settings, this.mobile);", 'resource quality refresh');
    patch('    const worldHidden = setUp;', '    const pausedFrame = pausedWorldFrame(this, G);\n    const worldHidden = setUp || pausedFrame.paused;', 'offline world pause');
    patch('  _dynRes(dt) {', '  _dynRes(dt) {\n    if (this.match?.paused && !this.match.attract && !G.netm) return;', 'paused frames are not GPU headroom samples');
    patch('      if (!setUp) this.R.render();', '      if (!setUp && pausedFrame.draw) { this.R.render(); if (pausedFrame.paused) G.renderer.shadowMap.needsUpdate = false; pausedFrame.commit?.(); }', 'frozen backdrop invalidation');
    patch('    this.menus?.update?.(dt);', '    this.menus?.update?.(dt);\n    if (pausedFrame.paused) G.renderer.shadowMap.needsUpdate = false;', 'paused shadow flag retirement');
  }
  return code;
}

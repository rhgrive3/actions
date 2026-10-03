// Exact, build-time connections only; no runtime eval or upstream source edits.
function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw new Error(`INKWAVE platform anchor mismatch: ${label}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
const install = (code, module, name, Class, prefix = '../../') =>
  `import { ${name} } from '${prefix}patches/local-quality/${module}.mjs';\n` + code + `\n${name}(${Class});\n`;
const badMessage = receiver => `t(${receiver}.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.')`;
export function adaptPlatformSource(rel, code) {
  if (rel === 'src/main.js') {
    code = replaceOnce(code, badMessage('mob'), 'mob.gyro.statusMessage()', 'settings gyro status');
    code = replaceOnce(code, 'const game = new Game();', 'installPlatformGame(Game, G);\n\nconst game = new Game();', 'game lifecycle install after clock installer');
    return "import { installPlatformGame } from '../patches/local-quality/platform-game.mjs';\n" + code;
  }
  if (rel === 'src/core/mobile.js') {
    code = replaceOnce(code, badMessage('this'), 'this.gyro.statusMessage()', 'mobile gyro status');
    code = replaceOnce(code,
      "    window.addEventListener('blur', () => this.reset(), { signal: sig });\n" +
      "    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); else this.gyro.resync(); }, { signal: sig });\n" +
      "    const relayout = () => { this.gyro.resync(); this.resetPointers(); requestAnimationFrame(() => this._layoutAll()); };\n" +
      "    window.addEventListener('resize', relayout, { signal: sig });\n" +
      "    screen.orientation?.addEventListener?.('change', relayout, { signal: sig });\n" +
      "    window.addEventListener('orientationchange', relayout, { signal: sig });",
      '    // Page, screen, blur and coalesced layout lifetime: installMobilePlatform.', 'mobile lifecycle owners');
    return install(code, 'mobile-platform', 'installMobilePlatform', 'MobileInput');
  }
  if (rel === 'src/core/input.js') {
    const blocks = [...code.matchAll(/    window\.addEventListener\('blur', \(\) => \{[\s\S]*?\n    \}\);/g)];
    if (blocks.length !== 1 || !blocks[0][0].includes('this.keys.clear()') || !blocks[0][0].includes('this.padPressed.clear()')) throw new Error('INKWAVE platform anchor mismatch: input blur owner');
    code = code.replace(blocks[0][0], '    // Stale input is cleared by the page lifecycle owner.');
    return install(code, 'platform-input', 'installInputPlatform', 'Input');
  }
  if (rel === 'src/audio/audio.js') return install(code, 'platform-audio', 'installAudioPlatform', 'AudioEngine');
  if (rel === 'src/audio/music.js') return install(code, 'platform-audio', 'installMusicPlatform', 'MusicEngine');
  if (rel === 'src/net/transport.js') return install(code, 'platform-transport', 'installTransportPlatform', 'Transport');
  return code;
}

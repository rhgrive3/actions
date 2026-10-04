// Online resources are demand-loaded by Showcase.showHub/showLobby.
// Avoid allocating and pinning their canvas atlases in an offline-only session.
export function adaptLobbyResources(rel, code) {
  if (rel !== 'src/main.js') return code;
  const before = "    if (!params.has('autostart')) setTimeout(() => { if (G.mode === 'menu') this.showcase.preloadLobby?.(); }, 2500);";
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error('INKWAVE quality patch conflict (lobby demand loading): expected exactly one connection');
  }
  return code.slice(0, at) + '// LobbySet is created only when the Online hub or lobby is requested.' + code.slice(at + before.length);
}

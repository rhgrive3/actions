// Online resources are demand-loaded by Showcase.showHub/showLobby.
// Avoid allocating and pinning their canvas atlases in an offline-only session.
// LOW is also the native touch LobbySet profile (#472), so cap retained mobile
// atlas sources at one quarter of the desktop pixel count.
const LOBBY_LOW_ATLAS_SCALE = 0.5;
// The neon halo canvases are retained for the whole set (this.halos) and default to 180 px/m.
// Their blur and stroke widths are proportional to pxPerM, so the LOW density is an exact resolution scale.
const LOBBY_LOW_HALO_PX_PER_M = 180 * LOBBY_LOW_ATLAS_SCALE;

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (lobby ${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

function adaptLobbySet(code) {
  code = replaceOnce(code,
    `    this.tex = {
      decal: createDecalAtlas(), lit: createLitAtlas(), sky: createSkyline(),
      mask: createGroundMask(PUDDLES, SPLATS),
    };`,
    `    // A fixed low-quality atlas cap also applies to touch devices (their effective lobby profile is LOW).
    const atlasScale = this.quality === 'low' ? ${LOBBY_LOW_ATLAS_SCALE} : 1;
    this.tex = {
      decal: createDecalAtlas(atlasScale), lit: createLitAtlas(atlasScale), sky: createSkyline(atlasScale),
      mask: createGroundMask(PUDDLES, SPLATS, atlasScale),
    };`,
    'LOW atlas budget');
  code = replaceOnce(code,
    '    const hA = neonHalo(txt.strokes, 0.45);',
    `    const hA = neonHalo(txt.strokes, 0.45, this.quality === 'low' ? ${LOBBY_LOW_HALO_PX_PER_M} : undefined);`,
    'LOW halo A');
  code = replaceOnce(code,
    '    const hB = neonHalo(sq.strokes, 0.5);',
    `    const hB = neonHalo(sq.strokes, 0.5, this.quality === 'low' ? ${LOBBY_LOW_HALO_PX_PER_M} : undefined);`,
    'LOW halo B');
  return code;
}

function adaptLobbyAtlasBuilders(code) {
  code = replaceOnce(code,
    `export function createDecalAtlas() {
  const c = canvas(DA, DA), g = c.getContext('2d');`,
    `export function createDecalAtlas(scale = 1) {
  const c = canvas(DA * scale, DA * scale), g = c.getContext('2d');
  g.scale(scale, scale);`,
    'decal atlas scale');
  code = replaceOnce(code,
    `export function createGroundMask(puddles, splats) {
  const W = 1024, H = 2048, c = canvas(W, H), g = c.getContext('2d');`,
    `export function createGroundMask(puddles, splats, scale = 1) {
  const W = 1024, H = 2048, c = canvas(W * scale, H * scale), g = c.getContext('2d');
  g.scale(scale, scale);`,
    'ground-mask atlas scale');
  code = replaceOnce(code,
    `export function createLitAtlas() {
  const c = canvas(LA[0], LA[1]), g = c.getContext('2d');`,
    `export function createLitAtlas(scale = 1) {
  const c = canvas(LA[0] * scale, LA[1] * scale), g = c.getContext('2d');
  g.scale(scale, scale);`,
    'lit atlas scale');
  code = replaceOnce(code,
    `export function createSkyline() {
  const W = 2048, H = 1024, c = canvas(W, H), g = c.getContext('2d'), rnd = mulberry(99);`,
    `export function createSkyline(scale = 1) {
  const W = 2048, H = 1024, c = canvas(W * scale, H * scale), g = c.getContext('2d'), rnd = mulberry(99);
  g.scale(scale, scale);`,
    'skyline atlas scale');
  return code;
}

export function adaptLobbyResources(rel, code) {
  if (rel === 'src/main.js') {
    const before = "    if (!params.has('autostart')) setTimeout(() => { if (G.mode === 'menu') this.showcase.preloadLobby?.(); }, 2500);";
    code = replaceOnce(code, before,
      '// LobbySet is created only when the Online hub or lobby is requested.',
      'demand loading');
  }
  if (rel === 'src/game/lobbySet.js') code = adaptLobbySet(code);
  if (rel === 'src/game/lobbySet-tex.js') code = adaptLobbyAtlasBuilders(code);
  return code;
}

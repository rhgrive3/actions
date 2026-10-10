// #534: keep the original strip pixels/placements, but omit unused stage rows.
// Resize the same public Texture handle only after disposing its old GPU image.
export function adaptMuralAtlas(rel, code, once) {
  const patch = (a,b,label) => { code = once(code,a,b,'mural atlas: '+label); };
  if (rel === 'src/main.js') {
    patch('this.murals = await createMuralTexture();',
      'this.murals = await createMuralTexture(map.layout || map.id);', 'cold boot uses the selected layout');
  }
  if (rel !== 'src/world/murals.js') return code;
  patch('const W = 2048, RH = 256, ROWS = 4, H = 2048;',
    'const W = 2048, RH = 256, ROWS = 4, FULL_H = 2048;', 'separate shared and stage heights');
  patch("export async function createMuralTexture(stageId = 'halyard') {",
    "export async function createMuralTexture(stageId = 'tidewater') {\n  let H = stageId === 'halyard' || STAGE_MURALS[stageId] ? FULL_H : RH * ROWS;", 'lazy initial stage extent');
  patch("    const key = STAGE_MURALS[id] ? id : 'halyard';", "    const key = id === 'halyard' || STAGE_MURALS[id] ? id : 'shared';", 'no Halyard fallback');
  patch('    cur = key;\n    g.clearRect', `    cur = key;
    const nextHeight = key === 'shared' ? RH * ROWS : FULL_H;
    if (nextHeight !== H) {
      const shared = g.getImageData(0, 0, W, RH * ROWS);
      tex.dispose(); // WebGL allocation dimensions cannot be mutated in place.
      c.height = H = nextHeight;
      g.putImageData(shared, 0, 0);
    }
    g.clearRect`, 'release old GPU allocation and retain exact shared pixels');
  patch("list = key === 'halyard' ? halyard() : (STAGE_MURALS[key](g, { ...STAGE_R }, kit) || []);",
    "list = key === 'shared' ? [] : key === 'halyard' ? halyard() : (STAGE_MURALS[key](g, { ...STAGE_R }, kit) || []);", 'draw only owned stage decals');
  return code;
}

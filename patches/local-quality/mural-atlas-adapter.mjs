// #534: keep the original strip pixels/placements, but omit unused stage rows.
// Resize the same public Texture handle only after disposing its old GPU image.
export function adaptMuralAtlas(rel, code, once) {
  const patch = (a,b,label) => { code = once(code,a,b,'mural atlas: '+label); };
  if (rel === 'src/main.js') {
    patch('this.murals = await createMuralTexture();',
      'this.murals = await createMuralTexture(map.layout || map.id);', 'cold boot uses the selected layout');
  }
  // Mural canvas ownership has moved to inkwave-public/src/world/murals.js.
  return code;
}

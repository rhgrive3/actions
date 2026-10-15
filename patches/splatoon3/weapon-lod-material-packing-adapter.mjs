// Lossless far-LOD material attribute packing. Keep locked upstream intact.
// aMat is a shader float containing discrete material IDs; unsigned byte
// vertex storage feeds the same exact float to WebGL at one quarter the bytes.
// Preserve the original representation for any fractional/out-of-range ID.
export function adaptWeaponLodMaterialPacking(rel, code) {
  if (rel !== 'src/game/character-lod.js') return code;
  const anchor = "  out.userData = { ...src.userData, iwLod: 'far', cell };";
  const first = code.indexOf(anchor);
  if (first < 0 || code.indexOf(anchor, first + anchor.length) >= 0)
    throw new Error('INKWAVE LOD material packing conflict: review upstream clustering');
  const packing = `  // Preserve exact authored materials. This changes only the buffer storage
  // type, not any vertex, triangle, normal, shade or shader-visible value.
  if (A.aMat && A.color) {
    const material = out.getAttribute('aMat');
    if (material.itemSize === 1 && !material.normalized && material.array.BYTES_PER_ELEMENT > 1) {
      let discrete = true;
      for (let i = 0; i < material.count; i++) {
        const value = material.getX(i);
        if (!Number.isInteger(value) || value < 0 || value > 255) { discrete = false; break; }
      }
      if (discrete) {
        const bytes = new Uint8Array(material.count);
        for (let i = 0; i < bytes.length; i++) bytes[i] = material.getX(i);
        out.setAttribute('aMat', new THREE.Uint8BufferAttribute(bytes, 1, false));
      }
    }
  }
`;
  return code.slice(0, first) + packing + code.slice(first);
}

// Large, fixed visual features from Nintendo's Splatoon 3 Clam Blitz photos
// 037_en / 038_en: pointed leather shell, pale end bands and thick lacing.
// No gameplay dimensions, collision geometry, texture, or per-frame work.
export function createPowerClamResources(THREE) {
  const positions = [], colors = [], indices = [], vertices = new Map();
  const leather = new THREE.Color(0x77613c);
  const band = new THREE.Color(0xe9e3d5);
  const seam = new THREE.Color(0x372b1c);
  const tri = (a, b, c, color) => {
    for (const p of [a, b, c]) {
      const key = [...p, color.r, color.g, color.b].join(',');
      let index = vertices.get(key);
      if (index === undefined) {
        index = positions.length / 3; vertices.set(key, index);
        positions.push(...p); colors.push(color.r, color.g, color.b);
      }
      indices.push(index);
    }
  };
  // Explicit band boundaries avoid interpolation across the white stripes.
  const xs = [-1, -.88, -.72, -.55, -.32, 0, .32, .55, .72, .88, 1];
  const ring = (x, j) => {
    const radius = Math.pow(Math.max(0, 1 - x * x), .8);
    const angle = j * Math.PI / 6;
    return [x * .51, Math.cos(angle) * radius * .255, Math.sin(angle) * radius * .255];
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const stripe = Math.abs((xs[i] + xs[i + 1]) / 2);
    for (let j = 0; j < 12; j++) {
      const color = stripe > .55 && stripe < .72 ? band : (j === 2 || j === 9) ? seam : leather;
      const a = ring(xs[i], j), b = ring(xs[i + 1], j);
      const c = ring(xs[i + 1], j + 1), d = ring(xs[i], j + 1);
      if (i !== 0) tri(a, d, b, color);
      if (i !== xs.length - 2) tri(b, d, c, color);
    }
  }
  // Six broad stitches share the shell's one geometry and one material.
  for (const x of [-.25, -.15, -.05, .05, .15, .25]) {
    const radius = Math.pow(1 - (x / .51) ** 2, .8) * .255;
    const v = [];
    for (let i = 0; i < 8; i++) v.push([x + (i & 1 ? .014 : -.014), (i & 2 ? .055 : -.055), radius + (i & 4 ? .018 : -.008)]);
    for (const [a,b,c,d] of [[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]]) {
      tri(v[a],v[b],v[c],band); tri(v[a],v[c],v[d],band);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: 0 });
  return { geometry, material };
}
